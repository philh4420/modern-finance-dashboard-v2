import { v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { requireIdentity as requireAuthIdentity } from './lib/authz'

const cadenceValidator = v.union(
  v.literal('weekly'),
  v.literal('biweekly'),
  v.literal('monthly'),
  v.literal('quarterly'),
  v.literal('yearly'),
  v.literal('custom'),
  v.literal('one_time'),
)

const customCadenceUnitValidator = v.union(
  v.literal('days'),
  v.literal('weeks'),
  v.literal('months'),
  v.literal('years'),
)

const accountTypeValidator = v.union(
  v.literal('checking'),
  v.literal('savings'),
  v.literal('investment'),
  v.literal('cash'),
  v.literal('debt'),
)
const accountPurposeValidator = v.union(
  v.literal('bills'),
  v.literal('emergency'),
  v.literal('spending'),
  v.literal('goals'),
  v.literal('debt'),
)

const goalPriorityValidator = v.union(v.literal('low'), v.literal('medium'), v.literal('high'))
const goalTypeValidator = v.union(
  v.literal('emergency_fund'),
  v.literal('sinking_fund'),
  v.literal('debt_payoff'),
  v.literal('big_purchase'),
)
const goalFundingSourceTypeValidator = v.union(v.literal('account'), v.literal('card'), v.literal('income'))
const goalEventSourceValidator = v.union(v.literal('manual'), v.literal('quick_action'), v.literal('system'))
const goalFundingSourceMapItemValidator = v.object({
  sourceType: goalFundingSourceTypeValidator,
  sourceId: v.string(),
  allocationPercent: v.optional(v.number()),
})
const cycleRunSourceValidator = v.union(v.literal('manual'), v.literal('automatic'))
const reconciliationStatusValidator = v.union(v.literal('pending'), v.literal('posted'), v.literal('reconciled'))
const cardMinimumPaymentTypeValidator = v.union(v.literal('fixed'), v.literal('percent_plus_interest'))
const loanMinimumPaymentTypeValidator = v.union(v.literal('fixed'), v.literal('percent_plus_interest'))
const incomePaymentStatusValidator = v.union(v.literal('on_time'), v.literal('late'), v.literal('missed'))
const planningVersionKey = v.union(v.literal('base'), v.literal('conservative'), v.literal('aggressive'))
const billOverlapResolutionValidator = v.union(
  v.literal('merge'),
  v.literal('archive_duplicate'),
  v.literal('mark_intentional'),
)
const billCategoryValidator = v.union(
  v.literal('housing'),
  v.literal('utilities'),
  v.literal('council_tax'),
  v.literal('insurance'),
  v.literal('transport'),
  v.literal('health'),
  v.literal('debt'),
  v.literal('subscriptions'),
  v.literal('education'),
  v.literal('childcare'),
  v.literal('other'),
)
const billScopeValidator = v.union(v.literal('shared'), v.literal('personal'))
const purchaseOwnershipValidator = v.union(v.literal('shared'), v.literal('personal'))
const weekStartDayValidator = v.union(
  v.literal('monday'),
  v.literal('tuesday'),
  v.literal('wednesday'),
  v.literal('thursday'),
  v.literal('friday'),
  v.literal('saturday'),
  v.literal('sunday'),
)
const uiDensityValidator = v.union(v.literal('comfortable'), v.literal('compact'))
const defaultMonthPresetValidator = v.union(
  v.literal('current'),
  v.literal('previous'),
  v.literal('next'),
  v.literal('last_used'),
)
const monthlyAutomationRetryStrategyValidator = v.union(
  v.literal('none'),
  v.literal('same_day_backoff'),
  v.literal('next_day_retry'),
)
const planningAutoApplyModeValidator = v.union(
  v.literal('manual_only'),
  v.literal('month_start'),
  v.literal('after_cycle'),
)
const planningNegativeForecastFallbackValidator = v.union(
  v.literal('warn_only'),
  v.literal('reduce_variable_spend'),
  v.literal('pause_goals'),
  v.literal('debt_minimums_only'),
)
const appTabKeyValidator = v.union(
  v.literal('dashboard'),
  v.literal('income'),
  v.literal('bills'),
  v.literal('cards'),
  v.literal('loans'),
  v.literal('purchases'),
  v.literal('reconcile'),
  v.literal('planning'),
  v.literal('settings'),
  v.literal('accounts'),
  v.literal('goals'),
)
const purchaseFundingSourceTypeValidator = v.union(
  v.literal('unassigned'),
  v.literal('account'),
  v.literal('card'),
)
const billsMonthlyBulkActionValidator = v.union(
  v.literal('roll_recurring_forward'),
  v.literal('mark_all_paid_from_account'),
  v.literal('reconcile_batch'),
)

type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom' | 'one_time'
type CustomCadenceUnit = 'days' | 'weeks' | 'months' | 'years'
type InsightSeverity = 'good' | 'warning' | 'critical'
type CycleRunSource = 'manual' | 'automatic'
type CycleStepAlertSeverity = 'warning' | 'critical'
type LoanEventSource = 'manual' | 'monthly_cycle'
type ReconciliationStatus = 'pending' | 'posted' | 'reconciled'
type CardMinimumPaymentType = 'fixed' | 'percent_plus_interest'
type LoanMinimumPaymentType = 'fixed' | 'percent_plus_interest'
type LoanEventType = 'interest_accrual' | 'payment' | 'charge' | 'subscription_fee'
type LoanMutationType =
  | 'created'
  | 'updated'
  | 'removed'
  | 'charge'
  | 'payment'
  | 'interest_accrual'
  | 'subscription_fee'
  | 'monthly_cycle'
type LoanMutationSource = 'manual' | 'automatic' | 'monthly_cycle'
type IncomePaymentStatus = 'on_time' | 'late' | 'missed'
type IncomeChangeDirection = 'increase' | 'decrease' | 'no_change'
type AccountType = 'checking' | 'savings' | 'investment' | 'cash' | 'debt'
type AccountPurpose = 'bills' | 'emergency' | 'spending' | 'goals' | 'debt'
type GoalType = 'emergency_fund' | 'sinking_fund' | 'debt_payoff' | 'big_purchase'
type GoalFundingSourceType = 'account' | 'card' | 'income'
type GoalEventType =
  | 'created'
  | 'edited'
  | 'target_changed'
  | 'schedule_changed'
  | 'contribution'
  | 'progress_adjustment'
  | 'paused'
  | 'resumed'
  | 'removed'
type GoalEventSource = 'manual' | 'quick_action' | 'system'
type BillCategory =
  | 'housing'
  | 'utilities'
  | 'council_tax'
  | 'insurance'
  | 'transport'
  | 'health'
  | 'debt'
  | 'subscriptions'
  | 'education'
  | 'childcare'
  | 'other'
type BillScope = 'shared' | 'personal'
type PurchaseOwnership = 'shared' | 'personal'
type WeekStartDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
type UiDensity = 'comfortable' | 'compact'
type DefaultMonthPreset = 'current' | 'previous' | 'next' | 'last_used'
type PlanningVersionKey = 'base' | 'conservative' | 'aggressive'
type MonthlyAutomationRetryStrategy = 'none' | 'same_day_backoff' | 'next_day_retry'
type PlanningAutoApplyMode = 'manual_only' | 'month_start' | 'after_cycle'
type PlanningNegativeForecastFallback =
  | 'warn_only'
  | 'reduce_variable_spend'
  | 'pause_goals'
  | 'debt_minimums_only'
type AppTabKey =
  | 'dashboard'
  | 'income'
  | 'bills'
  | 'cards'
  | 'loans'
  | 'purchases'
  | 'reconcile'
  | 'planning'
  | 'settings'
  | 'accounts'
  | 'goals'
type PurchaseFundingSourceType = 'unassigned' | 'account' | 'card'
type BillsMonthlyBulkAction = 'roll_recurring_forward' | 'mark_all_paid_from_account' | 'reconcile_batch'
type LedgerEntryType =
  | 'purchase'
  | 'purchase_reversal'
  | 'cycle_card_spend'
  | 'cycle_card_interest'
  | 'cycle_card_payment'
  | 'cycle_loan_interest'
  | 'cycle_loan_payment'
type LedgerLineType = 'debit' | 'credit'
type PurchaseMonthCloseSummary = {
  monthKey: string
  purchaseCount: number
  totalAmount: number
  pendingAmount: number
  pendingCount: number
  postedCount: number
  reconciledCount: number
  duplicateCount: number
  anomalyCount: number
  missingCategoryCount: number
  categoryBreakdown: Array<{
    category: string
    total: number
    share: number
  }>
}

type ReconciliationPreCloseIssue = {
  id: string
  severity: 'blocker' | 'warning'
  label: string
  detail: string
}

type IncomeDoc = Doc<'incomes'>
type BillDoc = Doc<'bills'>
type CardDoc = Doc<'cards'>
type LoanDoc = Doc<'loans'>
type GoalDoc = Doc<'goals'>
type GoalFundingSourceMapItem = {
  sourceType: GoalFundingSourceType
  sourceId: string
  allocationPercent?: number
}

const dashboardCardIds = [
  'health-score',
  'monthly-income',
  'monthly-commitments',
  'loan-balance',
  'projected-net',
  'net-worth',
  'runway',
] as const
type DashboardCardId = (typeof dashboardCardIds)[number]

type FinancePreferenceSnapshot = {
  currency: string
  locale: string
  displayName: string
  timezone: string
  weekStartDay: WeekStartDay
  defaultMonthPreset: DefaultMonthPreset
  dueRemindersEnabled: boolean
  dueReminderDays: number
  monthlyCycleAlertsEnabled: boolean
  reconciliationRemindersEnabled: boolean
  goalAlertsEnabled: boolean
  defaultBillCategory: BillCategory
  defaultBillScope: BillScope
  defaultPurchaseOwnership: PurchaseOwnership
  defaultPurchaseCategory: string
  billNotesTemplate: string
  purchaseNotesTemplate: string
  uiDensity: UiDensity
  defaultLandingTab: AppTabKey
  dashboardCardOrder: DashboardCardId[]
  monthlyAutomationEnabled: boolean
  monthlyAutomationRunDay: number
  monthlyAutomationRunHour: number
  monthlyAutomationRunMinute: number
  monthlyAutomationRetryStrategy: MonthlyAutomationRetryStrategy
  monthlyAutomationMaxRetries: number
  alertEscalationFailureStreakThreshold: number
  alertEscalationFailedStepsThreshold: number
  planningDefaultVersionKey: PlanningVersionKey
  planningAutoApplyMode: PlanningAutoApplyMode
  planningNegativeForecastFallback: PlanningNegativeForecastFallback
}

const defaultDashboardCardOrder: DashboardCardId[] = [...dashboardCardIds]

const defaultPreference: FinancePreferenceSnapshot = {
  currency: 'USD',
  locale: 'en-US',
  displayName: '',
  timezone: 'UTC',
  weekStartDay: 'monday' as WeekStartDay,
  defaultMonthPreset: 'current' as DefaultMonthPreset,
  dueRemindersEnabled: true,
  dueReminderDays: 3,
  monthlyCycleAlertsEnabled: true,
  reconciliationRemindersEnabled: true,
  goalAlertsEnabled: true,
  defaultBillCategory: 'other' as BillCategory,
  defaultBillScope: 'shared' as BillScope,
  defaultPurchaseOwnership: 'shared' as PurchaseOwnership,
  defaultPurchaseCategory: '',
  billNotesTemplate: '',
  purchaseNotesTemplate: '',
  uiDensity: 'comfortable' as UiDensity,
  defaultLandingTab: 'dashboard' as AppTabKey,
  dashboardCardOrder: defaultDashboardCardOrder,
  monthlyAutomationEnabled: false,
  monthlyAutomationRunDay: 1,
  monthlyAutomationRunHour: 9,
  monthlyAutomationRunMinute: 0,
  monthlyAutomationRetryStrategy: 'same_day_backoff' as MonthlyAutomationRetryStrategy,
  monthlyAutomationMaxRetries: 2,
  alertEscalationFailureStreakThreshold: 2,
  alertEscalationFailedStepsThreshold: 1,
  planningDefaultVersionKey: 'base' as const,
  planningAutoApplyMode: 'manual_only' as PlanningAutoApplyMode,
  planningNegativeForecastFallback: 'warn_only' as PlanningNegativeForecastFallback,
}

const defaultSummary = {
  monthlyIncome: 0,
  monthlyBills: 0,
  monthlyCardSpend: 0,
  monthlyLoanPayments: 0,
  monthlyLoanBasePayments: 0,
  monthlyLoanSubscriptionCosts: 0,
  monthlyCommitments: 0,
  runwayAvailablePool: 0,
  runwayMonthlyPressure: 0,
  cardLimitTotal: 0,
  cardUsedTotal: 0,
  totalLoanBalance: 0,
  cardUtilizationPercent: 0,
  purchasesThisMonth: 0,
  pendingPurchaseAmountThisMonth: 0,
  postedPurchaseAmountThisMonth: 0,
  reconciledPurchaseAmountThisMonth: 0,
  projectedMonthlyNet: 0,
  savingsRatePercent: 0,
  totalAssets: 0,
  totalLiabilities: 0,
  netWorth: 0,
  liquidReserves: 0,
  runwayMonths: 0,
  healthScore: 0,
  goalsFundedPercent: 0,
  pendingPurchases: 0,
  postedPurchases: 0,
  reconciledPurchases: 0,
}

const requireIdentity = async (ctx: QueryCtx | MutationCtx) =>
  requireAuthIdentity(ctx, 'You must be signed in to manage finance data.')

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

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

      switch (customUnit) {
        case 'days':
          return (amount * 365.2425) / (customInterval * 12)
        case 'weeks':
          return (amount * 365.2425) / (customInterval * 7 * 12)
        case 'months':
          return amount / customInterval
        case 'years':
          return amount / (customInterval * 12)
        default:
          return 0
      }
    case 'one_time':
      return 0
    default:
      return amount
  }
}

const validatePositive = (value: number, fieldName: string) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be greater than 0.`)
  }
}

const validateNonNegative = (value: number, fieldName: string) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${fieldName} cannot be negative.`)
  }
}

const validateFinite = (value: number, fieldName: string) => {
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a valid number.`)
  }
}

const validateDayOfMonth = (value: number, fieldName: string) => {
  if (!Number.isInteger(value) || value < 1 || value > 31) {
    throw new Error(`${fieldName} must be an integer between 1 and 31.`)
  }
}

const validatePositiveInteger = (value: number, fieldName: string, maxValue = 360) => {
  if (!Number.isInteger(value) || value < 1 || value > maxValue) {
    throw new Error(`${fieldName} must be an integer between 1 and ${maxValue}.`)
  }
}

const validateUsedLimitAgainstCreditLimit = (args: {
  creditLimit: number
  usedLimit: number
  allowOverLimitOverride?: boolean
}) => {
  if (args.usedLimit <= args.creditLimit + 0.000001) {
    return
  }

  if (!args.allowOverLimitOverride) {
    throw new Error('Current balance exceeds credit limit. Enable over-limit override to continue.')
  }
}

const finiteOrZero = (value: number | undefined | null) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

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

const resolveIncomeChangeDirection = (deltaAmount: number): IncomeChangeDirection => {
  if (deltaAmount > 0.000001) {
    return 'increase'
  }
  if (deltaAmount < -0.000001) {
    return 'decrease'
  }
  return 'no_change'
}

const normalizeIncomeForecastSmoothing = (
  enabled: boolean | undefined | null,
  lookbackMonths: number | undefined | null,
) => {
  const forecastSmoothingEnabled = enabled === true
  if (!forecastSmoothingEnabled) {
    return {
      forecastSmoothingEnabled: false,
      forecastSmoothingMonths: undefined,
    }
  }

  const normalizedMonths = Math.round(finiteOrZero(lookbackMonths))
  if (!Number.isFinite(normalizedMonths) || normalizedMonths < 2 || normalizedMonths > 24) {
    throw new Error('Forecast smoothing lookback must be an integer between 2 and 24 months.')
  }

  return {
    forecastSmoothingEnabled: true,
    forecastSmoothingMonths: normalizedMonths,
  }
}

const normalizeCardMinimumPaymentType = (
  value: CardMinimumPaymentType | undefined | null,
): CardMinimumPaymentType => (value === 'percent_plus_interest' ? 'percent_plus_interest' : 'fixed')

const normalizeLoanMinimumPaymentType = (
  value: LoanMinimumPaymentType | undefined | null,
): LoanMinimumPaymentType => (value === 'percent_plus_interest' ? 'percent_plus_interest' : 'fixed')

const clampPercent = (value: number) => clamp(value, 0, 100)

const getLoanWorkingBalances = (loan: LoanDoc) => {
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

const normalizePositiveInteger = (value: number | undefined | null) =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined

const getLoanSubscriptionOutstanding = (loan: LoanDoc) => {
  const subscriptionCost = roundCurrency(Math.max(finiteOrZero(loan.subscriptionCost), 0))
  if (subscriptionCost <= 0) {
    return 0
  }

  const normalizedConfiguredPaymentCount = normalizePositiveInteger(loan.subscriptionPaymentCount)

  if (loan.subscriptionOutstanding !== undefined) {
    const current = roundCurrency(Math.max(finiteOrZero(loan.subscriptionOutstanding), 0))
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

const getSubscriptionPaymentsRemaining = (subscriptionCost: number, subscriptionOutstanding: number) => {
  const safeCost = roundCurrency(Math.max(subscriptionCost, 0))
  const safeOutstanding = roundCurrency(Math.max(subscriptionOutstanding, 0))
  if (safeCost <= 0 || safeOutstanding <= 0) {
    return undefined
  }
  return Math.max(1, Math.ceil(safeOutstanding / safeCost - 0.000001))
}

const getLoanSubscriptionPaymentsRemaining = (loan: LoanDoc) => {
  const safeCost = roundCurrency(Math.max(finiteOrZero(loan.subscriptionCost), 0))
  const safeOutstanding = getLoanSubscriptionOutstanding(loan)
  return getSubscriptionPaymentsRemaining(safeCost, safeOutstanding)
}

const getLoanTotalOutstanding = (loan: LoanDoc) => {
  const working = getLoanWorkingBalances(loan)
  return roundCurrency(working.balance + getLoanSubscriptionOutstanding(loan))
}

type LoanAuditSnapshot = {
  principal: number
  interest: number
  subscription: number
  total: number
}

const getLoanAuditSnapshot = (loan: LoanDoc): LoanAuditSnapshot => {
  const working = getLoanWorkingBalances(loan)
  const subscription = getLoanSubscriptionOutstanding(loan)
  return {
    principal: working.principalBalance,
    interest: working.accruedInterest,
    subscription,
    total: roundCurrency(working.balance + subscription),
  }
}

const buildLoanAuditSnapshot = (input: {
  principal: number
  interest: number
  subscription: number
}): LoanAuditSnapshot => {
  const principal = roundCurrency(Math.max(finiteOrZero(input.principal), 0))
  const interest = roundCurrency(Math.max(finiteOrZero(input.interest), 0))
  const subscription = roundCurrency(Math.max(finiteOrZero(input.subscription), 0))
  return {
    principal,
    interest,
    subscription,
    total: roundCurrency(principal + interest + subscription),
  }
}

const resolveLoanPaymentPlan = (args: {
  principalBalance: number
  accruedInterest: number
  dueBalance: number
  minimumPayment: number
  minimumPaymentType?: LoanMinimumPaymentType
  minimumPaymentPercent?: number
  extraPayment?: number
}) => {
  const minimumPaymentType = normalizeLoanMinimumPaymentType(args.minimumPaymentType)
  const minimumPayment = finiteOrZero(args.minimumPayment)
  const minimumPaymentPercent = clampPercent(finiteOrZero(args.minimumPaymentPercent))
  const extraPayment = finiteOrZero(args.extraPayment)

  const minimumDueRaw =
    minimumPaymentType === 'percent_plus_interest'
      ? args.principalBalance * (minimumPaymentPercent / 100) + args.accruedInterest
      : minimumPayment
  const minimumDue = Math.min(args.dueBalance, Math.max(minimumDueRaw, 0))
  const plannedPayment = Math.min(args.dueBalance, minimumDue + extraPayment)
  const interestPayment = Math.min(args.accruedInterest, plannedPayment)
  const principalPayment = Math.min(args.principalBalance, Math.max(plannedPayment - interestPayment, 0))

  return {
    minimumPaymentType,
    minimumPayment,
    minimumPaymentPercent,
    extraPayment,
    minimumDue: roundCurrency(minimumDue),
    plannedPayment: roundCurrency(plannedPayment),
    interestPayment: roundCurrency(interestPayment),
    principalPayment: roundCurrency(principalPayment),
  }
}

const applyPaymentToLoan = (
  state: {
    principalBalance: number
    accruedInterest: number
  },
  paymentAmount: number,
) => {
  let remaining = Math.max(paymentAmount, 0)
  const interestPayment = Math.min(state.accruedInterest, remaining)
  const nextAccruedInterest = Math.max(state.accruedInterest - interestPayment, 0)
  remaining -= interestPayment

  const principalPayment = Math.min(state.principalBalance, remaining)
  const nextPrincipalBalance = Math.max(state.principalBalance - principalPayment, 0)
  remaining -= principalPayment

  const appliedAmount = interestPayment + principalPayment
  const nextBalance = nextPrincipalBalance + nextAccruedInterest

  return {
    principalBalance: roundCurrency(nextPrincipalBalance),
    accruedInterest: roundCurrency(nextAccruedInterest),
    balance: roundCurrency(nextBalance),
    appliedAmount: roundCurrency(appliedAmount),
    interestPayment: roundCurrency(interestPayment),
    principalPayment: roundCurrency(principalPayment),
    unappliedAmount: roundCurrency(Math.max(remaining, 0)),
  }
}

const resolveLoanBalancesForWrite = (args: {
  balance: number
  principalBalance?: number
  accruedInterest?: number
}) => {
  const hasPrincipal = args.principalBalance !== undefined
  const hasAccruedInterest = args.accruedInterest !== undefined

  const principalBalance = hasPrincipal
    ? Math.max(finiteOrZero(args.principalBalance), 0)
    : hasAccruedInterest
      ? Math.max(args.balance - Math.max(finiteOrZero(args.accruedInterest), 0), 0)
      : Math.max(args.balance, 0)

  const accruedInterest = hasAccruedInterest
    ? Math.max(finiteOrZero(args.accruedInterest), 0)
    : Math.max(args.balance - principalBalance, 0)

  const balance = hasPrincipal || hasAccruedInterest ? principalBalance + accruedInterest : Math.max(args.balance, 0)

  return {
    principalBalance: roundCurrency(principalBalance),
    accruedInterest: roundCurrency(accruedInterest),
    balance: roundCurrency(balance),
  }
}

const resolveLoanSubscriptionOutstandingForWrite = (args: {
  existing?: LoanDoc
  subscriptionCost?: number
  subscriptionPaymentCount?: number
  subscriptionOutstanding?: number
}) => {
  if (args.subscriptionOutstanding !== undefined) {
    validateNonNegative(args.subscriptionOutstanding, 'Loan subscription outstanding')
    return roundCurrency(Math.max(args.subscriptionOutstanding, 0))
  }

  const nextSubscriptionCost = roundCurrency(
    Math.max(finiteOrZero(args.subscriptionCost ?? args.existing?.subscriptionCost), 0),
  )
  if (!args.existing) {
    if (nextSubscriptionCost <= 0) {
      return 0
    }
    const nextPaymentCount = args.subscriptionPaymentCount ?? 12
    return roundCurrency(nextSubscriptionCost * nextPaymentCount)
  }

  if (nextSubscriptionCost <= 0) {
    return 0
  }

  if (args.subscriptionCost !== undefined || args.subscriptionPaymentCount !== undefined) {
    const nextPaymentCount =
      normalizePositiveInteger(args.subscriptionPaymentCount) ?? getLoanSubscriptionPaymentsRemaining(args.existing) ?? 12
    return roundCurrency(Math.max(nextSubscriptionCost * nextPaymentCount, 0))
  }

  return getLoanSubscriptionOutstanding(args.existing)
}

const resolveLoanPaymentConfigForWrite = (args: {
  minimumPayment: number
  minimumPaymentType?: LoanMinimumPaymentType
  minimumPaymentPercent?: number
  extraPayment?: number
}) => {
  const minimumPaymentType = normalizeLoanMinimumPaymentType(args.minimumPaymentType)

  if (minimumPaymentType === 'fixed') {
    validatePositive(args.minimumPayment, 'Loan minimum payment')
  } else {
    validateNonNegative(args.minimumPayment, 'Loan minimum payment')
    if (args.minimumPaymentPercent === undefined) {
      throw new Error('Minimum payment % is required for % + interest loans.')
    }
    validateNonNegative(args.minimumPaymentPercent, 'Loan minimum payment %')
    if (args.minimumPaymentPercent > 100) {
      throw new Error('Loan minimum payment % must be 100 or less.')
    }
  }

  if (args.extraPayment !== undefined) {
    validateNonNegative(args.extraPayment, 'Loan extra payment')
  }

  return {
    minimumPaymentType,
    minimumPaymentPercent:
      minimumPaymentType === 'percent_plus_interest'
        ? clampPercent(finiteOrZero(args.minimumPaymentPercent))
        : undefined,
    extraPayment: roundCurrency(Math.max(finiteOrZero(args.extraPayment), 0)),
  }
}

const validateRequiredText = (value: string, fieldName: string) => {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error(`${fieldName} is required.`)
  }

  if (trimmed.length > 140) {
    throw new Error(`${fieldName} must be 140 characters or less.`)
  }
}

const validateOptionalText = (value: string | undefined | null, fieldName: string, maxLength: number) => {
  if (value === undefined || value === null) {
    return
  }
  const trimmed = value.trim()
  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or less.`)
  }
}

const parseIsoDateValue = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null
  }

  const [yearText, monthText, dayText] = value.split('-')
  const year = Number.parseInt(yearText, 10)
  const month = Number.parseInt(monthText, 10)
  const day = Number.parseInt(dayText, 10)

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }

  const parsed = new Date(year, month - 1, day)
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null
  }

  return parsed
}

const validateIsoDate = (value: string, fieldName: string) => {
  if (!parseIsoDateValue(value)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD format.`)
  }
}

const validateStatementMonth = (value: string, fieldName: string) => {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    throw new Error(`${fieldName} must use YYYY-MM format.`)
  }
}

const addMonthsToMonthKey = (value: string, monthDelta: number) => {
  const year = Number.parseInt(value.slice(0, 4), 10)
  const month = Number.parseInt(value.slice(5, 7), 10)
  const base = new Date(year, month - 1 + monthDelta, 1)
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`
}

const toCycleKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

const sanitizeLedgerToken = (value: string) => {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return normalized.length > 0 ? normalized : 'UNSPECIFIED'
}

const stringifyForAudit = (value: unknown) => {
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

const parseAuditJson = <T = unknown>(value?: string) => {
  if (!value) return undefined
  try {
    return JSON.parse(value) as T
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

const isGenericCategory = (value: string) => {
  const normalized = value.trim().toLowerCase()
  return normalized.length === 0 || normalized === 'uncategorized' || normalized === 'other' || normalized === 'misc'
}

const matchesPurchasePattern = (value: string, pattern: string, matchType: 'contains' | 'exact' | 'starts_with') => {
  const normalizedValue = value.trim().toLowerCase()
  const normalizedPattern = pattern.trim().toLowerCase()
  if (normalizedPattern.length === 0) {
    return false
  }
  if (matchType === 'exact') {
    return normalizedValue === normalizedPattern
  }
  if (matchType === 'starts_with') {
    return normalizedValue.startsWith(normalizedPattern)
  }
  return normalizedValue.includes(normalizedPattern)
}

const resolvePurchaseRuleOverrides = async (ctx: MutationCtx, userId: string, item: string) => {
  const rules = await ctx.db
    .query('transactionRules')
    .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId))
    .collect()

  const matchedRule = [...rules]
    .filter((rule) => rule.active)
    .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)
    .find((rule) => matchesPurchasePattern(item, rule.merchantPattern, rule.matchType))

  if (!matchedRule) {
    return null
  }

  return {
    category: matchedRule.category.trim(),
    reconciliationStatus: matchedRule.reconciliationStatus,
    fundingSourceType: matchedRule.fundingSourceType,
    fundingSourceId: matchedRule.fundingSourceId,
    ruleId: String(matchedRule._id),
  }
}

const sanitizeCadenceDetails = (
  cadence: Cadence,
  customInterval?: number,
  customUnit?: CustomCadenceUnit,
) => {
  if (cadence !== 'custom') {
    return {
      customInterval: undefined,
      customUnit: undefined,
    }
  }

  if (!customUnit) {
    throw new Error('Custom frequency unit is required.')
  }

  if (!customInterval || !Number.isInteger(customInterval) || customInterval < 1 || customInterval > 3650) {
    throw new Error('Custom frequency interval must be an integer between 1 and 3650.')
  }

  return {
    customInterval,
    customUnit,
  }
}

const sanitizeSubscriptionDetails = (isSubscription?: boolean, cancelReminderDays?: number) => {
  const enabled = isSubscription === true
  if (!enabled) {
    return {
      isSubscription: false,
      cancelReminderDays: undefined,
    }
  }

  if (cancelReminderDays === undefined) {
    return {
      isSubscription: true,
      cancelReminderDays: 7,
    }
  }

  if (!Number.isInteger(cancelReminderDays) || cancelReminderDays < 0 || cancelReminderDays > 365) {
    throw new Error('Cancel reminder must be an integer between 0 and 365 days.')
  }

  return {
    isSubscription: true,
    cancelReminderDays,
  }
}

const sanitizeBillTagging = (
  category?: BillCategory,
  scope?: BillScope,
  deductible?: boolean,
) => ({
  category: category ?? 'other',
  scope: scope ?? 'shared',
  deductible: deductible === true,
})

const archivedDuplicateNoteMarker = '[archived-duplicate]'
const intentionalOverlapMarkerPrefix = '[intentional-overlap:'

const buildIntentionalOverlapMarker = (otherBillId: string) => `${intentionalOverlapMarkerPrefix}${otherBillId}]`
const buildDuplicateOfMarker = (primaryBillId: string) => `[duplicate-of:${primaryBillId}]`
const buildMergedFromMarker = (secondaryBillId: string) => `[merged-from:${secondaryBillId}]`

const appendUniqueNoteMarker = (notes: string | undefined, marker: string) => {
  const normalizedMarker = marker.trim()
  if (normalizedMarker.length === 0) {
    return notes?.trim() || undefined
  }

  const base = notes?.trim() ?? ''
  if (base.toLowerCase().includes(normalizedMarker.toLowerCase())) {
    return base.length > 0 ? base : undefined
  }

  const separator = base.length > 0 ? '\n' : ''
  const combined = `${base}${separator}${normalizedMarker}`.trim()
  if (combined.length <= 2000) {
    return combined
  }

  if (normalizedMarker.length >= 2000) {
    return normalizedMarker.slice(0, 2000)
  }

  const availableBase = Math.max(0, 2000 - normalizedMarker.length - 1)
  const truncatedBase = base.slice(0, availableBase).trim()
  const truncatedCombined = `${truncatedBase}\n${normalizedMarker}`.trim()
  return truncatedCombined.length > 0 ? truncatedCombined : undefined
}

const validateLocale = (locale: string) => {
  try {
    new Intl.NumberFormat(locale)
    return true
  } catch {
    return false
  }
}

const validateTimeZone = (timeZone: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

const isWeekStartDay = (value: unknown): value is WeekStartDay =>
  value === 'monday' ||
  value === 'tuesday' ||
  value === 'wednesday' ||
  value === 'thursday' ||
  value === 'friday' ||
  value === 'saturday' ||
  value === 'sunday'

const isUiDensity = (value: unknown): value is UiDensity => value === 'comfortable' || value === 'compact'

const isDefaultMonthPreset = (value: unknown): value is DefaultMonthPreset =>
  value === 'current' || value === 'previous' || value === 'next' || value === 'last_used'

const isPlanningVersionKey = (value: unknown): value is PlanningVersionKey =>
  value === 'base' || value === 'conservative' || value === 'aggressive'

const isMonthlyAutomationRetryStrategy = (value: unknown): value is MonthlyAutomationRetryStrategy =>
  value === 'none' || value === 'same_day_backoff' || value === 'next_day_retry'

const isPlanningAutoApplyMode = (value: unknown): value is PlanningAutoApplyMode =>
  value === 'manual_only' || value === 'month_start' || value === 'after_cycle'

const isPlanningNegativeForecastFallback = (value: unknown): value is PlanningNegativeForecastFallback =>
  value === 'warn_only' ||
  value === 'reduce_variable_spend' ||
  value === 'pause_goals' ||
  value === 'debt_minimums_only'

const isAppTabKey = (value: unknown): value is AppTabKey =>
  value === 'dashboard' ||
  value === 'income' ||
  value === 'bills' ||
  value === 'cards' ||
  value === 'loans' ||
  value === 'purchases' ||
  value === 'reconcile' ||
  value === 'planning' ||
  value === 'settings' ||
  value === 'accounts' ||
  value === 'goals'

const isDashboardCardId = (value: unknown): value is DashboardCardId =>
  typeof value === 'string' && (dashboardCardIds as readonly string[]).includes(value)

const isBillCategory = (value: unknown): value is BillCategory =>
  value === 'housing' ||
  value === 'utilities' ||
  value === 'council_tax' ||
  value === 'insurance' ||
  value === 'transport' ||
  value === 'health' ||
  value === 'debt' ||
  value === 'subscriptions' ||
  value === 'education' ||
  value === 'childcare' ||
  value === 'other'

const isBillScope = (value: unknown): value is BillScope => value === 'shared' || value === 'personal'

const isPurchaseOwnership = (value: unknown): value is PurchaseOwnership => value === 'shared' || value === 'personal'

const normalizeDashboardCardOrder = (value: string[] | undefined) => {
  if (value === undefined) {
    return undefined
  }

  const seen = new Set<string>()
  const normalized: DashboardCardId[] = []
  for (const entry of value) {
    const trimmed = entry.trim()
    if (!isDashboardCardId(trimmed)) {
      throw new Error(`Unsupported dashboard card id: ${entry}`)
    }
    if (seen.has(trimmed)) {
      continue
    }
    seen.add(trimmed)
    normalized.push(trimmed)
  }

  for (const cardId of dashboardCardIds) {
    if (!seen.has(cardId)) {
      normalized.push(cardId)
    }
  }

  return normalized
}

const validateCurrencyCode = (currency: string) => {
  if (!/^[A-Z]{3}$/.test(currency)) {
    return false
  }

  try {
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    })
    return true
  } catch {
    return false
  }
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const roundCurrency = (value: number) => Math.round(value * 100) / 100

const resolveAccountPurpose = (accountType: AccountType, purpose?: AccountPurpose) => {
  if (purpose) {
    return purpose
  }
  return accountType === 'debt' ? 'debt' : 'spending'
}

const resolveAccountBalancesForWrite = (input: {
  balance: number
  ledgerBalance?: number
  pendingBalance?: number
}) => {
  const hasLedger = input.ledgerBalance !== undefined
  const hasPending = input.pendingBalance !== undefined

  const availableBalance = roundCurrency(finiteOrZero(input.balance))
  let ledgerBalance = availableBalance
  let pendingBalance = 0

  if (hasLedger) {
    ledgerBalance = roundCurrency(finiteOrZero(input.ledgerBalance))
    pendingBalance = hasPending
      ? roundCurrency(finiteOrZero(input.pendingBalance))
      : roundCurrency(availableBalance - ledgerBalance)
  } else if (hasPending) {
    pendingBalance = roundCurrency(finiteOrZero(input.pendingBalance))
    ledgerBalance = roundCurrency(availableBalance - pendingBalance)
  }

  return {
    balance: roundCurrency(ledgerBalance + pendingBalance),
    ledgerBalance,
    pendingBalance,
  }
}

const resolveAccountBalancesForRead = (account: Doc<'accounts'>) => {
  const availableBalance = roundCurrency(finiteOrZero(account.balance))
  const hasLedger = account.ledgerBalance !== undefined
  const hasPending = account.pendingBalance !== undefined

  if (!hasLedger && !hasPending) {
    return {
      balance: availableBalance,
      ledgerBalance: availableBalance,
      pendingBalance: 0,
    }
  }

  const pendingBalance = hasPending
    ? roundCurrency(finiteOrZero(account.pendingBalance))
    : roundCurrency(availableBalance - finiteOrZero(account.ledgerBalance))
  const ledgerBalance = hasLedger
    ? roundCurrency(finiteOrZero(account.ledgerBalance))
    : roundCurrency(availableBalance - pendingBalance)

  return {
    balance: roundCurrency(ledgerBalance + pendingBalance),
    ledgerBalance,
    pendingBalance,
  }
}

const applyAccountBalanceDelta = (account: Doc<'accounts'>, delta: number) => {
  const current = resolveAccountBalancesForRead(account)
  const signedDelta = roundCurrency(finiteOrZero(delta))
  const nextLedgerBalance = roundCurrency(current.ledgerBalance + signedDelta)
  const nextBalance = roundCurrency(nextLedgerBalance + current.pendingBalance)

  return {
    balance: nextBalance,
    ledgerBalance: nextLedgerBalance,
    pendingBalance: current.pendingBalance,
  }
}

const monthsBetween = (from: Date, to: Date) =>
  (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())

const dateWithClampedDay = (year: number, month: number, day: number) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(day, daysInMonth))
}

const addCalendarMonthsKeepingDay = (date: Date, months: number) =>
  dateWithClampedDay(date.getFullYear(), date.getMonth() + months, date.getDate())

const countCompletedMonthlyCycles = (fromTimestamp: number, now: Date) => {
  const today = startOfDay(now)
  let marker = startOfDay(new Date(fromTimestamp))
  let cycles = 0

  for (let i = 0; i < 600; i += 1) {
    const next = addCalendarMonthsKeepingDay(marker, 1)
    if (next > today) {
      break
    }
    marker = next
    cycles += 1
  }

  return cycles
}

const resolveCadenceAnchorDate = (createdAt: number, payDateAnchor?: string) => {
  if (payDateAnchor) {
    const parsed = parseIsoDateValue(payDateAnchor)
    if (parsed) {
      return startOfDay(parsed)
    }
  }
  return startOfDay(new Date(createdAt))
}

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
  payDateAnchor?: string,
): Date | null => {
  const today = startOfDay(now)
  const anchorDate = resolveCadenceAnchorDate(createdAt, payDateAnchor)

  if (cadence === 'one_time') {
    const normalizedDay = clamp(dayOfMonth ?? anchorDate.getDate(), 1, 31)
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
    const normalizedDay = clamp(dayOfMonth ?? anchorDate.getDate(), 1, 31)
    return nextDateByMonthCycle(normalizedDay, cycleMonths, anchorDate, today)
  }

  const cycleMonths = cadence === 'monthly' ? 1 : cadence === 'quarterly' ? 3 : 12
  const normalizedDay = clamp(dayOfMonth ?? anchorDate.getDate(), 1, 31)

  return nextDateByMonthCycle(normalizedDay, cycleMonths, anchorDate, today)
}

const resolveCardPaymentPlan = (args: {
  statementBalance: number
  dueBalance: number
  interestAmount: number
  minimumPayment: number
  minimumPaymentType?: CardMinimumPaymentType
  minimumPaymentPercent?: number
  extraPayment?: number
}) => {
  const minimumPaymentType = normalizeCardMinimumPaymentType(args.minimumPaymentType)
  const minimumPayment = finiteOrZero(args.minimumPayment)
  const minimumPaymentPercent = clampPercent(finiteOrZero(args.minimumPaymentPercent))
  const extraPayment = finiteOrZero(args.extraPayment)

  const minimumDueRaw =
    minimumPaymentType === 'percent_plus_interest'
      ? args.statementBalance * (minimumPaymentPercent / 100) + args.interestAmount
      : minimumPayment
  const minimumDue = Math.min(args.dueBalance, Math.max(minimumDueRaw, 0))
  const plannedPayment = Math.min(args.dueBalance, minimumDue + extraPayment)

  return {
    minimumPaymentType,
    minimumPayment,
    minimumPaymentPercent,
    extraPayment,
    minimumDue,
    plannedPayment,
  }
}

const getCardWorkingBalances = (card: CardDoc) => {
  const statementBalance = Math.max(finiteOrZero(card.statementBalance ?? card.usedLimit), 0)
  const pendingCharges = Math.max(finiteOrZero(card.pendingCharges), 0)

  return {
    statementBalance,
    pendingCharges,
  }
}

const buildCardBalancePatch = (statementBalance: number, pendingCharges: number) => ({
  statementBalance: roundCurrency(Math.max(statementBalance, 0)),
  pendingCharges: roundCurrency(Math.max(pendingCharges, 0)),
  usedLimit: roundCurrency(Math.max(statementBalance + pendingCharges, 0)),
})

const applyChargeToCard = (card: CardDoc, amount: number) => {
  const balances = getCardWorkingBalances(card)
  return buildCardBalancePatch(balances.statementBalance, balances.pendingCharges + amount)
}

const applyPaymentToCard = (card: CardDoc, amount: number) => {
  const balances = getCardWorkingBalances(card)
  let remaining = Math.max(amount, 0)

  const statementPayment = Math.min(balances.statementBalance, remaining)
  const nextStatement = balances.statementBalance - statementPayment
  remaining -= statementPayment

  const pendingPayment = Math.min(balances.pendingCharges, remaining)
  const nextPending = balances.pendingCharges - pendingPayment
  remaining -= pendingPayment

  const appliedAmount = statementPayment + pendingPayment

  return {
    ...buildCardBalancePatch(nextStatement, nextPending),
    appliedAmount: roundCurrency(appliedAmount),
    unappliedAmount: roundCurrency(Math.max(remaining, 0)),
  }
}

const applyTransferIntoCard = (card: CardDoc, amount: number) => {
  const balances = getCardWorkingBalances(card)
  return buildCardBalancePatch(balances.statementBalance + amount, balances.pendingCharges)
}

const applyCardMonthlyLifecycle = (card: CardDoc, cycles: number) => {
  let balance = finiteOrZero(card.usedLimit)
  let statementBalance = finiteOrZero(card.statementBalance ?? card.usedLimit)
  let pendingCharges = finiteOrZero(card.pendingCharges)
  const spendPerMonth = finiteOrZero(card.spendPerMonth)
  const minimumPayment = finiteOrZero(card.minimumPayment)
  const minimumPaymentType = normalizeCardMinimumPaymentType(card.minimumPaymentType)
  const minimumPaymentPercent = clampPercent(finiteOrZero(card.minimumPaymentPercent))
  const extraPayment = finiteOrZero(card.extraPayment)
  const apr = finiteOrZero(card.interestRate)
  const monthlyRate = apr > 0 ? apr / 100 / 12 : 0
  let interestAccrued = 0
  let paymentsApplied = 0
  let spendAdded = 0
  let latestStatementBalance = statementBalance

  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const interest = statementBalance * monthlyRate
    interestAccrued += interest
    const dueBalance = statementBalance + interest
    latestStatementBalance = dueBalance
    const paymentPlan = resolveCardPaymentPlan({
      statementBalance,
      dueBalance,
      interestAmount: interest,
      minimumPayment,
      minimumPaymentType,
      minimumPaymentPercent,
      extraPayment,
    })
    const payment = paymentPlan.plannedPayment
    const carriedAfterDue = dueBalance - payment
    paymentsApplied += payment

    pendingCharges += spendPerMonth
    spendAdded += spendPerMonth

    statementBalance = carriedAfterDue + pendingCharges
    balance = statementBalance
    pendingCharges = 0
  }

  return {
    balance: roundCurrency(Math.max(balance, 0)),
    statementBalance: roundCurrency(Math.max(statementBalance, 0)),
    pendingCharges: roundCurrency(Math.max(pendingCharges, 0)),
    dueBalance: roundCurrency(Math.max(latestStatementBalance, 0)),
    interestAccrued: roundCurrency(interestAccrued),
    paymentsApplied: roundCurrency(paymentsApplied),
    spendAdded: roundCurrency(spendAdded),
  }
}

const applyLoanMonthlyLifecycle = (loan: LoanDoc, cycles: number) => {
  const working = getLoanWorkingBalances(loan)
  let principalBalance = working.principalBalance
  let accruedInterest = working.accruedInterest
  const minimumPayment = toMonthlyAmount(
    finiteOrZero(loan.minimumPayment),
    loan.cadence,
    loan.customInterval,
    loan.customUnit,
  )
  const minimumPaymentType = normalizeLoanMinimumPaymentType(loan.minimumPaymentType)
  const minimumPaymentPercent = clampPercent(finiteOrZero(loan.minimumPaymentPercent))
  const extraPayment = toMonthlyAmount(
    finiteOrZero(loan.extraPayment),
    loan.cadence,
    loan.customInterval,
    loan.customUnit,
  )
  const apr = finiteOrZero(loan.interestRate)
  const monthlyRate = apr > 0 ? apr / 100 / 12 : 0
  let interestAccrued = 0
  let paymentsApplied = 0
  let interestPaid = 0
  let principalPaid = 0

  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const balanceBeforeInterest = principalBalance + accruedInterest
    const interest = balanceBeforeInterest * monthlyRate
    accruedInterest += interest
    interestAccrued += interest

    const dueBalance = principalBalance + accruedInterest
    const paymentPlan = resolveLoanPaymentPlan({
      principalBalance,
      accruedInterest,
      dueBalance,
      minimumPayment,
      minimumPaymentType,
      minimumPaymentPercent,
      extraPayment,
    })
    const paymentOutcome = applyPaymentToLoan(
      {
        principalBalance,
        accruedInterest,
      },
      paymentPlan.plannedPayment,
    )

    principalBalance = paymentOutcome.principalBalance
    accruedInterest = paymentOutcome.accruedInterest
    paymentsApplied += paymentOutcome.appliedAmount
    interestPaid += paymentOutcome.interestPayment
    principalPaid += paymentOutcome.principalPayment
  }

  return {
    principalBalance: roundCurrency(Math.max(principalBalance, 0)),
    accruedInterest: roundCurrency(Math.max(accruedInterest, 0)),
    balance: roundCurrency(Math.max(principalBalance + accruedInterest, 0)),
    interestAccrued: roundCurrency(interestAccrued),
    paymentsApplied: roundCurrency(paymentsApplied),
    interestPaid: roundCurrency(interestPaid),
    principalPaid: roundCurrency(principalPaid),
  }
}

const estimateCardMonthlyPayment = (card: CardDoc) => {
  const statementBalance = finiteOrZero(card.statementBalance ?? card.usedLimit)
  const apr = finiteOrZero(card.interestRate)
  const interestAmount = statementBalance * (apr > 0 ? apr / 100 / 12 : 0)
  const dueBalance = statementBalance + interestAmount
  const paymentPlan = resolveCardPaymentPlan({
    statementBalance,
    dueBalance,
    interestAmount,
    minimumPayment: finiteOrZero(card.minimumPayment),
    minimumPaymentType: normalizeCardMinimumPaymentType(card.minimumPaymentType),
    minimumPaymentPercent: clampPercent(finiteOrZero(card.minimumPaymentPercent)),
    extraPayment: finiteOrZero(card.extraPayment),
  })

  return roundCurrency(paymentPlan.plannedPayment)
}

const estimateLoanDuePayment = (loan: LoanDoc) => {
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

  const paymentPlan = resolveLoanPaymentPlan({
    principalBalance: working.principalBalance,
    accruedInterest: working.accruedInterest + interestAmount,
    dueBalance,
    minimumPayment: finiteOrZero(loan.minimumPayment),
    minimumPaymentType: normalizeLoanMinimumPaymentType(loan.minimumPaymentType),
    minimumPaymentPercent: clampPercent(finiteOrZero(loan.minimumPaymentPercent)),
    extraPayment: finiteOrZero(loan.extraPayment),
  })

  return roundCurrency(paymentPlan.plannedPayment)
}

const estimateLoanMonthlyPayment = (loan: LoanDoc) => {
  const duePayment = estimateLoanDuePayment(loan)
  const occurrencesPerMonth = toMonthlyAmount(1, loan.cadence, loan.customInterval, loan.customUnit)

  if (occurrencesPerMonth <= 0) {
    return 0
  }

  return roundCurrency(duePayment * occurrencesPerMonth)
}

const insertLoanEvent = async (
  ctx: MutationCtx,
  args: {
    userId: string
    loanId: Id<'loans'>
    eventType: LoanEventType
    source: LoanEventSource
    amount: number
    principalDelta: number
    interestDelta: number
    resultingBalance: number
    occurredAt: number
    cycleKey?: string
    notes?: string
  },
) => {
  await ctx.db.insert('loanEvents', {
    userId: args.userId,
    loanId: args.loanId,
    eventType: args.eventType,
    source: args.source,
    amount: roundCurrency(args.amount),
    principalDelta: roundCurrency(args.principalDelta),
    interestDelta: roundCurrency(args.interestDelta),
    resultingBalance: roundCurrency(Math.max(args.resultingBalance, 0)),
    occurredAt: args.occurredAt,
    cycleKey: args.cycleKey,
    notes: args.notes,
    createdAt: Date.now(),
  })
}

type CardCycleAggregate = {
  updatedCards: number
  cyclesApplied: number
  interestAccrued: number
  paymentsApplied: number
  spendAdded: number
}

type LoanCycleAggregate = {
  updatedLoans: number
  cyclesApplied: number
  interestAccrued: number
  paymentsApplied: number
}

const runCardMonthlyCycleForUser = async (
  ctx: MutationCtx,
  userId: string,
  now: Date,
  cycleKey: string,
): Promise<CardCycleAggregate> => {
  const cards = await ctx.db
    .query('cards')
    .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId))
    .collect()

  let updatedCards = 0
  let cyclesApplied = 0
  let interestAccrued = 0
  let paymentsApplied = 0
  let spendAdded = 0

  for (const card of cards) {
    const latestCard = await ctx.db.get(card._id)
    if (!latestCard || latestCard.userId !== userId) {
      continue
    }

    const cycleAnchor = typeof latestCard.lastCycleAt === 'number' ? latestCard.lastCycleAt : latestCard.createdAt
    const cycles = countCompletedMonthlyCycles(cycleAnchor, now)

    if (cycles <= 0) {
      continue
    }

    const summary = applyCardMonthlyLifecycle(latestCard, cycles)
    const newCycleDate = addCalendarMonthsKeepingDay(startOfDay(new Date(cycleAnchor)), cycles).getTime()

    await ctx.db.patch(latestCard._id, {
      usedLimit: summary.balance,
      statementBalance: summary.statementBalance,
      pendingCharges: summary.pendingCharges,
      lastCycleAt: newCycleDate,
    })

    const cardToken = sanitizeLedgerToken(latestCard.name)
    const liabilityAccount = `LIABILITY:CARD:${cardToken}`
    const cashAccount = 'ASSET:CASH:UNASSIGNED'

    if (summary.spendAdded > 0) {
      await insertLedgerEntry(ctx, {
        userId,
        entryType: 'cycle_card_spend',
        description: `Card monthly spend: ${latestCard.name}`,
        occurredAt: newCycleDate,
        referenceType: 'card',
        referenceId: String(latestCard._id),
        cycleKey,
        lines: [
          {
            lineType: 'debit',
            accountCode: `EXPENSE:CARD_SPEND:${cardToken}`,
            amount: summary.spendAdded,
          },
          {
            lineType: 'credit',
            accountCode: liabilityAccount,
            amount: summary.spendAdded,
          },
        ],
      })
    }

    if (summary.interestAccrued > 0) {
      await insertLedgerEntry(ctx, {
        userId,
        entryType: 'cycle_card_interest',
        description: `Card monthly interest: ${latestCard.name}`,
        occurredAt: newCycleDate,
        referenceType: 'card',
        referenceId: String(latestCard._id),
        cycleKey,
        lines: [
          {
            lineType: 'debit',
            accountCode: `EXPENSE:CARD_INTEREST:${cardToken}`,
            amount: summary.interestAccrued,
          },
          {
            lineType: 'credit',
            accountCode: liabilityAccount,
            amount: summary.interestAccrued,
          },
        ],
      })
    }

    if (summary.paymentsApplied > 0) {
      await insertLedgerEntry(ctx, {
        userId,
        entryType: 'cycle_card_payment',
        description: `Card monthly payment: ${latestCard.name}`,
        occurredAt: newCycleDate,
        referenceType: 'card',
        referenceId: String(latestCard._id),
        cycleKey,
        lines: [
          {
            lineType: 'debit',
            accountCode: liabilityAccount,
            amount: summary.paymentsApplied,
          },
          {
            lineType: 'credit',
            accountCode: cashAccount,
            amount: summary.paymentsApplied,
          },
        ],
      })
    }

    await recordFinanceAuditEvent(ctx, {
      userId,
      entityType: 'card',
      entityId: String(latestCard._id),
      action: 'monthly_cycle_applied',
      metadata: {
        cycleKey,
        cyclesApplied: cycles,
        summary,
      },
    })

    updatedCards += 1
    cyclesApplied += cycles
    interestAccrued += summary.interestAccrued
    paymentsApplied += summary.paymentsApplied
    spendAdded += summary.spendAdded
  }

  return {
    updatedCards,
    cyclesApplied,
    interestAccrued: roundCurrency(interestAccrued),
    paymentsApplied: roundCurrency(paymentsApplied),
    spendAdded: roundCurrency(spendAdded),
  }
}

const runLoanMonthlyCycleForUser = async (
  ctx: MutationCtx,
  userId: string,
  now: Date,
  cycleKey: string,
  options?: {
    idempotencyKey?: string
    runSource?: CycleRunSource
  },
): Promise<LoanCycleAggregate> => {
  const loans = await ctx.db
    .query('loans')
    .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId))
    .collect()

  let updatedLoans = 0
  let cyclesApplied = 0
  let interestAccrued = 0
  let paymentsApplied = 0

  for (const loan of loans) {
    const latestLoan = await ctx.db.get(loan._id)
    if (!latestLoan || latestLoan.userId !== userId) {
      continue
    }

    const cycleAnchor = typeof latestLoan.lastCycleAt === 'number' ? latestLoan.lastCycleAt : latestLoan.createdAt
    const cycles = countCompletedMonthlyCycles(cycleAnchor, now)

    if (cycles <= 0) {
      continue
    }

    const beforeSnapshot = getLoanAuditSnapshot(latestLoan)
    const summary = applyLoanMonthlyLifecycle(latestLoan, cycles)
    const newCycleDate = addCalendarMonthsKeepingDay(startOfDay(new Date(cycleAnchor)), cycles).getTime()
    const subscriptionCost = roundCurrency(Math.max(finiteOrZero(latestLoan.subscriptionCost), 0))
    const currentSubscriptionOutstanding = getLoanSubscriptionOutstanding(latestLoan)
    const subscriptionDueForCycles = roundCurrency(
      Math.min(currentSubscriptionOutstanding, Math.max(subscriptionCost * cycles, 0)),
    )
    const nextSubscriptionOutstanding = roundCurrency(Math.max(currentSubscriptionOutstanding - subscriptionDueForCycles, 0))
    const nextSubscriptionPaymentCount = getSubscriptionPaymentsRemaining(subscriptionCost, nextSubscriptionOutstanding)
    const totalLoanPaymentsApplied = roundCurrency(summary.paymentsApplied + subscriptionDueForCycles)
    const totalOutstandingAfterCycle = roundCurrency(summary.balance + nextSubscriptionOutstanding)
    const afterSnapshot = buildLoanAuditSnapshot({
      principal: summary.principalBalance,
      interest: summary.accruedInterest,
      subscription: nextSubscriptionOutstanding,
    })

    await ctx.db.patch(latestLoan._id, {
      balance: summary.balance,
      principalBalance: summary.principalBalance,
      accruedInterest: summary.accruedInterest,
      subscriptionOutstanding: nextSubscriptionOutstanding,
      subscriptionPaymentCount: nextSubscriptionPaymentCount,
      lastCycleAt: newCycleDate,
      lastInterestAppliedAt: summary.interestAccrued > 0 ? newCycleDate : latestLoan.lastInterestAppliedAt,
    })

    const loanToken = sanitizeLedgerToken(latestLoan.name)
    const liabilityAccount = `LIABILITY:LOAN:${loanToken}`
    const cashAccount = 'ASSET:CASH:UNASSIGNED'

    if (summary.interestAccrued > 0) {
      await insertLedgerEntry(ctx, {
        userId,
        entryType: 'cycle_loan_interest',
        description: `Loan monthly interest: ${latestLoan.name}`,
        occurredAt: newCycleDate,
        referenceType: 'loan',
        referenceId: String(latestLoan._id),
        cycleKey,
        lines: [
          {
            lineType: 'debit',
            accountCode: `EXPENSE:LOAN_INTEREST:${loanToken}`,
            amount: summary.interestAccrued,
          },
          {
            lineType: 'credit',
            accountCode: liabilityAccount,
            amount: summary.interestAccrued,
          },
        ],
      })

      await insertLoanEvent(ctx, {
        userId,
        loanId: latestLoan._id,
        eventType: 'interest_accrual',
        source: 'monthly_cycle',
        amount: summary.interestAccrued,
        principalDelta: 0,
        interestDelta: summary.interestAccrued,
        resultingBalance: totalOutstandingAfterCycle,
        occurredAt: newCycleDate,
        cycleKey,
        notes: `${cycles} monthly cycle${cycles === 1 ? '' : 's'} applied`,
      })
    }

    if (totalLoanPaymentsApplied > 0) {
      await insertLedgerEntry(ctx, {
        userId,
        entryType: 'cycle_loan_payment',
        description: `Loan monthly payment: ${latestLoan.name}`,
        occurredAt: newCycleDate,
        referenceType: 'loan',
        referenceId: String(latestLoan._id),
        cycleKey,
        lines: [
          {
            lineType: 'debit',
            accountCode: liabilityAccount,
            amount: totalLoanPaymentsApplied,
          },
          {
            lineType: 'credit',
            accountCode: cashAccount,
            amount: totalLoanPaymentsApplied,
          },
        ],
      })

      await insertLoanEvent(ctx, {
        userId,
        loanId: latestLoan._id,
        eventType: 'payment',
        source: 'monthly_cycle',
        amount: totalLoanPaymentsApplied,
        principalDelta: -summary.principalPaid,
        interestDelta: -summary.interestPaid,
        resultingBalance: totalOutstandingAfterCycle,
        occurredAt: newCycleDate,
        cycleKey,
        notes: `${cycles} monthly cycle${cycles === 1 ? '' : 's'} applied${subscriptionDueForCycles > 0 ? ' (subscription included)' : ''}`,
      })
    }

    if (subscriptionDueForCycles > 0) {
      await insertLoanEvent(ctx, {
        userId,
        loanId: latestLoan._id,
        eventType: 'subscription_fee',
        source: 'monthly_cycle',
        amount: subscriptionDueForCycles,
        principalDelta: 0,
        interestDelta: 0,
        resultingBalance: totalOutstandingAfterCycle,
        occurredAt: newCycleDate,
        cycleKey,
        notes: `${cycles} monthly cycle${cycles === 1 ? '' : 's'} subscription schedule`,
      })
    }

    await recordFinanceAuditEvent(ctx, {
      userId,
      entityType: 'loan',
      entityId: String(latestLoan._id),
      action: 'monthly_cycle_applied',
      metadata: {
        cycleKey,
        cyclesApplied: cycles,
        summary,
        subscriptionDueForCycles,
        totalLoanPaymentsApplied,
      },
    })

    await recordLoanCycleAuditEntry(ctx, {
      userId,
      loanId: latestLoan._id,
      mutationType: 'monthly_cycle',
      source: 'monthly_cycle',
      cycleKey,
      idempotencyKey: options?.idempotencyKey,
      amount: totalLoanPaymentsApplied,
      before: beforeSnapshot,
      after: afterSnapshot,
      notes: `${cycles} cycle${cycles === 1 ? '' : 's'} (${options?.runSource ?? 'automatic'})`,
      metadata: {
        runSource: options?.runSource ?? 'automatic',
        cycleKey,
        cyclesApplied: cycles,
        interestAccrued: summary.interestAccrued,
        totalLoanPaymentsApplied,
        subscriptionDueForCycles,
      },
      occurredAt: newCycleDate,
    })

    updatedLoans += 1
    cyclesApplied += cycles
    interestAccrued += summary.interestAccrued
    paymentsApplied += totalLoanPaymentsApplied
  }

  return {
    updatedLoans,
    cyclesApplied,
    interestAccrued: roundCurrency(interestAccrued),
    paymentsApplied: roundCurrency(paymentsApplied),
  }
}

const buildUpcomingCashEvents = (
  incomes: IncomeDoc[],
  bills: BillDoc[],
  cards: CardDoc[],
  loans: LoanDoc[],
  now: Date,
) => {
  const horizonDays = 30
  const events: Array<{
    id: string
    label: string
    type: 'income' | 'bill' | 'card' | 'loan'
    date: string
    amount: number
    daysAway: number
    cadence: Cadence
    customInterval?: number
    customUnit?: CustomCadenceUnit
  }> = []

  incomes.forEach((entry) => {
    const nextDate = nextDateForCadence(
      entry.cadence,
      entry.createdAt,
      now,
      entry.receivedDay,
      entry.customInterval,
      entry.customUnit,
      entry.payDateAnchor,
    )

    if (!nextDate) {
      return
    }

    const daysAway = Math.round((nextDate.getTime() - startOfDay(now).getTime()) / 86400000)
    if (daysAway < 0 || daysAway > horizonDays) {
      return
    }

    events.push({
      id: `income-${entry._id}`,
      label: entry.source,
      type: 'income',
      date: nextDate.toISOString().slice(0, 10),
      amount: resolveIncomeNetAmount(entry),
      daysAway,
      cadence: entry.cadence,
      customInterval: entry.customInterval,
      customUnit: entry.customUnit,
    })
  })

  bills.forEach((entry) => {
    const nextDate = nextDateForCadence(
      entry.cadence,
      entry.createdAt,
      now,
      entry.dueDay,
      entry.customInterval,
      entry.customUnit,
    )

    if (!nextDate) {
      return
    }

    const daysAway = Math.round((nextDate.getTime() - startOfDay(now).getTime()) / 86400000)
    if (daysAway < 0 || daysAway > horizonDays) {
      return
    }

    events.push({
      id: `bill-${entry._id}`,
      label: entry.name,
      type: 'bill',
      date: nextDate.toISOString().slice(0, 10),
      amount: -entry.amount,
      daysAway,
      cadence: entry.cadence,
      customInterval: entry.customInterval,
      customUnit: entry.customUnit,
    })
  })

  cards.forEach((entry) => {
    const nextDate = nextDateForCadence('monthly', entry.createdAt, now, entry.dueDay ?? 21)

    if (!nextDate) {
      return
    }

    const daysAway = Math.round((nextDate.getTime() - startOfDay(now).getTime()) / 86400000)
    if (daysAway < 0 || daysAway > horizonDays) {
      return
    }

    const projectedDue = estimateCardMonthlyPayment(entry)
    if (projectedDue <= 0) {
      return
    }

    events.push({
      id: `card-${entry._id}`,
      label: `${entry.name} due`,
      type: 'card',
      date: nextDate.toISOString().slice(0, 10),
      amount: -projectedDue,
      daysAway,
      cadence: 'monthly',
    })
  })

  loans.forEach((entry) => {
    const nextDate = nextDateForCadence(
      entry.cadence,
      entry.createdAt,
      now,
      entry.dueDay,
      entry.customInterval,
      entry.customUnit,
    )

    if (!nextDate) {
      return
    }

    const daysAway = Math.round((nextDate.getTime() - startOfDay(now).getTime()) / 86400000)
    if (daysAway < 0 || daysAway > horizonDays) {
      return
    }

    events.push({
      id: `loan-${entry._id}`,
      label: `${entry.name} payment`,
      type: 'loan',
      date: nextDate.toISOString().slice(0, 10),
      amount: -(estimateLoanDuePayment(entry) + finiteOrZero(entry.subscriptionCost)),
      daysAway,
      cadence: entry.cadence,
      customInterval: entry.customInterval,
      customUnit: entry.customUnit,
    })
  })

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.daysAway - b.daysAway || a.amount - b.amount)
}

const buildInsights = (args: {
  monthlyIncome: number
  projectedMonthlyNet: number
  cardUtilizationPercent: number
  runwayMonths: number
  goalsFundedPercent: number
  topCategoryShare: number
}): Array<{ id: string; title: string; detail: string; severity: InsightSeverity }> => {
  const insights: Array<{ id: string; title: string; detail: string; severity: InsightSeverity }> = []

  if (args.monthlyIncome <= 0) {
    insights.push({
      id: 'income-missing',
      title: 'Income setup needed',
      detail: 'Add at least one income source to activate forecasting and runway metrics.',
      severity: 'critical',
    })
  }

  if (args.projectedMonthlyNet < 0) {
    insights.push({
      id: 'net-negative',
      title: 'Monthly net is negative',
      detail: 'Bills and card spend are above income. Reduce commitments or increase income inputs.',
      severity: 'critical',
    })
  } else if (args.projectedMonthlyNet > 0) {
    insights.push({
      id: 'net-positive',
      title: 'Positive monthly net',
      detail: 'Current plan projects surplus cash each month. Route this to priorities or goals.',
      severity: 'good',
    })
  }

  if (args.cardUtilizationPercent >= 70) {
    insights.push({
      id: 'utilization-high',
      title: 'High credit utilization',
      detail: 'Utilization above 70% increases risk. Target below 30% for healthier balance usage.',
      severity: 'critical',
    })
  } else if (args.cardUtilizationPercent >= 35) {
    insights.push({
      id: 'utilization-watch',
      title: 'Credit utilization watch',
      detail: 'Utilization is elevated. Small principal reductions can quickly improve flexibility.',
      severity: 'warning',
    })
  } else {
    insights.push({
      id: 'utilization-good',
      title: 'Credit utilization healthy',
      detail: 'Card usage is in a healthy band and supports stronger month-to-month resilience.',
      severity: 'good',
    })
  }

  if (args.runwayMonths < 1) {
    insights.push({
      id: 'runway-critical',
      title: 'Limited cash runway',
      detail: 'Liquid reserves cover less than one month of commitments. Build liquidity buffer next.',
      severity: 'critical',
    })
  } else if (args.runwayMonths < 3) {
    insights.push({
      id: 'runway-warning',
      title: 'Runway can be improved',
      detail: 'Current liquidity covers under three months. Consider increasing reserve allocation.',
      severity: 'warning',
    })
  }

  if (args.topCategoryShare > 45) {
    insights.push({
      id: 'category-concentration',
      title: 'Spending concentration detected',
      detail: 'One category dominates this month. Review transactions to reduce concentration risk.',
      severity: 'warning',
    })
  }

  if (args.goalsFundedPercent >= 75) {
    insights.push({
      id: 'goals-ahead',
      title: 'Goals are progressing fast',
      detail: 'Average goal funding is above 75%. You are ahead of pace on long-term targets.',
      severity: 'good',
    })
  }

  return insights.slice(0, 6)
}

const normalizeFinancePreferenceSnapshot = (input: Partial<FinancePreferenceSnapshot> & { currency: string; locale: string }) => {
  const currency = String(input.currency ?? defaultPreference.currency).trim().toUpperCase()
  const locale = String(input.locale ?? defaultPreference.locale).trim()
  const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : defaultPreference.displayName
  const timezone = typeof input.timezone === 'string' ? input.timezone.trim() : defaultPreference.timezone
  const defaultPurchaseCategory =
    typeof input.defaultPurchaseCategory === 'string' ? input.defaultPurchaseCategory.trim() : defaultPreference.defaultPurchaseCategory
  const billNotesTemplate =
    typeof input.billNotesTemplate === 'string' ? input.billNotesTemplate.trim() : defaultPreference.billNotesTemplate
  const purchaseNotesTemplate =
    typeof input.purchaseNotesTemplate === 'string'
      ? input.purchaseNotesTemplate.trim()
      : defaultPreference.purchaseNotesTemplate

  if (!validateCurrencyCode(currency)) {
    throw new Error('Currency must be a valid ISO 4217 code supported by the runtime.')
  }
  if (!validateLocale(locale)) {
    throw new Error('Locale is not valid.')
  }
  if (timezone && !validateTimeZone(timezone)) {
    throw new Error('Timezone is not valid.')
  }

  validateOptionalText(displayName, 'Display name', 120)
  validateOptionalText(defaultPurchaseCategory, 'Default purchase category', 80)
  validateOptionalText(billNotesTemplate, 'Bill notes template', 2000)
  validateOptionalText(purchaseNotesTemplate, 'Purchase notes template', 2000)

  const dueReminderDays =
    typeof input.dueReminderDays === 'number' && Number.isInteger(input.dueReminderDays)
      ? input.dueReminderDays
      : defaultPreference.dueReminderDays
  if (dueReminderDays < 0 || dueReminderDays > 60) {
    throw new Error('Due reminder days must be an integer between 0 and 60.')
  }

  const monthlyAutomationRunDay =
    typeof input.monthlyAutomationRunDay === 'number' && Number.isInteger(input.monthlyAutomationRunDay)
      ? input.monthlyAutomationRunDay
      : defaultPreference.monthlyAutomationRunDay
  const monthlyAutomationRunHour =
    typeof input.monthlyAutomationRunHour === 'number' && Number.isInteger(input.monthlyAutomationRunHour)
      ? input.monthlyAutomationRunHour
      : defaultPreference.monthlyAutomationRunHour
  const monthlyAutomationRunMinute =
    typeof input.monthlyAutomationRunMinute === 'number' && Number.isInteger(input.monthlyAutomationRunMinute)
      ? input.monthlyAutomationRunMinute
      : defaultPreference.monthlyAutomationRunMinute
  const monthlyAutomationMaxRetries =
    typeof input.monthlyAutomationMaxRetries === 'number' && Number.isInteger(input.monthlyAutomationMaxRetries)
      ? input.monthlyAutomationMaxRetries
      : defaultPreference.monthlyAutomationMaxRetries
  const alertEscalationFailureStreakThreshold =
    typeof input.alertEscalationFailureStreakThreshold === 'number' &&
    Number.isInteger(input.alertEscalationFailureStreakThreshold)
      ? input.alertEscalationFailureStreakThreshold
      : defaultPreference.alertEscalationFailureStreakThreshold
  const alertEscalationFailedStepsThreshold =
    typeof input.alertEscalationFailedStepsThreshold === 'number' &&
    Number.isInteger(input.alertEscalationFailedStepsThreshold)
      ? input.alertEscalationFailedStepsThreshold
      : defaultPreference.alertEscalationFailedStepsThreshold

  validateDayOfMonth(monthlyAutomationRunDay, 'Monthly automation run day')
  if (monthlyAutomationRunHour < 0 || monthlyAutomationRunHour > 23) {
    throw new Error('Monthly automation run hour must be between 0 and 23.')
  }
  if (monthlyAutomationRunMinute < 0 || monthlyAutomationRunMinute > 59) {
    throw new Error('Monthly automation run minute must be between 0 and 59.')
  }
  if (monthlyAutomationMaxRetries < 0 || monthlyAutomationMaxRetries > 10) {
    throw new Error('Monthly automation max retries must be between 0 and 10.')
  }
  if (alertEscalationFailureStreakThreshold < 1 || alertEscalationFailureStreakThreshold > 12) {
    throw new Error('Alert escalation failure streak threshold must be between 1 and 12.')
  }
  if (alertEscalationFailedStepsThreshold < 1 || alertEscalationFailedStepsThreshold > 20) {
    throw new Error('Alert escalation failed steps threshold must be between 1 and 20.')
  }

  const dashboardCardOrder = (() => {
    try {
      return normalizeDashboardCardOrder(
        Array.isArray(input.dashboardCardOrder) ? input.dashboardCardOrder.map((entry) => String(entry)) : undefined,
      ) ?? [...defaultPreference.dashboardCardOrder]
    } catch {
      return [...defaultPreference.dashboardCardOrder]
    }
  })()

  return {
    currency,
    locale,
    displayName,
    timezone: validateTimeZone(timezone) ? timezone : defaultPreference.timezone,
    weekStartDay: isWeekStartDay(input.weekStartDay) ? input.weekStartDay : defaultPreference.weekStartDay,
    defaultMonthPreset: isDefaultMonthPreset(input.defaultMonthPreset)
      ? input.defaultMonthPreset
      : defaultPreference.defaultMonthPreset,
    dueRemindersEnabled:
      typeof input.dueRemindersEnabled === 'boolean' ? input.dueRemindersEnabled : defaultPreference.dueRemindersEnabled,
    dueReminderDays,
    monthlyCycleAlertsEnabled:
      typeof input.monthlyCycleAlertsEnabled === 'boolean'
        ? input.monthlyCycleAlertsEnabled
        : defaultPreference.monthlyCycleAlertsEnabled,
    reconciliationRemindersEnabled:
      typeof input.reconciliationRemindersEnabled === 'boolean'
        ? input.reconciliationRemindersEnabled
        : defaultPreference.reconciliationRemindersEnabled,
    goalAlertsEnabled: typeof input.goalAlertsEnabled === 'boolean' ? input.goalAlertsEnabled : defaultPreference.goalAlertsEnabled,
    defaultBillCategory: isBillCategory(input.defaultBillCategory) ? input.defaultBillCategory : defaultPreference.defaultBillCategory,
    defaultBillScope: isBillScope(input.defaultBillScope) ? input.defaultBillScope : defaultPreference.defaultBillScope,
    defaultPurchaseOwnership: isPurchaseOwnership(input.defaultPurchaseOwnership)
      ? input.defaultPurchaseOwnership
      : defaultPreference.defaultPurchaseOwnership,
    defaultPurchaseCategory,
    billNotesTemplate,
    purchaseNotesTemplate,
    uiDensity: isUiDensity(input.uiDensity) ? input.uiDensity : defaultPreference.uiDensity,
    defaultLandingTab: isAppTabKey(input.defaultLandingTab) ? input.defaultLandingTab : defaultPreference.defaultLandingTab,
    dashboardCardOrder,
    monthlyAutomationEnabled:
      typeof input.monthlyAutomationEnabled === 'boolean'
        ? input.monthlyAutomationEnabled
        : defaultPreference.monthlyAutomationEnabled,
    monthlyAutomationRunDay,
    monthlyAutomationRunHour,
    monthlyAutomationRunMinute,
    monthlyAutomationRetryStrategy: isMonthlyAutomationRetryStrategy(input.monthlyAutomationRetryStrategy)
      ? input.monthlyAutomationRetryStrategy
      : defaultPreference.monthlyAutomationRetryStrategy,
    monthlyAutomationMaxRetries,
    alertEscalationFailureStreakThreshold,
    alertEscalationFailedStepsThreshold,
    planningDefaultVersionKey: isPlanningVersionKey(input.planningDefaultVersionKey)
      ? input.planningDefaultVersionKey
      : defaultPreference.planningDefaultVersionKey,
    planningAutoApplyMode: isPlanningAutoApplyMode(input.planningAutoApplyMode)
      ? input.planningAutoApplyMode
      : defaultPreference.planningAutoApplyMode,
    planningNegativeForecastFallback: isPlanningNegativeForecastFallback(input.planningNegativeForecastFallback)
      ? input.planningNegativeForecastFallback
      : defaultPreference.planningNegativeForecastFallback,
  } satisfies FinancePreferenceSnapshot
}

const financePreferenceSnapshotToDbPatch = (snapshot: FinancePreferenceSnapshot, now: number) => ({
  currency: snapshot.currency,
  locale: snapshot.locale,
  displayName: snapshot.displayName || undefined,
  timezone: snapshot.timezone || undefined,
  weekStartDay: snapshot.weekStartDay,
  defaultMonthPreset: snapshot.defaultMonthPreset,
  dueRemindersEnabled: snapshot.dueRemindersEnabled,
  dueReminderDays: snapshot.dueReminderDays,
  monthlyCycleAlertsEnabled: snapshot.monthlyCycleAlertsEnabled,
  reconciliationRemindersEnabled: snapshot.reconciliationRemindersEnabled,
  goalAlertsEnabled: snapshot.goalAlertsEnabled,
  defaultBillCategory: snapshot.defaultBillCategory,
  defaultBillScope: snapshot.defaultBillScope,
  defaultPurchaseOwnership: snapshot.defaultPurchaseOwnership,
  defaultPurchaseCategory: snapshot.defaultPurchaseCategory || undefined,
  billNotesTemplate: snapshot.billNotesTemplate || undefined,
  purchaseNotesTemplate: snapshot.purchaseNotesTemplate || undefined,
  uiDensity: snapshot.uiDensity,
  defaultLandingTab: snapshot.defaultLandingTab,
  dashboardCardOrder: [...snapshot.dashboardCardOrder],
  monthlyAutomationEnabled: snapshot.monthlyAutomationEnabled,
  monthlyAutomationRunDay: snapshot.monthlyAutomationRunDay,
  monthlyAutomationRunHour: snapshot.monthlyAutomationRunHour,
  monthlyAutomationRunMinute: snapshot.monthlyAutomationRunMinute,
  monthlyAutomationRetryStrategy: snapshot.monthlyAutomationRetryStrategy,
  monthlyAutomationMaxRetries: snapshot.monthlyAutomationMaxRetries,
  alertEscalationFailureStreakThreshold: snapshot.alertEscalationFailureStreakThreshold,
  alertEscalationFailedStepsThreshold: snapshot.alertEscalationFailedStepsThreshold,
  planningDefaultVersionKey: snapshot.planningDefaultVersionKey,
  planningAutoApplyMode: snapshot.planningAutoApplyMode,
  planningNegativeForecastFallback: snapshot.planningNegativeForecastFallback,
  updatedAt: now,
})

const getUserPreference = async (ctx: QueryCtx | MutationCtx, userId: string) => {
  const existing = await ctx.db
    .query('financePreferences')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .first()

  if (!existing) {
    return {
      ...defaultPreference,
      dashboardCardOrder: [...defaultPreference.dashboardCardOrder],
    }
  }

  return normalizeFinancePreferenceSnapshot({
    ...defaultPreference,
    ...existing,
    dashboardCardOrder: (existing.dashboardCardOrder as DashboardCardId[] | undefined) ?? defaultPreference.dashboardCardOrder,
  })
}

const writeFinancePreferenceSnapshotForUser = async (
  ctx: MutationCtx,
  userId: string,
  snapshot: FinancePreferenceSnapshot,
) => {
  const existing = await ctx.db
    .query('financePreferences')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .first()

  const now = Date.now()
  const patch = financePreferenceSnapshotToDbPatch(snapshot, now)

  if (existing) {
    await ctx.db.patch(existing._id, patch)
    return existing._id
  }

  return await ctx.db.insert('financePreferences', {
    userId,
    ...patch,
  })
}

const parseFinancePreferenceSnapshotJson = (json: string, sourceLabel: string): FinancePreferenceSnapshot => {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error(`Invalid settings snapshot JSON (${sourceLabel}).`)
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Settings snapshot must be an object (${sourceLabel}).`)
  }

  const candidate = parsed as Record<string, unknown>
  return normalizeFinancePreferenceSnapshot({
    ...(defaultPreference as FinancePreferenceSnapshot),
    ...(candidate as Partial<FinancePreferenceSnapshot>),
    currency: typeof candidate.currency === 'string' ? candidate.currency : defaultPreference.currency,
    locale: typeof candidate.locale === 'string' ? candidate.locale : defaultPreference.locale,
  })
}

const settingsProfileNameNormalized = (name: string) => name.trim().toLowerCase()

const summarizePreferenceDiffFields = (beforeValue: unknown, afterValue: unknown) => {
  if (!beforeValue || typeof beforeValue !== 'object' || Array.isArray(beforeValue)) {
    return []
  }
  if (!afterValue || typeof afterValue !== 'object' || Array.isArray(afterValue)) {
    return []
  }

  const before = beforeValue as Record<string, unknown>
  const after = afterValue as Record<string, unknown>
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const changed: string[] = []
  for (const key of keys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changed.push(key)
    }
  }
  return changed.sort((left, right) => left.localeCompare(right))
}

function ensureOwned<T extends { userId: string }>(
  record: T | null,
  expectedUserId: string,
  missingError: string,
): asserts record is T {
  if (!record || record.userId !== expectedUserId) {
    throw new Error(missingError)
  }
}

const normalizeGoalType = (value: GoalType | undefined | null): GoalType => {
  if (value === 'emergency_fund' || value === 'debt_payoff' || value === 'big_purchase') {
    return value
  }
  return 'sinking_fund'
}

const normalizeGoalCadenceConfig = (args: {
  cadence?: Cadence
  customInterval?: number
  customUnit?: CustomCadenceUnit
}) => {
  const cadence = args.cadence ?? 'monthly'

  if (cadence === 'custom') {
    if (args.customInterval === undefined) {
      throw new Error('Goal custom interval is required when cadence is Custom.')
    }
    validatePositiveInteger(args.customInterval, 'Goal custom interval', 1200)
    if (args.customUnit === undefined) {
      throw new Error('Goal custom unit is required when cadence is Custom.')
    }

    return {
      cadence,
      customInterval: args.customInterval,
      customUnit: args.customUnit,
    }
  }

  return {
    cadence,
    customInterval: undefined,
    customUnit: undefined,
  }
}

const normalizeGoalContributionAmount = (value: number | undefined | null) => {
  const safe = roundCurrency(Math.max(finiteOrZero(value), 0))
  validateNonNegative(safe, 'Goal planned contribution')
  return safe
}

const normalizeGoalFundingSourceId = (value: string) => {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error('Goal funding source is required.')
  }
  if (trimmed.length > 200) {
    throw new Error('Goal funding source id is too long.')
  }
  return trimmed
}

const normalizeGoalFundingSources = async (
  ctx: MutationCtx,
  userId: string,
  input: GoalFundingSourceMapItem[] | undefined,
) => {
  if (!input || input.length === 0) {
    return [] as GoalFundingSourceMapItem[]
  }

  if (input.length > 8) {
    throw new Error('Goals can have up to 8 funding sources.')
  }

  const normalized: GoalFundingSourceMapItem[] = []
  const seen = new Set<string>()
  let allocationPercentTotal = 0

  for (const entry of input) {
    const sourceId = normalizeGoalFundingSourceId(entry.sourceId)
    const key = `${entry.sourceType}:${sourceId}`
    if (seen.has(key)) {
      throw new Error('Duplicate goal funding source entries are not allowed.')
    }
    seen.add(key)

    let allocationPercent: number | undefined
    if (entry.allocationPercent !== undefined) {
      validateFinite(entry.allocationPercent, 'Goal funding allocation %')
      if (entry.allocationPercent < 0 || entry.allocationPercent > 100) {
        throw new Error('Goal funding allocation % must be between 0 and 100.')
      }
      allocationPercent = roundCurrency(entry.allocationPercent)
      allocationPercentTotal += allocationPercent
    }

    if (entry.sourceType === 'account') {
      const account = await ctx.db.get(sourceId as Id<'accounts'>)
      ensureOwned(account, userId, 'Goal funding account not found.')
    } else if (entry.sourceType === 'card') {
      const card = await ctx.db.get(sourceId as Id<'cards'>)
      ensureOwned(card, userId, 'Goal funding card not found.')
    } else {
      const income = await ctx.db.get(sourceId as Id<'incomes'>)
      ensureOwned(income, userId, 'Goal funding income source not found.')
    }

    normalized.push({
      sourceType: entry.sourceType,
      sourceId,
      allocationPercent,
    })
  }

  if (allocationPercentTotal > 100.000001) {
    throw new Error('Goal funding source allocation % total cannot exceed 100%.')
  }

  return normalized
}

const normalizeGoalPausedState = (goal: GoalDoc) => ({
  paused: goal.paused === true,
  pausedAt: typeof goal.pausedAt === 'number' ? goal.pausedAt : undefined,
  pauseReason: goal.pauseReason?.trim() || undefined,
})

const buildGoalSnapshot = (goal: GoalDoc) => {
  const cadence = goal.cadence ?? 'monthly'
  return {
    title: goal.title,
    targetAmount: roundCurrency(goal.targetAmount),
    currentAmount: roundCurrency(goal.currentAmount),
    targetDate: goal.targetDate,
    priority: goal.priority,
    goalType: normalizeGoalType(goal.goalType),
    contributionAmount: roundCurrency(Math.max(finiteOrZero(goal.contributionAmount), 0)),
    cadence,
    customInterval: cadence === 'custom' ? goal.customInterval ?? null : null,
    customUnit: cadence === 'custom' ? goal.customUnit ?? null : null,
    fundingSources: goal.fundingSources ?? [],
    paused: goal.paused === true,
    pausedAt: typeof goal.pausedAt === 'number' ? goal.pausedAt : null,
    pauseReason: goal.pauseReason ?? null,
  }
}

const insertGoalEvent = async (
  ctx: MutationCtx,
  args: {
    userId: string
    goalId: Id<'goals'>
    eventType: GoalEventType
    source?: GoalEventSource
    amountDelta?: number
    beforeCurrentAmount?: number
    afterCurrentAmount?: number
    beforeTargetAmount?: number
    afterTargetAmount?: number
    beforeTargetDate?: string
    afterTargetDate?: string
    pausedBefore?: boolean
    pausedAfter?: boolean
    metadata?: unknown
    note?: string
    occurredAt?: number
  },
) => {
  const now = Date.now()
  await ctx.db.insert('goalEvents', {
    userId: args.userId,
    goalId: args.goalId,
    eventType: args.eventType,
    source: args.source ?? 'manual',
    amountDelta: args.amountDelta === undefined ? undefined : roundCurrency(args.amountDelta),
    beforeCurrentAmount: args.beforeCurrentAmount === undefined ? undefined : roundCurrency(args.beforeCurrentAmount),
    afterCurrentAmount: args.afterCurrentAmount === undefined ? undefined : roundCurrency(args.afterCurrentAmount),
    beforeTargetAmount: args.beforeTargetAmount === undefined ? undefined : roundCurrency(args.beforeTargetAmount),
    afterTargetAmount: args.afterTargetAmount === undefined ? undefined : roundCurrency(args.afterTargetAmount),
    beforeTargetDate: args.beforeTargetDate,
    afterTargetDate: args.afterTargetDate,
    pausedBefore: args.pausedBefore,
    pausedAfter: args.pausedAfter,
    metadataJson: args.metadata === undefined ? undefined : stringifyForAudit(args.metadata),
    note: args.note?.trim() || undefined,
    occurredAt: args.occurredAt ?? now,
    createdAt: now,
  })
}

const monthKeyFromPurchase = (purchase: Doc<'purchases'>) => {
  if (purchase.statementMonth && /^\d{4}-\d{2}$/.test(purchase.statementMonth)) {
    return purchase.statementMonth
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(purchase.purchaseDate)) {
    return purchase.purchaseDate.slice(0, 7)
  }
  return new Date(purchase.createdAt).toISOString().slice(0, 7)
}

const computePurchaseMonthCloseSummary = (monthKey: string, purchases: Doc<'purchases'>[]): PurchaseMonthCloseSummary => {
  const monthPurchases = purchases.filter((entry) => monthKeyFromPurchase(entry) === monthKey)
  const pending = monthPurchases.filter((entry) => (entry.reconciliationStatus ?? 'posted') === 'pending')
  const posted = monthPurchases.filter((entry) => (entry.reconciliationStatus ?? 'posted') === 'posted')
  const reconciled = monthPurchases.filter((entry) => (entry.reconciliationStatus ?? 'posted') === 'reconciled')
  const cleared = [...posted, ...reconciled]

  const totalAmount = roundCurrency(cleared.reduce((sum, entry) => sum + entry.amount, 0))
  const pendingAmount = roundCurrency(pending.reduce((sum, entry) => sum + entry.amount, 0))
  const missingCategoryCount = monthPurchases.filter((entry) => isGenericCategory(entry.category)).length

  const duplicateMap = new Map<string, number>()
  monthPurchases.forEach((entry) => {
    const key = `${entry.item.trim().toLowerCase()}::${roundCurrency(entry.amount)}::${entry.purchaseDate}`
    duplicateMap.set(key, (duplicateMap.get(key) ?? 0) + 1)
  })
  const duplicateCount = Array.from(duplicateMap.values()).filter((count) => count > 1).length

  const amounts = monthPurchases.map((entry) => entry.amount)
  const mean = amounts.length > 0 ? amounts.reduce((sum, value) => sum + value, 0) / amounts.length : 0
  const variance =
    amounts.length > 1
      ? amounts.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (amounts.length - 1)
      : 0
  const std = Math.sqrt(variance)
  const anomalyCount = monthPurchases.filter((entry) => std > 0 && entry.amount > mean + std * 2.5 && entry.amount > 50).length

  const categoryTotals = new Map<string, number>()
  cleared.forEach((entry) => {
    const key = entry.category.trim() || 'Uncategorized'
    categoryTotals.set(key, (categoryTotals.get(key) ?? 0) + entry.amount)
  })

  const categoryBreakdown = Array.from(categoryTotals.entries())
    .map(([category, total]) => ({
      category,
      total: roundCurrency(total),
      share: totalAmount > 0 ? total / totalAmount : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12)

  return {
    monthKey,
    purchaseCount: monthPurchases.length,
    totalAmount,
    pendingAmount,
    pendingCount: pending.length,
    postedCount: posted.length,
    reconciledCount: reconciled.length,
    duplicateCount,
    anomalyCount,
    missingCategoryCount,
    categoryBreakdown,
  }
}

const resolvePurchaseMonthKey = (inputMonth: string | undefined, fallbackDate: Date) => {
  if (inputMonth) {
    validateStatementMonth(inputMonth, 'Month')
    return inputMonth
  }
  return toCycleKey(fallbackDate)
}

const buildPurchaseAuditSnapshot = (entry: {
  item: string
  amount: number
  category: string
  purchaseDate: string
  reconciliationStatus?: ReconciliationStatus
  statementMonth?: string
  ownership?: PurchaseOwnership
  taxDeductible?: boolean
  fundingSourceType?: PurchaseFundingSourceType
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

const isPurchasePosted = (status?: ReconciliationStatus) => {
  if (!status) {
    return true
  }
  return status !== 'pending'
}

const resolvePurchaseReconciliation = (args: {
  purchaseDate: string
  requestedStatus?: ReconciliationStatus
  requestedStatementMonth?: string
  existing?: Doc<'purchases'>
  now: number
}) => {
  const status = args.requestedStatus ?? args.existing?.reconciliationStatus ?? 'posted'
  const statementMonth = args.requestedStatementMonth ?? args.existing?.statementMonth ?? args.purchaseDate.slice(0, 7)
  validateStatementMonth(statementMonth, 'Statement month')

  if (status === 'pending') {
    return {
      reconciliationStatus: status,
      statementMonth,
      postedAt: undefined,
      reconciledAt: undefined,
    }
  }

  if (status === 'posted') {
    return {
      reconciliationStatus: status,
      statementMonth,
      postedAt: args.existing?.postedAt ?? args.now,
      reconciledAt: undefined,
    }
  }

  return {
    reconciliationStatus: status,
    statementMonth,
    postedAt: args.existing?.postedAt ?? args.now,
    reconciledAt: args.existing?.reconciledAt ?? args.now,
  }
}

type LedgerLineDraft = {
  lineType: LedgerLineType
  accountCode: string
  amount: number
}

const insertLedgerEntry = async (ctx: MutationCtx, args: {
  userId: string
  entryType: LedgerEntryType
  description: string
  occurredAt: number
  referenceType?: string
  referenceId?: string
  cycleKey?: string
  lines: LedgerLineDraft[]
}) => {
  if (args.lines.length < 2) {
    throw new Error('Ledger entries require at least two lines.')
  }

  const debitTotal = args.lines
    .filter((line) => line.lineType === 'debit')
    .reduce((sum, line) => sum + line.amount, 0)
  const creditTotal = args.lines
    .filter((line) => line.lineType === 'credit')
    .reduce((sum, line) => sum + line.amount, 0)

  if (roundCurrency(debitTotal) !== roundCurrency(creditTotal)) {
    throw new Error('Ledger entry is imbalanced.')
  }

  const entryId = await ctx.db.insert('ledgerEntries', {
    userId: args.userId,
    entryType: args.entryType,
    description: args.description,
    occurredAt: args.occurredAt,
    referenceType: args.referenceType,
    referenceId: args.referenceId,
    cycleKey: args.cycleKey,
    createdAt: Date.now(),
  })

  for (const line of args.lines) {
    if (!Number.isFinite(line.amount) || line.amount <= 0) {
      throw new Error('Ledger line amount must be greater than 0.')
    }

    await ctx.db.insert('ledgerLines', {
      userId: args.userId,
      entryId,
      lineType: line.lineType,
      accountCode: line.accountCode,
      amount: roundCurrency(line.amount),
      createdAt: Date.now(),
    })
  }
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

const recordLoanCycleAuditEntry = async (ctx: MutationCtx, args: {
  userId: string
  loanId: Id<'loans'>
  mutationType: LoanMutationType
  source: LoanMutationSource
  before: LoanAuditSnapshot
  after: LoanAuditSnapshot
  amount?: number
  cycleKey?: string
  idempotencyKey?: string
  notes?: string
  metadata?: unknown
  occurredAt?: number
}) => {
  await ctx.db.insert('loanCycleAuditEntries', {
    userId: args.userId,
    loanId: args.loanId,
    mutationType: args.mutationType,
    source: args.source,
    cycleKey: args.cycleKey,
    idempotencyKey: args.idempotencyKey,
    amount: args.amount === undefined ? undefined : roundCurrency(args.amount),
    principalBefore: roundCurrency(args.before.principal),
    interestBefore: roundCurrency(args.before.interest),
    subscriptionBefore: roundCurrency(args.before.subscription),
    totalBefore: roundCurrency(args.before.total),
    principalAfter: roundCurrency(args.after.principal),
    interestAfter: roundCurrency(args.after.interest),
    subscriptionAfter: roundCurrency(args.after.subscription),
    totalAfter: roundCurrency(args.after.total),
    notes: args.notes,
    metadataJson: args.metadata === undefined ? undefined : stringifyForAudit(args.metadata),
    occurredAt: args.occurredAt ?? Date.now(),
    createdAt: Date.now(),
  })
}

const recordCycleStepAlert = async (ctx: MutationCtx, args: {
  userId: string
  cycleKey: string
  source: CycleRunSource
  step: string
  message: string
  severity: CycleStepAlertSeverity
  idempotencyKey?: string
  metadata?: unknown
  occurredAt?: number
}) => {
  await ctx.db.insert('cycleStepAlerts', {
    userId: args.userId,
    cycleKey: args.cycleKey,
    idempotencyKey: args.idempotencyKey,
    source: args.source,
    step: args.step,
    severity: args.severity,
    message: args.message.slice(0, 280),
    metadataJson: args.metadata === undefined ? undefined : stringifyForAudit(args.metadata),
    occurredAt: args.occurredAt ?? Date.now(),
    createdAt: Date.now(),
  })
}

const resolveIncomeDestinationAccountId = async (
  ctx: MutationCtx,
  userId: string,
  destinationAccountId: Id<'accounts'> | undefined,
) => {
  if (!destinationAccountId) {
    return undefined
  }

  const destinationAccount = await ctx.db.get(destinationAccountId)
  ensureOwned(destinationAccount, userId, 'Destination account not found.')
  return destinationAccountId
}

const resolveBillLinkedAccountId = async (
  ctx: MutationCtx,
  userId: string,
  linkedAccountId: Id<'accounts'> | undefined,
) => {
  if (!linkedAccountId) {
    return undefined
  }

  const linkedAccount = await ctx.db.get(linkedAccountId)
  ensureOwned(linkedAccount, userId, 'Linked bill account not found.')
  return linkedAccountId
}

const getPurchaseExpenseAccountCode = (category: string) => `EXPENSE:PURCHASE:${sanitizeLedgerToken(category)}`

const recordPurchaseLedger = async (ctx: MutationCtx, args: {
  userId: string
  entryType: 'purchase' | 'purchase_reversal'
  item: string
  amount: number
  category: string
  purchaseDate: string
  purchaseId: string
}) => {
  const amount = roundCurrency(Math.abs(args.amount))
  if (amount <= 0) {
    return
  }

  const occurredAt = new Date(`${args.purchaseDate}T00:00:00`).getTime()
  const expenseAccount = getPurchaseExpenseAccountCode(args.category)
  const cashAccount = 'ASSET:CASH:UNASSIGNED'
  const isReversal = args.entryType === 'purchase_reversal'

  await insertLedgerEntry(ctx, {
    userId: args.userId,
    entryType: args.entryType,
    description: `${isReversal ? 'Reverse purchase' : 'Purchase'}: ${args.item}`,
    occurredAt,
    referenceType: 'purchase',
    referenceId: args.purchaseId,
    lines: [
      {
        lineType: isReversal ? 'credit' : 'debit',
        accountCode: expenseAccount,
        amount,
      },
      {
        lineType: isReversal ? 'debit' : 'credit',
        accountCode: cashAccount,
        amount,
      },
    ],
  })
}

const computeMonthCloseSnapshotSummary = async (ctx: MutationCtx, userId: string, now: Date) => {
  const [incomes, bills, cards, loans, purchases, accounts] = await Promise.all([
    ctx.db
      .query('incomes')
      .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId))
      .collect(),
    ctx.db
      .query('bills')
      .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId))
      .collect(),
    ctx.db
      .query('cards')
      .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId))
      .collect(),
    ctx.db
      .query('loans')
      .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId))
      .collect(),
    ctx.db
      .query('purchases')
      .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId))
      .collect(),
    ctx.db
      .query('accounts')
      .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId))
      .collect(),
  ])

  const monthlyIncome = incomes.reduce(
    (sum, entry) =>
      sum + toMonthlyAmount(resolveIncomeNetAmount(entry), entry.cadence, entry.customInterval, entry.customUnit),
    0,
  )
  const monthlyBills = bills.reduce(
    (sum, entry) => sum + toMonthlyAmount(entry.amount, entry.cadence, entry.customInterval, entry.customUnit),
    0,
  )
  const monthlyCardSpend = cards.reduce((sum, entry) => sum + estimateCardMonthlyPayment(entry), 0)
  const monthlyLoanBasePayments = loans.reduce(
    (sum, entry) => sum + estimateLoanMonthlyPayment(entry),
    0,
  )
  const monthlyLoanSubscriptionCosts = loans.reduce((sum, entry) => sum + finiteOrZero(entry.subscriptionCost), 0)
  const monthlyCommitments = monthlyBills + monthlyCardSpend + monthlyLoanBasePayments + monthlyLoanSubscriptionCosts

  const cardUsedTotal = cards.reduce((sum, entry) => sum + finiteOrZero(entry.usedLimit), 0)
  const totalLoanBalance = loans.reduce((sum, entry) => sum + getLoanTotalOutstanding(entry), 0)
  const accountDebts = accounts.reduce((sum, entry) => {
    if (entry.type === 'debt') {
      return sum + Math.abs(entry.balance)
    }
    return entry.balance < 0 ? sum + Math.abs(entry.balance) : sum
  }, 0)
  const totalLiabilities = accountDebts + cardUsedTotal + totalLoanBalance

  const totalAssets = accounts.reduce((sum, entry) => {
    if (entry.type === 'debt') {
      return sum
    }
    return sum + Math.max(entry.balance, 0)
  }, 0)
  const assetsByType = accounts.reduce(
    (acc, entry) => {
      const positiveBalance = Math.max(entry.balance, 0)
      if (entry.type === 'checking') acc.checking += positiveBalance
      if (entry.type === 'savings') acc.savings += positiveBalance
      if (entry.type === 'investment') acc.investment += positiveBalance
      if (entry.type === 'cash') acc.cash += positiveBalance
      return acc
    },
    { checking: 0, savings: 0, investment: 0, cash: 0 },
  )

  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthPurchases = purchases.filter((entry) => entry.purchaseDate.startsWith(monthKey))
  const purchasesThisMonth = monthPurchases
    .filter((entry) => isPurchasePosted(entry.reconciliationStatus))
    .reduce((sum, entry) => sum + entry.amount, 0)

  const netWorth = totalAssets + monthlyIncome - totalLiabilities - monthlyCommitments - purchasesThisMonth
  const liquidReserves = accounts.reduce((sum, entry) => {
    if (!entry.liquid) {
      return sum
    }
    return sum + Math.max(entry.balance, 0)
  }, 0)
  const runwayAvailablePool = Math.max(liquidReserves + totalAssets + monthlyIncome, 0)
  const runwayMonthlyPressure = monthlyCommitments + totalLiabilities + purchasesThisMonth
  const runwayMonths = runwayMonthlyPressure > 0 ? runwayAvailablePool / runwayMonthlyPressure : runwayAvailablePool > 0 ? 99 : 0

  return {
    monthlyIncome: roundCurrency(monthlyIncome),
    monthlyCommitments: roundCurrency(monthlyCommitments),
    monthlyBills: roundCurrency(monthlyBills),
    monthlyCardSpend: roundCurrency(monthlyCardSpend),
    monthlyLoanBasePayments: roundCurrency(monthlyLoanBasePayments),
    monthlyLoanSubscriptionCosts: roundCurrency(monthlyLoanSubscriptionCosts),
    assetsChecking: roundCurrency(assetsByType.checking),
    assetsSavings: roundCurrency(assetsByType.savings),
    assetsInvestment: roundCurrency(assetsByType.investment),
    assetsCash: roundCurrency(assetsByType.cash),
    liabilitiesAccountDebt: roundCurrency(accountDebts),
    liabilitiesCards: roundCurrency(cardUsedTotal),
    liabilitiesLoans: roundCurrency(totalLoanBalance),
    totalLiabilities: roundCurrency(totalLiabilities),
    netWorth: roundCurrency(netWorth),
    runwayMonths: roundCurrency(runwayMonths),
  }
}

export const getFinanceData = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity) {
      return {
        isAuthenticated: false,
        updatedAt: Date.now(),
        data: {
          preference: defaultPreference,
          incomes: [],
          incomePaymentChecks: [],
          incomeChangeEvents: [],
          bills: [],
          billPaymentChecks: [],
          subscriptionPriceChanges: [],
          cards: [],
          loans: [],
          loanEvents: [],
          loanCycleAuditEntries: [],
          purchases: [],
          accounts: [],
          accountTransfers: [],
          accountReconciliationChecks: [],
          goals: [],
          goalEvents: [],
          envelopeBudgets: [],
          planningMonthVersions: [],
          planningActionTasks: [],
          cycleAuditLogs: [],
          cycleStepAlerts: [],
          monthlyCycleRuns: [],
          purchaseMonthCloseRuns: [],
          monthCloseSnapshots: [],
          financeAuditEvents: [],
          ledgerEntries: [],
          topCategories: [],
          upcomingCashEvents: [],
          insights: [],
          summary: defaultSummary,
        },
      }
    }

    const [
      preference,
      incomes,
      incomePaymentChecks,
      incomeChangeEvents,
      bills,
      billPaymentChecks,
      subscriptionPriceChanges,
      cards,
      loans,
      loanEvents,
      loanCycleAuditEntries,
      purchases,
      accounts,
      accountTransfers,
      accountReconciliationChecks,
      goals,
      goalEvents,
      envelopeBudgets,
      planningMonthVersions,
      planningActionTasks,
      cycleAuditLogs,
      cycleStepAlerts,
      monthlyCycleRuns,
      purchaseMonthCloseRuns,
      monthCloseSnapshots,
      financeAuditEvents,
      ledgerEntries,
    ] = await Promise.all([
      getUserPreference(ctx, identity.subject),
      ctx.db
        .query('incomes')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .collect(),
      ctx.db
        .query('incomePaymentChecks')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(240),
      ctx.db
        .query('incomeChangeEvents')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(320),
      ctx.db
        .query('bills')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .collect(),
      ctx.db
        .query('billPaymentChecks')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(360),
      ctx.db
        .query('subscriptionPriceChanges')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(720),
      ctx.db
        .query('cards')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .collect(),
      ctx.db
        .query('loans')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .collect(),
      ctx.db
        .query('loanEvents')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(240),
      ctx.db
        .query('loanCycleAuditEntries')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(240),
      ctx.db
        .query('purchases')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .collect(),
      ctx.db
        .query('accounts')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .collect(),
      ctx.db
        .query('accountTransfers')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(300),
      ctx.db
        .query('accountReconciliationChecks')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(360),
      ctx.db
        .query('goals')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .collect(),
      ctx.db
        .query('goalEvents')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(600),
      ctx.db
        .query('envelopeBudgets')
        .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('planningMonthVersions')
        .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('planningActionTasks')
        .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('cycleAuditLogs')
        .withIndex('by_userId_ranAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(20),
      ctx.db
        .query('cycleStepAlerts')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(25),
      ctx.db
        .query('monthlyCycleRuns')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(20),
      ctx.db
        .query('purchaseMonthCloseRuns')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(20),
      ctx.db
        .query('monthCloseSnapshots')
        .withIndex('by_userId_cycleKey', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(12),
      ctx.db
        .query('financeAuditEvents')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(30),
      ctx.db
        .query('ledgerEntries')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(30),
    ])

    const monthlyIncome = incomes.reduce(
      (sum, entry) =>
        sum + toMonthlyAmount(resolveIncomeNetAmount(entry), entry.cadence, entry.customInterval, entry.customUnit),
      0,
    )
    const monthlyBills = bills.reduce(
      (sum, entry) => sum + toMonthlyAmount(entry.amount, entry.cadence, entry.customInterval, entry.customUnit),
      0,
    )
    const monthlyLoanBasePayments = loans.reduce(
      (sum, entry) => sum + estimateLoanMonthlyPayment(entry),
      0,
    )
    const monthlyLoanSubscriptionCosts = loans.reduce((sum, entry) => sum + finiteOrZero(entry.subscriptionCost), 0)
    const monthlyLoanPayments = monthlyLoanBasePayments + monthlyLoanSubscriptionCosts
    const monthlyCardSpend = cards.reduce((sum, entry) => sum + estimateCardMonthlyPayment(entry), 0)
    const monthlyCommitments = monthlyBills + monthlyCardSpend + monthlyLoanPayments

    const cardLimitTotal = cards.reduce((sum, entry) => sum + entry.creditLimit, 0)
    const cardUsedTotal = cards.reduce((sum, entry) => sum + entry.usedLimit, 0)
    const totalLoanBalance = loans.reduce((sum, entry) => sum + getLoanTotalOutstanding(entry), 0)
    const cardUtilizationPercent = cardLimitTotal > 0 ? (cardUsedTotal / cardLimitTotal) * 100 : 0

    const now = new Date()
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const monthPurchases = purchases.filter((entry) => entry.purchaseDate.startsWith(monthKey))
    const pendingMonthPurchases = monthPurchases.filter((entry) => (entry.reconciliationStatus ?? 'posted') === 'pending')
    const postedMonthPurchases = monthPurchases.filter((entry) => (entry.reconciliationStatus ?? 'posted') === 'posted')
    const reconciledMonthPurchases = monthPurchases.filter((entry) => (entry.reconciliationStatus ?? 'posted') === 'reconciled')
    const pendingPurchaseAmountThisMonth = pendingMonthPurchases.reduce((sum, entry) => sum + entry.amount, 0)
    const postedPurchaseAmountThisMonth = postedMonthPurchases.reduce((sum, entry) => sum + entry.amount, 0)
    const reconciledPurchaseAmountThisMonth = reconciledMonthPurchases.reduce((sum, entry) => sum + entry.amount, 0)
    const purchasesThisMonth = postedPurchaseAmountThisMonth + reconciledPurchaseAmountThisMonth
    const pendingPurchases = purchases.filter((entry) => entry.reconciliationStatus === 'pending').length
    const reconciledPurchases = purchases.filter((entry) => entry.reconciliationStatus === 'reconciled').length
    const postedPurchases = purchases.length - pendingPurchases

    const projectedMonthlyNet = monthlyIncome - monthlyCommitments - totalLoanBalance
    const savingsRatePercent = monthlyIncome > 0 ? (projectedMonthlyNet / monthlyIncome) * 100 : 0

    const totalAssets = accounts.reduce((sum, entry) => {
      if (entry.type === 'debt') {
        return sum
      }
      return sum + Math.max(entry.balance, 0)
    }, 0)

    const accountDebts = accounts.reduce((sum, entry) => {
      if (entry.type === 'debt') {
        return sum + Math.abs(entry.balance)
      }
      return entry.balance < 0 ? sum + Math.abs(entry.balance) : sum
    }, 0)

    const totalLiabilities = accountDebts + cardUsedTotal + totalLoanBalance
    const netWorth = totalAssets + monthlyIncome - totalLiabilities - monthlyCommitments - purchasesThisMonth

    const liquidReserves = accounts.reduce((sum, entry) => {
      if (!entry.liquid) {
        return sum
      }
      return sum + Math.max(entry.balance, 0)
    }, 0)

    const runwayAvailablePool = Math.max(liquidReserves + totalAssets + monthlyIncome, 0)
    const runwayMonthlyPressure = monthlyCommitments + totalLiabilities + purchasesThisMonth
    const runwayMonths = runwayMonthlyPressure > 0 ? runwayAvailablePool / runwayMonthlyPressure : runwayAvailablePool > 0 ? 99 : 0

    const goalsFundedPercent =
      goals.length > 0
        ? goals.reduce((sum, goal) => sum + clamp((goal.currentAmount / Math.max(goal.targetAmount, 1)) * 100, 0, 100), 0) /
          goals.length
        : 0

    const savingsComponent = clamp((savingsRatePercent + 10) * 1.8, 0, 40)
    const utilizationComponent = clamp((35 - cardUtilizationPercent) * 0.9, 0, 25)
    const runwayComponent = clamp(runwayMonths * 6, 0, 25)
    const goalsComponent = clamp(goalsFundedPercent * 0.1, 0, 10)
    const healthScore = Math.round(clamp(savingsComponent + utilizationComponent + runwayComponent + goalsComponent, 0, 100))

    const categoryMap = new Map<string, { total: number; count: number }>()
    monthPurchases
      .filter((entry) => isPurchasePosted(entry.reconciliationStatus))
      .forEach((entry) => {
        const current = categoryMap.get(entry.category) ?? { total: 0, count: 0 }
        categoryMap.set(entry.category, {
          total: current.total + entry.amount,
          count: current.count + 1,
        })
      })

    const topCategories = [...categoryMap.entries()]
      .map(([category, value]) => ({
        category,
        total: value.total,
        count: value.count,
        sharePercent: purchasesThisMonth > 0 ? (value.total / purchasesThisMonth) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)

    const upcomingCashEvents = buildUpcomingCashEvents(incomes, bills, cards, loans, now)

    const insights = buildInsights({
      monthlyIncome,
      projectedMonthlyNet,
      cardUtilizationPercent,
      runwayMonths,
      goalsFundedPercent,
      topCategoryShare: topCategories[0]?.sharePercent ?? 0,
    })

    const timestamps = [
      ...incomes.map((entry) => entry.createdAt),
      ...incomePaymentChecks.map((entry) => entry.updatedAt ?? entry.createdAt),
      ...incomeChangeEvents.map((entry) => entry.createdAt),
      ...bills.map((entry) => entry.createdAt),
      ...billPaymentChecks.map((entry) => entry.updatedAt ?? entry.createdAt),
      ...subscriptionPriceChanges.map((entry) => entry.createdAt),
      ...cards.map((entry) => entry.createdAt),
      ...loans.map((entry) => entry.createdAt),
      ...loanEvents.map((entry) => entry.createdAt),
      ...loanCycleAuditEntries.map((entry) => entry.createdAt),
      ...purchases.map((entry) => entry.createdAt),
      ...accounts.map((entry) => entry.createdAt),
      ...accountTransfers.map((entry) => entry.createdAt),
      ...accountReconciliationChecks.map((entry) => entry.updatedAt ?? entry.createdAt),
      ...goals.map((entry) => entry.createdAt),
      ...goalEvents.map((entry) => entry.createdAt),
      ...envelopeBudgets.map((entry) => entry.createdAt),
      ...planningMonthVersions.map((entry) => entry.updatedAt ?? entry.createdAt),
      ...planningActionTasks.map((entry) => entry.updatedAt ?? entry.createdAt),
      ...cycleAuditLogs.map((entry) => entry.createdAt),
      ...cycleStepAlerts.map((entry) => entry.createdAt),
      ...monthlyCycleRuns.map((entry) => entry.createdAt),
      ...purchaseMonthCloseRuns.map((entry) => entry.createdAt),
      ...monthCloseSnapshots.map((entry) => entry.createdAt),
      ...financeAuditEvents.map((entry) => entry.createdAt),
      ...ledgerEntries.map((entry) => entry.createdAt),
    ]

    const updatedAt = timestamps.length > 0 ? Math.max(...timestamps) : Date.now()

    return {
      isAuthenticated: true,
      updatedAt,
      data: {
        preference,
        incomes,
        incomePaymentChecks,
        incomeChangeEvents,
        bills,
        billPaymentChecks,
        subscriptionPriceChanges,
        cards,
        loans,
        loanEvents,
        loanCycleAuditEntries,
        purchases,
        accounts,
        accountTransfers,
        accountReconciliationChecks,
        goals,
        goalEvents,
        envelopeBudgets,
        planningMonthVersions,
        planningActionTasks,
        cycleAuditLogs,
        cycleStepAlerts,
        monthlyCycleRuns,
        purchaseMonthCloseRuns,
        monthCloseSnapshots,
        financeAuditEvents,
        ledgerEntries,
        topCategories,
        upcomingCashEvents,
        insights,
        summary: {
          monthlyIncome,
          monthlyBills,
          monthlyCardSpend,
          monthlyLoanPayments,
          monthlyLoanBasePayments,
          monthlyLoanSubscriptionCosts,
          monthlyCommitments,
          runwayAvailablePool,
          runwayMonthlyPressure,
          cardLimitTotal,
          cardUsedTotal,
          totalLoanBalance,
          cardUtilizationPercent,
          purchasesThisMonth,
          pendingPurchaseAmountThisMonth,
          postedPurchaseAmountThisMonth,
          reconciledPurchaseAmountThisMonth,
          projectedMonthlyNet,
          savingsRatePercent,
          totalAssets,
          totalLiabilities,
          netWorth,
          liquidReserves,
          runwayMonths,
          healthScore,
          goalsFundedPercent,
          pendingPurchases,
          postedPurchases,
          reconciledPurchases,
        },
      },
    }
  },
})

export const getLoanMutationHistoryPage = query({
  args: {
    paginationOpts: paginationOptsValidator,
    loanId: v.optional(v.id('loans')),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    if (args.loanId) {
      const loan = await ctx.db.get(args.loanId)
      ensureOwned(loan, identity.subject, 'Loan record not found.')

      return await ctx.db
        .query('loanCycleAuditEntries')
        .withIndex('by_userId_loanId_createdAt', (q) =>
          q.eq('userId', identity.subject).eq('loanId', args.loanId as Id<'loans'>),
        )
        .order('desc')
        .paginate(args.paginationOpts)
    }

    return await ctx.db
      .query('loanCycleAuditEntries')
      .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
      .order('desc')
      .paginate(args.paginationOpts)
  },
})

export const getLoanHistorySummary = query({
  args: {
    windowDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    const now = Date.now()
    const windowDays = clamp(Math.floor(args.windowDays ?? 90), 7, 3650)
    const windowStart = now - windowDays * 86400000

    if (!identity) {
      return {
        windowDays,
        totalEvents: 0,
        totalPayments: 0,
        totalCharges: 0,
        totalInterest: 0,
        totalSubscriptionFees: 0,
        monthlyCycleMutations: 0,
        failedSteps: 0,
        lastMutationAt: null as number | null,
      }
    }

    const [entries, failedSteps] = await Promise.all([
      ctx.db
        .query('loanCycleAuditEntries')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject).gte('createdAt', windowStart))
        .collect(),
      ctx.db
        .query('cycleStepAlerts')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject).gte('createdAt', windowStart))
        .collect(),
    ])

    const totals = entries.reduce(
      (acc, entry) => {
        const amount = Math.max(finiteOrZero(entry.amount), 0)
        if (entry.mutationType === 'payment' || entry.mutationType === 'monthly_cycle') {
          acc.totalPayments += amount
        }
        if (entry.mutationType === 'charge') {
          acc.totalCharges += amount
        }
        if (entry.mutationType === 'interest_accrual') {
          acc.totalInterest += amount
        }
        if (entry.mutationType === 'subscription_fee') {
          acc.totalSubscriptionFees += amount
        }
        if (entry.mutationType === 'monthly_cycle') {
          acc.monthlyCycleMutations += 1
        }
        acc.lastMutationAt = Math.max(acc.lastMutationAt ?? 0, entry.occurredAt, entry.createdAt)
        return acc
      },
      {
        totalPayments: 0,
        totalCharges: 0,
        totalInterest: 0,
        totalSubscriptionFees: 0,
        monthlyCycleMutations: 0,
        lastMutationAt: null as number | null,
      },
    )

    return {
      windowDays,
      totalEvents: entries.length,
      totalPayments: roundCurrency(totals.totalPayments),
      totalCharges: roundCurrency(totals.totalCharges),
      totalInterest: roundCurrency(totals.totalInterest),
      totalSubscriptionFees: roundCurrency(totals.totalSubscriptionFees),
      monthlyCycleMutations: totals.monthlyCycleMutations,
      failedSteps: failedSteps.length,
      lastMutationAt: totals.lastMutationAt,
    }
  },
})

export const upsertFinancePreference = mutation({
  args: {
    currency: v.string(),
    locale: v.string(),
    displayName: v.optional(v.string()),
    timezone: v.optional(v.string()),
    weekStartDay: v.optional(weekStartDayValidator),
    defaultMonthPreset: v.optional(defaultMonthPresetValidator),
    dueRemindersEnabled: v.optional(v.boolean()),
    dueReminderDays: v.optional(v.number()),
    monthlyCycleAlertsEnabled: v.optional(v.boolean()),
    reconciliationRemindersEnabled: v.optional(v.boolean()),
    goalAlertsEnabled: v.optional(v.boolean()),
    defaultBillCategory: v.optional(billCategoryValidator),
    defaultBillScope: v.optional(billScopeValidator),
    defaultPurchaseOwnership: v.optional(purchaseOwnershipValidator),
    defaultPurchaseCategory: v.optional(v.string()),
    billNotesTemplate: v.optional(v.string()),
    purchaseNotesTemplate: v.optional(v.string()),
    uiDensity: v.optional(uiDensityValidator),
    defaultLandingTab: v.optional(appTabKeyValidator),
    dashboardCardOrder: v.optional(v.array(v.string())),
    monthlyAutomationEnabled: v.optional(v.boolean()),
    monthlyAutomationRunDay: v.optional(v.number()),
    monthlyAutomationRunHour: v.optional(v.number()),
    monthlyAutomationRunMinute: v.optional(v.number()),
    monthlyAutomationRetryStrategy: v.optional(monthlyAutomationRetryStrategyValidator),
    monthlyAutomationMaxRetries: v.optional(v.number()),
    alertEscalationFailureStreakThreshold: v.optional(v.number()),
    alertEscalationFailedStepsThreshold: v.optional(v.number()),
    planningDefaultVersionKey: v.optional(planningVersionKey),
    planningAutoApplyMode: v.optional(planningAutoApplyModeValidator),
    planningNegativeForecastFallback: v.optional(planningNegativeForecastFallbackValidator),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const before = await getUserPreference(ctx, identity.subject)
    const nextSnapshot = normalizeFinancePreferenceSnapshot({
      ...before,
      ...args,
      dashboardCardOrder: (args.dashboardCardOrder as DashboardCardId[] | undefined) ?? before.dashboardCardOrder,
    })

    await writeFinancePreferenceSnapshotForUser(ctx, identity.subject, nextSnapshot)

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'finance_preferences',
      entityId: identity.subject,
      action: 'settings_preferences_upsert',
      before,
      after: nextSnapshot,
      metadata: {
        source: 'settings_tab',
        phase: 'phase3',
      },
    })
  },
})

export const getSettingsPowerData = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      return {
        profiles: [],
        history: [],
      }
    }
    const [profiles, history] = await Promise.all([
      ctx.db
        .query('settingsProfiles')
        .withIndex('by_userId_updatedAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(50),
      ctx.db
        .query('financeAuditEvents')
        .withIndex('by_userId_entityType_createdAt', (q) => q.eq('userId', identity.subject).eq('entityType', 'finance_preferences'))
        .order('desc')
        .take(60),
    ])

    return {
      profiles: profiles.map((profile) => ({
        _id: profile._id,
        name: profile.name,
        description: profile.description ?? '',
        preferenceJson: profile.preferenceJson,
        lastAppliedAt: profile.lastAppliedAt ?? null,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      })),
      history: history.map((event) => {
        let before: unknown = null
        let after: unknown = null
        try {
          before = event.beforeJson ? JSON.parse(event.beforeJson) : null
        } catch {
          before = null
        }
        try {
          after = event.afterJson ? JSON.parse(event.afterJson) : null
        } catch {
          after = null
        }

        let source: string | null = null
        try {
          const metadata = event.metadataJson ? (JSON.parse(event.metadataJson) as Record<string, unknown>) : null
          source = typeof metadata?.source === 'string' ? metadata.source : null
        } catch {
          source = null
        }

        const changedFields = summarizePreferenceDiffFields(before, after)
        return {
          _id: event._id,
          action: event.action,
          source,
          beforeJson: event.beforeJson ?? null,
          afterJson: event.afterJson ?? null,
          changedFields,
          createdAt: event.createdAt,
        }
      }),
    }
  },
})

export const saveSettingsProfile = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    preferenceJson: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const name = args.name.trim()
    const description = args.description?.trim() || undefined
    validateRequiredText(name, 'Profile name')
    validateOptionalText(description, 'Profile description', 240)

    const normalizedName = settingsProfileNameNormalized(name)
    if (normalizedName.length < 2) {
      throw new Error('Profile name must be at least 2 characters.')
    }

    const snapshot = parseFinancePreferenceSnapshotJson(args.preferenceJson, 'settings profile')
    const preferenceJson = stringifyForAudit(snapshot) ?? JSON.stringify(snapshot)
    const now = Date.now()

    const existing = await ctx.db
      .query('settingsProfiles')
      .withIndex('by_userId_nameNormalized', (q) => q.eq('userId', identity.subject).eq('nameNormalized', normalizedName))
      .first()

    if (existing) {
      await ctx.db.patch(existing._id, {
        name,
        nameNormalized: normalizedName,
        description,
        preferenceJson,
        updatedAt: now,
      })
      await recordFinanceAuditEvent(ctx, {
        userId: identity.subject,
        entityType: 'settings_profile',
        entityId: String(existing._id),
        action: 'settings_profile_saved',
        before: {
          name: existing.name,
          description: existing.description ?? '',
          preferenceJson: existing.preferenceJson,
        },
        after: {
          name,
          description: description ?? '',
          preferenceJson,
        },
        metadata: { source: 'settings_tab', mode: 'update' },
      })
      return { profileId: existing._id, mode: 'updated' as const }
    }

    const profileId = await ctx.db.insert('settingsProfiles', {
      userId: identity.subject,
      name,
      nameNormalized: normalizedName,
      description,
      preferenceJson,
      createdAt: now,
      updatedAt: now,
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'settings_profile',
      entityId: String(profileId),
      action: 'settings_profile_saved',
      after: {
        name,
        description: description ?? '',
        preferenceJson,
      },
      metadata: { source: 'settings_tab', mode: 'create' },
    })

    return { profileId, mode: 'created' as const }
  },
})

export const applySettingsProfile = mutation({
  args: { profileId: v.id('settingsProfiles') },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const profile = await ctx.db.get(args.profileId)
    ensureOwned(profile, identity.subject, 'Settings profile not found.')

    const before = await getUserPreference(ctx, identity.subject)
    const nextSnapshot = parseFinancePreferenceSnapshotJson(profile.preferenceJson, `profile ${profile.name}`)
    await writeFinancePreferenceSnapshotForUser(ctx, identity.subject, nextSnapshot)
    const now = Date.now()
    await ctx.db.patch(profile._id, { lastAppliedAt: now, updatedAt: now })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'finance_preferences',
      entityId: identity.subject,
      action: 'settings_profile_applied',
      before,
      after: nextSnapshot,
      metadata: {
        source: 'settings_tab',
        profileId: String(profile._id),
        profileName: profile.name,
      },
    })

    return { ok: true }
  },
})

export const deleteSettingsProfile = mutation({
  args: { profileId: v.id('settingsProfiles') },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const profile = await ctx.db.get(args.profileId)
    ensureOwned(profile, identity.subject, 'Settings profile not found.')

    await ctx.db.delete(profile._id)
    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'settings_profile',
      entityId: String(profile._id),
      action: 'settings_profile_deleted',
      before: {
        name: profile.name,
        description: profile.description ?? '',
      },
      metadata: { source: 'settings_tab' },
    })

    return { ok: true }
  },
})

export const restoreFinancePreferenceSnapshot = mutation({
  args: {
    auditEventId: v.id('financeAuditEvents'),
    target: v.union(v.literal('before'), v.literal('after')),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const event = await ctx.db.get(args.auditEventId)
    ensureOwned(event, identity.subject, 'Settings restore point not found.')
    if (event.entityType !== 'finance_preferences') {
      throw new Error('Selected audit event is not a finance preferences restore point.')
    }

    const snapshotJson = args.target === 'before' ? event.beforeJson : event.afterJson
    if (!snapshotJson) {
      throw new Error(`No ${args.target} snapshot is available for this event.`)
    }

    const before = await getUserPreference(ctx, identity.subject)
    const nextSnapshot = parseFinancePreferenceSnapshotJson(snapshotJson, `audit event ${String(event._id)}`)
    await writeFinancePreferenceSnapshotForUser(ctx, identity.subject, nextSnapshot)

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'finance_preferences',
      entityId: identity.subject,
      action: 'settings_preferences_restored',
      before,
      after: nextSnapshot,
      metadata: {
        source: 'settings_tab',
        restoreFromAuditEventId: String(event._id),
        restoreTarget: args.target,
      },
    })

    return { ok: true }
  },
})

export const addIncome = mutation({
  args: {
    source: v.string(),
    amount: v.number(),
    actualAmount: v.optional(v.number()),
    grossAmount: v.optional(v.number()),
    taxAmount: v.optional(v.number()),
    nationalInsuranceAmount: v.optional(v.number()),
    pensionAmount: v.optional(v.number()),
    cadence: cadenceValidator,
    customInterval: v.optional(v.number()),
    customUnit: v.optional(customCadenceUnitValidator),
    forecastSmoothingEnabled: v.optional(v.boolean()),
    forecastSmoothingMonths: v.optional(v.number()),
    destinationAccountId: v.optional(v.id('accounts')),
    receivedDay: v.optional(v.number()),
    payDateAnchor: v.optional(v.string()),
    employerNote: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.source, 'Income source')
    validateFinite(args.amount, 'Income net amount')
    validateOptionalText(args.employerNote, 'Employer note', 800)
    validateOptionalText(args.notes, 'Notes', 2000)
    if (args.actualAmount !== undefined) {
      validateNonNegative(args.actualAmount, 'Income actual paid amount')
    }
    if (args.grossAmount !== undefined) {
      validateNonNegative(args.grossAmount, 'Income gross amount')
    }
    if (args.taxAmount !== undefined) {
      validateNonNegative(args.taxAmount, 'Income tax deduction')
    }
    if (args.nationalInsuranceAmount !== undefined) {
      validateNonNegative(args.nationalInsuranceAmount, 'Income NI deduction')
    }
    if (args.pensionAmount !== undefined) {
      validateNonNegative(args.pensionAmount, 'Income pension deduction')
    }

    if (args.receivedDay !== undefined && (args.receivedDay < 1 || args.receivedDay > 31)) {
      throw new Error('Received day must be between 1 and 31.')
    }
    if (args.payDateAnchor !== undefined) {
      validateIsoDate(args.payDateAnchor, 'Pay date anchor')
    }

    const deductionTotal = computeIncomeDeductionsTotal(args)
    if (deductionTotal > 0.000001 && args.grossAmount === undefined) {
      throw new Error('Gross amount is required when adding income deductions.')
    }

    if (args.grossAmount !== undefined && deductionTotal > args.grossAmount + 0.000001) {
      throw new Error('Income deductions cannot exceed gross amount.')
    }

    const resolvedNetAmount =
      args.grossAmount !== undefined || deductionTotal > 0
        ? Math.max(args.grossAmount ?? 0 - deductionTotal, 0)
        : Math.max(args.amount, 0)
    validatePositive(resolvedNetAmount, 'Income net amount')
    const payDateAnchor = args.payDateAnchor?.trim() || undefined
    const employerNote = args.employerNote?.trim() || undefined
    const forecastSmoothing = normalizeIncomeForecastSmoothing(
      args.forecastSmoothingEnabled,
      args.forecastSmoothingMonths ?? 6,
    )
    const destinationAccountId = await resolveIncomeDestinationAccountId(
      ctx,
      identity.subject,
      args.destinationAccountId,
    )

    const cadenceDetails = sanitizeCadenceDetails(args.cadence, args.customInterval, args.customUnit)

    const createdIncomeId = await ctx.db.insert('incomes', {
      userId: identity.subject,
      source: args.source.trim(),
      amount: roundCurrency(resolvedNetAmount),
      actualAmount: args.actualAmount !== undefined ? roundCurrency(args.actualAmount) : undefined,
      grossAmount: args.grossAmount,
      taxAmount: args.taxAmount,
      nationalInsuranceAmount: args.nationalInsuranceAmount,
      pensionAmount: args.pensionAmount,
      cadence: args.cadence,
      customInterval: cadenceDetails.customInterval,
      customUnit: cadenceDetails.customUnit,
      forecastSmoothingEnabled: forecastSmoothing.forecastSmoothingEnabled,
      forecastSmoothingMonths: forecastSmoothing.forecastSmoothingMonths,
      destinationAccountId,
      receivedDay: args.receivedDay,
      payDateAnchor,
      employerNote,
      notes: args.notes?.trim() || undefined,
      createdAt: Date.now(),
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'income',
      entityId: String(createdIncomeId),
      action: 'created',
      after: {
        source: args.source.trim(),
        amount: roundCurrency(resolvedNetAmount),
        actualAmount: args.actualAmount !== undefined ? roundCurrency(args.actualAmount) : undefined,
        grossAmount: args.grossAmount,
        taxAmount: args.taxAmount,
        nationalInsuranceAmount: args.nationalInsuranceAmount,
        pensionAmount: args.pensionAmount,
        cadence: args.cadence,
        forecastSmoothingEnabled: forecastSmoothing.forecastSmoothingEnabled,
        forecastSmoothingMonths: forecastSmoothing.forecastSmoothingMonths,
        destinationAccountId: destinationAccountId ? String(destinationAccountId) : undefined,
        payDateAnchor,
        employerNote,
      },
    })
  },
})

export const updateIncome = mutation({
  args: {
    id: v.id('incomes'),
    source: v.string(),
    amount: v.number(),
    actualAmount: v.optional(v.number()),
    grossAmount: v.optional(v.number()),
    taxAmount: v.optional(v.number()),
    nationalInsuranceAmount: v.optional(v.number()),
    pensionAmount: v.optional(v.number()),
    cadence: cadenceValidator,
    customInterval: v.optional(v.number()),
    customUnit: v.optional(customCadenceUnitValidator),
    forecastSmoothingEnabled: v.optional(v.boolean()),
    forecastSmoothingMonths: v.optional(v.number()),
    destinationAccountId: v.optional(v.id('accounts')),
    receivedDay: v.optional(v.number()),
    payDateAnchor: v.optional(v.string()),
    employerNote: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.source, 'Income source')
    validateFinite(args.amount, 'Income net amount')
    validateOptionalText(args.employerNote, 'Employer note', 800)
    validateOptionalText(args.notes, 'Notes', 2000)
    if (args.actualAmount !== undefined) {
      validateNonNegative(args.actualAmount, 'Income actual paid amount')
    }
    if (args.grossAmount !== undefined) {
      validateNonNegative(args.grossAmount, 'Income gross amount')
    }
    if (args.taxAmount !== undefined) {
      validateNonNegative(args.taxAmount, 'Income tax deduction')
    }
    if (args.nationalInsuranceAmount !== undefined) {
      validateNonNegative(args.nationalInsuranceAmount, 'Income NI deduction')
    }
    if (args.pensionAmount !== undefined) {
      validateNonNegative(args.pensionAmount, 'Income pension deduction')
    }

    if (args.receivedDay !== undefined && (args.receivedDay < 1 || args.receivedDay > 31)) {
      throw new Error('Received day must be between 1 and 31.')
    }
    if (args.payDateAnchor !== undefined) {
      validateIsoDate(args.payDateAnchor, 'Pay date anchor')
    }

    const deductionTotal = computeIncomeDeductionsTotal(args)
    if (deductionTotal > 0.000001 && args.grossAmount === undefined) {
      throw new Error('Gross amount is required when adding income deductions.')
    }

    if (args.grossAmount !== undefined && deductionTotal > args.grossAmount + 0.000001) {
      throw new Error('Income deductions cannot exceed gross amount.')
    }

    const resolvedNetAmount =
      args.grossAmount !== undefined || deductionTotal > 0
        ? Math.max(args.grossAmount ?? 0 - deductionTotal, 0)
        : Math.max(args.amount, 0)
    validatePositive(resolvedNetAmount, 'Income net amount')
    const payDateAnchor = args.payDateAnchor?.trim() || undefined
    const employerNote = args.employerNote?.trim() || undefined
    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Income record not found.')
    const forecastSmoothing = normalizeIncomeForecastSmoothing(
      args.forecastSmoothingEnabled ?? existing.forecastSmoothingEnabled ?? false,
      args.forecastSmoothingMonths ?? existing.forecastSmoothingMonths ?? 6,
    )
    const destinationAccountId = await resolveIncomeDestinationAccountId(
      ctx,
      identity.subject,
      args.destinationAccountId,
    )

    const cadenceDetails = sanitizeCadenceDetails(args.cadence, args.customInterval, args.customUnit)

    await ctx.db.patch(args.id, {
      source: args.source.trim(),
      amount: roundCurrency(resolvedNetAmount),
      actualAmount: args.actualAmount !== undefined ? roundCurrency(args.actualAmount) : undefined,
      grossAmount: args.grossAmount,
      taxAmount: args.taxAmount,
      nationalInsuranceAmount: args.nationalInsuranceAmount,
      pensionAmount: args.pensionAmount,
      cadence: args.cadence,
      customInterval: cadenceDetails.customInterval,
      customUnit: cadenceDetails.customUnit,
      forecastSmoothingEnabled: forecastSmoothing.forecastSmoothingEnabled,
      forecastSmoothingMonths: forecastSmoothing.forecastSmoothingMonths,
      destinationAccountId,
      receivedDay: args.receivedDay,
      payDateAnchor,
      employerNote,
      notes: args.notes?.trim() || undefined,
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'income',
      entityId: String(args.id),
      action: 'updated',
      before: {
        source: existing.source,
        amount: existing.amount,
        actualAmount: existing.actualAmount,
        grossAmount: existing.grossAmount,
        taxAmount: existing.taxAmount,
        nationalInsuranceAmount: existing.nationalInsuranceAmount,
        pensionAmount: existing.pensionAmount,
        cadence: existing.cadence,
        forecastSmoothingEnabled: existing.forecastSmoothingEnabled ?? false,
        forecastSmoothingMonths: existing.forecastSmoothingMonths,
        destinationAccountId: existing.destinationAccountId ? String(existing.destinationAccountId) : undefined,
        payDateAnchor: existing.payDateAnchor,
        employerNote: existing.employerNote,
      },
      after: {
        source: args.source.trim(),
        amount: roundCurrency(resolvedNetAmount),
        actualAmount: args.actualAmount !== undefined ? roundCurrency(args.actualAmount) : undefined,
        grossAmount: args.grossAmount,
        taxAmount: args.taxAmount,
        nationalInsuranceAmount: args.nationalInsuranceAmount,
        pensionAmount: args.pensionAmount,
        cadence: args.cadence,
        forecastSmoothingEnabled: forecastSmoothing.forecastSmoothingEnabled,
        forecastSmoothingMonths: forecastSmoothing.forecastSmoothingMonths,
        destinationAccountId: destinationAccountId ? String(destinationAccountId) : undefined,
        payDateAnchor,
        employerNote,
      },
    })
  },
})

export const removeIncome = mutation({
  args: {
    id: v.id('incomes'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Income record not found.')

    const existingPaymentChecks = await ctx.db
      .query('incomePaymentChecks')
      .withIndex('by_userId_incomeId_cycleMonth', (q) => q.eq('userId', identity.subject).eq('incomeId', args.id))
      .collect()

    const existingChangeEvents = await ctx.db
      .query('incomeChangeEvents')
      .withIndex('by_userId_incomeId_effectiveDate', (q) => q.eq('userId', identity.subject).eq('incomeId', args.id))
      .collect()

    await Promise.all(existingPaymentChecks.map((entry) => ctx.db.delete(entry._id)))
    await Promise.all(existingChangeEvents.map((entry) => ctx.db.delete(entry._id)))

    await ctx.db.delete(args.id)

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'income',
      entityId: String(args.id),
      action: 'removed',
      before: {
        source: existing.source,
        amount: existing.amount,
        cadence: existing.cadence,
        employerNote: existing.employerNote,
        removedPaymentChecks: existingPaymentChecks.length,
        removedChangeEvents: existingChangeEvents.length,
      },
    })
  },
})

export const addIncomeChangeEvent = mutation({
  args: {
    incomeId: v.id('incomes'),
    effectiveDate: v.string(),
    newAmount: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateIsoDate(args.effectiveDate, 'Effective date')
    validatePositive(args.newAmount, 'New salary amount')
    validateOptionalText(args.note, 'Change note', 800)

    const todayIso = new Date().toISOString().slice(0, 10)
    if (args.effectiveDate > todayIso) {
      throw new Error('Effective date cannot be in the future.')
    }

    const income = await ctx.db.get(args.incomeId)
    ensureOwned(income, identity.subject, 'Income record not found.')

    const previousAmount = roundCurrency(resolveIncomeNetAmount(income))
    const newAmount = roundCurrency(args.newAmount)
    const deltaAmount = roundCurrency(newAmount - previousAmount)
    const direction = resolveIncomeChangeDirection(deltaAmount)

    const deductionTotal = computeIncomeDeductionsTotal(income)
    const hasBreakdown = finiteOrZero(income.grossAmount) > 0 || deductionTotal > 0

    await ctx.db.patch(args.incomeId, {
      amount: newAmount,
      grossAmount: hasBreakdown ? roundCurrency(newAmount + deductionTotal) : income.grossAmount,
    })

    const createdId = await ctx.db.insert('incomeChangeEvents', {
      userId: identity.subject,
      incomeId: args.incomeId,
      effectiveDate: args.effectiveDate,
      previousAmount,
      newAmount,
      deltaAmount,
      direction,
      note: args.note?.trim() || undefined,
      createdAt: Date.now(),
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'income_change_event',
      entityId: String(createdId),
      action: 'created',
      after: {
        incomeId: String(args.incomeId),
        effectiveDate: args.effectiveDate,
        previousAmount,
        newAmount,
        deltaAmount,
        direction,
        note: args.note?.trim() || undefined,
      },
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'income',
      entityId: String(args.incomeId),
      action: 'change_tracked',
      metadata: {
        effectiveDate: args.effectiveDate,
        previousAmount,
        newAmount,
        deltaAmount,
        direction,
      },
    })

    return {
      id: createdId,
      direction,
      deltaAmount,
    }
  },
})

export const removeIncomeChangeEvent = mutation({
  args: {
    id: v.id('incomeChangeEvents'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Income change event not found.')

    await ctx.db.delete(args.id)

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'income_change_event',
      entityId: String(args.id),
      action: 'removed',
      before: {
        incomeId: String(existing.incomeId),
        effectiveDate: existing.effectiveDate,
        previousAmount: existing.previousAmount,
        newAmount: existing.newAmount,
        deltaAmount: existing.deltaAmount,
        direction: existing.direction,
        note: existing.note,
      },
    })
  },
})

const upsertIncomePaymentCheckRecord = async (
  ctx: MutationCtx,
  args: {
    userId: string
    input: {
      incomeId: Id<'incomes'>
      cycleMonth: string
      status: IncomePaymentStatus
      receivedDay?: number
      receivedAmount?: number
      paymentReference?: string
      payslipReference?: string
      note?: string
    }
    metadata?: unknown
  },
) => {
  const cycleMonth = args.input.cycleMonth.trim()
  validateStatementMonth(cycleMonth, 'Cycle month')
  validateOptionalText(args.input.paymentReference, 'Payment reference', 120)
  validateOptionalText(args.input.payslipReference, 'Payslip reference', 120)
  validateOptionalText(args.input.note, 'Payment note', 800)

  if (args.input.receivedDay !== undefined) {
    validateDayOfMonth(args.input.receivedDay, 'Received day')
  }
  if (args.input.receivedAmount !== undefined) {
    validateNonNegative(args.input.receivedAmount, 'Received amount')
  }

  if (args.input.status === 'missed' && (args.input.receivedDay !== undefined || args.input.receivedAmount !== undefined)) {
    throw new Error('Missed payments cannot include received day or amount.')
  }

  const income = await ctx.db.get(args.input.incomeId)
  ensureOwned(income, args.userId, 'Income record not found.')

  const expectedDay = income.receivedDay
  const normalizedStatus: IncomePaymentStatus =
    args.input.status === 'on_time' &&
    expectedDay !== undefined &&
    args.input.receivedDay !== undefined &&
    args.input.receivedDay > expectedDay
      ? 'late'
      : args.input.status

  const now = Date.now()
  const expectedAmount = roundCurrency(resolveIncomeNetAmount(income))
  const existing = await ctx.db
    .query('incomePaymentChecks')
    .withIndex('by_userId_incomeId_cycleMonth', (q) =>
      q.eq('userId', args.userId).eq('incomeId', args.input.incomeId).eq('cycleMonth', cycleMonth),
    )
    .first()

  const nextData = {
    cycleMonth,
    status: normalizedStatus,
    expectedDay,
    receivedDay: args.input.status === 'missed' ? undefined : args.input.receivedDay,
    expectedAmount,
    receivedAmount: args.input.status === 'missed' ? undefined : args.input.receivedAmount,
    paymentReference: args.input.status === 'missed' ? undefined : args.input.paymentReference?.trim() || undefined,
    payslipReference: args.input.status === 'missed' ? undefined : args.input.payslipReference?.trim() || undefined,
    note: args.input.note?.trim() || undefined,
    updatedAt: now,
  }

  if (existing) {
    await ctx.db.patch(existing._id, nextData)

    await recordFinanceAuditEvent(ctx, {
      userId: args.userId,
      entityType: 'income_payment_check',
      entityId: String(existing._id),
      action: 'updated',
      before: {
        cycleMonth: existing.cycleMonth,
        status: existing.status,
        receivedDay: existing.receivedDay,
        receivedAmount: existing.receivedAmount,
        paymentReference: existing.paymentReference,
        payslipReference: existing.payslipReference,
        note: existing.note,
      },
      after: nextData,
      metadata: args.metadata,
    })

    return {
      id: existing._id,
      status: normalizedStatus,
      action: 'updated' as const,
      lateNormalized: normalizedStatus === 'late' && args.input.status === 'on_time',
    }
  }

  const createdId = await ctx.db.insert('incomePaymentChecks', {
    userId: args.userId,
    incomeId: args.input.incomeId,
    createdAt: now,
    ...nextData,
  })

  await recordFinanceAuditEvent(ctx, {
    userId: args.userId,
    entityType: 'income_payment_check',
    entityId: String(createdId),
    action: 'created',
    after: {
      incomeId: String(args.input.incomeId),
      ...nextData,
    },
    metadata: args.metadata,
  })

  return {
    id: createdId,
    status: normalizedStatus,
    action: 'created' as const,
    lateNormalized: normalizedStatus === 'late' && args.input.status === 'on_time',
  }
}

export const upsertIncomePaymentCheck = mutation({
  args: {
    incomeId: v.id('incomes'),
    cycleMonth: v.string(),
    status: incomePaymentStatusValidator,
    receivedDay: v.optional(v.number()),
    receivedAmount: v.optional(v.number()),
    paymentReference: v.optional(v.string()),
    payslipReference: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const result = await upsertIncomePaymentCheckRecord(ctx, {
      userId: identity.subject,
      input: args,
      metadata: { mode: 'single' },
    })

    return {
      id: result.id,
      status: result.status,
    }
  },
})

export const bulkUpsertIncomePaymentChecks = mutation({
  args: {
    cycleMonth: v.string(),
    entries: v.array(
      v.object({
        incomeId: v.id('incomes'),
        status: incomePaymentStatusValidator,
        receivedDay: v.optional(v.number()),
        receivedAmount: v.optional(v.number()),
        paymentReference: v.optional(v.string()),
        payslipReference: v.optional(v.string()),
        note: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    validateStatementMonth(args.cycleMonth, 'Cycle month')

    if (args.entries.length === 0) {
      throw new Error('Add at least one income entry for bulk import.')
    }
    if (args.entries.length > 200) {
      throw new Error('Bulk import supports up to 200 entries per run.')
    }

    const seenIncomeIds = new Set<string>()
    args.entries.forEach((entry) => {
      const key = String(entry.incomeId)
      if (seenIncomeIds.has(key)) {
        throw new Error('Bulk import cannot include the same income source more than once.')
      }
      seenIncomeIds.add(key)
    })

    const batchId = `bulk-${Date.now()}-${Math.floor(Math.random() * 100000)}`
    const results = []
    for (let index = 0; index < args.entries.length; index += 1) {
      const entry = args.entries[index]
      const result = await upsertIncomePaymentCheckRecord(ctx, {
        userId: identity.subject,
        input: {
          ...entry,
          cycleMonth: args.cycleMonth,
        },
        metadata: {
          mode: 'bulk',
          batchId,
          row: index + 1,
          totalRows: args.entries.length,
        },
      })
      results.push(result)
    }

    const createdCount = results.filter((entry) => entry.action === 'created').length
    const updatedCount = results.filter((entry) => entry.action === 'updated').length
    const normalizedLateCount = results.filter((entry) => entry.lateNormalized).length

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'income_payment_check_bulk',
      entityId: batchId,
      action: 'upserted',
      metadata: {
        cycleMonth: args.cycleMonth,
        rowCount: args.entries.length,
        createdCount,
        updatedCount,
        normalizedLateCount,
      },
    })

    return {
      batchId,
      cycleMonth: args.cycleMonth,
      rowCount: args.entries.length,
      createdCount,
      updatedCount,
      normalizedLateCount,
    }
  },
})

export const removeIncomePaymentCheck = mutation({
  args: {
    id: v.id('incomePaymentChecks'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Income payment record not found.')

    await ctx.db.delete(args.id)

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'income_payment_check',
      entityId: String(args.id),
      action: 'removed',
      before: {
        incomeId: String(existing.incomeId),
        cycleMonth: existing.cycleMonth,
        status: existing.status,
        receivedDay: existing.receivedDay,
        receivedAmount: existing.receivedAmount,
        paymentReference: existing.paymentReference,
        payslipReference: existing.payslipReference,
      },
    })
  },
})

const upsertBillPaymentCheckRecord = async (
  ctx: MutationCtx,
  args: {
    userId: string
    input: {
      billId: Id<'bills'>
      cycleMonth: string
      expectedAmount: number
      actualAmount?: number
      paidDay?: number
      note?: string
    }
    metadata?: unknown
  },
) => {
  const cycleMonth = args.input.cycleMonth.trim()
  validateStatementMonth(cycleMonth, 'Cycle month')
  validatePositive(args.input.expectedAmount, 'Planned amount')
  validateOptionalText(args.input.note, 'Bill cycle note', 800)

  if (args.input.actualAmount !== undefined) {
    validateNonNegative(args.input.actualAmount, 'Actual paid amount')
  }
  if (args.input.paidDay !== undefined) {
    validateDayOfMonth(args.input.paidDay, 'Paid day')
  }

  const bill = await ctx.db.get(args.input.billId)
  ensureOwned(bill, args.userId, 'Bill record not found.')

  const expectedAmount = roundCurrency(args.input.expectedAmount)
  const actualAmount =
    args.input.actualAmount === undefined ? undefined : roundCurrency(Math.max(args.input.actualAmount, 0))
  const varianceAmount = actualAmount === undefined ? undefined : roundCurrency(actualAmount - expectedAmount)
  const note = args.input.note?.trim() || undefined
  const now = Date.now()

  const existing = await ctx.db
    .query('billPaymentChecks')
    .withIndex('by_userId_billId_cycleMonth', (q) =>
      q.eq('userId', args.userId).eq('billId', args.input.billId).eq('cycleMonth', cycleMonth),
    )
    .first()

  const nextData = {
    cycleMonth,
    expectedAmount,
    actualAmount,
    varianceAmount,
    paidDay: args.input.paidDay,
    note,
    updatedAt: now,
  }

  if (existing) {
    await ctx.db.patch(existing._id, nextData)

    await recordFinanceAuditEvent(ctx, {
      userId: args.userId,
      entityType: 'bill_payment_check',
      entityId: String(existing._id),
      action: 'updated',
      before: {
        billId: String(existing.billId),
        cycleMonth: existing.cycleMonth,
        expectedAmount: existing.expectedAmount,
        actualAmount: existing.actualAmount,
        varianceAmount: existing.varianceAmount,
        paidDay: existing.paidDay,
        note: existing.note,
      },
      after: {
        billId: String(args.input.billId),
        ...nextData,
      },
      metadata: args.metadata,
    })

    return {
      id: existing._id,
      action: 'updated' as const,
    }
  }

  const createdId = await ctx.db.insert('billPaymentChecks', {
    userId: args.userId,
    billId: args.input.billId,
    createdAt: now,
    ...nextData,
  })

  await recordFinanceAuditEvent(ctx, {
    userId: args.userId,
    entityType: 'bill_payment_check',
    entityId: String(createdId),
    action: 'created',
    after: {
      billId: String(args.input.billId),
      ...nextData,
    },
    metadata: args.metadata,
  })

  return {
    id: createdId,
    action: 'created' as const,
  }
}

export const upsertBillPaymentCheck = mutation({
  args: {
    billId: v.id('bills'),
    cycleMonth: v.string(),
    expectedAmount: v.number(),
    actualAmount: v.optional(v.number()),
    paidDay: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const result = await upsertBillPaymentCheckRecord(ctx, {
      userId: identity.subject,
      input: args,
      metadata: {
        mode: 'single',
      },
    })

    return {
      id: result.id,
      action: result.action,
    }
  },
})

export const removeBillPaymentCheck = mutation({
  args: {
    id: v.id('billPaymentChecks'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Bill cycle record not found.')

    await ctx.db.delete(args.id)

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'bill_payment_check',
      entityId: String(args.id),
      action: 'removed',
      before: {
        billId: String(existing.billId),
        cycleMonth: existing.cycleMonth,
        expectedAmount: existing.expectedAmount,
        actualAmount: existing.actualAmount,
        varianceAmount: existing.varianceAmount,
        paidDay: existing.paidDay,
        note: existing.note,
      },
    })
  },
})

export const addBill = mutation({
  args: {
    name: v.string(),
    amount: v.number(),
    dueDay: v.number(),
    cadence: cadenceValidator,
    customInterval: v.optional(v.number()),
    customUnit: v.optional(customCadenceUnitValidator),
    category: v.optional(billCategoryValidator),
    scope: v.optional(billScopeValidator),
    deductible: v.optional(v.boolean()),
    isSubscription: v.optional(v.boolean()),
    cancelReminderDays: v.optional(v.number()),
    linkedAccountId: v.optional(v.id('accounts')),
    autopay: v.boolean(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.name, 'Bill name')
    validatePositive(args.amount, 'Bill amount')
    validateOptionalText(args.notes, 'Notes', 2000)

    if (args.dueDay < 1 || args.dueDay > 31) {
      throw new Error('Due day must be between 1 and 31.')
    }

    const cadenceDetails = sanitizeCadenceDetails(args.cadence, args.customInterval, args.customUnit)
    const subscriptionDetails = sanitizeSubscriptionDetails(args.isSubscription, args.cancelReminderDays)
    const billTagging = sanitizeBillTagging(args.category, args.scope, args.deductible)
    const linkedAccountId = await resolveBillLinkedAccountId(ctx, identity.subject, args.linkedAccountId)

    const createdBillId = await ctx.db.insert('bills', {
      userId: identity.subject,
      name: args.name.trim(),
      amount: args.amount,
      dueDay: args.dueDay,
      cadence: args.cadence,
      customInterval: cadenceDetails.customInterval,
      customUnit: cadenceDetails.customUnit,
      category: billTagging.category,
      scope: billTagging.scope,
      deductible: billTagging.deductible,
      isSubscription: subscriptionDetails.isSubscription,
      cancelReminderDays: subscriptionDetails.cancelReminderDays,
      linkedAccountId,
      autopay: args.autopay,
      notes: args.notes?.trim() || undefined,
      createdAt: Date.now(),
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'bill',
      entityId: String(createdBillId),
      action: 'created',
      after: {
        name: args.name.trim(),
        amount: args.amount,
        dueDay: args.dueDay,
        cadence: args.cadence,
        category: billTagging.category,
        scope: billTagging.scope,
        deductible: billTagging.deductible,
        isSubscription: subscriptionDetails.isSubscription,
        cancelReminderDays: subscriptionDetails.cancelReminderDays,
        linkedAccountId: linkedAccountId ? String(linkedAccountId) : undefined,
      },
    })
  },
})

export const updateBill = mutation({
  args: {
    id: v.id('bills'),
    name: v.string(),
    amount: v.number(),
    dueDay: v.number(),
    cadence: cadenceValidator,
    customInterval: v.optional(v.number()),
    customUnit: v.optional(customCadenceUnitValidator),
    category: v.optional(billCategoryValidator),
    scope: v.optional(billScopeValidator),
    deductible: v.optional(v.boolean()),
    isSubscription: v.optional(v.boolean()),
    cancelReminderDays: v.optional(v.number()),
    linkedAccountId: v.optional(v.id('accounts')),
    autopay: v.boolean(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.name, 'Bill name')
    validatePositive(args.amount, 'Bill amount')
    validateOptionalText(args.notes, 'Notes', 2000)

    if (args.dueDay < 1 || args.dueDay > 31) {
      throw new Error('Due day must be between 1 and 31.')
    }

    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Bill record not found.')

    const cadenceDetails = sanitizeCadenceDetails(args.cadence, args.customInterval, args.customUnit)
    const subscriptionDetails = sanitizeSubscriptionDetails(args.isSubscription, args.cancelReminderDays)
    const billTagging = sanitizeBillTagging(
      args.category ?? (existing.category as BillCategory | undefined),
      args.scope ?? (existing.scope as BillScope | undefined),
      args.deductible ?? existing.deductible,
    )
    const linkedAccountId = await resolveBillLinkedAccountId(ctx, identity.subject, args.linkedAccountId)

    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      amount: args.amount,
      dueDay: args.dueDay,
      cadence: args.cadence,
      customInterval: cadenceDetails.customInterval,
      customUnit: cadenceDetails.customUnit,
      category: billTagging.category,
      scope: billTagging.scope,
      deductible: billTagging.deductible,
      isSubscription: subscriptionDetails.isSubscription,
      cancelReminderDays: subscriptionDetails.cancelReminderDays,
      linkedAccountId,
      autopay: args.autopay,
      notes: args.notes?.trim() || undefined,
    })

    const wasSubscription = existing.isSubscription === true
    const isSubscription = subscriptionDetails.isSubscription
    if ((wasSubscription || isSubscription) && Math.abs(existing.amount - args.amount) > 0.005) {
      await ctx.db.insert('subscriptionPriceChanges', {
        userId: identity.subject,
        billId: args.id,
        previousAmount: roundCurrency(existing.amount),
        newAmount: roundCurrency(args.amount),
        effectiveDate: new Date().toISOString().slice(0, 10),
        note: undefined,
        createdAt: Date.now(),
      })
    }

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'bill',
      entityId: String(args.id),
      action: 'updated',
      before: {
        name: existing.name,
        amount: existing.amount,
        dueDay: existing.dueDay,
        cadence: existing.cadence,
        category: existing.category ?? 'other',
        scope: existing.scope ?? 'shared',
        deductible: existing.deductible ?? false,
        isSubscription: existing.isSubscription ?? false,
        cancelReminderDays: existing.cancelReminderDays,
        linkedAccountId: existing.linkedAccountId ? String(existing.linkedAccountId) : undefined,
      },
      after: {
        name: args.name.trim(),
        amount: args.amount,
        dueDay: args.dueDay,
        cadence: args.cadence,
        category: billTagging.category,
        scope: billTagging.scope,
        deductible: billTagging.deductible,
        isSubscription: subscriptionDetails.isSubscription,
        cancelReminderDays: subscriptionDetails.cancelReminderDays,
        linkedAccountId: linkedAccountId ? String(linkedAccountId) : undefined,
      },
    })
  },
})

export const resolveBillDuplicateOverlap = mutation({
  args: {
    primaryBillId: v.id('bills'),
    secondaryBillId: v.id('bills'),
    resolution: billOverlapResolutionValidator,
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    if (args.primaryBillId === args.secondaryBillId) {
      throw new Error('Primary and secondary bill must be different.')
    }

    const [primary, secondary] = await Promise.all([ctx.db.get(args.primaryBillId), ctx.db.get(args.secondaryBillId)])
    ensureOwned(primary, identity.subject, 'Primary bill not found.')
    ensureOwned(secondary, identity.subject, 'Secondary bill not found.')

    const primaryBillId = String(primary._id)
    const secondaryBillId = String(secondary._id)

    if (args.resolution === 'mark_intentional') {
      const primaryNotes = appendUniqueNoteMarker(primary.notes, buildIntentionalOverlapMarker(secondaryBillId))
      const secondaryNotes = appendUniqueNoteMarker(secondary.notes, buildIntentionalOverlapMarker(primaryBillId))
      await Promise.all([
        ctx.db.patch(primary._id, { notes: primaryNotes }),
        ctx.db.patch(secondary._id, { notes: secondaryNotes }),
      ])

      await Promise.all([
        recordFinanceAuditEvent(ctx, {
          userId: identity.subject,
          entityType: 'bill',
          entityId: primaryBillId,
          action: 'overlap_marked_intentional',
          metadata: {
            pairedBillId: secondaryBillId,
          },
        }),
        recordFinanceAuditEvent(ctx, {
          userId: identity.subject,
          entityType: 'bill',
          entityId: secondaryBillId,
          action: 'overlap_marked_intentional',
          metadata: {
            pairedBillId: primaryBillId,
          },
        }),
      ])

      return {
        resolution: args.resolution,
        primaryBillId,
        secondaryBillId,
      }
    }

    if (args.resolution === 'archive_duplicate') {
      const nextSecondaryName = secondary.name.toLowerCase().startsWith('archived - ')
        ? secondary.name
        : `Archived - ${secondary.name}`
      const archivedNotes = appendUniqueNoteMarker(
        appendUniqueNoteMarker(secondary.notes, archivedDuplicateNoteMarker),
        buildDuplicateOfMarker(primaryBillId),
      )

      await ctx.db.patch(secondary._id, {
        name: nextSecondaryName,
        cadence: 'one_time',
        customInterval: undefined,
        customUnit: undefined,
        autopay: false,
        linkedAccountId: undefined,
        isSubscription: false,
        cancelReminderDays: undefined,
        notes: archivedNotes,
      })

      await recordFinanceAuditEvent(ctx, {
        userId: identity.subject,
        entityType: 'bill',
        entityId: secondaryBillId,
        action: 'duplicate_archived',
        metadata: {
          primaryBillId,
        },
      })

      return {
        resolution: args.resolution,
        primaryBillId,
        secondaryBillId,
      }
    }

    const [primaryChecks, secondaryChecks, secondaryPriceChanges] = await Promise.all([
      ctx.db
        .query('billPaymentChecks')
        .withIndex('by_userId_billId_cycleMonth', (q) => q.eq('userId', identity.subject).eq('billId', primary._id))
        .collect(),
      ctx.db
        .query('billPaymentChecks')
        .withIndex('by_userId_billId_cycleMonth', (q) => q.eq('userId', identity.subject).eq('billId', secondary._id))
        .collect(),
      ctx.db
        .query('subscriptionPriceChanges')
        .withIndex('by_userId_billId_createdAt', (q) => q.eq('userId', identity.subject).eq('billId', secondary._id))
        .collect(),
    ])

    const primaryChecksByCycle = new Set(primaryChecks.map((entry) => entry.cycleMonth))
    let movedCycleLogCount = 0

    for (const entry of secondaryChecks) {
      if (primaryChecksByCycle.has(entry.cycleMonth)) {
        continue
      }

      await ctx.db.insert('billPaymentChecks', {
        userId: identity.subject,
        billId: primary._id,
        cycleMonth: entry.cycleMonth,
        expectedAmount: entry.expectedAmount,
        actualAmount: entry.actualAmount,
        varianceAmount: entry.varianceAmount,
        paidDay: entry.paidDay,
        note: entry.note,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      })
      movedCycleLogCount += 1
    }

    for (const entry of secondaryPriceChanges) {
      await ctx.db.insert('subscriptionPriceChanges', {
        userId: identity.subject,
        billId: primary._id,
        previousAmount: entry.previousAmount,
        newAmount: entry.newAmount,
        effectiveDate: entry.effectiveDate,
        note: entry.note,
        createdAt: entry.createdAt,
      })
    }

    const mergedNotes = appendUniqueNoteMarker(primary.notes, buildMergedFromMarker(secondaryBillId))
    const nextIsSubscription = (primary.isSubscription ?? false) || (secondary.isSubscription ?? false)
    await ctx.db.patch(primary._id, {
      notes: mergedNotes,
      linkedAccountId: primary.linkedAccountId ?? secondary.linkedAccountId,
      autopay: primary.autopay || secondary.autopay,
      isSubscription: nextIsSubscription,
      cancelReminderDays: nextIsSubscription
        ? primary.cancelReminderDays ?? secondary.cancelReminderDays ?? 7
        : undefined,
    })

    if (secondaryChecks.length > 0) {
      await Promise.all(secondaryChecks.map((entry) => ctx.db.delete(entry._id)))
    }
    if (secondaryPriceChanges.length > 0) {
      await Promise.all(secondaryPriceChanges.map((entry) => ctx.db.delete(entry._id)))
    }
    await ctx.db.delete(secondary._id)

    await Promise.all([
      recordFinanceAuditEvent(ctx, {
        userId: identity.subject,
        entityType: 'bill',
        entityId: primaryBillId,
        action: 'duplicate_merged_in',
        metadata: {
          mergedBillId: secondaryBillId,
          movedCycleLogCount,
          movedPriceChangeCount: secondaryPriceChanges.length,
        },
      }),
      recordFinanceAuditEvent(ctx, {
        userId: identity.subject,
        entityType: 'bill',
        entityId: secondaryBillId,
        action: 'merged_into_primary',
        before: {
          name: secondary.name,
          amount: secondary.amount,
          cadence: secondary.cadence,
        },
        metadata: {
          primaryBillId,
        },
      }),
    ])

    return {
      resolution: args.resolution,
      primaryBillId,
      secondaryBillId,
      movedCycleLogCount,
      movedPriceChangeCount: secondaryPriceChanges.length,
    }
  },
})

export const runBillsMonthlyBulkAction = mutation({
  args: {
    action: billsMonthlyBulkActionValidator,
    cycleMonth: v.string(),
    fundingAccountId: v.optional(v.id('accounts')),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const cycleMonth = args.cycleMonth.trim()
    validateStatementMonth(cycleMonth, 'Cycle month')

    const targetMonth = args.action === 'roll_recurring_forward' ? addMonthsToMonthKey(cycleMonth, 1) : undefined
    const lookupMonth = targetMonth ?? cycleMonth

    const [bills, checks] = await Promise.all([
      ctx.db
        .query('bills')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('billPaymentChecks')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
    ])

    const recurringBills = bills.filter((entry) => entry.cadence !== 'one_time')
    const eligibleBills = (args.action === 'roll_recurring_forward' ? recurringBills : bills).sort(
      (left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) || left.createdAt - right.createdAt,
    )

    const existingByBillId = new Map<string, Doc<'billPaymentChecks'>>()
    checks
      .filter((entry) => entry.cycleMonth === lookupMonth)
      .forEach((entry) => {
        const key = String(entry.billId)
        const current = existingByBillId.get(key)
        if (!current || entry.updatedAt > current.updatedAt) {
          existingByBillId.set(key, entry)
        }
      })

    let fundingAccount: Doc<'accounts'> | null = null
    if (args.action === 'mark_all_paid_from_account') {
      if (!args.fundingAccountId) {
        throw new Error('Select a funding account to mark all bills paid.')
      }
      const account = await ctx.db.get(args.fundingAccountId)
      ensureOwned(account, identity.subject, 'Funding account not found.')
      fundingAccount = account
    }

    let createdCount = 0
    let updatedCount = 0
    let skippedCount = 0
    let totalPaidApplied = 0
    let totalReconciledAmount = 0
    let reconciledFromPlannedCount = 0

    for (const bill of eligibleBills) {
      const existing = existingByBillId.get(String(bill._id))

      if (args.action === 'roll_recurring_forward') {
        if (existing) {
          skippedCount += 1
          continue
        }

        const result = await upsertBillPaymentCheckRecord(ctx, {
          userId: identity.subject,
          input: {
            billId: bill._id,
            cycleMonth: targetMonth!,
            expectedAmount: bill.amount,
            note: `[bulk-roll:${cycleMonth}]`,
          },
          metadata: {
            mode: 'bulk',
            action: args.action,
            sourceCycleMonth: cycleMonth,
            targetCycleMonth: targetMonth,
          },
        })
        if (result.action === 'created') {
          createdCount += 1
        } else {
          updatedCount += 1
        }
        continue
      }

      if (args.action === 'mark_all_paid_from_account') {
        const expectedAmount = existing?.expectedAmount ?? bill.amount
        const previousActual = existing?.actualAmount ?? 0
        const actualAmount = existing?.actualAmount ?? expectedAmount
        const paidDay = existing?.paidDay ?? bill.dueDay
        const note = appendUniqueNoteMarker(
          existing?.note,
          `[bulk-paid:${cycleMonth}:${String(fundingAccount!._id)}]`,
        )

        const result = await upsertBillPaymentCheckRecord(ctx, {
          userId: identity.subject,
          input: {
            billId: bill._id,
            cycleMonth,
            expectedAmount,
            actualAmount,
            paidDay,
            note,
          },
          metadata: {
            mode: 'bulk',
            action: args.action,
            cycleMonth,
            fundingAccountId: String(fundingAccount!._id),
          },
        })
        if (result.action === 'created') {
          createdCount += 1
        } else {
          updatedCount += 1
        }

        totalPaidApplied += roundCurrency(Math.max(actualAmount - previousActual, 0))
        continue
      }

      const expectedAmount = existing?.expectedAmount ?? bill.amount
      const hadActual = existing?.actualAmount !== undefined
      const actualAmount = existing?.actualAmount ?? expectedAmount
      const paidDay = existing?.paidDay ?? bill.dueDay
      const note = appendUniqueNoteMarker(existing?.note, `[batch-reconciled:${cycleMonth}]`)

      const result = await upsertBillPaymentCheckRecord(ctx, {
        userId: identity.subject,
        input: {
          billId: bill._id,
          cycleMonth,
          expectedAmount,
          actualAmount,
          paidDay,
          note,
        },
        metadata: {
          mode: 'bulk',
          action: args.action,
          cycleMonth,
        },
      })
      if (result.action === 'created') {
        createdCount += 1
      } else {
        updatedCount += 1
      }

      totalReconciledAmount += actualAmount
      if (!hadActual) {
        reconciledFromPlannedCount += 1
      }
    }

    totalPaidApplied = roundCurrency(totalPaidApplied)
    totalReconciledAmount = roundCurrency(totalReconciledAmount)

    if (args.action === 'mark_all_paid_from_account' && fundingAccount && totalPaidApplied > 0) {
      const nextBalances = applyAccountBalanceDelta(fundingAccount, -totalPaidApplied)
      await ctx.db.patch(fundingAccount._id, {
        balance: nextBalances.balance,
        ledgerBalance: nextBalances.ledgerBalance,
        pendingBalance: nextBalances.pendingBalance,
      })

      await recordFinanceAuditEvent(ctx, {
        userId: identity.subject,
        entityType: 'account',
        entityId: String(fundingAccount._id),
        action: 'bill_bulk_payment_applied',
        before: {
          balance: fundingAccount.balance,
          ledgerBalance: fundingAccount.ledgerBalance ?? fundingAccount.balance,
          pendingBalance: fundingAccount.pendingBalance ?? 0,
        },
        after: {
          balance: nextBalances.balance,
          ledgerBalance: nextBalances.ledgerBalance,
          pendingBalance: nextBalances.pendingBalance,
        },
        metadata: {
          cycleMonth,
          totalPaidApplied,
        },
      })
    }

    const batchId = `bill-bulk-${Date.now()}-${Math.floor(Math.random() * 100000)}`
    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'bill_bulk_action',
      entityId: batchId,
      action: args.action,
      metadata: {
        cycleMonth,
        targetMonth: targetMonth ?? null,
        eligibleCount: eligibleBills.length,
        createdCount,
        updatedCount,
        skippedCount,
        totalPaidApplied,
        totalReconciledAmount,
        reconciledFromPlannedCount,
        fundingAccountId: fundingAccount ? String(fundingAccount._id) : null,
      },
    })

    return {
      batchId,
      action: args.action as BillsMonthlyBulkAction,
      cycleMonth,
      targetMonth: targetMonth ?? null,
      eligibleCount: eligibleBills.length,
      createdCount,
      updatedCount,
      skippedCount,
      totalPaidApplied,
      totalReconciledAmount,
      reconciledFromPlannedCount,
      fundingAccountId: fundingAccount ? String(fundingAccount._id) : null,
      fundingAccountName: fundingAccount?.name ?? null,
    }
  },
})

export const removeBill = mutation({
  args: {
    id: v.id('bills'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Bill record not found.')

    const existingChecks = await ctx.db
      .query('billPaymentChecks')
      .withIndex('by_userId_billId_cycleMonth', (q) =>
        q.eq('userId', identity.subject).eq('billId', args.id),
      )
      .collect()
    const existingSubscriptionPriceChanges = await ctx.db
      .query('subscriptionPriceChanges')
      .withIndex('by_userId_billId_createdAt', (q) =>
        q.eq('userId', identity.subject).eq('billId', args.id),
      )
      .collect()

    if (existingChecks.length > 0) {
      await Promise.all(existingChecks.map((entry) => ctx.db.delete(entry._id)))
    }
    if (existingSubscriptionPriceChanges.length > 0) {
      await Promise.all(existingSubscriptionPriceChanges.map((entry) => ctx.db.delete(entry._id)))
    }

    await ctx.db.delete(args.id)

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'bill',
      entityId: String(args.id),
      action: 'removed',
      before: {
        name: existing.name,
        amount: existing.amount,
        dueDay: existing.dueDay,
        cadence: existing.cadence,
        removedCycleLogs: existingChecks.length,
      },
    })
  },
})

export const addLoan = mutation({
  args: {
    name: v.string(),
    balance: v.number(),
    principalBalance: v.optional(v.number()),
    accruedInterest: v.optional(v.number()),
    minimumPayment: v.number(),
    minimumPaymentType: v.optional(loanMinimumPaymentTypeValidator),
    minimumPaymentPercent: v.optional(v.number()),
    extraPayment: v.optional(v.number()),
    subscriptionCost: v.optional(v.number()),
    subscriptionPaymentCount: v.optional(v.number()),
    subscriptionOutstanding: v.optional(v.number()),
    interestRate: v.optional(v.number()),
    dueDay: v.number(),
    cadence: cadenceValidator,
    customInterval: v.optional(v.number()),
    customUnit: v.optional(customCadenceUnitValidator),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.name, 'Loan name')
    validateNonNegative(args.balance, 'Loan balance')
    if (args.principalBalance !== undefined) {
      validateNonNegative(args.principalBalance, 'Loan principal balance')
    }
    if (args.accruedInterest !== undefined) {
      validateNonNegative(args.accruedInterest, 'Loan accrued interest')
    }
    const paymentConfig = resolveLoanPaymentConfigForWrite({
      minimumPayment: args.minimumPayment,
      minimumPaymentType: args.minimumPaymentType,
      minimumPaymentPercent: args.minimumPaymentPercent,
      extraPayment: args.extraPayment,
    })
    validateOptionalText(args.notes, 'Notes', 2000)

    if (args.subscriptionCost !== undefined) {
      validateNonNegative(args.subscriptionCost, 'Loan subscription cost')
    }
    if (args.subscriptionPaymentCount !== undefined) {
      validatePositiveInteger(args.subscriptionPaymentCount, 'Loan subscription payments left')
    }
    if (args.subscriptionOutstanding !== undefined) {
      validateNonNegative(args.subscriptionOutstanding, 'Loan subscription outstanding')
    }

    if (args.interestRate !== undefined) {
      validateNonNegative(args.interestRate, 'Loan interest rate')
    }

    validateDayOfMonth(args.dueDay, 'Due day')

    const cadenceDetails = sanitizeCadenceDetails(args.cadence, args.customInterval, args.customUnit)
    const balances = resolveLoanBalancesForWrite({
      balance: args.balance,
      principalBalance: args.principalBalance,
      accruedInterest: args.accruedInterest,
    })
    const subscriptionCost = roundCurrency(Math.max(finiteOrZero(args.subscriptionCost), 0))
    const requestedSubscriptionPaymentCount =
      subscriptionCost > 0 ? normalizePositiveInteger(args.subscriptionPaymentCount) ?? 12 : undefined
    const subscriptionOutstanding = resolveLoanSubscriptionOutstandingForWrite({
      subscriptionCost: args.subscriptionCost,
      subscriptionPaymentCount: requestedSubscriptionPaymentCount,
      subscriptionOutstanding: args.subscriptionOutstanding,
    })
    const subscriptionPaymentCount = getSubscriptionPaymentsRemaining(subscriptionCost, subscriptionOutstanding)
    const now = Date.now()

    const createdLoanId = await ctx.db.insert('loans', {
      userId: identity.subject,
      name: args.name.trim(),
      balance: balances.balance,
      principalBalance: balances.principalBalance,
      accruedInterest: balances.accruedInterest,
      minimumPayment: args.minimumPayment,
      minimumPaymentType: paymentConfig.minimumPaymentType,
      minimumPaymentPercent: paymentConfig.minimumPaymentPercent,
      extraPayment: paymentConfig.extraPayment,
      subscriptionCost: args.subscriptionCost,
      subscriptionPaymentCount,
      subscriptionOutstanding,
      interestRate: args.interestRate,
      dueDay: args.dueDay,
      cadence: args.cadence,
      customInterval: cadenceDetails.customInterval,
      customUnit: cadenceDetails.customUnit,
      notes: args.notes?.trim() || undefined,
      lastCycleAt: now,
      lastInterestAppliedAt: now,
      createdAt: now,
    })

    if (balances.balance > 0) {
      await insertLoanEvent(ctx, {
        userId: identity.subject,
        loanId: createdLoanId,
        eventType: 'charge',
        source: 'manual',
        amount: balances.balance,
        principalDelta: balances.principalBalance,
        interestDelta: balances.accruedInterest,
        resultingBalance: roundCurrency(balances.balance + subscriptionOutstanding),
        occurredAt: now,
        notes: 'Initial loan balance',
      })
    }

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'loan',
      entityId: String(createdLoanId),
      action: 'created',
      after: {
        name: args.name.trim(),
        balance: balances.balance,
        principalBalance: balances.principalBalance,
        accruedInterest: balances.accruedInterest,
        minimumPayment: args.minimumPayment,
        minimumPaymentType: paymentConfig.minimumPaymentType,
        minimumPaymentPercent: paymentConfig.minimumPaymentPercent ?? 0,
        extraPayment: paymentConfig.extraPayment,
        subscriptionCost: args.subscriptionCost ?? 0,
        subscriptionPaymentCount: subscriptionPaymentCount ?? 0,
        subscriptionOutstanding,
        interestRate: args.interestRate ?? 0,
      },
    })

    await recordLoanCycleAuditEntry(ctx, {
      userId: identity.subject,
      loanId: createdLoanId,
      mutationType: 'created',
      source: 'manual',
      amount: roundCurrency(balances.balance + subscriptionOutstanding),
      before: buildLoanAuditSnapshot({
        principal: 0,
        interest: 0,
        subscription: 0,
      }),
      after: buildLoanAuditSnapshot({
        principal: balances.principalBalance,
        interest: balances.accruedInterest,
        subscription: subscriptionOutstanding,
      }),
      notes: 'Loan created',
      metadata: {
        cadence: args.cadence,
        dueDay: args.dueDay,
        minimumPaymentType: paymentConfig.minimumPaymentType,
      },
      occurredAt: now,
    })
  },
})

export const updateLoan = mutation({
  args: {
    id: v.id('loans'),
    name: v.string(),
    balance: v.number(),
    principalBalance: v.optional(v.number()),
    accruedInterest: v.optional(v.number()),
    minimumPayment: v.number(),
    minimumPaymentType: v.optional(loanMinimumPaymentTypeValidator),
    minimumPaymentPercent: v.optional(v.number()),
    extraPayment: v.optional(v.number()),
    subscriptionCost: v.optional(v.number()),
    subscriptionPaymentCount: v.optional(v.number()),
    subscriptionOutstanding: v.optional(v.number()),
    interestRate: v.optional(v.number()),
    dueDay: v.number(),
    cadence: cadenceValidator,
    customInterval: v.optional(v.number()),
    customUnit: v.optional(customCadenceUnitValidator),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Loan record not found.')
    const beforeSnapshot = getLoanAuditSnapshot(existing)

    validateRequiredText(args.name, 'Loan name')
    validateNonNegative(args.balance, 'Loan balance')
    if (args.principalBalance !== undefined) {
      validateNonNegative(args.principalBalance, 'Loan principal balance')
    }
    if (args.accruedInterest !== undefined) {
      validateNonNegative(args.accruedInterest, 'Loan accrued interest')
    }
    const minimumPaymentType = normalizeLoanMinimumPaymentType(args.minimumPaymentType ?? existing.minimumPaymentType)
    const paymentConfig = resolveLoanPaymentConfigForWrite({
      minimumPayment: args.minimumPayment,
      minimumPaymentType,
      minimumPaymentPercent: args.minimumPaymentPercent ?? existing.minimumPaymentPercent,
      extraPayment: args.extraPayment ?? existing.extraPayment,
    })
    validateOptionalText(args.notes, 'Notes', 2000)

    if (args.subscriptionCost !== undefined) {
      validateNonNegative(args.subscriptionCost, 'Loan subscription cost')
    }
    if (args.subscriptionPaymentCount !== undefined) {
      validatePositiveInteger(args.subscriptionPaymentCount, 'Loan subscription payments left')
    }
    if (args.subscriptionOutstanding !== undefined) {
      validateNonNegative(args.subscriptionOutstanding, 'Loan subscription outstanding')
    }

    if (args.interestRate !== undefined) {
      validateNonNegative(args.interestRate, 'Loan interest rate')
    }

    validateDayOfMonth(args.dueDay, 'Due day')

    const cadenceDetails = sanitizeCadenceDetails(args.cadence, args.customInterval, args.customUnit)
    const hasExplicitBalances = args.principalBalance !== undefined || args.accruedInterest !== undefined
    const existingBalances = getLoanWorkingBalances(existing)
    const balances = hasExplicitBalances
      ? resolveLoanBalancesForWrite({
          balance: args.balance,
          principalBalance: args.principalBalance,
          accruedInterest: args.accruedInterest,
        })
      : resolveLoanBalancesForWrite({
          balance: args.balance,
          accruedInterest: Math.min(existingBalances.accruedInterest, Math.max(args.balance, 0)),
        })
    const nextSubscriptionCost = roundCurrency(Math.max(finiteOrZero(args.subscriptionCost ?? existing.subscriptionCost), 0))
    const nextSubscriptionPaymentCount =
      nextSubscriptionCost > 0
        ? normalizePositiveInteger(args.subscriptionPaymentCount) ?? getLoanSubscriptionPaymentsRemaining(existing) ?? 12
        : undefined
    const subscriptionOutstanding = resolveLoanSubscriptionOutstandingForWrite({
      existing,
      subscriptionCost: args.subscriptionCost,
      subscriptionPaymentCount: nextSubscriptionPaymentCount,
      subscriptionOutstanding: args.subscriptionOutstanding,
    })
    const subscriptionPaymentCount = getSubscriptionPaymentsRemaining(nextSubscriptionCost, subscriptionOutstanding)

    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      balance: balances.balance,
      principalBalance: balances.principalBalance,
      accruedInterest: balances.accruedInterest,
      minimumPayment: args.minimumPayment,
      minimumPaymentType: paymentConfig.minimumPaymentType,
      minimumPaymentPercent: paymentConfig.minimumPaymentPercent,
      extraPayment: paymentConfig.extraPayment,
      subscriptionCost: args.subscriptionCost,
      subscriptionPaymentCount,
      subscriptionOutstanding,
      interestRate: args.interestRate,
      dueDay: args.dueDay,
      cadence: args.cadence,
      customInterval: cadenceDetails.customInterval,
      customUnit: cadenceDetails.customUnit,
      notes: args.notes?.trim() || undefined,
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'loan',
      entityId: String(args.id),
      action: 'updated',
      before: {
        name: existing.name,
        balance: existing.balance,
        principalBalance: existing.principalBalance ?? existing.balance,
        accruedInterest: existing.accruedInterest ?? 0,
        minimumPayment: existing.minimumPayment,
        minimumPaymentType: normalizeLoanMinimumPaymentType(existing.minimumPaymentType),
        minimumPaymentPercent: existing.minimumPaymentPercent ?? 0,
        extraPayment: existing.extraPayment ?? 0,
        subscriptionCost: existing.subscriptionCost ?? 0,
        subscriptionPaymentCount: existing.subscriptionPaymentCount ?? 0,
        subscriptionOutstanding: getLoanSubscriptionOutstanding(existing),
        interestRate: existing.interestRate ?? 0,
      },
      after: {
        name: args.name.trim(),
        balance: balances.balance,
        principalBalance: balances.principalBalance,
        accruedInterest: balances.accruedInterest,
        minimumPayment: args.minimumPayment,
        minimumPaymentType: paymentConfig.minimumPaymentType,
        minimumPaymentPercent: paymentConfig.minimumPaymentPercent ?? 0,
        extraPayment: paymentConfig.extraPayment,
        subscriptionCost: args.subscriptionCost ?? 0,
        subscriptionPaymentCount: subscriptionPaymentCount ?? 0,
        subscriptionOutstanding,
        interestRate: args.interestRate ?? 0,
      },
    })

    await recordLoanCycleAuditEntry(ctx, {
      userId: identity.subject,
      loanId: args.id,
      mutationType: 'updated',
      source: 'manual',
      amount: roundCurrency(beforeSnapshot.total - (balances.balance + subscriptionOutstanding)),
      before: beforeSnapshot,
      after: buildLoanAuditSnapshot({
        principal: balances.principalBalance,
        interest: balances.accruedInterest,
        subscription: subscriptionOutstanding,
      }),
      notes: 'Loan configuration updated',
      metadata: {
        cadence: args.cadence,
        dueDay: args.dueDay,
        minimumPaymentType: paymentConfig.minimumPaymentType,
      },
    })
  },
})

export const removeLoan = mutation({
  args: {
    id: v.id('loans'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Loan record not found.')
    const beforeSnapshot = getLoanAuditSnapshot(existing)
    const existingEvents = await ctx.db
      .query('loanEvents')
      .withIndex('by_userId_loanId_createdAt', (q) =>
        q.eq('userId', identity.subject).eq('loanId', args.id),
      )
      .collect()

    if (existingEvents.length > 0) {
      await Promise.all(existingEvents.map((event) => ctx.db.delete(event._id)))
    }

    await ctx.db.delete(args.id)

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'loan',
      entityId: String(args.id),
      action: 'removed',
      before: {
        name: existing.name,
        balance: existing.balance,
        minimumPayment: existing.minimumPayment,
        removedEvents: existingEvents.length,
      },
    })

    await recordLoanCycleAuditEntry(ctx, {
      userId: identity.subject,
      loanId: args.id,
      mutationType: 'removed',
      source: 'manual',
      amount: beforeSnapshot.total,
      before: beforeSnapshot,
      after: buildLoanAuditSnapshot({
        principal: 0,
        interest: 0,
        subscription: 0,
      }),
      notes: 'Loan removed',
      metadata: {
        removedEvents: existingEvents.length,
      },
    })
  },
})

export const addLoanCharge = mutation({
  args: {
    id: v.id('loans'),
    amount: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    validatePositive(args.amount, 'Charge amount')
    validateOptionalText(args.notes, 'Charge notes', 2000)

    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Loan record not found.')
    const beforeSnapshot = getLoanAuditSnapshot(existing)
    const working = getLoanWorkingBalances(existing)
    const subscriptionCost = roundCurrency(Math.max(finiteOrZero(existing.subscriptionCost), 0))
    const subscriptionOutstanding = getLoanSubscriptionOutstanding(existing)
    const subscriptionPaymentCount = getSubscriptionPaymentsRemaining(subscriptionCost, subscriptionOutstanding)
    const nextPrincipalBalance = roundCurrency(working.principalBalance + args.amount)
    const nextBalance = roundCurrency(nextPrincipalBalance + working.accruedInterest)
    const nextTotalOutstanding = roundCurrency(nextBalance + subscriptionOutstanding)
    const now = Date.now()

    await ctx.db.patch(args.id, {
      principalBalance: nextPrincipalBalance,
      accruedInterest: working.accruedInterest,
      balance: nextBalance,
      subscriptionPaymentCount,
      subscriptionOutstanding,
    })

    await insertLoanEvent(ctx, {
      userId: identity.subject,
      loanId: args.id,
      eventType: 'charge',
      source: 'manual',
      amount: args.amount,
      principalDelta: args.amount,
      interestDelta: 0,
      resultingBalance: nextTotalOutstanding,
      occurredAt: now,
      notes: args.notes?.trim() || undefined,
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'loan',
      entityId: String(args.id),
      action: 'quick_charge',
      before: {
        principalBalance: working.principalBalance,
        accruedInterest: working.accruedInterest,
        balance: working.balance,
        subscriptionOutstanding,
      },
      after: {
        principalBalance: nextPrincipalBalance,
        accruedInterest: working.accruedInterest,
        balance: nextBalance,
        subscriptionOutstanding,
      },
      metadata: {
        amount: args.amount,
        totalOutstanding: nextTotalOutstanding,
        notes: args.notes?.trim() || undefined,
      },
    })

    await recordLoanCycleAuditEntry(ctx, {
      userId: identity.subject,
      loanId: args.id,
      mutationType: 'charge',
      source: 'manual',
      amount: args.amount,
      before: beforeSnapshot,
      after: buildLoanAuditSnapshot({
        principal: nextPrincipalBalance,
        interest: working.accruedInterest,
        subscription: subscriptionOutstanding,
      }),
      notes: args.notes?.trim() || undefined,
      metadata: {
        totalOutstanding: nextTotalOutstanding,
      },
      occurredAt: now,
    })
  },
})

export const recordLoanPayment = mutation({
  args: {
    id: v.id('loans'),
    amount: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    validatePositive(args.amount, 'Payment amount')
    validateOptionalText(args.notes, 'Payment notes', 2000)

    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Loan record not found.')
    const beforeSnapshot = getLoanAuditSnapshot(existing)
    const working = getLoanWorkingBalances(existing)
    const subscriptionCost = roundCurrency(Math.max(finiteOrZero(existing.subscriptionCost), 0))
    const subscriptionOutstanding = getLoanSubscriptionOutstanding(existing)
    const subscriptionDueNow = roundCurrency(
      Math.min(subscriptionOutstanding, subscriptionCost > 0 ? subscriptionCost : subscriptionOutstanding),
    )
    const totalOutstanding = roundCurrency(working.balance + subscriptionOutstanding)

    if (args.amount > totalOutstanding + 0.000001) {
      throw new Error(`Payment amount cannot exceed total outstanding (${roundCurrency(totalOutstanding)}).`)
    }

    let remainingPayment = roundCurrency(args.amount)
    const subscriptionPayment = roundCurrency(Math.min(subscriptionDueNow, remainingPayment))
    const nextSubscriptionOutstanding = roundCurrency(Math.max(subscriptionOutstanding - subscriptionPayment, 0))
    const subscriptionPaymentCount = getSubscriptionPaymentsRemaining(subscriptionCost, nextSubscriptionOutstanding)
    remainingPayment = roundCurrency(Math.max(remainingPayment - subscriptionPayment, 0))

    const paymentOutcome = applyPaymentToLoan(
      {
        principalBalance: working.principalBalance,
        accruedInterest: working.accruedInterest,
      },
      remainingPayment,
    )

    const totalApplied = roundCurrency(subscriptionPayment + paymentOutcome.appliedAmount)
    if (totalApplied <= 0) {
      throw new Error('No outstanding loan balance or subscription dues to pay down.')
    }

    const now = Date.now()
    const resultingTotalOutstanding = roundCurrency(paymentOutcome.balance + nextSubscriptionOutstanding)
    await ctx.db.patch(args.id, {
      principalBalance: paymentOutcome.principalBalance,
      accruedInterest: paymentOutcome.accruedInterest,
      balance: paymentOutcome.balance,
      subscriptionPaymentCount,
      subscriptionOutstanding: nextSubscriptionOutstanding,
    })

    await insertLoanEvent(ctx, {
      userId: identity.subject,
      loanId: args.id,
      eventType: 'payment',
      source: 'manual',
      amount: totalApplied,
      principalDelta: -paymentOutcome.principalPayment,
      interestDelta: -paymentOutcome.interestPayment,
      resultingBalance: resultingTotalOutstanding,
      occurredAt: now,
      notes: args.notes?.trim() || undefined,
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'loan',
      entityId: String(args.id),
      action: 'quick_payment',
      before: {
        principalBalance: working.principalBalance,
        accruedInterest: working.accruedInterest,
        balance: working.balance,
        subscriptionOutstanding,
        totalOutstanding,
      },
      after: {
        principalBalance: paymentOutcome.principalBalance,
        accruedInterest: paymentOutcome.accruedInterest,
        balance: paymentOutcome.balance,
        subscriptionOutstanding: nextSubscriptionOutstanding,
        totalOutstanding: resultingTotalOutstanding,
      },
      metadata: {
        requestedAmount: args.amount,
        appliedAmount: totalApplied,
        subscriptionDueNow,
        subscriptionPayment,
        loanPayment: paymentOutcome.appliedAmount,
        interestPayment: paymentOutcome.interestPayment,
        principalPayment: paymentOutcome.principalPayment,
        unappliedAmount: roundCurrency(Math.max(args.amount - totalApplied, 0)),
        notes: args.notes?.trim() || undefined,
      },
    })

    await recordLoanCycleAuditEntry(ctx, {
      userId: identity.subject,
      loanId: args.id,
      mutationType: 'payment',
      source: 'manual',
      amount: totalApplied,
      before: beforeSnapshot,
      after: buildLoanAuditSnapshot({
        principal: paymentOutcome.principalBalance,
        interest: paymentOutcome.accruedInterest,
        subscription: nextSubscriptionOutstanding,
      }),
      notes: args.notes?.trim() || undefined,
      metadata: {
        subscriptionPayment,
        loanPayment: paymentOutcome.appliedAmount,
        interestPayment: paymentOutcome.interestPayment,
        principalPayment: paymentOutcome.principalPayment,
      },
      occurredAt: now,
    })
  },
})

export const applyLoanInterestNow = mutation({
  args: {
    id: v.id('loans'),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    validateOptionalText(args.notes, 'Interest notes', 2000)

    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Loan record not found.')
    const beforeSnapshot = getLoanAuditSnapshot(existing)
    const working = getLoanWorkingBalances(existing)
    const subscriptionCost = roundCurrency(Math.max(finiteOrZero(existing.subscriptionCost), 0))
    const subscriptionOutstanding = getLoanSubscriptionOutstanding(existing)
    const subscriptionPaymentCount = getSubscriptionPaymentsRemaining(subscriptionCost, subscriptionOutstanding)
    const apr = finiteOrZero(existing.interestRate)
    if (apr <= 0) {
      throw new Error('Loan APR must be greater than 0 to accrue interest.')
    }

    if (working.balance <= 0) {
      throw new Error('No outstanding loan balance to accrue interest on.')
    }

    const monthlyRate = apr / 100 / 12
    const interestAmount = roundCurrency(working.balance * monthlyRate)
    if (interestAmount <= 0) {
      throw new Error('Calculated interest is zero. Check the loan balance and APR.')
    }

    const nextAccruedInterest = roundCurrency(working.accruedInterest + interestAmount)
    const nextBalance = roundCurrency(working.principalBalance + nextAccruedInterest)
    const nextTotalOutstanding = roundCurrency(nextBalance + subscriptionOutstanding)
    const now = Date.now()

    await ctx.db.patch(args.id, {
      principalBalance: working.principalBalance,
      accruedInterest: nextAccruedInterest,
      balance: nextBalance,
      subscriptionPaymentCount,
      subscriptionOutstanding,
      lastInterestAppliedAt: now,
    })

    await insertLoanEvent(ctx, {
      userId: identity.subject,
      loanId: args.id,
      eventType: 'interest_accrual',
      source: 'manual',
      amount: interestAmount,
      principalDelta: 0,
      interestDelta: interestAmount,
      resultingBalance: nextTotalOutstanding,
      occurredAt: now,
      notes: args.notes?.trim() || undefined,
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'loan',
      entityId: String(args.id),
      action: 'quick_interest',
      before: {
        principalBalance: working.principalBalance,
        accruedInterest: working.accruedInterest,
        balance: working.balance,
        subscriptionOutstanding,
      },
      after: {
        principalBalance: working.principalBalance,
        accruedInterest: nextAccruedInterest,
        balance: nextBalance,
        subscriptionOutstanding,
      },
      metadata: {
        apr,
        interestAmount,
        totalOutstanding: nextTotalOutstanding,
        notes: args.notes?.trim() || undefined,
      },
    })

    await recordLoanCycleAuditEntry(ctx, {
      userId: identity.subject,
      loanId: args.id,
      mutationType: 'interest_accrual',
      source: 'manual',
      amount: interestAmount,
      before: beforeSnapshot,
      after: buildLoanAuditSnapshot({
        principal: working.principalBalance,
        interest: nextAccruedInterest,
        subscription: subscriptionOutstanding,
      }),
      notes: args.notes?.trim() || undefined,
      metadata: {
        apr,
        totalOutstanding: nextTotalOutstanding,
      },
      occurredAt: now,
    })
  },
})

export const applyLoanSubscriptionNow = mutation({
  args: {
    id: v.id('loans'),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    validateOptionalText(args.notes, 'Subscription notes', 2000)

    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Loan record not found.')
    const beforeSnapshot = getLoanAuditSnapshot(existing)
    const subscriptionCost = roundCurrency(Math.max(finiteOrZero(existing.subscriptionCost), 0))
    if (subscriptionCost <= 0) {
      throw new Error('Loan subscription cost must be greater than 0.')
    }

    const working = getLoanWorkingBalances(existing)
    const currentSubscriptionOutstanding = getLoanSubscriptionOutstanding(existing)
    const nextSubscriptionOutstanding = roundCurrency(currentSubscriptionOutstanding + subscriptionCost)
    const subscriptionPaymentCount = getSubscriptionPaymentsRemaining(subscriptionCost, nextSubscriptionOutstanding)
    const nextTotalOutstanding = roundCurrency(working.balance + nextSubscriptionOutstanding)
    const now = Date.now()

    await ctx.db.patch(args.id, {
      principalBalance: working.principalBalance,
      accruedInterest: working.accruedInterest,
      balance: working.balance,
      subscriptionPaymentCount,
      subscriptionOutstanding: nextSubscriptionOutstanding,
    })

    await insertLoanEvent(ctx, {
      userId: identity.subject,
      loanId: args.id,
      eventType: 'subscription_fee',
      source: 'manual',
      amount: subscriptionCost,
      principalDelta: 0,
      interestDelta: 0,
      resultingBalance: nextTotalOutstanding,
      occurredAt: now,
      notes: args.notes?.trim() || undefined,
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'loan',
      entityId: String(args.id),
      action: 'quick_subscription_fee',
      metadata: {
        amount: subscriptionCost,
        previousSubscriptionOutstanding: currentSubscriptionOutstanding,
        nextSubscriptionOutstanding,
        totalOutstanding: nextTotalOutstanding,
        notes: args.notes?.trim() || undefined,
      },
    })

    await recordLoanCycleAuditEntry(ctx, {
      userId: identity.subject,
      loanId: args.id,
      mutationType: 'subscription_fee',
      source: 'manual',
      amount: subscriptionCost,
      before: beforeSnapshot,
      after: buildLoanAuditSnapshot({
        principal: working.principalBalance,
        interest: working.accruedInterest,
        subscription: nextSubscriptionOutstanding,
      }),
      notes: args.notes?.trim() || undefined,
      metadata: {
        previousSubscriptionOutstanding: currentSubscriptionOutstanding,
        nextSubscriptionOutstanding,
        totalOutstanding: nextTotalOutstanding,
      },
      occurredAt: now,
    })
  },
})

export const applyCardMonthlyCycle = mutation({
  args: {
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const now = new Date(args.now ?? Date.now())
    const cardResult = await runCardMonthlyCycleForUser(ctx, identity.subject, now, toCycleKey(now))

    return {
      ...cardResult,
    }
  },
})

export const applyLoanMonthlyCycle = mutation({
  args: {
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const now = new Date(args.now ?? Date.now())
    const loanResult = await runLoanMonthlyCycleForUser(ctx, identity.subject, now, toCycleKey(now), {
      runSource: 'manual',
    })

    return {
      ...loanResult,
    }
  },
})

export const runMonthlyCycle = mutation({
  args: {
    now: v.optional(v.number()),
    source: v.optional(cycleRunSourceValidator),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const now = new Date(args.now ?? Date.now())
    const source: CycleRunSource = args.source ?? 'manual'
    const cycleKey = toCycleKey(now)
    const providedIdempotencyKey = args.idempotencyKey?.trim() || undefined
    const idempotencyKey = providedIdempotencyKey ?? `${source}:${cycleKey}`

    if (idempotencyKey) {
      const existingRuns = await ctx.db
        .query('monthlyCycleRuns')
        .withIndex('by_userId_idempotencyKey', (q) => q.eq('userId', identity.subject).eq('idempotencyKey', idempotencyKey))
        .collect()

      const existingRun = existingRuns
        .filter((run) => run.status === 'completed')
        .sort((left, right) => right.createdAt - left.createdAt)[0]

      if (existingRun && existingRun.status === 'completed') {
        return {
          status: existingRun.status,
          wasDeduplicated: true,
          failureReason: existingRun.failureReason ?? null,
          source: existingRun.source,
          cycleKey: existingRun.cycleKey,
          idempotencyKey: existingRun.idempotencyKey ?? null,
          auditLogId: existingRun.auditLogId ?? null,
          monthlyCycleRunId: String(existingRun._id),
          updatedCards: existingRun.updatedCards,
          updatedLoans: existingRun.updatedLoans,
          cyclesApplied: existingRun.cardCyclesApplied + existingRun.loanCyclesApplied,
          cardCyclesApplied: existingRun.cardCyclesApplied,
          loanCyclesApplied: existingRun.loanCyclesApplied,
          interestAccrued: roundCurrency(existingRun.cardInterestAccrued + existingRun.loanInterestAccrued),
          paymentsApplied: roundCurrency(existingRun.cardPaymentsApplied + existingRun.loanPaymentsApplied),
          spendAdded: existingRun.cardSpendAdded,
          cardInterestAccrued: existingRun.cardInterestAccrued,
          cardPaymentsApplied: existingRun.cardPaymentsApplied,
          loanInterestAccrued: existingRun.loanInterestAccrued,
          loanPaymentsApplied: existingRun.loanPaymentsApplied,
        }
      }
    }

    const runStep = async <T,>(
      step: string,
      work: () => Promise<T>,
      metadata?: Record<string, unknown>,
    ) => {
      try {
        return await work()
      } catch (error) {
        const stepFailure = error instanceof Error ? error.message : String(error)
        await recordCycleStepAlert(ctx, {
          userId: identity.subject,
          cycleKey,
          idempotencyKey,
          source,
          step,
          severity: 'critical',
          message: stepFailure,
          metadata,
          occurredAt: now.getTime(),
        })
        throw new Error(`[${step}] ${stepFailure}`)
      }
    }

    try {
      const cardResult = await runStep('cards_monthly_cycle', async () =>
        runCardMonthlyCycleForUser(ctx, identity.subject, now, cycleKey),
      )
      const loanResult = await runStep(
        'loans_monthly_cycle',
        async () =>
          runLoanMonthlyCycleForUser(ctx, identity.subject, now, cycleKey, {
            idempotencyKey,
            runSource: source,
          }),
        {
          source,
          cycleKey,
          idempotencyKey,
        },
      )

      await runStep('month_close_snapshot', async () => {
        const summarySnapshot = await computeMonthCloseSnapshotSummary(ctx, identity.subject, now)
        const existingSnapshot = await ctx.db
          .query('monthCloseSnapshots')
          .withIndex('by_userId_cycleKey', (q) => q.eq('userId', identity.subject).eq('cycleKey', cycleKey))
          .first()

        if (existingSnapshot) {
          await ctx.db.patch(existingSnapshot._id, {
            ranAt: now.getTime(),
            summary: summarySnapshot,
          })
          return
        }

        await ctx.db.insert('monthCloseSnapshots', {
          userId: identity.subject,
          cycleKey,
          ranAt: now.getTime(),
          summary: summarySnapshot,
          createdAt: Date.now(),
        })
      })

      const shouldLog = source === 'manual' || cardResult.updatedCards > 0 || loanResult.updatedLoans > 0
      let auditLogId: string | null = null

      if (shouldLog) {
        const id = await ctx.db.insert('cycleAuditLogs', {
          userId: identity.subject,
          source,
          cycleKey,
          idempotencyKey,
          ranAt: now.getTime(),
          updatedCards: cardResult.updatedCards,
          updatedLoans: loanResult.updatedLoans,
          cardCyclesApplied: cardResult.cyclesApplied,
          loanCyclesApplied: loanResult.cyclesApplied,
          cardInterestAccrued: cardResult.interestAccrued,
          cardPaymentsApplied: cardResult.paymentsApplied,
          cardSpendAdded: cardResult.spendAdded,
          loanInterestAccrued: loanResult.interestAccrued,
          loanPaymentsApplied: loanResult.paymentsApplied,
          createdAt: Date.now(),
        })
        auditLogId = String(id)
      }

      const monthlyCycleRunId = await ctx.db.insert('monthlyCycleRuns', {
        userId: identity.subject,
        cycleKey,
        source,
        status: 'completed',
        idempotencyKey,
        auditLogId: auditLogId ?? undefined,
        failureReason: undefined,
        ranAt: now.getTime(),
        updatedCards: cardResult.updatedCards,
        updatedLoans: loanResult.updatedLoans,
        cardCyclesApplied: cardResult.cyclesApplied,
        loanCyclesApplied: loanResult.cyclesApplied,
        cardInterestAccrued: cardResult.interestAccrued,
        cardPaymentsApplied: cardResult.paymentsApplied,
        cardSpendAdded: cardResult.spendAdded,
        loanInterestAccrued: loanResult.interestAccrued,
        loanPaymentsApplied: loanResult.paymentsApplied,
        createdAt: Date.now(),
      })

      await recordFinanceAuditEvent(ctx, {
        userId: identity.subject,
        entityType: 'monthly_cycle',
        entityId: cycleKey,
        action: 'run_completed',
        metadata: {
          source,
          idempotencyKey,
          updatedCards: cardResult.updatedCards,
          updatedLoans: loanResult.updatedLoans,
          cardCyclesApplied: cardResult.cyclesApplied,
          loanCyclesApplied: loanResult.cyclesApplied,
        },
      })

      return {
        status: 'completed',
        wasDeduplicated: false,
        failureReason: null,
        source,
        cycleKey,
        idempotencyKey: idempotencyKey ?? null,
        auditLogId,
        monthlyCycleRunId: String(monthlyCycleRunId),
        updatedCards: cardResult.updatedCards,
        updatedLoans: loanResult.updatedLoans,
        cyclesApplied: cardResult.cyclesApplied + loanResult.cyclesApplied,
        cardCyclesApplied: cardResult.cyclesApplied,
        loanCyclesApplied: loanResult.cyclesApplied,
        interestAccrued: roundCurrency(cardResult.interestAccrued + loanResult.interestAccrued),
        paymentsApplied: roundCurrency(cardResult.paymentsApplied + loanResult.paymentsApplied),
        spendAdded: cardResult.spendAdded,
        cardInterestAccrued: cardResult.interestAccrued,
        cardPaymentsApplied: cardResult.paymentsApplied,
        loanInterestAccrued: loanResult.interestAccrued,
        loanPaymentsApplied: loanResult.paymentsApplied,
      }
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : String(error)

      await ctx.db.insert('monthlyCycleRuns', {
        userId: identity.subject,
        cycleKey,
        source,
        status: 'failed',
        idempotencyKey: idempotencyKey ?? undefined,
        auditLogId: undefined,
        failureReason: failureReason.slice(0, 280),
        ranAt: now.getTime(),
        updatedCards: 0,
        updatedLoans: 0,
        cardCyclesApplied: 0,
        loanCyclesApplied: 0,
        cardInterestAccrued: 0,
        cardPaymentsApplied: 0,
        cardSpendAdded: 0,
        loanInterestAccrued: 0,
        loanPaymentsApplied: 0,
        createdAt: Date.now(),
      })

      await recordCycleStepAlert(ctx, {
        userId: identity.subject,
        cycleKey,
        idempotencyKey,
        source,
        step: 'monthly_cycle_run',
        severity: 'critical',
        message: failureReason,
        metadata: {
          source,
          cycleKey,
          idempotencyKey,
        },
        occurredAt: now.getTime(),
      })

      await recordFinanceAuditEvent(ctx, {
        userId: identity.subject,
        entityType: 'monthly_cycle',
        entityId: cycleKey,
        action: 'run_failed',
        metadata: {
          source,
          idempotencyKey,
          failureReason,
        },
      })

      throw error instanceof Error ? error : new Error(failureReason)
    }
  },
})

export const addCard = mutation({
  args: {
    name: v.string(),
    creditLimit: v.number(),
    usedLimit: v.number(),
    allowOverLimitOverride: v.optional(v.boolean()),
    statementBalance: v.optional(v.number()),
    pendingCharges: v.optional(v.number()),
    minimumPayment: v.number(),
    minimumPaymentType: v.optional(cardMinimumPaymentTypeValidator),
    minimumPaymentPercent: v.optional(v.number()),
    extraPayment: v.optional(v.number()),
    spendPerMonth: v.number(),
    interestRate: v.optional(v.number()),
    statementDay: v.optional(v.number()),
    dueDay: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.name, 'Card name')
    validatePositive(args.creditLimit, 'Credit limit')
    validateNonNegative(args.usedLimit, 'Used limit')
    validateUsedLimitAgainstCreditLimit({
      creditLimit: args.creditLimit,
      usedLimit: args.usedLimit,
      allowOverLimitOverride: args.allowOverLimitOverride,
    })
    if (args.statementBalance !== undefined) {
      validateNonNegative(args.statementBalance, 'Statement balance')
    }
    if (args.pendingCharges !== undefined) {
      validateNonNegative(args.pendingCharges, 'Pending charges')
    }
    const minimumPaymentType = normalizeCardMinimumPaymentType(args.minimumPaymentType)
    validateNonNegative(args.minimumPayment, 'Minimum payment')
    if (minimumPaymentType === 'percent_plus_interest') {
      if (args.minimumPaymentPercent === undefined) {
        throw new Error('Minimum payment % is required for % + interest cards.')
      }
      validateNonNegative(args.minimumPaymentPercent, 'Minimum payment %')
      if (args.minimumPaymentPercent > 100) {
        throw new Error('Minimum payment % must be 100 or less.')
      }
    }
    if (args.extraPayment !== undefined) {
      validateNonNegative(args.extraPayment, 'Extra payment')
    }
    validateNonNegative(args.spendPerMonth, 'Spend per month')
    if (args.interestRate !== undefined) {
      validateNonNegative(args.interestRate, 'Card APR')
    }
    if (args.statementDay !== undefined) {
      validateDayOfMonth(args.statementDay, 'Statement day')
    }
    if (args.dueDay !== undefined) {
      validateDayOfMonth(args.dueDay, 'Due day')
    }

    const statementBalance = args.statementBalance ?? args.usedLimit
    const pendingCharges = args.pendingCharges ?? Math.max(args.usedLimit - statementBalance, 0)
    const statementDay = args.statementDay ?? 1
    const dueDay = args.dueDay ?? 21
    const minimumPaymentPercent =
      minimumPaymentType === 'percent_plus_interest'
        ? clampPercent(finiteOrZero(args.minimumPaymentPercent))
        : undefined
    const extraPayment = finiteOrZero(args.extraPayment)

    const createdCardId = await ctx.db.insert('cards', {
      userId: identity.subject,
      name: args.name.trim(),
      creditLimit: args.creditLimit,
      usedLimit: args.usedLimit,
      statementBalance,
      pendingCharges,
      minimumPayment: args.minimumPayment,
      minimumPaymentType,
      minimumPaymentPercent,
      extraPayment,
      spendPerMonth: args.spendPerMonth,
      interestRate: args.interestRate,
      statementDay,
      dueDay,
      lastCycleAt: Date.now(),
      createdAt: Date.now(),
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'card',
      entityId: String(createdCardId),
      action: 'created',
      after: {
        name: args.name.trim(),
        creditLimit: args.creditLimit,
        usedLimit: args.usedLimit,
        statementBalance,
        pendingCharges,
        minimumPayment: args.minimumPayment,
        minimumPaymentType,
        minimumPaymentPercent: minimumPaymentPercent ?? 0,
        extraPayment,
        spendPerMonth: args.spendPerMonth,
        interestRate: args.interestRate ?? 0,
        statementDay,
        dueDay,
      },
    })
  },
})

export const updateCard = mutation({
  args: {
    id: v.id('cards'),
    name: v.string(),
    creditLimit: v.number(),
    usedLimit: v.number(),
    allowOverLimitOverride: v.optional(v.boolean()),
    statementBalance: v.optional(v.number()),
    pendingCharges: v.optional(v.number()),
    minimumPayment: v.number(),
    minimumPaymentType: v.optional(cardMinimumPaymentTypeValidator),
    minimumPaymentPercent: v.optional(v.number()),
    extraPayment: v.optional(v.number()),
    spendPerMonth: v.number(),
    interestRate: v.optional(v.number()),
    statementDay: v.optional(v.number()),
    dueDay: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.name, 'Card name')
    validatePositive(args.creditLimit, 'Credit limit')
    validateNonNegative(args.usedLimit, 'Used limit')
    validateUsedLimitAgainstCreditLimit({
      creditLimit: args.creditLimit,
      usedLimit: args.usedLimit,
      allowOverLimitOverride: args.allowOverLimitOverride,
    })
    if (args.statementBalance !== undefined) {
      validateNonNegative(args.statementBalance, 'Statement balance')
    }
    if (args.pendingCharges !== undefined) {
      validateNonNegative(args.pendingCharges, 'Pending charges')
    }
    validateNonNegative(args.minimumPayment, 'Minimum payment')
    if (args.minimumPaymentPercent !== undefined) {
      validateNonNegative(args.minimumPaymentPercent, 'Minimum payment %')
      if (args.minimumPaymentPercent > 100) {
        throw new Error('Minimum payment % must be 100 or less.')
      }
    }
    if (args.extraPayment !== undefined) {
      validateNonNegative(args.extraPayment, 'Extra payment')
    }
    validateNonNegative(args.spendPerMonth, 'Spend per month')
    if (args.interestRate !== undefined) {
      validateNonNegative(args.interestRate, 'Card APR')
    }
    if (args.statementDay !== undefined) {
      validateDayOfMonth(args.statementDay, 'Statement day')
    }
    if (args.dueDay !== undefined) {
      validateDayOfMonth(args.dueDay, 'Due day')
    }

    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Card record not found.')
    const statementBalance = args.statementBalance ?? existing.statementBalance ?? args.usedLimit
    const pendingCharges =
      args.pendingCharges ?? existing.pendingCharges ?? Math.max(args.usedLimit - statementBalance, 0)
    const statementDay = args.statementDay ?? existing.statementDay ?? 1
    const dueDay = args.dueDay ?? existing.dueDay ?? 21
    const minimumPaymentType = normalizeCardMinimumPaymentType(
      args.minimumPaymentType ?? existing.minimumPaymentType,
    )
    const minimumPaymentPercentCandidate = args.minimumPaymentPercent ?? existing.minimumPaymentPercent
    if (minimumPaymentType === 'percent_plus_interest' && minimumPaymentPercentCandidate === undefined) {
      throw new Error('Minimum payment % is required for % + interest cards.')
    }
    const minimumPaymentPercent =
      minimumPaymentType === 'percent_plus_interest'
        ? clampPercent(finiteOrZero(minimumPaymentPercentCandidate))
        : undefined
    const extraPayment = finiteOrZero(args.extraPayment ?? existing.extraPayment)

    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      creditLimit: args.creditLimit,
      usedLimit: args.usedLimit,
      statementBalance,
      pendingCharges,
      minimumPayment: args.minimumPayment,
      minimumPaymentType,
      minimumPaymentPercent,
      extraPayment,
      spendPerMonth: args.spendPerMonth,
      interestRate: args.interestRate,
      statementDay,
      dueDay,
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'card',
      entityId: String(args.id),
      action: 'updated',
      before: {
        name: existing.name,
        creditLimit: existing.creditLimit,
        usedLimit: existing.usedLimit,
        statementBalance: existing.statementBalance ?? existing.usedLimit,
        pendingCharges: existing.pendingCharges ?? Math.max(existing.usedLimit - (existing.statementBalance ?? existing.usedLimit), 0),
        minimumPayment: existing.minimumPayment,
        minimumPaymentType: normalizeCardMinimumPaymentType(existing.minimumPaymentType),
        minimumPaymentPercent: finiteOrZero(existing.minimumPaymentPercent),
        extraPayment: finiteOrZero(existing.extraPayment),
        spendPerMonth: existing.spendPerMonth,
        interestRate: existing.interestRate ?? 0,
        statementDay: existing.statementDay ?? 1,
        dueDay: existing.dueDay ?? 21,
      },
      after: {
        name: args.name.trim(),
        creditLimit: args.creditLimit,
        usedLimit: args.usedLimit,
        statementBalance,
        pendingCharges,
        minimumPayment: args.minimumPayment,
        minimumPaymentType,
        minimumPaymentPercent: minimumPaymentPercent ?? 0,
        extraPayment,
        spendPerMonth: args.spendPerMonth,
        interestRate: args.interestRate ?? 0,
        statementDay,
        dueDay,
      },
    })
  },
})

export const addCardCharge = mutation({
  args: {
    id: v.id('cards'),
    amount: v.number(),
    allowOverLimitOverride: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    validatePositive(args.amount, 'Charge amount')

    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Card record not found.')
    const projectedUsed = finiteOrZero(existing.usedLimit) + args.amount
    validateUsedLimitAgainstCreditLimit({
      creditLimit: finiteOrZero(existing.creditLimit),
      usedLimit: projectedUsed,
      allowOverLimitOverride: args.allowOverLimitOverride,
    })
    const next = applyChargeToCard(existing, args.amount)

    await ctx.db.patch(args.id, {
      usedLimit: next.usedLimit,
      statementBalance: next.statementBalance,
      pendingCharges: next.pendingCharges,
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'card',
      entityId: String(args.id),
      action: 'quick_charge',
      before: {
        usedLimit: existing.usedLimit,
        statementBalance: existing.statementBalance ?? existing.usedLimit,
        pendingCharges: existing.pendingCharges ?? 0,
      },
      after: {
        usedLimit: next.usedLimit,
        statementBalance: next.statementBalance,
        pendingCharges: next.pendingCharges,
      },
      metadata: {
        amount: args.amount,
      },
    })
  },
})

export const recordCardPayment = mutation({
  args: {
    id: v.id('cards'),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    validatePositive(args.amount, 'Payment amount')

    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Card record not found.')
    const outstanding = Math.max(finiteOrZero(existing.usedLimit), 0)
    if (args.amount > outstanding + 0.000001) {
      throw new Error(`Payment amount cannot exceed current balance (${roundCurrency(outstanding)}).`)
    }
    const next = applyPaymentToCard(existing, args.amount)

    if (next.appliedAmount <= 0) {
      throw new Error('No outstanding card balance to pay down.')
    }

    await ctx.db.patch(args.id, {
      usedLimit: next.usedLimit,
      statementBalance: next.statementBalance,
      pendingCharges: next.pendingCharges,
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'card',
      entityId: String(args.id),
      action: 'quick_payment',
      before: {
        usedLimit: existing.usedLimit,
        statementBalance: existing.statementBalance ?? existing.usedLimit,
        pendingCharges: existing.pendingCharges ?? 0,
      },
      after: {
        usedLimit: next.usedLimit,
        statementBalance: next.statementBalance,
        pendingCharges: next.pendingCharges,
      },
      metadata: {
        requestedAmount: args.amount,
        appliedAmount: next.appliedAmount,
        unappliedAmount: next.unappliedAmount,
      },
    })
  },
})

export const transferCardBalance = mutation({
  args: {
    fromCardId: v.id('cards'),
    toCardId: v.id('cards'),
    amount: v.number(),
    allowOverLimitOverride: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    validatePositive(args.amount, 'Transfer amount')

    if (args.fromCardId === args.toCardId) {
      throw new Error('Transfer source and destination must be different cards.')
    }

    const [fromCard, toCard] = await Promise.all([ctx.db.get(args.fromCardId), ctx.db.get(args.toCardId)])
    ensureOwned(fromCard, identity.subject, 'Source card not found.')
    ensureOwned(toCard, identity.subject, 'Destination card not found.')
    const sourceOutstanding = Math.max(finiteOrZero(fromCard.usedLimit), 0)
    if (args.amount > sourceOutstanding + 0.000001) {
      throw new Error(`Transfer amount cannot exceed source balance (${roundCurrency(sourceOutstanding)}).`)
    }
    validateUsedLimitAgainstCreditLimit({
      creditLimit: finiteOrZero(toCard.creditLimit),
      usedLimit: finiteOrZero(toCard.usedLimit) + args.amount,
      allowOverLimitOverride: args.allowOverLimitOverride,
    })

    const fromNext = applyPaymentToCard(fromCard, args.amount)
    if (fromNext.appliedAmount <= 0) {
      throw new Error('No outstanding source-card balance available to transfer.')
    }

    const toNext = applyTransferIntoCard(toCard, fromNext.appliedAmount)

    await Promise.all([
      ctx.db.patch(args.fromCardId, {
        usedLimit: fromNext.usedLimit,
        statementBalance: fromNext.statementBalance,
        pendingCharges: fromNext.pendingCharges,
      }),
      ctx.db.patch(args.toCardId, {
        usedLimit: toNext.usedLimit,
        statementBalance: toNext.statementBalance,
        pendingCharges: toNext.pendingCharges,
      }),
    ])

    await Promise.all([
      recordFinanceAuditEvent(ctx, {
        userId: identity.subject,
        entityType: 'card',
        entityId: String(args.fromCardId),
        action: 'quick_transfer_out',
        before: {
          usedLimit: fromCard.usedLimit,
          statementBalance: fromCard.statementBalance ?? fromCard.usedLimit,
          pendingCharges: fromCard.pendingCharges ?? 0,
        },
        after: {
          usedLimit: fromNext.usedLimit,
          statementBalance: fromNext.statementBalance,
          pendingCharges: fromNext.pendingCharges,
        },
        metadata: {
          destinationCardId: String(args.toCardId),
          requestedAmount: args.amount,
          appliedAmount: fromNext.appliedAmount,
          unappliedAmount: fromNext.unappliedAmount,
        },
      }),
      recordFinanceAuditEvent(ctx, {
        userId: identity.subject,
        entityType: 'card',
        entityId: String(args.toCardId),
        action: 'quick_transfer_in',
        before: {
          usedLimit: toCard.usedLimit,
          statementBalance: toCard.statementBalance ?? toCard.usedLimit,
          pendingCharges: toCard.pendingCharges ?? 0,
        },
        after: {
          usedLimit: toNext.usedLimit,
          statementBalance: toNext.statementBalance,
          pendingCharges: toNext.pendingCharges,
        },
        metadata: {
          sourceCardId: String(args.fromCardId),
          amount: fromNext.appliedAmount,
        },
      }),
    ])
  },
})

export const removeCard = mutation({
  args: {
    id: v.id('cards'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Card record not found.')

    await ctx.db.delete(args.id)

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'card',
      entityId: String(args.id),
      action: 'removed',
      before: {
        name: existing.name,
        creditLimit: existing.creditLimit,
        usedLimit: existing.usedLimit,
      },
    })
  },
})

export const addPurchase = mutation({
  args: {
    item: v.string(),
    amount: v.number(),
    category: v.string(),
    purchaseDate: v.string(),
    reconciliationStatus: v.optional(reconciliationStatusValidator),
    statementMonth: v.optional(v.string()),
    ownership: v.optional(purchaseOwnershipValidator),
    taxDeductible: v.optional(v.boolean()),
    fundingSourceType: v.optional(purchaseFundingSourceTypeValidator),
    fundingSourceId: v.optional(v.string()),
    notes: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.item, 'Purchase item')
    validatePositive(args.amount, 'Purchase amount')
    validateOptionalText(args.notes, 'Notes', 2000)
    validateIsoDate(args.purchaseDate, 'Purchase date')
    if (args.statementMonth) {
      validateStatementMonth(args.statementMonth, 'Statement month')
    }
    validateOptionalText(args.fundingSourceId, 'Funding source id', 80)

    const ruleOverride = await resolvePurchaseRuleOverrides(ctx, identity.subject, args.item)
    const resolvedCategory = isGenericCategory(args.category) && ruleOverride?.category ? ruleOverride.category : args.category.trim()
    const requestedStatus = args.reconciliationStatus ?? ruleOverride?.reconciliationStatus
    const ownership: PurchaseOwnership = args.ownership ?? 'shared'
    const taxDeductible = args.taxDeductible ?? false
    const inputFundingSourceType = args.fundingSourceType
    const normalizedInputFundingSourceId = args.fundingSourceId?.trim() || undefined
    const hasExplicitFundingSourceInput =
      inputFundingSourceType !== undefined
        ? inputFundingSourceType !== 'unassigned' || Boolean(normalizedInputFundingSourceId)
        : Boolean(normalizedInputFundingSourceId)
    const ruleFundingSourceType = ruleOverride?.fundingSourceType
    const ruleFundingSourceId = ruleOverride?.fundingSourceId?.trim() || undefined
    const fundingSourceType: PurchaseFundingSourceType = hasExplicitFundingSourceInput
      ? inputFundingSourceType ?? 'unassigned'
      : ruleFundingSourceType ?? inputFundingSourceType ?? 'unassigned'
    const fundingSourceId = fundingSourceType === 'unassigned' ? undefined : normalizedInputFundingSourceId ?? ruleFundingSourceId
    if ((fundingSourceType === 'account' || fundingSourceType === 'card') && !fundingSourceId) {
      throw new Error('Choose an account or card source for this purchase.')
    }
    validateRequiredText(resolvedCategory, 'Purchase category')

    const now = Date.now()
    const source = sanitizeMutationSource(args.source, 'manual')
    const reconciliation = resolvePurchaseReconciliation({
      purchaseDate: args.purchaseDate,
      requestedStatus,
      requestedStatementMonth: args.statementMonth,
      now,
    })

    const purchaseId = await ctx.db.insert('purchases', {
      userId: identity.subject,
      item: args.item.trim(),
      amount: args.amount,
      category: resolvedCategory,
      purchaseDate: args.purchaseDate,
      reconciliationStatus: reconciliation.reconciliationStatus,
      statementMonth: reconciliation.statementMonth,
      ownership,
      taxDeductible,
      fundingSourceType,
      fundingSourceId,
      postedAt: reconciliation.postedAt,
      reconciledAt: reconciliation.reconciledAt,
      notes: args.notes?.trim() || undefined,
      createdAt: now,
    })

    if (isPurchasePosted(reconciliation.reconciliationStatus)) {
      await recordPurchaseLedger(ctx, {
        userId: identity.subject,
        entryType: 'purchase',
        item: args.item.trim(),
        amount: args.amount,
        category: resolvedCategory,
        purchaseDate: args.purchaseDate,
        purchaseId: String(purchaseId),
      })
    }

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'purchase',
      entityId: String(purchaseId),
      action: 'created',
      after: buildPurchaseAuditSnapshot({
        item: args.item.trim(),
        amount: args.amount,
        category: resolvedCategory,
        purchaseDate: args.purchaseDate,
        reconciliationStatus: reconciliation.reconciliationStatus,
        statementMonth: reconciliation.statementMonth,
        ownership,
        taxDeductible,
        fundingSourceType,
        fundingSourceId,
        notes: args.notes?.trim() || undefined,
      }),
      metadata: {
        source,
        mutationAt: now,
        ruleId: ruleOverride?.ruleId,
      },
    })
  },
})

export const updatePurchase = mutation({
  args: {
    id: v.id('purchases'),
    item: v.string(),
    amount: v.number(),
    category: v.string(),
    purchaseDate: v.string(),
    reconciliationStatus: v.optional(reconciliationStatusValidator),
    statementMonth: v.optional(v.string()),
    ownership: v.optional(purchaseOwnershipValidator),
    taxDeductible: v.optional(v.boolean()),
    fundingSourceType: v.optional(purchaseFundingSourceTypeValidator),
    fundingSourceId: v.optional(v.string()),
    notes: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.item, 'Purchase item')
    validatePositive(args.amount, 'Purchase amount')
    validateOptionalText(args.notes, 'Notes', 2000)
    validateIsoDate(args.purchaseDate, 'Purchase date')
    if (args.statementMonth) {
      validateStatementMonth(args.statementMonth, 'Statement month')
    }
    validateOptionalText(args.fundingSourceId, 'Funding source id', 80)

    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Purchase record not found.')

    const ruleOverride = await resolvePurchaseRuleOverrides(ctx, identity.subject, args.item)
    const resolvedCategory = isGenericCategory(args.category) && ruleOverride?.category ? ruleOverride.category : args.category.trim()
    const requestedStatus = args.reconciliationStatus ?? ruleOverride?.reconciliationStatus
    const ownership: PurchaseOwnership = args.ownership ?? existing.ownership ?? 'shared'
    const taxDeductible = args.taxDeductible ?? existing.taxDeductible ?? false
    const inputFundingSourceType = args.fundingSourceType
    const normalizedInputFundingSourceId = args.fundingSourceId?.trim() || undefined
    const baselineFundingSourceType: PurchaseFundingSourceType = inputFundingSourceType ?? existing.fundingSourceType ?? 'unassigned'
    const baselineFundingSourceId = normalizedInputFundingSourceId ?? existing.fundingSourceId
    const hasExplicitFundingSourceInput =
      inputFundingSourceType !== undefined
        ? inputFundingSourceType !== 'unassigned' || Boolean(normalizedInputFundingSourceId)
        : Boolean(normalizedInputFundingSourceId)
    const useRuleFundingOverride =
      !hasExplicitFundingSourceInput && baselineFundingSourceType === 'unassigned' && !baselineFundingSourceId
    const fundingSourceType: PurchaseFundingSourceType = useRuleFundingOverride
      ? ruleOverride?.fundingSourceType ?? baselineFundingSourceType
      : baselineFundingSourceType
    const fundingSourceIdCandidate = useRuleFundingOverride
      ? ruleOverride?.fundingSourceId?.trim() || baselineFundingSourceId
      : baselineFundingSourceId
    const fundingSourceId = fundingSourceType === 'unassigned' ? undefined : fundingSourceIdCandidate
    if ((fundingSourceType === 'account' || fundingSourceType === 'card') && !fundingSourceId) {
      throw new Error('Choose an account or card source for this purchase.')
    }
    validateRequiredText(resolvedCategory, 'Purchase category')

    const now = Date.now()
    const source = sanitizeMutationSource(args.source, 'manual')
    const reconciliation = resolvePurchaseReconciliation({
      purchaseDate: args.purchaseDate,
      requestedStatus,
      requestedStatementMonth: args.statementMonth,
      existing,
      now,
    })

    if (isPurchasePosted(existing.reconciliationStatus)) {
      await recordPurchaseLedger(ctx, {
        userId: identity.subject,
        entryType: 'purchase_reversal',
        item: existing.item,
        amount: existing.amount,
        category: existing.category,
        purchaseDate: existing.purchaseDate,
        purchaseId: String(existing._id),
      })
    }

    await ctx.db.patch(args.id, {
      item: args.item.trim(),
      amount: args.amount,
      category: resolvedCategory,
      purchaseDate: args.purchaseDate,
      reconciliationStatus: reconciliation.reconciliationStatus,
      statementMonth: reconciliation.statementMonth,
      ownership,
      taxDeductible,
      fundingSourceType,
      fundingSourceId,
      postedAt: reconciliation.postedAt,
      reconciledAt: reconciliation.reconciledAt,
      notes: args.notes?.trim() || undefined,
    })

    if (isPurchasePosted(reconciliation.reconciliationStatus)) {
      await recordPurchaseLedger(ctx, {
        userId: identity.subject,
        entryType: 'purchase',
        item: args.item.trim(),
        amount: args.amount,
        category: resolvedCategory,
        purchaseDate: args.purchaseDate,
        purchaseId: String(args.id),
      })
    }

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'purchase',
      entityId: String(args.id),
      action: 'updated',
      before: buildPurchaseAuditSnapshot(existing),
      after: buildPurchaseAuditSnapshot({
        item: args.item.trim(),
        amount: args.amount,
        category: resolvedCategory,
        purchaseDate: args.purchaseDate,
        reconciliationStatus: reconciliation.reconciliationStatus,
        statementMonth: reconciliation.statementMonth,
        ownership,
        taxDeductible,
        fundingSourceType,
        fundingSourceId,
        notes: args.notes?.trim() || undefined,
      }),
      metadata: {
        source,
        mutationAt: now,
        ruleId: ruleOverride?.ruleId,
      },
    })
  },
})

export const removePurchase = mutation({
  args: {
    id: v.id('purchases'),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Purchase record not found.')
    const now = Date.now()
    const source = sanitizeMutationSource(args.source, 'manual')

    if (isPurchasePosted(existing.reconciliationStatus)) {
      await recordPurchaseLedger(ctx, {
        userId: identity.subject,
        entryType: 'purchase_reversal',
        item: existing.item,
        amount: existing.amount,
        category: existing.category,
        purchaseDate: existing.purchaseDate,
        purchaseId: String(existing._id),
      })
    }

    await ctx.db.delete(args.id)

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'purchase',
      entityId: String(args.id),
      action: 'removed',
      before: buildPurchaseAuditSnapshot(existing),
      metadata: {
        source,
        mutationAt: now,
      },
    })
  },
})

export const setPurchaseReconciliation = mutation({
  args: {
    id: v.id('purchases'),
    reconciliationStatus: reconciliationStatusValidator,
    statementMonth: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Purchase record not found.')

    if (args.statementMonth) {
      validateStatementMonth(args.statementMonth, 'Statement month')
    }

    const now = Date.now()
    const source = sanitizeMutationSource(args.source, 'manual')
    const next = resolvePurchaseReconciliation({
      purchaseDate: existing.purchaseDate,
      requestedStatus: args.reconciliationStatus,
      requestedStatementMonth: args.statementMonth,
      existing,
      now,
    })

    const wasPosted = isPurchasePosted(existing.reconciliationStatus)
    const willBePosted = isPurchasePosted(next.reconciliationStatus)

    if (wasPosted && !willBePosted) {
      await recordPurchaseLedger(ctx, {
        userId: identity.subject,
        entryType: 'purchase_reversal',
        item: existing.item,
        amount: existing.amount,
        category: existing.category,
        purchaseDate: existing.purchaseDate,
        purchaseId: String(existing._id),
      })
    } else if (!wasPosted && willBePosted) {
      await recordPurchaseLedger(ctx, {
        userId: identity.subject,
        entryType: 'purchase',
        item: existing.item,
        amount: existing.amount,
        category: existing.category,
        purchaseDate: existing.purchaseDate,
        purchaseId: String(existing._id),
      })
    }

    await ctx.db.patch(args.id, {
      reconciliationStatus: next.reconciliationStatus,
      statementMonth: next.statementMonth,
      postedAt: next.postedAt,
      reconciledAt: next.reconciledAt,
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'purchase',
      entityId: String(existing._id),
      action: 'reconciliation_updated',
      before: {
        reconciliationStatus: existing.reconciliationStatus ?? 'posted',
        statementMonth: existing.statementMonth ?? existing.purchaseDate.slice(0, 7),
      },
      after: {
        reconciliationStatus: next.reconciliationStatus,
        statementMonth: next.statementMonth,
      },
      metadata: {
        source,
        mutationAt: now,
      },
    })
  },
})

export const getPurchaseMutationHistoryPage = query({
  args: {
    paginationOpts: paginationOptsValidator,
    month: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    if (args.month) {
      validateStatementMonth(args.month, 'Month')
    }

    const result = await ctx.db
      .query('financeAuditEvents')
      .withIndex('by_userId_entityType_createdAt', (q) =>
        q.eq('userId', identity.subject).eq('entityType', 'purchase'),
      )
      .order('desc')
      .paginate(args.paginationOpts)

    if (!args.month) {
      return result
    }

    return {
      ...result,
      page: result.page.filter((event) => new Date(event.createdAt).toISOString().slice(0, 7) === args.month),
    }
  },
})

export const getPurchaseHistorySummary = query({
  args: {
    windowDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    const windowDays = clamp(Math.floor(args.windowDays ?? 90), 7, 3650)
    const now = Date.now()
    const windowStart = now - windowDays * 86400000

    if (!identity) {
      return {
        windowDays,
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
    }

    const [purchases, mutationEvents, purchaseCloseRuns] = await Promise.all([
      ctx.db
        .query('purchases')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject).gte('createdAt', windowStart))
        .collect(),
      ctx.db
        .query('financeAuditEvents')
        .withIndex('by_userId_entityType_createdAt', (q) =>
          q.eq('userId', identity.subject).eq('entityType', 'purchase').gte('createdAt', windowStart),
        )
        .collect(),
      ctx.db
        .query('purchaseMonthCloseRuns')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject).gte('createdAt', windowStart))
        .collect(),
    ])

    const pending = purchases.filter((entry) => (entry.reconciliationStatus ?? 'posted') === 'pending')
    const posted = purchases.filter((entry) => (entry.reconciliationStatus ?? 'posted') === 'posted')
    const reconciled = purchases.filter((entry) => (entry.reconciliationStatus ?? 'posted') === 'reconciled')
    const totalAmount = roundCurrency([...posted, ...reconciled].reduce((sum, entry) => sum + entry.amount, 0))
    const missingCategoryCount = purchases.filter((entry) => isGenericCategory(entry.category)).length

    const duplicateMap = new Map<string, number>()
    purchases.forEach((entry) => {
      const key = `${entry.item.trim().toLowerCase()}::${roundCurrency(entry.amount)}::${entry.purchaseDate}`
      duplicateMap.set(key, (duplicateMap.get(key) ?? 0) + 1)
    })
    const duplicateCount = Array.from(duplicateMap.values()).filter((count) => count > 1).length

    const amounts = purchases.map((entry) => entry.amount)
    const mean = amounts.length > 0 ? amounts.reduce((sum, value) => sum + value, 0) / amounts.length : 0
    const variance =
      amounts.length > 1
        ? amounts.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (amounts.length - 1)
        : 0
    const std = Math.sqrt(variance)
    const anomalyCount = purchases.filter((entry) => std > 0 && entry.amount > mean + std * 2.5 && entry.amount > 50).length

    const completedRuns = purchaseCloseRuns.filter((run) => run.status === 'completed')
    const failedRuns = purchaseCloseRuns.filter((run) => run.status === 'failed')
    const lastCompletedRun = completedRuns.sort((left, right) => right.ranAt - left.ranAt)[0]
    const lastMutationAt = mutationEvents.reduce<number | null>((latest, event) => {
      if (latest === null) return event.createdAt
      return Math.max(latest, event.createdAt)
    }, null)

    return {
      windowDays,
      totalPurchases: purchases.length,
      totalAmount,
      pendingCount: pending.length,
      postedCount: posted.length,
      reconciledCount: reconciled.length,
      missingCategoryCount,
      duplicateCount,
      anomalyCount,
      mutationCount: mutationEvents.length,
      lastMutationAt,
      completedMonthCloseRuns: completedRuns.length,
      failedMonthCloseRuns: failedRuns.length,
      lastMonthCloseAt: lastCompletedRun?.ranAt ?? null,
      lastCompletedMonthCloseKey: lastCompletedRun?.monthKey ?? null,
    }
  },
})

export const getRecentPurchaseMonthCloseRuns = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 12)))
    return await ctx.db
      .query('purchaseMonthCloseRuns')
      .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
      .order('desc')
      .take(limit)
  },
})

export const getPurchaseMonthClosePrecheck = query({
  args: {
    month: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    validateStatementMonth(args.month, 'Month')

    const [purchases, runsForMonth] = await Promise.all([
      ctx.db
        .query('purchases')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('purchaseMonthCloseRuns')
        .withIndex('by_userId_monthKey', (q) => q.eq('userId', identity.subject).eq('monthKey', args.month))
        .collect(),
    ])

    const summary = computePurchaseMonthCloseSummary(args.month, purchases)
    const blockers: ReconciliationPreCloseIssue[] = []
    const warnings: ReconciliationPreCloseIssue[] = []

    if (summary.purchaseCount === 0) {
      warnings.push({
        id: 'no_transactions',
        severity: 'warning',
        label: 'No transactions in month',
        detail: 'No purchases were found for this month key. Close can still run to checkpoint an empty period.',
      })
    }

    if (summary.pendingCount > 0) {
      blockers.push({
        id: 'pending_unresolved',
        severity: 'blocker',
        label: `${summary.pendingCount} pending transactions`,
        detail: `${roundCurrency(summary.pendingAmount)} remains unresolved. Match or exclude before close.`,
      })
    }

    if (summary.duplicateCount > 0) {
      blockers.push({
        id: 'duplicates_detected',
        severity: 'blocker',
        label: `${summary.duplicateCount} duplicate groups`,
        detail: 'Resolve duplicate or overlap candidates before month close for reliable totals.',
      })
    }

    if (summary.anomalyCount > 0) {
      blockers.push({
        id: 'anomalies_detected',
        severity: 'blocker',
        label: `${summary.anomalyCount} anomaly outliers`,
        detail: 'Review unusual amount outliers before close so reporting does not carry suspect values.',
      })
    }

    if (summary.missingCategoryCount > 0) {
      warnings.push({
        id: 'missing_category',
        severity: 'warning',
        label: `${summary.missingCategoryCount} missing categories`,
        detail: 'Recommended to categorize before close to improve planning and forecast quality.',
      })
    }

    const latestRun = runsForMonth.sort((left, right) => right.ranAt - left.ranAt)[0] ?? null
    const completedRuns = runsForMonth.filter((entry) => entry.status === 'completed').length
    const failedRuns = runsForMonth.filter((entry) => entry.status === 'failed').length
    const closeSuccessRate = completedRuns + failedRuns > 0 ? completedRuns / (completedRuns + failedRuns) : 1

    return {
      monthKey: args.month,
      summary,
      blockers,
      warnings,
      canClose: blockers.length === 0,
      blockerCount: blockers.length,
      warningCount: warnings.length,
      closeSuccessRate,
      completedRuns,
      failedRuns,
      latestRun,
    }
  },
})

export const getRecentReconciliationAuditEvents = query({
  args: {
    month: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const limit = clamp(Math.floor(args.limit ?? 50), 1, 200)
    if (args.month) {
      validateStatementMonth(args.month, 'Month')
    }

    const [purchaseEvents, closeEvents] = await Promise.all([
      ctx.db
        .query('financeAuditEvents')
        .withIndex('by_userId_entityType_createdAt', (q) =>
          q.eq('userId', identity.subject).eq('entityType', 'purchase'),
        )
        .order('desc')
        .take(limit * 2),
      ctx.db
        .query('financeAuditEvents')
        .withIndex('by_userId_entityType_createdAt', (q) =>
          q.eq('userId', identity.subject).eq('entityType', 'purchase_month_close'),
        )
        .order('desc')
        .take(limit * 2),
    ])

    const merged = [...purchaseEvents, ...closeEvents]
      .filter((event) => {
        if (!args.month) return true
        if (event.entityType === 'purchase_month_close') {
          return event.entityId === args.month
        }
        const eventMonth = new Date(event.createdAt).toISOString().slice(0, 7)
        return eventMonth === args.month
      })
      .sort((left, right) => right.createdAt - left.createdAt)

    return merged.slice(0, limit)
  },
})

export const runPurchaseMonthClose = mutation({
  args: {
    month: v.optional(v.string()),
    now: v.optional(v.number()),
    source: v.optional(cycleRunSourceValidator),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const nowTimestamp = args.now ?? Date.now()
    const nowDate = new Date(nowTimestamp)
    const monthKey = resolvePurchaseMonthKey(args.month, nowDate)
    const source = args.source ?? 'manual'
    const providedIdempotencyKey = args.idempotencyKey?.trim() || undefined
    const idempotencyKey = providedIdempotencyKey ?? `${source}:${monthKey}`

    if (idempotencyKey) {
      const existingRuns = await ctx.db
        .query('purchaseMonthCloseRuns')
        .withIndex('by_userId_idempotencyKey', (q) =>
          q.eq('userId', identity.subject).eq('idempotencyKey', idempotencyKey),
        )
        .collect()
      const existingCompleted = existingRuns
        .filter((entry) => entry.status === 'completed')
        .sort((left, right) => right.createdAt - left.createdAt)[0]

      if (existingCompleted) {
        const parsedSummary = parseAuditJson<PurchaseMonthCloseSummary>(existingCompleted.summaryJson)
        return {
          status: existingCompleted.status,
          wasDeduplicated: true,
          monthKey: existingCompleted.monthKey,
          source: existingCompleted.source,
          idempotencyKey: existingCompleted.idempotencyKey ?? null,
          runId: String(existingCompleted._id),
          ranAt: existingCompleted.ranAt,
          summary: parsedSummary ?? {
            monthKey: existingCompleted.monthKey,
            purchaseCount: existingCompleted.totalPurchases,
            totalAmount: existingCompleted.totalAmount,
            pendingAmount: existingCompleted.pendingAmount,
            pendingCount: existingCompleted.pendingCount,
            postedCount: existingCompleted.postedCount,
            reconciledCount: existingCompleted.reconciledCount,
            duplicateCount: existingCompleted.duplicateCount,
            anomalyCount: existingCompleted.anomalyCount,
            missingCategoryCount: existingCompleted.missingCategoryCount,
            categoryBreakdown: [],
          },
          failureReason: existingCompleted.failureReason ?? null,
        }
      }
    }

    try {
      const purchases = await ctx.db
        .query('purchases')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .collect()
      const summary = computePurchaseMonthCloseSummary(monthKey, purchases)

      const snapshotDate = new Date(`${monthKey}-01T00:00:00`)
      const summarySnapshot = await computeMonthCloseSnapshotSummary(ctx, identity.subject, snapshotDate)
      const existingSnapshot = await ctx.db
        .query('monthCloseSnapshots')
        .withIndex('by_userId_cycleKey', (q) => q.eq('userId', identity.subject).eq('cycleKey', monthKey))
        .first()

      if (existingSnapshot) {
        await ctx.db.patch(existingSnapshot._id, {
          ranAt: nowTimestamp,
          summary: summarySnapshot,
        })
      } else {
        await ctx.db.insert('monthCloseSnapshots', {
          userId: identity.subject,
          cycleKey: monthKey,
          ranAt: nowTimestamp,
          summary: summarySnapshot,
          createdAt: Date.now(),
        })
      }

      const runId = await ctx.db.insert('purchaseMonthCloseRuns', {
        userId: identity.subject,
        monthKey,
        source,
        status: 'completed',
        idempotencyKey: idempotencyKey ?? undefined,
        failureReason: undefined,
        summaryJson: stringifyForAudit(summary),
        totalPurchases: summary.purchaseCount,
        totalAmount: summary.totalAmount,
        pendingCount: summary.pendingCount,
        postedCount: summary.postedCount,
        reconciledCount: summary.reconciledCount,
        pendingAmount: summary.pendingAmount,
        duplicateCount: summary.duplicateCount,
        anomalyCount: summary.anomalyCount,
        missingCategoryCount: summary.missingCategoryCount,
        ranAt: nowTimestamp,
        createdAt: Date.now(),
      })

      await recordFinanceAuditEvent(ctx, {
        userId: identity.subject,
        entityType: 'purchase_month_close',
        entityId: monthKey,
        action: 'run_completed',
        after: summary,
        metadata: {
          source,
          idempotencyKey,
          runId: String(runId),
          ranAt: nowTimestamp,
        },
      })

      return {
        status: 'completed' as const,
        wasDeduplicated: false,
        monthKey,
        source,
        idempotencyKey: idempotencyKey ?? null,
        runId: String(runId),
        ranAt: nowTimestamp,
        summary,
        failureReason: null,
      }
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : String(error)
      const failedRunId = await ctx.db.insert('purchaseMonthCloseRuns', {
        userId: identity.subject,
        monthKey,
        source,
        status: 'failed',
        idempotencyKey: idempotencyKey ?? undefined,
        failureReason: failureReason.slice(0, 280),
        summaryJson: undefined,
        totalPurchases: 0,
        totalAmount: 0,
        pendingCount: 0,
        postedCount: 0,
        reconciledCount: 0,
        pendingAmount: 0,
        duplicateCount: 0,
        anomalyCount: 0,
        missingCategoryCount: 0,
        ranAt: nowTimestamp,
        createdAt: Date.now(),
      })

      await recordFinanceAuditEvent(ctx, {
        userId: identity.subject,
        entityType: 'purchase_month_close',
        entityId: monthKey,
        action: 'run_failed',
        metadata: {
          source,
          idempotencyKey,
          runId: String(failedRunId),
          ranAt: nowTimestamp,
          failureReason,
        },
      })

      throw error instanceof Error ? error : new Error(failureReason)
    }
  },
})

export const addAccount = mutation({
  args: {
    name: v.string(),
    type: accountTypeValidator,
    balance: v.number(),
    ledgerBalance: v.optional(v.number()),
    pendingBalance: v.optional(v.number()),
    purpose: v.optional(accountPurposeValidator),
    liquid: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.name, 'Account name')
    validateFinite(args.balance, 'Account balance')
    if (args.ledgerBalance !== undefined) {
      validateFinite(args.ledgerBalance, 'Account ledger balance')
    }
    if (args.pendingBalance !== undefined) {
      validateFinite(args.pendingBalance, 'Account pending balance')
    }

    const balances = resolveAccountBalancesForWrite({
      balance: args.balance,
      ledgerBalance: args.ledgerBalance,
      pendingBalance: args.pendingBalance,
    })
    const purpose = resolveAccountPurpose(args.type, args.purpose)

    const createdAccountId = await ctx.db.insert('accounts', {
      userId: identity.subject,
      name: args.name.trim(),
      type: args.type,
      balance: balances.balance,
      ledgerBalance: balances.ledgerBalance,
      pendingBalance: balances.pendingBalance,
      purpose,
      liquid: args.liquid,
      createdAt: Date.now(),
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'account',
      entityId: String(createdAccountId),
      action: 'created',
      after: {
        name: args.name.trim(),
        type: args.type,
        balance: balances.balance,
        ledgerBalance: balances.ledgerBalance,
        pendingBalance: balances.pendingBalance,
        purpose,
        liquid: args.liquid,
      },
    })
  },
})

export const updateAccount = mutation({
  args: {
    id: v.id('accounts'),
    name: v.string(),
    type: accountTypeValidator,
    balance: v.number(),
    ledgerBalance: v.optional(v.number()),
    pendingBalance: v.optional(v.number()),
    purpose: v.optional(accountPurposeValidator),
    liquid: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.name, 'Account name')
    validateFinite(args.balance, 'Account balance')
    if (args.ledgerBalance !== undefined) {
      validateFinite(args.ledgerBalance, 'Account ledger balance')
    }
    if (args.pendingBalance !== undefined) {
      validateFinite(args.pendingBalance, 'Account pending balance')
    }

    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Account record not found.')

    const balances = resolveAccountBalancesForWrite({
      balance: args.balance,
      ledgerBalance: args.ledgerBalance,
      pendingBalance: args.pendingBalance,
    })
    const purpose = resolveAccountPurpose(args.type, args.purpose ?? existing.purpose)

    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      type: args.type,
      balance: balances.balance,
      ledgerBalance: balances.ledgerBalance,
      pendingBalance: balances.pendingBalance,
      purpose,
      liquid: args.liquid,
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'account',
      entityId: String(args.id),
      action: 'updated',
      before: {
        name: existing.name,
        type: existing.type,
        balance: existing.balance,
        ledgerBalance: existing.ledgerBalance ?? existing.balance,
        pendingBalance: existing.pendingBalance ?? 0,
        purpose: resolveAccountPurpose(existing.type as AccountType, existing.purpose),
        liquid: existing.liquid,
      },
      after: {
        name: args.name.trim(),
        type: args.type,
        balance: balances.balance,
        ledgerBalance: balances.ledgerBalance,
        pendingBalance: balances.pendingBalance,
        purpose,
        liquid: args.liquid,
      },
    })
  },
})

export const removeAccount = mutation({
  args: {
    id: v.id('accounts'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Account record not found.')

    const mappedIncomeEntries = await ctx.db
      .query('incomes')
      .withIndex('by_userId_destinationAccountId', (q) =>
        q.eq('userId', identity.subject).eq('destinationAccountId', args.id),
      )
      .collect()

    const [sourceTransfers, destinationTransfers, reconciliationChecks] = await Promise.all([
      ctx.db
        .query('accountTransfers')
        .withIndex('by_userId_sourceAccountId_createdAt', (q) => q.eq('userId', identity.subject).eq('sourceAccountId', args.id))
        .collect(),
      ctx.db
        .query('accountTransfers')
        .withIndex('by_userId_destinationAccountId_createdAt', (q) =>
          q.eq('userId', identity.subject).eq('destinationAccountId', args.id),
        )
        .collect(),
      ctx.db
        .query('accountReconciliationChecks')
        .withIndex('by_userId_accountId_cycleMonth', (q) => q.eq('userId', identity.subject).eq('accountId', args.id))
        .collect(),
    ])

    const transferIds = new Set<string>()
    const transfersToDelete: Array<Id<'accountTransfers'>> = []
    for (const transfer of [...sourceTransfers, ...destinationTransfers]) {
      const id = String(transfer._id)
      if (!transferIds.has(id)) {
        transferIds.add(id)
        transfersToDelete.push(transfer._id)
      }
    }

    await Promise.all(
      mappedIncomeEntries.map((income) =>
        ctx.db.patch(income._id, {
          destinationAccountId: undefined,
        }),
      ),
    )

    await Promise.all(transfersToDelete.map((id) => ctx.db.delete(id)))
    await Promise.all(reconciliationChecks.map((entry) => ctx.db.delete(entry._id)))

    await ctx.db.delete(args.id)

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'account',
      entityId: String(args.id),
      action: 'removed',
      before: {
        name: existing.name,
        type: existing.type,
        balance: existing.balance,
        ledgerBalance: existing.ledgerBalance ?? existing.balance,
        pendingBalance: existing.pendingBalance ?? 0,
        purpose: resolveAccountPurpose(existing.type as AccountType, existing.purpose),
        liquid: existing.liquid,
      },
      metadata: {
        detachedIncomeMappings: mappedIncomeEntries.length,
        removedTransferEntries: transfersToDelete.length,
        removedReconciliationEntries: reconciliationChecks.length,
      },
    })
  },
})

export const addAccountTransfer = mutation({
  args: {
    sourceAccountId: v.id('accounts'),
    destinationAccountId: v.id('accounts'),
    amount: v.number(),
    transferDate: v.string(),
    reference: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validatePositive(args.amount, 'Transfer amount')
    validateIsoDate(args.transferDate, 'Transfer date')
    validateOptionalText(args.reference, 'Transfer reference', 120)
    validateOptionalText(args.note, 'Transfer note', 800)

    if (args.sourceAccountId === args.destinationAccountId) {
      throw new Error('Choose different source and destination accounts.')
    }

    const [sourceAccount, destinationAccount] = await Promise.all([
      ctx.db.get(args.sourceAccountId),
      ctx.db.get(args.destinationAccountId),
    ])

    ensureOwned(sourceAccount, identity.subject, 'Source account not found.')
    ensureOwned(destinationAccount, identity.subject, 'Destination account not found.')

    const sourceNext = applyAccountBalanceDelta(sourceAccount, -args.amount)
    const destinationNext = applyAccountBalanceDelta(destinationAccount, args.amount)

    await Promise.all([
      ctx.db.patch(sourceAccount._id, {
        balance: sourceNext.balance,
        ledgerBalance: sourceNext.ledgerBalance,
        pendingBalance: sourceNext.pendingBalance,
      }),
      ctx.db.patch(destinationAccount._id, {
        balance: destinationNext.balance,
        ledgerBalance: destinationNext.ledgerBalance,
        pendingBalance: destinationNext.pendingBalance,
      }),
    ])

    const transferId = await ctx.db.insert('accountTransfers', {
      userId: identity.subject,
      sourceAccountId: args.sourceAccountId,
      destinationAccountId: args.destinationAccountId,
      amount: roundCurrency(args.amount),
      transferDate: args.transferDate,
      reference: args.reference?.trim() || undefined,
      note: args.note?.trim() || undefined,
      createdAt: Date.now(),
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'account_transfer',
      entityId: String(transferId),
      action: 'created',
      before: {
        sourceAccount: {
          id: String(sourceAccount._id),
          balance: sourceAccount.balance,
          ledgerBalance: sourceAccount.ledgerBalance ?? sourceAccount.balance,
          pendingBalance: sourceAccount.pendingBalance ?? 0,
        },
        destinationAccount: {
          id: String(destinationAccount._id),
          balance: destinationAccount.balance,
          ledgerBalance: destinationAccount.ledgerBalance ?? destinationAccount.balance,
          pendingBalance: destinationAccount.pendingBalance ?? 0,
        },
      },
      after: {
        sourceAccount: {
          id: String(sourceAccount._id),
          balance: sourceNext.balance,
          ledgerBalance: sourceNext.ledgerBalance,
          pendingBalance: sourceNext.pendingBalance,
        },
        destinationAccount: {
          id: String(destinationAccount._id),
          balance: destinationNext.balance,
          ledgerBalance: destinationNext.ledgerBalance,
          pendingBalance: destinationNext.pendingBalance,
        },
      },
      metadata: {
        amount: roundCurrency(args.amount),
        transferDate: args.transferDate,
        sourceAccountName: sourceAccount.name,
        destinationAccountName: destinationAccount.name,
        reference: args.reference?.trim() || null,
      },
    })

    return { transferId }
  },
})

export const upsertAccountReconciliationCheck = mutation({
  args: {
    accountId: v.id('accounts'),
    cycleMonth: v.string(),
    statementStartBalance: v.number(),
    statementEndBalance: v.number(),
    reconciled: v.boolean(),
    applyAdjustment: v.optional(v.boolean()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateStatementMonth(args.cycleMonth, 'Cycle month')
    validateFinite(args.statementStartBalance, 'Statement start balance')
    validateFinite(args.statementEndBalance, 'Statement end balance')
    validateOptionalText(args.note, 'Reconciliation note', 1200)

    const account = await ctx.db.get(args.accountId)
    ensureOwned(account, identity.subject, 'Account not found.')

    const existingChecks = await ctx.db
      .query('accountReconciliationChecks')
      .withIndex('by_userId_accountId_cycleMonth', (q) =>
        q.eq('userId', identity.subject).eq('accountId', args.accountId).eq('cycleMonth', args.cycleMonth),
      )
      .collect()

    const existing = existingChecks
      .sort((left, right) => (right.updatedAt ?? right.createdAt) - (left.updatedAt ?? left.createdAt))[0] ?? null

    const startBalances = resolveAccountBalancesForRead(account)
    let nextLedgerBalance = startBalances.ledgerBalance
    let nextBalance = startBalances.balance
    let adjustmentApplied = 0

    if (args.applyAdjustment === true) {
      adjustmentApplied = roundCurrency(args.statementEndBalance - nextLedgerBalance)
      if (Math.abs(adjustmentApplied) > 0.000001) {
        const adjustmentPatch = applyAccountBalanceDelta(account, adjustmentApplied)
        nextLedgerBalance = adjustmentPatch.ledgerBalance
        nextBalance = adjustmentPatch.balance
        await ctx.db.patch(account._id, {
          balance: adjustmentPatch.balance,
          ledgerBalance: adjustmentPatch.ledgerBalance,
          pendingBalance: adjustmentPatch.pendingBalance,
        })

        await recordFinanceAuditEvent(ctx, {
          userId: identity.subject,
          entityType: 'account',
          entityId: String(account._id),
          action: 'reconciliation_adjustment',
          before: {
            balance: account.balance,
            ledgerBalance: startBalances.ledgerBalance,
            pendingBalance: startBalances.pendingBalance,
          },
          after: {
            balance: adjustmentPatch.balance,
            ledgerBalance: adjustmentPatch.ledgerBalance,
            pendingBalance: adjustmentPatch.pendingBalance,
          },
          metadata: {
            cycleMonth: args.cycleMonth,
            adjustmentApplied,
          },
        })
      }
    }

    const unmatchedDelta = roundCurrency(args.statementEndBalance - nextLedgerBalance)
    const now = Date.now()
    const normalizedNote = args.note?.trim() || undefined
    let checkId: Id<'accountReconciliationChecks'>

    if (existing) {
      checkId = existing._id
      await ctx.db.patch(existing._id, {
        statementStartBalance: roundCurrency(args.statementStartBalance),
        statementEndBalance: roundCurrency(args.statementEndBalance),
        ledgerEndBalance: roundCurrency(nextLedgerBalance),
        unmatchedDelta,
        reconciled: args.reconciled,
        note: normalizedNote,
        updatedAt: now,
      })
    } else {
      checkId = await ctx.db.insert('accountReconciliationChecks', {
        userId: identity.subject,
        accountId: args.accountId,
        cycleMonth: args.cycleMonth,
        statementStartBalance: roundCurrency(args.statementStartBalance),
        statementEndBalance: roundCurrency(args.statementEndBalance),
        ledgerEndBalance: roundCurrency(nextLedgerBalance),
        unmatchedDelta,
        reconciled: args.reconciled,
        note: normalizedNote,
        createdAt: now,
        updatedAt: now,
      })
    }

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'account_reconciliation',
      entityId: String(checkId),
      action: existing ? 'updated' : 'created',
      before: existing
        ? {
            statementStartBalance: existing.statementStartBalance,
            statementEndBalance: existing.statementEndBalance,
            ledgerEndBalance: existing.ledgerEndBalance,
            unmatchedDelta: existing.unmatchedDelta,
            reconciled: existing.reconciled,
            note: existing.note ?? null,
          }
        : undefined,
      after: {
        statementStartBalance: roundCurrency(args.statementStartBalance),
        statementEndBalance: roundCurrency(args.statementEndBalance),
        ledgerEndBalance: roundCurrency(nextLedgerBalance),
        unmatchedDelta,
        reconciled: args.reconciled,
        note: normalizedNote ?? null,
      },
      metadata: {
        accountId: String(args.accountId),
        accountName: account.name,
        cycleMonth: args.cycleMonth,
        adjustmentApplied: roundCurrency(adjustmentApplied),
        resultingAccountBalance: roundCurrency(nextBalance),
      },
    })

    return {
      checkId,
      cycleMonth: args.cycleMonth,
      unmatchedDelta,
      reconciled: args.reconciled,
      adjustmentApplied: roundCurrency(adjustmentApplied),
      ledgerEndBalance: roundCurrency(nextLedgerBalance),
    }
  },
})

export const addGoal = mutation({
  args: {
    title: v.string(),
    targetAmount: v.number(),
    currentAmount: v.number(),
    targetDate: v.string(),
    priority: goalPriorityValidator,
    goalType: v.optional(goalTypeValidator),
    contributionAmount: v.optional(v.number()),
    cadence: v.optional(cadenceValidator),
    customInterval: v.optional(v.number()),
    customUnit: v.optional(customCadenceUnitValidator),
    fundingSources: v.optional(v.array(goalFundingSourceMapItemValidator)),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.title, 'Goal title')
    validatePositive(args.targetAmount, 'Target amount')
    validateNonNegative(args.currentAmount, 'Current amount')
    validateIsoDate(args.targetDate, 'Target date')
    const goalType = normalizeGoalType(args.goalType)
    const contributionAmount = normalizeGoalContributionAmount(args.contributionAmount)
    const cadenceConfig = normalizeGoalCadenceConfig({
      cadence: args.cadence,
      customInterval: args.customInterval,
      customUnit: args.customUnit,
    })
    const fundingSources = await normalizeGoalFundingSources(ctx, identity.subject, args.fundingSources)
    const now = Date.now()

    const createdGoalId = await ctx.db.insert('goals', {
      userId: identity.subject,
      title: args.title.trim(),
      targetAmount: args.targetAmount,
      currentAmount: args.currentAmount,
      targetDate: args.targetDate,
      priority: args.priority,
      goalType,
      contributionAmount,
      cadence: cadenceConfig.cadence,
      customInterval: cadenceConfig.customInterval,
      customUnit: cadenceConfig.customUnit,
      fundingSources,
      paused: false,
      pausedAt: undefined,
      pauseReason: undefined,
      createdAt: now,
    })

    await insertGoalEvent(ctx, {
      userId: identity.subject,
      goalId: createdGoalId,
      eventType: 'created',
      source: 'manual',
      afterCurrentAmount: args.currentAmount,
      afterTargetAmount: args.targetAmount,
      afterTargetDate: args.targetDate,
      pausedAfter: false,
      metadata: {
        title: args.title.trim(),
        priority: args.priority,
        goalType,
        contributionAmount,
        cadence: cadenceConfig.cadence,
        customInterval: cadenceConfig.customInterval ?? null,
        customUnit: cadenceConfig.customUnit ?? null,
        fundingSources,
      },
      occurredAt: now,
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'goal',
      entityId: String(createdGoalId),
      action: 'created',
      after: {
        title: args.title.trim(),
        targetAmount: args.targetAmount,
        currentAmount: args.currentAmount,
        targetDate: args.targetDate,
        priority: args.priority,
        goalType,
        contributionAmount,
        cadence: cadenceConfig.cadence,
        customInterval: cadenceConfig.customInterval ?? null,
        customUnit: cadenceConfig.customUnit ?? null,
        fundingSources,
        paused: false,
        pausedAt: null,
        pauseReason: null,
      },
    })
  },
})

export const updateGoal = mutation({
  args: {
    id: v.id('goals'),
    title: v.string(),
    targetAmount: v.number(),
    currentAmount: v.number(),
    targetDate: v.string(),
    priority: goalPriorityValidator,
    goalType: v.optional(goalTypeValidator),
    contributionAmount: v.optional(v.number()),
    cadence: v.optional(cadenceValidator),
    customInterval: v.optional(v.number()),
    customUnit: v.optional(customCadenceUnitValidator),
    fundingSources: v.optional(v.array(goalFundingSourceMapItemValidator)),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    validateRequiredText(args.title, 'Goal title')
    validatePositive(args.targetAmount, 'Target amount')
    validateNonNegative(args.currentAmount, 'Current amount')
    validateIsoDate(args.targetDate, 'Target date')
    const goalType = normalizeGoalType(args.goalType)
    const contributionAmount = normalizeGoalContributionAmount(args.contributionAmount)
    const cadenceConfig = normalizeGoalCadenceConfig({
      cadence: args.cadence,
      customInterval: args.customInterval,
      customUnit: args.customUnit,
    })

    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Goal record not found.')
    const fundingSources = await normalizeGoalFundingSources(ctx, identity.subject, args.fundingSources)
    const beforeSnapshot = buildGoalSnapshot(existing)
    const afterSnapshot = {
      title: args.title.trim(),
      targetAmount: roundCurrency(args.targetAmount),
      currentAmount: roundCurrency(args.currentAmount),
      targetDate: args.targetDate,
      priority: args.priority,
      goalType,
      contributionAmount,
      cadence: cadenceConfig.cadence,
      customInterval: cadenceConfig.cadence === 'custom' ? cadenceConfig.customInterval ?? null : null,
      customUnit: cadenceConfig.cadence === 'custom' ? cadenceConfig.customUnit ?? null : null,
      fundingSources,
      paused: existing.paused === true,
      pausedAt: typeof existing.pausedAt === 'number' ? existing.pausedAt : null,
      pauseReason: existing.pauseReason ?? null,
    }
    const now = Date.now()

    await ctx.db.patch(args.id, {
      title: args.title.trim(),
      targetAmount: args.targetAmount,
      currentAmount: args.currentAmount,
      targetDate: args.targetDate,
      priority: args.priority,
      goalType,
      contributionAmount,
      cadence: cadenceConfig.cadence,
      customInterval: cadenceConfig.customInterval,
      customUnit: cadenceConfig.customUnit,
      fundingSources,
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'goal',
      entityId: String(args.id),
      action: 'updated',
      before: beforeSnapshot,
      after: afterSnapshot,
    })

    const fundingSourcesChanged = stringifyForAudit(beforeSnapshot.fundingSources) !== stringifyForAudit(afterSnapshot.fundingSources)
    const targetChanged =
      beforeSnapshot.targetAmount !== afterSnapshot.targetAmount || beforeSnapshot.targetDate !== afterSnapshot.targetDate
    const scheduleChanged =
      beforeSnapshot.contributionAmount !== afterSnapshot.contributionAmount ||
      beforeSnapshot.cadence !== afterSnapshot.cadence ||
      beforeSnapshot.customInterval !== afterSnapshot.customInterval ||
      beforeSnapshot.customUnit !== afterSnapshot.customUnit ||
      fundingSourcesChanged
    const progressChanged = beforeSnapshot.currentAmount !== afterSnapshot.currentAmount
    const descriptorChanged =
      beforeSnapshot.title !== afterSnapshot.title ||
      beforeSnapshot.priority !== afterSnapshot.priority ||
      beforeSnapshot.goalType !== afterSnapshot.goalType

    if (progressChanged) {
      await insertGoalEvent(ctx, {
        userId: identity.subject,
        goalId: args.id,
        eventType: 'progress_adjustment',
        source: 'manual',
        amountDelta: roundCurrency(afterSnapshot.currentAmount - beforeSnapshot.currentAmount),
        beforeCurrentAmount: beforeSnapshot.currentAmount,
        afterCurrentAmount: afterSnapshot.currentAmount,
        metadata: {
          mode: 'edit_goal',
          title: afterSnapshot.title,
        },
        occurredAt: now,
      })
    }

    if (targetChanged) {
      await insertGoalEvent(ctx, {
        userId: identity.subject,
        goalId: args.id,
        eventType: 'target_changed',
        source: 'manual',
        beforeTargetAmount: beforeSnapshot.targetAmount,
        afterTargetAmount: afterSnapshot.targetAmount,
        beforeTargetDate: beforeSnapshot.targetDate,
        afterTargetDate: afterSnapshot.targetDate,
        metadata: {
          title: afterSnapshot.title,
        },
        occurredAt: now,
      })
    }

    if (scheduleChanged) {
      await insertGoalEvent(ctx, {
        userId: identity.subject,
        goalId: args.id,
        eventType: 'schedule_changed',
        source: 'manual',
        metadata: {
          before: {
            contributionAmount: beforeSnapshot.contributionAmount,
            cadence: beforeSnapshot.cadence,
            customInterval: beforeSnapshot.customInterval,
            customUnit: beforeSnapshot.customUnit,
            fundingSources: beforeSnapshot.fundingSources,
          },
          after: {
            contributionAmount: afterSnapshot.contributionAmount,
            cadence: afterSnapshot.cadence,
            customInterval: afterSnapshot.customInterval,
            customUnit: afterSnapshot.customUnit,
            fundingSources: afterSnapshot.fundingSources,
          },
          title: afterSnapshot.title,
        },
        occurredAt: now,
      })
    }

    if (descriptorChanged) {
      await insertGoalEvent(ctx, {
        userId: identity.subject,
        goalId: args.id,
        eventType: 'edited',
        source: 'manual',
        metadata: {
          before: {
            title: beforeSnapshot.title,
            priority: beforeSnapshot.priority,
            goalType: beforeSnapshot.goalType,
          },
          after: {
            title: afterSnapshot.title,
            priority: afterSnapshot.priority,
            goalType: afterSnapshot.goalType,
          },
        },
        occurredAt: now,
      })
    }
  },
})

export const updateGoalProgress = mutation({
  args: {
    id: v.id('goals'),
    currentAmount: v.number(),
    source: v.optional(goalEventSourceValidator),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    validateNonNegative(args.currentAmount, 'Current amount')
    validateOptionalText(args.note, 'Goal progress note', 800)

    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Goal record not found.')

    const beforeValue = existing.currentAmount
    const now = Date.now()

    await ctx.db.patch(args.id, {
      currentAmount: args.currentAmount,
    })

    await insertGoalEvent(ctx, {
      userId: identity.subject,
      goalId: args.id,
      eventType: 'progress_adjustment',
      source: args.source ?? 'manual',
      amountDelta: roundCurrency(args.currentAmount - beforeValue),
      beforeCurrentAmount: beforeValue,
      afterCurrentAmount: args.currentAmount,
      note: args.note,
      metadata: {
        mode: 'absolute',
        title: existing.title,
      },
      occurredAt: now,
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'goal',
      entityId: String(args.id),
      action: 'progress_updated',
      before: {
        currentAmount: beforeValue,
      },
      after: {
        currentAmount: args.currentAmount,
      },
      metadata: {
        source: args.source ?? 'manual',
        note: args.note?.trim() || undefined,
      },
    })
  },
})

export const recordGoalContribution = mutation({
  args: {
    goalId: v.id('goals'),
    amount: v.number(),
    source: v.optional(goalEventSourceValidator),
    note: v.optional(v.string()),
    fundingSourceType: v.optional(goalFundingSourceTypeValidator),
    fundingSourceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    validatePositive(args.amount, 'Goal contribution amount')
    validateOptionalText(args.note, 'Goal contribution note', 800)
    if (args.fundingSourceId !== undefined) {
      validateOptionalText(args.fundingSourceId, 'Goal contribution funding source id', 200)
    }
    if ((args.fundingSourceType && !args.fundingSourceId) || (!args.fundingSourceType && args.fundingSourceId)) {
      throw new Error('Goal contribution funding source type and id must be provided together.')
    }

    const goal = await ctx.db.get(args.goalId)
    ensureOwned(goal, identity.subject, 'Goal record not found.')

    let normalizedFundingSourceId: string | undefined
    if (args.fundingSourceType && args.fundingSourceId) {
      normalizedFundingSourceId = normalizeGoalFundingSourceId(args.fundingSourceId)
      if (args.fundingSourceType === 'account') {
        const account = await ctx.db.get(normalizedFundingSourceId as Id<'accounts'>)
        ensureOwned(account, identity.subject, 'Goal contribution funding account not found.')
      } else if (args.fundingSourceType === 'card') {
        const card = await ctx.db.get(normalizedFundingSourceId as Id<'cards'>)
        ensureOwned(card, identity.subject, 'Goal contribution funding card not found.')
      } else {
        const income = await ctx.db.get(normalizedFundingSourceId as Id<'incomes'>)
        ensureOwned(income, identity.subject, 'Goal contribution funding income source not found.')
      }
    }

    const normalizedAmount = roundCurrency(args.amount)
    const beforeCurrentAmount = roundCurrency(goal.currentAmount)
    const afterCurrentAmount = roundCurrency(beforeCurrentAmount + normalizedAmount)
    const now = Date.now()

    await ctx.db.patch(goal._id, {
      currentAmount: afterCurrentAmount,
    })

    await insertGoalEvent(ctx, {
      userId: identity.subject,
      goalId: goal._id,
      eventType: 'contribution',
      source: args.source ?? 'quick_action',
      amountDelta: normalizedAmount,
      beforeCurrentAmount,
      afterCurrentAmount,
      note: args.note,
      metadata: {
        title: goal.title,
        fundingSourceType: args.fundingSourceType ?? null,
        fundingSourceId: normalizedFundingSourceId ?? null,
      },
      occurredAt: now,
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'goal',
      entityId: String(goal._id),
      action: 'contribution_recorded',
      before: {
        currentAmount: beforeCurrentAmount,
      },
      after: {
        currentAmount: afterCurrentAmount,
      },
      metadata: {
        source: args.source ?? 'quick_action',
        amount: normalizedAmount,
        note: args.note?.trim() || undefined,
        fundingSourceType: args.fundingSourceType ?? undefined,
        fundingSourceId: normalizedFundingSourceId ?? undefined,
      },
    })

    return {
      goalId: goal._id,
      previousAmount: beforeCurrentAmount,
      currentAmount: afterCurrentAmount,
      appliedAmount: normalizedAmount,
    }
  },
})

export const setGoalPaused = mutation({
  args: {
    id: v.id('goals'),
    paused: v.boolean(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    validateOptionalText(args.reason, 'Goal pause reason', 800)

    const goal = await ctx.db.get(args.id)
    ensureOwned(goal, identity.subject, 'Goal record not found.')

    const beforeState = normalizeGoalPausedState(goal)
    if (beforeState.paused === args.paused && (beforeState.pauseReason ?? '') === ((args.reason?.trim() || undefined) ?? '')) {
      return {
        id: goal._id,
        paused: beforeState.paused,
        pauseReason: beforeState.pauseReason ?? null,
      }
    }

    const now = Date.now()
    const nextReason = args.paused ? args.reason?.trim() || undefined : undefined
    await ctx.db.patch(goal._id, {
      paused: args.paused,
      pausedAt: args.paused ? now : undefined,
      pauseReason: nextReason,
    })

    await insertGoalEvent(ctx, {
      userId: identity.subject,
      goalId: goal._id,
      eventType: args.paused ? 'paused' : 'resumed',
      source: 'quick_action',
      pausedBefore: beforeState.paused,
      pausedAfter: args.paused,
      note: nextReason,
      metadata: {
        title: goal.title,
        pausedAt: args.paused ? now : null,
      },
      occurredAt: now,
    })

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'goal',
      entityId: String(goal._id),
      action: args.paused ? 'paused' : 'resumed',
      before: {
        paused: beforeState.paused,
        pausedAt: beforeState.pausedAt ?? null,
        pauseReason: beforeState.pauseReason ?? null,
      },
      after: {
        paused: args.paused,
        pausedAt: args.paused ? now : null,
        pauseReason: nextReason ?? null,
      },
      metadata: {
        source: 'quick_action',
      },
    })

    return {
      id: goal._id,
      paused: args.paused,
      pauseReason: nextReason ?? null,
    }
  },
})

export const removeGoal = mutation({
  args: {
    id: v.id('goals'),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.id)
    ensureOwned(existing, identity.subject, 'Goal record not found.')
    const now = Date.now()

    await insertGoalEvent(ctx, {
      userId: identity.subject,
      goalId: args.id,
      eventType: 'removed',
      source: 'manual',
      beforeCurrentAmount: existing.currentAmount,
      beforeTargetAmount: existing.targetAmount,
      beforeTargetDate: existing.targetDate,
      pausedBefore: existing.paused === true,
      metadata: buildGoalSnapshot(existing),
      occurredAt: now,
    })

    await ctx.db.delete(args.id)

    await recordFinanceAuditEvent(ctx, {
      userId: identity.subject,
      entityType: 'goal',
      entityId: String(args.id),
      action: 'removed',
      before: {
        title: existing.title,
        targetAmount: existing.targetAmount,
        currentAmount: existing.currentAmount,
        targetDate: existing.targetDate,
        priority: existing.priority,
        goalType: normalizeGoalType(existing.goalType),
        contributionAmount: roundCurrency(Math.max(finiteOrZero(existing.contributionAmount), 0)),
        cadence: existing.cadence ?? 'monthly',
        customInterval: existing.customInterval ?? null,
        customUnit: existing.customUnit ?? null,
        fundingSources: existing.fundingSources ?? [],
        paused: existing.paused === true,
        pausedAt: existing.pausedAt ?? null,
        pauseReason: existing.pauseReason ?? null,
      },
    })
  },
})

export const cleanupLegacySeedData = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx)

    const [legacyDashboard, legacyPersonal] = await Promise.all([
      ctx.db
        .query('dashboardStates')
        .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('personalFinanceStates')
        .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
        .collect(),
    ])

    await Promise.all([
      ...legacyDashboard.map((doc) => ctx.db.delete(doc._id)),
      ...legacyPersonal.map((doc) => ctx.db.delete(doc._id)),
    ])

    return {
      deletedDashboardStates: legacyDashboard.length,
      deletedPersonalFinanceStates: legacyPersonal.length,
    }
  },
})
