import { Hono } from 'hono'

import {
  getAuthErrorResponse,
  handleBetterAuthRequest,
  requireAuthenticatedSession,
} from './auth.js'
import { loadLocalEnvFileIfPresent } from './env.js'
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

export { app }
