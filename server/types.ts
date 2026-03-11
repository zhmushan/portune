export type MarketDataProvider = 'fmp' | 'twelveData' | 'yahoo'

export type AuthSession = {
  email: string
}

export type AppBindings = {
  Variables: {
    authSession: AuthSession
  }
}

export type PortfolioInputPosition = {
  quantity: number
  symbol: string
}

export type ProviderRequestConfig = {
  apiKey?: string
}

export type PortfolioAnalyzeRequest = {
  positions: PortfolioInputPosition[]
  provider: MarketDataProvider
  providerConfig?: ProviderRequestConfig
}

export type PortfolioAnalysisError = {
  message: string
  symbol: string
}

export type QuoteSnapshot = {
  beta: number | null
  currency: string
  marketTime: string | null
  name: string
  price: number
  symbol: string
}

export type PortfolioAnalyzedPosition = QuoteSnapshot & {
  marketValue: number
  quantity: number
  weight: number
}

export type ProviderDescriptor = {
  envVarName: string | null
  label: string
  provider: MarketDataProvider
  requiresApiKey: boolean
}

export type ProviderFetchContext = {
  apiKey?: string
}

export type ProviderFetchResult = {
  errors: PortfolioAnalysisError[]
  snapshots: Map<string, QuoteSnapshot>
  warnings: string[]
}

export type PortfolioAnalyzeResponse = {
  analyzedAt: string
  currency: string
  errors: PortfolioAnalysisError[]
  portfolioBeta: number
  positions: PortfolioAnalyzedPosition[]
  provider: MarketDataProvider
  providerLabel: string
  totalMarketValue: number
  warnings: string[]
}

export class ProviderConfigurationError extends Error {
  readonly status = 400

  constructor(message: string) {
    super(message)
    this.name = 'ProviderConfigurationError'
  }
}

export class UpstreamProviderError extends Error {
  readonly status: number

  constructor(message: string, status = 502) {
    super(message)
    this.name = 'UpstreamProviderError'
    this.status = status
  }
}

export class ApplicationConfigurationError extends Error {
  readonly status = 500

  constructor(message: string) {
    super(message)
    this.name = 'ApplicationConfigurationError'
  }
}
