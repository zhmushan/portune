export type MarketDataProvider = 'fmp' | 'twelveData' | 'yahoo'

export type ProviderApiKeys = Record<MarketDataProvider, string>

export type PositionDraft = {
  id: string
  quantity: string
  symbol: string
}

export type ProviderSettings = {
  apiKeys: ProviderApiKeys
  provider: MarketDataProvider
}

export type DisplaySettings = {
  privacyMode: boolean
}

export type PortfolioWorkspace = {
  displaySettings: DisplaySettings
  drafts: PositionDraft[]
  providerSettings: ProviderSettings
}

export type PortfolioRequestPosition = {
  quantity: number
  symbol: string
}

export type AnalyzePortfolioRequest = {
  positions: PortfolioRequestPosition[]
  provider: MarketDataProvider
  providerConfig?: {
    apiKey?: string
  }
}

export type PortfolioAnalysisError = {
  message: string
  symbol: string
}

export type PortfolioAnalyzedPosition = {
  beta: number | null
  currency: string
  marketTime: string | null
  marketValue: number
  name: string
  price: number
  quantity: number
  symbol: string
  weight: number
}

export type PortfolioAnalysisResponse = {
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

export type AnalysisStatus = 'error' | 'idle' | 'loading' | 'success'
export type CopyStatus = 'error' | 'idle' | 'success'
