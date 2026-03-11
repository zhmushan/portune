import type { Context } from 'hono'
import { Hono } from 'hono'

import {
  clearAuthenticatedSession,
  getAuthErrorResponse,
  inspectAuthenticatedSession,
} from '../auth.js'

const sessionApp = new Hono()

async function handleSessionRequest(context: Context) {
  try {
    const sessionResult = await inspectAuthenticatedSession(context)

    if (sessionResult.reason !== 'authenticated') {
      if (sessionResult.reason === 'forbidden') {
        await clearAuthenticatedSession(context)
      }

      return context.json({
        authenticated: false,
        ...(sessionResult.reason === 'forbidden'
          ? {
              code: 'AUTH_FORBIDDEN' as const,
            }
          : {}),
      })
    }

    return context.json({
      authenticated: true,
      user: {
        email: sessionResult.session.email,
      },
    })
  } catch (error) {
    return getAuthErrorResponse(context, error)
  }
}

sessionApp.get('/', handleSessionRequest)

export { handleSessionRequest, sessionApp }
