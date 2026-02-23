import { Fragment, useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type {
  AccountId,
  AccountEntry,
  BillCategory,
  BillCategoryOption,
  BillEditDraft,
  BillEntry,
  BillForm,
  BillId,
  BillPaymentCheckEntry,
  BillPaymentCheckId,
  BillScope,
  BillScopeOption,
  Cadence,
  CadenceOption,
  CustomCadenceUnit,
  CustomCadenceUnitOption,
  SubscriptionPriceChangeEntry,
} from './financeTypes'
import { nextDateForCadence, toIsoDate } from '../lib/cadenceDates'
import { toMonthlyAmount } from '../lib/incomeMath'

type BillSortKey = 'name_asc' | 'amount_desc' | 'amount_asc' | 'day_asc' | 'cadence_asc' | 'autopay_first'

const variableBillKeywordPattern = /\b(variable|usage|meter(ed)?|estimated?|seasonal|fluctuat(?:e|es|ing|ion))\b/i
const monthKeyPattern = /^(\d{4})-(\d{2})$/
const msPerDay = 86400000

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const toMonthIndex = (date: Date) => date.getFullYear() * 12 + date.getMonth()

const parseMonthKeyIndex = (value: string) => {
  const match = monthKeyPattern.exec(value)
  if (!match) return null
  const year = Number.parseInt(match[1], 10)
  const month = Number.parseInt(match[2], 10)
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null
  }
  return year * 12 + (month - 1)
}

const parseIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null
  }
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed
}

const clampDayToMonth = (year: number, month: number, day: number) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(Math.max(day, 1), daysInMonth))
}

const addMonthsWithDay = (baseDate: Date, monthDelta: number, day: number) => {
  const targetMonth = baseDate.getMonth() + monthDelta
  const targetYear = baseDate.getFullYear() + Math.floor(targetMonth / 12)
  const normalizedMonth = ((targetMonth % 12) + 12) % 12
  return clampDayToMonth(targetYear, normalizedMonth, day)
}

const previousDueDateForBill = (entry: BillEntry, nextDueDate: Date) => {
  switch (entry.cadence) {
    case 'weekly':
      return new Date(nextDueDate.getFullYear(), nextDueDate.getMonth(), nextDueDate.getDate() - 7)
    case 'biweekly':
      return new Date(nextDueDate.getFullYear(), nextDueDate.getMonth(), nextDueDate.getDate() - 14)
    case 'monthly':
      return addMonthsWithDay(nextDueDate, -1, entry.dueDay)
    case 'quarterly':
      return addMonthsWithDay(nextDueDate, -3, entry.dueDay)
    case 'yearly':
      return addMonthsWithDay(nextDueDate, -12, entry.dueDay)
    case 'custom':
      if (!entry.customInterval || !entry.customUnit || entry.customInterval <= 0) {
        return null
      }
      if (entry.customUnit === 'days') {
        return new Date(nextDueDate.getFullYear(), nextDueDate.getMonth(), nextDueDate.getDate() - entry.customInterval)
      }
      if (entry.customUnit === 'weeks') {
        return new Date(
          nextDueDate.getFullYear(),
          nextDueDate.getMonth(),
          nextDueDate.getDate() - entry.customInterval * 7,
        )
      }
      if (entry.customUnit === 'months') {
        return addMonthsWithDay(nextDueDate, -entry.customInterval, entry.dueDay)
      }
      return addMonthsWithDay(nextDueDate, -(entry.customInterval * 12), entry.dueDay)
    case 'one_time':
    default:
      return null
  }
}

const isVariableBill = (entry: BillEntry) => {
  if (variableBillKeywordPattern.test(entry.notes ?? '')) {
    return true
  }
  return entry.cadence === 'custom' || entry.cadence === 'weekly' || entry.cadence === 'biweekly'
}

const formatVarianceTrendLabel = (variance: number) => {
  if (variance > 0.005) return 'above plan trend'
  if (variance < -0.005) return 'below plan trend'
  return 'on-plan trend'
}

type BillPaymentLogDraft = {
  cycleMonth: string
  expectedAmount: string
  actualAmount: string
  paidDay: string
  note: string
}

type AutopayRiskLevel = 'good' | 'warning' | 'critical' | 'unlinked'

type AutopayRiskCheck = {
  level: AutopayRiskLevel
  projectedBeforeDue?: number
  linkedAccountName?: string
}

type SubscriptionInsightRow = {
  id: BillId
  name: string
  cadenceText: string
  amount: number
  annualizedCost: number
  nextRenewalDate: Date | null
  daysToRenewal: number | null
  cancelReminderDays: number
  cancelReminderDate: Date | null
  cancelReminderDue: boolean
  latestPriceChange?: SubscriptionPriceChangeEntry
}

type ProviderIntelligenceAlert = 'good' | 'warning' | 'critical'

type ProviderIntelligenceRow = {
  id: BillId
  provider: string
  total3Months: number
  total6Months: number
  total12Months: number
  avgIncreasePercent: number
  increaseEvents12Months: number
  lastIncreasePercent: number
  priceCreepAlert: ProviderIntelligenceAlert
  priceCreepReason: string
}

type BillOverlapKind = 'duplicate' | 'overlap'
type BillOverlapResolution = 'merge' | 'archive_duplicate' | 'mark_intentional'
type BillsMonthlyBulkAction = 'roll_recurring_forward' | 'mark_all_paid_from_account' | 'reconcile_batch'
type BillOverlapConfirmationState = {
  match: BillOverlapMatch
  resolution: BillOverlapResolution
}

type BillsMonthlyBulkActionResult = {
  batchId: string
  action: BillsMonthlyBulkAction
  cycleMonth: string
  targetMonth: string | null
  eligibleCount: number
  createdCount: number
  updatedCount: number
  skippedCount: number
  totalPaidApplied: number
  totalReconciledAmount: number
  reconciledFromPlannedCount: number
  fundingAccountId: string | null
  fundingAccountName: string | null
}

type BillOverlapMatch = {
  id: string
  primaryBillId: BillId
  secondaryBillId: BillId
  primaryName: string
  secondaryName: string
  kind: BillOverlapKind
  nameSimilarity: number
  amountDelta: number
  amountDeltaPercent: number
  dueDayDelta: number
  cadenceComparable: boolean
  reason: string
}

type BillOverlapSignal = {
  billId: BillId
  billName: string
  duplicateMatches: number
  overlapMatches: number
}

const billNameStopWords = new Set([
  'bill',
  'payment',
  'account',
  'direct',
  'debit',
  'dd',
  'subscription',
  'service',
  'charge',
  'plan',
  'monthly',
  'weekly',
  'annual',
  'yearly',
])
const archivedDuplicateNoteMarker = '[archived-duplicate]'
const intentionalOverlapMarkerPrefix = '[intentional-overlap:'

const normalizeBillNameForMatch = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const tokenizeBillName = (value: string) =>
  normalizeBillNameForMatch(value)
    .split(' ')
    .filter((token) => token.length > 1 && !billNameStopWords.has(token))

const calculateNameSimilarity = (left: string, right: string) => {
  const normalizedLeft = normalizeBillNameForMatch(left)
  const normalizedRight = normalizeBillNameForMatch(right)

  if (normalizedLeft.length === 0 || normalizedRight.length === 0) {
    return 0
  }

  if (normalizedLeft === normalizedRight) {
    return 1
  }

  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return 0.94
  }

  const leftTokens = new Set(tokenizeBillName(left))
  const rightTokens = new Set(tokenizeBillName(right))
  const tokenUnion = new Set([...leftTokens, ...rightTokens])
  if (tokenUnion.size === 0) {
    return 0
  }

  let intersection = 0
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      intersection += 1
    }
  })

  return intersection / tokenUnion.size
}

const cadenceGrouping = (entry: BillEntry) => {
  if (entry.cadence === 'custom') {
    return `custom:${entry.customInterval ?? 0}:${entry.customUnit ?? 'months'}`
  }
  return entry.cadence
}

const areCadencesComparable = (left: BillEntry, right: BillEntry) => {
  const leftGroup = cadenceGrouping(left)
  const rightGroup = cadenceGrouping(right)
  if (leftGroup === rightGroup) {
    return true
  }

  const monthlyLike = new Set(['monthly', 'quarterly', 'yearly'])
  if (monthlyLike.has(left.cadence) && monthlyLike.has(right.cadence)) {
    return true
  }

  return false
}

const hasArchivedDuplicateMarker = (notes?: string) =>
  (notes ?? '').toLowerCase().includes(archivedDuplicateNoteMarker)

const hasIntentionalPairMarker = (left: BillEntry, right: BillEntry) => {
  const leftNotes = (left.notes ?? '').toLowerCase()
  const rightNotes = (right.notes ?? '').toLowerCase()
  const leftTargetsRight = leftNotes.includes(`${intentionalOverlapMarkerPrefix}${String(right._id).toLowerCase()}]`)
  const rightTargetsLeft = rightNotes.includes(`${intentionalOverlapMarkerPrefix}${String(left._id).toLowerCase()}]`)
  return leftTargetsRight || rightTargetsLeft
}

const resolveBillScope = (entry: Pick<BillEntry, 'scope'>): BillScope =>
  entry.scope === 'personal' ? 'personal' : 'shared'

const resolveBillCategory = (entry: Pick<BillEntry, 'category'>): BillCategory =>
  (entry.category as BillCategory | undefined) ?? 'other'

const buildBillOverlapMatches = (bills: BillEntry[]) => {
  const matches: BillOverlapMatch[] = []

  for (let leftIndex = 0; leftIndex < bills.length; leftIndex += 1) {
    const left = bills[leftIndex]
    for (let rightIndex = leftIndex + 1; rightIndex < bills.length; rightIndex += 1) {
      const right = bills[rightIndex]

      if (resolveBillScope(left) !== resolveBillScope(right)) {
        continue
      }

      if (hasArchivedDuplicateMarker(left.notes) || hasArchivedDuplicateMarker(right.notes)) {
        continue
      }
      if (hasIntentionalPairMarker(left, right)) {
        continue
      }

      const nameSimilarity = calculateNameSimilarity(left.name, right.name)
      if (nameSimilarity < 0.55) {
        continue
      }

      const amountDelta = Math.abs(left.amount - right.amount)
      const amountDeltaPercent = amountDelta / Math.max(Math.max(left.amount, right.amount), 1)
      const dueDayDelta = Math.abs(left.dueDay - right.dueDay)
      const cadenceComparable = areCadencesComparable(left, right)
      const duplicateCandidate =
        cadenceComparable && nameSimilarity >= 0.9 && amountDeltaPercent <= 0.03 && dueDayDelta <= 2
      const overlapCandidate =
        cadenceComparable && nameSimilarity >= 0.65 && amountDeltaPercent <= 0.2 && dueDayDelta <= 7

      if (!duplicateCandidate && !overlapCandidate) {
        continue
      }

      const kind: BillOverlapKind = duplicateCandidate ? 'duplicate' : 'overlap'
      const primary = left.createdAt <= right.createdAt ? left : right
      const secondary = primary._id === left._id ? right : left
      matches.push({
        id: `${left._id}-${right._id}`,
        primaryBillId: primary._id,
        secondaryBillId: secondary._id,
        primaryName: primary.name,
        secondaryName: secondary.name,
        kind,
        nameSimilarity,
        amountDelta,
        amountDeltaPercent,
        dueDayDelta,
        cadenceComparable,
        reason:
          kind === 'duplicate'
            ? 'Very similar name, amount, and due timing.'
            : 'Similar name, amount, and due timing.',
      })
    }
  }

  return matches.sort((left, right) => {
    const kindRank = (value: BillOverlapKind) => (value === 'duplicate' ? 0 : 1)
    if (kindRank(left.kind) !== kindRank(right.kind)) {
      return kindRank(left.kind) - kindRank(right.kind)
    }
    if (left.nameSimilarity !== right.nameSimilarity) {
      return right.nameSimilarity - left.nameSimilarity
    }
    if (left.amountDeltaPercent !== right.amountDeltaPercent) {
      return left.amountDeltaPercent - right.amountDeltaPercent
    }
    return left.dueDayDelta - right.dueDayDelta
  })
}

const getOverlapResolutionCopy = (resolution: BillOverlapResolution) => {
  if (resolution === 'merge') {
    return {
      title: 'Confirm Merge',
      confirmLabel: 'Confirm merge',
      description:
        'This keeps the primary bill, moves non-duplicate cycle logs and subscription price-change history from the secondary bill, then removes the secondary record.',
    }
  }

  if (resolution === 'archive_duplicate') {
    return {
      title: 'Confirm Archive Duplicate',
      confirmLabel: 'Confirm archive',
      description:
        'This keeps the primary bill and archives the secondary bill by converting it to one-time, disabling autopay/subscription flags, and tagging it as archived duplicate.',
    }
  }

  return {
    title: 'Confirm Intentional Overlap',
    confirmLabel: 'Confirm intentional',
    description:
      'This keeps both bills and tags them as an intentional overlap pair so this specific pair is no longer flagged in duplicate/overlap checks.',
  }
}

const billTableColumnCount = 8

type BillsTabProps = {
  accounts: AccountEntry[]
  bills: BillEntry[]
  billPaymentChecks: BillPaymentCheckEntry[]
  subscriptionPriceChanges: SubscriptionPriceChangeEntry[]
  monthlyBills: number
  billForm: BillForm
  setBillForm: Dispatch<SetStateAction<BillForm>>
  billEditId: BillId | null
  setBillEditId: Dispatch<SetStateAction<BillId | null>>
  billEditDraft: BillEditDraft
  setBillEditDraft: Dispatch<SetStateAction<BillEditDraft>>
  onAddBill: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onDeleteBill: (id: BillId) => Promise<void>
  onUpsertBillPaymentCheck: (args: {
    billId: BillId
    cycleMonth: string
    expectedAmount: string
    actualAmount?: string
    paidDay?: string
    note?: string
  }) => Promise<void>
  onDeleteBillPaymentCheck: (id: BillPaymentCheckId) => Promise<void>
  saveBillEdit: () => Promise<void>
  startBillEdit: (entry: BillEntry) => void
  onResolveBillDuplicateOverlap: (args: {
    primaryBillId: BillId
    secondaryBillId: BillId
    resolution: BillOverlapResolution
  }) => Promise<void>
  onRunBillsMonthlyBulkAction: (args: {
    action: BillsMonthlyBulkAction
    cycleMonth: string
    fundingAccountId?: AccountId
  }) => Promise<BillsMonthlyBulkActionResult>
  billCategoryOptions: BillCategoryOption[]
  billScopeOptions: BillScopeOption[]
  cadenceOptions: CadenceOption[]
  customCadenceUnitOptions: CustomCadenceUnitOption[]
  isCustomCadence: (cadence: Cadence) => boolean
  cadenceLabel: (cadence: Cadence, customInterval?: number, customUnit?: CustomCadenceUnit) => string
  formatMoney: (value: number) => string
}

export function BillsTab({
  accounts,
  bills,
  billPaymentChecks,
  subscriptionPriceChanges,
  monthlyBills,
  billForm,
  setBillForm,
  billEditId,
  setBillEditId,
  billEditDraft,
  setBillEditDraft,
  onAddBill,
  onDeleteBill,
  onUpsertBillPaymentCheck,
  onDeleteBillPaymentCheck,
  saveBillEdit,
  startBillEdit,
  onResolveBillDuplicateOverlap,
  onRunBillsMonthlyBulkAction,
  billCategoryOptions,
  billScopeOptions,
  cadenceOptions,
  customCadenceUnitOptions,
  isCustomCadence,
  cadenceLabel,
  formatMoney,
}: BillsTabProps) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<BillSortKey>('name_asc')
  const [timelineWindowDays, setTimelineWindowDays] = useState<14 | 30>(14)
  const [paymentLogBillId, setPaymentLogBillId] = useState<BillId | null>(null)
  const [resolvingOverlapId, setResolvingOverlapId] = useState<string | null>(null)
  const [overlapConfirmation, setOverlapConfirmation] = useState<BillOverlapConfirmationState | null>(null)
  const [bulkCycleMonth, setBulkCycleMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [bulkFundingAccountId, setBulkFundingAccountId] = useState('')
  const [runningBulkAction, setRunningBulkAction] = useState<BillsMonthlyBulkAction | null>(null)
  const [bulkActionError, setBulkActionError] = useState<string | null>(null)
  const [bulkActionResult, setBulkActionResult] = useState<BillsMonthlyBulkActionResult | null>(null)
  const [paymentLogDraft, setPaymentLogDraft] = useState<BillPaymentLogDraft>(() => ({
    cycleMonth: new Date().toISOString().slice(0, 7),
    expectedAmount: '',
    actualAmount: '',
    paidDay: '',
    note: '',
  }))
  const timelineDateFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }),
    [],
  )
  const subscriptionDateFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    [],
  )
  const billCategoryLabelMap = useMemo(
    () => new Map<BillCategory, string>(billCategoryOptions.map((option) => [option.value, option.label])),
    [billCategoryOptions],
  )
  const billScopeLabelMap = useMemo(
    () => new Map<BillScope, string>(billScopeOptions.map((option) => [option.value, option.label])),
    [billScopeOptions],
  )
  const billById = useMemo(() => new Map<BillId, BillEntry>(bills.map((entry) => [entry._id, entry])), [bills])

  const billPaymentChecksByBillId = useMemo(() => {
    const map = new Map<BillId, BillPaymentCheckEntry[]>()
    billPaymentChecks.forEach((entry) => {
      const key = entry.billId as BillId
      const current = map.get(key) ?? []
      current.push(entry)
      map.set(key, current)
    })

    map.forEach((entries, key) => {
      const sorted = [...entries].sort((left, right) =>
        right.cycleMonth.localeCompare(left.cycleMonth, undefined, { sensitivity: 'base' }),
      )
      map.set(key, sorted)
    })

    return map
  }, [billPaymentChecks])

  const subscriptionPriceChangesByBillId = useMemo(() => {
    const map = new Map<BillId, SubscriptionPriceChangeEntry[]>()
    subscriptionPriceChanges.forEach((entry) => {
      const key = entry.billId as BillId
      const current = map.get(key) ?? []
      current.push(entry)
      map.set(key, current)
    })

    map.forEach((entries, key) => {
      const sorted = [...entries].sort((left, right) => right.createdAt - left.createdAt)
      map.set(key, sorted)
    })

    return map
  }, [subscriptionPriceChanges])

  const billLinkedAccounts = useMemo(() => {
    const map = new Map<BillId, AccountEntry | null>()
    bills.forEach((entry) => {
      if (!entry.linkedAccountId) {
        map.set(entry._id, null)
        return
      }
      const account = accounts.find((candidate) => candidate._id === entry.linkedAccountId) ?? null
      map.set(entry._id, account)
    })
    return map
  }, [accounts, bills])

  const autopayRiskByBillId = useMemo(() => {
    const today = startOfDay(new Date())
    const horizonDays = 45
    const events: Array<{
      billId: BillId
      linkedAccount: AccountEntry
      amount: number
      dueDate: Date
      daysAway: number
    }> = []
    const risks = new Map<BillId, AutopayRiskCheck>()

    bills.forEach((entry) => {
      if (!entry.autopay) {
        return
      }

      const linkedAccount = billLinkedAccounts.get(entry._id) ?? null
      if (!linkedAccount) {
        risks.set(entry._id, {
          level: 'unlinked',
        })
        return
      }

      const nextDueDate = nextDateForCadence({
        cadence: entry.cadence,
        createdAt: entry.createdAt,
        dayOfMonth: entry.dueDay,
        customInterval: entry.customInterval ?? undefined,
        customUnit: entry.customUnit ?? undefined,
        now: today,
      })

      if (!nextDueDate) {
        return
      }

      const normalizedDueDate = startOfDay(nextDueDate)
      const daysAway = Math.round((normalizedDueDate.getTime() - today.getTime()) / msPerDay)
      if (daysAway < 0 || daysAway > horizonDays) {
        return
      }

      events.push({
        billId: entry._id,
        linkedAccount,
        amount: entry.amount,
        dueDate: normalizedDueDate,
        daysAway,
      })
    })

    events.sort((left, right) => {
      if (left.dueDate.getTime() !== right.dueDate.getTime()) {
        return left.dueDate.getTime() - right.dueDate.getTime()
      }
      if (left.daysAway !== right.daysAway) {
        return left.daysAway - right.daysAway
      }
      return right.amount - left.amount
    })

    const runningByAccountId = new Map<string, number>()
    events.forEach((event) => {
      const accountId = String(event.linkedAccount._id)
      const projectedBeforeDue = runningByAccountId.has(accountId)
        ? runningByAccountId.get(accountId)!
        : event.linkedAccount.balance
      const projectedAfterDue = projectedBeforeDue - event.amount
      runningByAccountId.set(accountId, projectedAfterDue)

      const level: AutopayRiskLevel =
        projectedBeforeDue < event.amount
          ? 'critical'
          : projectedBeforeDue < event.amount * 1.25
            ? 'warning'
            : 'good'

      risks.set(event.billId, {
        level,
        projectedBeforeDue,
        linkedAccountName: event.linkedAccount.name,
      })
    })

    return risks
  }, [billLinkedAccounts, bills])

  const selectableAccounts = useMemo(() => {
    const priority = (type: AccountEntry['type']) => {
      if (type === 'checking') return 0
      if (type === 'savings') return 1
      if (type === 'cash') return 2
      if (type === 'investment') return 3
      return 4
    }

    return [...accounts].sort((left, right) => {
      const priorityDiff = priority(left.type) - priority(right.type)
      if (priorityDiff !== 0) return priorityDiff
      return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    })
  }, [accounts])

  const billFundingAccounts = useMemo(
    () => selectableAccounts.filter((account) => account.type !== 'debt'),
    [selectableAccounts],
  )

  useEffect(() => {
    if (bulkFundingAccountId.length === 0) {
      return
    }
    const stillExists = billFundingAccounts.some((account) => String(account._id) === bulkFundingAccountId)
    if (!stillExists) {
      setBulkFundingAccountId('')
    }
  }, [billFundingAccounts, bulkFundingAccountId])

  const openPaymentLog = (entry: BillEntry) => {
    setPaymentLogBillId(entry._id)
    setPaymentLogDraft({
      cycleMonth: new Date().toISOString().slice(0, 7),
      expectedAmount: String(entry.amount),
      actualAmount: '',
      paidDay: String(entry.dueDay),
      note: '',
    })
  }

  const closePaymentLog = () => {
    setPaymentLogBillId(null)
  }

  const openOverlapConfirmation = (match: BillOverlapMatch, resolution: BillOverlapResolution) => {
    setOverlapConfirmation({
      match,
      resolution,
    })
  }

  const closeOverlapConfirmation = () => {
    if (resolvingOverlapId) {
      return
    }
    setOverlapConfirmation(null)
  }

  const resolveOverlapMatch = async (match: BillOverlapMatch, resolution: BillOverlapResolution) => {
    setResolvingOverlapId(match.id)
    try {
      await onResolveBillDuplicateOverlap({
        primaryBillId: match.primaryBillId,
        secondaryBillId: match.secondaryBillId,
        resolution,
      })
      setOverlapConfirmation(null)
    } finally {
      setResolvingOverlapId((current) => (current === match.id ? null : current))
    }
  }

  const runBillsBulkAction = async (action: BillsMonthlyBulkAction) => {
    setBulkActionError(null)
    setBulkActionResult(null)

    if (!monthKeyPattern.test(bulkCycleMonth)) {
      setBulkActionError('Choose a valid cycle month first.')
      return
    }

    if (action === 'mark_all_paid_from_account' && bulkFundingAccountId.length === 0) {
      setBulkActionError('Select a funding account before marking all bills paid.')
      return
    }

    setRunningBulkAction(action)
    try {
      const result = await onRunBillsMonthlyBulkAction({
        action,
        cycleMonth: bulkCycleMonth,
        fundingAccountId:
          action === 'mark_all_paid_from_account' ? (bulkFundingAccountId as AccountId) : undefined,
      })
      setBulkActionResult(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bulk monthly action failed.'
      setBulkActionError(message)
    } finally {
      setRunningBulkAction((current) => (current === action ? null : current))
    }
  }

  useEffect(() => {
    if (!overlapConfirmation) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!resolvingOverlapId) {
          setOverlapConfirmation(null)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [overlapConfirmation, resolvingOverlapId])

  const visibleBills = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = query
      ? bills.filter((entry) => {
          const notes = entry.notes ?? ''
          const scope = resolveBillScope(entry)
          const category = resolveBillCategory(entry)
          return `${entry.name} ${notes} ${scope} ${category}`.toLowerCase().includes(query)
        })
      : bills.slice()

    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'name_asc':
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        case 'amount_desc':
          return b.amount - a.amount
        case 'amount_asc':
          return a.amount - b.amount
        case 'day_asc':
          return a.dueDay - b.dueDay
        case 'cadence_asc':
          return cadenceLabel(a.cadence, a.customInterval, a.customUnit).localeCompare(
            cadenceLabel(b.cadence, b.customInterval, b.customUnit),
            undefined,
            { sensitivity: 'base' },
          )
        case 'autopay_first': {
          const aKey = a.autopay ? 0 : 1
          const bKey = b.autopay ? 0 : 1
          if (aKey !== bKey) return aKey - bKey
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        }
        default:
          return 0
      }
    })

    return sorted
  }, [bills, cadenceLabel, search, sortKey])

  const billsByScope = useMemo(() => {
    const personal = visibleBills.filter((entry) => resolveBillScope(entry) === 'personal')
    const shared = visibleBills.filter((entry) => resolveBillScope(entry) === 'shared')
    return {
      personal,
      shared,
    }
  }, [visibleBills])

  const billTaggingSummary = useMemo(() => {
    const totals = {
      personalMonthly: 0,
      sharedMonthly: 0,
      deductibleMonthly: 0,
      nonDeductibleMonthly: 0,
      deductibleCount: 0,
      byCategory: new Map<BillCategory, { monthlyAmount: number; count: number }>(),
    }

    bills.forEach((entry) => {
      const monthlyAmount = toMonthlyAmount(entry.amount, entry.cadence, entry.customInterval, entry.customUnit)
      const scope = resolveBillScope(entry)
      const category = resolveBillCategory(entry)

      if (scope === 'personal') {
        totals.personalMonthly += monthlyAmount
      } else {
        totals.sharedMonthly += monthlyAmount
      }

      if (entry.deductible === true) {
        totals.deductibleMonthly += monthlyAmount
        totals.deductibleCount += 1
      } else {
        totals.nonDeductibleMonthly += monthlyAmount
      }

      const current = totals.byCategory.get(category) ?? { monthlyAmount: 0, count: 0 }
      totals.byCategory.set(category, {
        monthlyAmount: current.monthlyAmount + monthlyAmount,
        count: current.count + 1,
      })
    })

    const topCategories = [...totals.byCategory.entries()]
      .map(([category, value]) => ({
        category,
        monthlyAmount: value.monthlyAmount,
        count: value.count,
      }))
      .sort((left, right) => right.monthlyAmount - left.monthlyAmount)
      .slice(0, 3)

    return {
      personalMonthly: totals.personalMonthly,
      sharedMonthly: totals.sharedMonthly,
      deductibleMonthly: totals.deductibleMonthly,
      nonDeductibleMonthly: totals.nonDeductibleMonthly,
      deductibleCount: totals.deductibleCount,
      topCategories,
    }
  }, [bills])

  const duplicateOverlapData = useMemo(() => {
    const matches = buildBillOverlapMatches(bills)
    const duplicatePairs = matches.filter((entry) => entry.kind === 'duplicate').length
    const overlapPairs = matches.filter((entry) => entry.kind === 'overlap').length

    const signalsByBillId = new Map<BillId, BillOverlapSignal>()
    const billNameById = new Map<BillId, string>(bills.map((entry) => [entry._id, entry.name]))

    matches.forEach((match) => {
      ;([match.primaryBillId, match.secondaryBillId] as BillId[]).forEach((billId) => {
        const current = signalsByBillId.get(billId)
        const next = current ?? {
          billId,
          billName: billNameById.get(billId) ?? 'Bill',
          duplicateMatches: 0,
          overlapMatches: 0,
        }
        if (match.kind === 'duplicate') {
          next.duplicateMatches += 1
        } else {
          next.overlapMatches += 1
        }
        signalsByBillId.set(billId, next)
      })
    })

    const impactedSignals = [...signalsByBillId.values()].sort((left, right) => {
      const leftScore = left.duplicateMatches * 3 + left.overlapMatches
      const rightScore = right.duplicateMatches * 3 + right.overlapMatches
      if (leftScore !== rightScore) {
        return rightScore - leftScore
      }
      return left.billName.localeCompare(right.billName, undefined, { sensitivity: 'base' })
    })

    return {
      matches,
      duplicatePairs,
      overlapPairs,
      impactedCount: impactedSignals.length,
      impactedSignals,
    }
  }, [bills])

  const billSummary = useMemo(() => {
    const today = startOfDay(new Date())
    const variableMonthlyAmounts: number[] = []

    let dueIn7DaysCount = 0
    let dueIn7DaysAmount = 0
    let overdueCount = 0
    let autopayMonthlyAmount = 0
    let autopayRiskCriticalCount = 0
    let autopayRiskWarningCount = 0
    let autopayRiskUnlinkedCount = 0
    let autopayRiskCheckedCount = 0

    bills.forEach((entry) => {
      const normalizedMonthlyAmount = toMonthlyAmount(entry.amount, entry.cadence, entry.customInterval, entry.customUnit)

      if (entry.autopay) {
        autopayMonthlyAmount += normalizedMonthlyAmount
        const riskCheck = autopayRiskByBillId.get(entry._id)
        if (riskCheck) {
          autopayRiskCheckedCount += 1
          if (riskCheck.level === 'critical') {
            autopayRiskCriticalCount += 1
          } else if (riskCheck.level === 'warning') {
            autopayRiskWarningCount += 1
          } else if (riskCheck.level === 'unlinked') {
            autopayRiskUnlinkedCount += 1
          }
        }
      }

      if (isVariableBill(entry)) {
        variableMonthlyAmounts.push(normalizedMonthlyAmount)
      }

      const nextDueDate = nextDateForCadence({
        cadence: entry.cadence,
        createdAt: entry.createdAt,
        dayOfMonth: entry.dueDay,
        customInterval: entry.customInterval ?? undefined,
        customUnit: entry.customUnit ?? undefined,
        now: today,
      })

      if (!nextDueDate) {
        return
      }

      const daysUntilDue = Math.round((startOfDay(nextDueDate).getTime() - today.getTime()) / msPerDay)
      if (daysUntilDue >= 0 && daysUntilDue <= 7) {
        dueIn7DaysCount += 1
        dueIn7DaysAmount += entry.amount
      }

      if (!entry.autopay) {
        const previousDueDate = previousDueDateForBill(entry, nextDueDate)
        if (previousDueDate && startOfDay(previousDueDate) < today) {
          overdueCount += 1
        }
      }
    })

    const autopayCoveragePercent = monthlyBills > 0 ? (autopayMonthlyAmount / monthlyBills) * 100 : 0
    const autopayCoverageAmountGap = Math.max(monthlyBills - autopayMonthlyAmount, 0)

    let variableVarianceStd = 0
    let variableVariancePercent = 0
    if (variableMonthlyAmounts.length > 1) {
      const mean = variableMonthlyAmounts.reduce((sum, amount) => sum + amount, 0) / variableMonthlyAmounts.length
      const variance =
        variableMonthlyAmounts.reduce((sum, amount) => sum + (amount - mean) ** 2, 0) / variableMonthlyAmounts.length
      variableVarianceStd = Math.sqrt(variance)
      variableVariancePercent = mean > 0 ? (variableVarianceStd / mean) * 100 : 0
    }

    return {
      dueIn7DaysCount,
      dueIn7DaysAmount,
      overdueCount,
      autopayCoveragePercent,
      autopayCoverageAmountGap,
      variableBillCount: variableMonthlyAmounts.length,
      variableVarianceStd,
      variableVariancePercent,
      autopayRiskCriticalCount,
      autopayRiskWarningCount,
      autopayRiskUnlinkedCount,
      autopayRiskCheckedCount,
    }
  }, [autopayRiskByBillId, bills, monthlyBills])

  const billVarianceOverview = useMemo(() => {
    const entriesWithVariance = billPaymentChecks.filter((entry) => typeof entry.varianceAmount === 'number')
    const recentEntries = [...entriesWithVariance]
      .sort((left, right) => right.cycleMonth.localeCompare(left.cycleMonth, undefined, { sensitivity: 'base' }))
      .slice(0, 24)

    const totalVariance = recentEntries.reduce((sum, entry) => sum + (entry.varianceAmount ?? 0), 0)
    const averageVariance = recentEntries.length > 0 ? totalVariance / recentEntries.length : 0

    return {
      recentEntries,
      totalVariance,
      averageVariance,
    }
  }, [billPaymentChecks])

  const subscriptionInsights = useMemo(() => {
    const today = startOfDay(new Date())
    const recentThreshold = new Date(today.getTime() - 90 * msPerDay)

    const rows: SubscriptionInsightRow[] = bills
      .filter((entry) => entry.isSubscription === true)
      .map((entry) => {
        const nextRenewalDate = nextDateForCadence({
          cadence: entry.cadence,
          createdAt: entry.createdAt,
          dayOfMonth: entry.dueDay,
          customInterval: entry.customInterval ?? undefined,
          customUnit: entry.customUnit ?? undefined,
          now: today,
        })

        const daysToRenewal = nextRenewalDate
          ? Math.round((startOfDay(nextRenewalDate).getTime() - today.getTime()) / msPerDay)
          : null

        const cancelReminderDays = Math.max(entry.cancelReminderDays ?? 7, 0)
        const cancelReminderDate = nextRenewalDate
          ? startOfDay(new Date(nextRenewalDate.getTime() - cancelReminderDays * msPerDay))
          : null
        const cancelReminderDue = cancelReminderDate ? cancelReminderDate.getTime() <= today.getTime() : false
        const latestPriceChange = subscriptionPriceChangesByBillId.get(entry._id)?.[0]

        return {
          id: entry._id,
          name: entry.name,
          cadenceText: cadenceLabel(entry.cadence, entry.customInterval, entry.customUnit),
          amount: entry.amount,
          annualizedCost: toMonthlyAmount(entry.amount, entry.cadence, entry.customInterval, entry.customUnit) * 12,
          nextRenewalDate: nextRenewalDate ?? null,
          daysToRenewal,
          cancelReminderDays,
          cancelReminderDate,
          cancelReminderDue,
          latestPriceChange,
        }
      })
      .sort((left, right) => {
        const leftRank = left.daysToRenewal ?? Number.MAX_SAFE_INTEGER
        const rightRank = right.daysToRenewal ?? Number.MAX_SAFE_INTEGER
        if (leftRank !== rightRank) {
          return leftRank - rightRank
        }
        return right.annualizedCost - left.annualizedCost
      })

    const annualizedCostTotal = rows.reduce((sum, row) => sum + row.annualizedCost, 0)
    const monthlyCostTotal = annualizedCostTotal / 12
    const cancelReminderDueCount = rows.filter((row) => row.cancelReminderDue).length
    const renewalsIn30DaysCount = rows.filter((row) => row.daysToRenewal !== null && row.daysToRenewal <= 30).length
    const priceChangesIn90DaysCount = subscriptionPriceChanges.filter(
      (entry) => new Date(`${entry.effectiveDate}T00:00:00`) >= recentThreshold,
    ).length

    return {
      rows,
      annualizedCostTotal,
      monthlyCostTotal,
      cancelReminderDueCount,
      renewalsIn30DaysCount,
      priceChangesIn90DaysCount,
    }
  }, [bills, cadenceLabel, subscriptionPriceChanges, subscriptionPriceChangesByBillId])

  const providerIntelligence = useMemo(() => {
    const today = startOfDay(new Date())
    const currentMonthIndex = toMonthIndex(today)
    const oneYearAgo = new Date(today.getTime() - 365 * msPerDay)

    const roundNumber = (value: number) => Math.round(value * 100) / 100
    const alertRank: Record<ProviderIntelligenceAlert, number> = {
      critical: 2,
      warning: 1,
      good: 0,
    }

    const rows: ProviderIntelligenceRow[] = bills
      .filter((entry) => entry.isSubscription === true)
      .map((entry) => {
        const monthlyBaseline = toMonthlyAmount(entry.amount, entry.cadence, entry.customInterval, entry.customUnit)
        const paymentHistory = (billPaymentChecksByBillId.get(entry._id) ?? [])
          .map((check) => ({
            monthIndex: parseMonthKeyIndex(check.cycleMonth),
            amount: check.actualAmount ?? check.expectedAmount,
          }))
          .filter(
            (item): item is { monthIndex: number; amount: number } =>
              item.monthIndex !== null && Number.isFinite(item.amount) && item.amount >= 0,
          )

        const totalForWindow = (months: number) => {
          const startIndex = currentMonthIndex - (months - 1)
          const observedTotal = paymentHistory
            .filter((item) => item.monthIndex >= startIndex && item.monthIndex <= currentMonthIndex)
            .reduce((sum, item) => sum + item.amount, 0)

          if (observedTotal > 0.005) {
            return observedTotal
          }

          return monthlyBaseline * months
        }

        const providerChanges = subscriptionPriceChangesByBillId.get(entry._id) ?? []
        const increasePercents = providerChanges
          .map((change) => {
            if (change.previousAmount <= 0 || change.newAmount <= change.previousAmount + 0.005) {
              return null
            }
            return ((change.newAmount - change.previousAmount) / change.previousAmount) * 100
          })
          .filter((value): value is number => value !== null)

        const avgIncreasePercent =
          increasePercents.length > 0
            ? increasePercents.reduce((sum, value) => sum + value, 0) / increasePercents.length
            : 0
        const increaseEvents12Months = providerChanges.filter((change) => {
          const effectiveDate = parseIsoDate(change.effectiveDate)
          if (!effectiveDate || effectiveDate < oneYearAgo) {
            return false
          }
          return change.previousAmount > 0 && change.newAmount > change.previousAmount + 0.005
        }).length
        const lastIncreasePercent =
          increasePercents.length > 0
            ? increasePercents[0]
            : 0

        let priceCreepAlert: ProviderIntelligenceAlert = 'good'
        let priceCreepReason = 'Stable pricing'

        if (avgIncreasePercent >= 8 || increaseEvents12Months >= 2 || lastIncreasePercent >= 10) {
          priceCreepAlert = 'critical'
          priceCreepReason = 'Strong price creep signal'
        } else if (avgIncreasePercent >= 4 || increaseEvents12Months >= 1 || lastIncreasePercent >= 5) {
          priceCreepAlert = 'warning'
          priceCreepReason = 'Moderate upward trend'
        }

        return {
          id: entry._id,
          provider: entry.name,
          total3Months: roundNumber(totalForWindow(3)),
          total6Months: roundNumber(totalForWindow(6)),
          total12Months: roundNumber(totalForWindow(12)),
          avgIncreasePercent: roundNumber(avgIncreasePercent),
          increaseEvents12Months,
          lastIncreasePercent: roundNumber(lastIncreasePercent),
          priceCreepAlert,
          priceCreepReason,
        }
      })
      .sort((left, right) => {
        const rankDiff = alertRank[right.priceCreepAlert] - alertRank[left.priceCreepAlert]
        if (rankDiff !== 0) {
          return rankDiff
        }
        if (left.total12Months !== right.total12Months) {
          return right.total12Months - left.total12Months
        }
        return left.provider.localeCompare(right.provider, undefined, { sensitivity: 'base' })
      })

    return {
      rows,
      criticalCount: rows.filter((row) => row.priceCreepAlert === 'critical').length,
      warningCount: rows.filter((row) => row.priceCreepAlert === 'warning').length,
      goodCount: rows.filter((row) => row.priceCreepAlert === 'good').length,
    }
  }, [billPaymentChecksByBillId, bills, subscriptionPriceChangesByBillId])

  const timelineData = useMemo(() => {
    const today = startOfDay(new Date())
    const timelineMaxDays = 30
    const liquidBalanceStart = accounts
      .filter((account) => account.liquid)
      .reduce((sum, account) => sum + account.balance, 0)

    const events: Array<{
      id: string
      billId: BillId
      name: string
      dueDate: Date
      amount: number
      autopay: boolean
      cadenceText: string
      daysAway: number
    }> = []

    bills.forEach((entry) => {
      let cursor = today
      let iterations = 0

      while (iterations < 24) {
        iterations += 1
        const nextDueDate = nextDateForCadence({
          cadence: entry.cadence,
          createdAt: entry.createdAt,
          dayOfMonth: entry.dueDay,
          customInterval: entry.customInterval ?? undefined,
          customUnit: entry.customUnit ?? undefined,
          now: cursor,
        })

        if (!nextDueDate) {
          break
        }

        const normalizedDueDate = startOfDay(nextDueDate)
        const daysAway = Math.round((normalizedDueDate.getTime() - today.getTime()) / msPerDay)
        if (daysAway < 0) {
          cursor = new Date(normalizedDueDate.getTime() + msPerDay)
          continue
        }

        if (daysAway > timelineMaxDays) {
          break
        }

        events.push({
          id: `${entry._id}-${toIsoDate(normalizedDueDate)}-${iterations}`,
          billId: entry._id,
          name: entry.name,
          dueDate: normalizedDueDate,
          amount: entry.amount,
          autopay: entry.autopay,
          cadenceText: cadenceLabel(entry.cadence, entry.customInterval, entry.customUnit),
          daysAway,
        })

        cursor = new Date(normalizedDueDate.getTime() + msPerDay)
      }
    })

    const sortedEvents = events.sort((left, right) => {
      if (left.dueDate.getTime() !== right.dueDate.getTime()) {
        return left.dueDate.getTime() - right.dueDate.getTime()
      }
      if (left.autopay !== right.autopay) {
        return left.autopay ? -1 : 1
      }
      if (left.amount !== right.amount) {
        return right.amount - left.amount
      }
      return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    })

    const withImpact = sortedEvents.reduce<{
      runningLiquidBalance: number
      items: Array<
        (typeof sortedEvents)[number] & {
          beforeImpact: number
          afterImpact: number
          impactSeverity: 'critical' | 'warning' | 'good'
        }
      >
    }>(
      (acc, entry) => {
        const beforeImpact = acc.runningLiquidBalance
        const afterImpact = beforeImpact - entry.amount

        const item = {
          ...entry,
          beforeImpact,
          afterImpact,
          impactSeverity:
            afterImpact < 0
              ? ('critical' as const)
              : afterImpact < Math.max(entry.amount * 1.25, monthlyBills * 0.25)
                ? ('warning' as const)
                : ('good' as const),
        }

        return {
          runningLiquidBalance: afterImpact,
          items: [...acc.items, item],
        }
      },
      {
        runningLiquidBalance: liquidBalanceStart,
        items: [],
      },
    ).items

    const visible = withImpact.filter((entry) => entry.daysAway <= timelineWindowDays)
    return {
      liquidBalanceStart,
      visible,
    }
  }, [accounts, bills, cadenceLabel, monthlyBills, timelineWindowDays])

  const overlapConfirmationCopy = overlapConfirmation ? getOverlapResolutionCopy(overlapConfirmation.resolution) : null
  const confirmationPrimaryBill = overlapConfirmation
    ? billById.get(overlapConfirmation.match.primaryBillId)
    : undefined
  const confirmationSecondaryBill = overlapConfirmation
    ? billById.get(overlapConfirmation.match.secondaryBillId)
    : undefined
  const isConfirmingOverlapAction =
    overlapConfirmation !== null && resolvingOverlapId === overlapConfirmation.match.id

  const summarizeBillForConfirmation = (entry: BillEntry | undefined, fallbackName: string) => {
    if (!entry) {
      return {
        name: fallbackName,
        details: 'Bill not available (it may have been updated in another action).',
      }
    }

    return {
      name: entry.name,
      details: `${formatMoney(entry.amount)} · Due day ${entry.dueDay} · ${cadenceLabel(
        entry.cadence,
        entry.customInterval,
        entry.customUnit,
      )} · ${entry.autopay ? 'Autopay on' : 'Manual'}${entry.isSubscription ? ' · Subscription' : ''}`,
    }
  }

  const confirmationPrimarySummary = summarizeBillForConfirmation(
    confirmationPrimaryBill,
    overlapConfirmation?.match.primaryName ?? 'Primary bill',
  )
  const confirmationSecondarySummary = summarizeBillForConfirmation(
    confirmationSecondaryBill,
    overlapConfirmation?.match.secondaryName ?? 'Secondary bill',
  )
  const billCategoryText = (category: BillCategory) => billCategoryLabelMap.get(category) ?? category
  const billScopeText = (scope: BillScope) => billScopeLabelMap.get(scope) ?? scope
  const bulkActionResultLabel =
    bulkActionResult?.action === 'roll_recurring_forward'
      ? 'Rolled recurring bills'
      : bulkActionResult?.action === 'mark_all_paid_from_account'
        ? 'Marked bills paid'
        : bulkActionResult?.action === 'reconcile_batch'
          ? 'Batch reconciled bills'
          : null

  return (
    <section className="editor-grid bills-tab-shell" aria-label="Bill management">
      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Bills</p>
            <h2>Add bill</h2>
            <p className="panel-value">
              {bills.length} bill{bills.length === 1 ? '' : 's'} · {formatMoney(monthlyBills)} / month
            </p>
          </div>
        </header>
        <form className="entry-form entry-form--grid" onSubmit={onAddBill} aria-describedby="bill-form-hint">
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="bill-name">Bill name</label>
              <input
                id="bill-name"
                value={billForm.name}
                onChange={(event) => setBillForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="bill-amount">Amount</label>
              <input
                id="bill-amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={billForm.amount}
                onChange={(event) => setBillForm((prev) => ({ ...prev, amount: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="bill-day">Due day</label>
              <input
                id="bill-day"
                type="number"
                inputMode="numeric"
                min="1"
                max="31"
                value={billForm.dueDay}
                onChange={(event) => setBillForm((prev) => ({ ...prev, dueDay: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="bill-cadence">Frequency</label>
              <select
                id="bill-cadence"
                value={billForm.cadence}
                onChange={(event) =>
                  setBillForm((prev) => ({
                    ...prev,
                    cadence: event.target.value as Cadence,
                    customInterval: event.target.value === 'custom' ? prev.customInterval || '1' : '',
                  }))
                }
              >
                {cadenceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="bill-category">Category</label>
              <select
                id="bill-category"
                value={billForm.category}
                onChange={(event) =>
                  setBillForm((prev) => ({
                    ...prev,
                    category: event.target.value as BillCategory,
                  }))
                }
              >
                {billCategoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="bill-scope">Ownership</label>
              <select
                id="bill-scope"
                value={billForm.scope}
                onChange={(event) =>
                  setBillForm((prev) => ({
                    ...prev,
                    scope: event.target.value as BillScope,
                  }))
                }
              >
                {billScopeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {isCustomCadence(billForm.cadence) ? (
              <div className="form-field form-field--span2">
                <label htmlFor="bill-custom-interval">Custom cadence</label>
                <div className="inline-cadence-controls">
                  <input
                    id="bill-custom-interval"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={billForm.customInterval}
                    onChange={(event) =>
                      setBillForm((prev) => ({
                        ...prev,
                        customInterval: event.target.value,
                      }))
                    }
                    required
                  />
                  <select
                    id="bill-custom-unit"
                    value={billForm.customUnit}
                    onChange={(event) =>
                      setBillForm((prev) => ({
                        ...prev,
                        customUnit: event.target.value as CustomCadenceUnit,
                      }))
                    }
                  >
                    {customCadenceUnitOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}

            <div className="form-field form-field--span2">
              <label className="checkbox-row" htmlFor="bill-is-subscription">
                <input
                  id="bill-is-subscription"
                  type="checkbox"
                  checked={billForm.isSubscription}
                  onChange={(event) =>
                    setBillForm((prev) => ({
                      ...prev,
                      isSubscription: event.target.checked,
                      cancelReminderDays: event.target.checked ? prev.cancelReminderDays || '7' : '',
                    }))
                  }
                />
                Track as subscription / renewal
              </label>
            </div>

            {billForm.isSubscription ? (
              <div className="form-field">
                <label htmlFor="bill-cancel-reminder">Cancel reminder (days before renewal)</label>
                <input
                  id="bill-cancel-reminder"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="365"
                  step="1"
                  value={billForm.cancelReminderDays}
                  onChange={(event) =>
                    setBillForm((prev) => ({
                      ...prev,
                      cancelReminderDays: event.target.value,
                    }))
                  }
                />
              </div>
            ) : null}

            <div className="form-field form-field--span2">
              <label htmlFor="bill-linked-account">Linked account (for autopay risk)</label>
              <select
                id="bill-linked-account"
                value={billForm.linkedAccountId}
                onChange={(event) => setBillForm((prev) => ({ ...prev, linkedAccountId: event.target.value }))}
              >
                <option value="">No linked account</option>
                {selectableAccounts.map((account) => (
                  <option key={account._id} value={account._id}>
                    {account.name} ({account.type})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field form-field--span2">
              <label className="checkbox-row" htmlFor="bill-autopay">
                <input
                  id="bill-autopay"
                  type="checkbox"
                  checked={billForm.autopay}
                  onChange={(event) => setBillForm((prev) => ({ ...prev, autopay: event.target.checked }))}
                />
                Autopay enabled
              </label>
            </div>

            <div className="form-field form-field--span2">
              <label className="checkbox-row" htmlFor="bill-deductible">
                <input
                  id="bill-deductible"
                  type="checkbox"
                  checked={billForm.deductible}
                  onChange={(event) => setBillForm((prev) => ({ ...prev, deductible: event.target.checked }))}
                />
                Tax deductible
              </label>
            </div>

            <div className="form-field form-field--span2">
              <label htmlFor="bill-notes">Notes</label>
              <textarea
                id="bill-notes"
                rows={3}
                placeholder="Optional"
                value={billForm.notes}
                onChange={(event) => setBillForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>
          </div>

          <p id="bill-form-hint" className="form-hint">
            Tip: use <strong>Custom</strong> for true intervals (every 4 weeks, 6 weeks, 4 months, etc) and{' '}
            <strong>One Time</strong> for non-recurring bills. Mark subscriptions to get renewal + cancel reminders and
            link an account to enable autopay balance risk checks. Tag category, ownership, and deductible status for cleaner
            reporting/export.
          </p>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Add bill
            </button>
          </div>
        </form>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Bills</p>
            <h2>Current entries</h2>
            <p className="panel-value">{formatMoney(monthlyBills)} monthly estimate</p>
          </div>
          <div className="panel-actions">
            <input
              aria-label="Search bills"
              placeholder="Search bills or notes…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select aria-label="Sort bills" value={sortKey} onChange={(event) => setSortKey(event.target.value as BillSortKey)}>
              <option value="name_asc">Name (A-Z)</option>
              <option value="amount_desc">Amount (high-low)</option>
              <option value="amount_asc">Amount (low-high)</option>
              <option value="day_asc">Due day</option>
              <option value="cadence_asc">Frequency</option>
              <option value="autopay_first">Autopay first</option>
            </select>
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              onClick={() => {
                setSearch('')
                setSortKey('name_asc')
              }}
              disabled={search.length === 0 && sortKey === 'name_asc'}
            >
              Clear
            </button>
          </div>
        </header>

        {bills.length === 0 ? (
          <p className="empty-state">No bills added yet.</p>
        ) : (
          <>
            <section className="bills-summary-strip" aria-label="Bills executive summary strip">
              <article className="bills-summary-card">
                <p>Monthly bills total</p>
                <strong>{formatMoney(monthlyBills)}</strong>
                <small>
                  {bills.length} tracked bill{bills.length === 1 ? '' : 's'}
                </small>
              </article>
              <article className="bills-summary-card bills-summary-card--watch">
                <p>Due in next 7 days</p>
                <strong>{billSummary.dueIn7DaysCount}</strong>
                <small>{formatMoney(billSummary.dueIn7DaysAmount)} upcoming</small>
              </article>
              <article className="bills-summary-card bills-summary-card--critical">
                <p>Overdue (manual)</p>
                <strong>{billSummary.overdueCount}</strong>
                <small>Based on cadence cycle and due-day rollovers</small>
              </article>
              <article className="bills-summary-card bills-summary-card--good">
                <p>Autopay coverage</p>
                <strong>{billSummary.autopayCoveragePercent.toFixed(1)}%</strong>
                <small>
                  {billSummary.autopayCoverageAmountGap > 0
                    ? `${formatMoney(billSummary.autopayCoverageAmountGap)} remains manual`
                    : 'All monthly bill volume is autopay-covered'}
                </small>
              </article>
              <article
                className={
                  billSummary.autopayRiskCriticalCount > 0
                    ? 'bills-summary-card bills-summary-card--critical'
                    : billSummary.autopayRiskWarningCount > 0 || billSummary.autopayRiskUnlinkedCount > 0
                      ? 'bills-summary-card bills-summary-card--watch'
                      : 'bills-summary-card bills-summary-card--good'
                }
              >
                <p>Autopay risk checks</p>
                <strong>
                  {billSummary.autopayRiskCriticalCount} critical · {billSummary.autopayRiskWarningCount} watch
                </strong>
                <small>
                  {billSummary.autopayRiskCheckedCount} checked
                  {billSummary.autopayRiskUnlinkedCount > 0
                    ? ` · ${billSummary.autopayRiskUnlinkedCount} unlinked`
                    : ' · all checked bills linked'}
                </small>
              </article>
              <article className="bills-summary-card">
                <p>Variable-bill variance</p>
                <strong>
                  {billSummary.variableBillCount > 1 ? `${billSummary.variableVariancePercent.toFixed(1)}%` : 'n/a'}
                </strong>
                <small>
                  {billSummary.variableBillCount > 1
                    ? `σ ${formatMoney(billSummary.variableVarianceStd)} across ${billSummary.variableBillCount} variable bills`
                    : 'Tag notes with "variable" or use custom/weekly cadence to track variability'}
                </small>
              </article>
              <article className="bills-summary-card">
                <p>Shared / personal split</p>
                <strong>{formatMoney(billTaggingSummary.sharedMonthly)}</strong>
                <small>{formatMoney(billTaggingSummary.personalMonthly)} personal monthly estimate</small>
              </article>
              <article className="bills-summary-card bills-summary-card--good">
                <p>Tax deductible bills</p>
                <strong>{formatMoney(billTaggingSummary.deductibleMonthly)}</strong>
                <small>
                  {billTaggingSummary.deductibleCount} deductible bill{billTaggingSummary.deductibleCount === 1 ? '' : 's'}
                </small>
              </article>
              <article className="bills-summary-card">
                <p>Top categories</p>
                <strong>
                  {billTaggingSummary.topCategories.length > 0
                    ? billCategoryText(billTaggingSummary.topCategories[0].category)
                    : 'n/a'}
                </strong>
                <small>
                  {billTaggingSummary.topCategories.length > 0
                    ? billTaggingSummary.topCategories
                        .map((entry) => `${billCategoryText(entry.category)} ${formatMoney(entry.monthlyAmount)}`)
                        .join(' · ')
                    : 'Start tagging categories for cleaner reporting'}
                </small>
              </article>
              <article className="bills-summary-card">
                <p>Expected vs actual trend</p>
                <strong
                  className={
                    billVarianceOverview.averageVariance > 0.005
                      ? 'amount-negative'
                      : billVarianceOverview.averageVariance < -0.005
                        ? 'amount-positive'
                        : undefined
                  }
                >
                  {billVarianceOverview.recentEntries.length > 0
                    ? formatMoney(billVarianceOverview.averageVariance)
                    : 'n/a'}
                </strong>
                <small>
                  {billVarianceOverview.recentEntries.length > 0
                    ? `${formatVarianceTrendLabel(billVarianceOverview.averageVariance)} across ${billVarianceOverview.recentEntries.length} logs`
                    : 'No bill cycle logs yet'}
                </small>
              </article>
            </section>

            <section className="bills-bulk-actions" aria-label="Bills monthly bulk actions">
              <header className="bills-bulk-actions-head">
                <div>
                  <h3>Bulk monthly actions</h3>
                  <p>Roll recurring bills forward, mark a cycle paid from one account, or reconcile in one pass.</p>
                </div>
              </header>

              <div className="bills-bulk-actions-toolbar">
                <label className="bills-bulk-field" htmlFor="bills-bulk-cycle-month">
                  <span>Cycle month</span>
                  <input
                    id="bills-bulk-cycle-month"
                    type="month"
                    value={bulkCycleMonth}
                    onChange={(event) => setBulkCycleMonth(event.target.value)}
                  />
                </label>
                <label className="bills-bulk-field" htmlFor="bills-bulk-funding-account">
                  <span>Funding account (for mark paid)</span>
                  <select
                    id="bills-bulk-funding-account"
                    value={bulkFundingAccountId}
                    onChange={(event) => setBulkFundingAccountId(event.target.value)}
                  >
                    <option value="">Select account</option>
                    {billFundingAccounts.map((account) => (
                      <option key={account._id} value={account._id}>
                        {account.name} ({account.type})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="bills-bulk-actions-buttons">
                <button
                  type="button"
                  className="btn btn-secondary btn--sm"
                  disabled={runningBulkAction !== null}
                  onClick={() => void runBillsBulkAction('roll_recurring_forward')}
                >
                  {runningBulkAction === 'roll_recurring_forward' ? 'Rolling…' : 'Roll recurring into next month'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn--sm"
                  disabled={runningBulkAction !== null}
                  onClick={() => void runBillsBulkAction('mark_all_paid_from_account')}
                >
                  {runningBulkAction === 'mark_all_paid_from_account' ? 'Applying…' : 'Mark all paid from account'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn--sm"
                  disabled={runningBulkAction !== null}
                  onClick={() => void runBillsBulkAction('reconcile_batch')}
                >
                  {runningBulkAction === 'reconcile_batch' ? 'Reconciling…' : 'Reconcile in batch'}
                </button>
              </div>

              <p className="subnote">
                Roll creates next-month cycle logs for recurring bills only. Mark paid updates actuals and deducts the
                applied delta from the selected funding account.
              </p>

              {bulkActionError ? <p className="bills-bulk-feedback bills-bulk-feedback--error">{bulkActionError}</p> : null}

              {bulkActionResult ? (
                <article className="bills-bulk-result" aria-live="polite">
                  <div className="bills-bulk-result-head">
                    <div>
                      <p className="panel-kicker">Last bulk run</p>
                      <h4>{bulkActionResultLabel}</h4>
                    </div>
                    <span className="pill pill--good">{bulkActionResult.batchId}</span>
                  </div>
                  <div className="bills-bulk-result-grid">
                    <div>
                      <p>Scope</p>
                      <strong>{bulkActionResult.eligibleCount}</strong>
                      <small>eligible bills in {bulkActionResult.cycleMonth}</small>
                    </div>
                    <div>
                      <p>Created / updated</p>
                      <strong>
                        {bulkActionResult.createdCount} / {bulkActionResult.updatedCount}
                      </strong>
                      <small>{bulkActionResult.skippedCount} skipped</small>
                    </div>
                    <div>
                      <p>Paid applied</p>
                      <strong>{formatMoney(bulkActionResult.totalPaidApplied)}</strong>
                      <small>
                        {bulkActionResult.fundingAccountName
                          ? `from ${bulkActionResult.fundingAccountName}`
                          : 'No funding account debit'}
                      </small>
                    </div>
                    <div>
                      <p>Reconciled</p>
                      <strong>{formatMoney(bulkActionResult.totalReconciledAmount)}</strong>
                      <small>{bulkActionResult.reconciledFromPlannedCount} planned-only items filled</small>
                    </div>
                    <div>
                      <p>Target month</p>
                      <strong>{bulkActionResult.targetMonth ?? 'Current cycle'}</strong>
                      <small>roll action writes to next month only</small>
                    </div>
                  </div>
                </article>
              ) : null}
            </section>

            <section className="bills-duplicate-detection" aria-label="Duplicate and overlap detection">
              <header className="bills-duplicate-detection-head">
                <div>
                  <h3>Duplicate + overlap detection</h3>
                  <p>Catch repeated bills with similar name, amount, and due timing before cycle close.</p>
                </div>
              </header>

              <div className="bills-summary-strip">
                <article
                  className={
                    duplicateOverlapData.duplicatePairs > 0
                      ? 'bills-summary-card bills-summary-card--critical'
                      : 'bills-summary-card bills-summary-card--good'
                  }
                >
                  <p>Potential duplicate pairs</p>
                  <strong>{duplicateOverlapData.duplicatePairs}</strong>
                  <small>Near-identical name/amount/due signals</small>
                </article>
                <article
                  className={
                    duplicateOverlapData.overlapPairs > 0
                      ? 'bills-summary-card bills-summary-card--watch'
                      : 'bills-summary-card bills-summary-card--good'
                  }
                >
                  <p>Potential overlap pairs</p>
                  <strong>{duplicateOverlapData.overlapPairs}</strong>
                  <small>Likely overlap where one bill may replace another</small>
                </article>
                <article className="bills-summary-card">
                  <p>Impacted bills</p>
                  <strong>{duplicateOverlapData.impactedCount}</strong>
                  <small>
                    {duplicateOverlapData.impactedCount > 0
                      ? 'Review these before running monthly cycle'
                      : 'No collisions detected in current bill set'}
                  </small>
                </article>
                <article
                  className={
                    duplicateOverlapData.matches.length > 0
                      ? 'bills-summary-card bills-summary-card--watch'
                      : 'bills-summary-card bills-summary-card--good'
                  }
                >
                  <p>Pre-close status</p>
                  <strong>{duplicateOverlapData.matches.length > 0 ? 'Review needed' : 'Clear'}</strong>
                  <small>
                    {duplicateOverlapData.matches.length > 0
                      ? 'Merge/remove overlap pairs before cycle close'
                      : 'No duplicate or overlap blockers'}
                  </small>
                </article>
              </div>

              {duplicateOverlapData.matches.length === 0 ? (
                <p className="subnote">No duplicate or overlap bill signals detected right now.</p>
              ) : (
                <ul className="bills-overlap-list">
                  {duplicateOverlapData.matches.slice(0, 10).map((match) => (
                    <li key={match.id} className="bills-overlap-item">
                      <div className="bills-overlap-main">
                        <strong>
                          {match.primaryName} ↔ {match.secondaryName}
                        </strong>
                        <small>{match.reason}</small>
                        <small>
                          Keep <strong>{match.primaryName}</strong> · Secondary <strong>{match.secondaryName}</strong>
                        </small>
                      </div>
                      <div className="bills-overlap-metrics">
                        <span className={match.kind === 'duplicate' ? 'pill pill--critical' : 'pill pill--warning'}>
                          {match.kind}
                        </span>
                        <small>{Math.round(match.nameSimilarity * 100)}% name match</small>
                        <small>
                          {formatMoney(match.amountDelta)} delta ({(match.amountDeltaPercent * 100).toFixed(1)}%)
                        </small>
                        <small>
                          {match.dueDayDelta} day{match.dueDayDelta === 1 ? '' : 's'} apart
                        </small>
                        <div className="bills-overlap-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn--sm"
                            disabled={resolvingOverlapId === match.id}
                            onClick={() => openOverlapConfirmation(match, 'merge')}
                          >
                            Merge
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn--sm"
                            disabled={resolvingOverlapId === match.id}
                            onClick={() => openOverlapConfirmation(match, 'archive_duplicate')}
                          >
                            Archive duplicate
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn--sm"
                            disabled={resolvingOverlapId === match.id}
                            onClick={() => openOverlapConfirmation(match, 'mark_intentional')}
                          >
                            Mark intentional
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="bills-subscription-module" aria-label="Subscription and renewal module">
              <header className="bills-subscription-head">
                <div>
                  <h3>Subscription renewals</h3>
                  <p>Track upcoming renewals, annualized cost, price changes, and cancel reminders.</p>
                </div>
              </header>

              <div className="bills-summary-strip">
                <article className="bills-summary-card">
                  <p>Tracked subscriptions</p>
                  <strong>{subscriptionInsights.rows.length}</strong>
                  <small>{formatMoney(subscriptionInsights.monthlyCostTotal)} monthly run-rate</small>
                </article>
                <article className="bills-summary-card bills-summary-card--watch">
                  <p>Annualized cost</p>
                  <strong>{formatMoney(subscriptionInsights.annualizedCostTotal)}</strong>
                  <small>Total yearly renewal exposure</small>
                </article>
                <article
                  className={
                    subscriptionInsights.cancelReminderDueCount > 0
                      ? 'bills-summary-card bills-summary-card--critical'
                      : 'bills-summary-card bills-summary-card--good'
                  }
                >
                  <p>Cancel reminders due</p>
                  <strong>{subscriptionInsights.cancelReminderDueCount}</strong>
                  <small>Based on reminder lead times</small>
                </article>
                <article className="bills-summary-card">
                  <p>Renewals in next 30 days</p>
                  <strong>{subscriptionInsights.renewalsIn30DaysCount}</strong>
                  <small>Upcoming subscription charges</small>
                </article>
                <article className="bills-summary-card">
                  <p>Price changes (90 days)</p>
                  <strong>{subscriptionInsights.priceChangesIn90DaysCount}</strong>
                  <small>Amount updates tracked automatically</small>
                </article>
              </div>

              {subscriptionInsights.rows.length === 0 ? (
                <p className="subnote">No subscription bills yet. Enable “Track as subscription / renewal” on a bill to start.</p>
              ) : (
                <div className="table-wrap table-wrap--card">
                  <table className="data-table">
                    <caption className="sr-only">Subscription renewals</caption>
                    <thead>
                      <tr>
                        <th scope="col">Subscription</th>
                        <th scope="col">Renewal</th>
                        <th scope="col">Annualized</th>
                        <th scope="col">Cancel reminder</th>
                        <th scope="col">Price change tracker</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subscriptionInsights.rows.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <div className="cell-stack">
                              <strong>{row.name}</strong>
                              <small>{row.cadenceText}</small>
                              <small>{formatMoney(row.amount)} per cycle</small>
                            </div>
                          </td>
                          <td>
                            <div className="cell-stack">
                              <strong>
                                {row.nextRenewalDate ? subscriptionDateFormatter.format(row.nextRenewalDate) : 'No upcoming renewal'}
                              </strong>
                              <small>
                                {row.daysToRenewal === null
                                  ? 'Outside active schedule'
                                  : row.daysToRenewal === 0
                                    ? 'Renews today'
                                    : `In ${row.daysToRenewal} day${row.daysToRenewal === 1 ? '' : 's'}`}
                              </small>
                            </div>
                          </td>
                          <td>
                            <div className="cell-stack">
                              <strong>{formatMoney(row.annualizedCost)}</strong>
                              <small>{formatMoney(row.annualizedCost / 12)} monthly normalized</small>
                            </div>
                          </td>
                          <td>
                            <div className="cell-stack">
                              <strong>
                                {row.cancelReminderDate ? subscriptionDateFormatter.format(row.cancelReminderDate) : 'n/a'}
                              </strong>
                              <small>
                                {row.cancelReminderDays} day{row.cancelReminderDays === 1 ? '' : 's'} before renewal
                              </small>
                              <span className={row.cancelReminderDue ? 'pill pill--critical' : 'pill pill--good'}>
                                {row.cancelReminderDue ? 'Reminder due' : 'On track'}
                              </span>
                            </div>
                          </td>
                          <td>
                            {row.latestPriceChange ? (
                              <div className="cell-stack">
                                <strong>{row.latestPriceChange.effectiveDate}</strong>
                                <small>
                                  {formatMoney(row.latestPriceChange.previousAmount)} → {formatMoney(row.latestPriceChange.newAmount)}
                                </small>
                                <small
                                  className={
                                    row.latestPriceChange.newAmount > row.latestPriceChange.previousAmount
                                      ? 'amount-negative'
                                      : row.latestPriceChange.newAmount < row.latestPriceChange.previousAmount
                                        ? 'amount-positive'
                                        : undefined
                                  }
                                >
                                  {row.latestPriceChange.newAmount > row.latestPriceChange.previousAmount
                                    ? 'Price increased'
                                    : row.latestPriceChange.newAmount < row.latestPriceChange.previousAmount
                                      ? 'Price decreased'
                                      : 'No change'}
                                </small>
                              </div>
                            ) : (
                              <span className="pill pill--neutral">No change logs yet</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="bills-provider-intelligence" aria-label="Provider intelligence card">
              <header className="bills-provider-intelligence-head">
                <div>
                  <h3>Provider intelligence</h3>
                  <p>Last 3/6/12 month totals, average increase %, and price creep alerts by provider.</p>
                </div>
              </header>

              {providerIntelligence.rows.length === 0 ? (
                <p className="subnote">No subscription providers tracked yet.</p>
              ) : (
                <>
                  <div className="bills-summary-strip">
                    <article className="bills-summary-card">
                      <p>Providers tracked</p>
                      <strong>{providerIntelligence.rows.length}</strong>
                      <small>Subscription providers with trend analytics</small>
                    </article>
                    <article className="bills-summary-card bills-summary-card--critical">
                      <p>Critical creep alerts</p>
                      <strong>{providerIntelligence.criticalCount}</strong>
                      <small>Strong price creep signal</small>
                    </article>
                    <article className="bills-summary-card bills-summary-card--watch">
                      <p>Warning creep alerts</p>
                      <strong>{providerIntelligence.warningCount}</strong>
                      <small>Moderate upward trend</small>
                    </article>
                    <article className="bills-summary-card bills-summary-card--good">
                      <p>Stable providers</p>
                      <strong>{providerIntelligence.goodCount}</strong>
                      <small>No material creep signal</small>
                    </article>
                  </div>

                  <div className="table-wrap table-wrap--card">
                    <table className="data-table">
                      <caption className="sr-only">Provider intelligence</caption>
                      <thead>
                        <tr>
                          <th scope="col">Provider</th>
                          <th scope="col">Last 3 months</th>
                          <th scope="col">Last 6 months</th>
                          <th scope="col">Last 12 months</th>
                          <th scope="col">Avg increase %</th>
                          <th scope="col">Price creep alert</th>
                        </tr>
                      </thead>
                      <tbody>
                        {providerIntelligence.rows.map((row) => (
                          <tr key={row.id}>
                            <td>
                              <div className="cell-stack">
                                <strong>{row.provider}</strong>
                              </div>
                            </td>
                            <td>{formatMoney(row.total3Months)}</td>
                            <td>{formatMoney(row.total6Months)}</td>
                            <td>{formatMoney(row.total12Months)}</td>
                            <td>
                              <div className="cell-stack">
                                <strong className={row.avgIncreasePercent > 0 ? 'amount-negative' : undefined}>
                                  {row.avgIncreasePercent.toFixed(1)}%
                                </strong>
                                <small>{row.increaseEvents12Months} increase event(s) in 12m</small>
                                <small>
                                  Last increase {row.lastIncreasePercent > 0 ? `${row.lastIncreasePercent.toFixed(1)}%` : 'n/a'}
                                </small>
                              </div>
                            </td>
                            <td>
                              <div className="cell-stack">
                                <span
                                  className={
                                    row.priceCreepAlert === 'critical'
                                      ? 'pill pill--critical'
                                      : row.priceCreepAlert === 'warning'
                                        ? 'pill pill--warning'
                                        : 'pill pill--good'
                                  }
                                >
                                  {row.priceCreepAlert}
                                </span>
                                <small>{row.priceCreepReason}</small>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>

            <section className="bills-timeline" aria-label="Bills due-date timeline">
              <header className="bills-timeline-head">
                <div>
                  <h3>Due-date timeline</h3>
                  <p>
                    Upcoming due items with amount and liquid-account impact. Starting liquid pool:{' '}
                    <strong>{formatMoney(timelineData.liquidBalanceStart)}</strong>
                  </p>
                </div>
                <div className="bills-timeline-window-toggle" role="group" aria-label="Timeline window">
                  <button
                    type="button"
                    className={`btn btn-ghost btn--sm ${timelineWindowDays === 14 ? 'bills-timeline-window-btn--active' : ''}`}
                    onClick={() => setTimelineWindowDays(14)}
                  >
                    Next 14 days
                  </button>
                  <button
                    type="button"
                    className={`btn btn-ghost btn--sm ${timelineWindowDays === 30 ? 'bills-timeline-window-btn--active' : ''}`}
                    onClick={() => setTimelineWindowDays(30)}
                  >
                    Next 30 days
                  </button>
                </div>
              </header>

              {timelineData.visible.length === 0 ? (
                <p className="subnote">No bills due in the selected window.</p>
              ) : (
                <ul className="bills-timeline-list">
                  {timelineData.visible.map((event) => (
                    <li key={event.id} className="bills-timeline-item">
                      <div className="bills-timeline-date">
                        <strong>{timelineDateFormatter.format(event.dueDate)}</strong>
                        <small>
                          {event.daysAway === 0 ? 'Due today' : event.daysAway === 1 ? 'Due in 1 day' : `Due in ${event.daysAway} days`}
                        </small>
                      </div>
                      <div className="bills-timeline-main">
                        <strong>{event.name}</strong>
                        <small>
                          {event.autopay ? 'Autopay' : 'Manual'} · {event.cadenceText}
                        </small>
                      </div>
                      <div className="bills-timeline-amount">
                        <strong>{formatMoney(event.amount)}</strong>
                        <small>bill amount</small>
                      </div>
                      <div className="bills-timeline-impact">
                        <strong className={event.afterImpact < 0 ? 'amount-negative' : 'amount-positive'}>
                          {formatMoney(event.afterImpact)}
                        </strong>
                        <small>liquid after due</small>
                      </div>
                      <div className="bills-timeline-signal">
                        <span
                          className={
                            event.impactSeverity === 'critical'
                              ? 'pill pill--critical'
                              : event.impactSeverity === 'warning'
                                ? 'pill pill--warning'
                                : 'pill pill--good'
                          }
                        >
                          {event.impactSeverity === 'critical'
                            ? 'Low cash risk'
                            : event.impactSeverity === 'warning'
                              ? 'Watch cash'
                              : 'Healthy'}
                        </span>
                        <small>Impact {formatMoney(-event.amount)}</small>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <p className="subnote">
              Showing {visibleBills.length} of {bills.length} bill{bills.length === 1 ? '' : 's'}.
            </p>

            {visibleBills.length === 0 ? (
              <p className="empty-state">No bills match your search.</p>
            ) : (
              <div className="table-wrap table-wrap--card">
                <table className="data-table data-table--bills" data-testid="bills-table">
                  <caption className="sr-only">Bill entries</caption>
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Amount</th>
                      <th scope="col">Due Day</th>
                      <th scope="col">Frequency</th>
                      <th scope="col">Autopay</th>
                      <th scope="col">Expected vs actual</th>
                      <th scope="col">Notes</th>
                      <th scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      { scope: 'personal' as const, rows: billsByScope.personal },
                      { scope: 'shared' as const, rows: billsByScope.shared },
                    ]).map((group) => {
                      if (group.rows.length === 0) {
                        return null
                      }

                      const sectionMonthlyTotal = group.rows.reduce(
                        (sum, entry) => sum + toMonthlyAmount(entry.amount, entry.cadence, entry.customInterval, entry.customUnit),
                        0,
                      )

                      return (
                        <Fragment key={`scope-${group.scope}`}>
                          <tr className="bills-scope-row">
                            <td colSpan={billTableColumnCount}>
                              <div className="bills-scope-row-content">
                                <strong>{billScopeText(group.scope)}</strong>
                                <small>
                                  {group.rows.length} bill{group.rows.length === 1 ? '' : 's'} · monthly estimate{' '}
                                  {formatMoney(sectionMonthlyTotal)}
                                </small>
                              </div>
                            </td>
                          </tr>
                          {group.rows.map((entry) => {
                            const isEditing = billEditId === entry._id
                            const isPaymentLogOpen = paymentLogBillId === entry._id
                            const linkedAccount = billLinkedAccounts.get(entry._id) ?? null
                            const autopayRisk = autopayRiskByBillId.get(entry._id)
                            const rowPaymentChecks = billPaymentChecksByBillId.get(entry._id) ?? []
                            const latestPaymentCheck = rowPaymentChecks[0] ?? null
                            const recentVarianceChecks = rowPaymentChecks
                              .filter((paymentCheck) => typeof paymentCheck.varianceAmount === 'number')
                              .slice(0, 3)
                            const averageVariance =
                              recentVarianceChecks.length > 0
                                ? recentVarianceChecks.reduce((sum, paymentCheck) => sum + (paymentCheck.varianceAmount ?? 0), 0) /
                                  recentVarianceChecks.length
                                : 0

                            return (
                              <Fragment key={entry._id}>
                          <tr className={isEditing ? 'table-row--editing' : undefined}>
                            <td>
                              {isEditing ? (
                                <div className="cell-stack">
                                  <input
                                    className="inline-input"
                                    value={billEditDraft.name}
                                    onChange={(event) =>
                                      setBillEditDraft((prev) => ({
                                        ...prev,
                                        name: event.target.value,
                                      }))
                                    }
                                  />
                                  <div className="bills-inline-tag-grid">
                                    <select
                                      className="inline-select"
                                      value={billEditDraft.category}
                                      onChange={(event) =>
                                        setBillEditDraft((prev) => ({
                                          ...prev,
                                          category: event.target.value as BillCategory,
                                        }))
                                      }
                                    >
                                      {billCategoryOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                    <select
                                      className="inline-select"
                                      value={billEditDraft.scope}
                                      onChange={(event) =>
                                        setBillEditDraft((prev) => ({
                                          ...prev,
                                          scope: event.target.value as BillScope,
                                        }))
                                      }
                                    >
                                      {billScopeOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <label className="checkbox-row" htmlFor={`bill-edit-deductible-${entry._id}`}>
                                    <input
                                      id={`bill-edit-deductible-${entry._id}`}
                                      type="checkbox"
                                      checked={billEditDraft.deductible}
                                      onChange={(event) =>
                                        setBillEditDraft((prev) => ({
                                          ...prev,
                                          deductible: event.target.checked,
                                        }))
                                      }
                                    />
                                    Tax deductible
                                  </label>
                                </div>
                              ) : (
                                <div className="cell-stack">
                                  <strong>{entry.name}</strong>
                                  <div className="bills-entry-tags">
                                    <span className="pill pill--cadence">{billCategoryText(resolveBillCategory(entry))}</span>
                                    <span className="pill pill--neutral">{billScopeText(resolveBillScope(entry))}</span>
                                    {entry.deductible ? <span className="pill pill--good">Deductible</span> : null}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="table-amount amount-negative">
                              {isEditing ? (
                                <input
                                  className="inline-input"
                                  type="number"
                                  inputMode="decimal"
                                  min="0.01"
                                  step="0.01"
                                  value={billEditDraft.amount}
                                  onChange={(event) =>
                                    setBillEditDraft((prev) => ({
                                      ...prev,
                                      amount: event.target.value,
                                    }))
                                  }
                                />
                              ) : (
                                formatMoney(entry.amount)
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <input
                                  className="inline-input"
                                  type="number"
                                  inputMode="numeric"
                                  min="1"
                                  max="31"
                                  value={billEditDraft.dueDay}
                                  onChange={(event) =>
                                    setBillEditDraft((prev) => ({
                                      ...prev,
                                      dueDay: event.target.value,
                                    }))
                                  }
                                />
                              ) : (
                                <span className="pill pill--neutral">Day {entry.dueDay}</span>
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <div className="inline-cadence-controls">
                                  <select
                                    className="inline-select"
                                    value={billEditDraft.cadence}
                                    onChange={(event) =>
                                      setBillEditDraft((prev) => ({
                                        ...prev,
                                        cadence: event.target.value as Cadence,
                                        customInterval: event.target.value === 'custom' ? prev.customInterval || '1' : '',
                                      }))
                                    }
                                  >
                                    {cadenceOptions.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                  {isCustomCadence(billEditDraft.cadence) ? (
                                    <>
                                      <input
                                        className="inline-input inline-cadence-number"
                                        type="number"
                                        inputMode="numeric"
                                        min="1"
                                        step="1"
                                        value={billEditDraft.customInterval}
                                        onChange={(event) =>
                                          setBillEditDraft((prev) => ({
                                            ...prev,
                                            customInterval: event.target.value,
                                          }))
                                        }
                                      />
                                      <select
                                        className="inline-select inline-cadence-unit"
                                        value={billEditDraft.customUnit}
                                        onChange={(event) =>
                                          setBillEditDraft((prev) => ({
                                            ...prev,
                                            customUnit: event.target.value as CustomCadenceUnit,
                                          }))
                                        }
                                      >
                                        {customCadenceUnitOptions.map((option) => (
                                          <option key={option.value} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="pill pill--cadence">
                                  {cadenceLabel(entry.cadence, entry.customInterval, entry.customUnit)}
                                </span>
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <div className="cell-stack">
                                  <label className="checkbox-row" htmlFor={`bill-edit-autopay-${entry._id}`}>
                                    <input
                                      id={`bill-edit-autopay-${entry._id}`}
                                      aria-label="Autopay enabled"
                                      type="checkbox"
                                      checked={billEditDraft.autopay}
                                      onChange={(event) =>
                                        setBillEditDraft((prev) => ({
                                          ...prev,
                                          autopay: event.target.checked,
                                        }))
                                      }
                                    />
                                    Autopay
                                  </label>
                                  <label className="checkbox-row" htmlFor={`bill-edit-subscription-${entry._id}`}>
                                    <input
                                      id={`bill-edit-subscription-${entry._id}`}
                                      type="checkbox"
                                      checked={billEditDraft.isSubscription}
                                      onChange={(event) =>
                                        setBillEditDraft((prev) => ({
                                          ...prev,
                                          isSubscription: event.target.checked,
                                          cancelReminderDays: event.target.checked ? prev.cancelReminderDays || '7' : '',
                                        }))
                                      }
                                    />
                                    Subscription
                                  </label>
                                  {billEditDraft.isSubscription ? (
                                    <input
                                      className="inline-input"
                                      type="number"
                                      inputMode="numeric"
                                      min="0"
                                      max="365"
                                      step="1"
                                      value={billEditDraft.cancelReminderDays}
                                      onChange={(event) =>
                                        setBillEditDraft((prev) => ({
                                          ...prev,
                                          cancelReminderDays: event.target.value,
                                        }))
                                      }
                                      placeholder="Reminder days"
                                    />
                                  ) : null}
                                  <select
                                    className="inline-select"
                                    value={billEditDraft.linkedAccountId}
                                    onChange={(event) =>
                                      setBillEditDraft((prev) => ({
                                        ...prev,
                                        linkedAccountId: event.target.value,
                                      }))
                                    }
                                  >
                                    <option value="">No linked account</option>
                                    {selectableAccounts.map((account) => (
                                      <option key={account._id} value={account._id}>
                                        {account.name} ({account.type})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ) : entry.autopay ? (
                                <div className="cell-stack">
                                  <span className="pill pill--good">Autopay</span>
                                  {entry.isSubscription ? (
                                    <span className="pill pill--cadence">
                                      Subscription · {entry.cancelReminderDays ?? 7}d reminder
                                    </span>
                                  ) : null}
                                  <small>{linkedAccount ? `Linked ${linkedAccount.name}` : 'No linked account'}</small>
                                  <span
                                    className={
                                      autopayRisk === undefined
                                        ? 'pill pill--neutral'
                                        : autopayRisk.level === 'critical'
                                        ? 'pill pill--critical'
                                        : autopayRisk.level === 'warning'
                                          ? 'pill pill--warning'
                                          : autopayRisk.level === 'unlinked'
                                            ? 'pill pill--neutral'
                                            : 'pill pill--good'
                                    }
                                  >
                                    {autopayRisk === undefined
                                      ? 'No near-term due'
                                      : autopayRisk.level === 'critical'
                                      ? 'Balance risk'
                                      : autopayRisk.level === 'warning'
                                        ? 'Low buffer'
                                        : autopayRisk.level === 'unlinked'
                                          ? 'Link account'
                                          : 'Healthy'}
                                  </span>
                                  <small>
                                    {autopayRisk?.projectedBeforeDue !== undefined
                                      ? `Projected before due ${formatMoney(autopayRisk.projectedBeforeDue)}`
                                      : linkedAccount
                                        ? 'No due event in next 45 days'
                                        : 'Set linked account for projected risk checks'}
                                  </small>
                                </div>
                              ) : (
                                <div className="cell-stack">
                                  <span className="pill pill--neutral">Manual</span>
                                  {entry.isSubscription ? (
                                    <span className="pill pill--cadence">
                                      Subscription · {entry.cancelReminderDays ?? 7}d reminder
                                    </span>
                                  ) : null}
                                </div>
                              )}
                            </td>
                            <td>
                              {rowPaymentChecks.length === 0 ? (
                                <span className="pill pill--neutral">No cycle logs</span>
                              ) : (
                                <div className="cell-stack">
                                  <small>
                                    {latestPaymentCheck?.cycleMonth ?? 'Latest'} · planned{' '}
                                    {formatMoney(latestPaymentCheck?.expectedAmount ?? entry.amount)}
                                  </small>
                                  <small>
                                    actual{' '}
                                    {latestPaymentCheck?.actualAmount !== undefined
                                      ? formatMoney(latestPaymentCheck.actualAmount)
                                      : 'n/a'}
                                  </small>
                                  {latestPaymentCheck?.varianceAmount !== undefined ? (
                                    <small
                                      className={
                                        latestPaymentCheck.varianceAmount > 0
                                          ? 'amount-negative'
                                          : latestPaymentCheck.varianceAmount < 0
                                            ? 'amount-positive'
                                            : undefined
                                      }
                                    >
                                      variance {formatMoney(latestPaymentCheck.varianceAmount)}
                                    </small>
                                  ) : (
                                    <small>variance n/a</small>
                                  )}
                                  {recentVarianceChecks.length > 1 ? (
                                    <small
                                      className={
                                        averageVariance > 0.005
                                          ? 'amount-negative'
                                          : averageVariance < -0.005
                                            ? 'amount-positive'
                                            : undefined
                                      }
                                    >
                                      {recentVarianceChecks.length}-cycle avg {formatMoney(averageVariance)}
                                    </small>
                                  ) : null}
                                </div>
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <input
                                  className="inline-input"
                                  value={billEditDraft.notes}
                                  onChange={(event) =>
                                    setBillEditDraft((prev) => ({
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
                              <div className="row-actions row-actions--bills">
                                {isEditing ? (
                                  <>
                                    <button
                                      type="button"
                                      className="btn btn-secondary btn--sm"
                                      onClick={() => void saveBillEdit()}
                                    >
                                      Save
                                    </button>
                                    <button type="button" className="btn btn-ghost btn--sm" onClick={() => setBillEditId(null)}>
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      className="btn btn-secondary btn--sm"
                                      onClick={() => {
                                        closePaymentLog()
                                        startBillEdit(entry)
                                      }}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn--sm"
                                      onClick={() => (isPaymentLogOpen ? closePaymentLog() : openPaymentLog(entry))}
                                    >
                                      {isPaymentLogOpen ? 'Close log' : 'Log cycle'}
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  className="btn btn-ghost btn--sm"
                                  onClick={() => {
                                    if (paymentLogBillId === entry._id) {
                                      closePaymentLog()
                                    }
                                    void onDeleteBill(entry._id)
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                          {isPaymentLogOpen ? (
                            <tr className="table-row--quick">
                              <td colSpan={billTableColumnCount}>
                                <div className="income-payment-log-panel bill-cycle-log-panel">
                                  <div className="income-payment-log-head">
                                    <h3>Expected vs actual cycle log</h3>
                                    <p>
                                      Capture planned and actual bill payments by cycle for <strong>{entry.name}</strong>.
                                    </p>
                                  </div>

                                  <div className="income-payment-log-fields">
                                    <label className="income-payment-log-field">
                                      <span>Cycle month</span>
                                      <input
                                        type="month"
                                        value={paymentLogDraft.cycleMonth}
                                        onChange={(event) =>
                                          setPaymentLogDraft((prev) => ({
                                            ...prev,
                                            cycleMonth: event.target.value,
                                          }))
                                        }
                                      />
                                    </label>

                                    <label className="income-payment-log-field">
                                      <span>Planned amount</span>
                                      <input
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        inputMode="decimal"
                                        value={paymentLogDraft.expectedAmount}
                                        onChange={(event) =>
                                          setPaymentLogDraft((prev) => ({
                                            ...prev,
                                            expectedAmount: event.target.value,
                                          }))
                                        }
                                      />
                                    </label>

                                    <label className="income-payment-log-field">
                                      <span>Actual paid</span>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        inputMode="decimal"
                                        placeholder="Optional"
                                        value={paymentLogDraft.actualAmount}
                                        onChange={(event) =>
                                          setPaymentLogDraft((prev) => ({
                                            ...prev,
                                            actualAmount: event.target.value,
                                          }))
                                        }
                                      />
                                    </label>

                                    <label className="income-payment-log-field">
                                      <span>Paid day</span>
                                      <input
                                        type="number"
                                        min="1"
                                        max="31"
                                        placeholder="Optional"
                                        value={paymentLogDraft.paidDay}
                                        onChange={(event) =>
                                          setPaymentLogDraft((prev) => ({
                                            ...prev,
                                            paidDay: event.target.value,
                                          }))
                                        }
                                      />
                                    </label>

                                    <label className="income-payment-log-field income-payment-log-field--note">
                                      <span>Note</span>
                                      <input
                                        type="text"
                                        placeholder="Optional context"
                                        value={paymentLogDraft.note}
                                        onChange={(event) =>
                                          setPaymentLogDraft((prev) => ({
                                            ...prev,
                                            note: event.target.value,
                                          }))
                                        }
                                      />
                                    </label>
                                  </div>

                                  <p className="income-payment-log-hint">
                                    Variance is saved as <strong>actual - planned</strong>; positive means over plan, negative means under plan.
                                  </p>

                                  <div className="income-payment-log-actions">
                                    <button
                                      type="button"
                                      className="btn btn-primary btn--sm"
                                      onClick={() =>
                                        void onUpsertBillPaymentCheck({
                                          billId: entry._id,
                                          cycleMonth: paymentLogDraft.cycleMonth,
                                          expectedAmount: paymentLogDraft.expectedAmount,
                                          actualAmount: paymentLogDraft.actualAmount,
                                          paidDay: paymentLogDraft.paidDay,
                                          note: paymentLogDraft.note,
                                        })
                                      }
                                    >
                                      Save cycle log
                                    </button>
                                    <button type="button" className="btn btn-ghost btn--sm" onClick={closePaymentLog}>
                                      Close
                                    </button>
                                  </div>

                                  {rowPaymentChecks.length > 0 ? (
                                    <ul className="income-payment-log-history">
                                      {rowPaymentChecks.slice(0, 8).map((paymentCheck) => (
                                        <li key={paymentCheck._id}>
                                          <span className="pill pill--neutral">{paymentCheck.cycleMonth}</span>
                                          <small>
                                            planned {formatMoney(paymentCheck.expectedAmount)} · actual{' '}
                                            {paymentCheck.actualAmount !== undefined
                                              ? formatMoney(paymentCheck.actualAmount)
                                              : 'n/a'}
                                          </small>
                                          <small
                                            className={
                                              paymentCheck.varianceAmount !== undefined
                                                ? paymentCheck.varianceAmount > 0
                                                  ? 'amount-negative'
                                                  : paymentCheck.varianceAmount < 0
                                                    ? 'amount-positive'
                                                    : undefined
                                                : undefined
                                            }
                                          >
                                            variance{' '}
                                            {paymentCheck.varianceAmount !== undefined
                                              ? formatMoney(paymentCheck.varianceAmount)
                                              : 'n/a'}{' '}
                                            · {paymentCheck.paidDay ? `day ${paymentCheck.paidDay}` : 'no paid day'}
                                          </small>
                                          <button
                                            type="button"
                                            className="btn btn-ghost btn--sm"
                                            onClick={() => void onDeleteBillPaymentCheck(paymentCheck._id)}
                                          >
                                            Remove
                                          </button>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          ) : null}
                              </Fragment>
                            )
                          })}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </article>

      {overlapConfirmation && overlapConfirmationCopy ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeOverlapConfirmation}>
          <div
            className="modal bills-overlap-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bill-overlap-confirm-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="modal__header bills-overlap-confirm-modal__header">
              <div>
                <p className="panel-kicker">Bills</p>
                <h2 id="bill-overlap-confirm-title">{overlapConfirmationCopy.title}</h2>
                <p className="subnote">{overlapConfirmationCopy.description}</p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn--sm"
                onClick={closeOverlapConfirmation}
                disabled={isConfirmingOverlapAction}
              >
                Close
              </button>
            </header>

            <div className="modal__body bills-overlap-confirm-modal__body">
              <div className="bills-overlap-confirm-grid">
                <article className="bills-overlap-confirm-card bills-overlap-confirm-card--keep">
                  <p>Bill kept</p>
                  <strong>{confirmationPrimarySummary.name}</strong>
                  <small>{confirmationPrimarySummary.details}</small>
                  <span className="pill pill--good">
                    {overlapConfirmation.resolution === 'mark_intentional' ? 'Keeps bill (tagged)' : 'Keeps active bill'}
                  </span>
                </article>

                <article className="bills-overlap-confirm-card bills-overlap-confirm-card--change">
                  <p>{overlapConfirmation.resolution === 'mark_intentional' ? 'Paired bill' : 'Bill changed'}</p>
                  <strong>{confirmationSecondarySummary.name}</strong>
                  <small>{confirmationSecondarySummary.details}</small>
                  <span
                    className={
                      overlapConfirmation.resolution === 'merge'
                        ? 'pill pill--critical'
                        : overlapConfirmation.resolution === 'archive_duplicate'
                          ? 'pill pill--warning'
                          : 'pill pill--neutral'
                    }
                  >
                    {overlapConfirmation.resolution === 'merge'
                      ? 'Removed after merge'
                      : overlapConfirmation.resolution === 'archive_duplicate'
                        ? 'Archived duplicate'
                        : 'Tagged intentional pair'}
                  </span>
                </article>
              </div>
            </div>

            <footer className="modal__footer bills-overlap-confirm-modal__footer">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={closeOverlapConfirmation}
                disabled={isConfirmingOverlapAction}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={isConfirmingOverlapAction}
                onClick={() => void resolveOverlapMatch(overlapConfirmation.match, overlapConfirmation.resolution)}
              >
                {isConfirmingOverlapAction ? 'Applying…' : overlapConfirmationCopy.confirmLabel}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  )
}
