import YahooFinance from 'yahoo-finance2'

import type { ProviderFetchResult, QuoteSnapshot } from '../types.js'
import {
  buildSymbolError,
  getProviderSymbol,
  normalizeSymbol,
  toNumber,
} from './utils.js'

const yahooFinanceClient = new YahooFinance({
  suppressNotices: ['yahooSurvey'],
})

export async function fetchYahooBetaFallback(symbol: string) {
  try {
    const providerSymbol = getProviderSymbol('yahoo', symbol)
    const summary = await yahooFinanceClient.quoteSummary(providerSymbol, {
      modules: ['defaultKeyStatistics'],
    })

    return toNumber(summary?.defaultKeyStatistics?.beta)
  } catch {
    return null
  }
}

export async function fetchYahooSnapshots(symbols: string[]): Promise<ProviderFetchResult> {
  const requests = symbols.map((symbol) => ({
    providerSymbol: getProviderSymbol('yahoo', symbol),
    symbol: normalizeSymbol(symbol),
  }))

  const [quotes, summaryResults] = await Promise.all([
    yahooFinanceClient.quote(requests.map((request) => request.providerSymbol)),
    Promise.allSettled(
      requests.map((request) =>
        yahooFinanceClient.quoteSummary(request.providerSymbol, {
          modules: ['defaultKeyStatistics', 'price'],
        }),
      ),
    ),
  ])

  const errors: ProviderFetchResult['errors'] = []
  const snapshots = new Map<string, QuoteSnapshot>()
  const warnings: string[] = []

  const quoteBySymbol = new Map(
    quotes.map((quote) => [normalizeSymbol(quote.symbol), quote]),
  )

  requests.forEach(({ providerSymbol, symbol }, index) => {
    const quote = quoteBySymbol.get(normalizeSymbol(providerSymbol))
    const summaryResult = summaryResults[index]
    const summary =
      summaryResult?.status === 'fulfilled' ? summaryResult.value : null

    if (!quote) {
      errors.push(
        buildSymbolError(
          symbol,
          'Yahoo Finance did not return a quote for this symbol.',
        ),
      )
      return
    }

    const price =
      toNumber(quote.regularMarketPrice) ??
      toNumber(summary?.price?.regularMarketPrice)

    if (price === null) {
      errors.push(
        buildSymbolError(symbol, 'Price is unavailable from Yahoo Finance.'),
      )
      return
    }

    const beta = toNumber(summary?.defaultKeyStatistics?.beta)

    snapshots.set(symbol, {
      beta,
      currency:
        quote.currency ??
        summary?.price?.currency ??
        quote.financialCurrency ??
        'USD',
      marketTime: quote.regularMarketTime?.toISOString() ?? null,
      name: quote.shortName ?? quote.longName ?? summary?.price?.shortName ?? symbol,
      price,
      symbol,
    })

    if (beta === null) {
      warnings.push(
        `${symbol} beta is unavailable from Yahoo and was treated as 0 in the portfolio beta.`,
      )
    }
  })

  return {
    errors,
    snapshots,
    warnings,
  }
}
