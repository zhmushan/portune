import type { CopyStatus } from '../types'
import {
  copyPreviewClass,
  eyebrowClass,
  panelClass,
  panelHeaderClass,
  primaryButtonClass,
  sectionBodyClass,
  sectionTitleClass,
} from '../../../lib/ui'

type CopyPortfolioButtonProps = {
  copyText: string
  disabled: boolean
  onCopy: () => void
  status: CopyStatus
}

function getButtonLabel(status: CopyStatus) {
  if (status === 'success') {
    return '已复制'
  }

  if (status === 'error') {
    return '复制失败'
  }

  return '复制代号 + 占比'
}

export function CopyPortfolioButton({
  copyText,
  disabled,
  onCopy,
  status,
}: CopyPortfolioButtonProps) {
  return (
    <section className={panelClass}>
      <div className={panelHeaderClass}>
        <div>
          <p className={eyebrowClass}>Export</p>
          <h2 className={sectionTitleClass}>复制仓位数据</h2>
        </div>
        <button
          className={primaryButtonClass}
          disabled={disabled}
          onClick={onCopy}
          type="button"
        >
          {getButtonLabel(status)}
        </button>
      </div>

      <p className={sectionBodyClass}>
        每行格式为 <code>SYMBOL, 12.34%</code>，可直接贴到消息或表格里。
      </p>

      <textarea
        className={copyPreviewClass}
        placeholder="计算完成后，这里会生成可复制的持仓占比文本。"
        readOnly
        value={copyText}
      />

      {status === 'error' ? (
        <p className="mt-3 text-danger">
          剪贴板写入失败，请手动复制上面的文本。
        </p>
      ) : null}

      {status === 'success' ? (
        <p className="mt-3 text-brand">已复制到剪贴板。</p>
      ) : null}
    </section>
  )
}
