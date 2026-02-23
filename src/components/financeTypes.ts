import type { Doc, Id } from '../../convex/_generated/dataModel'

export type TabKey =
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

export type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom' | 'one_time'
export type CustomCadenceUnit = 'days' | 'weeks' | 'months' | 'years'
export type AccountType = 'checking' | 'savings' | 'investment' | 'cash' | 'debt'
export type AccountPurpose = 'bills' | 'emergency' | 'spending' | 'goals' | 'debt'
export type GoalPriority = 'low' | 'medium' | 'high'
export type GoalType = 'emergency_fund' | 'sinking_fund' | 'debt_payoff' | 'big_purchase'
export type GoalFundingSourceType = 'account' | 'card' | 'income'
export type GoalEventType =
  | 'created'
  | 'edited'
  | 'target_changed'
  | 'schedule_changed'
  | 'contribution'
  | 'progress_adjustment'
  | 'paused'
  | 'resumed'
  | 'removed'
export type GoalEventSource = 'manual' | 'quick_action' | 'system'
export type InsightSeverity = 'good' | 'warning' | 'critical'
export type ReconciliationStatus = 'pending' | 'posted' | 'reconciled'
export type RuleMatchType = 'contains' | 'exact' | 'starts_with'
export type CardMinimumPaymentType = 'fixed' | 'percent_plus_interest'
export type LoanMinimumPaymentType = 'fixed' | 'percent_plus_interest'
export type IncomePaymentStatus = 'on_time' | 'late' | 'missed'
export type IncomeChangeDirection = 'increase' | 'decrease' | 'no_change'
export type IncomeAllocationTarget = 'bills' | 'savings' | 'goals' | 'debt_overpay'
export type AutoAllocationActionType = 'reserve_bills' | 'move_to_savings' | 'fund_goals' | 'debt_overpay'
export type PlanningVersionKey = 'base' | 'conservative' | 'aggressive'
export type PlanningActionTaskStatus = 'suggested' | 'in_progress' | 'done' | 'dismissed'
export type PlanningActionTaskSource = 'manual_apply' | 'reapply' | 'system'
export type BillCategory =
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
export type BillScope = 'shared' | 'personal'
export type PurchaseOwnership = 'shared' | 'personal'
export type PurchaseFundingSourceType = 'unassigned' | 'account' | 'card'
export type WeekStartDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
export type UiDensity = 'comfortable' | 'compact'
export type DefaultMonthPreset = 'current' | 'previous' | 'next' | 'last_used'
export type MonthlyAutomationRetryStrategy = 'none' | 'same_day_backoff' | 'next_day_retry'
export type PlanningAutoApplyMode = 'manual_only' | 'month_start' | 'after_cycle'
export type PlanningNegativeForecastFallback =
  | 'warn_only'
  | 'reduce_variable_spend'
  | 'pause_goals'
  | 'debt_minimums_only'
export type DashboardCardId =
  | 'health-score'
  | 'monthly-income'
  | 'monthly-commitments'
  | 'loan-balance'
  | 'projected-net'
  | 'net-worth'
  | 'runway'

export type FinancePreference = {
  displayName: string
  currency: string
  locale: string
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
  defaultLandingTab: TabKey
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

export type Summary = {
  monthlyIncome: number
  monthlyBills: number
  monthlyCardSpend: number
  monthlyLoanPayments: number
  monthlyLoanBasePayments: number
  monthlyLoanSubscriptionCosts: number
  monthlyCommitments: number
  runwayAvailablePool: number
  runwayMonthlyPressure: number
  cardLimitTotal: number
  cardUsedTotal: number
  totalLoanBalance: number
  cardUtilizationPercent: number
  purchasesThisMonth: number
  pendingPurchaseAmountThisMonth: number
  postedPurchaseAmountThisMonth: number
  reconciledPurchaseAmountThisMonth: number
  projectedMonthlyNet: number
  savingsRatePercent: number
  totalAssets: number
  totalLiabilities: number
  netWorth: number
  liquidReserves: number
  runwayMonths: number
  healthScore: number
  goalsFundedPercent: number
  pendingPurchases: number
  postedPurchases: number
  reconciledPurchases: number
}

export type IncomeEntry = Doc<'incomes'>
export type IncomePaymentCheckEntry = Doc<'incomePaymentChecks'>
export type IncomeChangeEventEntry = Doc<'incomeChangeEvents'>
export type BillEntry = Doc<'bills'>
export type BillPaymentCheckEntry = Doc<'billPaymentChecks'>
export type SubscriptionPriceChangeEntry = Doc<'subscriptionPriceChanges'>
export type CardEntry = Doc<'cards'>
export type LoanEntry = Doc<'loans'>
export type LoanEventEntry = Doc<'loanEvents'>
export type LoanCycleAuditEntry = Doc<'loanCycleAuditEntries'>
export type PurchaseEntry = Doc<'purchases'>
export type AccountEntry = Doc<'accounts'>
export type AccountTransferEntry = Doc<'accountTransfers'>
export type AccountReconciliationCheckEntry = Doc<'accountReconciliationChecks'>
export type GoalEntry = Doc<'goals'>
export type GoalEventEntry = Doc<'goalEvents'>
export type CycleAuditLogEntry = Doc<'cycleAuditLogs'>
export type CycleStepAlertEntry = Doc<'cycleStepAlerts'>
export type MonthlyCycleRunEntry = Doc<'monthlyCycleRuns'>
export type MonthCloseSnapshotEntry = Doc<'monthCloseSnapshots'>
export type PurchaseMonthCloseRunEntry = Doc<'purchaseMonthCloseRuns'>
export type FinanceAuditEventEntry = Doc<'financeAuditEvents'>
export type LedgerEntry = Doc<'ledgerEntries'>
export type TransactionRuleEntry = Doc<'transactionRules'>
export type EnvelopeBudgetEntry = Doc<'envelopeBudgets'>
export type PlanningMonthVersionEntry = Doc<'planningMonthVersions'>
export type PlanningActionTaskEntry = Doc<'planningActionTasks'>
export type IncomeAllocationRuleEntry = Doc<'incomeAllocationRules'>
export type PurchaseSplitEntry = Doc<'purchaseSplits'>
export type PurchaseSplitTemplateEntry = Doc<'purchaseSplitTemplates'>
export type ConsentLogEntry = Doc<'consentLogs'>
export type UserExportEntry = Doc<'userExports'>
export type UserExportDownloadEntry = Doc<'userExportDownloads'>
export type DeletionJobEntry = Doc<'deletionJobs'>
export type RetentionPolicyEntry = Doc<'retentionPolicies'>
export type ClientOpsMetricEntry = Doc<'clientOpsMetrics'>

export type RetentionPolicyKey =
  | 'exports'
  | 'client_ops_metrics'
  | 'cycle_audit_ledger'
  | 'consent_logs'
  | 'deletion_jobs'

export type ConsentSettingsView = {
  diagnosticsEnabled: boolean
  analyticsEnabled: boolean
  updatedAt: number
}

export type PrivacyData = {
  consentSettings: ConsentSettingsView
  consentLogs: ConsentLogEntry[]
  retentionPolicies: RetentionPolicyEntry[]
  latestExport: UserExportEntry | null
  exportHistory: UserExportEntry[]
  exportDownloadLogs: UserExportDownloadEntry[]
  latestDeletionJob: DeletionJobEntry | null
}

export type SecuritySessionActivity = {
  sessionId: string
  status: string
  createdAt: number
  lastActiveAt: number
  expiresAt: number
  deviceLabel: string
  browserLabel: string
  locationLabel: string
  ipAddress: string | null
  current: boolean
  onThisDevice: boolean
}

export type KpiSnapshot = {
  windowDays: number
  updatedAt: number
  accuracyRate: number
  syncFailureRate: number | null
  cycleSuccessRate: number
  reconciliationCompletionRate: number
  counts: {
    purchases: number
    pending: number
    missingCategory: number
    duplicates: number
    anomalies: number
    splitMismatches: number
  }
}

export type SettingsProfileEntry = {
  _id: string
  name: string
  description: string
  preferenceJson: string
  lastAppliedAt: number | null
  createdAt: number
  updatedAt: number
}

export type SettingsPreferenceHistoryEntry = {
  _id: string
  action: string
  source: string | null
  beforeJson: string | null
  afterJson: string | null
  changedFields: string[]
  createdAt: number
}

export type SettingsPowerData = {
  profiles: SettingsProfileEntry[]
  history: SettingsPreferenceHistoryEntry[]
}

export type RetentionPolicyRow = {
  policyKey: RetentionPolicyKey
  retentionDays: number
  enabled: boolean
}

export type IncomeForm = {
  source: string
  amount: string
  actualAmount: string
  grossAmount: string
  taxAmount: string
  nationalInsuranceAmount: string
  pensionAmount: string
  cadence: Cadence
  customInterval: string
  customUnit: CustomCadenceUnit
  forecastSmoothingEnabled: boolean
  forecastSmoothingMonths: string
  destinationAccountId: string
  receivedDay: string
  payDateAnchor: string
  employerNote: string
  notes: string
}

export type BillForm = {
  name: string
  amount: string
  dueDay: string
  cadence: Cadence
  customInterval: string
  customUnit: CustomCadenceUnit
  category: BillCategory
  scope: BillScope
  deductible: boolean
  isSubscription: boolean
  cancelReminderDays: string
  linkedAccountId: string
  autopay: boolean
  notes: string
}

export type CardForm = {
  name: string
  creditLimit: string
  usedLimit: string
  allowOverLimitOverride: boolean
  statementBalance: string
  pendingCharges: string
  minimumPaymentType: CardMinimumPaymentType
  minimumPayment: string
  minimumPaymentPercent: string
  extraPayment: string
  spendPerMonth: string
  interestRate: string
  statementDay: string
  dueDay: string
}

export type LoanForm = {
  name: string
  balance: string
  principalBalance: string
  accruedInterest: string
  minimumPaymentType: LoanMinimumPaymentType
  minimumPayment: string
  minimumPaymentPercent: string
  extraPayment: string
  subscriptionCost: string
  subscriptionPaymentCount: string
  interestRate: string
  dueDay: string
  cadence: Cadence
  customInterval: string
  customUnit: CustomCadenceUnit
  notes: string
}

export type PurchaseForm = {
  item: string
  amount: string
  category: string
  purchaseDate: string
  reconciliationStatus: ReconciliationStatus
  statementMonth: string
  ownership: PurchaseOwnership
  taxDeductible: boolean
  fundingSourceType: PurchaseFundingSourceType
  fundingSourceId: string
  notes: string
}

export type PurchaseFilter = {
  query: string
  category: string
  month: string
  reconciliationStatus: 'all' | ReconciliationStatus
  ownership: 'all' | PurchaseOwnership
  taxDeductible: 'all' | 'yes' | 'no'
  fundingSourceType: 'all' | PurchaseFundingSourceType
}

export type PurchaseSavedView =
  | 'month_all'
  | 'month_pending'
  | 'month_unreconciled'
  | 'month_reconciled'
  | 'all_unreconciled'
  | 'all_purchases'

export type PurchaseDuplicateOverlapKind = 'duplicate' | 'overlap'
export type PurchaseDuplicateOverlapResolution = 'merge' | 'archive_duplicate' | 'mark_intentional'

export type PurchaseDuplicateOverlapMatch = {
  id: string
  kind: PurchaseDuplicateOverlapKind
  primaryPurchaseId: PurchaseId
  secondaryPurchaseId: PurchaseId
  primaryItem: string
  secondaryItem: string
  primaryAmount: number
  secondaryAmount: number
  primaryDate: string
  secondaryDate: string
  amountDelta: number
  amountDeltaPercent: number
  dayDelta: number
  nameSimilarity: number
  reason: string
}

export type PurchaseSplitTemplateLineInput = {
  category: string
  percentage: number
  goalId?: GoalId
  accountId?: AccountId
}

export type PurchaseSplitInput = {
  category: string
  amount: number
  goalId?: GoalId
  accountId?: AccountId
}

export type PurchaseImportInput = {
  item: string
  amount: number
  category: string
  purchaseDate: string
  statementMonth: string
  reconciliationStatus: ReconciliationStatus
  ownership: PurchaseOwnership
  taxDeductible: boolean
  fundingSourceType: PurchaseFundingSourceType
  fundingSourceId?: string
  notes?: string
}

export type AccountForm = {
  name: string
  type: AccountType
  purpose: AccountPurpose
  ledgerBalance: string
  pendingBalance: string
  balance: string
  liquid: boolean
}

export type AccountTransferForm = {
  sourceAccountId: string
  destinationAccountId: string
  amount: string
  transferDate: string
  reference: string
  note: string
}

export type AccountReconciliationForm = {
  accountId: string
  cycleMonth: string
  statementStartBalance: string
  statementEndBalance: string
  reconciled: boolean
  applyAdjustment: boolean
  note: string
}

export type GoalForm = {
  title: string
  targetAmount: string
  currentAmount: string
  targetDate: string
  priority: GoalPriority
  goalType: GoalType
  contributionAmount: string
  cadence: Cadence
  customInterval: string
  customUnit: CustomCadenceUnit
  fundingSources: GoalFundingSourceFormRow[]
}

export type GoalFundingSourceFormRow = {
  sourceType: GoalFundingSourceType
  sourceId: string
  allocationPercent: string
}

export type GoalFundingSourceMapEntry = {
  sourceType: GoalFundingSourceType
  sourceId: string
  allocationPercent?: number
}

export type IncomeEditDraft = IncomeForm
export type BillEditDraft = BillForm
export type CardEditDraft = CardForm
export type LoanEditDraft = LoanForm
export type PurchaseEditDraft = PurchaseForm
export type AccountEditDraft = AccountForm
export type GoalEditDraft = GoalForm

export type DashboardCard = {
  id: string
  label: string
  value: string
  note: string
  trend: string
}

export type DashboardIntegrationCheckStatus = 'pass' | 'warning' | 'fail' | 'skipped'

export type DashboardIntegrationCheck = {
  id: string
  label: string
  status: DashboardIntegrationCheckStatus
  detail: string
  expected?: number
  actual?: number
  delta?: number
}

export type DashboardIntegrationSnapshot = {
  generatedAt: number
  passCount: number
  warningCount: number
  failCount: number
  skippedCount: number
  checks: DashboardIntegrationCheck[]
}

export type TopCategory = {
  category: string
  total: number
  count: number
  sharePercent: number
}

export type UpcomingCashEvent = {
  id: string
  label: string
  type: 'income' | 'bill' | 'card' | 'loan'
  date: string
  amount: number
  daysAway: number
  cadence: Cadence
  customInterval?: number
  customUnit?: CustomCadenceUnit
}

export type Insight = {
  id: string
  title: string
  detail: string
  severity: InsightSeverity
}

export type GoalWithMetrics = GoalEntry & {
  progressPercent: number
  remaining: number
  daysLeft: number
  goalTypeValue: GoalType
  contributionAmountValue: number
  cadenceValue: Cadence
  customIntervalValue?: number
  customUnitValue?: CustomCadenceUnit
  fundingSourcesValue: GoalFundingSourceMapEntry[]
  plannedMonthlyContribution: number
  requiredMonthlyContribution: number
  expectedProgressPercentNow: number
  paceCoverageRatio: number
  contributionConsistencyScore: number
  goalHealthScore: number
  predictedCompletionDate?: string
  predictedMonthsToComplete?: number
  predictedDaysDeltaToTarget?: number
  atRiskReasons: string[]
  milestones: GoalMilestone[]
  pausedValue: boolean
  pausedAtValue?: number
  pauseReasonValue?: string
}

export type GoalMilestone = {
  percent: 25 | 50 | 75 | 100
  label: string
  targetDate: string
  achieved: boolean
}

export type RecurringCandidate = {
  id: string
  label: string
  category: string
  count: number
  averageAmount: number
  averageIntervalDays: number
  nextExpectedDate: string
  confidence: number
}

export type BillRiskAlert = {
  id: string
  name: string
  dueDate: string
  amount: number
  daysAway: number
  expectedAvailable: number
  risk: 'good' | 'warning' | 'critical'
  autopay: boolean
  linkedAccountName?: string
  linkedAccountProjectedBalance?: number
}

export type ForecastWindow = {
  days: 30 | 90 | 365
  projectedNet: number
  projectedCash: number
  coverageMonths: number
  risk: 'healthy' | 'warning' | 'critical'
}

export type BudgetPerformance = {
  id: string
  category: string
  targetAmount: number
  carryoverAmount: number
  effectiveTarget: number
  spent: number
  variance: number
  projectedMonthEnd: number
  rolloverEnabled: boolean
  suggestedRollover: number
  status: 'on_track' | 'warning' | 'over'
}

export type MonthCloseChecklistItem = {
  id: string
  label: string
  done: boolean
  detail: string
}

export type AutoAllocationBucket = {
  target: IncomeAllocationTarget
  label: string
  percentage: number
  monthlyAmount: number
  active: boolean
}

export type AutoAllocationPlan = {
  monthlyIncome: number
  totalAllocatedPercent: number
  totalAllocatedAmount: number
  residualAmount: number
  unallocatedPercent: number
  overAllocatedPercent: number
  buckets: AutoAllocationBucket[]
}

export type AutoAllocationSuggestionEntry = {
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

export type PlanningPlanVersion = {
  id: string
  month: string
  versionKey: PlanningVersionKey
  label: string
  description: string
  expectedIncome: number
  fixedCommitments: number
  variableSpendingCap: number
  monthlyNet: number
  notes: string
  isSelected: boolean
  isPersisted: boolean
  updatedAt: number
}

export type PlanningWorkspaceSummary = {
  month: string
  baselineExpectedIncome: number
  baselineFixedCommitments: number
  baselineVariableSpendingCap: number
  baselineMonthlyNet: number
  plannedExpectedIncome: number
  plannedFixedCommitments: number
  plannedVariableSpendingCap: number
  plannedMonthlyNet: number
  deltaExpectedIncome: number
  deltaFixedCommitments: number
  deltaVariableSpendingCap: number
  deltaMonthlyNet: number
  envelopeTargetTotal: number
  envelopeCarryoverTotal: number
  envelopeEffectiveTargetTotal: number
  envelopeProjectedSpendTotal: number
  envelopeSuggestedRolloverTotal: number
  envelopeCoveragePercent: number
}

export type PlanningPhase1Data = {
  monthKey: string
  selectedVersion: PlanningVersionKey
  versions: PlanningPlanVersion[]
  workspace: PlanningWorkspaceSummary
}

export type PlanningActionTask = {
  id: string
  month: string
  versionKey: PlanningVersionKey
  title: string
  detail: string
  category: string
  impactAmount: number
  status: PlanningActionTaskStatus
  source: PlanningActionTaskSource
  createdAt: number
  updatedAt: number
}

export type PlanningAdherenceRow = {
  id: string
  category: string
  planned: number
  actual: number
  variance: number
  varianceRatePercent: number
  status: 'on_track' | 'warning' | 'over'
}

export type PlanningKpiSummary = {
  forecastAccuracyPercent: number
  varianceRatePercent: number
  planCompletionPercent: number
  totalTasks: number
  completedTasks: number
  plannedNet: number
  actualNet: number
}

export type PlanningAuditEvent = {
  id: string
  entityType: string
  entityId: string
  action: string
  beforeJson?: string
  afterJson?: string
  metadataJson?: string
  createdAt: number
}

export type PlanningPhase3Data = {
  monthKey: string
  selectedVersionKey: PlanningVersionKey
  actionTasks: PlanningActionTask[]
  adherenceRows: PlanningAdherenceRow[]
  planningKpis: PlanningKpiSummary
  auditEvents: PlanningAuditEvent[]
}

export type Phase2Data = {
  monthKey: string
  transactionRules: TransactionRuleEntry[]
  envelopeBudgets: EnvelopeBudgetEntry[]
  incomeAllocationRules: IncomeAllocationRuleEntry[]
  incomeAllocationSuggestions: AutoAllocationSuggestionEntry[]
  autoAllocationPlan: AutoAllocationPlan
  budgetPerformance: BudgetPerformance[]
  recurringCandidates: RecurringCandidate[]
  billRiskAlerts: BillRiskAlert[]
  forecastWindows: ForecastWindow[]
  purchaseSplits: PurchaseSplitEntry[]
  purchaseSplitTemplates: PurchaseSplitTemplateEntry[]
  monthCloseChecklist: MonthCloseChecklistItem[]
  dataQuality: {
    duplicateCount: number
    anomalyCount: number
    missingCategoryCount: number
    pendingReconciliationCount: number
    splitMismatchCount: number
  }
}

export type CadenceOption = {
  value: Cadence
  label: string
}

export type CustomCadenceUnitOption = {
  value: CustomCadenceUnit
  label: string
}

export type AccountTypeOption = {
  value: AccountType
  label: string
}

export type AccountPurposeOption = {
  value: AccountPurpose
  label: string
}

export type GoalPriorityOption = {
  value: GoalPriority
  label: string
}

export type GoalTypeOption = {
  value: GoalType
  label: string
}

export type BillCategoryOption = {
  value: BillCategory
  label: string
}

export type BillScopeOption = {
  value: BillScope
  label: string
}

export type IncomeId = Id<'incomes'>
export type IncomePaymentCheckId = Id<'incomePaymentChecks'>
export type IncomeChangeEventId = Id<'incomeChangeEvents'>
export type BillId = Id<'bills'>
export type BillPaymentCheckId = Id<'billPaymentChecks'>
export type SubscriptionPriceChangeId = Id<'subscriptionPriceChanges'>
export type CardId = Id<'cards'>
export type LoanId = Id<'loans'>
export type PurchaseId = Id<'purchases'>
export type AccountId = Id<'accounts'>
export type GoalId = Id<'goals'>
export type TransactionRuleId = Id<'transactionRules'>
export type EnvelopeBudgetId = Id<'envelopeBudgets'>
export type PlanningMonthVersionId = Id<'planningMonthVersions'>
export type PlanningActionTaskId = Id<'planningActionTasks'>
export type IncomeAllocationRuleId = Id<'incomeAllocationRules'>
