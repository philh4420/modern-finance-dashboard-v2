import { useCallback, useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type {
  AccountEntry,
  CardEntry,
  ForecastWindow,
  GoalEntry,
  PurchaseDuplicateOverlapMatch,
  PurchaseDuplicateOverlapResolution,
  PurchaseEditDraft,
  PurchaseEntry,
  PurchaseFilter,
  PurchaseForm,
  PurchaseId,
  PurchaseImportInput,
  PurchaseSavedView,
  PurchaseSplitEntry,
  PurchaseSplitInput,
  PurchaseSplitTemplateEntry,
  PurchaseSplitTemplateLineInput,
  RecurringCandidate,
  ReconciliationStatus,
  UpcomingCashEvent,
} from './financeTypes'

type PurchaseSortKey =
  | 'date_desc'
  | 'date_asc'
  | 'amount_desc'
  | 'amount_asc'
  | 'status'
  | 'category_asc'
  | 'merchant_asc'

type PurchaseAnomalyKind = 'merchant_spike' | 'outlier_amount' | 'category_shift'
type PurchaseAnomalySeverity = 'warning' | 'critical'

type PurchaseAnomaly = {
  id: string
  kind: PurchaseAnomalyKind
  severity: PurchaseAnomalySeverity
  title: string
  detail: string
  amount: number
}

type PurchaseMerchantIntelligence = {
  id: string
  merchant: string
  total30: number
  total90: number
  total365: number
  avgTicket: number
  trendPercent: number
  priceCreep: boolean
}

type PurchaseSplitDraftRow = {
  id: string
  category: string
  amount: string
  goalId: string
  accountId: string
}

type PurchaseImportParseResult = {
  rows: PurchaseImportInput[]
  errors: string[]
}

type TimelineItem = {
  id: string
  label: string
  type: 'income' | 'bill' | 'card' | 'loan' | 'purchase'
  date: string
  amount: number
  daysAway: number
  source: 'timeline' | 'purchase_recurring'
}

const savedViewOptions: Array<{ value: PurchaseSavedView; label: string; detail: string }> = [
  { value: 'month_all', label: 'This month', detail: 'All statuses in the current month.' },
  { value: 'month_pending', label: 'Pending month', detail: 'Only pending purchases this month.' },
  { value: 'month_unreconciled', label: 'Posted month', detail: 'Posted but not reconciled this month.' },
  { value: 'month_reconciled', label: 'Reconciled month', detail: 'Only reconciled purchases this month.' },
  { value: 'all_unreconciled', label: 'All unreconciled', detail: 'Posted purchases across all months.' },
  { value: 'all_purchases', label: 'All purchases', detail: 'Every purchase, every status.' },
]

const msPerDay = 86400000
const numberFormatter = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 })

const roundCurrency = (value: number) => Math.round(value * 100) / 100

const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate())

const parseIsoDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

const parseAuditJson = <T,>(value?: string): T | undefined => {
  if (!value) return undefined
  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
  }
}

const statusOrder = (status: ReconciliationStatus) => {
  if (status === 'pending') return 0
  if (status === 'posted') return 1
  return 2
}

const statusLabel = (status: ReconciliationStatus) => {
  if (status === 'pending') return 'Pending'
  if (status === 'reconciled') return 'Reconciled'
  return 'Posted'
}

const statusPillClass = (status: ReconciliationStatus) => {
  if (status === 'pending') return 'pill pill--warning'
  if (status === 'reconciled') return 'pill pill--good'
  return 'pill pill--neutral'
}

const anomalySeverityPillClass = (severity: PurchaseAnomalySeverity) =>
  severity === 'critical' ? 'pill pill--critical' : 'pill pill--warning'

const ownershipLabel = (value: PurchaseEntry['ownership']) => {
  if (value === 'personal') return 'Personal'
  return 'Shared'
}

const duplicateKindLabel = (kind: PurchaseDuplicateOverlapMatch['kind']) => (kind === 'duplicate' ? 'Duplicate' : 'Overlap')

const duplicateKindPillClass = (kind: PurchaseDuplicateOverlapMatch['kind']) =>
  kind === 'duplicate' ? 'pill pill--critical' : 'pill pill--warning'

const csvSplitLine = (line: string) => {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"'
        index += 1
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
      continue
    }
    current += char
  }

  values.push(current.trim())
  return values
}

const parseImportBool = (value: string | undefined) => {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'y'
}

const normalizeImportStatus = (value: string | undefined): ReconciliationStatus | null => {
  if (!value || value.trim().length === 0) {
    return 'posted'
  }
  const normalized = value.trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_')
  if (normalized === 'pending' || normalized === 'posted' || normalized === 'reconciled') {
    return normalized
  }
  return null
}

const normalizeImportOwnership = (value: string | undefined): PurchaseImportInput['ownership'] | null => {
  if (!value || value.trim().length === 0) {
    return 'shared'
  }
  const normalized = value.trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_')
  if (normalized === 'shared' || normalized === 'household') return 'shared'
  if (normalized === 'personal') return 'personal'
  return null
}

const normalizeImportSourceType = (value: string | undefined): PurchaseImportInput['fundingSourceType'] | null => {
  if (!value || value.trim().length === 0) {
    return 'unassigned'
  }
  const normalized = value.trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_')
  if (normalized === 'unassigned' || normalized === 'none' || normalized === 'na') return 'unassigned'
  if (normalized === 'account' || normalized === 'bank') return 'account'
  if (normalized === 'card' || normalized === 'credit_card') return 'card'
  return null
}

const hasMonthPattern = (value: string) => /^\d{4}-\d{2}$/.test(value)
const hasDatePattern = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)

const buildImportRowsFromCsv = (csvText: string): PurchaseImportParseResult => {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return { rows: [], errors: ['Paste at least one CSV row to import.'] }
  }

  const firstColumns = csvSplitLine(lines[0]).map((value) => value.trim().toLowerCase())
  const hasHeader = firstColumns.some((value) =>
    ['item', 'merchant', 'description', 'amount', 'category', 'purchase_date', 'date', 'statement_month'].includes(value),
  )

  const headerRow = hasHeader ? firstColumns : []
  const rowLines = hasHeader ? lines.slice(1) : lines
  const errors: string[] = []
  const rows: PurchaseImportInput[] = []

  const resolveColumn = (columns: string[], aliases: string[], fallbackIndex: number) => {
    if (!hasHeader) {
      return columns[fallbackIndex] ?? ''
    }
    const index = headerRow.findIndex((value) => aliases.includes(value))
    if (index < 0) {
      return ''
    }
    return columns[index] ?? ''
  }

  rowLines.forEach((line, index) => {
    const columns = csvSplitLine(line)
    const item = resolveColumn(columns, ['item', 'merchant', 'description'], 0).trim()
    const amountText = resolveColumn(columns, ['amount', 'value'], 1).trim()
    const category = resolveColumn(columns, ['category'], 2).trim()
    const purchaseDate = resolveColumn(columns, ['purchase_date', 'date'], 3).trim()
    const statementMonthRaw = resolveColumn(columns, ['statement_month', 'month'], 4).trim()
    const statusRaw = resolveColumn(columns, ['status', 'reconciliation_status'], 5).trim()
    const ownershipRaw = resolveColumn(columns, ['ownership', 'scope'], 6).trim()
    const deductibleRaw = resolveColumn(columns, ['tax_deductible', 'deductible'], 7).trim()
    const sourceTypeRaw = resolveColumn(columns, ['funding_source_type', 'source_type'], 8).trim()
    const sourceIdRaw = resolveColumn(columns, ['funding_source_id', 'source_id'], 9).trim()
    const notes = resolveColumn(columns, ['notes', 'note'], 10).trim()

    if (!item) {
      errors.push(`Line ${index + 1}: missing item/merchant.`)
      return
    }

    const amount = Number.parseFloat(amountText)
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push(`Line ${index + 1}: amount must be a positive number.`)
      return
    }

    if (!category) {
      errors.push(`Line ${index + 1}: category is required.`)
      return
    }

    if (!hasDatePattern(purchaseDate) || parseIsoDate(purchaseDate) === null) {
      errors.push(`Line ${index + 1}: purchase date must be YYYY-MM-DD.`)
      return
    }

    const statementMonth = statementMonthRaw.length > 0 ? statementMonthRaw : purchaseDate.slice(0, 7)
    if (!hasMonthPattern(statementMonth)) {
      errors.push(`Line ${index + 1}: statement month must be YYYY-MM.`)
      return
    }

    const reconciliationStatus = normalizeImportStatus(statusRaw)
    if (!reconciliationStatus) {
      errors.push(`Line ${index + 1}: status must be pending, posted, or reconciled.`)
      return
    }

    const ownership = normalizeImportOwnership(ownershipRaw)
    if (!ownership) {
      errors.push(`Line ${index + 1}: ownership must be shared or personal.`)
      return
    }

    const fundingSourceType = normalizeImportSourceType(sourceTypeRaw)
    if (!fundingSourceType) {
      errors.push(`Line ${index + 1}: source type must be unassigned, account, or card.`)
      return
    }

    rows.push({
      item,
      amount: roundCurrency(amount),
      category,
      purchaseDate,
      statementMonth,
      reconciliationStatus,
      ownership,
      taxDeductible: parseImportBool(deductibleRaw),
      fundingSourceType,
      fundingSourceId: fundingSourceType === 'unassigned' ? undefined : sourceIdRaw || undefined,
      notes: notes || undefined,
    })
  })

  return { rows, errors }
}

type PurchasesTabProps = {
  accounts: AccountEntry[]
  cards: CardEntry[]
  goals: GoalEntry[]
  recurringCandidates: RecurringCandidate[]
  forecastWindows: ForecastWindow[]
  purchaseSplits: PurchaseSplitEntry[]
  purchaseSplitTemplates: PurchaseSplitTemplateEntry[]
  upcomingCashEvents: UpcomingCashEvent[]
  purchaseDuplicateOverlaps: PurchaseDuplicateOverlapMatch[]
  purchaseForm: PurchaseForm
  setPurchaseForm: Dispatch<SetStateAction<PurchaseForm>>
  purchaseFilter: PurchaseFilter
  setPurchaseFilter: Dispatch<SetStateAction<PurchaseFilter>>
  purchaseCategories: string[]
  filteredPurchases: PurchaseEntry[]
  filteredPurchaseTotal: number
  filteredPurchaseAverage: number
  monthPurchaseSummary: {
    monthTotal: number
    pendingTotal: number
    postedTotal: number
    reconciledTotal: number
    clearedTotal: number
    pendingCount: number
    postedCount: number
    reconciledCount: number
  }
  filteredStatusCounts: {
    pending: number
    posted: number
    reconciled: number
  }
  purchasesThisMonth: number
  pendingPurchaseAmountThisMonth: number
  pendingPurchases: number
  postedPurchases: number
  reconciledPurchases: number
  purchaseEditId: PurchaseId | null
  setPurchaseEditId: Dispatch<SetStateAction<PurchaseId | null>>
  purchaseEditDraft: PurchaseEditDraft
  setPurchaseEditDraft: Dispatch<SetStateAction<PurchaseEditDraft>>
  selectedPurchaseCount: number
  selectedPurchaseTotal: number
  selectedPurchaseSet: Set<PurchaseId>
  toggleSelectedPurchase: (id: PurchaseId) => void
  toggleSelectFilteredPurchases: () => void
  clearSelectedPurchases: () => void
  bulkCategory: string
  setBulkCategory: Dispatch<SetStateAction<string>>
  savedView: PurchaseSavedView
  applySavedView: (savedView: PurchaseSavedView) => void
  onAddPurchase: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onDeletePurchase: (id: PurchaseId) => Promise<void>
  savePurchaseEdit: () => Promise<void>
  startPurchaseEdit: (entry: PurchaseEntry) => void
  onSetPurchaseReconciliation: (id: PurchaseId, status: ReconciliationStatus) => Promise<void>
  duplicatePurchase: (entry: PurchaseEntry) => Promise<void>
  resolvePurchaseDuplicateOverlap: (
    match: PurchaseDuplicateOverlapMatch,
    resolution: PurchaseDuplicateOverlapResolution,
  ) => Promise<void>
  onConvertRecurringCandidateToBill: (candidateId: string) => Promise<void>
  upsertPurchaseSplits: (input: { purchaseId: PurchaseId; splits: PurchaseSplitInput[] }) => Promise<void>
  clearPurchaseSplitsForPurchase: (purchaseId: PurchaseId) => Promise<void>
  applyPurchaseSplitTemplateToPurchase: (input: {
    purchaseId: PurchaseId
    templateId: PurchaseSplitTemplateEntry['_id']
  }) => Promise<void>
  addPurchaseSplitTemplate: (input: { name: string; splits: PurchaseSplitTemplateLineInput[] }) => Promise<void>
  updatePurchaseSplitTemplate: (input: {
    id: PurchaseSplitTemplateEntry['_id']
    name: string
    splits: PurchaseSplitTemplateLineInput[]
  }) => Promise<void>
  removePurchaseSplitTemplate: (id: PurchaseSplitTemplateEntry['_id']) => Promise<void>
  importPurchasesFromRows: (rows: PurchaseImportInput[]) => Promise<{ created: number; failed: number; errors: string[] }>
  runBulkStatus: (status: ReconciliationStatus) => Promise<void>
  runBulkCategory: () => Promise<void>
  runBulkDelete: () => Promise<void>
  formatMoney: (value: number) => string
  dateLabel: Intl.DateTimeFormat
}

export function PurchasesTab({
  accounts = [],
  cards = [],
  goals = [],
  recurringCandidates = [],
  forecastWindows = [],
  purchaseSplits = [],
  purchaseSplitTemplates = [],
  upcomingCashEvents = [],
  purchaseDuplicateOverlaps = [],
  purchaseForm,
  setPurchaseForm,
  purchaseFilter,
  setPurchaseFilter,
  purchaseCategories = [],
  filteredPurchases = [],
  filteredPurchaseTotal,
  filteredPurchaseAverage,
  monthPurchaseSummary,
  filteredStatusCounts,
  purchasesThisMonth,
  pendingPurchaseAmountThisMonth,
  pendingPurchases,
  postedPurchases,
  reconciledPurchases,
  purchaseEditId,
  setPurchaseEditId,
  purchaseEditDraft,
  setPurchaseEditDraft,
  selectedPurchaseCount,
  selectedPurchaseTotal,
  selectedPurchaseSet,
  toggleSelectedPurchase,
  toggleSelectFilteredPurchases,
  clearSelectedPurchases,
  bulkCategory,
  setBulkCategory,
  savedView,
  applySavedView,
  onAddPurchase,
  onDeletePurchase,
  savePurchaseEdit,
  startPurchaseEdit,
  onSetPurchaseReconciliation,
  duplicatePurchase,
  resolvePurchaseDuplicateOverlap,
  onConvertRecurringCandidateToBill,
  upsertPurchaseSplits,
  clearPurchaseSplitsForPurchase,
  applyPurchaseSplitTemplateToPurchase,
  addPurchaseSplitTemplate,
  updatePurchaseSplitTemplate,
  removePurchaseSplitTemplate,
  importPurchasesFromRows,
  runBulkStatus,
  runBulkCategory,
  runBulkDelete,
  formatMoney,
  dateLabel,
}: PurchasesTabProps) {
  const [sortKey, setSortKey] = useState<PurchaseSortKey>('date_desc')
  const [resolvingDuplicateId, setResolvingDuplicateId] = useState<string | null>(null)
  const [convertingRecurringId, setConvertingRecurringId] = useState<string | null>(null)
  const [timelineWindowDays, setTimelineWindowDays] = useState<14 | 30>(14)
  const [splitPurchaseId, setSplitPurchaseId] = useState<PurchaseId | ''>('')
  const [splitDraftRows, setSplitDraftRows] = useState<PurchaseSplitDraftRow[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [splitTemplateName, setSplitTemplateName] = useState('')
  const [isSavingSplits, setIsSavingSplits] = useState(false)
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false)
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)
  const [isUpdatingTemplate, setIsUpdatingTemplate] = useState(false)
  const [isRemovingTemplate, setIsRemovingTemplate] = useState(false)
  const [bulkImportOpen, setBulkImportOpen] = useState(false)
  const [bulkImportCsvText, setBulkImportCsvText] = useState('')
  const [bulkImportRows, setBulkImportRows] = useState<PurchaseImportInput[]>([])
  const [bulkImportErrors, setBulkImportErrors] = useState<string[]>([])
  const [bulkImportMessage, setBulkImportMessage] = useState<string | null>(null)
  const [isBulkImporting, setIsBulkImporting] = useState(false)
  const [historyWindowDays, setHistoryWindowDays] = useState<30 | 90 | 365>(90)
  const [closeMonth, setCloseMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [monthCloseFeedback, setMonthCloseFeedback] = useState<string | null>(null)
  const [isRunningMonthClose, setIsRunningMonthClose] = useState(false)
  const runPurchaseMonthClose = useMutation(api.finance.runPurchaseMonthClose)

  const defaultMonth = new Date().toISOString().slice(0, 7)
  const today = useMemo(() => startOfDay(new Date()), [])

  const purchaseHistorySummary = useQuery(api.finance.getPurchaseHistorySummary, {
    windowDays: historyWindowDays,
  })
  const recentPurchaseMonthCloseRuns = useQuery(api.finance.getRecentPurchaseMonthCloseRuns, {
    limit: 8,
  }) ?? []
  const purchaseMutationHistory = usePaginatedQuery(
    api.finance.getPurchaseMutationHistoryPage,
    {
      month: purchaseFilter.month || undefined,
    },
    {
      initialNumItems: 12,
    },
  )

  const accountNameById = useMemo(
    () => new Map<string, string>(accounts.map((entry) => [String(entry._id), entry.name])),
    [accounts],
  )
  const cardNameById = useMemo(
    () => new Map<string, string>(cards.map((entry) => [String(entry._id), entry.name])),
    [cards],
  )
  const goalNameById = useMemo(
    () => new Map<string, string>(goals.map((entry) => [String(entry._id), entry.title])),
    [goals],
  )

  const purchasesById = useMemo(() => new Map(filteredPurchases.map((entry) => [String(entry._id), entry])), [filteredPurchases])
  const purchaseSplitMap = useMemo(() => {
    const map = new Map<string, PurchaseSplitEntry[]>()
    purchaseSplits.forEach((entry) => {
      const key = String(entry.purchaseId)
      const current = map.get(key) ?? []
      current.push(entry)
      map.set(key, current)
    })
    return map
  }, [purchaseSplits])

  const fundingLabelByEntry = (entry: Pick<PurchaseEntry, 'fundingSourceType' | 'fundingSourceId'>) => {
    const sourceType = entry.fundingSourceType ?? 'unassigned'
    if (sourceType === 'account') {
      if (!entry.fundingSourceId) return 'Account (unlinked)'
      return accountNameById.get(entry.fundingSourceId) ?? 'Account (not found)'
    }
    if (sourceType === 'card') {
      if (!entry.fundingSourceId) return 'Card (unlinked)'
      return cardNameById.get(entry.fundingSourceId) ?? 'Card (not found)'
    }
    return 'Unassigned source'
  }

  const visiblePurchases = useMemo(() => {
    const sorted = [...filteredPurchases].sort((left, right) => {
      const leftStatus = (left.reconciliationStatus ?? 'posted') as ReconciliationStatus
      const rightStatus = (right.reconciliationStatus ?? 'posted') as ReconciliationStatus

      switch (sortKey) {
        case 'date_desc':
          return right.purchaseDate.localeCompare(left.purchaseDate)
        case 'date_asc':
          return left.purchaseDate.localeCompare(right.purchaseDate)
        case 'amount_desc':
          return right.amount - left.amount
        case 'amount_asc':
          return left.amount - right.amount
        case 'status':
          return statusOrder(leftStatus) - statusOrder(rightStatus)
        case 'category_asc':
          return left.category.localeCompare(right.category, undefined, { sensitivity: 'base' })
        case 'merchant_asc':
          return left.item.localeCompare(right.item, undefined, { sensitivity: 'base' })
        default:
          return 0
      }
    })
    return sorted
  }, [filteredPurchases, sortKey])

  const allVisibleSelected =
    visiblePurchases.length > 0 && visiblePurchases.every((entry) => selectedPurchaseSet.has(entry._id))

  const insights = useMemo(() => {
    const uncategorized = filteredPurchases.filter((entry) => entry.category.trim().length === 0).length
    const personalSpend = filteredPurchases
      .filter((entry) => (entry.ownership ?? 'shared') === 'personal')
      .reduce((sum, entry) => sum + entry.amount, 0)
    const sharedSpend = filteredPurchases
      .filter((entry) => (entry.ownership ?? 'shared') !== 'personal')
      .reduce((sum, entry) => sum + entry.amount, 0)
    const deductibleCount = filteredPurchases.filter((entry) => Boolean(entry.taxDeductible)).length

    const merchantTotals = new Map<string, number>()
    filteredPurchases.forEach((entry) => {
      const key = entry.item.trim()
      merchantTotals.set(key, (merchantTotals.get(key) ?? 0) + entry.amount)
    })

    const topMerchants = [...merchantTotals.entries()]
      .map(([merchant, total]) => ({ merchant, total }))
      .sort((left, right) => right.total - left.total)
      .slice(0, 5)

    return {
      uncategorized,
      personalSpend,
      sharedSpend,
      deductibleCount,
      topMerchants,
    }
  }, [filteredPurchases])

  const duplicateSummary = useMemo(() => {
    const duplicatePairs = purchaseDuplicateOverlaps.filter((entry) => entry.kind === 'duplicate').length
    const overlapPairs = purchaseDuplicateOverlaps.filter((entry) => entry.kind === 'overlap').length
    const impacted = new Set<string>()
    purchaseDuplicateOverlaps.forEach((entry) => {
      impacted.add(String(entry.primaryPurchaseId))
      impacted.add(String(entry.secondaryPurchaseId))
    })
    return {
      duplicatePairs,
      overlapPairs,
      impactedCount: impacted.size,
    }
  }, [purchaseDuplicateOverlaps])

  const purchaseSummaryWindow = purchaseHistorySummary ?? {
    windowDays: historyWindowDays,
    totalPurchases: 0,
    totalAmount: 0,
    pendingCount: 0,
    postedCount: 0,
    reconciledCount: 0,
    missingCategoryCount: 0,
    duplicateCount: 0,
    anomalyCount: 0,
    mutationCount: 0,
    lastMutationAt: null as number | null,
    completedMonthCloseRuns: 0,
    failedMonthCloseRuns: 0,
    lastMonthCloseAt: null as number | null,
    lastCompletedMonthCloseKey: null as string | null,
  }

  const purchaseMutationRows = useMemo(() => {
    return (purchaseMutationHistory.results ?? []).map((event) => {
      const before = parseAuditJson<Record<string, unknown>>(event.beforeJson)
      const after = parseAuditJson<Record<string, unknown>>(event.afterJson)
      const metadata = parseAuditJson<Record<string, unknown>>(event.metadataJson)

      const source =
        typeof metadata?.source === 'string' && metadata.source.trim().length > 0
          ? metadata.source.trim()
          : 'manual'
      const beforeItem = typeof before?.item === 'string' ? before.item : null
      const afterItem = typeof after?.item === 'string' ? after.item : null
      const beforeAmount = typeof before?.amount === 'number' ? before.amount : null
      const afterAmount = typeof after?.amount === 'number' ? after.amount : null

      const detail = (() => {
        if (beforeItem && afterItem && beforeItem !== afterItem) {
          return `${beforeItem} -> ${afterItem}`
        }
        if (afterItem) {
          return afterItem
        }
        if (beforeItem) {
          return beforeItem
        }
        if (beforeAmount !== null && afterAmount !== null) {
          return `${beforeAmount.toFixed(2)} -> ${afterAmount.toFixed(2)}`
        }
        if (afterAmount !== null) {
          return afterAmount.toFixed(2)
        }
        if (beforeAmount !== null) {
          return beforeAmount.toFixed(2)
        }
        return '-'
      })()

      return {
        id: String(event._id),
        action: event.action,
        entityId: event.entityId,
        source,
        detail,
        createdAt: event.createdAt,
      }
    })
  }, [purchaseMutationHistory.results])

  const canLoadMoreMutationHistory = purchaseMutationHistory.status === 'CanLoadMore'
  const isLoadingMoreMutationHistory =
    purchaseMutationHistory.status === 'LoadingMore' || purchaseMutationHistory.status === 'LoadingFirstPage'

  const purchasesWithAge = useMemo(() => {
    return filteredPurchases
      .map((entry) => {
        const date = parseIsoDate(entry.purchaseDate)
        if (!date) return null
        const ageDays = Math.round((today.getTime() - startOfDay(date).getTime()) / msPerDay)
        return { entry, ageDays }
      })
      .filter((value): value is { entry: PurchaseEntry; ageDays: number } => value !== null)
  }, [filteredPurchases, today])

  const purchaseAnomalies = useMemo<PurchaseAnomaly[]>(() => {
    const anomalies: PurchaseAnomaly[] = []
    if (purchasesWithAge.length === 0) {
      return anomalies
    }

    const merchantBuckets = new Map<string, Array<{ amount: number; ageDays: number }>>()
    purchasesWithAge.forEach((row) => {
      const key = row.entry.item.trim().toLowerCase()
      const bucket = merchantBuckets.get(key) ?? []
      bucket.push({ amount: row.entry.amount, ageDays: row.ageDays })
      merchantBuckets.set(key, bucket)
    })

    merchantBuckets.forEach((rows, merchant) => {
      const recent30 = rows.filter((row) => row.ageDays >= 0 && row.ageDays <= 30).reduce((sum, row) => sum + row.amount, 0)
      const previous30 = rows
        .filter((row) => row.ageDays > 30 && row.ageDays <= 60)
        .reduce((sum, row) => sum + row.amount, 0)
      if (recent30 >= 120 && recent30 > previous30 * 1.8) {
        anomalies.push({
          id: `merchant_spike:${merchant}`,
          kind: 'merchant_spike',
          severity: recent30 > previous30 * 2.4 ? 'critical' : 'warning',
          title: `${merchant} spike`,
          detail: `${numberFormatter.format(Math.max(recent30 - previous30, 0))} higher than prior 30d.`,
          amount: recent30,
        })
      }
    })

    const amounts = purchasesWithAge.map((row) => row.entry.amount)
    const mean = amounts.reduce((sum, value) => sum + value, 0) / amounts.length
    const variance = amounts.reduce((sum, value) => sum + (value - mean) ** 2, 0) / amounts.length
    const stdDev = Math.sqrt(variance)
    const outlierThreshold = mean + stdDev * 2.5

    purchasesWithAge
      .filter((row) => row.entry.amount >= outlierThreshold && row.entry.amount >= 80)
      .slice(0, 5)
      .forEach((row) => {
        anomalies.push({
          id: `outlier:${row.entry._id}`,
          kind: 'outlier_amount',
          severity: row.entry.amount > outlierThreshold * 1.25 ? 'critical' : 'warning',
          title: `${row.entry.item} outlier amount`,
          detail: `Observed ${numberFormatter.format(row.entry.amount)} vs baseline ${numberFormatter.format(mean)}.`,
          amount: row.entry.amount,
        })
      })

    const recentTotal = purchasesWithAge
      .filter((row) => row.ageDays >= 0 && row.ageDays <= 30)
      .reduce((sum, row) => sum + row.entry.amount, 0)
    const previousTotal = purchasesWithAge
      .filter((row) => row.ageDays > 30 && row.ageDays <= 120)
      .reduce((sum, row) => sum + row.entry.amount, 0)

    if (recentTotal > 0 && previousTotal > 0) {
      const recentByCategory = new Map<string, number>()
      const previousByCategory = new Map<string, number>()
      purchasesWithAge.forEach((row) => {
        const category = row.entry.category.trim() || 'Uncategorized'
        if (row.ageDays >= 0 && row.ageDays <= 30) {
          recentByCategory.set(category, (recentByCategory.get(category) ?? 0) + row.entry.amount)
        } else if (row.ageDays > 30 && row.ageDays <= 120) {
          previousByCategory.set(category, (previousByCategory.get(category) ?? 0) + row.entry.amount)
        }
      })

      recentByCategory.forEach((recentAmount, category) => {
        const previousAmount = previousByCategory.get(category) ?? 0
        const recentShare = recentAmount / recentTotal
        const previousShare = previousAmount / previousTotal
        if (recentAmount >= 100 && recentShare - previousShare >= 0.2) {
          anomalies.push({
            id: `category_shift:${category}`,
            kind: 'category_shift',
            severity: recentShare - previousShare >= 0.3 ? 'critical' : 'warning',
            title: `${category} category shift`,
            detail: `Share moved from ${(previousShare * 100).toFixed(1)}% to ${(recentShare * 100).toFixed(1)}%.`,
            amount: recentAmount,
          })
        }
      })
    }

    const severityRank = (value: PurchaseAnomalySeverity) => (value === 'critical' ? 0 : 1)
    return anomalies
      .sort((left, right) => {
        if (severityRank(left.severity) !== severityRank(right.severity)) {
          return severityRank(left.severity) - severityRank(right.severity)
        }
        return right.amount - left.amount
      })
      .slice(0, 10)
  }, [purchasesWithAge])

  const merchantIntelligence = useMemo<PurchaseMerchantIntelligence[]>(() => {
    const byMerchant = new Map<string, PurchaseEntry[]>()
    purchasesWithAge.forEach(({ entry }) => {
      const key = entry.item.trim()
      const rows = byMerchant.get(key) ?? []
      rows.push(entry)
      byMerchant.set(key, rows)
    })

    const rows: PurchaseMerchantIntelligence[] = []
    byMerchant.forEach((entries, merchant) => {
      const amountForWindow = (minAge: number, maxAge: number) =>
        entries.reduce((sum, entry) => {
          const parsed = parseIsoDate(entry.purchaseDate)
          if (!parsed) return sum
          const ageDays = Math.round((today.getTime() - startOfDay(parsed).getTime()) / msPerDay)
          if (ageDays < minAge || ageDays > maxAge) return sum
          return sum + entry.amount
        }, 0)

      const total30 = roundCurrency(amountForWindow(0, 30))
      const total90 = roundCurrency(amountForWindow(0, 90))
      const total365 = roundCurrency(amountForWindow(0, 365))
      const previous30 = roundCurrency(amountForWindow(31, 60))
      const count90 = entries.filter((entry) => {
        const parsed = parseIsoDate(entry.purchaseDate)
        if (!parsed) return false
        const ageDays = Math.round((today.getTime() - startOfDay(parsed).getTime()) / msPerDay)
        return ageDays >= 0 && ageDays <= 90
      }).length
      const avgTicket = count90 > 0 ? roundCurrency(total90 / count90) : 0
      const trendPercent =
        previous30 > 0 ? roundCurrency(((total30 - previous30) / previous30) * 100) : total30 > 0 ? 100 : 0

      const recentTicketSamples = entries
        .filter((entry) => {
          const parsed = parseIsoDate(entry.purchaseDate)
          if (!parsed) return false
          const ageDays = Math.round((today.getTime() - startOfDay(parsed).getTime()) / msPerDay)
          return ageDays >= 0 && ageDays <= 90
        })
        .map((entry) => entry.amount)
      const olderTicketSamples = entries
        .filter((entry) => {
          const parsed = parseIsoDate(entry.purchaseDate)
          if (!parsed) return false
          const ageDays = Math.round((today.getTime() - startOfDay(parsed).getTime()) / msPerDay)
          return ageDays > 90 && ageDays <= 365
        })
        .map((entry) => entry.amount)

      const recentAvg =
        recentTicketSamples.length > 0
          ? recentTicketSamples.reduce((sum, amount) => sum + amount, 0) / recentTicketSamples.length
          : 0
      const olderAvg =
        olderTicketSamples.length > 0
          ? olderTicketSamples.reduce((sum, amount) => sum + amount, 0) / olderTicketSamples.length
          : 0
      const priceCreep = olderAvg > 0 && recentAvg > olderAvg * 1.15 && recentTicketSamples.length >= 2

      rows.push({
        id: merchant.toLowerCase(),
        merchant,
        total30,
        total90,
        total365,
        avgTicket,
        trendPercent,
        priceCreep,
      })
    })

    return rows
      .sort((left, right) => right.total90 - left.total90 || left.merchant.localeCompare(right.merchant))
      .slice(0, 8)
  }, [purchasesWithAge, today])

  const recurringCandidatesSorted = useMemo(
    () => [...recurringCandidates].sort((left, right) => right.confidence - left.confidence || right.count - left.count),
    [recurringCandidates],
  )

  const purchaseRunRate = useMemo(() => {
    const totalForDays = (days: number) =>
      purchasesWithAge
        .filter((entry) => entry.ageDays >= 0 && entry.ageDays <= days)
        .reduce((sum, entry) => sum + entry.entry.amount, 0)

    const total30 = roundCurrency(totalForDays(30))
    const total90 = roundCurrency(totalForDays(90))
    const total365 = roundCurrency(totalForDays(365))

    return {
      total30,
      total90,
      total365,
      monthlyFrom90: roundCurrency((total90 / 90) * 30),
      monthlyFrom365: roundCurrency((total365 / 365) * 30),
    }
  }, [purchasesWithAge])

  const forecastRows = useMemo(() => {
    return [...forecastWindows].sort((left, right) => left.days - right.days)
  }, [forecastWindows])

  const timelineItems = useMemo<TimelineItem[]>(() => {
    const timelineRows = upcomingCashEvents.map((event) => ({
      id: event.id,
      label: event.label,
      type: event.type,
      date: event.date,
      amount: event.amount,
      daysAway: event.daysAway,
      source: 'timeline' as const,
    }))

    const recurringRows: TimelineItem[] = recurringCandidates
      .map<TimelineItem | null>((candidate) => {
        const eventDate = parseIsoDate(candidate.nextExpectedDate)
        if (!eventDate) return null
        const daysAway = Math.round((startOfDay(eventDate).getTime() - today.getTime()) / msPerDay)
        return {
          id: `purchase-recurring-${candidate.id}`,
          label: `${candidate.label} (predicted spend)`,
          type: 'purchase' as const,
          date: candidate.nextExpectedDate,
          amount: roundCurrency(candidate.averageAmount),
          daysAway,
          source: 'purchase_recurring' as const,
        }
      })
      .filter((entry): entry is TimelineItem => entry !== null)

    return [...timelineRows, ...recurringRows]
      .filter((entry) => entry.daysAway >= 0)
      .sort((left, right) => {
        if (left.date !== right.date) {
          return left.date.localeCompare(right.date)
        }
        if (left.type === 'income' && right.type !== 'income') return -1
        if (right.type === 'income' && left.type !== 'income') return 1
        return right.amount - left.amount
      })
  }, [recurringCandidates, today, upcomingCashEvents])

  const visibleTimelineItems = useMemo(
    () => timelineItems.filter((entry) => entry.daysAway <= timelineWindowDays).slice(0, 18),
    [timelineItems, timelineWindowDays],
  )
  const timelineNetImpact = useMemo(
    () =>
      visibleTimelineItems.reduce(
        (sum, entry) => sum + (entry.type === 'income' ? entry.amount : -entry.amount),
        0,
      ),
    [visibleTimelineItems],
  )

  const selectedSplitPurchase = useMemo(() => {
    if (!splitPurchaseId) return null
    return purchasesById.get(String(splitPurchaseId)) ?? null
  }, [purchasesById, splitPurchaseId])

  const selectedTemplate = useMemo(
    () => purchaseSplitTemplates.find((entry) => String(entry._id) === selectedTemplateId) ?? null,
    [purchaseSplitTemplates, selectedTemplateId],
  )

  const splitDraftTotal = useMemo(() => {
    return roundCurrency(
      splitDraftRows.reduce((sum, line) => {
        const value = Number.parseFloat(line.amount)
        return sum + (Number.isFinite(value) ? value : 0)
      }, 0),
    )
  }, [splitDraftRows])

  const splitDraftDelta = useMemo(() => {
    if (!selectedSplitPurchase) return 0
    return roundCurrency(splitDraftTotal - selectedSplitPurchase.amount)
  }, [selectedSplitPurchase, splitDraftTotal])

  const buildDefaultSplitDraftRows = useCallback((purchase: PurchaseEntry): PurchaseSplitDraftRow[] => {
    const existing = purchaseSplitMap.get(String(purchase._id)) ?? []
    if (existing.length > 0) {
      return existing.map((line, index) => ({
        id: `${String(line._id)}-${index}`,
        category: line.category,
        amount: String(line.amount),
        goalId: line.goalId ? String(line.goalId) : '',
        accountId: line.accountId ? String(line.accountId) : '',
      }))
    }
    return [
      {
        id: `default-${String(purchase._id)}`,
        category: purchase.category,
        amount: String(roundCurrency(purchase.amount)),
        goalId: '',
        accountId: '',
      },
    ]
  }, [purchaseSplitMap])

  useEffect(() => {
    if (splitPurchaseId) {
      const selected = purchasesById.get(String(splitPurchaseId))
      if (!selected) {
        setSplitPurchaseId('')
      }
      return
    }
    if (visiblePurchases.length > 0) {
      setSplitPurchaseId(visiblePurchases[0]._id)
    }
  }, [purchasesById, splitPurchaseId, visiblePurchases])

  useEffect(() => {
    if (!selectedSplitPurchase) {
      setSplitDraftRows([])
      return
    }
    setSplitDraftRows(buildDefaultSplitDraftRows(selectedSplitPurchase))
  }, [buildDefaultSplitDraftRows, selectedSplitPurchase])

  const onRunDuplicateAction = async (
    match: PurchaseDuplicateOverlapMatch,
    resolution: PurchaseDuplicateOverlapResolution,
  ) => {
    if (resolution !== 'mark_intentional') {
      const confirmed = window.confirm(
        resolution === 'merge'
          ? 'Merge this pair? This keeps the primary record and removes the secondary purchase.'
          : 'Archive this duplicate? This keeps both records but archives the secondary as pending.',
      )
      if (!confirmed) return
    }

    setResolvingDuplicateId(match.id)
    try {
      await resolvePurchaseDuplicateOverlap(match, resolution)
    } finally {
      setResolvingDuplicateId(null)
    }
  }

  const onConvertRecurring = async (candidateId: string) => {
    setConvertingRecurringId(candidateId)
    try {
      await onConvertRecurringCandidateToBill(candidateId)
    } finally {
      setConvertingRecurringId(null)
    }
  }

  const updateSplitDraftRow = (id: string, patch: Partial<PurchaseSplitDraftRow>) => {
    setSplitDraftRows((previous) =>
      previous.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    )
  }

  const addSplitDraftRow = () => {
    setSplitDraftRows((previous) => [
      ...previous,
      {
        id: `split-${Date.now()}-${previous.length}`,
        category: '',
        amount: '',
        goalId: '',
        accountId: '',
      },
    ])
  }

  const removeSplitDraftRow = (id: string) => {
    setSplitDraftRows((previous) => previous.filter((row) => row.id !== id))
  }

  const normalizeSplitRowsForSave = (): PurchaseSplitInput[] => {
    const normalized = splitDraftRows.map((row, index) => {
      const category = row.category.trim()
      const amount = Number.parseFloat(row.amount)
      if (!category) {
        throw new Error(`Split line ${index + 1} is missing a category.`)
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(`Split line ${index + 1} amount must be greater than zero.`)
      }
      return {
        category,
        amount: roundCurrency(amount),
        goalId: row.goalId ? (row.goalId as GoalEntry['_id']) : undefined,
        accountId: row.accountId ? (row.accountId as AccountEntry['_id']) : undefined,
      }
    })
    return normalized
  }

  const toTemplateLinesFromDraft = (): PurchaseSplitTemplateLineInput[] => {
    const normalizedSplits = normalizeSplitRowsForSave()
    const total = normalizedSplits.reduce((sum, row) => sum + row.amount, 0)
    if (total <= 0) {
      throw new Error('Split total must be greater than zero to build a template.')
    }

    const templateLines = normalizedSplits.map((row) => ({
      category: row.category,
      percentage: roundCurrency((row.amount / total) * 100),
      goalId: row.goalId,
      accountId: row.accountId,
    }))

    const sumPercentages = roundCurrency(templateLines.reduce((sum, line) => sum + line.percentage, 0))
    const remainder = roundCurrency(100 - sumPercentages)
    if (templateLines.length > 0 && Math.abs(remainder) > 0.001) {
      templateLines[templateLines.length - 1] = {
        ...templateLines[templateLines.length - 1],
        percentage: roundCurrency(templateLines[templateLines.length - 1].percentage + remainder),
      }
    }

    return templateLines
  }

  const onSaveSplitDraft = async () => {
    if (!selectedSplitPurchase) return
    setIsSavingSplits(true)
    try {
      await upsertPurchaseSplits({
        purchaseId: selectedSplitPurchase._id,
        splits: normalizeSplitRowsForSave(),
      })
      setBulkImportMessage('Saved purchase split allocation.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save split.'
      setBulkImportMessage(message)
    } finally {
      setIsSavingSplits(false)
    }
  }

  const onClearSplitDraft = async () => {
    if (!selectedSplitPurchase) return
    const confirmed = window.confirm('Clear all splits for this purchase?')
    if (!confirmed) return

    setIsSavingSplits(true)
    try {
      await clearPurchaseSplitsForPurchase(selectedSplitPurchase._id)
      setBulkImportMessage('Cleared purchase splits.')
    } finally {
      setIsSavingSplits(false)
    }
  }

  const onApplyTemplate = async () => {
    if (!selectedSplitPurchase || !selectedTemplate) return
    setIsApplyingTemplate(true)
    try {
      await applyPurchaseSplitTemplateToPurchase({
        purchaseId: selectedSplitPurchase._id,
        templateId: selectedTemplate._id,
      })
      setBulkImportMessage(`Applied template "${selectedTemplate.name}".`)
    } finally {
      setIsApplyingTemplate(false)
    }
  }

  const onCreateTemplateFromDraft = async () => {
    const name = splitTemplateName.trim()
    if (!name) {
      setBulkImportMessage('Enter a split template name first.')
      return
    }

    setIsSavingTemplate(true)
    try {
      await addPurchaseSplitTemplate({
        name,
        splits: toTemplateLinesFromDraft(),
      })
      setSplitTemplateName('')
      setBulkImportMessage(`Created split template "${name}".`)
    } finally {
      setIsSavingTemplate(false)
    }
  }

  const onUpdateSelectedTemplateFromDraft = async () => {
    if (!selectedTemplate) {
      setBulkImportMessage('Select a template to update.')
      return
    }
    const nextName = splitTemplateName.trim() || selectedTemplate.name

    setIsUpdatingTemplate(true)
    try {
      await updatePurchaseSplitTemplate({
        id: selectedTemplate._id,
        name: nextName,
        splits: toTemplateLinesFromDraft(),
      })
      setBulkImportMessage(`Updated template "${nextName}".`)
    } finally {
      setIsUpdatingTemplate(false)
    }
  }

  const onRemoveSelectedTemplate = async () => {
    if (!selectedTemplate) return
    const confirmed = window.confirm(`Remove template "${selectedTemplate.name}"?`)
    if (!confirmed) return

    setIsRemovingTemplate(true)
    try {
      await removePurchaseSplitTemplate(selectedTemplate._id)
      setSelectedTemplateId('')
      setBulkImportMessage(`Removed template "${selectedTemplate.name}".`)
    } finally {
      setIsRemovingTemplate(false)
    }
  }

  const parseBulkImportCsv = () => {
    const parsed = buildImportRowsFromCsv(bulkImportCsvText)
    setBulkImportRows(parsed.rows)
    setBulkImportErrors(parsed.errors)
    if (parsed.errors.length > 0) {
      setBulkImportMessage(parsed.errors.slice(0, 2).join(' '))
    } else if (parsed.rows.length > 0) {
      setBulkImportMessage(`Parsed ${parsed.rows.length} row(s). Review and commit.`)
    } else {
      setBulkImportMessage(null)
    }
  }

  const runBulkImportCommit = async () => {
    if (bulkImportRows.length === 0) {
      setBulkImportMessage('No parsed rows to import.')
      return
    }
    setIsBulkImporting(true)
    try {
      const result = await importPurchasesFromRows(bulkImportRows)
      if (result.failed === 0) {
        setBulkImportMessage(`Imported ${result.created} row(s) successfully.`)
        setBulkImportRows([])
        setBulkImportCsvText('')
        setBulkImportErrors([])
      } else {
        setBulkImportMessage(
          `Imported ${result.created} row(s), failed ${result.failed}. ${result.errors.slice(0, 1).join(' ')}`,
        )
      }
    } finally {
      setIsBulkImporting(false)
    }
  }

  const onRunPurchaseMonthCloseNow = async () => {
    if (!closeMonth || !hasMonthPattern(closeMonth)) {
      setMonthCloseFeedback('Select a valid month in YYYY-MM format.')
      return
    }

    setIsRunningMonthClose(true)
    setMonthCloseFeedback(null)
    try {
      const result = await runPurchaseMonthClose({
        month: closeMonth,
        source: 'manual',
        idempotencyKey: `manual:${closeMonth}`,
      })
      const summary = result.summary
      setMonthCloseFeedback(
        `${result.wasDeduplicated ? 'Already completed for this month key.' : 'Month close completed.'} ${summary.purchaseCount} purchases, ${formatMoney(summary.totalAmount)} cleared, ${summary.pendingCount} pending.`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Month close run failed.'
      setMonthCloseFeedback(message)
    } finally {
      setIsRunningMonthClose(false)
    }
  }

  return (
    <section className="editor-grid purchases-tab-shell" aria-label="Purchase management">
      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Purchases</p>
            <h2>Add purchase</h2>
            <p className="panel-value">
              {formatMoney(monthPurchaseSummary.monthTotal)} this month · {formatMoney(monthPurchaseSummary.clearedTotal)} cleared
            </p>
            <p className="subnote">
              {monthPurchaseSummary.pendingCount} pending ({formatMoney(monthPurchaseSummary.pendingTotal)}) ·{' '}
              {monthPurchaseSummary.postedCount} posted · {monthPurchaseSummary.reconciledCount} reconciled
            </p>
          </div>
        </header>

        <form className="entry-form entry-form--grid" onSubmit={onAddPurchase} aria-describedby="purchase-form-hint">
          <div className="form-grid">
            <div className="form-field form-field--span2">
              <label htmlFor="purchase-item">Merchant / item</label>
              <input
                id="purchase-item"
                value={purchaseForm.item}
                onChange={(event) => setPurchaseForm((prev) => ({ ...prev, item: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="purchase-amount">Amount</label>
              <input
                id="purchase-amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={purchaseForm.amount}
                onChange={(event) => setPurchaseForm((prev) => ({ ...prev, amount: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="purchase-category">Category</label>
              <input
                id="purchase-category"
                list="purchase-category-list"
                value={purchaseForm.category}
                onChange={(event) => setPurchaseForm((prev) => ({ ...prev, category: event.target.value }))}
                required
              />
              <datalist id="purchase-category-list">
                {purchaseCategories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </div>

            <div className="form-field">
              <label htmlFor="purchase-date">Purchase date</label>
              <input
                id="purchase-date"
                type="date"
                value={purchaseForm.purchaseDate}
                onChange={(event) => setPurchaseForm((prev) => ({ ...prev, purchaseDate: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="purchase-statement-month">Statement month</label>
              <input
                id="purchase-statement-month"
                type="month"
                value={purchaseForm.statementMonth}
                onChange={(event) => setPurchaseForm((prev) => ({ ...prev, statementMonth: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="purchase-reconciliation-status">Status</label>
              <select
                id="purchase-reconciliation-status"
                value={purchaseForm.reconciliationStatus}
                onChange={(event) =>
                  setPurchaseForm((prev) => ({
                    ...prev,
                    reconciliationStatus: event.target.value as ReconciliationStatus,
                  }))
                }
              >
                <option value="pending">Pending</option>
                <option value="posted">Posted</option>
                <option value="reconciled">Reconciled</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="purchase-ownership">Ownership</label>
              <select
                id="purchase-ownership"
                value={purchaseForm.ownership}
                onChange={(event) =>
                  setPurchaseForm((prev) => ({
                    ...prev,
                    ownership: event.target.value as PurchaseForm['ownership'],
                  }))
                }
              >
                <option value="shared">Shared / household</option>
                <option value="personal">Personal</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="purchase-source-type">Funding source type</label>
              <select
                id="purchase-source-type"
                value={purchaseForm.fundingSourceType}
                onChange={(event) =>
                  setPurchaseForm((prev) => ({
                    ...prev,
                    fundingSourceType: event.target.value as PurchaseForm['fundingSourceType'],
                    fundingSourceId: '',
                  }))
                }
              >
                <option value="unassigned">Unassigned</option>
                <option value="account">Account</option>
                <option value="card">Card</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="purchase-source-id">Source</label>
              <select
                id="purchase-source-id"
                value={purchaseForm.fundingSourceId}
                onChange={(event) => setPurchaseForm((prev) => ({ ...prev, fundingSourceId: event.target.value }))}
                disabled={purchaseForm.fundingSourceType === 'unassigned'}
              >
                <option value="">
                  {purchaseForm.fundingSourceType === 'account'
                    ? 'Select account'
                    : purchaseForm.fundingSourceType === 'card'
                      ? 'Select card'
                      : 'No source needed'}
                </option>
                {purchaseForm.fundingSourceType === 'account'
                  ? accounts.map((entry) => (
                      <option key={entry._id} value={String(entry._id)}>
                        {entry.name}
                      </option>
                    ))
                  : null}
                {purchaseForm.fundingSourceType === 'card'
                  ? cards.map((entry) => (
                      <option key={entry._id} value={String(entry._id)}>
                        {entry.name}
                      </option>
                    ))
                  : null}
              </select>
            </div>

            <label className="checkbox-row form-field--span2" htmlFor="purchase-tax-deductible">
              <input
                id="purchase-tax-deductible"
                type="checkbox"
                checked={purchaseForm.taxDeductible}
                onChange={(event) => setPurchaseForm((prev) => ({ ...prev, taxDeductible: event.target.checked }))}
              />
              Tax deductible
            </label>

            <div className="form-field form-field--span2">
              <label htmlFor="purchase-notes">Notes</label>
              <textarea
                id="purchase-notes"
                rows={3}
                placeholder="Optional"
                value={purchaseForm.notes}
                onChange={(event) => setPurchaseForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>
          </div>

          <p id="purchase-form-hint" className="form-hint">
            Add manual purchases with source and reconciliation status so forecasts, commitments, and cycle checks stay accurate.
          </p>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Add purchase
            </button>
          </div>
        </form>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Purchases</p>
            <h2>Current entries</h2>
            <p className="panel-value">{formatMoney(filteredPurchaseTotal)} filtered total</p>
            <p className="subnote">
              Avg {formatMoney(filteredPurchaseAverage)} · {filteredStatusCounts.pending} pending · {filteredStatusCounts.posted}{' '}
              posted · {filteredStatusCounts.reconciled} reconciled
            </p>
          </div>
        </header>

        <div className="saved-view-row" role="group" aria-label="Saved purchase views">
          {savedViewOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`saved-view-chip ${savedView === option.value ? 'saved-view-chip--active' : ''}`}
              onClick={() => applySavedView(option.value)}
              title={option.detail}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="filter-row purchases-filter-row" role="group" aria-label="Purchase filters">
          <input
            type="search"
            aria-label="Search purchases"
            placeholder="Search merchant, category, notes"
            value={purchaseFilter.query}
            onChange={(event) =>
              setPurchaseFilter((prev) => ({
                ...prev,
                query: event.target.value,
              }))
            }
          />

          <select
            aria-label="Filter by category"
            value={purchaseFilter.category}
            onChange={(event) =>
              setPurchaseFilter((prev) => ({
                ...prev,
                category: event.target.value,
              }))
            }
          >
            <option value="all">All categories</option>
            {purchaseCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <input
            type="month"
            aria-label="Filter by month"
            value={purchaseFilter.month}
            onChange={(event) =>
              setPurchaseFilter((prev) => ({
                ...prev,
                month: event.target.value,
              }))
            }
          />

          <select
            aria-label="Filter by status"
            value={purchaseFilter.reconciliationStatus}
            onChange={(event) =>
              setPurchaseFilter((prev) => ({
                ...prev,
                reconciliationStatus: event.target.value as PurchaseFilter['reconciliationStatus'],
              }))
            }
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="posted">Posted</option>
            <option value="reconciled">Reconciled</option>
          </select>

          <select
            aria-label="Filter by ownership"
            value={purchaseFilter.ownership}
            onChange={(event) =>
              setPurchaseFilter((prev) => ({
                ...prev,
                ownership: event.target.value as PurchaseFilter['ownership'],
              }))
            }
          >
            <option value="all">All ownership</option>
            <option value="shared">Shared</option>
            <option value="personal">Personal</option>
          </select>

          <select
            aria-label="Filter by funding source"
            value={purchaseFilter.fundingSourceType}
            onChange={(event) =>
              setPurchaseFilter((prev) => ({
                ...prev,
                fundingSourceType: event.target.value as PurchaseFilter['fundingSourceType'],
              }))
            }
          >
            <option value="all">Any source</option>
            <option value="account">Account</option>
            <option value="card">Card</option>
            <option value="unassigned">Unassigned</option>
          </select>

          <select
            aria-label="Filter by tax deductible"
            value={purchaseFilter.taxDeductible}
            onChange={(event) =>
              setPurchaseFilter((prev) => ({
                ...prev,
                taxDeductible: event.target.value as PurchaseFilter['taxDeductible'],
              }))
            }
          >
            <option value="all">Tax tag: all</option>
            <option value="yes">Tax deductible</option>
            <option value="no">Non-deductible</option>
          </select>

          <select
            aria-label="Sort purchases"
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as PurchaseSortKey)}
          >
            <option value="date_desc">Date (new-old)</option>
            <option value="date_asc">Date (old-new)</option>
            <option value="amount_desc">Amount (high-low)</option>
            <option value="amount_asc">Amount (low-high)</option>
            <option value="status">Status</option>
            <option value="category_asc">Category</option>
            <option value="merchant_asc">Merchant</option>
          </select>

          <button
            type="button"
            className="btn btn-ghost btn--sm"
            onClick={() => {
              setPurchaseFilter({
                query: '',
                category: 'all',
                month: defaultMonth,
                reconciliationStatus: 'all',
                ownership: 'all',
                taxDeductible: 'all',
                fundingSourceType: 'all',
              })
              applySavedView('month_all')
              clearSelectedPurchases()
              setSortKey('date_desc')
            }}
          >
            Clear
          </button>
        </div>

        <div className="purchase-batch-row" role="group" aria-label="Purchase batch actions">
          <p className="subnote">
            {selectedPurchaseCount} selected · {formatMoney(selectedPurchaseTotal)}
          </p>
          <button type="button" className="btn btn-secondary btn--sm" onClick={toggleSelectFilteredPurchases}>
            {allVisibleSelected ? 'Unselect visible' : 'Select visible'}
          </button>
          <button type="button" className="btn btn-secondary btn--sm" onClick={() => void runBulkStatus('reconciled')}>
            Mark reconciled
          </button>
          <button type="button" className="btn btn-secondary btn--sm" onClick={() => void runBulkStatus('posted')}>
            Mark posted
          </button>
          <button type="button" className="btn btn-secondary btn--sm" onClick={() => void runBulkStatus('pending')}>
            Mark pending
          </button>
          <input
            type="text"
            aria-label="Bulk category"
            placeholder="Bulk category"
            value={bulkCategory}
            onChange={(event) => setBulkCategory(event.target.value)}
          />
          <button type="button" className="btn btn-secondary btn--sm" onClick={() => void runBulkCategory()}>
            Recategorize
          </button>
          <button
            type="button"
            className="btn btn-danger btn--sm"
            onClick={() => {
              if (selectedPurchaseCount === 0) return
              const shouldDelete = window.confirm(`Delete ${selectedPurchaseCount} selected purchase(s)?`)
              if (!shouldDelete) return
              void runBulkDelete()
            }}
          >
            Delete selected
          </button>
          <button type="button" className="btn btn-ghost btn--sm" onClick={clearSelectedPurchases}>
            Clear selected
          </button>
        </div>

        {visiblePurchases.length === 0 ? (
          <p className="empty-state">No purchases match this view.</p>
        ) : (
          <div className="table-wrap table-wrap--card purchases-table-wrap">
            <table className="data-table data-table--purchases" data-testid="purchases-table">
              <caption className="sr-only">Purchase entries</caption>
              <thead>
                <tr>
                  <th scope="col" className="purchase-col--select">
                    <label className="sr-only" htmlFor="purchase-select-visible">
                      Select visible purchases
                    </label>
                    <input
                      id="purchase-select-visible"
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectFilteredPurchases}
                    />
                  </th>
                  <th scope="col">Merchant</th>
                  <th scope="col">Amount + date</th>
                  <th scope="col">Category</th>
                  <th scope="col">Source</th>
                  <th scope="col">Status</th>
                  <th scope="col">Notes</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {visiblePurchases.map((entry) => {
                  const isEditing = purchaseEditId === entry._id
                  const status = (entry.reconciliationStatus ?? 'posted') as ReconciliationStatus

                  return (
                    <tr key={entry._id} className={isEditing ? 'table-row--editing' : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${entry.item}`}
                          checked={selectedPurchaseSet.has(entry._id)}
                          onChange={() => toggleSelectedPurchase(entry._id)}
                        />
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="inline-input"
                            value={purchaseEditDraft.item}
                            onChange={(event) => setPurchaseEditDraft((prev) => ({ ...prev, item: event.target.value }))}
                          />
                        ) : (
                          <div className="purchase-merchant-cell">
                            <strong>{entry.item}</strong>
                            <small>{dateLabel.format(new Date(`${entry.purchaseDate}T00:00:00`))}</small>
                          </div>
                        )}
                      </td>
                      <td className="table-amount amount-negative">
                        {isEditing ? (
                          <div className="purchase-inline-stack">
                            <input
                              className="inline-input"
                              type="number"
                              inputMode="decimal"
                              min="0.01"
                              step="0.01"
                              value={purchaseEditDraft.amount}
                              onChange={(event) => setPurchaseEditDraft((prev) => ({ ...prev, amount: event.target.value }))}
                            />
                            <input
                              className="inline-input"
                              type="date"
                              value={purchaseEditDraft.purchaseDate}
                              onChange={(event) =>
                                setPurchaseEditDraft((prev) => ({
                                  ...prev,
                                  purchaseDate: event.target.value,
                                }))
                              }
                            />
                            <input
                              className="inline-input"
                              type="month"
                              value={purchaseEditDraft.statementMonth}
                              onChange={(event) =>
                                setPurchaseEditDraft((prev) => ({
                                  ...prev,
                                  statementMonth: event.target.value,
                                }))
                              }
                            />
                          </div>
                        ) : (
                          <div className="purchase-amount-cell">
                            <strong>{formatMoney(entry.amount)}</strong>
                            <small>Statement {(entry.statementMonth ?? entry.purchaseDate.slice(0, 7)).replace('-', '/')}</small>
                          </div>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <div className="purchase-inline-stack">
                            <input
                              className="inline-input"
                              value={purchaseEditDraft.category}
                              onChange={(event) =>
                                setPurchaseEditDraft((prev) => ({
                                  ...prev,
                                  category: event.target.value,
                                }))
                              }
                            />
                            <select
                              className="inline-select"
                              value={purchaseEditDraft.ownership}
                              onChange={(event) =>
                                setPurchaseEditDraft((prev) => ({
                                  ...prev,
                                  ownership: event.target.value as PurchaseEditDraft['ownership'],
                                }))
                              }
                            >
                              <option value="shared">Shared</option>
                              <option value="personal">Personal</option>
                            </select>
                            <label className="checkbox-row purchase-inline-toggle">
                              <input
                                type="checkbox"
                                checked={purchaseEditDraft.taxDeductible}
                                onChange={(event) =>
                                  setPurchaseEditDraft((prev) => ({
                                    ...prev,
                                    taxDeductible: event.target.checked,
                                  }))
                                }
                              />
                              Tax deductible
                            </label>
                          </div>
                        ) : (
                          <div className="purchase-meta-cell">
                            <span className="pill pill--neutral">{entry.category}</span>
                            <span className="pill pill--neutral">{ownershipLabel(entry.ownership)}</span>
                            {entry.taxDeductible ? <span className="pill pill--good">Tax</span> : null}
                            {purchaseSplitMap.get(String(entry._id))?.length ? (
                              <span className="pill pill--cadence">
                                {purchaseSplitMap.get(String(entry._id))?.length} split
                                {(purchaseSplitMap.get(String(entry._id))?.length ?? 0) > 1 ? 's' : ''}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <div className="purchase-inline-stack">
                            <select
                              className="inline-select"
                              value={purchaseEditDraft.fundingSourceType}
                              onChange={(event) =>
                                setPurchaseEditDraft((prev) => ({
                                  ...prev,
                                  fundingSourceType: event.target.value as PurchaseEditDraft['fundingSourceType'],
                                  fundingSourceId: '',
                                }))
                              }
                            >
                              <option value="unassigned">Unassigned</option>
                              <option value="account">Account</option>
                              <option value="card">Card</option>
                            </select>
                            <select
                              className="inline-select"
                              value={purchaseEditDraft.fundingSourceId}
                              disabled={purchaseEditDraft.fundingSourceType === 'unassigned'}
                              onChange={(event) =>
                                setPurchaseEditDraft((prev) => ({
                                  ...prev,
                                  fundingSourceId: event.target.value,
                                }))
                              }
                            >
                              <option value="">Select source</option>
                              {purchaseEditDraft.fundingSourceType === 'account'
                                ? accounts.map((account) => (
                                    <option key={account._id} value={String(account._id)}>
                                      {account.name}
                                    </option>
                                  ))
                                : null}
                              {purchaseEditDraft.fundingSourceType === 'card'
                                ? cards.map((card) => (
                                    <option key={card._id} value={String(card._id)}>
                                      {card.name}
                                    </option>
                                  ))
                                : null}
                            </select>
                          </div>
                        ) : (
                          <span className="pill pill--neutral">{fundingLabelByEntry(entry)}</span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <select
                            className="inline-select"
                            value={purchaseEditDraft.reconciliationStatus}
                            onChange={(event) =>
                              setPurchaseEditDraft((prev) => ({
                                ...prev,
                                reconciliationStatus: event.target.value as ReconciliationStatus,
                              }))
                            }
                          >
                            <option value="pending">Pending</option>
                            <option value="posted">Posted</option>
                            <option value="reconciled">Reconciled</option>
                          </select>
                        ) : (
                          <span className={statusPillClass(status)}>{statusLabel(status)}</span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="inline-input"
                            value={purchaseEditDraft.notes}
                            onChange={(event) =>
                              setPurchaseEditDraft((prev) => ({
                                ...prev,
                                notes: event.target.value,
                              }))
                            }
                          />
                        ) : (
                          <span className="cell-truncate" title={entry.notes ?? ''}>
                            {entry.notes ?? '-'}
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          {isEditing ? (
                            <>
                              <button type="button" className="btn btn-secondary btn--sm" onClick={() => void savePurchaseEdit()}>
                                Save
                              </button>
                              <button type="button" className="btn btn-ghost btn--sm" onClick={() => setPurchaseEditId(null)}>
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button type="button" className="btn btn-secondary btn--sm" onClick={() => startPurchaseEdit(entry)}>
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn--sm"
                                onClick={() => {
                                  setSplitPurchaseId(entry._id)
                                  setSplitDraftRows(buildDefaultSplitDraftRows(entry))
                                }}
                              >
                                Split
                              </button>
                              {status !== 'reconciled' ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn--sm"
                                  onClick={() => void onSetPurchaseReconciliation(entry._id, 'reconciled')}
                                >
                                  Reconcile
                                </button>
                              ) : null}
                              {status !== 'posted' ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn--sm"
                                  onClick={() => void onSetPurchaseReconciliation(entry._id, 'posted')}
                                >
                                  Mark posted
                                </button>
                              ) : null}
                              <button type="button" className="btn btn-secondary btn--sm" onClick={() => void duplicatePurchase(entry)}>
                                Duplicate
                              </button>
                              <button type="button" className="btn btn-ghost btn--sm" onClick={() => void onDeletePurchase(entry._id)}>
                                Remove
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="panel purchases-panel-insights">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Insights</p>
            <h2>Spend quality + breakdown</h2>
            <p className="panel-value">{formatMoney(monthPurchaseSummary.monthTotal)} current month total</p>
            <p className="subnote">
              Cleared {formatMoney(purchasesThisMonth)} · Pending {formatMoney(pendingPurchaseAmountThisMonth)}
            </p>
          </div>
        </header>

        <div className="purchase-summary-strip">
          <article className="purchase-summary-card">
            <p>Month total</p>
            <strong>{formatMoney(monthPurchaseSummary.monthTotal)}</strong>
            <small>{monthPurchaseSummary.pendingCount + monthPurchaseSummary.postedCount + monthPurchaseSummary.reconciledCount} records</small>
          </article>
          <article className="purchase-summary-card">
            <p>Cleared total</p>
            <strong>{formatMoney(monthPurchaseSummary.clearedTotal)}</strong>
            <small>{monthPurchaseSummary.postedCount + monthPurchaseSummary.reconciledCount} posted/reconciled</small>
          </article>
          <article className="purchase-summary-card">
            <p>Pending exposure</p>
            <strong>{formatMoney(monthPurchaseSummary.pendingTotal)}</strong>
            <small>{monthPurchaseSummary.pendingCount} pending in current month</small>
          </article>
          <article className="purchase-summary-card">
            <p>Tax-deductible</p>
            <strong>{insights.deductibleCount}</strong>
            <small>{formatMoney(filteredPurchaseTotal)} filtered spend base</small>
          </article>
        </div>

        <div className="purchase-insight-grid">
          <article className="purchase-insight-card">
            <p>Ownership split</p>
            <strong>{formatMoney(insights.personalSpend)}</strong>
            <small>personal</small>
            <small>{formatMoney(insights.sharedSpend)} shared</small>
          </article>
          <article className="purchase-insight-card">
            <p>Reconciliation backlog</p>
            <strong>{pendingPurchases}</strong>
            <small>{postedPurchases} posted · {reconciledPurchases} reconciled</small>
          </article>
          <article className="purchase-insight-card">
            <p>Data quality</p>
            <strong>{insights.uncategorized}</strong>
            <small>uncategorized in current filter</small>
          </article>
          <article className="purchase-insight-card">
            <p>Duplicate / overlap pairs</p>
            <strong>{purchaseDuplicateOverlaps.length}</strong>
            <small>{duplicateSummary.duplicatePairs} duplicates · {duplicateSummary.overlapPairs} overlaps</small>
          </article>
        </div>

        <div className="purchase-top-merchants">
          <h3>Top merchants (filtered)</h3>
          {insights.topMerchants.length === 0 ? (
            <p className="empty-state">No merchant spend yet for this filter.</p>
          ) : (
            <ul>
              {insights.topMerchants.map((merchant) => (
                <li key={merchant.merchant}>
                  <span>{merchant.merchant}</span>
                  <strong>{formatMoney(merchant.total)}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      </article>

      <article className="panel purchases-phase2-panel purchases-phase2-panel--detection">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Intelligence</p>
            <h2>Duplicate + anomaly detection</h2>
            <p className="panel-value">
              {duplicateSummary.duplicatePairs} duplicate pairs · {purchaseAnomalies.length} anomaly signals
            </p>
            <p className="subnote">One-click actions let you merge, archive, or intentionally keep overlaps before month close.</p>
          </div>
        </header>

        <div className="purchase-phase2-summary-grid">
          <article className="purchase-phase2-summary-card">
            <p>Duplicate pairs</p>
            <strong>{duplicateSummary.duplicatePairs}</strong>
            <small>high confidence duplicate records</small>
          </article>
          <article className="purchase-phase2-summary-card">
            <p>Overlap pairs</p>
            <strong>{duplicateSummary.overlapPairs}</strong>
            <small>likely overlap to review</small>
          </article>
          <article className="purchase-phase2-summary-card">
            <p>Impacted purchases</p>
            <strong>{duplicateSummary.impactedCount}</strong>
            <small>records flagged for cleanup</small>
          </article>
          <article className="purchase-phase2-summary-card">
            <p>Anomaly signals</p>
            <strong>{purchaseAnomalies.length}</strong>
            <small>spikes, outliers, and category shifts</small>
          </article>
        </div>

        <div className="purchase-phase2-grid">
          <section className="purchase-phase2-card">
            <header className="purchase-phase2-card-head">
              <h3>Duplicate / overlap queue</h3>
              <p>Top candidates first; resolve each pair with one action.</p>
            </header>
            {purchaseDuplicateOverlaps.length === 0 ? (
              <p className="empty-state">No duplicate/overlap candidates found for current data.</p>
            ) : (
              <ul className="purchase-duplicate-list">
                {purchaseDuplicateOverlaps.slice(0, 10).map((match) => {
                  const isBusy = resolvingDuplicateId === match.id
                  return (
                    <li key={match.id} className="purchase-duplicate-item">
                      <div className="purchase-duplicate-main">
                        <div>
                          <span className={duplicateKindPillClass(match.kind)}>{duplicateKindLabel(match.kind)}</span>
                        </div>
                        <strong>{match.primaryItem}</strong>
                        <small>
                          {formatMoney(match.primaryAmount)} on {match.primaryDate} vs {formatMoney(match.secondaryAmount)} on{' '}
                          {match.secondaryDate}
                        </small>
                        <small>{match.reason}</small>
                      </div>
                      <div className="purchase-duplicate-metrics">
                        <small>{(match.nameSimilarity * 100).toFixed(0)}% name similarity</small>
                        <small>{(match.amountDeltaPercent * 100).toFixed(1)}% amount delta</small>
                        <small>{match.dayDelta}d date gap</small>
                        <div className="purchase-duplicate-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn--sm"
                            disabled={isBusy}
                            onClick={() => void onRunDuplicateAction(match, 'merge')}
                          >
                            Merge
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn--sm"
                            disabled={isBusy}
                            onClick={() => void onRunDuplicateAction(match, 'archive_duplicate')}
                          >
                            Archive duplicate
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn--sm"
                            disabled={isBusy}
                            onClick={() => void onRunDuplicateAction(match, 'mark_intentional')}
                          >
                            Mark intentional
                          </button>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="purchase-phase2-card">
            <header className="purchase-phase2-card-head">
              <h3>Anomaly detector</h3>
              <p>Merchant spikes, outliers, and unusual category share shifts.</p>
            </header>
            {purchaseAnomalies.length === 0 ? (
              <p className="empty-state">No anomalies currently detected.</p>
            ) : (
              <ul className="purchase-anomaly-list">
                {purchaseAnomalies.map((anomaly) => (
                  <li key={anomaly.id} className="purchase-anomaly-item">
                    <span className={anomalySeverityPillClass(anomaly.severity)}>
                      {anomaly.kind.replaceAll('_', ' ')}
                    </span>
                    <strong>{anomaly.title}</strong>
                    <small>{anomaly.detail}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </article>

      <article className="panel purchases-phase2-panel">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Intelligence</p>
            <h2>Merchant intelligence cards</h2>
            <p className="panel-value">
              {merchantIntelligence.length} merchants tracked · {formatMoney(purchaseRunRate.total90)} in 90-day spend
            </p>
            <p className="subnote">30/90/365 totals, average ticket, trend, and price-creep flags.</p>
          </div>
        </header>

        {merchantIntelligence.length === 0 ? (
          <p className="empty-state">Add purchases to build merchant intelligence cards.</p>
        ) : (
          <div className="purchase-merchant-grid">
            {merchantIntelligence.map((merchant) => (
              <article key={merchant.id} className="purchase-merchant-card">
                <header>
                  <h3>{merchant.merchant}</h3>
                  <span className={merchant.priceCreep ? 'pill pill--warning' : 'pill pill--good'}>
                    {merchant.priceCreep ? 'Price creep' : 'Stable'}
                  </span>
                </header>
                <div className="purchase-merchant-windows">
                  <div>
                    <p>30D</p>
                    <strong>{formatMoney(merchant.total30)}</strong>
                  </div>
                  <div>
                    <p>90D</p>
                    <strong>{formatMoney(merchant.total90)}</strong>
                  </div>
                  <div>
                    <p>365D</p>
                    <strong>{formatMoney(merchant.total365)}</strong>
                  </div>
                </div>
                <footer>
                  <small>Avg ticket {formatMoney(merchant.avgTicket)}</small>
                  <small className={merchant.trendPercent > 0 ? 'amount-negative' : merchant.trendPercent < 0 ? 'amount-positive' : undefined}>
                    Trend {merchant.trendPercent > 0 ? '+' : ''}
                    {merchant.trendPercent.toFixed(1)}%
                  </small>
                </footer>
              </article>
            ))}
          </div>
        )}
      </article>

      <article className="panel purchases-phase2-panel">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Planning</p>
            <h2>Recurring detector + cashflow impact</h2>
            <p className="panel-value">
              {recurringCandidatesSorted.length} recurring candidates · {visibleTimelineItems.length} timeline events
            </p>
            <p className="subnote">Convert repeating purchases into Bills and see 30/90/365 cash impact instantly.</p>
          </div>
        </header>

        <div className="purchase-phase2-grid">
          <section className="purchase-phase2-card">
            <header className="purchase-phase2-card-head">
              <h3>Recurring candidates</h3>
              <p>Convert repeating merchants to Bills with one click.</p>
            </header>
            {recurringCandidatesSorted.length === 0 ? (
              <p className="empty-state">No recurring candidates yet.</p>
            ) : (
              <ul className="purchase-recurring-list">
                {recurringCandidatesSorted.slice(0, 8).map((candidate) => (
                  <li key={candidate.id} className="purchase-recurring-item">
                    <div>
                      <strong>{candidate.label}</strong>
                      <small>
                        {candidate.count} hits · {formatMoney(candidate.averageAmount)} avg · every{' '}
                        {numberFormatter.format(Math.max(candidate.averageIntervalDays, 1))}d
                      </small>
                      <small>
                        Next expected {candidate.nextExpectedDate} · {Math.round(candidate.confidence * 100)}% confidence
                      </small>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn--sm"
                      disabled={convertingRecurringId === candidate.id}
                      onClick={() => void onConvertRecurring(candidate.id)}
                    >
                      {convertingRecurringId === candidate.id ? 'Converting…' : 'Convert to bill'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="purchase-phase2-card">
            <header className="purchase-phase2-card-head">
              <h3>30/90/365 cashflow impact</h3>
              <p>Forecast windows + purchase run-rate effects.</p>
            </header>
            <div className="purchase-cashflow-grid">
              {forecastRows.map((window) => (
                <article key={window.days} className="purchase-cashflow-item">
                  <p>{window.days} days</p>
                  <strong>{formatMoney(window.projectedCash)}</strong>
                  <small>
                    Net {formatMoney(window.projectedNet)} · {window.coverageMonths.toFixed(1)}m coverage
                  </small>
                  <span
                    className={
                      window.risk === 'critical' ? 'pill pill--critical' : window.risk === 'warning' ? 'pill pill--warning' : 'pill pill--good'
                    }
                  >
                    {window.risk}
                  </span>
                </article>
              ))}
              <article className="purchase-cashflow-item">
                <p>Purchase run-rate (90d)</p>
                <strong>{formatMoney(purchaseRunRate.monthlyFrom90)} / month</strong>
                <small>{formatMoney(purchaseRunRate.total90)} across last 90 days</small>
                <span className="pill pill--neutral">Behavioral baseline</span>
              </article>
            </div>

            <div className="purchase-timeline">
              <div className="purchase-timeline-head">
                <h4>Upcoming money timeline</h4>
                <div className="purchase-timeline-window-toggle">
                  {[14, 30].map((window) => (
                    <button
                      key={window}
                      type="button"
                      className={`btn btn-ghost btn--sm ${timelineWindowDays === window ? 'purchase-timeline-window-btn--active' : ''}`}
                      onClick={() => setTimelineWindowDays(window as 14 | 30)}
                    >
                      {window}d
                    </button>
                  ))}
                </div>
              </div>
              <p className="subnote">
                Net impact {formatMoney(timelineNetImpact)} over next {timelineWindowDays} days.
              </p>
              {visibleTimelineItems.length === 0 ? (
                <p className="empty-state">No upcoming timeline events in this window.</p>
              ) : (
                <ul className="purchase-timeline-list">
                  {visibleTimelineItems.map((entry) => (
                    <li key={entry.id} className="purchase-timeline-item">
                      <div>
                        <strong>{entry.label}</strong>
                        <small>
                          {entry.date} · {entry.daysAway}d away · {entry.source === 'purchase_recurring' ? 'predicted purchase' : entry.type}
                        </small>
                      </div>
                      <strong className={entry.type === 'income' ? 'amount-positive' : 'amount-negative'}>
                        {entry.type === 'income' ? '+' : '-'}
                        {formatMoney(entry.amount)}
                      </strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </article>

      <article className="panel purchases-phase3-panel">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Trust + Reporting</p>
            <h2>Monthly close + mutation audit</h2>
            <p className="panel-value">
              {purchaseSummaryWindow.mutationCount} mutation events · {purchaseSummaryWindow.completedMonthCloseRuns} close runs (
              {purchaseSummaryWindow.windowDays}d)
            </p>
            <p className="subnote">Idempotent monthly close with retry-safe snapshot recalculation and paginated purchase audit history.</p>
          </div>
        </header>

        <div className="purchase-phase3-toolbar">
          <label className="purchase-split-field">
            <span>Summary window</span>
            <select
              value={historyWindowDays}
              onChange={(event) => setHistoryWindowDays(Number(event.target.value) as 30 | 90 | 365)}
            >
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={365}>365 days</option>
            </select>
          </label>

          <label className="purchase-split-field">
            <span>Month close target</span>
            <input
              type="month"
              value={closeMonth}
              onChange={(event) => setCloseMonth(event.target.value)}
            />
          </label>

          <div className="purchase-phase3-toolbar-actions">
            <button
              type="button"
              className="btn btn-secondary btn--sm"
              onClick={() => void onRunPurchaseMonthCloseNow()}
              disabled={isRunningMonthClose}
            >
              {isRunningMonthClose ? 'Running month close…' : 'Run month close now'}
            </button>
          </div>
        </div>

        {monthCloseFeedback ? <p className="subnote">{monthCloseFeedback}</p> : null}

        <div className="purchase-phase3-summary-grid">
          <article className="purchase-phase2-summary-card">
            <p>Purchases in window</p>
            <strong>{purchaseSummaryWindow.totalPurchases}</strong>
            <small>{formatMoney(purchaseSummaryWindow.totalAmount)} cleared amount</small>
          </article>
          <article className="purchase-phase2-summary-card">
            <p>Reconciliation mix</p>
            <strong>{purchaseSummaryWindow.pendingCount} pending</strong>
            <small>
              {purchaseSummaryWindow.postedCount} posted · {purchaseSummaryWindow.reconciledCount} reconciled
            </small>
          </article>
          <article className="purchase-phase2-summary-card">
            <p>Data quality</p>
            <strong>{purchaseSummaryWindow.duplicateCount + purchaseSummaryWindow.anomalyCount} alerts</strong>
            <small>
              {purchaseSummaryWindow.duplicateCount} duplicates · {purchaseSummaryWindow.anomalyCount} anomalies ·{' '}
              {purchaseSummaryWindow.missingCategoryCount} uncategorized
            </small>
          </article>
          <article className="purchase-phase2-summary-card">
            <p>Last mutation</p>
            <strong>
              {purchaseSummaryWindow.lastMutationAt ? dateLabel.format(new Date(purchaseSummaryWindow.lastMutationAt)) : '-'}
            </strong>
            <small>
              Last close:{' '}
              {purchaseSummaryWindow.lastMonthCloseAt
                ? `${purchaseSummaryWindow.lastCompletedMonthCloseKey ?? ''} · ${dateLabel.format(new Date(purchaseSummaryWindow.lastMonthCloseAt))}`
                : 'none'}
            </small>
          </article>
        </div>

        <div className="purchase-phase3-grid">
          <section className="purchase-phase2-card">
            <header className="purchase-phase2-card-head">
              <h3>Recent month close runs</h3>
              <p>Manual + automatic runs with status and quality counts.</p>
            </header>
            {recentPurchaseMonthCloseRuns.length === 0 ? (
              <p className="empty-state">No month close runs yet.</p>
            ) : (
              <div className="table-wrap table-wrap--card">
                <table className="data-table data-table--purchase-phase3">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Status</th>
                      <th>Totals</th>
                      <th>Quality</th>
                      <th>Source</th>
                      <th>Ran</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPurchaseMonthCloseRuns.map((run) => (
                      <tr key={run._id}>
                        <td>{run.monthKey}</td>
                        <td>
                          <span className={run.status === 'completed' ? 'pill pill--good' : 'pill pill--critical'}>
                            {run.status}
                          </span>
                        </td>
                        <td>
                          <small>
                            {run.totalPurchases} purchases · {formatMoney(run.totalAmount)} cleared · {formatMoney(run.pendingAmount)} pending
                          </small>
                        </td>
                        <td>
                          <small>
                            {run.duplicateCount} dup · {run.anomalyCount} anomaly · {run.missingCategoryCount} missing
                          </small>
                        </td>
                        <td>{run.source}</td>
                        <td>{dateLabel.format(new Date(run.ranAt))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="purchase-phase2-card">
            <header className="purchase-phase2-card-head">
              <h3>Purchase mutation history</h3>
              <p>Before/after snapshots with source and timestamp, paginated for large histories.</p>
            </header>
            {purchaseMutationRows.length === 0 ? (
              <p className="empty-state">No purchase mutation events in this filter window yet.</p>
            ) : (
              <div className="table-wrap table-wrap--card">
                <table className="data-table data-table--purchase-phase3">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Action</th>
                      <th>Source</th>
                      <th>Entity</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseMutationRows.map((row) => (
                      <tr key={row.id}>
                        <td>{dateLabel.format(new Date(row.createdAt))}</td>
                        <td>{row.action}</td>
                        <td>{row.source}</td>
                        <td>{row.entityId}</td>
                        <td>{row.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="purchase-phase3-footer">
              <button
                type="button"
                className="btn btn-secondary btn--sm"
                onClick={() => purchaseMutationHistory.loadMore(12)}
                disabled={!canLoadMoreMutationHistory || isLoadingMoreMutationHistory}
              >
                {isLoadingMoreMutationHistory ? 'Loading…' : canLoadMoreMutationHistory ? 'Load more events' : 'No more events'}
              </button>
            </div>
          </section>
        </div>
      </article>

      <article className="panel purchases-phase2-panel">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Planning</p>
            <h2>Split transaction engine + templates</h2>
            <p className="panel-value">
              {purchaseSplits.length} split lines · {purchaseSplitTemplates.length} templates
            </p>
            <p className="subnote">Assign portions of a purchase to categories, goals, and accounts with reusable templates.</p>
          </div>
        </header>

        <div className="purchase-split-toolbar">
          <label className="purchase-split-field">
            <span>Purchase</span>
            <select
              value={splitPurchaseId ? String(splitPurchaseId) : ''}
              onChange={(event) => setSplitPurchaseId(event.target.value as PurchaseId)}
            >
              <option value="">Select purchase</option>
              {visiblePurchases.map((entry) => (
                <option key={entry._id} value={String(entry._id)}>
                  {entry.item} · {formatMoney(entry.amount)} · {entry.purchaseDate}
                </option>
              ))}
            </select>
          </label>

          <label className="purchase-split-field">
            <span>Template</span>
            <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
              <option value="">Select template</option>
              {purchaseSplitTemplates.map((template) => (
                <option key={template._id} value={String(template._id)}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>

          <div className="purchase-split-toolbar-actions">
            <button type="button" className="btn btn-secondary btn--sm" onClick={() => void onApplyTemplate()} disabled={!selectedSplitPurchase || !selectedTemplate || isApplyingTemplate}>
              {isApplyingTemplate ? 'Applying…' : 'Apply template'}
            </button>
            <button type="button" className="btn btn-secondary btn--sm" onClick={() => void onSaveSplitDraft()} disabled={!selectedSplitPurchase || isSavingSplits}>
              {isSavingSplits ? 'Saving…' : 'Save splits'}
            </button>
            <button type="button" className="btn btn-ghost btn--sm" onClick={() => void onClearSplitDraft()} disabled={!selectedSplitPurchase || isSavingSplits}>
              Clear splits
            </button>
          </div>
        </div>

        {selectedSplitPurchase ? (
          <>
            <p className="subnote">
              Splitting <strong>{selectedSplitPurchase.item}</strong> ({formatMoney(selectedSplitPurchase.amount)}). Draft total{' '}
              <strong>{formatMoney(splitDraftTotal)}</strong>{' '}
              <span className={splitDraftDelta > 0 ? 'amount-negative' : splitDraftDelta < 0 ? 'amount-positive' : ''}>
                ({splitDraftDelta > 0 ? '+' : ''}
                {formatMoney(splitDraftDelta)} delta)
              </span>
              .
            </p>

            <div className="purchase-split-table-wrap">
              <table className="data-table data-table--purchase-splits">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Amount</th>
                    <th>Goal</th>
                    <th>Account</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {splitDraftRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <input
                          className="inline-input"
                          value={row.category}
                          onChange={(event) => updateSplitDraftRow(row.id, { category: event.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="inline-input"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={row.amount}
                          onChange={(event) => updateSplitDraftRow(row.id, { amount: event.target.value })}
                        />
                      </td>
                      <td>
                        <select
                          className="inline-select"
                          value={row.goalId}
                          onChange={(event) => updateSplitDraftRow(row.id, { goalId: event.target.value })}
                        >
                          <option value="">No goal</option>
                          {goals.map((goal) => (
                            <option key={goal._id} value={String(goal._id)}>
                              {goal.title}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className="inline-select"
                          value={row.accountId}
                          onChange={(event) => updateSplitDraftRow(row.id, { accountId: event.target.value })}
                        >
                          <option value="">No account</option>
                          {accounts.map((account) => (
                            <option key={account._id} value={String(account._id)}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn--sm"
                          onClick={() => removeSplitDraftRow(row.id)}
                          disabled={splitDraftRows.length <= 1}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="purchase-split-footer">
              <button type="button" className="btn btn-secondary btn--sm" onClick={addSplitDraftRow}>
                Add split line
              </button>
              <small>
                Goal mapping: {splitDraftRows.filter((row) => row.goalId).length} line
                {splitDraftRows.filter((row) => row.goalId).length === 1 ? '' : 's'} · Account mapping:{' '}
                {splitDraftRows.filter((row) => row.accountId).length} line
                {splitDraftRows.filter((row) => row.accountId).length === 1 ? '' : 's'}
              </small>
            </div>
          </>
        ) : (
          <p className="empty-state">Select a purchase to edit split allocation.</p>
        )}

        <div className="purchase-template-section">
          <header>
            <h3>Split templates</h3>
            <p>Create templates from the current split draft and reuse them across purchases.</p>
          </header>
          <div className="purchase-template-toolbar">
            <label className="purchase-split-field">
              <span>Template name</span>
              <input
                value={splitTemplateName}
                placeholder={selectedTemplate?.name ?? 'Template name'}
                onChange={(event) => setSplitTemplateName(event.target.value)}
              />
            </label>
            <div className="purchase-template-actions">
              <button type="button" className="btn btn-secondary btn--sm" onClick={() => void onCreateTemplateFromDraft()} disabled={!selectedSplitPurchase || isSavingTemplate}>
                {isSavingTemplate ? 'Saving…' : 'Create template from split'}
              </button>
              <button type="button" className="btn btn-secondary btn--sm" onClick={() => void onUpdateSelectedTemplateFromDraft()} disabled={!selectedTemplate || !selectedSplitPurchase || isUpdatingTemplate}>
                {isUpdatingTemplate ? 'Updating…' : 'Update selected template'}
              </button>
              <button type="button" className="btn btn-ghost btn--sm" onClick={() => void onRemoveSelectedTemplate()} disabled={!selectedTemplate || isRemovingTemplate}>
                {isRemovingTemplate ? 'Removing…' : 'Remove selected template'}
              </button>
            </div>
          </div>

          {selectedTemplate ? (
            <div className="purchase-template-preview">
              <p>{selectedTemplate.name}</p>
              <ul>
                {selectedTemplate.splits.map((line, index) => (
                  <li key={`${selectedTemplate._id}-${index}`}>
                    <span>{line.category}</span>
                    <strong>{line.percentage.toFixed(1)}%</strong>
                    <small>
                      {line.goalId ? `Goal: ${goalNameById.get(String(line.goalId)) ?? 'Unknown'}` : 'No goal'} ·{' '}
                      {line.accountId ? `Account: ${accountNameById.get(String(line.accountId)) ?? 'Unknown'}` : 'No account'}
                    </small>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="subnote">Select a template to preview its split lines.</p>
          )}
        </div>
      </article>

      <article className="panel purchases-phase2-panel">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Import</p>
            <h2>Bulk import mode</h2>
            <p className="panel-value">{bulkImportRows.length} parsed rows ready</p>
            <p className="subnote">CSV mapping + validation + preview + commit.</p>
          </div>
          <div className="panel-actions">
            <button type="button" className="btn btn-secondary btn--sm" onClick={() => setBulkImportOpen((prev) => !prev)}>
              {bulkImportOpen ? 'Close bulk mode' : 'Open bulk mode'}
            </button>
          </div>
        </header>

        {bulkImportOpen ? (
          <div className="purchase-import-mode">
            <label className="purchase-import-field" htmlFor="purchase-import-csv">
              <span>CSV rows</span>
              <textarea
                id="purchase-import-csv"
                rows={7}
                value={bulkImportCsvText}
                onChange={(event) => setBulkImportCsvText(event.target.value)}
                placeholder="item,amount,category,purchase_date,statement_month,status,ownership,tax_deductible,source_type,source_id,notes"
              />
            </label>
            <div className="purchase-import-actions">
              <button type="button" className="btn btn-secondary btn--sm" onClick={parseBulkImportCsv}>
                Validate + preview
              </button>
              <button
                type="button"
                className="btn btn-primary btn--sm"
                onClick={() => void runBulkImportCommit()}
                disabled={bulkImportRows.length === 0 || isBulkImporting}
              >
                {isBulkImporting ? 'Importing…' : 'Commit import'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn--sm"
                onClick={() => {
                  setBulkImportCsvText('')
                  setBulkImportRows([])
                  setBulkImportErrors([])
                  setBulkImportMessage(null)
                }}
              >
                Clear
              </button>
            </div>

            {bulkImportMessage ? <p className="subnote">{bulkImportMessage}</p> : null}
            {bulkImportErrors.length > 0 ? (
              <ul className="purchase-import-errors">
                {bulkImportErrors.slice(0, 6).map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            ) : null}

            {bulkImportRows.length > 0 ? (
              <div className="purchase-import-preview">
                <h3>Preview</h3>
                <div className="table-wrap table-wrap--card">
                  <table className="data-table data-table--purchase-import">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Amount</th>
                        <th>Category</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkImportRows.slice(0, 25).map((row, index) => (
                        <tr key={`${row.item}-${row.purchaseDate}-${index}`}>
                          <td>{row.item}</td>
                          <td className="amount-negative">{formatMoney(row.amount)}</td>
                          <td>{row.category}</td>
                          <td>
                            {row.purchaseDate}
                            <small> · {row.statementMonth}</small>
                          </td>
                          <td>
                            <span className={statusPillClass(row.reconciliationStatus)}>{statusLabel(row.reconciliationStatus)}</span>
                          </td>
                          <td>
                            <small>
                              {row.fundingSourceType}
                              {row.fundingSourceId ? ` (${row.fundingSourceId})` : ''}
                            </small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="subnote">
            CSV headers supported: <code>item, amount, category, purchase_date, statement_month, status, ownership, tax_deductible, source_type, source_id, notes</code>.
          </p>
        )}
      </article>
    </section>
  )
}
