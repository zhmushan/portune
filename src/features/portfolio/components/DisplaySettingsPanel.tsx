import {
  badgeClass,
  eyebrowClass,
  fieldLabelClass,
  helpTextClass,
  panelClass,
  panelHeaderClass,
  sectionTitleClass,
} from '../../../lib/ui'

type DisplaySettingsPanelProps = {
  onPrivacyModeChange: (value: boolean) => void
  privacyMode: boolean
}

export function DisplaySettingsPanel({
  onPrivacyModeChange,
  privacyMode,
}: DisplaySettingsPanelProps) {
  return (
    <section className={panelClass}>
      <div className={panelHeaderClass}>
        <div>
          <p className={eyebrowClass}>Display</p>
          <h2 className={sectionTitleClass}>显示设置</h2>
        </div>
        <span className={badgeClass}>{privacyMode ? 'Private' : 'Visible'}</span>
      </div>

      <div className="mt-[18px] flex flex-col items-start justify-between gap-4 rounded-[22px] bg-ink/4 p-[18px] min-[641px]:flex-row min-[641px]:items-center">
        <div>
          <p className={fieldLabelClass}>隐私模式</p>
          <p className="mt-2 leading-7 text-muted">
            开启后会隐藏总市值卡片，以及持仓明细中的数量和市值列。
          </p>
        </div>

        <label className="relative inline-flex shrink-0">
          <input
            aria-label="切换隐私模式"
            checked={privacyMode}
            className="peer sr-only"
            onChange={(event) => onPrivacyModeChange(event.target.checked)}
            type="checkbox"
          />
          <span className="inline-flex w-16 cursor-pointer rounded-full bg-ink/14 p-1 transition duration-150 ease-out peer-focus-visible:ring-4 peer-focus-visible:ring-brand/14 peer-checked:bg-[linear-gradient(135deg,var(--color-brand)_0%,var(--color-brand-strong)_100%)]">
            <span className="size-6 rounded-full bg-white shadow-[0_6px_16px_rgba(20,35,48,0.18)] transition duration-150 ease-out peer-checked:translate-x-8" />
          </span>
        </label>
      </div>

      <p className={helpTextClass}>该偏好会缓存到当前浏览器，本地刷新后仍然生效。</p>
    </section>
  )
}
