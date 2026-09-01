import type { LedgerEntry } from '../ledger/types.js'
import type { PriceSeries } from './prices.js'

export type PositionKey = `${string}:${string}`

export type DailyState = {
  /** account → currency → cash balance in that currency. */
  cash: Map<string, Map<string, number>>
  date: string
  /** "account:symbol" → quantity held. */
  positions: Map<PositionKey, number>
}

export function positionKey(account: string, symbol: string): PositionKey {
  return `${account}:${symbol}`
}

function addTo(map: Map<string, number>, key: string, delta: number) {
  const next = (map.get(key) ?? 0) + delta

  if (Math.abs(next) < 1e-9) {
    map.delete(key)
    return
  }

  map.set(key, next)
}

function cashFor(state: DailyState, account: string) {
  let byCurrency = state.cash.get(account)

  if (!byCurrency) {
    byCurrency = new Map()
    state.cash.set(account, byCurrency)
  }

  return byCurrency
}

/**
 * Scales a quantity recorded before a split to match split-adjusted prices.
 *
 * Yahoo returns `close` already adjusted for splits, so a pre-split quantity
 * multiplied by a post-split price understates the holding by the split ratio —
 * NVDA's 10:1 would read as a 90% loss. Every split effective *after* the trade
 * date compounds.
 */
export function adjustQuantityForSplits(
  quantity: number,
  tradeDate: string,
  splits: { date: string; ratio: number }[],
) {
  let adjusted = quantity

  for (const split of splits) {
    if (split.date > tradeDate) {
      adjusted *= split.ratio
    }
  }

  return adjusted
}

export type ImpliedFlow = {
  account: string
  amount: number
  currency: string
  date: string
}

export type ReplayResult = {
  /**
   * Spending inferred from `balance` reconciliation rows: the gap between the
   * derived cash balance and the actual one the user recorded.
   */
  impliedFlows: ImpliedFlow[]
  states: Map<string, DailyState>
}

function cloneState(state: DailyState, date: string): DailyState {
  return {
    cash: new Map(
      [...state.cash].map(([account, byCurrency]) => [
        account,
        new Map(byCurrency),
      ]),
    ),
    date,
    positions: new Map(state.positions),
  }
}

/**
 * Replays the ledger day by day, producing the holding and cash state at the
 * end of each date in `dates`.
 *
 * Quantities are stored split-adjusted so they can be multiplied directly by
 * the price series. Cash moves are recorded per account and per currency; an FX
 * conversion is two legs and nets to zero across the pool, which is what keeps
 * it out of the XIRR cash flows.
 */
export function replayLedger(
  entries: LedgerEntry[],
  dates: string[],
  seriesBySymbol: Map<string, PriceSeries>,
): ReplayResult {
  const byDate = new Map<string, LedgerEntry[]>()

  for (const entry of entries) {
    const bucket = byDate.get(entry.date)

    if (bucket) {
      bucket.push(entry)
    } else {
      byDate.set(entry.date, [entry])
    }
  }

  const impliedFlows: ImpliedFlow[] = []
  const states = new Map<string, DailyState>()

  let current: DailyState = {
    cash: new Map(),
    date: dates[0] ?? '',
    positions: new Map(),
  }

  for (const date of dates) {
    current = cloneState(current, date)

    for (const entry of byDate.get(date) ?? []) {
      applyEntry(current, entry, seriesBySymbol, impliedFlows)
    }

    states.set(date, current)
  }

  return {
    impliedFlows,
    states,
  }
}

function applyEntry(
  state: DailyState,
  entry: LedgerEntry,
  seriesBySymbol: Map<string, PriceSeries>,
  impliedFlows: ImpliedFlow[],
) {
  switch (entry.type) {
    case 'buy':
    case 'sell': {
      if (entry.qty === null || entry.price === null) {
        return
      }

      const splits = seriesBySymbol.get(entry.symbol)?.splits ?? []
      const adjusted = adjustQuantityForSplits(entry.qty, entry.date, splits)
      const direction = entry.type === 'buy' ? 1 : -1

      addTo(
        state.positions,
        positionKey(entry.account, entry.symbol),
        direction * adjusted,
      )
      addTo(
        cashFor(state, entry.account),
        entry.currency,
        -direction * entry.qty * entry.price,
      )
      return
    }

    case 'dividend':
    case 'income': {
      if (entry.amount === null) {
        return
      }

      addTo(cashFor(state, entry.account), entry.currency, entry.amount)
      return
    }

    case 'expense': {
      if (entry.amount === null) {
        return
      }

      addTo(cashFor(state, entry.account), entry.currency, -entry.amount)
      return
    }

    case 'fx': {
      if (entry.amount === null) {
        return
      }

      // One leg of a conversion; the matching leg is its own row. Signs come
      // from the ledger, so this only moves cash between currencies.
      addTo(cashFor(state, entry.account), entry.currency, entry.amount)
      return
    }

    case 'transfer': {
      if (entry.amount === null) {
        return
      }

      const [from, to] = entry.account.split('>')

      if (!from || !to) {
        return
      }

      addTo(cashFor(state, from), entry.currency, -entry.amount)
      addTo(cashFor(state, to), entry.currency, entry.amount)
      return
    }

    case 'balance': {
      if (entry.amount === null) {
        return
      }

      // The user recorded what the account actually holds. The difference from
      // the derived balance is spending that was never logged; without booking
      // it, derived cash drifts upward forever and inflates both the curve and
      // the return.
      const byCurrency = cashFor(state, entry.account)
      const derived = byCurrency.get(entry.currency) ?? 0
      const gap = entry.amount - derived

      if (Math.abs(gap) > 1e-9) {
        impliedFlows.push({
          account: entry.account,
          amount: gap,
          currency: entry.currency,
          date: entry.date,
        })
      }

      byCurrency.set(entry.currency, entry.amount)
    }
  }
}
