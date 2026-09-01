import { describe, expect, it } from 'vitest'

import { computeTwr, computeXirr } from './returns.js'

describe('computeXirr', () => {
  it('recovers a known 10% annual return', () => {
    const rate = computeXirr([
      { amount: -1000, date: '2025-01-01' },
      { amount: 1100, date: '2026-01-01' },
    ])

    expect(rate).toBeCloseTo(0.1, 4)
  })

  it('handles a loss', () => {
    const rate = computeXirr([
      { amount: -1000, date: '2025-01-01' },
      { amount: 800, date: '2026-01-01' },
    ])

    expect(rate).toBeCloseTo(-0.2, 4)
  })

  it('annualizes a partial year', () => {
    // Doubling in half a year is a 300% annualized return: 2² − 1.
    const rate = computeXirr([
      { amount: -1000, date: '2026-01-01' },
      { amount: 2000, date: '2026-07-02' },
    ])

    expect(rate).toBeCloseTo(3, 1)
  })

  it('solves a multi-deposit schedule', () => {
    // Three ¥1,000 deposits growing to ¥3,300 — the return is positive but
    // below 10% because the later money had less time to compound.
    const rate = computeXirr([
      { amount: -1000, date: '2024-01-01' },
      { amount: -1000, date: '2025-01-01' },
      { amount: -1000, date: '2026-01-01' },
      { amount: 3300, date: '2026-06-30' },
    ])

    expect(rate).not.toBeNull()
    expect(rate as number).toBeGreaterThan(0)
    expect(rate as number).toBeLessThan(0.1)
  })

  it('returns zero when nothing was gained', () => {
    const rate = computeXirr([
      { amount: -1000, date: '2025-01-01' },
      { amount: 1000, date: '2026-01-01' },
    ])

    expect(rate).toBeCloseTo(0, 6)
  })

  /**
   * Showing a wrong return is worse than showing none, so every unsolvable
   * shape has to come back null rather than a plausible-looking number.
   */
  describe('returns null rather than a wrong number', () => {
    it('when every flow has the same sign', () => {
      expect(
        computeXirr([
          { amount: -1000, date: '2025-01-01' },
          { amount: -500, date: '2026-01-01' },
        ]),
      ).toBeNull()
    })

    it('when there is only one flow', () => {
      expect(computeXirr([{ amount: -1000, date: '2025-01-01' }])).toBeNull()
    })

    it('when there are no flows', () => {
      expect(computeXirr([])).toBeNull()
    })

    it('when the loss is total', () => {
      // A -100% return is the boundary where the discount factor is undefined.
      const rate = computeXirr([
        { amount: -1000, date: '2025-01-01' },
        { amount: 0.0001, date: '2026-01-01' },
      ])

      expect(rate === null || rate < -0.99).toBe(true)
    })
  })

  it('converges on same-day flows without dividing by zero', () => {
    const rate = computeXirr([
      { amount: -1000, date: '2025-01-01' },
      { amount: -1000, date: '2025-01-01' },
      { amount: 2200, date: '2026-01-01' },
    ])

    expect(rate).toBeCloseTo(0.1, 4)
  })
})

describe('computeTwr', () => {
  it('ignores a deposit when measuring performance', () => {
    // Start at 100, deposit 100 on day two, end at 200: nothing was earned.
    const rate = computeTwr(
      [
        { date: '2025-01-01', total: 100 },
        { date: '2026-01-01', total: 200 },
      ],
      new Map([['2026-01-01', 100]]),
    )

    expect(rate).toBeCloseTo(0, 6)
  })

  it('reports growth when there are no flows', () => {
    const rate = computeTwr(
      [
        { date: '2025-01-01', total: 100 },
        { date: '2026-01-01', total: 110 },
      ],
      new Map(),
    )

    expect(rate).toBeCloseTo(0.1, 3)
  })

  it('returns null when the series is too short', () => {
    expect(computeTwr([{ date: '2025-01-01', total: 100 }], new Map())).toBeNull()
  })
})
