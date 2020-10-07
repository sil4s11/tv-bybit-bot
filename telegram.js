require('dotenv').config()
const TelegramBot = require('node-telegram-bot-api');

const chatId = parseInt(process.env.TELEGRAM_CHAT_ID)
const telegramToken = process.env.TELEGRAM_TOKEN
const bot = new TelegramBot(telegramToken, {polling: true});

const main = require('./main.js')

 // Bot
bot.onText(/^positions/i, (msg) => {
  if (chatId === msg.from.id) {
    if (main.positionInfo.positionsOpen) {
      let data = main.positionInfo.positionData.result
      let position = [
        `Side: ${data.side}`,
        `Size: ${data.size}`,
        `Entrada: ${data.entry_price}`,
        `Valor: ${data.position_value}`,
        `Take profit: ${data.take_profit}`,
        `Stop loss: ${data.stop_loss}`,
        `Liquidation: ${data.liq_price}`,
        `PNL: ${data.unrealised_pnl}`
      ]
      bot.sendMessage(chatId, `Posiciones: \n${position.join("\n")}`);
    } else {
      bot.sendMessage(chatId, `No hay posiciones abiertas!`);
    }
  }
 })

bot.onText(/^actives/i, (msg) => {
  if (chatId === msg.from.id) {
    if (main.activeInfo.isActiveOrder) {
      let active = [
        `Side: ${main.activeInfo.activeData.side}`,
        `Entrada: ${main.activeInfo.activeData.price}`,
        `Stop Loss: ${main.activeInfo.activeData.ext_fields.stop_loss}`,
        `Cantidad: ${main.activeInfo.activeData.qty}`
      ]
      bot.sendMessage(chatId, `Activas: \n${active.join("\n")}`);
    } else {
      bot.sendMessage(chatId, `No hay ordenes activas!`);
    }
  }
})

bot.onText(/^hola/i, (msg) => {
  if (chatId === msg.from.id) {
    bot.sendMessage(chatId, `Hola  ${msg.from.first_name}!`)
  }
})

bot.onText(/^trade/i, (msg) => {
  if (chatId === msg.from.id) {
    let status = [`Can trade: ${main.trade.canTrade}`, `Can long: ${main.trade.canLong}`, `Can short: ${main.trade.canShort}`]
    bot.sendMessage(chatId, `${status.join("\n")}`);
  }
})

bot.onText(/^longs/i, (msg) => {
  if (chatId === msg.from.id) {
    if (main.counterLong.length) {
      bot.sendMessage(chatId, `Longs: ${main.counterLong.join(' - ')}`);
    } else {
      bot.sendMessage(chatId, `No hay señales long!`);
    }
  }
})

bot.onText(/^shorts/i, (msg) => {
  if (chatId === msg.from.id) {
    if (main.counterShort.length) {
      bot.sendMessage(chatId, `Shorts: ${main.counterShort.join(' - ')}`);
    } else {
      bot.sendMessage(chatId, `No hay señales short!`);
    }
  }
})

bot.onText(/^lastPrice/i, (msg) => {
  if (chatId === msg.from.id) {
    bot.sendMessage(chatId, `Last price: ${main.priceInfo.lastPrice}`);
  }
})

bot.onText(/^start/i, (msg) => {
  if (chatId === msg.from.id) {
    main.status.working = true
    bot.sendMessage(chatId, `Bot activado! ${main.status.working}`);
  }
})

bot.onText(/^stop/i, (msg) => {
  if (chatId === msg.from.id) {
    main.status.working = false
    // Reseteamos los valores
    main.counterLong.length = 0
    main.counterShort.length = 0
    main.trade.canTrade = false
    main.trade.canLong = false
    main.trade.canLongEMA = false
    main.trade.canLongOBV = false
    main.trade.canLongROC = false
    main.trade.canShort = false
    main.trade.canShortEMA = false
    main.trade.canShortOBV = false
    main.trade.canShortROC = false
    main.positionInfo.positionData = null

    bot.sendMessage(chatId, `Bot desactivado! ${main.status.working}`);
  }
})

let textKeys = {
  canTrade: 'Can trade',
  canLong: 'Can long',
  canLongEMA: 'Can long EMA',
  canLongOBV: 'Can long OBV',
  canLongROC: 'Can long ROC',
  canShort: 'Can short',
  canShortEMA: 'Can short EMA',
  canShortOBV: 'Can short OBV',
  canShortROC: 'Can short ROC'
}

bot.onText(/^status/i, (msg) => {
  if (chatId === msg.from.id) {
    // let status = [`<b>Status</b>`, `Can trade: ${main.trade.canTrade}`, `Can long: ${main.trade.canLong}`, `Can short: ${main.trade.canShort}\n`]
    let infoTrade = Object.keys(main.trade).filter(k => main.trade[k]).map(k => `  ${textKeys[k]}`)

    let status = [`<b>Status</b>`, ...infoTrade]
    // let status = [`<b>Status</b>`, `Can trade: ${main.trade.canTrade}`]
    let headerSignals = [`\n<b>Signals</b>`]
    let msgLongs = main.counterLong.length ? [`  Longs (${main.counterLong.length}): ${main.counterLong.join(' - ')}`] : [`  No hay señales long!`]
    let msgShorts = main.counterShort.length ? [`  Shorts (${main.counterShort.length}): ${main.counterShort.join(' - ')}`] : [`  No hay señales short!`]
    let msgStatus = main.status.working ? [`\n<b>Bot activo!</b>`] : [`<b>Bot desactivado!</b>`]
    let info = [...status, ...headerSignals, ...msgLongs, ...msgShorts, ...msgStatus]
    bot.sendMessage(chatId, `${info.join("\n")}`, {parse_mode : "HTML"})
  }
})

module.exports = bot