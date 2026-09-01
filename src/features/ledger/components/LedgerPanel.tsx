import { useCallback, useEffect, useState } from 'react'

import { EntryForm } from './EntryForm'
import { EntryTable } from './EntryTable'
import type { Account, Instrument, LedgerEntry, LedgerEntryInput } from '../types'
import {
  createLedgerEntry,
  fetchLedger,
  removeLedgerEntry,
  saveLedgerEntry,
} from '../../../api/ledger'
import { ApiError } from '../../../api/http'
import {
  eyebrowClass,
  panelClass,
  panelHeaderClass,
  sectionBodyClass,
  sectionTitleClass,
  stackClass,
} from '../../../lib/ui'

type Notice = {
  text: string
  tone: 'error' | 'info' | 'success'
}

type LedgerPanelProps = {
  /** Called after any change lands, so the net worth curve can recompute. */
  onChanged: () => void
}

const noticeToneClass: Record<Notice['tone'], string> = {
  error: 'bg-rose-500/10 text-rose-700',
  info: 'bg-brand/10 text-brand-strong',
  success: 'bg-emerald-500/10 text-emerald-700',
}

export function LedgerPanel({ onChanged }: LedgerPanelProps) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editing, setEditing] = useState<LedgerEntry | null>(null)
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)

    try {
      const data = await fetchLedger()

      setAccounts(data.accounts)
      setEntries(data.entries)
      setInstruments(data.instruments)
      setNotice(null)
    } catch (error) {
      setNotice({
        text:
          error instanceof Error ? error.message : '加载流水失败。',
        tone: 'error',
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * A 409 means the data repository moved under us — the server already retried
   * once on fresh state. Reload so the user sees the current truth instead of
   * editing a stale view; their form contents are left untouched.
   */
  function reportError(error: unknown, fallback: string) {
    if (error instanceof ApiError && error.code === 'CONFLICT') {
      setNotice({
        text: '数据仓在此期间被改动，已重新加载。请确认后重试。',
        tone: 'error',
      })
      void load()
      return
    }

    setNotice({
      text: error instanceof Error ? error.message : fallback,
      tone: 'error',
    })
  }

  async function handleSubmit(input: LedgerEntryInput) {
    setIsSaving(true)

    try {
      if (editing) {
        const updated = await saveLedgerEntry(editing.id, input)

        setEntries((previous) =>
          previous.map((entry) => (entry.id === updated.id ? updated : entry)),
        )
        setEditing(null)
        setNotice({ text: '已保存修改。', tone: 'success' })
      } else {
        const created = await createLedgerEntry(input)

        setEntries((previous) => [...previous, created])
        setNotice({ text: '已添加记录。', tone: 'success' })
      }

      onChanged()
    } catch (error) {
      reportError(error, '保存失败。')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(entry: LedgerEntry) {
    if (
      !globalThis.confirm(
        `删除 ${entry.date} 的这笔记录？此操作会在数据仓留下一次提交，可从 git 历史恢复。`,
      )
    ) {
      return
    }

    setBusyId(entry.id)

    try {
      await removeLedgerEntry(entry.id)
      setEntries((previous) => previous.filter((item) => item.id !== entry.id))

      if (editing?.id === entry.id) {
        setEditing(null)
      }

      setNotice({ text: '已删除。', tone: 'success' })
      onChanged()
    } catch (error) {
      reportError(error, '删除失败。')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className={panelClass}>
      <header className={panelHeaderClass}>
        <div>
          <p className={eyebrowClass}>Ledger</p>
          <h2 className={sectionTitleClass}>交易流水</h2>
          <p className={sectionBodyClass}>
            每次改动都会提交到私有数据仓，可在 git 历史里回溯。
            {instruments.length > 0
              ? ` 已登记 ${instruments.length} 个标的。`
              : ''}
          </p>
        </div>
      </header>

      {notice ? (
        <p
          className={`mt-4 rounded-[18px] px-[18px] py-4 ${noticeToneClass[notice.tone]}`}
        >
          {notice.text}
        </p>
      ) : null}

      <div className={`${stackClass} mt-6`}>
        <EntryForm
          accounts={accounts}
          editing={editing}
          isSaving={isSaving}
          onCancel={() => setEditing(null)}
          onSubmit={handleSubmit}
        />

        {isLoading ? (
          <p className="m-0 py-8 text-center leading-7 text-muted">加载中…</p>
        ) : (
          <EntryTable
            busyId={busyId}
            entries={entries}
            onDelete={handleDelete}
            onEdit={setEditing}
          />
        )}
      </div>
    </section>
  )
}
