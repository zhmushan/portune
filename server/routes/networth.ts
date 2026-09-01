import { Hono } from 'hono'

import { buildNetWorthSeries } from '../services/networth/index.js'
import { LedgerStoreError } from '../services/ledger/types.js'
import { UpstreamProviderError } from '../types.js'

const networthApp = new Hono()

networthApp.get('/', async (context) => {
  try {
    return context.json(await buildNetWorthSeries())
  } catch (error) {
    if (error instanceof LedgerStoreError || error instanceof UpstreamProviderError) {
      context.status(error.status as 400 | 404 | 429 | 500 | 502)

      return context.json({ message: error.message })
    }

    context.status(502)

    return context.json({
      message:
        error instanceof Error ? error.message : 'Failed to build net worth series.',
    })
  }
})

export { networthApp }
