require('dotenv').config()
const request = require('request-promise')
const crypto = require('crypto')
const ccxt = require ('ccxt-bybit')
const fs = require('fs')
let bot = null
let hasBot = JSON.parse(process.env.HAS_BOT)

if (hasBot) {
  bot = require('./telegram')
}

const chatId = parseInt(process.env.TELEGRAM_CHAT_ID)
const secret = process.env.SECRET
const apiKey = process.env.API_KEY
const symbol = 'BTCUSD'

// Condiciones long
let counterLong = []
let counterShort = []
const numConditionsLong = 1
const numConditionsShort = 1

// Trade
let positionSize = parseInt(process.env.POSITION_SIZE) // Tamaño de la posición
let stopLoss = 0 // Stop loss de la orden activa. Valor calculado a partir de variables
let percentageStopLoss = 1
let entry = 0 // Entrada orden activa
let marginFromEntry = 12 // Lanzamos la limit order con este margen desde el precio del ticker
let marginForBreakEven = 0 // Si se mueve lo suficiente el precio más esta cantidad movemos el stop loss a break even

// Variables position
let positionInfo = {
  positionData: null,
  positionSide: '',
  positionStopLoss: 0,
  positionEntry: 0,
  positionsOpen: 0,
  isUpdatedPosition: false
}
// Variables active
let activeInfo = {
  isActiveOrder: false,
  activeOrderId: '',
  activeOrderSide: '',
  activeData: null
}

// Variables precio
let priceInfo = {
  ticker: null,
  lastPrice: 0
}

let trade = {
  canTrade: false,
  canLong: false,
  canShort: false,
  goLong: false,
  goShort: false
}

let status = {
  working: true
}

// Set the headers
let headers = {
  'User-Agent':       'Super Agent/0.0.1',
  'Content-Type':     'application/x-www-form-urlencoded'
}

let options = {
  url: 'https://api.bybit.com/v2/private/position/list',
  method: 'GET',
  headers: headers,
  qs: {
    api_key: apiKey,
    symbol: symbol,
    timestamp: 0, // Se rellena en cada llamada
    sign: '' // Se rellena en cada llamada
  }
}

const bybit = new ccxt.bybit({
  apiKey: apiKey,
  secret: secret
})

setInterval(async () => {
  // Asignamos el priceInfo.ticker
  try {
    // Comprobamos si tenemos posiciones
    await getPositions()

    // Obtenemos último precio
    let dataPrice = await bybit.fetchTicker('BTC/USD')
    priceInfo.ticker = dataPrice
    priceInfo.lastPrice = parseInt(priceInfo.ticker.info.last_price)

    // Chech active orders
    await getActiveOrders()
    if (positionInfo.positionsOpen) return
    if (activeInfo.activeOrderSide === 'Buy') {
      if ((priceInfo.lastPrice >= (entry + (entry - stopLoss)) || !!counterShort.length || trade.canShort)) {
        // Si tenemos activa una orden de compra y el precio llega al stop loss o hay alguna señal de venta cancelamos
        cancelActiveOrder(activeInfo.activeOrderId)
      }
    } else if (activeInfo.activeOrderSide === 'Sell') {
      if (priceInfo.lastPrice <= (entry - (stopLoss - entry)) || !!counterLong.length || trade.canLong) {
        // Si tenemos activa una orden de venta y el precio llega al stop loss o hay alguna señal de compra cancelamos
        cancelActiveOrder(activeInfo.activeOrderId)
      }
    }
  } catch (error) {
    fs.appendFile('error.log', `Error: ${error}, Fecha: ${new Date().toLocaleString()}\n\n`, function (err) {});
  }
}, 1200)

let sendTelegramMessage = (text) => {
  bot.sendMessage(chatId, text)
}

let getPositions = async () => {
  let updatedTimestamp = (new Date().getTime())
  let qs = {...options.qs}
  qs.timestamp = updatedTimestamp
  qs.sign = updateSignTimestamp(updatedTimestamp)
  let optionsUpdated = {...options, qs}

  try {
    let data = await request(optionsUpdated)
    let dataParsed = JSON.parse(data)
    positionInfo.positionData = dataParsed

    if (dataParsed.result.side !== 'None') {
      positionInfo.positionStopLoss = dataParsed.result.stop_loss
      positionInfo.positionEntry = dataParsed.result.entry_price
    } else {
      // Reseteamos valores
      positionInfo.positionStopLoss = 0
      positionInfo.positionEntry = 0
      positionInfo.isUpdatedPosition = false
    }
    // Tipo de posición que tenemos abierta
    positionInfo.positionsOpen = dataParsed.result.side !== 'None'
    positionInfo.positionSide = positionInfo.positionsOpen ? dataParsed.result.side : 'None'
    return new Promise(resolve => resolve({data: dataParsed}))
  } catch (error) {
    fs.appendFile('error.log', `Error (getPositions): ${error}, data: ${JSON.stringify(positionInfo)}, Fecha: ${new Date().toLocaleString()}\n\n`, function (err) {});
  }
}

// Actualiza el stop loss a break even
let updatePosition = async (stopLoss) => {
  let updatedTimestamp = (new Date().getTime())
  let qs = {...options.qs}
  qs.timestamp = updatedTimestamp
  qs.stop_loss = stopLoss
  qs.sign = updateSignUpdatePosition(stopLoss, updatedTimestamp)
  let optionsUpdated = {
    ...options,
    url: 'https://api.bybit.com/open-api/position/trading-stop',
    method: 'POST',
    qs
  }
  try {
    await request(optionsUpdated)
    fs.appendFile('updates.log', `Actualizado Stop Loss: ${stopLoss}, Fecha: ${new Date().toLocaleString()}\n\n`, function (err) {});
    if (hasBot) {
      sendTelegramMessage(`Stop loss actualizado a break-even`)
    }
    positionInfo.isUpdatedPosition = true
  } catch (error) {
    positionInfo.isUpdatedPosition = false
    fs.appendFile('error.log', `Error (updatePosition): ${error}, Fecha: ${new Date().toLocaleString()}\n\n`, function (err) {});
  }
}

let getActiveOrders = async () => {
  let updatedTimestamp = (new Date().getTime())
  let qs = {...options.qs}
  qs.timestamp = updatedTimestamp
  qs.sign = updateSignTimestamp(updatedTimestamp)
  let optionsUpdated = {
    ...options,
    url: 'https://api.bybit.com/open-api/order/list',
    qs
  }
  try {
    let data = await request(optionsUpdated)
    let dataParsed = JSON.parse(data)
    activeInfo.isActiveOrder = dataParsed.result.data.map(d => d.order_status).some(d => d === 'New') || false
    if (activeInfo.isActiveOrder) {
      let activeOrder = dataParsed.result.data.find(d => d.order_status === 'New')
      activeInfo.activeOrderId = activeOrder.order_id
      activeInfo.activeOrderSide = activeOrder.side
      activeInfo.activeData = activeOrder
    } else {
      activeInfo.activeOrderId = ''
      activeInfo.activeOrderSide = 'None'
      activeInfo.activeData = null
    }
    return new Promise(resolve => resolve(dataParsed))
  } catch (error) {
    fs.appendFile('error.log', `Error (getActiveOrders) ${error}, data: ${JSON.stringify(activeInfo)}, Fecha: ${new Date().toLocaleString()}\n\n`, function (err) {})
  }
}

let cancelActiveOrder = async (activeId) => {
  let updatedTimestamp = (new Date().getTime())
  let qs = {...options.qs}
  qs.timestamp = updatedTimestamp
  qs.order_id = activeId
  qs.sign = updateSignActive(activeId, updatedTimestamp)
  let optionsUpdated = {
    ...options,
    url: 'https://api.bybit.com/v2/private/order/cancel',
    method: 'POST',
    qs
  }

  try {
    let data = await request(optionsUpdated)
    activeInfo.isActiveOrder = false
    activeInfo.activeOrderId = ''
    activeInfo.activeOrderSide = 'None'
    fs.appendFile('updates.log', `Cancelada orden activa, Fecha: ${new Date().toLocaleString()}\n\n`, function (err) {})
    if (hasBot) {
      sendTelegramMessage(`Orden activa cancelada`)
    }
    return new Promise(resolve => resolve(data))
  } catch(error) {
    fs.appendFile('error.log', `Error: ${error}, Fecha: ${new Date().toLocaleString()}\n\n`, function (err) {})
  }
}

const updateSignUpdatePosition = (stopLoss, timestamp) => {
  let hmac = crypto.createHmac('sha256', secret);
  let param_str_update = `api_key=${apiKey}&stop_loss=${stopLoss}&symbol=${symbol}&timestamp=${timestamp}`
  hmac.update(param_str_update);
  return hmac.digest('hex');
}

const updateSignActive = (orderId, timestamp) => {
  let hmac = crypto.createHmac('sha256', secret);
  let param_str_update = `api_key=${apiKey}&order_id=${orderId}&symbol=${symbol}&timestamp=${timestamp}`
  hmac.update(param_str_update);
  return hmac.digest('hex');
}

const updateSignTimestamp = (timestamp) => {
  let hmac = crypto.createHmac('sha256', secret);
  let param_str_update = `api_key=${apiKey}&symbol=${symbol}&timestamp=${timestamp}`
  hmac.update(param_str_update);
  return hmac.digest('hex');
}

const handleHook = async (info) => {
  let side = info.side
  trade.canTrade = info.hasOwnProperty('canTrade') ? JSON.parse(info.canTrade) : trade.canTrade
  trade.canLong = info.hasOwnProperty('canLong') ? JSON.parse(info.canLong) : trade.canLong
  trade.canShort = info.hasOwnProperty('canShort') ? JSON.parse(info.canShort) : trade.canShort

  /******* Gestión de alertas *******/
  // Si es condición de compra pero no está incluida en el array la incluimos
  if (side.includes('buy')) {
    // Si no está incluida en el array la incluimos
    if (!counterLong.includes(side)) {
      counterLong.push(side)
    }
    // Quitamos la señal contraria, no puede haber señales contrarias del mismo tipo
    let id = side[0]
    let idx = counterShort.findIndex(s => s[0] === id)
    if (idx >= 0) {
      counterShort.splice(idx, 1)
    }
  }

  if (side.includes('short')) {
    if (!counterShort.includes(side)) {
      counterShort.push(side)
    }
    // Quitamos la señal contraria, no puede haber señales contrarias del mismo tipo
    let id = side[0]
    let idx = counterLong.findIndex(s => s[0] === id)
    if (idx >= 0) {
      counterLong.splice(idx, 1)
    }
  }

  /******** Gestión de posiciones  *********/
  // Comprobamos si hay posiciones abiertas
  if (positionInfo.positionsOpen) {
    if (positionInfo.positionSide === 'Buy') {
      // Si se da alguna condición de salida cerramos
      if (counterShort.length) {
        try {
          await bybit.createOrder('BTC/USD', 'market', 'sell', positionSize, undefined, {'time_in_force': 'GoodTillCancel'})
          fs.appendFile('entries.log', `Long => Salida: ${priceInfo.lastPrice}, Fecha: ${new Date().toLocaleString()}\n`, function (err) {})
          if (hasBot) {
            sendTelegramMessage(`Long => Salida: ${priceInfo.lastPrice}, Fecha: ${new Date().toLocaleString()}`)
          }
          activeInfo.isActiveOrder = false
          positionInfo.positionsOpen = false
        } catch (error) {
          fs.appendFile('error.log', `Error: ${error}, Fecha: ${new Date().toLocaleString()}\n\n`, function (err) {});
        }

      } else {
        // Si el precio se mueve lo suficiente lo comprobamos para mover el sl a break even
        let isBreakEven = (positionInfo.positionStopLoss + 5) > positionInfo.positionEntry
        if (!isBreakEven && !positionInfo.isUpdatedPosition && (priceInfo.lastPrice - positionInfo.positionEntry) > (positionInfo.positionEntry - positionInfo.positionStopLoss + marginForBreakEven)) {
          updatePosition(positionInfo.positionEntry)
        }
      }
    } else if (positionInfo.positionSide === 'Sell') {
      // Si se da alguna condición de venta cerramos
      if (counterLong.length) {
        try {
          await bybit.createOrder('BTC/USD', 'market', 'buy', positionSize, undefined, {'time_in_force': 'GoodTillCancel'})
          fs.appendFile('entries.log', `Short => Salida: ${priceInfo.lastPrice}, Fecha: ${new Date().toLocaleString()}\n`, function (err) {})
          if (hasBot) {
            sendTelegramMessage(`Short => Salida: ${priceInfo.lastPrice}, Fecha: ${new Date().toLocaleString()}`)
          }
          activeInfo.isActiveOrder = false
          positionInfo.positionsOpen = false
        } catch (error) {
          fs.appendFile('error.log', `Error: ${error}, Fecha: ${new Date().toLocaleString()}\n\n`, function (err) {});
        }
      } else {
        // Si el precio se mueve lo suficiente lo comprobamos para mover el sl a break even
        let isBreakEven = (positionInfo.positionStopLoss - 5) < positionInfo.positionEntry
        if (!isBreakEven && !positionInfo.isUpdatedPosition && (positionInfo.positionEntry - priceInfo.lastPrice) > (positionInfo.positionStopLoss - positionInfo.positionEntry + marginForBreakEven)) {
          updatePosition(positionInfo.positionEntry)
        }
      }
    }
  } else if (!activeInfo.isActiveOrder && trade.canTrade) {
    // Si se cumple todas las condiciones y no tenemos posiciones abiertas vamos largo
    if (counterLong.length === numConditionsLong && trade.canLong) {
      // Entramos long
      stopLoss = (priceInfo.lastPrice - (priceInfo.lastPrice * percentageStopLoss) / 100) - marginFromEntry
      entry = priceInfo.lastPrice - marginFromEntry

      try {
        let dataOrder = await bybit.createOrder('BTC/USD', 'limit', 'buy', positionSize, entry, {'time_in_force': 'PostOnly', stop_loss: stopLoss})
        activeInfo.activeOrderId = dataOrder.info.order_id
        activeInfo.activeOrderSide = dataOrder.info.side // 'Buy'
        activeInfo.isActiveOrder = true
        fs.appendFile('entries.log', `Long => Entrada: ${entry}, Slop Loss: ${stopLoss}, Fecha: ${new Date().toLocaleString()}\n`, function (err) {})
        if (hasBot) {
          sendTelegramMessage(`Long => Entrada: ${entry}, Slop Loss: ${stopLoss}, Fecha: ${new Date().toLocaleString()}`)
        }

        // Reseteamos los contadores, solo tenemos en cuenta señales contratias a partir desde que entramos
        counterLong.length = 0
        counterShort.length = 0
      } catch (error) {
        fs.appendFile('error.log', `Error: ${error}, Fecha: ${new Date().toLocaleString()}\n\n`, function (err) {});
      }
    } else if (counterShort.length === numConditionsShort && trade.canShort) {
      // Entramos short
      stopLoss = (priceInfo.lastPrice + (priceInfo.lastPrice * percentageStopLoss) / 100) + marginFromEntry
      entry = priceInfo.lastPrice + marginFromEntry

      try {
        let dataOrder = await bybit.createOrder('BTC/USD', 'limit', 'sell', positionSize, entry, {'time_in_force': 'PostOnly', stop_loss: stopLoss})
        activeInfo.activeOrderId = dataOrder.info.order_id
        activeInfo.activeOrderSide = dataOrder.info.side // 'Sell'
        activeInfo.isActiveOrder = true
        fs.appendFile('entries.log', `Short => Entrada: ${entry}, Slop Loss: ${stopLoss}, Fecha: ${new Date().toLocaleString()}\n`, function (err) {})
        if (hasBot) {
          sendTelegramMessage(`Short => Entrada: ${entry}, Slop Loss: ${stopLoss}, Fecha: ${new Date().toLocaleString()}`)
        }

        // Reseteamos los contadores, solo tenemos en cuenta señales contratias a partir desde que entramos
        counterLong.length = 0
        counterShort.length = 0
      } catch (error) {
        fs.appendFile('error.log', `Error: ${error}, Fecha: ${new Date().toLocaleString()}\n\n`, function (err) {});
      }
    }
  }
}

exports.handleHook = handleHook
exports.positionInfo = positionInfo
exports.activeInfo = activeInfo
exports.counterLong = counterLong
exports.counterShort = counterShort
exports.priceInfo = priceInfo
exports.trade = trade
exports.status = status
