import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type {
  AccountEntry,
  BillCategory,
  Cadence,
  CardEntry,
  CustomCadenceUnit,
  FinancePreference,
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
} from '../components/financeTypes'
import { parseFloatInput, toIsoToday } from '../lib/financeHelpers'
import type { MutationHandlers } from './useMutationFeedback'

type UsePurchasesSectionArgs = {
  purchases: PurchaseEntry[]
  accounts: AccountEntry[]
  cards: CardEntry[]
  goals: GoalEntry[]
  recurringCandidates: RecurringCandidate[]
  purchaseSplits: PurchaseSplitEntry[]
  purchaseSplitTemplates: PurchaseSplitTemplateEntry[]
  preference?: FinancePreference
} & MutationHandlers

const initialPurchaseForm: PurchaseForm = {
  item: '',
  amount: '',
  category: '',
  purchaseDate: toIsoToday(),
  reconciliationStatus: 'posted',
  statementMonth: new Date().toISOString().slice(0, 7),
  ownership: 'shared',
  taxDeductible: false,
  fundingSourceType: 'unassigned',
  fundingSourceId: '',
  notes: '',
}

const initialPurchaseEditDraft: PurchaseEditDraft = {
  item: '',
  amount: '',
  category: '',
  purchaseDate: toIsoToday(),
  reconciliationStatus: 'posted',
  statementMonth: new Date().toISOString().slice(0, 7),
  ownership: 'shared',
  taxDeductible: false,
  fundingSourceType: 'unassigned',
  fundingSourceId: '',
  notes: '',
}

const initialPurchaseFilter: PurchaseFilter = {
  query: '',
  category: 'all',
  month: new Date().toISOString().slice(0, 7),
  reconciliationStatus: 'all',
  ownership: 'all',
  taxDeductible: 'all',
  fundingSourceType: 'all',
}

const buildInitialPurchaseForm = (preference?: FinancePreference): PurchaseForm => ({
  ...initialPurchaseForm,
  category: preference?.defaultPurchaseCategory ?? initialPurchaseForm.category,
  ownership: preference?.defaultPurchaseOwnership ?? initialPurchaseForm.ownership,
  notes: preference?.purchaseNotesTemplate ?? initialPurchaseForm.notes,
})

const isPurchaseFormUntouched = (form: PurchaseForm) =>
  form.item.trim().length === 0 &&
  form.amount.trim().length === 0 &&
  form.purchaseDate === initialPurchaseForm.purchaseDate &&
  form.reconciliationStatus === initialPurchaseForm.reconciliationStatus &&
  form.statementMonth === initialPurchaseForm.statementMonth &&
  form.taxDeductible === initialPurchaseForm.taxDeductible &&
  form.fundingSourceType === initialPurchaseForm.fundingSourceType &&
  form.fundingSourceId.trim().length === 0

const monthOnlyViews: PurchaseSavedView[] = ['month_all', 'month_pending', 'month_unreconciled', 'month_reconciled']

const purchaseNameStopWords = new Set([
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
])

const purchaseArchivedMarker = '[purchase-archived-duplicate]'
const purchaseIntentionalMarkerPrefix = '[purchase-intentional-overlap:'

const roundCurrency = (value: number) => Math.round(value * 100) / 100

const normalizePurchaseNameForMatch = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const tokenizePurchaseName = (value: string) =>
  normalizePurchaseNameForMatch(value)
    .split(' ')
    .filter((token) => token.length > 1 && !purchaseNameStopWords.has(token))

const calculatePurchaseNameSimilarity = (left: string, right: string) => {
  const normalizedLeft = normalizePurchaseNameForMatch(left)
  const normalizedRight = normalizePurchaseNameForMatch(right)

  if (normalizedLeft.length === 0 || normalizedRight.length === 0) {
    return 0
  }
  if (normalizedLeft === normalizedRight) {
    return 1
  }
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return 0.94
  }

  const leftTokens = new Set(tokenizePurchaseName(left))
  const rightTokens = new Set(tokenizePurchaseName(right))
  const union = new Set([...leftTokens, ...rightTokens])
  if (union.size === 0) {
    return 0
  }

  let overlap = 0
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      overlap += 1
    }
  })
  return overlap / union.size
}

const daysBetweenIsoDates = (left: string, right: string) => {
  const leftAt = new Date(`${left}T00:00:00`).getTime()
  const rightAt = new Date(`${right}T00:00:00`).getTime()
  if (!Number.isFinite(leftAt) || !Number.isFinite(rightAt)) {
    return Number.POSITIVE_INFINITY
  }
  return Math.abs(Math.round((leftAt - rightAt) / 86400000))
}

const hasArchivedPurchaseMarker = (notes?: string) => (notes ?? '').toLowerCase().includes(purchaseArchivedMarker)

const hasIntentionalPurchasePairMarker = (left: PurchaseEntry, right: PurchaseEntry) => {
  const leftNotes = (left.notes ?? '').toLowerCase()
  const rightNotes = (right.notes ?? '').toLowerCase()
  const leftTargetsRight = leftNotes.includes(`${purchaseIntentionalMarkerPrefix}${String(right._id).toLowerCase()}]`)
  const rightTargetsLeft = rightNotes.includes(`${purchaseIntentionalMarkerPrefix}${String(left._id).toLowerCase()}]`)
  return leftTargetsRight || rightTargetsLeft
}

const normalizeMarkerNote = (notes: string | undefined, marker: string) => {
  const trimmedMarker = marker.trim()
  if (!trimmedMarker) {
    return notes
  }
  const segments = (notes ?? '')
    .split(' | ')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
  if (segments.includes(trimmedMarker)) {
    return segments.join(' | ')
  }
  return [...segments, trimmedMarker].join(' | ')
}

const buildPurchaseDuplicateOverlapMatches = (purchases: PurchaseEntry[]): PurchaseDuplicateOverlapMatch[] => {
  const matches: PurchaseDuplicateOverlapMatch[] = []

  for (let leftIndex = 0; leftIndex < purchases.length; leftIndex += 1) {
    const left = purchases[leftIndex]
    for (let rightIndex = leftIndex + 1; rightIndex < purchases.length; rightIndex += 1) {
      const right = purchases[rightIndex]

      const leftOwnership = left.ownership ?? 'shared'
      const rightOwnership = right.ownership ?? 'shared'
      if (leftOwnership !== rightOwnership) {
        continue
      }

      if (hasArchivedPurchaseMarker(left.notes) || hasArchivedPurchaseMarker(right.notes)) {
        continue
      }
      if (hasIntentionalPurchasePairMarker(left, right)) {
        continue
      }

      const nameSimilarity = calculatePurchaseNameSimilarity(left.item, right.item)
      if (nameSimilarity < 0.58) {
        continue
      }

      const amountDelta = Math.abs(left.amount - right.amount)
      const amountDeltaPercent = amountDelta / Math.max(Math.max(left.amount, right.amount), 1)
      const dayDelta = daysBetweenIsoDates(left.purchaseDate, right.purchaseDate)
      const duplicateCandidate = nameSimilarity >= 0.9 && amountDeltaPercent <= 0.03 && dayDelta <= 2
      const overlapCandidate = nameSimilarity >= 0.7 && amountDeltaPercent <= 0.2 && dayDelta <= 7

      if (!duplicateCandidate && !overlapCandidate) {
        continue
      }

      const kind = duplicateCandidate ? 'duplicate' : 'overlap'
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
        amountDelta,
        amountDeltaPercent,
        dayDelta,
        nameSimilarity,
        reason:
          kind === 'duplicate'
            ? 'Very similar merchant, amount, and purchase timing.'
            : 'Likely overlap based on merchant similarity, amount, and purchase timing.',
      })
    }
  }

  const kindRank = (value: PurchaseDuplicateOverlapMatch['kind']) => (value === 'duplicate' ? 0 : 1)
  return matches.sort((left, right) => {
    if (kindRank(left.kind) !== kindRank(right.kind)) {
      return kindRank(left.kind) - kindRank(right.kind)
    }
    if (left.nameSimilarity !== right.nameSimilarity) {
      return right.nameSimilarity - left.nameSimilarity
    }
    if (left.amountDeltaPercent !== right.amountDeltaPercent) {
      return left.amountDeltaPercent - right.amountDeltaPercent
    }
    return left.dayDelta - right.dayDelta
  })
}

const resolveBillCategoryFromPurchase = (value: string): BillCategory | undefined => {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return undefined
  if (normalized.includes('rent') || normalized.includes('mortgage') || normalized.includes('housing')) return 'housing'
  if (normalized.includes('electric') || normalized.includes('water') || normalized.includes('gas')) return 'utilities'
  if (normalized.includes('council')) return 'council_tax'
  if (normalized.includes('insur')) return 'insurance'
  if (normalized.includes('fuel') || normalized.includes('travel') || normalized.includes('transport')) return 'transport'
  if (normalized.includes('health') || normalized.includes('medical')) return 'health'
  if (normalized.includes('loan') || normalized.includes('card') || normalized.includes('debt')) return 'debt'
  if (normalized.includes('subscription') || normalized.includes('streaming') || normalized.includes('membership'))
    return 'subscriptions'
  if (normalized.includes('school') || normalized.includes('course') || normalized.includes('tuition')) return 'education'
  if (normalized.includes('child') || normalized.includes('nursery') || normalized.includes('daycare')) return 'childcare'
  return 'other'
}

const resolveRecurringCadence = (
  averageIntervalDays: number,
): {
  cadence: Cadence
  customInterval?: number
  customUnit?: CustomCadenceUnit
} => {
  if (averageIntervalDays <= 10) {
    return { cadence: 'weekly' }
  }
  if (averageIntervalDays <= 19) {
    return { cadence: 'biweekly' }
  }
  if (averageIntervalDays >= 26 && averageIntervalDays <= 30) {
    return { cadence: 'custom', customInterval: 4, customUnit: 'weeks' }
  }
  if (averageIntervalDays <= 45) {
    return { cadence: 'monthly' }
  }
  if (averageIntervalDays <= 120) {
    return { cadence: 'quarterly' }
  }
  return { cadence: 'yearly' }
}

const purchaseDatePattern = /^\d{4}-\d{2}-\d{2}$/
const monthPattern = /^\d{4}-\d{2}$/

const matchesSavedView = (filter: PurchaseFilter, savedView: PurchaseSavedView, currentMonth: string) => {
  const month = filter.month.length === 0 ? '' : filter.month
  const monthMatch = monthOnlyViews.includes(savedView) ? month === currentMonth : month.length === 0

  if (savedView === 'month_all') {
    return monthMatch && filter.reconciliationStatus === 'all'
  }
  if (savedView === 'month_pending') {
    return monthMatch && filter.reconciliationStatus === 'pending'
  }
  if (savedView === 'month_unreconciled') {
    return monthMatch && filter.reconciliationStatus === 'posted'
  }
  if (savedView === 'month_reconciled') {
    return monthMatch && filter.reconciliationStatus === 'reconciled'
  }
  if (savedView === 'all_unreconciled') {
    return monthMatch && filter.reconciliationStatus === 'posted'
  }
  return monthMatch && filter.reconciliationStatus === 'all'
}

const applySavedViewToFilter = (savedView: PurchaseSavedView, currentMonth: string, filter: PurchaseFilter): PurchaseFilter => {
  const base: PurchaseFilter = {
    ...filter,
    month: monthOnlyViews.includes(savedView) ? currentMonth : '',
  }

  if (savedView === 'month_pending') {
    return { ...base, reconciliationStatus: 'pending' }
  }
  if (savedView === 'month_unreconciled') {
    return { ...base, reconciliationStatus: 'posted' }
  }
  if (savedView === 'month_reconciled') {
    return { ...base, reconciliationStatus: 'reconciled' }
  }
  if (savedView === 'all_unreconciled') {
    return { ...base, reconciliationStatus: 'posted' }
  }
  return { ...base, reconciliationStatus: 'all' }
}

export const usePurchasesSection = ({
  purchases,
  accounts,
  cards,
  goals,
  recurringCandidates,
  purchaseSplits,
  purchaseSplitTemplates,
  preference,
  clearError,
  handleMutationError,
}: UsePurchasesSectionArgs) => {
  const addPurchase = useMutation(api.finance.addPurchase)
  const updatePurchase = useMutation(api.finance.updatePurchase)
  const removePurchase = useMutation(api.finance.removePurchase)
  const addBill = useMutation(api.finance.addBill)
  const setPurchaseReconciliation = useMutation(api.finance.setPurchaseReconciliation)
  const bulkUpdatePurchaseReconciliation = useMutation(api.phase2.bulkUpdatePurchaseReconciliation)
  const bulkUpdatePurchaseCategory = useMutation(api.phase2.bulkUpdatePurchaseCategory)
  const bulkDeletePurchases = useMutation(api.phase2.bulkDeletePurchases)
  const upsertPurchaseSplitsMutation = useMutation(api.phase2.upsertPurchaseSplits)
  const clearPurchaseSplitsMutation = useMutation(api.phase2.clearPurchaseSplits)
  const addPurchaseSplitTemplateMutation = useMutation(api.phase2.addPurchaseSplitTemplate)
  const updatePurchaseSplitTemplateMutation = useMutation(api.phase2.updatePurchaseSplitTemplate)
  const removePurchaseSplitTemplateMutation = useMutation(api.phase2.removePurchaseSplitTemplate)
  const applyPurchaseSplitTemplateMutation = useMutation(api.phase2.applyPurchaseSplitTemplate)

  const [purchaseForm, setPurchaseForm] = useState<PurchaseForm>(() => buildInitialPurchaseForm(preference))
  const [purchaseEditId, setPurchaseEditId] = useState<PurchaseId | null>(null)
  const [purchaseEditDraft, setPurchaseEditDraft] = useState<PurchaseEditDraft>(initialPurchaseEditDraft)
  const [purchaseFilter, setPurchaseFilter] = useState<PurchaseFilter>(initialPurchaseFilter)
  const [savedView, setSavedView] = useState<PurchaseSavedView>('month_all')
  const [selectedPurchaseIds, setSelectedPurchaseIds] = useState<PurchaseId[]>([])
  const [bulkCategory, setBulkCategory] = useState('')

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPurchaseForm((previous) => {
        if (!isPurchaseFormUntouched(previous)) {
          return previous
        }
        return {
          ...previous,
          category: preference?.defaultPurchaseCategory ?? initialPurchaseForm.category,
          ownership: preference?.defaultPurchaseOwnership ?? initialPurchaseForm.ownership,
          notes: preference?.purchaseNotesTemplate ?? initialPurchaseForm.notes,
        }
      })
    }, 0)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [preference?.defaultPurchaseCategory, preference?.defaultPurchaseOwnership, preference?.purchaseNotesTemplate])

  const currentMonth = new Date().toISOString().slice(0, 7)
  const purchaseById = useMemo(() => new Map(purchases.map((entry) => [String(entry._id), entry])), [purchases])
  const recurringCandidateById = useMemo(
    () => new Map(recurringCandidates.map((entry) => [entry.id, entry])),
    [recurringCandidates],
  )
  const goalIdSet = useMemo(() => new Set(goals.map((entry) => String(entry._id))), [goals])
  const accountIdSet = useMemo(() => new Set(accounts.map((entry) => String(entry._id))), [accounts])
  const cardIdSet = useMemo(() => new Set(cards.map((entry) => String(entry._id))), [cards])

  const purchaseDuplicateOverlaps = useMemo(() => buildPurchaseDuplicateOverlapMatches(purchases), [purchases])

  const activeSavedView = useMemo<PurchaseSavedView>(() => {
    if (matchesSavedView(purchaseFilter, savedView, currentMonth)) {
      return savedView
    }
    return 'all_purchases'
  }, [currentMonth, purchaseFilter, savedView])

  const purchaseCategories = useMemo(() => {
    return Array.from(new Set(purchases.map((entry) => entry.category))).sort((a, b) => a.localeCompare(b))
  }, [purchases])

  const filteredPurchases = useMemo(() => {
    const search = purchaseFilter.query.trim().toLowerCase()

    return purchases.filter((entry) => {
      const matchesQuery =
        search.length === 0 ||
        entry.item.toLowerCase().includes(search) ||
        entry.category.toLowerCase().includes(search) ||
        (entry.notes ?? '').toLowerCase().includes(search)

      const matchesCategory = purchaseFilter.category === 'all' || entry.category === purchaseFilter.category
      const entryMonth = entry.statementMonth ?? entry.purchaseDate.slice(0, 7)
      const matchesMonth = purchaseFilter.month.length === 0 || entryMonth === purchaseFilter.month
      const entryStatus = entry.reconciliationStatus ?? 'posted'
      const matchesReconciliation =
        purchaseFilter.reconciliationStatus === 'all' || entryStatus === purchaseFilter.reconciliationStatus
      const entryOwnership = entry.ownership ?? 'shared'
      const matchesOwnership = purchaseFilter.ownership === 'all' || entryOwnership === purchaseFilter.ownership
      const entryTaxDeductible = Boolean(entry.taxDeductible)
      const matchesTaxDeductible =
        purchaseFilter.taxDeductible === 'all' ||
        (purchaseFilter.taxDeductible === 'yes' ? entryTaxDeductible : !entryTaxDeductible)
      const entryFundingSourceType = entry.fundingSourceType ?? 'unassigned'
      const matchesFundingSource =
        purchaseFilter.fundingSourceType === 'all' || entryFundingSourceType === purchaseFilter.fundingSourceType

      return (
        matchesQuery &&
        matchesCategory &&
        matchesMonth &&
        matchesReconciliation &&
        matchesOwnership &&
        matchesTaxDeductible &&
        matchesFundingSource
      )
    })
  }, [purchases, purchaseFilter])

  const filteredPurchaseTotal = filteredPurchases.reduce((sum, entry) => sum + entry.amount, 0)
  const filteredPurchaseAverage = filteredPurchases.length > 0 ? filteredPurchaseTotal / filteredPurchases.length : 0

  const monthPurchases = useMemo(() => {
    const monthKey = purchaseFilter.month.length > 0 ? purchaseFilter.month : currentMonth
    return purchases.filter((entry) => (entry.statementMonth ?? entry.purchaseDate.slice(0, 7)) === monthKey)
  }, [currentMonth, purchaseFilter.month, purchases])

  const monthPurchaseSummary = useMemo(() => {
    let pendingTotal = 0
    let postedTotal = 0
    let reconciledTotal = 0

    monthPurchases.forEach((entry) => {
      const status = entry.reconciliationStatus ?? 'posted'
      if (status === 'pending') {
        pendingTotal += entry.amount
      } else if (status === 'reconciled') {
        reconciledTotal += entry.amount
      } else {
        postedTotal += entry.amount
      }
    })

    return {
      monthTotal: pendingTotal + postedTotal + reconciledTotal,
      pendingTotal,
      postedTotal,
      reconciledTotal,
      clearedTotal: postedTotal + reconciledTotal,
      pendingCount: monthPurchases.filter((entry) => (entry.reconciliationStatus ?? 'posted') === 'pending').length,
      postedCount: monthPurchases.filter((entry) => (entry.reconciliationStatus ?? 'posted') === 'posted').length,
      reconciledCount: monthPurchases.filter((entry) => (entry.reconciliationStatus ?? 'posted') === 'reconciled').length,
    }
  }, [monthPurchases])

  const filteredStatusCounts = useMemo(() => {
    return filteredPurchases.reduce(
      (acc, entry) => {
        const status = entry.reconciliationStatus ?? 'posted'
        if (status === 'pending') acc.pending += 1
        else if (status === 'reconciled') acc.reconciled += 1
        else acc.posted += 1
        return acc
      },
      { pending: 0, posted: 0, reconciled: 0 },
    )
  }, [filteredPurchases])

  const validPurchaseIdSet = useMemo(() => new Set(purchases.map((entry) => entry._id)), [purchases])
  const selectedPurchaseIdsNormalized = useMemo(
    () => selectedPurchaseIds.filter((id) => validPurchaseIdSet.has(id)),
    [selectedPurchaseIds, validPurchaseIdSet],
  )
  const selectedPurchaseSet = useMemo(() => new Set(selectedPurchaseIdsNormalized), [selectedPurchaseIdsNormalized])
  const selectedPurchaseCount = selectedPurchaseIdsNormalized.length
  const selectedPurchaseTotal = useMemo(
    () => purchases.filter((entry) => selectedPurchaseSet.has(entry._id)).reduce((sum, entry) => sum + entry.amount, 0),
    [purchases, selectedPurchaseSet],
  )

  const toggleSelectedPurchase = (id: PurchaseId) => {
    setSelectedPurchaseIds((previous) =>
      previous.includes(id) ? previous.filter((entry) => entry !== id) : [...previous, id],
    )
  }

  const toggleSelectFilteredPurchases = () => {
    const visibleIds = filteredPurchases.map((entry) => entry._id)
    if (visibleIds.length === 0) {
      return
    }

    const allVisibleSelected = visibleIds.every((id) => selectedPurchaseSet.has(id))
    if (allVisibleSelected) {
      setSelectedPurchaseIds((previous) => previous.filter((id) => !visibleIds.includes(id)))
      return
    }

    setSelectedPurchaseIds((previous) => Array.from(new Set([...previous, ...visibleIds])))
  }

  const clearSelectedPurchases = () => {
    setSelectedPurchaseIds([])
  }

  const onAddPurchase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    try {
      await addPurchase({
        item: purchaseForm.item,
        amount: parseFloatInput(purchaseForm.amount, 'Purchase amount'),
        category: purchaseForm.category,
        purchaseDate: purchaseForm.purchaseDate,
        reconciliationStatus: purchaseForm.reconciliationStatus,
        statementMonth: purchaseForm.statementMonth,
        ownership: purchaseForm.ownership,
        taxDeductible: purchaseForm.taxDeductible,
        fundingSourceType: purchaseForm.fundingSourceType,
        fundingSourceId:
          purchaseForm.fundingSourceType === 'unassigned' || purchaseForm.fundingSourceId.trim().length === 0
            ? undefined
            : purchaseForm.fundingSourceId,
        notes: purchaseForm.notes || undefined,
        source: 'manual',
      })

      setPurchaseForm(buildInitialPurchaseForm(preference))
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onDeletePurchase = async (id: PurchaseId) => {
    clearError()
    try {
      if (purchaseEditId === id) {
        setPurchaseEditId(null)
      }
      setSelectedPurchaseIds((previous) => previous.filter((entry) => entry !== id))
      await removePurchase({ id, source: 'manual' })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const startPurchaseEdit = (entry: PurchaseEntry) => {
    setPurchaseEditId(entry._id)
    setPurchaseEditDraft({
      item: entry.item,
      amount: String(entry.amount),
      category: entry.category,
      purchaseDate: entry.purchaseDate,
      reconciliationStatus: entry.reconciliationStatus ?? 'posted',
      statementMonth: entry.statementMonth ?? entry.purchaseDate.slice(0, 7),
      ownership: entry.ownership ?? 'shared',
      taxDeductible: Boolean(entry.taxDeductible),
      fundingSourceType: entry.fundingSourceType ?? 'unassigned',
      fundingSourceId: entry.fundingSourceId ?? '',
      notes: entry.notes ?? '',
    })
  }

  const savePurchaseEdit = async () => {
    if (!purchaseEditId) return

    clearError()
    try {
      await updatePurchase({
        id: purchaseEditId,
        item: purchaseEditDraft.item,
        amount: parseFloatInput(purchaseEditDraft.amount, 'Purchase amount'),
        category: purchaseEditDraft.category,
        purchaseDate: purchaseEditDraft.purchaseDate,
        reconciliationStatus: purchaseEditDraft.reconciliationStatus,
        statementMonth: purchaseEditDraft.statementMonth,
        ownership: purchaseEditDraft.ownership,
        taxDeductible: purchaseEditDraft.taxDeductible,
        fundingSourceType: purchaseEditDraft.fundingSourceType,
        fundingSourceId:
          purchaseEditDraft.fundingSourceType === 'unassigned' || purchaseEditDraft.fundingSourceId.trim().length === 0
            ? undefined
            : purchaseEditDraft.fundingSourceId,
        notes: purchaseEditDraft.notes || undefined,
        source: 'manual',
      })
      setPurchaseEditId(null)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onSetPurchaseReconciliation = async (id: PurchaseId, reconciliationStatus: ReconciliationStatus) => {
    clearError()
    try {
      const entry = purchases.find((purchase) => purchase._id === id)
      if (!entry) {
        return
      }

      await setPurchaseReconciliation({
        id,
        reconciliationStatus,
        statementMonth: entry.statementMonth ?? entry.purchaseDate.slice(0, 7),
        source: 'manual',
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const duplicatePurchase = async (entry: PurchaseEntry) => {
    clearError()

    const today = toIsoToday()
    try {
      await addPurchase({
        item: entry.item,
        amount: entry.amount,
        category: entry.category,
        purchaseDate: today,
        reconciliationStatus: 'posted',
        statementMonth: today.slice(0, 7),
        ownership: entry.ownership ?? 'shared',
        taxDeductible: Boolean(entry.taxDeductible),
        fundingSourceType: entry.fundingSourceType ?? 'unassigned',
        fundingSourceId: entry.fundingSourceId,
        notes: entry.notes,
        source: 'duplicate_action',
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const runBulkStatus = async (status: ReconciliationStatus) => {
    if (selectedPurchaseIdsNormalized.length === 0) return

    clearError()
    try {
      await bulkUpdatePurchaseReconciliation({
        ids: selectedPurchaseIdsNormalized,
        reconciliationStatus: status,
        statementMonth: purchaseFilter.month || undefined,
        source: 'bulk_reconcile',
      })
      clearSelectedPurchases()
    } catch (error) {
      handleMutationError(error)
    }
  }

  const runBulkCategory = async () => {
    if (selectedPurchaseIdsNormalized.length === 0 || bulkCategory.trim().length === 0) {
      return
    }

    clearError()
    try {
      await bulkUpdatePurchaseCategory({
        ids: selectedPurchaseIdsNormalized,
        category: bulkCategory,
        source: 'bulk_category',
      })
      setBulkCategory('')
      clearSelectedPurchases()
    } catch (error) {
      handleMutationError(error)
    }
  }

  const runBulkDelete = async () => {
    if (selectedPurchaseIdsNormalized.length === 0) return

    clearError()
    try {
      await bulkDeletePurchases({ ids: selectedPurchaseIdsNormalized, source: 'bulk_delete' })
      clearSelectedPurchases()
    } catch (error) {
      handleMutationError(error)
    }
  }

  const applySavedView = (nextView: PurchaseSavedView) => {
    setSavedView(nextView)
    setPurchaseFilter((previous) => applySavedViewToFilter(nextView, currentMonth, previous))
  }

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
    }>,
  ) => {
    const fundingSourceType = overrides.fundingSourceType ?? entry.fundingSourceType ?? 'unassigned'
    const fundingSourceIdRaw = overrides.fundingSourceId ?? entry.fundingSourceId
    const fundingSourceId =
      fundingSourceType === 'unassigned' || !fundingSourceIdRaw || fundingSourceIdRaw.trim().length === 0
        ? undefined
        : fundingSourceIdRaw
    const notesValue = overrides.notes
    return {
      id: entry._id,
      item: overrides.item ?? entry.item,
      amount: overrides.amount ?? entry.amount,
      category: overrides.category ?? entry.category,
      purchaseDate: overrides.purchaseDate ?? entry.purchaseDate,
      reconciliationStatus: (overrides.reconciliationStatus ?? entry.reconciliationStatus ?? 'posted') as ReconciliationStatus,
      statementMonth: overrides.statementMonth ?? entry.statementMonth ?? entry.purchaseDate.slice(0, 7),
      ownership: overrides.ownership ?? entry.ownership ?? 'shared',
      taxDeductible: overrides.taxDeductible ?? Boolean(entry.taxDeductible),
      fundingSourceType,
      fundingSourceId,
      notes: notesValue?.trim() ? notesValue.trim() : undefined,
    }
  }

  const resolvePurchaseDuplicateOverlap = async (
    match: PurchaseDuplicateOverlapMatch,
    resolution: PurchaseDuplicateOverlapResolution,
  ) => {
    clearError()
    try {
      const primary = purchaseById.get(String(match.primaryPurchaseId))
      const secondary = purchaseById.get(String(match.secondaryPurchaseId))
      if (!primary || !secondary) {
        throw new Error('Purchase pair no longer exists. Refresh and try again.')
      }

      if (resolution === 'merge') {
        const mergedNotes = normalizeMarkerNote(
          [primary.notes, secondary.notes].filter((value): value is string => Boolean(value && value.trim())).join(' | '),
          `[merged-purchase:${String(secondary._id)}]`,
        )
        await updatePurchase({
          ...buildPurchaseUpdatePayload(primary, { notes: mergedNotes }),
          source: 'duplicate_merge',
        })
        setSelectedPurchaseIds((previous) => previous.filter((id) => id !== secondary._id))
        if (purchaseEditId === secondary._id) {
          setPurchaseEditId(null)
        }
        await removePurchase({ id: secondary._id, source: 'duplicate_merge' })
        return
      }

      if (resolution === 'archive_duplicate') {
        const updatedNotes = normalizeMarkerNote(
          normalizeMarkerNote(secondary.notes, purchaseArchivedMarker),
          `[purchase-duplicate-of:${String(primary._id)}]`,
        )
        await updatePurchase({
          ...buildPurchaseUpdatePayload(secondary, {
            reconciliationStatus: 'pending',
            notes: updatedNotes,
          }),
          source: 'duplicate_archive',
        })
        return
      }

      const primaryTaggedNotes = normalizeMarkerNote(
        primary.notes,
        `${purchaseIntentionalMarkerPrefix}${String(secondary._id)}]`,
      )
      const secondaryTaggedNotes = normalizeMarkerNote(
        secondary.notes,
        `${purchaseIntentionalMarkerPrefix}${String(primary._id)}]`,
      )
      await Promise.all([
        updatePurchase({
          ...buildPurchaseUpdatePayload(primary, { notes: primaryTaggedNotes }),
          source: 'duplicate_mark_intentional',
        }),
        updatePurchase({
          ...buildPurchaseUpdatePayload(secondary, { notes: secondaryTaggedNotes }),
          source: 'duplicate_mark_intentional',
        }),
      ])
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onConvertRecurringCandidateToBill = async (candidateId: string) => {
    const candidate = recurringCandidateById.get(candidateId)
    if (!candidate) {
      handleMutationError(new Error('Recurring purchase candidate was not found.'))
      return
    }

    clearError()
    try {
      const day = Number.parseInt(candidate.nextExpectedDate.slice(8, 10), 10)
      const dueDay = Number.isFinite(day) && day >= 1 && day <= 31 ? day : 1
      const cadenceConfig = resolveRecurringCadence(Math.max(candidate.averageIntervalDays, 1))

      await addBill({
        name: candidate.label.trim(),
        amount: roundCurrency(Math.max(candidate.averageAmount, 0.01)),
        dueDay,
        cadence: cadenceConfig.cadence,
        customInterval: cadenceConfig.customInterval,
        customUnit: cadenceConfig.customUnit,
        category: resolveBillCategoryFromPurchase(candidate.category),
        scope: 'shared',
        deductible: false,
        isSubscription: false,
        cancelReminderDays: undefined,
        linkedAccountId: undefined,
        autopay: false,
        notes: `Created from recurring purchase signal (${candidate.count} entries, confidence ${Math.round(
          candidate.confidence * 100,
        )}%).`,
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const upsertPurchaseSplits = async (input: { purchaseId: PurchaseId; splits: PurchaseSplitInput[] }) => {
    clearError()
    try {
      const purchase = purchaseById.get(String(input.purchaseId))
      if (!purchase) {
        throw new Error('Purchase not found.')
      }

      if (input.splits.length === 0) {
        throw new Error('Add at least one split line.')
      }

      const normalized = input.splits.map((line, index) => {
        const category = line.category.trim()
        if (!category) {
          throw new Error(`Split line ${index + 1} is missing a category.`)
        }
        const amount = roundCurrency(Math.max(line.amount, 0))
        if (amount <= 0) {
          throw new Error(`Split line ${index + 1} amount must be greater than zero.`)
        }

        if (line.goalId && !goalIdSet.has(String(line.goalId))) {
          throw new Error(`Split line ${index + 1} references a goal that is not available.`)
        }
        if (line.accountId && !accountIdSet.has(String(line.accountId))) {
          throw new Error(`Split line ${index + 1} references an account that is not available.`)
        }

        return {
          category,
          amount,
          goalId: line.goalId,
          accountId: line.accountId,
        }
      })

      const total = roundCurrency(normalized.reduce((sum, line) => sum + line.amount, 0))
      if (Math.abs(total - roundCurrency(purchase.amount)) > 0.01) {
        throw new Error('Split total must exactly match purchase amount.')
      }

      await upsertPurchaseSplitsMutation({
        purchaseId: input.purchaseId,
        splits: normalized,
        source: 'split_manual',
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const clearPurchaseSplitsForPurchase = async (purchaseId: PurchaseId) => {
    clearError()
    try {
      if (!purchaseById.has(String(purchaseId))) {
        throw new Error('Purchase not found.')
      }
      await clearPurchaseSplitsMutation({ purchaseId, source: 'split_manual' })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const addPurchaseSplitTemplate = async (input: { name: string; splits: PurchaseSplitTemplateLineInput[] }) => {
    clearError()
    try {
      const name = input.name.trim()
      if (!name) {
        throw new Error('Template name is required.')
      }
      if (input.splits.length === 0) {
        throw new Error('Template requires at least one line.')
      }

      const normalized = input.splits.map((line, index) => {
        const category = line.category.trim()
        if (!category) {
          throw new Error(`Template line ${index + 1} is missing a category.`)
        }
        const percentage = roundCurrency(Math.max(line.percentage, 0))
        if (percentage <= 0) {
          throw new Error(`Template line ${index + 1} percentage must be greater than zero.`)
        }
        if (line.goalId && !goalIdSet.has(String(line.goalId))) {
          throw new Error(`Template line ${index + 1} has an invalid goal.`)
        }
        if (line.accountId && !accountIdSet.has(String(line.accountId))) {
          throw new Error(`Template line ${index + 1} has an invalid account.`)
        }
        return {
          category,
          percentage,
          goalId: line.goalId,
          accountId: line.accountId,
        }
      })

      const percentageTotal = roundCurrency(normalized.reduce((sum, line) => sum + line.percentage, 0))
      if (Math.abs(percentageTotal - 100) > 0.01) {
        throw new Error('Template percentages must total 100%.')
      }

      await addPurchaseSplitTemplateMutation({
        name,
        splits: normalized,
        source: 'split_template_manual',
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const updatePurchaseSplitTemplate = async (input: {
    id: PurchaseSplitTemplateEntry['_id']
    name: string
    splits: PurchaseSplitTemplateLineInput[]
  }) => {
    clearError()
    try {
      const existing = purchaseSplitTemplates.find((entry) => entry._id === input.id)
      if (!existing) {
        throw new Error('Template not found.')
      }

      const name = input.name.trim()
      if (!name) {
        throw new Error('Template name is required.')
      }
      if (input.splits.length === 0) {
        throw new Error('Template requires at least one line.')
      }

      const normalized = input.splits.map((line, index) => {
        const category = line.category.trim()
        if (!category) {
          throw new Error(`Template line ${index + 1} is missing a category.`)
        }
        const percentage = roundCurrency(Math.max(line.percentage, 0))
        if (percentage <= 0) {
          throw new Error(`Template line ${index + 1} percentage must be greater than zero.`)
        }
        if (line.goalId && !goalIdSet.has(String(line.goalId))) {
          throw new Error(`Template line ${index + 1} has an invalid goal.`)
        }
        if (line.accountId && !accountIdSet.has(String(line.accountId))) {
          throw new Error(`Template line ${index + 1} has an invalid account.`)
        }
        return {
          category,
          percentage,
          goalId: line.goalId,
          accountId: line.accountId,
        }
      })

      const percentageTotal = roundCurrency(normalized.reduce((sum, line) => sum + line.percentage, 0))
      if (Math.abs(percentageTotal - 100) > 0.01) {
        throw new Error('Template percentages must total 100%.')
      }

      await updatePurchaseSplitTemplateMutation({
        id: input.id,
        name,
        splits: normalized,
        source: 'split_template_manual',
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const removePurchaseSplitTemplate = async (id: PurchaseSplitTemplateEntry['_id']) => {
    clearError()
    try {
      await removePurchaseSplitTemplateMutation({ id, source: 'split_template_manual' })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const applyPurchaseSplitTemplateToPurchase = async (input: {
    purchaseId: PurchaseId
    templateId: PurchaseSplitTemplateEntry['_id']
  }) => {
    clearError()
    try {
      if (!purchaseById.has(String(input.purchaseId))) {
        throw new Error('Purchase not found.')
      }
      if (!purchaseSplitTemplates.some((entry) => entry._id === input.templateId)) {
        throw new Error('Split template not found.')
      }
      await applyPurchaseSplitTemplateMutation({
        purchaseId: input.purchaseId,
        templateId: input.templateId,
        source: 'split_template_apply',
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const importPurchasesFromRows = async (rows: PurchaseImportInput[]) => {
    clearError()
    if (rows.length === 0) {
      return {
        created: 0,
        failed: 0,
        errors: ['No rows to import.'],
      }
    }

    let created = 0
    const errors: string[] = []

    const toSafeSourceId = (row: PurchaseImportInput) => {
      const value = row.fundingSourceId?.trim()
      if (row.fundingSourceType === 'unassigned' || !value) {
        return undefined
      }
      if (row.fundingSourceType === 'account' && !accountIdSet.has(value)) {
        throw new Error(`Account source "${value}" was not found.`)
      }
      if (row.fundingSourceType === 'card' && !cardIdSet.has(value)) {
        throw new Error(`Card source "${value}" was not found.`)
      }
      return value
    }

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      try {
        const item = row.item.trim()
        const category = row.category.trim()
        if (!item) {
          throw new Error('Item is required.')
        }
        if (!category) {
          throw new Error('Category is required.')
        }
        if (!Number.isFinite(row.amount) || row.amount <= 0) {
          throw new Error('Amount must be greater than zero.')
        }
        if (!purchaseDatePattern.test(row.purchaseDate)) {
          throw new Error('Purchase date must be YYYY-MM-DD.')
        }
        if (!monthPattern.test(row.statementMonth)) {
          throw new Error('Statement month must be YYYY-MM.')
        }

        await addPurchase({
          item,
          amount: roundCurrency(row.amount),
          category,
          purchaseDate: row.purchaseDate,
          reconciliationStatus: row.reconciliationStatus,
          statementMonth: row.statementMonth,
          ownership: row.ownership,
          taxDeductible: row.taxDeductible,
          fundingSourceType: row.fundingSourceType,
          fundingSourceId: toSafeSourceId(row),
          notes: row.notes?.trim() || undefined,
          source: 'bulk_import',
        })
        created += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown import error.'
        errors.push(`Row ${index + 1}: ${message}`)
      }
    }

    if (errors.length > 0) {
      handleMutationError(new Error(errors.slice(0, 2).join(' ')))
    }

    return {
      created,
      failed: rows.length - created,
      errors,
    }
  }

  return {
    purchaseForm,
    setPurchaseForm,
    purchaseEditId,
    setPurchaseEditId,
    purchaseEditDraft,
    setPurchaseEditDraft,
    purchaseFilter,
    setPurchaseFilter,
    purchaseCategories,
    filteredPurchases,
    filteredPurchaseTotal,
    filteredPurchaseAverage,
    monthPurchaseSummary,
    filteredStatusCounts,
    selectedPurchaseIds: selectedPurchaseIdsNormalized,
    selectedPurchaseSet,
    selectedPurchaseCount,
    selectedPurchaseTotal,
    toggleSelectedPurchase,
    toggleSelectFilteredPurchases,
    clearSelectedPurchases,
    bulkCategory,
    setBulkCategory,
    savedView: activeSavedView,
    applySavedView,
    onAddPurchase,
    onDeletePurchase,
    startPurchaseEdit,
    savePurchaseEdit,
    onSetPurchaseReconciliation,
    duplicatePurchase,
    runBulkStatus,
    runBulkCategory,
    runBulkDelete,
    purchaseDuplicateOverlaps,
    resolvePurchaseDuplicateOverlap,
    onConvertRecurringCandidateToBill,
    upsertPurchaseSplits,
    clearPurchaseSplitsForPurchase,
    addPurchaseSplitTemplate,
    updatePurchaseSplitTemplate,
    removePurchaseSplitTemplate,
    applyPurchaseSplitTemplateToPurchase,
    importPurchasesFromRows,
    purchaseSplits,
    recurringCandidates,
    purchases,
  }
}
