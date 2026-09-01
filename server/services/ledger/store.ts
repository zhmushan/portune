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
  // 16 bytes, not 4: at 4 bytes two rows collide with ~1% probability by 10k
  // entries, and a collision would make update/delete hit both rows.
  return randomBytes(16).toString('hex')
}

function parseOptionalNumber(value: string, field: string, id: string) {
  if (!value.trim()) {
    return null
  }

  const parsed = Number(value)

  // Returning null here would write the field back as empty on the next save,
  // silently erasing a real amount. Anything Number() rejects — "1,234.56",
  // "¥100", a stray currency suffix — has to stop the read.
  if (!Number.isFinite(parsed)) {
    throw new LedgerStoreError(
      `Entry ${id} has an unparseable ${field}: "${value}". Fix it in the data repository; refusing to read it as empty.`,
      500,
    )
  }

  return parsed
}

function formatOptionalNumber(value: number | null) {
  if (value === null) {
    return ''
  }

  // String(NaN) would write "NaN", which reads back as unparseable. Catch it at
  // the boundary rather than persisting a value that cannot survive a round trip.
  if (!Number.isFinite(value)) {
    throw new LedgerStoreError(
      `Refusing to write a non-finite number (${String(value)}) to the ledger.`,
      500,
    )
  }

  return String(value)
}

function toLedgerEntry(row: Record<string, string>): LedgerEntry {
  const id = row.id ?? ''

  return {
    account: row.account ?? '',
    amount: parseOptionalNumber(row.amount ?? '', 'amount', id),
    currency: (row.currency ?? '').toUpperCase(),
    date: row.date ?? '',
    id,
    note: row.note ?? '',
    price: parseOptionalNumber(row.price ?? '', 'price', id),
    qty: parseOptionalNumber(row.qty ?? '', 'qty', id),
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

  const { headers, rows } = parseCsv(file.value)

  // A column the app doesn't know about would be dropped by the next full-file
  // write. Better to refuse than to quietly delete someone's added data.
  const unknownHeaders = headers.filter(
    (header) => header && !LEDGER_HEADERS.includes(header),
  )

  if (unknownHeaders.length > 0) {
    throw new LedgerStoreError(
      `ledger.csv has unrecognized columns (${unknownHeaders.join(', ')}) that a save would discard. Remove them or add support first.`,
      500,
    )
  }

  // Rows added by hand may have no id. Assigning one keeps them in the ledger —
  // filtering them out would delete them on the next save.
  const entries = rows
    .filter((row) => Object.values(row).some((value) => value.trim()))
    .map((row) => toLedgerEntry(row.id?.trim() ? row : { ...row, id: createEntryId() }))

  return {
    entries,
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

/**
 * Locates exactly one entry. Acting on an ambiguous id would silently rewrite or
 * delete an unrelated transaction, so a duplicate is an error rather than a
 * best-effort match.
 */
function findExactlyOne(entries: LedgerEntry[], id: string) {
  const matches = entries.filter((entry) => entry.id === id)

  if (matches.length === 0) {
    throw new LedgerStoreError(`Ledger entry ${id} was not found.`, 404)
  }

  if (matches.length > 1) {
    throw new LedgerStoreError(
      `Ledger entry ${id} matches ${matches.length} rows. Give them distinct ids in the data repository before editing.`,
      500,
    )
  }

  return matches[0] as LedgerEntry
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
    const existing = findExactlyOne(entries, id)

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
    const existing = findExactlyOne(entries, id)

    return {
      entries: entries.filter((entry) => entry.id !== id),
      message: `delete: ${describeEntry(existing)}`,
    }
  })
}
