import type { PositionDraft } from '../types'
import {
  badgeClass,
  cn,
  eyebrowClass,
  fieldClass,
  fieldLabelClass,
  ghostButtonClass,
  iconButtonClass,
  inputClass,
  panelClass,
  panelHeaderClass,
  primaryButtonClass,
  secondaryButtonClass,
  sectionBodyClass,
  sectionTitleClass,
} from '../../../lib/ui'

type PositionEditorProps = {
  drafts: PositionDraft[]
  hasValidPositions: boolean
  isDirty: boolean
  isLoading: boolean
  providerLabel: string
  onAddRow: () => void
  onAnalyze: () => void
  onClear: () => void
  onQuantityChange: (id: string, value: string) => void
  onRemoveRow: (id: string) => void
  onSymbolChange: (id: string, value: string) => void
  validPositionCount: number
}

export function PositionEditor({
  drafts,
  hasValidPositions,
  isDirty,
  isLoading,
  providerLabel,
  onAddRow,
  onAnalyze,
  onClear,
  onQuantityChange,
  onRemoveRow,
  onSymbolChange,
  validPositionCount,
}: PositionEditorProps) {
  return (
    <section className={panelClass}>
      <div className={panelHeaderClass}>
        <div>
          <p className={eyebrowClass}>Portfolio Input</p>
          <h2 className={sectionTitleClass}>录入持仓</h2>
        </div>
        <span className={badgeClass}>
          {validPositionCount} {validPositionCount === 1 ? 'holding' : 'holdings'}
        </span>
      </div>

      <p className={sectionBodyClass}>
        输入美股代号和数量，重复代号会在计算时自动合并。
      </p>

      <div className="mt-[22px] rounded-[24px] border border-brand/12 bg-[linear-gradient(180deg,rgba(255,252,247,0.96)_0%,rgba(245,250,251,0.94)_100%)] px-5 py-[18px] shadow-[0_14px_32px_rgba(24,36,41,0.08)] backdrop-blur-[10px]">
        <p className={cn(eyebrowClass, 'mb-0')}>{providerLabel}</p>
        <h3 className="mt-2 font-display text-[1.55rem] leading-[1.15] tracking-[-0.03em] text-ink">
          手动刷新行情
        </h3>
        <p className="mt-3 leading-7 text-muted">
          {!hasValidPositions
            ? '先录入至少一条有效持仓，再手动刷新行情。'
            : isDirty
              ? '输入已变更，结果不会自动更新，请手动刷新行情。'
              : '系统不会自动刷新，点击下面的按钮后才会请求最新行情。'}
        </p>

        <div className="mt-4 border-t border-ink/8 pt-4">
          <button
            className={cn(
              primaryButtonClass,
              'min-h-12 w-full justify-center whitespace-nowrap px-6',
            )}
            disabled={!hasValidPositions || isLoading}
            onClick={onAnalyze}
            type="button"
          >
            {isLoading ? '刷新中...' : '刷新行情'}
          </button>
          <p className="mt-2 text-center text-[0.8rem] leading-5 text-muted">
            仅在点击按钮时请求最新价格和 Beta。
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {drafts.map((draft, index) => (
          <div
            className="grid items-end gap-3 min-[641px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]"
            key={draft.id}
          >
            <label className={fieldClass}>
              <span className={fieldLabelClass}>代号 #{index + 1}</span>
              <input
                autoCapitalize="characters"
                className={inputClass}
                onChange={(event) => onSymbolChange(draft.id, event.target.value)}
                placeholder="AAPL"
                value={draft.symbol}
              />
            </label>

            <label className={fieldClass}>
              <span className={fieldLabelClass}>数量</span>
              <input
                className={inputClass}
                inputMode="decimal"
                onChange={(event) => onQuantityChange(draft.id, event.target.value)}
                placeholder="10"
                value={draft.quantity}
              />
            </label>

            <button
              aria-label={`Remove position ${draft.symbol || index + 1}`}
              className={iconButtonClass}
              onClick={() => onRemoveRow(draft.id)}
              type="button"
            >
              删除
            </button>
          </div>
        ))}
      </div>

      <div className="mt-[18px] flex flex-wrap gap-3">
        <button className={secondaryButtonClass} onClick={onAddRow} type="button">
          新增持仓
        </button>
        <button className={ghostButtonClass} onClick={onClear} type="button">
          清空
        </button>
      </div>
    </section>
  )
}
