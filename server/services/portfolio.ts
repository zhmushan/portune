import type {
  PortfolioAnalyzeRequest,
  PortfolioAnalyzeResponse,
  PortfolioAnalysisError,
  PortfolioAnalyzedPosition,
  PortfolioInputPosition,
} from '../types.js'
import { fetchQuoteSnapshots } from './market-data.js'

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase()
}

function roundTo(value: number, digits: number) {
  const factor = 10 ** digits

  return Math.round(value * factor) / factor
}

function aggregatePositions(positions: PortfolioInputPosition[]) {
  const quantitiesBySymbol = new Map<string, number>()

  for (const position of positions) {
    const symbol = normalizeSymbol(position.symbol)

    if (!symbol || !Number.isFinite(position.quantity) || position.quantity <= 0) {
      continue
    }

    quantitiesBySymbol.set(
      symbol,
      (quantitiesBySymbol.get(symbol) ?? 0) + position.quantity,
    )
  }

  return Array.from(quantitiesBySymbol.entries()).map(([symbol, quantity]) => ({
    quantity,
    symbol,
  }))
}

export async function analyzePortfolio(
  request: PortfolioAnalyzeRequest,
): Promise<PortfolioAnalyzeResponse> {
  const normalizedPositions = aggregatePositions(request.positions)
  const symbols = normalizedPositions.map((position) => position.symbol)

  const marketDataResult = await fetchQuoteSnapshots(
    request.provider,
    symbols,
    request.providerConfig?.apiKey,
  )
  const errors: PortfolioAnalysisError[] = [...marketDataResult.errors]
  const warnings = [...marketDataResult.warnings]

  const analyzedPositions: PortfolioAnalyzedPosition[] = normalizedPositions.flatMap(
    (position) => {
      const snapshot = marketDataResult.snapshots.get(position.symbol)

      if (!snapshot) {
        return []
      }

      return [
        {
          ...snapshot,
          marketValue: roundTo(position.quantity * snapshot.price, 2),
          quantity: roundTo(position.quantity, 4),
          weight: 0,
        },
      ]
    },
  )

  const totalMarketValue = roundTo(
    analyzedPositions.reduce(
      (total, position) => total + position.marketValue,
      0,
    ),
    2,
  )

  const currencies = new Set(
    analyzedPositions.map((position) => position.currency).filter(Boolean),
  )

  const positionsWithWeight = analyzedPositions
    .map((position) => {
      const weight =
        totalMarketValue > 0 ? position.marketValue / totalMarketValue : 0

      return {
        ...position,
        weight: roundTo(weight, 6),
      }
    })
    .sort((left, right) => right.marketValue - left.marketValue)

  if (currencies.size > 1) {
    warnings.push('Mixed currencies detected. Portfolio metrics assume USD pricing.')
  }

  if (positionsWithWeight.length === 0 && errors.length === 0) {
    errors.push({
      message: 'No valid positions could be priced from the selected provider.',
      symbol: 'PORTFOLIO',
    })
  }

  const portfolioBeta = roundTo(
    positionsWithWeight.reduce(
      (total, position) => total + position.weight * (position.beta ?? 0),
      0,
    ),
    4,
  )

  return {
    analyzedAt: new Date().toISOString(),
    currency: positionsWithWeight[0]?.currency ?? 'USD',
    errors,
    portfolioBeta,
    positions: positionsWithWeight,
    provider: request.provider,
    providerLabel: marketDataResult.label,
    totalMarketValue,
    warnings,
  }
}
