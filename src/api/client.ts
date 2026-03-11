import type {
  AnalyzePortfolioRequest,
  PortfolioAnalysisResponse,
} from '../features/portfolio/types'
import { readJsonOrThrow } from './http'

export async function analyzePortfolio(
  request: AnalyzePortfolioRequest,
): Promise<PortfolioAnalysisResponse> {
  const response = await fetch('/api/portfolio/analyze', {
    body: JSON.stringify(request),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })

  return readJsonOrThrow<PortfolioAnalysisResponse>(
    response,
    'Portfolio analysis failed.',
  )
}
