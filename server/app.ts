import { Hono } from 'hono'

import {
  getAuthErrorResponse,
  handleBetterAuthRequest,
  requireAuthenticatedSession,
} from './auth.js'
import { loadLocalEnvFileIfPresent } from './env.js'
import { healthApp } from './routes/health.js'
import { ledgerApp } from './routes/ledger.js'
import { portfolioApp } from './routes/portfolio.js'
import { handleSessionRequest, sessionApp } from './routes/session.js'
import type { AppBindings } from './types.js'

loadLocalEnvFileIfPresent()

const app = new Hono<AppBindings>()

app.get('/api/health', (context) =>
  context.json({
    ok: true,
  }),
)

app.get('/api/auth/session', handleSessionRequest)

app.on(['GET', 'POST'], '/api/auth/*', async (context) => {
  try {
    return await handleBetterAuthRequest(context)
  } catch (error) {
    return getAuthErrorResponse(context, error)
  }
})

app.route('/api/session', sessionApp)
app.use('/api/portfolio/*', requireAuthenticatedSession)
app.route('/api/portfolio', portfolioApp)
// Diagnostics report on the private data repository, so they sit behind auth.
app.use('/api/health/*', requireAuthenticatedSession)
app.route('/api/health', healthApp)
app.use('/api/ledger', requireAuthenticatedSession)
app.use('/api/ledger/*', requireAuthenticatedSession)
app.route('/api/ledger', ledgerApp)

export { app }
