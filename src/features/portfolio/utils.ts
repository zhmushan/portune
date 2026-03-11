import type {
  DisplaySettings,
  MarketDataProvider,
  PortfolioAnalyzedPosition,
  PortfolioRequestPosition,
  ProviderApiKeys,
  ProviderSettings,
  PositionDraft,
} from './types'
import { DEFAULT_PROVIDER, getProviderOption } from './provider'

export function createPositionDraft(
  partial: Partial<Pick<PositionDraft, 'quantity' | 'symbol'>> = {},
): PositionDraft {
  return {
    id: crypto.randomUUID(),
    quantity: partial.quantity ?? '',
    symbol: partial.symbol ?? '',
  }
}

export function createProviderSettings(
  partial: Partial<ProviderSettings> = {},
): ProviderSettings {
  return {
    apiKeys: createProviderApiKeys(partial.apiKeys),
    provider: partial.provider ?? DEFAULT_PROVIDER,
  }
}

export function createProviderApiKeys(
  partial: Partial<ProviderApiKeys> | undefined = {},
): ProviderApiKeys {
  return {
    fmp: partial.fmp?.trim() ?? '',
    twelveData: partial.twelveData?.trim() ?? '',
    yahoo: partial.yahoo?.trim() ?? '',
  }
}

export function createDisplaySettings(
  partial: Partial<DisplaySettings> = {},
): DisplaySettings {
  return {
    privacyMode: partial.privacyMode ?? false,
  }
}

export function normalizeSymbolInput(value: string) {
  return value.replace(/\s+/g, '').toUpperCase()
}

export function sanitizeQuantityInput(value: string) {
  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return ''
  }

  if (!/^\d*\.?\d*$/.test(trimmedValue)) {
    return value.slice(0, -1)
  }

  return trimmedValue
}

export function buildRequestPositions(drafts: PositionDraft[]) {
  const aggregatedPositions = new Map<string, number>()

  for (const draft of drafts) {
    const symbol = normalizeSymbolInput(draft.symbol)
    const quantity = Number(draft.quantity)

    if (!symbol || !Number.isFinite(quantity) || quantity <= 0) {
      continue
    }

    aggregatedPositions.set(
      symbol,
      (aggregatedPositions.get(symbol) ?? 0) + quantity,
    )
  }

  return Array.from(aggregatedPositions.entries()).map(
    ([symbol, quantity]): PortfolioRequestPosition => ({
      quantity,
      symbol,
    }),
  )
}

export function serializeRequestPositions(positions: PortfolioRequestPosition[]) {
  return JSON.stringify(
    positions.toSorted((left, right) => left.symbol.localeCompare(right.symbol)),
  )
}

export function serializeAnalyzeRequestSignature(
  positions: PortfolioRequestPosition[],
  providerSettings: ProviderSettings,
) {
  return JSON.stringify({
    apiKey: getActiveProviderApiKey(providerSettings),
    positions: positions.toSorted((left, right) =>
      left.symbol.localeCompare(right.symbol),
    ),
    provider: providerSettings.provider,
  })
}

export function formatCurrency(value: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(value)
}

export function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`
}

export function formatBeta(value: number | null) {
  return value === null ? 'N/A' : value.toFixed(2)
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(new Date(value))
}

export function buildCopyText(positions: PortfolioAnalyzedPosition[]) {
  return positions
    .map((position) => `${position.symbol}, ${formatPercent(position.weight)}`)
    .join('\n')
}

export function getProviderLabel(provider: MarketDataProvider) {
  return getProviderOption(provider).label
}

export function getActiveProviderApiKey(providerSettings: ProviderSettings) {
  return providerSettings.apiKeys[providerSettings.provider].trim()
}
