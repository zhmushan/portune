import type {
  DisplaySettings,
  PortfolioWorkspace,
  PositionDraft,
  ProviderSettings,
} from './types'
import {
  createDisplaySettings,
  createProviderApiKeys,
  createPositionDraft,
  createProviderSettings,
  normalizeSymbolInput,
} from './utils'

const STORAGE_KEY = 'stock-position:workspace:v2'

type StoredWorkspace = {
  displaySettings?: DisplaySettings
  providerSettings: ProviderSettings
  rows: Array<Pick<PositionDraft, 'quantity' | 'symbol'>>
  version: 2 | 3 | 4
}

function normalizeStoredRows(
  rows: Array<Pick<PositionDraft, 'quantity' | 'symbol'>> | undefined,
) {
  const nextRows =
    rows
      ?.map((row) => ({
        quantity: typeof row.quantity === 'string' ? row.quantity.trim() : '',
        symbol: normalizeSymbolInput(row.symbol),
      }))
      .filter((row) => row.symbol || row.quantity) ?? []

  if (nextRows.length === 0) {
    return [createPositionDraft()]
  }

  return nextRows.map((row) => createPositionDraft(row))
}

function normalizeProviderSettings(
  providerSettings: ProviderSettings | undefined,
  version: StoredWorkspace['version'] | undefined,
) {
  return createProviderSettings({
    apiKeys: createProviderApiKeys(providerSettings?.apiKeys),
    provider: version === 2 ? 'yahoo' : providerSettings?.provider,
  })
}

function normalizeDisplaySettings(displaySettings: DisplaySettings | undefined) {
  return createDisplaySettings(displaySettings)
}

export function createDefaultWorkspace(): PortfolioWorkspace {
  return {
    displaySettings: createDisplaySettings(),
    drafts: [createPositionDraft()],
    providerSettings: createProviderSettings(),
  }
}

export function loadPortfolioWorkspace(): PortfolioWorkspace {
  if (typeof window === 'undefined') {
    return createDefaultWorkspace()
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY)

    if (!rawValue) {
      return createDefaultWorkspace()
    }

    const parsedValue = JSON.parse(rawValue) as StoredWorkspace

    if (
      ![2, 3, 4].includes(parsedValue.version) ||
      !Array.isArray(parsedValue.rows)
    ) {
      return createDefaultWorkspace()
    }

    return {
      displaySettings: normalizeDisplaySettings(parsedValue.displaySettings),
      drafts: normalizeStoredRows(parsedValue.rows),
      providerSettings: normalizeProviderSettings(
        parsedValue.providerSettings,
        parsedValue.version,
      ),
    }
  } catch {
    return createDefaultWorkspace()
  }
}

export function savePortfolioWorkspace(
  drafts: PositionDraft[],
  providerSettings: ProviderSettings,
  displaySettings: DisplaySettings,
) {
  if (typeof window === 'undefined') {
    return
  }

  const rows = drafts
    .map((draft) => ({
      quantity: draft.quantity.trim(),
      symbol: normalizeSymbolInput(draft.symbol),
    }))
    .filter((draft) => draft.symbol || draft.quantity)

  const payload: StoredWorkspace = {
    displaySettings: normalizeDisplaySettings(displaySettings),
    providerSettings: normalizeProviderSettings(providerSettings, 4),
    rows,
    version: 4,
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}
