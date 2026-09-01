import { handle } from 'hono/vercel'

import { app } from '../server/app.js'

/**
 * Serves the bare /api/networth. Vercel's file router will not match a
 * segment-less path against a catch-all directory route.
 */
export const GET = handle(app)
