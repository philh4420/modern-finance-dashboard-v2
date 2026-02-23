import type {
  AccountReconciliationCheckEntry,
  AccountEntry,
  AccountTransferEntry,
  BillCategory,
  BillEntry,
  BillScope,
  CardMinimumPaymentType,
  CardEntry,
  CycleAuditLogEntry,
  EnvelopeBudgetEntry,
  FinanceAuditEventEntry,
  FinancePreference,
  ForecastWindow,
  GoalEntry,
  GoalEventEntry,
  GoalWithMetrics,
  IncomeEntry,
  IncomeChangeDirection,
  IncomeChangeEventEntry,
  IncomePaymentCheckEntry,
  IncomePaymentStatus,
  KpiSnapshot,
  LoanEntry,
  LoanEventEntry,
  MonthCloseSnapshotEntry,
  MonthlyCycleRunEntry,
  PlanningActionTaskEntry,
  PlanningMonthVersionEntry,
  PurchaseEntry,
  PurchaseMonthCloseRunEntry,
  Summary,
} from './financeTypes'
import type { PrintReportConfig } from './PrintReportModal'
import {
  computeIncomeDeductionsTotal,
  resolveIncomeGrossAmount,
  resolveIncomeNetAmount,
  toMonthlyAmount,
} from '../lib/incomeMath'
import { nextDateForCadence, toIsoDate } from '../lib/cadenceDates'
import { buildLoanPortfolioProjection, buildLoanStrategy } from '../lib/loanIntelligence'

type PrintReportProps = {
  config: PrintReportConfig
  preference: FinancePreference
  summary: Summary
  kpis: KpiSnapshot | null
  monthCloseSnapshots: MonthCloseSnapshotEntry[]
  incomes: IncomeEntry[]
  incomeChangeEvents: IncomeChangeEventEntry[]
  incomePaymentChecks: IncomePaymentCheckEntry[]
  bills: BillEntry[]
  cards: CardEntry[]
  loans: LoanEntry[]
  loanEvents: LoanEventEntry[]
  accounts: AccountEntry[]
  accountTransfers: AccountTransferEntry[]
  accountReconciliationChecks: AccountReconciliationCheckEntry[]
  goals: GoalEntry[]
  goalEvents: GoalEventEntry[]
  goalsWithMetrics: GoalWithMetrics[]
  purchases: PurchaseEntry[]
  envelopeBudgets: EnvelopeBudgetEntry[]
  planningMonthVersions: PlanningMonthVersionEntry[]
  planningActionTasks: PlanningActionTaskEntry[]
  planningForecastWindows: ForecastWindow[]
  cycleAuditLogs: CycleAuditLogEntry[]
  monthlyCycleRuns: MonthlyCycleRunEntry[]
  purchaseMonthCloseRuns: PurchaseMonthCloseRunEntry[]
  financeAuditEvents: FinanceAuditEventEntry[]
  formatMoney: (value: number) => string
  cycleDateLabel: Intl.DateTimeFormat
}

const normalizeText = (value: string) => value.trim().toLowerCase()

const isGenericCategory = (value: string) => {
  const normalized = normalizeText(value)
  return normalized.length === 0 || normalized === 'uncategorized' || normalized === 'other' || normalized === 'misc'
}

const monthKeyFromPurchase = (purchase: PurchaseEntry) => {
  if (typeof purchase.purchaseDate === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(purchase.purchaseDate)) {
      return purchase.purchaseDate.slice(0, 7)
    }
    if (/^\d{4}-\d{2}$/.test(purchase.purchaseDate)) {
      return purchase.purchaseDate
    }
  }
  if (purchase.statementMonth && /^\d{4}-\d{2}$/.test(purchase.statementMonth)) {
    return purchase.statementMonth
  }
  return new Date(purchase.createdAt).toISOString().slice(0, 7)
}

const inMonthRange = (monthKey: string, startMonth: string, endMonth: string) =>
  monthKey >= startMonth && monthKey <= endMonth

const formatMonthLabel = (locale: string, monthKey: string) =>
  new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(`${monthKey}-01T00:00:00`))

const monthKeyFromTimestamp = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 7)

const parseAuditJson = <T,>(value?: string): T | undefined => {
  if (!value) return undefined
  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
  }
}

const resolveAuditSourceLabel = (event: FinanceAuditEventEntry) => {
  const metadata = parseAuditJson<Record<string, unknown>>(event.metadataJson)
  return typeof metadata?.source === 'string' && metadata.source.trim().length > 0 ? metadata.source.trim() : 'manual'
}

const resolveAuditActorLabel = (event: FinanceAuditEventEntry) => {
  const metadata = parseAuditJson<Record<string, unknown>>(event.metadataJson)
  const actorUserId =
    typeof metadata?.actorUserId === 'string' && metadata.actorUserId.trim().length > 0
      ? metadata.actorUserId.trim()
      : event.userId
  return actorUserId ? `self:${actorUserId.slice(0, 8)}` : 'self'
}

const summarizeReconciliationAuditTransition = (event: FinanceAuditEventEntry) => {
  const before = parseAuditJson<Record<string, unknown>>(event.beforeJson)
  const after = parseAuditJson<Record<string, unknown>>(event.afterJson)
  const metadata = parseAuditJson<Record<string, unknown>>(event.metadataJson)

  const segments: string[] = []
  const beforeStatus = typeof before?.reconciliationStatus === 'string' ? before.reconciliationStatus : null
  const afterStatus = typeof after?.reconciliationStatus === 'string' ? after.reconciliationStatus : null
  if (beforeStatus && afterStatus && beforeStatus !== afterStatus) {
    segments.push(`status ${beforeStatus} -> ${afterStatus}`)
  }

  const beforeCategory = typeof before?.category === 'string' ? before.category : null
  const afterCategory = typeof after?.category === 'string' ? after.category : null
  if (beforeCategory && afterCategory && beforeCategory !== afterCategory) {
    segments.push(`category ${beforeCategory} -> ${afterCategory}`)
  }

  const beforeAmount = typeof before?.amount === 'number' ? before.amount : null
  const afterAmount = typeof after?.amount === 'number' ? after.amount : null
  if (beforeAmount !== null && afterAmount !== null && Math.abs(beforeAmount - afterAmount) > 0.009) {
    segments.push(`amount ${beforeAmount.toFixed(2)} -> ${afterAmount.toFixed(2)}`)
  }

  if (segments.length > 0) {
    return segments.join(' · ')
  }

  if (event.entityType === 'purchase_month_close') {
    const summary = parseAuditJson<Record<string, unknown>>(
      typeof metadata?.summaryJson === 'string' ? metadata.summaryJson : undefined,
    )
    const pendingCount = typeof summary?.pendingCount === 'number' ? summary.pendingCount : null
    const duplicateCount = typeof summary?.duplicateCount === 'number' ? summary.duplicateCount : null
    const anomalyCount = typeof summary?.anomalyCount === 'number' ? summary.anomalyCount : null
    if (pendingCount !== null || duplicateCount !== null || anomalyCount !== null) {
      return `pending ${pendingCount ?? 0} · duplicates ${duplicateCount ?? 0} · anomalies ${anomalyCount ?? 0}`
    }
  }

  return 'state updated'
}

const formatPercent = (value: number) => `${Math.round(value * 100)}%`

const sumBy = <T,>(values: T[], selector: (value: T) => number) =>
  values.reduce((sum, entry) => sum + selector(entry), 0)

const monthsBetweenInclusive = (startMonth: string, endMonth: string) => {
  const [sy, sm] = startMonth.split('-').map((part) => Number(part))
  const [ey, em] = endMonth.split('-').map((part) => Number(part))
  if (!Number.isFinite(sy) || !Number.isFinite(sm) || !Number.isFinite(ey) || !Number.isFinite(em)) return 1
  return (ey - sy) * 12 + (em - sm) + 1
}

const billCategoryLabelMap: Record<BillCategory, string> = {
  housing: 'Housing',
  utilities: 'Utilities',
  council_tax: 'Council Tax',
  insurance: 'Insurance',
  transport: 'Transport',
  health: 'Health',
  debt: 'Debt',
  subscriptions: 'Subscriptions',
  education: 'Education',
  childcare: 'Childcare',
  other: 'Other',
}

const billScopeLabelMap: Record<BillScope, string> = {
  shared: 'Shared / household',
  personal: 'Personal',
}

const planningVersionSortOrder: Record<string, number> = {
  base: 0,
  conservative: 1,
  aggressive: 2,
}

const resolveBillCategory = (bill: BillEntry): BillCategory => (bill.category as BillCategory | undefined) ?? 'other'
const resolveBillScope = (bill: BillEntry): BillScope => (bill.scope === 'personal' ? 'personal' : 'shared')

const loanEventTypeLabel = (eventType: LoanEventEntry['eventType']) => {
  if (eventType === 'interest_accrual') return 'Interest'
  if (eventType === 'subscription_fee') return 'Subscription'
  if (eventType === 'charge') return 'Charge'
  return 'Payment'
}

const goalEventTypeLabel = (eventType: GoalEventEntry['eventType']) => {
  if (eventType === 'target_changed') return 'Target changed'
  if (eventType === 'schedule_changed') return 'Schedule changed'
  if (eventType === 'progress_adjustment') return 'Progress adjusted'
  return eventType.replace(/_/g, ' ')
}

const cadenceLabelForPrint = (
  cadence: IncomeEntry['cadence'],
  customInterval?: number,
  customUnit?: IncomeEntry['customUnit'],
) => {
  if (cadence !== 'custom') {
    if (cadence === 'one_time') return 'One time'
    return cadence.charAt(0).toUpperCase() + cadence.slice(1)
  }
  if (!customInterval || !customUnit) return 'Custom'
  return `Every ${customInterval} ${customUnit}`
}

type CardProjectionRow = {
  monthIndex: number
  startBalance: number
  interest: number
  minimumDue: number
  plannedPayment: number
  plannedSpend: number
  endingBalance: number
  endingUtilization: number
}

type CardReportRow = {
  id: string
  name: string
  limit: number
  currentInput: number
  statementInput: number
  pendingCharges: number
  minimumPaymentType: CardMinimumPaymentType
  minimumPayment: number
  minimumPaymentPercent: number
  extraPayment: number
  plannedSpend: number
  apr: number
  statementDay: number
  dueDay: number
  dueInDays: number
  dueApplied: boolean
  interestAmount: number
  newStatementBalance: number
  minimumDue: number
  plannedPayment: number
  dueAdjustedCurrent: number
  displayCurrentBalance: number
  displayAvailableCredit: number
  displayUtilization: number
  projectedUtilizationAfterPayment: number
  projectedNextMonthInterest: number
  projected12MonthInterestCost: number
  projectionRows: CardProjectionRow[]
  overLimit: boolean
  paymentBelowInterest: boolean
}

type PayoffStrategy = 'avalanche' | 'snowball'
type RiskSeverity = 'watch' | 'warning' | 'critical'

type CardRiskAlert = {
  id: string
  severity: RiskSeverity
  title: string
  detail: string
}

type PayoffCard = {
  id: string
  name: string
  balance: number
  apr: number
  monthlyInterest: number
  utilization: number
  minimumDue: number
  plannedPayment: number
}

type IncomePaymentReliabilitySummary = {
  total: number
  onTime: number
  late: number
  missed: number
  onTimeRate: number
  lateStreak: number
  missedStreak: number
  lateOrMissedStreak: number
  score: number | null
  lastStatus: IncomePaymentStatus | null
}

type IncomeStatusTag = 'confirmed' | 'pending' | 'at_risk' | 'missed'

const incomePaymentStatusLabel = (status: IncomePaymentStatus) => {
  if (status === 'on_time') return 'On time'
  if (status === 'late') return 'Late'
  return 'Missed'
}

const incomeStatusLabel = (status: IncomeStatusTag) => {
  if (status === 'confirmed') return 'Confirmed'
  if (status === 'at_risk') return 'At-risk'
  if (status === 'missed') return 'Missed'
  return 'Pending'
}

const incomeChangeDirectionLabel = (direction: IncomeChangeDirection) => {
  if (direction === 'increase') return 'Increase'
  if (direction === 'decrease') return 'Decrease'
  return 'No change'
}

const resolveIncomeStatusTag = (args: {
  currentCycleStatus: IncomePaymentStatus | null
  reliability: IncomePaymentReliabilitySummary
  hasActualPaidAmount: boolean
}): IncomeStatusTag => {
  if (args.currentCycleStatus === 'missed') return 'missed'
  if (args.currentCycleStatus === 'late') return 'at_risk'
  if (args.currentCycleStatus === 'on_time') return 'confirmed'

  if (args.reliability.missedStreak > 0) return 'missed'
  if (args.reliability.lateOrMissedStreak > 0) return 'at_risk'
  if (args.reliability.lastStatus === 'on_time' || args.hasActualPaidAmount) return 'confirmed'
  return 'pending'
}

const calculateIncomePaymentReliability = (
  entries: IncomePaymentCheckEntry[],
): IncomePaymentReliabilitySummary => {
  if (entries.length === 0) {
    return {
      total: 0,
      onTime: 0,
      late: 0,
      missed: 0,
      onTimeRate: 0,
      lateStreak: 0,
      missedStreak: 0,
      lateOrMissedStreak: 0,
      score: null,
      lastStatus: null,
    }
  }

  const sorted = [...entries].sort((left, right) => {
    const byMonth = right.cycleMonth.localeCompare(left.cycleMonth)
    if (byMonth !== 0) return byMonth
    return right.updatedAt - left.updatedAt
  })

  const onTime = sorted.filter((entry) => entry.status === 'on_time').length
  const late = sorted.filter((entry) => entry.status === 'late').length
  const missed = sorted.filter((entry) => entry.status === 'missed').length
  const total = sorted.length
  const onTimeRate = total > 0 ? onTime / total : 0

  const streakFor = (status: IncomePaymentStatus) => {
    let streak = 0
    for (const entry of sorted) {
      if (entry.status !== status) break
      streak += 1
    }
    return streak
  }

  let lateOrMissedStreak = 0
  for (const entry of sorted) {
    if (entry.status === 'on_time') break
    lateOrMissedStreak += 1
  }

  const lateStreak = streakFor('late')
  const missedStreak = streakFor('missed')
  const score = clamp(Math.round(onTimeRate * 100 - lateOrMissedStreak * 12 - missedStreak * 6), 0, 100)

  return {
    total,
    onTime,
    late,
    missed,
    onTimeRate,
    lateStreak,
    missedStreak,
    lateOrMissedStreak,
    score,
    lastStatus: sorted[0]?.status ?? null,
  }
}

const roundCurrency = (value: number) => Math.round(value * 100) / 100
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const toNonNegativeNumber = (value: number | undefined | null) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(value, 0) : 0

const toDayOfMonth = (value: number | undefined | null, fallback: number) => {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 31) {
    return value
  }
  return fallback
}

const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 86400000)

const dueTimingForDay = (dueDay: number) => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const daysInThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dueThisMonth = new Date(now.getFullYear(), now.getMonth(), Math.min(dueDay, daysInThisMonth))
  const dueApplied = dueThisMonth <= today

  if (!dueApplied) {
    return {
      dueApplied: false,
      dueInDays: daysBetween(today, dueThisMonth),
    }
  }

  const daysInNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate()
  const nextDueDate = new Date(now.getFullYear(), now.getMonth() + 1, Math.min(dueDay, daysInNextMonth))
  return {
    dueApplied: true,
    dueInDays: daysBetween(today, nextDueDate),
  }
}

const utilizationFor = (used: number, limit: number) => (limit > 0 ? used / limit : 0)
const clampPercent = (value: number) => clamp(value, 0, 100)

const normalizeCardMinimumPaymentType = (
  value: CardMinimumPaymentType | undefined | null,
): CardMinimumPaymentType => (value === 'percent_plus_interest' ? 'percent_plus_interest' : 'fixed')

const describeMinimumConfig = (card: CardReportRow) =>
  card.minimumPaymentType === 'percent_plus_interest'
    ? `${card.minimumPaymentPercent.toFixed(2)}% + interest`
    : `Fixed ${card.minimumPayment.toFixed(2)}`

const formatDueCountdown = (days: number) => (days <= 0 ? 'Due today' : `Due in ${days} day${days === 1 ? '' : 's'}`)

const utilizationSeverityFor = (utilization: number): RiskSeverity | null => {
  if (utilization >= 0.9) return 'critical'
  if (utilization >= 0.5) return 'warning'
  if (utilization >= 0.3) return 'watch'
  return null
}

const getOverpayPriority = (entry: PayoffCard, strategy: PayoffStrategy) =>
  strategy === 'avalanche' ? entry.apr : -entry.balance

const rankPayoffCards = (rows: PayoffCard[], strategy: PayoffStrategy) =>
  [...rows].sort((left, right) => {
    if (strategy === 'avalanche') {
      if (right.apr !== left.apr) {
        return right.apr - left.apr
      }
      if (right.monthlyInterest !== left.monthlyInterest) {
        return right.monthlyInterest - left.monthlyInterest
      }
      if (right.balance !== left.balance) {
        return right.balance - left.balance
      }
    } else {
      if (left.balance !== right.balance) {
        return left.balance - right.balance
      }
      if (right.apr !== left.apr) {
        return right.apr - left.apr
      }
      if (right.monthlyInterest !== left.monthlyInterest) {
        return right.monthlyInterest - left.monthlyInterest
      }
    }

    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
  })

const buildCardProjectionRows = (input: {
  months: number
  startStatementBalance: number
  limit: number
  monthlyRate: number
  minimumPaymentType: CardMinimumPaymentType
  minimumPayment: number
  minimumPaymentPercent: number
  extraPayment: number
  plannedSpend: number
}) => {
  const rows: CardProjectionRow[] = []
  let statementBalance = Math.max(input.startStatementBalance, 0)

  for (let monthIndex = 1; monthIndex <= input.months; monthIndex += 1) {
    const interest = statementBalance * input.monthlyRate
    const dueBalance = statementBalance + interest
    const minimumDueRaw =
      input.minimumPaymentType === 'percent_plus_interest'
        ? statementBalance * (input.minimumPaymentPercent / 100) + interest
        : input.minimumPayment
    const minimumDue = Math.min(dueBalance, Math.max(minimumDueRaw, 0))
    const plannedPayment = Math.min(dueBalance, minimumDue + input.extraPayment)
    const endingBalance = Math.max(dueBalance - plannedPayment, 0) + input.plannedSpend

    rows.push({
      monthIndex,
      startBalance: roundCurrency(statementBalance),
      interest: roundCurrency(interest),
      minimumDue: roundCurrency(minimumDue),
      plannedPayment: roundCurrency(plannedPayment),
      plannedSpend: roundCurrency(input.plannedSpend),
      endingBalance: roundCurrency(endingBalance),
      endingUtilization: utilizationFor(endingBalance, input.limit),
    })

    statementBalance = endingBalance
  }

  return rows
}

const projectCardReportRow = (card: CardEntry): CardReportRow => {
  const limit = toNonNegativeNumber(card.creditLimit)
  const currentInput = toNonNegativeNumber(card.usedLimit)
  const statementInput = toNonNegativeNumber(card.statementBalance ?? card.usedLimit)
  const pendingCharges = toNonNegativeNumber(card.pendingCharges ?? Math.max(currentInput - statementInput, 0))
  const minimumPaymentType = normalizeCardMinimumPaymentType(card.minimumPaymentType)
  const minimumPayment = toNonNegativeNumber(card.minimumPayment)
  const minimumPaymentPercent = clampPercent(toNonNegativeNumber(card.minimumPaymentPercent))
  const extraPayment = toNonNegativeNumber(card.extraPayment)
  const plannedSpend = toNonNegativeNumber(card.spendPerMonth)
  const apr = toNonNegativeNumber(card.interestRate)
  const statementDay = toDayOfMonth(card.statementDay, 1)
  const dueDay = toDayOfMonth(card.dueDay, 21)
  const monthlyRate = apr > 0 ? apr / 100 / 12 : 0
  const interestAmount = roundCurrency(statementInput * monthlyRate)
  const newStatementBalance = roundCurrency(statementInput + interestAmount)
  const minimumDueRaw =
    minimumPaymentType === 'percent_plus_interest'
      ? statementInput * (minimumPaymentPercent / 100) + interestAmount
      : minimumPayment
  const minimumDue = roundCurrency(Math.min(newStatementBalance, Math.max(minimumDueRaw, 0)))
  const plannedPayment = roundCurrency(Math.min(newStatementBalance, minimumDue + extraPayment))
  const dueAdjustedCurrent = roundCurrency(Math.max(newStatementBalance - plannedPayment, 0) + pendingCharges)
  const projectedUtilizationAfterPayment = utilizationFor(dueAdjustedCurrent, limit)
  const dueTiming = dueTimingForDay(dueDay)
  const displayCurrentBalance = roundCurrency(dueTiming.dueApplied ? dueAdjustedCurrent : currentInput)
  const displayAvailableCredit = roundCurrency(limit - displayCurrentBalance)
  const displayUtilization = utilizationFor(displayCurrentBalance, limit)
  const projectionRows = buildCardProjectionRows({
    months: 12,
    startStatementBalance: dueAdjustedCurrent,
    limit,
    monthlyRate,
    minimumPaymentType,
    minimumPayment,
    minimumPaymentPercent,
    extraPayment,
    plannedSpend,
  })
  const projectedNextMonthInterest = projectionRows[0]?.interest ?? 0
  const projected12MonthInterestCost = roundCurrency(sumBy(projectionRows, (row) => row.interest))

  return {
    id: String(card._id),
    name: card.name,
    limit,
    currentInput,
    statementInput,
    pendingCharges,
    minimumPaymentType,
    minimumPayment,
    minimumPaymentPercent,
    extraPayment,
    plannedSpend,
    apr,
    statementDay,
    dueDay,
    dueInDays: dueTiming.dueInDays,
    dueApplied: dueTiming.dueApplied,
    interestAmount,
    newStatementBalance,
    minimumDue,
    plannedPayment,
    dueAdjustedCurrent,
    displayCurrentBalance,
    displayAvailableCredit,
    displayUtilization,
    projectedUtilizationAfterPayment,
    projectedNextMonthInterest,
    projected12MonthInterestCost,
    projectionRows,
    overLimit: displayCurrentBalance > limit + 0.000001,
    paymentBelowInterest: plannedPayment + 0.01 < interestAmount,
  }
}

export function PrintReport({
  config,
  preference,
  summary,
  kpis,
  monthCloseSnapshots,
  incomes,
  incomeChangeEvents,
  incomePaymentChecks,
  bills,
  cards,
  loans,
  loanEvents,
  accounts,
  accountTransfers,
  accountReconciliationChecks,
  goals,
  goalEvents,
  goalsWithMetrics,
  purchases,
  envelopeBudgets,
  planningMonthVersions,
  planningActionTasks,
  planningForecastWindows,
  cycleAuditLogs,
  monthlyCycleRuns,
  purchaseMonthCloseRuns,
  financeAuditEvents,
  formatMoney,
  cycleDateLabel,
}: PrintReportProps) {
  const locale = preference.locale || 'en-US'
  const generatedAt = new Date()
  const currentCycleMonth = generatedAt.toISOString().slice(0, 7)
  const rangeMonths = monthsBetweenInclusive(config.startMonth, config.endMonth)

  const purchasesInRange = purchases
    .map((purchase) => ({ purchase, monthKey: monthKeyFromPurchase(purchase) }))
    .filter((row) => inMonthRange(row.monthKey, config.startMonth, config.endMonth))

  const pendingPurchasesInRange = purchasesInRange.filter((row) => (row.purchase.reconciliationStatus ?? 'posted') === 'pending')
  const clearedPurchasesInRange = purchasesInRange.filter((row) => (row.purchase.reconciliationStatus ?? 'posted') !== 'pending')
  const purchasesTotal = sumBy(clearedPurchasesInRange, (row) => row.purchase.amount)
  const pendingPurchasesTotal = sumBy(pendingPurchasesInRange, (row) => row.purchase.amount)

  const monthGroups = new Map<string, PurchaseEntry[]>()
  purchasesInRange.forEach((row) => {
    const current = monthGroups.get(row.monthKey) ?? []
    current.push(row.purchase)
    monthGroups.set(row.monthKey, current)
  })

  const sortedMonthKeys = Array.from(monthGroups.keys()).sort()
  const snapshotsInRange = monthCloseSnapshots
    .filter((snapshot) => inMonthRange(snapshot.cycleKey, config.startMonth, config.endMonth))
    .sort((a, b) => a.cycleKey.localeCompare(b.cycleKey))

  const rangeKpis = (() => {
    if (purchasesInRange.length === 0) {
      return {
        purchaseCount: 0,
        pendingCount: 0,
        missingCategoryCount: 0,
        duplicateCount: 0,
        anomalyCount: 0,
        reconciliationCompletionRate: 1,
      }
    }

    const purchaseCount = purchasesInRange.length
    const pendingCount = purchasesInRange.filter((row) => (row.purchase.reconciliationStatus ?? 'posted') === 'pending').length
    const missingCategoryCount = purchasesInRange.filter((row) => isGenericCategory(row.purchase.category)).length

    const duplicateMap = new Map<string, number>()
    purchasesInRange.forEach((row) => {
      const purchase = row.purchase
      const key = `${normalizeText(purchase.item)}::${Math.round(purchase.amount * 100) / 100}::${purchase.purchaseDate}`
      duplicateMap.set(key, (duplicateMap.get(key) ?? 0) + 1)
    })
    const duplicateCount = Array.from(duplicateMap.values()).filter((count) => count > 1).length

    const amounts = purchasesInRange.map((row) => row.purchase.amount)
    const mean = amounts.reduce((sum, value) => sum + value, 0) / Math.max(amounts.length, 1)
    const variance =
      amounts.length > 1
        ? amounts.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (amounts.length - 1)
        : 0
    const std = Math.sqrt(variance)
    const anomalyCount = purchasesInRange.filter((row) => std > 0 && row.purchase.amount > mean + std * 2.5 && row.purchase.amount > 50).length

    const postedOrReconciled = purchasesInRange.filter((row) => (row.purchase.reconciliationStatus ?? 'posted') !== 'pending')
    const reconciled = postedOrReconciled.filter((row) => (row.purchase.reconciliationStatus ?? 'posted') === 'reconciled').length
    const reconciliationCompletionRate = postedOrReconciled.length > 0 ? reconciled / postedOrReconciled.length : 1

    return {
      purchaseCount,
      pendingCount,
      missingCategoryCount,
      duplicateCount,
      anomalyCount,
      reconciliationCompletionRate,
    }
  })()

  const purchasesByStatus = {
    pending: purchasesInRange.filter((row) => (row.purchase.reconciliationStatus ?? 'posted') === 'pending').length,
    posted: purchasesInRange.filter((row) => (row.purchase.reconciliationStatus ?? 'posted') === 'posted').length,
    reconciled: purchasesInRange.filter((row) => (row.purchase.reconciliationStatus ?? 'posted') === 'reconciled').length,
  }

  const categoryTotals = new Map<string, number>()
  clearedPurchasesInRange.forEach((row) => {
    const key = row.purchase.category.trim() || 'Uncategorized'
    categoryTotals.set(key, (categoryTotals.get(key) ?? 0) + row.purchase.amount)
  })

  const avgMonthlyPurchases = rangeMonths > 0 ? roundCurrency(purchasesTotal / rangeMonths) : 0
  const planningAssumptionsRows = planningMonthVersions
    .filter((entry) => inMonthRange(entry.month, config.startMonth, config.endMonth))
    .sort((left, right) => {
      if (left.month !== right.month) {
        return left.month.localeCompare(right.month)
      }
      return (planningVersionSortOrder[left.versionKey] ?? 99) - (planningVersionSortOrder[right.versionKey] ?? 99)
    })
    .map((entry) => ({
      id: String(entry._id),
      month: entry.month,
      versionKey: entry.versionKey,
      expectedIncome: entry.expectedIncome,
      fixedCommitments: entry.fixedCommitments,
      variableSpendingCap: entry.variableSpendingCap,
      plannedNet: roundCurrency(entry.expectedIncome - entry.fixedCommitments - entry.variableSpendingCap),
      notes: entry.notes ?? '',
      selected: entry.isSelected,
    }))
  const planningForecastRows = [...planningForecastWindows].sort((left, right) => left.days - right.days)
  const plannedCategoryTotals = new Map<string, number>()
  envelopeBudgets
    .filter((entry) => inMonthRange(entry.month, config.startMonth, config.endMonth))
    .forEach((entry) => {
      const key = entry.category.trim() || 'Uncategorized'
      const total = entry.targetAmount + (entry.carryoverAmount ?? 0)
      plannedCategoryTotals.set(key, roundCurrency((plannedCategoryTotals.get(key) ?? 0) + total))
    })
  const planningVarianceRows = Array.from(new Set([...plannedCategoryTotals.keys(), ...categoryTotals.keys()]))
    .map((category) => {
      const planned = roundCurrency(plannedCategoryTotals.get(category) ?? 0)
      const actual = roundCurrency(categoryTotals.get(category) ?? 0)
      const variance = roundCurrency(actual - planned)
      const varianceRatePercent = planned > 0 ? roundCurrency((variance / planned) * 100) : actual > 0 ? 100 : 0
      return {
        id: category,
        category,
        planned,
        actual,
        variance,
        varianceRatePercent,
      }
    })
    .sort((left, right) => Math.abs(right.variance) - Math.abs(left.variance))
  const planningTasksInRange = planningActionTasks
    .filter((task) => inMonthRange(task.month, config.startMonth, config.endMonth))
    .sort((left, right) => {
      if (left.month !== right.month) {
        return left.month.localeCompare(right.month)
      }
      return left.createdAt - right.createdAt
    })
  const planningTasksDone = planningTasksInRange.filter((task) => task.status === 'done').length
  const planningTaskCompletionPercent =
    planningTasksInRange.length > 0 ? roundCurrency((planningTasksDone / planningTasksInRange.length) * 100) : 0
  const planningAuditRows = financeAuditEvents
    .filter((event) => event.entityType.startsWith('planning_'))
    .filter((event) => inMonthRange(monthKeyFromTimestamp(event.createdAt), config.startMonth, config.endMonth))
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 80)
  const goalMetricsRows = (goalsWithMetrics.length > 0 ? goalsWithMetrics : goals).map((goal) => {
    const targetAmount = goal.targetAmount
    const currentAmount = goal.currentAmount
    const remaining = 'remaining' in goal && typeof goal.remaining === 'number' ? goal.remaining : Math.max(targetAmount - currentAmount, 0)
    const progressPercent =
      'progressPercent' in goal && typeof goal.progressPercent === 'number'
        ? goal.progressPercent
        : targetAmount > 0
          ? (currentAmount / targetAmount) * 100
          : 0
    const goalHealthScore =
      'goalHealthScore' in goal && typeof goal.goalHealthScore === 'number' ? goal.goalHealthScore : null
    const plannedMonthlyContribution =
      'plannedMonthlyContribution' in goal && typeof goal.plannedMonthlyContribution === 'number'
        ? goal.plannedMonthlyContribution
        : 0
    const requiredMonthlyContribution =
      'requiredMonthlyContribution' in goal && typeof goal.requiredMonthlyContribution === 'number'
        ? goal.requiredMonthlyContribution
        : 0
    const predictedCompletionDate =
      'predictedCompletionDate' in goal && typeof goal.predictedCompletionDate === 'string' ? goal.predictedCompletionDate : undefined
    const predictedDaysDeltaToTarget =
      'predictedDaysDeltaToTarget' in goal && typeof goal.predictedDaysDeltaToTarget === 'number'
        ? goal.predictedDaysDeltaToTarget
        : undefined
    const milestones =
      'milestones' in goal && Array.isArray(goal.milestones)
        ? goal.milestones
        : []
    const pausedValue = 'pausedValue' in goal ? goal.pausedValue === true : goal.paused === true
    const pauseReasonValue =
      'pauseReasonValue' in goal && typeof goal.pauseReasonValue === 'string'
        ? goal.pauseReasonValue
        : typeof goal.pauseReason === 'string'
          ? goal.pauseReason
          : undefined
    const cadenceValue =
      'cadenceValue' in goal && typeof goal.cadenceValue === 'string'
        ? goal.cadenceValue
        : (goal.cadence ?? 'monthly')
    const customIntervalValue =
      'customIntervalValue' in goal && typeof goal.customIntervalValue === 'number'
        ? goal.customIntervalValue
        : goal.customInterval
    const customUnitValue =
      'customUnitValue' in goal && typeof goal.customUnitValue === 'string'
        ? goal.customUnitValue
        : goal.customUnit
    const goalTypeValue =
      'goalTypeValue' in goal && typeof goal.goalTypeValue === 'string'
        ? goal.goalTypeValue
        : (goal.goalType ?? 'sinking_fund')

    return {
      ...goal,
      remaining: roundCurrency(remaining),
      progressPercent,
      goalHealthScore,
      plannedMonthlyContribution,
      requiredMonthlyContribution,
      predictedCompletionDate,
      predictedDaysDeltaToTarget,
      milestones,
      pausedValue,
      pauseReasonValue,
      cadenceValue,
      customIntervalValue,
      customUnitValue,
      goalTypeValue,
    }
  })
  const goalNameById = goalMetricsRows.reduce((map, goal) => {
    map.set(String(goal._id), goal.title)
    return map
  }, new Map<string, string>())
  const goalEventsInRange = [...goalEvents]
    .filter((event) => inMonthRange(monthKeyFromTimestamp(typeof event.occurredAt === 'number' ? event.occurredAt : event.createdAt), config.startMonth, config.endMonth))
    .sort((left, right) => (typeof right.occurredAt === 'number' ? right.occurredAt : right.createdAt) - (typeof left.occurredAt === 'number' ? left.occurredAt : left.createdAt))
  const goalContributionEventsInRange = goalEventsInRange.filter((event) => event.eventType === 'contribution')
  const goalContributionsByGoalId = goalContributionEventsInRange.reduce((map, event) => {
    const key = String(event.goalId)
    const current = map.get(key) ?? { amount: 0, count: 0 }
    current.amount += typeof event.amountDelta === 'number' ? event.amountDelta : 0
    current.count += 1
    map.set(key, current)
    return map
  }, new Map<string, { amount: number; count: number }>())
  const goalHealthAverage =
    goalMetricsRows.filter((goal) => typeof goal.goalHealthScore === 'number').length > 0
      ? roundCurrency(
          goalMetricsRows
            .filter((goal) => typeof goal.goalHealthScore === 'number')
            .reduce((sum, goal) => sum + (goal.goalHealthScore ?? 0), 0) /
            Math.max(goalMetricsRows.filter((goal) => typeof goal.goalHealthScore === 'number').length, 1),
        )
      : null
  const goalAtRiskCount = goalMetricsRows.filter(
    (goal) =>
      goal.progressPercent < 100 &&
      ((typeof goal.goalHealthScore === 'number' && goal.goalHealthScore < 55) ||
        (typeof goal.predictedDaysDeltaToTarget === 'number' && goal.predictedDaysDeltaToTarget > 0)),
  ).length
  const goalContributionTotalInRange = roundCurrency(
    goalContributionEventsInRange.reduce((sum, event) => sum + (typeof event.amountDelta === 'number' ? event.amountDelta : 0), 0),
  )
  const currentYear = generatedAt.getFullYear()
  const currentYearStart = new Date(currentYear, 0, 1).getTime()
  const nextYearStart = new Date(currentYear + 1, 0, 1).getTime()
  const goalEventsThisYear = goalEvents.filter((event) => {
    const ts = typeof event.occurredAt === 'number' ? event.occurredAt : event.createdAt
    return ts >= currentYearStart && ts < nextYearStart
  })
  const annualGoalReviewRows = goalMetricsRows
    .map((goal) => {
      const yearEvents = goalEventsThisYear.filter((event) => String(event.goalId) === String(goal._id))
      const netDelta = roundCurrency(yearEvents.reduce((sum, event) => sum + (typeof event.amountDelta === 'number' ? event.amountDelta : 0), 0))
      const startAmount = roundCurrency(Math.max(goal.currentAmount - netDelta, 0))
      const endAmount = roundCurrency(goal.currentAmount)
      const contributionAmount = roundCurrency(
        yearEvents.reduce(
          (sum, event) => sum + (event.eventType === 'contribution' ? (typeof event.amountDelta === 'number' ? event.amountDelta : 0) : 0),
          0,
        ),
      )
      return {
        id: String(goal._id),
        title: goal.title,
        startAmount,
        endAmount,
        progressDelta: roundCurrency(endAmount - startAmount),
        contributionAmount,
        eventCount: yearEvents.length,
      }
    })
    .sort((left, right) => right.progressDelta - left.progressDelta)
  const annualGoalReviewSummary = {
    year: currentYear,
    startTotal: roundCurrency(annualGoalReviewRows.reduce((sum, row) => sum + row.startAmount, 0)),
    endTotal: roundCurrency(annualGoalReviewRows.reduce((sum, row) => sum + row.endAmount, 0)),
    progressDeltaTotal: roundCurrency(annualGoalReviewRows.reduce((sum, row) => sum + row.progressDelta, 0)),
    contributionTotal: roundCurrency(annualGoalReviewRows.reduce((sum, row) => sum + row.contributionAmount, 0)),
    eventCount: goalEventsThisYear.length,
  }
  const incomePaymentChecksByIncomeId = incomePaymentChecks.reduce((map, entry) => {
    const key = String(entry.incomeId)
    const current = map.get(key) ?? []
    current.push(entry)
    map.set(key, current)
    return map
  }, new Map<string, IncomePaymentCheckEntry[]>())
  const accountNameById = accounts.reduce((map, account) => {
    map.set(String(account._id), account.name)
    return map
  }, new Map<string, string>())
  const transferRowsInRange = accountTransfers
    .filter((entry) => {
      const transferMonth = /^\d{4}-\d{2}/.test(entry.transferDate)
        ? entry.transferDate.slice(0, 7)
        : monthKeyFromTimestamp(entry.createdAt)
      return inMonthRange(transferMonth, config.startMonth, config.endMonth)
    })
    .sort((left, right) => {
      if (left.transferDate !== right.transferDate) {
        return left.transferDate.localeCompare(right.transferDate)
      }
      return left.createdAt - right.createdAt
    })
  const reconciliationRowsInRange = accountReconciliationChecks
    .filter((entry) =>
      inMonthRange(
        /^\d{4}-\d{2}$/.test(entry.cycleMonth) ? entry.cycleMonth : monthKeyFromTimestamp(entry.updatedAt ?? entry.createdAt),
        config.startMonth,
        config.endMonth,
      ),
    )
    .sort((left, right) => {
      if (left.cycleMonth !== right.cycleMonth) {
        return left.cycleMonth.localeCompare(right.cycleMonth)
      }
      return (left.updatedAt ?? left.createdAt) - (right.updatedAt ?? right.createdAt)
    })

  const accountReportRows = accounts
    .map((account) => {
      const accountId = String(account._id)
      const available = roundCurrency(account.balance)
      const hasLedger = typeof account.ledgerBalance === 'number' && Number.isFinite(account.ledgerBalance)
      const hasPending = typeof account.pendingBalance === 'number' && Number.isFinite(account.pendingBalance)
      const pending = hasPending
        ? roundCurrency(account.pendingBalance ?? 0)
        : roundCurrency(available - (hasLedger ? (account.ledgerBalance ?? available) : available))
      const ledger = hasLedger ? roundCurrency(account.ledgerBalance ?? available) : roundCurrency(available - pending)

      const accountTransfersAsSource = transferRowsInRange.filter((entry) => String(entry.sourceAccountId) === accountId)
      const accountTransfersAsDestination = transferRowsInRange.filter((entry) => String(entry.destinationAccountId) === accountId)
      const transferOut = roundCurrency(sumBy(accountTransfersAsSource, (entry) => entry.amount))
      const transferIn = roundCurrency(sumBy(accountTransfersAsDestination, (entry) => entry.amount))
      const transferNet = roundCurrency(transferIn - transferOut)
      const accountReconciliations = reconciliationRowsInRange.filter((entry) => String(entry.accountId) === accountId)
      const firstReconciliation = accountReconciliations[0]
      const lastReconciliation = accountReconciliations[accountReconciliations.length - 1]
      const openingBalance = roundCurrency(
        firstReconciliation ? firstReconciliation.statementStartBalance : ledger - transferNet,
      )
      const closingBalance = roundCurrency(lastReconciliation ? lastReconciliation.statementEndBalance : ledger)
      const reconciledCount = accountReconciliations.filter((entry) => entry.reconciled).length
      const pendingCount = accountReconciliations.length - reconciledCount
      const unmatchedDeltaAbs = roundCurrency(sumBy(accountReconciliations, (entry) => Math.abs(entry.unmatchedDelta)))

      return {
        id: accountId,
        name: account.name,
        type: account.type,
        liquid: account.liquid,
        available,
        ledger,
        pending,
        openingBalance,
        closingBalance,
        transferIn,
        transferOut,
        transferNet,
        transferCountIn: accountTransfersAsDestination.length,
        transferCountOut: accountTransfersAsSource.length,
        reconciliationChecks: accountReconciliations.length,
        reconciledCount,
        pendingCount,
        unmatchedDeltaAbs,
        latestCycle: lastReconciliation?.cycleMonth ?? null,
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))

  const accountRangeTotals = accountReportRows.reduce(
    (totals, row) => {
      totals.opening += row.openingBalance
      totals.closing += row.closingBalance
      totals.available += row.available
      totals.ledger += row.ledger
      totals.pending += row.pending
      totals.transferIn += row.transferIn
      totals.transferOut += row.transferOut
      totals.transferNet += row.transferNet
      totals.transferCount += row.transferCountIn + row.transferCountOut
      totals.reconciliationChecks += row.reconciliationChecks
      totals.reconciled += row.reconciledCount
      totals.pendingReconciled += row.pendingCount
      totals.unmatchedDeltaAbs += row.unmatchedDeltaAbs
      return totals
    },
    {
      opening: 0,
      closing: 0,
      available: 0,
      ledger: 0,
      pending: 0,
      transferIn: 0,
      transferOut: 0,
      transferNet: 0,
      transferCount: 0,
      reconciliationChecks: 0,
      reconciled: 0,
      pendingReconciled: 0,
      unmatchedDeltaAbs: 0,
    },
  )
  const accountReconciliationCompletionRate =
    accountRangeTotals.reconciliationChecks > 0
      ? accountRangeTotals.reconciled / accountRangeTotals.reconciliationChecks
      : 1
  const overallIncomePaymentReliability = calculateIncomePaymentReliability(incomePaymentChecks)
  const incomeExpectations = incomes.reduce(
    (totals, income) => {
      const plannedNet = resolveIncomeNetAmount(income)
      const plannedMonthly = toMonthlyAmount(plannedNet, income.cadence, income.customInterval, income.customUnit)
      totals.plannedMonthly += plannedMonthly

      if (typeof income.actualAmount === 'number' && Number.isFinite(income.actualAmount)) {
        totals.trackedCount += 1
        totals.expectedTrackedMonthly += plannedMonthly
        totals.actualTrackedMonthly += toMonthlyAmount(
          Math.max(income.actualAmount, 0),
          income.cadence,
          income.customInterval,
          income.customUnit,
        )
      }

      return totals
    },
    { plannedMonthly: 0, expectedTrackedMonthly: 0, actualTrackedMonthly: 0, trackedCount: 0 },
  )
  const incomeVarianceMonthly = roundCurrency(
    incomeExpectations.actualTrackedMonthly - incomeExpectations.expectedTrackedMonthly,
  )
  const incomePendingCount = Math.max(incomes.length - incomeExpectations.trackedCount, 0)
  const incomeNameById = incomes.reduce((map, income) => {
    map.set(String(income._id), income.source)
    return map
  }, new Map<string, string>())
  const incomeChangeEventsInRange = [...incomeChangeEvents]
    .filter((event) => {
      if (/^\d{4}-\d{2}/.test(event.effectiveDate)) {
        return inMonthRange(event.effectiveDate.slice(0, 7), config.startMonth, config.endMonth)
      }
      return true
    })
    .sort((left, right) => {
      const byDate = right.effectiveDate.localeCompare(left.effectiveDate)
      if (byDate !== 0) return byDate
      return right.createdAt - left.createdAt
    })
  const incomeChangeSummary = incomeChangeEventsInRange.reduce(
    (totals, event) => {
      if (event.direction === 'increase') totals.increase += 1
      if (event.direction === 'decrease') totals.decrease += 1
      if (event.direction === 'no_change') totals.noChange += 1
      totals.netDelta += event.deltaAmount
      return totals
    },
    { increase: 0, decrease: 0, noChange: 0, netDelta: 0 },
  )

  const filteredAuditLogs = config.includeAuditLogs
    ? {
        cycleAuditLogs: cycleAuditLogs
          .filter((entry) => (entry.cycleKey ? inMonthRange(entry.cycleKey, config.startMonth, config.endMonth) : false))
          .sort((a, b) => b.ranAt - a.ranAt),
        monthlyCycleRuns: monthlyCycleRuns
          .filter((run) => inMonthRange(run.cycleKey, config.startMonth, config.endMonth))
          .sort((a, b) => b.ranAt - a.ranAt),
        purchaseMonthCloseRuns: purchaseMonthCloseRuns
          .filter((run) => inMonthRange(run.monthKey, config.startMonth, config.endMonth))
          .sort((a, b) => b.ranAt - a.ranAt),
        financeAuditEvents: financeAuditEvents
          .filter((event) => {
            const key = new Date(event.createdAt).toISOString().slice(0, 7)
            return inMonthRange(key, config.startMonth, config.endMonth)
          })
          .sort((a, b) => b.createdAt - a.createdAt),
      }
    : null

  const purchaseMutationHistoryRows = financeAuditEvents
    .filter((event) => event.entityType === 'purchase')
    .filter((event) => inMonthRange(monthKeyFromTimestamp(event.createdAt), config.startMonth, config.endMonth))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((event) => {
      const metadata = parseAuditJson<Record<string, unknown>>(event.metadataJson)
      const before = parseAuditJson<Record<string, unknown>>(event.beforeJson)
      const after = parseAuditJson<Record<string, unknown>>(event.afterJson)

      const source =
        typeof metadata?.source === 'string' && metadata.source.trim().length > 0
          ? metadata.source.trim()
          : 'manual'

      const detail = (() => {
        const beforeItem = typeof before?.item === 'string' ? before.item : null
        const afterItem = typeof after?.item === 'string' ? after.item : null
        const beforeAmount = typeof before?.amount === 'number' ? before.amount : null
        const afterAmount = typeof after?.amount === 'number' ? after.amount : null
        if (beforeItem && afterItem && beforeItem !== afterItem) {
          return `${beforeItem} -> ${afterItem}`
        }
        if (afterItem) return afterItem
        if (beforeItem) return beforeItem
        if (beforeAmount !== null && afterAmount !== null) {
          return `${beforeAmount.toFixed(2)} -> ${afterAmount.toFixed(2)}`
        }
        if (afterAmount !== null) return afterAmount.toFixed(2)
        if (beforeAmount !== null) return beforeAmount.toFixed(2)
        return '-'
      })()

      return {
        id: String(event._id),
        action: event.action,
        source,
        entityId: event.entityId,
        detail,
        createdAt: event.createdAt,
      }
    })
    .slice(0, 160)

  const purchaseMonthCloseRunsInRange = purchaseMonthCloseRuns
    .filter((run) => inMonthRange(run.monthKey, config.startMonth, config.endMonth))
    .sort((left, right) => {
      const byMonth = left.monthKey.localeCompare(right.monthKey)
      if (byMonth !== 0) return byMonth
      return left.ranAt - right.ranAt
    })

  const latestCloseRunByMonth = purchaseMonthCloseRunsInRange.reduce((map, run) => {
    const current = map.get(run.monthKey)
    if (!current || run.ranAt > current.ranAt) {
      map.set(run.monthKey, run)
    }
    return map
  }, new Map<string, PurchaseMonthCloseRunEntry>())

  const accountReconciliationByMonth = reconciliationRowsInRange.reduce((map, entry) => {
    const cycleMonth = /^\d{4}-\d{2}$/.test(entry.cycleMonth)
      ? entry.cycleMonth
      : monthKeyFromTimestamp(entry.updatedAt ?? entry.createdAt)
    const current = map.get(cycleMonth) ?? {
      opening: 0,
      closing: 0,
      checks: 0,
      reconciled: 0,
      unmatchedDeltaAbs: 0,
    }
    current.opening += entry.statementStartBalance
    current.closing += entry.statementEndBalance
    current.checks += 1
    if (entry.reconciled) current.reconciled += 1
    current.unmatchedDeltaAbs += Math.abs(entry.unmatchedDelta)
    map.set(cycleMonth, current)
    return map
  }, new Map<string, { opening: number; closing: number; checks: number; reconciled: number; unmatchedDeltaAbs: number }>())

  const reconciliationMonthKeys = Array.from(
    new Set([
      ...sortedMonthKeys,
      ...Array.from(latestCloseRunByMonth.keys()),
      ...Array.from(accountReconciliationByMonth.keys()),
    ]),
  ).sort()

  const reconciliationMonthRows = reconciliationMonthKeys.map((monthKey) => {
    const monthPurchases = monthGroups.get(monthKey) ?? []
    const pendingCount = monthPurchases.filter((purchase) => (purchase.reconciliationStatus ?? 'posted') === 'pending').length
    const postedCount = monthPurchases.filter((purchase) => (purchase.reconciliationStatus ?? 'posted') === 'posted').length
    const reconciledCount = monthPurchases.filter((purchase) => (purchase.reconciliationStatus ?? 'posted') === 'reconciled').length
    const pendingAmount = roundCurrency(
      monthPurchases
        .filter((purchase) => (purchase.reconciliationStatus ?? 'posted') === 'pending')
        .reduce((sum, purchase) => sum + purchase.amount, 0),
    )
    const closeRun = latestCloseRunByMonth.get(monthKey)
    const accountMonth = accountReconciliationByMonth.get(monthKey)

    return {
      monthKey,
      openingBalance: accountMonth ? roundCurrency(accountMonth.opening) : null,
      closingBalance: accountMonth ? roundCurrency(accountMonth.closing) : null,
      matchedCount: postedCount + reconciledCount,
      unmatchedCount: pendingCount,
      pendingAmount,
      unresolvedDeltaAbs: roundCurrency(accountMonth?.unmatchedDeltaAbs ?? 0),
      accountChecks: accountMonth?.checks ?? 0,
      accountReconciled: accountMonth?.reconciled ?? 0,
      closeStatus: closeRun?.status ?? null,
      closeRanAt: closeRun?.ranAt ?? null,
      closeFailureReason: closeRun?.failureReason ?? null,
      closePendingCount: closeRun?.pendingCount ?? pendingCount,
      closeDuplicateCount: closeRun?.duplicateCount ?? 0,
      closeAnomalyCount: closeRun?.anomalyCount ?? 0,
      closeMissingCategoryCount: closeRun?.missingCategoryCount ?? 0,
    }
  })

  const reconcileMatchedCount = purchasesByStatus.posted + purchasesByStatus.reconciled
  const reconcileUnmatchedCount = purchasesByStatus.pending
  const reconcileUnresolvedCount =
    purchasesByStatus.pending + rangeKpis.duplicateCount + rangeKpis.anomalyCount + rangeKpis.missingCategoryCount
  const reconcileUnresolvedValue = roundCurrency(pendingPurchasesTotal + accountRangeTotals.unmatchedDeltaAbs)
  const reconcileMatchAccuracyRate =
    rangeKpis.purchaseCount > 0
      ? clamp(
          1 -
            (rangeKpis.pendingCount +
              rangeKpis.duplicateCount +
              rangeKpis.anomalyCount +
              Math.ceil(rangeKpis.missingCategoryCount * 0.5)) /
              rangeKpis.purchaseCount,
          0,
          1,
        )
      : 1
  const reconcileCloseCompletedCount = purchaseMonthCloseRunsInRange.filter((run) => run.status === 'completed').length
  const reconcileCloseFailedCount = purchaseMonthCloseRunsInRange.filter((run) => run.status === 'failed').length
  const reconcileCloseSuccessRate =
    reconcileCloseCompletedCount + reconcileCloseFailedCount > 0
      ? reconcileCloseCompletedCount / (reconcileCloseCompletedCount + reconcileCloseFailedCount)
      : 1

  const reconciliationAuditRows = financeAuditEvents
    .filter((event) => event.entityType === 'purchase' || event.entityType === 'purchase_month_close')
    .filter((event) => {
      const monthKey =
        event.entityType === 'purchase_month_close' && /^\d{4}-\d{2}$/.test(event.entityId)
          ? event.entityId
          : monthKeyFromTimestamp(event.createdAt)
      return inMonthRange(monthKey, config.startMonth, config.endMonth)
    })
    .sort((left, right) => right.createdAt - left.createdAt)
    .map((event) => {
      const metadata = parseAuditJson<Record<string, unknown>>(event.metadataJson)
      const summary = parseAuditJson<Record<string, unknown>>(
        typeof metadata?.summaryJson === 'string' ? metadata.summaryJson : undefined,
      )
      const summaryPending = typeof summary?.pendingCount === 'number' ? summary.pendingCount : 0
      const summaryDuplicates = typeof summary?.duplicateCount === 'number' ? summary.duplicateCount : 0
      const summaryAnomalies = typeof summary?.anomalyCount === 'number' ? summary.anomalyCount : 0
      const summaryWarnings = summaryPending + summaryDuplicates + summaryAnomalies

      const severity = (() => {
        if (event.action.includes('failed')) return 'critical'
        if (summaryWarnings > 0) return 'warning'
        if (event.action.includes('duplicate') || event.action.includes('exclude') || event.action.includes('anomaly')) return 'warning'
        return 'info'
      })()

      return {
        id: String(event._id),
        createdAt: event.createdAt,
        monthKey:
          event.entityType === 'purchase_month_close' && /^\d{4}-\d{2}$/.test(event.entityId)
            ? event.entityId
            : monthKeyFromTimestamp(event.createdAt),
        action: event.action,
        source: resolveAuditSourceLabel(event),
        actor: resolveAuditActorLabel(event),
        detail: summarizeReconciliationAuditTransition(event),
        severity,
      }
    })

  const reconciliationExceptionHistoryRows = [
    ...reconciliationMonthRows
      .filter(
        (row) =>
          row.closeStatus === 'failed' ||
          row.unmatchedCount > 0 ||
          row.closePendingCount > 0 ||
          row.closeDuplicateCount > 0 ||
          row.closeAnomalyCount > 0 ||
          row.closeMissingCategoryCount > 0 ||
          row.unresolvedDeltaAbs > 0.009,
      )
      .map((row) => ({
        id: `close-${row.monthKey}`,
        createdAt: row.closeRanAt ?? new Date(`${row.monthKey}-28T12:00:00`).getTime(),
        monthKey: row.monthKey,
        source: 'month_close',
        event:
          row.closeStatus === 'failed'
            ? 'close_failed'
            : row.closeStatus === 'completed'
              ? 'close_with_exceptions'
              : 'open_exceptions',
        detail:
          row.closeStatus === 'failed'
            ? row.closeFailureReason ?? 'Close failed'
            : `pending ${row.closePendingCount} · duplicates ${row.closeDuplicateCount} · anomalies ${row.closeAnomalyCount} · missing category ${row.closeMissingCategoryCount}`,
      })),
    ...reconciliationAuditRows
      .filter((row) => row.severity !== 'info')
      .map((row) => ({
        id: `audit-${row.id}`,
        createdAt: row.createdAt,
        monthKey: row.monthKey,
        source: `${row.source}:${row.actor}`,
        event: row.action,
        detail: row.detail,
      })),
  ]
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 140)

  const baselineRangeNet =
    summary.monthlyIncome * rangeMonths - summary.monthlyCommitments * rangeMonths - purchasesTotal

  const cardRows = cards.map((card) => projectCardReportRow(card))
  const cardLimitTotal = sumBy(cardRows, (row) => row.limit)
  const dueAdjustedCurrentTotal = sumBy(cardRows, (row) => row.displayCurrentBalance)
  const projectedPostPaymentBalanceTotal = sumBy(cardRows, (row) => row.dueAdjustedCurrent)
  const estimatedMinimumDueTotal = sumBy(cardRows, (row) => row.minimumDue)
  const plannedPaymentTotal = sumBy(cardRows, (row) => row.plannedPayment)
  const pendingChargesTotal = sumBy(cardRows, (row) => row.pendingCharges)
  const newStatementsTotal = sumBy(cardRows, (row) => row.newStatementBalance)
  const availableCreditTotal = sumBy(cardRows, (row) => row.displayAvailableCredit)
  const projectedNextMonthInterestTotal = sumBy(cardRows, (row) => row.projectedNextMonthInterest)
  const projected12MonthInterestTotal = sumBy(cardRows, (row) => row.projected12MonthInterestCost)
  const dueAdjustedUtilizationPercent = utilizationFor(dueAdjustedCurrentTotal, cardLimitTotal)
  const projectedUtilizationAfterPaymentPortfolio = utilizationFor(projectedPostPaymentBalanceTotal, cardLimitTotal)
  const weightedAprPercent =
    dueAdjustedCurrentTotal > 0
      ? sumBy(cardRows, (row) => Math.max(row.displayCurrentBalance, 0) * row.apr) / dueAdjustedCurrentTotal
      : 0
  const utilizationTrendDeltaPp = (projectedUtilizationAfterPaymentPortfolio - dueAdjustedUtilizationPercent) * 100
  const utilizationTrendDirection =
    utilizationTrendDeltaPp < -0.05 ? 'down' : utilizationTrendDeltaPp > 0.05 ? 'up' : 'flat'

  const cardRiskAlerts = (() => {
    const alerts: CardRiskAlert[] = []

    cardRows.forEach((row) => {
      if (row.displayCurrentBalance > 0 && row.dueInDays <= 14) {
        const dueSeverity: RiskSeverity = row.dueInDays <= 1 ? 'critical' : row.dueInDays <= 3 ? 'warning' : 'watch'
        alerts.push({
          id: `due-${row.id}`,
          severity: dueSeverity,
          title: `${row.name}: ${formatDueCountdown(row.dueInDays)}`,
          detail: `Due day ${row.dueDay} · planned payment ${formatMoney(row.plannedPayment)}`,
        })
      }

      const utilizationSeverity = utilizationSeverityFor(row.displayUtilization)
      if (utilizationSeverity) {
        alerts.push({
          id: `util-${row.id}`,
          severity: utilizationSeverity,
          title: `${row.name}: utilization ${formatPercent(row.displayUtilization)}`,
          detail: `Threshold hit (>30/50/90) · available credit ${formatMoney(row.displayAvailableCredit)}`,
        })
      }

      if (row.paymentBelowInterest) {
        alerts.push({
          id: `interest-${row.id}`,
          severity: 'critical',
          title: `${row.name}: payment below interest`,
          detail: `Planned ${formatMoney(row.plannedPayment)} is below interest ${formatMoney(row.interestAmount)}.`,
        })
      }

      if (row.overLimit) {
        alerts.push({
          id: `over-limit-${row.id}`,
          severity: 'critical',
          title: `${row.name}: over credit limit`,
          detail: `Current ${formatMoney(row.displayCurrentBalance)} against ${formatMoney(row.limit)} limit.`,
        })
      }
    })

    const severityRank: Record<RiskSeverity, number> = {
      critical: 3,
      warning: 2,
      watch: 1,
    }

    return alerts.sort((left, right) => {
      const severityDelta = severityRank[right.severity] - severityRank[left.severity]
      if (severityDelta !== 0) {
        return severityDelta
      }
      return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
    })
  })()

  const riskSummary = {
    critical: cardRiskAlerts.filter((alert) => alert.severity === 'critical').length,
    warning: cardRiskAlerts.filter((alert) => alert.severity === 'warning').length,
    watch: cardRiskAlerts.filter((alert) => alert.severity === 'watch').length,
  }

  const payoffCards: PayoffCard[] = cardRows
    .map((row) => ({
      id: row.id,
      name: row.name,
      balance: roundCurrency(Math.max(row.displayCurrentBalance, 0)),
      apr: row.apr,
      monthlyInterest: row.interestAmount,
      utilization: row.displayUtilization,
      minimumDue: row.minimumDue,
      plannedPayment: row.plannedPayment,
    }))
    .filter((entry) => entry.balance > 0)

  const avalancheRanking = rankPayoffCards(payoffCards, 'avalanche')
  const snowballRanking = rankPayoffCards(payoffCards, 'snowball')
  const avalancheTarget = avalancheRanking[0] ?? null
  const snowballTarget = snowballRanking[0] ?? null
  const loanPortfolio = buildLoanPortfolioProjection(loans, {
    maxMonths: 36,
    loanEvents,
  })
  const loanStrategy = buildLoanStrategy(loans, loanEvents, 0)
  const loanModels = loanPortfolio.models
  const loanEventsInRange = loanEvents
    .filter((event) => inMonthRange(monthKeyFromTimestamp(event.createdAt), config.startMonth, config.endMonth))
    .sort((left, right) => right.createdAt - left.createdAt)
  const loanInterestTrend = loanModels
    .slice(0, 6)
    .map((model) => {
      const trend = model.rows
        .slice(0, 6)
        .map((row) => `M${row.monthIndex} ${formatMoney(row.interestAccrued)}`)
        .join(' • ')
      return `${model.name}: ${trend}`
    })
    .join(' | ')

  return (
    <article className="print-report" aria-label="Print report">
      <header className="print-cover">
        <div>
          <p className="print-kicker">Adaptive Finance OS</p>
          <h1 className="print-title">Personal Finance Report</h1>
          <p className="print-meta">
            Range {config.startMonth} to {config.endMonth} ({rangeMonths} month{rangeMonths === 1 ? '' : 's'}) • Generated{' '}
            {generatedAt.toLocaleString(locale)} • {preference.currency} / {preference.locale}
          </p>
        </div>
        <div className="print-badge">
          <strong>{formatMoney(purchasesTotal)}</strong>
          <span>cleared purchases in range</span>
        </div>
      </header>

      {config.includeDashboard ? (
        <>
          <section className="print-section print-section--summary">
            <h2>Summary</h2>
            <div className="print-summary-grid">
              <div className="print-summary-card">
                <p>Baseline income (monthly)</p>
                <strong>{formatMoney(summary.monthlyIncome)}</strong>
                <small>{formatMoney(summary.monthlyIncome * rangeMonths)} over range</small>
              </div>
              <div className="print-summary-card">
                <p>Baseline commitments (monthly)</p>
                <strong>{formatMoney(summary.monthlyCommitments)}</strong>
                <small>{formatMoney(summary.monthlyCommitments * rangeMonths)} over range</small>
              </div>
              <div className="print-summary-card">
                <p>Purchases (range)</p>
                <strong>{formatMoney(purchasesTotal)}</strong>
                <small>
                  {sortedMonthKeys.length > 0
                    ? `${sortedMonthKeys.length} month group${sortedMonthKeys.length === 1 ? '' : 's'}`
                    : 'No purchases'}
                </small>
                <small>Pending not included: {formatMoney(pendingPurchasesTotal)}</small>
              </div>
              <div className="print-summary-card">
                <p>Baseline net (range)</p>
                <strong>{formatMoney(baselineRangeNet)}</strong>
                <small>income - commitments - purchases</small>
              </div>
            </div>

            <div className="print-kpi-grid">
              <div className="print-kpi">
                <p>Reconciliation</p>
                <strong>{formatPercent(rangeKpis.reconciliationCompletionRate)}</strong>
                <small>
                  {rangeKpis.purchaseCount} purchases • {rangeKpis.pendingCount} pending
                </small>
              </div>
              <div className="print-kpi">
                <p>Missing categories</p>
                <strong>
                  {rangeKpis.purchaseCount > 0 ? formatPercent(rangeKpis.missingCategoryCount / rangeKpis.purchaseCount) : '0%'}
                </strong>
                <small>{rangeKpis.missingCategoryCount} flagged</small>
              </div>
              <div className="print-kpi">
                <p>Duplicates</p>
                <strong>{rangeKpis.purchaseCount > 0 ? formatPercent(rangeKpis.duplicateCount / rangeKpis.purchaseCount) : '0%'}</strong>
                <small>{rangeKpis.duplicateCount} possible groups</small>
              </div>
              <div className="print-kpi">
                <p>Anomalies</p>
                <strong>{rangeKpis.purchaseCount > 0 ? formatPercent(rangeKpis.anomalyCount / rangeKpis.purchaseCount) : '0%'}</strong>
                <small>{rangeKpis.anomalyCount} outliers</small>
              </div>
            </div>

            {kpis ? (
              <p className="print-subnote">
                Trust KPIs (last {kpis.windowDays} days): accuracy {formatPercent(kpis.accuracyRate)}
                {kpis.syncFailureRate === null ? '' : ` • sync failures ${formatPercent(kpis.syncFailureRate)}`} • cycle
                success {formatPercent(kpis.cycleSuccessRate)} • reconciliation {formatPercent(kpis.reconciliationCompletionRate)}.
              </p>
            ) : null}
          </section>

          <section className="print-section print-section--component">
            <h2>Month Close Snapshots</h2>
            {snapshotsInRange.length === 0 ? (
              <p className="print-subnote">
                No month-close snapshots recorded in this range yet. Run monthly cycle to generate snapshots.
              </p>
            ) : (
              <div className="print-table-wrap">
                <table className="print-table">
                  <thead>
                    <tr>
                      <th scope="col">Month</th>
                      <th scope="col">Income</th>
                      <th scope="col">Commitments</th>
                      <th scope="col">Liabilities</th>
                      <th scope="col">Net Worth</th>
                      <th scope="col">Runway</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshotsInRange.map((snapshot) => (
                      <tr key={snapshot._id}>
                        <td>{snapshot.cycleKey}</td>
                        <td className="table-amount">{formatMoney(snapshot.summary.monthlyIncome)}</td>
                        <td className="table-amount">{formatMoney(snapshot.summary.monthlyCommitments)}</td>
                        <td className="table-amount">{formatMoney(snapshot.summary.totalLiabilities)}</td>
                        <td className="table-amount">{formatMoney(snapshot.summary.netWorth)}</td>
                        <td>{snapshot.summary.runwayMonths.toFixed(1)} mo</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {config.includeIncome ? (
        <section className="print-section print-section--component">
          <h2>Income</h2>
          {incomes.length === 0 ? (
            <p className="print-subnote">No income entries.</p>
          ) : (
            <>
              <div className="print-kpi-grid">
                <div className="print-kpi">
                  <p>Planned net (monthly)</p>
                  <strong>{formatMoney(incomeExpectations.plannedMonthly)}</strong>
                  <small>{formatMoney(incomeExpectations.plannedMonthly * rangeMonths)} over range</small>
                </div>
                <div className="print-kpi">
                  <p>Actual received (tracked monthly)</p>
                  <strong>{formatMoney(incomeExpectations.actualTrackedMonthly)}</strong>
                  <small>{formatMoney(incomeExpectations.actualTrackedMonthly * rangeMonths)} over range</small>
                </div>
                <div className="print-kpi">
                  <p>Variance (tracked monthly)</p>
                  <strong>{formatMoney(incomeVarianceMonthly)}</strong>
                  <small>{formatMoney(incomeVarianceMonthly * rangeMonths)} over range</small>
                </div>
                <div className="print-kpi">
                  <p>Tracking coverage</p>
                  <strong>
                    {incomeExpectations.trackedCount}/{incomes.length}
                  </strong>
                  <small>{incomePendingCount} pending actual value{incomePendingCount === 1 ? '' : 's'}</small>
                </div>
                <div className="print-kpi">
                  <p>Payment reliability score</p>
                  <strong>
                    {overallIncomePaymentReliability.score !== null
                      ? `${overallIncomePaymentReliability.score}/100`
                      : 'n/a'}
                  </strong>
                  <small>
                    {(overallIncomePaymentReliability.onTimeRate * 100).toFixed(0)}% on-time ·{' '}
                    {overallIncomePaymentReliability.total} log
                    {overallIncomePaymentReliability.total === 1 ? '' : 's'}
                  </small>
                </div>
                <div className="print-kpi">
                  <p>Late/missed streaks</p>
                  <strong>
                    {overallIncomePaymentReliability.lateStreak} late ·{' '}
                    {overallIncomePaymentReliability.missedStreak} missed
                  </strong>
                  <small>
                    Current combined late/missed streak: {overallIncomePaymentReliability.lateOrMissedStreak}
                  </small>
                </div>
              </div>

              <div className="print-table-wrap">
                <table className="print-table">
                  <thead>
                    <tr>
                      <th scope="col">Source</th>
                      <th scope="col">Gross</th>
                      <th scope="col">Deductions</th>
                      <th scope="col">Planned Net</th>
                      <th scope="col">Actual Paid</th>
                      <th scope="col">Variance</th>
                      <th scope="col">Reliability</th>
                      <th scope="col">Latest Status</th>
                      <th scope="col">Income Status</th>
                      <th scope="col">Landing Account</th>
                      <th scope="col">Cadence</th>
                      <th scope="col">Forecast Smoothing</th>
                      <th scope="col">Received</th>
                      <th scope="col">Anchor</th>
                      <th scope="col">Next Payday</th>
                      {config.includeNotes ? <th scope="col">Notes / refs</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {incomes.map((income) => {
                      const grossAmount = resolveIncomeGrossAmount(income)
                      const deductionTotal = computeIncomeDeductionsTotal(income)
                      const netAmount = resolveIncomeNetAmount(income)
                      const actualPaidAmount =
                        typeof income.actualAmount === 'number' && Number.isFinite(income.actualAmount)
                          ? roundCurrency(Math.max(income.actualAmount, 0))
                          : undefined
                      const varianceAmount =
                        actualPaidAmount !== undefined ? roundCurrency(actualPaidAmount - netAmount) : undefined
                      const paymentHistory = incomePaymentChecksByIncomeId.get(String(income._id)) ?? []
                      const reliability = calculateIncomePaymentReliability(paymentHistory)
                      const latestPaymentEntry =
                        [...paymentHistory].sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null
                      const currentCycleCheck =
                        paymentHistory.find((entry) => entry.cycleMonth === currentCycleMonth) ?? null
                      const incomeStatus = resolveIncomeStatusTag({
                        currentCycleStatus: currentCycleCheck?.status ?? null,
                        reliability,
                        hasActualPaidAmount: actualPaidAmount !== undefined,
                      })
                      const nextPayday = nextDateForCadence({
                        cadence: income.cadence,
                        createdAt: income.createdAt,
                        dayOfMonth: income.receivedDay,
                        customInterval: income.customInterval ?? undefined,
                        customUnit: income.customUnit ?? undefined,
                        payDateAnchor: income.payDateAnchor,
                      })
                      const notesAndReferences = [
                        income.employerNote ? `Employer: ${income.employerNote}` : null,
                        latestPaymentEntry?.paymentReference
                          ? `Payment ref: ${latestPaymentEntry.paymentReference}`
                          : null,
                        latestPaymentEntry?.payslipReference
                          ? `Payslip ref: ${latestPaymentEntry.payslipReference}`
                          : null,
                        income.notes ? `Note: ${income.notes}` : null,
                      ]
                        .filter((value): value is string => Boolean(value))
                        .join(' | ')

                      return (
                        <tr key={income._id}>
                          <td>{income.source}</td>
                          <td className="table-amount">{formatMoney(grossAmount)}</td>
                          <td className="table-amount">{formatMoney(deductionTotal)}</td>
                          <td className="table-amount">{formatMoney(netAmount)}</td>
                          <td className="table-amount">{actualPaidAmount !== undefined ? formatMoney(actualPaidAmount) : 'n/a'}</td>
                          <td className="table-amount">{varianceAmount !== undefined ? formatMoney(varianceAmount) : 'n/a'}</td>
                          <td>
                            {reliability.score !== null
                              ? `${reliability.score}/100 · ${(reliability.onTimeRate * 100).toFixed(0)}% on-time`
                              : 'n/a'}
                          </td>
                          <td>
                            {reliability.lastStatus
                              ? `${incomePaymentStatusLabel(reliability.lastStatus)} · late ${reliability.lateStreak} · missed ${reliability.missedStreak}`
                              : 'n/a'}
                          </td>
                          <td>{incomeStatusLabel(incomeStatus)}</td>
                          <td>
                            {income.destinationAccountId
                              ? accountNameById.get(String(income.destinationAccountId)) ?? 'Missing account'
                              : 'Unassigned'}
                          </td>
                          <td>{income.cadence}</td>
                          <td>
                            {income.forecastSmoothingEnabled
                              ? `${Math.min(Math.max(Math.round(income.forecastSmoothingMonths ?? 6), 2), 24)}m lookback`
                              : 'Off'}
                          </td>
                          <td>{income.receivedDay ? `Day ${income.receivedDay}` : 'n/a'}</td>
                          <td>{income.payDateAnchor ?? 'n/a'}</td>
                          <td>{nextPayday ? toIsoDate(nextPayday) : 'n/a'}</td>
                          {config.includeNotes ? <td>{notesAndReferences}</td> : null}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <h3 className="print-subhead">Income change history</h3>
              {incomeChangeEventsInRange.length === 0 ? (
                <p className="print-subnote">No salary change events in the selected range.</p>
              ) : (
                <>
                  <div className="print-kpi-grid">
                    <div className="print-kpi">
                      <p>Change events</p>
                      <strong>{incomeChangeEventsInRange.length}</strong>
                      <small>effective-dated updates in range</small>
                    </div>
                    <div className="print-kpi">
                      <p>Increases</p>
                      <strong>{incomeChangeSummary.increase}</strong>
                      <small>positive salary adjustments</small>
                    </div>
                    <div className="print-kpi">
                      <p>Decreases</p>
                      <strong>{incomeChangeSummary.decrease}</strong>
                      <small>negative salary adjustments</small>
                    </div>
                    <div className="print-kpi">
                      <p>No change entries</p>
                      <strong>{incomeChangeSummary.noChange}</strong>
                      <small>logged for audit consistency</small>
                    </div>
                    <div className="print-kpi">
                      <p>Net delta over range</p>
                      <strong>{formatMoney(roundCurrency(incomeChangeSummary.netDelta))}</strong>
                      <small>sum of all change deltas</small>
                    </div>
                  </div>

                  <div className="print-table-wrap">
                    <table className="print-table">
                      <thead>
                        <tr>
                          <th scope="col">Effective Date</th>
                          <th scope="col">Source</th>
                          <th scope="col">Direction</th>
                          <th scope="col">Previous</th>
                          <th scope="col">New</th>
                          <th scope="col">Delta</th>
                          {config.includeNotes ? <th scope="col">Note</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {incomeChangeEventsInRange.map((event) => (
                          <tr key={event._id}>
                            <td>{event.effectiveDate}</td>
                            <td>{incomeNameById.get(String(event.incomeId)) ?? 'Unknown source'}</td>
                            <td>{incomeChangeDirectionLabel(event.direction)}</td>
                            <td className="table-amount">{formatMoney(event.previousAmount)}</td>
                            <td className="table-amount">{formatMoney(event.newAmount)}</td>
                            <td className="table-amount">
                              {event.deltaAmount > 0 ? '+' : ''}
                              {formatMoney(event.deltaAmount)}
                            </td>
                            {config.includeNotes ? <td>{event.note ?? ''}</td> : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      ) : null}

      {config.includeBills ? (
        <section className="print-section print-section--component">
          <h2>Bills</h2>
          {bills.length === 0 ? (
            <p className="print-subnote">No bill entries.</p>
          ) : (
            <>
              {([
                { scope: 'shared' as const, rows: bills.filter((bill) => resolveBillScope(bill) === 'shared') },
                { scope: 'personal' as const, rows: bills.filter((bill) => resolveBillScope(bill) === 'personal') },
              ]).map((section) => {
                if (section.rows.length === 0) {
                  return null
                }

                const monthlyEstimate = sumBy(section.rows, (bill) =>
                  toMonthlyAmount(bill.amount, bill.cadence, bill.customInterval, bill.customUnit),
                )
                const deductibleCount = section.rows.filter((bill) => bill.deductible === true).length

                return (
                  <div key={section.scope} className="print-table-wrap">
                    <p className="print-subnote">
                      {billScopeLabelMap[section.scope]} · {section.rows.length} bills · {formatMoney(monthlyEstimate)} monthly
                      estimate · {deductibleCount} deductible
                    </p>
                    <table className="print-table">
                      <thead>
                        <tr>
                          <th scope="col">Name</th>
                          <th scope="col">Amount</th>
                          <th scope="col">Due</th>
                          <th scope="col">Cadence</th>
                          <th scope="col">Category</th>
                          <th scope="col">Deductible</th>
                          <th scope="col">Autopay</th>
                          {config.includeNotes ? <th scope="col">Notes</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {section.rows.map((bill) => (
                          <tr key={bill._id}>
                            <td>{bill.name}</td>
                            <td className="table-amount">{formatMoney(bill.amount)}</td>
                            <td>Day {bill.dueDay}</td>
                            <td>{bill.cadence}</td>
                            <td>{billCategoryLabelMap[resolveBillCategory(bill)]}</td>
                            <td>{bill.deductible ? 'yes' : 'no'}</td>
                            <td>{bill.autopay ? 'yes' : 'no'}</td>
                            {config.includeNotes ? <td>{bill.notes ?? ''}</td> : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </>
          )}
        </section>
      ) : null}

      {config.includeCards ? (
        <section className="print-section print-section--component">
          <h2>Cards</h2>
          {cardRows.length === 0 ? (
            <p className="print-subnote">No card entries.</p>
          ) : (
            <>
            <div className="print-card-summary-grid">
              <div className="print-summary-card">
                <p>Due-adjusted card debt</p>
                <strong>{formatMoney(dueAdjustedCurrentTotal)}</strong>
                <small>
                  {cardRows.length} cards · {formatMoney(newStatementsTotal)} new statements
                </small>
              </div>
              <div className="print-summary-card">
                <p>Utilization trend</p>
                <strong>
                  {formatPercent(dueAdjustedUtilizationPercent)} to {formatPercent(projectedUtilizationAfterPaymentPortfolio)}
                </strong>
                <small>
                  {utilizationTrendDeltaPp >= 0 ? '+' : ''}
                  {utilizationTrendDeltaPp.toFixed(1)}pp ({utilizationTrendDirection})
                </small>
              </div>
              <div className="print-summary-card">
                <p>Minimums + planned payments</p>
                <strong>
                  {formatMoney(estimatedMinimumDueTotal)} / {formatMoney(plannedPaymentTotal)}
                </strong>
                <small>{formatMoney(pendingChargesTotal)} pending charges</small>
              </div>
              <div className="print-summary-card">
                <p>Interest outlook</p>
                <strong>
                  {formatMoney(projectedNextMonthInterestTotal)} next month
                </strong>
                <small>
                  {formatMoney(projected12MonthInterestTotal)} over 12 months · weighted APR {weightedAprPercent.toFixed(2)}%
                </small>
              </div>
            </div>

            <h3 className="print-subhead">Risk Alerts</h3>
            {cardRiskAlerts.length === 0 ? (
              <p className="print-subnote">No active card risk alerts.</p>
            ) : (
              <>
                <p className="print-subnote">
                  {riskSummary.critical} critical · {riskSummary.warning} warning · {riskSummary.watch} watch
                </p>
                <ul className="print-card-risk-list">
                  {cardRiskAlerts.map((alert) => (
                    <li key={alert.id} className={`print-card-risk-item print-card-risk-item--${alert.severity}`}>
                      <span className={`print-card-risk-pill print-card-risk-pill--${alert.severity}`}>{alert.severity}</span>
                      <strong>{alert.title}</strong>
                      <small>{alert.detail}</small>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <h3 className="print-subhead">Payoff Intelligence</h3>
            {payoffCards.length === 0 ? (
              <p className="print-subnote">All cards are fully paid. No overpay target right now.</p>
            ) : (
              <div className="print-card-payoff-grid">
                <div className="print-kpi">
                  <p>Avalanche target</p>
                  <strong>{avalancheTarget?.name ?? 'n/a'}</strong>
                  <small>
                    {avalancheTarget
                      ? `${formatMoney(avalancheTarget.balance)} · ${avalancheTarget.apr.toFixed(2)}% APR · ${formatMoney(avalancheTarget.monthlyInterest)} monthly interest · ${formatMoney(avalancheTarget.minimumDue)} min due · ${formatMoney(avalancheTarget.plannedPayment)} planned · priority ${getOverpayPriority(avalancheTarget, 'avalanche').toFixed(2)}`
                      : 'No open card balances'}
                  </small>
                </div>
                <div className="print-kpi">
                  <p>Snowball target</p>
                  <strong>{snowballTarget?.name ?? 'n/a'}</strong>
                  <small>
                    {snowballTarget
                      ? `${formatMoney(snowballTarget.balance)} · ${snowballTarget.apr.toFixed(2)}% APR · ${formatMoney(snowballTarget.monthlyInterest)} monthly interest · ${formatMoney(snowballTarget.minimumDue)} min due · ${formatMoney(snowballTarget.plannedPayment)} planned · priority ${getOverpayPriority(snowballTarget, 'snowball').toFixed(2)}`
                      : 'No open card balances'}
                  </small>
                </div>
              </div>
            )}

            <div className="print-table-wrap">
              <table className="print-table">
                <thead>
                  <tr>
                    <th scope="col">Card</th>
                    <th scope="col">Balances</th>
                    <th scope="col">New Statement</th>
                    <th scope="col">Min Config</th>
                    <th scope="col">Plan</th>
                    <th scope="col">Due Cycle</th>
                    <th scope="col">Exposure</th>
                    <th scope="col">Interest</th>
                  </tr>
                </thead>
                <tbody>
                  {cardRows.map((card) => (
                    <tr key={card.id}>
                      <td>
                        <strong>{card.name}</strong>
                        <br />
                        {formatMoney(card.limit)} limit
                      </td>
                      <td>
                        Current {formatMoney(card.displayCurrentBalance)}
                        <br />
                        Statement {formatMoney(card.statementInput)}
                        <br />
                        Pending {formatMoney(card.pendingCharges)}
                      </td>
                      <td className="table-amount">{formatMoney(card.newStatementBalance)}</td>
                      <td>
                        {describeMinimumConfig(card)}
                        <br />
                        Min due {formatMoney(card.minimumDue)}
                        <br />
                        Extra {formatMoney(card.extraPayment)}
                      </td>
                      <td>
                        Planned pay {formatMoney(card.plannedPayment)}
                        <br />
                        Planned spend {formatMoney(card.plannedSpend)}
                        <br />
                        Due-adjusted {formatMoney(card.dueAdjustedCurrent)}
                      </td>
                      <td>
                        Day {card.dueDay} ({formatDueCountdown(card.dueInDays)})
                        <br />
                        Statement day {card.statementDay}
                        <br />
                        {card.dueApplied ? 'Due applied this month' : 'Due pending this month'}
                      </td>
                      <td>
                        Avail {formatMoney(card.displayAvailableCredit)}
                        <br />
                        Util {formatPercent(card.displayUtilization)}
                        <br />
                        Post-pay util {formatPercent(card.projectedUtilizationAfterPayment)}
                        {card.overLimit ? (
                          <>
                            <br />
                            Over limit
                          </>
                        ) : null}
                      </td>
                      <td>
                        APR {card.apr > 0 ? `${card.apr.toFixed(2)}%` : 'n/a'}
                        <br />
                        Cycle {formatMoney(card.interestAmount)}
                        <br />
                        Next {formatMoney(card.projectedNextMonthInterest)}
                        <br />
                        12m {formatMoney(card.projected12MonthInterestCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="print-subhead">Amortization &amp; Interest Trend (12 months)</h3>
            {cardRows.map((card) => (
              <article key={`projection-${card.id}`} className="print-card-projection">
                <div className="print-card-projection-head">
                  <h4>{card.name}</h4>
                  <p>
                    Start {formatMoney(card.dueAdjustedCurrent)} · APR {card.apr > 0 ? `${card.apr.toFixed(2)}%` : 'n/a'} ·{' '}
                    {describeMinimumConfig(card)}
                  </p>
                </div>
                <p className="print-subnote">
                  Interest trend:{' '}
                  {card.projectionRows
                    .slice(0, 12)
                    .map((row) => `M${row.monthIndex} ${formatMoney(row.interest)}`)
                    .join(' • ')}
                </p>
                <div className="print-table-wrap">
                  <table className="print-table print-table--projection">
                    <thead>
                      <tr>
                        <th scope="col">Month</th>
                        <th scope="col">Start</th>
                        <th scope="col">Interest</th>
                        <th scope="col">Min Due</th>
                        <th scope="col">Planned Pay</th>
                        <th scope="col">Planned Spend</th>
                        <th scope="col">End Balance</th>
                        <th scope="col">End Util</th>
                      </tr>
                    </thead>
                    <tbody>
                      {card.projectionRows.map((row) => (
                        <tr key={`${card.id}-m${row.monthIndex}`}>
                          <td>M{row.monthIndex}</td>
                          <td className="table-amount">{formatMoney(row.startBalance)}</td>
                          <td className="table-amount">{formatMoney(row.interest)}</td>
                          <td className="table-amount">{formatMoney(row.minimumDue)}</td>
                          <td className="table-amount">{formatMoney(row.plannedPayment)}</td>
                          <td className="table-amount">{formatMoney(row.plannedSpend)}</td>
                          <td className="table-amount">{formatMoney(row.endingBalance)}</td>
                          <td>{formatPercent(row.endingUtilization)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}

              <p className="print-subnote">
                Portfolio available credit {formatMoney(availableCreditTotal)} across {formatMoney(cardLimitTotal)} total
                limit.
              </p>
            </>
          )}
        </section>
      ) : null}

      {config.includeLoans ? (
        <section className="print-section print-section--component">
          <h2>Loans</h2>
          {loans.length === 0 ? (
            <p className="print-subnote">No loan entries.</p>
          ) : (
            <>
              <div className="print-kpi-grid">
                <div className="print-kpi">
                  <p>Total outstanding</p>
                  <strong>{formatMoney(loanPortfolio.totalOutstanding)}</strong>
                  <small>{loanModels.length} active loan model{loanModels.length === 1 ? '' : 's'}</small>
                </div>
                <div className="print-kpi">
                  <p>Projected next-month interest</p>
                  <strong>{formatMoney(loanPortfolio.projectedNextMonthInterest)}</strong>
                  <small>current balances + APR + payment setup</small>
                </div>
                <div className="print-kpi">
                  <p>Projected 12-month interest</p>
                  <strong>{formatMoney(loanPortfolio.projectedAnnualInterest)}</strong>
                  <small>{formatMoney(loanPortfolio.projectedAnnualPayments)} projected annual payments</small>
                </div>
                <div className="print-kpi">
                  <p>Strategy recommendation</p>
                  <strong>
                    {loanStrategy.recommendedTarget
                      ? `${loanStrategy.recommendedMode === 'avalanche' ? 'Avalanche' : 'Snowball'}`
                      : 'n/a'}
                  </strong>
                  <small>
                    {loanStrategy.recommendedTarget
                      ? `${loanStrategy.recommendedTarget.name} · ${formatMoney(loanStrategy.recommendedTarget.annualInterestSavings)} annual savings`
                      : 'Add balances to calculate recommendation'}
                  </small>
                </div>
              </div>

              <div className="print-card-payoff-grid">
                <article className="print-card-risk-item">
                  <strong>Avalanche</strong>
                  <small>
                    {loanStrategy.avalancheTarget
                      ? `${loanStrategy.avalancheTarget.name} · ${loanStrategy.avalancheTarget.apr.toFixed(2)}% APR · ${formatMoney(loanStrategy.avalancheTarget.annualInterestSavings)} annual savings`
                      : 'No active loan balance'}
                  </small>
                </article>
                <article className="print-card-risk-item">
                  <strong>Snowball</strong>
                  <small>
                    {loanStrategy.snowballTarget
                      ? `${loanStrategy.snowballTarget.name} · ${formatMoney(loanStrategy.snowballTarget.balance)} balance · ${formatMoney(loanStrategy.snowballTarget.annualInterestSavings)} annual savings`
                      : 'No active loan balance'}
                  </small>
                </article>
                <article className="print-card-risk-item">
                  <strong>Recommended target</strong>
                  <small>
                    {loanStrategy.recommendedTarget
                      ? `${loanStrategy.recommendedTarget.name} · ${formatMoney(loanStrategy.recommendedTarget.nextMonthInterest)} next-month interest`
                      : 'n/a'}
                  </small>
                </article>
              </div>

              <p className="print-subnote">Interest trend: {loanInterestTrend || 'No loan interest trend yet.'}</p>

              <div className="print-table-wrap">
                <table className="print-table">
                  <thead>
                    <tr>
                      <th scope="col">Loan</th>
                      <th scope="col">Current</th>
                      <th scope="col">APR</th>
                      <th scope="col">Due cycle</th>
                      <th scope="col">Projection</th>
                      <th scope="col">Payoff</th>
                      {config.includeNotes ? <th scope="col">Notes</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {loanModels.map((model) => {
                      const firstRow = model.rows[0]
                      const sourceLoan = loans.find((loan) => String(loan._id) === model.loanId)
                      return (
                        <tr key={model.loanId}>
                          <td>
                            <strong>{model.name}</strong>
                            <br />
                            {cadenceLabelForPrint(model.cadence, model.customInterval, model.customUnit)}
                          </td>
                          <td>
                            Outstanding {formatMoney(model.currentOutstanding)}
                            <br />
                            Principal {formatMoney(model.currentPrincipal)}
                            <br />
                            Interest {formatMoney(model.currentInterest)}
                            <br />
                            Subscription {formatMoney(model.currentSubscriptionOutstanding)}
                          </td>
                          <td>
                            {model.apr > 0 ? `${model.apr.toFixed(2)}%` : 'n/a'}
                            <br />
                            Next interest {formatMoney(model.projectedNextMonthInterest)}
                            <br />
                            12m {formatMoney(model.projectedAnnualInterest)}
                          </td>
                          <td>
                            Day {model.dueDay}
                            <br />
                            Loan pay {formatMoney(firstRow?.plannedLoanPayment ?? 0)}
                            <br />
                            Subscription {formatMoney(firstRow?.subscriptionDue ?? 0)}
                            <br />
                            Total {formatMoney(firstRow?.totalPayment ?? 0)}
                          </td>
                          <td>
                            12m end {formatMoney(model.horizons[12].endingOutstanding)}
                            <br />
                            24m end {formatMoney(model.horizons[24].endingOutstanding)}
                            <br />
                            36m end {formatMoney(model.horizons[36].endingOutstanding)}
                          </td>
                          <td>{model.projectedPayoffDate ?? 'Beyond modeled window'}</td>
                          {config.includeNotes ? <td>{sourceLoan?.notes ?? ''}</td> : null}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <h3 className="print-subhead">Loan Amortization Tables (12 months)</h3>
              {loanModels.map((model) => (
                <article key={`loan-projection-${model.loanId}`} className="print-card-projection">
                  <div className="print-card-projection-head">
                    <h4>{model.name}</h4>
                    <p>
                      Outstanding {formatMoney(model.currentOutstanding)} · APR {model.apr > 0 ? `${model.apr.toFixed(2)}%` : 'n/a'} ·
                      payoff {model.projectedPayoffDate ?? 'beyond model window'}
                    </p>
                  </div>
                  <p className="print-subnote">
                    Interest trend:{' '}
                    {model.rows
                      .slice(0, 12)
                      .map((row) => `M${row.monthIndex} ${formatMoney(row.interestAccrued)}`)
                      .join(' • ')}
                  </p>
                  <div className="print-table-wrap">
                    <table className="print-table print-table--projection">
                      <thead>
                        <tr>
                          <th scope="col">Month</th>
                          <th scope="col">Open</th>
                          <th scope="col">Interest</th>
                          <th scope="col">Loan payment</th>
                          <th scope="col">Subscription</th>
                          <th scope="col">Total payment</th>
                          <th scope="col">End outstanding</th>
                        </tr>
                      </thead>
                      <tbody>
                        {model.rows.slice(0, 12).map((row) => (
                          <tr key={`${model.loanId}-m${row.monthIndex}`}>
                            <td>M{row.monthIndex}</td>
                            <td className="table-amount">{formatMoney(row.openingOutstanding)}</td>
                            <td className="table-amount">{formatMoney(row.interestAccrued)}</td>
                            <td className="table-amount">{formatMoney(row.plannedLoanPayment)}</td>
                            <td className="table-amount">{formatMoney(row.subscriptionDue)}</td>
                            <td className="table-amount">{formatMoney(row.totalPayment)}</td>
                            <td className="table-amount">{formatMoney(row.endingOutstanding)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              ))}

              <h3 className="print-subhead">Loan Event History (Range)</h3>
              {loanEventsInRange.length === 0 ? (
                <p className="print-subnote">No loan events in selected range.</p>
              ) : (
                <div className="print-table-wrap">
                  <table className="print-table">
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">Loan</th>
                        <th scope="col">Event</th>
                        <th scope="col">Source</th>
                        <th scope="col">Amount</th>
                        <th scope="col">Principal Δ</th>
                        <th scope="col">Interest Δ</th>
                        <th scope="col">Resulting balance</th>
                        {config.includeNotes ? <th scope="col">Notes</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {loanEventsInRange.map((event) => {
                        const loanName = loans.find((loan) => String(loan._id) === String(event.loanId))?.name ?? String(event.loanId)
                        return (
                          <tr key={event._id}>
                            <td>{cycleDateLabel.format(new Date(event.createdAt))}</td>
                            <td>{loanName}</td>
                            <td>{loanEventTypeLabel(event.eventType)}</td>
                            <td>{event.source}</td>
                            <td className="table-amount">{formatMoney(event.amount)}</td>
                            <td className="table-amount">{formatMoney(event.principalDelta)}</td>
                            <td className="table-amount">{formatMoney(event.interestDelta)}</td>
                            <td className="table-amount">{formatMoney(event.resultingBalance)}</td>
                            {config.includeNotes ? <td>{event.notes ?? ''}</td> : null}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      ) : null}

      {config.includeAccounts ? (
        <section className="print-section print-section--component">
          <h2>Accounts</h2>
          {accountReportRows.length === 0 ? (
            <p className="print-subnote">No account entries.</p>
          ) : (
            <>
              <div className="print-kpi-grid">
                <div className="print-kpi">
                  <p>Opening balance (range estimate)</p>
                  <strong>{formatMoney(roundCurrency(accountRangeTotals.opening))}</strong>
                  <small>Opening snapshots inferred from reconciliation + transfer movement.</small>
                </div>
                <div className="print-kpi">
                  <p>Closing balance</p>
                  <strong>{formatMoney(roundCurrency(accountRangeTotals.closing))}</strong>
                  <small>
                    Available {formatMoney(roundCurrency(accountRangeTotals.available))} · Ledger{' '}
                    {formatMoney(roundCurrency(accountRangeTotals.ledger))}
                  </small>
                </div>
                <div className="print-kpi">
                  <p>Transfer summary</p>
                  <strong>{formatMoney(roundCurrency(accountRangeTotals.transferNet))}</strong>
                  <small>
                    In {formatMoney(roundCurrency(accountRangeTotals.transferIn))} · Out{' '}
                    {formatMoney(roundCurrency(accountRangeTotals.transferOut))} · {accountRangeTotals.transferCount} legs
                  </small>
                </div>
                <div className="print-kpi">
                  <p>Reconciliation summary</p>
                  <strong>{formatPercent(accountReconciliationCompletionRate)}</strong>
                  <small>
                    {accountRangeTotals.reconciled}/{accountRangeTotals.reconciliationChecks} reconciled ·{' '}
                    {formatMoney(roundCurrency(accountRangeTotals.unmatchedDeltaAbs))} abs delta
                  </small>
                </div>
              </div>

              <div className="print-table-wrap">
                <table className="print-table">
                  <thead>
                    <tr>
                      <th scope="col">Account</th>
                      <th scope="col">Type</th>
                      <th scope="col">Opening</th>
                      <th scope="col">Closing</th>
                      <th scope="col">Available</th>
                      <th scope="col">Transfers</th>
                      <th scope="col">Reconciliation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountReportRows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          {row.name}
                          <br />
                          <small>{row.liquid ? 'liquid' : 'non-liquid'}</small>
                        </td>
                        <td>{row.type}</td>
                        <td className="table-amount">{formatMoney(row.openingBalance)}</td>
                        <td className="table-amount">{formatMoney(row.closingBalance)}</td>
                        <td className="table-amount">{formatMoney(row.available)}</td>
                        <td className="table-amount">
                          In {formatMoney(row.transferIn)} / Out {formatMoney(row.transferOut)} / Net {formatMoney(row.transferNet)}
                        </td>
                        <td>
                          {row.reconciledCount}/{row.reconciliationChecks} reconciled
                          <br />
                          <small>
                            pending {row.pendingCount} · delta abs {formatMoney(row.unmatchedDeltaAbs)}
                            {row.latestCycle ? ` · latest ${row.latestCycle}` : ''}
                          </small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 className="print-subhead">Transfer Summary (Range)</h3>
              {transferRowsInRange.length === 0 ? (
                <p className="print-subnote">No transfers in selected range.</p>
              ) : (
                <div className="print-table-wrap">
                  <table className="print-table">
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">From</th>
                        <th scope="col">To</th>
                        <th scope="col">Amount</th>
                        <th scope="col">Reference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transferRowsInRange.map((entry) => (
                        <tr key={entry._id}>
                          <td>{entry.transferDate}</td>
                          <td>{accountNameById.get(String(entry.sourceAccountId)) ?? 'Deleted account'}</td>
                          <td>{accountNameById.get(String(entry.destinationAccountId)) ?? 'Deleted account'}</td>
                          <td className="table-amount">{formatMoney(entry.amount)}</td>
                          <td>{entry.reference?.trim() || entry.note?.trim() || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h3 className="print-subhead">Reconciliation Summary (Range)</h3>
              {reconciliationRowsInRange.length === 0 ? (
                <p className="print-subnote">No reconciliation checks in selected range.</p>
              ) : (
                <div className="print-table-wrap">
                  <table className="print-table">
                    <thead>
                      <tr>
                        <th scope="col">Account</th>
                        <th scope="col">Cycle</th>
                        <th scope="col">Statement</th>
                        <th scope="col">Ledger end</th>
                        <th scope="col">Delta</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reconciliationRowsInRange.map((entry) => (
                        <tr key={entry._id}>
                          <td>{accountNameById.get(String(entry.accountId)) ?? 'Deleted account'}</td>
                          <td>{entry.cycleMonth}</td>
                          <td>
                            {formatMoney(entry.statementStartBalance)} {'->'} {formatMoney(entry.statementEndBalance)}
                          </td>
                          <td className="table-amount">{formatMoney(entry.ledgerEndBalance)}</td>
                          <td className="table-amount">{formatMoney(entry.unmatchedDelta)}</td>
                          <td>{entry.reconciled ? 'reconciled' : 'pending'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      ) : null}

      {config.includeGoals ? (
        <section className="print-section print-section--component">
          <h2>Goals</h2>
          {goalMetricsRows.length === 0 ? (
            <p className="print-subnote">No goal entries.</p>
          ) : (
            <>
              <div className="print-kpi-grid">
                <div className="print-kpi">
                  <p>Goals tracked</p>
                  <strong>{goalMetricsRows.length}</strong>
                  <small>{goalMetricsRows.filter((goal) => goal.progressPercent >= 100).length} completed</small>
                </div>
                <div className="print-kpi">
                  <p>Average health score</p>
                  <strong>{goalHealthAverage === null ? 'n/a' : `${Math.round(goalHealthAverage)}/100`}</strong>
                  <small>{goalAtRiskCount} at-risk goals</small>
                </div>
                <div className="print-kpi">
                  <p>Contributions in range</p>
                  <strong>{formatMoney(goalContributionTotalInRange)}</strong>
                  <small>{goalContributionEventsInRange.length} contribution events</small>
                </div>
                <div className="print-kpi">
                  <p>Goal events in range</p>
                  <strong>{goalEventsInRange.length}</strong>
                  <small>contributions, edits, pauses, target changes</small>
                </div>
              </div>

              <h3 className="print-subhead">Goal Portfolio</h3>
              <div className="print-table-wrap">
                <table className="print-table">
                  <thead>
                    <tr>
                      <th scope="col">Goal</th>
                      <th scope="col">Type</th>
                      <th scope="col">Target</th>
                      <th scope="col">Current</th>
                      <th scope="col">Remaining</th>
                      <th scope="col">Progress</th>
                      <th scope="col">Health</th>
                      <th scope="col">Contribution pace</th>
                      <th scope="col">Forecast</th>
                    </tr>
                  </thead>
                  <tbody>
                    {goalMetricsRows.map((goal) => {
                      const contributionStats = goalContributionsByGoalId.get(String(goal._id))
                      const forecastLabel =
                        goal.predictedCompletionDate && typeof goal.predictedDaysDeltaToTarget === 'number'
                          ? `${goal.predictedCompletionDate} (${goal.predictedDaysDeltaToTarget > 0 ? `+${goal.predictedDaysDeltaToTarget}d` : `${goal.predictedDaysDeltaToTarget}d`})`
                          : goal.predictedCompletionDate ?? 'n/a'
                      const statusLabel =
                        goal.progressPercent >= 100
                          ? 'completed'
                          : goal.pausedValue
                            ? 'paused'
                            : typeof goal.predictedDaysDeltaToTarget === 'number' && goal.predictedDaysDeltaToTarget > 0
                              ? 'at risk'
                              : 'on track'
                      return (
                        <tr key={goal._id}>
                          <td>
                            {goal.title}
                            {goal.pausedValue ? ` (paused${goal.pauseReasonValue ? `: ${goal.pauseReasonValue}` : ''})` : ''}
                          </td>
                          <td>{goal.goalTypeValue.replace(/_/g, ' ')}</td>
                          <td className="table-amount">{formatMoney(goal.targetAmount)}</td>
                          <td className="table-amount">{formatMoney(goal.currentAmount)}</td>
                          <td className="table-amount">{formatMoney(goal.remaining)}</td>
                          <td>
                            {formatPercent(goal.progressPercent / 100)} · {statusLabel}
                          </td>
                          <td>{goal.goalHealthScore === null ? 'n/a' : `${goal.goalHealthScore}/100`}</td>
                          <td>
                            {formatMoney(goal.plannedMonthlyContribution)} planned / {formatMoney(goal.requiredMonthlyContribution)} required
                            {contributionStats ? ` · ${contributionStats.count} logs / ${formatMoney(roundCurrency(contributionStats.amount))}` : ''}
                          </td>
                          <td>{forecastLabel}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <h3 className="print-subhead">Milestones + Completion Forecasts</h3>
              <div className="print-table-wrap">
                <table className="print-table">
                  <thead>
                    <tr>
                      <th scope="col">Goal</th>
                      <th scope="col">25%</th>
                      <th scope="col">50%</th>
                      <th scope="col">75%</th>
                      <th scope="col">100%</th>
                      <th scope="col">Predicted completion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {goalMetricsRows.map((goal) => {
                      const milestoneMap = new Map(goal.milestones.map((milestone) => [milestone.percent, milestone] as const))
                      const milestoneCell = (percent: 25 | 50 | 75 | 100) => {
                        const milestone = milestoneMap.get(percent)
                        if (!milestone) return 'n/a'
                        return `${milestone.targetDate}${milestone.achieved ? ' ✓' : ''}`
                      }
                      return (
                        <tr key={`goal-milestone-print-${goal._id}`}>
                          <td>{goal.title}</td>
                          <td>{milestoneCell(25)}</td>
                          <td>{milestoneCell(50)}</td>
                          <td>{milestoneCell(75)}</td>
                          <td>{milestoneCell(100)}</td>
                          <td>
                            {goal.predictedCompletionDate ?? 'n/a'}
                            {typeof goal.predictedDaysDeltaToTarget === 'number'
                              ? ` (${goal.predictedDaysDeltaToTarget > 0 ? `+${goal.predictedDaysDeltaToTarget}d late` : goal.predictedDaysDeltaToTarget < 0 ? `${Math.abs(goal.predictedDaysDeltaToTarget)}d early` : 'on time'})`
                              : ''}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <h3 className="print-subhead">Contribution History (Range)</h3>
              {goalContributionEventsInRange.length === 0 ? (
                <p className="print-subnote">No goal contributions recorded in selected range.</p>
              ) : (
                <div className="print-table-wrap">
                  <table className="print-table">
                    <thead>
                      <tr>
                        <th scope="col">When</th>
                        <th scope="col">Goal</th>
                        <th scope="col">Amount</th>
                        <th scope="col">Source</th>
                        <th scope="col">Balance</th>
                        <th scope="col">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {goalContributionEventsInRange.map((event) => (
                        <tr key={`goal-contribution-${event._id}`}>
                          <td>{cycleDateLabel.format(new Date(typeof event.occurredAt === 'number' ? event.occurredAt : event.createdAt))}</td>
                          <td>{goalNameById.get(String(event.goalId)) ?? 'Deleted goal'}</td>
                          <td className="table-amount">{formatMoney(typeof event.amountDelta === 'number' ? event.amountDelta : 0)}</td>
                          <td>{event.source.replace(/_/g, ' ')}</td>
                          <td>
                            {typeof event.beforeCurrentAmount === 'number' && typeof event.afterCurrentAmount === 'number'
                              ? `${formatMoney(event.beforeCurrentAmount)} -> ${formatMoney(event.afterCurrentAmount)}`
                              : '-'}
                          </td>
                          <td>{event.note?.trim() || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h3 className="print-subhead">Annual Goal Review Snapshot ({annualGoalReviewSummary.year})</h3>
              <div className="print-kpi-grid">
                <div className="print-kpi">
                  <p>Start funded</p>
                  <strong>{formatMoney(annualGoalReviewSummary.startTotal)}</strong>
                  <small>estimated opening of active goals</small>
                </div>
                <div className="print-kpi">
                  <p>End funded</p>
                  <strong>{formatMoney(annualGoalReviewSummary.endTotal)}</strong>
                  <small>current active goal funding</small>
                </div>
                <div className="print-kpi">
                  <p>Progress delta</p>
                  <strong>{formatMoney(annualGoalReviewSummary.progressDeltaTotal)}</strong>
                  <small>net change this year</small>
                </div>
                <div className="print-kpi">
                  <p>Contribution total</p>
                  <strong>{formatMoney(annualGoalReviewSummary.contributionTotal)}</strong>
                  <small>{annualGoalReviewSummary.eventCount} events logged</small>
                </div>
              </div>
              {annualGoalReviewRows.length === 0 ? (
                <p className="print-subnote">No annual goal review rows available.</p>
              ) : (
                <div className="print-table-wrap">
                  <table className="print-table">
                    <thead>
                      <tr>
                        <th scope="col">Goal</th>
                        <th scope="col">Start</th>
                        <th scope="col">End</th>
                        <th scope="col">Progress delta</th>
                        <th scope="col">Contributions</th>
                        <th scope="col">Events</th>
                      </tr>
                    </thead>
                    <tbody>
                      {annualGoalReviewRows.slice(0, 24).map((row) => (
                        <tr key={`goal-annual-review-${row.id}`}>
                          <td>{row.title}</td>
                          <td className="table-amount">{formatMoney(row.startAmount)}</td>
                          <td className="table-amount">{formatMoney(row.endAmount)}</td>
                          <td className="table-amount">{formatMoney(row.progressDelta)}</td>
                          <td className="table-amount">{formatMoney(row.contributionAmount)}</td>
                          <td>{row.eventCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {config.includeAuditLogs ? (
                <>
                  <h3 className="print-subhead">Goal Event History (Range)</h3>
                  {goalEventsInRange.length === 0 ? (
                    <p className="print-subnote">No goal events in selected range.</p>
                  ) : (
                    <div className="print-table-wrap">
                      <table className="print-table">
                        <thead>
                          <tr>
                            <th scope="col">When</th>
                            <th scope="col">Goal</th>
                            <th scope="col">Event</th>
                            <th scope="col">Source</th>
                            <th scope="col">Change</th>
                            <th scope="col">Detail</th>
                          </tr>
                        </thead>
                        <tbody>
                          {goalEventsInRange.slice(0, 200).map((event) => {
                            const metadata = parseAuditJson<Record<string, unknown>>(event.metadataJson)
                            const metadataTitle =
                              typeof metadata?.title === 'string' && metadata.title.trim().length > 0 ? metadata.title.trim() : null
                            const title = goalNameById.get(String(event.goalId)) ?? metadataTitle ?? 'Deleted goal'
                            const detailParts: string[] = []
                            if (typeof event.beforeTargetAmount === 'number' && typeof event.afterTargetAmount === 'number') {
                              detailParts.push(`${formatMoney(event.beforeTargetAmount)} -> ${formatMoney(event.afterTargetAmount)}`)
                            }
                            if (typeof event.beforeTargetDate === 'string' && typeof event.afterTargetDate === 'string') {
                              detailParts.push(`${event.beforeTargetDate} -> ${event.afterTargetDate}`)
                            }
                            if (event.pausedBefore !== undefined || event.pausedAfter !== undefined) {
                              detailParts.push(`paused ${String(event.pausedBefore ?? false)} -> ${String(event.pausedAfter ?? false)}`)
                            }
                            if (event.note?.trim()) {
                              detailParts.push(event.note.trim())
                            }
                            return (
                              <tr key={`goal-event-history-print-${event._id}`}>
                                <td>{cycleDateLabel.format(new Date(typeof event.occurredAt === 'number' ? event.occurredAt : event.createdAt))}</td>
                                <td>{title}</td>
                                <td>{goalEventTypeLabel(event.eventType)}</td>
                                <td>{event.source.replace(/_/g, ' ')}</td>
                                <td>
                                  {typeof event.amountDelta === 'number'
                                    ? `${event.amountDelta >= 0 ? '+' : ''}${formatMoney(event.amountDelta)}`
                                    : typeof event.beforeCurrentAmount === 'number' && typeof event.afterCurrentAmount === 'number'
                                      ? `${formatMoney(event.beforeCurrentAmount)} -> ${formatMoney(event.afterCurrentAmount)}`
                                      : '-'}
                                </td>
                                <td>{detailParts.length > 0 ? detailParts.join(' · ') : '-'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {config.includeReconcile ? (
        <section className="print-section print-section--component">
          <h2>Reconcile</h2>
          <div className="print-kpi-grid">
            <div className="print-kpi">
              <p>Reconciliation completion</p>
              <strong>{formatPercent(rangeKpis.reconciliationCompletionRate)}</strong>
              <small>{rangeKpis.purchaseCount} purchases in selected range</small>
            </div>
            <div className="print-kpi">
              <p>Match accuracy</p>
              <strong>{formatPercent(reconcileMatchAccuracyRate)}</strong>
              <small>Quality-weighted from pending, duplicate, anomaly, and category gaps</small>
            </div>
            <div className="print-kpi">
              <p>Duplicate rate</p>
              <strong>{formatPercent(rangeKpis.purchaseCount > 0 ? rangeKpis.duplicateCount / rangeKpis.purchaseCount : 0)}</strong>
              <small>{rangeKpis.duplicateCount} duplicate groups in range</small>
            </div>
            <div className="print-kpi">
              <p>Anomaly rate</p>
              <strong>{formatPercent(rangeKpis.purchaseCount > 0 ? rangeKpis.anomalyCount / rangeKpis.purchaseCount : 0)}</strong>
              <small>{rangeKpis.anomalyCount} outlier rows detected</small>
            </div>
            <div className="print-kpi">
              <p>Close success rate</p>
              <strong>{formatPercent(reconcileCloseSuccessRate)}</strong>
              <small>{reconcileCloseCompletedCount} completed · {reconcileCloseFailedCount} failed close runs</small>
            </div>
          </div>

          <div className="print-kpi-grid">
            <div className="print-kpi">
              <p>Opening statement total</p>
              <strong>{formatMoney(roundCurrency(accountRangeTotals.opening))}</strong>
              <small>Summed from reconciliation statement starts in range</small>
            </div>
            <div className="print-kpi">
              <p>Closing statement total</p>
              <strong>{formatMoney(roundCurrency(accountRangeTotals.closing))}</strong>
              <small>Summed from reconciliation statement ends in range</small>
            </div>
            <div className="print-kpi">
              <p>Matched vs unmatched</p>
              <strong>
                {reconcileMatchedCount} / {reconcileUnmatchedCount}
              </strong>
              <small>matched (posted + reconciled) / unmatched (pending)</small>
            </div>
            <div className="print-kpi">
              <p>Unresolved items</p>
              <strong>{reconcileUnresolvedCount}</strong>
              <small>{formatMoney(reconcileUnresolvedValue)} pending + unmatched delta exposure</small>
            </div>
            <div className="print-kpi">
              <p>Exception rows</p>
              <strong>{reconciliationExceptionHistoryRows.length}</strong>
              <small>
                {purchasesByStatus.pending} pending · {rangeKpis.duplicateCount} duplicates · {rangeKpis.anomalyCount}{' '}
                anomalies
              </small>
            </div>
          </div>

          <h3 className="print-subhead">Month Close Outcomes (Range)</h3>
          {reconciliationMonthRows.length === 0 ? (
            <p className="print-subnote">No reconciliation close rows for selected range.</p>
          ) : (
            <div className="print-table-wrap">
              <table className="print-table">
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col">Opening</th>
                    <th scope="col">Closing</th>
                    <th scope="col">Matched</th>
                    <th scope="col">Unmatched</th>
                    <th scope="col">Unresolved value</th>
                    <th scope="col">Close status</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliationMonthRows.map((row) => (
                    <tr key={`reconcile-month-${row.monthKey}`}>
                      <td>{row.monthKey}</td>
                      <td className="table-amount">{row.openingBalance === null ? 'n/a' : formatMoney(row.openingBalance)}</td>
                      <td className="table-amount">{row.closingBalance === null ? 'n/a' : formatMoney(row.closingBalance)}</td>
                      <td>{row.matchedCount}</td>
                      <td>
                        {row.unmatchedCount}
                        {row.accountChecks > 0
                          ? ` · ${row.accountReconciled}/${row.accountChecks} account checks reconciled`
                          : ''}
                      </td>
                      <td className="table-amount">{formatMoney(row.pendingAmount + row.unresolvedDeltaAbs)}</td>
                      <td>
                        {row.closeStatus ?? 'open'}
                        {row.closeFailureReason ? ` (${row.closeFailureReason})` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="print-subhead">Exception History</h3>
          {reconciliationExceptionHistoryRows.length === 0 ? (
            <p className="print-subnote">No reconciliation exceptions in selected range.</p>
          ) : (
            <div className="print-table-wrap">
              <table className="print-table">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Month</th>
                    <th scope="col">Source</th>
                    <th scope="col">Event</th>
                    <th scope="col">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliationExceptionHistoryRows.map((row) => (
                    <tr key={`reconcile-exception-${row.id}`}>
                      <td>{cycleDateLabel.format(new Date(row.createdAt))}</td>
                      <td>{row.monthKey}</td>
                      <td>{row.source}</td>
                      <td>{row.event}</td>
                      <td>{row.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {config.includePlanning ? (
        <section className="print-section print-section--component">
          <h2>Planning</h2>
          <div className="print-kpi-grid">
            <div className="print-kpi">
              <p>Assumptions tracked</p>
              <strong>{planningAssumptionsRows.length}</strong>
              <small>{rangeMonths} month range</small>
            </div>
            <div className="print-kpi">
              <p>Variance rows</p>
              <strong>{planningVarianceRows.length}</strong>
              <small>
                Avg monthly purchases {formatMoney(avgMonthlyPurchases)}
              </small>
            </div>
            <div className="print-kpi">
              <p>Execution completion</p>
              <strong>{planningTaskCompletionPercent.toFixed(1)}%</strong>
              <small>
                {planningTasksDone}/{planningTasksInRange.length} tasks done
              </small>
            </div>
          </div>

          <h3 className="print-subhead">Assumptions</h3>
          {planningAssumptionsRows.length === 0 ? (
            <p className="print-subnote">No saved planning assumptions in this range.</p>
          ) : (
            <div className="print-table-wrap">
              <table className="print-table">
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col">Version</th>
                    <th scope="col">Expected Income</th>
                    <th scope="col">Fixed Commitments</th>
                    <th scope="col">Variable Cap</th>
                    <th scope="col">Planned Net</th>
                    <th scope="col">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {planningAssumptionsRows.map((row) => (
                    <tr key={`planning-assumption-${row.id}`}>
                      <td>{row.month}</td>
                      <td>
                        {row.versionKey}
                        {row.selected ? ' (selected)' : ''}
                      </td>
                      <td className="table-amount">{formatMoney(row.expectedIncome)}</td>
                      <td className="table-amount">{formatMoney(row.fixedCommitments)}</td>
                      <td className="table-amount">{formatMoney(row.variableSpendingCap)}</td>
                      <td className="table-amount">{formatMoney(row.plannedNet)}</td>
                      <td>{row.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="print-subhead">Forecast</h3>
          {planningForecastRows.length === 0 ? (
            <p className="print-subnote">No forecast windows available.</p>
          ) : (
            <div className="print-table-wrap">
              <table className="print-table">
                <thead>
                  <tr>
                    <th scope="col">Window</th>
                    <th scope="col">Projected Cash</th>
                    <th scope="col">Projected Net</th>
                    <th scope="col">Coverage</th>
                    <th scope="col">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {planningForecastRows.map((row) => (
                    <tr key={`planning-forecast-${row.days}`}>
                      <td>{row.days} days</td>
                      <td className="table-amount">{formatMoney(row.projectedCash)}</td>
                      <td className="table-amount">{formatMoney(row.projectedNet)}</td>
                      <td>{row.coverageMonths.toFixed(1)} months</td>
                      <td>{row.risk}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="print-subhead">Variance by Category</h3>
          {planningVarianceRows.length === 0 ? (
            <p className="print-subnote">No variance rows available in this range.</p>
          ) : (
            <div className="print-table-wrap">
              <table className="print-table">
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col">Planned</th>
                    <th scope="col">Actual</th>
                    <th scope="col">Variance</th>
                    <th scope="col">Variance %</th>
                  </tr>
                </thead>
                <tbody>
                  {planningVarianceRows.map((row) => (
                    <tr key={`planning-variance-${row.id}`}>
                      <td>{row.category}</td>
                      <td className="table-amount">{formatMoney(row.planned)}</td>
                      <td className="table-amount">{formatMoney(row.actual)}</td>
                      <td className="table-amount">{formatMoney(row.variance)}</td>
                      <td>{row.varianceRatePercent.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="print-subhead">Execution Tasks</h3>
          {planningTasksInRange.length === 0 ? (
            <p className="print-subnote">No planning execution tasks in this range.</p>
          ) : (
            <div className="print-table-wrap">
              <table className="print-table">
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col">Task</th>
                    <th scope="col">Category</th>
                    <th scope="col">Impact</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {planningTasksInRange.map((task) => (
                    <tr key={`planning-task-${task._id}`}>
                      <td>{task.month}</td>
                      <td>{task.title}</td>
                      <td>{task.category}</td>
                      <td className="table-amount">{formatMoney(task.impactAmount)}</td>
                      <td>{task.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="print-subhead">Planning Audit Trail</h3>
          {planningAuditRows.length === 0 ? (
            <p className="print-subnote">No planning audit events in this range.</p>
          ) : (
            <div className="print-table-wrap">
              <table className="print-table">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Entity</th>
                    <th scope="col">Action</th>
                    <th scope="col">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {planningAuditRows.map((event) => {
                    const metadata = parseAuditJson<Record<string, unknown>>(event.metadataJson)
                    const source = typeof metadata?.source === 'string' ? metadata.source : 'planning_tab'
                    return (
                      <tr key={`planning-audit-${event._id}`}>
                        <td>{cycleDateLabel.format(new Date(event.createdAt))}</td>
                        <td>{event.entityType}</td>
                        <td>{event.action}</td>
                        <td>{source}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {config.includePurchases ? (
        <section className="print-section print-section--major">
          <h2>Purchases</h2>
          {purchasesInRange.length === 0 ? (
            <p className="print-subnote">No purchases in this range.</p>
          ) : (
            <>
              {sortedMonthKeys.map((key) => {
                const monthPurchases = (monthGroups.get(key) ?? []).slice().sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate))
                const monthTotal = sumBy(monthPurchases, (purchase) => purchase.amount)
                return (
                  <div className="print-month-group" key={key}>
                    <div className="print-month-head">
                      <h3>{formatMonthLabel(locale, key)}</h3>
                      <p className="print-month-total">{formatMoney(monthTotal)}</p>
                    </div>
                    <div className="print-table-wrap">
                      <table className="print-table">
                        <thead>
                          <tr>
                            <th scope="col">Date</th>
                            <th scope="col">Item</th>
                            <th scope="col">Category</th>
                            <th scope="col">Status</th>
                            <th scope="col">Amount</th>
                            {config.includeNotes ? <th scope="col">Notes</th> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {monthPurchases.map((purchase) => (
                            <tr key={purchase._id}>
                              <td>{purchase.purchaseDate}</td>
                              <td>{purchase.item}</td>
                              <td>{purchase.category}</td>
                              <td>{purchase.reconciliationStatus ?? 'posted'}</td>
                              <td className="table-amount">{formatMoney(purchase.amount)}</td>
                              {config.includeNotes ? <td>{purchase.notes ?? ''}</td> : null}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
              <p className="print-subnote">
                Cleared purchases total for range: <strong>{formatMoney(purchasesTotal)}</strong> · Pending value:{' '}
                <strong>{formatMoney(pendingPurchasesTotal)}</strong>
              </p>

              <h3 className="print-subhead">Purchase mutation history</h3>
              {purchaseMutationHistoryRows.length === 0 ? (
                <p className="print-subnote">No purchase mutation history in selected range.</p>
              ) : (
                <div className="print-table-wrap">
                  <table className="print-table">
                    <thead>
                      <tr>
                        <th scope="col">When</th>
                        <th scope="col">Action</th>
                        <th scope="col">Source</th>
                        <th scope="col">Entity</th>
                        <th scope="col">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseMutationHistoryRows.map((row) => (
                        <tr key={`purchase-audit-${row.id}`}>
                          <td>{cycleDateLabel.format(new Date(row.createdAt))}</td>
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
            </>
          )}
        </section>
      ) : null}

      {filteredAuditLogs ? (
        <section className="print-section print-section--major">
          <h2>Audit Logs</h2>

          <h3 className="print-subhead">Monthly Cycle Runs</h3>
          {filteredAuditLogs.monthlyCycleRuns.length === 0 ? (
            <p className="print-subnote">No cycle runs in range.</p>
          ) : (
            <div className="print-table-wrap">
              <table className="print-table">
                <thead>
                  <tr>
                    <th scope="col">Cycle Key</th>
                    <th scope="col">Source</th>
                    <th scope="col">Status</th>
                    <th scope="col">Updated</th>
                    <th scope="col">When</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAuditLogs.monthlyCycleRuns.map((run) => (
                    <tr key={run._id}>
                      <td>{run.cycleKey}</td>
                      <td>{run.source}</td>
                      <td>{run.status}</td>
                      <td>
                        {run.updatedCards} cards / {run.updatedLoans} loans
                      </td>
                      <td>{cycleDateLabel.format(new Date(run.ranAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="print-subhead">Purchase Month Close Runs</h3>
          {filteredAuditLogs.purchaseMonthCloseRuns.length === 0 ? (
            <p className="print-subnote">No purchase month close runs in range.</p>
          ) : (
            <div className="print-table-wrap">
              <table className="print-table">
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col">Source</th>
                    <th scope="col">Status</th>
                    <th scope="col">Pending</th>
                    <th scope="col">Quality flags</th>
                    <th scope="col">When</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAuditLogs.purchaseMonthCloseRuns.map((run) => (
                    <tr key={run._id}>
                      <td>{run.monthKey}</td>
                      <td>{run.source}</td>
                      <td>{run.status}</td>
                      <td>
                        {run.pendingCount} ({formatMoney(run.pendingAmount)})
                      </td>
                      <td>
                        {run.duplicateCount} dup · {run.anomalyCount} anomalies · {run.missingCategoryCount} missing
                      </td>
                      <td>{cycleDateLabel.format(new Date(run.ranAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="print-subhead">Cycle Audit Logs</h3>
          {filteredAuditLogs.cycleAuditLogs.length === 0 ? (
            <p className="print-subnote">No cycle audit logs in range.</p>
          ) : (
            <div className="print-table-wrap">
              <table className="print-table">
                <thead>
                  <tr>
                    <th scope="col">Cycle Key</th>
                    <th scope="col">Source</th>
                    <th scope="col">Cards</th>
                    <th scope="col">Loans</th>
                    <th scope="col">When</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAuditLogs.cycleAuditLogs.map((entry) => (
                    <tr key={entry._id}>
                      <td>{entry.cycleKey}</td>
                      <td>{entry.source}</td>
                      <td>
                        {entry.updatedCards} ({entry.cardCyclesApplied} cycles)
                      </td>
                      <td>
                        {entry.updatedLoans} ({entry.loanCyclesApplied} cycles)
                      </td>
                      <td>{cycleDateLabel.format(new Date(entry.ranAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="print-subhead">Finance Audit Events</h3>
          {filteredAuditLogs.financeAuditEvents.length === 0 ? (
            <p className="print-subnote">No finance audit events in range.</p>
          ) : (
            <div className="print-table-wrap">
              <table className="print-table">
                <thead>
                  <tr>
                    <th scope="col">Entity</th>
                    <th scope="col">Action</th>
                    <th scope="col">When</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAuditLogs.financeAuditEvents.map((event) => (
                    <tr key={event._id}>
                      <td>
                        {event.entityType} ({event.entityId})
                      </td>
                      <td>{event.action}</td>
                      <td>{cycleDateLabel.format(new Date(event.createdAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </article>
  )
}
