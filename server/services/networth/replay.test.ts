import { describe, expect, it } from 'vitest'

import type { LedgerEntry } from '../ledger/types.js'
import { adjustQuantityForSplits, replayLedger } from './replay.js'
import { buildDateRange, lookupForwardFilled, sortedKeys } from './prices.js'
import type { PriceSeries } from './prices.js'

function entry(partial: Partial<LedgerEntry> & Pick<LedgerEntry, 'date' | 'type'>): LedgerEntry {
  return {
    account: 'ibkr',
    amount: null,
    currency: 'USD',
    id: Math.random().toString(36).slice(2),
    note: '',
    price: null,
    qty: null,
    symbol: '',
    ...partial,
  }
}

const NO_SERIES = new Map<string, PriceSeries>()

describe('adjustQuantityForSplits', () => {
  /**
   * Yahoo closes are split-adjusted; a hand-recorded pre-split quantity is not.
   * Without scaling, NVDA's 10:1 makes the position look like a 90% loss.
   */
  it('scales a quantity held across a split', () => {
    const splits = [{ date: '2024-06-10', ratio: 10 }]

    expect(adjustQuantityForSplits(12, '2024-05-01', splits)).toBe(120)
  })

  it('leaves a quantity bought after the split alone', () => {
    const splits = [{ date: '2024-06-10', ratio: 10 }]

    expect(adjustQuantityForSplits(12, '2024-07-01', splits)).toBe(12)
  })

  it('compounds multiple splits', () => {
    const splits = [
      { date: '2021-07-20', ratio: 4 },
      { date: '2024-06-10', ratio: 10 },
    ]

    expect(adjustQuantityForSplits(1, '2020-01-01', splits)).toBe(40)
    expect(adjustQuantityForSplits(1, '2022-01-01', splits)).toBe(10)
  })
})

describe('lookupForwardFilled', () => {
  const values = new Map([
    ['2026-01-02', 100],
    ['2026-01-05', 110],
  ])
  const dates = sortedKeys(values)

  it('returns the exact value on a known date', () => {
    expect(lookupForwardFilled(values, dates, '2026-01-05')).toBe(110)
  })

  // Weekends, holidays, and the QDII NAV lag all leave gaps.
  it('carries the last known value forward across a gap', () => {
    expect(lookupForwardFilled(values, dates, '2026-01-04')).toBe(100)
    expect(lookupForwardFilled(values, dates, '2026-03-01')).toBe(110)
  })

  it('returns null before the first observation rather than guessing', () => {
    expect(lookupForwardFilled(values, dates, '2025-12-31')).toBeNull()
  })
})

describe('replayLedger', () => {
  it('tracks positions and cash through a buy', () => {
    const dates = buildDateRange('2026-03-11', '2026-03-13')
    const { states } = replayLedger(
      [entry({ date: '2026-03-12', price: 500, qty: 20, symbol: 'VOO', type: 'buy' })],
      dates,
      NO_SERIES,
    )

    expect(states.get('2026-03-11')?.positions.size).toBe(0)
    expect(states.get('2026-03-12')?.positions.get('ibkr:VOO')).toBe(20)
    // Cash goes negative because the deposit funding it is its own entry.
    expect(states.get('2026-03-13')?.cash.get('ibkr')?.get('USD')).toBe(-10_000)
  })

  it('nets a sell back out of the position', () => {
    const dates = buildDateRange('2026-03-12', '2026-08-20')
    const { states } = replayLedger(
      [
        entry({ date: '2026-03-12', price: 500, qty: 20, symbol: 'VOO', type: 'buy' }),
        entry({ date: '2026-08-20', price: 700, qty: 5, symbol: 'VOO', type: 'sell' }),
      ],
      dates,
      NO_SERIES,
    )

    expect(states.get('2026-08-20')?.positions.get('ibkr:VOO')).toBe(15)
    expect(states.get('2026-08-20')?.cash.get('ibkr')?.get('USD')).toBe(-6500)
  })

  // A transfer moves value between accounts without changing the pool, which is
  // why it must not appear as an external cash flow.
  it('moves cash between accounts on a transfer', () => {
    const dates = buildDateRange('2026-07-08', '2026-07-08')
    const { states } = replayLedger(
      [entry({ account: 'cmb>ibkr', amount: 5000, date: '2026-07-08', type: 'transfer' })],
      dates,
      NO_SERIES,
    )

    const state = states.get('2026-07-08')

    expect(state?.cash.get('cmb')?.get('USD')).toBe(-5000)
    expect(state?.cash.get('ibkr')?.get('USD')).toBe(5000)
  })

  it('applies split adjustment when replaying a pre-split trade', () => {
    const series = new Map<string, PriceSeries>([
      [
        'NVDA',
        {
          closes: new Map(),
          currency: 'USD',
          splits: [{ date: '2024-06-10', ratio: 10 }],
          symbol: 'NVDA',
        },
      ],
    ])
    const dates = buildDateRange('2024-05-01', '2024-07-01')
    const { states } = replayLedger(
      [entry({ date: '2024-05-01', price: 900, qty: 12, symbol: 'NVDA', type: 'buy' })],
      dates,
      series,
    )

    expect(states.get('2024-07-01')?.positions.get('ibkr:NVDA')).toBe(120)
    // Cash still reflects what was actually paid, unadjusted.
    expect(states.get('2024-07-01')?.cash.get('ibkr')?.get('USD')).toBe(-10_800)
  })

  describe('balance reconciliation', () => {
    /**
     * Unlogged spending is the whole reason `balance` exists: without booking
     * the gap, derived cash drifts upward and inflates the curve and XIRR alike.
     */
    it('books the shortfall as an implied outflow', () => {
      const dates = buildDateRange('2026-05-20', '2026-08-31')
      const { impliedFlows, states } = replayLedger(
        [
          entry({ account: 'cmb', amount: 35_000, currency: 'CNY', date: '2026-05-20', type: 'income' }),
          entry({ account: 'cmb', amount: 30_000, currency: 'CNY', date: '2026-08-31', type: 'balance' }),
        ],
        dates,
        NO_SERIES,
      )

      expect(impliedFlows).toEqual([
        { account: 'cmb', amount: -5000, currency: 'CNY', date: '2026-08-31' },
      ])
      expect(states.get('2026-08-31')?.cash.get('cmb')?.get('CNY')).toBe(30_000)
    })

    it('records nothing when the derived balance already matches', () => {
      const dates = buildDateRange('2026-05-20', '2026-08-31')
      const { impliedFlows } = replayLedger(
        [
          entry({ account: 'cmb', amount: 35_000, currency: 'CNY', date: '2026-05-20', type: 'income' }),
          entry({ account: 'cmb', amount: 35_000, currency: 'CNY', date: '2026-08-31', type: 'balance' }),
        ],
        dates,
        NO_SERIES,
      )

      expect(impliedFlows).toEqual([])
    })

    it('books a surplus as an implied inflow', () => {
      const dates = buildDateRange('2026-08-31', '2026-08-31')
      const { impliedFlows } = replayLedger(
        [entry({ account: 'cmb', amount: 500, currency: 'CNY', date: '2026-08-31', type: 'balance' })],
        dates,
        NO_SERIES,
      )

      expect(impliedFlows[0]?.amount).toBe(500)
    })
  })
})
