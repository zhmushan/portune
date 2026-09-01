import { Hono } from 'hono'

import { fetchFundNavHistory } from '../providers/eastmoney.js'
import { readLedger } from '../services/ledger/store.js'

const healthApp = new Hono()

/**
 * Reports whether this deployment can reach the two upstreams the net worth
 * feature depends on.
 *
 * Eastmoney reachability from Vercel's egress could not be established before
 * deploying, so this endpoint answers it directly: hit it once after the first
 * deploy. If eastmoney is unreachable, QDII NAV moves to a locally-run fetch that
 * commits into the private data repository; the schema is identical either way.
 */
healthApp.get('/eastmoney', async (context) => {
  const startedAt = Date.now()

  try {
    // 161128 is a real, long-lived QDII fund, so a successful parse proves the
    // whole path works rather than just that the host resolves.
    const history = await fetchFundNavHistory('161128')
    const latest = history.at(-1)

    return context.json({
      durationMs: Date.now() - startedAt,
      latest: latest ?? null,
      points: history.length,
      reachable: true,
    })
  } catch (error) {
    return context.json({
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : 'Unknown error.',
      reachable: false,
    })
  }
})

healthApp.get('/ledger', async (context) => {
  try {
    const { entries } = await readLedger()

    return context.json({
      entries: entries.length,
      reachable: true,
    })
  } catch (error) {
    return context.json({
      message: error instanceof Error ? error.message : 'Unknown error.',
      reachable: false,
    })
  }
})

export { healthApp }
