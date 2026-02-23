import type {
  AccountPurposeOption,
  AccountTypeOption,
  BillCategoryOption,
  BillScopeOption,
  CadenceOption,
  CustomCadenceUnitOption,
  DashboardCardId,
  DefaultMonthPreset,
  FinancePreference,
  GoalFundingSourceType,
  GoalPriorityOption,
  GoalTypeOption,
  Summary,
  TabKey,
  UiDensity,
  WeekStartDay,
} from '../components/financeTypes'

export const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'income', label: 'Income' },
  { key: 'bills', label: 'Bills' },
  { key: 'cards', label: 'Cards' },
  { key: 'loans', label: 'Loans' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'reconcile', label: 'Reconcile' },
  { key: 'planning', label: 'Planning' },
  { key: 'settings', label: 'Settings' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'goals', label: 'Goals' },
]

export const cadenceOptions: CadenceOption[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom' },
  { value: 'one_time', label: 'One Time' },
]

export const customCadenceUnitOptions: CustomCadenceUnitOption[] = [
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' },
  { value: 'years', label: 'Years' },
]

export const accountTypeOptions: AccountTypeOption[] = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'investment', label: 'Investment' },
  { value: 'cash', label: 'Cash' },
  { value: 'debt', label: 'Debt' },
]

export const accountPurposeOptions: AccountPurposeOption[] = [
  { value: 'bills', label: 'Bills' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'spending', label: 'Spending' },
  { value: 'goals', label: 'Goals' },
  { value: 'debt', label: 'Debt' },
]

export const goalPriorityOptions: GoalPriorityOption[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

export const goalTypeOptions: GoalTypeOption[] = [
  { value: 'emergency_fund', label: 'Emergency fund' },
  { value: 'sinking_fund', label: 'Sinking fund' },
  { value: 'debt_payoff', label: 'Debt payoff' },
  { value: 'big_purchase', label: 'Big purchase' },
]

export const goalFundingSourceTypeOptions: Array<{ value: GoalFundingSourceType; label: string }> = [
  { value: 'account', label: 'Account' },
  { value: 'card', label: 'Card' },
  { value: 'income', label: 'Income source' },
]

export const billCategoryOptions: BillCategoryOption[] = [
  { value: 'housing', label: 'Housing' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'council_tax', label: 'Council Tax' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'transport', label: 'Transport' },
  { value: 'health', label: 'Health' },
  { value: 'debt', label: 'Debt' },
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'education', label: 'Education' },
  { value: 'childcare', label: 'Childcare' },
  { value: 'other', label: 'Other' },
]

export const billScopeOptions: BillScopeOption[] = [
  { value: 'shared', label: 'Shared / household' },
  { value: 'personal', label: 'Personal' },
]

export const defaultPreference: FinancePreference = {
  displayName: '',
  currency: 'USD',
  locale: 'en-US',
  timezone: 'UTC',
  weekStartDay: 'monday' as WeekStartDay,
  defaultMonthPreset: 'current' as DefaultMonthPreset,
  dueRemindersEnabled: true,
  dueReminderDays: 3,
  monthlyCycleAlertsEnabled: true,
  reconciliationRemindersEnabled: true,
  goalAlertsEnabled: true,
  defaultBillCategory: 'other',
  defaultBillScope: 'shared',
  defaultPurchaseOwnership: 'shared',
  defaultPurchaseCategory: '',
  billNotesTemplate: '',
  purchaseNotesTemplate: '',
  uiDensity: 'comfortable' as UiDensity,
  defaultLandingTab: 'dashboard' as TabKey,
  dashboardCardOrder: [
    'health-score',
    'monthly-income',
    'monthly-commitments',
    'loan-balance',
    'projected-net',
    'net-worth',
    'runway',
  ] as DashboardCardId[],
  monthlyAutomationEnabled: false,
  monthlyAutomationRunDay: 1,
  monthlyAutomationRunHour: 9,
  monthlyAutomationRunMinute: 0,
  monthlyAutomationRetryStrategy: 'same_day_backoff',
  monthlyAutomationMaxRetries: 2,
  alertEscalationFailureStreakThreshold: 2,
  alertEscalationFailedStepsThreshold: 1,
  planningDefaultVersionKey: 'base',
  planningAutoApplyMode: 'manual_only',
  planningNegativeForecastFallback: 'warn_only',
}

export const dashboardCardOrderOptions: Array<{ id: DashboardCardId; label: string }> = [
  { id: 'health-score', label: 'Financial Health Score' },
  { id: 'monthly-income', label: 'Monthly Income' },
  { id: 'monthly-commitments', label: 'Monthly Commitments' },
  { id: 'loan-balance', label: 'Loan Balance' },
  { id: 'projected-net', label: 'Projected Monthly Net' },
  { id: 'net-worth', label: 'Net Worth' },
  { id: 'runway', label: 'Cash Runway' },
]

export const emptySummary: Summary = {
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

export const fallbackCurrencyOptions = [
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'AUD',
  'CAD',
  'CHF',
  'CNY',
  'SEK',
  'NOK',
  'NZD',
  'MXN',
  'SGD',
  'HKD',
  'INR',
  'BRL',
  'ZAR',
  'AED',
  'SAR',
]

export const fallbackLocaleOptions = [
  'en-US',
  'en-GB',
  'en-AU',
  'en-CA',
  'de-DE',
  'fr-FR',
  'es-ES',
  'it-IT',
  'pt-BR',
  'ja-JP',
  'zh-CN',
  'zh-HK',
  'ko-KR',
  'hi-IN',
  'ar-AE',
]

export const currencyOptions = (() => {
  const supportedValuesOf = (Intl as typeof Intl & {
    supportedValuesOf?: (input: 'currency') => string[]
  }).supportedValuesOf

  if (supportedValuesOf) {
    const supported = supportedValuesOf('currency').map((code) => code.toUpperCase())
    return Array.from(new Set(supported)).sort((a, b) => a.localeCompare(b))
  }

  return fallbackCurrencyOptions
})()

export const dateLabel = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})
