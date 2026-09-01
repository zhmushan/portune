import { startTransition, useEffect, useRef, useState } from 'react'

import { fetchAuthSession } from './api/auth'
import { analyzePortfolio } from './api/client'
import { ApiError } from './api/http'
import { AuthenticationPanel } from './features/auth/components/AuthenticationPanel'
import { LedgerPanel } from './features/ledger/components/LedgerPanel'
import type { AuthenticatedUser } from './features/auth/types'
import { CopyPortfolioButton } from './features/portfolio/components/CopyPortfolioButton'
import { DisplaySettingsPanel } from './features/portfolio/components/DisplaySettingsPanel'
import { PortfolioSummary } from './features/portfolio/components/PortfolioSummary'
import { ProviderSettingsPanel } from './features/portfolio/components/ProviderSettingsPanel'
import { PositionEditor } from './features/portfolio/components/PositionEditor'
import { PositionTable } from './features/portfolio/components/PositionTable'
import {
  createDefaultWorkspace,
  loadPortfolioWorkspace,
  savePortfolioWorkspace,
} from './features/portfolio/storage'
import type {
  AnalysisStatus,
  CopyStatus,
  MarketDataProvider,
  PortfolioAnalysisResponse,
  ProviderSettings,
} from './features/portfolio/types'
import {
  buildCopyText,
  buildRequestPositions,
  createPositionDraft,
  getActiveProviderApiKey,
  getProviderLabel,
  normalizeSymbolInput,
  sanitizeQuantityInput,
  serializeAnalyzeRequestSignature,
} from './features/portfolio/utils'
import { authClient } from './lib/auth-client'
import {
  badgeClass,
  cn,
  eyebrowClass,
  ghostButtonClass,
  panelClass,
  sectionBodyClass,
  sectionTitleClass,
} from './lib/ui'

type AnalysisState = {
  data: PortfolioAnalysisResponse | null
  errorMessage: string | null
  provider: MarketDataProvider | null
  status: AnalysisStatus
}

type AuthStatus = 'authenticated' | 'error' | 'loading' | 'unauthenticated'

type AuthState = {
  errorMessage: string | null
  status: AuthStatus
  user: AuthenticatedUser | null
}

type StickyColumn = 'left' | 'right' | null
type StickyMode = 'dynamic' | 'none' | 'static'

const initialAnalysisState: AnalysisState = {
  data: null,
  errorMessage: null,
  provider: null,
  status: 'idle',
}

const initialAuthState: AuthState = {
  errorMessage: null,
  status: 'loading',
  user: null,
}

const heroChipLabels = [
  'Google Login',
  'Local Cache',
  'FMP',
  'Twelve Data',
  'Yahoo Default',
  'Copy Ready',
]

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Failed to analyze the portfolio.'
}

function getAuthErrorMessage(code: string | null | undefined) {
  switch (code) {
    case 'access_denied':
    case 'AUTH_FORBIDDEN':
      return '当前 Google 账号不在允许访问的邮箱列表中。'
    case 'login_failed':
      return 'Google 登录未完成，请重新尝试。'
    case 'session_expired':
    case 'AUTH_REQUIRED':
      return '登录状态已失效，请重新登录。'
    case 'AUTH_NOT_CONFIGURED':
      return '服务端尚未完成 Google 登录配置。'
    default:
      return null
  }
}

function consumeAuthErrorFromUrl() {
  if (typeof window === 'undefined') {
    return null
  }

  const currentUrl = new URL(window.location.href)
  const authError = currentUrl.searchParams.get('authError')

  if (!authError) {
    return null
  }

  currentUrl.searchParams.delete('authError')
  const nextPath =
    currentUrl.pathname +
    (currentUrl.search ? currentUrl.search : '') +
    currentUrl.hash

  window.history.replaceState({}, '', nextPath)

  return authError
}

export default function App() {
  const [workspace, setWorkspace] = useState(createDefaultWorkspace)
  const [analysisState, setAnalysisState] =
    useState<AnalysisState>(initialAnalysisState)
  const [authState, setAuthState] = useState<AuthState>(initialAuthState)
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isWorkspaceLoaded, setIsWorkspaceLoaded] = useState(false)
  const [lastAnalyzedSignature, setLastAnalyzedSignature] = useState<string | null>(
    null,
  )
  const [stickyColumn, setStickyColumn] = useState<StickyColumn>(null)
  const [stickyMode, setStickyMode] = useState<StickyMode>('none')
  const copyResetTimerRef = useRef<number | null>(null)
  const stickyOffsetRef = useRef(0)
  const lastScrollYRef = useRef(0)
  const stickyMetricsRef = useRef<{
    containerTop: number
    maxOffset: number
    mode: StickyMode
    shortColumn: StickyColumn
    shortHeight: number
  }>({
    containerTop: 0,
    maxOffset: 0,
    mode: 'none',
    shortColumn: null,
    shortHeight: 0,
  })
  const leftColumnRef = useRef<HTMLDivElement | null>(null)
  const rightColumnRef = useRef<HTMLDivElement | null>(null)
  const leftColumnContentRef = useRef<HTMLDivElement | null>(null)
  const rightColumnContentRef = useRef<HTMLDivElement | null>(null)

  const drafts = workspace.drafts
  const displaySettings = workspace.displaySettings
  const providerSettings = workspace.providerSettings
  const requestPositions = buildRequestPositions(drafts)
  const requestSignature = serializeAnalyzeRequestSignature(
    requestPositions,
    providerSettings,
  )
  const hasValidPositions = requestPositions.length > 0
  const selectedProviderLabel = getProviderLabel(providerSettings.provider)
  const isPrivacyMode = displaySettings.privacyMode
  const isDirty =
    analysisState.data !== null &&
    lastAnalyzedSignature !== null &&
    lastAnalyzedSignature !== requestSignature
  const copyText = analysisState.data
    ? buildCopyText(analysisState.data.positions)
    : ''
  const analysisProviderLabel = analysisState.provider
    ? getProviderLabel(analysisState.provider)
    : null
  const isAuthenticated = authState.status === 'authenticated'
  const isWorkspaceReady = isAuthenticated && isWorkspaceLoaded

  function resetWorkspaceView() {
    setAnalysisState(initialAnalysisState)
    setCopyStatus('idle')
    setLastAnalyzedSignature(null)
  }

  function moveToSignedOutState(errorCode?: string | null) {
    resetWorkspaceView()
    startTransition(() => {
      setAuthState({
        errorMessage: getAuthErrorMessage(errorCode),
        status: 'unauthenticated',
        user: null,
      })
      setIsWorkspaceLoaded(false)
      setWorkspace(createDefaultWorkspace())
    })
  }

  useEffect(() => {
    let isCancelled = false

    async function loadSession() {
      const authErrorCode = consumeAuthErrorFromUrl()

      try {
        const session = await fetchAuthSession()

        if (isCancelled) {
          return
        }

        startTransition(() => {
          if (session.authenticated) {
            setAuthState({
              errorMessage: null,
              status: 'authenticated',
              user: session.user,
            })
            return
          }

          setAuthState({
            errorMessage:
              getAuthErrorMessage(session.code) ??
              getAuthErrorMessage(authErrorCode),
            status: 'unauthenticated',
            user: null,
          })
        })
      } catch (error) {
        if (isCancelled) {
          return
        }

        startTransition(() => {
          setAuthState({
            errorMessage: getErrorMessage(error),
            status: 'error',
            user: null,
          })
        })
      }
    }

    void loadSession()

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      setAnalysisState(initialAnalysisState)
      setCopyStatus('idle')
      setLastAnalyzedSignature(null)
      setIsWorkspaceLoaded(false)
      setWorkspace(createDefaultWorkspace())
      return
    }

    setAnalysisState(initialAnalysisState)
    setCopyStatus('idle')
    setLastAnalyzedSignature(null)
    startTransition(() => {
      setWorkspace(loadPortfolioWorkspace())
      setIsWorkspaceLoaded(true)
    })
  }, [isAuthenticated])

  useEffect(() => {
    if (!isWorkspaceReady) {
      return
    }

    savePortfolioWorkspace(drafts, providerSettings, displaySettings)
  }, [displaySettings, drafts, isWorkspaceReady, providerSettings])

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isWorkspaceReady) {
      setStickyColumn(null)
      setStickyMode('none')
      stickyOffsetRef.current = 0
      stickyMetricsRef.current = {
        containerTop: 0,
        maxOffset: 0,
        mode: 'none',
        shortColumn: null,
        shortHeight: 0,
      }
      leftColumnContentRef.current?.style.removeProperty('top')
      rightColumnContentRef.current?.style.removeProperty('top')
      return
    }

    const leftColumn = leftColumnRef.current
    const rightColumn = rightColumnRef.current
    const leftColumnContent = leftColumnContentRef.current
    const rightColumnContent = rightColumnContentRef.current

    if (!leftColumn || !rightColumn || !leftColumnContent || !rightColumnContent) {
      return
    }

    const gap = 16
    let animationFrameId = 0

    const clampOffset = (value: number, maxOffset: number) =>
      Math.max(0, Math.min(maxOffset, value))

    const applyDynamicOffset = (
      nextStickyColumn: StickyColumn,
      nextStickyMode: StickyMode,
      nextOffset: number,
    ) => {
      if (nextStickyMode === 'dynamic' && nextStickyColumn === 'left') {
        leftColumnContent.style.top = `${Math.round(nextOffset)}px`
      } else {
        leftColumnContent.style.removeProperty('top')
      }

      if (nextStickyMode === 'dynamic' && nextStickyColumn === 'right') {
        rightColumnContent.style.top = `${Math.round(nextOffset)}px`
      } else {
        rightColumnContent.style.removeProperty('top')
      }
    }

    const scheduleMeasure = (callback: () => void) => {
      if (animationFrameId !== 0) {
        return
      }

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = 0
        callback()
      })
    }

    const updateDynamicOffset = (reason: 'measure' | 'scroll') => {
      const {
        containerTop,
        maxOffset,
        mode: currentStickyMode,
        shortColumn,
        shortHeight,
      } = stickyMetricsRef.current

      if (
        currentStickyMode !== 'dynamic' ||
        shortColumn === null ||
        maxOffset <= 0 ||
        shortHeight <= 0 ||
        window.innerWidth <= 960
      ) {
        stickyOffsetRef.current = 0
        applyDynamicOffset(null, 'none', 0)
        lastScrollYRef.current = window.scrollY
        return
      }

      const currentScrollY = window.scrollY
      const topAnchoredOffset = currentScrollY + gap - containerTop
      const bottomAnchoredOffset =
        currentScrollY + window.innerHeight - gap - shortHeight - containerTop
      let nextOffset = stickyOffsetRef.current

      if (reason === 'measure') {
        const minReachableOffset = Math.max(
          0,
          Math.min(topAnchoredOffset, bottomAnchoredOffset),
        )
        const maxReachableOffset = Math.min(
          maxOffset,
          Math.max(topAnchoredOffset, bottomAnchoredOffset),
        )

        if (minReachableOffset <= maxReachableOffset) {
          nextOffset = Math.min(
            Math.max(nextOffset, minReachableOffset),
            maxReachableOffset,
          )
        }
      } else if (currentScrollY > lastScrollYRef.current) {
        nextOffset = Math.max(nextOffset, bottomAnchoredOffset)
      } else if (currentScrollY < lastScrollYRef.current) {
        nextOffset = Math.min(nextOffset, topAnchoredOffset)
      }

      nextOffset = clampOffset(nextOffset, maxOffset)
      stickyOffsetRef.current = nextOffset
      applyDynamicOffset(shortColumn, currentStickyMode, nextOffset)
      lastScrollYRef.current = currentScrollY
    }

    const measureColumns = () => {
      const previousStickyColumn = stickyMetricsRef.current.shortColumn
      const nextLeftHeight = Math.round(leftColumnContent.getBoundingClientRect().height)
      const nextRightHeight = Math.round(rightColumnContent.getBoundingClientRect().height)
      const nextCandidateColumn =
        window.innerWidth <= 960 ||
        nextLeftHeight === 0 ||
        nextRightHeight === 0 ||
        nextLeftHeight === nextRightHeight
          ? null
          : nextLeftHeight < nextRightHeight
            ? 'left'
            : 'right'
      const nextShortHeight =
        nextCandidateColumn === 'left'
          ? nextLeftHeight
          : nextCandidateColumn === 'right'
            ? nextRightHeight
            : 0
      const nextStickyMode: StickyMode =
        nextCandidateColumn === null
          ? 'none'
          : nextShortHeight + gap * 2 <= window.innerHeight
            ? 'static'
            : 'dynamic'
      const activeColumn = nextCandidateColumn === 'left' ? leftColumn : rightColumn
      const nextContainerTop =
        nextCandidateColumn === null
          ? 0
          : Math.round(window.scrollY + activeColumn.getBoundingClientRect().top)
      const nextMaxOffset =
        nextStickyMode === 'dynamic'
          ? Math.max(0, Math.abs(nextLeftHeight - nextRightHeight))
          : 0

      stickyMetricsRef.current = {
        containerTop: nextContainerTop,
        maxOffset: nextMaxOffset,
        mode: nextStickyMode,
        shortColumn: nextCandidateColumn,
        shortHeight: nextShortHeight,
      }
      stickyOffsetRef.current =
        previousStickyColumn === nextCandidateColumn && nextStickyMode === 'dynamic'
          ? clampOffset(stickyOffsetRef.current, nextMaxOffset)
          : 0
      setStickyColumn((currentStickyColumn) =>
        currentStickyColumn === nextCandidateColumn
          ? currentStickyColumn
          : nextCandidateColumn,
      )
      setStickyMode((currentStickyMode) =>
        currentStickyMode === nextStickyMode
          ? currentStickyMode
          : nextStickyMode,
      )
      updateDynamicOffset('measure')
    }

    measureColumns()

    const resizeObserver = new ResizeObserver(() => {
      scheduleMeasure(measureColumns)
    })
    const handleResize = () => {
      scheduleMeasure(measureColumns)
    }
    const handleScroll = () => {
      scheduleMeasure(() => updateDynamicOffset('scroll'))
    }

    lastScrollYRef.current = window.scrollY
    resizeObserver.observe(leftColumn)
    resizeObserver.observe(rightColumn)
    resizeObserver.observe(leftColumnContent)
    resizeObserver.observe(rightColumnContent)
    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleScroll, {
      passive: true,
    })

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleScroll)
      leftColumnContent.style.removeProperty('top')
      rightColumnContent.style.removeProperty('top')

      if (animationFrameId !== 0) {
        window.cancelAnimationFrame(animationFrameId)
      }
    }
  }, [isWorkspaceReady])

  function scheduleCopyStatusReset(nextStatus: CopyStatus) {
    setCopyStatus(nextStatus)

    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current)
    }

    copyResetTimerRef.current = window.setTimeout(() => {
      setCopyStatus('idle')
    }, 2_000)
  }

  async function runAnalysis(
    positions = requestPositions,
    nextProviderSettings = providerSettings,
    nextRequestSignature = requestSignature,
  ) {
    if (!isWorkspaceReady) {
      return
    }

    if (positions.length === 0) {
      setAnalysisState((currentState) => ({
        data: currentState.data,
        errorMessage: '请输入至少一条有效持仓。',
        provider: currentState.provider,
        status: 'error',
      }))
      return
    }

    setAnalysisState((currentState) => ({
      data: currentState.data,
      errorMessage: null,
      provider: currentState.provider,
      status: 'loading',
    }))

    try {
      const trimmedApiKey = getActiveProviderApiKey(nextProviderSettings)
      const nextAnalysis = await analyzePortfolio({
        positions,
        provider: nextProviderSettings.provider,
        providerConfig: trimmedApiKey
          ? {
              apiKey: trimmedApiKey,
            }
          : undefined,
      })

      setAnalysisState({
        data: nextAnalysis,
        errorMessage: null,
        provider: nextProviderSettings.provider,
        status: 'success',
      })
      setLastAnalyzedSignature(nextRequestSignature)
    } catch (error) {
      if (error instanceof ApiError) {
        if (
          error.code === 'AUTH_FORBIDDEN' ||
          error.code === 'AUTH_REQUIRED' ||
          error.code === 'AUTH_NOT_CONFIGURED'
        ) {
          moveToSignedOutState(error.code)
          return
        }
      }

      setAnalysisState((currentState) => ({
        data: currentState.data,
        errorMessage: getErrorMessage(error),
        provider: currentState.provider,
        status: 'error',
      }))
    }
  }

  function handleSymbolChange(id: string, value: string) {
    setWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      drafts: currentWorkspace.drafts.map((draft) =>
        draft.id === id
          ? {
              ...draft,
              symbol: normalizeSymbolInput(value),
            }
          : draft,
      ),
    }))
  }

  function handleQuantityChange(id: string, value: string) {
    setWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      drafts: currentWorkspace.drafts.map((draft) =>
        draft.id === id
          ? {
              ...draft,
              quantity: sanitizeQuantityInput(value),
            }
          : draft,
      ),
    }))
  }

  function handleAddRow() {
    setWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      drafts: [...currentWorkspace.drafts, createPositionDraft()],
    }))
  }

  function handleRemoveRow(id: string) {
    setWorkspace((currentWorkspace) => {
      const nextDrafts = currentWorkspace.drafts.filter((draft) => draft.id !== id)

      return {
        ...currentWorkspace,
        drafts: nextDrafts.length > 0 ? nextDrafts : [createPositionDraft()],
      }
    })
  }

  function handleProviderChange(provider: ProviderSettings['provider']) {
    setWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      providerSettings: {
        ...currentWorkspace.providerSettings,
        provider,
      },
    }))
  }

  function handlePrivacyModeChange(privacyMode: boolean) {
    setWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      displaySettings: {
        ...currentWorkspace.displaySettings,
        privacyMode,
      },
    }))
  }

  function handleApiKeyChange(value: string) {
    setWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      providerSettings: {
        ...currentWorkspace.providerSettings,
        apiKeys: {
          ...currentWorkspace.providerSettings.apiKeys,
          [currentWorkspace.providerSettings.provider]: value.trim(),
        },
      },
    }))
  }

  function handleClear() {
    setWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      drafts: [createPositionDraft()],
    }))
    setAnalysisState(initialAnalysisState)
    setLastAnalyzedSignature(null)
    setCopyStatus('idle')
  }

  async function handleCopy() {
    if (!copyText) {
      return
    }

    try {
      await navigator.clipboard.writeText(copyText)
      scheduleCopyStatusReset('success')
    } catch {
      scheduleCopyStatusReset('error')
    }
  }

  async function handleLogin() {
    setIsSigningIn(true)

    try {
      await authClient.signIn.social({
        callbackURL: '/',
        errorCallbackURL: '/?authError=login_failed',
        provider: 'google',
      })
    } catch (error) {
      setIsSigningIn(false)
      setAuthState((currentState) => ({
        ...currentState,
        errorMessage: getErrorMessage(error),
        status: 'unauthenticated',
      }))
    }
  }

  async function handleLogout() {
    setIsLoggingOut(true)

    try {
      await authClient.signOut()
    } finally {
      setIsLoggingOut(false)
      moveToSignedOutState(null)
    }
  }

  return (
    <div className="mx-auto w-[min(1280px,calc(100vw-32px))] pb-14 pt-10 max-[960px]:w-[min(100vw-24px,960px)] max-[960px]:pt-7 max-[640px]:w-[min(100vw-16px,640px)]">
      <header className="flex items-start justify-between gap-6 px-1 pb-7 max-[960px]:flex-col">
        <div>
          <p className={cn(eyebrowClass, 'text-warning')}>US Equity Position Desk</p>
          <h1 className="m-0 max-w-[9ch] font-display text-[clamp(2.5rem,5vw,4.8rem)] leading-[0.92] tracking-[-0.03em] text-ink max-[640px]:max-w-[11ch]">
            Portune
          </h1>
          <p className="m-0 mt-4 max-w-[620px] text-[1.02rem] leading-7 text-muted">
            Portune 使用 Google 白名单登录后录入代号和数量，按需切换 FMP、Twelve Data
            或 Yahoo，计算持仓占比与组合 beta，并支持一键复制“代号 + 占比”文本。首次使用时，点击登录按钮并选择白名单里的 Google 账号即可。
          </p>
        </div>

        <div className="flex flex-col items-end gap-4 max-[960px]:items-stretch">
          <div className="flex flex-wrap justify-end gap-2.5 max-[960px]:justify-start">
            {heroChipLabels.map((label) => (
              <span className={badgeClass} key={label}>
                {label}
              </span>
            ))}
          </div>

          <div className="flex w-full max-w-[360px] flex-col gap-2.5 rounded-[24px] border border-panel-border bg-white/62 p-[18px_20px] shadow-panel backdrop-blur-xl">
            <p className={eyebrowClass}>Access</p>
            {isAuthenticated ? (
              <>
                <strong className="text-[1.05rem] leading-6">
                  {authState.user?.email}
                </strong>
                <button
                  className={ghostButtonClass}
                  disabled={isLoggingOut}
                  onClick={() => void handleLogout()}
                  type="button"
                >
                  {isLoggingOut ? '退出中...' : '退出登录'}
                </button>
              </>
            ) : (
              <>
                <strong className="text-[1.05rem] leading-6">Google Allowlist</strong>
                <span className="leading-6 text-muted">
                  点击登录后，使用白名单里的 Google 账号完成授权。
                </span>
              </>
            )}
          </div>
        </div>
      </header>

      {authState.status === 'loading' || (isAuthenticated && !isWorkspaceLoaded) ? (
        <main className="flex justify-center">
          <section className={cn(panelClass, 'w-full max-w-[680px]')}>
            <p className={eyebrowClass}>Authentication</p>
            <h2 className={sectionTitleClass}>正在验证登录状态</h2>
            <p className={cn(sectionBodyClass, 'mt-3.5')}>
              首次打开页面或刚完成 Google 授权时，会短暂检查当前 session，然后自动进入对应状态。
            </p>
          </section>
        </main>
      ) : null}

      {!isAuthenticated &&
      authState.status !== 'loading' &&
      !(isAuthenticated && !isWorkspaceLoaded) ? (
        <main className="flex justify-center">
          <AuthenticationPanel
            errorMessage={authState.errorMessage}
            isLoginDisabled={isSigningIn || isLoggingOut}
            isLoginPending={isSigningIn}
            onLogin={() => void handleLogin()}
          />
        </main>
      ) : null}

      {isWorkspaceReady ? (
        <main className="grid gap-5 [grid-template-columns:minmax(300px,360px)_minmax(0,1fr)] max-[960px]:grid-cols-1">
          <div className="relative min-w-0 min-[961px]:self-stretch" ref={leftColumnRef}>
            <div
              className={cn(
                'min-w-0',
                stickyColumn === 'left' &&
                  stickyMode === 'static' &&
                  'min-[961px]:sticky min-[961px]:top-4',
                stickyColumn === 'left' &&
                  stickyMode === 'dynamic' &&
                  'min-[961px]:absolute min-[961px]:inset-x-0',
              )}
              ref={leftColumnContentRef}
            >
              <div className="flex flex-col gap-5">
                <ProviderSettingsPanel
                  isLoading={analysisState.status === 'loading'}
                  onApiKeyChange={handleApiKeyChange}
                  onProviderChange={handleProviderChange}
                  providerSettings={providerSettings}
                />

                <DisplaySettingsPanel
                  onPrivacyModeChange={handlePrivacyModeChange}
                  privacyMode={isPrivacyMode}
                />

                <PositionEditor
                  drafts={drafts}
                  hasValidPositions={hasValidPositions}
                  isDirty={isDirty}
                  isLoading={analysisState.status === 'loading'}
                  providerLabel={selectedProviderLabel}
                  onAddRow={handleAddRow}
                  onAnalyze={() => void runAnalysis()}
                  onClear={handleClear}
                  onQuantityChange={handleQuantityChange}
                  onRemoveRow={handleRemoveRow}
                  onSymbolChange={handleSymbolChange}
                  validPositionCount={requestPositions.length}
                />
              </div>
            </div>
          </div>

          <div className="relative min-w-0 min-[961px]:self-stretch" ref={rightColumnRef}>
            <div
              className={cn(
                'min-w-0',
                stickyColumn === 'right' &&
                  stickyMode === 'static' &&
                  'min-[961px]:sticky min-[961px]:top-4',
                stickyColumn === 'right' &&
                  stickyMode === 'dynamic' &&
                  'min-[961px]:absolute min-[961px]:inset-x-0',
              )}
              ref={rightColumnContentRef}
            >
              <div className="flex flex-col gap-5">
                <PortfolioSummary
                  analysis={analysisState.data}
                  analysisProviderLabel={analysisProviderLabel}
                  errorMessage={analysisState.errorMessage}
                  isDirty={isDirty}
                  isPrivacyMode={isPrivacyMode}
                  selectedProviderLabel={selectedProviderLabel}
                  status={analysisState.status}
                />

                <PositionTable
                  currency={analysisState.data?.currency ?? 'USD'}
                  isPrivacyMode={isPrivacyMode}
                  positions={analysisState.data?.positions ?? []}
                  providerLabel={analysisProviderLabel ?? selectedProviderLabel}
                />

                <CopyPortfolioButton
                  copyText={copyText}
                  disabled={!copyText}
                  onCopy={() => void handleCopy()}
                  status={copyStatus}
                />
              </div>
            </div>
          </div>
        </main>
      ) : null}

      {isWorkspaceReady ? (
        <main className="mt-5">
          <LedgerPanel />
        </main>
      ) : null}
    </div>
  )
}
