import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { DataTable, PillBadge, SurfaceCard } from '@/components/ui'
import type {
  AutoAllocationSuggestionEntry,
  AutoAllocationPlan,
  BillRiskAlert,
  BudgetPerformance,
  EnvelopeBudgetEntry,
  EnvelopeBudgetId,
  ForecastWindow,
  IncomeAllocationRuleEntry,
  IncomeAllocationRuleId,
  IncomeAllocationTarget,
  PlanningActionTask,
  PlanningActionTaskStatus,
  PlanningAdherenceRow,
  PlanningAuditEvent,
  PlanningKpiSummary,
  PlanningPlanVersion,
  PlanningVersionKey,
  PlanningWorkspaceSummary,
  MonthCloseChecklistItem,
  RecurringCandidate,
  ReconciliationStatus,
  RuleMatchType,
  Summary,
  TransactionRuleEntry,
  TransactionRuleId,
} from './financeTypes'

type RuleForm = {
  name: string
  matchType: RuleMatchType
  merchantPattern: string
  category: string
  reconciliationStatus: '' | ReconciliationStatus
  priority: string
  active: boolean
}

type BudgetForm = {
  month: string
  category: string
  targetAmount: string
  rolloverEnabled: boolean
  carryoverAmount: string
}

type WhatIfInput = {
  incomeDropPercent: string
  billIncreasePercent: string
  extraDebtPayment: string
  oneOffExpense: string
  seasonalSmoothingEnabled: boolean
  seasonalSmoothingMonths: string
}

type ReallocationSuggestion = {
  id: string
  title: string
  detail: string
  impactAmount: number
  severity: 'critical' | 'warning' | 'good'
}

type AllocationRuleForm = {
  target: IncomeAllocationTarget
  percentage: string
  active: boolean
}

type PlanningVersionForm = {
  expectedIncome: string
  fixedCommitments: string
  variableSpendingCap: string
  notes: string
}

type PlanningTabProps = {
  summary: Summary
  ruleForm: RuleForm
  setRuleForm: Dispatch<SetStateAction<RuleForm>>
  ruleEditId: TransactionRuleId | null
  setRuleEditId: Dispatch<SetStateAction<TransactionRuleId | null>>
  sortedRules: TransactionRuleEntry[]
  submitRule: (event: FormEvent<HTMLFormElement>) => void
  startRuleEdit: (entry: TransactionRuleEntry) => void
  removeRule: (id: TransactionRuleId) => Promise<void>
  budgetForm: BudgetForm
  setBudgetForm: Dispatch<SetStateAction<BudgetForm>>
  budgetEditId: EnvelopeBudgetId | null
  setBudgetEditId: Dispatch<SetStateAction<EnvelopeBudgetId | null>>
  sortedBudgets: EnvelopeBudgetEntry[]
  submitBudget: (event: FormEvent<HTMLFormElement>) => void
  startBudgetEdit: (entry: EnvelopeBudgetEntry) => void
  removeBudget: (id: EnvelopeBudgetId) => Promise<void>
  allocationRuleForm: AllocationRuleForm
  setAllocationRuleForm: Dispatch<SetStateAction<AllocationRuleForm>>
  allocationRuleEditId: IncomeAllocationRuleId | null
  setAllocationRuleEditId: Dispatch<SetStateAction<IncomeAllocationRuleId | null>>
  sortedIncomeAllocationRules: IncomeAllocationRuleEntry[]
  submitAllocationRule: (event: FormEvent<HTMLFormElement>) => void
  startAllocationRuleEdit: (entry: IncomeAllocationRuleEntry) => void
  removeAllocationRule: (id: IncomeAllocationRuleId) => Promise<void>
  planningMonth: string
  setPlanningMonth: (month: string) => void
  planningVersions: PlanningPlanVersion[]
  activePlanningVersion: PlanningVersionKey
  setActivePlanningVersion: (version: PlanningVersionKey) => void
  planningVersionForm: PlanningVersionForm
  setPlanningVersionForm: (value: PlanningVersionForm) => void
  planningVersionDirty: boolean
  planningWorkspace: PlanningWorkspaceSummary
  isSavingPlanningVersion: boolean
  planningVersionFeedback: string | null
  submitPlanningVersion: (event: FormEvent<HTMLFormElement>) => void
  resetPlanningVersionForm: () => void
  planningActionTasks: PlanningActionTask[]
  planningAdherenceRows: PlanningAdherenceRow[]
  planningKpis: PlanningKpiSummary
  planningAuditEvents: PlanningAuditEvent[]
  isApplyingPlanToMonth: boolean
  applyPlanFeedback: string | null
  updatingPlanningTaskId: string | null
  onApplyPlanToMonth: () => Promise<void>
  onUpdatePlanningTaskStatus: (id: string, status: PlanningActionTaskStatus) => Promise<void>
  incomeAllocationSuggestions: AutoAllocationSuggestionEntry[]
  isApplyingAutoAllocation: boolean
  autoAllocationLastRunNote: string | null
  onApplyAutoAllocationNow: () => Promise<void>
  whatIfInput: WhatIfInput
  setWhatIfInput: Dispatch<SetStateAction<WhatIfInput>>
  autoAllocationPlan: AutoAllocationPlan
  budgetPerformance: BudgetPerformance[]
  recurringCandidates: RecurringCandidate[]
  billRiskAlerts: BillRiskAlert[]
  forecastWindows: ForecastWindow[]
  monthCloseChecklist: MonthCloseChecklistItem[]
  dataQuality: {
    duplicateCount: number
    anomalyCount: number
    missingCategoryCount: number
    pendingReconciliationCount: number
    splitMismatchCount: number
  }
  formatMoney: (value: number) => string
}

type RuleSortKey = 'priority_desc' | 'priority_asc' | 'name_asc' | 'category_asc' | 'status_asc'
type BudgetSortKey = 'category_asc' | 'target_desc' | 'spent_desc' | 'variance_asc' | 'status_priority'
type AllocationSortKey = 'target_asc' | 'percentage_desc' | 'percentage_asc' | 'status_asc'

const emptyRuleForm: RuleForm = {
  name: '',
  matchType: 'contains',
  merchantPattern: '',
  category: '',
  reconciliationStatus: '',
  priority: '10',
  active: true,
}

const budgetStatusRank: Record<BudgetPerformance['status'], number> = {
  over: 0,
  warning: 1,
  on_track: 2,
}

const allocationTargetOrder: Record<IncomeAllocationTarget, number> = {
  bills: 0,
  savings: 1,
  goals: 2,
  debt_overpay: 3,
}

const allocationTargetLabel: Record<IncomeAllocationTarget, string> = {
  bills: 'Bills',
  savings: 'Savings',
  goals: 'Goals',
  debt_overpay: 'Debt overpay',
}

const allocationActionTypeLabel: Record<AutoAllocationSuggestionEntry['actionType'], string> = {
  reserve_bills: 'Reserve bills',
  move_to_savings: 'Move to savings',
  fund_goals: 'Fund goals',
  debt_overpay: 'Debt overpay',
}

const planningVersionOrder: PlanningVersionKey[] = ['base', 'conservative', 'aggressive']
const seasonalIrregularCategoryPattern =
  /\b(utilit(?:y|ies)|electric|gas|water|energy|heat(?:ing)?|holiday|annual|renew(?:al)?|insurance|tax|school|travel)\b/i

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export function PlanningTab({
  summary,
  ruleForm,
  setRuleForm,
  ruleEditId,
  setRuleEditId,
  sortedRules,
  submitRule,
  startRuleEdit,
  removeRule,
  budgetForm,
  setBudgetForm,
  budgetEditId,
  setBudgetEditId,
  sortedBudgets,
  submitBudget,
  startBudgetEdit,
  removeBudget,
  allocationRuleForm,
  setAllocationRuleForm,
  allocationRuleEditId,
  setAllocationRuleEditId,
  sortedIncomeAllocationRules,
  submitAllocationRule,
  startAllocationRuleEdit,
  removeAllocationRule,
  planningMonth,
  setPlanningMonth,
  planningVersions,
  activePlanningVersion,
  setActivePlanningVersion,
  planningVersionForm,
  setPlanningVersionForm,
  planningVersionDirty,
  planningWorkspace,
  isSavingPlanningVersion,
  planningVersionFeedback,
  submitPlanningVersion,
  resetPlanningVersionForm,
  planningActionTasks,
  planningAdherenceRows,
  planningKpis,
  planningAuditEvents,
  isApplyingPlanToMonth,
  applyPlanFeedback,
  updatingPlanningTaskId,
  onApplyPlanToMonth,
  onUpdatePlanningTaskStatus,
  incomeAllocationSuggestions,
  isApplyingAutoAllocation,
  autoAllocationLastRunNote,
  onApplyAutoAllocationNow,
  whatIfInput,
  setWhatIfInput,
  autoAllocationPlan,
  budgetPerformance,
  recurringCandidates,
  billRiskAlerts,
  forecastWindows,
  monthCloseChecklist,
  dataQuality,
  formatMoney,
}: PlanningTabProps) {
  const [ruleQuery, setRuleQuery] = useState('')
  const [ruleSortKey, setRuleSortKey] = useState<RuleSortKey>('priority_desc')
  const [budgetQuery, setBudgetQuery] = useState('')
  const [budgetStatusFilter, setBudgetStatusFilter] = useState<'all' | BudgetPerformance['status']>('all')
  const [budgetSortKey, setBudgetSortKey] = useState<BudgetSortKey>('category_asc')
  const [allocationQuery, setAllocationQuery] = useState('')
  const [allocationSortKey, setAllocationSortKey] = useState<AllocationSortKey>('target_asc')

  const baselineForecastByWindow = useMemo(
    () => new Map<ForecastWindow['days'], ForecastWindow>(forecastWindows.map((window) => [window.days, window])),
    [forecastWindows],
  )
  const incomeDropRatio = clamp((Number.parseFloat(whatIfInput.incomeDropPercent || '0') || 0) / 100, 0, 1)
  const billIncreaseRatio = clamp((Number.parseFloat(whatIfInput.billIncreasePercent || '0') || 0) / 100, 0, 5)
  const extraDebtPayment = Math.max(Number.parseFloat(whatIfInput.extraDebtPayment || '0') || 0, 0)
  const oneOffExpense = Math.max(Number.parseFloat(whatIfInput.oneOffExpense || '0') || 0, 0)
  const seasonalSmoothingMonths = clamp(Math.round(Number.parseFloat(whatIfInput.seasonalSmoothingMonths || '6') || 6), 2, 24)
  const commitmentsBillShare =
    summary.monthlyCommitments > 0 ? clamp(summary.monthlyBills / summary.monthlyCommitments, 0, 1) : 0

  const irregularBudgetRows = useMemo(
    () =>
      budgetPerformance
        .map((row) => {
          const effectiveTarget = Math.max(row.effectiveTarget, 0.01)
          const projectedVarianceRatio = Math.abs(row.projectedMonthEnd - row.effectiveTarget) / effectiveTarget
          const seasonalSignal = seasonalIrregularCategoryPattern.test(row.category)
          return {
            ...row,
            projectedVarianceRatio,
            isIrregular: seasonalSignal || projectedVarianceRatio >= 0.24,
          }
        })
        .filter((row) => row.isIrregular),
    [budgetPerformance],
  )

  const irregularOvershoot = useMemo(
    () => irregularBudgetRows.reduce((sum, row) => sum + Math.max(row.projectedMonthEnd - row.effectiveTarget, 0), 0),
    [irregularBudgetRows],
  )
  const smoothingWeight = whatIfInput.seasonalSmoothingEnabled
    ? clamp(seasonalSmoothingMonths / 12, 0.2, 1.5)
    : 0
  const seasonalSmoothingAdjustment = roundCurrency(irregularOvershoot * smoothingWeight)
  const baselineMonthlyNet = planningWorkspace.plannedMonthlyNet
  const plannedIncomeAfterDrop = planningWorkspace.plannedExpectedIncome * (1 - incomeDropRatio)
  const estimatedBillIncrease = planningWorkspace.plannedFixedCommitments * commitmentsBillShare * billIncreaseRatio
  const plannedFixedAfterWhatIf = planningWorkspace.plannedFixedCommitments + estimatedBillIncrease + extraDebtPayment
  const plannedVariableAfterWhatIf = planningWorkspace.plannedVariableSpendingCap + seasonalSmoothingAdjustment
  const scenarioMonthlyNet = plannedIncomeAfterDrop - plannedFixedAfterWhatIf - plannedVariableAfterWhatIf
  const scenarioDelta = scenarioMonthlyNet - baselineMonthlyNet
  const monthlyRunRateOutflow = plannedFixedAfterWhatIf + plannedVariableAfterWhatIf

  const planningForecastWindows = useMemo(() => {
    return ([30, 90, 365] as const).map((days) => {
      const periodFactor = days / 30
      const projectedNet = roundCurrency(scenarioMonthlyNet * periodFactor - oneOffExpense)
      const projectedCash = roundCurrency(summary.liquidReserves + projectedNet)
      const baselineWindow = baselineForecastByWindow.get(days)
      const baselineProjectedCash = baselineWindow
        ? baselineWindow.projectedCash
        : roundCurrency(summary.liquidReserves + baselineMonthlyNet * periodFactor)
      const deltaProjectedCash = roundCurrency(projectedCash - baselineProjectedCash)
      const coverageMonths = monthlyRunRateOutflow > 0 ? roundCurrency(projectedCash / monthlyRunRateOutflow) : 99
      const risk: ForecastWindow['risk'] =
        projectedCash < 0 ? 'critical' : projectedCash < plannedFixedAfterWhatIf ? 'warning' : 'healthy'
      return {
        days,
        projectedNet,
        projectedCash,
        coverageMonths,
        risk,
        baselineProjectedCash,
        deltaProjectedCash,
      }
    })
  }, [
    baselineForecastByWindow,
    baselineMonthlyNet,
    monthlyRunRateOutflow,
    oneOffExpense,
    plannedFixedAfterWhatIf,
    scenarioMonthlyNet,
    summary.liquidReserves,
  ])

  const forecastByWindow = useMemo(
    () => new Map<ForecastWindow['days'], (typeof planningForecastWindows)[number]>(planningForecastWindows.map((window) => [window.days, window])),
    [planningForecastWindows],
  )

  const autoReallocationSuggestions = useMemo<ReallocationSuggestion[]>(() => {
    const monthlyGapFromNet = Math.max(roundCurrency(-scenarioMonthlyNet), 0)
    const monthlyGapFromCash = planningForecastWindows.reduce((maxGap, window) => {
      if (window.projectedCash >= 0) return maxGap
      return Math.max(maxGap, roundCurrency((-window.projectedCash / window.days) * 30))
    }, 0)
    const gap = Math.max(monthlyGapFromNet, monthlyGapFromCash)

    if (gap <= 0) {
      return [
        {
          id: 'stable-plan',
          title: 'Plan is cash-positive across 30/90/365 days',
          detail: 'No automatic reallocation required. Keep monitoring seasonal categories and bill risk alerts.',
          impactAmount: 0,
          severity: 'good',
        },
      ]
    }

    const suggestions: ReallocationSuggestion[] = []
    let remainingGap = gap

    const variableCapCut = roundCurrency(Math.min(remainingGap, plannedVariableAfterWhatIf * 0.22))
    if (variableCapCut > 0) {
      suggestions.push({
        id: 'trim-variable-cap',
        title: 'Trim variable spending cap',
        detail: `Reduce discretionary cap by ${formatMoney(variableCapCut)} / month to close the immediate forecast gap.`,
        impactAmount: variableCapCut,
        severity: 'critical',
      })
      remainingGap = roundCurrency(Math.max(remainingGap - variableCapCut, 0))
    }

    const savingsAndGoalsCapacity = autoAllocationPlan.buckets
      .filter((bucket) => bucket.active && (bucket.target === 'savings' || bucket.target === 'goals'))
      .reduce((sum, bucket) => sum + bucket.monthlyAmount, 0)
    const reallocationShift = roundCurrency(Math.min(remainingGap, savingsAndGoalsCapacity))
    if (reallocationShift > 0) {
      suggestions.push({
        id: 'shift-allocation',
        title: 'Shift savings/goals allocation to bills',
        detail: `Temporarily re-route ${formatMoney(reallocationShift)} / month from savings/goals buckets to bill coverage.`,
        impactAmount: reallocationShift,
        severity: remainingGap > gap * 0.35 ? 'critical' : 'warning',
      })
      remainingGap = roundCurrency(Math.max(remainingGap - reallocationShift, 0))
    }

    if (extraDebtPayment > 0 && remainingGap > 0) {
      const pauseDebtOverpay = roundCurrency(Math.min(remainingGap, extraDebtPayment))
      suggestions.push({
        id: 'pause-extra-debt',
        title: 'Pause extra debt overpay',
        detail: `Hold ${formatMoney(pauseDebtOverpay)} / month in extra debt payments until forecast returns above zero.`,
        impactAmount: pauseDebtOverpay,
        severity: 'warning',
      })
      remainingGap = roundCurrency(Math.max(remainingGap - pauseDebtOverpay, 0))
    }

    if (oneOffExpense > 0 && remainingGap > 0) {
      const spreadRelief = roundCurrency(Math.min(remainingGap, oneOffExpense / 3))
      suggestions.push({
        id: 'spread-one-off',
        title: 'Split one-off expense over 3 months',
        detail: `Spreading the one-off cost frees about ${formatMoney(spreadRelief)} / month in near-term cashflow.`,
        impactAmount: spreadRelief,
        severity: 'warning',
      })
      remainingGap = roundCurrency(Math.max(remainingGap - spreadRelief, 0))
    }

    if (irregularBudgetRows.length > 0 && remainingGap > 0) {
      const irregularFocusAmount = roundCurrency(Math.min(remainingGap, irregularOvershoot))
      suggestions.push({
        id: 'tighten-irregular-categories',
        title: 'Target irregular categories first',
        detail: `Focus controls on ${irregularBudgetRows.length} irregular categories to recover ${formatMoney(
          irregularFocusAmount,
        )} / month.`,
        impactAmount: irregularFocusAmount,
        severity: 'warning',
      })
      remainingGap = roundCurrency(Math.max(remainingGap - irregularFocusAmount, 0))
    }

    if (remainingGap > 0) {
      suggestions.push({
        id: 'residual-gap',
        title: 'Residual gap requires structural changes',
        detail: `${formatMoney(remainingGap)} / month still uncovered. Consider renegotiating fixed commitments or increasing income assumptions.`,
        impactAmount: remainingGap,
        severity: 'critical',
      })
    }

    return suggestions
  }, [
    autoAllocationPlan.buckets,
    extraDebtPayment,
    formatMoney,
    irregularBudgetRows,
    irregularOvershoot,
    oneOffExpense,
    planningForecastWindows,
    plannedVariableAfterWhatIf,
    scenarioMonthlyNet,
  ])

  const budgetById = useMemo(() => {
    const lookup = new Map<string, EnvelopeBudgetEntry>()
    sortedBudgets.forEach((entry) => {
      lookup.set(String(entry._id), entry)
    })
    return lookup
  }, [sortedBudgets])

  const visibleRules = useMemo(() => {
    const query = ruleQuery.trim().toLowerCase()
    const filtered = query
      ? sortedRules.filter((rule) =>
          `${rule.name} ${rule.merchantPattern} ${rule.category}`.toLowerCase().includes(query),
        )
      : sortedRules.slice()

    return filtered.sort((a, b) => {
      switch (ruleSortKey) {
        case 'priority_desc':
          return b.priority - a.priority || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        case 'priority_asc':
          return a.priority - b.priority || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        case 'name_asc':
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        case 'category_asc':
          return a.category.localeCompare(b.category, undefined, { sensitivity: 'base' })
        case 'status_asc': {
          const aKey = a.active ? 0 : 1
          const bKey = b.active ? 0 : 1
          return aKey - bKey || b.priority - a.priority
        }
        default:
          return 0
      }
    })
  }, [ruleQuery, ruleSortKey, sortedRules])

  const visibleBudgetPerformance = useMemo(() => {
    const query = budgetQuery.trim().toLowerCase()
    const filtered = budgetPerformance.filter((entry) => {
      const statusMatch = budgetStatusFilter === 'all' ? true : entry.status === budgetStatusFilter
      const queryMatch = query.length === 0 ? true : entry.category.toLowerCase().includes(query)
      return statusMatch && queryMatch
    })

    return filtered.sort((a, b) => {
      switch (budgetSortKey) {
        case 'category_asc':
          return a.category.localeCompare(b.category, undefined, { sensitivity: 'base' })
        case 'target_desc':
          return b.effectiveTarget - a.effectiveTarget
        case 'spent_desc':
          return b.spent - a.spent
        case 'variance_asc':
          return a.variance - b.variance
        case 'status_priority':
          return budgetStatusRank[a.status] - budgetStatusRank[b.status] || a.variance - b.variance
        default:
          return 0
      }
    })
  }, [budgetPerformance, budgetQuery, budgetSortKey, budgetStatusFilter])

  const visibleAllocationRules = useMemo(() => {
    const query = allocationQuery.trim().toLowerCase()
    const filtered = query
      ? sortedIncomeAllocationRules.filter((rule) => {
          const label = allocationTargetLabel[rule.target]
          return `${rule.target} ${label}`.toLowerCase().includes(query)
        })
      : sortedIncomeAllocationRules.slice()

    return filtered.sort((a, b) => {
      switch (allocationSortKey) {
        case 'target_asc':
          return allocationTargetOrder[a.target] - allocationTargetOrder[b.target]
        case 'percentage_desc':
          return b.percentage - a.percentage || allocationTargetOrder[a.target] - allocationTargetOrder[b.target]
        case 'percentage_asc':
          return a.percentage - b.percentage || allocationTargetOrder[a.target] - allocationTargetOrder[b.target]
        case 'status_asc': {
          const aKey = a.active ? 0 : 1
          const bKey = b.active ? 0 : 1
          return aKey - bKey || b.percentage - a.percentage
        }
        default:
          return 0
      }
    })
  }, [allocationQuery, allocationSortKey, sortedIncomeAllocationRules])

  const monthCloseDoneCount = monthCloseChecklist.filter((item) => item.done).length
  const monthCloseCompletion =
    monthCloseChecklist.length > 0 ? Math.round((monthCloseDoneCount / monthCloseChecklist.length) * 100) : 0
  const qualityIssueCount =
    dataQuality.duplicateCount +
    dataQuality.anomalyCount +
    dataQuality.missingCategoryCount +
    dataQuality.pendingReconciliationCount +
    dataQuality.splitMismatchCount

  const scenarioDeltaPill = scenarioDelta >= 0 ? 'pill pill--good' : 'pill pill--critical'
  const ruleStatusPill = (active: boolean) => (active ? 'pill pill--good' : 'pill pill--neutral')
  const recStatusPill = (status: ReconciliationStatus | undefined) => {
    if (status === 'reconciled') return 'pill pill--good'
    if (status === 'pending') return 'pill pill--warning'
    return 'pill pill--neutral'
  }
  const budgetStatusPill = (status: BudgetPerformance['status']) => {
    if (status === 'over') return 'pill pill--critical'
    if (status === 'warning') return 'pill pill--warning'
    return 'pill pill--good'
  }
  const forecastRiskPill = (risk: ForecastWindow['risk']) => {
    if (risk === 'critical') return 'pill pill--critical'
    if (risk === 'warning') return 'pill pill--warning'
    return 'pill pill--good'
  }
  const billRiskPill = (risk: BillRiskAlert['risk']) => {
    if (risk === 'critical') return 'pill pill--critical'
    if (risk === 'warning') return 'pill pill--warning'
    return 'pill pill--good'
  }
  const planningTaskStatusPill = (status: PlanningActionTaskStatus) => {
    if (status === 'done') return 'pill pill--good'
    if (status === 'in_progress') return 'pill pill--warning'
    if (status === 'dismissed') return 'pill pill--neutral'
    return 'pill pill--critical'
  }
  const adherenceStatusPill = (status: PlanningAdherenceRow['status']) => {
    if (status === 'on_track') return 'pill pill--good'
    if (status === 'warning') return 'pill pill--warning'
    return 'pill pill--critical'
  }
  const parseAuditMetadata = (value?: string) => {
    if (!value) return null
    try {
      return JSON.parse(value) as Record<string, unknown>
    } catch {
      return null
    }
  }
  const planningTaskSummary = useMemo(
    () => ({
      total: planningActionTasks.length,
      done: planningActionTasks.filter((task) => task.status === 'done').length,
      inProgress: planningActionTasks.filter((task) => task.status === 'in_progress').length,
      open: planningActionTasks.filter((task) => task.status === 'suggested').length,
    }),
    [planningActionTasks],
  )

  const resetRuleForm = () => {
    setRuleEditId(null)
    setRuleForm(emptyRuleForm)
  }

  const resetBudgetForm = () => {
    setBudgetEditId(null)
    setBudgetForm({
      month: planningMonth,
      category: '',
      targetAmount: '',
      rolloverEnabled: true,
      carryoverAmount: '',
    })
  }

  const resetAllocationRuleForm = () => {
    setAllocationRuleEditId(null)
    setAllocationRuleForm({
      target: 'bills',
      percentage: '',
      active: true,
    })
  }

  const forecast30 = forecastByWindow.get(30)
  const forecast90 = forecastByWindow.get(90)
  const forecast365 = forecastByWindow.get(365)
  const hasRuleFilters = ruleQuery.length > 0 || ruleSortKey !== 'priority_desc'
  const hasBudgetFilters = budgetQuery.length > 0 || budgetStatusFilter !== 'all' || budgetSortKey !== 'category_asc'
  const hasAllocationFilters = allocationQuery.length > 0 || allocationSortKey !== 'target_asc'
  const latestAllocationSuggestionAt =
    incomeAllocationSuggestions.length > 0 ? Math.max(...incomeAllocationSuggestions.map((entry) => entry.createdAt)) : null
  const planningVersionByKey = useMemo(
    () => new Map<PlanningVersionKey, PlanningPlanVersion>(planningVersions.map((version) => [version.versionKey, version])),
    [planningVersions],
  )
  const activePlanningVersionRow =
    planningVersionByKey.get(activePlanningVersion) ??
    planningVersions.find((entry) => entry.isSelected) ??
    planningVersions[0]
  const activePlanningVersionLabel = activePlanningVersionRow?.label ?? 'Plan'
  const planningDeltaPill = planningWorkspace.deltaMonthlyNet >= 0 ? 'pill pill--good' : 'pill pill--critical'
  const deltaAmountClass = (value: number) => (value >= 0 ? 'amount-positive' : 'amount-negative')

  return (
    <section className="content-grid" aria-label="Planning and automation">
      <SurfaceCard className="panel panel-planning-workspace">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Phase 1 Workspace</p>
            <h2>Monthly planning versions</h2>
            <p className="panel-value">
              {planningMonth} - {activePlanningVersionLabel}
            </p>
            <p className="subnote">Build and save Base, Conservative, and Aggressive plan versions by month.</p>
          </div>
          <PillBadge className={planningDeltaPill}>
            {planningWorkspace.deltaMonthlyNet >= 0 ? '+' : ''}
            {formatMoney(planningWorkspace.deltaMonthlyNet)}
          </PillBadge>
        </header>

        <div className="planning-version-switch" role="tablist" aria-label="Planning versions">
          {planningVersionOrder.map((versionKey) => {
            const version = planningVersionByKey.get(versionKey)
            return (
              <button
                key={versionKey}
                type="button"
                role="tab"
                aria-selected={activePlanningVersion === versionKey}
                className={activePlanningVersion === versionKey ? 'btn btn-secondary btn--sm' : 'btn btn-ghost btn--sm'}
                onClick={() => setActivePlanningVersion(versionKey)}
              >
                {version?.label ?? versionKey}
              </button>
            )
          })}
        </div>

        <form className="entry-form entry-form--grid" onSubmit={submitPlanningVersion}>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="planning-month">Month</label>
              <input
                id="planning-month"
                type="month"
                value={planningMonth}
                onChange={(event) => setPlanningMonth(event.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="planning-expected-income">Expected income</label>
              <input
                id="planning-expected-income"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={planningVersionForm.expectedIncome}
                onChange={(event) =>
                  setPlanningVersionForm({
                    ...planningVersionForm,
                    expectedIncome: event.target.value,
                  })
                }
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="planning-fixed-commitments">Fixed commitments</label>
              <input
                id="planning-fixed-commitments"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={planningVersionForm.fixedCommitments}
                onChange={(event) =>
                  setPlanningVersionForm({
                    ...planningVersionForm,
                    fixedCommitments: event.target.value,
                  })
                }
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="planning-variable-cap">Variable spending cap</label>
              <input
                id="planning-variable-cap"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={planningVersionForm.variableSpendingCap}
                onChange={(event) =>
                  setPlanningVersionForm({
                    ...planningVersionForm,
                    variableSpendingCap: event.target.value,
                  })
                }
                required
              />
            </div>

            <div className="form-field form-field--span2">
              <label htmlFor="planning-version-notes">Version notes</label>
              <textarea
                id="planning-version-notes"
                value={planningVersionForm.notes}
                onChange={(event) =>
                  setPlanningVersionForm({
                    ...planningVersionForm,
                    notes: event.target.value,
                  })
                }
                placeholder="Optional assumptions for this version"
                rows={3}
              />
            </div>
          </div>

          <p className="form-hint">
            Save writes this version for the selected month and keeps it as the active planning profile.
          </p>

          <div className="form-actions row-actions">
            <button type="submit" className="btn btn-primary" disabled={isSavingPlanningVersion}>
              {isSavingPlanningVersion ? 'Saving...' : `Save ${activePlanningVersionLabel}`}
            </button>
            <button type="button" className="btn btn-ghost" onClick={resetPlanningVersionForm} disabled={!planningVersionDirty}>
              Reset
            </button>
          </div>

          {planningVersionFeedback ? <p className="form-hint">{planningVersionFeedback}</p> : null}
        </form>
      </SurfaceCard>

      <SurfaceCard className="panel panel-planning-compare">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Baseline vs Planned</p>
            <h2>Version comparison</h2>
            <p className="panel-value">{formatMoney(planningWorkspace.plannedMonthlyNet)} planned net</p>
          </div>
          <PillBadge className={planningDeltaPill}>
            {planningWorkspace.deltaMonthlyNet >= 0 ? '+' : ''}
            {formatMoney(planningWorkspace.deltaMonthlyNet)}
          </PillBadge>
        </header>
        <div className="table-wrap table-wrap--card">
          <DataTable className="data-table">
            <caption className="sr-only">Baseline versus planned metrics</caption>
            <thead>
              <tr>
                <th scope="col">Metric</th>
                <th scope="col">Baseline</th>
                <th scope="col">Planned</th>
                <th scope="col">Delta</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Expected income</td>
                <td className="table-amount">{formatMoney(planningWorkspace.baselineExpectedIncome)}</td>
                <td className="table-amount">{formatMoney(planningWorkspace.plannedExpectedIncome)}</td>
                <td className={`table-amount ${deltaAmountClass(planningWorkspace.deltaExpectedIncome)}`}>
                  {formatMoney(planningWorkspace.deltaExpectedIncome)}
                </td>
              </tr>
              <tr>
                <td>Fixed commitments</td>
                <td className="table-amount">{formatMoney(planningWorkspace.baselineFixedCommitments)}</td>
                <td className="table-amount">{formatMoney(planningWorkspace.plannedFixedCommitments)}</td>
                <td className={`table-amount ${deltaAmountClass(planningWorkspace.deltaFixedCommitments * -1)}`}>
                  {formatMoney(planningWorkspace.deltaFixedCommitments)}
                </td>
              </tr>
              <tr>
                <td>Variable spending cap</td>
                <td className="table-amount">{formatMoney(planningWorkspace.baselineVariableSpendingCap)}</td>
                <td className="table-amount">{formatMoney(planningWorkspace.plannedVariableSpendingCap)}</td>
                <td className={`table-amount ${deltaAmountClass(planningWorkspace.deltaVariableSpendingCap * -1)}`}>
                  {formatMoney(planningWorkspace.deltaVariableSpendingCap)}
                </td>
              </tr>
              <tr>
                <td>Monthly net</td>
                <td className="table-amount">{formatMoney(planningWorkspace.baselineMonthlyNet)}</td>
                <td className="table-amount">{formatMoney(planningWorkspace.plannedMonthlyNet)}</td>
                <td className={`table-amount ${deltaAmountClass(planningWorkspace.deltaMonthlyNet)}`}>
                  {formatMoney(planningWorkspace.deltaMonthlyNet)}
                </td>
              </tr>
            </tbody>
          </DataTable>
        </div>

        <div className="bulk-summary">
          <div>
            <p>Envelope target total</p>
            <strong>{formatMoney(planningWorkspace.envelopeEffectiveTargetTotal)}</strong>
            <small>
              {formatMoney(planningWorkspace.envelopeTargetTotal)} target + {formatMoney(planningWorkspace.envelopeCarryoverTotal)} carryover
            </small>
          </div>
          <div>
            <p>Rollover preview</p>
            <strong>{formatMoney(planningWorkspace.envelopeSuggestedRolloverTotal)}</strong>
            <small>{planningWorkspace.envelopeCoveragePercent.toFixed(1)}% of planned variable cap covered by envelopes</small>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Phase 3 Execution</p>
            <h2>Apply plan to month</h2>
            <p className="panel-value">
              {planningTaskSummary.done}/{planningTaskSummary.total} tasks complete
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn--sm"
            onClick={() => void onApplyPlanToMonth()}
            disabled={isApplyingPlanToMonth}
          >
            {isApplyingPlanToMonth ? 'Applying...' : 'Apply plan to month'}
          </button>
        </header>
        <div className="bulk-summary">
          <div>
            <p>Open tasks</p>
            <strong>{planningTaskSummary.open}</strong>
            <small>{planningTaskSummary.inProgress} in progress</small>
          </div>
          <div>
            <p>Total impact</p>
            <strong>{formatMoney(planningActionTasks.reduce((sum, task) => sum + Math.max(task.impactAmount, 0), 0))}</strong>
            <small>Execution workload for {planningMonth}</small>
          </div>
        </div>
        {applyPlanFeedback ? <p className="subnote">{applyPlanFeedback}</p> : null}
        {planningActionTasks.length === 0 ? (
          <p className="empty-state">No execution tasks yet. Use Apply plan to month to generate them.</p>
        ) : (
          <div className="table-wrap table-wrap--card">
            <DataTable className="data-table">
              <caption className="sr-only">Planning action tasks</caption>
              <thead>
                <tr>
                  <th scope="col">Task</th>
                  <th scope="col">Category</th>
                  <th scope="col">Impact</th>
                  <th scope="col">Status</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {planningActionTasks.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <div>
                        <strong>{task.title}</strong>
                        <p className="subnote">{task.detail}</p>
                      </div>
                    </td>
                    <td>
                      <PillBadge className="pill pill--neutral">{task.category}</PillBadge>
                    </td>
                    <td className="table-amount">{formatMoney(task.impactAmount)}</td>
                    <td>
                      <PillBadge className={planningTaskStatusPill(task.status)}>{task.status}</PillBadge>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn--sm"
                          disabled={updatingPlanningTaskId === task.id || task.status === 'in_progress'}
                          onClick={() => void onUpdatePlanningTaskStatus(task.id, 'in_progress')}
                        >
                          In progress
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn--sm"
                          disabled={updatingPlanningTaskId === task.id || task.status === 'done'}
                          onClick={() => void onUpdatePlanningTaskStatus(task.id, 'done')}
                        >
                          Done
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Plan Adherence</p>
            <h2>Planned vs actual variance</h2>
            <p className="panel-value">{planningAdherenceRows.length} categories tracked</p>
          </div>
        </header>
        {planningAdherenceRows.length === 0 ? (
          <p className="empty-state">No adherence rows yet. Add budgets and purchases for this month.</p>
        ) : (
          <div className="table-wrap table-wrap--card">
            <DataTable className="data-table data-table--wide">
              <caption className="sr-only">Planning adherence by category</caption>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Planned</th>
                  <th scope="col">Actual</th>
                  <th scope="col">Variance</th>
                  <th scope="col">Variance %</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {planningAdherenceRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.category}</td>
                    <td className="table-amount">{formatMoney(row.planned)}</td>
                    <td className="table-amount">{formatMoney(row.actual)}</td>
                    <td className={`table-amount ${row.variance > 0 ? 'amount-negative' : 'amount-positive'}`}>
                      {formatMoney(row.variance)}
                    </td>
                    <td className={`table-amount ${row.varianceRatePercent > 0 ? 'amount-negative' : 'amount-positive'}`}>
                      {row.varianceRatePercent.toFixed(1)}%
                    </td>
                    <td>
                      <PillBadge className={adherenceStatusPill(row.status)}>{row.status}</PillBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard className="panel panel-trust-kpis">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Planning</p>
            <h2>Command center</h2>
            <p className="panel-value">{planningMonth}</p>
          </div>
        </header>
        <div className="trust-kpi-grid" aria-label="Planning KPI summary">
          <div className="trust-kpi-tile">
            <p>Forecast accuracy</p>
            <strong>{planningKpis.forecastAccuracyPercent.toFixed(1)}%</strong>
            <small>{formatMoney(planningKpis.actualNet)} actual vs {formatMoney(planningKpis.plannedNet)} planned net</small>
          </div>
          <div className="trust-kpi-tile">
            <p>Variance rate</p>
            <strong>{planningKpis.varianceRatePercent.toFixed(1)}%</strong>
            <small>{planningAdherenceRows.length} category variance rows</small>
          </div>
          <div className="trust-kpi-tile">
            <p>Plan completion</p>
            <strong>{planningKpis.planCompletionPercent.toFixed(1)}%</strong>
            <small>
              {planningKpis.completedTasks} / {planningKpis.totalTasks} execution tasks done
            </small>
          </div>
          <div className="trust-kpi-tile">
            <p>Data quality issues</p>
            <strong>{qualityIssueCount}</strong>
            <small>{dataQuality.pendingReconciliationCount} pending reconcile</small>
          </div>
          <div className="trust-kpi-tile">
            <p>Month close progress</p>
            <strong>{monthCloseCompletion}%</strong>
            <small>
              {monthCloseDoneCount} / {monthCloseChecklist.length || 0} checklist items
            </small>
          </div>
          <div className="trust-kpi-tile">
            <p>Scenario delta</p>
            <strong>{formatMoney(scenarioDelta)}</strong>
            <small>{scenarioDelta >= 0 ? 'Improves monthly net' : 'Reduces monthly net'}</small>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard className="panel panel-launch">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">At a glance</p>
            <h2>Forecast + scenario</h2>
          </div>
          <PillBadge className={scenarioDeltaPill}>{scenarioDelta >= 0 ? 'Positive' : 'Negative'}</PillBadge>
        </header>
        <ul className="launch-readiness">
          <li>
            <span>30-day cash outlook</span>
            <strong>{forecast30 ? formatMoney(forecast30.projectedCash) : 'Not available'}</strong>
          </li>
          <li>
            <span>90-day cash outlook</span>
            <strong>{forecast90 ? formatMoney(forecast90.projectedCash) : 'Not available'}</strong>
          </li>
          <li>
            <span>365-day cash outlook</span>
            <strong>{forecast365 ? formatMoney(forecast365.projectedCash) : 'Not available'}</strong>
          </li>
          <li>
            <span>Scenario monthly net</span>
            <strong>{formatMoney(scenarioMonthlyNet)}</strong>
          </li>
          <li>
            <span>Recurring candidates</span>
            <strong>{recurringCandidates.length}</strong>
          </li>
        </ul>
      </SurfaceCard>

      <SurfaceCard className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Auto allocation</p>
            <h2>Income split editor</h2>
            <p className="panel-value">{autoAllocationPlan.totalAllocatedPercent.toFixed(2)}% allocated</p>
          </div>
        </header>
        <form className="entry-form entry-form--grid" onSubmit={submitAllocationRule}>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="allocation-target">Target bucket</label>
              <select
                id="allocation-target"
                value={allocationRuleForm.target}
                onChange={(event) =>
                  setAllocationRuleForm((previous) => ({
                    ...previous,
                    target: event.target.value as IncomeAllocationTarget,
                  }))
                }
              >
                <option value="bills">Bills</option>
                <option value="savings">Savings</option>
                <option value="goals">Goals</option>
                <option value="debt_overpay">Debt overpay</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="allocation-percentage">Allocation %</label>
              <input
                id="allocation-percentage"
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                step="0.01"
                value={allocationRuleForm.percentage}
                onChange={(event) =>
                  setAllocationRuleForm((previous) => ({ ...previous, percentage: event.target.value }))
                }
                placeholder="e.g. 25"
                required
              />
            </div>

            <div className="form-field form-field--span2">
              <label className="checkbox-row" htmlFor="allocation-active">
                <input
                  id="allocation-active"
                  type="checkbox"
                  checked={allocationRuleForm.active}
                  onChange={(event) =>
                    setAllocationRuleForm((previous) => ({ ...previous, active: event.target.checked }))
                  }
                />
                Rule active
              </label>
            </div>
          </div>

          <p className="form-hint">
            Configure one rule per bucket so each paycheck can be split into bills, savings, goals, and debt overpay.
          </p>

          <div className="form-actions row-actions">
            <button type="submit" className="btn btn-primary">
              {allocationRuleEditId ? 'Update allocation' : 'Add allocation'}
            </button>
            {allocationRuleEditId ? (
              <button type="button" className="btn btn-ghost" onClick={resetAllocationRuleForm}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </SurfaceCard>

      <SurfaceCard className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Allocation plan</p>
            <h2>Monthly split preview</h2>
            <p className="panel-value">{formatMoney(autoAllocationPlan.totalAllocatedAmount)} allocated monthly</p>
          </div>
          <div className="panel-actions">
            <button
              type="button"
              className="btn btn-primary btn--sm"
              onClick={() => void onApplyAutoAllocationNow()}
              disabled={isApplyingAutoAllocation}
            >
              {isApplyingAutoAllocation ? 'Generating...' : 'Apply auto-allocation now'}
            </button>
            <input
              aria-label="Search allocation rules"
              placeholder="Search target…"
              value={allocationQuery}
              onChange={(event) => setAllocationQuery(event.target.value)}
            />
            <select
              aria-label="Sort allocation rules"
              value={allocationSortKey}
              onChange={(event) => setAllocationSortKey(event.target.value as AllocationSortKey)}
            >
              <option value="target_asc">Target order</option>
              <option value="percentage_desc">Percentage (high-low)</option>
              <option value="percentage_asc">Percentage (low-high)</option>
              <option value="status_asc">Status (active first)</option>
            </select>
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              onClick={() => {
                setAllocationQuery('')
                setAllocationSortKey('target_asc')
              }}
              disabled={!hasAllocationFilters}
            >
              Clear
            </button>
          </div>
        </header>
        <p className="subnote">
          {autoAllocationLastRunNote ??
            (latestAllocationSuggestionAt
              ? `Last generated ${new Date(latestAllocationSuggestionAt).toLocaleString()}.`
              : 'No suggestion run yet for this month.')}
        </p>

        <div className="bulk-summary">
          <div>
            <p>Allocated</p>
            <strong>{autoAllocationPlan.totalAllocatedPercent.toFixed(2)}%</strong>
            <small>{formatMoney(autoAllocationPlan.totalAllocatedAmount)}</small>
          </div>
          <div>
            <p>Unallocated</p>
            <strong>{autoAllocationPlan.unallocatedPercent.toFixed(2)}%</strong>
            <small>{formatMoney(autoAllocationPlan.residualAmount)} remaining</small>
          </div>
        </div>

        <ul className="launch-readiness">
          {autoAllocationPlan.buckets.map((bucket) => (
            <li key={bucket.target}>
              <span>
                {bucket.label} {bucket.active ? '(active)' : '(inactive)'}
              </span>
              <strong>
                {bucket.percentage.toFixed(2)}% • {formatMoney(bucket.monthlyAmount)}
              </strong>
            </li>
          ))}
          {autoAllocationPlan.overAllocatedPercent > 0 ? (
            <li>
              <span>Overallocated</span>
              <strong className="amount-negative">{autoAllocationPlan.overAllocatedPercent.toFixed(2)}%</strong>
            </li>
          ) : null}
        </ul>

        {sortedIncomeAllocationRules.length === 0 ? (
          <p className="empty-state">No income allocation rules configured yet.</p>
        ) : visibleAllocationRules.length === 0 ? (
          <p className="empty-state">No allocation rules match this filter.</p>
        ) : (
          <div className="table-wrap table-wrap--card">
            <DataTable className="data-table">
              <caption className="sr-only">Income allocation rules</caption>
              <thead>
                <tr>
                  <th scope="col">Target</th>
                  <th scope="col">Percentage</th>
                  <th scope="col">Monthly amount</th>
                  <th scope="col">State</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleAllocationRules.map((rule) => (
                  <tr key={rule._id} className={allocationRuleEditId === rule._id ? 'table-row--editing' : undefined}>
                    <td>{allocationTargetLabel[rule.target]}</td>
                    <td className="table-amount">{rule.percentage.toFixed(2)}%</td>
                    <td className="table-amount">
                      {formatMoney((autoAllocationPlan.monthlyIncome * rule.percentage) / 100)}
                    </td>
                    <td>
                      <PillBadge className={ruleStatusPill(rule.active)}>{rule.active ? 'active' : 'disabled'}</PillBadge>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="btn btn-secondary btn--sm" onClick={() => startAllocationRuleEdit(rule)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn--sm"
                          onClick={() => void removeAllocationRule(rule._id)}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}

        {incomeAllocationSuggestions.length === 0 ? (
          <p className="empty-state">No transfer/action suggestions generated yet for this month.</p>
        ) : (
          <div className="table-wrap table-wrap--card">
            <DataTable className="data-table">
              <caption className="sr-only">Auto-allocation suggested actions</caption>
              <thead>
                <tr>
                  <th scope="col">Action</th>
                  <th scope="col">Target</th>
                  <th scope="col">Suggested amount</th>
                  <th scope="col">Percent</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {incomeAllocationSuggestions.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <div>
                        <strong>{entry.title}</strong>
                        <p className="subnote">{entry.detail}</p>
                      </div>
                    </td>
                    <td>
                      <PillBadge className="pill pill--neutral">
                        {allocationActionTypeLabel[entry.actionType]} - {allocationTargetLabel[entry.target]}
                      </PillBadge>
                    </td>
                    <td className="table-amount">{formatMoney(entry.amount)}</td>
                    <td className="table-amount">{entry.percentage.toFixed(2)}%</td>
                    <td>
                      <PillBadge className={entry.status === 'suggested' ? 'pill pill--warning' : 'pill pill--good'}>
                        {entry.status}
                      </PillBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Rules engine</p>
            <h2>Transaction rule editor</h2>
            <p className="panel-value">{sortedRules.length} rules total</p>
          </div>
        </header>

        <form className="entry-form entry-form--grid" onSubmit={submitRule}>
          <div className="form-grid">
            <div className="form-field form-field--span2">
              <label htmlFor="rule-name">Rule name</label>
              <input
                id="rule-name"
                value={ruleForm.name}
                onChange={(event) => setRuleForm((previous) => ({ ...previous, name: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="rule-match-type">Match type</label>
              <select
                id="rule-match-type"
                value={ruleForm.matchType}
                onChange={(event) =>
                  setRuleForm((previous) => ({ ...previous, matchType: event.target.value as RuleMatchType }))
                }
              >
                <option value="contains">Contains</option>
                <option value="starts_with">Starts with</option>
                <option value="exact">Exact</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="rule-priority">Priority</label>
              <input
                id="rule-priority"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={ruleForm.priority}
                onChange={(event) => setRuleForm((previous) => ({ ...previous, priority: event.target.value }))}
                required
              />
            </div>

            <div className="form-field form-field--span2">
              <label htmlFor="rule-pattern">Merchant pattern</label>
              <input
                id="rule-pattern"
                value={ruleForm.merchantPattern}
                onChange={(event) => setRuleForm((previous) => ({ ...previous, merchantPattern: event.target.value }))}
                placeholder="e.g. TESCO, NETFLIX"
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="rule-category">Category</label>
              <input
                id="rule-category"
                value={ruleForm.category}
                onChange={(event) => setRuleForm((previous) => ({ ...previous, category: event.target.value }))}
                placeholder="e.g. Groceries"
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="rule-status">Default reconciliation</label>
              <select
                id="rule-status"
                value={ruleForm.reconciliationStatus}
                onChange={(event) =>
                  setRuleForm((previous) => ({
                    ...previous,
                    reconciliationStatus: event.target.value as '' | ReconciliationStatus,
                  }))
                }
              >
                <option value="">No override</option>
                <option value="pending">Pending</option>
                <option value="posted">Posted</option>
                <option value="reconciled">Reconciled</option>
              </select>
            </div>

            <div className="form-field form-field--span2">
              <label className="checkbox-row" htmlFor="rule-active">
                <input
                  id="rule-active"
                  type="checkbox"
                  checked={ruleForm.active}
                  onChange={(event) => setRuleForm((previous) => ({ ...previous, active: event.target.checked }))}
                />
                Rule active
              </label>
            </div>
          </div>

          <p className="form-hint">
            Tip: combine <strong>priority</strong> with precise merchant patterns so the strongest matching rule wins.
          </p>

          <div className="form-actions row-actions">
            <button type="submit" className="btn btn-primary">
              {ruleEditId ? 'Update rule' : 'Add rule'}
            </button>
            {ruleEditId ? (
              <button type="button" className="btn btn-ghost" onClick={resetRuleForm}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </SurfaceCard>

      <SurfaceCard className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Rules</p>
            <h2>Rule library</h2>
            <p className="panel-value">{visibleRules.length} in view</p>
          </div>
          <div className="panel-actions">
            <input
              aria-label="Search transaction rules"
              placeholder="Search name, matcher, category…"
              value={ruleQuery}
              onChange={(event) => setRuleQuery(event.target.value)}
            />
            <select
              aria-label="Sort rules"
              value={ruleSortKey}
              onChange={(event) => setRuleSortKey(event.target.value as RuleSortKey)}
            >
              <option value="priority_desc">Priority (high-low)</option>
              <option value="priority_asc">Priority (low-high)</option>
              <option value="name_asc">Name (A-Z)</option>
              <option value="category_asc">Category (A-Z)</option>
              <option value="status_asc">Status (active first)</option>
            </select>
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              onClick={() => {
                setRuleQuery('')
                setRuleSortKey('priority_desc')
              }}
              disabled={!hasRuleFilters}
            >
              Clear
            </button>
          </div>
        </header>

        {sortedRules.length === 0 ? (
          <p className="empty-state">No transaction rules configured yet.</p>
        ) : visibleRules.length === 0 ? (
          <p className="empty-state">No rules match this filter.</p>
        ) : (
          <>
            <p className="subnote">
              Showing {visibleRules.length} of {sortedRules.length} rule{sortedRules.length === 1 ? '' : 's'}.
            </p>
            <div className="table-wrap table-wrap--card">
              <DataTable className="data-table data-table--wide">
                <caption className="sr-only">Transaction rule entries</caption>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Matcher</th>
                    <th scope="col">Category</th>
                    <th scope="col">Priority</th>
                    <th scope="col">Default status</th>
                    <th scope="col">State</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRules.map((rule) => (
                    <tr key={rule._id} className={ruleEditId === rule._id ? 'table-row--editing' : undefined}>
                      <td>{rule.name}</td>
                      <td>
                        <span className="cell-truncate" title={`${rule.matchType}: ${rule.merchantPattern}`}>
                          {rule.matchType}: {rule.merchantPattern}
                        </span>
                      </td>
                      <td>
                        <PillBadge className="pill pill--neutral">{rule.category}</PillBadge>
                      </td>
                      <td className="table-amount">{rule.priority}</td>
                      <td>
                        <PillBadge className={recStatusPill(rule.reconciliationStatus)}>
                          {rule.reconciliationStatus ?? 'inherit'}
                        </PillBadge>
                      </td>
                      <td>
                        <PillBadge className={ruleStatusPill(rule.active)}>{rule.active ? 'active' : 'disabled'}</PillBadge>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="btn btn-secondary btn--sm" onClick={() => startRuleEdit(rule)}>
                            Edit
                          </button>
                          <button type="button" className="btn btn-ghost btn--sm" onClick={() => void removeRule(rule._id)}>
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          </>
        )}
      </SurfaceCard>

      <SurfaceCard className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Envelope budgeting</p>
            <h2>Budget editor</h2>
            <p className="panel-value">{budgetPerformance.length} category budgets</p>
          </div>
        </header>
        <form className="entry-form entry-form--grid" onSubmit={submitBudget}>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="budget-month">Month</label>
              <input
                id="budget-month"
                type="month"
                value={budgetForm.month}
                onChange={(event) => setBudgetForm((previous) => ({ ...previous, month: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="budget-category">Category</label>
              <input
                id="budget-category"
                value={budgetForm.category}
                onChange={(event) => setBudgetForm((previous) => ({ ...previous, category: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="budget-target">Target amount</label>
              <input
                id="budget-target"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={budgetForm.targetAmount}
                onChange={(event) => setBudgetForm((previous) => ({ ...previous, targetAmount: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="budget-carryover">Carryover</label>
              <input
                id="budget-carryover"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={budgetForm.carryoverAmount}
                onChange={(event) => setBudgetForm((previous) => ({ ...previous, carryoverAmount: event.target.value }))}
              />
            </div>

            <div className="form-field form-field--span2">
              <label className="checkbox-row" htmlFor="budget-rollover-enabled">
                <input
                  id="budget-rollover-enabled"
                  type="checkbox"
                  checked={budgetForm.rolloverEnabled}
                  onChange={(event) =>
                    setBudgetForm((previous) => ({ ...previous, rolloverEnabled: event.target.checked }))
                  }
                />
                Enable rollover into next month
              </label>
            </div>
          </div>

          <p className="form-hint">
            Tip: use carryover to represent unspent funds, then compare <strong>projected month-end</strong> to target.
          </p>

          <div className="form-actions row-actions">
            <button type="submit" className="btn btn-primary">
              {budgetEditId ? 'Update budget' : 'Add budget'}
            </button>
            {budgetEditId ? (
              <button type="button" className="btn btn-ghost" onClick={resetBudgetForm}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </SurfaceCard>

      <SurfaceCard className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Budgets</p>
            <h2>Targets vs actuals</h2>
            <p className="panel-value">
              {formatMoney(budgetPerformance.reduce((sum, entry) => sum + entry.effectiveTarget, 0))} total targets
            </p>
          </div>
          <div className="panel-actions">
            <input
              aria-label="Search budget categories"
              placeholder="Search categories…"
              value={budgetQuery}
              onChange={(event) => setBudgetQuery(event.target.value)}
            />
            <select
              aria-label="Filter budget status"
              value={budgetStatusFilter}
              onChange={(event) => setBudgetStatusFilter(event.target.value as 'all' | BudgetPerformance['status'])}
            >
              <option value="all">All statuses</option>
              <option value="on_track">On track</option>
              <option value="warning">Warning</option>
              <option value="over">Over</option>
            </select>
            <select
              aria-label="Sort budgets"
              value={budgetSortKey}
              onChange={(event) => setBudgetSortKey(event.target.value as BudgetSortKey)}
            >
              <option value="category_asc">Category (A-Z)</option>
              <option value="target_desc">Target (high-low)</option>
              <option value="spent_desc">Spent (high-low)</option>
              <option value="variance_asc">Variance (most negative first)</option>
              <option value="status_priority">Status (over first)</option>
            </select>
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              onClick={() => {
                setBudgetQuery('')
                setBudgetStatusFilter('all')
                setBudgetSortKey('category_asc')
              }}
              disabled={!hasBudgetFilters}
            >
              Clear
            </button>
          </div>
        </header>

        {budgetPerformance.length === 0 ? (
          <p className="empty-state">No budgets configured for this month.</p>
        ) : visibleBudgetPerformance.length === 0 ? (
          <p className="empty-state">No budgets match this filter.</p>
        ) : (
          <>
            <p className="subnote">
              Showing {visibleBudgetPerformance.length} of {budgetPerformance.length} budget
              {budgetPerformance.length === 1 ? '' : 's'}.
            </p>
            <div className="table-wrap table-wrap--card">
              <DataTable className="data-table data-table--wide">
                <caption className="sr-only">Budget performance table</caption>
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col">Target</th>
                    <th scope="col">Spent</th>
                    <th scope="col">Variance</th>
                    <th scope="col">Projected</th>
                    <th scope="col">Rollover</th>
                    <th scope="col">Status</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleBudgetPerformance.map((entry) => {
                    const budgetEntry = budgetById.get(entry.id)
                    return (
                      <tr key={entry.id} className={budgetEntry?._id === budgetEditId ? 'table-row--editing' : undefined}>
                        <td>{entry.category}</td>
                        <td className="table-amount">{formatMoney(entry.effectiveTarget)}</td>
                        <td className="table-amount amount-negative">{formatMoney(entry.spent)}</td>
                        <td className={`table-amount ${entry.variance < 0 ? 'amount-negative' : 'amount-positive'}`}>
                          {formatMoney(entry.variance)}
                        </td>
                        <td className="table-amount">{formatMoney(entry.projectedMonthEnd)}</td>
                        <td>
                          <PillBadge className={entry.rolloverEnabled ? 'pill pill--good' : 'pill pill--neutral'}>
                            {entry.rolloverEnabled ? 'enabled' : 'off'}
                          </PillBadge>
                        </td>
                        <td>
                          <PillBadge className={budgetStatusPill(entry.status)}>{entry.status}</PillBadge>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn btn-secondary btn--sm"
                              onClick={() => {
                                if (budgetEntry) startBudgetEdit(budgetEntry)
                              }}
                              disabled={!budgetEntry}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn--sm"
                              onClick={() => {
                                if (budgetEntry) void removeBudget(budgetEntry._id)
                              }}
                              disabled={!budgetEntry}
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </DataTable>
            </div>
          </>
        )}
      </SurfaceCard>

      <SurfaceCard className="panel panel-cash-events">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Phase 2 Forecast</p>
            <h2>Plan-linked 30 / 90 / 365 outlook</h2>
            <p className="panel-value">{formatMoney(scenarioMonthlyNet)} scenario monthly net</p>
          </div>
          <PillBadge className={scenarioDeltaPill}>
            {scenarioDelta >= 0 ? '+' : ''}
            {formatMoney(scenarioDelta)}
          </PillBadge>
        </header>
        <div className="table-wrap table-wrap--card">
          <DataTable className="data-table">
            <caption className="sr-only">Plan-linked forecast windows</caption>
            <thead>
              <tr>
                <th scope="col">Window</th>
                <th scope="col">Projected cash</th>
                <th scope="col">Vs baseline</th>
                <th scope="col">Projected net</th>
                <th scope="col">Coverage</th>
                <th scope="col">Risk</th>
              </tr>
            </thead>
            <tbody>
              {planningForecastWindows.map((window) => (
                <tr key={window.days}>
                  <td>{window.days} days</td>
                  <td className="table-amount">{formatMoney(window.projectedCash)}</td>
                  <td className={`table-amount ${window.deltaProjectedCash < 0 ? 'amount-negative' : 'amount-positive'}`}>
                    {window.deltaProjectedCash >= 0 ? '+' : ''}
                    {formatMoney(window.deltaProjectedCash)}
                  </td>
                  <td className={`table-amount ${window.projectedNet < 0 ? 'amount-negative' : 'amount-positive'}`}>
                    {formatMoney(window.projectedNet)}
                  </td>
                  <td>{window.coverageMonths.toFixed(1)} months</td>
                  <td>
                    <PillBadge className={forecastRiskPill(window.risk)}>{window.risk}</PillBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      </SurfaceCard>

      <SurfaceCard className="panel panel-cash-events">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">What-If Simulator</p>
            <h2>Income, bills, debt, and one-off shock testing</h2>
          </div>
        </header>
        <div className="entry-form entry-form--grid">
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="whatif-income-drop">Income drop %</label>
              <input
                id="whatif-income-drop"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                value={whatIfInput.incomeDropPercent}
                onChange={(event) =>
                  setWhatIfInput((previous) => ({ ...previous, incomeDropPercent: event.target.value }))
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="whatif-bill-increase">Bill increase %</label>
              <input
                id="whatif-bill-increase"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                value={whatIfInput.billIncreasePercent}
                onChange={(event) =>
                  setWhatIfInput((previous) => ({ ...previous, billIncreasePercent: event.target.value }))
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="whatif-extra-debt">Extra debt payment / month</label>
              <input
                id="whatif-extra-debt"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={whatIfInput.extraDebtPayment}
                onChange={(event) =>
                  setWhatIfInput((previous) => ({ ...previous, extraDebtPayment: event.target.value }))
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="whatif-oneoff">One-off expense</label>
              <input
                id="whatif-oneoff"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={whatIfInput.oneOffExpense}
                onChange={(event) => setWhatIfInput((previous) => ({ ...previous, oneOffExpense: event.target.value }))}
              />
            </div>

            <div className="form-field form-field--span2">
              <label className="checkbox-row" htmlFor="whatif-seasonal-smoothing-enabled">
                <input
                  id="whatif-seasonal-smoothing-enabled"
                  type="checkbox"
                  checked={whatIfInput.seasonalSmoothingEnabled}
                  onChange={(event) =>
                    setWhatIfInput((previous) => ({ ...previous, seasonalSmoothingEnabled: event.target.checked }))
                  }
                />
                Enable seasonal smoothing for irregular categories
              </label>
            </div>

            <div className="form-field">
              <label htmlFor="whatif-seasonal-lookback">Smoothing lookback (months)</label>
              <input
                id="whatif-seasonal-lookback"
                type="number"
                inputMode="numeric"
                min="2"
                max="24"
                step="1"
                value={whatIfInput.seasonalSmoothingMonths}
                disabled={!whatIfInput.seasonalSmoothingEnabled}
                onChange={(event) =>
                  setWhatIfInput((previous) => ({ ...previous, seasonalSmoothingMonths: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="bulk-summary">
            <div>
              <p>Baseline monthly net</p>
              <strong>{formatMoney(baselineMonthlyNet)}</strong>
              <small>Selected plan version before simulator shocks</small>
            </div>
            <div>
              <p>Scenario monthly net</p>
              <strong>{formatMoney(scenarioMonthlyNet)}</strong>
              <small>
                <PillBadge className={scenarioDeltaPill}>
                  {scenarioDelta >= 0 ? '+' : ''}
                  {formatMoney(scenarioDelta)}
                </PillBadge>
              </small>
            </div>
            <div>
              <p>Seasonal adjustment</p>
              <strong>{formatMoney(seasonalSmoothingAdjustment)}</strong>
              <small>
                {irregularBudgetRows.length} irregular categories · {seasonalSmoothingMonths}m lookback
              </small>
            </div>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard className="panel panel-cash-events">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Auto-Reallocation</p>
            <h2>Negative forecast response</h2>
            <p className="panel-value">
              {planningForecastWindows.some((window) => window.projectedCash < 0) ? 'Forecast breach detected' : 'No breach detected'}
            </p>
          </div>
        </header>
        <ul className="timeline-list">
          {autoReallocationSuggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <div>
                <p>{suggestion.title}</p>
                <small>{suggestion.detail}</small>
              </div>
              <PillBadge className={suggestion.severity === 'critical' ? 'pill pill--critical' : suggestion.severity === 'warning' ? 'pill pill--warning' : 'pill pill--good'}>
                {suggestion.impactAmount > 0 ? formatMoney(suggestion.impactAmount) : 'stable'}
              </PillBadge>
            </li>
          ))}
        </ul>
      </SurfaceCard>

      <SurfaceCard className="panel panel-categories">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Risk Alerts</p>
            <h2>Upcoming bill risk</h2>
          </div>
        </header>
        {billRiskAlerts.length === 0 ? (
          <p className="empty-state">No bill risk alerts in the next 45 days.</p>
        ) : (
          <ul className="timeline-list">
            {billRiskAlerts.map((alert) => (
              <li key={alert.id}>
                <div>
                  <p>{alert.name}</p>
                  <small>
                    {alert.daysAway} days • {formatMoney(alert.amount)} due • expected {formatMoney(alert.expectedAvailable)} •{' '}
                    {alert.autopay
                      ? alert.linkedAccountName
                        ? `autopay · ${alert.linkedAccountName}`
                        : 'autopay · no linked account'
                      : 'manual'}
                  </small>
                </div>
                <PillBadge className={billRiskPill(alert.risk)}>{alert.risk}</PillBadge>
              </li>
            ))}
          </ul>
        )}
      </SurfaceCard>

      <SurfaceCard className="panel panel-goal-preview">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Data Quality</p>
            <h2>Quality + recurrence</h2>
            <p className="panel-value">{qualityIssueCount} issue signals</p>
          </div>
        </header>
        <ul className="status-list">
          <li>
            <span>Potential duplicates</span>
            <strong>{dataQuality.duplicateCount}</strong>
          </li>
          <li>
            <span>Anomalies</span>
            <strong>{dataQuality.anomalyCount}</strong>
          </li>
          <li>
            <span>Missing categories</span>
            <strong>{dataQuality.missingCategoryCount}</strong>
          </li>
          <li>
            <span>Pending reconciliation</span>
            <strong>{dataQuality.pendingReconciliationCount}</strong>
          </li>
          <li>
            <span>Split mismatches</span>
            <strong>{dataQuality.splitMismatchCount}</strong>
          </li>
        </ul>
        {recurringCandidates.length > 0 ? (
          <ul className="timeline-list">
            {recurringCandidates.slice(0, 4).map((candidate) => (
              <li key={candidate.id}>
                <div>
                  <p>{candidate.label}</p>
                  <small>
                    Every {candidate.averageIntervalDays.toFixed(1)} days • next {candidate.nextExpectedDate}
                  </small>
                </div>
                <PillBadge className={candidate.confidence >= 75 ? 'pill pill--good' : 'pill pill--warning'}>
                  {candidate.confidence.toFixed(0)}%
                </PillBadge>
              </li>
            ))}
          </ul>
        ) : null}
      </SurfaceCard>

      <SurfaceCard className="panel panel-audit-events">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Month Close</p>
            <h2>Checklist status</h2>
            <p className="panel-value">
              {monthCloseDoneCount}/{monthCloseChecklist.length || 0} complete
            </p>
          </div>
          <PillBadge className={monthCloseCompletion >= 80 ? 'pill pill--good' : 'pill pill--warning'}>{monthCloseCompletion}%</PillBadge>
        </header>
        {monthCloseChecklist.length === 0 ? (
          <p className="empty-state">Checklist is unavailable.</p>
        ) : (
          <div className="table-wrap table-wrap--card">
            <DataTable className="data-table">
              <caption className="sr-only">Month close checklist</caption>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Detail</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {monthCloseChecklist.map((item) => (
                  <tr key={item.id}>
                    <td>{item.label}</td>
                    <td>{item.detail}</td>
                    <td>
                      <PillBadge className={item.done ? 'pill pill--good' : 'pill pill--warning'}>{item.done ? 'done' : 'todo'}</PillBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}
        <h3>Planning audit log</h3>
        {planningAuditEvents.length === 0 ? (
          <p className="empty-state">No planning audit events yet.</p>
        ) : (
          <div className="table-wrap table-wrap--card">
            <DataTable className="data-table data-table--wide">
              <caption className="sr-only">Planning audit events</caption>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Event</th>
                  <th scope="col">Source</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Entity</th>
                </tr>
              </thead>
              <tbody>
                {planningAuditEvents.slice(0, 20).map((event) => {
                  const metadata = parseAuditMetadata(event.metadataJson)
                  const source = typeof metadata?.source === 'string' ? metadata.source : 'planning_tab'
                  const actor = typeof metadata?.actorLabel === 'string' ? metadata.actorLabel : 'self'
                  return (
                    <tr key={event.id}>
                      <td>{new Date(event.createdAt).toLocaleString()}</td>
                      <td>
                        <strong>{event.action}</strong>
                        <p className="subnote">{event.entityType}</p>
                      </td>
                      <td>{source}</td>
                      <td>{actor}</td>
                      <td>{event.entityId}</td>
                    </tr>
                  )
                })}
              </tbody>
            </DataTable>
          </div>
        )}
      </SurfaceCard>
    </section>
  )
}
