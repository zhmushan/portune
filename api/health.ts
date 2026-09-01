import { handle } from 'hono/vercel'

import { app } from '../server/app.js'

/**
 * Serves the bare /api/health. Vercel's file router will not match a path with
 * no trailing segment against api/health/[...route].ts, so the directory form
 * alone leaves /api/health returning 404 in production even though it works
 * locally, where a single Hono instance sees every request.
 */
export const GET = handle(app)
