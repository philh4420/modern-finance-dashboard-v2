import { useMemo, useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type {
  AccountEntry,
  CardEntry,
  PurchaseEntry,
  PurchaseId,
  ReconciliationStatus,
  TransactionRuleEntry,
} from '../components/financeTypes'
import { useOfflineQueue } from './useOfflineQueue'
import type { MutationHandlers } from './useMutationFeedback'

export type ReconcileAmountBand = 'all' | 'under_25' | '25_100' | '100_250' | '250_500' | '500_plus'

export type ReconcileFilter = {
  query: string
  status: 'all' | ReconciliationStatus
  category: string
  account: 'all' | string
  month: string
  startDate: string
  endDate: string
  amountBand: ReconcileAmountBand
  needsAttentionOnly: boolean
  sortBy: 'date' | 'amount' | 'item' | 'status'
  sortDir: 'asc' | 'desc'
}

export type ReconcileSourceOption = {
  value: string
  label: string
}

export type ReconcileSummary = {
  pendingCount: number
  pendingValue: number
  matchedTodayCount: number
  unresolvedDelta: number
  completionPercent: number
  totalCount: number
  reconciledCount: number
  needsAttentionCount: number
}

export type ReconcileMatchSuggestion = {
  id: string
  kind: 'rule' | 'history'
  purchaseId: PurchaseId
  confidence: number
  reason: string
  suggestedCategory: string
  suggestedStatus: ReconciliationStatus
  suggestedSourceKey: string
  suggestedSourceLabel: string
  counterpartPurchaseId?: PurchaseId
}

export type ReconcileDuplicateResolution = 'merge' | 'archive_duplicate' | 'mark_intentional'

export type ReconcileDuplicateMatch = {
  id: string
  kind: 'duplicate' | 'overlap'
  primaryPurchaseId: PurchaseId
  secondaryPurchaseId: PurchaseId
  primaryItem: string
  secondaryItem: string
  primaryAmount: number
  secondaryAmount: number
  primaryDate: string
  secondaryDate: string
  amountDeltaPercent: number
  dayDelta: number
  nameSimilarity: number
  confidence: number
  reason: string
}

export type ReconcileAnomalyKind =
  | 'unusual_amount'
  | 'missing_category'
  | 'stale_pending'
  | 'inconsistent_account_mapping'

export type ReconcileAnomalySignal = {
  id: string
  purchaseId: PurchaseId
  kind: ReconcileAnomalyKind
  severity: 'warning' | 'critical'
  label: string
  detail: string
}

type ReconcileUndoAction = {
  purchaseId: PurchaseId
  label: string
  previousStatus: ReconciliationStatus
  previousCategory: string
  previousStatementMonth: string
}

type UseReconciliationSectionArgs = {
  purchases: PurchaseEntry[]
  transactionRules: TransactionRuleEntry[]
  accounts: AccountEntry[]
  cards: CardEntry[]
  userId: string | null | undefined
  onQueueMetric?: (metric: {
    event: string
    queuedCount: number
    conflictCount: number
    flushAttempted: number
    flushSucceeded: number
  }) => void | Promise<void>
} & MutationHandlers

type PurchaseFundingSourceType = 'unassigned' | 'account' | 'card'

const msPerDay = 86400000
const purchaseArchivedMarker = '[purchase-archived-duplicate]'
const purchaseIntentionalMarkerPrefix = '[purchase-intentional-overlap:'
const merchantNoiseTokens = new Set([
  'payment',
  'card',
  'purchase',
  'shop',
  'online',
  'store',
  'ltd',
  'limited',
  'co',
  'service',
  'services',
  'subscription',
  'charge',
  'debit',
  'credit',
  'the',
  'and',
])

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const normalizeText = (value: string) => value.trim().toLowerCase()

const normalizeCategory = (value: string) => value.trim().toLowerCase()

const normalizeMerchantName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const tokenizeMerchantName = (value: string) =>
  normalizeMerchantName(value)
    .split(' ')
    .filter((token) => token.length > 1 && !merchantNoiseTokens.has(token))

const computeMerchantSimilarity = (left: string, right: string) => {
  const normalizedLeft = normalizeMerchantName(left)
  const normalizedRight = normalizeMerchantName(right)
  if (!normalizedLeft || !normalizedRight) return 0
  if (normalizedLeft === normalizedRight) return 1
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) return 0.92

  const leftTokens = new Set(tokenizeMerchantName(left))
  const rightTokens = new Set(tokenizeMerchantName(right))
  const union = new Set([...leftTokens, ...rightTokens])
  if (union.size === 0) return 0

  let overlap = 0
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) overlap += 1
  })
  return overlap / union.size
}

const daysBetweenIsoDates = (left: string, right: string) => {
  const leftAt = new Date(`${left}T00:00:00`).getTime()
  const rightAt = new Date(`${right}T00:00:00`).getTime()
  if (!Number.isFinite(leftAt) || !Number.isFinite(rightAt)) return Number.POSITIVE_INFINITY
  return Math.abs(Math.round((leftAt - rightAt) / msPerDay))
}

const statusFromPurchase = (purchase: PurchaseEntry): ReconciliationStatus => purchase.reconciliationStatus ?? 'posted'

const isLowSignalCategory = (value: string) => {
  const normalized = normalizeCategory(value)
  return normalized.length === 0 || normalized === 'other' || normalized === 'uncategorized' || normalized === 'split / review'
}

const resolveFundingSourceKey = (purchase: PurchaseEntry) => {
  if (purchase.fundingSourceType === 'account' && purchase.fundingSourceId) {
    return `account:${purchase.fundingSourceId}`
  }
  if (purchase.fundingSourceType === 'card' && purchase.fundingSourceId) {
    return `card:${purchase.fundingSourceId}`
  }
  return 'unassigned'
}

const decodeFundingSourceKey = (value: string): { fundingSourceType: PurchaseFundingSourceType; fundingSourceId?: string } => {
  if (value.startsWith('account:')) {
    const sourceId = value.slice('account:'.length)
    return sourceId ? { fundingSourceType: 'account', fundingSourceId: sourceId } : { fundingSourceType: 'unassigned' }
  }
  if (value.startsWith('card:')) {
    const sourceId = value.slice('card:'.length)
    return sourceId ? { fundingSourceType: 'card', fundingSourceId: sourceId } : { fundingSourceType: 'unassigned' }
  }
  return { fundingSourceType: 'unassigned' }
}

const matchesAmountBand = (amount: number, band: ReconcileAmountBand) => {
  const normalizedAmount = Math.abs(amount)
  if (band === 'under_25') return normalizedAmount < 25
  if (band === '25_100') return normalizedAmount >= 25 && normalizedAmount < 100
  if (band === '100_250') return normalizedAmount >= 100 && normalizedAmount < 250
  if (band === '250_500') return normalizedAmount >= 250 && normalizedAmount < 500
  if (band === '500_plus') return normalizedAmount >= 500
  return true
}

const normalizeMarkerNote = (notes: string | undefined, marker: string) => {
  const trimmedMarker = marker.trim()
  if (!trimmedMarker) return notes
  const segments = (notes ?? '')
    .split(' | ')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
  if (segments.includes(trimmedMarker)) {
    return segments.join(' | ')
  }
  return [...segments, trimmedMarker].join(' | ')
}

const hasArchivedPurchaseMarker = (notes?: string) => (notes ?? '').toLowerCase().includes(purchaseArchivedMarker)

const hasIntentionalPurchasePairMarker = (left: PurchaseEntry, right: PurchaseEntry) => {
  const leftNotes = (left.notes ?? '').toLowerCase()
  const rightNotes = (right.notes ?? '').toLowerCase()
  const leftTargetsRight = leftNotes.includes(`${purchaseIntentionalMarkerPrefix}${String(right._id).toLowerCase()}]`)
  const rightTargetsLeft = rightNotes.includes(`${purchaseIntentionalMarkerPrefix}${String(left._id).toLowerCase()}]`)
  return leftTargetsRight || rightTargetsLeft
}

const matchesRulePattern = (item: string, pattern: string, matchType: TransactionRuleEntry['matchType']) => {
  const normalizedItem = normalizeText(item)
  const normalizedPattern = normalizeText(pattern)
  if (!normalizedPattern) return false
  if (matchType === 'exact') return normalizedItem === normalizedPattern
  if (matchType === 'starts_with') return normalizedItem.startsWith(normalizedPattern)
  return normalizedItem.includes(normalizedPattern)
}

const extractMerchantPatternFromItem = (item: string) => {
  const tokens = tokenizeMerchantName(item)
  if (tokens.length === 0) {
    return item.trim().slice(0, 60)
  }
  return tokens.slice(0, 4).join(' ').slice(0, 60)
}

export const reconcileDefaultFilter: ReconcileFilter = {
  query: '',
  status: 'all',
  category: 'all',
  account: 'all',
  month: new Date().toISOString().slice(0, 7),
  startDate: '',
  endDate: '',
  amountBand: 'all',
  needsAttentionOnly: false,
  sortBy: 'date',
  sortDir: 'desc',
}

export const useReconciliationSection = ({
  purchases,
  transactionRules,
  accounts,
  cards,
  userId,
  onQueueMetric,
  clearError,
  handleMutationError,
}: UseReconciliationSectionArgs) => {
  const bulkUpdatePurchaseReconciliation = useMutation(api.phase2.bulkUpdatePurchaseReconciliation)
  const bulkUpdatePurchaseCategory = useMutation(api.phase2.bulkUpdatePurchaseCategory)
  const bulkDeletePurchases = useMutation(api.phase2.bulkDeletePurchases)
  const updatePurchase = useMutation(api.finance.updatePurchase)
  const removePurchase = useMutation(api.finance.removePurchase)
  const addTransactionRule = useMutation(api.phase2.addTransactionRule)
  const updateTransactionRule = useMutation(api.phase2.updateTransactionRule)

  const [filter, setFilter] = useState<ReconcileFilter>(reconcileDefaultFilter)
  const [selectedIds, setSelectedIds] = useState<PurchaseId[]>([])
  const [bulkCategory, setBulkCategory] = useState('')
  const [undoByPurchaseId, setUndoByPurchaseId] = useState<Record<string, ReconcileUndoAction>>({})
  const [ruleFeedback, setRuleFeedback] = useState<string | null>(null)

  const queue = useOfflineQueue({
    storageKey: 'finance-offline-queue-v2-reconcile',
    executors: {
      bulkUpdatePurchaseReconciliation: async (args) => {
        await bulkUpdatePurchaseReconciliation(args as Parameters<typeof bulkUpdatePurchaseReconciliation>[0])
      },
      bulkUpdatePurchaseCategory: async (args) => {
        await bulkUpdatePurchaseCategory(args as Parameters<typeof bulkUpdatePurchaseCategory>[0])
      },
      bulkDeletePurchases: async (args) => {
        await bulkDeletePurchases(args as Parameters<typeof bulkDeletePurchases>[0])
      },
      updatePurchase: async (args) => {
        await updatePurchase(args as Parameters<typeof updatePurchase>[0])
      },
      removePurchase: async (args) => {
        await removePurchase(args as Parameters<typeof removePurchase>[0])
      },
      addTransactionRule: async (args) => {
        await addTransactionRule(args as Parameters<typeof addTransactionRule>[0])
      },
      updateTransactionRule: async (args) => {
        await updateTransactionRule(args as Parameters<typeof updateTransactionRule>[0])
      },
    },
    userId,
    onMetric: onQueueMetric,
  })

  const accountNameById = useMemo(
    () => new Map<string, string>(accounts.map((account) => [String(account._id), account.name])),
    [accounts],
  )
  const cardNameById = useMemo(() => new Map<string, string>(cards.map((card) => [String(card._id), card.name])), [cards])

  const sourceOptions = useMemo<ReconcileSourceOption[]>(() => {
    const options = new Map<string, string>()
    options.set('unassigned', 'Unassigned cash pool')

    purchases.forEach((purchase) => {
      const key = resolveFundingSourceKey(purchase)
      if (key === 'unassigned') return
      if (key.startsWith('account:')) {
        const accountId = key.slice('account:'.length)
        const accountName = accountNameById.get(accountId) ?? 'Unknown account'
        options.set(key, `Account • ${accountName}`)
        return
      }
      if (key.startsWith('card:')) {
        const cardId = key.slice('card:'.length)
        const cardName = cardNameById.get(cardId) ?? 'Unknown card'
        options.set(key, `Card • ${cardName}`)
      }
    })

    return [{ value: 'all', label: 'All sources' }, ...Array.from(options.entries()).map(([value, label]) => ({ value, label }))].sort(
      (left, right) => {
        if (left.value === 'all') return -1
        if (right.value === 'all') return 1
        return left.label.localeCompare(right.label, undefined, { sensitivity: 'base' })
      },
    )
  }, [accountNameById, cardNameById, purchases])

  const sourceLabelByKey = useMemo(
    () => new Map<string, string>(sourceOptions.map((option) => [option.value, option.label])),
    [sourceOptions],
  )

  const purchaseById = useMemo(
    () => new Map<string, PurchaseEntry>(purchases.map((purchase) => [String(purchase._id), purchase])),
    [purchases],
  )

  const categories = useMemo(
    () => Array.from(new Set(purchases.map((purchase) => purchase.category))).sort((a, b) => a.localeCompare(b)),
    [purchases],
  )

  const filteredPurchases = useMemo(() => {
    const query = filter.query.trim().toLowerCase()

    const list = purchases.filter((purchase) => {
      const status = statusFromPurchase(purchase)
      const month = purchase.statementMonth ?? purchase.purchaseDate.slice(0, 7)
      const source = resolveFundingSourceKey(purchase)
      const purchaseAgeDays = Math.floor((Date.now() - new Date(`${purchase.purchaseDate}T00:00:00`).getTime()) / msPerDay)
      const needsAttention = status === 'pending' || isLowSignalCategory(purchase.category) || purchaseAgeDays > 30
      const matchesQuery =
        query.length === 0 ||
        purchase.item.toLowerCase().includes(query) ||
        purchase.category.toLowerCase().includes(query) ||
        (purchase.notes ?? '').toLowerCase().includes(query)
      const matchesStatus = filter.status === 'all' || status === filter.status
      const matchesCategory = filter.category === 'all' || purchase.category === filter.category
      const matchesSource = filter.account === 'all' || source === filter.account
      const matchesMonth = filter.month.length === 0 || month === filter.month
      const matchesStartDate = filter.startDate.length === 0 || purchase.purchaseDate >= filter.startDate
      const matchesEndDate = filter.endDate.length === 0 || purchase.purchaseDate <= filter.endDate
      const matchesAmount = matchesAmountBand(purchase.amount, filter.amountBand)
      const matchesNeedsAttention = !filter.needsAttentionOnly || needsAttention

      return (
        matchesQuery &&
        matchesStatus &&
        matchesCategory &&
        matchesSource &&
        matchesMonth &&
        matchesStartDate &&
        matchesEndDate &&
        matchesAmount &&
        matchesNeedsAttention
      )
    })

    list.sort((left, right) => {
      const direction = filter.sortDir === 'asc' ? 1 : -1
      if (filter.sortBy === 'amount') return (left.amount - right.amount) * direction
      if (filter.sortBy === 'item') return left.item.localeCompare(right.item) * direction
      if (filter.sortBy === 'status') return statusFromPurchase(left).localeCompare(statusFromPurchase(right)) * direction
      return left.purchaseDate.localeCompare(right.purchaseDate) * direction
    })

    return list
  }, [filter, purchases])

  const anomalyData = useMemo(() => {
    const signals: ReconcileAnomalySignal[] = []
    const byPurchase = new Map<string, ReconcileAnomalySignal[]>()
    const nowAt = new Date().setHours(0, 0, 0, 0)
    const amountValues = filteredPurchases.map((entry) => Math.abs(entry.amount))
    const amountMean =
      amountValues.length > 0 ? amountValues.reduce((sum, value) => sum + value, 0) / amountValues.length : 0
    const amountStd =
      amountValues.length > 1
        ? Math.sqrt(amountValues.reduce((sum, value) => sum + (value - amountMean) ** 2, 0) / amountValues.length)
        : 0

    const merchantSourceCounts = new Map<string, Map<string, number>>()
    purchases.forEach((purchase) => {
      const merchantKey = normalizeMerchantName(purchase.item)
      if (!merchantKey) return
      const sourceKey = resolveFundingSourceKey(purchase)
      if (sourceKey === 'unassigned') return
      const current = merchantSourceCounts.get(merchantKey) ?? new Map<string, number>()
      current.set(sourceKey, (current.get(sourceKey) ?? 0) + 1)
      merchantSourceCounts.set(merchantKey, current)
    })

    filteredPurchases.forEach((purchase) => {
      const purchaseSignals: ReconcileAnomalySignal[] = []
      const purchaseId = String(purchase._id)
      const status = statusFromPurchase(purchase)
      const sourceKey = resolveFundingSourceKey(purchase)
      const purchaseAt = new Date(`${purchase.purchaseDate}T00:00:00`).getTime()
      const ageDays = Number.isFinite(purchaseAt) ? Math.max(Math.floor((nowAt - purchaseAt) / msPerDay), 0) : 0

      if (isLowSignalCategory(purchase.category)) {
        purchaseSignals.push({
          id: `${purchaseId}:missing_category`,
          purchaseId: purchase._id,
          kind: 'missing_category',
          severity: 'warning',
          label: 'Missing category',
          detail: 'Set a specific category to improve forecasting and reporting accuracy.',
        })
      }

      if (status === 'pending' && ageDays > 14) {
        purchaseSignals.push({
          id: `${purchaseId}:stale_pending`,
          purchaseId: purchase._id,
          kind: 'stale_pending',
          severity: ageDays > 30 ? 'critical' : 'warning',
          label: `Pending for ${ageDays} day${ageDays === 1 ? '' : 's'}`,
          detail: 'Review and match this entry so unresolved delta does not stay inflated.',
        })
      }

      const normalizedAmount = Math.abs(purchase.amount)
      if (amountStd > 0 && normalizedAmount > amountMean + amountStd * 2.5 && normalizedAmount > 50) {
        purchaseSignals.push({
          id: `${purchaseId}:unusual_amount`,
          purchaseId: purchase._id,
          kind: 'unusual_amount',
          severity: normalizedAmount > amountMean + amountStd * 4 ? 'critical' : 'warning',
          label: 'Unusual amount',
          detail: `Amount is outside normal range for current filtered scope (${normalizedAmount.toFixed(2)}).`,
        })
      }

      const merchantKey = normalizeMerchantName(purchase.item)
      const sourceStats = merchantSourceCounts.get(merchantKey)
      if (sourceStats && sourceStats.size > 0) {
        let dominantSource = ''
        let dominantCount = 0
        let totalMapped = 0
        sourceStats.forEach((count, key) => {
          totalMapped += count
          if (count > dominantCount) {
            dominantCount = count
            dominantSource = key
          }
        })

        const dominanceRatio = totalMapped > 0 ? dominantCount / totalMapped : 0
        const sourceMismatch =
          dominantSource.length > 0 &&
          dominanceRatio >= 0.65 &&
          dominantCount >= 2 &&
          sourceKey !== dominantSource
        if (sourceMismatch) {
          const dominantLabel = sourceLabelByKey.get(dominantSource) ?? dominantSource
          const currentLabel = sourceLabelByKey.get(sourceKey) ?? sourceKey
          purchaseSignals.push({
            id: `${purchaseId}:inconsistent_source`,
            purchaseId: purchase._id,
            kind: 'inconsistent_account_mapping',
            severity: sourceKey === 'unassigned' ? 'critical' : 'warning',
            label: 'Inconsistent account mapping',
            detail: `Usually mapped to ${dominantLabel}; current row uses ${currentLabel}.`,
          })
        }
      }

      if (purchaseSignals.length > 0) {
        byPurchase.set(purchaseId, purchaseSignals)
        signals.push(...purchaseSignals)
      }
    })

    return {
      signals,
      byPurchase,
    }
  }, [filteredPurchases, purchases, sourceLabelByKey])

  const summary = useMemo<ReconcileSummary>(() => {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const startOfDayAt = startOfDay.getTime()

    const totals = filteredPurchases.reduce(
      (accumulator, purchase) => {
        const status = statusFromPurchase(purchase)
        if (status === 'pending') {
          accumulator.pendingCount += 1
          accumulator.pendingValue += purchase.amount
        }
        if (status === 'reconciled') {
          accumulator.reconciledCount += 1
        } else {
          accumulator.unresolvedDelta += purchase.amount
        }

        if ((anomalyData.byPurchase.get(String(purchase._id))?.length ?? 0) > 0) {
          accumulator.needsAttentionCount += 1
        }

        const matchedAt = purchase.reconciledAt ?? purchase.postedAt
        if (typeof matchedAt === 'number' && matchedAt >= startOfDayAt) {
          accumulator.matchedTodayCount += 1
        }
        return accumulator
      },
      {
        pendingCount: 0,
        pendingValue: 0,
        matchedTodayCount: 0,
        unresolvedDelta: 0,
        reconciledCount: 0,
        needsAttentionCount: 0,
      },
    )

    const totalCount = filteredPurchases.length
    return {
      ...totals,
      totalCount,
      completionPercent: totalCount === 0 ? 0 : (totals.reconciledCount / totalCount) * 100,
    }
  }, [anomalyData.byPurchase, filteredPurchases])

  const duplicateMatches = useMemo<ReconcileDuplicateMatch[]>(() => {
    const matches: ReconcileDuplicateMatch[] = []

    for (let leftIndex = 0; leftIndex < filteredPurchases.length; leftIndex += 1) {
      const left = filteredPurchases[leftIndex]
      for (let rightIndex = leftIndex + 1; rightIndex < filteredPurchases.length; rightIndex += 1) {
        const right = filteredPurchases[rightIndex]

        const leftOwnership = left.ownership ?? 'shared'
        const rightOwnership = right.ownership ?? 'shared'
        if (leftOwnership !== rightOwnership) continue
        if (hasArchivedPurchaseMarker(left.notes) || hasArchivedPurchaseMarker(right.notes)) continue
        if (hasIntentionalPurchasePairMarker(left, right)) continue

        const nameSimilarity = computeMerchantSimilarity(left.item, right.item)
        if (nameSimilarity < 0.58) continue

        const amountDelta = Math.abs(left.amount - right.amount)
        const amountDeltaPercent = amountDelta / Math.max(Math.max(left.amount, right.amount), 1)
        const dayDelta = daysBetweenIsoDates(left.purchaseDate, right.purchaseDate)
        const duplicateCandidate = nameSimilarity >= 0.9 && amountDeltaPercent <= 0.03 && dayDelta <= 2
        const overlapCandidate = nameSimilarity >= 0.7 && amountDeltaPercent <= 0.2 && dayDelta <= 7
        if (!duplicateCandidate && !overlapCandidate) continue

        const kind: ReconcileDuplicateMatch['kind'] = duplicateCandidate ? 'duplicate' : 'overlap'
        const confidence = clamp(
          nameSimilarity * 0.55 + (1 - clamp(amountDeltaPercent, 0, 1)) * 0.3 + clamp(1 - dayDelta / 14, 0, 1) * 0.15,
          0,
          1,
        )

        const primary = left.createdAt <= right.createdAt ? left : right
        const secondary = primary._id === left._id ? right : left
        matches.push({
          id: `${left._id}-${right._id}`,
          kind,
          primaryPurchaseId: primary._id,
          secondaryPurchaseId: secondary._id,
          primaryItem: primary.item,
          secondaryItem: secondary.item,
          primaryAmount: primary.amount,
          secondaryAmount: secondary.amount,
          primaryDate: primary.purchaseDate,
          secondaryDate: secondary.purchaseDate,
          amountDeltaPercent,
          dayDelta,
          nameSimilarity,
          confidence,
          reason:
            kind === 'duplicate'
              ? 'Very similar merchant, amount, and date.'
              : 'Likely overlap based on merchant similarity and timing.',
        })
      }
    }

    const kindRank = (value: ReconcileDuplicateMatch['kind']) => (value === 'duplicate' ? 0 : 1)
    return matches.sort((left, right) => {
      if (kindRank(left.kind) !== kindRank(right.kind)) return kindRank(left.kind) - kindRank(right.kind)
      if (left.confidence !== right.confidence) return right.confidence - left.confidence
      return left.dayDelta - right.dayDelta
    })
  }, [filteredPurchases])

  const matchSuggestions = useMemo<ReconcileMatchSuggestion[]>(() => {
    const activeRules = [...transactionRules]
      .filter((rule) => rule.active)
      .sort((left, right) => right.priority - left.priority || left.createdAt - right.createdAt)
    const pendingPurchases = filteredPurchases.filter((entry) => statusFromPurchase(entry) === 'pending')
    const postedOrReconciled = purchases.filter((entry) => statusFromPurchase(entry) !== 'pending')
    const suggestions: ReconcileMatchSuggestion[] = []

    pendingPurchases.forEach((pending) => {
      let bestSuggestion: ReconcileMatchSuggestion | null = null

      const matchedRule = activeRules.find((rule) => matchesRulePattern(pending.item, rule.merchantPattern, rule.matchType))
      if (matchedRule) {
        const sourceKey =
          matchedRule.fundingSourceType && matchedRule.fundingSourceType !== 'unassigned' && matchedRule.fundingSourceId
            ? `${matchedRule.fundingSourceType}:${matchedRule.fundingSourceId}`
            : 'unassigned'
        const baseScore =
          matchedRule.matchType === 'exact' ? 0.94 : matchedRule.matchType === 'starts_with' ? 0.86 : 0.76
        const confidence = clamp(
          baseScore +
            (matchedRule.reconciliationStatus ? 0.03 : 0) +
            (!isLowSignalCategory(matchedRule.category) ? 0.03 : 0) +
            (sourceKey !== 'unassigned' ? 0.04 : 0),
          0,
          0.99,
        )
        bestSuggestion = {
          id: `rule-${String(pending._id)}-${String(matchedRule._id)}`,
          kind: 'rule',
          purchaseId: pending._id,
          confidence,
          reason: `Rule "${matchedRule.name}" matched merchant pattern "${matchedRule.merchantPattern}".`,
          suggestedCategory: matchedRule.category,
          suggestedStatus: matchedRule.reconciliationStatus ?? 'posted',
          suggestedSourceKey: sourceKey,
          suggestedSourceLabel: sourceLabelByKey.get(sourceKey) ?? sourceKey,
        }
      }

      let bestHistoricalCandidate: ReconcileMatchSuggestion | null = null
      for (const candidate of postedOrReconciled) {
        const dayDelta = daysBetweenIsoDates(pending.purchaseDate, candidate.purchaseDate)
        if (dayDelta > 45) continue

        const merchantSimilarity = computeMerchantSimilarity(pending.item, candidate.item)
        if (merchantSimilarity < 0.45) continue
        const amountDeltaPercent = Math.abs(pending.amount - candidate.amount) / Math.max(Math.max(pending.amount, candidate.amount), 1)
        const amountScore = clamp(1 - amountDeltaPercent, 0, 1)
        const dateScore = clamp(1 - dayDelta / 30, 0, 1)
        const sourceScore = resolveFundingSourceKey(pending) === resolveFundingSourceKey(candidate) ? 0.06 : 0
        const categoryScore = normalizeText(pending.category) === normalizeText(candidate.category) ? 0.04 : 0
        const confidence = clamp(
          merchantSimilarity * 0.48 +
            amountScore * 0.32 +
            dateScore * 0.2 +
            sourceScore +
            categoryScore +
            (statusFromPurchase(candidate) === 'reconciled' ? 0.03 : 0),
          0,
          0.98,
        )
        if (confidence < 0.58) continue

        const sourceKey = resolveFundingSourceKey(candidate)
        const suggestion: ReconcileMatchSuggestion = {
          id: `history-${String(pending._id)}-${String(candidate._id)}`,
          kind: 'history',
          purchaseId: pending._id,
          confidence,
          reason: `Strong historical match to "${candidate.item}" (${dayDelta} day gap).`,
          suggestedCategory: isLowSignalCategory(candidate.category) ? pending.category : candidate.category,
          suggestedStatus: statusFromPurchase(candidate),
          suggestedSourceKey: sourceKey,
          suggestedSourceLabel: sourceLabelByKey.get(sourceKey) ?? sourceKey,
          counterpartPurchaseId: candidate._id,
        }

        if (!bestHistoricalCandidate || suggestion.confidence > bestHistoricalCandidate.confidence) {
          bestHistoricalCandidate = suggestion
        }
      }

      let winner: ReconcileMatchSuggestion | null = bestSuggestion
      if (bestHistoricalCandidate) {
        const winnerConfidence = winner?.confidence ?? -1
        if (bestHistoricalCandidate.confidence > winnerConfidence) {
          winner = bestHistoricalCandidate
        }
      }
      if (winner) {
        suggestions.push(winner)
      }
    })

    return suggestions.sort((left, right) => right.confidence - left.confidence)
  }, [filteredPurchases, purchases, sourceLabelByKey, transactionRules])

  const matchSuggestionById = useMemo(
    () => new Map<string, ReconcileMatchSuggestion>(matchSuggestions.map((suggestion) => [suggestion.id, suggestion])),
    [matchSuggestions],
  )

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selectedCount = selectedIds.length
  const selectedTotal = useMemo(
    () => purchases.filter((purchase) => selectedSet.has(purchase._id)).reduce((sum, purchase) => sum + purchase.amount, 0),
    [purchases, selectedSet],
  )

  const toggleSelected = (id: PurchaseId) => {
    setSelectedIds((previous) => (previous.includes(id) ? previous.filter((entry) => entry !== id) : [...previous, id]))
  }

  const toggleSelectVisible = () => {
    const visibleIds = filteredPurchases.map((purchase) => purchase._id)
    const allVisibleSelected = visibleIds.every((id) => selectedSet.has(id))
    if (allVisibleSelected) {
      setSelectedIds((previous) => previous.filter((id) => !visibleIds.includes(id)))
      return
    }
    setSelectedIds((previous) => Array.from(new Set([...previous, ...visibleIds])))
  }

  const clearSelection = () => {
    setSelectedIds([])
  }

  const runQueuedBulkStatus = async (input: Parameters<typeof bulkUpdatePurchaseReconciliation>[0]) => {
    await queue.runOrQueue(
      'bulkUpdatePurchaseReconciliation',
      input,
      async (args) => bulkUpdatePurchaseReconciliation(args as Parameters<typeof bulkUpdatePurchaseReconciliation>[0]),
    )
  }

  const runQueuedBulkCategory = async (input: Parameters<typeof bulkUpdatePurchaseCategory>[0]) => {
    await queue.runOrQueue(
      'bulkUpdatePurchaseCategory',
      input,
      async (args) => bulkUpdatePurchaseCategory(args as Parameters<typeof bulkUpdatePurchaseCategory>[0]),
    )
  }

  const runQueuedBulkDelete = async (input: Parameters<typeof bulkDeletePurchases>[0]) => {
    await queue.runOrQueue(
      'bulkDeletePurchases',
      input,
      async (args) => bulkDeletePurchases(args as Parameters<typeof bulkDeletePurchases>[0]),
    )
  }

  const runQueuedUpdatePurchase = async (input: Parameters<typeof updatePurchase>[0]) => {
    await queue.runOrQueue('updatePurchase', input, async (args) => updatePurchase(args as Parameters<typeof updatePurchase>[0]))
  }

  const runQueuedRemovePurchase = async (input: Parameters<typeof removePurchase>[0]) => {
    await queue.runOrQueue('removePurchase', input, async (args) => removePurchase(args as Parameters<typeof removePurchase>[0]))
  }

  const runQueuedAddRule = async (input: Parameters<typeof addTransactionRule>[0]) => {
    await queue.runOrQueue('addTransactionRule', input, async (args) => addTransactionRule(args as Parameters<typeof addTransactionRule>[0]))
  }

  const runQueuedUpdateRule = async (input: Parameters<typeof updateTransactionRule>[0]) => {
    await queue.runOrQueue(
      'updateTransactionRule',
      input,
      async (args) => updateTransactionRule(args as Parameters<typeof updateTransactionRule>[0]),
    )
  }

  const rememberUndo = (purchase: PurchaseEntry, label: string) => {
    setUndoByPurchaseId((previous) => ({
      ...previous,
      [String(purchase._id)]: {
        purchaseId: purchase._id,
        label,
        previousStatus: statusFromPurchase(purchase),
        previousCategory: purchase.category,
        previousStatementMonth: purchase.statementMonth ?? purchase.purchaseDate.slice(0, 7),
      },
    }))
  }

  const resolveStatementMonth = (purchase: PurchaseEntry) => purchase.statementMonth ?? (filter.month || purchase.purchaseDate.slice(0, 7))

  const buildPurchaseUpdatePayload = (
    entry: PurchaseEntry,
    overrides: Partial<{
      item: string
      amount: number
      category: string
      purchaseDate: string
      reconciliationStatus: ReconciliationStatus
      statementMonth: string
      ownership: PurchaseEntry['ownership']
      taxDeductible: boolean
      fundingSourceType: PurchaseEntry['fundingSourceType']
      fundingSourceId: string | undefined
      notes: string | undefined
      source: string
    }>,
  ) => {
    const fundingSourceType = overrides.fundingSourceType ?? entry.fundingSourceType ?? 'unassigned'
    const fundingSourceIdRaw = overrides.fundingSourceId ?? entry.fundingSourceId
    const fundingSourceId = fundingSourceType === 'unassigned' ? undefined : fundingSourceIdRaw
    const notesValue = overrides.notes

    return {
      id: entry._id,
      item: overrides.item ?? entry.item,
      amount: overrides.amount ?? entry.amount,
      category: overrides.category ?? entry.category,
      purchaseDate: overrides.purchaseDate ?? entry.purchaseDate,
      reconciliationStatus: (overrides.reconciliationStatus ?? statusFromPurchase(entry)) as ReconciliationStatus,
      statementMonth: overrides.statementMonth ?? entry.statementMonth ?? entry.purchaseDate.slice(0, 7),
      ownership: overrides.ownership ?? entry.ownership ?? 'shared',
      taxDeductible: overrides.taxDeductible ?? Boolean(entry.taxDeductible),
      fundingSourceType,
      fundingSourceId,
      notes: notesValue?.trim() ? notesValue.trim() : undefined,
      source: overrides.source,
    }
  }

  const runBulkStatus = async (status: ReconciliationStatus) => {
    if (selectedIds.length === 0) return
    clearError()
    try {
      await runQueuedBulkStatus({
        ids: selectedIds,
        reconciliationStatus: status,
        statementMonth: filter.month || undefined,
      })
      clearSelection()
    } catch (error) {
      handleMutationError(error)
    }
  }

  const runBulkCategory = async () => {
    if (selectedIds.length === 0 || bulkCategory.trim().length === 0) return
    clearError()
    try {
      await runQueuedBulkCategory({
        ids: selectedIds,
        category: bulkCategory,
      })
      clearSelection()
      setBulkCategory('')
    } catch (error) {
      handleMutationError(error)
    }
  }

  const runBulkMatch = async () => {
    await runBulkStatus('posted')
  }

  const runBulkMarkReconciled = async () => {
    await runBulkStatus('reconciled')
  }

  const runBulkExclude = async () => {
    if (selectedIds.length === 0) return
    clearError()
    try {
      await runQueuedBulkCategory({ ids: selectedIds, category: 'Excluded' })
      await runQueuedBulkStatus({
        ids: selectedIds,
        reconciliationStatus: 'reconciled',
        statementMonth: filter.month || undefined,
      })
      clearSelection()
    } catch (error) {
      handleMutationError(error)
    }
  }

  const runQuickMatch = async (purchaseId: PurchaseId) => {
    const purchase = purchaseById.get(String(purchaseId))
    if (!purchase) return
    clearError()
    try {
      rememberUndo(purchase, 'Match')
      await runQueuedBulkStatus({
        ids: [purchaseId],
        reconciliationStatus: 'posted',
        statementMonth: resolveStatementMonth(purchase),
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const runQuickSplit = async (purchaseId: PurchaseId) => {
    const purchase = purchaseById.get(String(purchaseId))
    if (!purchase) return
    clearError()
    try {
      rememberUndo(purchase, 'Split')
      await runQueuedBulkCategory({
        ids: [purchaseId],
        category: 'Split / review',
      })
      await runQueuedBulkStatus({
        ids: [purchaseId],
        reconciliationStatus: 'pending',
        statementMonth: resolveStatementMonth(purchase),
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const runQuickMarkReviewed = async (purchaseId: PurchaseId) => {
    const purchase = purchaseById.get(String(purchaseId))
    if (!purchase) return
    clearError()
    try {
      rememberUndo(purchase, 'Reviewed')
      await runQueuedBulkStatus({
        ids: [purchaseId],
        reconciliationStatus: 'reconciled',
        statementMonth: resolveStatementMonth(purchase),
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const runQuickExclude = async (purchaseId: PurchaseId) => {
    const purchase = purchaseById.get(String(purchaseId))
    if (!purchase) return
    clearError()
    try {
      rememberUndo(purchase, 'Exclude')
      await runQueuedBulkCategory({
        ids: [purchaseId],
        category: 'Excluded',
      })
      await runQueuedBulkStatus({
        ids: [purchaseId],
        reconciliationStatus: 'reconciled',
        statementMonth: resolveStatementMonth(purchase),
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const runQuickUndo = async (purchaseId: PurchaseId) => {
    const key = String(purchaseId)
    const action = undoByPurchaseId[key]
    if (!action) return
    clearError()
    try {
      await runQueuedBulkCategory({
        ids: [purchaseId],
        category: action.previousCategory,
      })
      await runQueuedBulkStatus({
        ids: [purchaseId],
        reconciliationStatus: action.previousStatus,
        statementMonth: action.previousStatementMonth,
      })
      setUndoByPurchaseId((previous) => {
        const next = { ...previous }
        delete next[key]
        return next
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const runBulkDelete = async () => {
    if (selectedIds.length === 0) return
    clearError()
    try {
      await runQueuedBulkDelete({
        ids: selectedIds,
      })
      clearSelection()
    } catch (error) {
      handleMutationError(error)
    }
  }

  const runApplyMatchSuggestion = async (suggestionId: string) => {
    const suggestion = matchSuggestionById.get(suggestionId)
    if (!suggestion) return
    const purchase = purchaseById.get(String(suggestion.purchaseId))
    if (!purchase) return
    clearError()
    try {
      const sourceMapping = decodeFundingSourceKey(suggestion.suggestedSourceKey)
      rememberUndo(purchase, 'Suggestion')
      await runQueuedUpdatePurchase(
        buildPurchaseUpdatePayload(purchase, {
          category: suggestion.suggestedCategory,
          reconciliationStatus: suggestion.suggestedStatus,
          statementMonth: resolveStatementMonth(purchase),
          fundingSourceType: sourceMapping.fundingSourceType,
          fundingSourceId: sourceMapping.fundingSourceId,
          source: 'reconcile_suggestion',
        }),
      )
    } catch (error) {
      handleMutationError(error)
    }
  }

  const runResolveDuplicateMatch = async (match: ReconcileDuplicateMatch, resolution: ReconcileDuplicateResolution) => {
    clearError()
    try {
      const primary = purchaseById.get(String(match.primaryPurchaseId))
      const secondary = purchaseById.get(String(match.secondaryPurchaseId))
      if (!primary || !secondary) {
        throw new Error('Duplicate pair no longer exists. Refresh and try again.')
      }

      if (resolution === 'merge') {
        const mergedNotes = normalizeMarkerNote(
          [primary.notes, secondary.notes].filter((value): value is string => Boolean(value && value.trim())).join(' | '),
          `[merged-purchase:${String(secondary._id)}]`,
        )
        await runQueuedUpdatePurchase(
          buildPurchaseUpdatePayload(primary, {
            notes: mergedNotes,
            source: 'duplicate_merge',
          }),
        )
        await runQueuedRemovePurchase({
          id: secondary._id,
          source: 'duplicate_merge',
        })
        setSelectedIds((previous) => previous.filter((id) => id !== secondary._id))
        return
      }

      if (resolution === 'archive_duplicate') {
        const archivedNotes = normalizeMarkerNote(
          normalizeMarkerNote(secondary.notes, purchaseArchivedMarker),
          `[purchase-duplicate-of:${String(primary._id)}]`,
        )
        await runQueuedUpdatePurchase(
          buildPurchaseUpdatePayload(secondary, {
            reconciliationStatus: 'pending',
            notes: archivedNotes,
            source: 'duplicate_archive',
          }),
        )
        return
      }

      const primaryTaggedNotes = normalizeMarkerNote(primary.notes, `${purchaseIntentionalMarkerPrefix}${String(secondary._id)}]`)
      const secondaryTaggedNotes = normalizeMarkerNote(
        secondary.notes,
        `${purchaseIntentionalMarkerPrefix}${String(primary._id)}]`,
      )
      await Promise.all([
        runQueuedUpdatePurchase(
          buildPurchaseUpdatePayload(primary, {
            notes: primaryTaggedNotes,
            source: 'duplicate_mark_intentional',
          }),
        ),
        runQueuedUpdatePurchase(
          buildPurchaseUpdatePayload(secondary, {
            notes: secondaryTaggedNotes,
            source: 'duplicate_mark_intentional',
          }),
        ),
      ])
    } catch (error) {
      handleMutationError(error)
    }
  }

  const runCreateOutcomeRuleFromPurchase = async (purchaseId: PurchaseId, sourceKeyOverride?: string) => {
    const purchase = purchaseById.get(String(purchaseId))
    if (!purchase) return
    clearError()
    try {
      const merchantPattern = extractMerchantPatternFromItem(purchase.item)
      if (!merchantPattern) {
        throw new Error('Could not create a rule pattern from this purchase item.')
      }
      const sourceKey = sourceKeyOverride ?? resolveFundingSourceKey(purchase)
      const sourceMapping = decodeFundingSourceKey(sourceKey)
      const existingRule = transactionRules.find(
        (rule) => rule.matchType === 'contains' && normalizeText(rule.merchantPattern) === normalizeText(merchantPattern),
      )
      if (existingRule) {
        await runQueuedUpdateRule({
          id: existingRule._id,
          name: existingRule.name,
          matchType: existingRule.matchType,
          merchantPattern: existingRule.merchantPattern,
          category: purchase.category,
          reconciliationStatus: statusFromPurchase(purchase),
          fundingSourceType: sourceMapping.fundingSourceType,
          fundingSourceId: sourceMapping.fundingSourceId,
          priority: Math.max(existingRule.priority, 90),
          active: true,
        })
        setRuleFeedback(`Updated rule "${existingRule.name}" from reconciliation outcome.`)
        return
      }

      await runQueuedAddRule({
        name: `Auto · ${merchantPattern.slice(0, 28)}`,
        matchType: 'contains',
        merchantPattern,
        category: purchase.category,
        reconciliationStatus: statusFromPurchase(purchase),
        fundingSourceType: sourceMapping.fundingSourceType,
        fundingSourceId: sourceMapping.fundingSourceId,
        priority: 90,
        active: true,
      })
      setRuleFeedback(`Created new rule for "${merchantPattern}".`)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const runCreateOutcomeRuleFromSuggestion = async (suggestionId: string) => {
    const suggestion = matchSuggestionById.get(suggestionId)
    if (!suggestion) return
    await runCreateOutcomeRuleFromPurchase(suggestion.purchaseId, suggestion.suggestedSourceKey)
  }

  return {
    filter,
    setFilter,
    sourceOptions,
    summary,
    categories,
    filteredPurchases,
    selectedIds,
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
    dismissRuleFeedback: () => setRuleFeedback(null),
    matchSuggestions,
    duplicateMatches,
    anomalySignals: anomalyData.signals,
    anomalySignalsByPurchaseId: anomalyData.byPurchase,
    queue,
  }
}
