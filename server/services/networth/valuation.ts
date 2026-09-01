import type { Instrument } from '../ledger/types.js'
import type { DailyState } from './replay.js'
import type { PriceBook } from './prices.js'
import { lookupForwardFilled, sortedKeys } from './prices.js'

export type ValuationPoint = {
  cash: Record<string, number>
  date: string
  /** Market value by risk currency — QDII counts as USD exposure, not CNY. */
  exposure: Record<string, number>
  holdings: Record<string, number>
  totalCny: number
  totalUsd: number
}

export type ValuationWarning = {
  date: string
  message: string
}

const BASE_CURRENCIES = ['CNY', 'USD'] as const

type FxIndex = Map<string, { dates: string[]; rates: Map<string, number> }>

function buildFxIndex(book: PriceBook): FxIndex {
  const index: FxIndex = new Map()

  for (const [pair, rates] of book.fx) {
    index.set(pair, { dates: sortedKeys(rates), rates })
  }

  return index
}

/**
 * Converts between currencies using the direct pair, its inverse, or a hop
 * through USD. Returns null rather than guessing when no path exists — a wrong
 * rate silently distorts every downstream number.
 */
function convert(
  amount: number,
  from: string,
  to: string,
  date: string,
  fx: FxIndex,
): number | null {
  if (from === to) {
    return amount
  }

  const direct = fx.get(`${from}${to}`)

  if (direct) {
    const rate = lookupForwardFilled(direct.rates, direct.dates, date)

    if (rate !== null) {
      return amount * rate
    }
  }

  const inverse = fx.get(`${to}${from}`)

  if (inverse) {
    const rate = lookupForwardFilled(inverse.rates, inverse.dates, date)

    if (rate !== null && rate !== 0) {
      return amount / rate
    }
  }

  if (from !== 'USD' && to !== 'USD') {
    const viaUsd = convert(amount, from, 'USD', date, fx)

    if (viaUsd !== null) {
      return convert(viaUsd, 'USD', to, date, fx)
    }
  }

  return null
}

/**
 * Values each day's state in both CNY and USD.
 *
 * Two bases, not one: spending happens in CNY while much of the portfolio sits
 * in USD, so a single-currency curve conflates asset moves with FX moves.
 */
export function valueStates(
  states: Map<string, DailyState>,
  dates: string[],
  book: PriceBook,
  instruments: Map<string, Instrument>,
) {
  const fx = buildFxIndex(book)
  const seriesIndex = new Map(
    [...book.series].map(([symbol, series]) => [
      symbol,
      { dates: sortedKeys(series.closes), series },
    ]),
  )

  const points: ValuationPoint[] = []
  const warnings: ValuationWarning[] = []
  const missingPrices = new Set<string>()
  const missingRates = new Set<string>()

  for (const date of dates) {
    const state = states.get(date)

    if (!state) {
      continue
    }

    const cash: Record<string, number> = {}
    const exposure: Record<string, number> = {}
    const holdings: Record<string, number> = {}
    const totals: Record<string, number> = { CNY: 0, USD: 0 }

    for (const [, byCurrency] of state.cash) {
      for (const [currency, amount] of byCurrency) {
        cash[currency] = (cash[currency] ?? 0) + amount
        exposure[currency] = (exposure[currency] ?? 0) + amount

        for (const base of BASE_CURRENCIES) {
          const converted = convert(amount, currency, base, date, fx)

          if (converted === null) {
            missingRates.add(`${currency}->${base}`)
            continue
          }

          totals[base] = (totals[base] ?? 0) + converted
        }
      }
    }

    for (const [key, quantity] of state.positions) {
      const symbol = key.slice(key.indexOf(':') + 1)
      const entry = seriesIndex.get(symbol)

      if (!entry) {
        missingPrices.add(symbol)
        continue
      }

      const price = lookupForwardFilled(entry.series.closes, entry.dates, date)

      if (price === null) {
        continue
      }

      const marketValue = quantity * price
      const priceCurrency = entry.series.currency

      holdings[symbol] = (holdings[symbol] ?? 0) + marketValue

      // Exposure follows the instrument's underlying risk, not its quote
      // currency: a QDII fund priced in CNY still carries USD risk.
      const riskCurrency =
        instruments.get(symbol)?.riskCurrency || priceCurrency
      const exposureValue = convert(
        marketValue,
        priceCurrency,
        riskCurrency,
        date,
        fx,
      )

      if (exposureValue !== null) {
        exposure[riskCurrency] = (exposure[riskCurrency] ?? 0) + exposureValue
      }

      for (const base of BASE_CURRENCIES) {
        const converted = convert(marketValue, priceCurrency, base, date, fx)

        if (converted === null) {
          missingRates.add(`${priceCurrency}->${base}`)
          continue
        }

        totals[base] = (totals[base] ?? 0) + converted
      }
    }

    points.push({
      cash,
      date,
      exposure,
      holdings,
      totalCny: totals.CNY ?? 0,
      totalUsd: totals.USD ?? 0,
    })
  }

  const lastDate = dates.at(-1) ?? ''

  for (const symbol of missingPrices) {
    warnings.push({
      date: lastDate,
      message: `No price series for ${symbol}; it is excluded from the totals.`,
    })
  }

  for (const pair of missingRates) {
    warnings.push({
      date: lastDate,
      message: `No exchange rate for ${pair}; affected amounts are excluded.`,
    })
  }

  return {
    points,
    warnings,
  }
}
