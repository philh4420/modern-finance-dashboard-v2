import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { nextDateForCadence, toIsoDate } from '../lib/cadenceDates'
import { resolveIncomeNetAmount } from '../lib/incomeMath'
import type {
  AccountEditDraft,
  AccountEntry,
  AccountForm,
  AccountId,
  AccountPurpose,
  AccountPurposeOption,
  AccountReconciliationCheckEntry,
  AccountReconciliationForm,
  AccountTransferEntry,
  AccountTransferForm,
  AccountType,
  AccountTypeOption,
  BillEntry,
  CardEntry,
  CardMinimumPaymentType,
  CustomCadenceUnit,
  IncomeEntry,
  LoanEntry,
  LoanMinimumPaymentType,
} from './financeTypes'

type AccountSortKey =
  | 'name_asc'
  | 'available_desc'
  | 'available_asc'
  | 'ledger_desc'
  | 'type_asc'
  | 'purpose_asc'
  | 'risk_first'

type AccountHealthStatus = 'healthy' | 'watch' | 'critical'
type AccountHealthFilter = 'all' | AccountHealthStatus

type LatestReconciliationSummary = {
  cycleMonth: string
  unmatchedDelta: number
  reconciled: boolean
  updatedAt: number
}

type TrendWindowDays = 30 | 90 | 365

type AccountTrendWindow = {
  inflow: number
  outflow: number
  net: number
  volatility: number
  volatilityRatio: number
  eventCount: number
}

type AccountTrendSummary = {
  windows: Record<TrendWindowDays, AccountTrendWindow>
  lastActivityAt: number | null
}

type AccountForecastSummary = {
  minProjectedBalance: number
  minProjectedDate: string
  projectedEnd14: number
  projectedEnd30: number
  inflow7: number
  outflow7: number
  inflow14: number
  outflow14: number
  inflow30: number
  outflow30: number
  dueEvents7: number
  dueEvents14: number
  dueEvents30: number
  lowBalanceDays: number
  overdrawnDays: number
  maxDailySwing: number
}

type ForecastSeverity = 'healthy' | 'warning' | 'critical'

type AccountForecastSeriesPoint = {
  day: number
  date: string
  balance: number
  risk: ForecastSeverity
}

type AccountForecastEvent = {
  id: string
  kind: 'income' | 'bill' | 'card' | 'loan'
  label: string
  accountId: string | null
  accountName: string
  amount: number
  date: Date
  isoDate: string
  daysAway: number
}

type AccountRiskAlertSeverity = 'watch' | 'warning' | 'critical'

type AccountRiskAlert = {
  id: string
  severity: AccountRiskAlertSeverity
  title: string
  detail: string
  accountId?: string
}

type AccountFlowEvent = {
  id: string
  accountId: string
  amount: number
  occurredAt: number
  source: 'transfer' | 'reconciliation'
}

type AccountBaseRow = {
  entry: AccountEntry
  purpose: AccountPurpose
  availableBalance: number
  ledgerBalance: number
  pendingBalance: number
  isLiability: boolean
  latestReconciliation: LatestReconciliationSummary | null
}

type AccountRowView = {
  entry: AccountEntry
  purpose: AccountPurpose
  availableBalance: number
  ledgerBalance: number
  pendingBalance: number
  healthScore: number
  healthStatus: AccountHealthStatus
  healthNote: string
  isLiability: boolean
  latestReconciliation: LatestReconciliationSummary | null
  trend: AccountTrendSummary
  forecast: AccountForecastSummary
}

type AccountActivityEvent =
  | {
      id: string
      kind: 'transfer'
      occurredAt: number
      title: string
      detail: string
      amount: number
      status: 'posted'
    }
  | {
      id: string
      kind: 'reconciliation'
      occurredAt: number
      title: string
      detail: string
      amount: number
      status: 'reconciled' | 'pending'
    }

type AccountsTabProps = {
  accounts: AccountEntry[]
  incomes: IncomeEntry[]
  bills: BillEntry[]
  cards: CardEntry[]
  loans: LoanEntry[]
  accountTransfers: AccountTransferEntry[]
  accountReconciliationChecks: AccountReconciliationCheckEntry[]
  accountForm: AccountForm
  setAccountForm: Dispatch<SetStateAction<AccountForm>>
  accountEditId: AccountId | null
  setAccountEditId: Dispatch<SetStateAction<AccountId | null>>
  accountEditDraft: AccountEditDraft
  setAccountEditDraft: Dispatch<SetStateAction<AccountEditDraft>>
  onAddAccount: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onDeleteAccount: (id: AccountId) => Promise<void>
  saveAccountEdit: () => Promise<void>
  startAccountEdit: (entry: AccountEntry) => void
  accountTransferForm: AccountTransferForm
  setAccountTransferForm: Dispatch<SetStateAction<AccountTransferForm>>
  submitAccountTransfer: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  accountReconciliationForm: AccountReconciliationForm
  setAccountReconciliationForm: Dispatch<SetStateAction<AccountReconciliationForm>>
  submitAccountReconciliation: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  projectedMonthlyNet: number
  accountTypeOptions: AccountTypeOption[]
  accountPurposeOptions: AccountPurposeOption[]
  accountTypeLabel: (value: AccountType) => string
  accountPurposeLabel: (value: AccountPurpose) => string
  formatMoney: (value: number) => string
}

const purposeColorClass = (purpose: AccountPurpose) => {
  switch (purpose) {
    case 'emergency':
      return 'pill pill--good'
    case 'bills':
      return 'pill pill--warning'
    case 'goals':
      return 'pill pill--neutral'
    case 'debt':
      return 'pill pill--critical'
    default:
      return 'pill pill--neutral'
  }
}

const healthClass = (status: AccountHealthStatus) => {
  switch (status) {
    case 'healthy':
      return 'pill pill--good'
    case 'watch':
      return 'pill pill--warning'
    default:
      return 'pill pill--critical'
  }
}

const parseFloatOrZero = (value: string) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const roundCurrency = (value: number) => Math.round(value * 100) / 100
const msPerDay = 86_400_000
const trendWindowDays: readonly TrendWindowDays[] = [30, 90, 365]

const toNonNegative = (value: number | undefined | null) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(value, 0) : 0

const toStartOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)

const parseIsoDateAtLocalMidnight = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null
  }
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

const clampPercent = (value: number) => Math.min(Math.max(value, 0), 100)

const normalizeCardMinimumPaymentType = (
  value: CardMinimumPaymentType | undefined | null,
): CardMinimumPaymentType => (value === 'percent_plus_interest' ? 'percent_plus_interest' : 'fixed')

const normalizeLoanMinimumPaymentType = (
  value: LoanMinimumPaymentType | undefined | null,
): LoanMinimumPaymentType => (value === 'percent_plus_interest' ? 'percent_plus_interest' : 'fixed')

const toMonthlyOccurrences = (
  cadence: IncomeEntry['cadence'],
  customInterval?: number,
  customUnit?: CustomCadenceUnit,
) => {
  switch (cadence) {
    case 'weekly':
      return 52 / 12
    case 'biweekly':
      return 26 / 12
    case 'monthly':
      return 1
    case 'quarterly':
      return 1 / 3
    case 'yearly':
      return 1 / 12
    case 'custom':
      if (!customInterval || !customUnit || customInterval <= 0) {
        return 0
      }
      if (customUnit === 'days') return 365.2425 / (customInterval * 12)
      if (customUnit === 'weeks') return 365.2425 / (customInterval * 7 * 12)
      if (customUnit === 'months') return 1 / customInterval
      return 1 / (customInterval * 12)
    case 'one_time':
    default:
      return 0
  }
}

const resolveLoanWorkingBalances = (loan: LoanEntry) => {
  const hasExplicitComponents = loan.principalBalance !== undefined || loan.accruedInterest !== undefined
  const principalBalance = Math.max(
    hasExplicitComponents ? toNonNegative(loan.principalBalance) : toNonNegative(loan.balance),
    0,
  )
  const accruedInterest = Math.max(hasExplicitComponents ? toNonNegative(loan.accruedInterest) : 0, 0)
  const balance = Math.max(hasExplicitComponents ? principalBalance + accruedInterest : toNonNegative(loan.balance), 0)

  return {
    principalBalance: roundCurrency(principalBalance),
    accruedInterest: roundCurrency(accruedInterest),
    balance: roundCurrency(balance),
  }
}

const normalizePositiveInteger = (value: number | undefined | null) =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined

const resolveLoanSubscriptionOutstanding = (loan: LoanEntry) => {
  const subscriptionCost = roundCurrency(Math.max(toNonNegative(loan.subscriptionCost), 0))
  if (subscriptionCost <= 0) {
    return 0
  }

  const normalizedConfiguredPaymentCount = normalizePositiveInteger(loan.subscriptionPaymentCount)

  if (loan.subscriptionOutstanding !== undefined) {
    const current = roundCurrency(Math.max(toNonNegative(loan.subscriptionOutstanding), 0))
    if (
      normalizedConfiguredPaymentCount === undefined &&
      current <= subscriptionCost + 0.000001 &&
      subscriptionCost > 0
    ) {
      return roundCurrency(subscriptionCost * 12)
    }
    return current
  }

  const fallbackPaymentCount = normalizedConfiguredPaymentCount ?? 12
  return roundCurrency(subscriptionCost * fallbackPaymentCount)
}

const estimateCardDuePayment = (card: CardEntry) => {
  const statementBalance = toNonNegative(card.statementBalance ?? card.usedLimit)
  const apr = toNonNegative(card.interestRate)
  const interestAmount = statementBalance * (apr > 0 ? apr / 100 / 12 : 0)
  const dueBalance = statementBalance + interestAmount
  const minimumPaymentType = normalizeCardMinimumPaymentType(card.minimumPaymentType)
  const minimumPayment = toNonNegative(card.minimumPayment)
  const minimumPaymentPercent = clampPercent(toNonNegative(card.minimumPaymentPercent))
  const extraPayment = toNonNegative(card.extraPayment)

  const minimumDueRaw =
    minimumPaymentType === 'percent_plus_interest'
      ? statementBalance * (minimumPaymentPercent / 100) + interestAmount
      : minimumPayment
  const minimumDue = Math.min(dueBalance, Math.max(minimumDueRaw, 0))
  const plannedPayment = Math.min(dueBalance, minimumDue + extraPayment)

  return roundCurrency(plannedPayment)
}

const estimateLoanDuePayment = (loan: LoanEntry) => {
  const working = resolveLoanWorkingBalances(loan)
  if (working.balance <= 0) {
    return 0
  }

  const occurrencesPerMonth = toMonthlyOccurrences(loan.cadence, loan.customInterval, loan.customUnit)
  const intervalMonths = occurrencesPerMonth > 0 ? 1 / occurrencesPerMonth : 1
  const apr = toNonNegative(loan.interestRate)
  const monthlyRate = apr > 0 ? apr / 100 / 12 : 0
  const interestAmount = working.balance * monthlyRate * intervalMonths
  const dueBalance = working.balance + interestAmount
  const minimumPaymentType = normalizeLoanMinimumPaymentType(loan.minimumPaymentType)
  const minimumPayment = toNonNegative(loan.minimumPayment)
  const minimumPaymentPercent = clampPercent(toNonNegative(loan.minimumPaymentPercent))
  const extraPayment = toNonNegative(loan.extraPayment)
  const minimumDueRaw =
    minimumPaymentType === 'percent_plus_interest'
      ? working.principalBalance * (minimumPaymentPercent / 100) + (working.accruedInterest + interestAmount)
      : minimumPayment
  const minimumDue = Math.min(dueBalance, Math.max(minimumDueRaw, 0))
  const plannedPayment = Math.min(dueBalance, minimumDue + extraPayment)

  return roundCurrency(plannedPayment)
}

const estimateLoanSubscriptionDue = (loan: LoanEntry) => {
  const subscriptionCost = roundCurrency(Math.max(toNonNegative(loan.subscriptionCost), 0))
  if (subscriptionCost <= 0) {
    return 0
  }
  const outstanding = resolveLoanSubscriptionOutstanding(loan)
  return roundCurrency(Math.min(outstanding, subscriptionCost > 0 ? subscriptionCost : outstanding))
}

const collectCadenceOccurrences = (args: {
  cadence: IncomeEntry['cadence']
  createdAt: number
  dayOfMonth?: number
  customInterval?: number
  customUnit?: CustomCadenceUnit
  payDateAnchor?: string
  now: Date
  horizonDays: number
}) => {
  const today = toStartOfDay(args.now)
  let cursor = today
  const occurrences: Array<{ date: Date; daysAway: number }> = []
  let iterations = 0

  while (iterations < 64) {
    iterations += 1
    const nextDate = nextDateForCadence({
      cadence: args.cadence,
      createdAt: args.createdAt,
      dayOfMonth: args.dayOfMonth,
      customInterval: args.customInterval,
      customUnit: args.customUnit,
      payDateAnchor: args.payDateAnchor,
      now: cursor,
    })

    if (!nextDate) {
      break
    }

    const normalized = toStartOfDay(nextDate)
    const daysAway = Math.round((normalized.getTime() - today.getTime()) / msPerDay)
    if (daysAway < 0) {
      cursor = addDays(normalized, 1)
      continue
    }
    if (daysAway > args.horizonDays) {
      break
    }

    occurrences.push({ date: normalized, daysAway })
    if (args.cadence === 'one_time') {
      break
    }
    cursor = addDays(normalized, 1)
  }

  return occurrences
}

const windowLabel = (days: TrendWindowDays) => `${days}d`

const formatShortDate = (date: Date, locale = 'en-GB') =>
  new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date)

const riskSeverityRank: Record<AccountRiskAlertSeverity, number> = {
  critical: 3,
  warning: 2,
  watch: 1,
}

const forecastRiskFromBalance = (balance: number): ForecastSeverity => {
  if (balance < 0) return 'critical'
  if (balance < 150) return 'warning'
  return 'healthy'
}

const emptyTrendWindow = (): AccountTrendWindow => ({
  inflow: 0,
  outflow: 0,
  net: 0,
  volatility: 0,
  volatilityRatio: 0,
  eventCount: 0,
})

const emptyForecastSummary = (startingBalance = 0, todayIso = toIsoDate(new Date())): AccountForecastSummary => ({
  minProjectedBalance: roundCurrency(startingBalance),
  minProjectedDate: todayIso,
  projectedEnd14: roundCurrency(startingBalance),
  projectedEnd30: roundCurrency(startingBalance),
  inflow7: 0,
  outflow7: 0,
  inflow14: 0,
  outflow14: 0,
  inflow30: 0,
  outflow30: 0,
  dueEvents7: 0,
  dueEvents14: 0,
  dueEvents30: 0,
  lowBalanceDays: startingBalance < 150 ? 1 : 0,
  overdrawnDays: startingBalance < 0 ? 1 : 0,
  maxDailySwing: 0,
})

const resolvePurpose = (entry: AccountEntry): AccountPurpose => entry.purpose ?? (entry.type === 'debt' ? 'debt' : 'spending')

const resolveBalances = (entry: AccountEntry) => {
  const availableBalance = roundCurrency(entry.balance)
  const hasLedger = entry.ledgerBalance !== undefined
  const hasPending = entry.pendingBalance !== undefined

  if (!hasLedger && !hasPending) {
    return {
      availableBalance,
      ledgerBalance: availableBalance,
      pendingBalance: 0,
    }
  }

  const pendingBalance = hasPending
    ? roundCurrency(entry.pendingBalance ?? 0)
    : roundCurrency(availableBalance - (entry.ledgerBalance ?? availableBalance))
  const ledgerBalance = hasLedger
    ? roundCurrency(entry.ledgerBalance ?? availableBalance)
    : roundCurrency(availableBalance - pendingBalance)

  return {
    availableBalance: roundCurrency(ledgerBalance + pendingBalance),
    ledgerBalance,
    pendingBalance,
  }
}

const evaluateHealth = (
  entry: AccountEntry,
  balances: { availableBalance: number; ledgerBalance: number; pendingBalance: number },
  latestReconciliation: LatestReconciliationSummary | null,
  trend30: AccountTrendWindow,
  forecast: AccountForecastSummary,
) => {
  const available = balances.availableBalance
  const ledger = balances.ledgerBalance
  const pending = balances.pendingBalance
  const isDebt = entry.type === 'debt'
  const pendingOutflow = Math.max(-pending, 0)
  const baseline = Math.max(Math.abs(ledger), 1)
  const pendingStress = pendingOutflow / baseline
  const currentCycle = new Date().toISOString().slice(0, 7)
  const absDelta = latestReconciliation ? Math.abs(latestReconciliation.unmatchedDelta) : 0

  let score = 100
  if (isDebt) score -= 38
  if (available < 0) score -= 45
  else if (available < 150) score -= 28
  else if (available < 600) score -= 14
  if (pendingStress >= 0.4) score -= 24
  else if (pendingStress >= 0.2) score -= 12
  if (!entry.liquid && available < 250) score -= 8
  if (trend30.volatilityRatio >= 0.55) score -= 18
  else if (trend30.volatilityRatio >= 0.3) score -= 10
  const netPressure = trend30.net < 0 ? Math.abs(trend30.net) / Math.max(Math.abs(available), 150) : 0
  if (netPressure >= 1) score -= 18
  else if (netPressure >= 0.45) score -= 10
  if (forecast.overdrawnDays > 0) score -= 24
  else if (forecast.minProjectedBalance < 0) score -= 20
  else if (forecast.minProjectedBalance < 150) score -= 10
  const outflowCoverageGap = forecast.outflow7 - (Math.max(available, 0) + forecast.inflow7)
  if (outflowCoverageGap > 0.005) score -= 14
  else if (forecast.outflow7 > Math.max(Math.max(available, 0) * 0.65 + forecast.inflow7, 0)) score -= 7
  if (forecast.dueEvents7 >= 3) score -= 4
  if (!latestReconciliation) score -= 8
  else {
    if (latestReconciliation.cycleMonth !== currentCycle) score -= 6
    if (!latestReconciliation.reconciled) score -= 14
    if (absDelta >= 100) score -= 24
    else if (absDelta >= 25) score -= 12
    else if (latestReconciliation.reconciled && absDelta <= 0.01) score += 4
  }
  score = Math.max(0, Math.min(100, Math.round(score)))

  const healthStatus: AccountHealthStatus = score >= 75 ? 'healthy' : score >= 50 ? 'watch' : 'critical'

  let healthNote = 'Stable balance profile'
  if (forecast.overdrawnDays > 0) {
    healthNote = `Overdraft risk in ${forecast.overdrawnDays} projected day${forecast.overdrawnDays === 1 ? '' : 's'}`
  } else if (available < 0) {
    healthNote = 'Overdrawn position'
  } else if (forecast.minProjectedBalance < 150) {
    healthNote = `Low forecast floor ${roundCurrency(forecast.minProjectedBalance)} by ${forecast.minProjectedDate}`
  } else if (trend30.volatilityRatio >= 0.55) {
    healthNote = 'High 30d volatility'
  } else if (trend30.net < -50) {
    healthNote = '30d net outflow pressure'
  } else if (pendingStress >= 0.4) {
    healthNote = 'Heavy pending outflow'
  } else if (latestReconciliation && !latestReconciliation.reconciled) {
    healthNote = `Unreconciled ${latestReconciliation.cycleMonth}`
  } else if (latestReconciliation && absDelta >= 25) {
    healthNote = `Delta ${roundCurrency(absDelta)} on ${latestReconciliation.cycleMonth}`
  } else if (!latestReconciliation) {
    healthNote = 'No reconciliation logged'
  }

  return {
    healthScore: score,
    healthStatus,
    healthNote,
  }
}

const byRecency = (left: { occurredAt: number }, right: { occurredAt: number }) => right.occurredAt - left.occurredAt

export function AccountsTab({
  accounts,
  incomes,
  bills,
  cards,
  loans,
  accountTransfers,
  accountReconciliationChecks,
  accountForm,
  setAccountForm,
  accountEditId,
  setAccountEditId,
  accountEditDraft,
  setAccountEditDraft,
  onAddAccount,
  onDeleteAccount,
  saveAccountEdit,
  startAccountEdit,
  accountTransferForm,
  setAccountTransferForm,
  submitAccountTransfer,
  accountReconciliationForm,
  setAccountReconciliationForm,
  submitAccountReconciliation,
  projectedMonthlyNet,
  accountTypeOptions,
  accountPurposeOptions,
  accountTypeLabel,
  accountPurposeLabel,
  formatMoney,
}: AccountsTabProps) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | AccountType>('all')
  const [purposeFilter, setPurposeFilter] = useState<'all' | AccountPurpose>('all')
  const [liquidityFilter, setLiquidityFilter] = useState<'all' | 'liquid' | 'non_liquid'>('all')
  const [healthFilter, setHealthFilter] = useState<AccountHealthFilter>('all')
  const [sortKey, setSortKey] = useState<AccountSortKey>('name_asc')
  const [forecastWindowDays, setForecastWindowDays] = useState<14 | 30>(14)
  const [expandedAccountIds, setExpandedAccountIds] = useState<string[]>([])

  const accountNameById = useMemo(
    () => new Map<string, string>(accounts.map((entry) => [String(entry._id), entry.name])),
    [accounts],
  )

  const latestReconciliationByAccount = useMemo(() => {
    const map = new Map<string, LatestReconciliationSummary>()
    const sorted = [...accountReconciliationChecks].sort(
      (left, right) => (right.updatedAt ?? right.createdAt) - (left.updatedAt ?? left.createdAt),
    )
    sorted.forEach((entry) => {
      const key = String(entry.accountId)
      if (!map.has(key)) {
        map.set(key, {
          cycleMonth: entry.cycleMonth,
          unmatchedDelta: entry.unmatchedDelta,
          reconciled: entry.reconciled,
          updatedAt: entry.updatedAt ?? entry.createdAt,
        })
      }
    })
    return map
  }, [accountReconciliationChecks])

  const accountBaseRows = useMemo<AccountBaseRow[]>(() => {
    return accounts.map((entry) => {
      const purpose = resolvePurpose(entry)
      const balances = resolveBalances(entry)
      const latestReconciliation = latestReconciliationByAccount.get(String(entry._id)) ?? null
      const isLiability = entry.type === 'debt' || balances.availableBalance < 0
      return {
        entry,
        purpose,
        availableBalance: balances.availableBalance,
        ledgerBalance: balances.ledgerBalance,
        pendingBalance: balances.pendingBalance,
        latestReconciliation,
        isLiability,
      }
    })
  }, [accounts, latestReconciliationByAccount])

  const defaultFundingAccountId = useMemo(() => {
    const nonDebtRows = accountBaseRows.filter((row) => row.entry.type !== 'debt')
    const liquidNonDebtRows = nonDebtRows.filter((row) => row.entry.liquid)
    const rankedLiquid = [...liquidNonDebtRows].sort(
      (left, right) =>
        right.availableBalance - left.availableBalance ||
        left.entry.name.localeCompare(right.entry.name, undefined, { sensitivity: 'base' }),
    )

    const preferredBills = rankedLiquid.find((row) => row.purpose === 'bills')
    if (preferredBills) {
      return String(preferredBills.entry._id)
    }
    if (rankedLiquid[0]) {
      return String(rankedLiquid[0].entry._id)
    }

    const rankedAll = [...nonDebtRows].sort(
      (left, right) =>
        right.availableBalance - left.availableBalance ||
        left.entry.name.localeCompare(right.entry.name, undefined, { sensitivity: 'base' }),
    )
    if (rankedAll[0]) {
      return String(rankedAll[0].entry._id)
    }

    return accountBaseRows[0]?.entry._id ? String(accountBaseRows[0].entry._id) : null
  }, [accountBaseRows])

  const defaultIncomeAccountId = useMemo(() => {
    const nonDebtRows = accountBaseRows.filter((row) => row.entry.type !== 'debt')
    const liquidNonDebtRows = nonDebtRows.filter((row) => row.entry.liquid)
    const rankedIncome = [...liquidNonDebtRows].sort((left, right) => {
      const leftScore = left.purpose === 'spending' ? 2 : left.purpose === 'bills' ? 1 : 0
      const rightScore = right.purpose === 'spending' ? 2 : right.purpose === 'bills' ? 1 : 0
      return (
        rightScore - leftScore ||
        right.availableBalance - left.availableBalance ||
        left.entry.name.localeCompare(right.entry.name, undefined, { sensitivity: 'base' })
      )
    })

    if (rankedIncome[0]) {
      return String(rankedIncome[0].entry._id)
    }

    return defaultFundingAccountId
  }, [accountBaseRows, defaultFundingAccountId])

  const accountFlowEvents = useMemo<AccountFlowEvent[]>(() => {
    const flowEvents: AccountFlowEvent[] = []

    accountTransfers.forEach((entry) => {
      const occurredAt = parseIsoDateAtLocalMidnight(entry.transferDate)?.getTime() ?? entry.createdAt
      const amount = roundCurrency(Math.max(toNonNegative(entry.amount), 0))
      if (amount <= 0) {
        return
      }

      flowEvents.push({
        id: `transfer-out:${entry._id}`,
        accountId: String(entry.sourceAccountId),
        amount: roundCurrency(-amount),
        occurredAt,
        source: 'transfer',
      })
      flowEvents.push({
        id: `transfer-in:${entry._id}`,
        accountId: String(entry.destinationAccountId),
        amount,
        occurredAt,
        source: 'transfer',
      })
    })

    accountReconciliationChecks.forEach((entry) => {
      if (Math.abs(entry.unmatchedDelta) <= 0.005) {
        return
      }
      flowEvents.push({
        id: `reconcile:${entry._id}`,
        accountId: String(entry.accountId),
        amount: roundCurrency(entry.unmatchedDelta),
        occurredAt: entry.updatedAt ?? entry.createdAt,
        source: 'reconciliation',
      })
    })

    return flowEvents
  }, [accountReconciliationChecks, accountTransfers])

  const accountTrendById = useMemo(() => {
    const today = toStartOfDay(new Date())
    const currentTimestamp = today.getTime()
    const trendById = new Map<string, AccountTrendSummary>()

    accountBaseRows.forEach((row) => {
      const accountId = String(row.entry._id)
      const accountEvents = accountFlowEvents
        .filter((event) => event.accountId === accountId)
        .sort((left, right) => left.occurredAt - right.occurredAt)

      const windows: Record<TrendWindowDays, AccountTrendWindow> = {
        30: emptyTrendWindow(),
        90: emptyTrendWindow(),
        365: emptyTrendWindow(),
      }

      trendWindowDays.forEach((windowDays) => {
        const cutoff = currentTimestamp - (windowDays - 1) * msPerDay
        const windowEvents = accountEvents.filter((event) => event.occurredAt >= cutoff)
        const inflow = windowEvents.reduce((sum, event) => sum + (event.amount > 0 ? event.amount : 0), 0)
        const outflow = windowEvents.reduce((sum, event) => sum + (event.amount < 0 ? Math.abs(event.amount) : 0), 0)
        const net = inflow - outflow

        const dailySeries = Array.from({ length: windowDays }, (_, offset) => {
          const dayDate = addDays(today, -(windowDays - 1 - offset))
          const dayIso = toIsoDate(dayDate)
          return windowEvents
            .filter((event) => toIsoDate(new Date(event.occurredAt)) === dayIso)
            .reduce((sum, event) => sum + event.amount, 0)
        })

        const mean = dailySeries.length > 0 ? dailySeries.reduce((sum, value) => sum + value, 0) / dailySeries.length : 0
        const variance =
          dailySeries.length > 1
            ? dailySeries.reduce((sum, value) => sum + (value - mean) ** 2, 0) / dailySeries.length
            : 0
        const volatility = Math.sqrt(Math.max(variance, 0))
        const volatilityRatio = volatility / Math.max(Math.abs(row.availableBalance), 150)

        windows[windowDays] = {
          inflow: roundCurrency(inflow),
          outflow: roundCurrency(outflow),
          net: roundCurrency(net),
          volatility: roundCurrency(volatility),
          volatilityRatio,
          eventCount: windowEvents.length,
        }
      })

      trendById.set(accountId, {
        windows,
        lastActivityAt: accountEvents.length > 0 ? accountEvents[accountEvents.length - 1].occurredAt : null,
      })
    })

    return trendById
  }, [accountBaseRows, accountFlowEvents])

  const accountForecastModel = useMemo(() => {
    const today = toStartOfDay(new Date())
    const todayIso = toIsoDate(today)
    const horizonDays = 30
    const accountsById = new Map(accountBaseRows.map((row) => [String(row.entry._id), row]))
    const forecastEvents: AccountForecastEvent[] = []

    const pushEvent = (args: {
      id: string
      kind: AccountForecastEvent['kind']
      label: string
      accountId: string | null
      date: Date
      daysAway: number
      amount: number
    }) => {
      if (!Number.isFinite(args.amount) || Math.abs(args.amount) <= 0.005) {
        return
      }
      const resolvedAccountId = args.accountId && accountsById.has(args.accountId) ? args.accountId : null
      forecastEvents.push({
        id: args.id,
        kind: args.kind,
        label: args.label,
        accountId: resolvedAccountId,
        accountName: resolvedAccountId ? accountsById.get(resolvedAccountId)?.entry.name ?? 'Unknown account' : 'Cash pool',
        amount: roundCurrency(args.amount),
        date: args.date,
        isoDate: toIsoDate(args.date),
        daysAway: args.daysAway,
      })
    }

    incomes.forEach((entry) => {
      const occurrences = collectCadenceOccurrences({
        cadence: entry.cadence,
        createdAt: entry.createdAt,
        dayOfMonth: entry.receivedDay,
        customInterval: entry.customInterval,
        customUnit: entry.customUnit,
        payDateAnchor: entry.payDateAnchor,
        now: today,
        horizonDays,
      })

      const amount = roundCurrency(resolveIncomeNetAmount(entry))
      const destinationAccountId =
        entry.destinationAccountId && accountsById.has(String(entry.destinationAccountId))
          ? String(entry.destinationAccountId)
          : defaultIncomeAccountId

      occurrences.forEach((occurrence, index) => {
        pushEvent({
          id: `income:${entry._id}:${index + 1}`,
          kind: 'income',
          label: entry.source,
          accountId: destinationAccountId,
          date: occurrence.date,
          daysAway: occurrence.daysAway,
          amount,
        })
      })
    })

    bills.forEach((entry) => {
      const occurrences = collectCadenceOccurrences({
        cadence: entry.cadence,
        createdAt: entry.createdAt,
        dayOfMonth: entry.dueDay,
        customInterval: entry.customInterval,
        customUnit: entry.customUnit,
        now: today,
        horizonDays,
      })

      const linkedAccountId =
        entry.linkedAccountId && accountsById.has(String(entry.linkedAccountId))
          ? String(entry.linkedAccountId)
          : defaultFundingAccountId

      occurrences.forEach((occurrence, index) => {
        pushEvent({
          id: `bill:${entry._id}:${index + 1}`,
          kind: 'bill',
          label: entry.name,
          accountId: linkedAccountId,
          date: occurrence.date,
          daysAway: occurrence.daysAway,
          amount: -Math.abs(roundCurrency(entry.amount)),
        })
      })
    })

    cards.forEach((entry) => {
      const occurrences = collectCadenceOccurrences({
        cadence: 'monthly',
        createdAt: entry.createdAt,
        dayOfMonth: entry.dueDay ?? 21,
        now: today,
        horizonDays,
      })
      const dueAmount = estimateCardDuePayment(entry)
      occurrences.forEach((occurrence, index) => {
        pushEvent({
          id: `card:${entry._id}:${index + 1}`,
          kind: 'card',
          label: `${entry.name} due`,
          accountId: defaultFundingAccountId,
          date: occurrence.date,
          daysAway: occurrence.daysAway,
          amount: -Math.abs(dueAmount),
        })
      })
    })

    loans.forEach((entry) => {
      const occurrences = collectCadenceOccurrences({
        cadence: entry.cadence,
        createdAt: entry.createdAt,
        dayOfMonth: entry.dueDay,
        customInterval: entry.customInterval,
        customUnit: entry.customUnit,
        now: today,
        horizonDays,
      })
      const dueAmount = roundCurrency(estimateLoanDuePayment(entry) + estimateLoanSubscriptionDue(entry))
      occurrences.forEach((occurrence, index) => {
        pushEvent({
          id: `loan:${entry._id}:${index + 1}`,
          kind: 'loan',
          label: `${entry.name} payment`,
          accountId: defaultFundingAccountId,
          date: occurrence.date,
          daysAway: occurrence.daysAway,
          amount: -Math.abs(dueAmount),
        })
      })
    })

    const sortedEvents = forecastEvents.sort((left, right) => {
      if (left.isoDate !== right.isoDate) return left.isoDate.localeCompare(right.isoDate)
      if (left.amount !== right.amount) return left.amount - right.amount
      return left.label.localeCompare(right.label, undefined, { sensitivity: 'base' })
    })

    const summaries = new Map<string, AccountForecastSummary>()
    accountBaseRows.forEach((row) => {
      const accountId = String(row.entry._id)
      const rowEvents = sortedEvents.filter((event) => event.accountId === accountId)
      const dailyDelta = new Map<string, number>()
      rowEvents.forEach((event) => {
        dailyDelta.set(event.isoDate, roundCurrency((dailyDelta.get(event.isoDate) ?? 0) + event.amount))
      })

      const baseSummary = emptyForecastSummary(row.availableBalance, todayIso)

      rowEvents.forEach((event) => {
        const absoluteAmount = Math.abs(event.amount)
        const isInflow = event.amount > 0
        if (event.daysAway <= 7) {
          if (isInflow) baseSummary.inflow7 = roundCurrency(baseSummary.inflow7 + absoluteAmount)
          else baseSummary.outflow7 = roundCurrency(baseSummary.outflow7 + absoluteAmount)
          baseSummary.dueEvents7 += 1
        }
        if (event.daysAway <= 14) {
          if (isInflow) baseSummary.inflow14 = roundCurrency(baseSummary.inflow14 + absoluteAmount)
          else baseSummary.outflow14 = roundCurrency(baseSummary.outflow14 + absoluteAmount)
          baseSummary.dueEvents14 += 1
        }
        if (event.daysAway <= 30) {
          if (isInflow) baseSummary.inflow30 = roundCurrency(baseSummary.inflow30 + absoluteAmount)
          else baseSummary.outflow30 = roundCurrency(baseSummary.outflow30 + absoluteAmount)
          baseSummary.dueEvents30 += 1
        }
      })

      let running = row.availableBalance
      let projectedEnd14 = running
      let projectedEnd30 = running
      let minBalance = running
      let minDate = todayIso
      let lowDays = running < 150 ? 1 : 0
      let overdrawnDays = running < 0 ? 1 : 0
      let maxDailySwing = 0

      for (let day = 1; day <= horizonDays; day += 1) {
        const dayIso = toIsoDate(addDays(today, day))
        const delta = roundCurrency(dailyDelta.get(dayIso) ?? 0)
        maxDailySwing = Math.max(maxDailySwing, Math.abs(delta))
        running = roundCurrency(running + delta)
        if (day <= 14) {
          projectedEnd14 = running
        }
        projectedEnd30 = running
        if (running < minBalance) {
          minBalance = running
          minDate = dayIso
        }
        if (running < 150) {
          lowDays += 1
        }
        if (running < 0) {
          overdrawnDays += 1
        }
      }

      summaries.set(accountId, {
        ...baseSummary,
        minProjectedBalance: roundCurrency(minBalance),
        minProjectedDate: minDate,
        projectedEnd14: roundCurrency(projectedEnd14),
        projectedEnd30: roundCurrency(projectedEnd30),
        lowBalanceDays: lowDays,
        overdrawnDays,
        maxDailySwing: roundCurrency(maxDailySwing),
      })
    })

    const liquidAccountIds = new Set(
      accountBaseRows.filter((row) => row.entry.liquid && row.entry.type !== 'debt').map((row) => String(row.entry._id)),
    )
    const liquidStart = roundCurrency(
      accountBaseRows.reduce((sum, row) => {
        if (row.entry.liquid && row.entry.type !== 'debt') {
          return sum + row.availableBalance
        }
        return sum
      }, 0),
    )
    const liquidDailyDelta = new Map<string, number>()
    sortedEvents.forEach((event) => {
      if (!event.accountId || !liquidAccountIds.has(event.accountId)) {
        return
      }
      liquidDailyDelta.set(event.isoDate, roundCurrency((liquidDailyDelta.get(event.isoDate) ?? 0) + event.amount))
    })

    let runningLiquid = liquidStart
    const liquidSeries: AccountForecastSeriesPoint[] = [
      {
        day: 0,
        date: todayIso,
        balance: runningLiquid,
        risk: forecastRiskFromBalance(runningLiquid),
      },
    ]
    for (let day = 1; day <= horizonDays; day += 1) {
      const dayIso = toIsoDate(addDays(today, day))
      runningLiquid = roundCurrency(runningLiquid + (liquidDailyDelta.get(dayIso) ?? 0))
      liquidSeries.push({
        day,
        date: dayIso,
        balance: runningLiquid,
        risk: forecastRiskFromBalance(runningLiquid),
      })
    }

    return {
      byAccount: summaries,
      events: sortedEvents,
      liquidStart,
      liquidSeries,
    }
  }, [accountBaseRows, bills, cards, defaultFundingAccountId, defaultIncomeAccountId, incomes, loans])

  const accountRows = useMemo<AccountRowView[]>(() => {
    return accountBaseRows.map((row) => {
      const accountId = String(row.entry._id)
      const trend = accountTrendById.get(accountId) ?? {
        windows: {
          30: emptyTrendWindow(),
          90: emptyTrendWindow(),
          365: emptyTrendWindow(),
        },
        lastActivityAt: null,
      }
      const forecast = accountForecastModel.byAccount.get(accountId) ?? emptyForecastSummary(row.availableBalance)
      const health = evaluateHealth(row.entry, row, row.latestReconciliation, trend.windows[30], forecast)

      return {
        ...row,
        healthScore: health.healthScore,
        healthStatus: health.healthStatus,
        healthNote: health.healthNote,
        trend,
        forecast,
      }
    })
  }, [accountBaseRows, accountForecastModel.byAccount, accountTrendById])

  const totals = useMemo(() => {
    const totalAvailable = accountRows.reduce((sum, row) => sum + row.availableBalance, 0)
    const liquidCash = accountRows.reduce((sum, row) => sum + (row.entry.liquid ? Math.max(row.availableBalance, 0) : 0), 0)
    const assetTotal = accountRows.reduce((sum, row) => {
      if (row.entry.type === 'debt') {
        return sum
      }
      return sum + Math.max(row.availableBalance, 0)
    }, 0)
    const debtTotal = accountRows.reduce((sum, row) => {
      if (row.entry.type === 'debt') {
        return sum + Math.abs(row.availableBalance)
      }
      return row.availableBalance < 0 ? sum + Math.abs(row.availableBalance) : sum
    }, 0)
    const averageHealth =
      accountRows.length > 0 ? Math.round(accountRows.reduce((sum, row) => sum + row.healthScore, 0) / accountRows.length) : 100
    const unreconciledCount = accountRows.filter((row) => row.latestReconciliation && !row.latestReconciliation.reconciled).length

    return {
      totalAvailable,
      liquidCash,
      assetTotal,
      debtTotal,
      netContribution: roundCurrency(assetTotal - debtTotal),
      averageHealth,
      unreconciledCount,
    }
  }, [accountRows])

  const purposeMix = useMemo(() => {
    const totalsByPurpose = new Map<AccountPurpose, number>()
    accountRows.forEach((row) => {
      if (row.isLiability || row.availableBalance <= 0) {
        return
      }
      totalsByPurpose.set(row.purpose, (totalsByPurpose.get(row.purpose) ?? 0) + row.availableBalance)
    })

    const total = [...totalsByPurpose.values()].reduce((sum, value) => sum + value, 0)
    const rows = [...totalsByPurpose.entries()]
      .map(([purpose, amount]) => ({
        purpose,
        amount: roundCurrency(amount),
        sharePercent: total > 0 ? (amount / total) * 100 : 0,
      }))
      .sort((left, right) => right.amount - left.amount)

    return {
      rows,
      total: roundCurrency(total),
    }
  }, [accountRows])

  const visibleAccounts = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = accountRows.filter((row) => {
      const typeMatches = typeFilter === 'all' ? true : row.entry.type === typeFilter
      const purposeMatches = purposeFilter === 'all' ? true : row.purpose === purposeFilter
      const liquidityMatches =
        liquidityFilter === 'all' ? true : liquidityFilter === 'liquid' ? row.entry.liquid : !row.entry.liquid
      const healthMatches = healthFilter === 'all' ? true : row.healthStatus === healthFilter
      const searchMatches =
        query.length === 0
          ? true
          : `${row.entry.name} ${row.entry.type} ${row.purpose} ${accountTypeLabel(row.entry.type)} ${accountPurposeLabel(
                row.purpose,
              )}`
              .toLowerCase()
              .includes(query)

      return typeMatches && purposeMatches && liquidityMatches && healthMatches && searchMatches
    })

    return filtered.sort((left, right) => {
      switch (sortKey) {
        case 'name_asc':
          return left.entry.name.localeCompare(right.entry.name, undefined, { sensitivity: 'base' })
        case 'available_desc':
          return right.availableBalance - left.availableBalance
        case 'available_asc':
          return left.availableBalance - right.availableBalance
        case 'ledger_desc':
          return right.ledgerBalance - left.ledgerBalance
        case 'type_asc':
          return accountTypeLabel(left.entry.type).localeCompare(accountTypeLabel(right.entry.type), undefined, {
            sensitivity: 'base',
          })
        case 'purpose_asc':
          return accountPurposeLabel(left.purpose).localeCompare(accountPurposeLabel(right.purpose), undefined, {
            sensitivity: 'base',
          })
        case 'risk_first': {
          const severity = (status: AccountHealthStatus) => {
            if (status === 'critical') return 0
            if (status === 'watch') return 1
            return 2
          }
          return (
            severity(left.healthStatus) - severity(right.healthStatus) ||
            left.healthScore - right.healthScore ||
            left.entry.name.localeCompare(right.entry.name, undefined, { sensitivity: 'base' })
          )
        }
        default:
          return 0
      }
    })
  }, [
    accountPurposeLabel,
    accountRows,
    accountTypeLabel,
    healthFilter,
    liquidityFilter,
    purposeFilter,
    search,
    sortKey,
    typeFilter,
  ])

  const accountRiskAlerts = useMemo<AccountRiskAlert[]>(() => {
    const now = Date.now()
    const alerts: AccountRiskAlert[] = []

    accountRows.forEach((row) => {
      const accountId = String(row.entry._id)
      const forecast = row.forecast
      const trend30 = row.trend.windows[30]
      const activityAgeDays =
        row.trend.lastActivityAt !== null ? Math.floor((now - row.trend.lastActivityAt) / msPerDay) : null

      if (forecast.overdrawnDays > 0 || forecast.minProjectedBalance < 0) {
        alerts.push({
          id: `alert-overdraft-${accountId}`,
          severity: 'critical',
          accountId,
          title: `${row.entry.name}: projected overdraft risk`,
          detail: `${forecast.overdrawnDays} projected day(s) below zero. Lowest ${formatMoney(
            forecast.minProjectedBalance,
          )} on ${forecast.minProjectedDate}.`,
        })
      } else if (forecast.minProjectedBalance < 150) {
        alerts.push({
          id: `alert-low-balance-${accountId}`,
          severity: 'warning',
          accountId,
          title: `${row.entry.name}: low-balance forecast`,
          detail: `Lowest projected balance ${formatMoney(forecast.minProjectedBalance)} on ${forecast.minProjectedDate}.`,
        })
      }

      const coverageGap = forecast.outflow7 - (Math.max(row.availableBalance, 0) + forecast.inflow7)
      if (coverageGap > 0.005) {
        alerts.push({
          id: `alert-gap-${accountId}`,
          severity: coverageGap > Math.max(Math.abs(row.availableBalance) * 0.4, 80) ? 'critical' : 'warning',
          accountId,
          title: `${row.entry.name}: upcoming outflow coverage gap`,
          detail: `Next 7d outflow ${formatMoney(forecast.outflow7)} exceeds available + inflow by ${formatMoney(
            coverageGap,
          )}.`,
        })
      }

      if ((activityAgeDays === null || activityAgeDays >= 120) && Math.abs(row.availableBalance) > 25 && forecast.dueEvents30 === 0) {
        alerts.push({
          id: `alert-dormant-${accountId}`,
          severity: 'watch',
          accountId,
          title: `${row.entry.name}: dormant account`,
          detail:
            activityAgeDays === null
              ? 'No transfer/reconciliation activity logged yet.'
              : `No account flow activity in ${activityAgeDays} days.`,
        })
      }

      const swingThreshold = Math.max(Math.abs(row.availableBalance) * 0.35, 120)
      if (trend30.volatility >= swingThreshold || forecast.maxDailySwing >= swingThreshold) {
        alerts.push({
          id: `alert-volatility-${accountId}`,
          severity: trend30.volatility >= swingThreshold * 1.3 || forecast.maxDailySwing >= swingThreshold * 1.3 ? 'warning' : 'watch',
          accountId,
          title: `${row.entry.name}: unusual balance swings`,
          detail: `30d volatility ${formatMoney(trend30.volatility)} · max daily swing ${formatMoney(
            forecast.maxDailySwing,
          )}.`,
        })
      }
    })

    return alerts
      .sort((left, right) => {
        const severityDiff = riskSeverityRank[right.severity] - riskSeverityRank[left.severity]
        if (severityDiff !== 0) return severityDiff
        return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
      })
      .slice(0, 14)
  }, [accountRows, formatMoney])

  const accountRiskSummary = useMemo(
    () => ({
      critical: accountRiskAlerts.filter((alert) => alert.severity === 'critical').length,
      warning: accountRiskAlerts.filter((alert) => alert.severity === 'warning').length,
      watch: accountRiskAlerts.filter((alert) => alert.severity === 'watch').length,
    }),
    [accountRiskAlerts],
  )

  const forecastVisibleEvents = useMemo(
    () => accountForecastModel.events.filter((event) => event.daysAway <= forecastWindowDays),
    [accountForecastModel.events, forecastWindowDays],
  )

  const forecastSeriesVisible = useMemo(
    () => accountForecastModel.liquidSeries.slice(0, forecastWindowDays + 1),
    [accountForecastModel.liquidSeries, forecastWindowDays],
  )

  const forecastWindowSummary = useMemo(() => {
    if (forecastSeriesVisible.length === 0) {
      return {
        projectedEnd: accountForecastModel.liquidStart,
        minBalance: accountForecastModel.liquidStart,
      }
    }
    const projectedEnd = forecastSeriesVisible[forecastSeriesVisible.length - 1]?.balance ?? accountForecastModel.liquidStart
    const minBalance = forecastSeriesVisible.reduce((min, point) => Math.min(min, point.balance), projectedEnd)
    return {
      projectedEnd: roundCurrency(projectedEnd),
      minBalance: roundCurrency(minBalance),
    }
  }, [accountForecastModel.liquidStart, forecastSeriesVisible])

  const forecastLowRiskPoints = useMemo(
    () => forecastSeriesVisible.filter((point) => point.day > 0 && point.risk !== 'healthy').slice(0, 6),
    [forecastSeriesVisible],
  )

  const forecastChart = useMemo(() => {
    const points = forecastSeriesVisible
    if (points.length === 0) {
      return {
        width: 640,
        height: 180,
        line: '',
        zeroLineY: 90,
        points: [] as Array<{ x: number; y: number; day: number; risk: ForecastSeverity; balance: number }>,
      }
    }

    const width = 640
    const height = 180
    const minValue = Math.min(...points.map((point) => point.balance), 0)
    const maxValue = Math.max(...points.map((point) => point.balance), 0)
    const range = Math.max(maxValue - minValue, 1)
    const xFor = (index: number) => (points.length === 1 ? 24 : 24 + (index * (width - 48)) / (points.length - 1))
    const yFor = (value: number) => 16 + ((maxValue - value) / range) * (height - 32)

    const plotted = points.map((point, index) => ({
      x: xFor(index),
      y: yFor(point.balance),
      day: point.day,
      risk: point.risk,
      balance: point.balance,
    }))
    const line = plotted.map((point) => `${point.x},${point.y}`).join(' ')
    const zeroLineY = minValue <= 0 && maxValue >= 0 ? yFor(0) : null

    return {
      width,
      height,
      line,
      zeroLineY,
      points: plotted,
    }
  }, [forecastSeriesVisible])

  const forecastEventsWithRunningLiquid = useMemo(() => {
    const liquidAccountIds = new Set(
      accountRows.filter((row) => row.entry.liquid && row.entry.type !== 'debt').map((row) => String(row.entry._id)),
    )
    let runningLiquid = accountForecastModel.liquidStart

    return forecastVisibleEvents.map((event) => {
      if (event.accountId && liquidAccountIds.has(event.accountId)) {
        runningLiquid = roundCurrency(runningLiquid + event.amount)
      }
      return {
        ...event,
        runningLiquid: roundCurrency(runningLiquid),
      }
    })
  }, [accountForecastModel.liquidStart, accountRows, forecastVisibleEvents])

  const activityFeed = useMemo<AccountActivityEvent[]>(() => {
    const transferEvents: AccountActivityEvent[] = accountTransfers.map((entry) => {
      const sourceName = accountNameById.get(String(entry.sourceAccountId)) ?? 'Deleted account'
      const destinationName = accountNameById.get(String(entry.destinationAccountId)) ?? 'Deleted account'
      const occurredAt = new Date(`${entry.transferDate}T00:00:00`).getTime()
      return {
        id: `transfer:${entry._id}`,
        kind: 'transfer',
        occurredAt: Number.isFinite(occurredAt) ? occurredAt : entry.createdAt,
        title: `${sourceName} -> ${destinationName}`,
        detail: entry.reference?.trim().length ? entry.reference : entry.note?.trim() || 'Internal transfer',
        amount: entry.amount,
        status: 'posted',
      }
    })

    const reconciliationEvents: AccountActivityEvent[] = accountReconciliationChecks.map((entry) => {
      const accountName = accountNameById.get(String(entry.accountId)) ?? 'Deleted account'
      return {
        id: `reconcile:${entry._id}`,
        kind: 'reconciliation',
        occurredAt: entry.updatedAt ?? entry.createdAt,
        title: `${accountName} · ${entry.cycleMonth}`,
        detail: `Delta ${roundCurrency(entry.unmatchedDelta).toFixed(2)} · statement ${roundCurrency(entry.statementStartBalance).toFixed(2)} -> ${roundCurrency(entry.statementEndBalance).toFixed(2)}`,
        amount: Math.abs(entry.unmatchedDelta),
        status: entry.reconciled ? 'reconciled' : 'pending',
      }
    })

    return [...transferEvents, ...reconciliationEvents].sort(byRecency).slice(0, 20)
  }, [accountNameById, accountReconciliationChecks, accountTransfers])

  const sortedReconciliationChecks = useMemo(
    () =>
      [...accountReconciliationChecks]
        .sort((left, right) => (right.updatedAt ?? right.createdAt) - (left.updatedAt ?? left.createdAt))
        .slice(0, 24),
    [accountReconciliationChecks],
  )

  const hasFilters =
    search.length > 0 ||
    typeFilter !== 'all' ||
    purposeFilter !== 'all' ||
    liquidityFilter !== 'all' ||
    healthFilter !== 'all' ||
    sortKey !== 'name_asc'

  const formLedger = parseFloatOrZero(accountForm.ledgerBalance)
  const formPending = parseFloatOrZero(accountForm.pendingBalance)
  const formAvailable = roundCurrency(formLedger + formPending)

  const selectedReconciliationAccount = useMemo(
    () => accounts.find((entry) => String(entry._id) === accountReconciliationForm.accountId) ?? null,
    [accountReconciliationForm.accountId, accounts],
  )
  const selectedReconciliationBalances = selectedReconciliationAccount ? resolveBalances(selectedReconciliationAccount) : null
  const statementEndInput = parseFloatOrZero(accountReconciliationForm.statementEndBalance)
  const previewDelta = selectedReconciliationBalances
    ? roundCurrency(statementEndInput - selectedReconciliationBalances.ledgerBalance)
    : 0

  const toggleAccountExpanded = (accountId: string) => {
    setExpandedAccountIds((prev) =>
      prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId],
    )
  }

  const ensureAccountExpanded = (accountId: string) => {
    setExpandedAccountIds((prev) => (prev.includes(accountId) ? prev : [...prev, accountId]))
  }

  return (
    <section className="editor-grid accounts-tab-shell" aria-label="Account management">
      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Accounts</p>
            <h2>Add account</h2>
            <p className="panel-value">
              {accounts.length} account{accounts.length === 1 ? '' : 's'} · {formatMoney(totals.totalAvailable)} available total
            </p>
            <p className="subnote">{formatMoney(formAvailable)} available from current ledger + pending input.</p>
          </div>
        </header>

        <form className="entry-form entry-form--grid" onSubmit={onAddAccount} aria-describedby="account-form-hint">
          <div className="form-grid">
            <div className="form-field form-field--span2">
              <label htmlFor="account-name">Account name</label>
              <input
                id="account-name"
                value={accountForm.name}
                onChange={(event) => setAccountForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="account-type">Type</label>
              <select
                id="account-type"
                value={accountForm.type}
                onChange={(event) => {
                  const type = event.target.value as AccountType
                  setAccountForm((prev) => ({
                    ...prev,
                    type,
                    purpose: type === 'debt' ? 'debt' : prev.purpose === 'debt' ? 'spending' : prev.purpose,
                  }))
                }}
              >
                {accountTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="account-purpose">Purpose</label>
              <select
                id="account-purpose"
                value={accountForm.purpose}
                onChange={(event) =>
                  setAccountForm((prev) => ({
                    ...prev,
                    purpose: event.target.value as AccountPurpose,
                  }))
                }
              >
                {accountPurposeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="account-ledger-balance">Ledger balance</label>
              <input
                id="account-ledger-balance"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={accountForm.ledgerBalance}
                onChange={(event) =>
                  setAccountForm((prev) => ({
                    ...prev,
                    ledgerBalance: event.target.value,
                  }))
                }
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="account-pending-balance">Pending (+/-)</label>
              <input
                id="account-pending-balance"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={accountForm.pendingBalance}
                onChange={(event) =>
                  setAccountForm((prev) => ({
                    ...prev,
                    pendingBalance: event.target.value,
                  }))
                }
              />
            </div>

            <div className="form-field form-field--span2">
              <label className="checkbox-row" htmlFor="account-liquid">
                <input
                  id="account-liquid"
                  type="checkbox"
                  checked={accountForm.liquid}
                  onChange={(event) => setAccountForm((prev) => ({ ...prev, liquid: event.target.checked }))}
                />
                Include this account in liquid-cash calculations
              </label>
            </div>
          </div>

          <p id="account-form-hint" className="form-hint">
            Tip: ledger is booked balance, pending captures authorizations/in-flight changes, and available = ledger + pending.
          </p>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Save account
            </button>
          </div>
        </form>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Accounts</p>
            <h2>Current entries</h2>
            <p className="panel-value">{formatMoney(totals.netContribution)} net worth contribution</p>
            <p className="subnote">
              {formatMoney(totals.assetTotal)} assets · {formatMoney(totals.debtTotal)} debt · {totals.averageHealth}/100 health
            </p>
          </div>
          <div className="panel-actions">
            <input
              aria-label="Search accounts"
              placeholder="Search account name, type, or purpose…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              aria-label="Filter account type"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as 'all' | AccountType)}
            >
              <option value="all">All types</option>
              {accountTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter account purpose"
              value={purposeFilter}
              onChange={(event) => setPurposeFilter(event.target.value as 'all' | AccountPurpose)}
            >
              <option value="all">All purposes</option>
              {accountPurposeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter account liquidity"
              value={liquidityFilter}
              onChange={(event) => setLiquidityFilter(event.target.value as 'all' | 'liquid' | 'non_liquid')}
            >
              <option value="all">All liquidity</option>
              <option value="liquid">Liquid only</option>
              <option value="non_liquid">Non-liquid only</option>
            </select>
            <select
              aria-label="Filter account health"
              value={healthFilter}
              onChange={(event) => setHealthFilter(event.target.value as AccountHealthFilter)}
            >
              <option value="all">All health states</option>
              <option value="healthy">Healthy</option>
              <option value="watch">Watch</option>
              <option value="critical">Critical</option>
            </select>
            <select
              aria-label="Sort accounts"
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as AccountSortKey)}
            >
              <option value="name_asc">Name (A-Z)</option>
              <option value="available_desc">Available (high-low)</option>
              <option value="available_asc">Available (low-high)</option>
              <option value="ledger_desc">Ledger (high-low)</option>
              <option value="type_asc">Type (A-Z)</option>
              <option value="purpose_asc">Purpose (A-Z)</option>
              <option value="risk_first">Risk first</option>
            </select>
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              onClick={() => {
                setSearch('')
                setTypeFilter('all')
                setPurposeFilter('all')
                setLiquidityFilter('all')
                setHealthFilter('all')
                setSortKey('name_asc')
              }}
              disabled={!hasFilters}
            >
              Clear
            </button>
          </div>
        </header>

        <div className="accounts-summary-strip">
          <article className="accounts-summary-card">
            <p>Total assets</p>
            <strong>{formatMoney(totals.assetTotal)}</strong>
            <small>Positive non-debt balances</small>
          </article>
          <article className="accounts-summary-card">
            <p>Liquid cash</p>
            <strong>{formatMoney(totals.liquidCash)}</strong>
            <small>Accounts flagged as liquid</small>
          </article>
          <article className="accounts-summary-card accounts-summary-card--warning">
            <p>Debt balance</p>
            <strong>{formatMoney(totals.debtTotal)}</strong>
            <small>Debt accounts + negative balances</small>
          </article>
          <article className="accounts-summary-card">
            <p>Net contribution</p>
            <strong>{formatMoney(totals.netContribution)}</strong>
            <small>Assets minus debt exposure</small>
          </article>
          <article className="accounts-summary-card">
            <p>30-day net cashflow</p>
            <strong>{formatMoney(projectedMonthlyNet)}</strong>
            <small>Projected income minus commitments</small>
          </article>
        </div>

        {accounts.length === 0 ? (
          <p className="empty-state">No accounts added yet.</p>
        ) : visibleAccounts.length === 0 ? (
          <p className="empty-state">No accounts match this filter.</p>
        ) : (
          <>
            <p className="subnote">
              Showing {visibleAccounts.length} of {accounts.length} account{accounts.length === 1 ? '' : 's'}.
            </p>
            <div className="accounts-desktop-table">
              <div className="table-wrap table-wrap--card">
                <table className="data-table data-table--accounts" data-testid="accounts-table">
                <caption className="sr-only">Account entries</caption>
                <thead>
                  <tr>
                    <th scope="col">Account</th>
                    <th scope="col">Purpose & type</th>
                    <th scope="col">Balances</th>
                    <th scope="col">Health</th>
                    <th scope="col">Class</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAccounts.map((row) => {
                    const { entry } = row
                    const isEditing = accountEditId === entry._id
                    const draftLedger = parseFloatOrZero(accountEditDraft.ledgerBalance)
                    const draftPending = parseFloatOrZero(accountEditDraft.pendingBalance)
                    const draftBalances = {
                      availableBalance: roundCurrency(draftLedger + draftPending),
                      ledgerBalance: roundCurrency(draftLedger),
                      pendingBalance: roundCurrency(draftPending),
                    }
                    const forecastBalanceShift = roundCurrency(draftBalances.availableBalance - row.availableBalance)
                    const previewForecast: AccountForecastSummary = {
                      ...row.forecast,
                      minProjectedBalance: roundCurrency(row.forecast.minProjectedBalance + forecastBalanceShift),
                      projectedEnd14: roundCurrency(row.forecast.projectedEnd14 + forecastBalanceShift),
                      projectedEnd30: roundCurrency(row.forecast.projectedEnd30 + forecastBalanceShift),
                    }
                    const previewHealth = evaluateHealth(
                      { ...entry, type: accountEditDraft.type, liquid: accountEditDraft.liquid },
                      draftBalances,
                      row.latestReconciliation,
                      row.trend.windows[30],
                      previewForecast,
                    )
                    const previewPurpose = accountEditDraft.purpose
                    const activeHealth = isEditing ? previewHealth : row
                    const activePurpose = isEditing ? previewPurpose : row.purpose
                    const activeAvailable = isEditing ? draftBalances.availableBalance : row.availableBalance
                    const activeLedger = isEditing ? draftBalances.ledgerBalance : row.ledgerBalance
                    const activePending = isEditing ? draftBalances.pendingBalance : row.pendingBalance
                    const activeIsLiability =
                      isEditing ? accountEditDraft.type === 'debt' || activeAvailable < 0 : row.isLiability

                    return (
                      <tr key={entry._id} className={isEditing ? 'table-row--editing' : undefined}>
                        <td>
                          {isEditing ? (
                            <input
                              className="inline-input"
                              value={accountEditDraft.name}
                              onChange={(event) =>
                                setAccountEditDraft((prev) => ({
                                  ...prev,
                                  name: event.target.value,
                                }))
                              }
                            />
                          ) : (
                            <div className="accounts-row-title">
                              <strong>{entry.name}</strong>
                              <small>{entry.liquid ? 'liquid enabled' : 'non-liquid'}</small>
                            </div>
                          )}
                        </td>

                        <td>
                          {isEditing ? (
                            <div className="accounts-inline-grid">
                              <select
                                className="inline-select"
                                value={accountEditDraft.type}
                                onChange={(event) => {
                                  const nextType = event.target.value as AccountType
                                  setAccountEditDraft((prev) => ({
                                    ...prev,
                                    type: nextType,
                                    purpose: nextType === 'debt' ? 'debt' : prev.purpose === 'debt' ? 'spending' : prev.purpose,
                                  }))
                                }}
                              >
                                {accountTypeOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <select
                                className="inline-select"
                                value={accountEditDraft.purpose}
                                onChange={(event) =>
                                  setAccountEditDraft((prev) => ({
                                    ...prev,
                                    purpose: event.target.value as AccountPurpose,
                                  }))
                                }
                              >
                                {accountPurposeOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div className="accounts-row-pills">
                              <span className={purposeColorClass(activePurpose)}>{accountPurposeLabel(activePurpose)}</span>
                              <span className="pill pill--neutral">{accountTypeLabel(entry.type)}</span>
                            </div>
                          )}
                        </td>

                        <td className={`table-amount ${activeAvailable >= 0 ? 'amount-positive' : 'amount-negative'}`}>
                          {isEditing ? (
                            <div className="accounts-inline-grid accounts-inline-grid--balances">
                              <label>
                                <span>Ledger</span>
                                <input
                                  className="inline-input"
                                  type="number"
                                  inputMode="decimal"
                                  step="0.01"
                                  value={accountEditDraft.ledgerBalance}
                                  onChange={(event) =>
                                    setAccountEditDraft((prev) => ({
                                      ...prev,
                                      ledgerBalance: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <label>
                                <span>Pending</span>
                                <input
                                  className="inline-input"
                                  type="number"
                                  inputMode="decimal"
                                  step="0.01"
                                  value={accountEditDraft.pendingBalance}
                                  onChange={(event) =>
                                    setAccountEditDraft((prev) => ({
                                      ...prev,
                                      pendingBalance: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <p className="subnote">Available {formatMoney(activeAvailable)}</p>
                            </div>
                          ) : (
                            <div className="accounts-balance-stack">
                              <strong>{formatMoney(activeAvailable)}</strong>
                              <small>
                                Ledger {formatMoney(activeLedger)} · Pending {formatMoney(activePending)}
                              </small>
                            </div>
                          )}
                        </td>

                        <td>
                          <div className="accounts-health">
                            <span className={healthClass(activeHealth.healthStatus)}>
                              {activeHealth.healthStatus} {activeHealth.healthScore}/100
                            </span>
                            <small>{activeHealth.healthNote}</small>
                            {!isEditing && row.latestReconciliation ? (
                              <small>
                                {row.latestReconciliation.cycleMonth} ·{' '}
                                {row.latestReconciliation.reconciled ? 'reconciled' : 'pending'} · delta{' '}
                                {formatMoney(row.latestReconciliation.unmatchedDelta)}
                              </small>
                            ) : null}
                          </div>
                        </td>

                        <td>
                          {isEditing ? (
                            <label className="checkbox-row" htmlFor={`account-edit-liquid-${entry._id}`}>
                              <input
                                id={`account-edit-liquid-${entry._id}`}
                                type="checkbox"
                                checked={accountEditDraft.liquid}
                                onChange={(event) =>
                                  setAccountEditDraft((prev) => ({
                                    ...prev,
                                    liquid: event.target.checked,
                                  }))
                                }
                              />
                              <span className={activeIsLiability ? 'pill pill--critical' : 'pill pill--good'}>
                                {activeIsLiability ? 'liability' : 'asset'}
                              </span>
                            </label>
                          ) : (
                            <span className={activeIsLiability ? 'pill pill--critical' : 'pill pill--good'}>
                              {activeIsLiability ? 'liability' : 'asset'}
                            </span>
                          )}
                        </td>

                        <td>
                          <div className="row-actions">
                            {isEditing ? (
                              <>
                                <button type="button" className="btn btn-secondary btn--sm" onClick={() => void saveAccountEdit()}>
                                  Save
                                </button>
                                <button type="button" className="btn btn-ghost btn--sm" onClick={() => setAccountEditId(null)}>
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button type="button" className="btn btn-secondary btn--sm" onClick={() => startAccountEdit(entry)}>
                                Edit
                              </button>
                            )}
                            <button type="button" className="btn btn-ghost btn--sm" onClick={() => void onDeleteAccount(entry._id)}>
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="accounts-mobile-list" aria-label="Accounts mobile view">
              {visibleAccounts.map((row) => {
                const { entry } = row
                const accountId = String(entry._id)
                const isEditing = accountEditId === entry._id
                const isExpanded = isEditing || expandedAccountIds.includes(accountId)
                const draftLedger = parseFloatOrZero(accountEditDraft.ledgerBalance)
                const draftPending = parseFloatOrZero(accountEditDraft.pendingBalance)
                const draftBalances = {
                  availableBalance: roundCurrency(draftLedger + draftPending),
                  ledgerBalance: roundCurrency(draftLedger),
                  pendingBalance: roundCurrency(draftPending),
                }
                const forecastBalanceShift = roundCurrency(draftBalances.availableBalance - row.availableBalance)
                const previewForecast: AccountForecastSummary = {
                  ...row.forecast,
                  minProjectedBalance: roundCurrency(row.forecast.minProjectedBalance + forecastBalanceShift),
                  projectedEnd14: roundCurrency(row.forecast.projectedEnd14 + forecastBalanceShift),
                  projectedEnd30: roundCurrency(row.forecast.projectedEnd30 + forecastBalanceShift),
                }
                const previewHealth = evaluateHealth(
                  { ...entry, type: accountEditDraft.type, liquid: accountEditDraft.liquid },
                  draftBalances,
                  row.latestReconciliation,
                  row.trend.windows[30],
                  previewForecast,
                )
                const activeHealth = isEditing ? previewHealth : row
                const activePurpose = isEditing ? accountEditDraft.purpose : row.purpose
                const activeAvailable = isEditing ? draftBalances.availableBalance : row.availableBalance
                const activeLedger = isEditing ? draftBalances.ledgerBalance : row.ledgerBalance
                const activePending = isEditing ? draftBalances.pendingBalance : row.pendingBalance
                const activeIsLiability = isEditing ? accountEditDraft.type === 'debt' || activeAvailable < 0 : row.isLiability

                return (
                  <article
                    key={`mobile-${entry._id}`}
                    className={`accounts-mobile-item ${isEditing ? 'accounts-mobile-item--editing' : ''}`}
                  >
                    <button
                      type="button"
                      className="accounts-mobile-toggle"
                      aria-expanded={isExpanded}
                      aria-controls={`account-mobile-panel-${accountId}`}
                      onClick={() => toggleAccountExpanded(accountId)}
                    >
                      <div className="accounts-mobile-summary-main">
                        <strong>{entry.name}</strong>
                        <small>
                          {entry.liquid ? 'liquid enabled' : 'non-liquid'} · {accountTypeLabel(entry.type)}
                        </small>
                      </div>
                      <div className="accounts-mobile-summary-metrics">
                        <span className={activeAvailable >= 0 ? 'amount-positive' : 'amount-negative'}>
                          {formatMoney(activeAvailable)}
                        </span>
                        <span className={healthClass(activeHealth.healthStatus)}>
                          {activeHealth.healthStatus} {activeHealth.healthScore}/100
                        </span>
                      </div>
                    </button>

                    <div id={`account-mobile-panel-${accountId}`} className="accounts-mobile-content" hidden={!isExpanded}>
                      {isEditing ? (
                        <div className="accounts-mobile-edit-grid">
                          <label className="accounts-mobile-edit-field">
                            <span>Name</span>
                            <input
                              className="inline-input"
                              value={accountEditDraft.name}
                              onChange={(event) =>
                                setAccountEditDraft((prev) => ({
                                  ...prev,
                                  name: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label className="accounts-mobile-edit-field">
                            <span>Type</span>
                            <select
                              className="inline-select"
                              value={accountEditDraft.type}
                              onChange={(event) => {
                                const nextType = event.target.value as AccountType
                                setAccountEditDraft((prev) => ({
                                  ...prev,
                                  type: nextType,
                                  purpose: nextType === 'debt' ? 'debt' : prev.purpose === 'debt' ? 'spending' : prev.purpose,
                                }))
                              }}
                            >
                              {accountTypeOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="accounts-mobile-edit-field">
                            <span>Purpose</span>
                            <select
                              className="inline-select"
                              value={accountEditDraft.purpose}
                              onChange={(event) =>
                                setAccountEditDraft((prev) => ({
                                  ...prev,
                                  purpose: event.target.value as AccountPurpose,
                                }))
                              }
                            >
                              {accountPurposeOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="accounts-mobile-edit-field">
                            <span>Ledger</span>
                            <input
                              className="inline-input"
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              value={accountEditDraft.ledgerBalance}
                              onChange={(event) =>
                                setAccountEditDraft((prev) => ({
                                  ...prev,
                                  ledgerBalance: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label className="accounts-mobile-edit-field">
                            <span>Pending</span>
                            <input
                              className="inline-input"
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              value={accountEditDraft.pendingBalance}
                              onChange={(event) =>
                                setAccountEditDraft((prev) => ({
                                  ...prev,
                                  pendingBalance: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <div className="accounts-mobile-edit-field accounts-mobile-edit-field--span2">
                            <span>Liquid cash inclusion</span>
                            <label className="checkbox-row" htmlFor={`account-mobile-edit-liquid-${entry._id}`}>
                              <input
                                id={`account-mobile-edit-liquid-${entry._id}`}
                                type="checkbox"
                                checked={accountEditDraft.liquid}
                                onChange={(event) =>
                                  setAccountEditDraft((prev) => ({
                                    ...prev,
                                    liquid: event.target.checked,
                                  }))
                                }
                              />
                              Include in liquid-cash and forecasting models
                            </label>
                          </div>
                          <p className="subnote accounts-mobile-edit-field--span2">
                            Available preview {formatMoney(activeAvailable)} · {activeIsLiability ? 'liability class' : 'asset class'}
                          </p>
                        </div>
                      ) : (
                        <div className="accounts-mobile-grid">
                          <div>
                            <span>Purpose</span>
                            <strong>{accountPurposeLabel(activePurpose)}</strong>
                          </div>
                          <div>
                            <span>Type</span>
                            <strong>{accountTypeLabel(entry.type)}</strong>
                          </div>
                          <div>
                            <span>Available</span>
                            <strong className={activeAvailable >= 0 ? 'amount-positive' : 'amount-negative'}>
                              {formatMoney(activeAvailable)}
                            </strong>
                          </div>
                          <div>
                            <span>Ledger</span>
                            <strong>{formatMoney(activeLedger)}</strong>
                          </div>
                          <div>
                            <span>Pending</span>
                            <strong>{formatMoney(activePending)}</strong>
                          </div>
                          <div>
                            <span>Class</span>
                            <strong>{activeIsLiability ? 'Liability' : 'Asset'}</strong>
                          </div>
                          <div className="accounts-mobile-grid--span2">
                            <span>Health note</span>
                            <strong>{activeHealth.healthNote}</strong>
                          </div>
                          {row.latestReconciliation ? (
                            <div className="accounts-mobile-grid--span2">
                              <span>Latest reconciliation</span>
                              <strong>
                                {row.latestReconciliation.cycleMonth} ·{' '}
                                {row.latestReconciliation.reconciled ? 'reconciled' : 'pending'} · delta{' '}
                                {formatMoney(row.latestReconciliation.unmatchedDelta)}
                              </strong>
                            </div>
                          ) : null}
                        </div>
                      )}

                      <div className="row-actions row-actions--accounts-mobile">
                        {isEditing ? (
                          <>
                            <button type="button" className="btn btn-secondary btn--sm" onClick={() => void saveAccountEdit()}>
                              Save
                            </button>
                            <button type="button" className="btn btn-ghost btn--sm" onClick={() => setAccountEditId(null)}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary btn--sm"
                            onClick={() => {
                              startAccountEdit(entry)
                              ensureAccountExpanded(accountId)
                            }}
                          >
                            Edit
                          </button>
                        )}
                        <button type="button" className="btn btn-ghost btn--sm" onClick={() => void onDeleteAccount(entry._id)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </>
        )}
      </article>

      <article className="panel panel-insights">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Insights</p>
            <h2>Intelligence & controls</h2>
            <p className="panel-value">
              {accountRiskSummary.critical} critical · {accountRiskSummary.warning} warning · {accountRiskSummary.watch} watch
            </p>
            <p className="subnote">
              Forecast, allocation mix, transfer/reconciliation workflows, and audit-ready account activity in one panel.
            </p>
          </div>
        </header>

        <section className="accounts-purpose-panel" aria-label="Account purpose allocation">
          <div className="accounts-purpose-head">
            <h3>Purpose allocation mix</h3>
            <small>{formatMoney(purposeMix.total)} tagged available assets</small>
          </div>
          {purposeMix.rows.length === 0 ? (
            <p className="subnote">No positive asset balances available for purpose allocation yet.</p>
          ) : (
            <ul className="accounts-purpose-list">
              {purposeMix.rows.map((row) => (
                <li key={row.purpose}>
                  <div className="accounts-purpose-row">
                    <p>
                      <span className={purposeColorClass(row.purpose)}>{accountPurposeLabel(row.purpose)}</span>
                    </p>
                    <strong>{formatMoney(row.amount)}</strong>
                  </div>
                  <div className="accounts-purpose-meta">
                    <small>{row.sharePercent.toFixed(1)}% of tagged assets</small>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="accounts-phase3-grid" aria-label="Forecasting and risk intelligence">
          <article className="accounts-phase3-card accounts-phase3-card--forecast">
            <header className="accounts-phase3-head">
              <div>
                <h3>Projected balance timeline</h3>
                <p>
                  Next 14/30 days from income, bills, card dues, and loan payments routed through account funding logic.
                </p>
              </div>
              <div className="accounts-forecast-window-toggle" role="group" aria-label="Forecast timeline window">
                <button
                  type="button"
                  className={`btn btn-ghost btn--sm ${forecastWindowDays === 14 ? 'accounts-forecast-window-btn--active' : ''}`}
                  onClick={() => setForecastWindowDays(14)}
                >
                  Next 14 days
                </button>
                <button
                  type="button"
                  className={`btn btn-ghost btn--sm ${forecastWindowDays === 30 ? 'accounts-forecast-window-btn--active' : ''}`}
                  onClick={() => setForecastWindowDays(30)}
                >
                  Next 30 days
                </button>
              </div>
            </header>

            <div className="accounts-forecast-summary">
              <article>
                <p>Liquid start</p>
                <strong>{formatMoney(accountForecastModel.liquidStart)}</strong>
              </article>
              <article>
                <p>Projected end</p>
                <strong>{formatMoney(forecastWindowSummary.projectedEnd)}</strong>
              </article>
              <article>
                <p>Forecast floor</p>
                <strong>{formatMoney(forecastWindowSummary.minBalance)}</strong>
              </article>
            </div>

            <div className="accounts-forecast-chart-wrap" aria-label="Projected liquid balance path">
              <svg
                className="accounts-forecast-chart"
                viewBox={`0 0 ${forecastChart.width} ${forecastChart.height}`}
                role="img"
                aria-label="Projected liquid balance path"
              >
                {forecastChart.zeroLineY !== null ? (
                  <line
                    x1={0}
                    y1={forecastChart.zeroLineY}
                    x2={forecastChart.width}
                    y2={forecastChart.zeroLineY}
                    className="accounts-forecast-zero-line"
                  />
                ) : null}
                <polyline className="accounts-forecast-line" points={forecastChart.line} />
                {forecastChart.points.map((point) => (
                  <circle
                    key={`forecast-point-${point.day}`}
                    cx={point.x}
                    cy={point.y}
                    r={point.day === 0 ? 3.6 : 3}
                    className={`accounts-forecast-point accounts-forecast-point--${point.risk}`}
                  />
                ))}
              </svg>
              <div className="accounts-forecast-axis-labels">
                <small>Day 0</small>
                <small>Day {Math.floor(forecastWindowDays / 2)}</small>
                <small>Day {forecastWindowDays}</small>
              </div>
            </div>

            {forecastLowRiskPoints.length === 0 ? (
              <p className="subnote">No low-cash risk points in this window.</p>
            ) : (
              <ul className="accounts-forecast-risk-list">
                {forecastLowRiskPoints.map((point) => (
                  <li key={`risk-point-${point.day}`}>
                    <span className={point.risk === 'critical' ? 'pill pill--critical' : 'pill pill--warning'}>
                      {point.risk === 'critical' ? 'critical' : 'watch'}
                    </span>
                    <p>
                      Day {point.day} ({point.date}) · {formatMoney(point.balance)}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {forecastEventsWithRunningLiquid.length === 0 ? (
              <p className="subnote">No scheduled timeline events in this window.</p>
            ) : (
              <ul className="accounts-forecast-event-list">
                {forecastEventsWithRunningLiquid.map((event) => (
                  <li key={event.id} className="accounts-forecast-event">
                    <div className="accounts-forecast-event-main">
                      <p>
                        {event.kind === 'income'
                          ? 'Income'
                          : event.kind === 'bill'
                            ? 'Bill'
                            : event.kind === 'card'
                              ? 'Card due'
                              : 'Loan payment'}
                        {' · '}
                        {event.label}
                      </p>
                      <small>
                        {formatShortDate(event.date)} · {event.accountName}
                      </small>
                    </div>
                    <div className="accounts-forecast-event-amount">
                      <strong className={event.amount >= 0 ? 'amount-positive' : 'amount-negative'}>
                        {formatMoney(event.amount)}
                      </strong>
                      <small>liquid {formatMoney(event.runningLiquid)}</small>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="accounts-phase3-card accounts-phase3-card--alerts">
            <header className="accounts-phase3-head">
              <div>
                <h3>Risk alerts</h3>
                <p>Low-balance forecast, overdraft risk, dormant accounts, and unusual swing detection.</p>
              </div>
              <div className="accounts-alert-summary">
                <span className="pill pill--critical">{accountRiskSummary.critical} critical</span>
                <span className="pill pill--warning">{accountRiskSummary.warning} warning</span>
                <span className="pill pill--neutral">{accountRiskSummary.watch} watch</span>
              </div>
            </header>

            {accountRiskAlerts.length === 0 ? (
              <p className="subnote">No active account risk alerts right now.</p>
            ) : (
              <ul className="accounts-alert-list">
                {accountRiskAlerts.map((alert) => (
                  <li key={alert.id}>
                    <div className="accounts-alert-head">
                      <span
                        className={
                          alert.severity === 'critical'
                            ? 'pill pill--critical'
                            : alert.severity === 'warning'
                              ? 'pill pill--warning'
                              : 'pill pill--neutral'
                        }
                      >
                        {alert.severity}
                      </span>
                      <p>{alert.title}</p>
                    </div>
                    <small>{alert.detail}</small>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </section>

        <section className="accounts-trend-panel" aria-label="Account trend cards">
          <div className="accounts-trend-head">
            <h3>Trend cards</h3>
            <small>30/90/365 inflow, outflow, net change, and volatility per account.</small>
          </div>
          {accountRows.length === 0 ? (
            <p className="subnote">Add accounts and log transfer/reconciliation activity to unlock trend intelligence.</p>
          ) : (
            <div className="accounts-trend-grid">
              {accountRows.map((row) => (
                <article key={`trend-${row.entry._id}`} className="accounts-trend-card">
                  <header>
                    <div>
                      <h4>{row.entry.name}</h4>
                      <small>
                        {row.entry.liquid ? 'Liquid' : 'Non-liquid'} · {accountTypeLabel(row.entry.type)}
                      </small>
                    </div>
                    <span className={healthClass(row.healthStatus)}>
                      {row.healthStatus} {row.healthScore}/100
                    </span>
                  </header>
                  <div className="accounts-trend-balance">
                    <p>Current available</p>
                    <strong className={row.availableBalance >= 0 ? 'amount-positive' : 'amount-negative'}>
                      {formatMoney(row.availableBalance)}
                    </strong>
                  </div>
                  <div className="accounts-trend-windows">
                    {trendWindowDays.map((windowDays) => {
                      const window = row.trend.windows[windowDays]
                      return (
                        <div key={`${row.entry._id}-${windowDays}`} className="accounts-trend-window">
                          <p>{windowLabel(windowDays)}</p>
                          <small>In {formatMoney(window.inflow)}</small>
                          <small>Out {formatMoney(window.outflow)}</small>
                          <small className={window.net >= 0 ? 'amount-positive' : 'amount-negative'}>
                            Net {formatMoney(window.net)}
                          </small>
                          <small>Vol {formatMoney(window.volatility)}</small>
                        </div>
                      )
                    })}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="accounts-phase2-grid" aria-label="Account transfers and reconciliation controls">
          <article className="accounts-phase2-card">
            <header className="accounts-phase2-head">
              <div>
                <h3>Transfer center</h3>
                <p>Move funds between accounts with date/reference tracking and a durable audit trail.</p>
              </div>
              <span className="pill pill--neutral">{accountTransfers.length} transfers logged</span>
            </header>
            <form className="accounts-phase2-form" onSubmit={submitAccountTransfer}>
              <label>
                <span>Source account</span>
                <select
                  value={accountTransferForm.sourceAccountId}
                  onChange={(event) =>
                    setAccountTransferForm((prev) => ({ ...prev, sourceAccountId: event.target.value }))
                  }
                  required
                >
                  <option value="">Select account</option>
                  {accounts.map((entry) => (
                    <option key={entry._id} value={String(entry._id)}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Destination account</span>
                <select
                  value={accountTransferForm.destinationAccountId}
                  onChange={(event) =>
                    setAccountTransferForm((prev) => ({ ...prev, destinationAccountId: event.target.value }))
                  }
                  required
                >
                  <option value="">Select account</option>
                  {accounts.map((entry) => (
                    <option key={entry._id} value={String(entry._id)}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Amount</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={accountTransferForm.amount}
                  onChange={(event) => setAccountTransferForm((prev) => ({ ...prev, amount: event.target.value }))}
                  required
                />
              </label>
              <label>
                <span>Transfer date</span>
                <input
                  type="date"
                  value={accountTransferForm.transferDate}
                  onChange={(event) =>
                    setAccountTransferForm((prev) => ({ ...prev, transferDate: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                <span>Reference</span>
                <input
                  value={accountTransferForm.reference}
                  onChange={(event) => setAccountTransferForm((prev) => ({ ...prev, reference: event.target.value }))}
                  placeholder="Optional"
                />
              </label>
              <label className="accounts-phase2-field--span2">
                <span>Note</span>
                <input
                  value={accountTransferForm.note}
                  onChange={(event) => setAccountTransferForm((prev) => ({ ...prev, note: event.target.value }))}
                  placeholder="Optional"
                />
              </label>
              <button type="submit" className="btn btn-primary">
                Record transfer
              </button>
            </form>
          </article>

          <article className="accounts-phase2-card">
            <header className="accounts-phase2-head">
              <div>
                <h3>Reconciliation mode</h3>
                <p>Capture statement start/end balances, unmatched delta, and cycle status per account.</p>
              </div>
              <span className={totals.unreconciledCount > 0 ? 'pill pill--warning' : 'pill pill--good'}>
                {totals.unreconciledCount} unreconciled account{totals.unreconciledCount === 1 ? '' : 's'}
              </span>
            </header>
            <form className="accounts-phase2-form" onSubmit={submitAccountReconciliation}>
              <label>
                <span>Account</span>
                <select
                  value={accountReconciliationForm.accountId}
                  onChange={(event) =>
                    setAccountReconciliationForm((prev) => ({ ...prev, accountId: event.target.value }))
                  }
                  required
                >
                  <option value="">Select account</option>
                  {accounts.map((entry) => (
                    <option key={entry._id} value={String(entry._id)}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Cycle month</span>
                <input
                  type="month"
                  value={accountReconciliationForm.cycleMonth}
                  onChange={(event) =>
                    setAccountReconciliationForm((prev) => ({ ...prev, cycleMonth: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                <span>Statement start</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={accountReconciliationForm.statementStartBalance}
                  onChange={(event) =>
                    setAccountReconciliationForm((prev) => ({ ...prev, statementStartBalance: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                <span>Statement end</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={accountReconciliationForm.statementEndBalance}
                  onChange={(event) =>
                    setAccountReconciliationForm((prev) => ({ ...prev, statementEndBalance: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="accounts-phase2-field--span2">
                <span>Reconciliation note</span>
                <input
                  value={accountReconciliationForm.note}
                  onChange={(event) => setAccountReconciliationForm((prev) => ({ ...prev, note: event.target.value }))}
                  placeholder="Optional"
                />
              </label>
              <label className="checkbox-row accounts-phase2-field--span2">
                <input
                  type="checkbox"
                  checked={accountReconciliationForm.reconciled}
                  onChange={(event) =>
                    setAccountReconciliationForm((prev) => ({ ...prev, reconciled: event.target.checked }))
                  }
                />
                Mark this cycle as reconciled
              </label>
              <label className="checkbox-row accounts-phase2-field--span2">
                <input
                  type="checkbox"
                  checked={accountReconciliationForm.applyAdjustment}
                  onChange={(event) =>
                    setAccountReconciliationForm((prev) => ({ ...prev, applyAdjustment: event.target.checked }))
                  }
                />
                Apply adjustment to account ledger (if delta exists)
              </label>
              <p className="subnote accounts-phase2-field--span2">
                Ledger now {formatMoney(selectedReconciliationBalances?.ledgerBalance ?? 0)} · preview delta {formatMoney(previewDelta)}
              </p>
              <button type="submit" className="btn btn-secondary">
                Save reconciliation
              </button>
            </form>
          </article>
        </section>

        <section className="accounts-reconciliation-log" aria-label="Reconciliation history">
          <div className="accounts-reconciliation-log-head">
            <h3>Reconciliation checks</h3>
            <small>{accountReconciliationChecks.length} records</small>
          </div>
          {sortedReconciliationChecks.length === 0 ? (
            <p className="subnote">No reconciliation checks logged yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table data-table--accounts-reconciliation">
                <caption className="sr-only">Account reconciliation checks</caption>
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
                  {sortedReconciliationChecks.map((entry) => (
                    <tr key={entry._id}>
                      <td>{accountNameById.get(String(entry.accountId)) ?? 'Deleted account'}</td>
                      <td>{entry.cycleMonth}</td>
                      <td>
                        {formatMoney(entry.statementStartBalance)} {'->'} {formatMoney(entry.statementEndBalance)}
                      </td>
                      <td className={entry.ledgerEndBalance >= 0 ? 'amount-positive' : 'amount-negative'}>
                        {formatMoney(entry.ledgerEndBalance)}
                      </td>
                      <td className={Math.abs(entry.unmatchedDelta) <= 0.01 ? 'amount-positive' : 'amount-negative'}>
                        {formatMoney(entry.unmatchedDelta)}
                      </td>
                      <td>
                        <span className={entry.reconciled ? 'pill pill--good' : 'pill pill--warning'}>
                          {entry.reconciled ? 'reconciled' : 'pending'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="accounts-activity-feed" aria-label="Account activity">
          <div className="accounts-activity-head">
            <h3>Account activity feed</h3>
            <small>Transfers and reconciliation events in one timeline.</small>
          </div>
          {activityFeed.length === 0 ? (
            <p className="subnote">No account activity recorded yet.</p>
          ) : (
            <ul className="accounts-activity-list">
              {activityFeed.map((event) => (
                <li key={event.id} className="accounts-activity-item">
                  <div className="accounts-activity-item-head">
                    <p>{event.title}</p>
                    <span
                      className={
                        event.status === 'posted'
                          ? 'pill pill--neutral'
                          : event.status === 'reconciled'
                            ? 'pill pill--good'
                            : 'pill pill--warning'
                      }
                    >
                      {event.status}
                    </span>
                  </div>
                  <small>{event.detail}</small>
                  <div className="accounts-activity-item-meta">
                    <small>{new Date(event.occurredAt).toLocaleDateString()}</small>
                    <strong className={event.amount >= 0 ? 'amount-positive' : 'amount-negative'}>
                      {formatMoney(event.amount)}
                    </strong>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </article>
    </section>
  )
}
