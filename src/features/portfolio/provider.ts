import type { MarketDataProvider } from './types'

export type ProviderOption = {
  apiKeyPlaceholder: string
  description: string
  envVarName: string | null
  key: MarketDataProvider
  label: string
  requiresApiKey: boolean
}

export const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    apiKeyPlaceholder: '输入 FMP API Key，留空则走后端环境变量',
    description: '适合本地工具，价格与 beta 获取路径稳定。',
    envVarName: 'FMP_API_KEY',
    key: 'fmp',
    label: 'FMP',
    requiresApiKey: true,
  },
  {
    apiKeyPlaceholder: '输入 Twelve Data API Key，留空则走后端环境变量',
    description: '按 credits 计费，适合需要明确配额控制的场景。',
    envVarName: 'TWELVE_DATA_API_KEY',
    key: 'twelveData',
    label: 'Twelve Data',
    requiresApiKey: true,
  },
  {
    apiKeyPlaceholder: '',
    description: '无需 API Key，但上游限流较重，更适合作为兜底数据源。',
    envVarName: null,
    key: 'yahoo',
    label: 'Yahoo',
    requiresApiKey: false,
  },
]

const providerOptionMap = new Map(
  PROVIDER_OPTIONS.map((providerOption) => [providerOption.key, providerOption]),
)

export const DEFAULT_PROVIDER: MarketDataProvider = 'yahoo'

export function getProviderOption(provider: MarketDataProvider) {
  const providerOption = providerOptionMap.get(provider)

  if (!providerOption) {
    throw new Error(`Unsupported provider: ${provider}`)
  }

  return providerOption
}
