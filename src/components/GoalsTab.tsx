import { useCallback, useMemo, useState, type CSSProperties, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { DataTable, PillBadge, SurfaceCard } from '@/components/ui'
import type {
  AccountEntry,
  Cadence,
  CadenceOption,
  CardEntry,
  CustomCadenceUnitOption,
  GoalEditDraft,
  GoalForm,
  GoalEventEntry,
  GoalFundingSourceFormRow,
  GoalFundingSourceType,
  GoalId,
  GoalPriority,
  GoalPriorityOption,
  GoalType,
  GoalTypeOption,
  GoalWithMetrics,
  IncomeEntry,
} from './financeTypes'

type GoalSortKey = 'title_asc' | 'due_asc' | 'progress_desc' | 'remaining_desc' | 'priority_desc'
type GoalStatusFilter = 'all' | 'on_track' | 'at_risk' | 'overdue' | 'completed'
type GoalOptimizerRecommendation = {
  goal: GoalWithMetrics
  status: Exclude<GoalStatusFilter, 'all'>
  score: number
  recommendedExtraMonthly: number
  projectedDaysSaved: number
}

type GoalsTabProps = {
  goalsWithMetrics: GoalWithMetrics[]
  goalForm: GoalForm
  goalEvents: GoalEventEntry[]
  setGoalForm: Dispatch<SetStateAction<GoalForm>>
  goalEditId: GoalId | null
  setGoalEditId: Dispatch<SetStateAction<GoalId | null>>
  goalEditDraft: GoalEditDraft
  setGoalEditDraft: Dispatch<SetStateAction<GoalEditDraft>>
  onAddGoal: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onDeleteGoal: (id: GoalId) => Promise<void>
  saveGoalEdit: () => Promise<void>
  startGoalEdit: (entry: GoalWithMetrics) => void
  onRecordGoalContribution: (args: {
    goalId: GoalId
    amount: number
    source?: 'manual' | 'quick_action' | 'system'
    note?: string
    fundingSourceType?: GoalFundingSourceType
    fundingSourceId?: string
  }) => Promise<void>
  onSetGoalPaused: (args: { goalId: GoalId; paused: boolean; reason?: string }) => Promise<void>
  busyGoalContributionId: GoalId | null
  busyGoalPauseId: GoalId | null
  incomes: IncomeEntry[]
  accounts: AccountEntry[]
  cards: CardEntry[]
  cadenceOptions: CadenceOption[]
  customCadenceUnitOptions: CustomCadenceUnitOption[]
  goalPriorityOptions: GoalPriorityOption[]
  goalTypeOptions: GoalTypeOption[]
  goalFundingSourceTypeOptions: Array<{ value: GoalFundingSourceType; label: string }>
  priorityLabel: (priority: GoalPriority) => string
  goalTypeLabel: (goalType: GoalType) => string
  cadenceLabel: (cadence: Cadence, customInterval?: number, customUnit?: GoalForm['customUnit']) => string
  formatMoney: (value: number) => string
  formatPercent: (value: number) => string
  dateLabel: Intl.DateTimeFormat
}

type GoalFormState = GoalForm | GoalEditDraft

const priorityRank: Record<GoalPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
}
const AVG_DAYS_PER_MONTH = 30.4375
const MS_PER_DAY = 86400000

const createEmptyFundingSourceRow = (): GoalFundingSourceFormRow => ({
  sourceType: 'account',
  sourceId: '',
  allocationPercent: '',
})

const goalStatus = (goal: GoalWithMetrics): Exclude<GoalStatusFilter, 'all'> => {
  if (goal.progressPercent >= 100) return 'completed'
  if (goal.daysLeft < 0) return 'overdue'

  const paceShortfall =
    goal.requiredMonthlyContribution > 0 &&
    goal.plannedMonthlyContribution + 0.009 < goal.requiredMonthlyContribution &&
    goal.daysLeft <= 180

  if (paceShortfall) return 'at_risk'
  if (goal.daysLeft <= 30 && goal.progressPercent < 70) return 'at_risk'
  return 'on_track'
}

const goalStatusPill = (status: Exclude<GoalStatusFilter, 'all'>) => {
  if (status === 'completed') return 'pill pill--good'
  if (status === 'overdue') return 'pill pill--critical'
  if (status === 'at_risk') return 'pill pill--warning'
  return 'pill pill--neutral'
}

const priorityPill = (priority: GoalPriority) => {
  if (priority === 'high') return 'pill pill--critical'
  if (priority === 'medium') return 'pill pill--warning'
  return 'pill pill--neutral'
}

const goalTypePill = (goalType: GoalType) => {
  if (goalType === 'emergency_fund') return 'pill pill--good'
  if (goalType === 'debt_payoff') return 'pill pill--warning'
  if (goalType === 'big_purchase') return 'pill pill--cadence'
  return 'pill pill--neutral'
}

const daysLeftLabel = (daysLeft: number) => {
  if (daysLeft < 0) return `${Math.abs(daysLeft)}d overdue`
  if (daysLeft === 0) return 'due today'
  return `${daysLeft}d left`
}

const goalFundingSourceKindLabel = (value: GoalFundingSourceType) => {
  if (value === 'income') return 'Income'
  if (value === 'card') return 'Card'
  return 'Account'
}

const normalizeFundingRows = (rows: GoalFundingSourceFormRow[] | undefined) => (rows && rows.length > 0 ? rows : [createEmptyFundingSourceRow()])

const updateFundingRow = <T extends GoalFormState>(
  setter: Dispatch<SetStateAction<T>>,
  index: number,
  patch: Partial<GoalFundingSourceFormRow>,
) => {
  setter((prev) => {
    const nextRows = normalizeFundingRows(prev.fundingSources).map((row, rowIndex) => {
      if (rowIndex !== index) return row
      return { ...row, ...patch }
    })
    return { ...prev, fundingSources: nextRows } as T
  })
}

const addFundingRow = <T extends GoalFormState>(setter: Dispatch<SetStateAction<T>>) => {
  setter((prev) => ({
    ...prev,
    fundingSources: [...normalizeFundingRows(prev.fundingSources), createEmptyFundingSourceRow()],
  }))
}

const removeFundingRow = <T extends GoalFormState>(setter: Dispatch<SetStateAction<T>>, index: number) => {
  setter((prev) => {
    const nextRows = normalizeFundingRows(prev.fundingSources).filter((_, rowIndex) => rowIndex !== index)
    return {
      ...prev,
      fundingSources: nextRows.length > 0 ? nextRows : [createEmptyFundingSourceRow()],
    } as T
  })
}

const formatShortDate = (value: string, dateLabel: Intl.DateTimeFormat) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  return dateLabel.format(new Date(`${value}T00:00:00`))
}

const roundCurrency = (value: number) => Math.round(value * 100) / 100
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const parseGoalIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}
const formatIsoDate = (value: number) => new Date(value).toISOString().slice(0, 10)

const predictGoalWithExtraMonthly = (goal: GoalWithMetrics, extraMonthly: number) => {
  const pace = Math.max(goal.plannedMonthlyContribution + Math.max(extraMonthly, 0), 0)
  if (goal.remaining <= 0) {
    return {
      monthlyPace: pace,
      predictedMonthsToComplete: 0,
      predictedCompletionDate: goal.targetDate,
      predictedDaysDeltaToTarget: 0,
    }
  }

  if (pace <= 0) {
    return {
      monthlyPace: 0,
      predictedMonthsToComplete: undefined,
      predictedCompletionDate: undefined,
      predictedDaysDeltaToTarget: undefined,
    }
  }

  const monthsToComplete = roundCurrency(goal.remaining / pace)
  const dayDeltaFromTarget = Math.round(monthsToComplete * AVG_DAYS_PER_MONTH) - Math.max(goal.daysLeft, 0)
  const predictedCompletionDate = (() => {
    const targetDate = parseGoalIsoDate(goal.targetDate)
    if (!targetDate) return undefined
    return formatIsoDate(targetDate.getTime() + dayDeltaFromTarget * MS_PER_DAY)
  })()

  return {
    monthlyPace: pace,
    predictedMonthsToComplete: monthsToComplete,
    predictedCompletionDate,
    predictedDaysDeltaToTarget: dayDeltaFromTarget,
  }
}

const predictionDeltaLabel = (daysDelta?: number) => {
  if (daysDelta === undefined) return 'No prediction'
  if (daysDelta === 0) return 'On time'
  if (daysDelta > 0) return `${daysDelta}d late`
  return `${Math.abs(daysDelta)}d early`
}

const goalHealthPill = (score: number) => {
  if (score >= 80) return 'pill pill--good'
  if (score >= 55) return 'pill pill--warning'
  return 'pill pill--critical'
}

const goalEventTypeLabel = (value: GoalEventEntry['eventType']) => {
  switch (value) {
    case 'created':
      return 'Created'
    case 'edited':
      return 'Edited'
    case 'target_changed':
      return 'Target changed'
    case 'schedule_changed':
      return 'Schedule changed'
    case 'contribution':
      return 'Contribution'
    case 'progress_adjustment':
      return 'Progress adjusted'
    case 'paused':
      return 'Paused'
    case 'resumed':
      return 'Resumed'
    case 'removed':
      return 'Removed'
    default:
      return value
  }
}

const goalEventTypePill = (value: GoalEventEntry['eventType']) => {
  if (value === 'contribution' || value === 'resumed') return 'pill pill--good'
  if (value === 'paused') return 'pill pill--warning'
  if (value === 'removed') return 'pill pill--critical'
  return 'pill pill--neutral'
}

const parseGoalEventMetadata = (value?: string) => {
  if (!value) return undefined
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return undefined
  }
}

const goalEventTimestamp = (entry: GoalEventEntry) =>
  typeof entry.occurredAt === 'number' ? entry.occurredAt : entry.createdAt

const goalEventSourceLabel = (value: GoalEventEntry['source']) => {
  if (value === 'quick_action') return 'Quick action'
  if (value === 'system') return 'System'
  return 'Manual'
}

export function GoalsTab({
  goalsWithMetrics,
  goalEvents,
  goalForm,
  setGoalForm,
  goalEditId,
  setGoalEditId,
  goalEditDraft,
  setGoalEditDraft,
  onAddGoal,
  onDeleteGoal,
  saveGoalEdit,
  startGoalEdit,
  onRecordGoalContribution,
  onSetGoalPaused,
  busyGoalContributionId,
  busyGoalPauseId,
  incomes,
  accounts,
  cards,
  cadenceOptions,
  customCadenceUnitOptions,
  goalPriorityOptions,
  goalTypeOptions,
  goalFundingSourceTypeOptions,
  priorityLabel,
  goalTypeLabel,
  cadenceLabel,
  formatMoney,
  formatPercent,
  dateLabel,
}: GoalsTabProps) {
  const [search, setSearch] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<'all' | GoalPriority>('all')
  const [statusFilter, setStatusFilter] = useState<GoalStatusFilter>('all')
  const [sortKey, setSortKey] = useState<GoalSortKey>('due_asc')
  const [tradeoffGoalAId, setTradeoffGoalAId] = useState<string>('')
  const [tradeoffGoalBId, setTradeoffGoalBId] = useState<string>('')
  const [tradeoffExtraMonthly, setTradeoffExtraMonthly] = useState('100')
  const [goalExecutionMessage, setGoalExecutionMessage] = useState<string | null>(null)
  const [isApplyingPlannedContributions, setIsApplyingPlannedContributions] = useState(false)

  const sourceLabelMaps = useMemo(() => {
    const accountMap = new Map(accounts.map((entry) => [String(entry._id), entry.name] as const))
    const cardMap = new Map(cards.map((entry) => [String(entry._id), entry.name] as const))
    const incomeMap = new Map(incomes.map((entry) => [String(entry._id), entry.source] as const))
    return { accountMap, cardMap, incomeMap }
  }, [accounts, cards, incomes])

  const summary = useMemo(() => {
    const targetTotal = goalsWithMetrics.reduce((sum, goal) => sum + goal.targetAmount, 0)
    const fundedTotal = goalsWithMetrics.reduce((sum, goal) => sum + goal.currentAmount, 0)
    const remainingTotal = goalsWithMetrics.reduce((sum, goal) => sum + goal.remaining, 0)
    const completedCount = goalsWithMetrics.filter((goal) => goal.progressPercent >= 100).length
    const overdueCount = goalsWithMetrics.filter((goal) => goal.daysLeft < 0 && goal.progressPercent < 100).length
    const weightedProgress = targetTotal > 0 ? (fundedTotal / targetTotal) * 100 : 0
    const plannedMonthlyContributionTotal = goalsWithMetrics.reduce((sum, goal) => sum + goal.plannedMonthlyContribution, 0)
    const requiredMonthlyContributionTotal = goalsWithMetrics.reduce((sum, goal) => sum + goal.requiredMonthlyContribution, 0)

    return {
      targetTotal,
      fundedTotal,
      remainingTotal,
      completedCount,
      overdueCount,
      weightedProgress,
      plannedMonthlyContributionTotal,
      requiredMonthlyContributionTotal,
    }
  }, [goalsWithMetrics])

  const visibleGoals = useMemo(() => {
    const query = search.trim().toLowerCase()

    const filtered = goalsWithMetrics.filter((goal) => {
      const status = goalStatus(goal)
      const queryMatch =
        query.length === 0
          ? true
          : `${goal.title} ${goal.priority} ${priorityLabel(goal.priority)} ${status} ${goal.goalTypeValue} ${goalTypeLabel(
              goal.goalTypeValue,
            )}`
              .toLowerCase()
              .includes(query)
      const priorityMatch = priorityFilter === 'all' ? true : goal.priority === priorityFilter
      const statusMatch = statusFilter === 'all' ? true : status === statusFilter
      return queryMatch && priorityMatch && statusMatch
    })

    return filtered.sort((a, b) => {
      switch (sortKey) {
        case 'title_asc':
          return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
        case 'due_asc':
          return a.daysLeft - b.daysLeft || b.progressPercent - a.progressPercent
        case 'progress_desc':
          return b.progressPercent - a.progressPercent
        case 'remaining_desc':
          return b.remaining - a.remaining
        case 'priority_desc':
          return priorityRank[a.priority] - priorityRank[b.priority] || a.daysLeft - b.daysLeft
        default:
          return 0
      }
    })
  }, [goalTypeLabel, goalsWithMetrics, priorityFilter, priorityLabel, search, sortKey, statusFilter])

  const hasFilters =
    search.length > 0 || priorityFilter !== 'all' || statusFilter !== 'all' || sortKey !== 'due_asc'

  const sourceOptionsByType = useMemo(
    () => ({
      account: accounts.map((entry) => ({ value: String(entry._id), label: entry.name })),
      card: cards.map((entry) => ({ value: String(entry._id), label: entry.name })),
      income: incomes.map((entry) => ({ value: String(entry._id), label: entry.source })),
    }),
    [accounts, cards, incomes],
  )

  const getFundingSourceDisplay = useCallback((sourceType: GoalFundingSourceType, sourceId: string) => {
    if (sourceType === 'account') return sourceLabelMaps.accountMap.get(sourceId) ?? 'Unknown account'
    if (sourceType === 'card') return sourceLabelMaps.cardMap.get(sourceId) ?? 'Unknown card'
    return sourceLabelMaps.incomeMap.get(sourceId) ?? 'Unknown income'
  }, [sourceLabelMaps.accountMap, sourceLabelMaps.cardMap, sourceLabelMaps.incomeMap])

  const openGoals = useMemo(
    () => goalsWithMetrics.filter((goal) => goal.progressPercent < 100 && goal.remaining > 0),
    [goalsWithMetrics],
  )

  const atRiskGoals = useMemo(
    () =>
      openGoals
        .filter((goal) => goal.atRiskReasons.length > 0)
        .sort((a, b) => {
          const aWeight = (a.predictedDaysDeltaToTarget ?? 0) + a.atRiskReasons.length * 8 + (a.priority === 'high' ? 16 : 0)
          const bWeight = (b.predictedDaysDeltaToTarget ?? 0) + b.atRiskReasons.length * 8 + (b.priority === 'high' ? 16 : 0)
          return bWeight - aWeight
        }),
    [openGoals],
  )

  const optimizerRecommendations = useMemo<GoalOptimizerRecommendation[]>(() => {
    const priorityWeight: Record<GoalPriority, number> = { high: 58, medium: 34, low: 16 }
    const typeWeight: Record<GoalType, number> = {
      emergency_fund: 12,
      sinking_fund: 8,
      debt_payoff: 14,
      big_purchase: 6,
    }

    return openGoals
      .map((goal) => {
        const status = goalStatus(goal)
        const paceShortfall = Math.max(goal.requiredMonthlyContribution - goal.plannedMonthlyContribution, 0)
        const recommendedExtraMonthly =
          paceShortfall > 0
            ? roundCurrency(Math.min(goal.remaining, paceShortfall))
            : roundCurrency(Math.min(goal.remaining, Math.max(goal.plannedMonthlyContribution * 0.25, 25)))

        const baseline = predictGoalWithExtraMonthly(goal, 0)
        const boosted = predictGoalWithExtraMonthly(goal, recommendedExtraMonthly)
        const projectedDaysSaved =
          baseline.predictedDaysDeltaToTarget === undefined || boosted.predictedDaysDeltaToTarget === undefined
            ? 0
            : Math.max(baseline.predictedDaysDeltaToTarget - boosted.predictedDaysDeltaToTarget, 0)

        const score = Math.round(
          priorityWeight[goal.priority] +
            typeWeight[goal.goalTypeValue] +
            (goal.daysLeft < 0 ? 34 : goal.daysLeft <= 30 ? 26 : goal.daysLeft <= 90 ? 18 : goal.daysLeft <= 180 ? 9 : 0) +
            (status === 'at_risk' ? 22 : status === 'overdue' ? 32 : 0) +
            Math.min(goal.atRiskReasons.length * 6, 24) +
            clamp((1 - Math.min(goal.paceCoverageRatio, 1)) * 26, 0, 26) +
            clamp(
              goal.requiredMonthlyContribution > 0 ? (paceShortfall / goal.requiredMonthlyContribution) * 20 : 0,
              0,
              20,
            ) +
            clamp(((goal.predictedDaysDeltaToTarget ?? 0) > 0 ? (goal.predictedDaysDeltaToTarget ?? 0) : 0) / 14, 0, 14),
        )

        return {
          goal,
          status,
          score,
          recommendedExtraMonthly,
          projectedDaysSaved,
        }
      })
      .sort((a, b) => b.score - a.score || a.goal.daysLeft - b.goal.daysLeft)
  }, [openGoals])

  const parsedTradeoffExtraMonthly = useMemo(() => {
    const parsed = Number.parseFloat(tradeoffExtraMonthly)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  }, [tradeoffExtraMonthly])

  const tradeoffCandidates = useMemo(() => optimizerRecommendations.map((entry) => entry.goal), [optimizerRecommendations])
  const resolvedTradeoffGoalAId = tradeoffGoalAId || String(tradeoffCandidates[0]?._id ?? '')
  const resolvedTradeoffGoalBId =
    tradeoffGoalBId && tradeoffGoalBId !== resolvedTradeoffGoalAId
      ? tradeoffGoalBId
      : String(tradeoffCandidates.find((goal) => String(goal._id) !== resolvedTradeoffGoalAId)?._id ?? '')
  const tradeoffGoalA = tradeoffCandidates.find((goal) => String(goal._id) === resolvedTradeoffGoalAId) ?? null
  const tradeoffGoalB = tradeoffCandidates.find((goal) => String(goal._id) === resolvedTradeoffGoalBId) ?? null

  const tradeoffComparison = useMemo(() => {
    if (!tradeoffGoalA || !tradeoffGoalB || parsedTradeoffExtraMonthly <= 0) {
      return null
    }

    const baselineA = predictGoalWithExtraMonthly(tradeoffGoalA, 0)
    const baselineB = predictGoalWithExtraMonthly(tradeoffGoalB, 0)
    const boostA = predictGoalWithExtraMonthly(tradeoffGoalA, parsedTradeoffExtraMonthly)
    const boostB = predictGoalWithExtraMonthly(tradeoffGoalB, parsedTradeoffExtraMonthly)

    const aDaysSaved =
      baselineA.predictedDaysDeltaToTarget === undefined || boostA.predictedDaysDeltaToTarget === undefined
        ? 0
        : Math.max(baselineA.predictedDaysDeltaToTarget - boostA.predictedDaysDeltaToTarget, 0)
    const bDaysSaved =
      baselineB.predictedDaysDeltaToTarget === undefined || boostB.predictedDaysDeltaToTarget === undefined
        ? 0
        : Math.max(baselineB.predictedDaysDeltaToTarget - boostB.predictedDaysDeltaToTarget, 0)

    const priorityMultiplier: Record<GoalPriority, number> = { high: 1.35, medium: 1.1, low: 0.9 }
    const weightedBenefitA = roundCurrency(aDaysSaved * priorityMultiplier[tradeoffGoalA.priority])
    const weightedBenefitB = roundCurrency(bDaysSaved * priorityMultiplier[tradeoffGoalB.priority])

    const recommendation =
      weightedBenefitA === weightedBenefitB
        ? tradeoffGoalA.daysLeft <= tradeoffGoalB.daysLeft
          ? 'A'
          : 'B'
        : weightedBenefitA > weightedBenefitB
          ? 'A'
          : 'B'

    return {
      baselineA,
      baselineB,
      boostA,
      boostB,
      aDaysSaved,
      bDaysSaved,
      weightedBenefitA,
      weightedBenefitB,
      recommendation,
    }
  }, [parsedTradeoffExtraMonthly, tradeoffGoalA, tradeoffGoalB])

  const suggestedContributionRows = useMemo(() => {
    return openGoals
      .filter((goal) => !goal.pausedValue && goal.remaining > 0)
      .map((goal) => {
        const fallbackAmount =
          goal.plannedMonthlyContribution > 0
            ? goal.plannedMonthlyContribution
            : goal.requiredMonthlyContribution > 0
              ? goal.requiredMonthlyContribution
              : 0
        const suggestedAmount = roundCurrency(Math.min(goal.remaining, Math.max(fallbackAmount, 0)))
        return {
          goal,
          suggestedAmount,
          primaryFundingSource: goal.fundingSourcesValue[0],
        }
      })
      .filter((entry) => entry.suggestedAmount > 0)
      .sort((left, right) => {
        const leftPriorityWeight = left.goal.priority === 'high' ? 3 : left.goal.priority === 'medium' ? 2 : 1
        const rightPriorityWeight = right.goal.priority === 'high' ? 3 : right.goal.priority === 'medium' ? 2 : 1
        if (rightPriorityWeight !== leftPriorityWeight) return rightPriorityWeight - leftPriorityWeight
        if (left.goal.daysLeft !== right.goal.daysLeft) return left.goal.daysLeft - right.goal.daysLeft
        return right.suggestedAmount - left.suggestedAmount
      })
  }, [openGoals])

  const goalHealthPortfolio = useMemo(() => {
    const activeGoals = goalsWithMetrics.filter((goal) => goal.progressPercent < 100)
    const avgHealth =
      activeGoals.length > 0
        ? Math.round(activeGoals.reduce((sum, goal) => sum + goal.goalHealthScore, 0) / activeGoals.length)
        : null
    const criticalCount = activeGoals.filter((goal) => goal.goalHealthScore < 55).length
    const warningCount = activeGoals.filter((goal) => goal.goalHealthScore >= 55 && goal.goalHealthScore < 80).length
    const healthyCount = activeGoals.filter((goal) => goal.goalHealthScore >= 80).length
    const pausedCount = activeGoals.filter((goal) => goal.pausedValue).length
    return {
      avgHealth,
      criticalCount,
      warningCount,
      healthyCount,
      pausedCount,
      activeCount: activeGoals.length,
    }
  }, [goalsWithMetrics])

  const recentGoalEvents = useMemo(() => {
    const goalMap = new Map(goalsWithMetrics.map((goal) => [String(goal._id), goal] as const))

    return [...goalEvents]
      .sort((left, right) => goalEventTimestamp(right) - goalEventTimestamp(left))
      .slice(0, 16)
      .map((event) => {
        const metadata = parseGoalEventMetadata(event.metadataJson)
        const goal = goalMap.get(String(event.goalId))
        const titleFromMetadata = typeof metadata?.title === 'string' && metadata.title.trim().length > 0 ? metadata.title.trim() : null
        const title = goal?.title ?? titleFromMetadata ?? 'Deleted goal'

        const fundingSourceType =
          metadata && (metadata.fundingSourceType === 'account' || metadata.fundingSourceType === 'card' || metadata.fundingSourceType === 'income')
            ? (metadata.fundingSourceType as GoalFundingSourceType)
            : undefined
        const fundingSourceId = metadata && typeof metadata.fundingSourceId === 'string' ? metadata.fundingSourceId : undefined
        const fundingSourceLabel =
          fundingSourceType && fundingSourceId ? getFundingSourceDisplay(fundingSourceType, fundingSourceId) : undefined

        return {
          event,
          title,
          goal,
          metadata,
          fundingSourceType,
          fundingSourceLabel,
        }
      })
  }, [getFundingSourceDisplay, goalEvents, goalsWithMetrics])

  const annualGoalReview = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const yearStart = new Date(currentYear, 0, 1).getTime()
    const nextYearStart = new Date(currentYear + 1, 0, 1).getTime()
    const yearPrefix = `${currentYear}-`

    const eventsThisYear = goalEvents.filter((event) => {
      const ts = goalEventTimestamp(event)
      return ts >= yearStart && ts < nextYearStart
    })

    const eventsByGoalId = new Map<string, GoalEventEntry[]>()
    eventsThisYear.forEach((event) => {
      const key = String(event.goalId)
      const rows = eventsByGoalId.get(key) ?? []
      rows.push(event)
      eventsByGoalId.set(key, rows)
    })

    const perGoalRows = goalsWithMetrics
      .map((goal) => {
        const goalEventRows = eventsByGoalId.get(String(goal._id)) ?? []
        const contributionTotal = roundCurrency(
          goalEventRows.reduce(
            (sum, event) => sum + (event.eventType === 'contribution' ? (typeof event.amountDelta === 'number' ? event.amountDelta : 0) : 0),
            0,
          ),
        )
        const netAmountDelta = roundCurrency(
          goalEventRows.reduce((sum, event) => sum + (typeof event.amountDelta === 'number' ? event.amountDelta : 0), 0),
        )
        const startAmount = roundCurrency(Math.max(goal.currentAmount - netAmountDelta, 0))
        const endAmount = roundCurrency(goal.currentAmount)
        const progressDeltaPercent = roundCurrency(((endAmount - startAmount) / Math.max(goal.targetAmount, 1)) * 100)
        const completedThisYear = endAmount + 0.009 >= goal.targetAmount && startAmount + 0.009 < goal.targetAmount

        return {
          goal,
          startAmount,
          endAmount,
          progressDeltaAmount: roundCurrency(endAmount - startAmount),
          progressDeltaPercent,
          contributionTotal,
          eventCount: goalEventRows.length,
          completedThisYear,
        }
      })
      .sort((left, right) => right.progressDeltaAmount - left.progressDeltaAmount)

    const startFundedTotal = roundCurrency(perGoalRows.reduce((sum, row) => sum + row.startAmount, 0))
    const endFundedTotal = roundCurrency(perGoalRows.reduce((sum, row) => sum + row.endAmount, 0))
    const contributionTotal = roundCurrency(perGoalRows.reduce((sum, row) => sum + row.contributionTotal, 0))
    const progressDeltaTotal = roundCurrency(perGoalRows.reduce((sum, row) => sum + row.progressDeltaAmount, 0))
    const targetTotal = roundCurrency(goalsWithMetrics.reduce((sum, goal) => sum + goal.targetAmount, 0))
    const progressAchievedPercent = targetTotal > 0 ? (progressDeltaTotal / targetTotal) * 100 : 0
    const completedThisYearCount = perGoalRows.filter((row) => row.completedThisYear).length
    const pausedGoals = goalsWithMetrics.filter((goal) => goal.pausedValue).length

    return {
      year: currentYear,
      yearPrefix,
      eventsThisYear,
      startFundedTotal,
      endFundedTotal,
      contributionTotal,
      progressDeltaTotal,
      progressAchievedPercent,
      completedThisYearCount,
      pausedGoals,
      topProgressRows: perGoalRows.slice(0, 5),
    }
  }, [goalEvents, goalsWithMetrics])

  const applyGoalContributionQuickAction = async (goal: GoalWithMetrics, amount: number) => {
    const normalizedAmount = roundCurrency(Math.min(Math.max(amount, 0), goal.remaining))
    if (normalizedAmount <= 0) return
    const primarySource = goal.fundingSourcesValue[0]

    await onRecordGoalContribution({
      goalId: goal._id,
      amount: normalizedAmount,
      source: 'quick_action',
      note: 'Applied from goals tab quick action',
      fundingSourceType: primarySource?.sourceType,
      fundingSourceId: primarySource?.sourceId,
    })
  }

  const applyAllPlannedContributions = async () => {
    if (isApplyingPlannedContributions) return
    const actionable = suggestedContributionRows.filter((entry) => entry.suggestedAmount > 0)
    if (actionable.length === 0) {
      setGoalExecutionMessage('No active goals have a planned contribution to apply.')
      return
    }

    setGoalExecutionMessage(null)
    setIsApplyingPlannedContributions(true)

    let appliedCount = 0
    let appliedAmount = 0

    try {
      for (const entry of actionable) {
        await applyGoalContributionQuickAction(entry.goal, entry.suggestedAmount)
        appliedCount += 1
        appliedAmount += entry.suggestedAmount
      }
      setGoalExecutionMessage(`Applied ${formatMoney(roundCurrency(appliedAmount))} across ${appliedCount} goals.`)
    } catch {
      if (appliedCount > 0) {
        setGoalExecutionMessage(`Applied ${formatMoney(roundCurrency(appliedAmount))} across ${appliedCount} goals before an error.`)
      } else {
        setGoalExecutionMessage('Could not apply planned goal contributions.')
      }
    } finally {
      setIsApplyingPlannedContributions(false)
    }
  }

  const renderFundingMapEditor = <T extends GoalFormState>(
    draft: T,
    setDraft: Dispatch<SetStateAction<T>>,
    prefix: 'goal-form' | 'goal-edit',
  ) => {
    const rows = normalizeFundingRows(draft.fundingSources)

    return (
      <div className="goal-funding-map-editor">
        <div className="goal-funding-map-editor__head">
          <span>Funding source map</span>
          <button type="button" className="btn btn-ghost btn--sm" onClick={() => addFundingRow(setDraft)}>
            Add source
          </button>
        </div>
        <div className="goal-funding-map-editor__rows">
          {rows.map((row, index) => {
            const options = sourceOptionsByType[row.sourceType]
            return (
              <div key={`${prefix}-${index}`} className="goal-funding-map-row">
                <select
                  className="inline-select"
                  aria-label={`Funding source type ${index + 1}`}
                  value={row.sourceType}
                  onChange={(event) =>
                    updateFundingRow(setDraft, index, {
                      sourceType: event.target.value as GoalFundingSourceType,
                      sourceId: '',
                    })
                  }
                >
                  {goalFundingSourceTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  className="inline-select"
                  aria-label={`Funding source ${index + 1}`}
                  value={row.sourceId}
                  onChange={(event) => updateFundingRow(setDraft, index, { sourceId: event.target.value })}
                >
                  <option value="">Select {goalFundingSourceKindLabel(row.sourceType).toLowerCase()}...</option>
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  className="inline-input"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="% (optional)"
                  aria-label={`Funding allocation percent ${index + 1}`}
                  value={row.allocationPercent}
                  onChange={(event) => updateFundingRow(setDraft, index, { allocationPercent: event.target.value })}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn--sm"
                  onClick={() => removeFundingRow(setDraft, index)}
                  disabled={rows.length === 1 && row.sourceId.trim().length === 0 && row.allocationPercent.trim().length === 0}
                >
                  Remove
                </button>
              </div>
            )
          })}
        </div>
        <p className="form-hint">
          Optional % allocation lets you model how this goal is funded across accounts, cards, and income sources.
        </p>
      </div>
    )
  }

  return (
    <section className="editor-grid" aria-label="Goal management">
      <SurfaceCard className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Goals</p>
            <h2>Create goal</h2>
            <p className="panel-value">
              {goalsWithMetrics.length} goal{goalsWithMetrics.length === 1 ? '' : 's'} tracked
            </p>
          </div>
        </header>

        <div className="bulk-summary" aria-label="Goal summary metrics">
          <div>
            <p>Target total</p>
            <strong>{formatMoney(summary.targetTotal)}</strong>
            <small>{formatMoney(summary.remainingTotal)} remaining</small>
          </div>
          <div>
            <p>Funded total</p>
            <strong>{formatMoney(summary.fundedTotal)}</strong>
            <small>{formatPercent(summary.weightedProgress / 100)} funded</small>
          </div>
          <div>
            <p>Planned monthly</p>
            <strong>{formatMoney(summary.plannedMonthlyContributionTotal)}</strong>
            <small>{formatMoney(summary.requiredMonthlyContributionTotal)} required pace</small>
          </div>
        </div>

        <form className="entry-form entry-form--grid" onSubmit={onAddGoal} aria-describedby="goal-form-hint">
          <div className="form-grid">
            <div className="form-field form-field--span2">
              <label htmlFor="goal-title">Goal title</label>
              <input
                id="goal-title"
                value={goalForm.title}
                onChange={(event) => setGoalForm((prev) => ({ ...prev, title: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="goal-type">Goal type</label>
              <select
                id="goal-type"
                value={goalForm.goalType}
                onChange={(event) =>
                  setGoalForm((prev) => ({
                    ...prev,
                    goalType: event.target.value as GoalType,
                  }))
                }
              >
                {goalTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="goal-priority">Priority</label>
              <select
                id="goal-priority"
                value={goalForm.priority}
                onChange={(event) =>
                  setGoalForm((prev) => ({
                    ...prev,
                    priority: event.target.value as GoalPriority,
                  }))
                }
              >
                {goalPriorityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="goal-target">Target amount</label>
              <input
                id="goal-target"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={goalForm.targetAmount}
                onChange={(event) => setGoalForm((prev) => ({ ...prev, targetAmount: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="goal-current">Current amount</label>
              <input
                id="goal-current"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={goalForm.currentAmount}
                onChange={(event) => setGoalForm((prev) => ({ ...prev, currentAmount: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="goal-contribution">Planned contribution</label>
              <input
                id="goal-contribution"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={goalForm.contributionAmount}
                onChange={(event) => setGoalForm((prev) => ({ ...prev, contributionAmount: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="goal-date">Due / target date</label>
              <input
                id="goal-date"
                type="date"
                value={goalForm.targetDate}
                onChange={(event) => setGoalForm((prev) => ({ ...prev, targetDate: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="goal-cadence">Contribution cadence</label>
              <select
                id="goal-cadence"
                value={goalForm.cadence}
                onChange={(event) => setGoalForm((prev) => ({ ...prev, cadence: event.target.value as Cadence }))}
              >
                {cadenceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {goalForm.cadence === 'custom' ? (
              <>
                <div className="form-field">
                  <label htmlFor="goal-custom-interval">Custom interval</label>
                  <input
                    id="goal-custom-interval"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={goalForm.customInterval}
                    onChange={(event) => setGoalForm((prev) => ({ ...prev, customInterval: event.target.value }))}
                    required
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="goal-custom-unit">Custom unit</label>
                  <select
                    id="goal-custom-unit"
                    value={goalForm.customUnit}
                    onChange={(event) =>
                      setGoalForm((prev) => ({ ...prev, customUnit: event.target.value as GoalForm['customUnit'] }))
                    }
                  >
                    {customCadenceUnitOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}

            <div className="form-field form-field--span2">{renderFundingMapEditor(goalForm, setGoalForm, 'goal-form')}</div>
          </div>

          <p id="goal-form-hint" className="form-hint">
            Phase 1 goals include type, contribution schedule, milestone path (25/50/75/100%), and funding source mapping.
          </p>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Save goal
            </button>
          </div>
        </form>
      </SurfaceCard>

      <SurfaceCard className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Goals</p>
            <h2>Current goals</h2>
            <p className="panel-value">
              {summary.completedCount} complete · {summary.overdueCount} overdue
            </p>
          </div>
          <div className="panel-actions">
            <input
              aria-label="Search goals"
              placeholder="Search title, type, priority, status..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              aria-label="Filter goals by priority"
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value as 'all' | GoalPriority)}
            >
              <option value="all">All priorities</option>
              {goalPriorityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter goals by status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as GoalStatusFilter)}
            >
              <option value="all">All statuses</option>
              <option value="on_track">On track</option>
              <option value="at_risk">At risk</option>
              <option value="overdue">Overdue</option>
              <option value="completed">Completed</option>
            </select>
            <select aria-label="Sort goals" value={sortKey} onChange={(event) => setSortKey(event.target.value as GoalSortKey)}>
              <option value="due_asc">Due date (soonest)</option>
              <option value="progress_desc">Progress (high-low)</option>
              <option value="remaining_desc">Remaining (high-low)</option>
              <option value="priority_desc">Priority (high first)</option>
              <option value="title_asc">Title (A-Z)</option>
            </select>
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              onClick={() => {
                setSearch('')
                setPriorityFilter('all')
                setStatusFilter('all')
                setSortKey('due_asc')
              }}
              disabled={!hasFilters}
            >
              Clear
            </button>
          </div>
        </header>

        {goalsWithMetrics.length === 0 ? (
          <p className="empty-state">No goals created yet.</p>
        ) : visibleGoals.length === 0 ? (
          <p className="empty-state">No goals match this filter.</p>
        ) : (
          <>
            <p className="subnote">
              Showing {visibleGoals.length} of {goalsWithMetrics.length} goal{goalsWithMetrics.length === 1 ? '' : 's'} ·
              Planned {formatMoney(summary.plannedMonthlyContributionTotal)} / month across all goals.
            </p>
            <section className="goals-phase2-grid" aria-label="Goals intelligence">
              <SurfaceCard className="goals-phase2-card">
                <div className="goals-phase2-card__head">
                  <div>
                    <p className="panel-kicker">Phase 2</p>
                    <h3>At-risk goals</h3>
                  </div>
                  <PillBadge className={`pill ${atRiskGoals.length > 0 ? 'pill--warning' : 'pill--good'}`}>{atRiskGoals.length} flagged</PillBadge>
                </div>
                <div className="goals-phase2-summary-grid">
                  <SurfaceCard>
                    <p>On track</p>
                    <strong>{openGoals.filter((goal) => goalStatus(goal) === 'on_track').length}</strong>
                    <small>active goals</small>
                  </SurfaceCard>
                  <SurfaceCard>
                    <p>At risk</p>
                    <strong>{atRiskGoals.length}</strong>
                    <small>needs action</small>
                  </SurfaceCard>
                  <SurfaceCard>
                    <p>Avg consistency</p>
                    <strong>
                      {openGoals.length > 0
                        ? `${Math.round(openGoals.reduce((sum, goal) => sum + goal.contributionConsistencyScore, 0) / openGoals.length)}/100`
                        : 'n/a'}
                    </strong>
                    <small>pace-based signal</small>
                  </SurfaceCard>
                </div>
                {atRiskGoals.length === 0 ? (
                  <p className="subnote">No at-risk goals detected. Current contribution pace and timeline look healthy.</p>
                ) : (
                  <ul className="goals-alert-list">
                    {atRiskGoals.slice(0, 4).map((goal) => (
                      <li key={`goal-risk-${goal._id}`}>
                        <div className="goals-alert-list__head">
                          <strong>{goal.title}</strong>
                          <PillBadge className={`pill ${goalStatus(goal) === 'overdue' ? 'pill--critical' : 'pill--warning'}`}>
                            {predictionDeltaLabel(goal.predictedDaysDeltaToTarget)}
                          </PillBadge>
                        </div>
                        <p>
                          {goal.atRiskReasons[0]}
                          {goal.atRiskReasons.length > 1 ? ` · ${goal.atRiskReasons[1]}` : ''}
                        </p>
                        <small>
                          Planned {formatMoney(goal.plannedMonthlyContribution)}/mo vs required {formatMoney(goal.requiredMonthlyContribution)}/mo ·
                          Consistency {goal.contributionConsistencyScore}/100
                        </small>
                      </li>
                    ))}
                  </ul>
                )}
              </SurfaceCard>

              <SurfaceCard className="goals-phase2-card">
                <div className="goals-phase2-card__head">
                  <div>
                    <p className="panel-kicker">Phase 2</p>
                    <h3>Priority optimizer</h3>
                  </div>
                  {optimizerRecommendations[0] ? <PillBadge className="pill pill--good">Top action</PillBadge> : null}
                </div>
                {optimizerRecommendations.length === 0 ? (
                  <p className="subnote">No active goals need optimization right now.</p>
                ) : (
                  <ol className="goals-optimizer-list">
                    {optimizerRecommendations.slice(0, 4).map((entry, index) => (
                      <li key={`goal-optimizer-${entry.goal._id}`}>
                        <div className="goals-optimizer-list__rank">{index + 1}</div>
                        <div className="goals-optimizer-list__body">
                          <div className="goals-optimizer-list__head">
                            <strong>{entry.goal.title}</strong>
                            <PillBadge className={`pill ${index === 0 ? 'pill--good' : 'pill--neutral'}`}>Score {entry.score}</PillBadge>
                          </div>
                          <p>
                            Add {formatMoney(entry.recommendedExtraMonthly)}/mo · {predictionDeltaLabel(entry.goal.predictedDaysDeltaToTarget)}
                          </p>
                          <small>
                            Saves ~{entry.projectedDaysSaved}d on current forecast · {priorityLabel(entry.goal.priority)} ·{' '}
                            {goalTypeLabel(entry.goal.goalTypeValue)}
                          </small>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </SurfaceCard>

              <SurfaceCard className="goals-phase2-card goals-phase2-card--tradeoff">
                <div className="goals-phase2-card__head">
                  <div>
                    <p className="panel-kicker">Phase 2</p>
                    <h3>Trade-off mode</h3>
                  </div>
                  <PillBadge className="pill pill--cadence">Side-by-side</PillBadge>
                </div>

                <div className="goals-tradeoff-controls">
                  <div className="form-field">
                    <label htmlFor="goal-tradeoff-a">Goal A</label>
                    <select
                      id="goal-tradeoff-a"
                      value={resolvedTradeoffGoalAId}
                      onChange={(event) => setTradeoffGoalAId(event.target.value)}
                      disabled={tradeoffCandidates.length === 0}
                    >
                      {tradeoffCandidates.length === 0 ? <option value="">No active goals</option> : null}
                      {tradeoffCandidates.map((goal) => (
                        <option key={`tradeoff-a-${goal._id}`} value={String(goal._id)}>
                          {goal.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-field">
                    <label htmlFor="goal-tradeoff-b">Goal B</label>
                    <select
                      id="goal-tradeoff-b"
                      value={resolvedTradeoffGoalBId}
                      onChange={(event) => setTradeoffGoalBId(event.target.value)}
                      disabled={tradeoffCandidates.length < 2}
                    >
                      {tradeoffCandidates.length < 2 ? <option value="">Need 2 active goals</option> : null}
                      {tradeoffCandidates
                        .filter((goal) => String(goal._id) !== resolvedTradeoffGoalAId)
                        .map((goal) => (
                          <option key={`tradeoff-b-${goal._id}`} value={String(goal._id)}>
                            {goal.title}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="form-field">
                    <label htmlFor="goal-tradeoff-extra">Extra monthly amount</label>
                    <input
                      id="goal-tradeoff-extra"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={tradeoffExtraMonthly}
                      onChange={(event) => setTradeoffExtraMonthly(event.target.value)}
                    />
                  </div>
                </div>

                {!tradeoffGoalA || !tradeoffGoalB ? (
                  <p className="subnote">Create at least two active goals to compare timeline impact.</p>
                ) : tradeoffComparison === null ? (
                  <p className="subnote">Enter a positive extra monthly amount to compare scenarios.</p>
                ) : (
                  <>
                    <div className="goals-tradeoff-grid">
                      <SurfaceCard
                        className={`goals-tradeoff-card ${tradeoffComparison.recommendation === 'A' ? 'goals-tradeoff-card--recommended' : ''}`}
                      >
                        <div className="goals-tradeoff-card__head">
                          <strong>{tradeoffGoalA.title}</strong>
                          {tradeoffComparison.recommendation === 'A' ? <PillBadge className="pill pill--good">Recommended</PillBadge> : null}
                        </div>
                        <p>
                          Baseline {tradeoffComparison.baselineA.predictedCompletionDate ?? 'No prediction'} ·{' '}
                          {predictionDeltaLabel(tradeoffComparison.baselineA.predictedDaysDeltaToTarget)}
                        </p>
                        <p>
                          With +{formatMoney(parsedTradeoffExtraMonthly)}/mo {tradeoffComparison.boostA.predictedCompletionDate ?? 'No prediction'} ·{' '}
                          {predictionDeltaLabel(tradeoffComparison.boostA.predictedDaysDeltaToTarget)}
                        </p>
                        <small>
                          Saves {tradeoffComparison.aDaysSaved}d · weighted benefit {tradeoffComparison.weightedBenefitA}
                        </small>
                      </SurfaceCard>

                      <SurfaceCard
                        className={`goals-tradeoff-card ${tradeoffComparison.recommendation === 'B' ? 'goals-tradeoff-card--recommended' : ''}`}
                      >
                        <div className="goals-tradeoff-card__head">
                          <strong>{tradeoffGoalB.title}</strong>
                          {tradeoffComparison.recommendation === 'B' ? <PillBadge className="pill pill--good">Recommended</PillBadge> : null}
                        </div>
                        <p>
                          Baseline {tradeoffComparison.baselineB.predictedCompletionDate ?? 'No prediction'} ·{' '}
                          {predictionDeltaLabel(tradeoffComparison.baselineB.predictedDaysDeltaToTarget)}
                        </p>
                        <p>
                          With +{formatMoney(parsedTradeoffExtraMonthly)}/mo {tradeoffComparison.boostB.predictedCompletionDate ?? 'No prediction'} ·{' '}
                          {predictionDeltaLabel(tradeoffComparison.boostB.predictedDaysDeltaToTarget)}
                        </p>
                        <small>
                          Saves {tradeoffComparison.bDaysSaved}d · weighted benefit {tradeoffComparison.weightedBenefitB}
                        </small>
                      </SurfaceCard>
                    </div>
                    <p className="subnote">
                      Recommendation weights time saved by goal priority so you can see which extra payment improves the plan most.
                    </p>
                  </>
                )}
	              </SurfaceCard>
	            </section>
	            <section className="goals-phase3-grid" aria-label="Goals execution and reporting">
	              <SurfaceCard className="goals-phase2-card">
	                <div className="goals-phase2-card__head">
	                  <div>
	                    <p className="panel-kicker">Phase 3</p>
	                    <h3>Contribution actions</h3>
	                  </div>
	                  <button
	                    type="button"
	                    className="btn btn-primary btn--sm"
	                    onClick={() => void applyAllPlannedContributions()}
	                    disabled={isApplyingPlannedContributions || suggestedContributionRows.length === 0}
	                  >
	                    {isApplyingPlannedContributions ? 'Applying…' : 'Apply planned to month'}
	                  </button>
	                </div>
	                <div className="goals-phase2-summary-grid">
	                  <SurfaceCard>
	                    <p>Actionable goals</p>
	                    <strong>{suggestedContributionRows.length}</strong>
	                    <small>active + unpaused</small>
	                  </SurfaceCard>
	                  <SurfaceCard>
	                    <p>Suggested total</p>
	                    <strong>
	                      {formatMoney(suggestedContributionRows.reduce((sum, row) => sum + row.suggestedAmount, 0))}
	                    </strong>
	                    <small>planned contributions</small>
	                  </SurfaceCard>
	                  <SurfaceCard>
	                    <p>Top priority</p>
	                    <strong>{suggestedContributionRows[0]?.goal.title ?? 'n/a'}</strong>
	                    <small>{suggestedContributionRows[0] ? formatMoney(suggestedContributionRows[0].suggestedAmount) : 'No suggestions'}</small>
	                  </SurfaceCard>
	                </div>
	                {goalExecutionMessage ? <p className="subnote">{goalExecutionMessage}</p> : null}
	                {suggestedContributionRows.length === 0 ? (
	                  <p className="subnote">No contribution suggestions yet. Add planned contribution amounts to active goals.</p>
	                ) : (
	                  <ul className="goals-action-list">
	                    {suggestedContributionRows.slice(0, 5).map((entry) => (
	                      <li key={`goal-apply-${entry.goal._id}`}>
	                        <div>
	                          <strong>{entry.goal.title}</strong>
	                          <p>
	                            Apply {formatMoney(entry.suggestedAmount)} · {entry.primaryFundingSource ? `${goalFundingSourceKindLabel(entry.primaryFundingSource.sourceType)}: ${getFundingSourceDisplay(entry.primaryFundingSource.sourceType, entry.primaryFundingSource.sourceId)}` : 'No funding source mapped'}
	                          </p>
	                          <small>
	                            {predictionDeltaLabel(entry.goal.predictedDaysDeltaToTarget)} · health {entry.goal.goalHealthScore}/100
	                          </small>
	                        </div>
	                        <button
	                          type="button"
	                          className="btn btn-secondary btn--sm"
	                          onClick={() => void applyGoalContributionQuickAction(entry.goal, entry.suggestedAmount)}
	                          disabled={busyGoalContributionId === entry.goal._id || isApplyingPlannedContributions}
	                        >
	                          {busyGoalContributionId === entry.goal._id ? 'Applying…' : 'Apply'}
	                        </button>
	                      </li>
	                    ))}
	                  </ul>
	                )}
	              </SurfaceCard>

	              <SurfaceCard className="goals-phase2-card">
	                <div className="goals-phase2-card__head">
	                  <div>
	                    <p className="panel-kicker">Phase 3</p>
	                    <h3>Goal health score</h3>
	                  </div>
	                  <PillBadge className={goalHealthPortfolio.avgHealth === null ? 'pill pill--neutral' : goalHealthPill(goalHealthPortfolio.avgHealth)}>
	                    {goalHealthPortfolio.avgHealth === null ? 'No active goals' : `Avg ${goalHealthPortfolio.avgHealth}/100`}
	                  </PillBadge>
	                </div>
	                <div className="goals-phase2-summary-grid">
	                  <SurfaceCard>
	                    <p>Healthy</p>
	                    <strong>{goalHealthPortfolio.healthyCount}</strong>
	                    <small>80-100 score</small>
	                  </SurfaceCard>
	                  <SurfaceCard>
	                    <p>Watch</p>
	                    <strong>{goalHealthPortfolio.warningCount}</strong>
	                    <small>55-79 score</small>
	                  </SurfaceCard>
	                  <SurfaceCard>
	                    <p>Critical</p>
	                    <strong>{goalHealthPortfolio.criticalCount}</strong>
	                    <small>&lt;55 score</small>
	                  </SurfaceCard>
	                </div>
	                <div className="goals-phase2-summary-grid">
	                  <SurfaceCard>
	                    <p>Paused</p>
	                    <strong>{goalHealthPortfolio.pausedCount}</strong>
	                    <small>active goals paused</small>
	                  </SurfaceCard>
	                  <SurfaceCard>
	                    <p>At-risk</p>
	                    <strong>{atRiskGoals.length}</strong>
	                    <small>forecast/risk flags</small>
	                  </SurfaceCard>
	                  <SurfaceCard>
	                    <p>Completed</p>
	                    <strong>{summary.completedCount}</strong>
	                    <small>{goalsWithMetrics.length} total goals</small>
	                  </SurfaceCard>
	                </div>
	                {openGoals.length === 0 ? (
	                  <p className="subnote">No active goals. Create a goal to start health scoring and pacing checks.</p>
	                ) : (
	                  <ul className="goals-alert-list">
	                    {openGoals
	                      .slice()
	                      .sort((left, right) => left.goalHealthScore - right.goalHealthScore)
	                      .slice(0, 3)
	                      .map((goal) => (
	                        <li key={`goal-health-${goal._id}`}>
	                          <div className="goals-alert-list__head">
	                            <strong>{goal.title}</strong>
	                            <PillBadge className={goalHealthPill(goal.goalHealthScore)}>{goal.goalHealthScore}/100</PillBadge>
	                          </div>
	                          <p>
	                            {goal.atRiskReasons[0] ?? 'On track with current contribution pace'}
	                          </p>
	                          <small>
	                            Pace {Math.round(goal.paceCoverageRatio * 100)}% · Consistency {goal.contributionConsistencyScore}/100
	                          </small>
	                        </li>
	                      ))}
	                  </ul>
	                )}
	              </SurfaceCard>

	              <SurfaceCard className="goals-phase2-card">
	                <div className="goals-phase2-card__head">
	                  <div>
	                    <p className="panel-kicker">Phase 3</p>
	                    <h3>Annual review snapshot</h3>
	                  </div>
	                  <PillBadge className="pill pill--neutral">{annualGoalReview.year}</PillBadge>
	                </div>
	                <div className="goals-phase2-summary-grid">
	                  <SurfaceCard>
	                    <p>Start funded</p>
	                    <strong>{formatMoney(annualGoalReview.startFundedTotal)}</strong>
	                    <small>estimated opening balance</small>
	                  </SurfaceCard>
	                  <SurfaceCard>
	                    <p>End funded</p>
	                    <strong>{formatMoney(annualGoalReview.endFundedTotal)}</strong>
	                    <small>current active goal funding</small>
	                  </SurfaceCard>
	                  <SurfaceCard>
	                    <p>Progress achieved</p>
	                    <strong>{formatPercent(annualGoalReview.progressAchievedPercent / 100)}</strong>
	                    <small>of total goal targets</small>
	                  </SurfaceCard>
	                </div>
	                <div className="goals-phase2-summary-grid">
	                  <SurfaceCard>
	                    <p>Contributions</p>
	                    <strong>{formatMoney(annualGoalReview.contributionTotal)}</strong>
	                    <small>{annualGoalReview.eventsThisYear.filter((event) => event.eventType === 'contribution').length} events</small>
	                  </SurfaceCard>
	                  <SurfaceCard>
	                    <p>Completed this year</p>
	                    <strong>{annualGoalReview.completedThisYearCount}</strong>
	                    <small>crossed 100% this year</small>
	                  </SurfaceCard>
	                  <SurfaceCard>
	                    <p>Events tracked</p>
	                    <strong>{annualGoalReview.eventsThisYear.length}</strong>
	                    <small>edits + progress + pause history</small>
	                  </SurfaceCard>
	                </div>
	                {annualGoalReview.topProgressRows.length === 0 ? (
	                  <p className="subnote">No goal movement recorded for {annualGoalReview.year} yet.</p>
	                ) : (
	                  <ul className="goals-optimizer-list">
	                    {annualGoalReview.topProgressRows.slice(0, 4).map((row, index) => (
	                      <li key={`goal-annual-${row.goal._id}`}>
	                        <div className="goals-optimizer-list__rank">{index + 1}</div>
	                        <div className="goals-optimizer-list__body">
	                          <div className="goals-optimizer-list__head">
	                            <strong>{row.goal.title}</strong>
	                            <PillBadge className={goalHealthPill(row.goal.goalHealthScore)}>{row.goal.goalHealthScore}/100</PillBadge>
	                          </div>
	                          <p>
	                            {formatMoney(row.startAmount)} → {formatMoney(row.endAmount)} ({formatMoney(row.progressDeltaAmount)})
	                          </p>
	                          <small>
	                            Contributions {formatMoney(row.contributionTotal)} · {row.eventCount} events
	                            {row.completedThisYear ? ' · completed this year' : ''}
	                          </small>
	                        </div>
	                      </li>
	                    ))}
	                  </ul>
	                )}
	              </SurfaceCard>

	              <SurfaceCard className="goals-phase2-card goals-phase3-card--wide">
	                <div className="goals-phase2-card__head">
	                  <div>
	                    <p className="panel-kicker">Phase 3</p>
	                    <h3>Goal event history</h3>
	                  </div>
	                  <PillBadge className="pill pill--neutral">{goalEvents.length} total events</PillBadge>
	                </div>
	                {recentGoalEvents.length === 0 ? (
	                  <p className="subnote">No goal events yet. Contributions, edits, pauses, and target changes will appear here.</p>
	                ) : (
	                  <div className="table-wrap table-wrap--soft">
	                    <DataTable className="data-table">
	                      <thead>
	                        <tr>
	                          <th scope="col">When</th>
	                          <th scope="col">Goal</th>
	                          <th scope="col">Event</th>
	                          <th scope="col">Change</th>
	                          <th scope="col">Source</th>
	                          <th scope="col">Detail</th>
	                        </tr>
	                      </thead>
	                      <tbody>
	                        {recentGoalEvents.map((row) => (
	                          <tr key={`goal-event-${row.event._id}`}>
	                            <td>{dateLabel.format(new Date(goalEventTimestamp(row.event)))}</td>
	                            <td>{row.title}</td>
	                            <td>
	                              <PillBadge className={goalEventTypePill(row.event.eventType)}>{goalEventTypeLabel(row.event.eventType)}</PillBadge>
	                            </td>
	                            <td className={typeof row.event.amountDelta === 'number' && row.event.amountDelta >= 0 ? 'amount-positive' : undefined}>
	                              {typeof row.event.amountDelta === 'number'
	                                ? `${row.event.amountDelta >= 0 ? '+' : ''}${formatMoney(row.event.amountDelta)}`
	                                : row.event.afterCurrentAmount !== undefined && row.event.beforeCurrentAmount !== undefined
	                                  ? `${formatMoney(row.event.beforeCurrentAmount)} → ${formatMoney(row.event.afterCurrentAmount)}`
	                                  : '-'}
	                            </td>
	                            <td>{goalEventSourceLabel(row.event.source)}</td>
	                            <td>
	                              {row.fundingSourceType && row.fundingSourceLabel
	                                ? `${goalFundingSourceKindLabel(row.fundingSourceType)}: ${row.fundingSourceLabel}`
	                                : row.event.note?.trim() || '-'}
	                            </td>
	                          </tr>
	                        ))}
	                      </tbody>
	                    </DataTable>
	                  </div>
	                )}
	              </SurfaceCard>
	            </section>
	            <div className="table-wrap table-wrap--card">
              <DataTable className="data-table data-table--wide" data-testid="goals-table">
                <caption className="sr-only">Goals</caption>
                <thead>
                  <tr>
                    <th scope="col">Goal</th>
                    <th scope="col">Target</th>
                    <th scope="col">Current</th>
                    <th scope="col">Remaining</th>
                    <th scope="col">Schedule</th>
                    <th scope="col">Priority</th>
                    <th scope="col">Status</th>
                    <th scope="col">Progress path</th>
                    <th scope="col">Funding map</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
	                  {visibleGoals.map((goal) => {
	                    const isEditing = goalEditId === goal._id
	                    const status = goalStatus(goal)
	                    const progressWidth = `${Math.max(0, Math.min(goal.progressPercent, 100)).toFixed(1)}%`
	                    const progressStyle = { '--bar-width': progressWidth } as CSSProperties
	                    const fundingSources = goal.fundingSourcesValue
	                    const editFundingRows = normalizeFundingRows(goalEditDraft.fundingSources)
	                    const quickContributionAmount = roundCurrency(
	                      Math.min(
	                        goal.remaining,
	                        Math.max(
	                          goal.plannedMonthlyContribution > 0
	                            ? goal.plannedMonthlyContribution
	                            : goal.requiredMonthlyContribution > 0
	                              ? goal.requiredMonthlyContribution
	                              : 0,
	                          0,
	                        ),
	                      ),
	                    )
	                    const hasQuickContribution = !isEditing && !goal.pausedValue && goal.remaining > 0 && quickContributionAmount > 0
	                    const primaryFundingSource = fundingSources[0]

	                    return (
                      <tr key={goal._id} className={isEditing ? 'table-row--editing' : undefined}>
                        <td>
                          {isEditing ? (
                            <div className="cell-stack">
                              <input
                                className="inline-input"
                                value={goalEditDraft.title}
                                onChange={(event) =>
                                  setGoalEditDraft((prev) => ({
                                    ...prev,
                                    title: event.target.value,
                                  }))
                                }
                              />
                              <select
                                className="inline-select"
                                value={goalEditDraft.goalType}
                                onChange={(event) =>
                                  setGoalEditDraft((prev) => ({
                                    ...prev,
                                    goalType: event.target.value as GoalType,
                                  }))
                                }
                              >
                                {goalTypeOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div className="cell-stack">
                              <strong>{goal.title}</strong>
                              <PillBadge className={goalTypePill(goal.goalTypeValue)}>{goalTypeLabel(goal.goalTypeValue)}</PillBadge>
                              <small title={formatShortDate(goal.targetDate, dateLabel)}>
                                Due {goal.targetDate} · {daysLeftLabel(goal.daysLeft)}
                              </small>
                            </div>
                          )}
                        </td>
                        <td className="table-amount">
                          {isEditing ? (
                            <input
                              className="inline-input"
                              type="number"
                              inputMode="decimal"
                              min="0.01"
                              step="0.01"
                              value={goalEditDraft.targetAmount}
                              onChange={(event) =>
                                setGoalEditDraft((prev) => ({
                                  ...prev,
                                  targetAmount: event.target.value,
                                }))
                              }
                            />
                          ) : (
                            formatMoney(goal.targetAmount)
                          )}
                        </td>
                        <td className="table-amount amount-positive">
                          {isEditing ? (
                            <input
                              className="inline-input"
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              value={goalEditDraft.currentAmount}
                              onChange={(event) =>
                                setGoalEditDraft((prev) => ({
                                  ...prev,
                                  currentAmount: event.target.value,
                                }))
                              }
                            />
                          ) : (
                            formatMoney(goal.currentAmount)
                          )}
                        </td>
                        <td className="table-amount amount-negative">{formatMoney(goal.remaining)}</td>
                        <td>
                          {isEditing ? (
                            <div className="goal-inline-editor">
                              <input
                                className="inline-input"
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                placeholder="Contribution"
                                value={goalEditDraft.contributionAmount}
                                onChange={(event) =>
                                  setGoalEditDraft((prev) => ({
                                    ...prev,
                                    contributionAmount: event.target.value,
                                  }))
                                }
                              />
                              <select
                                className="inline-select"
                                value={goalEditDraft.cadence}
                                onChange={(event) =>
                                  setGoalEditDraft((prev) => ({
                                    ...prev,
                                    cadence: event.target.value as Cadence,
                                  }))
                                }
                              >
                                {cadenceOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              {goalEditDraft.cadence === 'custom' ? (
                                <>
                                  <input
                                    className="inline-input"
                                    type="number"
                                    inputMode="numeric"
                                    min="1"
                                    step="1"
                                    placeholder="Interval"
                                    value={goalEditDraft.customInterval}
                                    onChange={(event) =>
                                      setGoalEditDraft((prev) => ({
                                        ...prev,
                                        customInterval: event.target.value,
                                      }))
                                    }
                                  />
                                  <select
                                    className="inline-select"
                                    value={goalEditDraft.customUnit}
                                    onChange={(event) =>
                                      setGoalEditDraft((prev) => ({
                                        ...prev,
                                        customUnit: event.target.value as GoalEditDraft['customUnit'],
                                      }))
                                    }
                                  >
                                    {customCadenceUnitOptions.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </>
                              ) : null}
                              <input
                                className="inline-input"
                                type="date"
                                value={goalEditDraft.targetDate}
                                onChange={(event) =>
                                  setGoalEditDraft((prev) => ({
                                    ...prev,
                                    targetDate: event.target.value,
                                  }))
                                }
                              />
                            </div>
                          ) : (
                            <div className="cell-stack">
                              <strong>{formatMoney(goal.contributionAmountValue)}</strong>
                              <PillBadge className="pill pill--cadence">
                                {cadenceLabel(goal.cadenceValue, goal.customIntervalValue, goal.customUnitValue)}
                              </PillBadge>
                              <small>{formatMoney(goal.plannedMonthlyContribution)} / mo planned</small>
                              <small>
                                {formatMoney(goal.requiredMonthlyContribution)} / mo required pace
                              </small>
                              <small>
                                Predict {goal.predictedCompletionDate ?? 'n/a'} · {predictionDeltaLabel(goal.predictedDaysDeltaToTarget)}
                              </small>
                            </div>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <select
                              className="inline-select"
                              value={goalEditDraft.priority}
                              onChange={(event) =>
                                setGoalEditDraft((prev) => ({
                                  ...prev,
                                  priority: event.target.value as GoalPriority,
                                }))
                              }
                            >
                              {goalPriorityOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <PillBadge className={priorityPill(goal.priority)}>{priorityLabel(goal.priority)}</PillBadge>
                          )}
                        </td>
	                        <td>
	                          <div className="cell-stack">
	                            <PillBadge className={goalStatusPill(status)}>{status.replace('_', ' ')}</PillBadge>
	                            <PillBadge className={goalHealthPill(goal.goalHealthScore)}>Health {goal.goalHealthScore}/100</PillBadge>
	                            <small>Pace {Math.round(goal.paceCoverageRatio * 100)}%</small>
	                            <small>Consistency {goal.contributionConsistencyScore}/100</small>
	                            {goal.pausedValue ? (
	                              <small>
	                                Paused
	                                {goal.pauseReasonValue ? ` · ${goal.pauseReasonValue}` : ''}
	                              </small>
	                            ) : null}
	                          </div>
	                        </td>
                        <td>
                          {isEditing ? (
                            <div className="cell-stack">
                              <small>Milestones update after save from target date + progress path.</small>
                              <div className="goal-milestone-grid">
                                {[25, 50, 75, 100].map((percent) => (
                                  <span key={percent} className="goal-milestone-pill">
                                    {percent}%
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="cell-stack">
                              <div className="goal-preview-row">
                                <strong>{formatPercent(goal.progressPercent / 100)}</strong>
                              </div>
                              <span className="bar-track" aria-hidden="true">
                                <span className="bar-fill" style={progressStyle} />
                              </span>
                              <div className="goal-milestone-grid" aria-label="Goal milestones">
                                {goal.milestones.map((milestone) => (
                                  <span
                                    key={`${goal._id}-${milestone.percent}`}
                                    className={`goal-milestone-pill ${milestone.achieved ? 'goal-milestone-pill--done' : ''}`}
                                    title={`${milestone.label} target: ${formatShortDate(milestone.targetDate, dateLabel)}`}
                                  >
                                    {milestone.label} · {milestone.targetDate.slice(5)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <div className="goal-funding-cell-editor">
                              {editFundingRows.map((row, index) => {
                                const options = sourceOptionsByType[row.sourceType]
                                return (
                                  <div key={`edit-${goal._id}-${index}`} className="goal-funding-map-row">
                                    <select
                                      className="inline-select"
                                      value={row.sourceType}
                                      onChange={(event) =>
                                        updateFundingRow(setGoalEditDraft, index, {
                                          sourceType: event.target.value as GoalFundingSourceType,
                                          sourceId: '',
                                        })
                                      }
                                    >
                                      {goalFundingSourceTypeOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                    <select
                                      className="inline-select"
                                      value={row.sourceId}
                                      onChange={(event) => updateFundingRow(setGoalEditDraft, index, { sourceId: event.target.value })}
                                    >
                                      <option value="">Select...</option>
                                      {options.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                    <input
                                      className="inline-input"
                                      type="number"
                                      inputMode="decimal"
                                      min="0"
                                      max="100"
                                      step="0.01"
                                      placeholder="%"
                                      value={row.allocationPercent}
                                      onChange={(event) =>
                                        updateFundingRow(setGoalEditDraft, index, { allocationPercent: event.target.value })
                                      }
                                    />
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn--sm"
                                      onClick={() => removeFundingRow(setGoalEditDraft, index)}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                )
                              })}
                              <button type="button" className="btn btn-ghost btn--sm" onClick={() => addFundingRow(setGoalEditDraft)}>
                                Add source
                              </button>
                            </div>
                          ) : fundingSources.length === 0 ? (
                            <span className="cell-truncate">No sources mapped</span>
                          ) : (
                            <div className="cell-stack">
                              {fundingSources.map((entry, index) => (
                                <span key={`${goal._id}-${entry.sourceType}-${entry.sourceId}-${index}`} className="pill pill--neutral">
                                  {goalFundingSourceKindLabel(entry.sourceType)}: {getFundingSourceDisplay(entry.sourceType, entry.sourceId)}
                                  {entry.allocationPercent !== undefined ? ` · ${entry.allocationPercent}%` : ''}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
	                        <td>
	                          <div className="row-actions row-actions--goals">
	                            {isEditing ? (
	                              <>
	                                <button type="button" className="btn btn-secondary btn--sm" onClick={() => void saveGoalEdit()}>
                                  Save
                                </button>
                                <button type="button" className="btn btn-ghost btn--sm" onClick={() => setGoalEditId(null)}>
                                  Cancel
                                </button>
                              </>
	                            ) : (
	                              <button type="button" className="btn btn-secondary btn--sm" onClick={() => startGoalEdit(goal)}>
	                                Edit
	                              </button>
	                            )}
	                            {!isEditing ? (
	                              <button
	                                type="button"
	                                className="btn btn-primary btn--sm"
	                                onClick={() =>
	                                  void applyGoalContributionQuickAction(goal, quickContributionAmount)
	                                }
	                                disabled={!hasQuickContribution || busyGoalContributionId === goal._id}
	                                title={
	                                  hasQuickContribution
	                                    ? `Apply ${formatMoney(quickContributionAmount)}${primaryFundingSource ? ` from ${goalFundingSourceKindLabel(primaryFundingSource.sourceType)} ${getFundingSourceDisplay(primaryFundingSource.sourceType, primaryFundingSource.sourceId)}` : ''}`
	                                    : goal.pausedValue
	                                      ? 'Goal is paused'
	                                      : 'No planned contribution available'
	                                }
	                              >
	                                {busyGoalContributionId === goal._id ? 'Applying…' : hasQuickContribution ? 'Apply planned' : 'No action'}
	                              </button>
	                            ) : null}
	                            {!isEditing ? (
	                              <button
	                                type="button"
	                                className="btn btn-ghost btn--sm"
	                                onClick={() => void onSetGoalPaused({ goalId: goal._id, paused: !goal.pausedValue })}
	                                disabled={busyGoalPauseId === goal._id}
	                              >
	                                {busyGoalPauseId === goal._id ? 'Saving…' : goal.pausedValue ? 'Resume' : 'Pause'}
	                              </button>
	                            ) : null}
	                            <button type="button" className="btn btn-ghost btn--sm" onClick={() => void onDeleteGoal(goal._id)}>
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
    </section>
  )
}
