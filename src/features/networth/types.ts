export type ValuationPoint = {
  cash: Record<string, number>
  date: string
  exposure: Record<string, number>
  holdings: Record<string, number>
  totalCny: number
  totalUsd: number
}

export type NetWorthSeries = {
  accounts: { currency: string; id: string; kind: string; name: string }[]
  asOf: string
  entryCount: number
  errors: string[]
  points: ValuationPoint[]
  warnings: string[]
}

export type BaseCurrency = 'CNY' | 'USD'

export const RANGE_OPTIONS = [
  { days: 90, label: '3 个月' },
  { days: 365, label: '1 年' },
  { days: 0, label: '全部' },
] as const

export type RangeDays = (typeof RANGE_OPTIONS)[number]['days']

export function totalFor(point: ValuationPoint, base: BaseCurrency) {
  return base === 'CNY' ? point.totalCny : point.totalUsd
}

/**
 * Trims the series to the last `days` calendar days. 0 means keep everything.
 */
export function sliceByRange(points: ValuationPoint[], days: RangeDays) {
  if (days === 0 || points.length === 0) {
    return points
  }

  const last = points.at(-1)
  const cutoff = new Date(`${last?.date ?? ''}T00:00:00Z`)

  cutoff.setUTCDate(cutoff.getUTCDate() - days)

  const cutoffDate = cutoff.toISOString().slice(0, 10)

  return points.filter((point) => point.date >= cutoffDate)
}

/**
 * Change between the first and last point of the visible window.
 *
 * This is a raw delta, not a return: it still includes money added or removed
 * over the period. XIRR is the number that separates those.
 */
export function summarize(points: ValuationPoint[], base: BaseCurrency) {
  const first = points[0]
  const last = points.at(-1)

  if (!first || !last) {
    return null
  }

  const start = totalFor(first, base)
  const end = totalFor(last, base)

  return {
    change: end - start,
    changeRatio: start === 0 ? null : (end - start) / Math.abs(start),
    end,
    start,
  }
}
