import { randomBytes } from 'node:crypto'

import { parseCsv, serializeCsv } from './csv.js'
import { readRepositoryFile, writeRepositoryFile } from './github-store.js'
import type {
  Account,
  Instrument,
  LedgerEntry,
  LedgerEntryType,
} from './types.js'
import { LedgerConflictError, LedgerStoreError } from './types.js'

const LEDGER_PATH = 'ledger.csv'
const ACCOUNTS_PATH = 'accounts.csv'
const INSTRUMENTS_PATH = 'instruments.csv'

const LEDGER_HEADERS = [
  'id',
  'date',
  'type',
  'account',
  'symbol',
  'qty',
  'price',
  'amount',
  'currency',
  'note',
]

export function createEntryId() {
  return randomBytes(4).toString('hex')
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) {
    return null
  }

  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : null
}

function formatOptionalNumber(value: number | null) {
  return value === null ? '' : String(value)
}

function toLedgerEntry(row: Record<string, string>): LedgerEntry {
  return {
    account: row.account ?? '',
    amount: parseOptionalNumber(row.amount ?? ''),
    currency: (row.currency ?? '').toUpperCase(),
    date: row.date ?? '',
    id: row.id ?? '',
    note: row.note ?? '',
    price: parseOptionalNumber(row.price ?? ''),
    qty: parseOptionalNumber(row.qty ?? ''),
    symbol: (row.symbol ?? '').toUpperCase(),
    type: (row.type ?? '') as LedgerEntryType,
  }
}

function toLedgerRow(entry: LedgerEntry): Record<string, string> {
  return {
    account: entry.account,
    amount: formatOptionalNumber(entry.amount),
    currency: entry.currency,
    date: entry.date,
    id: entry.id,
    note: entry.note,
    price: formatOptionalNumber(entry.price),
    qty: formatOptionalNumber(entry.qty),
    symbol: entry.symbol,
    type: entry.type,
  }
}

function sortEntries(entries: LedgerEntry[]) {
  // Date first so the file reads chronologically; id breaks ties so the order is
  // deterministic and diffs stay minimal.
  return entries.toSorted((left, right) => {
    if (left.date !== right.date) {
      return left.date < right.date ? -1 : 1
    }

    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  })
}

export async function readLedger() {
  const file = await readRepositoryFile(LEDGER_PATH)

  if (!file) {
    return {
      entries: [] as LedgerEntry[],
      sha: undefined as string | undefined,
    }
  }

  const { rows } = parseCsv(file.value)

  return {
    entries: rows.filter((row) => row.id).map(toLedgerEntry),
    sha: file.sha,
  }
}

export async function readAccounts(): Promise<Account[]> {
  const file = await readRepositoryFile(ACCOUNTS_PATH)

  if (!file) {
    return []
  }

  return parseCsv(file.value)
    .rows.filter((row) => row.id)
    .map((row) => ({
      currency: (row.currency ?? '').toUpperCase(),
      id: row.id ?? '',
      kind: (row.kind ?? 'bank') as Account['kind'],
      name: row.name ?? '',
    }))
}

export async function readInstruments(): Promise<Instrument[]> {
  const file = await readRepositoryFile(INSTRUMENTS_PATH)

  if (!file) {
    return []
  }

  return parseCsv(file.value)
    .rows.filter((row) => row.symbol)
    .map((row) => ({
      assetClass: (row.asset_class ?? 'equity') as Instrument['assetClass'],
      riskCurrency: (row.risk_currency ?? '').toUpperCase(),
      source: (row.source ?? 'yahoo') as Instrument['source'],
      sourceId: row.source_id ?? '',
      symbol: (row.symbol ?? '').toUpperCase(),
    }))
}

function describeEntry(entry: LedgerEntry) {
  const parts: string[] = [entry.type]

  if (entry.symbol) {
    parts.push(entry.symbol)
  }

  if (entry.qty !== null && entry.price !== null) {
    parts.push(`${entry.qty} @${entry.price}`)
  } else if (entry.amount !== null) {
    parts.push(`${entry.amount} ${entry.currency}`)
  }

  return `${entry.date} ${parts.join(' ')}`.trim()
}

/**
 * Applies a change to the ledger and commits it.
 *
 * The mutation runs against freshly-read entries. If the file moved underneath
 * us between read and write, GitHub rejects the stale sha and we replay the same
 * mutation on the new state — so a concurrent edit merges instead of clobbering.
 * Only one retry: a second conflict means something is actively fighting us, and
 * failing loudly beats looping.
 */
async function mutateLedger(
  mutate: (entries: LedgerEntry[]) => {
    entries: LedgerEntry[]
    message: string
  },
  attempt = 0,
): Promise<LedgerEntry[]> {
  const { entries, sha } = await readLedger()
  const result = mutate(entries)
  const sorted = sortEntries(result.entries)

  try {
    await writeRepositoryFile({
      content: serializeCsv(LEDGER_HEADERS, sorted.map(toLedgerRow)),
      message: result.message,
      path: LEDGER_PATH,
      sha,
    })
  } catch (error) {
    if (error instanceof LedgerConflictError && attempt === 0) {
      return mutateLedger(mutate, attempt + 1)
    }

    throw error
  }

  return sorted
}

export async function appendLedgerEntry(entry: Omit<LedgerEntry, 'id'>) {
  const created: LedgerEntry = {
    ...entry,
    id: createEntryId(),
  }

  await mutateLedger((entries) => ({
    entries: [...entries, created],
    message: `add: ${describeEntry(created)}`,
  }))

  return created
}

export async function updateLedgerEntry(
  id: string,
  changes: Partial<Omit<LedgerEntry, 'id'>>,
) {
  let updated: LedgerEntry | null = null

  await mutateLedger((entries) => {
    const existing = entries.find((entry) => entry.id === id)

    if (!existing) {
      throw new LedgerStoreError(`Ledger entry ${id} was not found.`, 404)
    }

    updated = {
      ...existing,
      ...changes,
      id,
    }

    return {
      entries: entries.map((entry) => (entry.id === id ? updated as LedgerEntry : entry)),
      message: `update: ${describeEntry(updated)}`,
    }
  })

  return updated as LedgerEntry | null
}

export async function deleteLedgerEntry(id: string) {
  await mutateLedger((entries) => {
    const existing = entries.find((entry) => entry.id === id)

    if (!existing) {
      throw new LedgerStoreError(`Ledger entry ${id} was not found.`, 404)
    }

    return {
      entries: entries.filter((entry) => entry.id !== id),
      message: `delete: ${describeEntry(existing)}`,
    }
  })
}
