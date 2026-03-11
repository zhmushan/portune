import type { MarketDataProvider, PortfolioAnalysisError } from '../types.js'
import { UpstreamProviderError } from '../types.js'

const providerSymbolAliases: Partial<
  Record<MarketDataProvider, Record<string, string>>
> = {
  fmp: {
    BRKA: 'BRK-A',
    BRKB: 'BRK-B',
    'BRK.A': 'BRK-A',
    'BRK.B': 'BRK-B',
  },
  twelveData: {
    BRKA: 'BRK.A',
    BRKB: 'BRK.B',
    'BRK-A': 'BRK.A',
    'BRK-B': 'BRK.B',
  },
  yahoo: {
    BRKA: 'BRK-A',
    BRKB: 'BRK-B',
    'BRK.A': 'BRK-A',
    'BRK.B': 'BRK-B',
  },
}

export function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase()
}

export function getProviderSymbol(
  provider: MarketDataProvider,
  symbol: string,
) {
  const normalizedSymbol = normalizeSymbol(symbol)

  return providerSymbolAliases[provider]?.[normalizedSymbol] ?? normalizedSymbol
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsedValue = Number(value)

    if (Number.isFinite(parsedValue)) {
      return parsedValue
    }
  }

  return null
}

export function toStringValue(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }

  return null
}

export function toRecordArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter(isRecord)
  }

  if (isRecord(value)) {
    return Object.values(value).filter(isRecord)
  }

  return []
}

export function extractProviderMessage(payload: unknown) {
  if (typeof payload === 'string' && payload.trim()) {
    return payload.trim()
  }

  if (!isRecord(payload)) {
    return null
  }

  const directMessage =
    toStringValue(payload.message) ??
    toStringValue(payload.Message) ??
    toStringValue(payload['Error Message']) ??
    toStringValue(payload.error)

  if (directMessage) {
    return directMessage
  }

  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    const firstError = payload.errors[0]

    if (isRecord(firstError)) {
      return (
        toStringValue(firstError.message) ??
        toStringValue(firstError.error) ??
        null
      )
    }
  }

  return null
}

export async function fetchJson(
  input: string | URL,
  init: RequestInit = {},
): Promise<{ payload: unknown; response: Response }> {
  let response: Response

  try {
    response = await fetch(input, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...init.headers,
      },
      signal: init.signal ?? AbortSignal.timeout(10_000),
    })
  } catch (error) {
    throw new UpstreamProviderError(
      error instanceof Error
        ? `Network request failed: ${error.message}`
        : 'Network request failed.',
    )
  }

  const rawText = await response.text()

  if (!rawText) {
    return {
      payload: null,
      response,
    }
  }

  try {
    return {
      payload: JSON.parse(rawText) as unknown,
      response,
    }
  } catch {
    return {
      payload: rawText,
      response,
    }
  }
}

export function buildSymbolError(symbol: string, message: string): PortfolioAnalysisError {
  return {
    message,
    symbol,
  }
}

export function throwUpstreamResponseError(
  providerLabel: string,
  response: Response,
  payload: unknown,
) {
  const providerMessage =
    extractProviderMessage(payload) ??
    `HTTP ${response.status} ${response.statusText}`

  const status =
    response.status === 401 || response.status === 403
      ? 400
      : response.status === 429
        ? 429
        : 502

  throw new UpstreamProviderError(
    `${providerLabel} request failed: ${providerMessage}`,
    status,
  )
}

export function throwUpstreamMessageError(
  providerLabel: string,
  providerMessage: string,
) {
  const status =
    /api key|apikey|unauthorized|forbidden/i.test(providerMessage)
      ? 400
      : /too many|rate limit|credits/i.test(providerMessage)
        ? 429
        : 502

  throw new UpstreamProviderError(
    `${providerLabel} request failed: ${providerMessage}`,
    status,
  )
}

export async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>,
) {
  const results: TOutput[] = []
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      const currentItem = items[currentIndex]

      if (currentItem === undefined) {
        continue
      }

      results[currentIndex] = await mapper(currentItem, currentIndex)
    }
  }

  const workerCount = Math.min(Math.max(concurrency, 1), items.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  return results
}
