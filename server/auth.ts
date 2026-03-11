import type { Context, MiddlewareHandler } from 'hono'
import { betterAuth } from 'better-auth'

import {
  ApplicationConfigurationError,
  type AppBindings,
  type AuthSession,
} from './types.js'

process.loadEnvFile?.('.env.local')

type BetterAuthSessionResponse = {
  session?: Record<string, unknown>
  user: {
    email?: string | null
  }
}

type BetterAuthInstance = {
  api: {
    getSession: (input: { headers: Headers }) => Promise<BetterAuthSessionResponse | null>
    signOut: (input: {
      asResponse: true
      headers: Headers
    }) => Promise<Response>
  }
  handler: (request: Request) => Response | Promise<Response>
}

type SessionInspectionResult =
  | {
      reason: 'authenticated'
      session: AuthSession
    }
  | {
      reason: 'forbidden' | 'missing'
      session: null
    }

let cachedAllowedEmails: Set<string> | null | undefined
let cachedAuth: BetterAuthInstance | null = null

function readRequiredEnvVar(name: string) {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new ApplicationConfigurationError(
      `${name} is required for Better Auth configuration.`,
    )
  }

  return value
}

function readOptionalEnvVar(name: string) {
  const value = process.env[name]?.trim()

  return value || undefined
}

function getAllowedEmails() {
  if (cachedAllowedEmails !== undefined) {
    return cachedAllowedEmails
  }

  const configuredEmails = readOptionalEnvVar('AUTH_ALLOWED_EMAILS')

  if (!configuredEmails) {
    throw new ApplicationConfigurationError(
      'AUTH_ALLOWED_EMAILS is required for Better Auth configuration.',
    )
  }

  const allowedEmails = new Set(
    configuredEmails
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )

  if (allowedEmails.size === 0) {
    throw new ApplicationConfigurationError(
      'AUTH_ALLOWED_EMAILS must contain at least one email address.',
    )
  }

  cachedAllowedEmails = allowedEmails

  return cachedAllowedEmails
}

function createBetterAuth() {
  const configuredBaseURL = readOptionalEnvVar('BETTER_AUTH_URL')

  return betterAuth({
    ...(configuredBaseURL
      ? {
          baseURL: configuredBaseURL,
        }
      : {}),
    advanced: {
      trustedProxyHeaders: true,
    },
    secret: readRequiredEnvVar('BETTER_AUTH_SECRET'),
    socialProviders: {
      google: {
        clientId: readRequiredEnvVar('GOOGLE_CLIENT_ID'),
        clientSecret: readRequiredEnvVar('GOOGLE_CLIENT_SECRET'),
      },
    },
  })
}

function getBetterAuth() {
  if (cachedAuth) {
    return cachedAuth
  }

  const auth = createBetterAuth()
  cachedAuth = auth

  return auth
}

function getSetCookieHeaders(headers: Headers) {
  const extendedHeaders = headers as Headers & {
    getSetCookie?: () => string[]
  }

  if (typeof extendedHeaders.getSetCookie === 'function') {
    return extendedHeaders.getSetCookie()
  }

  const setCookie = headers.get('set-cookie')

  return setCookie ? [setCookie] : []
}

function appendSetCookieHeaders(context: Context, response: Response) {
  for (const cookie of getSetCookieHeaders(response.headers)) {
    context.header('set-cookie', cookie, {
      append: true,
    })
  }
}

export async function clearAuthenticatedSession(context: Context) {
  const response = await getBetterAuth().api.signOut({
    asResponse: true,
    headers: context.req.raw.headers,
  })

  appendSetCookieHeaders(context, response)
}

function buildBetterAuthSessionRequest(context: Context) {
  const sessionUrl = new URL('/api/auth/get-session', context.req.url)

  return new Request(sessionUrl, {
    headers: new Headers(context.req.raw.headers),
    method: 'GET',
  })
}

async function readBetterAuthSession(
  context: Context,
): Promise<BetterAuthSessionResponse | null> {
  const response = await handleBetterAuthRequestFromRequest(
    buildBetterAuthSessionRequest(context),
  )

  appendSetCookieHeaders(context, response)

  if (!response.ok) {
    throw new Error('Better Auth session lookup failed.')
  }

  return (await response.json().catch(() => null)) as BetterAuthSessionResponse | null
}

export async function inspectAuthenticatedSession(
  context: Context,
): Promise<SessionInspectionResult> {
  const session = await readBetterAuthSession(context)

  const email = session?.user.email?.trim().toLowerCase()

  if (!email) {
    return {
      reason: 'missing',
      session: null,
    }
  }

  const allowedEmails = getAllowedEmails()

  if (allowedEmails && !allowedEmails.has(email)) {
    return {
      reason: 'forbidden',
      session: null,
    }
  }

  return {
    reason: 'authenticated',
    session: {
      email,
    },
  }
}

export async function handleBetterAuthRequest(context: Context) {
  return handleBetterAuthRequestFromRequest(context.req.raw)
}

function handleBetterAuthRequestFromRequest(request: Request) {
  return getBetterAuth().handler(request)
}

export const requireAuthenticatedSession: MiddlewareHandler<AppBindings> = async (
  context,
  next,
) => {
  try {
    const sessionResult = await inspectAuthenticatedSession(context)

    if (sessionResult.reason !== 'authenticated') {
      await clearAuthenticatedSession(context)

      return context.json(
        {
          code:
            sessionResult.reason === 'forbidden'
              ? 'AUTH_FORBIDDEN'
              : 'AUTH_REQUIRED',
          message:
            sessionResult.reason === 'forbidden'
              ? 'The current Google account is not allowed to access this workspace.'
              : 'Sign in with Google to continue.',
        },
        sessionResult.reason === 'forbidden' ? 403 : 401,
      )
    }

    context.set('authSession', sessionResult.session)
    await next()
  } catch (error) {
    if (error instanceof ApplicationConfigurationError) {
      return context.json(
        {
          code: 'AUTH_NOT_CONFIGURED',
          message: error.message,
        },
        error.status,
      )
    }

    throw error
  }
}

export function getAuthErrorResponse(
  context: Context,
  error: unknown,
) {
  if (error instanceof ApplicationConfigurationError) {
    return context.json(
      {
        code: 'AUTH_NOT_CONFIGURED',
        message: error.message,
      },
      error.status,
    )
  }

  throw error
}
