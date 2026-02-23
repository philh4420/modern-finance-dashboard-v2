import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type {
  EnvelopeBudgetEntry,
  EnvelopeBudgetId,
  PlanningActionTaskId,
  PlanningActionTaskStatus,
  PlanningPhase3Data,
  IncomeAllocationRuleEntry,
  IncomeAllocationRuleId,
  IncomeAllocationTarget,
  PlanningPhase1Data,
  PlanningPlanVersion,
  PlanningVersionKey,
  ReconciliationStatus,
  RuleMatchType,
  Summary,
  TransactionRuleEntry,
  TransactionRuleId,
} from '../components/financeTypes'
import { parseFloatInput, parseIntInput } from '../lib/financeHelpers'
import { useOfflineQueue } from './useOfflineQueue'
import type { MutationHandlers } from './useMutationFeedback'

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

type UsePlanningSectionArgs = {
  monthKey: string
  summary: Summary
  transactionRules: TransactionRuleEntry[]
  envelopeBudgets: EnvelopeBudgetEntry[]
  incomeAllocationRules: IncomeAllocationRuleEntry[]
  userId: string | null | undefined
  onQueueMetric?: (metric: {
    event: string
    queuedCount: number
    conflictCount: number
    flushAttempted: number
    flushSucceeded: number
  }) => void | Promise<void>
} & MutationHandlers

const emptyRuleForm: RuleForm = {
  name: '',
  matchType: 'contains',
  merchantPattern: '',
  category: '',
  reconciliationStatus: '',
  priority: '10',
  active: true,
}

const emptyBudgetForm = (monthKey: string): BudgetForm => ({
  month: monthKey,
  category: '',
  targetAmount: '',
  rolloverEnabled: true,
  carryoverAmount: '',
})

const defaultWhatIf: WhatIfInput = {
  incomeDropPercent: '0',
  billIncreasePercent: '0',
  extraDebtPayment: '0',
  oneOffExpense: '0',
  seasonalSmoothingEnabled: true,
  seasonalSmoothingMonths: '6',
}

const emptyAllocationRuleForm: AllocationRuleForm = {
  target: 'bills',
  percentage: '',
  active: true,
}

const emptyPlanningVersionForm: PlanningVersionForm = {
  expectedIncome: '',
  fixedCommitments: '',
  variableSpendingCap: '',
  notes: '',
}

const planningVersionLabels: Record<PlanningVersionKey, string> = {
  base: 'Base',
  conservative: 'Conservative',
  aggressive: 'Aggressive',
}

export const usePlanningSection = ({
  monthKey,
  summary,
  transactionRules,
  envelopeBudgets,
  incomeAllocationRules,
  userId,
  onQueueMetric,
  clearError,
  handleMutationError,
}: UsePlanningSectionArgs) => {
  const addTransactionRule = useMutation(api.phase2.addTransactionRule)
  const updateTransactionRule = useMutation(api.phase2.updateTransactionRule)
  const removeTransactionRule = useMutation(api.phase2.removeTransactionRule)
  const addEnvelopeBudget = useMutation(api.phase2.addEnvelopeBudget)
  const updateEnvelopeBudget = useMutation(api.phase2.updateEnvelopeBudget)
  const removeEnvelopeBudget = useMutation(api.phase2.removeEnvelopeBudget)
  const addIncomeAllocationRule = useMutation(api.phase2.addIncomeAllocationRule)
  const updateIncomeAllocationRule = useMutation(api.phase2.updateIncomeAllocationRule)
  const removeIncomeAllocationRule = useMutation(api.phase2.removeIncomeAllocationRule)
  const applyIncomeAutoAllocationNow = useMutation(api.phase2.applyIncomeAutoAllocationNow)
  const upsertPlanningMonthVersion = useMutation(api.phase2.upsertPlanningMonthVersion)
  const applyPlanningVersionToMonth = useMutation(api.phase2.applyPlanningVersionToMonth)
  const updatePlanningActionTaskStatus = useMutation(api.phase2.updatePlanningActionTaskStatus)

  const [ruleForm, setRuleForm] = useState<RuleForm>(emptyRuleForm)
  const [budgetForm, setBudgetForm] = useState<BudgetForm>(emptyBudgetForm(monthKey))
  const [allocationRuleForm, setAllocationRuleForm] = useState<AllocationRuleForm>(emptyAllocationRuleForm)
  const [ruleEditId, setRuleEditId] = useState<TransactionRuleId | null>(null)
  const [budgetEditId, setBudgetEditId] = useState<EnvelopeBudgetId | null>(null)
  const [allocationRuleEditId, setAllocationRuleEditId] = useState<IncomeAllocationRuleId | null>(null)
  const [whatIfInput, setWhatIfInput] = useState<WhatIfInput>(defaultWhatIf)
  const [isApplyingAutoAllocation, setIsApplyingAutoAllocation] = useState(false)
  const [autoAllocationLastRunNote, setAutoAllocationLastRunNote] = useState<string | null>(null)
  const [planningMonth, setPlanningMonth] = useState(monthKey)
  const [activePlanningVersion, setActivePlanningVersion] = useState<PlanningVersionKey>('base')
  const [planningVersionForm, setPlanningVersionForm] = useState<PlanningVersionForm>(emptyPlanningVersionForm)
  const [planningVersionDirty, setPlanningVersionDirty] = useState(false)
  const [isSavingPlanningVersion, setIsSavingPlanningVersion] = useState(false)
  const [planningVersionFeedback, setPlanningVersionFeedback] = useState<string | null>(null)
  const [isApplyingPlanToMonth, setIsApplyingPlanToMonth] = useState(false)
  const [applyPlanFeedback, setApplyPlanFeedback] = useState<string | null>(null)
  const [updatingPlanningTaskId, setUpdatingPlanningTaskId] = useState<string | null>(null)
  const planningPhase1DataQuery = useQuery(api.phase2.getPlanningPhase1Data, { month: planningMonth })
  const planningPhase3DataQuery = useQuery(api.phase2.getPlanningPhase3Data, { month: planningMonth })

  const queue = useOfflineQueue({
    storageKey: 'finance-offline-queue-v2-planning',
    executors: {
      addTransactionRule: async (args) => {
        await addTransactionRule(args as Parameters<typeof addTransactionRule>[0])
      },
      updateTransactionRule: async (args) => {
        await updateTransactionRule(args as Parameters<typeof updateTransactionRule>[0])
      },
      removeTransactionRule: async (args) => {
        await removeTransactionRule(args as Parameters<typeof removeTransactionRule>[0])
      },
      addEnvelopeBudget: async (args) => {
        await addEnvelopeBudget(args as Parameters<typeof addEnvelopeBudget>[0])
      },
      updateEnvelopeBudget: async (args) => {
        await updateEnvelopeBudget(args as Parameters<typeof updateEnvelopeBudget>[0])
      },
      removeEnvelopeBudget: async (args) => {
        await removeEnvelopeBudget(args as Parameters<typeof removeEnvelopeBudget>[0])
      },
      addIncomeAllocationRule: async (args) => {
        await addIncomeAllocationRule(args as Parameters<typeof addIncomeAllocationRule>[0])
      },
      updateIncomeAllocationRule: async (args) => {
        await updateIncomeAllocationRule(args as Parameters<typeof updateIncomeAllocationRule>[0])
      },
      removeIncomeAllocationRule: async (args) => {
        await removeIncomeAllocationRule(args as Parameters<typeof removeIncomeAllocationRule>[0])
      },
      upsertPlanningMonthVersion: async (args) => {
        await upsertPlanningMonthVersion(args as Parameters<typeof upsertPlanningMonthVersion>[0])
      },
      applyPlanningVersionToMonth: async (args) => {
        await applyPlanningVersionToMonth(args as Parameters<typeof applyPlanningVersionToMonth>[0])
      },
      updatePlanningActionTaskStatus: async (args) => {
        await updatePlanningActionTaskStatus(args as Parameters<typeof updatePlanningActionTaskStatus>[0])
      },
    },
    userId,
    onMetric: onQueueMetric,
  })

  const sortedRules = useMemo(
    () => [...transactionRules].sort((a, b) => b.priority - a.priority || b.createdAt - a.createdAt),
    [transactionRules],
  )

  const sortedBudgets = useMemo(
    () => [...envelopeBudgets].sort((a, b) => a.category.localeCompare(b.category)),
    [envelopeBudgets],
  )

  const sortedIncomeAllocationRules = useMemo(
    () => [...incomeAllocationRules].sort((a, b) => a.target.localeCompare(b.target) || b.createdAt - a.createdAt),
    [incomeAllocationRules],
  )

  const fallbackPlanningPhase1Data = useMemo<PlanningPhase1Data>(() => {
    const fallbackUpdatedAt = new Date(`${planningMonth}-01T00:00:00`).getTime()
    const baselineExpectedIncome = summary.monthlyIncome
    const baselineFixedCommitments = summary.monthlyCommitments
    const baselineVariableSpendingCap = Math.max(summary.purchasesThisMonth, 0)
    const baselineMonthlyNet = baselineExpectedIncome - baselineFixedCommitments - baselineVariableSpendingCap
    const versions: PlanningPlanVersion[] = [
      {
        id: `fallback:${planningMonth}:base`,
        month: planningMonth,
        versionKey: 'base',
        label: planningVersionLabels.base,
        description: 'Balanced baseline aligned with current monthly behavior.',
        expectedIncome: baselineExpectedIncome,
        fixedCommitments: baselineFixedCommitments,
        variableSpendingCap: baselineVariableSpendingCap,
        monthlyNet: baselineMonthlyNet,
        notes: '',
        isSelected: true,
        isPersisted: false,
        updatedAt: fallbackUpdatedAt,
      },
      {
        id: `fallback:${planningMonth}:conservative`,
        month: planningMonth,
        versionKey: 'conservative',
        label: planningVersionLabels.conservative,
        description: 'Defensive assumptions for tighter cash preservation.',
        expectedIncome: baselineExpectedIncome * 0.95,
        fixedCommitments: baselineFixedCommitments * 1.03,
        variableSpendingCap: baselineVariableSpendingCap * 0.85,
        monthlyNet:
          baselineExpectedIncome * 0.95 -
          baselineFixedCommitments * 1.03 -
          baselineVariableSpendingCap * 0.85,
        notes: '',
        isSelected: false,
        isPersisted: false,
        updatedAt: fallbackUpdatedAt,
      },
      {
        id: `fallback:${planningMonth}:aggressive`,
        month: planningMonth,
        versionKey: 'aggressive',
        label: planningVersionLabels.aggressive,
        description: 'Growth-leaning assumptions for faster progress.',
        expectedIncome: baselineExpectedIncome * 1.05,
        fixedCommitments: baselineFixedCommitments * 0.98,
        variableSpendingCap: baselineVariableSpendingCap * 1.15,
        monthlyNet:
          baselineExpectedIncome * 1.05 -
          baselineFixedCommitments * 0.98 -
          baselineVariableSpendingCap * 1.15,
        notes: '',
        isSelected: false,
        isPersisted: false,
        updatedAt: fallbackUpdatedAt,
      },
    ]

    return {
      monthKey: planningMonth,
      selectedVersion: 'base',
      versions,
      workspace: {
        month: planningMonth,
        baselineExpectedIncome,
        baselineFixedCommitments,
        baselineVariableSpendingCap,
        baselineMonthlyNet,
        plannedExpectedIncome: baselineExpectedIncome,
        plannedFixedCommitments: baselineFixedCommitments,
        plannedVariableSpendingCap: baselineVariableSpendingCap,
        plannedMonthlyNet: baselineMonthlyNet,
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
  }, [planningMonth, summary.monthlyCommitments, summary.monthlyIncome, summary.purchasesThisMonth])

  const planningPhase1Data = planningPhase1DataQuery ?? fallbackPlanningPhase1Data
  const fallbackPlanningPhase3Data = useMemo<PlanningPhase3Data>(
    () => ({
      monthKey: planningMonth,
      selectedVersionKey: activePlanningVersion,
      actionTasks: [],
      adherenceRows: [],
      planningKpis: {
        forecastAccuracyPercent: 100,
        varianceRatePercent: 0,
        planCompletionPercent: 0,
        totalTasks: 0,
        completedTasks: 0,
        plannedNet: planningPhase1Data.workspace.plannedMonthlyNet,
        actualNet: planningPhase1Data.workspace.plannedMonthlyNet,
      },
      auditEvents: [],
    }),
    [activePlanningVersion, planningMonth, planningPhase1Data.workspace.plannedMonthlyNet],
  )
  const planningPhase3Data = planningPhase3DataQuery ?? fallbackPlanningPhase3Data

  const activePlanningVersionRow = useMemo(() => {
    const explicit = planningPhase1Data.versions.find((entry) => entry.versionKey === activePlanningVersion)
    if (explicit) return explicit
    return (
      planningPhase1Data.versions.find((entry) => entry.versionKey === planningPhase1Data.selectedVersion) ??
      planningPhase1Data.versions[0]
    )
  }, [activePlanningVersion, planningPhase1Data.selectedVersion, planningPhase1Data.versions])

  const planningWorkspace = useMemo(() => {
    const baseline = planningPhase1Data.workspace
    const safeParse = (value: string, fallback: number) => {
      const parsed = Number.parseFloat(value)
      if (!Number.isFinite(parsed)) return fallback
      if (parsed < 0) return 0
      return parsed
    }
    const expectedIncome = safeParse(planningVersionForm.expectedIncome, baseline.plannedExpectedIncome)
    const fixedCommitments = safeParse(planningVersionForm.fixedCommitments, baseline.plannedFixedCommitments)
    const variableSpendingCap = safeParse(planningVersionForm.variableSpendingCap, baseline.plannedVariableSpendingCap)
    const plannedMonthlyNet = expectedIncome - fixedCommitments - variableSpendingCap
    return {
      ...baseline,
      plannedExpectedIncome: expectedIncome,
      plannedFixedCommitments: fixedCommitments,
      plannedVariableSpendingCap: variableSpendingCap,
      plannedMonthlyNet,
      deltaExpectedIncome: expectedIncome - baseline.baselineExpectedIncome,
      deltaFixedCommitments: fixedCommitments - baseline.baselineFixedCommitments,
      deltaVariableSpendingCap: variableSpendingCap - baseline.baselineVariableSpendingCap,
      deltaMonthlyNet: plannedMonthlyNet - baseline.baselineMonthlyNet,
      envelopeCoveragePercent:
        variableSpendingCap > 0 ? (baseline.envelopeEffectiveTargetTotal / variableSpendingCap) * 100 : 0,
    }
  }, [planningPhase1Data.workspace, planningVersionForm.expectedIncome, planningVersionForm.fixedCommitments, planningVersionForm.variableSpendingCap])

  useEffect(() => {
    setPlanningMonth(monthKey)
  }, [monthKey])

  useEffect(() => {
    if (planningVersionDirty) return
    if (!activePlanningVersionRow) return
    setActivePlanningVersion(activePlanningVersionRow.versionKey)
    setPlanningVersionForm({
      expectedIncome: activePlanningVersionRow.expectedIncome.toFixed(2),
      fixedCommitments: activePlanningVersionRow.fixedCommitments.toFixed(2),
      variableSpendingCap: activePlanningVersionRow.variableSpendingCap.toFixed(2),
      notes: activePlanningVersionRow.notes ?? '',
    })
  }, [activePlanningVersionRow, planningVersionDirty])

  const selectPlanningVersion = (versionKey: PlanningVersionKey) => {
    setActivePlanningVersion(versionKey)
    setPlanningVersionDirty(false)
    const next = planningPhase1Data.versions.find((entry) => entry.versionKey === versionKey)
    if (!next) {
      setPlanningVersionForm(emptyPlanningVersionForm)
      return
    }
    setPlanningVersionForm({
      expectedIncome: next.expectedIncome.toFixed(2),
      fixedCommitments: next.fixedCommitments.toFixed(2),
      variableSpendingCap: next.variableSpendingCap.toFixed(2),
      notes: next.notes ?? '',
    })
  }

  const updatePlanningMonth = (month: string) => {
    setPlanningMonth(month)
    setPlanningVersionDirty(false)
    setPlanningVersionFeedback(null)
    setApplyPlanFeedback(null)
    setBudgetForm((previous) => ({ ...previous, month }))
  }

  const updatePlanningVersionForm = (value: PlanningVersionForm) => {
    setPlanningVersionForm(value)
    setPlanningVersionDirty(true)
  }

  const resetPlanningVersionForm = () => {
    if (!activePlanningVersionRow) {
      setPlanningVersionForm(emptyPlanningVersionForm)
      setPlanningVersionDirty(false)
      return
    }
    setPlanningVersionForm({
      expectedIncome: activePlanningVersionRow.expectedIncome.toFixed(2),
      fixedCommitments: activePlanningVersionRow.fixedCommitments.toFixed(2),
      variableSpendingCap: activePlanningVersionRow.variableSpendingCap.toFixed(2),
      notes: activePlanningVersionRow.notes ?? '',
    })
    setPlanningVersionDirty(false)
    setPlanningVersionFeedback(null)
  }

  const submitPlanningVersion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()
    setPlanningVersionFeedback(null)
    setIsSavingPlanningVersion(true)
    try {
      const payload = {
        month: planningMonth,
        versionKey: activePlanningVersion,
        expectedIncome: parseFloatInput(planningVersionForm.expectedIncome, 'Expected income'),
        fixedCommitments: parseFloatInput(planningVersionForm.fixedCommitments, 'Fixed commitments'),
        variableSpendingCap: parseFloatInput(planningVersionForm.variableSpendingCap, 'Variable spending cap'),
        notes: planningVersionForm.notes.trim() || undefined,
        selectAfterSave: true,
        source: 'planning_tab',
      }
      await queue.runOrQueue('upsertPlanningMonthVersion', payload, async (args) => upsertPlanningMonthVersion(args))
      const versionLabel = planningVersionLabels[activePlanningVersion]
      setPlanningVersionFeedback(`${versionLabel} plan saved for ${planningMonth}.`)
      setPlanningVersionDirty(false)
    } catch (error) {
      handleMutationError(error)
      setPlanningVersionFeedback(null)
    } finally {
      setIsSavingPlanningVersion(false)
    }
  }

  const onApplyPlanToMonth = async () => {
    clearError()
    setApplyPlanFeedback(null)
    setIsApplyingPlanToMonth(true)
    try {
      const execution = await queue.runOrQueue(
        'applyPlanningVersionToMonth',
        {
          month: planningMonth,
          versionKey: activePlanningVersion,
          source: 'manual_apply' as const,
        },
        async (args) => applyPlanningVersionToMonth(args),
      )
      if (execution.queued || !execution.result) {
        setApplyPlanFeedback(`Plan apply queued for ${planningMonth}. It will run automatically once back online.`)
      } else {
        const result = execution.result
        setApplyPlanFeedback(
          `Applied ${planningVersionLabels[result.versionKey]} plan to ${result.monthKey}. ${result.tasksCreated} execution task${
            result.tasksCreated === 1 ? '' : 's'
          } created.`,
        )
      }
    } catch (error) {
      setApplyPlanFeedback(null)
      handleMutationError(error)
    } finally {
      setIsApplyingPlanToMonth(false)
    }
  }

  const onUpdatePlanningTaskStatus = async (id: string, status: PlanningActionTaskStatus) => {
    clearError()
    setUpdatingPlanningTaskId(id)
    try {
      await queue.runOrQueue(
        'updatePlanningActionTaskStatus',
        {
          id: id as PlanningActionTaskId,
          status,
          source: 'manual_apply' as const,
        },
        async (args) => updatePlanningActionTaskStatus(args),
      )
    } catch (error) {
      handleMutationError(error)
    } finally {
      setUpdatingPlanningTaskId(null)
    }
  }

  const submitRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    const payload = {
      name: ruleForm.name,
      matchType: ruleForm.matchType,
      merchantPattern: ruleForm.merchantPattern,
      category: ruleForm.category,
      reconciliationStatus: ruleForm.reconciliationStatus || undefined,
      priority: parseIntInput(ruleForm.priority, 'Rule priority'),
      active: ruleForm.active,
    }

    try {
      if (ruleEditId) {
        await queue.runOrQueue('updateTransactionRule', { id: ruleEditId, ...payload }, async (args) => updateTransactionRule(args))
      } else {
        await queue.runOrQueue('addTransactionRule', payload, async (args) => addTransactionRule(args))
      }

      setRuleForm(emptyRuleForm)
      setRuleEditId(null)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const startRuleEdit = (entry: TransactionRuleEntry) => {
    setRuleEditId(entry._id)
    setRuleForm({
      name: entry.name,
      matchType: entry.matchType,
      merchantPattern: entry.merchantPattern,
      category: entry.category,
      reconciliationStatus: entry.reconciliationStatus ?? '',
      priority: String(entry.priority),
      active: entry.active,
    })
  }

  const removeRule = async (id: TransactionRuleId) => {
    clearError()
    try {
      await queue.runOrQueue('removeTransactionRule', { id }, async (args) => removeTransactionRule(args))
      if (ruleEditId === id) {
        setRuleEditId(null)
        setRuleForm(emptyRuleForm)
      }
    } catch (error) {
      handleMutationError(error)
    }
  }

  const submitBudget = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    const payload = {
      month: budgetForm.month,
      category: budgetForm.category,
      targetAmount: parseFloatInput(budgetForm.targetAmount, 'Budget target'),
      rolloverEnabled: budgetForm.rolloverEnabled,
      carryoverAmount: budgetForm.carryoverAmount.length > 0 ? parseFloatInput(budgetForm.carryoverAmount, 'Carryover') : undefined,
    }

    try {
      if (budgetEditId) {
        await queue.runOrQueue('updateEnvelopeBudget', { id: budgetEditId, ...payload }, async (args) => updateEnvelopeBudget(args))
      } else {
        await queue.runOrQueue('addEnvelopeBudget', payload, async (args) => addEnvelopeBudget(args))
      }

      setBudgetForm(emptyBudgetForm(monthKey))
      setBudgetEditId(null)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const startBudgetEdit = (entry: EnvelopeBudgetEntry) => {
    setBudgetEditId(entry._id)
    setBudgetForm({
      month: entry.month,
      category: entry.category,
      targetAmount: String(entry.targetAmount),
      rolloverEnabled: entry.rolloverEnabled,
      carryoverAmount: entry.carryoverAmount === undefined ? '' : String(entry.carryoverAmount),
    })
  }

  const removeBudget = async (id: EnvelopeBudgetId) => {
    clearError()
    try {
      await queue.runOrQueue('removeEnvelopeBudget', { id }, async (args) => removeEnvelopeBudget(args))
      if (budgetEditId === id) {
        setBudgetEditId(null)
        setBudgetForm(emptyBudgetForm(monthKey))
      }
    } catch (error) {
      handleMutationError(error)
    }
  }

  const submitAllocationRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    const payload = {
      target: allocationRuleForm.target,
      percentage: parseFloatInput(allocationRuleForm.percentage, 'Allocation percentage'),
      active: allocationRuleForm.active,
    }

    try {
      if (allocationRuleEditId) {
        await queue.runOrQueue('updateIncomeAllocationRule', { id: allocationRuleEditId, ...payload }, async (args) =>
          updateIncomeAllocationRule(args),
        )
      } else {
        await queue.runOrQueue('addIncomeAllocationRule', payload, async (args) => addIncomeAllocationRule(args))
      }

      setAllocationRuleForm(emptyAllocationRuleForm)
      setAllocationRuleEditId(null)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const startAllocationRuleEdit = (entry: IncomeAllocationRuleEntry) => {
    setAllocationRuleEditId(entry._id)
    setAllocationRuleForm({
      target: entry.target,
      percentage: String(entry.percentage),
      active: entry.active,
    })
  }

  const removeAllocationRule = async (id: IncomeAllocationRuleId) => {
    clearError()
    try {
      await queue.runOrQueue('removeIncomeAllocationRule', { id }, async (args) => removeIncomeAllocationRule(args))
      if (allocationRuleEditId === id) {
        setAllocationRuleEditId(null)
        setAllocationRuleForm(emptyAllocationRuleForm)
      }
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onApplyAutoAllocationNow = async () => {
    clearError()
    setIsApplyingAutoAllocation(true)
    try {
      const result = await applyIncomeAutoAllocationNow({ month: planningMonth })
      setAutoAllocationLastRunNote(
        `Generated ${result.suggestionsCreated} suggestion${result.suggestionsCreated === 1 ? '' : 's'} for ${result.monthKey}.`,
      )
    } catch (error) {
      setAutoAllocationLastRunNote(null)
      handleMutationError(error)
    } finally {
      setIsApplyingAutoAllocation(false)
    }
  }

  return {
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
    setPlanningMonth: updatePlanningMonth,
    planningVersions: planningPhase1Data.versions,
    activePlanningVersion,
    setActivePlanningVersion: selectPlanningVersion,
    planningVersionForm,
    setPlanningVersionForm: updatePlanningVersionForm,
    planningVersionDirty,
    planningWorkspace,
    isSavingPlanningVersion,
    planningVersionFeedback,
    submitPlanningVersion,
    resetPlanningVersionForm,
    planningActionTasks: planningPhase3Data.actionTasks,
    planningAdherenceRows: planningPhase3Data.adherenceRows,
    planningKpis: planningPhase3Data.planningKpis,
    planningAuditEvents: planningPhase3Data.auditEvents,
    isApplyingPlanToMonth,
    applyPlanFeedback,
    updatingPlanningTaskId,
    onApplyPlanToMonth,
    onUpdatePlanningTaskStatus,
    isApplyingAutoAllocation,
    autoAllocationLastRunNote,
    onApplyAutoAllocationNow,
    whatIfInput,
    setWhatIfInput,
    queue,
  }
}
