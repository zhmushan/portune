import type { ProviderFetchContext, ProviderFetchResult, QuoteSnapshot } from '../types.js'
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

function createFmpUrl(pathname: string, symbol: string, apiKey: string) {
  const url = new URL(`https://financialmodelingprep.com${pathname}`)
  url.searchParams.set('apikey', apiKey)
  url.searchParams.set('symbol', symbol)

  return url
}

function getFirstRecord(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload.find(isRecord)
  }

  return isRecord(payload) ? payload : undefined
}

async function fetchFmpProfileRecord(
  symbol: string,
  apiKey: string,
  strict: boolean,
) {
  const providerSymbol = getProviderSymbol('fmp', symbol)
  const profileResult = await fetchJson(
    createFmpUrl('/stable/profile', providerSymbol, apiKey),
  )

  if (!profileResult.response.ok) {
    if (strict) {
      throwUpstreamResponseError('FMP', profileResult.response, profileResult.payload)
    }

    return null
  }

  const profileMessage = extractProviderMessage(profileResult.payload)

  if (profileMessage) {
    if (strict) {
      throwUpstreamMessageError('FMP', profileMessage)
    }

    return null
  }

  return getFirstRecord(profileResult.payload) ?? null
}

function getSnapshot(
  symbol: string,
  profileRecord: Record<string, unknown> | undefined,
) {
  const price = toNumber(profileRecord?.price)

  if (price === null) {
    return {
      error: buildSymbolError(symbol, 'Price is unavailable from FMP.'),
      snapshot: null,
      warning: null,
    }
  }

  const beta = toNumber(profileRecord?.beta)
  const name =
    toStringValue(profileRecord?.companyName) ??
    toStringValue(profileRecord?.name) ??
    symbol

  const snapshot: QuoteSnapshot = {
    beta,
    currency: toStringValue(profileRecord?.currency) ?? 'USD',
    marketTime: null,
    name,
    price,
    symbol,
  }

  return {
    error: null,
    snapshot,
    warning:
      beta === null
        ? `${symbol} beta is unavailable from FMP and was treated as 0 in the portfolio beta.`
        : null,
  }
}

export async function fetchFmpBetaFallback(
  symbol: string,
  apiKey: string | undefined,
) {
  if (!apiKey) {
    return null
  }

  try {
    const profileRecord = await fetchFmpProfileRecord(symbol, apiKey, false)

    return toNumber(profileRecord?.beta)
  } catch {
    return null
  }
}

export async function fetchFmpSnapshots(
  symbols: string[],
  context: ProviderFetchContext,
): Promise<ProviderFetchResult> {
  const apiKey = context.apiKey

  if (!apiKey) {
    throw new Error('FMP API key is required.')
  }

  const errors: ProviderFetchResult['errors'] = []
  const snapshots = new Map<string, QuoteSnapshot>()
  const warnings: string[] = []

  const results = await mapWithConcurrency(symbols, 4, async (symbol) => {
    return {
      profileRecord: await fetchFmpProfileRecord(symbol, apiKey, true),
      symbol,
    }
  })

  for (const { profileRecord, symbol } of results) {
    const normalizedSymbol = normalizeSymbol(symbol)

    if (!profileRecord) {
      errors.push(
        buildSymbolError(
          normalizedSymbol,
          'FMP did not return profile data for this symbol.',
        ),
      )
      continue
    }

    const result = getSnapshot(normalizedSymbol, profileRecord)

    if (result.error) {
      errors.push(result.error)
      continue
    }

    if (result.snapshot) {
      snapshots.set(normalizedSymbol, result.snapshot)
    }

    if (result.warning) {
      warnings.push(result.warning)
    }
  }

  return {
    errors,
    snapshots,
    warnings,
  }
}
