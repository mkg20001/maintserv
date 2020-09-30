'use strict'

const Joi = require('joi')

require('mkg-bin-gen')(
  'maintserv',
  {
    validator: Joi.object({
      api: Joi.object({
        host: Joi.string().required(),
        port: Joi.number().integer().min(1).max(60000).required(), // TODO: correct portnum max
      }).required(),
      db: Joi.object().required(),
      github: Joi.object({
        token: Joi.string().required(),
      }).required(),
    }),
  },
  require('.'),
)
