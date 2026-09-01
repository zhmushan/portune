import { useCallback, useEffect, useMemo, useState } from 'react'

import { NetWorthChart } from './NetWorthChart'
import { RANGE_OPTIONS, sliceByRange, summarize } from '../types'
import type { BaseCurrency, NetWorthSeries, RangeDays } from '../types'
import { fetchNetWorthSeries } from '../../../api/networth'
import {
  badgeClass,
  cn,
  eyebrowClass,
  ghostButtonClass,
  panelClass,
  panelHeaderClass,
  secondaryButtonClass,
  sectionBodyClass,
  sectionTitleClass,
} from '../../../lib/ui'

type NetWorthPanelProps = {
  isPrivacyMode: boolean
  /** Bumped by the ledger panel so a new entry refreshes the curve. */
  refreshToken: number
}

const BASES: BaseCurrency[] = ['CNY', 'USD']

function formatMoney(value: number, base: BaseCurrency) {
  return new Intl.NumberFormat(base === 'CNY' ? 'zh-CN' : 'en-US', {
    currency: base,
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value)
}

function formatExposure(exposure: Record<string, number>) {
  const entries = Object.entries(exposure).filter(
    ([, value]) => Math.abs(value) > 1,
  )
  const total = entries.reduce((sum, [, value]) => sum + Math.abs(value), 0)

  if (total === 0) {
    return []
  }

  return entries
    .map(([currency, value]) => ({
      currency,
      share: Math.abs(value) / total,
      value,
    }))
    .toSorted((left, right) => right.share - left.share)
}

export function NetWorthPanel({
  isPrivacyMode,
  refreshToken,
}: NetWorthPanelProps) {
  const [base, setBase] = useState<BaseCurrency>('CNY')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [range, setRange] = useState<RangeDays>(365)
  const [series, setSeries] = useState<NetWorthSeries | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)

    try {
      setSeries(await fetchNetWorthSeries())
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '加载失败。')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshToken])

  const visible = useMemo(
    () => sliceByRange(series?.points ?? [], range),
    [range, series],
  )
  const stats = useMemo(() => summarize(visible, base), [base, visible])
  const exposure = useMemo(
    () => formatExposure(visible.at(-1)?.exposure ?? {}),
    [visible],
  )

  return (
    <section className={panelClass}>
      <header className={panelHeaderClass}>
        <div>
          <p className={eyebrowClass}>Net Worth</p>
          <h2 className={sectionTitleClass}>总资产曲线</h2>
          <p className={sectionBodyClass}>
            按流水推算的每日净资产，同时以人民币和美元计价。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {BASES.map((item) => (
            <button
              className={cn(
                item === base ? secondaryButtonClass : ghostButtonClass,
                'px-4 py-2',
              )}
              key={item}
              onClick={() => setBase(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <p className="mt-4 rounded-[18px] bg-rose-500/10 px-[18px] py-4 text-rose-700">
          {error}
        </p>
      ) : null}

      {isLoading && !series ? (
        <p className="m-0 py-12 text-center leading-7 text-muted">计算中…</p>
      ) : (
        <>
          {stats ? (
            <div className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <span className="font-display text-[2.2rem] tracking-[-0.03em] text-ink">
                {isPrivacyMode ? '••••••' : formatMoney(stats.end, base)}
              </span>
              <span
                className={cn(
                  'text-[0.95rem] font-semibold',
                  stats.change >= 0 ? 'text-emerald-600' : 'text-rose-600',
                )}
              >
                {isPrivacyMode
                  ? '••••'
                  : `${stats.change >= 0 ? '+' : ''}${formatMoney(stats.change, base)}`}
                {stats.changeRatio === null
                  ? ''
                  : ` (${stats.change >= 0 ? '+' : ''}${(stats.changeRatio * 100).toFixed(1)}%)`}
              </span>
              <span className="text-[0.82rem] text-muted">
                区间变化，含期间新增入金
              </span>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {RANGE_OPTIONS.map((option) => (
              <button
                className={cn(
                  option.days === range ? secondaryButtonClass : ghostButtonClass,
                  'px-4 py-2',
                )}
                key={option.label}
                onClick={() => setRange(option.days)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            <NetWorthChart
              base={base}
              isPrivacyMode={isPrivacyMode}
              points={visible}
            />
          </div>

          {exposure.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {exposure.map((item) => (
                <span className={badgeClass} key={item.currency}>
                  {item.currency} {(item.share * 100).toFixed(0)}%
                </span>
              ))}
              <span className="self-center text-[0.8rem] text-muted">
                按底层风险敞口划分，QDII 计入其投资标的的币种
              </span>
            </div>
          ) : null}

          <p className="mt-4 text-[0.8rem] leading-6 text-muted">
            基金净值披露滞后一到两个交易日，所以最近一两天的 QDII
            使用最新已披露净值。
          </p>

          {series?.warnings.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-[0.82rem] leading-6 text-muted">
              {series.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          {series?.errors.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-[0.82rem] leading-6 text-rose-700">
              {series.errors.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  )
}
