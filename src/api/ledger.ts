import { readJsonOrThrow } from './http'
import type {
  Account,
  Instrument,
  LedgerEntry,
  LedgerEntryInput,
} from '../features/ledger/types'

type LedgerResponse = {
  accounts: Account[]
  entries: LedgerEntry[]
  instruments: Instrument[]
}

const JSON_HEADERS = {
  'Content-Type': 'application/json',
}

export async function fetchLedger() {
  return readJsonOrThrow<LedgerResponse>(
    await fetch('/api/ledger', { credentials: 'same-origin' }),
    'Failed to load ledger.',
  )
}

export async function createLedgerEntry(entry: LedgerEntryInput) {
  return readJsonOrThrow<LedgerEntry>(
    await fetch('/api/ledger/entries', {
      body: JSON.stringify(entry),
      credentials: 'same-origin',
      headers: JSON_HEADERS,
      method: 'POST',
    }),
    'Failed to create entry.',
  )
}

export async function saveLedgerEntry(id: string, entry: LedgerEntryInput) {
  return readJsonOrThrow<LedgerEntry>(
    await fetch(`/api/ledger/entries/${encodeURIComponent(id)}`, {
      body: JSON.stringify(entry),
      credentials: 'same-origin',
      headers: JSON_HEADERS,
      method: 'PUT',
    }),
    'Failed to save entry.',
  )
}

export async function removeLedgerEntry(id: string) {
  const response = await fetch(
    `/api/ledger/entries/${encodeURIComponent(id)}`,
    {
      credentials: 'same-origin',
      method: 'DELETE',
    },
  )

  if (!response.ok) {
    // 204 has no body; anything else should carry an explainable error.
    await readJsonOrThrow(response, 'Failed to delete entry.')
  }
}
