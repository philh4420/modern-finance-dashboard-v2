import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

const legacyMetric = v.object({
  id: v.string(),
  label: v.string(),
  value: v.string(),
  change: v.string(),
  period: v.string(),
  trend: v.union(v.literal('up'), v.literal('down'), v.literal('flat')),
})

const legacyWatchlistItem = v.object({
  id: v.string(),
  symbol: v.string(),
  price: v.string(),
  change: v.string(),
  trend: v.union(v.literal('up'), v.literal('down')),
  volume: v.string(),
})

const legacyAllocationSlice = v.object({
  id: v.string(),
  label: v.string(),
  weight: v.string(),
  color: v.string(),
})

const legacyActivity = v.object({
  id: v.string(),
  title: v.string(),
  detail: v.string(),
  timestamp: v.string(),
})

const summaryMetric = v.object({
  id: v.string(),
  label: v.string(),
  value: v.string(),
  changeLabel: v.string(),
  period: v.string(),
  trend: v.union(v.literal('up'), v.literal('down'), v.literal('flat')),
})

const cashflowPoint = v.object({
  id: v.string(),
  label: v.string(),
  value: v.number(),
})

const budgetCategory = v.object({
  id: v.string(),
  category: v.string(),
  spent: v.number(),
  budget: v.number(),
  status: v.union(v.literal('on_track'), v.literal('warning'), v.literal('over')),
  color: v.string(),
})

const accountBalance = v.object({
  id: v.string(),
  name: v.string(),
  type: v.string(),
  balance: v.string(),
  delta: v.string(),
  trend: v.union(v.literal('up'), v.literal('down'), v.literal('flat')),
})

const transaction = v.object({
  id: v.string(),
  description: v.string(),
  category: v.string(),
  date: v.string(),
  amount: v.string(),
  kind: v.union(v.literal('income'), v.literal('expense')),
})

const upcomingBill = v.object({
  id: v.string(),
  name: v.string(),
  dueDate: v.string(),
  amount: v.string(),
  autopay: v.boolean(),
})

const insight = v.object({
  id: v.string(),
  title: v.string(),
  detail: v.string(),
})

const cadence = v.union(
  v.literal('weekly'),
  v.literal('biweekly'),
  v.literal('monthly'),
  v.literal('quarterly'),
  v.literal('yearly'),
  v.literal('custom'),
  v.literal('one_time'),
)

const customCadenceUnit = v.union(v.literal('days'), v.literal('weeks'), v.literal('months'), v.literal('years'))

const accountType = v.union(
  v.literal('checking'),
  v.literal('savings'),
  v.literal('investment'),
  v.literal('cash'),
  v.literal('debt'),
)
const accountPurpose = v.union(
  v.literal('bills'),
  v.literal('emergency'),
  v.literal('spending'),
  v.literal('goals'),
  v.literal('debt'),
)

const goalPriority = v.union(v.literal('low'), v.literal('medium'), v.literal('high'))
const goalType = v.union(
  v.literal('emergency_fund'),
  v.literal('sinking_fund'),
  v.literal('debt_payoff'),
  v.literal('big_purchase'),
)
const goalFundingSourceType = v.union(v.literal('account'), v.literal('card'), v.literal('income'))
const goalFundingSourceMapItem = v.object({
  sourceType: goalFundingSourceType,
  sourceId: v.string(),
  allocationPercent: v.optional(v.number()),
})
const goalEventType = v.union(
  v.literal('created'),
  v.literal('edited'),
  v.literal('target_changed'),
  v.literal('schedule_changed'),
  v.literal('contribution'),
  v.literal('progress_adjustment'),
  v.literal('paused'),
  v.literal('resumed'),
  v.literal('removed'),
)
const goalEventSource = v.union(v.literal('manual'), v.literal('quick_action'), v.literal('system'))
const weekStartDay = v.union(
  v.literal('monday'),
  v.literal('tuesday'),
  v.literal('wednesday'),
  v.literal('thursday'),
  v.literal('friday'),
  v.literal('saturday'),
  v.literal('sunday'),
)
const uiDensity = v.union(v.literal('comfortable'), v.literal('compact'))
const defaultMonthPreset = v.union(
  v.literal('current'),
  v.literal('previous'),
  v.literal('next'),
  v.literal('last_used'),
)
const appTabKey = v.union(
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
const cycleRunSource = v.union(v.literal('manual'), v.literal('automatic'))
const cycleRunStatus = v.union(v.literal('completed'), v.literal('failed'))
const reconciliationStatus = v.union(v.literal('pending'), v.literal('posted'), v.literal('reconciled'))
const ruleMatchType = v.union(v.literal('contains'), v.literal('exact'), v.literal('starts_with'))
const ledgerLineType = v.union(v.literal('debit'), v.literal('credit'))
const ledgerEntryType = v.union(
  v.literal('purchase'),
  v.literal('purchase_reversal'),
  v.literal('cycle_card_spend'),
  v.literal('cycle_card_interest'),
  v.literal('cycle_card_payment'),
  v.literal('cycle_loan_interest'),
  v.literal('cycle_loan_payment'),
)

const cycleSummarySnapshot = v.object({
  monthlyIncome: v.number(),
  monthlyCommitments: v.number(),
  monthlyBills: v.optional(v.number()),
  monthlyCardSpend: v.optional(v.number()),
  monthlyLoanBasePayments: v.optional(v.number()),
  monthlyLoanSubscriptionCosts: v.optional(v.number()),
  assetsChecking: v.optional(v.number()),
  assetsSavings: v.optional(v.number()),
  assetsInvestment: v.optional(v.number()),
  assetsCash: v.optional(v.number()),
  liabilitiesAccountDebt: v.optional(v.number()),
  liabilitiesCards: v.optional(v.number()),
  liabilitiesLoans: v.optional(v.number()),
  totalLiabilities: v.number(),
  netWorth: v.number(),
  runwayMonths: v.number(),
})

const consentType = v.union(v.literal('diagnostics'), v.literal('analytics'))

const exportStatus = v.union(v.literal('processing'), v.literal('ready'), v.literal('failed'), v.literal('expired'))
const deletionJobStatus = v.union(v.literal('running'), v.literal('completed'), v.literal('failed'))
const cardMinimumPaymentType = v.union(v.literal('fixed'), v.literal('percent_plus_interest'))
const loanMinimumPaymentType = v.union(v.literal('fixed'), v.literal('percent_plus_interest'))
const loanEventType = v.union(
  v.literal('interest_accrual'),
  v.literal('payment'),
  v.literal('charge'),
  v.literal('subscription_fee'),
)
const loanEventSource = v.union(v.literal('manual'), v.literal('monthly_cycle'))
const loanMutationType = v.union(
  v.literal('created'),
  v.literal('updated'),
  v.literal('removed'),
  v.literal('charge'),
  v.literal('payment'),
  v.literal('interest_accrual'),
  v.literal('subscription_fee'),
  v.literal('monthly_cycle'),
)
const loanMutationSource = v.union(v.literal('manual'), v.literal('automatic'), v.literal('monthly_cycle'))
const cycleStepAlertSeverity = v.union(v.literal('warning'), v.literal('critical'))
const incomePaymentStatus = v.union(v.literal('on_time'), v.literal('late'), v.literal('missed'))
const incomeChangeDirection = v.union(v.literal('increase'), v.literal('decrease'), v.literal('no_change'))
const incomeAllocationTarget = v.union(
  v.literal('bills'),
  v.literal('savings'),
  v.literal('goals'),
  v.literal('debt_overpay'),
)
const incomeAllocationActionType = v.union(
  v.literal('reserve_bills'),
  v.literal('move_to_savings'),
  v.literal('fund_goals'),
  v.literal('debt_overpay'),
)
const incomeAllocationSuggestionStatus = v.union(
  v.literal('suggested'),
  v.literal('completed'),
  v.literal('dismissed'),
)
const planningVersionKey = v.union(v.literal('base'), v.literal('conservative'), v.literal('aggressive'))
const monthlyAutomationRetryStrategy = v.union(
  v.literal('none'),
  v.literal('same_day_backoff'),
  v.literal('next_day_retry'),
)
const planningAutoApplyMode = v.union(v.literal('manual_only'), v.literal('month_start'), v.literal('after_cycle'))
const planningNegativeForecastFallback = v.union(
  v.literal('warn_only'),
  v.literal('reduce_variable_spend'),
  v.literal('pause_goals'),
  v.literal('debt_minimums_only'),
)
const planningActionTaskStatus = v.union(
  v.literal('suggested'),
  v.literal('in_progress'),
  v.literal('done'),
  v.literal('dismissed'),
)
const planningActionTaskSource = v.union(v.literal('manual_apply'), v.literal('reapply'), v.literal('system'))
const billCategory = v.union(
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
const billScope = v.union(v.literal('shared'), v.literal('personal'))
const purchaseOwnership = v.union(v.literal('shared'), v.literal('personal'))
const purchaseFundingSourceType = v.union(v.literal('unassigned'), v.literal('account'), v.literal('card'))

export default defineSchema({
  dashboardStates: defineTable({
    userId: v.string(),
    metrics: v.array(legacyMetric),
    watchlist: v.array(legacyWatchlistItem),
    allocations: v.array(legacyAllocationSlice),
    activities: v.array(legacyActivity),
    updatedAt: v.number(),
  }).index('by_userId', ['userId']),
  personalFinanceStates: defineTable({
    userId: v.string(),
    summaryMetrics: v.array(summaryMetric),
    cashflow: v.array(cashflowPoint),
    budgets: v.array(budgetCategory),
    accounts: v.array(accountBalance),
    transactions: v.array(transaction),
    upcomingBills: v.array(upcomingBill),
    insights: v.array(insight),
    updatedAt: v.number(),
  }).index('by_userId', ['userId']),
  incomes: defineTable({
    userId: v.string(),
    source: v.string(),
    amount: v.number(),
    actualAmount: v.optional(v.number()),
    grossAmount: v.optional(v.number()),
    taxAmount: v.optional(v.number()),
    nationalInsuranceAmount: v.optional(v.number()),
    pensionAmount: v.optional(v.number()),
    cadence,
    customInterval: v.optional(v.number()),
    customUnit: v.optional(customCadenceUnit),
    forecastSmoothingEnabled: v.optional(v.boolean()),
    forecastSmoothingMonths: v.optional(v.number()),
    destinationAccountId: v.optional(v.id('accounts')),
    receivedDay: v.optional(v.number()),
    payDateAnchor: v.optional(v.string()),
    employerNote: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt'])
    .index('by_userId_destinationAccountId', ['userId', 'destinationAccountId']),
  incomePaymentChecks: defineTable({
    userId: v.string(),
    incomeId: v.id('incomes'),
    cycleMonth: v.string(),
    status: incomePaymentStatus,
    expectedDay: v.optional(v.number()),
    receivedDay: v.optional(v.number()),
    expectedAmount: v.number(),
    receivedAmount: v.optional(v.number()),
    paymentReference: v.optional(v.string()),
    payslipReference: v.optional(v.string()),
    note: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt'])
    .index('by_userId_incomeId_cycleMonth', ['userId', 'incomeId', 'cycleMonth'])
    .index('by_userId_cycleMonth', ['userId', 'cycleMonth']),
  incomeChangeEvents: defineTable({
    userId: v.string(),
    incomeId: v.id('incomes'),
    effectiveDate: v.string(),
    previousAmount: v.number(),
    newAmount: v.number(),
    deltaAmount: v.number(),
    direction: incomeChangeDirection,
    note: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt'])
    .index('by_userId_incomeId_effectiveDate', ['userId', 'incomeId', 'effectiveDate']),
  bills: defineTable({
    userId: v.string(),
    name: v.string(),
    amount: v.number(),
    dueDay: v.number(),
    cadence,
    customInterval: v.optional(v.number()),
    customUnit: v.optional(customCadenceUnit),
    category: v.optional(billCategory),
    scope: v.optional(billScope),
    deductible: v.optional(v.boolean()),
    isSubscription: v.optional(v.boolean()),
    cancelReminderDays: v.optional(v.number()),
    linkedAccountId: v.optional(v.id('accounts')),
    autopay: v.boolean(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt'])
    .index('by_userId_linkedAccountId', ['userId', 'linkedAccountId'])
    .index('by_userId_scope', ['userId', 'scope'])
    .index('by_userId_category', ['userId', 'category']),
  subscriptionPriceChanges: defineTable({
    userId: v.string(),
    billId: v.id('bills'),
    previousAmount: v.number(),
    newAmount: v.number(),
    effectiveDate: v.string(),
    note: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt'])
    .index('by_userId_billId_createdAt', ['userId', 'billId', 'createdAt']),
  billPaymentChecks: defineTable({
    userId: v.string(),
    billId: v.id('bills'),
    cycleMonth: v.string(),
    expectedAmount: v.number(),
    actualAmount: v.optional(v.number()),
    varianceAmount: v.optional(v.number()),
    paidDay: v.optional(v.number()),
    note: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt'])
    .index('by_userId_billId_cycleMonth', ['userId', 'billId', 'cycleMonth']),
  cards: defineTable({
    userId: v.string(),
    name: v.string(),
    creditLimit: v.number(),
    usedLimit: v.number(),
    statementBalance: v.optional(v.number()),
    pendingCharges: v.optional(v.number()),
    minimumPayment: v.number(),
    minimumPaymentType: v.optional(cardMinimumPaymentType),
    minimumPaymentPercent: v.optional(v.number()),
    extraPayment: v.optional(v.number()),
    spendPerMonth: v.number(),
    interestRate: v.optional(v.number()),
    statementDay: v.optional(v.number()),
    dueDay: v.optional(v.number()),
    lastCycleAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt']),
  loans: defineTable({
    userId: v.string(),
    name: v.string(),
    balance: v.number(),
    principalBalance: v.optional(v.number()),
    accruedInterest: v.optional(v.number()),
    subscriptionOutstanding: v.optional(v.number()),
    minimumPayment: v.number(),
    minimumPaymentType: v.optional(loanMinimumPaymentType),
    minimumPaymentPercent: v.optional(v.number()),
    extraPayment: v.optional(v.number()),
    subscriptionCost: v.optional(v.number()),
    subscriptionPaymentCount: v.optional(v.number()),
    interestRate: v.optional(v.number()),
    lastCycleAt: v.optional(v.number()),
    lastInterestAppliedAt: v.optional(v.number()),
    dueDay: v.number(),
    cadence,
    customInterval: v.optional(v.number()),
    customUnit: v.optional(customCadenceUnit),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt']),
  loanEvents: defineTable({
    userId: v.string(),
    loanId: v.id('loans'),
    eventType: loanEventType,
    source: loanEventSource,
    amount: v.number(),
    principalDelta: v.number(),
    interestDelta: v.number(),
    resultingBalance: v.number(),
    occurredAt: v.number(),
    cycleKey: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt'])
    .index('by_userId_loanId_createdAt', ['userId', 'loanId', 'createdAt']),
  loanCycleAuditEntries: defineTable({
    userId: v.string(),
    loanId: v.id('loans'),
    mutationType: loanMutationType,
    source: loanMutationSource,
    cycleKey: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    amount: v.optional(v.number()),
    principalBefore: v.number(),
    interestBefore: v.number(),
    subscriptionBefore: v.number(),
    totalBefore: v.number(),
    principalAfter: v.number(),
    interestAfter: v.number(),
    subscriptionAfter: v.number(),
    totalAfter: v.number(),
    notes: v.optional(v.string()),
    metadataJson: v.optional(v.string()),
    occurredAt: v.number(),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt'])
    .index('by_userId_loanId_createdAt', ['userId', 'loanId', 'createdAt'])
    .index('by_userId_cycleKey_createdAt', ['userId', 'cycleKey', 'createdAt']),
  purchases: defineTable({
    userId: v.string(),
    item: v.string(),
    amount: v.number(),
    category: v.string(),
    purchaseDate: v.string(),
    reconciliationStatus: v.optional(reconciliationStatus),
    statementMonth: v.optional(v.string()),
    ownership: v.optional(purchaseOwnership),
    taxDeductible: v.optional(v.boolean()),
    fundingSourceType: v.optional(purchaseFundingSourceType),
    fundingSourceId: v.optional(v.string()),
    postedAt: v.optional(v.number()),
    reconciledAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt']),
  financeAuditEvents: defineTable({
    userId: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    action: v.string(),
    beforeJson: v.optional(v.string()),
    afterJson: v.optional(v.string()),
    metadataJson: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt'])
    .index('by_userId_entityType_createdAt', ['userId', 'entityType', 'createdAt']),
  ledgerEntries: defineTable({
    userId: v.string(),
    entryType: ledgerEntryType,
    description: v.string(),
    occurredAt: v.number(),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    cycleKey: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt'])
    .index('by_userId_cycleKey', ['userId', 'cycleKey']),
  ledgerLines: defineTable({
    userId: v.string(),
    entryId: v.id('ledgerEntries'),
    lineType: ledgerLineType,
    accountCode: v.string(),
    amount: v.number(),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt'])
    .index('by_entryId', ['entryId']),
  monthlyCycleRuns: defineTable({
    userId: v.string(),
    cycleKey: v.string(),
    source: cycleRunSource,
    status: cycleRunStatus,
    idempotencyKey: v.optional(v.string()),
    auditLogId: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    ranAt: v.number(),
    updatedCards: v.number(),
    updatedLoans: v.number(),
    cardCyclesApplied: v.number(),
    loanCyclesApplied: v.number(),
    cardInterestAccrued: v.number(),
    cardPaymentsApplied: v.number(),
    cardSpendAdded: v.number(),
    loanInterestAccrued: v.number(),
    loanPaymentsApplied: v.number(),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt'])
    .index('by_userId_cycleKey', ['userId', 'cycleKey'])
    .index('by_userId_idempotencyKey', ['userId', 'idempotencyKey']),
  monthCloseSnapshots: defineTable({
    userId: v.string(),
    cycleKey: v.string(),
    ranAt: v.number(),
    summary: cycleSummarySnapshot,
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_cycleKey', ['userId', 'cycleKey'])
    .index('by_userId_ranAt', ['userId', 'ranAt']),
  purchaseMonthCloseRuns: defineTable({
    userId: v.string(),
    monthKey: v.string(),
    source: cycleRunSource,
    status: cycleRunStatus,
    idempotencyKey: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    summaryJson: v.optional(v.string()),
    totalPurchases: v.number(),
    totalAmount: v.number(),
    pendingCount: v.number(),
    postedCount: v.number(),
    reconciledCount: v.number(),
    pendingAmount: v.number(),
    duplicateCount: v.number(),
    anomalyCount: v.number(),
    missingCategoryCount: v.number(),
    ranAt: v.number(),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_monthKey', ['userId', 'monthKey'])
    .index('by_userId_createdAt', ['userId', 'createdAt'])
    .index('by_userId_idempotencyKey', ['userId', 'idempotencyKey']),
  accounts: defineTable({
    userId: v.string(),
    name: v.string(),
    type: accountType,
    balance: v.number(),
    ledgerBalance: v.optional(v.number()),
    pendingBalance: v.optional(v.number()),
    purpose: v.optional(accountPurpose),
    liquid: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt']),
  accountTransfers: defineTable({
    userId: v.string(),
    sourceAccountId: v.id('accounts'),
    destinationAccountId: v.id('accounts'),
    amount: v.number(),
    transferDate: v.string(),
    reference: v.optional(v.string()),
    note: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt'])
    .index('by_userId_transferDate', ['userId', 'transferDate'])
    .index('by_userId_sourceAccountId_createdAt', ['userId', 'sourceAccountId', 'createdAt'])
    .index('by_userId_destinationAccountId_createdAt', ['userId', 'destinationAccountId', 'createdAt']),
  accountReconciliationChecks: defineTable({
    userId: v.string(),
    accountId: v.id('accounts'),
    cycleMonth: v.string(),
    statementStartBalance: v.number(),
    statementEndBalance: v.number(),
    ledgerEndBalance: v.number(),
    unmatchedDelta: v.number(),
    reconciled: v.boolean(),
    note: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt'])
    .index('by_userId_accountId_cycleMonth', ['userId', 'accountId', 'cycleMonth'])
    .index('by_userId_cycleMonth_createdAt', ['userId', 'cycleMonth', 'createdAt']),
  goals: defineTable({
    userId: v.string(),
    title: v.string(),
    targetAmount: v.number(),
    currentAmount: v.number(),
    targetDate: v.string(),
    priority: goalPriority,
    goalType: v.optional(goalType),
    contributionAmount: v.optional(v.number()),
    cadence: v.optional(cadence),
    customInterval: v.optional(v.number()),
    customUnit: v.optional(customCadenceUnit),
    fundingSources: v.optional(v.array(goalFundingSourceMapItem)),
    paused: v.optional(v.boolean()),
    pausedAt: v.optional(v.number()),
    pauseReason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt']),
  goalEvents: defineTable({
    userId: v.string(),
    goalId: v.id('goals'),
    eventType: goalEventType,
    source: goalEventSource,
    amountDelta: v.optional(v.number()),
    beforeCurrentAmount: v.optional(v.number()),
    afterCurrentAmount: v.optional(v.number()),
    beforeTargetAmount: v.optional(v.number()),
    afterTargetAmount: v.optional(v.number()),
    beforeTargetDate: v.optional(v.string()),
    afterTargetDate: v.optional(v.string()),
    pausedBefore: v.optional(v.boolean()),
    pausedAfter: v.optional(v.boolean()),
    metadataJson: v.optional(v.string()),
    note: v.optional(v.string()),
    occurredAt: v.number(),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt'])
    .index('by_userId_goalId_createdAt', ['userId', 'goalId', 'createdAt']),
  transactionRules: defineTable({
    userId: v.string(),
    name: v.string(),
    matchType: ruleMatchType,
    merchantPattern: v.string(),
    category: v.string(),
    reconciliationStatus: v.optional(reconciliationStatus),
    fundingSourceType: v.optional(purchaseFundingSourceType),
    fundingSourceId: v.optional(v.string()),
    priority: v.number(),
    active: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt']),
  purchaseSplits: defineTable({
    userId: v.string(),
    purchaseId: v.id('purchases'),
    category: v.string(),
    amount: v.number(),
    goalId: v.optional(v.id('goals')),
    accountId: v.optional(v.id('accounts')),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_purchaseId', ['purchaseId']),
  purchaseSplitTemplates: defineTable({
    userId: v.string(),
    name: v.string(),
    splits: v.array(
      v.object({
        category: v.string(),
        percentage: v.number(),
        goalId: v.optional(v.id('goals')),
        accountId: v.optional(v.id('accounts')),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt']),
  envelopeBudgets: defineTable({
    userId: v.string(),
    month: v.string(),
    category: v.string(),
    targetAmount: v.number(),
    rolloverEnabled: v.boolean(),
    carryoverAmount: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_month', ['userId', 'month']),
  incomeAllocationRules: defineTable({
    userId: v.string(),
    target: incomeAllocationTarget,
    percentage: v.number(),
    active: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt'])
    .index('by_userId_target', ['userId', 'target']),
  incomeAllocationSuggestions: defineTable({
    userId: v.string(),
    month: v.string(),
    runId: v.string(),
    target: incomeAllocationTarget,
    actionType: incomeAllocationActionType,
    title: v.string(),
    detail: v.string(),
    percentage: v.number(),
    amount: v.number(),
    status: incomeAllocationSuggestionStatus,
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt'])
    .index('by_userId_month', ['userId', 'month'])
    .index('by_userId_month_target', ['userId', 'month', 'target']),
  planningMonthVersions: defineTable({
    userId: v.string(),
    month: v.string(),
    versionKey: planningVersionKey,
    expectedIncome: v.number(),
    fixedCommitments: v.number(),
    variableSpendingCap: v.number(),
    notes: v.optional(v.string()),
    isSelected: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_month', ['userId', 'month'])
    .index('by_userId_month_versionKey', ['userId', 'month', 'versionKey'])
    .index('by_userId_month_isSelected', ['userId', 'month', 'isSelected']),
  planningActionTasks: defineTable({
    userId: v.string(),
    month: v.string(),
    versionKey: planningVersionKey,
    title: v.string(),
    detail: v.string(),
    category: v.string(),
    impactAmount: v.number(),
    status: planningActionTaskStatus,
    source: planningActionTaskSource,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_month_createdAt', ['userId', 'month', 'createdAt'])
    .index('by_userId_month_status', ['userId', 'month', 'status'])
    .index('by_userId_month_versionKey', ['userId', 'month', 'versionKey']),
  cycleAuditLogs: defineTable({
    userId: v.string(),
    source: cycleRunSource,
    cycleKey: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    ranAt: v.number(),
    updatedCards: v.number(),
    updatedLoans: v.number(),
    cardCyclesApplied: v.number(),
    loanCyclesApplied: v.number(),
    cardInterestAccrued: v.number(),
    cardPaymentsApplied: v.number(),
    cardSpendAdded: v.number(),
    loanInterestAccrued: v.number(),
    loanPaymentsApplied: v.number(),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_ranAt', ['userId', 'ranAt']),
  cycleStepAlerts: defineTable({
    userId: v.string(),
    cycleKey: v.string(),
    idempotencyKey: v.optional(v.string()),
    source: cycleRunSource,
    step: v.string(),
    severity: cycleStepAlertSeverity,
    message: v.string(),
    metadataJson: v.optional(v.string()),
    occurredAt: v.number(),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt'])
    .index('by_userId_cycleKey_createdAt', ['userId', 'cycleKey', 'createdAt']),
  financePreferences: defineTable({
    userId: v.string(),
    currency: v.string(),
    locale: v.string(),
    displayName: v.optional(v.string()),
    timezone: v.optional(v.string()),
    weekStartDay: v.optional(weekStartDay),
    defaultMonthPreset: v.optional(defaultMonthPreset),
    dueRemindersEnabled: v.optional(v.boolean()),
    dueReminderDays: v.optional(v.number()),
    monthlyCycleAlertsEnabled: v.optional(v.boolean()),
    reconciliationRemindersEnabled: v.optional(v.boolean()),
    goalAlertsEnabled: v.optional(v.boolean()),
    defaultBillCategory: v.optional(billCategory),
    defaultBillScope: v.optional(billScope),
    defaultPurchaseOwnership: v.optional(purchaseOwnership),
    defaultPurchaseCategory: v.optional(v.string()),
    billNotesTemplate: v.optional(v.string()),
    purchaseNotesTemplate: v.optional(v.string()),
    uiDensity: v.optional(uiDensity),
    defaultLandingTab: v.optional(appTabKey),
    dashboardCardOrder: v.optional(v.array(v.string())),
    monthlyAutomationEnabled: v.optional(v.boolean()),
    monthlyAutomationRunDay: v.optional(v.number()),
    monthlyAutomationRunHour: v.optional(v.number()),
    monthlyAutomationRunMinute: v.optional(v.number()),
    monthlyAutomationRetryStrategy: v.optional(monthlyAutomationRetryStrategy),
    monthlyAutomationMaxRetries: v.optional(v.number()),
    alertEscalationFailureStreakThreshold: v.optional(v.number()),
    alertEscalationFailedStepsThreshold: v.optional(v.number()),
    planningDefaultVersionKey: v.optional(planningVersionKey),
    planningAutoApplyMode: v.optional(planningAutoApplyMode),
    planningNegativeForecastFallback: v.optional(planningNegativeForecastFallback),
    updatedAt: v.number(),
  }).index('by_userId', ['userId']),
  settingsProfiles: defineTable({
    userId: v.string(),
    name: v.string(),
    nameNormalized: v.string(),
    description: v.optional(v.string()),
    preferenceJson: v.string(),
    lastAppliedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_updatedAt', ['userId', 'updatedAt'])
    .index('by_userId_nameNormalized', ['userId', 'nameNormalized']),
  consentSettings: defineTable({
    userId: v.string(),
    diagnosticsEnabled: v.boolean(),
    analyticsEnabled: v.boolean(),
    updatedAt: v.number(),
  }).index('by_userId', ['userId']),
  consentLogs: defineTable({
    userId: v.string(),
    consentType,
    enabled: v.boolean(),
    version: v.string(),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt']),
  userExports: defineTable({
    userId: v.string(),
    storageId: v.optional(v.id('_storage')),
    status: exportStatus,
    byteSize: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    formatVersion: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt'])
    .index('by_userId_status', ['userId', 'status']),
  userExportDownloads: defineTable({
    userId: v.string(),
    exportId: v.id('userExports'),
    filename: v.string(),
    byteSize: v.optional(v.number()),
    userAgent: v.optional(v.string()),
    source: v.optional(v.string()),
    downloadedAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_downloadedAt', ['userId', 'downloadedAt'])
    .index('by_userId_exportId_downloadedAt', ['userId', 'exportId', 'downloadedAt']),
  deletionJobs: defineTable({
    userId: v.string(),
    status: deletionJobStatus,
    progressJson: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt']),
  retentionPolicies: defineTable({
    userId: v.string(),
    policyKey: v.string(),
    retentionDays: v.number(),
    enabled: v.boolean(),
    updatedAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_policyKey', ['userId', 'policyKey']),
  clientOpsMetrics: defineTable({
    userId: v.string(),
    event: v.string(),
    queuedCount: v.optional(v.number()),
    conflictCount: v.optional(v.number()),
    flushAttempted: v.optional(v.number()),
    flushSucceeded: v.optional(v.number()),
    payloadJson: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_createdAt', ['userId', 'createdAt']),
})
