'use strict'

require('dotenv').config()
const Hapi = require('hapi')
const sha256 = require('sha256')
const chalk = require('chalk');
const port = parseInt(process.env.PORT)
const fs = require('fs')
const sendRequest = require('request-promise')
const functions = require('./main')
const redis = require('redis')
const Bull = require('bull')

// Token
const token = sha256(process.env.PIN_TOKEN).toLocaleLowerCase()
fs.writeFile('token.txt', `Tu token es: ${token}`, (err) => {})

// Cliente redis
const client = redis.createClient()
client.on('connect', () => {
  console.log(chalk.cyan('Connected to redis'))
})

// Cola
const queue = new Bull(process.env.QUEUE_NAME)

queue.process(async (job) => {
  await functions.handleHook(job.data)
  return job.data
})

const init = async () => {
  const server = new Hapi.server({
    host: 'localhost',
    port
  })

   // Rutas
   server.route({
    method: 'POST',
    path: '/webhook',
    handler: async (request, h) => {
      const payload = request.payload
      if (payload.key.toLocaleLowerCase() !== token || !functions.positionInfo.positionData || !functions.status.working) return null
      try {
        const job = await queue.add({
          side: payload.side,
          canLong: payload.canLong,
          canShort: payload.canShort,
          canTrade: payload.canTrade
        })
        return job
      } catch (error) {
        console.log(error)
      }
      return null
    }
  })

  await server.start()
  fs.writeFile('log.log', `Inicio: ${new Date().toLocaleString()}\n`, (err) => {})
  console.log(chalk.yellow(`Escuchando en puerto: ${port}`))
}

init()