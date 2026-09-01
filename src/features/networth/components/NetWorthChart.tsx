import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { BaseCurrency, ValuationPoint } from '../types'
import { totalFor } from '../types'

type NetWorthChartProps = {
  base: BaseCurrency
  isPrivacyMode: boolean
  points: ValuationPoint[]
}

const CURRENCY_SYMBOL: Record<BaseCurrency, string> = {
  CNY: '¥',
  USD: '$',
}

function formatAxisValue(value: number, base: BaseCurrency) {
  const symbol = CURRENCY_SYMBOL[base]
  const absolute = Math.abs(value)

  if (absolute >= 1_000_000) {
    return `${symbol}${(value / 1_000_000).toFixed(1)}M`
  }

  if (absolute >= 1000) {
    return `${symbol}${Math.round(value / 1000)}k`
  }

  return `${symbol}${Math.round(value)}`
}

function formatFull(value: number, base: BaseCurrency) {
  return new Intl.NumberFormat(base === 'CNY' ? 'zh-CN' : 'en-US', {
    currency: base,
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value)
}

/**
 * Only the month-day part, and only when the label would otherwise crowd —
 * a daily series over a year has far more points than readable ticks.
 */
function formatDateTick(date: string) {
  return date.slice(5)
}

export function NetWorthChart({
  base,
  isPrivacyMode,
  points,
}: NetWorthChartProps) {
  const data = points.map((point) => ({
    date: point.date,
    total: totalFor(point, base),
  }))

  if (data.length === 0) {
    return (
      <p className="m-0 py-12 text-center leading-7 text-muted">
        还没有足够的数据。添加交易流水后，这里会显示每日净资产曲线。
      </p>
    )
  }

  const values = data.map((item) => item.total)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const padding = Math.max((max - min) * 0.08, Math.abs(max) * 0.02, 1)

  return (
    <div className="h-[320px] w-full max-[640px]:h-[240px]">
      <ResponsiveContainer height="100%" width="100%">
        <AreaChart data={data} margin={{ bottom: 4, left: 4, right: 8, top: 8 }}>
          <defs>
            <linearGradient id="networth-fill" x1="0" x2="0" y1="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--color-brand)"
                stopOpacity={0.28}
              />
              <stop
                offset="100%"
                stopColor="var(--color-brand)"
                stopOpacity={0.02}
              />
            </linearGradient>
          </defs>

          <CartesianGrid
            stroke="currentColor"
            strokeOpacity={0.08}
            vertical={false}
          />

          <XAxis
            axisLine={false}
            dataKey="date"
            minTickGap={48}
            tick={{ fill: 'currentColor', fontSize: 12, opacity: 0.55 }}
            tickFormatter={formatDateTick}
            tickLine={false}
          />

          <YAxis
            axisLine={false}
            domain={[min - padding, max + padding]}
            tick={
              isPrivacyMode
                ? false
                : { fill: 'currentColor', fontSize: 12, opacity: 0.55 }
            }
            tickFormatter={(value: number) => formatAxisValue(value, base)}
            tickLine={false}
            width={isPrivacyMode ? 8 : 64}
          />

          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) {
                return null
              }

              const item = payload[0]?.payload as { date: string; total: number }

              return (
                <div className="rounded-2xl border border-panel-border bg-panel px-4 py-3 shadow-panel backdrop-blur-xl">
                  <p className="m-0 text-[0.78rem] text-muted">{item.date}</p>
                  <p className="m-0 font-semibold text-ink">
                    {isPrivacyMode ? '••••••' : formatFull(item.total, base)}
                  </p>
                </div>
              )
            }}
          />

          <Area
            dataKey="total"
            fill="url(#networth-fill)"
            stroke="var(--color-brand)"
            strokeWidth={2}
            type="monotone"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
