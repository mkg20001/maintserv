'use strict'

const {Octokit} = require('@octokit/rest')
const {retry} = require('@octokit/plugin-retry')
const {throttling} = require('@octokit/plugin-throttling')
const OCTOKIT = Octokit.plugin(retry, throttling)

const pino = require('pino')
const alog = pino({name: 'maintserv/gh'})

const debug = require('debug')
const dlog = debug('maintserv:fetcher-gh')

const yaml = require('js-yaml')

module.exports = (config, DBM, parentId) => {
  const source = config.github.source

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
      state: 'open',
      ...source,
    })
  }

  function pullPRs() {
    return paginateOctokit(octokit.pulls.list, {
      state: 'open',
      ...source,
    })
  }

  function normalizeString(str) {
    return str.replace(/\r\n/g, '\n')
  }

  function normalizeLines(str) {
    return normalizeString(str).split('\n').map(l => l.trim())
  }

  async function extractIssueMeta(issue) {
    const val = {}

    const lines = normalizeLines(issue.body)

    let started

    const maintInfo = lines.filter(l => {
      if (l === '```yaml') {
        started = true
      } else if (l === '```') {
        started = false
      } else if (started) {
        return true
      } else {
        return false
      }
    })

    console.log(maintInfo)

    let maintParsed
    try {
      maintParsed = yaml.safeLoad(maintInfo.join('\n'))
    } catch (error) {
      dlog('%o: %s', maintInfo, error)
    }

    if (maintParsed) {
      // TODO: cannonicalize
    }

    return {
      id: issue.id,
      val,
    }
  }

  async function extractPRMeta(pr) {
    console.log(pr)

    const val = {}

    const lines = normalizeLines(pr.body)

    let started

    return {
      id: pr.id,
      val,
    }
  }

  async function dbUpdate(parent, model, id, val) {
  // TODO: check if id exists, update or create with model
  }

  async function dbClear(parent, model, eIDs) {
  // TODO: clear up all non-existing ids in parent
  }

  async function processGHTask() { // TODO: use decrementing IDs to determine the ones in between to delete
    const existingIds = {issue: [], pr: []}

    /* for await (const issue of pullIssues()) {
      if (issue.pull_request) {
        continue
      }

      const {id, val} = await extractIssueMeta(issue)
      await dbUpdate(parentId, 'issue', id, val)
      existingIds.issue.push(id)
    } */

    for await (const pr of pullPRs()) {
      const {id, val} = await extractPRMeta(pr)
      await dbUpdate(parentId, 'pr', id, val)
      existingIds.pr.push(id)
    }

    for (const type in existingIds) { // eslint-disable-line guard-for-in
      await dbClear(parentId, type, existingIds[type])
    }
  }

  return {
    processGHTask,
  }
}
