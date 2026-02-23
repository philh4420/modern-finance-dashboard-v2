import { useMemo, useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type {
  Cadence,
  CustomCadenceUnit,
  GoalEditDraft,
  GoalEntry,
  GoalEventEntry,
  GoalForm,
  GoalFundingSourceFormRow,
  GoalFundingSourceType,
  GoalId,
  GoalMilestone,
  GoalType,
  GoalWithMetrics,
} from '../components/financeTypes'
import { daysUntilDate, parseCustomInterval, parseFloatInput } from '../lib/financeHelpers'
import type { MutationHandlers } from './useMutationFeedback'

type UseGoalsSectionArgs = {
  goals: GoalEntry[]
  goalEvents: GoalEventEntry[]
} & MutationHandlers

const DEFAULT_GOAL_TYPE: GoalType = 'sinking_fund'
const DEFAULT_GOAL_CADENCE: Cadence = 'monthly'
const DEFAULT_GOAL_CUSTOM_UNIT: CustomCadenceUnit = 'weeks'

const createEmptyGoalFundingSourceRow = (): GoalFundingSourceFormRow => ({
  sourceType: 'account',
  sourceId: '',
  allocationPercent: '',
})

const initialGoalForm: GoalForm = {
  title: '',
  targetAmount: '',
  currentAmount: '',
  targetDate: '',
  priority: 'medium',
  goalType: DEFAULT_GOAL_TYPE,
  contributionAmount: '0',
  cadence: DEFAULT_GOAL_CADENCE,
  customInterval: '',
  customUnit: DEFAULT_GOAL_CUSTOM_UNIT,
  fundingSources: [createEmptyGoalFundingSourceRow()],
}

const initialGoalEditDraft: GoalEditDraft = {
  title: '',
  targetAmount: '',
  currentAmount: '',
  targetDate: '',
  priority: 'medium',
  goalType: DEFAULT_GOAL_TYPE,
  contributionAmount: '0',
  cadence: DEFAULT_GOAL_CADENCE,
  customInterval: '',
  customUnit: DEFAULT_GOAL_CUSTOM_UNIT,
  fundingSources: [createEmptyGoalFundingSourceRow()],
}

const roundCurrency = (value: number) => Math.round(value * 100) / 100
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const MS_PER_DAY = 86400000
const AVG_DAYS_PER_MONTH = 30.4375

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const parseOptionalNonNegativeFloat = (value: string, label: string) => {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return undefined
  }
  const parsed = parseFloatInput(trimmed, label)
  if (parsed < 0) {
    throw new Error(`${label} cannot be negative.`)
  }
  return roundCurrency(parsed)
}

const normalizeGoalFundingSourcesForMutation = (rows: GoalFundingSourceFormRow[]) => {
  const filtered = rows.filter((row) => row.sourceId.trim().length > 0)
  if (filtered.length === 0) {
    return [] as Array<{
      sourceType: GoalFundingSourceFormRow['sourceType']
      sourceId: string
      allocationPercent?: number
    }>
  }

  const seen = new Set<string>()
  let allocationTotal = 0

  return filtered.map((row) => {
    const sourceId = row.sourceId.trim()
    const dedupeKey = `${row.sourceType}:${sourceId}`
    if (seen.has(dedupeKey)) {
      throw new Error('Duplicate goal funding source rows are not allowed.')
    }
    seen.add(dedupeKey)

    const allocationPercent = parseOptionalNonNegativeFloat(row.allocationPercent, 'Funding allocation %')
    if (allocationPercent !== undefined && allocationPercent > 100) {
      throw new Error('Funding allocation % must be 100 or less.')
    }
    allocationTotal += allocationPercent ?? 0

    return {
      sourceType: row.sourceType,
      sourceId,
      allocationPercent,
    }
  }).map((entry, index, array) => {
    if (index === array.length - 1 && allocationTotal > 100.000001) {
      throw new Error('Funding allocation total cannot exceed 100%.')
    }
    return entry
  })
}

const toMonthlyAmount = (
  amount: number,
  cadence: Cadence,
  customInterval?: number,
  customUnit?: CustomCadenceUnit,
) => {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0
  }

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
      if (customUnit === 'days') return (amount * 365.2425) / (customInterval * 12)
      if (customUnit === 'weeks') return (amount * 365.2425) / (customInterval * 7 * 12)
      if (customUnit === 'months') return amount / customInterval
      return amount / (customInterval * 12)
    case 'one_time':
      return 0
    default:
      return amount
  }
}

const parseIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

const formatIsoDate = (value: number) => new Date(value).toISOString().slice(0, 10)

const startOfLocalDayMs = (value: number) => {
  const date = new Date(value)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

const addDaysIso = (baseIsoDate: string, dayDelta: number) => {
  const base = parseIsoDate(baseIsoDate)
  if (!base) return undefined
  return formatIsoDate(base.getTime() + dayDelta * MS_PER_DAY)
}

const buildGoalMilestones = (goal: GoalEntry, progressPercent: number): GoalMilestone[] => {
  const targetDate = parseIsoDate(goal.targetDate)
  const createdDate = new Date(goal.createdAt)
  const createdStart = new Date(createdDate.getFullYear(), createdDate.getMonth(), createdDate.getDate())

  if (!targetDate) {
    return [
      { percent: 25, label: '25%', targetDate: goal.targetDate, achieved: progressPercent >= 25 },
      { percent: 50, label: '50%', targetDate: goal.targetDate, achieved: progressPercent >= 50 },
      { percent: 75, label: '75%', targetDate: goal.targetDate, achieved: progressPercent >= 75 },
      { percent: 100, label: '100%', targetDate: goal.targetDate, achieved: progressPercent >= 100 },
    ]
  }

  const startMs = createdStart.getTime()
  const endMs = targetDate.getTime()
  const spanMs = Math.max(endMs - startMs, 0)
  const milestones: Array<25 | 50 | 75 | 100> = [25, 50, 75, 100]

  return milestones.map((percent) => {
    const targetMs = spanMs === 0 ? endMs : startMs + Math.round(spanMs * (percent / 100))
    return {
      percent,
      label: `${percent}%`,
      targetDate: formatIsoDate(targetMs),
      achieved: progressPercent >= percent,
    }
  })
}

const normalizeFundingSourcesForView = (goal: GoalEntry) =>
  Array.isArray(goal.fundingSources)
    ? goal.fundingSources
        .filter((entry) => entry && typeof entry.sourceId === 'string' && entry.sourceId.trim().length > 0)
        .map((entry) => ({
          sourceType: entry.sourceType,
          sourceId: entry.sourceId,
          allocationPercent: isFiniteNumber(entry.allocationPercent) ? roundCurrency(entry.allocationPercent) : undefined,
        }))
    : []

export const useGoalsSection = ({ goals, goalEvents, clearError, handleMutationError }: UseGoalsSectionArgs) => {
  const addGoal = useMutation(api.finance.addGoal)
  const updateGoal = useMutation(api.finance.updateGoal)
  const removeGoal = useMutation(api.finance.removeGoal)
  const recordGoalContribution = useMutation(api.finance.recordGoalContribution)
  const setGoalPaused = useMutation(api.finance.setGoalPaused)

  const [goalForm, setGoalForm] = useState<GoalForm>(initialGoalForm)
  const [goalEditId, setGoalEditId] = useState<GoalId | null>(null)
  const [goalEditDraft, setGoalEditDraft] = useState<GoalEditDraft>(initialGoalEditDraft)
  const [busyGoalContributionId, setBusyGoalContributionId] = useState<GoalId | null>(null)
  const [busyGoalPauseId, setBusyGoalPauseId] = useState<GoalId | null>(null)

  const goalsWithMetrics = useMemo<GoalWithMetrics[]>(() => {
    return goals.map((goal) => {
      const progressPercent = Math.min((goal.currentAmount / Math.max(goal.targetAmount, 1)) * 100, 100)
      const remaining = Math.max(goal.targetAmount - goal.currentAmount, 0)
      const daysLeft = daysUntilDate(goal.targetDate)
      const goalTypeValue = goal.goalType ?? DEFAULT_GOAL_TYPE
      const contributionAmountValue =
        isFiniteNumber(goal.contributionAmount) && goal.contributionAmount > 0 ? roundCurrency(goal.contributionAmount) : 0
      const cadenceValue = goal.cadence ?? DEFAULT_GOAL_CADENCE
      const customIntervalValue =
        cadenceValue === 'custom' && isFiniteNumber(goal.customInterval) && goal.customInterval > 0
          ? Math.round(goal.customInterval)
          : undefined
      const customUnitValue = cadenceValue === 'custom' ? goal.customUnit ?? DEFAULT_GOAL_CUSTOM_UNIT : undefined
      const fundingSourcesValue = normalizeFundingSourcesForView(goal)
      const pausedValue = goal.paused === true
      const pausedAtValue = typeof goal.pausedAt === 'number' ? goal.pausedAt : undefined
      const pauseReasonValue = goal.pauseReason?.trim() || undefined
      const plannedMonthlyContribution = roundCurrency(
        toMonthlyAmount(contributionAmountValue, cadenceValue, customIntervalValue, customUnitValue),
      )

      const requiredMonthlyContribution =
        remaining <= 0
          ? 0
          : daysLeft <= 0
            ? roundCurrency(remaining)
            : roundCurrency(remaining / Math.max(daysLeft / AVG_DAYS_PER_MONTH, 1 / AVG_DAYS_PER_MONTH))

      const targetDate = parseIsoDate(goal.targetDate)
      const createdMs = startOfLocalDayMs(goal.createdAt)
      const targetMs = targetDate ? startOfLocalDayMs(targetDate.getTime()) : undefined
      const totalTimelineDays = targetMs !== undefined ? Math.max(Math.round((targetMs - createdMs) / MS_PER_DAY), 0) : undefined
      const elapsedTimelineDays =
        totalTimelineDays === undefined ? undefined : clamp(totalTimelineDays - Math.max(daysLeft, 0), 0, totalTimelineDays)

      const expectedProgressPercentNow =
        totalTimelineDays === undefined || totalTimelineDays <= 0
          ? progressPercent
          : clamp((elapsedTimelineDays! / Math.max(totalTimelineDays, 1)) * 100, 0, 100)

      const paceCoverageRatio =
        requiredMonthlyContribution <= 0
          ? remaining <= 0
            ? 1
            : plannedMonthlyContribution > 0
              ? 1
              : 0
          : clamp(plannedMonthlyContribution / requiredMonthlyContribution, 0, 10)

      const behindPercent = Math.max(expectedProgressPercentNow - progressPercent, 0)
      const contributionConsistencyScore = clamp(
        Math.round(
          100 -
            behindPercent * 1.15 -
            (plannedMonthlyContribution <= 0 && remaining > 0 ? 45 : 0) -
            (fundingSourcesValue.length === 0 && remaining > 0 ? 10 : 0) -
            (paceCoverageRatio < 1 ? (1 - paceCoverageRatio) * 28 : 0),
        ),
        0,
        100,
      )

      const predictedMonthsToComplete =
        remaining <= 0 ? 0 : plannedMonthlyContribution > 0 ? roundCurrency(remaining / plannedMonthlyContribution) : undefined

      const projectedCompletionDeltaDays =
        predictedMonthsToComplete === undefined
          ? undefined
          : Math.round(predictedMonthsToComplete * AVG_DAYS_PER_MONTH) - Math.max(daysLeft, 0)

      const predictedCompletionDate =
        projectedCompletionDeltaDays === undefined ? undefined : addDaysIso(goal.targetDate, projectedCompletionDeltaDays)

      const predictedDaysDeltaToTarget =
        predictedCompletionDate && targetMs !== undefined
          ? Math.round((startOfLocalDayMs(new Date(`${predictedCompletionDate}T00:00:00`).getTime()) - targetMs) / MS_PER_DAY)
          : undefined

      const atRiskReasons: string[] = []
      if (remaining > 0 && plannedMonthlyContribution <= 0) {
        atRiskReasons.push('No planned contribution set')
      }
      if (remaining > 0 && paceCoverageRatio < 1 && daysLeft <= 365) {
        atRiskReasons.push(`Pace shortfall (${Math.round(paceCoverageRatio * 100)}% of required)`)
      }
      if (remaining > 0 && behindPercent >= 10) {
        atRiskReasons.push(`Behind schedule by ${behindPercent.toFixed(0)}%`)
      }
      if (remaining > 0 && contributionConsistencyScore < 60) {
        atRiskReasons.push(`Low contribution consistency (${contributionConsistencyScore}/100)`)
      }
      if (predictedDaysDeltaToTarget !== undefined && predictedDaysDeltaToTarget > 0) {
        atRiskReasons.push(`Predicted ${predictedDaysDeltaToTarget}d late at current pace`)
      }

      const paceScore = clamp(Math.min(paceCoverageRatio, 1) * 100, 0, 100)
      const riskPenalty = Math.min(atRiskReasons.length * 8, 32)
      const predictedLatePenalty =
        predictedDaysDeltaToTarget !== undefined && predictedDaysDeltaToTarget > 0
          ? Math.min(predictedDaysDeltaToTarget / 5, 22)
          : 0
      const pausedPenalty = pausedValue ? 8 : 0
      const goalHealthScore = clamp(
        Math.round(
          paceScore * 0.45 +
            contributionConsistencyScore * 0.35 +
            (100 - Math.min(behindPercent, 100)) * 0.2 -
            riskPenalty -
            predictedLatePenalty -
            pausedPenalty,
        ),
        0,
        100,
      )

      return {
        ...goal,
        progressPercent,
        remaining,
        daysLeft,
        goalTypeValue,
        contributionAmountValue,
        cadenceValue,
        customIntervalValue,
        customUnitValue,
        fundingSourcesValue,
        pausedValue,
        pausedAtValue,
        pauseReasonValue,
        plannedMonthlyContribution,
        requiredMonthlyContribution,
        expectedProgressPercentNow,
        paceCoverageRatio,
        contributionConsistencyScore,
        goalHealthScore,
        predictedCompletionDate,
        predictedMonthsToComplete,
        predictedDaysDeltaToTarget,
        atRiskReasons,
        milestones: buildGoalMilestones(goal, progressPercent),
      }
    })
  }, [goals])

  const onAddGoal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    try {
      const contributionAmount = parseFloatInput(goalForm.contributionAmount || '0', 'Planned contribution')
      if (contributionAmount < 0) {
        throw new Error('Planned contribution cannot be negative.')
      }

      await addGoal({
        title: goalForm.title,
        targetAmount: parseFloatInput(goalForm.targetAmount, 'Target amount'),
        currentAmount: parseFloatInput(goalForm.currentAmount, 'Current amount'),
        targetDate: goalForm.targetDate,
        priority: goalForm.priority,
        goalType: goalForm.goalType,
        contributionAmount,
        cadence: goalForm.cadence,
        customInterval: goalForm.cadence === 'custom' ? parseCustomInterval(goalForm.customInterval) : undefined,
        customUnit: goalForm.cadence === 'custom' ? goalForm.customUnit : undefined,
        fundingSources: normalizeGoalFundingSourcesForMutation(goalForm.fundingSources),
      })

      setGoalForm(initialGoalForm)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onDeleteGoal = async (id: GoalId) => {
    clearError()
    try {
      if (goalEditId === id) {
        setGoalEditId(null)
      }
      await removeGoal({ id })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const startGoalEdit = (entry: GoalWithMetrics) => {
    setGoalEditId(entry._id)
    setGoalEditDraft({
      title: entry.title,
      targetAmount: String(entry.targetAmount),
      currentAmount: String(entry.currentAmount),
      targetDate: entry.targetDate,
      priority: entry.priority,
      goalType: entry.goalTypeValue,
      contributionAmount: String(entry.contributionAmountValue),
      cadence: entry.cadenceValue,
      customInterval: entry.customIntervalValue ? String(entry.customIntervalValue) : '',
      customUnit: entry.customUnitValue ?? DEFAULT_GOAL_CUSTOM_UNIT,
      fundingSources:
        entry.fundingSourcesValue.length > 0
          ? entry.fundingSourcesValue.map((source) => ({
              sourceType: source.sourceType,
              sourceId: source.sourceId,
              allocationPercent:
                source.allocationPercent !== undefined ? String(roundCurrency(source.allocationPercent)) : '',
            }))
          : [createEmptyGoalFundingSourceRow()],
    })
  }

  const saveGoalEdit = async () => {
    if (!goalEditId) return

    clearError()
    try {
      const contributionAmount = parseFloatInput(goalEditDraft.contributionAmount || '0', 'Planned contribution')
      if (contributionAmount < 0) {
        throw new Error('Planned contribution cannot be negative.')
      }

      await updateGoal({
        id: goalEditId,
        title: goalEditDraft.title,
        targetAmount: parseFloatInput(goalEditDraft.targetAmount, 'Goal target amount'),
        currentAmount: parseFloatInput(goalEditDraft.currentAmount, 'Goal current amount'),
        targetDate: goalEditDraft.targetDate,
        priority: goalEditDraft.priority,
        goalType: goalEditDraft.goalType,
        contributionAmount,
        cadence: goalEditDraft.cadence,
        customInterval: goalEditDraft.cadence === 'custom' ? parseCustomInterval(goalEditDraft.customInterval) : undefined,
        customUnit: goalEditDraft.cadence === 'custom' ? goalEditDraft.customUnit : undefined,
        fundingSources: normalizeGoalFundingSourcesForMutation(goalEditDraft.fundingSources),
      })
      setGoalEditId(null)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onRecordGoalContribution = async (args: {
    goalId: GoalId
    amount: number
    source?: 'manual' | 'quick_action' | 'system'
    note?: string
    fundingSourceType?: GoalFundingSourceType
    fundingSourceId?: string
  }) => {
    clearError()
    setBusyGoalContributionId(args.goalId)
    try {
      await recordGoalContribution({
        goalId: args.goalId,
        amount: args.amount,
        source: args.source,
        note: args.note,
        fundingSourceType: args.fundingSourceType,
        fundingSourceId: args.fundingSourceId,
      })
    } catch (error) {
      handleMutationError(error)
    } finally {
      setBusyGoalContributionId(null)
    }
  }

  const onSetGoalPaused = async (args: { goalId: GoalId; paused: boolean; reason?: string }) => {
    clearError()
    setBusyGoalPauseId(args.goalId)
    try {
      await setGoalPaused({
        id: args.goalId,
        paused: args.paused,
        reason: args.reason,
      })
    } catch (error) {
      handleMutationError(error)
    } finally {
      setBusyGoalPauseId(null)
    }
  }

  return {
    goalForm,
    setGoalForm,
    goalEditId,
    setGoalEditId,
    goalEditDraft,
    setGoalEditDraft,
    goalsWithMetrics,
    goalEvents,
    onAddGoal,
    onDeleteGoal,
    startGoalEdit,
    saveGoalEdit,
    onRecordGoalContribution,
    onSetGoalPaused,
    busyGoalContributionId,
    busyGoalPauseId,
    goals,
  }
}
