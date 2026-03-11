import type { PortfolioAnalyzedPosition } from '../types'
import { formatBeta, formatCurrency, formatPercent } from '../utils'
import {
  badgeClass,
  emptyStateCompactClass,
  emptyStateTitleClass,
  eyebrowClass,
  panelClass,
  panelHeaderClass,
  sectionBodyClass,
  sectionTitleClass,
  tableBodyCellClass,
  tableHeadCellClass,
} from '../../../lib/ui'

type PositionTableProps = {
  currency: string
  isPrivacyMode: boolean
  positions: PortfolioAnalyzedPosition[]
  providerLabel: string
}

export function PositionTable({
  currency,
  isPrivacyMode,
  positions,
  providerLabel,
}: PositionTableProps) {
  return (
    <section className={panelClass}>
      <div className={panelHeaderClass}>
        <div>
          <p className={eyebrowClass}>Breakdown</p>
          <h2 className={sectionTitleClass}>持仓明细</h2>
        </div>
        <span className={badgeClass}>{positions.length} lines</span>
      </div>

      {positions.length > 0 ? (
        <div className="mt-[18px] overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr>
                <th className={tableHeadCellClass}>代号</th>
                <th className={tableHeadCellClass}>名称</th>
                {isPrivacyMode ? null : <th className={tableHeadCellClass}>数量</th>}
                <th className={tableHeadCellClass}>现价</th>
                {isPrivacyMode ? null : <th className={tableHeadCellClass}>市值</th>}
                <th className={tableHeadCellClass}>占比</th>
                <th className={tableHeadCellClass}>Beta</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((position) => (
                <tr key={position.symbol}>
                  <td className={`${tableBodyCellClass} font-bold`}>
                    {position.symbol}
                  </td>
                  <td className={tableBodyCellClass}>{position.name}</td>
                  {isPrivacyMode ? null : (
                    <td className={tableBodyCellClass}>{position.quantity}</td>
                  )}
                  <td className={tableBodyCellClass}>
                    {formatCurrency(position.price, currency)}
                  </td>
                  {isPrivacyMode ? null : (
                    <td className={tableBodyCellClass}>
                      {formatCurrency(position.marketValue, currency)}
                    </td>
                  )}
                  <td className={tableBodyCellClass}>{formatPercent(position.weight)}</td>
                  <td className={tableBodyCellClass}>{formatBeta(position.beta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={emptyStateCompactClass}>
          <h3 className={emptyStateTitleClass}>暂无可展示持仓</h3>
          <p className={`${sectionBodyClass} mt-2`}>
            {providerLabel} 成功返回价格后，这里会按仓位从高到低展示结果。
          </p>
        </div>
      )}
    </section>
  )
}
