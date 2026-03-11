import { PROVIDER_OPTIONS } from '../provider'
import type { ProviderSettings } from '../types'
import { getActiveProviderApiKey } from '../utils'
import {
  badgeClass,
  eyebrowClass,
  fieldClass,
  fieldLabelClass,
  helpTextClass,
  inputClass,
  panelClass,
  panelHeaderClass,
  sectionBodyClass,
  sectionTitleClass,
  selectClass,
} from '../../../lib/ui'

type ProviderSettingsPanelProps = {
  isLoading: boolean
  onApiKeyChange: (value: string) => void
  onProviderChange: (value: ProviderSettings['provider']) => void
  providerSettings: ProviderSettings
}

export function ProviderSettingsPanel({
  isLoading,
  onApiKeyChange,
  onProviderChange,
  providerSettings,
}: ProviderSettingsPanelProps) {
  const activeProvider = PROVIDER_OPTIONS.find(
    (providerOption) => providerOption.key === providerSettings.provider,
  )

  if (!activeProvider) {
    return null
  }

  return (
    <section className={panelClass}>
      <div className={panelHeaderClass}>
        <div>
          <p className={eyebrowClass}>Market Data</p>
          <h2 className={sectionTitleClass}>数据源设置</h2>
        </div>
        <span className={badgeClass}>{activeProvider.label}</span>
      </div>

      <p className={sectionBodyClass}>{activeProvider.description}</p>

      <div className="mt-[18px] grid gap-[14px]">
        <label className={fieldClass}>
          <span className={fieldLabelClass}>金融接口</span>
          <select
            className={selectClass}
            disabled={isLoading}
            onChange={(event) =>
              onProviderChange(event.target.value as ProviderSettings['provider'])
            }
            value={providerSettings.provider}
          >
            {PROVIDER_OPTIONS.map((providerOption) => (
              <option key={providerOption.key} value={providerOption.key}>
                {providerOption.label}
              </option>
            ))}
          </select>
        </label>

        {activeProvider.requiresApiKey ? (
          <label className={fieldClass}>
            <span className={fieldLabelClass}>API Key</span>
            <input
              className={inputClass}
              disabled={isLoading}
              onChange={(event) => onApiKeyChange(event.target.value)}
              placeholder={activeProvider.apiKeyPlaceholder}
              type="password"
              value={getActiveProviderApiKey(providerSettings)}
            />
          </label>
        ) : null}
      </div>

      {activeProvider.requiresApiKey ? (
        <p className={helpTextClass}>
          当前 provider 需要 API Key。留空时会尝试使用后端环境变量{' '}
          <code>{activeProvider.envVarName}</code>。
        </p>
      ) : (
        <p className={helpTextClass}>
          Yahoo 无需 API Key，但更容易触发上游限流，建议优先使用 FMP。
        </p>
      )}
    </section>
  )
}
