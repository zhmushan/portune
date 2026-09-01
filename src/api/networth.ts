import { readJsonOrThrow } from './http'
import type { NetWorthSeries } from '../features/networth/types'

export async function fetchNetWorthSeries() {
  return readJsonOrThrow<NetWorthSeries>(
    await fetch('/api/networth', { credentials: 'same-origin' }),
    'Failed to load net worth series.',
  )
}
