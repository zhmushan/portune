import YahooFinance from 'yahoo-finance2'

import { fetchFundNavHistory } from '../../providers/eastmoney.js'
import { mapWithConcurrency } from '../../providers/utils.js'
import { UpstreamProviderError } from '../../types.js'
import type { Instrument } from '../ledger/types.js'
import type { PriceBook, PriceSeries } from './prices.js'

const yahooFinanceClient = new YahooFinance({
  suppressNotices: ['yahooSurvey'],
})

const FX_PAIRS = ['USDCNY'] as const

// Prices change once a day; refetching on every request would be pure waste.
const CACHE_TTL_MS = 15 * 60 * 1000

type CacheEntry = {
  expiresAt: number
  value: PriceSeries
}

const seriesCache = new Map<string, CacheEntry>()

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Yahoo rate-limits aggressively and answers with an HTML error page rather
 * than a 429, which surfaces as an opaque HTTPError. Retrying with a growing
 * delay recovers from the throttle instead of blanking the whole curve.
 */
async function withRetry<TValue>(
  label: string,
  operation: () => Promise<TValue>,
  attempts = 3,
) {
  let lastError: unknown

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error

      if (attempt < attempts - 1) {
        await sleep(600 * 2 ** attempt)
      }
    }
  }

  throw new UpstreamProviderError(
    `${label}: ${lastError instanceof Error ? lastError.message.slice(0, 200) : 'request failed'}`,
  )
}

/**
 * Yahoo's final bar is the live intraday quote, not a close.
 *
 * Storing it as today's close means the "historical" series changes on every
 * fetch. Anything dated today is dropped; it reappears once the session settles.
 */
function dropUnsettledBar(closes: Map<string, number>) {
  closes.delete(todayIso())

  return closes
}

async function fetchYahooSeries(symbol: string, from: string): Promise<PriceSeries> {
  const chart = await withRetry(symbol, () =>
    yahooFinanceClient.chart(symbol, {
      interval: '1d',
      period1: from,
    }),
  )

  const closes = new Map<string, number>()

  for (const quote of chart.quotes) {
    if (typeof quote.close !== 'number' || !Number.isFinite(quote.close)) {
      continue
    }

    closes.set(quote.date.toISOString().slice(0, 10), quote.close)
  }

  const splits = (chart.events?.splits ?? []).map((split) => ({
    date: new Date(split.date).toISOString().slice(0, 10),
    ratio: split.numerator / split.denominator,
  }))

  return {
    closes: dropUnsettledBar(closes),
    currency: chart.meta.currency ?? 'USD',
    splits: splits.filter((split) => Number.isFinite(split.ratio) && split.ratio > 0),
    symbol,
  }
}

async function fetchEastmoneySeries(
  symbol: string,
  sourceId: string,
): Promise<PriceSeries> {
  const history = await fetchFundNavHistory(sourceId)

  return {
    closes: new Map(history.map((point) => [point.date, point.nav])),
    // NAV is always published in CNY, and unit NAV is already split-equivalent.
    currency: 'CNY',
    splits: [],
    symbol,
  }
}

async function loadSeries(instrument: Instrument, from: string) {
  const cacheKey = `${instrument.source}:${instrument.sourceId}:${from}`
  const cached = seriesCache.get(cacheKey)

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const value =
    instrument.source === 'eastmoney'
      ? await fetchEastmoneySeries(instrument.symbol, instrument.sourceId)
      : await fetchYahooSeries(instrument.sourceId || instrument.symbol, from)

  seriesCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value: { ...value, symbol: instrument.symbol },
  })

  return { ...value, symbol: instrument.symbol }
}

/**
 * Loads every price and FX series the ledger needs.
 *
 * A failing symbol is reported rather than thrown: one delisted ticker should
 * degrade its own line, not blank the whole curve.
 */
export async function loadPriceBook(instruments: Instrument[], from: string) {
  const errors: string[] = []
  const fx = new Map<string, Map<string, number>>()

  // Rates first, and serially: without them every multi-currency total is
  // wrong, whereas one missing instrument only drops its own line. Yahoo
  // throttles on burst, so concurrency stays low throughout.
  for (const pair of FX_PAIRS) {
    try {
      const rates = await fetchYahooSeries(`${pair}=X`, from)

      fx.set(pair, rates.closes)
    } catch (error) {
      errors.push(
        `${pair}: ${error instanceof Error ? error.message : 'rate fetch failed'}`,
      )
    }
  }

  if (fx.size === 0 && instruments.length > 0) {
    throw new UpstreamProviderError(
      `No exchange rates could be loaded, so multi-currency totals would be wrong. ${errors.join('; ')}`,
    )
  }

  const series = new Map<string, PriceSeries>()

  const loaded = await mapWithConcurrency(instruments, 2, async (instrument) => {
    try {
      return await loadSeries(instrument, from)
    } catch (error) {
      errors.push(
        `${instrument.symbol}: ${error instanceof Error ? error.message : 'price fetch failed'}`,
      )

      return null
    }
  })

  for (const item of loaded) {
    if (item) {
      series.set(item.symbol, item)
    }
  }

  return {
    book: { fx, series } satisfies PriceBook,
    errors,
  }
}
