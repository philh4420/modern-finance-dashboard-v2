import { v } from 'convex/values'
import { mutation, query, type MutationCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { requireIdentity } from './lib/authz'

const ruleMatchTypeValidator = v.union(v.literal('contains'), v.literal('exact'), v.literal('starts_with'))
const reconciliationStatusValidator = v.union(v.literal('pending'), v.literal('posted'), v.literal('reconciled'))
const purchaseFundingSourceTypeValidator = v.union(v.literal('unassigned'), v.literal('account'), v.literal('card'))
const incomeAllocationTargetValidator = v.union(
  v.literal('bills'),
  v.literal('savings'),
  v.literal('goals'),
  v.literal('debt_overpay'),
)
const planningVersionKeyValidator = v.union(v.literal('base'), v.literal('conservative'), v.literal('aggressive'))
const planningActionTaskStatusValidator = v.union(
  v.literal('suggested'),
  v.literal('in_progress'),
  v.literal('done'),
  v.literal('dismissed'),
)
const planningActionTaskSourceValidator = v.union(v.literal('manual_apply'), v.literal('reapply'), v.literal('system'))

type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom' | 'one_time'
type CustomCadenceUnit = 'days' | 'weeks' | 'months' | 'years'
type LoanMinimumPaymentType = 'fixed' | 'percent_plus_interest'

type PurchaseDoc = Doc<'purchases'>
type BillDoc = Doc<'bills'>
type TransactionRuleDoc = Doc<'transactionRules'>
type IncomeDoc = Doc<'incomes'>
type IncomePaymentCheckDoc = Doc<'incomePaymentChecks'>
type PurchaseFundingSourceType = 'unassigned' | 'account' | 'card'
type PurchaseSplitTemplateLine = {
  category: string
  percentage: number
  goalId?: Id<'goals'>
  accountId?: Id<'accounts'>
}
type PurchaseSplitAmountLine = {
  category: string
  amount: number
  goalId?: Id<'goals'>
  accountId?: Id<'accounts'>
}

type BillRiskLevel = 'good' | 'warning' | 'critical'
type ForecastRiskLevel = 'healthy' | 'warning' | 'critical'
type IncomeAllocationTarget = 'bills' | 'savings' | 'goals' | 'debt_overpay'
type AutoAllocationActionType = 'reserve_bills' | 'move_to_savings' | 'fund_goals' | 'debt_overpay'
type PlanningVersionKey = 'base' | 'conservative' | 'aggressive'
type PlanningActionTaskStatus = 'suggested' | 'in_progress' | 'done' | 'dismissed'
type PlanningActionTaskSource = 'manual_apply' | 'reapply' | 'system'

type ForecastWindow = {
  days: 30 | 90 | 365
  projectedNet: number
  projectedCash: number
  coverageMonths: number
  risk: ForecastRiskLevel
}

type BillRiskAlert = {
  id: string
  name: string
  dueDate: string
  amount: number
  daysAway: number
  expectedAvailable: number
  risk: BillRiskLevel
  autopay: boolean
  linkedAccountName?: string
  linkedAccountProjectedBalance?: number
}

type AutoAllocationBucket = {
  target: IncomeAllocationTarget
  label: string
  percentage: number
  monthlyAmount: number
  active: boolean
}

type AutoAllocationPlan = {
  monthlyIncome: number
  totalAllocatedPercent: number
  totalAllocatedAmount: number
  residualAmount: number
  unallocatedPercent: number
  overAllocatedPercent: number
  buckets: AutoAllocationBucket[]
}

type AutoAllocationSuggestion = {
  id: string
  target: IncomeAllocationTarget
  actionType: AutoAllocationActionType
  title: string
  detail: string
  percentage: number
  amount: number
  status: 'suggested' | 'completed' | 'dismissed'
  month: string
  runId: string
  createdAt: number
}

type PlanningVersionDraft = {
  versionKey: PlanningVersionKey
  label: string
  description: string
  expectedIncome: number
  fixedCommitments: number
  variableSpendingCap: number
  notes: string
  isSelected: boolean
  isPersisted: boolean
  updatedAt: number
}

type PlanningActionTaskDraft = {
  title: string
  detail: string
  category: string
  impactAmount: number
  status: PlanningActionTaskStatus
}

const validateRequiredText = (value: string, label: string) => {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error(`${label} is required.`)
  }

  if (trimmed.length > 140) {
    throw new Error(`${label} must be 140 characters or less.`)
  }
}

const validateOptionalText = (value: string | undefined, label: string, maxLength = 140) => {
  if (value === undefined) return
  const trimmed = value.trim()
  if (trimmed.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or less.`)
  }
}

const validatePositive = (value: number, label: string) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be greater than 0.`)
  }
}

const validateNonNegative = (value: number, label: string) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} cannot be negative.`)
  }
}

const validatePercentage = (value: number, label: string) => {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${label} must be between 0 and 100.`)
  }
}

const validateMonthKey = (value: string, label: string) => {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    throw new Error(`${label} must use YYYY-MM format.`)
  }
}

const sanitizeTransactionRuleFundingSource = (args: {
  fundingSourceType?: PurchaseFundingSourceType
  fundingSourceId?: string
}) => {
  const fundingSourceType = args.fundingSourceType ?? 'unassigned'
  const normalizedFundingSourceId = args.fundingSourceId?.trim() || undefined
  const fundingSourceId = fundingSourceType === 'unassigned' ? undefined : normalizedFundingSourceId

  if ((fundingSourceType === 'account' || fundingSourceType === 'card') && !fundingSourceId) {
    throw new Error('Rule source mapping requires a source id.')
  }

  return {
    fundingSourceType,
    fundingSourceId,
  }
}

const finiteOrZero = (value: number | undefined | null) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

const roundCurrency = (value: number) => Math.round(value * 100) / 100
const roundPercent = (value: number) => Math.round(value * 100) / 100
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const stringifyForAudit = (value: unknown) => {
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

const sanitizeMutationSource = (value: string | undefined, fallback: string) => {
  if (!value) return fallback
  const trimmed = value.trim()
  if (trimmed.length === 0) return fallback
  return trimmed.slice(0, 120)
}

const recordFinanceAuditEvent = async (ctx: MutationCtx, args: {
  userId: string
  entityType: string
  entityId: string
  action: string
  before?: unknown
  after?: unknown
  metadata?: unknown
}) => {
  const now = Date.now()
  const normalizedMetadataBase = {
    actorUserId: args.userId,
    actorLabel: 'self',
    recordedAt: now,
  }
  const normalizedMetadata =
    args.metadata && typeof args.metadata === 'object' && !Array.isArray(args.metadata)
      ? {
          ...normalizedMetadataBase,
          ...args.metadata,
        }
      : args.metadata === undefined
        ? normalizedMetadataBase
        : {
            ...normalizedMetadataBase,
            payload: args.metadata,
          }

  await ctx.db.insert('financeAuditEvents', {
    userId: args.userId,
    entityType: args.entityType,
    entityId: args.entityId,
    action: args.action,
    beforeJson: args.before === undefined ? undefined : stringifyForAudit(args.before),
    afterJson: args.after === undefined ? undefined : stringifyForAudit(args.after),
    metadataJson: stringifyForAudit(normalizedMetadata),
    createdAt: now,
  })
}

const buildPurchaseAuditSnapshot = (entry: {
  item: string
  amount: number
  category: string
  purchaseDate: string
  reconciliationStatus?: 'pending' | 'posted' | 'reconciled'
  statementMonth?: string
  ownership?: 'shared' | 'personal'
  taxDeductible?: boolean
  fundingSourceType?: 'unassigned' | 'account' | 'card'
  fundingSourceId?: string
  notes?: string
}) => ({
  item: entry.item,
  amount: entry.amount,
  category: entry.category,
  purchaseDate: entry.purchaseDate,
  reconciliationStatus: entry.reconciliationStatus ?? 'posted',
  statementMonth: entry.statementMonth ?? entry.purchaseDate.slice(0, 7),
  ownership: entry.ownership ?? 'shared',
  taxDeductible: entry.taxDeductible ?? false,
  fundingSourceType: entry.fundingSourceType ?? 'unassigned',
  fundingSourceId: entry.fundingSourceId ?? null,
  notes: entry.notes?.trim() || undefined,
})

const normalizeSplitTemplateName = (value: string) => value.trim()

const validateSplitTemplateName = (value: string) => {
  const name = normalizeSplitTemplateName(value)
  if (name.length === 0) {
    throw new Error('Template name is required.')
  }
  if (name.length > 80) {
    throw new Error('Template name must be 80 characters or less.')
  }
}

const ensureValidSplitTemplateLines = (lines: PurchaseSplitTemplateLine[]) => {
  if (lines.length === 0) {
    throw new Error('At least one split line is required.')
  }

  let total = 0
  lines.forEach((line) => {
    validateRequiredText(line.category, 'Split category')
    validatePositive(line.percentage, 'Split percentage')
    total += line.percentage
  })

  if (!Number.isFinite(total) || total <= 0) {
    throw new Error('Split percentage total must be greater than 0.')
  }
}

const buildAmountsFromTemplatePercentages = (
  purchaseAmount: number,
  lines: PurchaseSplitTemplateLine[],
) => {
  const totalPercent = lines.reduce((sum, line) => sum + line.percentage, 0)
  const normalizedTotal = totalPercent > 0 ? totalPercent : 1
  const splits: PurchaseSplitAmountLine[] = []
  let allocated = 0

  lines.forEach((line, index) => {
    const isLast = index === lines.length - 1
    const rawAmount = purchaseAmount * (line.percentage / normalizedTotal)
    const amount = isLast ? roundCurrency(purchaseAmount - allocated) : roundCurrency(rawAmount)
    splits.push({
      category: line.category,
      amount: Math.max(amount, 0),
      goalId: line.goalId,
      accountId: line.accountId,
    })
    allocated = roundCurrency(allocated + Math.max(amount, 0))
  })

  const total = roundCurrency(splits.reduce((sum, split) => sum + split.amount, 0))
  if (Math.abs(total - roundCurrency(purchaseAmount)) > 0.01) {
    const delta = roundCurrency(purchaseAmount - total)
    if (splits.length > 0) {
      splits[splits.length - 1].amount = roundCurrency(Math.max(splits[splits.length - 1].amount + delta, 0))
    }
  }

  return splits
}

const incomeAllocationTargetLabel: Record<IncomeAllocationTarget, string> = {
  bills: 'Bills',
  savings: 'Savings',
  goals: 'Goals',
  debt_overpay: 'Debt Overpay',
}
const planningVersionLabel: Record<PlanningVersionKey, string> = {
  base: 'Base',
  conservative: 'Conservative',
  aggressive: 'Aggressive',
}
const planningVersionDescription: Record<PlanningVersionKey, string> = {
  base: 'Balanced baseline aligned with current monthly behavior.',
  conservative: 'Defensive assumptions for tighter cash preservation.',
  aggressive: 'Growth-leaning assumptions for faster progress.',
}
const planningVersionOrder: PlanningVersionKey[] = ['base', 'conservative', 'aggressive']

const allocationTargets: IncomeAllocationTarget[] = ['bills', 'savings', 'goals', 'debt_overpay']

const buildAutoAllocationPlan = (
  monthlyIncome: number,
  incomeAllocationRules: Array<{ target: IncomeAllocationTarget; percentage: number; active: boolean }>,
): AutoAllocationPlan => {
  const allocationPercentByTarget = new Map<IncomeAllocationTarget, number>(
    allocationTargets.map((target) => [target, 0]),
  )

  incomeAllocationRules.forEach((rule) => {
    if (!rule.active) {
      return
    }
    allocationPercentByTarget.set(
      rule.target,
      roundPercent((allocationPercentByTarget.get(rule.target) ?? 0) + rule.percentage),
    )
  })

  const buckets: AutoAllocationBucket[] = allocationTargets.map((target) => {
    const percentage = roundPercent(allocationPercentByTarget.get(target) ?? 0)
    return {
      target,
      label: incomeAllocationTargetLabel[target],
      percentage,
      monthlyAmount: roundCurrency((monthlyIncome * percentage) / 100),
      active: percentage > 0,
    }
  })

  const totalAllocatedPercent = roundPercent(buckets.reduce((sum, bucket) => sum + bucket.percentage, 0))
  const totalAllocatedAmount = roundCurrency((monthlyIncome * totalAllocatedPercent) / 100)

  return {
    monthlyIncome: roundCurrency(monthlyIncome),
    totalAllocatedPercent,
    totalAllocatedAmount,
    residualAmount: roundCurrency(monthlyIncome - totalAllocatedAmount),
    unallocatedPercent: roundPercent(Math.max(100 - totalAllocatedPercent, 0)),
    overAllocatedPercent: roundPercent(Math.max(totalAllocatedPercent - 100, 0)),
    buckets,
  }
}

const computeIncomeDeductionsTotal = (entry: {
  taxAmount?: number | null
  nationalInsuranceAmount?: number | null
  pensionAmount?: number | null
}) =>
  finiteOrZero(entry.taxAmount) +
  finiteOrZero(entry.nationalInsuranceAmount) +
  finiteOrZero(entry.pensionAmount)

const resolveIncomeNetAmount = (entry: {
  amount: number
  grossAmount?: number | null
  taxAmount?: number | null
  nationalInsuranceAmount?: number | null
  pensionAmount?: number | null
}) => {
  const grossAmount = finiteOrZero(entry.grossAmount)
  const deductionTotal = computeIncomeDeductionsTotal(entry)

  if (grossAmount > 0 || deductionTotal > 0) {
    return Math.max(grossAmount - deductionTotal, 0)
  }

  return Math.max(finiteOrZero(entry.amount), 0)
}

const toMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

const normalizeText = (value: string) => value.trim().toLowerCase()

const billNameNoiseTokens = new Set([
  'bill',
  'payment',
  'account',
  'subscription',
  'service',
  'charge',
  'plan',
  'monthly',
  'weekly',
  'annual',
  'yearly',
  'direct',
  'debit',
  'dd',
])
const archivedDuplicateNoteMarker = '[archived-duplicate]'
const intentionalOverlapMarkerPrefix = '[intentional-overlap:'

const normalizeBillNameForDuplicateCheck = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')

const tokenizeBillNameForDuplicateCheck = (value: string) =>
  normalizeBillNameForDuplicateCheck(value)
    .split(' ')
    .filter((token) => token.length > 1 && !billNameNoiseTokens.has(token))

const computeBillNameSimilarity = (left: string, right: string) => {
  const normalizedLeft = normalizeBillNameForDuplicateCheck(left)
  const normalizedRight = normalizeBillNameForDuplicateCheck(right)
  if (normalizedLeft.length === 0 || normalizedRight.length === 0) {
    return 0
  }
  if (normalizedLeft === normalizedRight) {
    return 1
  }
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return 0.94
  }

  const leftTokens = new Set(tokenizeBillNameForDuplicateCheck(left))
  const rightTokens = new Set(tokenizeBillNameForDuplicateCheck(right))
  const union = new Set([...leftTokens, ...rightTokens])
  if (union.size === 0) {
    return 0
  }

  let intersection = 0
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      intersection += 1
    }
  })

  return intersection / union.size
}

const billCadenceGroupKey = (bill: BillDoc) => {
  if (bill.cadence === 'custom') {
    return `custom:${bill.customInterval ?? 0}:${bill.customUnit ?? 'months'}`
  }
  return bill.cadence
}

const cadenceCompatibleForBillOverlap = (left: BillDoc, right: BillDoc) => {
  const leftGroup = billCadenceGroupKey(left)
  const rightGroup = billCadenceGroupKey(right)
  if (leftGroup === rightGroup) {
    return true
  }
  const monthlyLike = new Set(['monthly', 'quarterly', 'yearly'])
  return monthlyLike.has(left.cadence) && monthlyLike.has(right.cadence)
}

const hasArchivedDuplicateMarker = (notes?: string) =>
  (notes ?? '').toLowerCase().includes(archivedDuplicateNoteMarker)

const hasIntentionalOverlapPairMarker = (left: BillDoc, right: BillDoc) => {
  const leftNotes = (left.notes ?? '').toLowerCase()
  const rightNotes = (right.notes ?? '').toLowerCase()
  const leftTargetsRight = leftNotes.includes(`${intentionalOverlapMarkerPrefix}${String(right._id).toLowerCase()}]`)
  const rightTargetsLeft = rightNotes.includes(`${intentionalOverlapMarkerPrefix}${String(left._id).toLowerCase()}]`)
  return leftTargetsRight || rightTargetsLeft
}

const detectBillDuplicateOverlapCounts = (bills: BillDoc[]) => {
  let duplicatePairCount = 0
  let overlapPairCount = 0
  const impactedBillIds = new Set<string>()

  for (let leftIndex = 0; leftIndex < bills.length; leftIndex += 1) {
    const left = bills[leftIndex]
    for (let rightIndex = leftIndex + 1; rightIndex < bills.length; rightIndex += 1) {
      const right = bills[rightIndex]
      if (hasArchivedDuplicateMarker(left.notes) || hasArchivedDuplicateMarker(right.notes)) {
        continue
      }
      if (hasIntentionalOverlapPairMarker(left, right)) {
        continue
      }
      const nameSimilarity = computeBillNameSimilarity(left.name, right.name)
      if (nameSimilarity < 0.55) {
        continue
      }

      const amountDelta = Math.abs(left.amount - right.amount)
      const amountDeltaPercent = amountDelta / Math.max(Math.max(left.amount, right.amount), 1)
      const dueDayDelta = Math.abs(left.dueDay - right.dueDay)
      const cadenceComparable = cadenceCompatibleForBillOverlap(left, right)
      const duplicateCandidate =
        cadenceComparable && nameSimilarity >= 0.9 && amountDeltaPercent <= 0.03 && dueDayDelta <= 2
      const overlapCandidate =
        cadenceComparable && nameSimilarity >= 0.65 && amountDeltaPercent <= 0.2 && dueDayDelta <= 7

      if (!duplicateCandidate && !overlapCandidate) {
        continue
      }

      if (duplicateCandidate) {
        duplicatePairCount += 1
      } else {
        overlapPairCount += 1
      }

      impactedBillIds.add(String(left._id))
      impactedBillIds.add(String(right._id))
    }
  }

  return {
    duplicatePairCount,
    overlapPairCount,
    impactedBillCount: impactedBillIds.size,
  }
}

const monthKeyToDate = (monthKey: string) => {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    return null
  }
  const year = Number.parseInt(monthKey.slice(0, 4), 10)
  const month = Number.parseInt(monthKey.slice(5, 7), 10)
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null
  }
  return new Date(year, month - 1, 1)
}

const clampForecastSmoothingMonths = (value: number | undefined | null) => {
  const normalized = Math.round(finiteOrZero(value))
  return normalized >= 2 && normalized <= 24 ? normalized : 6
}

const buildLookbackMonthKeys = (anchorMonthKey: string, months: number) => {
  const anchorDate = monthKeyToDate(anchorMonthKey) ?? new Date()
  const keys: string[] = []
  let cursor = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)
  for (let index = 0; index < months; index += 1) {
    keys.push(toMonthKey(cursor))
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1)
  }
  return keys
}

const resolveIncomePaymentCheckAmountForForecast = (
  paymentCheck: IncomePaymentCheckDoc,
  fallbackAmount: number,
) => {
  if (paymentCheck.status === 'missed') {
    return 0
  }

  if (typeof paymentCheck.receivedAmount === 'number' && Number.isFinite(paymentCheck.receivedAmount)) {
    return Math.max(paymentCheck.receivedAmount, 0)
  }

  if (typeof paymentCheck.expectedAmount === 'number' && Number.isFinite(paymentCheck.expectedAmount)) {
    return Math.max(paymentCheck.expectedAmount, 0)
  }

  return Math.max(fallbackAmount, 0)
}

const resolveIncomeForecastMonthlyAmount = (args: {
  income: IncomeDoc
  anchorMonthKey: string
  paymentChecksByMonth: Map<string, IncomePaymentCheckDoc>
}) => {
  const baselineCycleAmount = resolveIncomeNetAmount(args.income)
  const baselineMonthlyAmount = roundCurrency(
    toMonthlyAmount(
      baselineCycleAmount,
      args.income.cadence,
      args.income.customInterval ?? undefined,
      args.income.customUnit ?? undefined,
    ),
  )

  if (!args.income.forecastSmoothingEnabled) {
    return baselineMonthlyAmount
  }

  const lookbackMonths = clampForecastSmoothingMonths(args.income.forecastSmoothingMonths)
  const monthKeys = buildLookbackMonthKeys(args.anchorMonthKey, lookbackMonths)
  const smoothedMonthlyTotal = monthKeys.reduce((sum, monthKey) => {
    const paymentCheck = args.paymentChecksByMonth.get(monthKey)
    if (!paymentCheck) {
      return sum + baselineMonthlyAmount
    }

    const cycleAmount = resolveIncomePaymentCheckAmountForForecast(paymentCheck, baselineCycleAmount)
    const monthlyAmount = toMonthlyAmount(
      cycleAmount,
      args.income.cadence,
      args.income.customInterval ?? undefined,
      args.income.customUnit ?? undefined,
    )
    return sum + monthlyAmount
  }, 0)

  return roundCurrency(smoothedMonthlyTotal / monthKeys.length)
}

const toMonthlyAmount = (
  amount: number,
  cadence: Cadence,
  customInterval?: number,
  customUnit?: CustomCadenceUnit,
) => {
  switch (cadence) {
    case 'weekly':
      return (amount * 52) / 12
    case 'biweekly':
      return (amount * 26) / 12
    case 'monthly':
      return amount
    case 'quarterly':
      return amount / 3
    case 'yearly':
      return amount / 12
    case 'custom':
      if (!customInterval || !customUnit || customInterval <= 0) {
        return 0
      }
      if (customUnit === 'days') return (amount * 365.2425) / (customInterval * 12)
      if (customUnit === 'weeks') return (amount * 365.2425) / (customInterval * 7 * 12)
      if (customUnit === 'months') return amount / customInterval
      return amount / (customInterval * 12)
    default:
      return 0
  }
}

const normalizeLoanMinimumPaymentType = (
  value: LoanMinimumPaymentType | undefined | null,
): LoanMinimumPaymentType => (value === 'percent_plus_interest' ? 'percent_plus_interest' : 'fixed')

const getLoanWorkingBalances = (loan: Doc<'loans'>) => {
  const hasExplicitComponents = loan.principalBalance !== undefined || loan.accruedInterest !== undefined
  const principalBalance = Math.max(
    hasExplicitComponents ? finiteOrZero(loan.principalBalance) : finiteOrZero(loan.balance),
    0,
  )
  const accruedInterest = Math.max(hasExplicitComponents ? finiteOrZero(loan.accruedInterest) : 0, 0)
  const balance = Math.max(
    hasExplicitComponents ? principalBalance + accruedInterest : finiteOrZero(loan.balance),
    0,
  )

  return {
    principalBalance: roundCurrency(principalBalance),
    accruedInterest: roundCurrency(accruedInterest),
    balance: roundCurrency(balance),
  }
}

const estimateLoanDuePayment = (loan: Doc<'loans'>) => {
  const working = getLoanWorkingBalances(loan)
  if (working.balance <= 0) {
    return 0
  }

  const occurrencesPerMonth = toMonthlyAmount(1, loan.cadence, loan.customInterval, loan.customUnit)
  const intervalMonths = occurrencesPerMonth > 0 ? 1 / occurrencesPerMonth : 1
  const apr = finiteOrZero(loan.interestRate)
  const monthlyRate = apr > 0 ? apr / 100 / 12 : 0
  const interestAmount = working.balance * monthlyRate * intervalMonths
  const dueBalance = working.balance + interestAmount
  const minimumPaymentType = normalizeLoanMinimumPaymentType(loan.minimumPaymentType)
  const minimumPaymentPercent = clamp(finiteOrZero(loan.minimumPaymentPercent), 0, 100)
  const minimumDueRaw =
    minimumPaymentType === 'percent_plus_interest'
      ? working.principalBalance * (minimumPaymentPercent / 100) + working.accruedInterest + interestAmount
      : finiteOrZero(loan.minimumPayment)
  const minimumDue = Math.min(dueBalance, Math.max(minimumDueRaw, 0))
  const plannedPayment = Math.min(dueBalance, minimumDue + finiteOrZero(loan.extraPayment))

  return roundCurrency(plannedPayment)
}

const estimateLoanMonthlyPayment = (loan: Doc<'loans'>) => {
  const duePayment = estimateLoanDuePayment(loan)
  const occurrencesPerMonth = toMonthlyAmount(1, loan.cadence, loan.customInterval, loan.customUnit)
  if (occurrencesPerMonth <= 0) {
    return 0
  }
  return roundCurrency(duePayment * occurrencesPerMonth)
}

const buildDefaultPlanningVersionMap = (args: {
  baselineExpectedIncome: number
  baselineFixedCommitments: number
  baselineVariableSpendingCap: number
  baselineNotes?: string
  selectedVersion?: PlanningVersionKey
  nowTimestamp: number
}) => {
  const baseIncome = roundCurrency(Math.max(args.baselineExpectedIncome, 0))
  const baseCommitments = roundCurrency(Math.max(args.baselineFixedCommitments, 0))
  const baseVariableCap = roundCurrency(Math.max(args.baselineVariableSpendingCap, 0))
  const defaults: Record<PlanningVersionKey, Omit<PlanningVersionDraft, 'versionKey'>> = {
    base: {
      label: planningVersionLabel.base,
      description: planningVersionDescription.base,
      expectedIncome: baseIncome,
      fixedCommitments: baseCommitments,
      variableSpendingCap: baseVariableCap,
      notes: args.baselineNotes ?? '',
      isSelected: (args.selectedVersion ?? 'base') === 'base',
      isPersisted: false,
      updatedAt: args.nowTimestamp,
    },
    conservative: {
      label: planningVersionLabel.conservative,
      description: planningVersionDescription.conservative,
      expectedIncome: roundCurrency(baseIncome * 0.95),
      fixedCommitments: roundCurrency(baseCommitments * 1.03),
      variableSpendingCap: roundCurrency(baseVariableCap * 0.85),
      notes: '',
      isSelected: (args.selectedVersion ?? 'base') === 'conservative',
      isPersisted: false,
      updatedAt: args.nowTimestamp,
    },
    aggressive: {
      label: planningVersionLabel.aggressive,
      description: planningVersionDescription.aggressive,
      expectedIncome: roundCurrency(baseIncome * 1.05),
      fixedCommitments: roundCurrency(baseCommitments * 0.98),
      variableSpendingCap: roundCurrency(baseVariableCap * 1.15),
      notes: '',
      isSelected: (args.selectedVersion ?? 'base') === 'aggressive',
      isPersisted: false,
      updatedAt: args.nowTimestamp,
    },
  }

  return new Map<PlanningVersionKey, Omit<PlanningVersionDraft, 'versionKey'>>(
    planningVersionOrder.map((versionKey) => [versionKey, defaults[versionKey]]),
  )
}

const computeMonthlyCommitmentsFromRecords = (args: {
  bills: Doc<'bills'>[]
  cards: Doc<'cards'>[]
  loans: Doc<'loans'>[]
}) => {
  const monthlyBills = args.bills.reduce(
    (sum, bill) => sum + toMonthlyAmount(bill.amount, bill.cadence, bill.customInterval, bill.customUnit),
    0,
  )
  const monthlyCardPayments = args.cards.reduce((sum, card) => sum + finiteOrZero(card.minimumPayment), 0)
  const monthlyLoanPayments = args.loans.reduce(
    (sum, loan) =>
      sum +
      estimateLoanMonthlyPayment(loan) +
      finiteOrZero(loan.subscriptionCost),
    0,
  )
  return {
    monthlyBills: roundCurrency(monthlyBills),
    monthlyCardPayments: roundCurrency(monthlyCardPayments),
    monthlyLoanPayments: roundCurrency(monthlyLoanPayments),
    monthlyCommitments: roundCurrency(monthlyBills + monthlyCardPayments + monthlyLoanPayments),
  }
}

const buildMonthSpendByCategory = (args: {
  monthKey: string
  purchases: Doc<'purchases'>[]
  purchaseSplits: Doc<'purchaseSplits'>[]
}) => {
  const spendByCategory = new Map<string, number>()
  const splitMap = new Map<string, Array<{ category: string; amount: number }>>()

  args.purchaseSplits.forEach((split) => {
    const key = String(split.purchaseId)
    const current = splitMap.get(key) ?? []
    current.push({
      category: split.category,
      amount: split.amount,
    })
    splitMap.set(key, current)
  })

  args.purchases.forEach((purchase) => {
    if (!purchase.purchaseDate.startsWith(args.monthKey)) return
    const splits = splitMap.get(String(purchase._id))
    if (splits && splits.length > 0) {
      splits.forEach((split) => {
        spendByCategory.set(split.category, roundCurrency((spendByCategory.get(split.category) ?? 0) + split.amount))
      })
      return
    }
    spendByCategory.set(purchase.category, roundCurrency((spendByCategory.get(purchase.category) ?? 0) + purchase.amount))
  })

  return spendByCategory
}

const buildPlanningActionTaskDrafts = (args: {
  monthKey: string
  version: {
    versionKey: PlanningVersionKey
    expectedIncome: number
    fixedCommitments: number
    variableSpendingCap: number
  }
  envelopeBudgets: Doc<'envelopeBudgets'>[]
  monthSpendByCategory: Map<string, number>
  autoAllocationPlan: AutoAllocationPlan
}): PlanningActionTaskDraft[] => {
  const drafts: PlanningActionTaskDraft[] = []
  const plannedNet = roundCurrency(args.version.expectedIncome - args.version.fixedCommitments - args.version.variableSpendingCap)
  const envelopeTargetTotal = roundCurrency(
    args.envelopeBudgets.reduce((sum, budget) => sum + budget.targetAmount + finiteOrZero(budget.carryoverAmount), 0),
  )

  if (plannedNet < 0) {
    drafts.push({
      title: 'Close negative planned net',
      detail: `Planned net is ${roundCurrency(Math.abs(plannedNet))} below zero for ${args.monthKey}. Reduce variable spend cap or increase income assumptions.`,
      category: 'cashflow',
      impactAmount: roundCurrency(Math.abs(plannedNet)),
      status: 'suggested',
    })
  }

  const coverageGap = roundCurrency(args.version.variableSpendingCap - envelopeTargetTotal)
  if (coverageGap > 0) {
    drafts.push({
      title: 'Increase envelope coverage',
      detail: `Envelope targets are below variable cap by ${coverageGap}. Add or resize category budgets before month close.`,
      category: 'budget',
      impactAmount: coverageGap,
      status: 'suggested',
    })
  }

  if (args.autoAllocationPlan.unallocatedPercent > 0.01) {
    drafts.push({
      title: 'Allocate unassigned income',
      detail: `${args.autoAllocationPlan.unallocatedPercent.toFixed(
        2,
      )}% of income is unallocated. Route it to bills, savings, goals, or debt overpay.`,
      category: 'allocation',
      impactAmount: roundCurrency(Math.max(args.autoAllocationPlan.residualAmount, 0)),
      status: 'suggested',
    })
  }

  if (args.autoAllocationPlan.overAllocatedPercent > 0.01) {
    drafts.push({
      title: 'Resolve over-allocation conflict',
      detail: `Allocation rules exceed income by ${args.autoAllocationPlan.overAllocatedPercent.toFixed(2)}%. Rebalance active percentages.`,
      category: 'allocation',
      impactAmount: roundCurrency(Math.max(args.autoAllocationPlan.totalAllocatedAmount - args.autoAllocationPlan.monthlyIncome, 0)),
      status: 'suggested',
    })
  }

  args.envelopeBudgets.forEach((budget) => {
    const effectiveTarget = roundCurrency(budget.targetAmount + finiteOrZero(budget.carryoverAmount))
    const actualSpend = roundCurrency(args.monthSpendByCategory.get(budget.category) ?? 0)
    const variance = roundCurrency(actualSpend - effectiveTarget)
    if (variance <= 0.01) return
    drafts.push({
      title: `Recover overspend in ${budget.category}`,
      detail: `${budget.category} is over plan by ${variance}. Add an adjustment task before closing ${args.monthKey}.`,
      category: 'variance',
      impactAmount: variance,
      status: 'suggested',
    })
  })

  drafts.push({
    title: `Run close checklist for ${args.monthKey}`,
    detail: 'Run monthly cycle, reconcile pending entries, and confirm planning KPIs before final close.',
    category: 'close',
    impactAmount: 0,
    status: 'suggested',
  })

  return drafts.slice(0, 12)
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

const dateWithClampedDay = (year: number, month: number, day: number) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(Math.max(day, 1), daysInMonth))
}

const monthsBetween = (from: Date, to: Date) =>
  (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())

const nextDateByMonthCycle = (day: number, cycleMonths: number, anchorDate: Date, now: Date) => {
  const anchorMonthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)
  let probeYear = now.getFullYear()
  let probeMonth = now.getMonth()

  for (let i = 0; i < 36; i += 1) {
    const candidate = dateWithClampedDay(probeYear, probeMonth, day)
    const candidateMonthStart = new Date(candidate.getFullYear(), candidate.getMonth(), 1)
    const monthDiff = monthsBetween(anchorMonthStart, candidateMonthStart)
    if (candidate >= now && monthDiff >= 0 && monthDiff % cycleMonths === 0) {
      return candidate
    }
    probeMonth += 1
    if (probeMonth > 11) {
      probeMonth = 0
      probeYear += 1
    }
  }

  return null
}

const nextOneTimeDate = (day: number, anchorDate: Date, now: Date) => {
  const candidate = dateWithClampedDay(anchorDate.getFullYear(), anchorDate.getMonth(), day)
  const scheduled = candidate < anchorDate ? anchorDate : candidate
  return scheduled >= now ? scheduled : null
}

const nextDateForCadence = (
  cadence: Cadence,
  createdAt: number,
  now: Date,
  dayOfMonth?: number,
  customInterval?: number,
  customUnit?: CustomCadenceUnit,
): Date | null => {
  const today = startOfDay(now)
  const anchorDate = startOfDay(new Date(createdAt))
  if (cadence === 'one_time') {
    const normalizedDay = Math.min(Math.max(dayOfMonth ?? anchorDate.getDate(), 1), 31)
    return nextOneTimeDate(normalizedDay, anchorDate, today)
  }

  if (cadence === 'weekly' || cadence === 'biweekly') {
    const interval = cadence === 'weekly' ? 7 : 14
    const base = new Date(anchorDate.getTime())
    while (base < today) {
      base.setDate(base.getDate() + interval)
    }
    return base
  }

  if (cadence === 'custom') {
    if (!customInterval || !customUnit) {
      return null
    }

    const base = new Date(anchorDate.getTime())
    if (customUnit === 'days' || customUnit === 'weeks') {
      const interval = customUnit === 'days' ? customInterval : customInterval * 7
      while (base < today) {
        base.setDate(base.getDate() + interval)
      }
      return base
    }

    const cycleMonths = customUnit === 'months' ? customInterval : customInterval * 12
    return nextDateByMonthCycle(dayOfMonth ?? anchorDate.getDate(), cycleMonths, anchorDate, today)
  }

  const cycleMonths = cadence === 'monthly' ? 1 : cadence === 'quarterly' ? 3 : 12
  return nextDateByMonthCycle(dayOfMonth ?? anchorDate.getDate(), cycleMonths, anchorDate, today)
}

const ruleMatchesPurchase = (rule: TransactionRuleDoc, item: string) => {
  const value = normalizeText(item)
  const pattern = normalizeText(rule.merchantPattern)
  if (pattern.length === 0) {
    return false
  }

  if (rule.matchType === 'exact') {
    return value === pattern
  }

  if (rule.matchType === 'starts_with') {
    return value.startsWith(pattern)
  }

  return value.includes(pattern)
}

const pickMatchingRule = (rules: TransactionRuleDoc[], item: string) => {
  const sorted = [...rules]
    .filter((rule) => rule.active)
    .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)
  return sorted.find((rule) => ruleMatchesPurchase(rule, item)) ?? null
}

type AutoAllocationSuggestionDraft = {
  target: IncomeAllocationTarget
  actionType: AutoAllocationActionType
  title: string
  detail: string
  percentage: number
  amount: number
}

const goalPriorityRank: Record<'low' | 'medium' | 'high', number> = {
  high: 0,
  medium: 1,
  low: 2,
}

const buildAutoAllocationSuggestionDrafts = (args: {
  autoAllocationPlan: AutoAllocationPlan
  monthlyCommitments: number
  cards: Array<{ name: string; usedLimit: number; interestRate?: number | null }>
  loans: Array<{ name: string; balance: number; subscriptionOutstanding?: number | null; interestRate?: number | null }>
  goals: Array<{ title: string; priority: 'low' | 'medium' | 'high'; targetAmount: number; currentAmount: number }>
  accounts: Array<{ name: string; type: 'checking' | 'savings' | 'investment' | 'cash' | 'debt'; balance: number }>
}) => {
  const drafts: AutoAllocationSuggestionDraft[] = []

  const savingsAccount = [...args.accounts]
    .filter((account) => account.type === 'savings')
    .sort((a, b) => b.balance - a.balance)[0]

  const goalTarget = [...args.goals]
    .map((goal) => ({ ...goal, remaining: Math.max(goal.targetAmount - goal.currentAmount, 0) }))
    .filter((goal) => goal.remaining > 0)
    .sort((a, b) => goalPriorityRank[a.priority] - goalPriorityRank[b.priority] || b.remaining - a.remaining)[0]

  const debtCandidates = [
    ...args.cards
      .filter((card) => card.usedLimit > 0)
      .map((card) => ({
        kind: 'card' as const,
        name: card.name,
        balance: card.usedLimit,
        apr: finiteOrZero(card.interestRate),
      })),
    ...args.loans
      .filter((loan) => loan.balance > 0 || finiteOrZero(loan.subscriptionOutstanding) > 0)
      .map((loan) => ({
        kind: 'loan' as const,
        name: loan.name,
        balance: loan.balance + finiteOrZero(loan.subscriptionOutstanding),
        apr: finiteOrZero(loan.interestRate),
      })),
  ].sort((a, b) => b.apr - a.apr || b.balance - a.balance)
  const debtTarget = debtCandidates[0]

  args.autoAllocationPlan.buckets.forEach((bucket) => {
    if (!bucket.active || bucket.monthlyAmount <= 0) {
      return
    }

    if (bucket.target === 'bills') {
      drafts.push({
        target: bucket.target,
        actionType: 'reserve_bills',
        title: 'Reserve for bills and commitments',
        detail: `Set aside ${roundCurrency(bucket.monthlyAmount)} toward monthly commitments (${roundCurrency(args.monthlyCommitments)} baseline).`,
        percentage: bucket.percentage,
        amount: bucket.monthlyAmount,
      })
      return
    }

    if (bucket.target === 'savings') {
      drafts.push({
        target: bucket.target,
        actionType: 'move_to_savings',
        title: savingsAccount ? `Move into ${savingsAccount.name}` : 'Move to savings buffer',
        detail: savingsAccount
          ? `Transfer ${roundCurrency(bucket.monthlyAmount)} to ${savingsAccount.name} to strengthen reserves.`
          : `Transfer ${roundCurrency(bucket.monthlyAmount)} into a savings account reserve bucket.`,
        percentage: bucket.percentage,
        amount: bucket.monthlyAmount,
      })
      return
    }

    if (bucket.target === 'goals') {
      drafts.push({
        target: bucket.target,
        actionType: 'fund_goals',
        title: goalTarget ? `Fund goal: ${goalTarget.title}` : 'Fund active goals',
        detail: goalTarget
          ? `Allocate ${roundCurrency(bucket.monthlyAmount)} to ${goalTarget.title} (${goalTarget.remaining.toFixed(2)} remaining).`
          : `Allocate ${roundCurrency(bucket.monthlyAmount)} across your active goal balances.`,
        percentage: bucket.percentage,
        amount: bucket.monthlyAmount,
      })
      return
    }

    drafts.push({
      target: bucket.target,
      actionType: 'debt_overpay',
      title: debtTarget ? `Overpay debt: ${debtTarget.name}` : 'Overpay highest APR debt',
      detail: debtTarget
        ? `Use ${roundCurrency(bucket.monthlyAmount)} as extra payment on ${debtTarget.kind} ${debtTarget.name} (${debtTarget.apr.toFixed(2)}% APR).`
        : `Reserve ${roundCurrency(bucket.monthlyAmount)} for extra debt overpayment when debt exists.`,
      percentage: bucket.percentage,
      amount: bucket.monthlyAmount,
    })
  })

  return drafts
}

export const applyRulesPreview = query({
  args: {
    item: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const rules = await ctx.db
      .query('transactionRules')
      .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
      .collect()

    const matched = pickMatchingRule(rules, args.item)
    return matched
      ? {
          matched: true,
          ruleId: String(matched._id),
          category: matched.category,
          reconciliationStatus: matched.reconciliationStatus ?? 'posted',
        }
      : {
          matched: false,
        }
  },
})

export const getPlanningPhase1Data = query({
  args: {
    month: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    const now = new Date()
    const nowTimestamp = now.getTime()
    const monthKey = args.month ?? toMonthKey(now)
    if (args.month) {
      validateMonthKey(args.month, 'Month')
    }

    const emptyBaseline = {
      expectedIncome: 0,
      fixedCommitments: 0,
      variableSpendingCap: 0,
      monthlyNet: 0,
    }
    if (!identity) {
      const defaults = buildDefaultPlanningVersionMap({
        baselineExpectedIncome: 0,
        baselineFixedCommitments: 0,
        baselineVariableSpendingCap: 0,
        nowTimestamp,
      })
      const versions = planningVersionOrder.map((versionKey) => ({
        id: `default:${monthKey}:${versionKey}`,
        month: monthKey,
        versionKey,
        label: planningVersionLabel[versionKey],
        description: planningVersionDescription[versionKey],
        expectedIncome: defaults.get(versionKey)!.expectedIncome,
        fixedCommitments: defaults.get(versionKey)!.fixedCommitments,
        variableSpendingCap: defaults.get(versionKey)!.variableSpendingCap,
        monthlyNet: 0,
        notes: '',
        isSelected: versionKey === 'base',
        isPersisted: false,
        updatedAt: nowTimestamp,
      }))
      return {
        monthKey,
        selectedVersion: 'base' as PlanningVersionKey,
        versions,
        workspace: {
          month: monthKey,
          baselineExpectedIncome: 0,
          baselineFixedCommitments: 0,
          baselineVariableSpendingCap: 0,
          baselineMonthlyNet: 0,
          plannedExpectedIncome: 0,
          plannedFixedCommitments: 0,
          plannedVariableSpendingCap: 0,
          plannedMonthlyNet: 0,
          deltaExpectedIncome: 0,
          deltaFixedCommitments: 0,
          deltaVariableSpendingCap: 0,
          deltaMonthlyNet: 0,
          envelopeTargetTotal: 0,
          envelopeCarryoverTotal: 0,
          envelopeEffectiveTargetTotal: 0,
          envelopeProjectedSpendTotal: 0,
          envelopeSuggestedRolloverTotal: 0,
          envelopeCoveragePercent: 0,
        },
      }
    }

    const [
      incomes,
      incomePaymentChecks,
      bills,
      cards,
      loans,
      purchases,
      purchaseSplits,
      envelopeBudgets,
      planningMonthVersions,
    ] = await Promise.all([
      ctx.db
        .query('incomes')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('incomePaymentChecks')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('bills')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('cards')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('loans')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('purchases')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('purchaseSplits')
        .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('envelopeBudgets')
        .withIndex('by_userId_month', (q) => q.eq('userId', identity.subject).eq('month', monthKey))
        .collect(),
      ctx.db
        .query('planningMonthVersions')
        .withIndex('by_userId_month', (q) => q.eq('userId', identity.subject).eq('month', monthKey))
        .collect(),
    ])

    const incomeChecksByIncomeId = new Map<string, Map<string, IncomePaymentCheckDoc>>()
    incomePaymentChecks.forEach((entry) => {
      const incomeId = String(entry.incomeId)
      const checksByMonth = incomeChecksByIncomeId.get(incomeId) ?? new Map<string, IncomePaymentCheckDoc>()
      const existing = checksByMonth.get(entry.cycleMonth)
      if (!existing || entry.updatedAt > existing.updatedAt) {
        checksByMonth.set(entry.cycleMonth, entry)
      }
      incomeChecksByIncomeId.set(incomeId, checksByMonth)
    })

    const monthlyIncomeForForecast = incomes.reduce((sum, income) => {
      const paymentChecksByMonth = incomeChecksByIncomeId.get(String(income._id)) ?? new Map<string, IncomePaymentCheckDoc>()
      return (
        sum +
        resolveIncomeForecastMonthlyAmount({
          income,
          anchorMonthKey: monthKey,
          paymentChecksByMonth,
        })
      )
    }, 0)

    const monthlyBills = bills.reduce(
      (sum, bill) => sum + toMonthlyAmount(bill.amount, bill.cadence, bill.customInterval, bill.customUnit),
      0,
    )
    const monthlyCardPayments = cards.reduce((sum, card) => sum + finiteOrZero(card.minimumPayment), 0)
    const monthlyLoanPayments = loans.reduce(
      (sum, loan) =>
        sum +
        estimateLoanMonthlyPayment(loan) +
        finiteOrZero(loan.subscriptionCost),
      0,
    )
    const monthlyCommitments = roundCurrency(monthlyBills + monthlyCardPayments + monthlyLoanPayments)

    const ninetyDayWindowStart = new Date(now.getTime() - 90 * 86400000)
    const recentPurchases = purchases.filter((purchase) => new Date(`${purchase.purchaseDate}T00:00:00`) >= ninetyDayWindowStart)
    const averageDailySpend = recentPurchases.reduce((sum, purchase) => sum + purchase.amount, 0) / 90
    const monthlySpendEstimate = roundCurrency(averageDailySpend * 30)

    const baseline = {
      expectedIncome: roundCurrency(monthlyIncomeForForecast),
      fixedCommitments: roundCurrency(monthlyCommitments),
      variableSpendingCap: roundCurrency(monthlySpendEstimate),
      monthlyNet: roundCurrency(monthlyIncomeForForecast - monthlyCommitments - monthlySpendEstimate),
    }

    const selectedSavedVersion = planningMonthVersions.find((entry) => entry.isSelected)?.versionKey ?? 'base'
    const defaultVersionMap = buildDefaultPlanningVersionMap({
      baselineExpectedIncome: baseline.expectedIncome,
      baselineFixedCommitments: baseline.fixedCommitments,
      baselineVariableSpendingCap: baseline.variableSpendingCap,
      selectedVersion: selectedSavedVersion,
      nowTimestamp,
    })
    const savedByVersion = new Map<PlanningVersionKey, Doc<'planningMonthVersions'>>()
    planningMonthVersions.forEach((entry) => {
      savedByVersion.set(entry.versionKey as PlanningVersionKey, entry)
    })

    const versions = planningVersionOrder.map((versionKey) => {
      const saved = savedByVersion.get(versionKey)
      const fallback = defaultVersionMap.get(versionKey)!
      const expectedIncome = roundCurrency(saved?.expectedIncome ?? fallback.expectedIncome)
      const fixedCommitments = roundCurrency(saved?.fixedCommitments ?? fallback.fixedCommitments)
      const variableSpendingCap = roundCurrency(saved?.variableSpendingCap ?? fallback.variableSpendingCap)
      return {
        id: saved ? String(saved._id) : `default:${monthKey}:${versionKey}`,
        month: monthKey,
        versionKey,
        label: planningVersionLabel[versionKey],
        description: planningVersionDescription[versionKey],
        expectedIncome,
        fixedCommitments,
        variableSpendingCap,
        monthlyNet: roundCurrency(expectedIncome - fixedCommitments - variableSpendingCap),
        notes: saved?.notes?.trim() ?? fallback.notes,
        isSelected: saved ? saved.isSelected : versionKey === selectedSavedVersion,
        isPersisted: Boolean(saved),
        updatedAt: saved?.updatedAt ?? fallback.updatedAt,
      }
    })

    const splitMap = new Map<string, Array<{ category: string; amount: number }>>()
    purchaseSplits.forEach((split) => {
      const key = String(split.purchaseId)
      const current = splitMap.get(key) ?? []
      current.push({
        category: split.category,
        amount: split.amount,
      })
      splitMap.set(key, current)
    })

    const monthPurchases = purchases.filter((purchase) => purchase.purchaseDate.startsWith(monthKey))
    const monthSpendByCategory = new Map<string, number>()
    monthPurchases.forEach((purchase) => {
      const splits = splitMap.get(String(purchase._id))
      if (splits && splits.length > 0) {
        splits.forEach((split) => {
          monthSpendByCategory.set(split.category, (monthSpendByCategory.get(split.category) ?? 0) + split.amount)
        })
      } else {
        monthSpendByCategory.set(purchase.category, (monthSpendByCategory.get(purchase.category) ?? 0) + purchase.amount)
      }
    })

    const monthDate = new Date(`${monthKey}-01T00:00:00`)
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
    const isCurrentMonth = monthKey === toMonthKey(now)
    const elapsedDays = isCurrentMonth ? Math.max(now.getDate(), 1) : daysInMonth
    const projectedSpendByCategory = new Map<string, number>()
    monthSpendByCategory.forEach((spent, category) => {
      const projected = roundCurrency((spent / elapsedDays) * daysInMonth)
      projectedSpendByCategory.set(category, projected)
    })

    const envelopeTargetTotal = roundCurrency(envelopeBudgets.reduce((sum, budget) => sum + budget.targetAmount, 0))
    const envelopeCarryoverTotal = roundCurrency(
      envelopeBudgets.reduce((sum, budget) => sum + finiteOrZero(budget.carryoverAmount), 0),
    )
    const envelopeEffectiveTargetTotal = roundCurrency(envelopeTargetTotal + envelopeCarryoverTotal)
    const envelopeProjectedSpendTotal = roundCurrency(
      [...projectedSpendByCategory.values()].reduce((sum, amount) => sum + amount, 0),
    )
    const envelopeSuggestedRolloverTotal = roundCurrency(
      envelopeBudgets.reduce((sum, budget) => {
        if (!budget.rolloverEnabled) return sum
        const projectedSpent = projectedSpendByCategory.get(budget.category) ?? 0
        const effectiveTarget = budget.targetAmount + finiteOrZero(budget.carryoverAmount)
        return sum + Math.max(roundCurrency(effectiveTarget - projectedSpent), 0)
      }, 0),
    )

    const selectedVersion = versions.find((version) => version.isSelected)?.versionKey ?? 'base'
    const selectedPlan = versions.find((version) => version.versionKey === selectedVersion) ?? versions[0]
    const planned = selectedPlan
      ? {
          expectedIncome: selectedPlan.expectedIncome,
          fixedCommitments: selectedPlan.fixedCommitments,
          variableSpendingCap: selectedPlan.variableSpendingCap,
          monthlyNet: selectedPlan.monthlyNet,
        }
      : emptyBaseline

    const envelopeCoveragePercent =
      planned.variableSpendingCap > 0
        ? roundPercent((envelopeEffectiveTargetTotal / planned.variableSpendingCap) * 100)
        : 0

    return {
      monthKey,
      selectedVersion,
      versions,
      workspace: {
        month: monthKey,
        baselineExpectedIncome: baseline.expectedIncome,
        baselineFixedCommitments: baseline.fixedCommitments,
        baselineVariableSpendingCap: baseline.variableSpendingCap,
        baselineMonthlyNet: baseline.monthlyNet,
        plannedExpectedIncome: planned.expectedIncome,
        plannedFixedCommitments: planned.fixedCommitments,
        plannedVariableSpendingCap: planned.variableSpendingCap,
        plannedMonthlyNet: planned.monthlyNet,
        deltaExpectedIncome: roundCurrency(planned.expectedIncome - baseline.expectedIncome),
        deltaFixedCommitments: roundCurrency(planned.fixedCommitments - baseline.fixedCommitments),
        deltaVariableSpendingCap: roundCurrency(planned.variableSpendingCap - baseline.variableSpendingCap),
        deltaMonthlyNet: roundCurrency(planned.monthlyNet - baseline.monthlyNet),
        envelopeTargetTotal,
        envelopeCarryoverTotal,
        envelopeEffectiveTargetTotal,
        envelopeProjectedSpendTotal,
        envelopeSuggestedRolloverTotal,
        envelopeCoveragePercent,
      },
    }
  },
})

export const getPhase2Data = query({
  args: {
    month: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    const now = new Date()
    const monthKey = args.month ?? toMonthKey(now)

    if (args.month) {
      validateMonthKey(args.month, 'Month')
    }

    if (!identity) {
      return {
        monthKey,
        transactionRules: [],
        envelopeBudgets: [],
        incomeAllocationRules: [],
        incomeAllocationSuggestions: [],
        autoAllocationPlan: {
          monthlyIncome: 0,
          totalAllocatedPercent: 0,
          totalAllocatedAmount: 0,
          residualAmount: 0,
          unallocatedPercent: 100,
          overAllocatedPercent: 0,
          buckets: (['bills', 'savings', 'goals', 'debt_overpay'] as const).map((target) => ({
            target,
            label: incomeAllocationTargetLabel[target],
            percentage: 0,
            monthlyAmount: 0,
            active: false,
          })),
        } satisfies AutoAllocationPlan,
        budgetPerformance: [],
        recurringCandidates: [],
        billRiskAlerts: [],
        forecastWindows: [],
        purchaseSplits: [],
        purchaseSplitTemplates: [],
        monthCloseChecklist: [],
        dataQuality: {
          duplicateCount: 0,
          anomalyCount: 0,
          missingCategoryCount: 0,
          pendingReconciliationCount: 0,
          splitMismatchCount: 0,
        },
      }
    }

    const [
      transactionRules,
      envelopeBudgets,
      incomeAllocationRules,
      incomeAllocationSuggestions,
      purchases,
      purchaseSplits,
      purchaseSplitTemplates,
      bills,
      incomes,
      incomePaymentChecks,
      cards,
      loans,
      accounts,
      monthlyCycleRuns,
    ] = await Promise.all([
      ctx.db
        .query('transactionRules')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .collect(),
      ctx.db
        .query('envelopeBudgets')
        .withIndex('by_userId_month', (q) => q.eq('userId', identity.subject).eq('month', monthKey))
        .collect(),
      ctx.db
        .query('incomeAllocationRules')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .collect(),
      ctx.db
        .query('incomeAllocationSuggestions')
        .withIndex('by_userId_month', (q) => q.eq('userId', identity.subject).eq('month', monthKey))
        .order('desc')
        .collect(),
      ctx.db
        .query('purchases')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('purchaseSplits')
        .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('purchaseSplitTemplates')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .collect(),
      ctx.db
        .query('bills')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('incomes')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('incomePaymentChecks')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('cards')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('loans')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('accounts')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('monthlyCycleRuns')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
    ])

    const splitMap = new Map<string, Array<{ category: string; amount: number }>>()
    purchaseSplits.forEach((split) => {
      const key = String(split.purchaseId)
      const current = splitMap.get(key) ?? []
      current.push({
        category: split.category,
        amount: split.amount,
      })
      splitMap.set(key, current)
    })

    const monthPurchases = purchases.filter((purchase) => purchase.purchaseDate.startsWith(monthKey))
    const monthSpendByCategory = new Map<string, number>()
    monthPurchases.forEach((purchase) => {
      const splits = splitMap.get(String(purchase._id))
      if (splits && splits.length > 0) {
        splits.forEach((split) => {
          monthSpendByCategory.set(split.category, (monthSpendByCategory.get(split.category) ?? 0) + split.amount)
        })
      } else {
        monthSpendByCategory.set(purchase.category, (monthSpendByCategory.get(purchase.category) ?? 0) + purchase.amount)
      }
    })

    const monthDate = new Date(`${monthKey}-01T00:00:00`)
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
    const isCurrentMonth = monthKey === toMonthKey(now)
    const elapsedDays = isCurrentMonth ? Math.max(now.getDate(), 1) : daysInMonth

    const budgetPerformance = envelopeBudgets
      .map((budget) => {
        const spent = roundCurrency(monthSpendByCategory.get(budget.category) ?? 0)
        const effectiveTarget = roundCurrency(budget.targetAmount + finiteOrZero(budget.carryoverAmount))
        const variance = roundCurrency(effectiveTarget - spent)
        const projectedMonthEnd = roundCurrency((spent / elapsedDays) * daysInMonth)

        let status: 'on_track' | 'warning' | 'over' = 'on_track'
        if (projectedMonthEnd > effectiveTarget) {
          status = 'over'
        } else if (projectedMonthEnd > effectiveTarget * 0.9) {
          status = 'warning'
        }

        return {
          id: String(budget._id),
          category: budget.category,
          targetAmount: budget.targetAmount,
          carryoverAmount: finiteOrZero(budget.carryoverAmount),
          effectiveTarget,
          spent,
          variance,
          projectedMonthEnd,
          rolloverEnabled: budget.rolloverEnabled,
          suggestedRollover: budget.rolloverEnabled ? roundCurrency(Math.max(variance, 0)) : 0,
          status,
        }
      })
      .sort((a, b) => b.spent - a.spent)

    const recurringWindowStart = new Date(now.getTime() - 210 * 86400000)
    const recurringPurchases = purchases.filter((purchase) => new Date(`${purchase.purchaseDate}T00:00:00`) >= recurringWindowStart)
    const recurringGroups = new Map<string, PurchaseDoc[]>()
    recurringPurchases.forEach((purchase) => {
      const key = normalizeText(purchase.item)
      const current = recurringGroups.get(key) ?? []
      current.push(purchase)
      recurringGroups.set(key, current)
    })

    const recurringCandidates = [...recurringGroups.entries()]
      .map(([key, group]) => {
        if (group.length < 3) {
          return null
        }

        const sorted = [...group].sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate))
        const intervals: number[] = []
        for (let i = 1; i < sorted.length; i += 1) {
          const from = new Date(`${sorted[i - 1].purchaseDate}T00:00:00`).getTime()
          const to = new Date(`${sorted[i].purchaseDate}T00:00:00`).getTime()
          intervals.push((to - from) / 86400000)
        }

        const avgInterval = intervals.reduce((sum, value) => sum + value, 0) / intervals.length
        if (avgInterval < 5 || avgInterval > 45) {
          return null
        }

        const avgAmount = sorted.reduce((sum, purchase) => sum + purchase.amount, 0) / sorted.length
        const lastPurchase = sorted[sorted.length - 1]
        const nextExpected = new Date(new Date(`${lastPurchase.purchaseDate}T00:00:00`).getTime() + avgInterval * 86400000)
        const variance = intervals.reduce((sum, value) => sum + Math.abs(value - avgInterval), 0) / intervals.length
        const confidence = Math.max(0, Math.min(1, 1 - variance / 20 + sorted.length * 0.04))

        return {
          id: key,
          label: lastPurchase.item,
          category: lastPurchase.category,
          count: sorted.length,
          averageAmount: roundCurrency(avgAmount),
          averageIntervalDays: roundCurrency(avgInterval),
          nextExpectedDate: nextExpected.toISOString().slice(0, 10),
          confidence: roundCurrency(confidence * 100),
        }
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      .sort((a, b) => b.confidence - a.confidence || b.count - a.count)
      .slice(0, 8)

    const monthlyIncome = incomes.reduce(
      (sum, income) =>
        sum + toMonthlyAmount(resolveIncomeNetAmount(income), income.cadence, income.customInterval, income.customUnit),
      0,
    )

    const incomeChecksByIncomeId = new Map<string, Map<string, IncomePaymentCheckDoc>>()
    incomePaymentChecks.forEach((entry) => {
      const incomeId = String(entry.incomeId)
      const checksByMonth = incomeChecksByIncomeId.get(incomeId) ?? new Map<string, IncomePaymentCheckDoc>()
      const existing = checksByMonth.get(entry.cycleMonth)
      if (!existing || entry.updatedAt > existing.updatedAt) {
        checksByMonth.set(entry.cycleMonth, entry)
      }
      incomeChecksByIncomeId.set(incomeId, checksByMonth)
    })

    const monthlyIncomeForForecast = incomes.reduce((sum, income) => {
      const paymentChecksByMonth = incomeChecksByIncomeId.get(String(income._id)) ?? new Map<string, IncomePaymentCheckDoc>()
      return (
        sum +
        resolveIncomeForecastMonthlyAmount({
          income,
          anchorMonthKey: monthKey,
          paymentChecksByMonth,
        })
      )
    }, 0)
    const autoAllocationPlan = buildAutoAllocationPlan(monthlyIncome, incomeAllocationRules)
    const monthlyBills = bills.reduce(
      (sum, bill) => sum + toMonthlyAmount(bill.amount, bill.cadence, bill.customInterval, bill.customUnit),
      0,
    )
    const monthlyCardPayments = cards.reduce((sum, card) => sum + finiteOrZero(card.minimumPayment), 0)
    const monthlyLoanPayments = loans.reduce(
      (sum, loan) =>
        sum +
        estimateLoanMonthlyPayment(loan) +
        finiteOrZero(loan.subscriptionCost),
      0,
    )
    const monthlyCommitments = monthlyBills + monthlyCardPayments + monthlyLoanPayments

    const ninetyDayWindowStart = new Date(now.getTime() - 90 * 86400000)
    const recentPurchases = purchases.filter((purchase) => new Date(`${purchase.purchaseDate}T00:00:00`) >= ninetyDayWindowStart)
    const averageDailySpend = recentPurchases.reduce((sum, purchase) => sum + purchase.amount, 0) / 90
    const monthlySpendEstimate = averageDailySpend * 30
    const monthlyNet = monthlyIncomeForForecast - monthlyCommitments - monthlySpendEstimate

    const liquidReserves = accounts.reduce((sum, account) => {
      if (!account.liquid) {
        return sum
      }
      return sum + Math.max(account.balance, 0)
    }, 0)

    const forecastWindows: ForecastWindow[] = ([30, 90, 365] as const).map((days) => {
      const projectedNet = roundCurrency(monthlyNet * (days / 30))
      const projectedCash = roundCurrency(liquidReserves + projectedNet)
      const coverageMonths = monthlyCommitments > 0 ? roundCurrency(projectedCash / monthlyCommitments) : 99
      const risk: ForecastRiskLevel =
        projectedCash < 0 ? 'critical' : projectedCash < monthlyCommitments ? 'warning' : 'healthy'
      return {
        days,
        projectedNet,
        projectedCash,
        coverageMonths,
        risk,
      }
    })

    const accountById = new Map(accounts.map((account) => [String(account._id), account]))
    const autopayProjectedByBillId = new Map<
      string,
      {
        linkedAccountName: string
        linkedAccountProjectedBalance: number
      }
    >()
    const autopayEvents = bills
      .map((bill) => {
        if (!bill.autopay || !bill.linkedAccountId) {
          return null
        }

        const nextDate = nextDateForCadence(
          bill.cadence,
          bill.createdAt,
          now,
          bill.dueDay,
          bill.customInterval,
          bill.customUnit,
        )
        if (!nextDate) {
          return null
        }

        const daysAway = Math.round((startOfDay(nextDate).getTime() - startOfDay(now).getTime()) / 86400000)
        if (daysAway < 0 || daysAway > 45) {
          return null
        }

        return {
          billId: String(bill._id),
          linkedAccountId: String(bill.linkedAccountId),
          amount: bill.amount,
          dueDate: startOfDay(nextDate),
          daysAway,
        }
      })
      .filter(
        (entry): entry is { billId: string; linkedAccountId: string; amount: number; dueDate: Date; daysAway: number } =>
          Boolean(entry),
      )
      .sort(
        (left, right) =>
          left.dueDate.getTime() - right.dueDate.getTime() || left.daysAway - right.daysAway || right.amount - left.amount,
      )

    const accountRunningBalance = new Map<string, number>()
    autopayEvents.forEach((event) => {
      const account = accountById.get(event.linkedAccountId)
      if (!account) {
        return
      }

      const projectedBefore = accountRunningBalance.has(event.linkedAccountId)
        ? accountRunningBalance.get(event.linkedAccountId)!
        : account.balance
      const projectedAfter = projectedBefore - event.amount

      accountRunningBalance.set(event.linkedAccountId, projectedAfter)
      autopayProjectedByBillId.set(event.billId, {
        linkedAccountName: account.name,
        linkedAccountProjectedBalance: roundCurrency(projectedBefore),
      })
    })

    const billRiskAlerts: BillRiskAlert[] = bills
      .map((bill): BillRiskAlert | null => {
        const nextDate = nextDateForCadence(
          bill.cadence,
          bill.createdAt,
          now,
          bill.dueDay,
          bill.customInterval,
          bill.customUnit,
        )
        if (!nextDate) {
          return null
        }
        const daysAway = Math.round((startOfDay(nextDate).getTime() - startOfDay(now).getTime()) / 86400000)
        if (daysAway < 0 || daysAway > 45) {
          return null
        }
        const autopayProjection = autopayProjectedByBillId.get(String(bill._id))
        const expectedAvailable = autopayProjection
          ? autopayProjection.linkedAccountProjectedBalance
          : roundCurrency(liquidReserves + (monthlyNet / 30) * daysAway)
        const risk: BillRiskLevel = autopayProjection
          ? expectedAvailable < bill.amount
            ? 'critical'
            : expectedAvailable < bill.amount * 1.25
              ? 'warning'
              : 'good'
          : expectedAvailable < bill.amount
            ? 'critical'
            : expectedAvailable < bill.amount * 1.25
              ? 'warning'
              : 'good'
        return {
          id: String(bill._id),
          name: bill.name,
          dueDate: nextDate.toISOString().slice(0, 10),
          amount: bill.amount,
          daysAway,
          expectedAvailable,
          risk,
          autopay: bill.autopay,
          linkedAccountName: autopayProjection?.linkedAccountName,
          linkedAccountProjectedBalance: autopayProjection?.linkedAccountProjectedBalance,
        }
      })
      .filter((entry): entry is BillRiskAlert => Boolean(entry))
      .sort((a, b) => a.daysAway - b.daysAway || b.amount - a.amount)
    const billDuplicateOverlap = detectBillDuplicateOverlapCounts(bills)

    const duplicateMap = new Map<string, number>()
    purchases.forEach((purchase) => {
      const key = `${normalizeText(purchase.item)}::${roundCurrency(purchase.amount)}::${purchase.purchaseDate}`
      duplicateMap.set(key, (duplicateMap.get(key) ?? 0) + 1)
    })
    const duplicateCount = [...duplicateMap.values()].filter((count) => count > 1).length

    const amounts = recentPurchases.map((purchase) => purchase.amount)
    const amountMean = amounts.length > 0 ? amounts.reduce((sum, value) => sum + value, 0) / amounts.length : 0
    const amountStd =
      amounts.length > 1
        ? Math.sqrt(amounts.reduce((sum, value) => sum + (value - amountMean) ** 2, 0) / (amounts.length - 1))
        : 0

    const anomalyCount = recentPurchases.filter((purchase) => purchase.amount > amountMean + amountStd * 2.5 && purchase.amount > 50).length
    const missingCategoryCount = purchases.filter((purchase) => {
      const value = normalizeText(purchase.category)
      return value.length === 0 || value === 'uncategorized' || value === 'other' || value === 'misc'
    }).length
    const pendingReconciliationCount = purchases.filter((purchase) => (purchase.reconciliationStatus ?? 'posted') === 'pending').length

    let splitMismatchCount = 0
    purchases.forEach((purchase) => {
      const splits = splitMap.get(String(purchase._id))
      if (!splits || splits.length === 0) {
        return
      }
      const total = splits.reduce((sum, split) => sum + split.amount, 0)
      if (Math.abs(roundCurrency(total) - roundCurrency(purchase.amount)) > 0.01) {
        splitMismatchCount += 1
      }
    })

    const topSpendingCategories = [...monthSpendByCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category]) => category)
    const budgetCategories = new Set(envelopeBudgets.map((budget) => budget.category))

    const monthCloseChecklist = [
      {
        id: 'pending-reconciliation',
        label: 'Resolve pending purchase reconciliation',
        done: pendingReconciliationCount === 0,
        detail: `${pendingReconciliationCount} pending entries`,
      },
      {
        id: 'cycle-run',
        label: `Run monthly cycle for ${monthKey}`,
        done: monthlyCycleRuns.some((run) => run.cycleKey === monthKey),
        detail: monthlyCycleRuns.some((run) => run.cycleKey === monthKey) ? 'Cycle run recorded' : 'No cycle run recorded',
      },
      {
        id: 'anomalies-reviewed',
        label: 'Review spending anomalies',
        done: anomalyCount === 0,
        detail: `${anomalyCount} anomalies flagged`,
      },
      {
        id: 'bill-duplicates-overlaps',
        label: 'Resolve duplicate/overlap bills',
        done: billDuplicateOverlap.duplicatePairCount === 0 && billDuplicateOverlap.overlapPairCount === 0,
        detail: `${billDuplicateOverlap.duplicatePairCount} duplicate pair(s) · ${billDuplicateOverlap.overlapPairCount} overlap pair(s) across ${billDuplicateOverlap.impactedBillCount} bill(s)`,
      },
      {
        id: 'budget-coverage',
        label: 'Cover top spending categories with budgets',
        done: topSpendingCategories.every((category) => budgetCategories.has(category)),
        detail: topSpendingCategories.length === 0 ? 'No spend categories yet' : `${topSpendingCategories.length} top categories checked`,
      },
      {
        id: 'categories-complete',
        label: 'Clear missing categories',
        done: missingCategoryCount === 0,
        detail: `${missingCategoryCount} uncategorized entries`,
      },
    ]

    const allocationSuggestions: AutoAllocationSuggestion[] = incomeAllocationSuggestions
      .map((entry) => ({
        id: String(entry._id),
        target: entry.target,
        actionType: entry.actionType,
        title: entry.title,
        detail: entry.detail,
        percentage: entry.percentage,
        amount: entry.amount,
        status: entry.status,
        month: entry.month,
        runId: entry.runId,
        createdAt: entry.createdAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt || b.amount - a.amount)

    return {
      monthKey,
      transactionRules,
      envelopeBudgets,
      incomeAllocationRules,
      incomeAllocationSuggestions: allocationSuggestions,
      autoAllocationPlan,
      budgetPerformance,
      recurringCandidates,
      billRiskAlerts,
      forecastWindows,
      purchaseSplits,
      purchaseSplitTemplates,
      monthCloseChecklist,
      dataQuality: {
        duplicateCount,
        anomalyCount,
        missingCategoryCount,
        pendingReconciliationCount,
        splitMismatchCount,
      },
    }
  },
})

export const addTransactionRule = mutation({
  args: {
    name: v.string(),
    matchType: ruleMatchTypeValidator,
    merchantPattern: v.string(),
    category: v.string(),
    reconciliationStatus: v.optional(reconciliationStatusValidator),
    fundingSourceType: v.optional(purchaseFundingSourceTypeValidator),
    fundingSourceId: v.optional(v.string()),
    priority: v.number(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    validateRequiredText(args.name, 'Rule name')
    validateRequiredText(args.merchantPattern, 'Merchant pattern')
    validateRequiredText(args.category, 'Rule category')
    validateOptionalText(args.fundingSourceId, 'Rule source id', 80)
    validateNonNegative(args.priority, 'Rule priority')
    const sourceMapping = sanitizeTransactionRuleFundingSource({
      fundingSourceType: args.fundingSourceType,
      fundingSourceId: args.fundingSourceId,
    })

    await ctx.db.insert('transactionRules', {
      userId: identity.subject,
      name: args.name.trim(),
      matchType: args.matchType,
      merchantPattern: args.merchantPattern.trim(),
      category: args.category.trim(),
      reconciliationStatus: args.reconciliationStatus,
      fundingSourceType: sourceMapping.fundingSourceType,
      fundingSourceId: sourceMapping.fundingSourceId,
      priority: Math.floor(args.priority),
      active: args.active,
      createdAt: Date.now(),
    })
  },
})

export const updateTransactionRule = mutation({
  args: {
    id: v.id('transactionRules'),
    name: v.string(),
    matchType: ruleMatchTypeValidator,
    merchantPattern: v.string(),
    category: v.string(),
    reconciliationStatus: v.optional(reconciliationStatusValidator),
    fundingSourceType: v.optional(purchaseFundingSourceTypeValidator),
    fundingSourceId: v.optional(v.string()),
    priority: v.number(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Transaction rule not found.')
    }

    validateRequiredText(args.name, 'Rule name')
    validateRequiredText(args.merchantPattern, 'Merchant pattern')
    validateRequiredText(args.category, 'Rule category')
    validateOptionalText(args.fundingSourceId, 'Rule source id', 80)
    validateNonNegative(args.priority, 'Rule priority')
    const sourceMapping = sanitizeTransactionRuleFundingSource({
      fundingSourceType: args.fundingSourceType ?? (existing.fundingSourceType as PurchaseFundingSourceType | undefined),
      fundingSourceId: args.fundingSourceId ?? existing.fundingSourceId,
    })

    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      matchType: args.matchType,
      merchantPattern: args.merchantPattern.trim(),
      category: args.category.trim(),
      reconciliationStatus: args.reconciliationStatus,
      fundingSourceType: sourceMapping.fundingSourceType,
      fundingSourceId: sourceMapping.fundingSourceId,
      priority: Math.floor(args.priority),
      active: args.active,
    })
  },
})

export const removeTransactionRule = mutation({
  args: {
    id: v.id('transactionRules'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Transaction rule not found.')
    }
    await ctx.db.delete(args.id)
  },
})

export const addEnvelopeBudget = mutation({
  args: {
    month: v.string(),
    category: v.string(),
    targetAmount: v.number(),
    rolloverEnabled: v.boolean(),
    carryoverAmount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    validateMonthKey(args.month, 'Budget month')
    validateRequiredText(args.category, 'Budget category')
    validatePositive(args.targetAmount, 'Target amount')
    if (args.carryoverAmount !== undefined) {
      validateNonNegative(args.carryoverAmount, 'Carryover amount')
    }

    const existing = await ctx.db
      .query('envelopeBudgets')
      .withIndex('by_userId_month', (q) => q.eq('userId', identity.subject).eq('month', args.month))
      .collect()
    const duplicate = existing.find((budget) => normalizeText(budget.category) === normalizeText(args.category))
    if (duplicate) {
      throw new Error('Budget category already exists for this month.')
    }

    await ctx.db.insert('envelopeBudgets', {
      userId: identity.subject,
      month: args.month,
      category: args.category.trim(),
      targetAmount: args.targetAmount,
      rolloverEnabled: args.rolloverEnabled,
      carryoverAmount: args.carryoverAmount,
      createdAt: Date.now(),
    })
  },
})

export const addIncomeAllocationRule = mutation({
  args: {
    target: incomeAllocationTargetValidator,
    percentage: v.number(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    validatePercentage(args.percentage, 'Allocation percentage')

    const existing = await ctx.db
      .query('incomeAllocationRules')
      .withIndex('by_userId_target', (q) => q.eq('userId', identity.subject).eq('target', args.target))
      .first()

    if (existing) {
      throw new Error('Allocation rule already exists for this target.')
    }

    await ctx.db.insert('incomeAllocationRules', {
      userId: identity.subject,
      target: args.target,
      percentage: roundPercent(args.percentage),
      active: args.active,
      createdAt: Date.now(),
    })
  },
})

export const updateIncomeAllocationRule = mutation({
  args: {
    id: v.id('incomeAllocationRules'),
    target: incomeAllocationTargetValidator,
    percentage: v.number(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Income allocation rule not found.')
    }

    validatePercentage(args.percentage, 'Allocation percentage')

    const duplicate = await ctx.db
      .query('incomeAllocationRules')
      .withIndex('by_userId_target', (q) => q.eq('userId', identity.subject).eq('target', args.target))
      .first()
    if (duplicate && duplicate._id !== args.id) {
      throw new Error('Allocation rule already exists for this target.')
    }

    await ctx.db.patch(args.id, {
      target: args.target,
      percentage: roundPercent(args.percentage),
      active: args.active,
    })
  },
})

export const removeIncomeAllocationRule = mutation({
  args: {
    id: v.id('incomeAllocationRules'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Income allocation rule not found.')
    }
    await ctx.db.delete(args.id)
  },
})

export const applyIncomeAutoAllocationNow = mutation({
  args: {
    month: v.optional(v.string()),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const nowTimestamp = args.now ?? Date.now()
    const now = new Date(nowTimestamp)
    const monthKey = args.month ?? toMonthKey(now)
    if (args.month) {
      validateMonthKey(args.month, 'Month')
    }

    const [
      incomeAllocationRules,
      incomes,
      bills,
      cards,
      loans,
      goals,
      accounts,
      existingSuggestions,
    ] = await Promise.all([
      ctx.db
        .query('incomeAllocationRules')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('incomes')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('bills')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('cards')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('loans')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('goals')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('accounts')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('incomeAllocationSuggestions')
        .withIndex('by_userId_month', (q) => q.eq('userId', identity.subject).eq('month', monthKey))
        .collect(),
    ])

    const activeRuleCount = incomeAllocationRules.filter((rule) => rule.active && rule.percentage > 0).length
    if (activeRuleCount === 0) {
      throw new Error('Add at least one active auto-allocation rule before applying suggestions.')
    }

    const monthlyIncome = incomes.reduce(
      (sum, income) =>
        sum + toMonthlyAmount(resolveIncomeNetAmount(income), income.cadence, income.customInterval, income.customUnit),
      0,
    )
    const autoAllocationPlan = buildAutoAllocationPlan(monthlyIncome, incomeAllocationRules)
    if (autoAllocationPlan.totalAllocatedAmount <= 0) {
      throw new Error('Auto-allocation totals are zero. Increase an active allocation percentage.')
    }

    const monthlyBills = bills.reduce(
      (sum, bill) => sum + toMonthlyAmount(bill.amount, bill.cadence, bill.customInterval, bill.customUnit),
      0,
    )
    const monthlyCardPayments = cards.reduce((sum, card) => sum + finiteOrZero(card.minimumPayment), 0)
    const monthlyLoanPayments = loans.reduce(
      (sum, loan) =>
        sum +
        estimateLoanMonthlyPayment(loan) +
        finiteOrZero(loan.subscriptionCost),
      0,
    )
    const monthlyCommitments = roundCurrency(monthlyBills + monthlyCardPayments + monthlyLoanPayments)

    const drafts = buildAutoAllocationSuggestionDrafts({
      autoAllocationPlan,
      monthlyCommitments,
      cards,
      loans,
      goals,
      accounts,
    })

    if (drafts.length === 0) {
      throw new Error('No active auto-allocation buckets available to suggest.')
    }

    await Promise.all(existingSuggestions.map((entry) => ctx.db.delete(entry._id)))

    const runId = `manual:${nowTimestamp}`
    const created: AutoAllocationSuggestion[] = []

    for (const draft of drafts) {
      const id = await ctx.db.insert('incomeAllocationSuggestions', {
        userId: identity.subject,
        month: monthKey,
        runId,
        target: draft.target,
        actionType: draft.actionType,
        title: draft.title,
        detail: draft.detail,
        percentage: roundPercent(draft.percentage),
        amount: roundCurrency(draft.amount),
        status: 'suggested',
        createdAt: nowTimestamp,
      })

      created.push({
        id: String(id),
        target: draft.target,
        actionType: draft.actionType,
        title: draft.title,
        detail: draft.detail,
        percentage: roundPercent(draft.percentage),
        amount: roundCurrency(draft.amount),
        status: 'suggested',
        month: monthKey,
        runId,
        createdAt: nowTimestamp,
      })
    }

    return {
      monthKey,
      runId,
      suggestionsCreated: created.length,
      totalSuggestedAmount: roundCurrency(created.reduce((sum, entry) => sum + entry.amount, 0)),
      residualAmount: autoAllocationPlan.residualAmount,
      overAllocatedPercent: autoAllocationPlan.overAllocatedPercent,
      suggestions: created,
    }
  },
})

export const upsertPlanningMonthVersion = mutation({
  args: {
    month: v.string(),
    versionKey: planningVersionKeyValidator,
    expectedIncome: v.number(),
    fixedCommitments: v.number(),
    variableSpendingCap: v.number(),
    notes: v.optional(v.string()),
    selectAfterSave: v.optional(v.boolean()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    validateMonthKey(args.month, 'Month')
    validateNonNegative(args.expectedIncome, 'Expected income')
    validateNonNegative(args.fixedCommitments, 'Fixed commitments')
    validateNonNegative(args.variableSpendingCap, 'Variable spending cap')
    validateOptionalText(args.notes, 'Version notes', 500)

    const now = Date.now()
    const monthRows = await ctx.db
      .query('planningMonthVersions')
      .withIndex('by_userId_month', (q) => q.eq('userId', identity.subject).eq('month', args.month))
      .collect()

    const existing = monthRows.find((row) => row.versionKey === args.versionKey)
    const hasSelectedVersion = monthRows.some((row) => row.isSelected)
    const shouldSelect =
      args.selectAfterSave === true ||
      (!hasSelectedVersion && args.versionKey === 'base')

    const beforeSnapshot = existing
      ? {
          month: existing.month,
          versionKey: existing.versionKey,
          expectedIncome: existing.expectedIncome,
          fixedCommitments: existing.fixedCommitments,
          variableSpendingCap: existing.variableSpendingCap,
          notes: existing.notes ?? '',
          isSelected: existing.isSelected,
          updatedAt: existing.updatedAt,
        }
      : undefined

    let targetId: Id<'planningMonthVersions'>
    if (existing) {
      targetId = existing._id
      await ctx.db.patch(existing._id, {
        expectedIncome: roundCurrency(args.expectedIncome),
        fixedCommitments: roundCurrency(args.fixedCommitments),
        variableSpendingCap: roundCurrency(args.variableSpendingCap),
        notes: args.notes?.trim() || undefined,
        updatedAt: now,
      })
    } else {
      targetId = await ctx.db.insert('planningMonthVersions', {
        userId: identity.subject,
        month: args.month,
        versionKey: args.versionKey,
        expectedIncome: roundCurrency(args.expectedIncome),
        fixedCommitments: roundCurrency(args.fixedCommitments),
        variableSpendingCap: roundCurrency(args.variableSpendingCap),
        notes: args.notes?.trim() || undefined,
        isSelected: false,
        createdAt: now,
        updatedAt: now,
      })
    }

    if (shouldSelect) {
      for (const row of monthRows) {
        if (row._id === targetId) continue
        if (!row.isSelected) continue
        await ctx.db.patch(row._id, { isSelected: false, updatedAt: now })
      }
      await ctx.db.patch(targetId, { isSelected: true, updatedAt: now })
    }

    const target = await ctx.db.get(targetId)
    const afterSnapshot = target
      ? {
          month: target.month,
          versionKey: target.versionKey,
          expectedIncome: target.expectedIncome,
          fixedCommitments: target.fixedCommitments,
          variableSpendingCap: target.variableSpendingCap,
          notes: target.notes ?? '',
          isSelected: target.isSelected,
          updatedAt: target.updatedAt,
        }
      : undefined

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'planning_month_version',
      entityId: String(targetId),
      action: existing ? 'update' : 'create',
      before: beforeSnapshot,
      after: afterSnapshot,
      metadata: {
        source: sanitizeMutationSource(args.source, 'planning_tab'),
        month: args.month,
        versionKey: args.versionKey,
        selectAfterSave: args.selectAfterSave ?? false,
      },
    })

    return {
      id: String(targetId),
      monthKey: args.month,
      versionKey: args.versionKey,
      isSelected: target?.isSelected ?? shouldSelect,
      expectedIncome: target?.expectedIncome ?? roundCurrency(args.expectedIncome),
      fixedCommitments: target?.fixedCommitments ?? roundCurrency(args.fixedCommitments),
      variableSpendingCap: target?.variableSpendingCap ?? roundCurrency(args.variableSpendingCap),
      notes: target?.notes ?? args.notes?.trim() ?? '',
      updatedAt: target?.updatedAt ?? now,
    }
  },
})

export const applyPlanningVersionToMonth = mutation({
  args: {
    month: v.optional(v.string()),
    versionKey: v.optional(planningVersionKeyValidator),
    source: v.optional(planningActionTaskSourceValidator),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const nowTimestamp = Date.now()
    const now = new Date(nowTimestamp)
    const monthKey = args.month ?? toMonthKey(now)
    if (args.month) {
      validateMonthKey(args.month, 'Month')
    }

    const [
      monthVersions,
      existingTasks,
      envelopeBudgets,
      purchases,
      purchaseSplits,
      incomes,
      bills,
      cards,
      loans,
      incomeAllocationRules,
    ] = await Promise.all([
      ctx.db
        .query('planningMonthVersions')
        .withIndex('by_userId_month', (q) => q.eq('userId', identity.subject).eq('month', monthKey))
        .collect(),
      ctx.db
        .query('planningActionTasks')
        .withIndex('by_userId_month_createdAt', (q) => q.eq('userId', identity.subject).eq('month', monthKey))
        .collect(),
      ctx.db
        .query('envelopeBudgets')
        .withIndex('by_userId_month', (q) => q.eq('userId', identity.subject).eq('month', monthKey))
        .collect(),
      ctx.db
        .query('purchases')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('purchaseSplits')
        .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('incomes')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('bills')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('cards')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('loans')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('incomeAllocationRules')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
    ])

    const monthSpendByCategory = buildMonthSpendByCategory({
      monthKey,
      purchases,
      purchaseSplits,
    })
    const monthPurchaseSpend = roundCurrency([...monthSpendByCategory.values()].reduce((sum, value) => sum + value, 0))

    const commitments = computeMonthlyCommitmentsFromRecords({
      bills,
      cards,
      loans,
    })
    const monthlyIncome = roundCurrency(
      incomes.reduce(
        (sum, income) =>
          sum + toMonthlyAmount(resolveIncomeNetAmount(income), income.cadence, income.customInterval, income.customUnit),
        0,
      ),
    )

    const selectedSaved = monthVersions.find((entry) => entry.isSelected)
    const requestedVersion = args.versionKey
      ? monthVersions.find((entry) => entry.versionKey === args.versionKey)
      : undefined
    const fallbackDefaults = buildDefaultPlanningVersionMap({
      baselineExpectedIncome: monthlyIncome,
      baselineFixedCommitments: commitments.monthlyCommitments,
      baselineVariableSpendingCap: monthPurchaseSpend,
      selectedVersion: args.versionKey ?? (selectedSaved?.versionKey as PlanningVersionKey | undefined),
      nowTimestamp,
    })
    const fallbackVersionKey = args.versionKey ?? (selectedSaved?.versionKey as PlanningVersionKey | undefined) ?? 'base'
    const fallbackVersion = fallbackDefaults.get(fallbackVersionKey)!

    const selectedVersion = requestedVersion ??
      selectedSaved ??
      monthVersions.find((entry) => entry.versionKey === 'base') ?? {
        _id: `default:${monthKey}:${fallbackVersionKey}` as Id<'planningMonthVersions'>,
        _creationTime: nowTimestamp,
        userId: identity.subject,
        month: monthKey,
        versionKey: fallbackVersionKey,
        expectedIncome: fallbackVersion.expectedIncome,
        fixedCommitments: fallbackVersion.fixedCommitments,
        variableSpendingCap: fallbackVersion.variableSpendingCap,
        notes: fallbackVersion.notes,
        isSelected: true,
        createdAt: nowTimestamp,
        updatedAt: nowTimestamp,
      }

    const autoAllocationPlan = buildAutoAllocationPlan(monthlyIncome, incomeAllocationRules)
    const taskSource: PlanningActionTaskSource =
      args.source ?? (existingTasks.length > 0 ? 'reapply' : 'manual_apply')
    const taskDrafts = buildPlanningActionTaskDrafts({
      monthKey,
      version: {
        versionKey: selectedVersion.versionKey as PlanningVersionKey,
        expectedIncome: selectedVersion.expectedIncome,
        fixedCommitments: selectedVersion.fixedCommitments,
        variableSpendingCap: selectedVersion.variableSpendingCap,
      },
      envelopeBudgets,
      monthSpendByCategory,
      autoAllocationPlan,
    })

    await Promise.all(existingTasks.map((entry) => ctx.db.delete(entry._id)))

    const insertedTaskIds: string[] = []
    for (const draft of taskDrafts) {
      const id = await ctx.db.insert('planningActionTasks', {
        userId: identity.subject,
        month: monthKey,
        versionKey: selectedVersion.versionKey as PlanningVersionKey,
        title: draft.title,
        detail: draft.detail,
        category: draft.category,
        impactAmount: roundCurrency(draft.impactAmount),
        status: draft.status,
        source: taskSource,
        createdAt: nowTimestamp,
        updatedAt: nowTimestamp,
      })
      insertedTaskIds.push(String(id))
    }

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'planning_plan_apply',
      entityId: `${monthKey}:${selectedVersion.versionKey}`,
      action: existingTasks.length > 0 ? 'reapply' : 'apply',
      before: {
        month: monthKey,
        versionKey: selectedVersion.versionKey,
        existingTaskCount: existingTasks.length,
        existingTaskStatusCounts: existingTasks.reduce(
          (acc, task) => {
            acc[task.status] = (acc[task.status] ?? 0) + 1
            return acc
          },
          {} as Record<string, number>,
        ),
      },
      after: {
        month: monthKey,
        versionKey: selectedVersion.versionKey,
        createdTaskCount: taskDrafts.length,
        totalImpactAmount: roundCurrency(taskDrafts.reduce((sum, draft) => sum + Math.max(draft.impactAmount, 0), 0)),
      },
      metadata: {
        source: taskSource,
        month: monthKey,
        versionKey: selectedVersion.versionKey,
      },
    })

    return {
      monthKey,
      versionKey: selectedVersion.versionKey as PlanningVersionKey,
      source: taskSource,
      tasksCreated: taskDrafts.length,
      taskIds: insertedTaskIds,
      totalImpactAmount: roundCurrency(taskDrafts.reduce((sum, draft) => sum + Math.max(draft.impactAmount, 0), 0)),
    }
  },
})

export const updatePlanningActionTaskStatus = mutation({
  args: {
    id: v.id('planningActionTasks'),
    status: planningActionTaskStatusValidator,
    source: v.optional(planningActionTaskSourceValidator),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Planning action task not found.')
    }

    const beforeSnapshot = {
      month: existing.month,
      versionKey: existing.versionKey,
      title: existing.title,
      category: existing.category,
      impactAmount: existing.impactAmount,
      status: existing.status,
      source: existing.source,
      updatedAt: existing.updatedAt,
    }

    const now = Date.now()
    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: now,
    })

    const updated = await ctx.db.get(args.id)
    const afterSnapshot = updated
      ? {
          month: updated.month,
          versionKey: updated.versionKey,
          title: updated.title,
          category: updated.category,
          impactAmount: updated.impactAmount,
          status: updated.status,
          source: updated.source,
          updatedAt: updated.updatedAt,
        }
      : undefined

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'planning_action_task',
      entityId: String(args.id),
      action: 'status_update',
      before: beforeSnapshot,
      after: afterSnapshot,
      metadata: {
        source: args.source ?? 'planning_tab',
        month: existing.month,
        versionKey: existing.versionKey,
      },
    })

    return {
      id: String(args.id),
      status: args.status,
      updatedAt: now,
    }
  },
})

export const getPlanningPhase3Data = query({
  args: {
    month: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    const now = new Date()
    const monthKey = args.month ?? toMonthKey(now)
    if (args.month) {
      validateMonthKey(args.month, 'Month')
    }

    if (!identity) {
      return {
        monthKey,
        selectedVersionKey: 'base' as PlanningVersionKey,
        actionTasks: [],
        adherenceRows: [],
        planningKpis: {
          forecastAccuracyPercent: 100,
          varianceRatePercent: 0,
          planCompletionPercent: 0,
          totalTasks: 0,
          completedTasks: 0,
          plannedNet: 0,
          actualNet: 0,
        },
        auditEvents: [],
      }
    }

    const [
      monthVersions,
      actionTasks,
      envelopeBudgets,
      purchases,
      purchaseSplits,
      bills,
      cards,
      loans,
      planningVersionAudits,
      planningApplyAudits,
      planningTaskAudits,
    ] = await Promise.all([
      ctx.db
        .query('planningMonthVersions')
        .withIndex('by_userId_month', (q) => q.eq('userId', identity.subject).eq('month', monthKey))
        .collect(),
      ctx.db
        .query('planningActionTasks')
        .withIndex('by_userId_month_createdAt', (q) => q.eq('userId', identity.subject).eq('month', monthKey))
        .order('desc')
        .take(120),
      ctx.db
        .query('envelopeBudgets')
        .withIndex('by_userId_month', (q) => q.eq('userId', identity.subject).eq('month', monthKey))
        .collect(),
      ctx.db
        .query('purchases')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('purchaseSplits')
        .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('bills')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('cards')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('loans')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('financeAuditEvents')
        .withIndex('by_userId_entityType_createdAt', (q) =>
          q.eq('userId', identity.subject).eq('entityType', 'planning_month_version'),
        )
        .order('desc')
        .take(80),
      ctx.db
        .query('financeAuditEvents')
        .withIndex('by_userId_entityType_createdAt', (q) =>
          q.eq('userId', identity.subject).eq('entityType', 'planning_plan_apply'),
        )
        .order('desc')
        .take(80),
      ctx.db
        .query('financeAuditEvents')
        .withIndex('by_userId_entityType_createdAt', (q) =>
          q.eq('userId', identity.subject).eq('entityType', 'planning_action_task'),
        )
        .order('desc')
        .take(80),
    ])

    const selectedVersion =
      monthVersions.find((entry) => entry.isSelected) ??
      monthVersions.find((entry) => entry.versionKey === 'base')
    const versionKey = (selectedVersion?.versionKey as PlanningVersionKey | undefined) ?? 'base'
    const monthSpendByCategory = buildMonthSpendByCategory({
      monthKey,
      purchases,
      purchaseSplits,
    })

    const plannedByCategory = new Map<string, number>()
    envelopeBudgets.forEach((budget) => {
      const effectiveTarget = roundCurrency(budget.targetAmount + finiteOrZero(budget.carryoverAmount))
      plannedByCategory.set(budget.category, roundCurrency((plannedByCategory.get(budget.category) ?? 0) + effectiveTarget))
    })

    const adherenceCategories = new Set([...plannedByCategory.keys(), ...monthSpendByCategory.keys()])
    const adherenceRows = Array.from(adherenceCategories)
      .map((category) => {
        const planned = roundCurrency(plannedByCategory.get(category) ?? 0)
        const actual = roundCurrency(monthSpendByCategory.get(category) ?? 0)
        const variance = roundCurrency(actual - planned)
        const varianceRatePercent = planned > 0 ? roundPercent((variance / planned) * 100) : actual > 0 ? 100 : 0
        const status: 'on_track' | 'warning' | 'over' =
          variance > 0.01 ? 'over' : variance < -planned * 0.25 ? 'warning' : 'on_track'
        return {
          id: `${monthKey}:${category}`,
          category,
          planned,
          actual,
          variance,
          varianceRatePercent,
          status,
        }
      })
      .sort((left, right) => Math.abs(right.variance) - Math.abs(left.variance) || left.category.localeCompare(right.category))

    const plannedTotal = roundCurrency(adherenceRows.reduce((sum, row) => sum + row.planned, 0))
    const actualTotal = roundCurrency(adherenceRows.reduce((sum, row) => sum + row.actual, 0))
    const absoluteVarianceTotal = roundCurrency(adherenceRows.reduce((sum, row) => sum + Math.abs(row.variance), 0))
    const commitments = computeMonthlyCommitmentsFromRecords({ bills, cards, loans })
    const plannedNet = roundCurrency(
      (selectedVersion?.expectedIncome ?? 0) -
        (selectedVersion?.fixedCommitments ?? commitments.monthlyCommitments) -
        (selectedVersion?.variableSpendingCap ?? plannedTotal),
    )
    const actualNet = roundCurrency(
      (selectedVersion?.expectedIncome ?? 0) -
        (selectedVersion?.fixedCommitments ?? commitments.monthlyCommitments) -
        actualTotal,
    )
    const forecastAccuracyPercent = roundPercent(
      clamp(100 - (Math.abs(actualNet - plannedNet) / Math.max(Math.abs(plannedNet), 1)) * 100, 0, 100),
    )
    const varianceRatePercent = roundPercent(plannedTotal > 0 ? (absoluteVarianceTotal / plannedTotal) * 100 : 0)
    const completedTasks = actionTasks.filter((task) => task.status === 'done').length
    const planCompletionPercent = roundPercent(actionTasks.length > 0 ? (completedTasks / actionTasks.length) * 100 : 0)
    const auditEvents = [...planningVersionAudits, ...planningApplyAudits, ...planningTaskAudits]
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, 120)
      .map((event) => ({
        id: String(event._id),
        entityType: event.entityType,
        entityId: event.entityId,
        action: event.action,
        beforeJson: event.beforeJson ?? undefined,
        afterJson: event.afterJson ?? undefined,
        metadataJson: event.metadataJson ?? undefined,
        createdAt: event.createdAt,
      }))

    return {
      monthKey,
      selectedVersionKey: versionKey,
      actionTasks: actionTasks.map((task) => ({
        id: String(task._id),
        month: task.month,
        versionKey: task.versionKey,
        title: task.title,
        detail: task.detail,
        category: task.category,
        impactAmount: task.impactAmount,
        status: task.status,
        source: task.source,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      })),
      adherenceRows,
      planningKpis: {
        forecastAccuracyPercent,
        varianceRatePercent,
        planCompletionPercent,
        totalTasks: actionTasks.length,
        completedTasks,
        plannedNet,
        actualNet,
      },
      auditEvents,
    }
  },
})

export const updateEnvelopeBudget = mutation({
  args: {
    id: v.id('envelopeBudgets'),
    month: v.string(),
    category: v.string(),
    targetAmount: v.number(),
    rolloverEnabled: v.boolean(),
    carryoverAmount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Budget not found.')
    }

    validateMonthKey(args.month, 'Budget month')
    validateRequiredText(args.category, 'Budget category')
    validatePositive(args.targetAmount, 'Target amount')
    if (args.carryoverAmount !== undefined) {
      validateNonNegative(args.carryoverAmount, 'Carryover amount')
    }

    await ctx.db.patch(args.id, {
      month: args.month,
      category: args.category.trim(),
      targetAmount: args.targetAmount,
      rolloverEnabled: args.rolloverEnabled,
      carryoverAmount: args.carryoverAmount,
    })
  },
})

export const removeEnvelopeBudget = mutation({
  args: {
    id: v.id('envelopeBudgets'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Budget not found.')
    }
    await ctx.db.delete(args.id)
  },
})

export const upsertPurchaseSplits = mutation({
  args: {
    purchaseId: v.id('purchases'),
    splits: v.array(
      v.object({
        category: v.string(),
        amount: v.number(),
        goalId: v.optional(v.id('goals')),
        accountId: v.optional(v.id('accounts')),
      }),
    ),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const purchase = await ctx.db.get(args.purchaseId)
    if (!purchase || purchase.userId !== identity.subject) {
      throw new Error('Purchase not found.')
    }
    if (args.splits.length === 0) {
      throw new Error('At least one split is required.')
    }

    const splitTotal = roundCurrency(args.splits.reduce((sum, split) => {
      validateRequiredText(split.category, 'Split category')
      validatePositive(split.amount, 'Split amount')
      return sum + split.amount
    }, 0))

    if (Math.abs(splitTotal - roundCurrency(purchase.amount)) > 0.01) {
      throw new Error('Split amounts must equal purchase total.')
    }

    for (const split of args.splits) {
      if (split.goalId) {
        const goal = await ctx.db.get(split.goalId)
        if (!goal || goal.userId !== identity.subject) {
          throw new Error('Selected goal for split was not found.')
        }
      }
      if (split.accountId) {
        const account = await ctx.db.get(split.accountId)
        if (!account || account.userId !== identity.subject) {
          throw new Error('Selected account for split was not found.')
        }
      }
    }

    const source = sanitizeMutationSource(args.source, 'manual')
    const now = Date.now()
    const existingSplits = await ctx.db
      .query('purchaseSplits')
      .withIndex('by_purchaseId', (q) => q.eq('purchaseId', args.purchaseId))
      .collect()

    const normalizedSplits = args.splits.map((split) => ({
      category: split.category.trim(),
      amount: roundCurrency(split.amount),
      goalId: split.goalId,
      accountId: split.accountId,
    }))

    await Promise.all(existingSplits.map((split) => ctx.db.delete(split._id)))

    for (const split of normalizedSplits) {
      await ctx.db.insert('purchaseSplits', {
        userId: identity.subject,
        purchaseId: args.purchaseId,
        category: split.category,
        amount: split.amount,
        goalId: split.goalId,
        accountId: split.accountId,
        createdAt: now,
      })
    }

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'purchase',
      entityId: String(args.purchaseId),
      action: 'split_upserted',
      before: {
        splitCount: existingSplits.length,
        splits: existingSplits.map((split) => ({
          category: split.category,
          amount: split.amount,
          goalId: split.goalId ? String(split.goalId) : null,
          accountId: split.accountId ? String(split.accountId) : null,
        })),
      },
      after: {
        splitCount: normalizedSplits.length,
        splits: normalizedSplits.map((split) => ({
          category: split.category,
          amount: split.amount,
          goalId: split.goalId ? String(split.goalId) : null,
          accountId: split.accountId ? String(split.accountId) : null,
        })),
      },
      metadata: {
        source,
        mutationAt: now,
      },
    })
  },
})

export const clearPurchaseSplits = mutation({
  args: {
    purchaseId: v.id('purchases'),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const purchase = await ctx.db.get(args.purchaseId)
    if (!purchase || purchase.userId !== identity.subject) {
      throw new Error('Purchase not found.')
    }
    const existingSplits = await ctx.db
      .query('purchaseSplits')
      .withIndex('by_purchaseId', (q) => q.eq('purchaseId', args.purchaseId))
      .collect()
    const source = sanitizeMutationSource(args.source, 'manual')
    const now = Date.now()
    await Promise.all(existingSplits.map((split) => ctx.db.delete(split._id)))

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'purchase',
      entityId: String(args.purchaseId),
      action: 'split_cleared',
      before: {
        splitCount: existingSplits.length,
      },
      after: {
        splitCount: 0,
      },
      metadata: {
        source,
        mutationAt: now,
      },
    })
  },
})

export const addPurchaseSplitTemplate = mutation({
  args: {
    name: v.string(),
    splits: v.array(
      v.object({
        category: v.string(),
        percentage: v.number(),
        goalId: v.optional(v.id('goals')),
        accountId: v.optional(v.id('accounts')),
      }),
    ),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    validateSplitTemplateName(args.name)
    ensureValidSplitTemplateLines(args.splits)

    for (const line of args.splits) {
      if (line.goalId) {
        const goal = await ctx.db.get(line.goalId)
        if (!goal || goal.userId !== identity.subject) {
          throw new Error('Selected goal for template was not found.')
        }
      }
      if (line.accountId) {
        const account = await ctx.db.get(line.accountId)
        if (!account || account.userId !== identity.subject) {
          throw new Error('Selected account for template was not found.')
        }
      }
    }

    const now = Date.now()
    const templateId = await ctx.db.insert('purchaseSplitTemplates', {
      userId: identity.subject,
      name: normalizeSplitTemplateName(args.name),
      splits: args.splits.map((line) => ({
        category: line.category.trim(),
        percentage: line.percentage,
        goalId: line.goalId,
        accountId: line.accountId,
      })),
      createdAt: now,
      updatedAt: now,
    })

    const source = sanitizeMutationSource(args.source, 'manual')
    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'purchase_split_template',
      entityId: String(templateId),
      action: 'created',
      after: {
        name: normalizeSplitTemplateName(args.name),
        splitCount: args.splits.length,
      },
      metadata: {
        source,
        mutationAt: now,
      },
    })

    return { templateId }
  },
})

export const updatePurchaseSplitTemplate = mutation({
  args: {
    id: v.id('purchaseSplitTemplates'),
    name: v.string(),
    splits: v.array(
      v.object({
        category: v.string(),
        percentage: v.number(),
        goalId: v.optional(v.id('goals')),
        accountId: v.optional(v.id('accounts')),
      }),
    ),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Split template not found.')
    }

    validateSplitTemplateName(args.name)
    ensureValidSplitTemplateLines(args.splits)

    for (const line of args.splits) {
      if (line.goalId) {
        const goal = await ctx.db.get(line.goalId)
        if (!goal || goal.userId !== identity.subject) {
          throw new Error('Selected goal for template was not found.')
        }
      }
      if (line.accountId) {
        const account = await ctx.db.get(line.accountId)
        if (!account || account.userId !== identity.subject) {
          throw new Error('Selected account for template was not found.')
        }
      }
    }

    const source = sanitizeMutationSource(args.source, 'manual')
    const now = Date.now()
    await ctx.db.patch(args.id, {
      name: normalizeSplitTemplateName(args.name),
      splits: args.splits.map((line) => ({
        category: line.category.trim(),
        percentage: line.percentage,
        goalId: line.goalId,
        accountId: line.accountId,
      })),
      updatedAt: now,
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'purchase_split_template',
      entityId: String(args.id),
      action: 'updated',
      before: {
        name: existing.name,
        splitCount: existing.splits.length,
      },
      after: {
        name: normalizeSplitTemplateName(args.name),
        splitCount: args.splits.length,
      },
      metadata: {
        source,
        mutationAt: now,
      },
    })

    return { updated: true }
  },
})

export const removePurchaseSplitTemplate = mutation({
  args: {
    id: v.id('purchaseSplitTemplates'),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Split template not found.')
    }
    const source = sanitizeMutationSource(args.source, 'manual')
    const now = Date.now()
    await ctx.db.delete(args.id)

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'purchase_split_template',
      entityId: String(args.id),
      action: 'removed',
      before: {
        name: existing.name,
        splitCount: existing.splits.length,
      },
      metadata: {
        source,
        mutationAt: now,
      },
    })

    return { removed: true }
  },
})

export const applyPurchaseSplitTemplate = mutation({
  args: {
    purchaseId: v.id('purchases'),
    templateId: v.id('purchaseSplitTemplates'),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const purchase = await ctx.db.get(args.purchaseId)
    if (!purchase || purchase.userId !== identity.subject) {
      throw new Error('Purchase not found.')
    }

    const template = await ctx.db.get(args.templateId)
    if (!template || template.userId !== identity.subject) {
      throw new Error('Split template not found.')
    }

    ensureValidSplitTemplateLines(template.splits)
    const splits = buildAmountsFromTemplatePercentages(purchase.amount, template.splits)

    for (const line of splits) {
      if (line.goalId) {
        const goal = await ctx.db.get(line.goalId)
        if (!goal || goal.userId !== identity.subject) {
          throw new Error('Selected goal for template split was not found.')
        }
      }
      if (line.accountId) {
        const account = await ctx.db.get(line.accountId)
        if (!account || account.userId !== identity.subject) {
          throw new Error('Selected account for template split was not found.')
        }
      }
    }

    const existingSplits = await ctx.db
      .query('purchaseSplits')
      .withIndex('by_purchaseId', (q) => q.eq('purchaseId', args.purchaseId))
      .collect()

    await Promise.all(existingSplits.map((split) => ctx.db.delete(split._id)))

    const now = Date.now()
    const source = sanitizeMutationSource(args.source, 'manual')
    for (const split of splits) {
      await ctx.db.insert('purchaseSplits', {
        userId: identity.subject,
        purchaseId: args.purchaseId,
        category: split.category.trim(),
        amount: split.amount,
        goalId: split.goalId,
        accountId: split.accountId,
        createdAt: now,
      })
    }

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'purchase',
      entityId: String(args.purchaseId),
      action: 'split_template_applied',
      before: {
        splitCount: existingSplits.length,
      },
      after: {
        splitCount: splits.length,
      },
      metadata: {
        source,
        mutationAt: now,
        templateId: String(args.templateId),
        templateName: template.name,
      },
    })

    return { applied: true, splitCount: splits.length }
  },
})

export const bulkUpdatePurchaseReconciliation = mutation({
  args: {
    ids: v.array(v.id('purchases')),
    reconciliationStatus: reconciliationStatusValidator,
    statementMonth: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    if (args.ids.length === 0) {
      return { updated: 0 }
    }
    if (args.statementMonth) {
      validateMonthKey(args.statementMonth, 'Statement month')
    }

    let updated = 0
    const source = sanitizeMutationSource(args.source, 'bulk')
    const now = Date.now()
    const sampleIds: string[] = []
    const beforeSnapshots: Array<Record<string, unknown>> = []
    const afterSnapshots: Array<Record<string, unknown>> = []
    for (const id of args.ids) {
      const purchase = await ctx.db.get(id)
      if (!purchase || purchase.userId !== identity.subject) {
        continue
      }

      const now = Date.now()
      const postedAt = args.reconciliationStatus === 'pending' ? undefined : purchase.postedAt ?? now
      const reconciledAt = args.reconciliationStatus === 'reconciled' ? purchase.reconciledAt ?? now : undefined

      await ctx.db.patch(id, {
        reconciliationStatus: args.reconciliationStatus,
        statementMonth: args.statementMonth ?? purchase.statementMonth ?? purchase.purchaseDate.slice(0, 7),
        postedAt,
        reconciledAt,
      })
      updated += 1
      if (beforeSnapshots.length < 40) {
        const before = buildPurchaseAuditSnapshot(purchase)
        const after = {
          ...before,
          reconciliationStatus: args.reconciliationStatus,
          statementMonth: args.statementMonth ?? before.statementMonth,
        }
        beforeSnapshots.push({
          id: String(id),
          ...before,
        })
        afterSnapshots.push({
          id: String(id),
          ...after,
        })
      }
      if (sampleIds.length < 25) {
        sampleIds.push(String(id))
      }
    }

    if (updated > 0) {
      await recordFinanceAuditEvent(ctx, {
        userId: identity.subject,
        entityType: 'purchase',
        entityId: 'bulk',
        action: 'bulk_reconciliation_updated',
        before: beforeSnapshots,
        after: afterSnapshots,
        metadata: {
          source,
          mutationAt: now,
          updated,
          reconciliationStatus: args.reconciliationStatus,
          statementMonth: args.statementMonth ?? null,
          samplePurchaseIds: sampleIds,
        },
      })
    }

    return { updated }
  },
})

export const bulkUpdatePurchaseCategory = mutation({
  args: {
    ids: v.array(v.id('purchases')),
    category: v.string(),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    validateRequiredText(args.category, 'Category')

    let updated = 0
    const source = sanitizeMutationSource(args.source, 'bulk')
    const now = Date.now()
    const sampleIds: string[] = []
    const beforeSnapshots: Array<Record<string, unknown>> = []
    const afterSnapshots: Array<Record<string, unknown>> = []
    for (const id of args.ids) {
      const purchase = await ctx.db.get(id)
      if (!purchase || purchase.userId !== identity.subject) {
        continue
      }
      await ctx.db.patch(id, {
        category: args.category.trim(),
      })
      updated += 1
      if (beforeSnapshots.length < 40) {
        const before = buildPurchaseAuditSnapshot(purchase)
        const after = {
          ...before,
          category: args.category.trim(),
        }
        beforeSnapshots.push({
          id: String(id),
          ...before,
        })
        afterSnapshots.push({
          id: String(id),
          ...after,
        })
      }
      if (sampleIds.length < 25) {
        sampleIds.push(String(id))
      }
    }

    if (updated > 0) {
      await recordFinanceAuditEvent(ctx, {
        userId: identity.subject,
        entityType: 'purchase',
        entityId: 'bulk',
        action: 'bulk_category_updated',
        before: beforeSnapshots,
        after: afterSnapshots,
        metadata: {
          source,
          mutationAt: now,
          updated,
          category: args.category.trim(),
          samplePurchaseIds: sampleIds,
        },
      })
    }

    return { updated }
  },
})

export const bulkDeletePurchases = mutation({
  args: {
    ids: v.array(v.id('purchases')),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    let deleted = 0
    const source = sanitizeMutationSource(args.source, 'bulk')
    const now = Date.now()
    const deletedSample: Array<{ id: string; item: string; amount: number; purchaseDate: string }> = []
    const beforeSnapshots: Array<Record<string, unknown>> = []
    const afterSnapshots: Array<Record<string, unknown>> = []

    for (const id of args.ids) {
      const purchase = await ctx.db.get(id)
      if (!purchase || purchase.userId !== identity.subject) {
        continue
      }

      const splits = await ctx.db
        .query('purchaseSplits')
        .withIndex('by_purchaseId', (q) => q.eq('purchaseId', id))
        .collect()

      await Promise.all(splits.map((split) => ctx.db.delete(split._id)))
      await ctx.db.delete(id)
      deleted += 1
      if (beforeSnapshots.length < 40) {
        const before = buildPurchaseAuditSnapshot(purchase)
        beforeSnapshots.push({
          id: String(id),
          ...before,
        })
        afterSnapshots.push({
          id: String(id),
          removed: true,
        })
      }
      if (deletedSample.length < 25) {
        deletedSample.push({
          id: String(id),
          item: purchase.item,
          amount: purchase.amount,
          purchaseDate: purchase.purchaseDate,
        })
      }
    }

    if (deleted > 0) {
      await recordFinanceAuditEvent(ctx, {
        userId: identity.subject,
        entityType: 'purchase',
        entityId: 'bulk',
        action: 'bulk_removed',
        before: beforeSnapshots,
        after: afterSnapshots,
        metadata: {
          source,
          mutationAt: now,
          deleted,
          samplePurchases: deletedSample,
        },
      })
    }

    return { deleted }
  },
})

export const bulkApplyTransactionRule = mutation({
  args: {
    ids: v.array(v.id('purchases')),
    ruleId: v.id('transactionRules'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const rule = await ctx.db.get(args.ruleId)
    if (!rule || rule.userId !== identity.subject) {
      throw new Error('Rule not found.')
    }

    let updated = 0
    for (const id of args.ids) {
      const purchase = await ctx.db.get(id)
      if (!purchase || purchase.userId !== identity.subject) {
        continue
      }

      if (!ruleMatchesPurchase(rule, purchase.item)) {
        continue
      }

      await ctx.db.patch(id, {
        category: rule.category,
        reconciliationStatus: rule.reconciliationStatus ?? purchase.reconciliationStatus ?? 'posted',
        fundingSourceType: rule.fundingSourceType ?? purchase.fundingSourceType ?? 'unassigned',
        fundingSourceId:
          (rule.fundingSourceType ?? purchase.fundingSourceType ?? 'unassigned') === 'unassigned'
            ? undefined
            : rule.fundingSourceId ?? purchase.fundingSourceId,
      })
      updated += 1
    }

    return { updated }
  },
})
