import { describe, expect, it } from 'vitest'

import type { Instrument } from '../ledger/types.js'
import type { PriceBook } from './prices.js'
import { positionKey } from './replay.js'
import type { DailyState } from './replay.js'
import { valueStates } from './valuation.js'

const USD_CNY = 7

function book(): PriceBook {
  return {
    fx: new Map([['USDCNY', new Map([['2026-01-01', USD_CNY]])]]),
    series: new Map([
      [
        'VOO',
        {
          closes: new Map([['2026-01-01', 500]]),
          currency: 'USD',
          splits: [],
          symbol: 'VOO',
        },
      ],
      [
        'F161128',
        {
          closes: new Map([['2026-01-01', 2]]),
          currency: 'CNY',
          splits: [],
          symbol: 'F161128',
        },
      ],
    ]),
  }
}

function stateWith(positions: [string, number][], cash: [string, string, number][]): DailyState {
  const cashMap = new Map<string, Map<string, number>>()

  for (const [account, currency, amount] of cash) {
    const byCurrency = cashMap.get(account) ?? new Map()

    byCurrency.set(currency, amount)
    cashMap.set(account, byCurrency)
  }

  return {
    cash: cashMap,
    date: '2026-01-01',
    positions: new Map(
      positions.map(([symbol, qty]) => [positionKey('ibkr', symbol), qty]),
    ),
  }
}

const QDII: Instrument = {
  assetClass: 'fund',
  riskCurrency: 'USD',
  source: 'eastmoney',
  sourceId: '161128',
  symbol: 'F161128',
}

const VOO: Instrument = {
  assetClass: 'equity',
  riskCurrency: 'USD',
  source: 'yahoo',
  sourceId: 'VOO',
  symbol: 'VOO',
}

const DATES = ['2026-01-01']

describe('valueStates', () => {
  it('reports the same holding in both bases', () => {
    const states = new Map([['2026-01-01', stateWith([['VOO', 10]], [])]])
    const { points } = valueStates(states, DATES, book(), new Map([['VOO', VOO]]))

    // 10 × $500 = $5,000, and at 7.0 that is ¥35,000.
    expect(points[0]?.totalUsd).toBe(5000)
    expect(points[0]?.totalCny).toBe(35_000)
  })

  it('converts cash held in a non-base currency', () => {
    const states = new Map([
      ['2026-01-01', stateWith([], [['cmb', 'CNY', 7000]])],
    ])
    const { points } = valueStates(states, DATES, book(), new Map())

    expect(points[0]?.totalCny).toBe(7000)
    expect(points[0]?.totalUsd).toBe(1000)
  })

  /**
   * The reason instruments carry a risk currency: a QDII fund is priced in CNY
   * but holds US assets. Counting it as CNY exposure inverts the answer to
   * "how much of my portfolio is dollar-denominated".
   */
  it('attributes QDII exposure to USD despite CNY pricing', () => {
    const states = new Map([
      ['2026-01-01', stateWith([['F161128', 3500]], [])],
    ])
    const { points } = valueStates(
      states,
      DATES,
      book(),
      new Map([['F161128', QDII]]),
    )

    // 3500 × ¥2 = ¥7,000 of market value, which is $1,000 of USD exposure.
    expect(points[0]?.totalCny).toBe(7000)
    expect(points[0]?.exposure.USD).toBe(1000)
    expect(points[0]?.exposure.CNY ?? 0).toBe(0)
  })

  it('warns instead of silently dropping an unpriced symbol', () => {
    const states = new Map([['2026-01-01', stateWith([['UNKNOWN', 10]], [])]])
    const { points, warnings } = valueStates(states, DATES, book(), new Map())

    expect(points[0]?.totalUsd).toBe(0)
    expect(warnings.some((w) => w.message.includes('UNKNOWN'))).toBe(true)
  })

  it('carries the last close forward on a non-trading day', () => {
    const states = new Map([
      ['2026-01-01', stateWith([['VOO', 10]], [])],
      ['2026-01-02', stateWith([['VOO', 10]], [])],
    ])
    const { points } = valueStates(
      states,
      ['2026-01-01', '2026-01-02'],
      book(),
      new Map([['VOO', VOO]]),
    )

    expect(points[1]?.totalUsd).toBe(5000)
  })

  it('inverts the pair when only the reverse rate exists', () => {
    const priceBook = book()

    priceBook.fx = new Map([['CNYUSD', new Map([['2026-01-01', 1 / USD_CNY]])]])

    const states = new Map([
      ['2026-01-01', stateWith([], [['cmb', 'CNY', 7000]])],
    ])
    const { points } = valueStates(states, DATES, priceBook, new Map())

    expect(points[0]?.totalUsd).toBeCloseTo(1000, 6)
  })
})
