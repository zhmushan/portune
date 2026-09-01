import { useEffect, useState } from 'react'

import {
  ENTRY_TYPE_LABELS,
  LEDGER_ENTRY_TYPES,
  isTradeType,
} from '../types'
import type { Account, LedgerEntry, LedgerEntryInput, LedgerEntryType } from '../types'
import {
  fieldClass,
  fieldLabelClass,
  ghostButtonClass,
  inputClass,
  primaryButtonClass,
  selectClass,
} from '../../../lib/ui'

type EntryFormProps = {
  accounts: Account[]
  editing: LedgerEntry | null
  isSaving: boolean
  onCancel: () => void
  onSubmit: (entry: LedgerEntryInput) => void
}

type FormState = {
  account: string
  accountTo: string
  amount: string
  currency: string
  date: string
  note: string
  price: string
  qty: string
  symbol: string
  type: LedgerEntryType
}

function todayInLocalTime() {
  const now = new Date()
  const offsetMs = now.getTimezoneOffset() * 60 * 1000

  // toISOString() is UTC; subtracting the offset keeps the date on the user's
  // own calendar day rather than jumping when they are east of Greenwich.
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10)
}

function createEmptyState(): FormState {
  return {
    account: '',
    accountTo: '',
    amount: '',
    currency: 'CNY',
    date: todayInLocalTime(),
    note: '',
    price: '',
    qty: '',
    symbol: '',
    type: 'buy',
  }
}

function toFormState(entry: LedgerEntry): FormState {
  const [from, to] = entry.account.split('>')

  return {
    account: from ?? '',
    accountTo: to ?? '',
    amount: entry.amount === null ? '' : String(entry.amount),
    currency: entry.currency,
    date: entry.date,
    note: entry.note,
    price: entry.price === null ? '' : String(entry.price),
    qty: entry.qty === null ? '' : String(entry.qty),
    symbol: entry.symbol,
    type: entry.type,
  }
}

function parseOptional(value: string) {
  if (!value.trim()) {
    return null
  }

  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : null
}

export function EntryForm({
  accounts,
  editing,
  isSaving,
  onCancel,
  onSubmit,
}: EntryFormProps) {
  const [state, setState] = useState<FormState>(createEmptyState)

  useEffect(() => {
    setState(editing ? toFormState(editing) : createEmptyState())
  }, [editing])

  const isTrade = isTradeType(state.type)
  const isTransfer = state.type === 'transfer'

  function update<TKey extends keyof FormState>(key: TKey, value: FormState[TKey]) {
    setState((previous) => ({ ...previous, [key]: value }))
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    onSubmit({
      account: isTransfer
        ? `${state.account}>${state.accountTo}`
        : state.account,
      amount: isTrade ? null : parseOptional(state.amount),
      currency: state.currency.toUpperCase(),
      date: state.date,
      note: state.note,
      price: isTrade ? parseOptional(state.price) : null,
      qty: isTrade ? parseOptional(state.qty) : null,
      symbol: isTrade ? state.symbol.toUpperCase() : '',
      type: state.type,
    })
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <div className="grid gap-4 min-[720px]:grid-cols-3">
        <label className={fieldClass}>
          <span className={fieldLabelClass}>类型</span>
          <select
            className={selectClass}
            onChange={(event) =>
              update('type', event.target.value as LedgerEntryType)
            }
            value={state.type}
          >
            {LEDGER_ENTRY_TYPES.map((type) => (
              <option key={type} value={type}>
                {ENTRY_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>

        <label className={fieldClass}>
          <span className={fieldLabelClass}>日期</span>
          <input
            className={inputClass}
            onChange={(event) => update('date', event.target.value)}
            required
            type="date"
            value={state.date}
          />
        </label>

        <label className={fieldClass}>
          <span className={fieldLabelClass}>币种</span>
          <input
            className={inputClass}
            maxLength={3}
            onChange={(event) => update('currency', event.target.value)}
            placeholder="CNY"
            required
            value={state.currency}
          />
        </label>
      </div>

      <div className="grid gap-4 min-[720px]:grid-cols-3">
        <label className={fieldClass}>
          <span className={fieldLabelClass}>
            {isTransfer ? '转出账户' : '账户'}
          </span>
          <input
            className={inputClass}
            list="ledger-accounts"
            onChange={(event) => update('account', event.target.value)}
            placeholder="cmb"
            required
            value={state.account}
          />
        </label>

        {isTransfer ? (
          <label className={fieldClass}>
            <span className={fieldLabelClass}>转入账户</span>
            <input
              className={inputClass}
              list="ledger-accounts"
              onChange={(event) => update('accountTo', event.target.value)}
              placeholder="ibkr"
              required
              value={state.accountTo}
            />
          </label>
        ) : null}

        {isTrade ? (
          <label className={fieldClass}>
            <span className={fieldLabelClass}>标的</span>
            <input
              className={inputClass}
              onChange={(event) => update('symbol', event.target.value)}
              placeholder="VOO / F161128"
              required
              value={state.symbol}
            />
          </label>
        ) : null}
      </div>

      <div className="grid gap-4 min-[720px]:grid-cols-3">
        {isTrade ? (
          <>
            <label className={fieldClass}>
              <span className={fieldLabelClass}>数量</span>
              <input
                className={inputClass}
                min="0"
                onChange={(event) => update('qty', event.target.value)}
                required
                step="any"
                type="number"
                value={state.qty}
              />
            </label>
            <label className={fieldClass}>
              <span className={fieldLabelClass}>单价</span>
              <input
                className={inputClass}
                min="0"
                onChange={(event) => update('price', event.target.value)}
                required
                step="any"
                type="number"
                value={state.price}
              />
            </label>
          </>
        ) : (
          <label className={fieldClass}>
            <span className={fieldLabelClass}>
              {state.type === 'balance' ? '实际余额' : '金额'}
            </span>
            <input
              className={inputClass}
              onChange={(event) => update('amount', event.target.value)}
              required
              step="any"
              type="number"
              value={state.amount}
            />
          </label>
        )}

        <label className={fieldClass}>
          <span className={fieldLabelClass}>备注</span>
          <input
            className={inputClass}
            onChange={(event) => update('note', event.target.value)}
            value={state.note}
          />
        </label>
      </div>

      <datalist id="ledger-accounts">
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </datalist>

      <div className="flex flex-wrap gap-3">
        <button className={primaryButtonClass} disabled={isSaving} type="submit">
          {isSaving ? '保存中…' : editing ? '保存修改' : '添加记录'}
        </button>
        {editing ? (
          <button className={ghostButtonClass} onClick={onCancel} type="button">
            取消
          </button>
        ) : null}
      </div>
    </form>
  )
}
