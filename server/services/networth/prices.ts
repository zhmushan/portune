export type PriceSeries = {
  /** ISO date → close price, in `currency`. Sparse: only trading days. */
  closes: Map<string, number>
  currency: string
  /**
   * Cumulative split factors keyed by effective date. Yahoo's closes are
   * split-adjusted but hand-recorded quantities are not, so quantities before a
   * split have to be scaled to match.
   */
  splits: { date: string; ratio: number }[]
  symbol: string
}

export type PriceBook = {
  /** ISO date → units of `quoteCurrency` per unit of `baseCurrency`. */
  fx: Map<string, Map<string, number>>
  series: Map<string, PriceSeries>
}

export function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`)

  date.setUTCDate(date.getUTCDate() + days)

  return date.toISOString().slice(0, 10)
}

/**
 * Every calendar day from start to end inclusive.
 *
 * Deliberately not just trading days: US markets, A-shares, and QDII NAV each
 * follow a different calendar, and the net worth curve needs one shared axis.
 */
export function buildDateRange(startDate: string, endDate: string) {
  const dates: string[] = []

  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    dates.push(date)
  }

  return dates
}

/**
 * Last known value at or before `date`.
 *
 * Weekends, holidays, and the one-to-two day QDII NAV publication lag all leave
 * gaps; carrying the previous close forward is what makes a daily curve possible.
 * Returns null before the first observation rather than guessing.
 */
export function lookupForwardFilled(
  values: Map<string, number>,
  sortedDates: string[],
  date: string,
) {
  const direct = values.get(date)

  if (direct !== undefined) {
    return direct
  }

  let low = 0
  let high = sortedDates.length - 1
  let candidate: number | null = null

  while (low <= high) {
    const middle = (low + high) >> 1
    const middleDate = sortedDates[middle] as string

    if (middleDate <= date) {
      candidate = values.get(middleDate) ?? null
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  return candidate
}

export function sortedKeys(values: Map<string, number>) {
  return [...values.keys()].toSorted()
}
