import { fetchFmpSnapshots } from '../providers/fmp.js'
import { fetchTwelveDataSnapshots } from '../providers/twelve-data.js'
import { fetchYahooSnapshots } from '../providers/yahoo.js'
import { getProviderDescriptor, resolveProviderApiKey } from '../providers/catalog.js'
import { normalizeSymbol } from '../providers/utils.js'
import type {
  MarketDataProvider,
  PortfolioAnalysisError,
  ProviderFetchContext,
  QuoteSnapshot,
} from '../types.js'

const CACHE_TTL_MS = 60_000

type CacheEntry = {
  expiresAt: number
  value: QuoteSnapshot
}

const quoteSnapshotCache = new Map<string, CacheEntry>()

function isFresh(entry: CacheEntry | undefined) {
  return Boolean(entry && entry.expiresAt > Date.now())
}

function createCacheKey(provider: MarketDataProvider, symbol: string) {
  return `${provider}:${symbol}`
}

async function fetchProviderSnapshots(
  provider: MarketDataProvider,
  symbols: string[],
  context: ProviderFetchContext,
) {
  switch (provider) {
    case 'fmp':
      return fetchFmpSnapshots(symbols, context)
    case 'twelveData':
      return fetchTwelveDataSnapshots(symbols, context)
    case 'yahoo':
      return fetchYahooSnapshots(symbols)
  }
}

export async function fetchQuoteSnapshots(
  provider: MarketDataProvider,
  symbols: string[],
  requestApiKey: string | undefined,
) {
  const uniqueSymbols = Array.from(
    new Set(symbols.map(normalizeSymbol).filter(Boolean)),
  )

  const errors: PortfolioAnalysisError[] = []
  const snapshots = new Map<string, QuoteSnapshot>()
  const pendingSymbols: string[] = []

  for (const symbol of uniqueSymbols) {
    const cacheKey = createCacheKey(provider, symbol)
    const cachedEntry = quoteSnapshotCache.get(cacheKey)

    if (cachedEntry && isFresh(cachedEntry)) {
      snapshots.set(symbol, cachedEntry.value)
      continue
    }

    pendingSymbols.push(symbol)
  }

  if (pendingSymbols.length === 0) {
    return {
      ...getProviderDescriptor(provider),
      errors,
      snapshots,
      warnings: [] as string[],
    }
  }

  const apiKey = resolveProviderApiKey(provider, requestApiKey)
  const providerResult = await fetchProviderSnapshots(provider, pendingSymbols, {
    apiKey,
  })

  providerResult.snapshots.forEach((snapshot, symbol) => {
    quoteSnapshotCache.set(createCacheKey(provider, symbol), {
      expiresAt: Date.now() + CACHE_TTL_MS,
      value: snapshot,
    })
    snapshots.set(symbol, snapshot)
  })

  errors.push(...providerResult.errors)

  return {
    ...getProviderDescriptor(provider),
    errors,
    snapshots,
    warnings: providerResult.warnings,
  }
}
