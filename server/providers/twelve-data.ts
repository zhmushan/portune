import type { ProviderFetchContext, ProviderFetchResult, QuoteSnapshot } from '../types.js'
import { readProviderApiKey } from './catalog.js'
import { fetchFmpBetaFallback } from './fmp.js'
import { fetchYahooBetaFallback } from './yahoo.js'
import {
  buildSymbolError,
  extractProviderMessage,
  fetchJson,
  getProviderSymbol,
  isRecord,
  mapWithConcurrency,
  normalizeSymbol,
  toNumber,
  toStringValue,
  throwUpstreamMessageError,
  throwUpstreamResponseError,
} from './utils.js'

function createTwelveDataUrl(pathname: string, symbol: string, apiKey: string) {
  const url = new URL(`https://api.twelvedata.com${pathname}`)
  url.searchParams.set('apikey', apiKey)
  url.searchParams.set('symbol', symbol)

  return url
}

function isTwelveDataError(payload: unknown) {
  return isRecord(payload) && payload.status === 'error'
}

function extractStatisticsBeta(statisticsPayload: unknown) {
  if (!isRecord(statisticsPayload) || isTwelveDataError(statisticsPayload)) {
    return null
  }

  return (
    toNumber(statisticsPayload.beta) ??
    toNumber(statisticsPayload.statistics_beta) ??
    toNumber(statisticsPayload.value) ??
    (isRecord(statisticsPayload.statistics)
      ? isRecord(statisticsPayload.statistics.stock_price_summary)
        ? toNumber(statisticsPayload.statistics.stock_price_summary.beta)
        : null
      : null)
  )
}

function describeStatisticsIssue(response: Response, payload: unknown) {
  if (isTwelveDataError(payload)) {
    return extractProviderMessage(payload)
  }

  if (!response.ok) {
    return extractProviderMessage(payload) ?? `HTTP ${response.status} ${response.statusText}`
  }

  return null
}

function createBetaWarning(
  symbol: string,
  statisticsIssue: string | null,
  fallbackSource: 'FMP' | 'Yahoo' | null,
) {
  if (fallbackSource) {
    if (statisticsIssue) {
      return `Twelve Data statistics is unavailable for ${symbol}: ${statisticsIssue}. Beta fell back to ${fallbackSource}.`
    }

    return `${symbol} beta is unavailable from Twelve Data and fell back to ${fallbackSource}.`
  }

  if (statisticsIssue) {
    return `Twelve Data statistics is unavailable for ${symbol}: ${statisticsIssue}. Beta was treated as 0 in the portfolio beta.`
  }

  return `${symbol} beta is unavailable from Twelve Data and was treated as 0 in the portfolio beta.`
}

async function resolveBeta(
  symbol: string,
  statisticsResponse: Response,
  statisticsPayload: unknown,
  fmpApiKey: string | undefined,
) {
  const directBeta = extractStatisticsBeta(statisticsPayload)

  if (directBeta !== null) {
    return {
      beta: directBeta,
      warning: null,
    }
  }

  const statisticsIssue = describeStatisticsIssue(
    statisticsResponse,
    statisticsPayload,
  )
  const fmpBeta = await fetchFmpBetaFallback(symbol, fmpApiKey)

  if (fmpBeta !== null) {
    return {
      beta: fmpBeta,
      warning: createBetaWarning(symbol, statisticsIssue, 'FMP'),
    }
  }

  const yahooBeta = await fetchYahooBetaFallback(symbol)

  if (yahooBeta !== null) {
    return {
      beta: yahooBeta,
      warning: createBetaWarning(symbol, statisticsIssue, 'Yahoo'),
    }
  }

  return {
    beta: null,
    warning: createBetaWarning(symbol, statisticsIssue, null),
  }
}

async function createSnapshot(
  symbol: string,
  quotePayload: Record<string, unknown>,
  statisticsResponse: Response,
  statisticsPayload: unknown,
  fmpApiKey: string | undefined,
) {
  const price =
    toNumber(quotePayload.close) ??
    toNumber(quotePayload.price) ??
    toNumber(quotePayload.last)

  if (price === null) {
    return {
      error: buildSymbolError(symbol, 'Price is unavailable from Twelve Data.'),
      snapshot: null,
      warning: null,
    }
  }

  const betaResult = await resolveBeta(
    symbol,
    statisticsResponse,
    statisticsPayload,
    fmpApiKey,
  )

  const snapshot: QuoteSnapshot = {
    beta: betaResult.beta,
    currency: toStringValue(quotePayload.currency) ?? 'USD',
    marketTime: toStringValue(quotePayload.datetime),
    name: toStringValue(quotePayload.name) ?? symbol,
    price,
    symbol,
  }

  return {
    error: null,
    snapshot,
    warning: betaResult.warning,
  }
}

export async function fetchTwelveDataSnapshots(
  symbols: string[],
  context: ProviderFetchContext,
): Promise<ProviderFetchResult> {
  const apiKey = context.apiKey

  if (!apiKey) {
    throw new Error('Twelve Data API key is required.')
  }

  const errors: ProviderFetchResult['errors'] = []
  const snapshots = new Map<string, QuoteSnapshot>()
  const warnings: string[] = []
  const fmpApiKey = readProviderApiKey('fmp', undefined)

  const results = await mapWithConcurrency(symbols, 4, async (symbol) => {
    const providerSymbol = getProviderSymbol('twelveData', symbol)
    const [quoteResult, statisticsResult] = await Promise.all([
      fetchJson(createTwelveDataUrl('/quote', providerSymbol, apiKey)),
      fetchJson(createTwelveDataUrl('/statistics', providerSymbol, apiKey)),
    ])

    return {
      quoteResult,
      statisticsResult,
      symbol,
    }
  })

  for (const { quoteResult, statisticsResult, symbol } of results) {
    const normalizedSymbol = normalizeSymbol(symbol)

    if (!quoteResult.response.ok) {
      throwUpstreamResponseError('Twelve Data', quoteResult.response, quoteResult.payload)
    }

    if (isTwelveDataError(quoteResult.payload)) {
      const providerMessage = extractProviderMessage(quoteResult.payload)

      if (
        providerMessage &&
        /api key|apikey|too many|rate limit|credits|unauthorized|forbidden/i.test(
          providerMessage,
        )
      ) {
        throwUpstreamMessageError('Twelve Data', providerMessage)
      }

      errors.push(
        buildSymbolError(
          normalizedSymbol,
          providerMessage ?? 'Twelve Data could not return quote data for this symbol.',
        ),
      )
      continue
    }

    if (!isRecord(quoteResult.payload)) {
      errors.push(
        buildSymbolError(
          normalizedSymbol,
          'Twelve Data quote payload is invalid for this symbol.',
        ),
      )
      continue
    }

    const snapshotResult = await createSnapshot(
      normalizedSymbol,
      quoteResult.payload,
      statisticsResult.response,
      statisticsResult.payload,
      fmpApiKey,
    )

    if (snapshotResult.error) {
      errors.push(snapshotResult.error)
      continue
    }

    if (snapshotResult.snapshot) {
      snapshots.set(normalizedSymbol, snapshotResult.snapshot)
    }

    if (snapshotResult.warning) {
      warnings.push(snapshotResult.warning)
    }
  }

  return {
    errors,
    snapshots,
    warnings,
  }
}
