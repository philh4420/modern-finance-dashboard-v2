import { useEffect, useMemo, useRef, useState } from 'react'
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth,
} from '@clerk/clerk-react'
import { useMutation, useQuery } from 'convex/react'
import { cn } from '@/lib/utils'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui'
import { api } from '../convex/_generated/api'
import { AccountsTab } from './components/AccountsTab'
import { BillsTab } from './components/BillsTab'
import { CardsTab } from './components/CardsTab'
import { DashboardTab } from './components/DashboardTab'
import { PlanningTab } from './components/PlanningTab'
import { PrintReport } from './components/PrintReport'
import { PrintReportModal, type PrintReportConfig } from './components/PrintReportModal'
import { SettingsTab } from './components/SettingsTab'
import type {
  DashboardCard,
  DashboardCardId,
  DashboardIntegrationCheck,
  DashboardIntegrationSnapshot,
  TabKey,
} from './components/financeTypes'
import { GoalsTab } from './components/GoalsTab'
import { IncomeTab } from './components/IncomeTab'
import { LoansTab } from './components/LoansTab'
import { PwaUpdateToast } from './components/PwaUpdateToast'
import { PurchasesTab } from './components/PurchasesTab'
import { ReconcileTab } from './components/ReconcileTab'
import { useAccountsSection } from './hooks/useAccountsSection'
import { useBillsSection } from './hooks/useBillsSection'
import { useCardsSection } from './hooks/useCardsSection'
import { useFinanceFormat } from './hooks/useFinanceFormat'
import { useGoalsSection } from './hooks/useGoalsSection'
import { useIncomeSection } from './hooks/useIncomeSection'
import { useLoansSection } from './hooks/useLoansSection'
import { useMutationFeedback } from './hooks/useMutationFeedback'
import { usePlanningSection } from './hooks/usePlanningSection'
import { usePurchasesSection } from './hooks/usePurchasesSection'
import { useReconciliationSection } from './hooks/useReconciliationSection'
import { useSettingsSection } from './hooks/useSettingsSection'
import {
  accountPurposeOptions,
  billCategoryOptions,
  billScopeOptions,
  accountTypeOptions,
  cadenceOptions,
  customCadenceUnitOptions,
  dateLabel as fallbackDateLabel,
  defaultPreference,
  emptySummary,
  goalFundingSourceTypeOptions,
  goalPriorityOptions,
  goalTypeOptions,
  tabs,
} from './lib/financeConstants'
import { initDiagnostics, setDiagnosticsConsent } from './lib/diagnostics'
import {
  accountPurposeLabel,
  accountTypeLabel,
  cadenceLabel,
  goalTypeLabel,
  isCustomCadence,
  priorityLabel,
  severityLabel,
} from './lib/financeHelpers'
import './App.css'

type CspMode = 'unknown' | 'none' | 'report-only' | 'enforced'

const roundCurrency = (value: number) => Math.round(value * 100) / 100
const finiteOrZero = (value: number | null | undefined) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const clampPercent = (value: number) => clamp(value, 0, 100)
const normalizeMinimumPaymentType = <T extends 'fixed' | 'percent_plus_interest' | undefined | null>(value: T) =>
  value === 'percent_plus_interest' ? 'percent_plus_interest' : 'fixed'
const purchaseIsPosted = (status?: string | null) => !status || status !== 'pending'
const currentLocalMonthKey = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
const toMonthlyAmount = (
  amount: number,
  cadence?: string | null,
  customInterval?: number | null,
  customUnit?: string | null,
) => {
  const safeAmount = finiteOrZero(amount)
  switch (cadence) {
    case 'weekly':
      return (safeAmount * 52) / 12
    case 'biweekly':
      return (safeAmount * 26) / 12
    case 'monthly':
      return safeAmount
    case 'quarterly':
      return safeAmount / 3
    case 'yearly':
      return safeAmount / 12
    case 'custom': {
      const interval = finiteOrZero(customInterval)
      if (interval <= 0) return 0
      switch (customUnit) {
        case 'days':
          return (safeAmount * 365.2425) / (interval * 12)
        case 'weeks':
          return (safeAmount * 365.2425) / (interval * 7 * 12)
        case 'months':
          return safeAmount / interval
        case 'years':
          return safeAmount / (interval * 12)
        default:
          return 0
      }
    }
    case 'one_time':
      return 0
    default:
      return safeAmount
  }
}
const resolveIncomeNetAmount = (entry: {
  amount?: number | null
  grossAmount?: number | null
  taxAmount?: number | null
  nationalInsuranceAmount?: number | null
  pensionAmount?: number | null
}) => {
  const gross = finiteOrZero(entry.grossAmount)
  const deductions = finiteOrZero(entry.taxAmount) + finiteOrZero(entry.nationalInsuranceAmount) + finiteOrZero(entry.pensionAmount)
  if (gross > 0 || deductions > 0) return Math.max(gross - deductions, 0)
  return Math.max(finiteOrZero(entry.amount), 0)
}
const estimateCardMonthlyPayment = (card: {
  usedLimit?: number | null
  statementBalance?: number | null
  interestRate?: number | null
  minimumPayment?: number | null
  minimumPaymentType?: 'fixed' | 'percent_plus_interest' | null
  minimumPaymentPercent?: number | null
  extraPayment?: number | null
}) => {
  const statementBalance = Math.max(finiteOrZero(card.statementBalance ?? card.usedLimit), 0)
  const apr = finiteOrZero(card.interestRate)
  const interestAmount = statementBalance * (apr > 0 ? apr / 100 / 12 : 0)
  const dueBalance = statementBalance + interestAmount
  const minimumPaymentType = normalizeMinimumPaymentType(card.minimumPaymentType)
  const minimumPayment = finiteOrZero(card.minimumPayment)
  const minimumPaymentPercent = clampPercent(finiteOrZero(card.minimumPaymentPercent))
  const extraPayment = finiteOrZero(card.extraPayment)
  const minimumDueRaw =
    minimumPaymentType === 'percent_plus_interest'
      ? statementBalance * (minimumPaymentPercent / 100) + interestAmount
      : minimumPayment
  const minimumDue = Math.min(dueBalance, Math.max(minimumDueRaw, 0))
  const plannedPayment = Math.min(dueBalance, minimumDue + extraPayment)
  return roundCurrency(plannedPayment)
}
const getLoanWorkingBalances = (loan: {
  balance?: number | null
  principalBalance?: number | null
  accruedInterest?: number | null
}) => {
  const hasExplicitComponents = loan.principalBalance !== undefined || loan.accruedInterest !== undefined
  const principalBalance = Math.max(
    hasExplicitComponents ? finiteOrZero(loan.principalBalance) : finiteOrZero(loan.balance),
    0,
  )
  const accruedInterest = Math.max(hasExplicitComponents ? finiteOrZero(loan.accruedInterest) : 0, 0)
  const balance = Math.max(hasExplicitComponents ? principalBalance + accruedInterest : finiteOrZero(loan.balance), 0)
  return {
    principalBalance: roundCurrency(principalBalance),
    accruedInterest: roundCurrency(accruedInterest),
    balance: roundCurrency(balance),
  }
}
const normalizePositiveInteger = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
const getLoanSubscriptionOutstanding = (loan: {
  subscriptionCost?: number | null
  subscriptionPaymentCount?: number | null
  subscriptionOutstanding?: number | null
}) => {
  const subscriptionCost = roundCurrency(Math.max(finiteOrZero(loan.subscriptionCost), 0))
  if (subscriptionCost <= 0) return 0
  const normalizedConfiguredPaymentCount = normalizePositiveInteger(loan.subscriptionPaymentCount)
  if (loan.subscriptionOutstanding !== undefined && loan.subscriptionOutstanding !== null) {
    const current = roundCurrency(Math.max(finiteOrZero(loan.subscriptionOutstanding), 0))
    if (normalizedConfiguredPaymentCount === undefined && current <= subscriptionCost + 0.000001) {
      return roundCurrency(subscriptionCost * 12)
    }
    return current
  }
  return roundCurrency(subscriptionCost * (normalizedConfiguredPaymentCount ?? 12))
}
const getLoanTotalOutstanding = (loan: {
  balance?: number | null
  principalBalance?: number | null
  accruedInterest?: number | null
  subscriptionCost?: number | null
  subscriptionPaymentCount?: number | null
  subscriptionOutstanding?: number | null
}) => {
  const working = getLoanWorkingBalances(loan)
  return roundCurrency(working.balance + getLoanSubscriptionOutstanding(loan))
}
const estimateLoanMonthlyPayment = (loan: {
  balance?: number | null
  principalBalance?: number | null
  accruedInterest?: number | null
  minimumPayment?: number | null
  minimumPaymentType?: 'fixed' | 'percent_plus_interest' | null
  minimumPaymentPercent?: number | null
  extraPayment?: number | null
  interestRate?: number | null
  cadence?: string | null
  customInterval?: number | null
  customUnit?: string | null
}) => {
  const working = getLoanWorkingBalances(loan)
  if (working.balance <= 0) return 0
  const occurrencesPerMonth = toMonthlyAmount(1, loan.cadence, loan.customInterval, loan.customUnit)
  const intervalMonths = occurrencesPerMonth > 0 ? 1 / occurrencesPerMonth : 1
  const apr = finiteOrZero(loan.interestRate)
  const monthlyRate = apr > 0 ? apr / 100 / 12 : 0
  const interestAmount = working.balance * monthlyRate * intervalMonths
  const dueBalance = working.balance + interestAmount
  const minimumPaymentType = normalizeMinimumPaymentType(loan.minimumPaymentType)
  const minimumPayment = finiteOrZero(loan.minimumPayment)
  const minimumPaymentPercent = clampPercent(finiteOrZero(loan.minimumPaymentPercent))
  const extraPayment = finiteOrZero(loan.extraPayment)
  const minimumDueRaw =
    minimumPaymentType === 'percent_plus_interest'
      ? working.principalBalance * (minimumPaymentPercent / 100) + (working.accruedInterest + interestAmount)
      : minimumPayment
  const minimumDue = Math.min(dueBalance, Math.max(minimumDueRaw, 0))
  const plannedPayment = Math.min(dueBalance, minimumDue + extraPayment)
  if (occurrencesPerMonth <= 0) return 0
  return roundCurrency(plannedPayment * occurrencesPerMonth)
}
const nearlyEqual = (a: number, b: number, tolerance = 0.01) => Math.abs(a - b) <= tolerance

function App() {
  const { userId } = useAuth()
  const financeState = useQuery(api.finance.getFinanceData)
  const phase2MonthKey = useMemo(() => new Date().toISOString().slice(0, 7), [])
  const phase2State = useQuery(api.phase2.getPhase2Data, { month: phase2MonthKey })
  const privacyState = useQuery(api.privacy.getPrivacyData)
  const kpisState = useQuery(api.ops.getKpis, { windowDays: 30 })
  const cleanupLegacySeedData = useMutation(api.finance.cleanupLegacySeedData)
  const runMonthlyCycle = useMutation(api.finance.runMonthlyCycle)
  const bulkUpdatePurchaseReconciliation = useMutation(api.phase2.bulkUpdatePurchaseReconciliation)
  const logClientOpsMetric = useMutation(api.ops.logClientOpsMetric)

  const cleanupTriggered = useRef(false)
  const monthlyCycleTriggered = useRef(false)
  const defaultLandingTabApplied = useRef(false)
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard')
  const [isRunningMonthlyCycle, setIsRunningMonthlyCycle] = useState(false)
  const [isReconcilingPending, setIsReconcilingPending] = useState(false)
  const [printModalOpen, setPrintModalOpen] = useState(false)
  const [printConfig, setPrintConfig] = useState<PrintReportConfig | null>(null)
  const [cspMode, setCspMode] = useState<CspMode>('unknown')
  const { errorMessage, clearError, handleMutationError } = useMutationFeedback()

  useEffect(() => {
    if (!financeState?.isAuthenticated) {
      cleanupTriggered.current = false
      monthlyCycleTriggered.current = false
      defaultLandingTabApplied.current = false
      return
    }

    if (!cleanupTriggered.current) {
      cleanupTriggered.current = true
      void cleanupLegacySeedData({})
    }

    if (!monthlyCycleTriggered.current) {
      monthlyCycleTriggered.current = true
      void runMonthlyCycle({ source: 'automatic' })
    }
  }, [cleanupLegacySeedData, financeState?.isAuthenticated, runMonthlyCycle])

  useEffect(() => {
    const enabled = Boolean(privacyState?.consentSettings?.diagnosticsEnabled)
    setDiagnosticsConsent(enabled)
    if (!enabled) return

    const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
    if (!dsn) {
      return
    }

    initDiagnostics({ dsn, environment: import.meta.env.MODE })
  }, [privacyState?.consentSettings?.diagnosticsEnabled])

  useEffect(() => {
    if (!financeState?.isAuthenticated) {
      setCspMode('unknown')
      return
    }

    let cancelled = false

    const detect = async () => {
      try {
        const response = await fetch(`${window.location.origin}/`, { cache: 'no-store' })
        const enforced = response.headers.get('content-security-policy')
        const reportOnly = response.headers.get('content-security-policy-report-only')
        if (cancelled) return
        if (enforced) setCspMode('enforced')
        else if (reportOnly) setCspMode('report-only')
        else setCspMode('none')
      } catch {
        if (cancelled) return
        setCspMode('unknown')
      }
    }

    void detect()
    return () => {
      cancelled = true
    }
  }, [financeState?.isAuthenticated])

  const preference = financeState?.data.preference ?? defaultPreference

  useEffect(() => {
    if (!financeState?.isAuthenticated) return
    if (defaultLandingTabApplied.current) return
    defaultLandingTabApplied.current = true
    setActiveTab(preference.defaultLandingTab ?? 'dashboard')
  }, [financeState?.isAuthenticated, preference.defaultLandingTab])

  const incomes = financeState?.data.incomes ?? []
  const incomePaymentChecks = financeState?.data.incomePaymentChecks ?? []
  const incomeChangeEvents = financeState?.data.incomeChangeEvents ?? []
  const bills = financeState?.data.bills ?? []
  const billPaymentChecks = financeState?.data.billPaymentChecks ?? []
  const subscriptionPriceChanges = financeState?.data.subscriptionPriceChanges ?? []
  const cards = financeState?.data.cards ?? []
  const loans = financeState?.data.loans ?? []
  const loanEvents = financeState?.data.loanEvents ?? []
  const loanCycleAuditEntries = financeState?.data.loanCycleAuditEntries ?? []
  const purchases = financeState?.data.purchases ?? []
  const accounts = financeState?.data.accounts ?? []
  const accountTransfers = financeState?.data.accountTransfers ?? []
  const accountReconciliationChecks = financeState?.data.accountReconciliationChecks ?? []
  const goals = financeState?.data.goals ?? []
  const goalEvents = financeState?.data.goalEvents ?? []
  const envelopeBudgetHistory = financeState?.data.envelopeBudgets ?? []
  const planningMonthVersions = financeState?.data.planningMonthVersions ?? []
  const planningActionTasks = financeState?.data.planningActionTasks ?? []
  const cycleAuditLogs = financeState?.data.cycleAuditLogs ?? []
  const cycleStepAlerts = financeState?.data.cycleStepAlerts ?? []
  const monthlyCycleRuns = financeState?.data.monthlyCycleRuns ?? []
  const purchaseMonthCloseRuns = financeState?.data.purchaseMonthCloseRuns ?? []
  const monthCloseSnapshots = financeState?.data.monthCloseSnapshots ?? []
  const financeAuditEvents = financeState?.data.financeAuditEvents ?? []
  const ledgerEntries = financeState?.data.ledgerEntries ?? []

  const topCategories = financeState?.data.topCategories ?? []
  const upcomingCashEvents = financeState?.data.upcomingCashEvents ?? []
  const insights = financeState?.data.insights ?? []
  const summary = financeState?.data.summary ?? emptySummary
  const monthlyLoanBasePayments = summary.monthlyLoanBasePayments ?? summary.monthlyLoanPayments
  const monthlyLoanSubscriptionCosts = summary.monthlyLoanSubscriptionCosts ?? 0
  const runwayAvailablePool =
    summary.runwayAvailablePool ?? Math.max(summary.liquidReserves + summary.totalAssets + summary.monthlyIncome, 0)
  const runwayMonthlyPressure =
    summary.runwayMonthlyPressure ?? summary.monthlyCommitments + summary.totalLiabilities + summary.purchasesThisMonth

  const dashboardIntegration = useMemo<DashboardIntegrationSnapshot>(() => {
    const checks: DashboardIntegrationCheck[] = []
    const monthKey = currentLocalMonthKey()

    const pushNumericCheck = (
      id: string,
      label: string,
      actual: number,
      expected: number,
      options?: { tolerance?: number; detailPrefix?: string; severityOnMismatch?: 'warning' | 'fail' },
    ) => {
      const tolerance = options?.tolerance ?? 0.01
      const pass = nearlyEqual(actual, expected, tolerance)
      const delta = roundCurrency(actual - expected)
      checks.push({
        id,
        label,
        status: pass ? 'pass' : options?.severityOnMismatch === 'warning' ? 'warning' : 'fail',
        actual: roundCurrency(actual),
        expected: roundCurrency(expected),
        delta,
        detail: pass
          ? `${options?.detailPrefix ?? 'Derived and dashboard summary match'}`
          : `${options?.detailPrefix ?? 'Mismatch'} (${delta >= 0 ? '+' : ''}${delta.toFixed(2)})`,
      })
    }

    const pushCountCheck = (id: string, label: string, actual: number, expected: number) => {
      checks.push({
        id,
        label,
        status: actual === expected ? 'pass' : 'fail',
        actual,
        expected,
        delta: actual - expected,
        detail: actual === expected ? 'Counts match' : `Count mismatch (${actual - expected >= 0 ? '+' : ''}${actual - expected})`,
      })
    }

    const derivedMonthlyIncome = roundCurrency(
      incomes.reduce(
        (sum, entry) => sum + toMonthlyAmount(resolveIncomeNetAmount(entry), entry.cadence, entry.customInterval, entry.customUnit),
        0,
      ),
    )
    const derivedMonthlyBills = roundCurrency(
      bills.reduce((sum, entry) => sum + toMonthlyAmount(entry.amount, entry.cadence, entry.customInterval, entry.customUnit), 0),
    )
    const derivedMonthlyCardSpend = roundCurrency(cards.reduce((sum, entry) => sum + estimateCardMonthlyPayment(entry), 0))
    const derivedCardLimitTotal = roundCurrency(cards.reduce((sum, entry) => sum + finiteOrZero(entry.creditLimit), 0))
    const derivedCardUsedTotal = roundCurrency(cards.reduce((sum, entry) => sum + finiteOrZero(entry.usedLimit), 0))
    const derivedCardUtilizationPercent =
      derivedCardLimitTotal > 0 ? roundCurrency((derivedCardUsedTotal / derivedCardLimitTotal) * 100) : 0
    const derivedMonthlyLoanBasePayments = roundCurrency(loans.reduce((sum, entry) => sum + estimateLoanMonthlyPayment(entry), 0))
    const derivedMonthlyLoanSubscriptionCosts = roundCurrency(loans.reduce((sum, entry) => sum + finiteOrZero(entry.subscriptionCost), 0))
    const derivedMonthlyLoanPayments = roundCurrency(derivedMonthlyLoanBasePayments + derivedMonthlyLoanSubscriptionCosts)
    const derivedTotalLoanBalance = roundCurrency(loans.reduce((sum, entry) => sum + getLoanTotalOutstanding(entry), 0))

    const monthPurchases = purchases.filter((entry) => entry.purchaseDate.startsWith(monthKey))
    const pendingMonthPurchases = monthPurchases.filter((entry) => (entry.reconciliationStatus ?? 'posted') === 'pending')
    const postedMonthPurchases = monthPurchases.filter((entry) => (entry.reconciliationStatus ?? 'posted') === 'posted')
    const reconciledMonthPurchases = monthPurchases.filter((entry) => (entry.reconciliationStatus ?? 'posted') === 'reconciled')
    const derivedPendingPurchaseAmountThisMonth = roundCurrency(
      pendingMonthPurchases.reduce((sum, entry) => sum + finiteOrZero(entry.amount), 0),
    )
    const derivedPostedPurchaseAmountThisMonth = roundCurrency(
      postedMonthPurchases.reduce((sum, entry) => sum + finiteOrZero(entry.amount), 0),
    )
    const derivedReconciledPurchaseAmountThisMonth = roundCurrency(
      reconciledMonthPurchases.reduce((sum, entry) => sum + finiteOrZero(entry.amount), 0),
    )
    const derivedPurchasesThisMonth = roundCurrency(
      monthPurchases.filter((entry) => purchaseIsPosted(entry.reconciliationStatus)).reduce((sum, entry) => sum + finiteOrZero(entry.amount), 0),
    )
    const derivedPendingPurchases = purchases.filter((entry) => entry.reconciliationStatus === 'pending').length
    const derivedReconciledPurchases = purchases.filter((entry) => entry.reconciliationStatus === 'reconciled').length
    const derivedPostedPurchases = purchases.length - derivedPendingPurchases

    const derivedTotalAssets = roundCurrency(
      accounts.reduce((sum, entry) => (entry.type === 'debt' ? sum : sum + Math.max(finiteOrZero(entry.balance), 0)), 0),
    )
    const derivedAccountDebts = roundCurrency(
      accounts.reduce((sum, entry) => {
        const balance = finiteOrZero(entry.balance)
        if (entry.type === 'debt') return sum + Math.abs(balance)
        return balance < 0 ? sum + Math.abs(balance) : sum
      }, 0),
    )
    const derivedTotalLiabilities = roundCurrency(derivedAccountDebts + derivedCardUsedTotal + derivedTotalLoanBalance)
    const derivedLiquidReserves = roundCurrency(
      accounts.reduce((sum, entry) => (entry.liquid ? sum + Math.max(finiteOrZero(entry.balance), 0) : sum), 0),
    )

    const derivedGoalsFundedPercent =
      goals.length > 0
        ? roundCurrency(
            goals.reduce((sum, goal) => sum + clamp((finiteOrZero(goal.currentAmount) / Math.max(finiteOrZero(goal.targetAmount), 1)) * 100, 0, 100), 0) /
              goals.length,
          )
        : 0

    const derivedMonthlyCommitments = roundCurrency(
      summary.monthlyBills + summary.monthlyCardSpend + (summary.monthlyLoanBasePayments ?? 0) + (summary.monthlyLoanSubscriptionCosts ?? 0),
    )
    const derivedProjectedNet = roundCurrency(summary.monthlyIncome - summary.monthlyCommitments - summary.totalLoanBalance)
    const derivedRunwayAvailablePool = roundCurrency(Math.max(summary.liquidReserves + summary.totalAssets + summary.monthlyIncome, 0))
    const derivedRunwayPressure = roundCurrency(summary.monthlyCommitments + summary.totalLiabilities + summary.purchasesThisMonth)
    const derivedRunwayMonths = roundCurrency(
      derivedRunwayPressure > 0 ? derivedRunwayAvailablePool / derivedRunwayPressure : derivedRunwayAvailablePool > 0 ? 99 : 0,
    )

    pushNumericCheck('income-monthly', 'Income -> monthly income', summary.monthlyIncome, derivedMonthlyIncome)
    pushNumericCheck('bills-monthly', 'Bills -> monthly bills', summary.monthlyBills, derivedMonthlyBills)
    pushNumericCheck('cards-payment', 'Cards -> monthly card payments', summary.monthlyCardSpend, derivedMonthlyCardSpend)
    pushNumericCheck('cards-limit', 'Cards -> total credit limit', summary.cardLimitTotal, derivedCardLimitTotal)
    pushNumericCheck('cards-used', 'Cards -> used balance', summary.cardUsedTotal, derivedCardUsedTotal)
    pushNumericCheck(
      'cards-util',
      'Cards -> utilization %',
      summary.cardUtilizationPercent,
      derivedCardUtilizationPercent,
      { tolerance: 0.1, severityOnMismatch: 'warning' },
    )
    pushNumericCheck('loans-base', 'Loans -> monthly base payments', summary.monthlyLoanBasePayments, derivedMonthlyLoanBasePayments)
    pushNumericCheck(
      'loans-subscription',
      'Loans -> monthly subscription costs',
      summary.monthlyLoanSubscriptionCosts,
      derivedMonthlyLoanSubscriptionCosts,
    )
    pushNumericCheck('loans-total', 'Loans -> total outstanding', summary.totalLoanBalance, derivedTotalLoanBalance)
    pushNumericCheck(
      'loans-combined',
      'Loans -> combined monthly payments',
      summary.monthlyLoanPayments,
      derivedMonthlyLoanPayments,
    )
    pushNumericCheck('purchases-month-posted', 'Purchases -> month posted/reconciled total', summary.purchasesThisMonth, derivedPurchasesThisMonth)
    pushNumericCheck(
      'purchases-month-pending-amount',
      'Purchases -> month pending amount',
      summary.pendingPurchaseAmountThisMonth,
      derivedPendingPurchaseAmountThisMonth,
    )
    pushNumericCheck(
      'purchases-month-posted-amount',
      'Purchases -> month posted amount',
      summary.postedPurchaseAmountThisMonth,
      derivedPostedPurchaseAmountThisMonth,
    )
    pushNumericCheck(
      'purchases-month-reconciled-amount',
      'Purchases -> month reconciled amount',
      summary.reconciledPurchaseAmountThisMonth,
      derivedReconciledPurchaseAmountThisMonth,
    )
    pushCountCheck('purchases-pending-count', 'Purchases -> pending count', summary.pendingPurchases, derivedPendingPurchases)
    pushCountCheck('purchases-posted-count', 'Purchases -> posted count', summary.postedPurchases, derivedPostedPurchases)
    pushCountCheck('purchases-reconciled-count', 'Purchases -> reconciled count', summary.reconciledPurchases, derivedReconciledPurchases)
    pushNumericCheck('accounts-assets', 'Accounts -> total assets', summary.totalAssets, derivedTotalAssets)
    pushNumericCheck('accounts-liabilities', 'Accounts/Cards/Loans -> total liabilities', summary.totalLiabilities, derivedTotalLiabilities)
    pushNumericCheck('accounts-liquid', 'Accounts -> liquid reserves', summary.liquidReserves, derivedLiquidReserves)
    pushNumericCheck(
      'goals-funded',
      'Goals -> funded %',
      summary.goalsFundedPercent,
      derivedGoalsFundedPercent,
      { tolerance: 0.2, severityOnMismatch: 'warning' },
    )
    pushNumericCheck('summary-commitments-formula', 'Summary formula -> commitments composition', summary.monthlyCommitments, derivedMonthlyCommitments)
    pushNumericCheck('summary-projected-net-formula', 'Summary formula -> projected net', summary.projectedMonthlyNet, derivedProjectedNet)
    pushNumericCheck('summary-runway-pool-formula', 'Summary formula -> runway available pool', runwayAvailablePool, derivedRunwayAvailablePool)
    pushNumericCheck('summary-runway-pressure-formula', 'Summary formula -> runway pressure', runwayMonthlyPressure, derivedRunwayPressure)
    pushNumericCheck('summary-runway-formula', 'Summary formula -> runway months', summary.runwayMonths, derivedRunwayMonths, { tolerance: 0.05 })

    const passCount = checks.filter((check) => check.status === 'pass').length
    const warningCount = checks.filter((check) => check.status === 'warning').length
    const failCount = checks.filter((check) => check.status === 'fail').length
    const skippedCount = checks.filter((check) => check.status === 'skipped').length

    return {
      generatedAt: Date.now(),
      passCount,
      warningCount,
      failCount,
      skippedCount,
      checks,
    }
  }, [accounts, bills, cards, goals, incomes, loans, purchases, runwayAvailablePool, runwayMonthlyPressure, summary])

  const formatSection = useFinanceFormat({
    preference,
    clearError,
    handleMutationError,
  })

  const incomeSection = useIncomeSection({
    incomes,
    clearError,
    handleMutationError,
  })

  const billsSection = useBillsSection({
    bills,
    preference,
    clearError,
    handleMutationError,
  })

  const cardsSection = useCardsSection({
    cards,
    clearError,
    handleMutationError,
  })

  const loansSection = useLoansSection({
    loans,
    clearError,
    handleMutationError,
  })

  const purchasesSection = usePurchasesSection({
    purchases,
    accounts,
    cards,
    goals,
    recurringCandidates: phase2State?.recurringCandidates ?? [],
    purchaseSplits: phase2State?.purchaseSplits ?? [],
    purchaseSplitTemplates: phase2State?.purchaseSplitTemplates ?? [],
    preference,
    clearError,
    handleMutationError,
  })

  const accountsSection = useAccountsSection({
    accounts,
    clearError,
    handleMutationError,
  })

  const goalsSection = useGoalsSection({
    goals,
    goalEvents,
    clearError,
    handleMutationError,
  })

  const connectionNote =
    financeState === undefined || phase2State === undefined || privacyState === undefined || kpisState === undefined
      ? 'Connecting to Convex...'
      : 'Convex synced'

  const phase2Data =
    phase2State ?? {
      monthKey: phase2MonthKey,
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
        buckets: [
          { target: 'bills', label: 'Bills', percentage: 0, monthlyAmount: 0, active: false },
          { target: 'savings', label: 'Savings', percentage: 0, monthlyAmount: 0, active: false },
          { target: 'goals', label: 'Goals', percentage: 0, monthlyAmount: 0, active: false },
          { target: 'debt_overpay', label: 'Debt Overpay', percentage: 0, monthlyAmount: 0, active: false },
        ],
      },
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

  const queueMetricHandler =
    privacyState?.consentSettings?.diagnosticsEnabled
      ? async (metric: {
          event: string
          queuedCount: number
          conflictCount: number
          flushAttempted: number
          flushSucceeded: number
        }) => {
          try {
            await logClientOpsMetric(metric)
          } catch {
            // Best-effort metrics.
          }
        }
      : undefined

  const reconciliationSection = useReconciliationSection({
    purchases,
    transactionRules: phase2Data.transactionRules,
    accounts,
    cards,
    userId,
    onQueueMetric: queueMetricHandler,
    clearError,
    handleMutationError,
  })

  const planningSection = usePlanningSection({
    monthKey: phase2Data.monthKey,
    summary,
    transactionRules: phase2Data.transactionRules,
    envelopeBudgets: phase2Data.envelopeBudgets,
    incomeAllocationRules: phase2Data.incomeAllocationRules,
    userId,
    onQueueMetric: queueMetricHandler,
    clearError,
    handleMutationError,
  })

  const settingsSection = useSettingsSection({
    preference,
    clearError,
    handleMutationError,
  })

  const dateLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(preference.locale || 'en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: preference.timezone || 'UTC',
      })
    } catch {
      return fallbackDateLabel
    }
  }, [preference.locale, preference.timezone])

  const lastUpdated = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(preference.locale || 'en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: preference.timezone || 'UTC',
      }).format(financeState?.updatedAt ? new Date(financeState.updatedAt) : new Date())
    } catch {
      return new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(financeState?.updatedAt ? new Date(financeState.updatedAt) : new Date())
    }
  }, [financeState?.updatedAt, preference.locale, preference.timezone])

  const cycleDateLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(preference.locale || 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: preference.timezone || 'UTC',
      })
    } catch {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    }
  }, [preference.locale, preference.timezone])

  const dashboardCardsBase: DashboardCard[] = [
    {
      id: 'health-score',
      label: 'Financial Health Score',
      value: `${summary.healthScore}/100`,
      note: 'Risk + runway + savings + utilization',
      trend: summary.healthScore >= 70 ? 'up' : summary.healthScore >= 45 ? 'flat' : 'down',
    },
    {
      id: 'monthly-income',
      label: 'Monthly Income',
      value: formatSection.formatMoney(summary.monthlyIncome),
      note: `${incomes.length} sources tracked`,
      trend: 'up',
    },
    {
      id: 'monthly-commitments',
      label: 'Monthly Commitments',
      value: formatSection.formatMoney(summary.monthlyCommitments),
      note: `${formatSection.formatMoney(summary.monthlyBills)} bills • ${formatSection.formatMoney(summary.monthlyCardSpend)} card payments • ${formatSection.formatMoney(summary.monthlyLoanPayments)} loans`,
      trend: 'down',
    },
    {
      id: 'loan-balance',
      label: 'Loan Balance',
      value: formatSection.formatMoney(summary.totalLoanBalance),
      note: `${formatSection.formatMoney(monthlyLoanBasePayments)} payments + ${formatSection.formatMoney(monthlyLoanSubscriptionCosts)} subscription`,
      trend: summary.totalLoanBalance > 0 ? 'down' : 'flat',
    },
    {
      id: 'projected-net',
      label: 'Projected Monthly Net',
      value: formatSection.formatMoney(summary.projectedMonthlyNet),
      note: `${formatSection.formatMoney(summary.monthlyIncome)} income - ${formatSection.formatMoney(summary.monthlyCommitments)} commitments - ${formatSection.formatMoney(summary.totalLoanBalance)} loan balance`,
      trend: summary.projectedMonthlyNet >= 0 ? 'up' : 'down',
    },
    {
      id: 'net-worth',
      label: 'Net Worth',
      value: formatSection.formatMoney(summary.netWorth),
      note: `${formatSection.formatMoney(summary.totalAssets)} assets + ${formatSection.formatMoney(summary.monthlyIncome)} income - ${formatSection.formatMoney(summary.totalLiabilities)} liabilities - ${formatSection.formatMoney(summary.monthlyCommitments)} commitments - ${formatSection.formatMoney(summary.purchasesThisMonth)} purchases`,
      trend: summary.netWorth >= 0 ? 'up' : 'down',
    },
    {
      id: 'runway',
      label: 'Cash Runway',
      value: `${summary.runwayMonths.toFixed(1)} months`,
      note: `${formatSection.formatMoney(runwayAvailablePool)} available pool / ${formatSection.formatMoney(runwayMonthlyPressure)} monthly pressure`,
      trend: summary.runwayMonths >= 3 ? 'up' : summary.runwayMonths >= 1 ? 'flat' : 'down',
    },
  ]

  const dashboardCards = (() => {
    const byId = new Map<DashboardCardId, DashboardCard>(dashboardCardsBase.map((card) => [card.id as DashboardCardId, card]))
    const ordered: DashboardCard[] = []
    const seen = new Set<string>()

    for (const id of preference.dashboardCardOrder ?? []) {
      const card = byId.get(id)
      if (!card || seen.has(card.id)) continue
      ordered.push(card)
      seen.add(card.id)
    }

    for (const card of dashboardCardsBase) {
      if (seen.has(card.id)) continue
      ordered.push(card)
    }

    return ordered
  })()

  const downloadSnapshot = () => {
    clearError()

    const payload = {
      generatedAt: new Date().toISOString(),
      preference,
      summary,
      records: {
        incomes,
        incomePaymentChecks,
        bills,
        billPaymentChecks,
        cards,
        loans,
        loanEvents,
        loanCycleAuditEntries,
        purchases,
        accounts,
        goals,
        cycleAuditLogs,
        cycleStepAlerts,
        monthlyCycleRuns,
        purchaseMonthCloseRuns,
        monthCloseSnapshots,
        financeAuditEvents,
        ledgerEntries,
      },
      insights,
      topCategories,
      upcomingCashEvents,
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `finance-snapshot-${new Date().toISOString().slice(0, 10)}.json`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const runMonthlyCycleNow = async () => {
    clearError()
    setIsRunningMonthlyCycle(true)
    try {
      await runMonthlyCycle({ source: 'manual' })
    } catch (error) {
      handleMutationError(error)
    } finally {
      setIsRunningMonthlyCycle(false)
    }
  }

  const reconcilePendingPurchasesNow = async () => {
    const pendingPurchaseIds = purchases
      .filter((purchase) => (purchase.reconciliationStatus ?? 'posted') === 'pending')
      .map((purchase) => purchase._id)
    if (pendingPurchaseIds.length === 0) return
    clearError()
    setIsReconcilingPending(true)
    try {
      await bulkUpdatePurchaseReconciliation({
        ids: pendingPurchaseIds,
        reconciliationStatus: 'reconciled',
      })
    } catch (error) {
      handleMutationError(error)
    } finally {
      setIsReconcilingPending(false)
    }
  }

  const startPrint = (config: PrintReportConfig) => {
    clearError()
    setPrintModalOpen(false)
    setPrintConfig(config)
  }

  useEffect(() => {
    if (!printConfig) return

    const onAfterPrint = () => {
      setPrintConfig(null)
    }

    window.addEventListener('afterprint', onAfterPrint)

    const timeout = window.setTimeout(() => {
      window.print()
    }, 250)

    return () => {
      window.removeEventListener('afterprint', onAfterPrint)
      window.clearTimeout(timeout)
    }
  }, [printConfig])

  return (
    <main
      className={cn(
        'finance-app-shell fx-shell',
        preference.uiDensity === 'compact' && 'dashboard--compact',
      )}
    >
      <div
        className={cn(
          'no-print grid',
          preference.uiDensity === 'compact' ? 'gap-3' : 'gap-4',
        )}
      >
        <header
          className={cn(
            'fx-panel-glass flex flex-col gap-3 md:gap-4 lg:flex-row lg:items-start lg:justify-between',
            preference.uiDensity === 'compact' && '!px-4 !py-3',
          )}
          data-shell-topbar
        >
          <div className="min-w-0">
            <Badge
              variant="outline"
              className="rounded-full border-border/80 bg-white/30 px-2.5 py-1 text-[0.68rem] font-semibold tracking-[0.11em] text-muted-foreground uppercase backdrop-blur-md"
            >
              Personal Finance Workspace 2026+
            </Badge>
            <h1 className="mt-2 font-display text-[clamp(1.72rem,2.8vw,2.56rem)] leading-[1.05] tracking-[-0.015em] text-foreground">
              Adaptive Finance OS
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Last updated {lastUpdated} - {connectionNote}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <SignedOut>
              <SignInButton mode="modal">
                <Button type="button" variant="secondary" className="h-9 rounded-[0.88rem] px-4 font-semibold">
                  Sign In
                </Button>
              </SignInButton>
              <SignUpButton mode="modal">
                <Button
                  type="button"
                  className="h-9 rounded-[0.88rem] border-transparent px-4 font-semibold text-primary-foreground [background:var(--fx-primary-gradient)] hover:[background:var(--fx-primary-gradient)]"
                >
                  Sign Up
                </Button>
              </SignUpButton>
            </SignedOut>

            <SignedIn>
              <Button type="button" variant="secondary" className="h-9 rounded-[0.88rem] px-4 font-semibold" onClick={() => setPrintModalOpen(true)}>
                Print Report...
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="h-9 rounded-[0.88rem] px-4 font-semibold"
                onClick={() => void runMonthlyCycleNow()}
                disabled={isRunningMonthlyCycle}
              >
                {isRunningMonthlyCycle ? 'Running Cycle...' : 'Run Monthly Cycle Now'}
              </Button>
              <Button type="button" variant="secondary" className="h-9 rounded-[0.88rem] px-4 font-semibold" onClick={downloadSnapshot}>
                Export Snapshot
              </Button>
              <div className="grid size-9 place-items-center rounded-[0.88rem] border border-border/80 bg-white/35 shadow-sm backdrop-blur-md">
                <UserButton />
              </div>
            </SignedIn>
          </div>
        </header>

        <SignedOut>
          <Card
            className="fx-panel gap-0 py-0"
            aria-label="Authentication required"
          >
            <CardHeader className="gap-2 px-0 pb-0">
              <CardTitle className="font-display text-[clamp(1.25rem,2vw,1.62rem)] tracking-[-0.02em] text-foreground">
                Sign in to enable your 2026-ready finance stack
              </CardTitle>
              <CardDescription className="max-w-[62ch] text-sm leading-6 text-muted-foreground">
                Track income, bills, cards, purchases, accounts, and goals in one workspace. The dashboard updates in
                realtime from your own entries.
              </CardDescription>
            </CardHeader>
            <CardContent className="mt-3 flex flex-wrap gap-2 px-0 pb-0">
              <SignInButton mode="modal">
                <Button type="button" variant="secondary" className="h-9 rounded-[0.88rem] px-4 font-semibold">
                  Sign In
                </Button>
              </SignInButton>
              <SignUpButton mode="modal">
                <Button
                  type="button"
                  className="h-9 rounded-[0.88rem] border-transparent px-4 font-semibold text-primary-foreground [background:var(--fx-primary-gradient)] hover:[background:var(--fx-primary-gradient)]"
                >
                  Create Account
                </Button>
              </SignUpButton>
            </CardContent>
          </Card>
        </SignedOut>

        <SignedIn>
          <div className="grid gap-4">
            <Card className="fx-panel gap-0 py-0" aria-label="Currency and locale settings">
              <CardHeader className="gap-2 px-0 pb-0">
                <div>
                  <p className="fx-kicker">Formatting</p>
                  <CardTitle className="mt-1 text-[1.1rem] font-display tracking-[-0.015em] text-foreground">
                    Currency + Locale
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="mt-3 grid grid-cols-1 gap-2 px-0 pb-0 sm:grid-cols-[minmax(0,10rem)_minmax(0,9rem)_auto] sm:items-center">
                <label htmlFor="currency-select" className="sr-only">
                  Currency
                </label>
                <Select
                  value={formatSection.displayedFormat.currency}
                  onValueChange={(currency) =>
                    formatSection.setFormatOverride((prev) => ({
                      ...prev,
                      currency,
                    }))
                  }
                >
                  <SelectTrigger
                    id="currency-select"
                    aria-label="Currency"
                    className="fx-field-control fx-field-control-select h-10 w-full min-w-0 rounded-[0.9rem] shadow-none"
                  >
                    <SelectValue placeholder="Currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {formatSection.currencyOptions.map((currency) => (
                      <SelectItem key={currency} value={currency}>
                        {currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <label htmlFor="locale-select" className="sr-only">
                  Locale
                </label>
                <Select
                  value={formatSection.displayedFormat.locale}
                  onValueChange={(locale) =>
                    formatSection.setFormatOverride((prev) => ({
                      ...prev,
                      locale,
                    }))
                  }
                >
                  <SelectTrigger
                    id="locale-select"
                    aria-label="Locale"
                    className="fx-field-control fx-field-control-select h-10 w-full min-w-0 rounded-[0.9rem] shadow-none"
                  >
                    <SelectValue placeholder="Locale" />
                  </SelectTrigger>
                  <SelectContent>
                    {formatSection.localeOptions.map((locale) => (
                      <SelectItem key={locale} value={locale}>
                        {locale}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 rounded-[0.88rem] px-4 font-semibold sm:justify-self-start"
                  onClick={() => void formatSection.onSaveFormat()}
                >
                  Apply Format
                </Button>
              </CardContent>
            </Card>

            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as TabKey)}
              className="w-full gap-0"
            >
              <nav aria-label="Finance sections" className="overflow-x-auto pb-1">
                <TabsList className="h-auto w-max min-w-full justify-start gap-2 rounded-none bg-transparent p-0">
                  {tabs.map((tab) => (
                    <TabsTrigger
                      key={tab.key}
                      value={tab.key}
                      className={cn(
                        'h-auto min-w-[8.8rem] flex-none rounded-[0.86rem] border border-border bg-card px-3 py-2.5 text-sm font-semibold text-foreground shadow-none',
                        'hover:border-ring/30 hover:text-foreground',
                        'data-[state=active]:border-transparent data-[state=active]:text-primary-foreground data-[state=active]:shadow-none data-[state=active]:[background:var(--fx-primary-gradient)]',
                      )}
                    >
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </nav>
            </Tabs>

            {errorMessage ? (
              <p
                role="alert"
                className="m-0 rounded-[0.85rem] border border-[color:color-mix(in_oklab,var(--tone-negative)_28%,var(--stroke))] bg-[color:color-mix(in_oklab,var(--tone-negative)_12%,white_88%)] px-3.5 py-2.5 text-sm text-[oklch(46%_0.14_28)]"
              >
                {errorMessage}
              </p>
            ) : null}
          </div>

        {activeTab === 'dashboard' ? (
          <DashboardTab
            dashboardCards={dashboardCards}
            cards={cards}
            accounts={accounts}
            summary={summary}
            dashboardIntegration={dashboardIntegration}
            insights={insights}
            upcomingCashEvents={upcomingCashEvents}
            topCategories={topCategories}
            goalsWithMetrics={goalsSection.goalsWithMetrics}
            cycleAuditLogs={cycleAuditLogs}
            cycleStepAlerts={cycleStepAlerts}
            monthlyCycleRuns={monthlyCycleRuns}
            monthCloseSnapshots={monthCloseSnapshots}
            financeAuditEvents={financeAuditEvents}
            ledgerEntries={ledgerEntries}
            forecastWindows={phase2Data.forecastWindows}
            counts={{
              incomes: incomes.length,
              bills: bills.length,
              cards: cards.length,
              loans: loans.length,
              purchases: purchases.length,
              accounts: accounts.length,
              goals: goals.length,
            }}
            kpis={kpisState ?? null}
            privacyData={privacyState ?? null}
            retentionEnabled={settingsSection.retentionPolicies.some((policy) => policy.enabled && policy.retentionDays > 0)}
            cspMode={cspMode}
            formatMoney={formatSection.formatMoney}
            formatPercent={formatSection.formatPercent}
            cadenceLabel={cadenceLabel}
            severityLabel={severityLabel}
            dateLabel={dateLabel}
            cycleDateLabel={cycleDateLabel}
            onActionQueueRecordPayment={cardsSection.onQuickRecordPayment}
            onActionQueueAddCharge={async (cardId, amount) => cardsSection.onQuickAddCharge(cardId, amount)}
            onActionQueueRunMonthlyCycle={runMonthlyCycleNow}
            onActionQueueReconcilePending={reconcilePendingPurchasesNow}
            isRunningMonthlyCycle={isRunningMonthlyCycle}
            isReconcilingPending={isReconcilingPending}
            pendingReconciliationCount={summary.pendingPurchases}
          />
        ) : null}

        {activeTab === 'income' ? (
	          <IncomeTab
	            incomes={incomes}
              accounts={accounts}
              incomePaymentChecks={incomePaymentChecks}
              incomeChangeEvents={incomeChangeEvents}
	            monthlyIncome={summary.monthlyIncome}
	            incomeForm={incomeSection.incomeForm}
	            setIncomeForm={incomeSection.setIncomeForm}
	            incomeEditId={incomeSection.incomeEditId}
	            setIncomeEditId={incomeSection.setIncomeEditId}
            incomeEditDraft={incomeSection.incomeEditDraft}
            setIncomeEditDraft={incomeSection.setIncomeEditDraft}
            onAddIncome={incomeSection.onAddIncome}
	            onDeleteIncome={incomeSection.onDeleteIncome}
            onAddIncomeChangeEvent={incomeSection.onAddIncomeChangeEvent}
            onDeleteIncomeChangeEvent={incomeSection.onDeleteIncomeChangeEvent}
            saveIncomeEdit={incomeSection.saveIncomeEdit}
            startIncomeEdit={incomeSection.startIncomeEdit}
            onUpsertIncomePaymentCheck={incomeSection.onUpsertIncomePaymentCheck}
            onBulkUpsertIncomePaymentChecks={incomeSection.onBulkUpsertIncomePaymentChecks}
            onDeleteIncomePaymentCheck={incomeSection.onDeleteIncomePaymentCheck}
            cadenceOptions={cadenceOptions}
            customCadenceUnitOptions={customCadenceUnitOptions}
            isCustomCadence={isCustomCadence}
            cadenceLabel={cadenceLabel}
            formatMoney={formatSection.formatMoney}
          />
        ) : null}

	        {activeTab === 'bills' ? (
	          <BillsTab
            accounts={accounts}
	            bills={bills}
            billPaymentChecks={billPaymentChecks}
            subscriptionPriceChanges={subscriptionPriceChanges}
	            monthlyBills={summary.monthlyBills}
	            billForm={billsSection.billForm}
	            setBillForm={billsSection.setBillForm}
	            billEditId={billsSection.billEditId}
	            setBillEditId={billsSection.setBillEditId}
            billEditDraft={billsSection.billEditDraft}
            setBillEditDraft={billsSection.setBillEditDraft}
            onAddBill={billsSection.onAddBill}
            onDeleteBill={billsSection.onDeleteBill}
            onUpsertBillPaymentCheck={billsSection.onUpsertBillPaymentCheck}
            onDeleteBillPaymentCheck={billsSection.onDeleteBillPaymentCheck}
            onResolveBillDuplicateOverlap={billsSection.onResolveBillDuplicateOverlap}
            onRunBillsMonthlyBulkAction={billsSection.onRunBillsMonthlyBulkAction}
            saveBillEdit={billsSection.saveBillEdit}
            startBillEdit={billsSection.startBillEdit}
            billCategoryOptions={billCategoryOptions}
            billScopeOptions={billScopeOptions}
            cadenceOptions={cadenceOptions}
            customCadenceUnitOptions={customCadenceUnitOptions}
            isCustomCadence={isCustomCadence}
            cadenceLabel={cadenceLabel}
            formatMoney={formatSection.formatMoney}
          />
        ) : null}

	        {activeTab === 'cards' ? (
	          <CardsTab
	            cards={cards}
	            monthlyCardSpend={summary.monthlyCardSpend}
	            cardLimitTotal={summary.cardLimitTotal}
	            cardUsedTotal={summary.cardUsedTotal}
	            cardUtilizationPercent={summary.cardUtilizationPercent}
	            cardForm={cardsSection.cardForm}
	            setCardForm={cardsSection.setCardForm}
	            cardEditId={cardsSection.cardEditId}
	            setCardEditId={cardsSection.setCardEditId}
	            cardEditDraft={cardsSection.cardEditDraft}
	            setCardEditDraft={cardsSection.setCardEditDraft}
	            onAddCard={cardsSection.onAddCard}
	            onDeleteCard={cardsSection.onDeleteCard}
	            saveCardEdit={cardsSection.saveCardEdit}
	            startCardEdit={cardsSection.startCardEdit}
	            onQuickAddCharge={cardsSection.onQuickAddCharge}
	            onQuickRecordPayment={cardsSection.onQuickRecordPayment}
	            onQuickTransferBalance={cardsSection.onQuickTransferBalance}
	            formatMoney={formatSection.formatMoney}
	            formatPercent={formatSection.formatPercent}
	          />
	        ) : null}

	        {activeTab === 'loans' ? (
	          <LoansTab
	            loans={loans}
	            loanEvents={loanEvents}
	            projectedMonthlyNet={summary.projectedMonthlyNet}
	            monthlyLoanPayments={summary.monthlyLoanPayments}
	            monthlyLoanBasePayments={summary.monthlyLoanBasePayments}
	            monthlyLoanSubscriptionCosts={summary.monthlyLoanSubscriptionCosts}
	            totalLoanBalance={summary.totalLoanBalance}
	            loanForm={loansSection.loanForm}
	            setLoanForm={loansSection.setLoanForm}
	            loanEditId={loansSection.loanEditId}
	            setLoanEditId={loansSection.setLoanEditId}
            loanEditDraft={loansSection.loanEditDraft}
            setLoanEditDraft={loansSection.setLoanEditDraft}
            onAddLoan={loansSection.onAddLoan}
            onDeleteLoan={loansSection.onDeleteLoan}
            saveLoanEdit={loansSection.saveLoanEdit}
            startLoanEdit={loansSection.startLoanEdit}
            onQuickAddLoanCharge={loansSection.onQuickAddLoanCharge}
            onQuickRecordLoanPayment={loansSection.onQuickRecordLoanPayment}
            onQuickApplyLoanInterest={loansSection.onQuickApplyLoanInterest}
            onQuickApplyLoanSubscription={loansSection.onQuickApplyLoanSubscription}
            cadenceOptions={cadenceOptions}
            customCadenceUnitOptions={customCadenceUnitOptions}
            isCustomCadence={isCustomCadence}
            cadenceLabel={cadenceLabel}
            formatMoney={formatSection.formatMoney}
          />
        ) : null}

	        {activeTab === 'purchases' ? (
	          <PurchasesTab
            accounts={accounts}
            cards={cards}
	            purchaseForm={purchasesSection.purchaseForm}
	            setPurchaseForm={purchasesSection.setPurchaseForm}
	            purchaseFilter={purchasesSection.purchaseFilter}
	            setPurchaseFilter={purchasesSection.setPurchaseFilter}
	            purchaseCategories={purchasesSection.purchaseCategories}
	            filteredPurchases={purchasesSection.filteredPurchases}
	            filteredPurchaseTotal={purchasesSection.filteredPurchaseTotal}
	            filteredPurchaseAverage={purchasesSection.filteredPurchaseAverage}
            monthPurchaseSummary={purchasesSection.monthPurchaseSummary}
	            filteredStatusCounts={purchasesSection.filteredStatusCounts}
	            purchasesThisMonth={summary.purchasesThisMonth}
            pendingPurchaseAmountThisMonth={summary.pendingPurchaseAmountThisMonth}
	            pendingPurchases={summary.pendingPurchases}
	            postedPurchases={summary.postedPurchases}
	            reconciledPurchases={summary.reconciledPurchases}
            recurringCandidates={phase2Data.recurringCandidates ?? []}
            forecastWindows={phase2Data.forecastWindows ?? []}
            purchaseSplits={phase2Data.purchaseSplits ?? []}
            purchaseSplitTemplates={phase2Data.purchaseSplitTemplates ?? []}
            upcomingCashEvents={upcomingCashEvents}
            goals={goals}
	            purchaseEditId={purchasesSection.purchaseEditId}
	            setPurchaseEditId={purchasesSection.setPurchaseEditId}
	            purchaseEditDraft={purchasesSection.purchaseEditDraft}
	            setPurchaseEditDraft={purchasesSection.setPurchaseEditDraft}
            selectedPurchaseCount={purchasesSection.selectedPurchaseCount}
            selectedPurchaseTotal={purchasesSection.selectedPurchaseTotal}
            selectedPurchaseSet={purchasesSection.selectedPurchaseSet}
            toggleSelectedPurchase={purchasesSection.toggleSelectedPurchase}
            toggleSelectFilteredPurchases={purchasesSection.toggleSelectFilteredPurchases}
            clearSelectedPurchases={purchasesSection.clearSelectedPurchases}
            bulkCategory={purchasesSection.bulkCategory}
            setBulkCategory={purchasesSection.setBulkCategory}
            savedView={purchasesSection.savedView}
            applySavedView={purchasesSection.applySavedView}
	            onAddPurchase={purchasesSection.onAddPurchase}
            onDeletePurchase={purchasesSection.onDeletePurchase}
            savePurchaseEdit={purchasesSection.savePurchaseEdit}
            startPurchaseEdit={purchasesSection.startPurchaseEdit}
            onSetPurchaseReconciliation={purchasesSection.onSetPurchaseReconciliation}
            duplicatePurchase={purchasesSection.duplicatePurchase}
            purchaseDuplicateOverlaps={purchasesSection.purchaseDuplicateOverlaps}
            resolvePurchaseDuplicateOverlap={purchasesSection.resolvePurchaseDuplicateOverlap}
            onConvertRecurringCandidateToBill={purchasesSection.onConvertRecurringCandidateToBill}
            upsertPurchaseSplits={purchasesSection.upsertPurchaseSplits}
            clearPurchaseSplitsForPurchase={purchasesSection.clearPurchaseSplitsForPurchase}
            applyPurchaseSplitTemplateToPurchase={purchasesSection.applyPurchaseSplitTemplateToPurchase}
            addPurchaseSplitTemplate={purchasesSection.addPurchaseSplitTemplate}
            updatePurchaseSplitTemplate={purchasesSection.updatePurchaseSplitTemplate}
            removePurchaseSplitTemplate={purchasesSection.removePurchaseSplitTemplate}
            importPurchasesFromRows={purchasesSection.importPurchasesFromRows}
            runBulkStatus={purchasesSection.runBulkStatus}
            runBulkCategory={purchasesSection.runBulkCategory}
            runBulkDelete={purchasesSection.runBulkDelete}
            formatMoney={formatSection.formatMoney}
            dateLabel={dateLabel}
          />
        ) : null}

        {activeTab === 'reconcile' ? (
          <ReconcileTab
            filter={reconciliationSection.filter}
            setFilter={reconciliationSection.setFilter}
            categories={reconciliationSection.categories}
            sourceOptions={reconciliationSection.sourceOptions}
            summary={reconciliationSection.summary}
            filteredPurchases={reconciliationSection.filteredPurchases}
            selectedSet={reconciliationSection.selectedSet}
            selectedCount={reconciliationSection.selectedCount}
            selectedTotal={reconciliationSection.selectedTotal}
            toggleSelected={reconciliationSection.toggleSelected}
            toggleSelectVisible={reconciliationSection.toggleSelectVisible}
            clearSelection={reconciliationSection.clearSelection}
            bulkCategory={reconciliationSection.bulkCategory}
            setBulkCategory={reconciliationSection.setBulkCategory}
            runBulkStatus={reconciliationSection.runBulkStatus}
            runBulkCategory={reconciliationSection.runBulkCategory}
            runBulkDelete={reconciliationSection.runBulkDelete}
            runBulkMatch={reconciliationSection.runBulkMatch}
            runBulkMarkReconciled={reconciliationSection.runBulkMarkReconciled}
            runBulkExclude={reconciliationSection.runBulkExclude}
            runQuickMatch={reconciliationSection.runQuickMatch}
            runQuickSplit={reconciliationSection.runQuickSplit}
            runQuickMarkReviewed={reconciliationSection.runQuickMarkReviewed}
            runQuickExclude={reconciliationSection.runQuickExclude}
            runQuickUndo={reconciliationSection.runQuickUndo}
            runApplyMatchSuggestion={reconciliationSection.runApplyMatchSuggestion}
            runResolveDuplicateMatch={reconciliationSection.runResolveDuplicateMatch}
            runCreateOutcomeRuleFromPurchase={reconciliationSection.runCreateOutcomeRuleFromPurchase}
            runCreateOutcomeRuleFromSuggestion={reconciliationSection.runCreateOutcomeRuleFromSuggestion}
            undoByPurchaseId={reconciliationSection.undoByPurchaseId}
            ruleFeedback={reconciliationSection.ruleFeedback}
            dismissRuleFeedback={reconciliationSection.dismissRuleFeedback}
            matchSuggestions={reconciliationSection.matchSuggestions}
            duplicateMatches={reconciliationSection.duplicateMatches}
            anomalySignals={reconciliationSection.anomalySignals}
            anomalySignalsByPurchaseId={reconciliationSection.anomalySignalsByPurchaseId}
            queue={reconciliationSection.queue}
            formatMoney={formatSection.formatMoney}
            dateLabel={dateLabel}
          />
        ) : null}

        {activeTab === 'planning' ? (
          <PlanningTab
            summary={summary}
            ruleForm={planningSection.ruleForm}
            setRuleForm={planningSection.setRuleForm}
            ruleEditId={planningSection.ruleEditId}
            setRuleEditId={planningSection.setRuleEditId}
            sortedRules={planningSection.sortedRules}
            submitRule={planningSection.submitRule}
            startRuleEdit={planningSection.startRuleEdit}
            removeRule={planningSection.removeRule}
            budgetForm={planningSection.budgetForm}
            setBudgetForm={planningSection.setBudgetForm}
            budgetEditId={planningSection.budgetEditId}
            setBudgetEditId={planningSection.setBudgetEditId}
            sortedBudgets={planningSection.sortedBudgets}
            submitBudget={planningSection.submitBudget}
            startBudgetEdit={planningSection.startBudgetEdit}
            removeBudget={planningSection.removeBudget}
            allocationRuleForm={planningSection.allocationRuleForm}
            setAllocationRuleForm={planningSection.setAllocationRuleForm}
            allocationRuleEditId={planningSection.allocationRuleEditId}
            setAllocationRuleEditId={planningSection.setAllocationRuleEditId}
            sortedIncomeAllocationRules={planningSection.sortedIncomeAllocationRules}
            submitAllocationRule={planningSection.submitAllocationRule}
            startAllocationRuleEdit={planningSection.startAllocationRuleEdit}
            removeAllocationRule={planningSection.removeAllocationRule}
            planningMonth={planningSection.planningMonth}
            setPlanningMonth={planningSection.setPlanningMonth}
            planningVersions={planningSection.planningVersions}
            activePlanningVersion={planningSection.activePlanningVersion}
            setActivePlanningVersion={planningSection.setActivePlanningVersion}
            planningVersionForm={planningSection.planningVersionForm}
            setPlanningVersionForm={planningSection.setPlanningVersionForm}
            planningVersionDirty={planningSection.planningVersionDirty}
            planningWorkspace={planningSection.planningWorkspace}
            isSavingPlanningVersion={planningSection.isSavingPlanningVersion}
            planningVersionFeedback={planningSection.planningVersionFeedback}
            submitPlanningVersion={planningSection.submitPlanningVersion}
            resetPlanningVersionForm={planningSection.resetPlanningVersionForm}
            planningActionTasks={planningSection.planningActionTasks}
            planningAdherenceRows={planningSection.planningAdherenceRows}
            planningKpis={planningSection.planningKpis}
            planningAuditEvents={planningSection.planningAuditEvents}
            isApplyingPlanToMonth={planningSection.isApplyingPlanToMonth}
            applyPlanFeedback={planningSection.applyPlanFeedback}
            updatingPlanningTaskId={planningSection.updatingPlanningTaskId}
            onApplyPlanToMonth={planningSection.onApplyPlanToMonth}
            onUpdatePlanningTaskStatus={planningSection.onUpdatePlanningTaskStatus}
            incomeAllocationSuggestions={phase2Data.incomeAllocationSuggestions}
            isApplyingAutoAllocation={planningSection.isApplyingAutoAllocation}
            autoAllocationLastRunNote={planningSection.autoAllocationLastRunNote}
            onApplyAutoAllocationNow={planningSection.onApplyAutoAllocationNow}
            whatIfInput={planningSection.whatIfInput}
            setWhatIfInput={planningSection.setWhatIfInput}
            autoAllocationPlan={phase2Data.autoAllocationPlan}
            budgetPerformance={phase2Data.budgetPerformance}
            recurringCandidates={phase2Data.recurringCandidates}
            billRiskAlerts={phase2Data.billRiskAlerts}
            forecastWindows={phase2Data.forecastWindows}
            monthCloseChecklist={phase2Data.monthCloseChecklist}
            dataQuality={phase2Data.dataQuality}
            formatMoney={formatSection.formatMoney}
          />
        ) : null}

        {activeTab === 'accounts' ? (
          <AccountsTab
            accounts={accounts}
            incomes={incomes}
            bills={bills}
            cards={cards}
            loans={loans}
            accountTransfers={accountTransfers}
            accountReconciliationChecks={accountReconciliationChecks}
            accountForm={accountsSection.accountForm}
            setAccountForm={accountsSection.setAccountForm}
            accountEditId={accountsSection.accountEditId}
            setAccountEditId={accountsSection.setAccountEditId}
            accountEditDraft={accountsSection.accountEditDraft}
            setAccountEditDraft={accountsSection.setAccountEditDraft}
            onAddAccount={accountsSection.onAddAccount}
            onDeleteAccount={accountsSection.onDeleteAccount}
            saveAccountEdit={accountsSection.saveAccountEdit}
            startAccountEdit={accountsSection.startAccountEdit}
            accountTransferForm={accountsSection.accountTransferForm}
            setAccountTransferForm={accountsSection.setAccountTransferForm}
            submitAccountTransfer={accountsSection.submitAccountTransfer}
            accountReconciliationForm={accountsSection.accountReconciliationForm}
            setAccountReconciliationForm={accountsSection.setAccountReconciliationForm}
            submitAccountReconciliation={accountsSection.submitAccountReconciliation}
            projectedMonthlyNet={summary.projectedMonthlyNet}
            accountTypeOptions={accountTypeOptions}
            accountPurposeOptions={accountPurposeOptions}
            accountTypeLabel={accountTypeLabel}
            accountPurposeLabel={accountPurposeLabel}
            formatMoney={formatSection.formatMoney}
          />
        ) : null}

        {activeTab === 'goals' ? (
          <GoalsTab
            goalsWithMetrics={goalsSection.goalsWithMetrics}
            goalEvents={goalsSection.goalEvents}
            goalForm={goalsSection.goalForm}
            setGoalForm={goalsSection.setGoalForm}
            goalEditId={goalsSection.goalEditId}
            setGoalEditId={goalsSection.setGoalEditId}
            goalEditDraft={goalsSection.goalEditDraft}
            setGoalEditDraft={goalsSection.setGoalEditDraft}
            onAddGoal={goalsSection.onAddGoal}
            onDeleteGoal={goalsSection.onDeleteGoal}
            saveGoalEdit={goalsSection.saveGoalEdit}
            startGoalEdit={goalsSection.startGoalEdit}
            onRecordGoalContribution={goalsSection.onRecordGoalContribution}
            onSetGoalPaused={goalsSection.onSetGoalPaused}
            busyGoalContributionId={goalsSection.busyGoalContributionId}
            busyGoalPauseId={goalsSection.busyGoalPauseId}
            incomes={incomes}
            accounts={accounts}
            cards={cards}
            cadenceOptions={cadenceOptions}
            customCadenceUnitOptions={customCadenceUnitOptions}
            goalPriorityOptions={goalPriorityOptions}
            goalTypeOptions={goalTypeOptions}
            goalFundingSourceTypeOptions={goalFundingSourceTypeOptions}
            priorityLabel={priorityLabel}
            goalTypeLabel={goalTypeLabel}
            cadenceLabel={cadenceLabel}
            formatMoney={formatSection.formatMoney}
            formatPercent={formatSection.formatPercent}
            dateLabel={dateLabel}
          />
        ) : null}

        {activeTab === 'settings' ? (
          <SettingsTab
            preferenceDraft={settingsSection.preferenceDraft}
            setPreferenceDraft={settingsSection.setPreferenceDraft}
            isSavingPreferences={settingsSection.isSavingPreferences}
            hasUnsavedPreferences={settingsSection.hasUnsavedPreferences}
            onSavePreferences={settingsSection.onSavePreferences}
            onResetPreferencesDraft={settingsSection.onResetPreferencesDraft}
            moveDashboardCard={settingsSection.moveDashboardCard}
            currencyOptions={settingsSection.currencyOptions}
            localeOptions={settingsSection.localeOptions}
            timezoneOptions={settingsSection.timezoneOptions}
            weekStartDayOptions={settingsSection.weekStartDayOptions}
            defaultMonthPresetOptions={settingsSection.defaultMonthPresetOptions}
            uiDensityOptions={settingsSection.uiDensityOptions}
            monthlyAutomationRetryStrategyOptions={settingsSection.monthlyAutomationRetryStrategyOptions}
            planningDefaultVersionOptions={settingsSection.planningDefaultVersionOptions}
            planningAutoApplyModeOptions={settingsSection.planningAutoApplyModeOptions}
            planningNegativeForecastFallbackOptions={settingsSection.planningNegativeForecastFallbackOptions}
            defaultLandingTabOptions={settingsSection.defaultLandingTabOptions}
            dashboardCardOrderOptions={settingsSection.dashboardCardOrderOptions}
            settingsProfiles={settingsSection.settingsProfiles}
            settingsPreferenceHistory={settingsSection.settingsPreferenceHistory}
            settingsProfileName={settingsSection.settingsProfileName}
            setSettingsProfileName={settingsSection.setSettingsProfileName}
            settingsProfileDescription={settingsSection.settingsProfileDescription}
            setSettingsProfileDescription={settingsSection.setSettingsProfileDescription}
            isSavingSettingsProfile={settingsSection.isSavingSettingsProfile}
            applyingSettingsProfileId={settingsSection.applyingSettingsProfileId}
            deletingSettingsProfileId={settingsSection.deletingSettingsProfileId}
            restoringSettingsHistoryId={settingsSection.restoringSettingsHistoryId}
            onSaveSettingsProfile={settingsSection.onSaveSettingsProfile}
            onApplySettingsProfile={settingsSection.onApplySettingsProfile}
            onDeleteSettingsProfile={settingsSection.onDeleteSettingsProfile}
            onRestoreSettingsHistory={settingsSection.onRestoreSettingsHistory}
            consentSettings={
              settingsSection.privacyData?.consentSettings ?? {
                diagnosticsEnabled: false,
                analyticsEnabled: false,
                updatedAt: 0,
              }
            }
            consentLogs={settingsSection.privacyData?.consentLogs ?? []}
            latestExport={settingsSection.privacyData?.latestExport ?? null}
            exportHistory={settingsSection.exportHistory}
            exportDownloadLogs={settingsSection.exportDownloadLogs}
            latestDeletionJob={settingsSection.privacyData?.latestDeletionJob ?? null}
            retentionPolicies={settingsSection.retentionPolicies}
            isExporting={settingsSection.isExporting}
            onGenerateExport={settingsSection.onGenerateExport}
            onDownloadExportById={settingsSection.onDownloadExportById}
            onDownloadLatestExport={settingsSection.onDownloadLatestExport}
            deleteConfirmText={settingsSection.deleteConfirmText}
            setDeleteConfirmText={settingsSection.setDeleteConfirmText}
            isDeleting={settingsSection.isDeleting}
            onRequestDeletion={settingsSection.onRequestDeletion}
            isApplyingRetention={settingsSection.isApplyingRetention}
            onRunRetentionNow={settingsSection.onRunRetentionNow}
            onToggleConsent={settingsSection.onToggleConsent}
            onUpsertRetention={settingsSection.onUpsertRetention}
            securitySessions={settingsSection.securitySessions}
            isLoadingSecuritySessions={settingsSection.isLoadingSecuritySessions}
            isRefreshingSecuritySessions={settingsSection.isRefreshingSecuritySessions}
            hasLoadedSecuritySessions={settingsSection.hasLoadedSecuritySessions}
            isRevokingAllSessions={settingsSection.isRevokingAllSessions}
            revokingSecuritySessionId={settingsSection.revokingSecuritySessionId}
            clientDeviceSessionCount={settingsSection.clientDeviceSessionCount}
            onRefreshSecuritySessions={settingsSection.onRefreshSecuritySessions}
            onRevokeSecuritySession={settingsSection.onRevokeSecuritySession}
            onSignOutAllSessions={settingsSection.onSignOutAllSessions}
            cycleDateLabel={cycleDateLabel}
          />
        ) : null}

        {printModalOpen ? (
          <PrintReportModal
            open
            onClose={() => setPrintModalOpen(false)}
            onStartPrint={startPrint}
            locale={preference.locale}
            defaultMonthPreset={preference.defaultMonthPreset}
          />
        ) : null}
      </SignedIn>
	      <PwaUpdateToast />
      </div>

      <SignedIn>
        {printConfig ? (
          <div className="print-only">
            <PrintReport
              config={printConfig}
              preference={preference}
              summary={summary}
              kpis={kpisState ?? null}
              monthCloseSnapshots={monthCloseSnapshots}
              incomes={incomes}
              incomePaymentChecks={incomePaymentChecks}
              incomeChangeEvents={incomeChangeEvents}
              bills={bills}
              cards={cards}
              loans={loans}
              loanEvents={loanEvents}
              accounts={accounts}
              accountTransfers={accountTransfers}
              accountReconciliationChecks={accountReconciliationChecks}
              goals={goals}
              goalEvents={goalEvents}
              goalsWithMetrics={goalsSection.goalsWithMetrics}
              purchases={purchases}
              envelopeBudgets={envelopeBudgetHistory}
              planningMonthVersions={planningMonthVersions}
              planningActionTasks={planningActionTasks}
              planningForecastWindows={phase2Data.forecastWindows}
              cycleAuditLogs={cycleAuditLogs}
              monthlyCycleRuns={monthlyCycleRuns}
              purchaseMonthCloseRuns={purchaseMonthCloseRuns}
              financeAuditEvents={financeAuditEvents}
              formatMoney={formatSection.formatMoney}
              cycleDateLabel={cycleDateLabel}
            />
          </div>
        ) : null}
      </SignedIn>
	    </main>
	  )
	}

export default App
