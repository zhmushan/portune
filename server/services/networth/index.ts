import { readAccounts, readInstruments, readLedger } from '../ledger/store.js'
import type { Instrument, LedgerEntry } from '../ledger/types.js'
import { loadPriceBook } from './market.js'
import { addDays, buildDateRange } from './prices.js'
import { replayLedger } from './replay.js'
import type { ImpliedFlow } from './replay.js'
import { computeTwr, computeXirr } from './returns.js'
import type { CashFlow } from './returns.js'
import { valueStates } from './valuation.js'
import type { ValuationPoint } from './valuation.js'

export type ReturnSummary = {
  /** Null when no rate could be solved; the UI must say so, not show a zero. */
  twr: number | null
  xirr: number | null
}

export type NetWorthSeries = {
  accounts: { currency: string; id: string; kind: string; name: string }[]
  asOf: string
  entryCount: number
  errors: string[]
  points: ValuationPoint[]
  returns: ReturnSummary
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

/**
 * Builds the cash flow vector for XIRR over the whole net worth.
 *
 * Sign convention is from the portfolio's perspective: money you put in is
 * negative (you paid it), money that comes back is positive. Only flows across
 * the pool's boundary count — a transfer between your own accounts, an FX leg,
 * a trade, and a dividend all stay inside it, so including any of them would
 * corrupt the result.
 *
 * Implied spending from `balance` rows is a real outflow and does count: it is
 * money that left, just discovered by reconciliation rather than logged.
 *
 * The closing net worth enters as a final positive flow — the value you would
 * realize if you liquidated today.
 */
function buildCashFlows(
  entries: LedgerEntry[],
  impliedFlows: ImpliedFlow[],
  points: ValuationPoint[],
  ratesForDate: (date: string, currency: string) => number | null,
) {
  const flows: CashFlow[] = []
  const skipped: string[] = []

  const push = (date: string, amount: number, currency: string) => {
    const inCny = ratesForDate(date, currency)

    if (inCny === null) {
      skipped.push(`${date} ${currency}`)
      return
    }

    flows.push({ amount: amount * inCny, date })
  }

  for (const entry of entries) {
    if (entry.amount === null) {
      continue
    }

    if (entry.type === 'income') {
      // Money entering the pool: negative, because you contributed it.
      push(entry.date, -entry.amount, entry.currency)
    } else if (entry.type === 'expense') {
      push(entry.date, entry.amount, entry.currency)
    }
  }

  for (const flow of impliedFlows) {
    // A negative gap means cash was spent; from the portfolio's side that is a
    // positive flow out to you.
    push(flow.date, -flow.amount, flow.currency)
  }

  const last = points.at(-1)

  if (last) {
    flows.push({ amount: last.totalCny, date: last.date })
  }

  return { flows, skipped }
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
      returns: { twr: null, xirr: null },
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

  // Rates are read off the valuation the engine already computed, so the cash
  // flows use exactly the same conversions as the curve.
  const usdCny = book.fx.get('USDCNY')
  const usdCnyDates = usdCny ? [...usdCny.keys()].toSorted() : []
  const ratesForDate = (date: string, currency: string) => {
    if (currency === 'CNY') {
      return 1
    }

    if (currency !== 'USD' || !usdCny) {
      return null
    }

    let rate: number | null = null

    for (const candidate of usdCnyDates) {
      if (candidate > date) {
        break
      }

      rate = usdCny.get(candidate) ?? rate
    }

    return rate
  }

  const { flows, skipped } = buildCashFlows(
    entries,
    impliedFlows,
    valued.points,
    ratesForDate,
  )

  const flowsByDate = new Map<string, number>()

  for (const flow of flows.slice(0, -1)) {
    // TWR needs the flow's effect on the balance, which is the opposite sign of
    // the XIRR convention.
    flowsByDate.set(flow.date, (flowsByDate.get(flow.date) ?? 0) - flow.amount)
  }

  const returns: ReturnSummary = {
    twr: computeTwr(
      valued.points.map((point) => ({
        date: point.date,
        total: point.totalCny,
      })),
      flowsByDate,
    ),
    xirr: computeXirr(flows),
  }

  return {
    accounts,
    asOf,
    entryCount: entries.length,
    errors,
    points: valued.points,
    returns,
    warnings: [
      ...warnings,
      ...valued.warnings.map((warning) => warning.message),
      ...(skipped.length > 0
        ? [
            `${skipped.length} cash flow(s) had no exchange rate and were left out of the return calculation.`,
          ]
        : []),
      ...(impliedFlows.length > 0
        ? [
            `${impliedFlows.length} balance reconciliation(s) contributed implied spending to the return calculation.`,
          ]
        : []),
      ...(returns.xirr === null
        ? [
            'XIRR needs both deposits and a closing value spanning some time; there is not enough data yet.',
          ]
        : []),
    ],
  }
}
