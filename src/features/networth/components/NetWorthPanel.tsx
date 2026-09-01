import { useCallback, useEffect, useMemo, useState } from 'react'

import { BreakdownBar } from './BreakdownBar'
import { NetWorthChart } from './NetWorthChart'
import { ASSET_CLASS_LABELS, RANGE_OPTIONS, sliceByRange, summarize } from '../types'
import type { BaseCurrency, NetWorthSeries, RangeDays } from '../types'
import { fetchNetWorthSeries } from '../../../api/networth'
import {
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

function toBreakdownItems(
  values: Record<string, number>,
  labels?: Record<string, string>,
) {
  return Object.entries(values).map(([key, value]) => ({
    label: labels?.[key] ?? key,
    value,
  }))
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
    () => toBreakdownItems(visible.at(-1)?.exposure ?? {}),
    [visible],
  )
  const assetClasses = useMemo(
    () => toBreakdownItems(visible.at(-1)?.assetClasses ?? {}, ASSET_CLASS_LABELS),
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

          {series ? (
            <div className="mt-4 flex flex-wrap gap-6">
              <div>
                <p className="m-0 text-[0.76rem] font-semibold uppercase tracking-[0.1em] text-muted">
                  XIRR
                </p>
                <p
                  className="m-0 text-[1.1rem] font-semibold text-ink"
                  title="资金加权年化收益率，已剔除入金与消费的影响"
                >
                  {series.returns.xirr === null
                    ? '数据不足'
                    : `${(series.returns.xirr * 100).toFixed(1)}%`}
                </p>
              </div>
              <div>
                <p className="m-0 text-[0.76rem] font-semibold uppercase tracking-[0.1em] text-muted">
                  TWR
                </p>
                <p
                  className="m-0 text-[1.1rem] font-semibold text-ink"
                  title="时间加权年化收益率，不受入金时点影响"
                >
                  {series.returns.twr === null
                    ? '数据不足'
                    : `${(series.returns.twr * 100).toFixed(1)}%`}
                </p>
              </div>
              <p className="max-w-[26rem] self-center text-[0.78rem] leading-6 text-muted">
                XIRR 覆盖整个净资产，依赖你定期用「余额对账」记录各账户实际余额；
                长期不对账会让未记录的消费被算成收益。
              </p>
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

          {exposure.length > 0 || assetClasses.length > 0 ? (
            <div className="mt-6 grid gap-5 min-[860px]:grid-cols-2">
              <BreakdownBar
                isPrivacyMode={isPrivacyMode}
                items={exposure}
                title="币种敞口"
              />
              <BreakdownBar
                isPrivacyMode={isPrivacyMode}
                items={assetClasses}
                title="资产类别"
              />
            </div>
          ) : null}

          <p className="mt-4 text-[0.8rem] leading-6 text-muted">
            敞口按底层风险划分并统一折算为人民币，QDII 计入其投资标的的币种。
            基金净值披露滞后一到两个交易日，最近一两天的 QDII 使用最新已披露净值。
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
