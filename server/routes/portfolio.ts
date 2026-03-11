import { Hono } from 'hono'
import { z } from 'zod'

import { analyzePortfolio } from '../services/portfolio.js'
import {
  ProviderConfigurationError,
  UpstreamProviderError,
} from '../types.js'

const portfolioApp = new Hono()

const analyzePortfolioSchema = z.object({
  positions: z
    .array(
      z.object({
        quantity: z.coerce.number().positive(),
        symbol: z.string().trim().min(1),
      }),
    )
    .min(1)
    .max(100),
  provider: z.enum(['fmp', 'twelveData', 'yahoo']).default('yahoo'),
  providerConfig: z
    .object({
      apiKey: z.string().trim().min(1).optional(),
    })
    .optional(),
})

portfolioApp.post('/analyze', async (context) => {
  const requestJson = await context.req.json().catch(() => null)
  const parseResult = analyzePortfolioSchema.safeParse(requestJson)

  if (!parseResult.success) {
    return context.json(
      {
        issues: parseResult.error.flatten(),
        message: 'Request payload is invalid.',
      },
      400,
    )
  }

  try {
    const result = await analyzePortfolio(parseResult.data)

    return context.json(result)
  } catch (error) {
    if (
      error instanceof ProviderConfigurationError ||
      error instanceof UpstreamProviderError
    ) {
      context.status(error.status as 400 | 429 | 502)

      return context.json({
        message: error.message,
      })
    }

    context.status(502)

    return context.json({
      message:
        error instanceof Error ? error.message : 'Portfolio analysis failed.',
    })
  }
})

export { portfolioApp }
