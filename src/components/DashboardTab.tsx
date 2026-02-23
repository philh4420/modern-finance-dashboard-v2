import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { PillBadge, SurfaceCard } from '@/components/ui'
import type {
  AccountEntry,
  Cadence,
  CardEntry,
  CardId,
  CardMinimumPaymentType,
  CycleAuditLogEntry,
  CycleStepAlertEntry,
  FinanceAuditEventEntry,
  ForecastWindow,
  CustomCadenceUnit,
  DashboardCard,
  DashboardIntegrationSnapshot,
  GoalWithMetrics,
  Insight,
  InsightSeverity,
  KpiSnapshot,
  LedgerEntry,
  MonthCloseSnapshotEntry,
  MonthlyCycleRunEntry,
  PrivacyData,
  Summary,
  TopCategory,
  UpcomingCashEvent,
} from './financeTypes'

type CspMode = 'unknown' | 'none' | 'report-only' | 'enforced'

type DashboardTabProps = {
  dashboardCards: DashboardCard[]
  cards: CardEntry[]
  accounts: AccountEntry[]
  summary: Summary
  dashboardIntegration: DashboardIntegrationSnapshot
  insights: Insight[]
  upcomingCashEvents: UpcomingCashEvent[]
  topCategories: TopCategory[]
  goalsWithMetrics: GoalWithMetrics[]
  cycleAuditLogs: CycleAuditLogEntry[]
  cycleStepAlerts: CycleStepAlertEntry[]
  monthlyCycleRuns: MonthlyCycleRunEntry[]
  monthCloseSnapshots: MonthCloseSnapshotEntry[]
  financeAuditEvents: FinanceAuditEventEntry[]
  ledgerEntries: LedgerEntry[]
  forecastWindows: ForecastWindow[]
  counts: {
    incomes: number
    bills: number
    cards: number
    loans: number
    purchases: number
    accounts: number
    goals: number
  }
  kpis: KpiSnapshot | null
  privacyData: PrivacyData | null
  retentionEnabled: boolean
  cspMode: CspMode
  formatMoney: (value: number) => string
  formatPercent: (value: number) => string
  cadenceLabel: (cadence: Cadence, customInterval?: number, customUnit?: CustomCadenceUnit) => string
  severityLabel: (severity: InsightSeverity) => string
  dateLabel: Intl.DateTimeFormat
  cycleDateLabel: Intl.DateTimeFormat
  onActionQueueRecordPayment: (cardId: CardId, amount: number) => Promise<void>
  onActionQueueAddCharge: (cardId: CardId, amount: number) => Promise<void>
  onActionQueueRunMonthlyCycle: () => Promise<void>
  onActionQueueReconcilePending: () => Promise<void>
  isRunningMonthlyCycle: boolean
  isReconcilingPending: boolean
  pendingReconciliationCount: number
}

type ExecutiveMetric = {
  id: string
  label: string
  value: string
  delta: string
  context: string
  tone: 'good' | 'bad' | 'neutral'
}

type DebtFocusCard = {
  id: string
  name: string
  balance: number
  apr: number
  monthlyInterest: number
  minimumDue: number
  plannedPayment: number
  projectedNextMonthInterest: number
  projected12MonthInterestCost: number
}

type CommitmentSlice = {
  id: 'bills' | 'cards' | 'loans' | 'subscriptions'
  label: string
  value: number
  baselineValue: number | null
}

type NetWorthCategory = {
  id: string
  label: string
  side: 'asset' | 'liability'
  value: number
  baselineValue: number | null
}

type RiskSeverity = 'critical' | 'warning' | 'watch'

type RiskCenterAlert = {
  id: string
  severity: RiskSeverity
  source: 'due_soon' | 'utilization' | 'payment_interest' | 'reconciliation' | 'cycle_step'
  title: string
  detail: string
  daysAway?: number
}

const roundCurrency = (value: number) => Math.round(value * 100) / 100
const toNonNegative = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(value, 0) : 0
const clampPercent = (value: number) => Math.min(Math.max(value, 0), 100)
const normalizeCardMinimumPaymentType = (value: CardMinimumPaymentType | undefined | null): CardMinimumPaymentType =>
  value === 'percent_plus_interest' ? 'percent_plus_interest' : 'fixed'
const utilizationFor = (used: number, limit: number) => (limit > 0 ? used / limit : 0)
const toDayOfMonth = (value: number | null | undefined, fallback = 21) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const rounded = Math.trunc(value)
  if (rounded < 1) return 1
  if (rounded > 31) return 31
  return rounded
}
const atMidnight = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate())
const daysBetween = (from: Date, to: Date) => {
  const delta = atMidnight(to).getTime() - atMidnight(from).getTime()
  return Math.max(Math.round(delta / 86_400_000), 0)
}
const dueTimingForDay = (dueDay: number) => {
  const now = new Date()
  const today = atMidnight(now)
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
const utilizationSeverityFor = (utilization: number): RiskSeverity | null => {
  if (utilization >= 0.9) return 'critical'
  if (utilization >= 0.5) return 'warning'
  if (utilization >= 0.3) return 'watch'
  return null
}
const riskSeverityRank: Record<RiskSeverity, number> = {
  critical: 3,
  warning: 2,
  watch: 1,
}
const upcomingEventTypeLabel = (event: UpcomingCashEvent['type']) => {
  switch (event) {
    case 'income':
      return 'Income'
    case 'bill':
      return 'Bill'
    case 'card':
      return 'Card due'
    case 'loan':
      return 'Loan payment'
    default:
      return 'Cash event'
  }
}
const formatDueCountdown = (days: number) => (days <= 0 ? 'Due today' : `Due in ${days} day${days === 1 ? '' : 's'}`)

const projectDebtFocusCard = (card: CardEntry): DebtFocusCard => {
  const currentBalance = toNonNegative(card.usedLimit)
  const statementBalance = toNonNegative(card.statementBalance ?? card.usedLimit)
  const pendingCharges = toNonNegative(card.pendingCharges ?? Math.max(currentBalance - statementBalance, 0))
  const apr = toNonNegative(card.interestRate)
  const monthlyRate = apr > 0 ? apr / 100 / 12 : 0
  const minimumPaymentType = normalizeCardMinimumPaymentType(card.minimumPaymentType)
  const minimumPayment = toNonNegative(card.minimumPayment)
  const minimumPaymentPercent = clampPercent(toNonNegative(card.minimumPaymentPercent))
  const extraPayment = toNonNegative(card.extraPayment)
  const plannedSpend = toNonNegative(card.spendPerMonth)

  const currentCycleInterest = statementBalance * monthlyRate
  const currentDueBalance = statementBalance + currentCycleInterest
  const minimumDueRaw =
    minimumPaymentType === 'percent_plus_interest'
      ? statementBalance * (minimumPaymentPercent / 100) + currentCycleInterest
      : minimumPayment
  const minimumDue = Math.min(currentDueBalance, Math.max(minimumDueRaw, 0))
  const plannedPayment = Math.min(currentDueBalance, minimumDue + extraPayment)
  const postDueBalance = Math.max(currentDueBalance - plannedPayment, 0) + pendingCharges

  let projectionBalance = roundCurrency(postDueBalance)
  let projectedNextMonthInterest = 0
  let projected12MonthInterestCost = 0

  for (let month = 0; month < 12; month += 1) {
    const interest = projectionBalance * monthlyRate
    if (month === 0) {
      projectedNextMonthInterest = interest
    }
    projected12MonthInterestCost += interest

    const dueBalance = projectionBalance + interest
    const monthMinimumDueRaw =
      minimumPaymentType === 'percent_plus_interest'
        ? projectionBalance * (minimumPaymentPercent / 100) + interest
        : minimumPayment
    const monthMinimumDue = Math.min(dueBalance, Math.max(monthMinimumDueRaw, 0))
    const monthPlannedPayment = Math.min(dueBalance, monthMinimumDue + extraPayment)
    projectionBalance = roundCurrency(Math.max(dueBalance - monthPlannedPayment, 0) + plannedSpend)
  }

  return {
    id: String(card._id),
    name: card.name,
    balance: roundCurrency(Math.max(currentBalance, 0)),
    apr,
    monthlyInterest: roundCurrency(Math.max(currentCycleInterest, 0)),
    minimumDue: roundCurrency(Math.max(minimumDue, 0)),
    plannedPayment: roundCurrency(Math.max(plannedPayment, 0)),
    projectedNextMonthInterest: roundCurrency(Math.max(projectedNextMonthInterest, 0)),
    projected12MonthInterestCost: roundCurrency(Math.max(projected12MonthInterestCost, 0)),
  }
}

export function DashboardTab({
  dashboardCards,
  cards,
  accounts,
  summary,
  dashboardIntegration,
  insights,
  upcomingCashEvents,
  topCategories,
  goalsWithMetrics,
  cycleAuditLogs,
  cycleStepAlerts,
  monthlyCycleRuns,
  monthCloseSnapshots,
  financeAuditEvents,
  ledgerEntries,
  forecastWindows,
  counts,
  kpis,
  privacyData,
  retentionEnabled,
  cspMode,
  formatMoney,
  formatPercent,
  cadenceLabel,
  severityLabel,
  dateLabel,
  cycleDateLabel,
  onActionQueueRecordPayment,
  onActionQueueAddCharge,
  onActionQueueRunMonthlyCycle,
  onActionQueueReconcilePending,
  isRunningMonthlyCycle,
  isReconcilingPending,
  pendingReconciliationCount,
}: DashboardTabProps) {
  const [paymentCardId, setPaymentCardId] = useState<CardId | ''>('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [chargeCardId, setChargeCardId] = useState<CardId | ''>('')
  const [chargeAmount, setChargeAmount] = useState('')
  const [timelineWindowDays, setTimelineWindowDays] = useState<14 | 30>(14)
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false)
  const [isSubmittingCharge, setIsSubmittingCharge] = useState(false)

  useEffect(() => {
    if (cards.length === 0) {
      setPaymentCardId('')
      setChargeCardId('')
      return
    }

    if (!paymentCardId || !cards.some((card) => card._id === paymentCardId)) {
      setPaymentCardId(cards[0]._id)
    }
    if (!chargeCardId || !cards.some((card) => card._id === chargeCardId)) {
      setChargeCardId(cards[0]._id)
    }
  }, [cards, chargeCardId, paymentCardId])

  const currentCycleKey = useMemo(() => new Date().toISOString().slice(0, 7), [])

  const monthLabel = useMemo(() => {
    const locale = dateLabel.resolvedOptions().locale || 'en-US'
    const formatter = new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' })
    return (cycleKey: string) => {
      const [year, month] = cycleKey.split('-').map(Number)
      if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return cycleKey
      return formatter.format(new Date(Date.UTC(year, month - 1, 1)))
    }
  }, [dateLabel])

  const sortedSnapshots = useMemo(
    () => [...monthCloseSnapshots].sort((left, right) => right.cycleKey.localeCompare(left.cycleKey)),
    [monthCloseSnapshots],
  )

  const baselineSnapshot = useMemo(
    () => sortedSnapshots.find((snapshot) => snapshot.cycleKey < currentCycleKey) ?? sortedSnapshots[1] ?? null,
    [currentCycleKey, sortedSnapshots],
  )

  const executiveContext = baselineSnapshot
    ? `MoM vs ${monthLabel(baselineSnapshot.cycleKey)} close`
    : 'MoM pending (need prior close snapshot)'

  const formatSignedMoneyDelta = (delta: number | null) => {
    if (delta === null) return 'MoM n/a'
    if (Math.abs(delta) < 0.005) return 'Flat month-over-month'
    const sign = delta >= 0 ? '+' : '-'
    return `${sign}${formatMoney(Math.abs(delta))}`
  }

  const formatSignedNumberDelta = (delta: number | null, unit: string, precision = 1) => {
    if (delta === null) return 'MoM n/a'
    if (Math.abs(delta) < 0.0001) return 'Flat month-over-month'
    const sign = delta >= 0 ? '+' : '-'
    return `${sign}${Math.abs(delta).toFixed(precision)}${unit}`
  }

  const formatSignedPointDelta = (delta: number | null) => {
    if (delta === null) return 'MoM n/a'
    if (Math.abs(delta) < 0.5) return 'Flat month-over-month'
    const sign = delta >= 0 ? '+' : '-'
    return `${sign}${Math.abs(delta).toFixed(0)} pts`
  }

  const formatVsLastMonthDelta = (delta: number | null) => {
    if (delta === null) return 'Trend n/a'
    if (Math.abs(delta) < 0.005) return 'Flat vs last month'
    const sign = delta >= 0 ? '+' : '-'
    return `${sign}${formatMoney(Math.abs(delta))} vs last month`
  }

  const deltaTone = (delta: number | null, invertDirection = false): ExecutiveMetric['tone'] => {
    if (delta === null || Math.abs(delta) < 0.005) return 'neutral'
    const isPositive = delta > 0
    if (invertDirection) {
      return isPositive ? 'bad' : 'good'
    }
    return isPositive ? 'good' : 'bad'
  }

  const netWorthCategoryTone = (category: NetWorthCategory, delta: number | null): ExecutiveMetric['tone'] => {
    if (category.side === 'asset') {
      return deltaTone(delta)
    }
    return deltaTone(delta, true)
  }

  const baseline = baselineSnapshot?.summary ?? null
  const netPositionDelta = baseline ? summary.netWorth - baseline.netWorth : null
  const baselineProjectedNet = baseline ? baseline.monthlyIncome - baseline.monthlyCommitments : null
  const cashflowDelta = baselineProjectedNet !== null ? summary.projectedMonthlyNet - baselineProjectedNet : null
  const runwayDelta = baseline ? summary.runwayMonths - baseline.runwayMonths : null
  const debtLoadDelta = baseline ? summary.totalLiabilities - baseline.totalLiabilities : null
  const healthDelta = null

  const readOptionalBaselineNumber = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? value : null

  const commitmentSlices = useMemo<CommitmentSlice[]>(
    () => [
      {
        id: 'bills',
        label: 'Bills',
        value: summary.monthlyBills,
        baselineValue: readOptionalBaselineNumber(baseline?.monthlyBills),
      },
      {
        id: 'cards',
        label: 'Cards',
        value: summary.monthlyCardSpend,
        baselineValue: readOptionalBaselineNumber(baseline?.monthlyCardSpend),
      },
      {
        id: 'loans',
        label: 'Loan payments',
        value: summary.monthlyLoanBasePayments,
        baselineValue: readOptionalBaselineNumber(baseline?.monthlyLoanBasePayments),
      },
      {
        id: 'subscriptions',
        label: 'Subscriptions',
        value: summary.monthlyLoanSubscriptionCosts,
        baselineValue: readOptionalBaselineNumber(baseline?.monthlyLoanSubscriptionCosts),
      },
    ],
    [
      baseline?.monthlyBills,
      baseline?.monthlyCardSpend,
      baseline?.monthlyLoanBasePayments,
      baseline?.monthlyLoanSubscriptionCosts,
      summary.monthlyBills,
      summary.monthlyCardSpend,
      summary.monthlyLoanBasePayments,
      summary.monthlyLoanSubscriptionCosts,
    ],
  )

  const commitmentSliceTotal = useMemo(
    () => roundCurrency(commitmentSlices.reduce((sum, slice) => sum + slice.value, 0)),
    [commitmentSlices],
  )

  const totalCommitmentDelta = baseline ? summary.monthlyCommitments - baseline.monthlyCommitments : null
  const totalCommitmentTone = deltaTone(totalCommitmentDelta, true)

  const assetsByType = useMemo(
    () =>
      accounts.reduce(
        (acc, account) => {
          const positiveBalance = Math.max(account.balance, 0)
          if (account.type === 'checking') acc.checking += positiveBalance
          if (account.type === 'savings') acc.savings += positiveBalance
          if (account.type === 'investment') acc.investment += positiveBalance
          if (account.type === 'cash') acc.cash += positiveBalance
          return acc
        },
        { checking: 0, savings: 0, investment: 0, cash: 0 },
      ),
    [accounts],
  )

  const accountDebtLiabilities = useMemo(
    () =>
      accounts.reduce((sum, account) => {
        if (account.type === 'debt') return sum + Math.abs(account.balance)
        return account.balance < 0 ? sum + Math.abs(account.balance) : sum
      }, 0),
    [accounts],
  )

  const netWorthCategories = useMemo<NetWorthCategory[]>(
    () => [
      {
        id: 'asset-checking',
        label: 'Checking',
        side: 'asset',
        value: assetsByType.checking,
        baselineValue: readOptionalBaselineNumber(baseline?.assetsChecking),
      },
      {
        id: 'asset-savings',
        label: 'Savings',
        side: 'asset',
        value: assetsByType.savings,
        baselineValue: readOptionalBaselineNumber(baseline?.assetsSavings),
      },
      {
        id: 'asset-investment',
        label: 'Investment',
        side: 'asset',
        value: assetsByType.investment,
        baselineValue: readOptionalBaselineNumber(baseline?.assetsInvestment),
      },
      {
        id: 'asset-cash',
        label: 'Cash',
        side: 'asset',
        value: assetsByType.cash,
        baselineValue: readOptionalBaselineNumber(baseline?.assetsCash),
      },
      {
        id: 'liability-account-debt',
        label: 'Account debt',
        side: 'liability',
        value: accountDebtLiabilities,
        baselineValue: readOptionalBaselineNumber(baseline?.liabilitiesAccountDebt),
      },
      {
        id: 'liability-cards',
        label: 'Cards',
        side: 'liability',
        value: summary.cardUsedTotal,
        baselineValue: readOptionalBaselineNumber(baseline?.liabilitiesCards),
      },
      {
        id: 'liability-loans',
        label: 'Loans',
        side: 'liability',
        value: summary.totalLoanBalance,
        baselineValue: readOptionalBaselineNumber(baseline?.liabilitiesLoans),
      },
    ],
    [
      accountDebtLiabilities,
      assetsByType.cash,
      assetsByType.checking,
      assetsByType.investment,
      assetsByType.savings,
      baseline?.assetsCash,
      baseline?.assetsChecking,
      baseline?.assetsInvestment,
      baseline?.assetsSavings,
      baseline?.liabilitiesAccountDebt,
      baseline?.liabilitiesCards,
      baseline?.liabilitiesLoans,
      summary.cardUsedTotal,
      summary.totalLoanBalance,
    ],
  )

  const assetCategories = useMemo(
    () => netWorthCategories.filter((category) => category.side === 'asset'),
    [netWorthCategories],
  )
  const liabilityCategories = useMemo(
    () => netWorthCategories.filter((category) => category.side === 'liability'),
    [netWorthCategories],
  )

  const compositionAssetsTotal = useMemo(
    () => roundCurrency(assetCategories.reduce((sum, category) => sum + category.value, 0)),
    [assetCategories],
  )
  const compositionLiabilitiesTotal = useMemo(
    () => roundCurrency(liabilityCategories.reduce((sum, category) => sum + category.value, 0)),
    [liabilityCategories],
  )
  const compositionNetWorth = roundCurrency(compositionAssetsTotal - compositionLiabilitiesTotal)

  const baselineAssetsTotal = useMemo(() => {
    if (assetCategories.some((category) => category.baselineValue === null)) return null
    return roundCurrency(assetCategories.reduce((sum, category) => sum + (category.baselineValue ?? 0), 0))
  }, [assetCategories])
  const baselineLiabilitiesTotal = useMemo(() => {
    if (liabilityCategories.some((category) => category.baselineValue === null)) return null
    return roundCurrency(liabilityCategories.reduce((sum, category) => sum + (category.baselineValue ?? 0), 0))
  }, [liabilityCategories])

  const compositionAssetsDelta = baselineAssetsTotal === null ? null : compositionAssetsTotal - baselineAssetsTotal
  const compositionLiabilitiesDelta =
    baselineLiabilitiesTotal === null ? null : compositionLiabilitiesTotal - baselineLiabilitiesTotal
  const compositionNetWorthDelta =
    baselineAssetsTotal === null || baselineLiabilitiesTotal === null
      ? null
      : compositionNetWorth - (baselineAssetsTotal - baselineLiabilitiesTotal)

  const dominantNetWorthDriver = useMemo(() => {
    const candidates = netWorthCategories
      .map((category) => {
        if (category.baselineValue === null) return null
        const delta = category.value - category.baselineValue
        const impact = category.side === 'asset' ? delta : -delta
        return {
          ...category,
          delta,
          impact,
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

    if (candidates.length === 0) return null

    return [...candidates].sort((left, right) => Math.abs(right.impact) - Math.abs(left.impact))[0] ?? null
  }, [netWorthCategories])
  const dominantNetWorthDriverTone = dominantNetWorthDriver ? deltaTone(dominantNetWorthDriver.impact) : 'neutral'

  const executiveMetrics: ExecutiveMetric[] = [
    {
      id: 'net-position',
      label: 'Net Position',
      value: formatMoney(summary.netWorth),
      delta: formatSignedMoneyDelta(netPositionDelta),
      context: executiveContext,
      tone: netPositionDelta === null || Math.abs(netPositionDelta) < 0.005 ? 'neutral' : netPositionDelta > 0 ? 'good' : 'bad',
    },
    {
      id: 'cashflow-30d',
      label: '30-Day Cashflow',
      value: formatMoney(summary.projectedMonthlyNet),
      delta: formatSignedMoneyDelta(cashflowDelta),
      context: executiveContext,
      tone: cashflowDelta === null || Math.abs(cashflowDelta) < 0.005 ? 'neutral' : cashflowDelta > 0 ? 'good' : 'bad',
    },
    {
      id: 'runway',
      label: 'Runway',
      value: `${summary.runwayMonths.toFixed(1)} mo`,
      delta: formatSignedNumberDelta(runwayDelta, ' mo'),
      context: executiveContext,
      tone: runwayDelta === null || Math.abs(runwayDelta) < 0.0001 ? 'neutral' : runwayDelta > 0 ? 'good' : 'bad',
    },
    {
      id: 'debt-load',
      label: 'Debt Load',
      value: formatMoney(summary.totalLiabilities),
      delta: formatSignedMoneyDelta(debtLoadDelta),
      context: executiveContext,
      tone: debtLoadDelta === null || Math.abs(debtLoadDelta) < 0.005 ? 'neutral' : debtLoadDelta < 0 ? 'good' : 'bad',
    },
    {
      id: 'health-score',
      label: 'Health Score',
      value: `${summary.healthScore}/100`,
      delta: formatSignedPointDelta(healthDelta),
      context: baselineSnapshot ? 'MoM n/a (health score not stored in month-close snapshots)' : executiveContext,
      tone: 'neutral',
    },
  ]

  const compactMetricCards = dashboardCards.filter(
    (card) => !['health-score', 'projected-net', 'net-worth', 'runway'].includes(card.id),
  )

  const latestCycleRun = monthlyCycleRuns.reduce<MonthlyCycleRunEntry | null>((acc, run) => {
    if (!acc) return run
    return run.ranAt > acc.ranAt ? run : acc
  }, null)
  const latestSuccessfulCycleRun = monthlyCycleRuns.reduce<MonthlyCycleRunEntry | null>((acc, run) => {
    if (run.status !== 'completed') return acc
    if (!acc) return run
    return run.ranAt > acc.ranAt ? run : acc
  }, null)
  const completedCycleRuns = monthlyCycleRuns.filter((run) => run.status === 'completed').length

  const latestExport = privacyData?.latestExport ?? null
  const reconciliationRate =
    kpis?.reconciliationCompletionRate ??
    (summary.postedPurchases > 0 ? summary.reconciledPurchases / summary.postedPurchases : 1)

  const cspLabel = (() => {
    switch (cspMode) {
      case 'enforced':
        return 'Enforced'
      case 'report-only':
        return 'Report-only'
      case 'none':
        return 'Not detected'
      default:
        return 'Unknown'
    }
  })()

  const formatKpi = (value: number | null | undefined) => {
    if (value === null || value === undefined) return 'n/a'
    return formatPercent(value)
  }

  const kpiPurchaseCount = kpis?.counts.purchases ?? null
  const anomalyRate =
    kpis && kpiPurchaseCount !== null ? (kpiPurchaseCount > 0 ? kpis.counts.anomalies / kpiPurchaseCount : 0) : null
  const duplicateRate =
    kpis && kpiPurchaseCount !== null ? (kpiPurchaseCount > 0 ? kpis.counts.duplicates / kpiPurchaseCount : 0) : null
  const cycleSuccessRate =
    kpis?.cycleSuccessRate ??
    (monthlyCycleRuns.length > 0 ? completedCycleRuns / monthlyCycleRuns.length : null)

  const riskCenterSourceLabel = (source: RiskCenterAlert['source']) => {
    switch (source) {
      case 'due_soon':
        return 'Due soon'
      case 'utilization':
        return 'Utilization'
      case 'payment_interest':
        return 'Payment vs interest'
      case 'reconciliation':
        return 'Reconciliation'
      case 'cycle_step':
        return 'Cycle step'
      default:
        return 'Risk signal'
    }
  }

  const forecastRiskPill = (risk: ForecastWindow['risk']) => {
    if (risk === 'critical') return 'pill pill--critical'
    if (risk === 'warning') return 'pill pill--warning'
    return 'pill pill--good'
  }

  const orderedForecastWindows = useMemo(
    () => [...forecastWindows].sort((left, right) => left.days - right.days),
    [forecastWindows],
  )

  const openingForecastRisk: ForecastWindow['risk'] =
    summary.liquidReserves < 0 ? 'critical' : summary.liquidReserves < summary.monthlyCommitments ? 'warning' : 'healthy'

  const forecastPath = useMemo(
    () => [
      {
        id: 'day-0',
        days: 0,
        label: 'Today',
        projectedCash: summary.liquidReserves,
        projectedNet: 0,
        coverageMonths: summary.monthlyCommitments > 0 ? summary.liquidReserves / summary.monthlyCommitments : 99,
        risk: openingForecastRisk,
      },
      ...orderedForecastWindows.map((window) => ({
        id: `day-${window.days}`,
        days: window.days,
        label: `${window.days}d`,
        projectedCash: window.projectedCash,
        projectedNet: window.projectedNet,
        coverageMonths: window.coverageMonths,
        risk: window.risk,
      })),
    ],
    [openingForecastRisk, orderedForecastWindows, summary.liquidReserves, summary.monthlyCommitments],
  )

  const forecastChart = useMemo(() => {
    const width = 340
    const height = 126
    const padX = 14
    const padY = 14
    const maxDays = Math.max(...forecastPath.map((point) => point.days), 1)
    const values = forecastPath.map((point) => point.projectedCash)
    const minValue = Math.min(...values)
    const maxValue = Math.max(...values)
    const rawRange = maxValue - minValue
    const softPadding = rawRange === 0 ? Math.max(Math.abs(maxValue) * 0.15, 1) : rawRange * 0.14
    const chartMin = minValue - softPadding
    const chartMax = maxValue + softPadding
    const valueRange = chartMax - chartMin || 1
    const innerWidth = width - padX * 2
    const innerHeight = height - padY * 2

    const mapX = (days: number) => padX + (days / maxDays) * innerWidth
    const mapY = (value: number) => height - padY - ((value - chartMin) / valueRange) * innerHeight

    const points = forecastPath.map((point) => ({
      ...point,
      x: mapX(point.days),
      y: mapY(point.projectedCash),
    }))

    const zeroLineY = chartMin <= 0 && chartMax >= 0 ? mapY(0) : null

    return {
      width,
      height,
      points,
      line: points.map((point) => `${point.x},${point.y}`).join(' '),
      zeroLineY,
    }
  }, [forecastPath])

  const lowCashRiskPoints = forecastPath.filter((point) => point.risk !== 'healthy')

  const debtFocusCards = useMemo(() => cards.map((card) => projectDebtFocusCard(card)), [cards])
  const debtCardsWithBalance = useMemo(
    () => debtFocusCards.filter((card) => card.balance > 0.005),
    [debtFocusCards],
  )

  const projectedDebtInterestNextMonth = useMemo(
    () => roundCurrency(debtCardsWithBalance.reduce((sum, card) => sum + card.projectedNextMonthInterest, 0)),
    [debtCardsWithBalance],
  )
  const projectedDebtInterest12Month = useMemo(
    () => roundCurrency(debtCardsWithBalance.reduce((sum, card) => sum + card.projected12MonthInterestCost, 0)),
    [debtCardsWithBalance],
  )
  const totalCardDebt = useMemo(
    () => roundCurrency(debtCardsWithBalance.reduce((sum, card) => sum + card.balance, 0)),
    [debtCardsWithBalance],
  )

  const avalancheTarget = useMemo(
    () =>
      [...debtCardsWithBalance].sort((left, right) => {
        if (right.apr !== left.apr) return right.apr - left.apr
        if (right.monthlyInterest !== left.monthlyInterest) return right.monthlyInterest - left.monthlyInterest
        if (right.balance !== left.balance) return right.balance - left.balance
        return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
      })[0] ?? null,
    [debtCardsWithBalance],
  )

  const snowballTarget = useMemo(
    () =>
      [...debtCardsWithBalance].sort((left, right) => {
        if (left.balance !== right.balance) return left.balance - right.balance
        if (right.apr !== left.apr) return right.apr - left.apr
        if (right.monthlyInterest !== left.monthlyInterest) return right.monthlyInterest - left.monthlyInterest
        return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
      })[0] ?? null,
    [debtCardsWithBalance],
  )

  const riskCenterAlerts = useMemo<RiskCenterAlert[]>(() => {
    const alerts: RiskCenterAlert[] = []

    upcomingCashEvents
      .filter((event) => event.type !== 'income' && event.daysAway <= 14)
      .forEach((event) => {
        const severity: RiskSeverity = event.daysAway <= 1 ? 'critical' : event.daysAway <= 3 ? 'warning' : 'watch'
        alerts.push({
          id: `due-${event.id}`,
          severity,
          source: 'due_soon',
          title: `${event.label}: ${formatDueCountdown(event.daysAway)}`,
          detail: `${upcomingEventTypeLabel(event.type)} ${formatMoney(event.amount)} · ${dateLabel.format(
            new Date(`${event.date}T00:00:00`),
          )}`,
          daysAway: event.daysAway,
        })
      })

    cards.forEach((card) => {
      const creditLimit = toNonNegative(card.creditLimit)
      const currentBalance = toNonNegative(card.usedLimit)
      const statementBalance = toNonNegative(card.statementBalance ?? card.usedLimit)
      const pendingCharges = toNonNegative(card.pendingCharges ?? Math.max(currentBalance - statementBalance, 0))
      const monthlyRate = toNonNegative(card.interestRate) > 0 ? toNonNegative(card.interestRate) / 100 / 12 : 0
      const minimumPaymentType = normalizeCardMinimumPaymentType(card.minimumPaymentType)
      const minimumPayment = toNonNegative(card.minimumPayment)
      const minimumPaymentPercent = clampPercent(toNonNegative(card.minimumPaymentPercent))
      const extraPayment = toNonNegative(card.extraPayment)
      const interestAmount = roundCurrency(statementBalance * monthlyRate)
      const newStatementBalance = roundCurrency(statementBalance + interestAmount)
      const minimumDueRaw =
        minimumPaymentType === 'percent_plus_interest'
          ? statementBalance * (minimumPaymentPercent / 100) + interestAmount
          : minimumPayment
      const minimumDue = roundCurrency(Math.min(newStatementBalance, Math.max(minimumDueRaw, 0)))
      const plannedPayment = roundCurrency(Math.min(newStatementBalance, minimumDue + extraPayment))
      const dueAdjustedCurrent = roundCurrency(Math.max(newStatementBalance - plannedPayment, 0) + pendingCharges)
      const dueTiming = dueTimingForDay(toDayOfMonth(card.dueDay, 21))
      const displayCurrentBalance = dueTiming.dueApplied ? dueAdjustedCurrent : currentBalance
      const displayAvailableCredit = roundCurrency(creditLimit - displayCurrentBalance)
      const displayUtilization = utilizationFor(displayCurrentBalance, creditLimit)

      const utilizationSeverity = utilizationSeverityFor(displayUtilization)
      if (utilizationSeverity) {
        alerts.push({
          id: `util-${card._id}`,
          severity: utilizationSeverity,
          source: 'utilization',
          title: `${card.name}: ${formatPercent(displayUtilization)} utilization`,
          detail: `Threshold >30/50/90 · available credit ${formatMoney(displayAvailableCredit)}`,
        })
      }

      if (plannedPayment + 0.01 < interestAmount) {
        alerts.push({
          id: `interest-${card._id}`,
          severity: 'critical',
          source: 'payment_interest',
          title: `${card.name}: payment below interest`,
          detail: `Planned ${formatMoney(plannedPayment)} is below monthly interest ${formatMoney(interestAmount)}.`,
        })
      }
    })

    const pendingReconciliation = Math.max(summary.pendingPurchases, 0)
    if (pendingReconciliation > 0) {
      const pendingSeverity: RiskSeverity = pendingReconciliation >= 12 ? 'critical' : pendingReconciliation >= 6 ? 'warning' : 'watch'
      alerts.push({
        id: 'reconcile-pending',
        severity: pendingSeverity,
        source: 'reconciliation',
        title: `${pendingReconciliation} purchase${pendingReconciliation === 1 ? '' : 's'} pending reconciliation`,
        detail: `${summary.reconciledPurchases} reconciled · ${summary.postedPurchases} posted`,
      })
    }

    const unreconciledPosted = Math.max(summary.postedPurchases - summary.reconciledPurchases, 0)
    if (unreconciledPosted > 0 && summary.postedPurchases > 0) {
      const reconciliationCompletion = summary.reconciledPurchases / summary.postedPurchases
      const completionSeverity: RiskSeverity =
        reconciliationCompletion < 0.7 ? 'critical' : reconciliationCompletion < 0.9 ? 'warning' : 'watch'

      alerts.push({
        id: 'reconcile-gap',
        severity: completionSeverity,
        source: 'reconciliation',
        title: `${unreconciledPosted} posted purchase${unreconciledPosted === 1 ? '' : 's'} not reconciled`,
        detail: `${formatPercent(reconciliationCompletion)} completion across posted purchases`,
      })
    }

    cycleStepAlerts
      .filter((alert) => alert.severity === 'critical' || alert.severity === 'warning')
      .forEach((alert) => {
        alerts.push({
          id: `cycle-step-${alert._id}`,
          severity: alert.severity,
          source: 'cycle_step',
          title: `Cycle step failed: ${alert.step}`,
          detail: `${alert.cycleKey} (${alert.source}) · ${alert.message} · ${cycleDateLabel.format(
            new Date(alert.occurredAt),
          )}`,
        })
      })

    return alerts.sort((left, right) => {
      const severityDiff = riskSeverityRank[right.severity] - riskSeverityRank[left.severity]
      if (severityDiff !== 0) return severityDiff

      if (left.source === 'due_soon' && right.source === 'due_soon') {
        const leftDays = left.daysAway ?? Number.POSITIVE_INFINITY
        const rightDays = right.daysAway ?? Number.POSITIVE_INFINITY
        if (leftDays !== rightDays) return leftDays - rightDays
      }

      return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
    })
  }, [
    cards,
    dateLabel,
    formatMoney,
    formatPercent,
    summary.pendingPurchases,
    summary.postedPurchases,
    summary.reconciledPurchases,
    cycleDateLabel,
    cycleStepAlerts,
    upcomingCashEvents,
  ])

  const riskCenterSummary = useMemo(
    () => ({
      total: riskCenterAlerts.length,
      critical: riskCenterAlerts.filter((alert) => alert.severity === 'critical').length,
      warning: riskCenterAlerts.filter((alert) => alert.severity === 'warning').length,
      watch: riskCenterAlerts.filter((alert) => alert.severity === 'watch').length,
      dueSoon: riskCenterAlerts.filter((alert) => alert.source === 'due_soon').length,
      utilization: riskCenterAlerts.filter((alert) => alert.source === 'utilization').length,
      paymentVsInterest: riskCenterAlerts.filter((alert) => alert.source === 'payment_interest').length,
      reconciliation: riskCenterAlerts.filter((alert) => alert.source === 'reconciliation').length,
      cycleStep: riskCenterAlerts.filter((alert) => alert.source === 'cycle_step').length,
    }),
    [riskCenterAlerts],
  )

  const visibleUpcomingTimelineEvents = useMemo(
    () => upcomingCashEvents.filter((event) => event.daysAway <= timelineWindowDays),
    [timelineWindowDays, upcomingCashEvents],
  )

  const prioritizedIntegrationChecks = useMemo(
    () =>
      [...dashboardIntegration.checks]
        .sort((left, right) => {
          const rank = (status: 'pass' | 'warning' | 'fail' | 'skipped') => {
            if (status === 'fail') return 0
            if (status === 'warning') return 1
            if (status === 'skipped') return 2
            return 3
          }
          return rank(left.status) - rank(right.status) || left.label.localeCompare(right.label)
        })
        .slice(0, 14),
    [dashboardIntegration.checks],
  )

  const integrationSummaryTone =
    dashboardIntegration.failCount > 0 ? 'critical' : dashboardIntegration.warningCount > 0 ? 'warning' : 'good'
  const integrationGeneratedAtLabel = cycleDateLabel.format(new Date(dashboardIntegration.generatedAt))

  const formatIntegrationValue = (checkLabel: string, value: number | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a'
    const lowerLabel = checkLabel.toLowerCase()
    if (checkLabel.includes('%')) return `${value.toFixed(2)}%`
    if (lowerLabel.includes('count')) return `${Math.round(value)}`
    if (lowerLabel.includes('runway months')) return `${value.toFixed(2)} mo`
    return formatMoney(value)
  }

  const formatIntegrationDelta = (checkLabel: string, value: number | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a'
    const lowerLabel = checkLabel.toLowerCase()
    const sign = value >= 0 ? '+' : ''
    if (checkLabel.includes('%')) return `${sign}${value.toFixed(2)}%`
    if (lowerLabel.includes('count')) return `${sign}${Math.round(value)}`
    if (lowerLabel.includes('runway months')) return `${sign}${value.toFixed(2)} mo`
    return `${sign}${formatMoney(value)}`
  }

  const timelineProjectedImpact = useMemo(
    () => roundCurrency(visibleUpcomingTimelineEvents.reduce((sum, event) => sum + event.amount, 0)),
    [visibleUpcomingTimelineEvents],
  )

  const timelineProjectedEndCash = useMemo(
    () => roundCurrency(summary.liquidReserves + timelineProjectedImpact),
    [summary.liquidReserves, timelineProjectedImpact],
  )

  const paymentAmountValue = Number.parseFloat(paymentAmount)
  const chargeAmountValue = Number.parseFloat(chargeAmount)
  const canRecordPayment =
    Boolean(paymentCardId) && Number.isFinite(paymentAmountValue) && paymentAmountValue > 0 && !isSubmittingPayment
  const canAddCharge =
    Boolean(chargeCardId) && Number.isFinite(chargeAmountValue) && chargeAmountValue > 0 && !isSubmittingCharge

  const submitRecordPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!paymentCardId || !canRecordPayment) return
    setIsSubmittingPayment(true)
    try {
      await onActionQueueRecordPayment(paymentCardId, paymentAmountValue)
      setPaymentAmount('')
    } finally {
      setIsSubmittingPayment(false)
    }
  }

  const submitAddCharge = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!chargeCardId || !canAddCharge) return
    setIsSubmittingCharge(true)
    try {
      await onActionQueueAddCharge(chargeCardId, chargeAmountValue)
      setChargeAmount('')
    } finally {
      setIsSubmittingCharge(false)
    }
  }

  return (
    <div className="dashboard-tab-shell">
      <section className="executive-strip" aria-label="Executive summary strip">
        {executiveMetrics.map((metric) => (
          <SurfaceCard className="executive-card" key={metric.id}>
            <p className="executive-label">{metric.label}</p>
            <p className="executive-value">{metric.value}</p>
            <p className={`executive-delta executive-delta--${metric.tone}`}>{metric.delta}</p>
            <p className="executive-context">{metric.context}</p>
          </SurfaceCard>
        ))}
      </section>

      {compactMetricCards.length > 0 ? (
        <section className="metric-grid" aria-label="Finance intelligence metrics">
          {compactMetricCards.map((card) => (
            <SurfaceCard className="metric-card" key={card.id}>
              <p className="metric-label">{card.label}</p>
              <p className="metric-value">{card.value}</p>
              <p className={`metric-change metric-change--${card.trend}`}>{card.note}</p>
            </SurfaceCard>
          ))}
        </section>
      ) : null}

      <section className="content-grid" aria-label="Finance intelligence panels">
        <SurfaceCard className="panel panel-trust-kpis">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Trust Layer</p>
              <h2>Trust KPIs</h2>
            </div>
            <p className="panel-value">
              {kpis ? `Updated ${cycleDateLabel.format(new Date(kpis.updatedAt))}` : 'Awaiting data'}
            </p>
          </header>
          <div className="trust-kpi-grid">
            <div className="trust-kpi-tile">
              <p>Reconciliation completion</p>
              <strong>{formatPercent(reconciliationRate)}</strong>
              <small>
                {summary.reconciledPurchases} / {summary.postedPurchases} posted reconciled
              </small>
            </div>
            <div className="trust-kpi-tile">
              <p>Anomaly rate</p>
              <strong>{formatKpi(anomalyRate)}</strong>
              <small>
                {kpis
                  ? `${kpis.counts.anomalies} anomaly flags in ${kpis.counts.purchases} purchases`
                  : 'Enable diagnostics + activity for anomaly scoring'}
              </small>
            </div>
            <div className="trust-kpi-tile">
              <p>Duplicate rate</p>
              <strong>{formatKpi(duplicateRate)}</strong>
              <small>
                {kpis
                  ? `${kpis.counts.duplicates} duplicates in ${kpis.counts.purchases} purchases`
                  : 'Duplicate checks appear after purchase activity'}
              </small>
            </div>
            <div className="trust-kpi-tile">
              <p>Cycle success rate</p>
              <strong>{formatKpi(cycleSuccessRate)}</strong>
              <small>
                {monthlyCycleRuns.length > 0
                  ? `${completedCycleRuns} completed / ${monthlyCycleRuns.length} recorded runs`
                  : 'Run monthly cycle to establish baseline'}
              </small>
            </div>
            <div className="trust-kpi-tile">
              <p>Last successful cycle run</p>
              <strong>{latestSuccessfulCycleRun ? latestSuccessfulCycleRun.cycleKey : 'None yet'}</strong>
              <small>
                {latestSuccessfulCycleRun
                  ? `${cycleDateLabel.format(new Date(latestSuccessfulCycleRun.ranAt))} · ${latestSuccessfulCycleRun.source}`
                  : 'No completed monthly cycle recorded yet'}
              </small>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard className="panel panel-launch">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Release</p>
              <h2>Launch Readiness</h2>
            </div>
          </header>
          <ul className="launch-readiness">
            <li>
              <span>CSP</span>
              <strong>{cspLabel}</strong>
            </li>
            <li>
              <span>Retention</span>
              <strong>{retentionEnabled ? 'Enabled' : 'Off'}</strong>
            </li>
            <li>
              <span>Last export</span>
              <strong>
                {latestExport ? `${latestExport.status} (${cycleDateLabel.format(new Date(latestExport.createdAt))})` : 'None'}
              </strong>
            </li>
            <li>
              <span>Last cycle</span>
              <strong>
                {latestCycleRun
                  ? `${latestCycleRun.status} ${latestCycleRun.cycleKey} (${cycleDateLabel.format(new Date(latestCycleRun.ranAt))})`
                  : 'None'}
              </strong>
            </li>
            <li>
              <span>Reconciliation</span>
              <strong>{formatPercent(reconciliationRate)}</strong>
            </li>
          </ul>
          <p className="subnote">For production CSP enforcement, see docs in `docs/DEPLOYMENT.md`.</p>
        </SurfaceCard>

        <SurfaceCard className="panel panel-integration">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Integration</p>
              <h2>Cross-tab Consistency</h2>
            </div>
            <p className={`panel-value panel-value--${integrationSummaryTone}`}>
              {dashboardIntegration.failCount > 0
                ? `${dashboardIntegration.failCount} fail · ${dashboardIntegration.warningCount} warn`
                : dashboardIntegration.warningCount > 0
                  ? `${dashboardIntegration.warningCount} warning${dashboardIntegration.warningCount === 1 ? '' : 's'}`
                  : `${dashboardIntegration.passCount}/${dashboardIntegration.checks.length} checks passing`}
            </p>
          </header>
          <div className="integration-summary-grid">
            <SurfaceCard className="integration-summary-card integration-summary-card--good">
              <p>Pass</p>
              <strong>{dashboardIntegration.passCount}</strong>
              <small>Summary fields aligned with source tables</small>
            </SurfaceCard>
            <SurfaceCard className="integration-summary-card integration-summary-card--warning">
              <p>Warnings</p>
              <strong>{dashboardIntegration.warningCount}</strong>
              <small>Tolerance drift or rounding variance</small>
            </SurfaceCard>
            <SurfaceCard className="integration-summary-card integration-summary-card--critical">
              <p>Failures</p>
              <strong>{dashboardIntegration.failCount}</strong>
              <small>Requires formula or sync investigation</small>
            </SurfaceCard>
            <SurfaceCard className="integration-summary-card integration-summary-card--neutral">
              <p>Generated</p>
              <strong>{integrationGeneratedAtLabel}</strong>
              <small>{dashboardIntegration.checks.length} total checks across all sections</small>
            </SurfaceCard>
          </div>
          <ul className="integration-check-list">
            {prioritizedIntegrationChecks.map((check) => (
              <li key={check.id} className={`integration-check-item integration-check-item--${check.status}`}>
                <div className="integration-check-main">
                  <div className="integration-check-title-row">
                    <p>{check.label}</p>
                    <PillBadge className={`pill integration-status-pill integration-status-pill--${check.status}`}>{check.status}</PillBadge>
                  </div>
                  <small>{check.detail}</small>
                </div>
                <div className="integration-check-metrics" aria-label={`${check.label} values`}>
                  <div>
                    <span>Expected</span>
                    <strong>{formatIntegrationValue(check.label, check.expected)}</strong>
                  </div>
                  <div>
                    <span>Actual</span>
                    <strong>{formatIntegrationValue(check.label, check.actual)}</strong>
                  </div>
                  <div>
                    <span>Delta</span>
                    <strong
                      className={
                        typeof check.delta === 'number'
                          ? check.delta === 0
                            ? 'integration-delta integration-delta--neutral'
                            : check.delta > 0
                              ? 'integration-delta integration-delta--bad'
                              : 'integration-delta integration-delta--good'
                          : 'integration-delta integration-delta--neutral'
                      }
                    >
                      {formatIntegrationDelta(check.label, check.delta)}
                    </strong>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {dashboardIntegration.checks.length > prioritizedIntegrationChecks.length ? (
            <p className="subnote">
              Showing {prioritizedIntegrationChecks.length} of {dashboardIntegration.checks.length} checks (failures and warnings first).
            </p>
          ) : null}
        </SurfaceCard>

        <SurfaceCard className="panel panel-risk-center">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Risk Center</p>
              <h2>High-Visibility Alerts</h2>
            </div>
            <p className="panel-value">{riskCenterSummary.total} active</p>
          </header>
          <div className="risk-center-summary-grid">
            <SurfaceCard className="risk-center-summary-card risk-center-summary-card--critical">
              <p>Critical</p>
              <strong>{riskCenterSummary.critical}</strong>
            </SurfaceCard>
            <SurfaceCard className="risk-center-summary-card risk-center-summary-card--warning">
              <p>Warning</p>
              <strong>{riskCenterSummary.warning}</strong>
            </SurfaceCard>
            <SurfaceCard className="risk-center-summary-card risk-center-summary-card--watch">
              <p>Watch</p>
              <strong>{riskCenterSummary.watch}</strong>
            </SurfaceCard>
            <SurfaceCard className="risk-center-summary-card risk-center-summary-card--signals">
              <p>Signals</p>
              <strong>
                {riskCenterSummary.dueSoon} due · {riskCenterSummary.utilization} util · {riskCenterSummary.paymentVsInterest}{' '}
                pay/interest · {riskCenterSummary.reconciliation} reconciliation · {riskCenterSummary.cycleStep} cycle
                steps
              </strong>
            </SurfaceCard>
          </div>
          {riskCenterAlerts.length === 0 ? (
            <p className="empty-state">No active risk alerts. Due dates, utilization, and reconciliation look healthy right now.</p>
          ) : (
            <ul className="risk-center-list">
              {riskCenterAlerts.slice(0, 14).map((alert) => (
                <li key={alert.id} className={`risk-center-item risk-center-item--${alert.severity}`}>
                  <div className="risk-center-item-head">
                    <p>{alert.title}</p>
                    <PillBadge className={`pill risk-center-pill risk-center-pill--${alert.severity}`}>{alert.severity}</PillBadge>
                  </div>
                  <small>
                    {riskCenterSourceLabel(alert.source)} · {alert.detail}
                  </small>
                </li>
              ))}
            </ul>
          )}
          <p className="subnote">
            Alerts cover due-soon timelines, utilization tiers (&gt;30/50/90), payment-below-interest, and reconciliation gaps.
          </p>
        </SurfaceCard>

        <SurfaceCard className="panel panel-action-queue">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Action Queue</p>
              <h2>Quick Actions</h2>
            </div>
            <p className="panel-value">Run high-impact updates directly from dashboard</p>
          </header>
          <div className="action-queue-grid">
            <form className="action-queue-card" onSubmit={(event) => void submitRecordPayment(event)}>
              <p className="action-queue-title">Record payment</p>
              {cards.length === 0 ? (
                <p className="subnote">Add a card first to record payments.</p>
              ) : (
                <>
                  <label className="sr-only" htmlFor="action-queue-payment-card">
                    Card for payment
                  </label>
                  <select
                    id="action-queue-payment-card"
                    value={paymentCardId}
                    onChange={(event) => setPaymentCardId(event.target.value as CardId)}
                  >
                    {cards.map((card) => (
                      <option key={`payment-${card._id}`} value={card._id}>
                        {card.name}
                      </option>
                    ))}
                  </select>
                  <label className="sr-only" htmlFor="action-queue-payment-amount">
                    Payment amount
                  </label>
                  <input
                    id="action-queue-payment-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="Amount"
                    value={paymentAmount}
                    onChange={(event) => setPaymentAmount(event.target.value)}
                  />
                  <button type="submit" className="btn btn-secondary btn--sm" disabled={!canRecordPayment}>
                    {isSubmittingPayment ? 'Recording...' : 'Record payment'}
                  </button>
                </>
              )}
            </form>

            <form className="action-queue-card" onSubmit={(event) => void submitAddCharge(event)}>
              <p className="action-queue-title">Add charge</p>
              {cards.length === 0 ? (
                <p className="subnote">Add a card first to apply charges.</p>
              ) : (
                <>
                  <label className="sr-only" htmlFor="action-queue-charge-card">
                    Card for charge
                  </label>
                  <select
                    id="action-queue-charge-card"
                    value={chargeCardId}
                    onChange={(event) => setChargeCardId(event.target.value as CardId)}
                  >
                    {cards.map((card) => (
                      <option key={`charge-${card._id}`} value={card._id}>
                        {card.name}
                      </option>
                    ))}
                  </select>
                  <label className="sr-only" htmlFor="action-queue-charge-amount">
                    Charge amount
                  </label>
                  <input
                    id="action-queue-charge-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="Amount"
                    value={chargeAmount}
                    onChange={(event) => setChargeAmount(event.target.value)}
                  />
                  <button type="submit" className="btn btn-secondary btn--sm" disabled={!canAddCharge}>
                    {isSubmittingCharge ? 'Adding...' : 'Add charge'}
                  </button>
                </>
              )}
            </form>

            <SurfaceCard className="action-queue-card">
              <p className="action-queue-title">Run monthly cycle</p>
              <p className="subnote">
                Apply card/loan monthly updates, interest accrual, and snapshot calculations for the current cycle.
              </p>
              <button
                type="button"
                className="btn btn-secondary btn--sm"
                onClick={() => void onActionQueueRunMonthlyCycle()}
                disabled={isRunningMonthlyCycle}
              >
                {isRunningMonthlyCycle ? 'Running cycle...' : 'Run monthly cycle'}
              </button>
            </SurfaceCard>

            <SurfaceCard className="action-queue-card">
              <p className="action-queue-title">Reconcile pending</p>
              <p className="subnote">
                {pendingReconciliationCount > 0
                  ? `${pendingReconciliationCount} pending purchase${pendingReconciliationCount === 1 ? '' : 's'} ready to reconcile.`
                  : 'No pending purchases waiting for reconciliation.'}
              </p>
              <button
                type="button"
                className="btn btn-secondary btn--sm"
                onClick={() => void onActionQueueReconcilePending()}
                disabled={isReconcilingPending || pendingReconciliationCount === 0}
              >
                {isReconcilingPending ? 'Reconciling...' : 'Reconcile pending'}
              </button>
            </SurfaceCard>
          </div>
        </SurfaceCard>

        <SurfaceCard className="panel panel-cash-forecast">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Forecast</p>
              <h2>30 / 90 / 365 Cashflow Path</h2>
            </div>
            <p className="panel-value">{formatMoney(summary.liquidReserves)} starting liquid reserves</p>
          </header>
          {orderedForecastWindows.length === 0 ? (
            <p className="empty-state">No forecast windows available yet. Add more finance entries to generate forecast data.</p>
          ) : (
            <>
              <div className="forecast-window-strip">
                {orderedForecastWindows.map((window) => (
                  <SurfaceCard className="forecast-window-card" key={window.days}>
                    <p>{window.days}-day horizon</p>
                    <strong className={window.projectedCash < 0 ? 'amount-negative' : 'amount-positive'}>
                      {formatMoney(window.projectedCash)}
                    </strong>
                    <small>
                      {formatMoney(window.projectedNet)} net • {window.coverageMonths.toFixed(1)} mo coverage
                    </small>
                    <PillBadge className={forecastRiskPill(window.risk)}>{window.risk}</PillBadge>
                  </SurfaceCard>
                ))}
              </div>

              <div className="forecast-chart-wrap" aria-label="Expected balance path">
                <svg
                  className="forecast-chart"
                  viewBox={`0 0 ${forecastChart.width} ${forecastChart.height}`}
                  role="img"
                  aria-label="Expected cash balance path for today, 30, 90, and 365 days"
                >
                  {forecastChart.zeroLineY !== null ? (
                    <line
                      x1="0"
                      y1={forecastChart.zeroLineY}
                      x2={forecastChart.width}
                      y2={forecastChart.zeroLineY}
                      className="forecast-zero-line"
                    />
                  ) : null}
                  <polyline className="forecast-line" points={forecastChart.line} />
                  {forecastChart.points.map((point) => (
                    <circle
                      key={point.id}
                      cx={point.x}
                      cy={point.y}
                      r="4.2"
                      className={`forecast-point forecast-point--${point.risk}`}
                    />
                  ))}
                </svg>
                <div className="forecast-axis-labels">
                  {forecastChart.points.map((point) => (
                    <span key={`${point.id}-label`}>{point.label}</span>
                  ))}
                </div>
              </div>

              <div className="forecast-risk-block">
                <h3>Low cash risk points</h3>
                {lowCashRiskPoints.length === 0 ? (
                  <p className="subnote">No low-cash risk points across current 30/90/365 horizons.</p>
                ) : (
                  <ul className="forecast-risk-list">
                    {lowCashRiskPoints.map((point) => (
                      <li key={`${point.id}-risk`}>
                        <div>
                          <p>{point.days === 0 ? 'Today' : `${point.days}-day horizon`}</p>
                          <small>
                            {formatMoney(point.projectedCash)} projected cash • {point.coverageMonths.toFixed(1)} mo coverage
                          </small>
                        </div>
                        <PillBadge className={forecastRiskPill(point.risk)}>{point.risk}</PillBadge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </SurfaceCard>

        <SurfaceCard className="panel panel-debt-focus">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Debt Focus</p>
              <h2>Payoff Intelligence</h2>
            </div>
            <p className="panel-value">{formatMoney(totalCardDebt)} total card debt</p>
          </header>
          {debtCardsWithBalance.length === 0 ? (
            <p className="empty-state">No active card balances to optimize. Add card balances to get Avalanche and Snowball targets.</p>
          ) : (
            <>
              <div className="debt-focus-summary">
                <SurfaceCard className="debt-focus-summary-card">
                  <p>Projected next-month interest</p>
                  <strong>{formatMoney(projectedDebtInterestNextMonth)}</strong>
                </SurfaceCard>
                <SurfaceCard className="debt-focus-summary-card">
                  <p>Projected 12-month interest</p>
                  <strong>{formatMoney(projectedDebtInterest12Month)}</strong>
                  <small>if payments/spend stay unchanged</small>
                </SurfaceCard>
              </div>

              <div className="debt-focus-target-grid">
                <SurfaceCard className="debt-focus-target-card">
                  <p className="debt-focus-target-label">Avalanche target</p>
                  <strong>{avalancheTarget?.name ?? 'n/a'}</strong>
                  <small>
                    {avalancheTarget
                      ? `${formatMoney(avalancheTarget.balance)} balance · ${avalancheTarget.apr.toFixed(2)}% APR · ${formatMoney(avalancheTarget.projectedNextMonthInterest)} next-month interest`
                      : 'No eligible card'}
                  </small>
                </SurfaceCard>
                <SurfaceCard className="debt-focus-target-card">
                  <p className="debt-focus-target-label">Snowball target</p>
                  <strong>{snowballTarget?.name ?? 'n/a'}</strong>
                  <small>
                    {snowballTarget
                      ? `${formatMoney(snowballTarget.balance)} balance · ${snowballTarget.apr.toFixed(2)}% APR · ${formatMoney(snowballTarget.projectedNextMonthInterest)} next-month interest`
                      : 'No eligible card'}
                  </small>
                </SurfaceCard>
              </div>

              <p className="subnote">
                Target logic: Avalanche prioritizes highest APR. Snowball prioritizes smallest balance. Both estimates use your current
                minimum/extra payment setup.
              </p>
            </>
          )}
        </SurfaceCard>

        <SurfaceCard className="panel panel-commitments">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Commitments</p>
              <h2>Monthly Commitments Breakdown</h2>
            </div>
            <p className="panel-value">{formatMoney(summary.monthlyCommitments)}</p>
          </header>
          <p className={`commitments-trend commitments-trend--${totalCommitmentTone}`}>
            {formatVsLastMonthDelta(totalCommitmentDelta)}
          </p>
          <p className="subnote">
            {baselineSnapshot
              ? `Compared with ${monthLabel(baselineSnapshot.cycleKey)} close.`
              : 'Run the monthly cycle again to unlock month-over-month trend context.'}
          </p>
          <div
            className="commitments-stack"
            role="img"
            aria-label="Monthly commitments split across bills, cards, loan payments, and subscriptions"
          >
            {commitmentSlices.map((slice) => {
              const width = commitmentSliceTotal > 0 ? (slice.value / commitmentSliceTotal) * 100 : 0
              return (
                <span
                  key={`stack-${slice.id}`}
                  className={`commitment-segment commitment-segment--${slice.id}`}
                  style={{ '--segment-width': `${width}%` } as CSSProperties}
                />
              )
            })}
          </div>
          <ul className="commitments-breakdown-list">
            {commitmentSlices.map((slice) => {
              const share = commitmentSliceTotal > 0 ? slice.value / commitmentSliceTotal : 0
              const delta = slice.baselineValue === null ? null : slice.value - slice.baselineValue
              const tone = deltaTone(delta, true)
              return (
                <li key={slice.id}>
                  <div className="commitments-breakdown-head">
                    <p>
                      <span className={`commitment-dot commitment-dot--${slice.id}`} />
                      {slice.label}
                    </p>
                    <strong>{formatMoney(slice.value)}</strong>
                  </div>
                  <div className="commitments-breakdown-meta">
                    <small>{formatPercent(share)} of commitments</small>
                    <span className={`commitments-delta commitments-delta--${tone}`}>{formatVsLastMonthDelta(delta)}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        </SurfaceCard>

        <SurfaceCard className="panel panel-net-worth-composition">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Net Worth</p>
              <h2>Composition Drivers</h2>
            </div>
            <p className="panel-value">{formatMoney(compositionNetWorth)}</p>
          </header>
          <p className={`net-worth-trend net-worth-trend--${deltaTone(compositionNetWorthDelta)}`}>
            {formatVsLastMonthDelta(compositionNetWorthDelta)}
          </p>
          <div className="net-worth-summary-grid">
            <SurfaceCard className="net-worth-summary-card">
              <p>Assets total</p>
              <strong>{formatMoney(compositionAssetsTotal)}</strong>
              <small className={`net-worth-delta net-worth-delta--${deltaTone(compositionAssetsDelta)}`}>
                {formatVsLastMonthDelta(compositionAssetsDelta)}
              </small>
            </SurfaceCard>
            <SurfaceCard className="net-worth-summary-card">
              <p>Liabilities total</p>
              <strong>{formatMoney(compositionLiabilitiesTotal)}</strong>
              <small className={`net-worth-delta net-worth-delta--${deltaTone(compositionLiabilitiesDelta, true)}`}>
                {formatVsLastMonthDelta(compositionLiabilitiesDelta)}
              </small>
            </SurfaceCard>
          </div>
          {dominantNetWorthDriver ? (
            <p className={`subnote net-worth-driver net-worth-driver--${dominantNetWorthDriverTone}`}>
              Primary mover: {dominantNetWorthDriver.label} ({dominantNetWorthDriver.side}){' '}
              {formatVsLastMonthDelta(dominantNetWorthDriver.impact)} impact on net worth.
            </p>
          ) : (
            <p className="subnote">
              Run monthly cycle snapshots to unlock driver-level month-over-month impact on net worth.
            </p>
          )}
          <section className="net-worth-group">
            <h3>Assets by category</h3>
            <ul className="net-worth-list">
              {assetCategories.map((category) => {
                const share = compositionAssetsTotal > 0 ? category.value / compositionAssetsTotal : 0
                const delta = category.baselineValue === null ? null : category.value - category.baselineValue
                const tone = netWorthCategoryTone(category, delta)
                return (
                  <li key={category.id} className={`net-worth-item net-worth-item--${category.side}`}>
                    <div className="net-worth-item-head">
                      <p>{category.label}</p>
                      <strong>{formatMoney(category.value)}</strong>
                    </div>
                    <div className="net-worth-item-meta">
                      <small>{formatPercent(share)} of assets</small>
                      <span className={`net-worth-delta net-worth-delta--${tone}`}>{formatVsLastMonthDelta(delta)}</span>
                    </div>
                    <div className="net-worth-bar-track">
                      <span
                        className={`net-worth-bar-fill net-worth-bar-fill--${category.side}`}
                        style={{ '--composition-width': `${share * 100}%` } as CSSProperties}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
          <section className="net-worth-group">
            <h3>Liabilities by category</h3>
            <ul className="net-worth-list">
              {liabilityCategories.map((category) => {
                const share = compositionLiabilitiesTotal > 0 ? category.value / compositionLiabilitiesTotal : 0
                const delta = category.baselineValue === null ? null : category.value - category.baselineValue
                const tone = netWorthCategoryTone(category, delta)
                return (
                  <li key={category.id} className={`net-worth-item net-worth-item--${category.side}`}>
                    <div className="net-worth-item-head">
                      <p>{category.label}</p>
                      <strong>{formatMoney(category.value)}</strong>
                    </div>
                    <div className="net-worth-item-meta">
                      <small>{formatPercent(share)} of liabilities</small>
                      <span className={`net-worth-delta net-worth-delta--${tone}`}>{formatVsLastMonthDelta(delta)}</span>
                    </div>
                    <div className="net-worth-bar-track">
                      <span
                        className={`net-worth-bar-fill net-worth-bar-fill--${category.side}`}
                        style={{ '--composition-width': `${share * 100}%` } as CSSProperties}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        </SurfaceCard>

        <SurfaceCard className="panel panel-health">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Health</p>
              <h2>System Status</h2>
            </div>
          </header>
          <div className="health-ring-wrap">
            <div
              className="health-ring"
              style={{ '--ring-score': `${Math.min(Math.max(summary.healthScore, 0), 100)}%` } as CSSProperties}
            >
              <div className="health-ring-inner">
                <strong>{summary.healthScore}</strong>
                <span>/ 100</span>
              </div>
            </div>
            <ul className="status-list">
              <li>
                <span>Savings Rate</span>
                <strong>{formatPercent(summary.savingsRatePercent / 100)}</strong>
              </li>
              <li>
                <span>Card Utilization</span>
                <strong>{formatPercent(summary.cardUtilizationPercent / 100)}</strong>
              </li>
              <li>
                <span>Goal Funding</span>
                <strong>{formatPercent(summary.goalsFundedPercent / 100)}</strong>
              </li>
              <li>
                <span>Reconciled Purchases</span>
                <strong>
                  {summary.reconciledPurchases} / {summary.postedPurchases}
                </strong>
              </li>
            </ul>
          </div>
        </SurfaceCard>

        <SurfaceCard className="panel panel-insights">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Insights</p>
              <h2>Automated Finance Brief</h2>
            </div>
          </header>
          {insights.length === 0 ? (
            <p className="empty-state">Add finance data to generate contextual insights.</p>
          ) : (
            <ul className="insight-list">
              {insights.map((insight) => (
                <li key={insight.id}>
                  <div>
                    <p>{insight.title}</p>
                    <small>{insight.detail}</small>
                  </div>
                  <span className={`severity severity--${insight.severity}`}>{severityLabel(insight.severity)}</span>
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>

        <SurfaceCard className="panel panel-cash-events">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Flow</p>
              <h2>Upcoming Money Timeline</h2>
              <p className="subnote">
                {timelineWindowDays}-day projected impact {formatMoney(timelineProjectedImpact)} · projected liquid{' '}
                {formatMoney(timelineProjectedEndCash)}
              </p>
            </div>
            <div className="dashboard-timeline-window-toggle" role="group" aria-label="Timeline window">
              <button
                type="button"
                className={`btn btn-ghost btn--sm ${timelineWindowDays === 14 ? 'dashboard-timeline-window-btn--active' : ''}`}
                onClick={() => setTimelineWindowDays(14)}
              >
                14d
              </button>
              <button
                type="button"
                className={`btn btn-ghost btn--sm ${timelineWindowDays === 30 ? 'dashboard-timeline-window-btn--active' : ''}`}
                onClick={() => setTimelineWindowDays(30)}
              >
                30d
              </button>
            </div>
          </header>
          {visibleUpcomingTimelineEvents.length === 0 ? (
            <p className="empty-state">
              No scheduled income, bills, card dues, or loan payments in the next {timelineWindowDays} days.
            </p>
          ) : (
            <ul className="timeline-list">
              {visibleUpcomingTimelineEvents.map((event) => (
                <li key={event.id}>
                  <div>
                    <p>{event.label}</p>
                    <small>
                      {upcomingEventTypeLabel(event.type)} • {dateLabel.format(new Date(`${event.date}T00:00:00`))} •{' '}
                      {event.daysAway} day
                      {event.daysAway === 1 ? '' : 's'} • {cadenceLabel(event.cadence, event.customInterval, event.customUnit)}
                    </small>
                  </div>
                  <strong className={event.type === 'income' ? 'amount-positive' : 'amount-negative'}>
                    {formatMoney(event.amount)}
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>

        <SurfaceCard className="panel panel-categories">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Spending</p>
              <h2>Category Concentration</h2>
            </div>
            <p className="panel-value">{formatMoney(summary.purchasesThisMonth)} this month</p>
          </header>
          {topCategories.length === 0 ? (
            <p className="empty-state">No purchases this month yet.</p>
          ) : (
            <ul className="category-bars">
              {topCategories.map((category) => (
                <li key={category.category}>
                  <div className="category-row">
                    <span>{category.category}</span>
                    <strong>{formatMoney(category.total)}</strong>
                  </div>
                  <div className="bar-track">
                    <span className="bar-fill" style={{ '--bar-width': `${category.sharePercent}%` } as CSSProperties} />
                  </div>
                  <small>{formatPercent(category.sharePercent / 100)} of monthly purchases</small>
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>

        <SurfaceCard className="panel panel-month-close">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Month Close</p>
              <h2>Snapshots</h2>
            </div>
          </header>
          {monthCloseSnapshots.length === 0 ? (
            <p className="empty-state">No month-close snapshots yet.</p>
          ) : (
            <ul className="timeline-list">
              {monthCloseSnapshots.slice(0, 6).map((snapshot) => (
                <li key={snapshot._id}>
                  <div>
                    <p>{snapshot.cycleKey}</p>
                    <small>
                      Net worth {formatMoney(snapshot.summary.netWorth)} • Commitments{' '}
                      {formatMoney(snapshot.summary.monthlyCommitments)}
                    </small>
                  </div>
                  <strong>{cycleDateLabel.format(new Date(snapshot.ranAt))}</strong>
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>

        <SurfaceCard className="panel panel-goal-preview">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Goals</p>
              <h2>Progress Tracker</h2>
            </div>
          </header>
          {goalsWithMetrics.length === 0 ? (
            <p className="empty-state">No goals yet. Add one in the Goals section.</p>
          ) : (
            <ul className="goal-preview-list">
              {goalsWithMetrics.slice(0, 4).map((goal) => (
                <li key={goal._id}>
                  <div className="goal-preview-row">
                    <span>{goal.title}</span>
                    <strong>{formatPercent(goal.progressPercent / 100)}</strong>
                  </div>
                  <div className="bar-track">
                    <span className="bar-fill" style={{ '--bar-width': `${goal.progressPercent}%` } as CSSProperties} />
                  </div>
                  <small>{formatMoney(goal.remaining)} remaining</small>
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>

        <SurfaceCard className="panel panel-cycle-runs">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Cycle Control</p>
              <h2>Deterministic Run Journal</h2>
            </div>
          </header>
          {monthlyCycleRuns.length === 0 ? (
            <p className="empty-state">No deterministic cycle runs yet.</p>
          ) : (
            <ul className="timeline-list">
              {monthlyCycleRuns.slice(0, 8).map((run) => (
                <li key={run._id}>
                  <div>
                    <p>
                      {run.cycleKey} ({run.source})
                    </p>
                    <small>
                      {run.updatedCards} cards + {run.updatedLoans} loans updated
                    </small>
                  </div>
                  <strong>{cycleDateLabel.format(new Date(run.ranAt))}</strong>
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>

        <SurfaceCard className="panel panel-cycle-step-alerts">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Reliability</p>
              <h2>Cycle Step Alerts</h2>
            </div>
          </header>
          {cycleStepAlerts.length === 0 ? (
            <p className="empty-state">No failed cycle steps recorded.</p>
          ) : (
            <ul className="timeline-list">
              {cycleStepAlerts.slice(0, 10).map((alert) => (
                <li key={alert._id}>
                  <div>
                    <p>
                      {alert.cycleKey} · {alert.step}
                    </p>
                    <small>
                      {alert.source} · {alert.message}
                    </small>
                  </div>
                  <strong>{cycleDateLabel.format(new Date(alert.occurredAt))}</strong>
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>

        <SurfaceCard className="panel panel-cycle-log">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Cycle Engine</p>
              <h2>Monthly Cycle Audit Log</h2>
            </div>
          </header>
          {cycleAuditLogs.length === 0 ? (
            <p className="empty-state">No cycle runs logged yet.</p>
          ) : (
            <ul className="cycle-log-list">
              {cycleAuditLogs.slice(0, 10).map((entry) => (
                <li key={entry._id}>
                  <div className="cycle-log-row">
                    <p>{entry.source === 'manual' ? 'Manual Run' : 'Automatic Sync'}</p>
                    <strong>{cycleDateLabel.format(new Date(entry.ranAt))}</strong>
                  </div>
                  <small>
                    {entry.updatedCards} cards ({entry.cardCyclesApplied} cycles), {entry.updatedLoans} loans (
                    {entry.loanCyclesApplied} cycles)
                  </small>
                  <small>
                    {formatMoney(entry.cardInterestAccrued)} card interest, {formatMoney(entry.loanInterestAccrued)} loan
                    interest, {formatMoney(entry.cardPaymentsApplied + entry.loanPaymentsApplied)} total payments
                  </small>
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>

        <SurfaceCard className="panel panel-ledger">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Ledger</p>
              <h2>Recent Entries</h2>
            </div>
          </header>
          {ledgerEntries.length === 0 ? (
            <p className="empty-state">No ledger entries yet.</p>
          ) : (
            <ul className="timeline-list">
              {ledgerEntries.slice(0, 10).map((entry) => (
                <li key={entry._id}>
                  <div>
                    <p>{entry.description}</p>
                    <small>
                      {entry.entryType} • {entry.referenceType ?? 'system'}
                    </small>
                  </div>
                  <strong>{cycleDateLabel.format(new Date(entry.occurredAt))}</strong>
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>

        <SurfaceCard className="panel panel-snapshot">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Snapshot</p>
              <h2>Data Coverage</h2>
            </div>
          </header>
          <ul className="snapshot-list">
            <li>
              <span>Income entries</span>
              <strong>{counts.incomes}</strong>
            </li>
            <li>
              <span>Bill entries</span>
              <strong>{counts.bills}</strong>
            </li>
            <li>
              <span>Card entries</span>
              <strong>{counts.cards}</strong>
            </li>
            <li>
              <span>Loan entries</span>
              <strong>{counts.loans}</strong>
            </li>
            <li>
              <span>Purchase entries</span>
              <strong>{counts.purchases}</strong>
            </li>
            <li>
              <span>Account entries</span>
              <strong>{counts.accounts}</strong>
            </li>
            <li>
              <span>Goal entries</span>
              <strong>{counts.goals}</strong>
            </li>
          </ul>
        </SurfaceCard>

        <SurfaceCard className="panel panel-audit-events">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Audit Trail</p>
              <h2>Finance Change Events</h2>
            </div>
          </header>
          {financeAuditEvents.length === 0 ? (
            <p className="empty-state">No finance events recorded yet.</p>
          ) : (
            <ul className="timeline-list">
              {financeAuditEvents.slice(0, 10).map((event) => (
                <li key={event._id}>
                  <div>
                    <p>
                      {event.entityType}: {event.action}
                    </p>
                    <small>{event.entityId}</small>
                  </div>
                  <strong>{cycleDateLabel.format(new Date(event.createdAt))}</strong>
                </li>
              ))}
            </ul>
          )}
        </SurfaceCard>

      </section>
    </div>
  )
}
