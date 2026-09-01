import { handle } from 'hono/vercel'

import { app } from '../server/app.js'

/**
 * Serves the bare /api/ledger (the full ledger read). Vercel's file router will
 * not match a segment-less path against api/ledger/[...route].ts, so without
 * this the listing 404s in production while the sub-paths work.
 */
export const GET = handle(app)
