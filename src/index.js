'use strict'

const Hapi = require('@hapi/hapi')
const CatboxMongoDB = require('catbox-mongodb')
const Joi = require('joi')
const celarium = require('celarium').jit().compileAndInit

const pino = require('pino')
const log = pino({name: 'vertreterify'})

const mongoose = require('mongoose')

const Relish = require('relish')({
  messages: {},
})

const Fetcher = require('./fetcher')

const init = async config => {
  const mongodbDB = config.db.url.split('/').pop().split('?').shift() // get uppercase part: mongodb://url:port/DB?something

  config.api.extraConfig = {
    cache: {
      provider: {
        constructor: CatboxMongoDB,
        options: {
          uri: config.mongodb,
          partition: mongodbDB,
        },
      },
    },
    routes: {
      validate: {
        failAction: Relish.failAction,
      },
    },
  }

  config.api.getUser = () => 0 // TODO: add auth

  const {
    start,
    stop,
    DBM,
    API,
  } = await celarium('node:' + require.resolve('./celarium'), {db: 'mongoose', api: 'hapi', beautify: false}, {db: config.db, api: config.api})

  const fetcher = await Fetcher(config, DBM, null)
  fetcher.processIssuesTask()

  const server = API._hapi

  await server.register({
    plugin: require('hapi-pino'),
    options: {name: 'vertreterify'},
  })

  if (global.SENTRY) {
    await server.register({
      plugin: require('hapi-sentry'),
      options: {client: global.SENTRY},
    })
  }

  await server.register({
    plugin: require('@hapi/inert'),
  })

  require('hapi-spa-serve')(server, {assets: require('path').join(__dirname, '../dist')})

  await start()

  process.on('SIGINT', () => {
    stop()
  })

  process.on('SIGTERM', () => {
    stop()
  })
}

module.exports = init
