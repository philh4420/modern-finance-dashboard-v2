import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type {
  FinanceAuditEventEntry,
  PurchaseEntry,
  PurchaseId,
  PurchaseMonthCloseRunEntry,
  ReconciliationStatus,
} from './financeTypes'
import type { OfflineQueueEntry } from '../hooks/useOfflineQueue'
import {
  reconcileDefaultFilter,
  type ReconcileAnomalySignal,
  type ReconcileDuplicateMatch,
  type ReconcileDuplicateResolution,
  type ReconcileFilter,
  type ReconcileMatchSuggestion,
  type ReconcileSourceOption,
  type ReconcileSummary,
} from '../hooks/useReconciliationSection'

type DuplicateConfirmationState = {
  match: ReconcileDuplicateMatch
  resolution: ReconcileDuplicateResolution
}

type MonthCloseConfirmMode = 'close' | 'retry'

type ReconcileTabProps = {
  filter: ReconcileFilter
  setFilter: Dispatch<SetStateAction<ReconcileFilter>>
  categories: string[]
  sourceOptions: ReconcileSourceOption[]
  summary: ReconcileSummary
  filteredPurchases: PurchaseEntry[]
  selectedSet: Set<PurchaseId>
  selectedCount: number
  selectedTotal: number
  toggleSelected: (id: PurchaseId) => void
  toggleSelectVisible: () => void
  clearSelection: () => void
  bulkCategory: string
  setBulkCategory: Dispatch<SetStateAction<string>>
  runBulkStatus: (status: ReconciliationStatus) => Promise<void>
  runBulkCategory: () => Promise<void>
  runBulkDelete: () => Promise<void>
  runBulkMatch: () => Promise<void>
  runBulkMarkReconciled: () => Promise<void>
  runBulkExclude: () => Promise<void>
  runQuickMatch: (id: PurchaseId) => Promise<void>
  runQuickSplit: (id: PurchaseId) => Promise<void>
  runQuickMarkReviewed: (id: PurchaseId) => Promise<void>
  runQuickExclude: (id: PurchaseId) => Promise<void>
  runQuickUndo: (id: PurchaseId) => Promise<void>
  runApplyMatchSuggestion: (suggestionId: string) => Promise<void>
  runResolveDuplicateMatch: (match: ReconcileDuplicateMatch, resolution: ReconcileDuplicateResolution) => Promise<void>
  runCreateOutcomeRuleFromPurchase: (id: PurchaseId) => Promise<void>
  runCreateOutcomeRuleFromSuggestion: (suggestionId: string) => Promise<void>
  undoByPurchaseId: Record<string, { label: string }>
  ruleFeedback: string | null
  dismissRuleFeedback: () => void
  matchSuggestions: ReconcileMatchSuggestion[]
  duplicateMatches: ReconcileDuplicateMatch[]
  anomalySignals: ReconcileAnomalySignal[]
  anomalySignalsByPurchaseId: Map<string, ReconcileAnomalySignal[]>
  queue: {
    entries: OfflineQueueEntry[]
    pendingCount: number
    conflictCount: number
    isFlushing: boolean
    flushQueue: () => Promise<void>
    retryEntry: (id: string) => Promise<void>
    discardEntry: (id: string) => void
    clearConflicts: () => void
  }
  formatMoney: (value: number) => string
  dateLabel: Intl.DateTimeFormat
}

const getDuplicateResolutionCopy = (resolution: ReconcileDuplicateResolution) => {
  if (resolution === 'merge') {
    return {
      title: 'Confirm Merge',
      confirmLabel: 'Confirm merge',
      description: 'Keep the primary transaction and remove the duplicate entry.',
    }
  }

  if (resolution === 'archive_duplicate') {
    return {
      title: 'Confirm Archive Duplicate',
      confirmLabel: 'Confirm archive',
      description: 'Tag the duplicate as archived, keep history, and remove it from future duplicate checks.',
    }
  }

  return {
    title: 'Confirm Intentional Overlap',
    confirmLabel: 'Confirm intentional',
    description: 'Keep both rows and mark this pair as intentional so it does not trigger duplicate checks again.',
  }
}

const statusPillClass = (status: ReconciliationStatus) => {
  if (status === 'reconciled') return 'pill pill--good'
  if (status === 'pending') return 'pill pill--warning'
  return 'pill pill--neutral'
}

const queuePillClass = (status: OfflineQueueEntry['status']) =>
  status === 'conflict' ? 'pill pill--critical' : 'pill pill--warning'

const anomalyPillClass = (severity: ReconcileAnomalySignal['severity']) =>
  severity === 'critical' ? 'pill pill--critical' : 'pill pill--warning'

const closeCheckPillClass = (status: 'pass' | 'warning' | 'blocker') => {
  if (status === 'blocker') return 'pill pill--critical'
  if (status === 'warning') return 'pill pill--warning'
  return 'pill pill--good'
}

const confidenceLabel = (value: number) => `${Math.round(value * 100)}%`

const parseAuditJson = <T,>(value?: string): T | undefined => {
  if (!value) return undefined
  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
  }
}

const formatRate = (value: number) => `${Math.round(value * 100)}%`

const monthPattern = /^\d{4}-\d{2}$/

const summarizeAuditTransition = (event: FinanceAuditEventEntry) => {
  const before = parseAuditJson<Record<string, unknown>>(event.beforeJson)
  const after = parseAuditJson<Record<string, unknown>>(event.afterJson)
  const metadata = parseAuditJson<Record<string, unknown>>(event.metadataJson)

  const pieces: string[] = []
  const beforeStatus = typeof before?.reconciliationStatus === 'string' ? before.reconciliationStatus : null
  const afterStatus = typeof after?.reconciliationStatus === 'string' ? after.reconciliationStatus : null
  if (beforeStatus && afterStatus && beforeStatus !== afterStatus) {
    pieces.push(`status ${beforeStatus} -> ${afterStatus}`)
  }

  const beforeCategory = typeof before?.category === 'string' ? before.category : null
  const afterCategory = typeof after?.category === 'string' ? after.category : null
  if (beforeCategory && afterCategory && beforeCategory !== afterCategory) {
    pieces.push(`category ${beforeCategory} -> ${afterCategory}`)
  }

  const beforeAmount = typeof before?.amount === 'number' ? before.amount : null
  const afterAmount = typeof after?.amount === 'number' ? after.amount : null
  if (beforeAmount !== null && afterAmount !== null && Math.abs(beforeAmount - afterAmount) > 0.009) {
    pieces.push(`amount ${beforeAmount.toFixed(2)} -> ${afterAmount.toFixed(2)}`)
  }

  if (pieces.length === 0) {
    if (event.entityType === 'purchase_month_close') {
      const source = typeof metadata?.source === 'string' ? metadata.source : 'manual'
      const status = event.action.replaceAll('_', ' ')
      return `${status} (${source})`
    }
    return 'state updated'
  }

  return pieces.join(' · ')
}

const resolveAuditSource = (event: FinanceAuditEventEntry) => {
  const metadata = parseAuditJson<Record<string, unknown>>(event.metadataJson)
  return typeof metadata?.source === 'string' && metadata.source.trim().length > 0 ? metadata.source.trim() : 'manual'
}

const resolveAuditActor = (event: FinanceAuditEventEntry) => {
  const metadata = parseAuditJson<Record<string, unknown>>(event.metadataJson)
  const actorUserId =
    typeof metadata?.actorUserId === 'string' && metadata.actorUserId.trim().length > 0
      ? metadata.actorUserId.trim()
      : event.userId
  return actorUserId ? `You (${actorUserId.slice(0, 8)}...)` : 'You'
}

export function ReconcileTab({
  filter,
  setFilter,
  categories,
  sourceOptions,
  summary,
  filteredPurchases,
  selectedSet,
  selectedCount,
  selectedTotal,
  toggleSelected,
  toggleSelectVisible,
  clearSelection,
  bulkCategory,
  setBulkCategory,
  runBulkStatus,
  runBulkCategory,
  runBulkDelete,
  runBulkMatch,
  runBulkMarkReconciled,
  runBulkExclude,
  runQuickMatch,
  runQuickSplit,
  runQuickMarkReviewed,
  runQuickExclude,
  runQuickUndo,
  runApplyMatchSuggestion,
  runResolveDuplicateMatch,
  runCreateOutcomeRuleFromPurchase,
  runCreateOutcomeRuleFromSuggestion,
  undoByPurchaseId,
  ruleFeedback,
  dismissRuleFeedback,
  matchSuggestions,
  duplicateMatches,
  anomalySignals,
  anomalySignalsByPurchaseId,
  queue,
  formatMoney,
  dateLabel,
}: ReconcileTabProps) {
  const [activeSuggestionId, setActiveSuggestionId] = useState<string | null>(null)
  const [activeSuggestionRuleId, setActiveSuggestionRuleId] = useState<string | null>(null)
  const [activePurchaseRuleId, setActivePurchaseRuleId] = useState<string | null>(null)
  const [duplicateConfirmation, setDuplicateConfirmation] = useState<DuplicateConfirmationState | null>(null)
  const [isApplyingDuplicateAction, setIsApplyingDuplicateAction] = useState(false)
  const [closeMonth, setCloseMonth] = useState(() => filter.month || new Date().toISOString().slice(0, 7))
  const [monthCloseFeedback, setMonthCloseFeedback] = useState<string | null>(null)
  const [monthCloseConfirmMode, setMonthCloseConfirmMode] = useState<MonthCloseConfirmMode | null>(null)
  const [isRunningMonthClose, setIsRunningMonthClose] = useState(false)
  const [auditLimit, setAuditLimit] = useState<25 | 50 | 100>(50)

  const runPurchaseMonthClose = useMutation(api.finance.runPurchaseMonthClose)
  const closePrecheck = useQuery(
    api.finance.getPurchaseMonthClosePrecheck,
    monthPattern.test(closeMonth) ? { month: closeMonth } : 'skip',
  )
  const recentCloseRunsQuery = useQuery(api.finance.getRecentPurchaseMonthCloseRuns, { limit: 12 })
  const purchaseHistorySummary = useQuery(api.finance.getPurchaseHistorySummary, {
    windowDays: 90,
  })
  const reconciliationAuditEventsQuery = useQuery(api.finance.getRecentReconciliationAuditEvents, {
    month: monthPattern.test(closeMonth) ? closeMonth : undefined,
    limit: auditLimit,
  })

  const recentCloseRuns = useMemo(() => recentCloseRunsQuery ?? [], [recentCloseRunsQuery])
  const reconciliationAuditEvents = useMemo(
    () => reconciliationAuditEventsQuery ?? [],
    [reconciliationAuditEventsQuery],
  )

  const viewTotal = useMemo(() => filteredPurchases.reduce((sum, purchase) => sum + purchase.amount, 0), [filteredPurchases])
  const sourceLabelByKey = useMemo(
    () => new Map<string, string>(sourceOptions.map((option) => [option.value, option.label])),
    [sourceOptions],
  )
  const purchaseById = useMemo(
    () => new Map<string, PurchaseEntry>(filteredPurchases.map((purchase) => [String(purchase._id), purchase])),
    [filteredPurchases],
  )

  const suggestionByPurchaseId = useMemo(() => {
    const map = new Map<string, ReconcileMatchSuggestion>()
    matchSuggestions.forEach((suggestion) => {
      const key = String(suggestion.purchaseId)
      const current = map.get(key)
      if (!current || suggestion.confidence > current.confidence) {
        map.set(key, suggestion)
      }
    })
    return map
  }, [matchSuggestions])

  const anomalySummary = useMemo(() => {
    const counters = {
      unusual_amount: 0,
      missing_category: 0,
      stale_pending: 0,
      inconsistent_account_mapping: 0,
      critical: 0,
    }

    anomalySignals.forEach((signal) => {
      counters[signal.kind] += 1
      if (signal.severity === 'critical') counters.critical += 1
    })

    return counters
  }, [anomalySignals])

  const closeRunSummary = useMemo(() => {
    const completed = recentCloseRuns.filter((run) => run.status === 'completed').length
    const failed = recentCloseRuns.filter((run) => run.status === 'failed').length
    const successRate = completed + failed > 0 ? completed / (completed + failed) : 1
    const latest = [...recentCloseRuns].sort((left, right) => right.ranAt - left.ranAt)[0] ?? null
    return {
      completed,
      failed,
      successRate,
      latest,
    }
  }, [recentCloseRuns])

  const reconciliationKpis = useMemo(() => {
    const closeSummary = closePrecheck?.summary
    const purchaseCount = closeSummary?.purchaseCount ?? 0
    const postedCount = closeSummary?.postedCount ?? 0
    const reconciledCount = closeSummary?.reconciledCount ?? 0
    const pendingCount = closeSummary?.pendingCount ?? 0
    const duplicateCount = closeSummary?.duplicateCount ?? 0
    const anomalyCount = closeSummary?.anomalyCount ?? 0
    const missingCategoryCount = closeSummary?.missingCategoryCount ?? 0
    const completionRate = postedCount + reconciledCount > 0 ? reconciledCount / (postedCount + reconciledCount) : 1
    const duplicateRate = purchaseCount > 0 ? duplicateCount / purchaseCount : 0
    const anomalyRate = purchaseCount > 0 ? anomalyCount / purchaseCount : 0
    const issueWeight = pendingCount + duplicateCount + anomalyCount + Math.ceil(missingCategoryCount * 0.5)
    const matchAccuracyRate = purchaseCount > 0 ? Math.max(0, Math.min(1, 1 - issueWeight / purchaseCount)) : 1
    const summaryCompletedRuns = purchaseHistorySummary?.completedMonthCloseRuns ?? 0
    const summaryFailedRuns = purchaseHistorySummary?.failedMonthCloseRuns ?? 0
    const summaryCloseSuccessRate =
      summaryCompletedRuns + summaryFailedRuns > 0 ? summaryCompletedRuns / (summaryCompletedRuns + summaryFailedRuns) : null
    const closeSuccessRate = closePrecheck?.closeSuccessRate ?? summaryCloseSuccessRate ?? closeRunSummary.successRate

    return {
      purchaseCount,
      pendingCount,
      completionRate,
      duplicateRate,
      anomalyRate,
      matchAccuracyRate,
      closeSuccessRate: Number.isFinite(closeSuccessRate) ? closeSuccessRate : 1,
    }
  }, [closePrecheck?.closeSuccessRate, closePrecheck?.summary, closeRunSummary.successRate, purchaseHistorySummary])

  const monthCloseChecks = useMemo(() => {
    const summaryForMonth = closePrecheck?.summary
    if (!summaryForMonth) return []

    const checks: Array<{ id: string; status: 'pass' | 'warning' | 'blocker'; label: string; detail: string }> = []
    checks.push({
      id: 'queue',
      status: queue.pendingCount > 0 ? 'blocker' : 'pass',
      label: 'Offline queue',
      detail:
        queue.pendingCount > 0
          ? `${queue.pendingCount} queued mutation(s) must flush before close.`
          : 'No queued offline mutations pending.',
    })
    checks.push({
      id: 'pending',
      status: summaryForMonth.pendingCount > 0 ? 'blocker' : 'pass',
      label: 'Pending transactions',
      detail:
        summaryForMonth.pendingCount > 0
          ? `${summaryForMonth.pendingCount} pending (${formatMoney(summaryForMonth.pendingAmount)}) require resolution.`
          : 'All transactions posted or reconciled.',
    })
    checks.push({
      id: 'duplicates',
      status: summaryForMonth.duplicateCount > 0 ? 'blocker' : 'pass',
      label: 'Duplicate/overlap groups',
      detail:
        summaryForMonth.duplicateCount > 0
          ? `${summaryForMonth.duplicateCount} duplicate candidate group(s) still open.`
          : 'No duplicate groups detected in close month.',
    })
    checks.push({
      id: 'anomalies',
      status: summaryForMonth.anomalyCount > 0 ? 'blocker' : 'pass',
      label: 'Anomaly outliers',
      detail:
        summaryForMonth.anomalyCount > 0
          ? `${summaryForMonth.anomalyCount} unusual amount outlier(s) need review.`
          : 'No amount anomalies detected.',
    })
    checks.push({
      id: 'categories',
      status: summaryForMonth.missingCategoryCount > 0 ? 'warning' : 'pass',
      label: 'Category quality',
      detail:
        summaryForMonth.missingCategoryCount > 0
          ? `${summaryForMonth.missingCategoryCount} uncategorized row(s); warning only.`
          : 'All entries have non-generic categories.',
    })
    return checks
  }, [closePrecheck?.summary, formatMoney, queue.pendingCount])

  const hasCloseBlockers = monthCloseChecks.some((check) => check.status === 'blocker')
  const canRequestMonthClose = monthPattern.test(closeMonth) && !isRunningMonthClose

  const auditTrailRows = useMemo(
    () =>
      reconciliationAuditEvents.map((event) => ({
        id: String(event._id),
        createdAt: event.createdAt,
        entityType: event.entityType,
        entityId: event.entityId,
        action: event.action,
        source: resolveAuditSource(event),
        actor: resolveAuditActor(event),
        transition: summarizeAuditTransition(event),
      })),
    [reconciliationAuditEvents],
  )

  const allVisibleSelected =
    filteredPurchases.length > 0 && filteredPurchases.every((purchase) => selectedSet.has(purchase._id))

  const hasSelection = selectedCount > 0
  const canBulkCategory = hasSelection && bulkCategory.trim().length > 0

  const resolveSourceLabel = (purchase: PurchaseEntry) => {
    if (purchase.fundingSourceType === 'account' && purchase.fundingSourceId) {
      return sourceLabelByKey.get(`account:${purchase.fundingSourceId}`) ?? 'Account • Unknown'
    }
    if (purchase.fundingSourceType === 'card' && purchase.fundingSourceId) {
      return sourceLabelByKey.get(`card:${purchase.fundingSourceId}`) ?? 'Card • Unknown'
    }
    return sourceLabelByKey.get('unassigned') ?? 'Unassigned cash pool'
  }

  const purchaseNeedsAttention = (purchase: PurchaseEntry) => {
    const status = purchase.reconciliationStatus ?? 'posted'
    const category = purchase.category.trim().toLowerCase()
    const hasAnomaly = (anomalySignalsByPurchaseId.get(String(purchase._id))?.length ?? 0) > 0
    return (
      status === 'pending' ||
      category.length === 0 ||
      category === 'other' ||
      category === 'uncategorized' ||
      category === 'split / review' ||
      hasAnomaly
    )
  }

  const clearFilters = () => {
    setFilter({ ...reconcileDefaultFilter })
    clearSelection()
  }

  const hasActiveFilter =
    filter.query.length > 0 ||
    filter.status !== reconcileDefaultFilter.status ||
    filter.category !== reconcileDefaultFilter.category ||
    filter.account !== reconcileDefaultFilter.account ||
    filter.month !== reconcileDefaultFilter.month ||
    filter.startDate.length > 0 ||
    filter.endDate.length > 0 ||
    filter.amountBand !== reconcileDefaultFilter.amountBand ||
    filter.needsAttentionOnly ||
    filter.sortBy !== reconcileDefaultFilter.sortBy ||
    filter.sortDir !== reconcileDefaultFilter.sortDir ||
    hasSelection

  const runSuggestionApply = async (suggestionId: string) => {
    setActiveSuggestionId(suggestionId)
    try {
      await runApplyMatchSuggestion(suggestionId)
    } finally {
      setActiveSuggestionId((current) => (current === suggestionId ? null : current))
    }
  }

  const runSuggestionRule = async (suggestionId: string) => {
    setActiveSuggestionRuleId(suggestionId)
    try {
      await runCreateOutcomeRuleFromSuggestion(suggestionId)
    } finally {
      setActiveSuggestionRuleId((current) => (current === suggestionId ? null : current))
    }
  }

  const runRowRule = async (purchaseId: PurchaseId) => {
    const key = String(purchaseId)
    setActivePurchaseRuleId(key)
    try {
      await runCreateOutcomeRuleFromPurchase(purchaseId)
    } finally {
      setActivePurchaseRuleId((current) => (current === key ? null : current))
    }
  }

  const runSmartMatch = async (purchaseId: PurchaseId) => {
    const suggestion = suggestionByPurchaseId.get(String(purchaseId))
    if (suggestion) {
      await runSuggestionApply(suggestion.id)
      return
    }
    await runQuickMatch(purchaseId)
  }

  const requestDuplicateResolution = (match: ReconcileDuplicateMatch, resolution: ReconcileDuplicateResolution) => {
    setDuplicateConfirmation({ match, resolution })
  }

  const closeDuplicateConfirmation = () => {
    if (isApplyingDuplicateAction) return
    setDuplicateConfirmation(null)
  }

  const confirmDuplicateResolution = async () => {
    if (!duplicateConfirmation || isApplyingDuplicateAction) return
    setIsApplyingDuplicateAction(true)
    try {
      await runResolveDuplicateMatch(duplicateConfirmation.match, duplicateConfirmation.resolution)
      setDuplicateConfirmation(null)
    } finally {
      setIsApplyingDuplicateAction(false)
    }
  }

  const closeMonthCloseConfirm = () => {
    if (isRunningMonthClose) return
    setMonthCloseConfirmMode(null)
  }

  const requestMonthClose = (mode: MonthCloseConfirmMode) => {
    if (!canRequestMonthClose) return
    if (mode === 'close' && hasCloseBlockers) return
    setMonthCloseConfirmMode(mode)
  }

  const confirmMonthClose = async () => {
    if (!monthCloseConfirmMode || !canRequestMonthClose) return
    const runMode = monthCloseConfirmMode
    setIsRunningMonthClose(true)
    setMonthCloseConfirmMode(null)
    setMonthCloseFeedback(null)

    try {
      const idempotencyKey =
        runMode === 'retry' ? `retry:${closeMonth}:${Date.now()}` : `manual:${closeMonth}`
      const result = (await runPurchaseMonthClose({
        month: closeMonth,
        source: 'manual',
        idempotencyKey,
      })) as {
        status: 'completed' | 'failed'
        wasDeduplicated: boolean
        monthKey: string
        summary?: {
          purchaseCount: number
          pendingCount: number
          totalAmount: number
        }
        failureReason?: string | null
      }

      if (result.status === 'completed') {
        const summaryLine = result.summary
          ? `${result.summary.purchaseCount} rows · ${result.summary.pendingCount} pending · ${formatMoney(
              result.summary.totalAmount,
            )} cleared`
          : 'close summary updated'
        if (result.wasDeduplicated && runMode === 'close') {
          setMonthCloseFeedback(`Month ${result.monthKey} was already closed. ${summaryLine}.`)
        } else if (result.wasDeduplicated && runMode === 'retry') {
          setMonthCloseFeedback(`Retry key already processed for ${result.monthKey}. ${summaryLine}.`)
        } else if (runMode === 'retry') {
          setMonthCloseFeedback(`Retry recalculation complete for ${result.monthKey}. ${summaryLine}.`)
        } else {
          setMonthCloseFeedback(`Month close complete for ${result.monthKey}. ${summaryLine}.`)
        }
      } else {
        setMonthCloseFeedback(result.failureReason ?? 'Month close failed.')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Month close failed.'
      setMonthCloseFeedback(message)
    } finally {
      setIsRunningMonthClose(false)
    }
  }

  const duplicateConfirmationCopy = duplicateConfirmation
    ? getDuplicateResolutionCopy(duplicateConfirmation.resolution)
    : null

  return (
    <>
      <section className="editor-grid reconcile-tab-shell" aria-label="Reconciliation workspace">
        <article className="panel panel-reconcile-strip">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Reconciliation</p>
              <h2>Progress strip</h2>
              <p className="panel-value">
                {summary.totalCount} in scope · {summary.completionPercent.toFixed(0)}% complete
              </p>
              <p className="subnote">
                Pending {summary.pendingCount} ({formatMoney(summary.pendingValue)}) · unresolved {formatMoney(summary.unresolvedDelta)}
              </p>
            </div>
          </header>

          <div className="reconcile-summary-strip">
            <article className="reconcile-summary-card">
              <p>Pending value</p>
              <strong>{formatMoney(summary.pendingValue)}</strong>
              <small>{summary.pendingCount} transactions still pending</small>
            </article>
            <article className="reconcile-summary-card">
              <p>Matched today</p>
              <strong>{summary.matchedTodayCount}</strong>
              <small>Posted or reconciled today</small>
            </article>
            <article className="reconcile-summary-card">
              <p>Unresolved delta</p>
              <strong>{formatMoney(summary.unresolvedDelta)}</strong>
              <small>Open amount not reconciled</small>
            </article>
            <article className="reconcile-summary-card">
              <p>Completion</p>
              <strong>{summary.completionPercent.toFixed(0)}%</strong>
              <small>
                {summary.reconciledCount} of {summary.totalCount} reconciled
              </small>
            </article>
            <article className="reconcile-summary-card">
              <p>Needs attention</p>
              <strong>{summary.needsAttentionCount}</strong>
              <small>Pending, anomalies, or low-signal rows</small>
            </article>
          </div>
        </article>

        <article className="panel panel-reconcile-queue">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Queue</p>
              <h2>Offline operations</h2>
              <p className="panel-value">
                {queue.pendingCount} pending · {queue.conflictCount} conflicts
              </p>
              <p className="subnote">Retry, discard, and flush queued reconciliation updates.</p>
            </div>
            <div className="panel-actions">
              <button
                type="button"
                className="btn btn-secondary btn--sm"
                onClick={() => void queue.flushQueue()}
                disabled={queue.isFlushing || queue.pendingCount === 0}
              >
                {queue.isFlushing ? 'Flushing...' : `Flush (${queue.pendingCount})`}
              </button>
              {queue.conflictCount > 0 ? (
                <button type="button" className="btn btn-ghost btn--sm" onClick={queue.clearConflicts}>
                  Clear conflicts
                </button>
              ) : null}
            </div>
          </header>

          {queue.entries.length > 0 ? (
            <ul className="timeline-list">
              {queue.entries.slice(0, 8).map((entry) => (
                <li key={entry.id}>
                  <div>
                    <p>{entry.key}</p>
                    <small>
                      <span className={queuePillClass(entry.status)}>{entry.status === 'conflict' ? 'Conflict' : 'Queued'}</span> • attempt{' '}
                      {entry.attempts}
                      {entry.lastError ? ` • ${entry.lastError}` : ''}
                    </small>
                  </div>
                  <div className="row-actions">
                    <button type="button" className="btn btn-secondary btn--sm" onClick={() => void queue.retryEntry(entry.id)}>
                      Retry
                    </button>
                    <button type="button" className="btn btn-ghost btn--sm" onClick={() => queue.discardEntry(entry.id)}>
                      Discard
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">Offline queue is clear.</p>
          )}

          <section className="reconcile-anomaly-overview" aria-label="Anomaly overview">
            <div className="reconcile-anomaly-overview-head">
              <h3>Anomaly flags</h3>
              <span className={anomalySummary.critical > 0 ? 'pill pill--critical' : 'pill pill--neutral'}>
                {anomalySignals.length} total
              </span>
            </div>
            <p className="subnote">Flags for unusual amount, category gaps, stale pending rows, and source mapping drift.</p>
            <div className="reconcile-anomaly-kpis">
              <span className="pill pill--warning">Unusual {anomalySummary.unusual_amount}</span>
              <span className="pill pill--warning">Missing category {anomalySummary.missing_category}</span>
              <span className="pill pill--warning">Stale pending {anomalySummary.stale_pending}</span>
              <span className="pill pill--warning">Source drift {anomalySummary.inconsistent_account_mapping}</span>
            </div>
            {anomalySignals.length > 0 ? (
              <ul className="reconcile-anomaly-list">
                {anomalySignals.slice(0, 6).map((signal) => {
                  const row = purchaseById.get(String(signal.purchaseId))
                  return (
                    <li key={signal.id}>
                      <div>
                        <p>{row?.item ?? 'Purchase'}</p>
                        <small>{signal.detail}</small>
                      </div>
                      <span className={anomalyPillClass(signal.severity)}>{signal.label}</span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="form-hint">No anomaly flags in current scope.</p>
            )}
          </section>
        </article>

        <article className="panel panel-reconcile-workspace">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Match Workspace</p>
              <h2>Review + resolve entries</h2>
              <p className="panel-value">
                {filteredPurchases.length} in view · {formatMoney(viewTotal)}
              </p>
              <p className="subnote">Smart suggestions, quick actions, and anomaly context to reduce manual checks.</p>
            </div>
            <div className="panel-actions">
              <button type="button" className="btn btn-secondary btn--sm" onClick={toggleSelectVisible} disabled={filteredPurchases.length === 0}>
                {allVisibleSelected ? 'Deselect view' : 'Select view'}
              </button>
              <button type="button" className="btn btn-ghost btn--sm" onClick={clearSelection} disabled={!hasSelection}>
                Clear selection
              </button>
              <button type="button" className="btn btn-ghost btn--sm" onClick={clearFilters} disabled={!hasActiveFilter}>
                Reset
              </button>
            </div>
          </header>

          {ruleFeedback ? (
            <div className="reconcile-rule-feedback" role="status" aria-live="polite">
              <p>{ruleFeedback}</p>
              <button type="button" className="btn btn-ghost btn--sm" onClick={dismissRuleFeedback}>
                Dismiss
              </button>
            </div>
          ) : null}

          <section className="reconcile-suggestion-panel" aria-label="Smart suggestions">
            <div className="reconcile-suggestion-head">
              <div>
                <h3>Smart match suggestions</h3>
                <p className="subnote">Confidence combines amount/date/merchant heuristics and rule coverage.</p>
              </div>
              <span className={matchSuggestions.length > 0 ? 'pill pill--good' : 'pill pill--neutral'}>
                {matchSuggestions.length} suggestions
              </span>
            </div>

            {matchSuggestions.length > 0 ? (
              <ul className="reconcile-suggestion-list">
                {matchSuggestions.slice(0, 8).map((suggestion) => {
                  const purchase = purchaseById.get(String(suggestion.purchaseId))
                  const isApplying = activeSuggestionId === suggestion.id
                  const isLearning = activeSuggestionRuleId === suggestion.id
                  return (
                    <li key={suggestion.id}>
                      <div>
                        <p>{purchase?.item ?? `Purchase ${String(suggestion.purchaseId)}`}</p>
                        <small>
                          {suggestion.kind === 'rule' ? 'Rule' : 'History'} · {confidenceLabel(suggestion.confidence)} · {suggestion.reason}
                        </small>
                        <small>
                          → {suggestion.suggestedCategory} · {suggestion.suggestedStatus} · {suggestion.suggestedSourceLabel}
                        </small>
                      </div>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn--sm"
                          onClick={() => void runSuggestionApply(suggestion.id)}
                          disabled={isApplying}
                        >
                          {isApplying ? 'Applying...' : 'Apply'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn--sm"
                          onClick={() => void runSuggestionRule(suggestion.id)}
                          disabled={isLearning}
                        >
                          {isLearning ? 'Saving...' : 'Save rule'}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="form-hint">No suggestions in current filter scope. Pending rows with history/rules will appear here.</p>
            )}
          </section>

          <div className="entry-form entry-form--grid">
            <div className="form-grid reconcile-filter-grid">
              <div className="form-field">
                <label htmlFor="reconcile-query">Merchant/category</label>
                <input
                  id="reconcile-query"
                  type="search"
                  placeholder="Search item, category, notes"
                  value={filter.query}
                  onChange={(event) => setFilter((previous) => ({ ...previous, query: event.target.value }))}
                />
              </div>

              <div className="form-field">
                <label htmlFor="reconcile-account">Source</label>
                <select
                  id="reconcile-account"
                  value={filter.account}
                  onChange={(event) => setFilter((previous) => ({ ...previous, account: event.target.value }))}
                >
                  {sourceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="reconcile-status">Status</label>
                <select
                  id="reconcile-status"
                  value={filter.status}
                  onChange={(event) =>
                    setFilter((previous) => ({ ...previous, status: event.target.value as ReconciliationStatus | 'all' }))
                  }
                >
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="posted">Posted</option>
                  <option value="reconciled">Reconciled</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="reconcile-amount-band">Amount band</label>
                <select
                  id="reconcile-amount-band"
                  value={filter.amountBand}
                  onChange={(event) =>
                    setFilter((previous) => ({ ...previous, amountBand: event.target.value as ReconcileFilter['amountBand'] }))
                  }
                >
                  <option value="all">All amounts</option>
                  <option value="under_25">Under 25</option>
                  <option value="25_100">25 to 100</option>
                  <option value="100_250">100 to 250</option>
                  <option value="250_500">250 to 500</option>
                  <option value="500_plus">500+</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="reconcile-date-start">From date</label>
                <input
                  id="reconcile-date-start"
                  type="date"
                  value={filter.startDate}
                  onChange={(event) => setFilter((previous) => ({ ...previous, startDate: event.target.value }))}
                />
              </div>

              <div className="form-field">
                <label htmlFor="reconcile-date-end">To date</label>
                <input
                  id="reconcile-date-end"
                  type="date"
                  value={filter.endDate}
                  onChange={(event) => setFilter((previous) => ({ ...previous, endDate: event.target.value }))}
                />
              </div>

              <div className="form-field">
                <label htmlFor="reconcile-month">Statement month</label>
                <input
                  id="reconcile-month"
                  type="month"
                  value={filter.month}
                  onChange={(event) => setFilter((previous) => ({ ...previous, month: event.target.value }))}
                />
              </div>

              <div className="form-field">
                <label htmlFor="reconcile-category">Category</label>
                <select
                  id="reconcile-category"
                  value={filter.category}
                  onChange={(event) => setFilter((previous) => ({ ...previous, category: event.target.value }))}
                >
                  <option value="all">All categories</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="reconcile-sort">Sort</label>
                <select
                  id="reconcile-sort"
                  value={filter.sortBy}
                  onChange={(event) =>
                    setFilter((previous) => ({ ...previous, sortBy: event.target.value as ReconcileFilter['sortBy'] }))
                  }
                >
                  <option value="date">Date</option>
                  <option value="amount">Amount</option>
                  <option value="item">Item</option>
                  <option value="status">Status</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="reconcile-sort-dir">Direction</label>
                <select
                  id="reconcile-sort-dir"
                  value={filter.sortDir}
                  onChange={(event) =>
                    setFilter((previous) => ({ ...previous, sortDir: event.target.value as ReconcileFilter['sortDir'] }))
                  }
                >
                  <option value="desc">Desc</option>
                  <option value="asc">Asc</option>
                </select>
              </div>

              <div className="form-field reconcile-filter-toggle">
                <label className="cards-override-toggle cards-override-toggle--inline" htmlFor="reconcile-needs-attention">
                  <input
                    id="reconcile-needs-attention"
                    type="checkbox"
                    checked={filter.needsAttentionOnly}
                    onChange={(event) => setFilter((previous) => ({ ...previous, needsAttentionOnly: event.target.checked }))}
                  />
                  <span>Needs attention only</span>
                </label>
              </div>
            </div>

            {filteredPurchases.length === 0 ? (
              <p className="empty-state">No purchases match this filter.</p>
            ) : (
              <>
                <div className="table-wrap table-wrap--card reconcile-table-wrap">
                  <table className="data-table data-table--reconcile" data-testid="reconcile-table">
                    <caption className="sr-only">Reconciliation entries</caption>
                    <thead>
                      <tr>
                        <th scope="col">Select</th>
                        <th scope="col">Item</th>
                        <th scope="col">Date</th>
                        <th scope="col">Source</th>
                        <th scope="col">Category</th>
                        <th scope="col">Status</th>
                        <th scope="col">Amount</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPurchases.map((purchase) => {
                        const isSelected = selectedSet.has(purchase._id)
                        const status = purchase.reconciliationStatus ?? 'posted'
                        const canUndo = Boolean(undoByPurchaseId[String(purchase._id)])
                        const suggestion = suggestionByPurchaseId.get(String(purchase._id))
                        const anomalies = anomalySignalsByPurchaseId.get(String(purchase._id)) ?? []
                        const isSavingRule = activePurchaseRuleId === String(purchase._id)
                        const isApplyingSuggestion = suggestion ? activeSuggestionId === suggestion.id : false
                        return (
                          <tr key={purchase._id} className={isSelected ? 'table-row--selected' : undefined}>
                            <td>
                              <input
                                aria-label={`Select ${purchase.item}`}
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelected(purchase._id)}
                              />
                            </td>
                            <td>
                              <div className="cell-stack">
                                <strong className="cell-truncate" title={purchase.item}>
                                  {purchase.item}
                                </strong>
                                {purchaseNeedsAttention(purchase) ? (
                                  <small className="amount-negative">Needs attention</small>
                                ) : (
                                  <small className="amount-positive">Ready</small>
                                )}
                                <div className="reconcile-inline-pills">
                                  {suggestion ? <span className="pill pill--good">Hint {confidenceLabel(suggestion.confidence)}</span> : null}
                                  {anomalies.slice(0, 2).map((signal) => (
                                    <span key={signal.id} className={anomalyPillClass(signal.severity)}>
                                      {signal.label}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </td>
                            <td>{dateLabel.format(new Date(`${purchase.purchaseDate}T00:00:00`))}</td>
                            <td>
                              <span className="pill pill--neutral">{resolveSourceLabel(purchase)}</span>
                            </td>
                            <td>
                              <span className="pill pill--neutral">{purchase.category}</span>
                              {suggestion && suggestion.suggestedCategory !== purchase.category ? (
                                <small className="subnote">→ {suggestion.suggestedCategory}</small>
                              ) : null}
                            </td>
                            <td>
                              <span className={statusPillClass(status)}>{status}</span>
                              {suggestion && suggestion.suggestedStatus !== status ? (
                                <small className="subnote">→ {suggestion.suggestedStatus}</small>
                              ) : null}
                            </td>
                            <td className="table-amount amount-negative">{formatMoney(purchase.amount)}</td>
                            <td>
                              <div className="row-actions row-actions--reconcile">
                                <button
                                  type="button"
                                  className="btn btn-secondary btn--sm"
                                  onClick={() => void runSmartMatch(purchase._id)}
                                  disabled={isApplyingSuggestion}
                                >
                                  {isApplyingSuggestion ? 'Applying...' : suggestion ? 'Apply hint' : 'Match'}
                                </button>
                                <button type="button" className="btn btn-secondary btn--sm" onClick={() => void runQuickSplit(purchase._id)}>
                                  Split
                                </button>
                                <button type="button" className="btn btn-secondary btn--sm" onClick={() => void runQuickMarkReviewed(purchase._id)}>
                                  Review
                                </button>
                                <button type="button" className="btn btn-ghost btn--sm" onClick={() => void runQuickExclude(purchase._id)}>
                                  Exclude
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn--sm"
                                  onClick={() => void runQuickUndo(purchase._id)}
                                  disabled={!canUndo}
                                >
                                  Undo
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn--sm"
                                  onClick={() => void runRowRule(purchase._id)}
                                  disabled={isSavingRule}
                                >
                                  {isSavingRule ? 'Saving...' : 'Save rule'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="reconcile-mobile-list" aria-label="Reconciliation entries mobile">
                  {filteredPurchases.map((purchase) => {
                    const isSelected = selectedSet.has(purchase._id)
                    const status = purchase.reconciliationStatus ?? 'posted'
                    const canUndo = Boolean(undoByPurchaseId[String(purchase._id)])
                    const suggestion = suggestionByPurchaseId.get(String(purchase._id))
                    const anomalies = anomalySignalsByPurchaseId.get(String(purchase._id)) ?? []
                    const isSavingRule = activePurchaseRuleId === String(purchase._id)
                    const isApplyingSuggestion = suggestion ? activeSuggestionId === suggestion.id : false
                    return (
                      <details key={purchase._id} className="reconcile-mobile-item">
                        <summary>
                          <div className="reconcile-mobile-summary-main">
                            <strong>{purchase.item}</strong>
                            <small>{resolveSourceLabel(purchase)}</small>
                          </div>
                          <div className="reconcile-mobile-summary-metrics">
                            <span className={statusPillClass(status)}>{status}</span>
                            <span className="reconcile-mobile-amount amount-negative">{formatMoney(purchase.amount)}</span>
                          </div>
                        </summary>
                        <div className="reconcile-mobile-content">
                          <div className="reconcile-mobile-grid">
                            <div>
                              <span>Date</span>
                              <strong>{dateLabel.format(new Date(`${purchase.purchaseDate}T00:00:00`))}</strong>
                            </div>
                            <div>
                              <span>Statement</span>
                              <strong>{purchase.statementMonth ?? purchase.purchaseDate.slice(0, 7)}</strong>
                            </div>
                            <div>
                              <span>Category</span>
                              <strong>{purchase.category}</strong>
                            </div>
                            <div>
                              <span>Needs attention</span>
                              <strong>{purchaseNeedsAttention(purchase) ? 'Yes' : 'No'}</strong>
                            </div>
                          </div>
                          <div className="reconcile-inline-pills">
                            {suggestion ? <span className="pill pill--good">Hint {confidenceLabel(suggestion.confidence)}</span> : null}
                            {anomalies.map((signal) => (
                              <span key={signal.id} className={anomalyPillClass(signal.severity)}>
                                {signal.label}
                              </span>
                            ))}
                          </div>
                          <label className="cards-override-toggle">
                            <input type="checkbox" checked={isSelected} onChange={() => toggleSelected(purchase._id)} />
                            <span>Select row</span>
                          </label>
                          <div className="row-actions row-actions--reconcile-mobile">
                            <button
                              type="button"
                              className="btn btn-secondary btn--sm"
                              onClick={() => void runSmartMatch(purchase._id)}
                              disabled={isApplyingSuggestion}
                            >
                              {isApplyingSuggestion ? 'Applying...' : suggestion ? 'Apply hint' : 'Match'}
                            </button>
                            <button type="button" className="btn btn-secondary btn--sm" onClick={() => void runQuickSplit(purchase._id)}>
                              Split
                            </button>
                            <button type="button" className="btn btn-secondary btn--sm" onClick={() => void runQuickMarkReviewed(purchase._id)}>
                              Review
                            </button>
                            <button type="button" className="btn btn-ghost btn--sm" onClick={() => void runQuickExclude(purchase._id)}>
                              Exclude
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn--sm"
                              onClick={() => void runQuickUndo(purchase._id)}
                              disabled={!canUndo}
                            >
                              Undo
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn--sm"
                              onClick={() => void runRowRule(purchase._id)}
                              disabled={isSavingRule}
                            >
                              {isSavingRule ? 'Saving...' : 'Save rule'}
                            </button>
                          </div>
                        </div>
                      </details>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </article>

        <article className="panel panel-reconcile-summary">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Reconciliation Summary</p>
              <h2>Bulk + duplicate controls</h2>
              <p className="panel-value">
                {selectedCount} selected · {formatMoney(selectedTotal)}
              </p>
              <p className="subnote">
                Bulk match/recategorize/reconcile/exclude plus duplicate one-click actions with confirmation.
              </p>
            </div>
          </header>

          <div className="bulk-summary" aria-label="Selection summary">
            <div>
              <p>Selected</p>
              <strong>{selectedCount}</strong>
              <small>{formatMoney(selectedTotal)}</small>
            </div>
            <div>
              <p>In view</p>
              <strong>{filteredPurchases.length}</strong>
              <small>{formatMoney(viewTotal)}</small>
            </div>
          </div>

          <div className="row-actions">
            <button type="button" className="btn btn-secondary btn--sm" onClick={() => void runBulkMatch()} disabled={!hasSelection}>
              Bulk match
            </button>
            <button
              type="button"
              className="btn btn-secondary btn--sm"
              onClick={() => void runBulkMarkReconciled()}
              disabled={!hasSelection}
            >
              Bulk reconciled
            </button>
            <button type="button" className="btn btn-secondary btn--sm" onClick={() => void runBulkStatus('pending')} disabled={!hasSelection}>
              Bulk pending
            </button>
            <button type="button" className="btn btn-ghost btn--sm" onClick={() => void runBulkExclude()} disabled={!hasSelection}>
              Bulk exclude
            </button>
          </div>

          <label htmlFor="bulk-category">Bulk recategorize</label>
          <div className="goal-actions">
            <input
              id="bulk-category"
              list="bulk-category-list"
              value={bulkCategory}
              onChange={(event) => setBulkCategory(event.target.value)}
              placeholder="e.g. Groceries"
            />
            <datalist id="bulk-category-list">
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
            <button type="button" className="btn btn-secondary btn--sm" onClick={() => void runBulkCategory()} disabled={!canBulkCategory}>
              Apply
            </button>
            <button type="button" className="btn btn-ghost btn--sm" onClick={() => setBulkCategory('')} disabled={bulkCategory.length === 0}>
              Clear
            </button>
          </div>

          <button type="button" className="btn btn-danger" onClick={() => void runBulkDelete()} disabled={!hasSelection}>
            Remove selected
          </button>

          {Object.keys(undoByPurchaseId).length > 0 ? (
            <p className="form-hint">
              <strong>{Object.keys(undoByPurchaseId).length} undo action(s)</strong> available from row quick actions.
            </p>
          ) : (
            <p className="form-hint">Use row quick actions to stage undo checkpoints.</p>
          )}

          <section className="reconcile-kpi-panel" aria-label="Reconciliation KPI block">
            <div className="reconcile-kpi-head">
              <h3>Trust KPI block</h3>
              <span className={reconciliationKpis.pendingCount > 0 ? 'pill pill--warning' : 'pill pill--good'}>
                {reconciliationKpis.purchaseCount} in close month
              </span>
            </div>
            <div className="reconcile-kpi-grid">
              <article>
                <p>Reconciliation completion</p>
                <strong>{formatRate(reconciliationKpis.completionRate)}</strong>
                <small>reconciled over posted+reconciled</small>
              </article>
              <article>
                <p>Match accuracy</p>
                <strong>{formatRate(reconciliationKpis.matchAccuracyRate)}</strong>
                <small>quality-weighted from pending/duplicate/anomaly signals</small>
              </article>
              <article>
                <p>Duplicate rate</p>
                <strong>{formatRate(reconciliationKpis.duplicateRate)}</strong>
                <small>duplicate groups relative to month volume</small>
              </article>
              <article>
                <p>Anomaly rate</p>
                <strong>{formatRate(reconciliationKpis.anomalyRate)}</strong>
                <small>outlier rows relative to month volume</small>
              </article>
              <article>
                <p>Close success rate</p>
                <strong>{formatRate(reconciliationKpis.closeSuccessRate)}</strong>
                <small>{closeRunSummary.completed} completed · {closeRunSummary.failed} failed recent runs</small>
              </article>
            </div>
          </section>

          <section className="reconcile-close-panel" aria-label="Month close flow">
            <div className="reconcile-close-head">
              <div>
                <h3>Month close flow</h3>
                <p className="subnote">Pre-checks, blocker list, confirmation, idempotent close and retry-safe recalculation.</p>
              </div>
              <label className="form-field reconcile-close-month">
                <span>Close month</span>
                <input
                  type="month"
                  value={closeMonth}
                  onChange={(event) => setCloseMonth(event.target.value)}
                />
              </label>
            </div>

            {closePrecheck?.summary ? (
              <div className="reconcile-close-summary">
                <article>
                  <p>Transactions</p>
                  <strong>{closePrecheck.summary.purchaseCount}</strong>
                  <small>{formatMoney(closePrecheck.summary.totalAmount)} cleared value</small>
                </article>
                <article>
                  <p>Pending</p>
                  <strong>{closePrecheck.summary.pendingCount}</strong>
                  <small>{formatMoney(closePrecheck.summary.pendingAmount)} unresolved value</small>
                </article>
                <article>
                  <p>Data quality alerts</p>
                  <strong>{closePrecheck.summary.duplicateCount + closePrecheck.summary.anomalyCount}</strong>
                  <small>{closePrecheck.summary.duplicateCount} duplicates · {closePrecheck.summary.anomalyCount} anomalies</small>
                </article>
                <article>
                  <p>Category warnings</p>
                  <strong>{closePrecheck.summary.missingCategoryCount}</strong>
                  <small>non-blocking warning count</small>
                </article>
              </div>
            ) : (
              <p className="form-hint">Loading pre-close checks…</p>
            )}

            {monthCloseChecks.length > 0 ? (
              <ul className="reconcile-close-checks">
                {monthCloseChecks.map((check) => (
                  <li key={check.id}>
                    <div>
                      <p>{check.label}</p>
                      <small>{check.detail}</small>
                    </div>
                    <span className={closeCheckPillClass(check.status)}>
                      {check.status === 'pass' ? 'pass' : check.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {closePrecheck?.blockers?.length ? (
              <div className="reconcile-close-issues">
                <h4>Blockers</h4>
                <ul>
                  {closePrecheck.blockers.map((issue) => (
                    <li key={issue.id}>
                      <strong>{issue.label}</strong> <span>{issue.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {closePrecheck?.warnings?.length ? (
              <div className="reconcile-close-issues reconcile-close-issues--warning">
                <h4>Warnings</h4>
                <ul>
                  {closePrecheck.warnings.map((issue) => (
                    <li key={issue.id}>
                      <strong>{issue.label}</strong> <span>{issue.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="reconcile-close-actions">
              <button
                type="button"
                className="btn btn-secondary btn--sm"
                onClick={() => requestMonthClose('close')}
                disabled={!canRequestMonthClose || hasCloseBlockers}
              >
                {isRunningMonthClose ? 'Running close…' : 'Close month'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn--sm"
                onClick={() => requestMonthClose('retry')}
                disabled={!canRequestMonthClose}
              >
                Retry recalculation
              </button>
            </div>
            {hasCloseBlockers ? <p className="form-hint">Resolve blockers before close. Retry is available for recalculation checks.</p> : null}
            {monthCloseFeedback ? <p className="form-hint">{monthCloseFeedback}</p> : null}

            <div className="reconcile-close-run-log">
              <h4>Close audit log</h4>
              {recentCloseRuns.length === 0 ? (
                <p className="form-hint">No close runs yet.</p>
              ) : (
                <ul className="reconcile-close-run-list">
                  {(recentCloseRuns as PurchaseMonthCloseRunEntry[]).slice(0, 8).map((run) => (
                    <li key={run._id}>
                      <div>
                        <p>{run.monthKey} · {run.status}</p>
                        <small>
                          {run.source} · {run.idempotencyKey ?? 'no key'} · {run.totalPurchases} rows · {formatMoney(run.totalAmount)}
                        </small>
                      </div>
                      <span className={run.status === 'failed' ? 'pill pill--critical' : 'pill pill--good'}>
                        {dateLabel.format(new Date(run.ranAt))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="reconcile-audit-panel" aria-label="Full audit trail per action">
            <div className="reconcile-audit-head">
              <div>
                <h3>Action audit trail</h3>
                <p className="subnote">Before/after snapshots, actor, timestamp, and source for reconciliation actions.</p>
              </div>
              <label className="form-field">
                <span>Rows</span>
                <select
                  value={auditLimit}
                  onChange={(event) => setAuditLimit(Number(event.target.value) as 25 | 50 | 100)}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
            </div>

            {auditTrailRows.length === 0 ? (
              <p className="form-hint">No audit events for selected close month.</p>
            ) : (
              <ul className="reconcile-audit-list">
                {auditTrailRows.map((row) => (
                  <li key={row.id}>
                    <div>
                      <p>{row.action.replaceAll('_', ' ')} · {row.entityType} ({row.entityId})</p>
                      <small>{row.transition}</small>
                      <small>{row.actor} · {row.source}</small>
                    </div>
                    <span className="pill pill--neutral">{dateLabel.format(new Date(row.createdAt))}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="reconcile-duplicate-panel" aria-label="Duplicate and overlap detection">
            <div className="reconcile-duplicate-head">
              <h3>Duplicate + overlap detection</h3>
              <span className={duplicateMatches.length > 0 ? 'pill pill--warning' : 'pill pill--neutral'}>
                {duplicateMatches.length} flagged
              </span>
            </div>
            {duplicateMatches.length > 0 ? (
              <ul className="reconcile-duplicate-list">
                {duplicateMatches.slice(0, 8).map((match) => (
                  <li key={match.id}>
                    <div>
                      <p>
                        {match.kind === 'duplicate' ? 'Likely duplicate' : 'Possible overlap'} · {confidenceLabel(match.confidence)} confidence
                      </p>
                      <small>{match.reason}</small>
                    </div>
                    <div className="reconcile-duplicate-grid">
                      <article>
                        <strong>{match.primaryItem}</strong>
                        <small>
                          {dateLabel.format(new Date(`${match.primaryDate}T00:00:00`))} · {formatMoney(match.primaryAmount)}
                        </small>
                      </article>
                      <article>
                        <strong>{match.secondaryItem}</strong>
                        <small>
                          {dateLabel.format(new Date(`${match.secondaryDate}T00:00:00`))} · {formatMoney(match.secondaryAmount)}
                        </small>
                      </article>
                    </div>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn--sm"
                        onClick={() => requestDuplicateResolution(match, 'merge')}
                      >
                        Merge
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn--sm"
                        onClick={() => requestDuplicateResolution(match, 'archive_duplicate')}
                      >
                        Archive duplicate
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn--sm"
                        onClick={() => requestDuplicateResolution(match, 'mark_intentional')}
                      >
                        Mark intentional
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="form-hint">No duplicate or overlap candidates in this filter scope.</p>
            )}
          </section>
        </article>
      </section>

      {duplicateConfirmation && duplicateConfirmationCopy ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeDuplicateConfirmation}>
          <section
            className="modal reconcile-duplicate-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reconcile-duplicate-confirm-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="modal__header reconcile-duplicate-confirm-modal__header">
              <div>
                <p className="panel-kicker">Reconcile</p>
                <h2 id="reconcile-duplicate-confirm-title">{duplicateConfirmationCopy.title}</h2>
                <p className="subnote">{duplicateConfirmationCopy.description}</p>
              </div>
              <button type="button" className="btn btn-ghost" onClick={closeDuplicateConfirmation} disabled={isApplyingDuplicateAction}>
                Close
              </button>
            </header>

            <div className="modal__body reconcile-duplicate-confirm-modal__body">
              <div className="reconcile-duplicate-confirm-grid">
                <article className="reconcile-duplicate-confirm-card">
                  <span>Primary (kept)</span>
                  <strong>{duplicateConfirmation.match.primaryItem}</strong>
                  <small>
                    {dateLabel.format(new Date(`${duplicateConfirmation.match.primaryDate}T00:00:00`))} ·{' '}
                    {formatMoney(duplicateConfirmation.match.primaryAmount)}
                  </small>
                </article>
                <article className="reconcile-duplicate-confirm-card reconcile-duplicate-confirm-card--change">
                  <span>Secondary (changed)</span>
                  <strong>{duplicateConfirmation.match.secondaryItem}</strong>
                  <small>
                    {dateLabel.format(new Date(`${duplicateConfirmation.match.secondaryDate}T00:00:00`))} ·{' '}
                    {formatMoney(duplicateConfirmation.match.secondaryAmount)}
                  </small>
                </article>
              </div>
              <p className="subnote">
                Similarity {Math.round(duplicateConfirmation.match.nameSimilarity * 100)}% · amount delta{' '}
                {(duplicateConfirmation.match.amountDeltaPercent * 100).toFixed(1)}% · day gap {duplicateConfirmation.match.dayDelta}
              </p>
            </div>

            <footer className="modal__footer">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={closeDuplicateConfirmation}
                disabled={isApplyingDuplicateAction}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void confirmDuplicateResolution()}
                disabled={isApplyingDuplicateAction}
              >
                {isApplyingDuplicateAction ? 'Applying...' : duplicateConfirmationCopy.confirmLabel}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {monthCloseConfirmMode ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeMonthCloseConfirm}>
          <section
            className="modal reconcile-close-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reconcile-close-confirm-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="modal__header reconcile-close-confirm-modal__header">
              <div>
                <p className="panel-kicker">Reconcile</p>
                <h2 id="reconcile-close-confirm-title">
                  {monthCloseConfirmMode === 'retry' ? 'Confirm Retry Recalculation' : 'Confirm Month Close'}
                </h2>
                <p className="subnote">
                  {monthCloseConfirmMode === 'retry'
                    ? 'Runs a new recalculation with a fresh idempotency key and appends a new close audit entry.'
                    : 'Finalizes this month checkpoint using idempotent close logic and writes a close audit entry.'}
                </p>
              </div>
              <button type="button" className="btn btn-ghost" onClick={closeMonthCloseConfirm} disabled={isRunningMonthClose}>
                Close
              </button>
            </header>

            <div className="modal__body reconcile-close-confirm-modal__body">
              <div className="reconcile-close-confirm-grid">
                <article>
                  <span>Target month</span>
                  <strong>{closeMonth}</strong>
                  <small>{closePrecheck?.summary ? `${closePrecheck.summary.purchaseCount} rows in month` : 'Loading summary'}</small>
                </article>
                <article>
                  <span>Open blockers</span>
                  <strong>{monthCloseChecks.filter((check) => check.status === 'blocker').length}</strong>
                  <small>{monthCloseConfirmMode === 'retry' ? 'Retry allowed with blockers' : 'Close requires zero blockers'}</small>
                </article>
              </div>
              {monthCloseChecks.length > 0 ? (
                <ul className="reconcile-close-checks">
                  {monthCloseChecks.map((check) => (
                    <li key={`confirm-${check.id}`}>
                      <div>
                        <p>{check.label}</p>
                        <small>{check.detail}</small>
                      </div>
                      <span className={closeCheckPillClass(check.status)}>
                        {check.status === 'pass' ? 'pass' : check.status}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <footer className="modal__footer">
              <button type="button" className="btn btn-ghost" onClick={closeMonthCloseConfirm} disabled={isRunningMonthClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void confirmMonthClose()}
                disabled={isRunningMonthClose || (monthCloseConfirmMode === 'close' && hasCloseBlockers)}
              >
                {isRunningMonthClose
                  ? 'Running...'
                  : monthCloseConfirmMode === 'retry'
                    ? 'Confirm retry'
                    : 'Confirm close'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  )
}
