import type { CustomCadenceUnit, LoanEntry, LoanEventEntry, LoanMinimumPaymentType, Cadence } from '../components/financeTypes'

export type LoanProjectionHorizon = 12 | 24 | 36

export type LoanProjectionRow = {
  monthIndex: number
  openingPrincipal: number
  openingInterest: number
  openingSubscription: number
  openingOutstanding: number
  interestAccrued: number
  minimumDue: number
  plannedLoanPayment: number
  paymentToInterest: number
  paymentToPrincipal: number
  subscriptionDue: number
  totalPayment: number
  endingPrincipal: number
  endingInterest: number
  endingSubscription: number
  endingLoanBalance: number
  endingOutstanding: number
  paymentConsistencyRatio: number
}

export type LoanProjectionSummary = {
  months: LoanProjectionHorizon
  endingOutstanding: number
  totalInterest: number
  totalPrincipalPaid: number
  totalLoanPayment: number
  totalSubscriptionPaid: number
  totalPayment: number
}

export type LoanProjectionModel = {
  loanId: string
  name: string
  apr: number
  cadence: Cadence
  customInterval?: number
  customUnit?: CustomCadenceUnit
  dueDay: number
  subscriptionCost: number
  subscriptionPaymentsRemaining: number
  currentPrincipal: number
  currentInterest: number
  currentLoanBalance: number
  currentSubscriptionOutstanding: number
  currentOutstanding: number
  projectedNextMonthInterest: number
  projectedAnnualInterest: number
  projected24MonthInterest: number
  projected36MonthInterest: number
  projectedPayoffMonths: number | null
  projectedPayoffDate: string | null
  paymentConsistencyScore: number
  paymentConsistencyTrend: Array<{
    monthKey: string
    paid: number
    expected: number
    ratio: number
  }>
  rows: LoanProjectionRow[]
  horizons: Record<LoanProjectionHorizon, LoanProjectionSummary>
}

export type LoanPortfolioProjection = {
  totalOutstanding: number
  projectedNextMonthInterest: number
  projectedAnnualInterest: number
  projected24MonthInterest: number
  projected36MonthInterest: number
  projectedAnnualPayments: number
  averagePaymentConsistencyScore: number
  models: LoanProjectionModel[]
}

export type LoanStrategyCandidate = {
  loanId: string
  name: string
  balance: number
  apr: number
  nextMonthInterest: number
  annualInterest: number
  annualInterestSavings: number
}

export type LoanStrategyResult = {
  monthlyOverpayBudget: number
  portfolioAnnualInterestBaseline: number
  portfolioAnnualInterestWithAvalanche: number
  portfolioAnnualInterestWithSnowball: number
  recommendedMode: 'avalanche' | 'snowball'
  recommendedTarget: LoanStrategyCandidate | null
  avalancheTarget: LoanStrategyCandidate | null
  snowballTarget: LoanStrategyCandidate | null
}

export type LoanWhatIfInput = {
  loanId: string | 'all'
  extraPaymentDelta: number
  aprDelta: number
  subscriptionDelta: number
  dueDayShift: number
}

export type LoanWhatIfResult = {
  input: LoanWhatIfInput
  baseline: LoanPortfolioProjection
  scenario: LoanPortfolioProjection
  delta: {
    nextMonthInterest: number
    annualInterest: number
    annualPayments: number
    totalOutstanding: number
  }
}

export type LoanRefinanceOffer = {
  apr: number
  fees: number
  termMonths: number
}

export type LoanRefinanceResult = {
  monthlyPayment: number
  totalRefinanceInterest: number
  totalRefinanceCost: number
  totalCurrentCost: number
  totalCostDelta: number
  breakEvenMonth: number | null
  remainingCurrentOutstandingAtTerm: number
}

type LoanProjectionOverrides = {
  extraPaymentDelta?: number
  aprDelta?: number
  subscriptionDelta?: number
  dueDayShift?: number
}

const roundCurrency = (value: number) => Math.round(value * 100) / 100
const clampPercent = (value: number) => Math.min(Math.max(value, 0), 100)
const clampDay = (value: number) => Math.min(Math.max(Math.trunc(value), 1), 31)
const finiteOrZero = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

const normalizePositiveInteger = (value: number | undefined | null) =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined

const normalizeMinimumPaymentType = (
  value: LoanMinimumPaymentType | undefined | null,
): LoanMinimumPaymentType => (value === 'percent_plus_interest' ? 'percent_plus_interest' : 'fixed')

const addMonthsKeepingDay = (date: Date, months: number, dayOfMonth: number) => {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1)
  const daysInMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  return new Date(target.getFullYear(), target.getMonth(), Math.min(dayOfMonth, daysInMonth))
}

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

const monthKeyOffset = (offset: number, anchor = new Date()) => {
  const date = new Date(anchor.getFullYear(), anchor.getMonth() + offset, 1)
  return monthKey(date)
}

const toMonthlyOccurrences = (
  cadence: Cadence,
  customInterval?: number,
  customUnit?: CustomCadenceUnit,
): number => {
  switch (cadence) {
    case 'weekly':
      return 52 / 12
    case 'biweekly':
      return 26 / 12
    case 'monthly':
      return 1
    case 'quarterly':
      return 1 / 3
    case 'yearly':
      return 1 / 12
    case 'custom':
      if (!customInterval || !customUnit || customInterval <= 0) {
        return 0
      }
      if (customUnit === 'days') return 365.2425 / (customInterval * 12)
      if (customUnit === 'weeks') return 365.2425 / (customInterval * 7 * 12)
      if (customUnit === 'months') return 1 / customInterval
      return 1 / (customInterval * 12)
    case 'one_time':
    default:
      return 0
  }
}

const resolveLoanBalances = (entry: LoanEntry) => {
  const hasExplicitComponents = entry.principalBalance !== undefined || entry.accruedInterest !== undefined
  const principal = Math.max(hasExplicitComponents ? finiteOrZero(entry.principalBalance) : finiteOrZero(entry.balance), 0)
  const accruedInterest = Math.max(hasExplicitComponents ? finiteOrZero(entry.accruedInterest) : 0, 0)
  const balance = Math.max(hasExplicitComponents ? principal + accruedInterest : finiteOrZero(entry.balance), 0)

  return {
    principal: roundCurrency(principal),
    accruedInterest: roundCurrency(accruedInterest),
    balance: roundCurrency(balance),
  }
}

const resolveSubscriptionOutstanding = (entry: LoanEntry) => {
  const subscriptionCost = roundCurrency(Math.max(finiteOrZero(entry.subscriptionCost), 0))
  if (subscriptionCost <= 0) {
    return 0
  }

  const paymentCount = normalizePositiveInteger(entry.subscriptionPaymentCount)
  if (entry.subscriptionOutstanding !== undefined) {
    const outstanding = roundCurrency(Math.max(finiteOrZero(entry.subscriptionOutstanding), 0))
    if (paymentCount === undefined && outstanding <= subscriptionCost + 0.000001) {
      return roundCurrency(subscriptionCost * 12)
    }
    return outstanding
  }

  return roundCurrency(subscriptionCost * (paymentCount ?? 12))
}

const resolveSubscriptionPaymentsRemaining = (subscriptionCost: number, subscriptionOutstanding: number) => {
  if (subscriptionCost <= 0 || subscriptionOutstanding <= 0) {
    return 0
  }
  return Math.max(1, Math.ceil(subscriptionOutstanding / subscriptionCost - 0.000001))
}

const simulateLoanRows = (
  entry: LoanEntry,
  months: number,
  overrides?: LoanProjectionOverrides,
): {
  rows: LoanProjectionRow[]
  payoffMonth: number | null
  currentOutstanding: number
  currentLoanBalance: number
  currentPrincipal: number
  currentInterest: number
  currentSubscriptionOutstanding: number
  subscriptionCost: number
  subscriptionPaymentsRemaining: number
  apr: number
  dueDay: number
} => {
  const safeMonths = Math.max(Math.trunc(months), 1)
  const working = resolveLoanBalances(entry)
  const override = overrides ?? {}
  const apr = Math.max(finiteOrZero(entry.interestRate) + finiteOrZero(override.aprDelta), 0)
  const monthlyRate = apr > 0 ? apr / 100 / 12 : 0
  const minimumPaymentType = normalizeMinimumPaymentType(entry.minimumPaymentType)
  const minimumPaymentPercent = clampPercent(finiteOrZero(entry.minimumPaymentPercent))
  const monthlyOccurrences = Math.max(toMonthlyOccurrences(entry.cadence, entry.customInterval, entry.customUnit), 1)
  const baseMinimumPayment = Math.max(finiteOrZero(entry.minimumPayment), 0)
  const baseExtraPayment = Math.max(finiteOrZero(entry.extraPayment), 0)
  const extraPayment = Math.max(baseExtraPayment + finiteOrZero(override.extraPaymentDelta), 0)
  const monthlyExtraPayment = extraPayment * monthlyOccurrences
  const monthlyFixedMinimumPayment = baseMinimumPayment * monthlyOccurrences
  const subscriptionCost = Math.max(finiteOrZero(entry.subscriptionCost) + finiteOrZero(override.subscriptionDelta), 0)
  const dueDay = clampDay(entry.dueDay + Math.trunc(finiteOrZero(override.dueDayShift)))

  let principal = working.principal
  let accruedInterest = working.accruedInterest
  let subscriptionOutstanding = resolveSubscriptionOutstanding(entry)
  const currentLoanBalance = roundCurrency(principal + accruedInterest)
  const currentOutstanding = roundCurrency(currentLoanBalance + subscriptionOutstanding)
  const rows: LoanProjectionRow[] = []
  let payoffMonth: number | null = null

  for (let monthIndex = 1; monthIndex <= safeMonths; monthIndex += 1) {
    const openingPrincipal = roundCurrency(Math.max(principal, 0))
    const openingInterest = roundCurrency(Math.max(accruedInterest, 0))
    const openingLoanBalance = roundCurrency(Math.max(openingPrincipal + openingInterest, 0))
    const openingSubscription = roundCurrency(Math.max(subscriptionOutstanding, 0))
    const openingOutstanding = roundCurrency(openingLoanBalance + openingSubscription)

    if (openingOutstanding <= 0.000001) {
      rows.push({
        monthIndex,
        openingPrincipal,
        openingInterest,
        openingSubscription,
        openingOutstanding,
        interestAccrued: 0,
        minimumDue: 0,
        plannedLoanPayment: 0,
        paymentToInterest: 0,
        paymentToPrincipal: 0,
        subscriptionDue: 0,
        totalPayment: 0,
        endingPrincipal: 0,
        endingInterest: 0,
        endingSubscription: 0,
        endingLoanBalance: 0,
        endingOutstanding: 0,
        paymentConsistencyRatio: 1,
      })
      if (payoffMonth === null) {
        payoffMonth = monthIndex
      }
      continue
    }

    const interestAccrued = roundCurrency(openingLoanBalance * monthlyRate)
    accruedInterest = roundCurrency(accruedInterest + interestAccrued)

    const dueBalance = roundCurrency(principal + accruedInterest)
    const minimumDueRaw =
      minimumPaymentType === 'percent_plus_interest'
        ? principal * (minimumPaymentPercent / 100) * monthlyOccurrences + accruedInterest
        : monthlyFixedMinimumPayment
    const minimumDue = roundCurrency(Math.min(dueBalance, Math.max(minimumDueRaw, 0)))
    const plannedLoanPayment = roundCurrency(Math.min(dueBalance, minimumDue + monthlyExtraPayment))

    const paymentToInterest = roundCurrency(Math.min(accruedInterest, plannedLoanPayment))
    accruedInterest = roundCurrency(Math.max(accruedInterest - paymentToInterest, 0))

    const remainingLoanPayment = roundCurrency(plannedLoanPayment - paymentToInterest)
    const paymentToPrincipal = roundCurrency(Math.min(principal, remainingLoanPayment))
    principal = roundCurrency(Math.max(principal - paymentToPrincipal, 0))

    const subscriptionDue = roundCurrency(
      Math.min(subscriptionOutstanding, subscriptionCost > 0 ? subscriptionCost : subscriptionOutstanding),
    )
    subscriptionOutstanding = roundCurrency(Math.max(subscriptionOutstanding - subscriptionDue, 0))

    const endingPrincipal = roundCurrency(Math.max(principal, 0))
    const endingInterest = roundCurrency(Math.max(accruedInterest, 0))
    const endingLoanBalance = roundCurrency(endingPrincipal + endingInterest)
    const endingSubscription = roundCurrency(Math.max(subscriptionOutstanding, 0))
    const endingOutstanding = roundCurrency(endingLoanBalance + endingSubscription)

    const paymentConsistencyRatio = minimumDue > 0 ? plannedLoanPayment / minimumDue : plannedLoanPayment > 0 ? 1 : 1

    rows.push({
      monthIndex,
      openingPrincipal,
      openingInterest,
      openingSubscription,
      openingOutstanding,
      interestAccrued,
      minimumDue,
      plannedLoanPayment,
      paymentToInterest,
      paymentToPrincipal,
      subscriptionDue,
      totalPayment: roundCurrency(plannedLoanPayment + subscriptionDue),
      endingPrincipal,
      endingInterest,
      endingSubscription,
      endingLoanBalance,
      endingOutstanding,
      paymentConsistencyRatio: Number.isFinite(paymentConsistencyRatio) ? paymentConsistencyRatio : 1,
    })

    if (payoffMonth === null && endingOutstanding <= 0.000001) {
      payoffMonth = monthIndex
    }
  }

  return {
    rows,
    payoffMonth,
    currentOutstanding,
    currentLoanBalance,
    currentPrincipal: working.principal,
    currentInterest: working.accruedInterest,
    currentSubscriptionOutstanding: resolveSubscriptionOutstanding(entry),
    subscriptionCost: roundCurrency(subscriptionCost),
    subscriptionPaymentsRemaining: resolveSubscriptionPaymentsRemaining(roundCurrency(subscriptionCost), resolveSubscriptionOutstanding(entry)),
    apr: roundCurrency(apr),
    dueDay,
  }
}

const summariseRows = (rows: LoanProjectionRow[], months: LoanProjectionHorizon): LoanProjectionSummary => {
  const boundedRows = rows.slice(0, months)
  const totals = boundedRows.reduce(
    (acc, row) => {
      acc.totalInterest += row.interestAccrued
      acc.totalPrincipalPaid += row.paymentToPrincipal
      acc.totalLoanPayment += row.plannedLoanPayment
      acc.totalSubscriptionPaid += row.subscriptionDue
      acc.totalPayment += row.totalPayment
      return acc
    },
    {
      totalInterest: 0,
      totalPrincipalPaid: 0,
      totalLoanPayment: 0,
      totalSubscriptionPaid: 0,
      totalPayment: 0,
    },
  )

  const endingOutstanding = boundedRows.length > 0 ? boundedRows[boundedRows.length - 1].endingOutstanding : 0

  return {
    months,
    endingOutstanding: roundCurrency(endingOutstanding),
    totalInterest: roundCurrency(totals.totalInterest),
    totalPrincipalPaid: roundCurrency(totals.totalPrincipalPaid),
    totalLoanPayment: roundCurrency(totals.totalLoanPayment),
    totalSubscriptionPaid: roundCurrency(totals.totalSubscriptionPaid),
    totalPayment: roundCurrency(totals.totalPayment),
  }
}

const buildPaymentConsistencyTrend = (loanId: string, loanEvents: LoanEventEntry[], expectedMonthlyPayment: number) => {
  const eventsByMonth = new Map<string, number>()
  loanEvents
    .filter((event) => String(event.loanId) === loanId && event.eventType === 'payment')
    .forEach((event) => {
      const key = monthKey(new Date(event.createdAt))
      eventsByMonth.set(key, roundCurrency((eventsByMonth.get(key) ?? 0) + Math.max(finiteOrZero(event.amount), 0)))
    })

  const trend = Array.from({ length: 12 }, (_, index) => {
    const key = monthKeyOffset(index - 11)
    const paid = roundCurrency(eventsByMonth.get(key) ?? 0)
    const expected = roundCurrency(Math.max(expectedMonthlyPayment, 0))
    const ratio = expected > 0 ? paid / expected : paid > 0 ? 1 : 1
    return {
      monthKey: key,
      paid,
      expected,
      ratio: Number.isFinite(ratio) ? ratio : 1,
    }
  })

  const score = trend.reduce((sum, point) => sum + Math.min(Math.max(point.ratio, 0), 1.4), 0) / trend.length

  return {
    trend,
    score: roundCurrency(Math.min(Math.max(score * 100, 0), 140)),
  }
}

export const buildLoanProjectionModel = (
  entry: LoanEntry,
  options?: {
    overrides?: LoanProjectionOverrides
    maxMonths?: number
    loanEvents?: LoanEventEntry[]
  },
): LoanProjectionModel => {
  const maxMonths = Math.max(options?.maxMonths ?? 36, 36)
  const simulation = simulateLoanRows(entry, Math.max(maxMonths, 360), options?.overrides)
  const rows = simulation.rows.slice(0, maxMonths)

  const projectedPayoffMonths = simulation.payoffMonth
  const projectedPayoffDate =
    projectedPayoffMonths === null
      ? null
      : addMonthsKeepingDay(new Date(), projectedPayoffMonths, simulation.dueDay).toISOString().slice(0, 10)

  const horizons: Record<LoanProjectionHorizon, LoanProjectionSummary> = {
    12: summariseRows(rows, 12),
    24: summariseRows(rows, 24),
    36: summariseRows(rows, 36),
  }

  const expectedMonthlyPayment = rows[0]?.totalPayment ?? 0
  const consistency = buildPaymentConsistencyTrend(String(entry._id), options?.loanEvents ?? [], expectedMonthlyPayment)

  return {
    loanId: String(entry._id),
    name: entry.name,
    apr: simulation.apr,
    cadence: entry.cadence,
    customInterval: entry.customInterval,
    customUnit: entry.customUnit,
    dueDay: simulation.dueDay,
    subscriptionCost: simulation.subscriptionCost,
    subscriptionPaymentsRemaining: simulation.subscriptionPaymentsRemaining,
    currentPrincipal: simulation.currentPrincipal,
    currentInterest: simulation.currentInterest,
    currentLoanBalance: simulation.currentLoanBalance,
    currentSubscriptionOutstanding: simulation.currentSubscriptionOutstanding,
    currentOutstanding: simulation.currentOutstanding,
    projectedNextMonthInterest: roundCurrency(rows[0]?.interestAccrued ?? 0),
    projectedAnnualInterest: horizons[12].totalInterest,
    projected24MonthInterest: horizons[24].totalInterest,
    projected36MonthInterest: horizons[36].totalInterest,
    projectedPayoffMonths,
    projectedPayoffDate,
    paymentConsistencyScore: consistency.score,
    paymentConsistencyTrend: consistency.trend,
    rows,
    horizons,
  }
}

export const buildLoanPortfolioProjection = (
  loans: LoanEntry[],
  options?: {
    perLoanOverrides?: Partial<Record<string, LoanProjectionOverrides>>
    maxMonths?: number
    loanEvents?: LoanEventEntry[]
  },
): LoanPortfolioProjection => {
  const models = loans.map((loan) =>
    buildLoanProjectionModel(loan, {
      overrides: options?.perLoanOverrides?.[String(loan._id)],
      maxMonths: options?.maxMonths,
      loanEvents: options?.loanEvents,
    }),
  )

  const totalOutstanding = roundCurrency(models.reduce((sum, model) => sum + model.currentOutstanding, 0))
  const projectedNextMonthInterest = roundCurrency(
    models.reduce((sum, model) => sum + model.projectedNextMonthInterest, 0),
  )
  const projectedAnnualInterest = roundCurrency(models.reduce((sum, model) => sum + model.horizons[12].totalInterest, 0))
  const projected24MonthInterest = roundCurrency(models.reduce((sum, model) => sum + model.horizons[24].totalInterest, 0))
  const projected36MonthInterest = roundCurrency(models.reduce((sum, model) => sum + model.horizons[36].totalInterest, 0))
  const projectedAnnualPayments = roundCurrency(models.reduce((sum, model) => sum + model.horizons[12].totalPayment, 0))
  const averagePaymentConsistencyScore =
    models.length > 0
      ? roundCurrency(models.reduce((sum, model) => sum + model.paymentConsistencyScore, 0) / models.length)
      : 100

  return {
    totalOutstanding,
    projectedNextMonthInterest,
    projectedAnnualInterest,
    projected24MonthInterest,
    projected36MonthInterest,
    projectedAnnualPayments,
    averagePaymentConsistencyScore,
    models,
  }
}

const buildStrategyCandidate = (
  model: LoanProjectionModel,
  annualInterestSavings: number,
): LoanStrategyCandidate => ({
  loanId: model.loanId,
  name: model.name,
  balance: model.currentOutstanding,
  apr: model.apr,
  nextMonthInterest: model.projectedNextMonthInterest,
  annualInterest: model.projectedAnnualInterest,
  annualInterestSavings: roundCurrency(Math.max(annualInterestSavings, 0)),
})

const computePortfolioAnnualInterestWithFocusedOverpay = (
  loans: LoanEntry[],
  loanEvents: LoanEventEntry[],
  targetLoanId: string,
  monthlyOverpayBudget: number,
) => {
  const normalizedOverpay = Math.max(monthlyOverpayBudget, 0)
  const projection = buildLoanPortfolioProjection(loans, {
    perLoanOverrides: {
      [targetLoanId]: {
        extraPaymentDelta: normalizedOverpay,
      },
    },
    loanEvents,
  })

  return projection.projectedAnnualInterest
}

export const buildLoanStrategy = (
  loans: LoanEntry[],
  loanEvents: LoanEventEntry[],
  monthlyOverpayBudget: number,
): LoanStrategyResult => {
  const normalizedOverpayBudget = roundCurrency(Math.max(monthlyOverpayBudget, 0))
  const baseline = buildLoanPortfolioProjection(loans, { loanEvents })
  const candidates = baseline.models.filter((model) => model.currentOutstanding > 0.005)

  if (candidates.length === 0) {
    return {
      monthlyOverpayBudget: normalizedOverpayBudget,
      portfolioAnnualInterestBaseline: baseline.projectedAnnualInterest,
      portfolioAnnualInterestWithAvalanche: baseline.projectedAnnualInterest,
      portfolioAnnualInterestWithSnowball: baseline.projectedAnnualInterest,
      recommendedMode: 'avalanche',
      recommendedTarget: null,
      avalancheTarget: null,
      snowballTarget: null,
    }
  }

  const avalancheModel = [...candidates].sort((left, right) => {
    if (right.apr !== left.apr) return right.apr - left.apr
    if (right.projectedAnnualInterest !== left.projectedAnnualInterest) {
      return right.projectedAnnualInterest - left.projectedAnnualInterest
    }
    if (right.currentOutstanding !== left.currentOutstanding) {
      return right.currentOutstanding - left.currentOutstanding
    }
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
  })[0]

  const snowballModel = [...candidates].sort((left, right) => {
    if (left.currentOutstanding !== right.currentOutstanding) {
      return left.currentOutstanding - right.currentOutstanding
    }
    if (right.apr !== left.apr) return right.apr - left.apr
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
  })[0]

  const avalancheAnnualInterest = computePortfolioAnnualInterestWithFocusedOverpay(
    loans,
    loanEvents,
    avalancheModel.loanId,
    normalizedOverpayBudget,
  )
  const snowballAnnualInterest = computePortfolioAnnualInterestWithFocusedOverpay(
    loans,
    loanEvents,
    snowballModel.loanId,
    normalizedOverpayBudget,
  )

  const avalancheSavings = baseline.projectedAnnualInterest - avalancheAnnualInterest
  const snowballSavings = baseline.projectedAnnualInterest - snowballAnnualInterest

  const avalancheTarget = buildStrategyCandidate(avalancheModel, avalancheSavings)
  const snowballTarget = buildStrategyCandidate(snowballModel, snowballSavings)

  const recommendedMode = avalancheTarget.annualInterestSavings >= snowballTarget.annualInterestSavings ? 'avalanche' : 'snowball'

  return {
    monthlyOverpayBudget: normalizedOverpayBudget,
    portfolioAnnualInterestBaseline: baseline.projectedAnnualInterest,
    portfolioAnnualInterestWithAvalanche: roundCurrency(avalancheAnnualInterest),
    portfolioAnnualInterestWithSnowball: roundCurrency(snowballAnnualInterest),
    recommendedMode,
    recommendedTarget: recommendedMode === 'avalanche' ? avalancheTarget : snowballTarget,
    avalancheTarget,
    snowballTarget,
  }
}

const buildScenarioOverrides = (loans: LoanEntry[], input: LoanWhatIfInput): Partial<Record<string, LoanProjectionOverrides>> => {
  const overrides: Partial<Record<string, LoanProjectionOverrides>> = {}

  loans.forEach((loan) => {
    const loanId = String(loan._id)
    const applies = input.loanId === 'all' || input.loanId === loanId
    if (!applies) {
      return
    }

    overrides[loanId] = {
      extraPaymentDelta: input.extraPaymentDelta,
      aprDelta: input.aprDelta,
      subscriptionDelta: input.subscriptionDelta,
      dueDayShift: input.dueDayShift,
    }
  })

  return overrides
}

export const runLoanWhatIf = (
  loans: LoanEntry[],
  loanEvents: LoanEventEntry[],
  input: LoanWhatIfInput,
): LoanWhatIfResult => {
  const baseline = buildLoanPortfolioProjection(loans, { loanEvents })
  const scenario = buildLoanPortfolioProjection(loans, {
    loanEvents,
    perLoanOverrides: buildScenarioOverrides(loans, input),
  })

  return {
    input,
    baseline,
    scenario,
    delta: {
      nextMonthInterest: roundCurrency(scenario.projectedNextMonthInterest - baseline.projectedNextMonthInterest),
      annualInterest: roundCurrency(scenario.projectedAnnualInterest - baseline.projectedAnnualInterest),
      annualPayments: roundCurrency(scenario.projectedAnnualPayments - baseline.projectedAnnualPayments),
      totalOutstanding: roundCurrency(scenario.totalOutstanding - baseline.totalOutstanding),
    },
  }
}

const amortizedPayment = (principal: number, apr: number, termMonths: number) => {
  const safePrincipal = Math.max(principal, 0)
  const safeTerm = Math.max(Math.trunc(termMonths), 1)
  const monthlyRate = apr > 0 ? apr / 100 / 12 : 0
  if (monthlyRate <= 0) {
    return safePrincipal / safeTerm
  }

  const denominator = 1 - (1 + monthlyRate) ** -safeTerm
  if (denominator <= 0) {
    return safePrincipal / safeTerm
  }

  return (safePrincipal * monthlyRate) / denominator
}

export const analyzeLoanRefinance = (
  model: LoanProjectionModel,
  offer: LoanRefinanceOffer,
): LoanRefinanceResult => {
  const termMonths = Math.max(Math.trunc(offer.termMonths), 1)
  const offerApr = Math.max(offer.apr, 0)
  const offerFees = Math.max(offer.fees, 0)
  const refinancePrincipal = Math.max(model.currentLoanBalance, 0)
  const monthlyPaymentRaw = amortizedPayment(refinancePrincipal, offerApr, termMonths)
  const monthlyPayment = roundCurrency(monthlyPaymentRaw)
  const monthlyRate = offerApr > 0 ? offerApr / 100 / 12 : 0

  let refinanceBalance = refinancePrincipal
  let refinanceInterestTotal = 0
  let refinanceCostTotal = offerFees

  const baselineRows = model.rows.slice(0, termMonths)
  const baselineSubscriptionCost = baselineRows.reduce((sum, row) => sum + row.subscriptionDue, 0)
  const baselineCostThroughTerm = baselineRows.reduce((sum, row) => sum + row.totalPayment, 0)
  const remainingCurrentOutstandingAtTerm =
    baselineRows.length > 0 ? baselineRows[baselineRows.length - 1].endingOutstanding : model.currentOutstanding

  let cumulativeCurrent = 0
  let cumulativeRefinance = offerFees
  let breakEvenMonth: number | null = null

  for (let month = 1; month <= termMonths; month += 1) {
    const interest = refinanceBalance * monthlyRate
    refinanceInterestTotal += interest
    const due = refinanceBalance + interest
    const payment = Math.min(due, monthlyPaymentRaw)
    refinanceBalance = Math.max(due - payment, 0)
    refinanceCostTotal += payment

    const baselineRow = baselineRows[month - 1]
    const baselineMonthCost = baselineRow ? baselineRow.totalPayment : 0
    const refinanceMonthCost = payment + (baselineRow?.subscriptionDue ?? 0)

    cumulativeCurrent += baselineMonthCost
    cumulativeRefinance += refinanceMonthCost

    if (breakEvenMonth === null && cumulativeRefinance <= cumulativeCurrent + 0.000001) {
      breakEvenMonth = month
    }
  }

  const totalRefinanceCost = roundCurrency(refinanceCostTotal + baselineSubscriptionCost + refinanceBalance)
  const totalCurrentCost = roundCurrency(baselineCostThroughTerm + remainingCurrentOutstandingAtTerm)

  return {
    monthlyPayment,
    totalRefinanceInterest: roundCurrency(refinanceInterestTotal),
    totalRefinanceCost,
    totalCurrentCost,
    totalCostDelta: roundCurrency(totalRefinanceCost - totalCurrentCost),
    breakEvenMonth,
    remainingCurrentOutstandingAtTerm: roundCurrency(remainingCurrentOutstandingAtTerm),
  }
}
