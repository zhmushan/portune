import { describe, expect, it } from 'vitest'

import { parseNetWorthTrend } from './eastmoney.js'

describe('parseNetWorthTrend', () => {
  /**
   * Timestamps are midnight Beijing time, i.e. 16:00:00Z the day before.
   * Reading them as UTC shifted every NAV back a day, so QDII holdings were
   * valued with a stale price. Cross-checked against the f10/lsjz endpoint.
   */
  it('reads timestamps as Beijing dates, not UTC', () => {
    const points = parseNetWorthTrend(
      'var Data_netWorthTrend = [{"x":1787846400000,"y":6.7506}];',
    )

    expect(points).toEqual([{ date: '2026-08-28', nav: 6.7506 }])
  })

  it('stops at the closing bracket when other arrays follow', () => {
    const points = parseNetWorthTrend(
      'var Data_netWorthTrend = [{"x":1481558400000,"y":1.5}];var other=[9,9,9];',
    )

    expect(points).toHaveLength(1)
  })

  // A fund's unitMoney note can contain a bracket; naive depth counting cut the
  // array there and broke NAV fetching for that fund permanently.
  it('ignores brackets inside string values', () => {
    const points = parseNetWorthTrend(
      'var Data_netWorthTrend = [{"x":1481558400000,"y":1.5,"unitMoney":"分红]备注"},{"x":1481644800000,"y":1.6,"unitMoney":"每份[0.05]元"}];',
    )

    expect(points).toEqual([
      { date: '2016-12-13', nav: 1.5 },
      { date: '2016-12-14', nav: 1.6 },
    ])
  })

  // new Date(Infinity).toISOString() throws a RangeError that would escape
  // unwrapped, because typeof Infinity is "number".
  it('drops points with a non-finite timestamp instead of throwing', () => {
    const points = parseNetWorthTrend(
      'var Data_netWorthTrend = [{"x":1e400,"y":1.5},{"x":1481558400000,"y":2}];',
    )

    expect(points).toEqual([{ date: '2016-12-13', nav: 2 }])
  })

  it('throws when the array is missing or truncated', () => {
    expect(() => parseNetWorthTrend('var other = [1,2,3];')).toThrow()
    expect(() =>
      parseNetWorthTrend('var Data_netWorthTrend = [{"x":1,"y":2}'),
    ).toThrow()
  })
})
