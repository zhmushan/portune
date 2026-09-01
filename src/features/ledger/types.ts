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

export type LedgerEntryInput = Omit<LedgerEntry, 'id'>

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

export const LEDGER_ENTRY_TYPES: LedgerEntryType[] = [
  'buy',
  'sell',
  'income',
  'expense',
  'transfer',
  'fx',
  'dividend',
  'balance',
]

/**
 * Trades carry their value as qty × price; everything else carries a single
 * amount. The form swaps fields on this, and the server enforces the same rule.
 */
export function isTradeType(type: LedgerEntryType) {
  return type === 'buy' || type === 'sell'
}

export const ENTRY_TYPE_LABELS: Record<LedgerEntryType, string> = {
  balance: '余额对账',
  buy: '买入',
  dividend: '分红',
  expense: '支出',
  fx: '换汇',
  income: '收入',
  sell: '卖出',
  transfer: '转账',
}

/**
 * Whether an entry counts as an external cash flow for XIRR. Shown in the table
 * so it stays obvious that transfers and FX legs are not new money.
 */
export function isExternalFlow(type: LedgerEntryType) {
  return type === 'income' || type === 'expense'
}
