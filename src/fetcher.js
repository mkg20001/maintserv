'use strict'

const GH = require('./fetcher-gh')
const Hydra = require('./fetcher-hydra')

module.exports = async (...a) => {
  return {...(await GH(...a)), ...(await Hydra(...a))}
}
