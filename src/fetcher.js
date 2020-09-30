'use strict'

const {Octokit} = require('@octokit/rest')
const {retry} = require('@octokit/plugin-retry')
const {throttling} = require('@octokit/plugin-throttling')
const OCTOKIT = Octokit.plugin(retry, throttling)

const pino = require('pino')
const alog = pino({name: 'maintserv'})

const debug = require('debug')
const dlog = debug('maintserv:fetcher')

module.exports = (config, DBM, parentId) => {
  const octokit = new OCTOKIT({
    auth: config.github.token,
    userAgent: 'MaintServ/1.0.0',
    baseUrl: 'https://api.github.com',
    log: {
      debug: dlog,
      info: dlog,
      warn: alog.warn,
      error: alog.error,
    },
    request: {
      agent: undefined,
      fetch: undefined,
      timeout: 0,
    },
    throttle: {
      onRateLimit: (retryAfter, options) => {
        octokit.log.warn(
          `Request quota exhausted for request ${options.method} ${options.url}`,
        )

        if (options.request.retryCount < 3) { // retries thrice
          octokit.log.info(`Retrying after ${retryAfter} seconds!`)
          return true
        }
      },
      onAbuseLimit: (retryAfter, options) => {
        // does not retry, only logs a warning
        octokit.log.warn(
          `Abuse detected for request ${options.method} ${options.url}`,
        )
      },
    },
    retry: {
      doNotRetry: ['429'],
    },
  })

  async function * paginateOctokit(fnc, args) {
    for await (const res of octokit.paginate.iterator(fnc, args)) {
      for (let i = 0; i < res.data.length; i++) {
        yield res.data[i]
      }
    }
  }

  function pullIssues() {
    return paginateOctokit(octokit.issues.listForRepo, {
      owner: 'nixos',
      repo: 'nixpkgs',
      state: 'open',
    })
  }

  function extractIssueMeta(issue) {
    const type = issue.pull_request ? 'pr' : 'issue'

    const val = {}

    switch (type) {
    case 'pr': {
      break
    }
    case 'issue': {
      console.log(issue)
      break
    }
    default: {
      throw new TypeError(type)
    }
    }

    // TODO: this gives us either an issue OR a PR
    return {
      id: issue.id,
      type,
      val,
    }
  }

  async function dbUpdate(parent, model, id, val) {
  // TODO: check if id exists, update or create with model
  }

  async function dbClear(parent, model, eIDs) {
  // TODO: clear up all non-existing ids in parent
  }

  async function processIssuesTask() {
    const src = pullIssues()

    const existingIds = {issue: [], pr: []}

    for await (const issue of src) {
      const {id, val, type} = extractIssueMeta(issue)
      // TODO: split up PRs and issues since we're pulling both
      await dbUpdate(parentId, type, id, val)
      existingIds[type].push(id)
    }

    for (const type in existingIds) { // eslint-disable-line guard-for-in
      await dbClear(parentId, type, existingIds[type])
    }
  }

  return {
    processIssuesTask,
  }
}
