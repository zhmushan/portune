import type { AuthSessionResponse } from '../features/auth/types'
import { readJsonOrThrow } from './http'

export async function fetchAuthSession(): Promise<AuthSessionResponse> {
  const response = await fetch('/api/session', {
    method: 'GET',
  })

  return readJsonOrThrow<AuthSessionResponse>(
    response,
    'Authentication session request failed.',
  )
}
