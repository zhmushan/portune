import type { MarketDataProvider, ProviderDescriptor } from '../types.js'
import { ProviderConfigurationError } from '../types.js'

const providerCatalog: Record<MarketDataProvider, ProviderDescriptor> = {
  fmp: {
    envVarName: 'FMP_API_KEY',
    label: 'FMP',
    provider: 'fmp',
    requiresApiKey: true,
  },
  twelveData: {
    envVarName: 'TWELVE_DATA_API_KEY',
    label: 'Twelve Data',
    provider: 'twelveData',
    requiresApiKey: true,
  },
  yahoo: {
    envVarName: null,
    label: 'Yahoo',
    provider: 'yahoo',
    requiresApiKey: false,
  },
}

export function getProviderDescriptor(provider: MarketDataProvider) {
  return providerCatalog[provider]
}

export function readProviderApiKey(
  provider: MarketDataProvider,
  requestApiKey: string | undefined,
) {
  const descriptor = getProviderDescriptor(provider)
  const trimmedRequestApiKey = requestApiKey?.trim()

  if (trimmedRequestApiKey) {
    return trimmedRequestApiKey
  }

  const trimmedEnvironmentApiKey = descriptor.envVarName
    ? process.env[descriptor.envVarName]?.trim()
    : undefined

  return trimmedEnvironmentApiKey || undefined
}

export function resolveProviderApiKey(
  provider: MarketDataProvider,
  requestApiKey: string | undefined,
) {
  const descriptor = getProviderDescriptor(provider)
  const apiKey = readProviderApiKey(provider, requestApiKey)

  if (apiKey) {
    return apiKey
  }

  if (descriptor.requiresApiKey) {
    throw new ProviderConfigurationError(
      `${descriptor.label} requires an API key. Provide providerConfig.apiKey or set ${descriptor.envVarName}.`,
    )
  }

  return undefined
}
