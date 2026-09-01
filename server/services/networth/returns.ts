export type CashFlow = {
  /** Positive = money entering the pool, negative = leaving it. */
  amount: number
  date: string
}

const DAYS_PER_YEAR = 365
const MAX_NEWTON_ITERATIONS = 60
const TOLERANCE = 1e-7

function yearsBetween(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)

  return (end - start) / (86_400_000 * DAYS_PER_YEAR)
}

function netPresentValue(flows: CashFlow[], rate: number, origin: string) {
  let total = 0

  for (const flow of flows) {
    const exponent = yearsBetween(origin, flow.date)
    const base = 1 + rate

    // A rate at or below -100% makes the discount factor undefined for
    // non-integer exponents; the solver is bounded to stay above it.
    if (base <= 0) {
      return Number.NaN
    }

    total += flow.amount / base ** exponent
  }

  return total
}

function bisect(flows: CashFlow[], origin: string, low: number, high: number) {
  let lowRate = low
  let highRate = high
  let lowValue = netPresentValue(flows, lowRate, origin)
  let highValue = netPresentValue(flows, highRate, origin)

  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue)) {
    return null
  }

  if (lowValue * highValue > 0) {
    return null
  }

  for (let iteration = 0; iteration < 200; iteration += 1) {
    const midRate = (lowRate + highRate) / 2
    const midValue = netPresentValue(flows, midRate, origin)

    if (!Number.isFinite(midValue)) {
      return null
    }

    if (Math.abs(midValue) < TOLERANCE || highRate - lowRate < 1e-9) {
      return midRate
    }

    if (lowValue * midValue < 0) {
      highRate = midRate
      highValue = midValue
    } else {
      lowRate = midRate
      lowValue = midValue
    }
  }

  return (lowRate + highRate) / 2
}

/**
 * Money-weighted annualized return.
 *
 * Newton converges fast when it converges at all, but it diverges on awkward
 * flow patterns, so a bracketed bisection backs it up. Returns null when no
 * rate exists — flows all one sign, too short a window, no solution in range —
 * because showing a wrong return is worse than showing none.
 */
export function computeXirr(flows: CashFlow[]) {
  if (flows.length < 2) {
    return null
  }

  const sorted = flows.toSorted((left, right) =>
    left.date < right.date ? -1 : left.date > right.date ? 1 : 0,
  )
  const origin = sorted[0]?.date

  if (!origin) {
    return null
  }

  const hasInflow = sorted.some((flow) => flow.amount > 0)
  const hasOutflow = sorted.some((flow) => flow.amount < 0)

  // Without both signs there is nothing to solve: the NPV never crosses zero.
  if (!hasInflow || !hasOutflow) {
    return null
  }

  let rate = 0.1

  for (let iteration = 0; iteration < MAX_NEWTON_ITERATIONS; iteration += 1) {
    const value = netPresentValue(sorted, rate, origin)

    if (!Number.isFinite(value)) {
      break
    }

    if (Math.abs(value) < TOLERANCE) {
      return rate
    }

    // Numerical derivative: the analytic one buys little here and is easy to
    // get subtly wrong with fractional exponents.
    const step = 1e-6
    const slope =
      (netPresentValue(sorted, rate + step, origin) - value) / step

    if (!Number.isFinite(slope) || Math.abs(slope) < 1e-12) {
      break
    }

    const next = rate - value / slope

    if (!Number.isFinite(next) || next <= -0.9999) {
      break
    }

    if (Math.abs(next - rate) < 1e-12) {
      return next
    }

    rate = next
  }

  return bisect(sorted, origin, -0.9999, 10)
}

/**
 * Time-weighted return, which strips out the timing and size of deposits.
 *
 * Reported alongside XIRR because the two answer different questions: TWR is
 * how the holdings performed, XIRR is what the money actually earned. A gap
 * between them says the deposit timing mattered.
 */
export function computeTwr(
  valuations: { date: string; total: number }[],
  flowsByDate: Map<string, number>,
) {
  if (valuations.length < 2) {
    return null
  }

  let growth = 1
  let previous = valuations[0]

  for (let index = 1; index < valuations.length; index += 1) {
    const current = valuations[index]

    if (!current || !previous) {
      continue
    }

    const flow = flowsByDate.get(current.date) ?? 0
    const start = previous.total

    if (Math.abs(start) < 1e-9) {
      previous = current
      continue
    }

    // Remove the flow before measuring the period's return, so a deposit does
    // not read as a gain.
    growth *= (current.total - flow) / start
    previous = current
  }

  if (!Number.isFinite(growth) || growth <= 0) {
    return null
  }

  const years = yearsBetween(
    valuations[0]?.date ?? '',
    valuations.at(-1)?.date ?? '',
  )

  if (years <= 0) {
    return null
  }

  return growth ** (1 / years) - 1
}
