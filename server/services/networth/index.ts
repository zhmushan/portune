import { readAccounts, readInstruments, readLedger } from '../ledger/store.js'
import type { Instrument, LedgerEntry } from '../ledger/types.js'
import { loadPriceBook } from './market.js'
import { addDays, buildDateRange } from './prices.js'
import { replayLedger } from './replay.js'
import { valueStates } from './valuation.js'
import type { ValuationPoint } from './valuation.js'

export type NetWorthSeries = {
  accounts: { currency: string; id: string; kind: string; name: string }[]
  asOf: string
  entryCount: number
  errors: string[]
  points: ValuationPoint[]
  warnings: string[]
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Instruments the ledger trades but that aren't registered.
 *
 * Falling back to a Yahoo lookup keeps the curve working when a symbol was
 * recorded before it was registered; the guessed risk currency is the quote
 * currency, which is right for ordinary equities and wrong only for funds like
 * QDII — those need an explicit entry.
 */
function inferMissingInstruments(
  entries: LedgerEntry[],
  registered: Map<string, Instrument>,
) {
  const inferred: Instrument[] = []

  for (const entry of entries) {
    if (!entry.symbol || registered.has(entry.symbol)) {
      continue
    }

    const isFund = /^F\d+$/.test(entry.symbol)

    inferred.push({
      assetClass: isFund ? 'fund' : 'equity',
      riskCurrency: '',
      source: isFund ? 'eastmoney' : 'yahoo',
      sourceId: isFund ? entry.symbol.slice(1) : entry.symbol,
      symbol: entry.symbol,
    })
    registered.set(entry.symbol, inferred.at(-1) as Instrument)
  }

  return inferred
}

export async function buildNetWorthSeries(): Promise<NetWorthSeries> {
  const [{ entries }, accounts, registeredList] = await Promise.all([
    readLedger(),
    readAccounts(),
    readInstruments(),
  ])

  const asOf = todayIso()

  if (entries.length === 0) {
    return {
      accounts,
      asOf,
      entryCount: 0,
      errors: [],
      points: [],
      warnings: [],
    }
  }

  const instruments = new Map(
    registeredList.map((instrument) => [instrument.symbol, instrument]),
  )
  const inferred = inferMissingInstruments(entries, instruments)
  const warnings = inferred
    .filter((instrument) => instrument.assetClass === 'fund')
    .map(
      (instrument) =>
        `${instrument.symbol} is not registered in instruments.csv, so its risk currency defaults to its pricing currency. A QDII fund should declare risk_currency=USD.`,
    )

  const firstDate = entries.reduce(
    (earliest, entry) => (entry.date < earliest ? entry.date : earliest),
    entries[0]?.date ?? asOf,
  )
  const dates = buildDateRange(firstDate, asOf)

  const { book, errors } = await loadPriceBook(
    [...instruments.values()],
    // A few days of lead-in so the first day already has a price to carry
    // forward, rather than starting the curve at zero.
    addDays(firstDate, -10),
  )

  const { impliedFlows, states } = replayLedger(entries, dates, book.series)
  const valued = valueStates(states, dates, book, instruments)

  return {
    accounts,
    asOf,
    entryCount: entries.length,
    errors,
    points: valued.points,
    warnings: [
      ...warnings,
      ...valued.warnings.map((warning) => warning.message),
      ...(impliedFlows.length > 0
        ? [
            `${impliedFlows.length} balance reconciliation(s) produced implied spending; these become external cash flows once XIRR lands.`,
          ]
        : []),
    ],
  }
}
