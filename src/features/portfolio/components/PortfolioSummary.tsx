import type { AnalysisStatus, PortfolioAnalysisResponse } from '../types'
import { formatBeta, formatCurrency, formatDateTime } from '../utils'
import {
  cn,
  emptyStateClass,
  emptyStateTitleClass,
  errorNoticeClass,
  eyebrowClass,
  metricCardClass,
  metricGridClass,
  metricLabelClass,
  metricValueClass,
  metricValueSmallClass,
  noticeListClass,
  noticeTextClass,
  noticeTitleClass,
  panelClass,
  panelHeaderClass,
  sectionBodyClass,
  sectionTitleClass,
  statusPillBaseClass,
  warningNoticeClass,
} from '../../../lib/ui'

type PortfolioSummaryProps = {
  analysis: PortfolioAnalysisResponse | null
  analysisProviderLabel: string | null
  errorMessage: string | null
  isDirty: boolean
  isPrivacyMode: boolean
  selectedProviderLabel: string
  status: AnalysisStatus
}

function getStatusClassName(status: AnalysisStatus) {
  switch (status) {
    case 'loading':
      return 'text-warning'
    case 'error':
      return 'text-danger'
    case 'success':
      return 'text-brand'
    default:
      return 'text-brand-strong'
  }
}

export function PortfolioSummary({
  analysis,
  analysisProviderLabel,
  errorMessage,
  isDirty,
  isPrivacyMode,
  selectedProviderLabel,
  status,
}: PortfolioSummaryProps) {
  return (
    <section className={panelClass}>
      <div className={panelHeaderClass}>
        <div>
          <p className={eyebrowClass}>Portfolio Snapshot</p>
          <h2 className={sectionTitleClass}>组合概览</h2>
        </div>
        <span className={cn(statusPillBaseClass, getStatusClassName(status))}>
          {status}
        </span>
      </div>

      {analysis ? (
        <>
          <div className={metricGridClass}>
            <article className={metricCardClass}>
              <span className={metricLabelClass}>组合 Beta</span>
              <strong className={metricValueClass}>
                {formatBeta(analysis.portfolioBeta)}
              </strong>
            </article>

            <article className={metricCardClass}>
              <span className={metricLabelClass}>数据源</span>
              <strong className={metricValueSmallClass}>
                {analysisProviderLabel ?? selectedProviderLabel}
              </strong>
            </article>

            <article className={metricCardClass}>
              <span className={metricLabelClass}>最近刷新</span>
              <strong className={metricValueSmallClass}>
                {formatDateTime(analysis.analyzedAt)}
              </strong>
            </article>

            {isPrivacyMode ? null : (
              <article className={metricCardClass}>
                <span className={metricLabelClass}>总市值</span>
                <strong className={metricValueClass}>
                  {formatCurrency(analysis.totalMarketValue, analysis.currency)}
                </strong>
              </article>
            )}
          </div>

          {isDirty ? (
            <p className="mt-4 leading-7 text-muted">
              当前输入与最近一次计算结果不一致，请手动刷新行情。
            </p>
          ) : null}

          {analysis.warnings.length > 0 ? (
            <div className={warningNoticeClass}>
              <p className={noticeTitleClass}>Warnings</p>
              <ul className={noticeListClass}>
                {analysis.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {analysis.errors.length > 0 ? (
            <div className={errorNoticeClass}>
              <p className={noticeTitleClass}>Skipped Symbols</p>
              <ul className={noticeListClass}>
                {analysis.errors.map((error) => (
                  <li key={`${error.symbol}-${error.message}`}>
                    {error.symbol}: {error.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <div className={emptyStateClass}>
          <h3 className={emptyStateTitleClass}>等待计算</h3>
          <p className={`${sectionBodyClass} mt-2`}>
            当前选择的数据源是 {selectedProviderLabel}。录入持仓后点击“刷新行情”，这里会展示总市值、
            组合 beta 和异常提示。
          </p>
        </div>
      )}

      {errorMessage ? (
        <div className={errorNoticeClass}>
          <p className={noticeTitleClass}>Request Error</p>
          <span className={noticeTextClass}>{errorMessage}</span>
        </div>
      ) : null}
    </section>
  )
}
