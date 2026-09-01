import { fetchFundNavHistory } from '../server/providers/eastmoney.js'

/**
 * TEMPORARY: answers whether Vercel's egress can reach eastmoney, which could
 * not be determined before deploying. Reports no personal data — only whether
 * a public fund's NAV can be fetched. Delete once the answer is recorded.
 */
export async function GET() {
  const startedAt = Date.now()

  try {
    const history = await fetchFundNavHistory('161128')

    return Response.json({
      durationMs: Date.now() - startedAt,
      latest: history.at(-1) ?? null,
      points: history.length,
      reachable: true,
    })
  } catch (error) {
    return Response.json({
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown',
      reachable: false,
    })
  }
}
