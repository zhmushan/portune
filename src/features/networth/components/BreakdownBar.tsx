type BreakdownBarProps = {
  isPrivacyMode: boolean
  items: { label: string; value: number }[]
  title: string
}

const SEGMENT_COLORS = [
  'var(--color-brand-strong)',
  'var(--color-brand)',
  'color-mix(in oklab, var(--color-brand) 55%, white)',
  'color-mix(in oklab, var(--color-brand) 32%, white)',
  'color-mix(in oklab, var(--color-brand) 18%, white)',
]

/**
 * A single stacked bar plus a legend.
 *
 * Shares are computed from absolute values so a negative balance (margin, an
 * overdrawn account) still shows its magnitude rather than silently shrinking
 * the others.
 */
export function BreakdownBar({
  isPrivacyMode,
  items,
  title,
}: BreakdownBarProps) {
  const meaningful = items.filter((item) => Math.abs(item.value) > 1)
  const total = meaningful.reduce((sum, item) => sum + Math.abs(item.value), 0)

  if (total === 0) {
    return null
  }

  const segments = meaningful
    .map((item) => ({
      ...item,
      share: Math.abs(item.value) / total,
    }))
    .toSorted((left, right) => right.share - left.share)

  return (
    <div>
      <p className="m-0 mb-2 text-[0.76rem] font-semibold uppercase tracking-[0.1em] text-muted">
        {title}
      </p>

      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-ink/6">
        {segments.map((segment, index) => (
          <div
            key={segment.label}
            style={{
              background: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
              width: `${segment.share * 100}%`,
            }}
            title={`${segment.label} ${(segment.share * 100).toFixed(1)}%`}
          />
        ))}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((segment, index) => (
          <span
            className="inline-flex items-center gap-1.5 text-[0.82rem] text-muted"
            key={segment.label}
          >
            <span
              className="size-2 rounded-full"
              style={{
                background: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
              }}
            />
            {segment.label}
            <span className="font-semibold text-ink">
              {(segment.share * 100).toFixed(0)}%
            </span>
            {isPrivacyMode ? null : (
              <span className="tabular-nums">
                ¥{Math.round(segment.value).toLocaleString('zh-CN')}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}
