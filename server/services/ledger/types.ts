export type LedgerEntryType =
  | 'balance'
  | 'buy'
  | 'dividend'
  | 'expense'
  | 'fx'
  | 'income'
  | 'sell'
  | 'transfer'

export type LedgerEntry = {
  account: string
  amount: number | null
  currency: string
  date: string
  id: string
  note: string
  price: number | null
  qty: number | null
  symbol: string
  type: LedgerEntryType
}

export type Account = {
  currency: string
  id: string
  kind: 'bank' | 'broker' | 'fund'
  name: string
}

export type Instrument = {
  assetClass: 'cash' | 'equity' | 'fund'
  riskCurrency: string
  source: 'eastmoney' | 'yahoo'
  sourceId: string
  symbol: string
}

/**
 * A file read from the data repository, paired with the blob sha required to
 * write it back. The sha is what makes concurrent writes safe: GitHub rejects a
 * PUT carrying a stale sha instead of silently overwriting.
 */
export type VersionedFile<TValue> = {
  sha: string
  value: TValue
}

export class LedgerConflictError extends Error {
  readonly status = 409

  constructor(message: string) {
    super(message)
    this.name = 'LedgerConflictError'
  }
}

export class LedgerStoreError extends Error {
  readonly status: number

  constructor(message: string, status = 502) {
    super(message)
    this.name = 'LedgerStoreError'
    this.status = status
  }
}
