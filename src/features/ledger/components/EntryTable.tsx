import {
  ENTRY_TYPE_LABELS,
  isExternalFlow,
  isTradeType,
} from '../types'
import type { LedgerEntry } from '../types'
import { ghostButtonClass } from '../../../lib/ui'

type EntryTableProps = {
  busyId: string | null
  entries: LedgerEntry[]
  onDelete: (entry: LedgerEntry) => void
  onEdit: (entry: LedgerEntry) => void
}

const numberFormatter = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 4,
})

function describeValue(entry: LedgerEntry) {
  if (isTradeType(entry.type)) {
    if (entry.qty === null || entry.price === null) {
      return '—'
    }

    return `${numberFormatter.format(entry.qty)} × ${numberFormatter.format(entry.price)}`
  }

  return entry.amount === null ? '—' : numberFormatter.format(entry.amount)
}

export function EntryTable({
  busyId,
  entries,
  onDelete,
  onEdit,
}: EntryTableProps) {
  if (entries.length === 0) {
    return (
      <p className="m-0 py-8 text-center leading-7 text-muted">
        还没有记录。添加第一笔交易后，这里会按日期倒序展示。
      </p>
    )
  }

  // Newest first: the row you just added should be the one you can see.
  const ordered = entries.toSorted((left, right) =>
    left.date === right.date
      ? left.id < right.id
        ? 1
        : -1
      : left.date < right.date
        ? 1
        : -1,
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[0.92rem]">
        <thead>
          <tr className="border-b border-ink/10 text-[0.78rem] uppercase tracking-[0.08em] text-muted">
            <th className="py-3 pr-4 font-semibold">日期</th>
            <th className="py-3 pr-4 font-semibold">类型</th>
            <th className="py-3 pr-4 font-semibold">账户</th>
            <th className="py-3 pr-4 font-semibold">标的</th>
            <th className="py-3 pr-4 text-right font-semibold">数值</th>
            <th className="py-3 pr-4 font-semibold">币种</th>
            <th className="py-3 pr-4 font-semibold">备注</th>
            <th className="py-3 font-semibold" />
          </tr>
        </thead>
        <tbody>
          {ordered.map((entry) => (
            <tr
              className="border-b border-ink/6 align-middle last:border-b-0"
              key={entry.id}
            >
              <td className="py-3 pr-4 whitespace-nowrap tabular-nums text-ink">
                {entry.date}
              </td>
              <td className="py-3 pr-4 whitespace-nowrap">
                <span className="text-ink">{ENTRY_TYPE_LABELS[entry.type]}</span>
                {isExternalFlow(entry.type) ? (
                  <span
                    className="ml-2 rounded-full bg-brand/12 px-2 py-0.5 text-[0.7rem] font-semibold text-brand-strong"
                    title="计入 XIRR 的外部现金流"
                  >
                    外部流
                  </span>
                ) : null}
              </td>
              <td className="py-3 pr-4 whitespace-nowrap text-muted">
                {entry.account}
              </td>
              <td className="py-3 pr-4 whitespace-nowrap text-muted">
                {entry.symbol || '—'}
              </td>
              <td className="py-3 pr-4 text-right whitespace-nowrap tabular-nums text-ink">
                {describeValue(entry)}
              </td>
              <td className="py-3 pr-4 whitespace-nowrap text-muted">
                {entry.currency}
              </td>
              <td className="max-w-[16rem] truncate py-3 pr-4 text-muted" title={entry.note}>
                {entry.note || '—'}
              </td>
              <td className="py-3 whitespace-nowrap">
                <div className="flex justify-end gap-2">
                  <button
                    className={ghostButtonClass}
                    disabled={busyId === entry.id}
                    onClick={() => onEdit(entry)}
                    type="button"
                  >
                    编辑
                  </button>
                  <button
                    className={ghostButtonClass}
                    disabled={busyId === entry.id}
                    onClick={() => onDelete(entry)}
                    type="button"
                  >
                    {busyId === entry.id ? '处理中…' : '删除'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
