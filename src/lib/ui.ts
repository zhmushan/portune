export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export const panelClass =
  'rounded-[28px] border border-panel-border bg-panel p-6 shadow-panel backdrop-blur-xl max-[640px]:rounded-[22px] max-[640px]:p-[18px]'

export const panelHeaderClass =
  'flex flex-col items-start justify-between gap-4 min-[961px]:flex-row'

export const badgeClass =
  'inline-flex items-center rounded-full border border-panel-border bg-white/55 px-3.5 py-2 text-[0.84rem] font-semibold text-brand-strong backdrop-blur-xl'

export const statusPillBaseClass = cn(badgeClass, 'capitalize')

export const eyebrowClass =
  'mb-2 text-[0.74rem] font-bold uppercase tracking-[0.12em] text-brand'

export const sectionTitleClass =
  'font-display text-[1.75rem] tracking-[-0.03em] text-ink'

export const sectionBodyClass = 'm-0 leading-7 text-muted'

export const helpTextClass = 'mt-3.5 leading-7 text-muted'

export const stackClass = 'flex flex-col gap-5'

export const fieldClass = 'flex flex-col gap-2'

export const fieldLabelClass = 'text-[0.82rem] font-semibold text-muted'

export const inputClass =
  'w-full rounded-2xl border border-ink/14 bg-white/90 px-4 py-3.5 text-ink transition duration-150 ease-out focus:-translate-y-px focus:border-brand/55 focus:outline-none focus:ring-4 focus:ring-brand/12'

export const selectClass = cn(inputClass, 'appearance-none')

export const buttonBaseClass =
  'inline-flex items-center justify-center rounded-2xl px-[18px] py-[13px] text-sm transition duration-150 ease-out enabled:hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50'

export const primaryButtonClass = cn(
  buttonBaseClass,
  'bg-[linear-gradient(135deg,var(--color-brand)_0%,var(--color-brand-strong)_100%)] font-bold text-white',
)

export const secondaryButtonClass = cn(
  buttonBaseClass,
  'bg-brand/12 font-bold text-brand-strong',
)

export const ghostButtonClass = cn(
  buttonBaseClass,
  'bg-ink/6 font-medium text-ink',
)

export const iconButtonClass = cn(
  buttonBaseClass,
  'whitespace-nowrap bg-ink/6 font-medium text-ink',
)

export const noticeBaseClass = 'mt-4 rounded-[18px] px-[18px] py-4'

export const warningNoticeClass = cn(noticeBaseClass, 'bg-warning/10')

export const errorNoticeClass = cn(noticeBaseClass, 'bg-danger/10')

export const noticeTitleClass = 'mb-2.5 font-bold text-ink'

export const noticeTextClass = 'm-0 leading-7 text-muted'

export const noticeListClass = 'm-0 list-disc pl-[18px] leading-7 text-muted'

export const emptyStateClass = 'mt-5 rounded-[22px] bg-ink/4 p-6'

export const emptyStateCompactClass = 'mt-[18px] rounded-[22px] bg-ink/4 p-6'

export const emptyStateTitleClass =
  'font-display text-[1.45rem] tracking-[-0.03em] text-ink'

export const metricGridClass =
  'mt-5 grid gap-3 min-[641px]:grid-cols-2 min-[1180px]:grid-cols-3'

export const metricCardClass = 'rounded-[20px] bg-ink/4 p-[18px]'

export const metricLabelClass = 'mb-2 block text-[0.82rem] text-muted'

export const metricValueClass = 'text-[1.45rem] leading-[1.1] font-semibold text-ink'

export const metricValueSmallClass = 'text-[1.05rem] leading-[1.35] font-semibold text-ink'

export const copyPreviewClass = cn(
  inputClass,
  'mt-[18px] min-h-36 resize-y font-mono text-sm leading-6',
)

export const tableHeadCellClass =
  'border-b border-ink/8 px-3 py-3.5 text-left text-[0.8rem] uppercase tracking-[0.08em] text-muted'

export const tableBodyCellClass = 'border-b border-ink/8 px-3 py-3.5 text-ink'
