import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { usePaginatedQuery, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type {
  Cadence,
  CadenceOption,
  CustomCadenceUnit,
  CustomCadenceUnitOption,
  LoanEditDraft,
  LoanEntry,
  LoanEventEntry,
  LoanForm,
  LoanId,
  LoanMinimumPaymentType,
} from './financeTypes'
import {
  analyzeLoanRefinance,
  buildLoanPortfolioProjection,
  buildLoanStrategy,
  runLoanWhatIf,
  type LoanProjectionModel,
  type LoanRefinanceOffer,
} from '../lib/loanIntelligence'

type LoanSortKey = 'name_asc' | 'balance_desc' | 'apr_desc' | 'due_asc' | 'interest_desc'
type LoanQuickActionType = 'charge' | 'payment' | 'interest' | 'subscription'

type LoansTabProps = {
  loans: LoanEntry[]
  loanEvents: LoanEventEntry[]
  projectedMonthlyNet: number
  monthlyLoanPayments: number
  monthlyLoanBasePayments: number
  monthlyLoanSubscriptionCosts: number
  totalLoanBalance: number
  loanForm: LoanForm
  setLoanForm: Dispatch<SetStateAction<LoanForm>>
  loanEditId: LoanId | null
  setLoanEditId: Dispatch<SetStateAction<LoanId | null>>
  loanEditDraft: LoanEditDraft
  setLoanEditDraft: Dispatch<SetStateAction<LoanEditDraft>>
  onAddLoan: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onDeleteLoan: (id: LoanId) => Promise<void>
  saveLoanEdit: () => Promise<void>
  startLoanEdit: (entry: LoanEntry) => void
  onQuickAddLoanCharge: (id: LoanId, amount: number, notes?: string) => Promise<void>
  onQuickRecordLoanPayment: (id: LoanId, amount: number, notes?: string) => Promise<void>
  onQuickApplyLoanInterest: (id: LoanId, notes?: string) => Promise<void>
  onQuickApplyLoanSubscription: (id: LoanId, notes?: string) => Promise<void>
  cadenceOptions: CadenceOption[]
  customCadenceUnitOptions: CustomCadenceUnitOption[]
  isCustomCadence: (cadence: Cadence) => boolean
  cadenceLabel: (cadence: Cadence, customInterval?: number, customUnit?: CustomCadenceUnit) => string
  formatMoney: (value: number) => string
}

const roundCurrency = (value: number) => Math.round(value * 100) / 100

const computeDueInDays = (dueDay: number) => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const daysInThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dueThisMonth = new Date(now.getFullYear(), now.getMonth(), Math.min(Math.max(dueDay, 1), daysInThisMonth))

  if (dueThisMonth >= today) {
    return Math.round((dueThisMonth.getTime() - today.getTime()) / 86400000)
  }

  const daysInNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate()
  const dueNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, Math.min(Math.max(dueDay, 1), daysInNextMonth))
  return Math.round((dueNextMonth.getTime() - today.getTime()) / 86400000)
}

const buildSparklinePoints = (values: number[], width = 220, height = 58, pad = 6) => {
  if (values.length === 0) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0

  return values
    .map((value, index) => {
      const x = pad + index * stepX
      const y = height - pad - ((value - min) / range) * (height - pad * 2)
      return `${x},${y}`
    })
    .join(' ')
}

const formatMonthKeyLabel = (value: string, locale = 'en-GB') => {
  const [year, month] = value.split('-').map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return value
  }
  return new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit' }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  )
}

const loanMutationTypeLabel = (mutationType: string) => {
  if (mutationType === 'interest_accrual') return 'Interest accrual'
  if (mutationType === 'subscription_fee') return 'Subscription fee'
  if (mutationType === 'monthly_cycle') return 'Monthly cycle'
  if (mutationType === 'created') return 'Created'
  if (mutationType === 'updated') return 'Updated'
  if (mutationType === 'removed') return 'Removed'
  if (mutationType === 'charge') return 'Charge'
  return 'Payment'
}

export function LoansTab({
  loans,
  loanEvents,
  projectedMonthlyNet,
  monthlyLoanPayments,
  monthlyLoanBasePayments,
  monthlyLoanSubscriptionCosts,
  totalLoanBalance,
  loanForm,
  setLoanForm,
  loanEditId,
  setLoanEditId,
  loanEditDraft,
  setLoanEditDraft,
  onAddLoan,
  onDeleteLoan,
  saveLoanEdit,
  startLoanEdit,
  onQuickAddLoanCharge,
  onQuickRecordLoanPayment,
  onQuickApplyLoanInterest,
  onQuickApplyLoanSubscription,
  cadenceOptions,
  customCadenceUnitOptions,
  isCustomCadence,
  cadenceLabel,
  formatMoney,
}: LoansTabProps) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<LoanSortKey>('name_asc')
  const [quickAction, setQuickAction] = useState<{ loanId: LoanId; type: LoanQuickActionType } | null>(null)
  const [quickAmount, setQuickAmount] = useState('')
  const [quickNotes, setQuickNotes] = useState('')
  const [quickError, setQuickError] = useState<string | null>(null)
  const [strategyOverpayBudget, setStrategyOverpayBudget] = useState(() =>
    String(Math.max(roundCurrency(projectedMonthlyNet > 0 ? projectedMonthlyNet : 0), 0)),
  )
  const [whatIfLoanId, setWhatIfLoanId] = useState<string | 'all'>('all')
  const [whatIfExtraPaymentDelta, setWhatIfExtraPaymentDelta] = useState('0')
  const [whatIfAprDelta, setWhatIfAprDelta] = useState('0')
  const [whatIfSubscriptionDelta, setWhatIfSubscriptionDelta] = useState('0')
  const [whatIfDueDayShift, setWhatIfDueDayShift] = useState('0')
  const [refinanceLoanId, setRefinanceLoanId] = useState('')
  const [refinanceApr, setRefinanceApr] = useState('8.9')
  const [refinanceFees, setRefinanceFees] = useState('0')
  const [refinanceTermMonths, setRefinanceTermMonths] = useState('24')
  const [trendLoanId, setTrendLoanId] = useState('')
  const loanMutationHistory = usePaginatedQuery(
    api.finance.getLoanMutationHistoryPage,
    {},
    { initialNumItems: 18 },
  )
  const loanHistorySummary = useQuery(api.finance.getLoanHistorySummary, { windowDays: 90 })

  const parseNumber = (value: string) => {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  const baselinePortfolio = useMemo(
    () => buildLoanPortfolioProjection(loans, { maxMonths: 36, loanEvents }),
    [loanEvents, loans],
  )

  const modelByLoanId = useMemo(
    () => new Map(baselinePortfolio.models.map((model) => [model.loanId, model])),
    [baselinePortfolio.models],
  )

  const projectionsById = useMemo(() => {
    const map = new Map<LoanId, LoanProjectionModel>()
    loans.forEach((entry) => {
      const model = modelByLoanId.get(String(entry._id))
      if (model) {
        map.set(entry._id, model)
      }
    })
    return map
  }, [loans, modelByLoanId])

  const visibleLoans = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = query
      ? loans.filter((entry) => `${entry.name} ${entry.notes ?? ''}`.toLowerCase().includes(query))
      : loans.slice()

    const sorted = [...filtered].sort((left, right) => {
      const leftProjection = projectionsById.get(left._id)
      const rightProjection = projectionsById.get(right._id)

      switch (sortKey) {
        case 'name_asc':
          return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
        case 'balance_desc':
          return (rightProjection?.currentOutstanding ?? 0) - (leftProjection?.currentOutstanding ?? 0)
        case 'apr_desc':
          return (rightProjection?.apr ?? 0) - (leftProjection?.apr ?? 0)
        case 'due_asc':
          return (
            computeDueInDays(leftProjection?.dueDay ?? left.dueDay) - computeDueInDays(rightProjection?.dueDay ?? right.dueDay)
          )
        case 'interest_desc':
          return (rightProjection?.projectedNextMonthInterest ?? 0) - (leftProjection?.projectedNextMonthInterest ?? 0)
        default:
          return 0
      }
    })

    return sorted
  }, [loans, projectionsById, search, sortKey])

  const totalProjectedInterest = baselinePortfolio.projectedNextMonthInterest

  const dueSoonCount = useMemo(
    () =>
      loans.filter((entry) => {
        const projection = projectionsById.get(entry._id)
        return computeDueInDays(projection?.dueDay ?? entry.dueDay) <= 7
      }).length,
    [loans, projectionsById],
  )

  const belowInterestCount = useMemo(
    () =>
      loans.filter((entry) => {
        const projection = projectionsById.get(entry._id)
        const firstRow = projection?.rows[0]
        if (!firstRow) return false
        return firstRow.plannedLoanPayment + 0.000001 < firstRow.interestAccrued
      }).length,
    [loans, projectionsById],
  )

  const parsedOverpayBudget = useMemo(() => {
    const parsed = Number.parseFloat(strategyOverpayBudget)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0
    }
    return parsed
  }, [strategyOverpayBudget])

  const loanStrategy = useMemo(
    () => buildLoanStrategy(loans, loanEvents, parsedOverpayBudget),
    [loanEvents, loans, parsedOverpayBudget],
  )

  const activeWhatIfLoanId = useMemo(() => {
    if (whatIfLoanId === 'all') return 'all'
    return modelByLoanId.has(whatIfLoanId) ? whatIfLoanId : 'all'
  }, [modelByLoanId, whatIfLoanId])

  const whatIfResult = useMemo(
    () =>
      runLoanWhatIf(loans, loanEvents, {
        loanId: activeWhatIfLoanId,
        extraPaymentDelta: parseNumber(whatIfExtraPaymentDelta),
        aprDelta: parseNumber(whatIfAprDelta),
        subscriptionDelta: parseNumber(whatIfSubscriptionDelta),
        dueDayShift: Math.trunc(parseNumber(whatIfDueDayShift)),
      }),
    [
      activeWhatIfLoanId,
      loanEvents,
      loans,
      whatIfAprDelta,
      whatIfDueDayShift,
      whatIfExtraPaymentDelta,
      whatIfSubscriptionDelta,
    ],
  )

  const activeTrendLoanId = useMemo(() => {
    if (trendLoanId && modelByLoanId.has(trendLoanId)) {
      return trendLoanId
    }
    return baselinePortfolio.models[0]?.loanId ?? ''
  }, [baselinePortfolio.models, modelByLoanId, trendLoanId])

  const trendModel = useMemo(
    () => (activeTrendLoanId ? modelByLoanId.get(activeTrendLoanId) ?? null : null),
    [activeTrendLoanId, modelByLoanId],
  )

  const activeRefinanceLoanId = useMemo(() => {
    if (refinanceLoanId && modelByLoanId.has(refinanceLoanId)) {
      return refinanceLoanId
    }
    return baselinePortfolio.models[0]?.loanId ?? ''
  }, [baselinePortfolio.models, modelByLoanId, refinanceLoanId])

  const refinanceModel = useMemo(
    () => (activeRefinanceLoanId ? modelByLoanId.get(activeRefinanceLoanId) ?? null : null),
    [activeRefinanceLoanId, modelByLoanId],
  )

  const refinanceOffer = useMemo<LoanRefinanceOffer>(
    () => ({
      apr: Math.max(parseNumber(refinanceApr), 0),
      fees: Math.max(parseNumber(refinanceFees), 0),
      termMonths: Math.max(Math.trunc(parseNumber(refinanceTermMonths)), 1),
    }),
    [refinanceApr, refinanceFees, refinanceTermMonths],
  )

  const refinanceResult = useMemo(
    () => (refinanceModel ? analyzeLoanRefinance(refinanceModel, refinanceOffer) : null),
    [refinanceModel, refinanceOffer],
  )

  const trendRows = trendModel?.rows.slice(0, 12) ?? []
  const trendInterestValues = trendRows.map((row) => row.interestAccrued)
  const trendBalanceValues = trendRows.map((row) => row.endingOutstanding)
  const trendPaymentValues = trendRows.map((row) => row.totalPayment)
  const trendSubscriptionValues = trendRows.map((row) => row.subscriptionDue)
  const trendConsistencyValues = (trendModel?.paymentConsistencyTrend ?? []).slice(-12).map((point) => point.ratio * 100)

  const parseQuickAmount = () => {
    const parsed = Number.parseFloat(quickAmount)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null
    }
    return parsed
  }

  const submitQuickAction = async (entry: LoanEntry) => {
    if (!quickAction || quickAction.loanId !== entry._id) {
      return
    }

    setQuickError(null)
    try {
      if (quickAction.type === 'charge') {
        const amount = parseQuickAmount()
        if (amount === null) {
          setQuickError('Enter a valid charge amount greater than 0.')
          return
        }
        await onQuickAddLoanCharge(entry._id, amount, quickNotes)
      } else if (quickAction.type === 'payment') {
        const amount = parseQuickAmount()
        if (amount === null) {
          setQuickError('Enter a valid payment amount greater than 0.')
          return
        }
        await onQuickRecordLoanPayment(entry._id, amount, quickNotes)
      } else if (quickAction.type === 'interest') {
        await onQuickApplyLoanInterest(entry._id, quickNotes)
      } else {
        await onQuickApplyLoanSubscription(entry._id, quickNotes)
      }

      setQuickAction(null)
      setQuickAmount('')
      setQuickNotes('')
      setQuickError(null)
    } catch (error) {
      setQuickError(error instanceof Error ? error.message : 'Quick action failed.')
    }
  }

  return (
    <section className="editor-grid loans-tab-shell" aria-label="Loan management">
      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Loans</p>
            <h2>Add loan</h2>
            <p className="panel-value">
              {loans.length} loan{loans.length === 1 ? '' : 's'} · {formatMoney(totalLoanBalance)} balance
            </p>
            <p className="subnote">
              {formatMoney(monthlyLoanPayments)} obligations/mo ({formatMoney(monthlyLoanBasePayments)} payments +{' '}
              {formatMoney(monthlyLoanSubscriptionCosts)} subscriptions)
            </p>
          </div>
        </header>

        <form className="entry-form entry-form--grid" onSubmit={onAddLoan}>
          <div className="form-grid">
            <div className="form-field form-field--span2">
              <label htmlFor="loan-name">Loan name</label>
              <input
                id="loan-name"
                value={loanForm.name}
                onChange={(event) => setLoanForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="loan-balance">Current balance</label>
              <input
                id="loan-balance"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={loanForm.balance}
                onChange={(event) => setLoanForm((prev) => ({ ...prev, balance: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="loan-principal">Principal balance (optional)</label>
              <input
                id="loan-principal"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Auto from balance"
                value={loanForm.principalBalance}
                onChange={(event) => setLoanForm((prev) => ({ ...prev, principalBalance: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="loan-accrued">Accrued interest (optional)</label>
              <input
                id="loan-accrued"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Auto from balance"
                value={loanForm.accruedInterest}
                onChange={(event) => setLoanForm((prev) => ({ ...prev, accruedInterest: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="loan-payment-type">Minimum payment model</label>
              <select
                id="loan-payment-type"
                value={loanForm.minimumPaymentType}
                onChange={(event) =>
                  setLoanForm((prev) => ({
                    ...prev,
                    minimumPaymentType: event.target.value as LoanMinimumPaymentType,
                    minimumPaymentPercent:
                      event.target.value === 'percent_plus_interest' ? prev.minimumPaymentPercent || '2' : '',
                  }))
                }
              >
                <option value="fixed">Fixed amount</option>
                <option value="percent_plus_interest">% + interest</option>
              </select>
            </div>

            {loanForm.minimumPaymentType === 'fixed' ? (
              <div className="form-field">
                <label htmlFor="loan-payment">Minimum payment</label>
                <input
                  id="loan-payment"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  value={loanForm.minimumPayment}
                  onChange={(event) => setLoanForm((prev) => ({ ...prev, minimumPayment: event.target.value }))}
                  required
                />
              </div>
            ) : (
              <>
                <div className="form-field">
                  <label htmlFor="loan-payment-percent">Minimum %</label>
                  <input
                    id="loan-payment-percent"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="100"
                    step="0.01"
                    value={loanForm.minimumPaymentPercent}
                    onChange={(event) =>
                      setLoanForm((prev) => ({
                        ...prev,
                        minimumPaymentPercent: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="loan-payment">Fixed base (optional)</label>
                  <input
                    id="loan-payment"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={loanForm.minimumPayment}
                    onChange={(event) => setLoanForm((prev) => ({ ...prev, minimumPayment: event.target.value }))}
                  />
                </div>
              </>
            )}

            <div className="form-field">
              <label htmlFor="loan-extra-payment">Extra payment</label>
              <input
                id="loan-extra-payment"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={loanForm.extraPayment}
                onChange={(event) => setLoanForm((prev) => ({ ...prev, extraPayment: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="loan-subscription">Subscription cost (monthly)</label>
              <input
                id="loan-subscription"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Optional"
                value={loanForm.subscriptionCost}
                onChange={(event) => setLoanForm((prev) => ({ ...prev, subscriptionCost: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="loan-subscription-payment-count">Subscription payments left</label>
              <input
                id="loan-subscription-payment-count"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                placeholder="12"
                value={loanForm.subscriptionPaymentCount}
                onChange={(event) =>
                  setLoanForm((prev) => ({ ...prev, subscriptionPaymentCount: event.target.value }))
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="loan-interest-rate">APR %</label>
              <input
                id="loan-interest-rate"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Optional"
                value={loanForm.interestRate}
                onChange={(event) => setLoanForm((prev) => ({ ...prev, interestRate: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="loan-due-day">Due day</label>
              <input
                id="loan-due-day"
                type="number"
                inputMode="numeric"
                min="1"
                max="31"
                value={loanForm.dueDay}
                onChange={(event) => setLoanForm((prev) => ({ ...prev, dueDay: event.target.value }))}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="loan-cadence">Payment frequency</label>
              <select
                id="loan-cadence"
                value={loanForm.cadence}
                onChange={(event) =>
                  setLoanForm((prev) => ({
                    ...prev,
                    cadence: event.target.value as Cadence,
                    customInterval: event.target.value === 'custom' ? prev.customInterval || '1' : '',
                  }))
                }
              >
                {cadenceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {isCustomCadence(loanForm.cadence) ? (
              <div className="form-field form-field--span2">
                <label htmlFor="loan-custom-interval">Custom cadence</label>
                <div className="inline-cadence-controls">
                  <input
                    id="loan-custom-interval"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={loanForm.customInterval}
                    onChange={(event) => setLoanForm((prev) => ({ ...prev, customInterval: event.target.value }))}
                    required
                  />
                  <select
                    id="loan-custom-unit"
                    value={loanForm.customUnit}
                    onChange={(event) =>
                      setLoanForm((prev) => ({
                        ...prev,
                        customUnit: event.target.value as CustomCadenceUnit,
                      }))
                    }
                  >
                    {customCadenceUnitOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}

            <div className="form-field form-field--span2">
              <label htmlFor="loan-notes">Notes</label>
              <textarea
                id="loan-notes"
                rows={3}
                placeholder="Optional"
                value={loanForm.notes}
                onChange={(event) => setLoanForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>
          </div>

          <p className="form-hint">
            Tip: choose <strong>% + interest</strong> when minimums are percentage-based, then set optional extra payment for
            overpay planning. Set <strong>Subscription payments left</strong> if the loan is already part-way through its
            subscription plan.
          </p>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Add loan
            </button>
          </div>
        </form>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Loans</p>
            <h2>Current entries</h2>
            <p className="panel-value">{formatMoney(monthlyLoanPayments)} obligations/mo</p>
            <p className="subnote">
              {formatMoney(totalLoanBalance)} total balance · {formatMoney(totalProjectedInterest)} projected next-month
              interest
            </p>
          </div>
          <div className="panel-actions">
            <input
              aria-label="Search loans"
              placeholder="Search loans or notes..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select aria-label="Sort loans" value={sortKey} onChange={(event) => setSortKey(event.target.value as LoanSortKey)}>
              <option value="name_asc">Name (A-Z)</option>
              <option value="balance_desc">Outstanding (high-low)</option>
              <option value="apr_desc">APR (high-low)</option>
              <option value="due_asc">Due soon</option>
              <option value="interest_desc">Projected interest (high-low)</option>
            </select>
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              onClick={() => {
                setSearch('')
                setSortKey('name_asc')
              }}
              disabled={search.length === 0 && sortKey === 'name_asc'}
            >
              Clear
            </button>
          </div>
        </header>

        {loans.length === 0 ? (
          <p className="empty-state">No loans added yet.</p>
        ) : (
          <>
            <div className="loan-summary-strip">
              <article className="loan-summary-card">
                <p>Total debt</p>
                <strong>{formatMoney(totalLoanBalance)}</strong>
                <small>{loans.length} active loans</small>
              </article>
              <article className="loan-summary-card">
                <p>Projected next interest</p>
                <strong>{formatMoney(totalProjectedInterest)}</strong>
                <small>if unchanged this month</small>
              </article>
              <article className="loan-summary-card">
                <p>Due in next 7 days</p>
                <strong>{dueSoonCount}</strong>
                <small>prioritize these first</small>
              </article>
              <article className="loan-summary-card">
                <p>Payment below interest</p>
                <strong>{belowInterestCount}</strong>
                <small>raises long-term payoff cost</small>
              </article>
            </div>

            <div className="loan-intelligence-grid">
              <article className="loan-intelligence-card">
                <p>12m projection</p>
                <strong>{formatMoney(baselinePortfolio.projectedAnnualInterest)}</strong>
                <small>
                  interest · {formatMoney(baselinePortfolio.projectedAnnualPayments)} projected payments over next year
                </small>
              </article>
              <article className="loan-intelligence-card">
                <p>24m projection</p>
                <strong>{formatMoney(baselinePortfolio.projected24MonthInterest)}</strong>
                <small>interest with current payment plan</small>
              </article>
              <article className="loan-intelligence-card">
                <p>36m projection</p>
                <strong>{formatMoney(baselinePortfolio.projected36MonthInterest)}</strong>
                <small>interest · consistency score {baselinePortfolio.averagePaymentConsistencyScore.toFixed(1)}/100</small>
              </article>
            </div>

            <section className="loan-strategy-panel" aria-label="Loan debt strategy">
              <header className="loan-strategy-head">
                <div>
                  <h3>Debt strategy module</h3>
                  <p>
                    Avalanche and Snowball targets are recalculated from your latest balances. Recommendation defaults to the
                    stronger annual interest saver.
                  </p>
                </div>
                <label className="loan-strategy-budget">
                  <span>Monthly overpay budget</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={strategyOverpayBudget}
                    onChange={(event) => setStrategyOverpayBudget(event.target.value)}
                  />
                </label>
              </header>
              <div className="loan-strategy-grid">
                <article>
                  <p>Avalanche target</p>
                  <strong>{loanStrategy.avalancheTarget?.name ?? 'n/a'}</strong>
                  <small>
                    {loanStrategy.avalancheTarget
                      ? `${formatMoney(loanStrategy.avalancheTarget.balance)} · ${loanStrategy.avalancheTarget.apr.toFixed(2)}% APR · ${formatMoney(loanStrategy.avalancheTarget.annualInterestSavings)} annual savings`
                      : 'No active balances'}
                  </small>
                </article>
                <article>
                  <p>Snowball target</p>
                  <strong>{loanStrategy.snowballTarget?.name ?? 'n/a'}</strong>
                  <small>
                    {loanStrategy.snowballTarget
                      ? `${formatMoney(loanStrategy.snowballTarget.balance)} · ${loanStrategy.snowballTarget.apr.toFixed(2)}% APR · ${formatMoney(loanStrategy.snowballTarget.annualInterestSavings)} annual savings`
                      : 'No active balances'}
                  </small>
                </article>
                <article>
                  <p>Recommended</p>
                  <strong>
                    {loanStrategy.recommendedTarget
                      ? `${loanStrategy.recommendedMode === 'avalanche' ? 'Avalanche' : 'Snowball'}: ${loanStrategy.recommendedTarget.name}`
                      : 'n/a'}
                  </strong>
                  <small>
                    {loanStrategy.recommendedTarget
                      ? `${formatMoney(loanStrategy.recommendedTarget.annualInterestSavings)} annual interest saved vs baseline`
                      : 'Add loan balances to calculate recommendations'}
                  </small>
                </article>
              </div>
            </section>

            <section className="loan-whatif-panel" aria-label="Loan what-if simulator">
              <header className="loan-whatif-head">
                <div>
                  <h3>What-if simulator</h3>
                  <p>Compare baseline vs scenario with changes to extra payment, APR, subscription, and due day.</p>
                </div>
              </header>
              <div className="loan-whatif-grid">
                <label>
                  <span>Scope</span>
                  <select value={activeWhatIfLoanId} onChange={(event) => setWhatIfLoanId(event.target.value)}>
                    <option value="all">All loans</option>
                    {baselinePortfolio.models.map((model) => (
                      <option key={model.loanId} value={model.loanId}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Extra payment delta / month</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={whatIfExtraPaymentDelta}
                    onChange={(event) => setWhatIfExtraPaymentDelta(event.target.value)}
                  />
                </label>
                <label>
                  <span>APR delta (points)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={whatIfAprDelta}
                    onChange={(event) => setWhatIfAprDelta(event.target.value)}
                  />
                </label>
                <label>
                  <span>Subscription delta / month</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={whatIfSubscriptionDelta}
                    onChange={(event) => setWhatIfSubscriptionDelta(event.target.value)}
                  />
                </label>
                <label>
                  <span>Due day shift (days)</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    step="1"
                    value={whatIfDueDayShift}
                    onChange={(event) => setWhatIfDueDayShift(event.target.value)}
                  />
                </label>
              </div>
              <div className="loan-whatif-compare">
                <article>
                  <p>Baseline annual interest</p>
                  <strong>{formatMoney(whatIfResult.baseline.projectedAnnualInterest)}</strong>
                  <small>{formatMoney(whatIfResult.baseline.totalOutstanding)} total outstanding now</small>
                </article>
                <article>
                  <p>Scenario annual interest</p>
                  <strong>{formatMoney(whatIfResult.scenario.projectedAnnualInterest)}</strong>
                  <small>{formatMoney(whatIfResult.scenario.totalOutstanding)} total outstanding now</small>
                </article>
                <article>
                  <p>Delta</p>
                  <strong className={whatIfResult.delta.annualInterest <= 0 ? 'amount-positive' : 'amount-negative'}>
                    {whatIfResult.delta.annualInterest > 0 ? '+' : ''}
                    {formatMoney(whatIfResult.delta.annualInterest)}
                  </strong>
                  <small>
                    next-month interest {whatIfResult.delta.nextMonthInterest > 0 ? '+' : ''}
                    {formatMoney(whatIfResult.delta.nextMonthInterest)} · annual payment {whatIfResult.delta.annualPayments > 0 ? '+' : ''}
                    {formatMoney(whatIfResult.delta.annualPayments)}
                  </small>
                </article>
              </div>
            </section>

            <section className="loan-refinance-panel" aria-label="Loan refinance analyzer">
              <header className="loan-refinance-head">
                <div>
                  <h3>Refinance analyzer</h3>
                  <p>Compare offer APR, fees, and term against current path. Includes break-even month and cost delta.</p>
                </div>
              </header>
              <div className="loan-refinance-grid">
                <label>
                  <span>Loan</span>
                  <select value={activeRefinanceLoanId} onChange={(event) => setRefinanceLoanId(event.target.value)}>
                    {baselinePortfolio.models.map((model) => (
                      <option key={model.loanId} value={model.loanId}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Offer APR %</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={refinanceApr}
                    onChange={(event) => setRefinanceApr(event.target.value)}
                  />
                </label>
                <label>
                  <span>Fees</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={refinanceFees}
                    onChange={(event) => setRefinanceFees(event.target.value)}
                  />
                </label>
                <label>
                  <span>Term (months)</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={refinanceTermMonths}
                    onChange={(event) => setRefinanceTermMonths(event.target.value)}
                  />
                </label>
              </div>
              {refinanceResult ? (
                <div className="loan-refinance-summary">
                  <article>
                    <p>Refinance payment</p>
                    <strong>{formatMoney(refinanceResult.monthlyPayment)}</strong>
                    <small>{formatMoney(refinanceResult.totalRefinanceInterest)} interest across term</small>
                  </article>
                  <article>
                    <p>Break-even</p>
                    <strong>{refinanceResult.breakEvenMonth ? `Month ${refinanceResult.breakEvenMonth}` : 'No break-even'}</strong>
                    <small>{formatMoney(refinanceResult.remainingCurrentOutstandingAtTerm)} current balance left at term</small>
                  </article>
                  <article>
                    <p>Total cost delta</p>
                    <strong className={refinanceResult.totalCostDelta <= 0 ? 'amount-positive' : 'amount-negative'}>
                      {refinanceResult.totalCostDelta > 0 ? '+' : ''}
                      {formatMoney(refinanceResult.totalCostDelta)}
                    </strong>
                    <small>
                      current {formatMoney(refinanceResult.totalCurrentCost)} vs refinance {formatMoney(refinanceResult.totalRefinanceCost)}
                    </small>
                  </article>
                </div>
              ) : (
                <p className="empty-state">Add a loan balance to run refinance analysis.</p>
              )}
            </section>

            {trendModel ? (
              <section className="loan-trends-panel" aria-label="Loan trend visuals">
                <header className="loan-trends-head">
                  <div>
                    <h3>Trend visuals</h3>
                    <p>Interest trend, balance path, payment consistency, and subscription trend (12 months).</p>
                  </div>
                  <label>
                    <span className="sr-only">Trend loan</span>
                    <select value={activeTrendLoanId} onChange={(event) => setTrendLoanId(event.target.value)}>
                      {baselinePortfolio.models.map((model) => (
                        <option key={model.loanId} value={model.loanId}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </header>
                <div className="loan-trends-grid">
                  <article>
                    <p>Interest trend</p>
                    <svg viewBox="0 0 220 58" role="img" aria-label="Interest trend">
                      <polyline points={buildSparklinePoints(trendInterestValues)} />
                    </svg>
                    <small>
                      Next month {formatMoney(trendModel.projectedNextMonthInterest)} · 12m{' '}
                      {formatMoney(trendModel.projectedAnnualInterest)}
                    </small>
                  </article>
                  <article>
                    <p>Balance path</p>
                    <svg viewBox="0 0 220 58" role="img" aria-label="Balance path">
                      <polyline points={buildSparklinePoints(trendBalanceValues)} />
                    </svg>
                    <small>
                      Current {formatMoney(trendModel.currentOutstanding)} · payoff{' '}
                      {trendModel.projectedPayoffDate ?? 'beyond model window'}
                    </small>
                  </article>
                  <article>
                    <p>Payment consistency</p>
                    <svg viewBox="0 0 220 58" role="img" aria-label="Payment consistency trend">
                      <polyline points={buildSparklinePoints(trendConsistencyValues)} />
                    </svg>
                    <small>
                      Score {trendModel.paymentConsistencyScore.toFixed(1)}/100 · latest{' '}
                      {trendModel.paymentConsistencyTrend.length > 0
                        ? formatMonthKeyLabel(trendModel.paymentConsistencyTrend[trendModel.paymentConsistencyTrend.length - 1]!.monthKey)
                        : 'n/a'}
                    </small>
                  </article>
                  <article>
                    <p>Subscription trend</p>
                    <svg viewBox="0 0 220 58" role="img" aria-label="Subscription trend">
                      <polyline points={buildSparklinePoints(trendSubscriptionValues)} />
                    </svg>
                    <small>
                      {trendModel.subscriptionPaymentsRemaining} payment
                      {trendModel.subscriptionPaymentsRemaining === 1 ? '' : 's'} left · {formatMoney(trendModel.subscriptionCost)}
                      /month
                    </small>
                  </article>
                </div>
                <p className="subnote">
                  Payment path trend:{' '}
                  {trendPaymentValues.slice(0, 6).map((value, index) => `M${index + 1} ${formatMoney(value)}`).join(' · ')}
                </p>
              </section>
            ) : null}

            <section className="loan-history-panel" aria-label="Loan mutation history">
              <header className="loan-history-head">
                <div>
                  <h3>Loan event history</h3>
                  <p>Paginated mutation log keeps the loans tab fast with large histories.</p>
                </div>
              </header>
              <div className="loan-history-summary-grid">
                <article>
                  <p>90-day events</p>
                  <strong>{loanHistorySummary?.totalEvents ?? 0}</strong>
                  <small>
                    {loanHistorySummary?.monthlyCycleMutations ?? 0} monthly-cycle mutations ·{' '}
                    {loanHistorySummary?.failedSteps ?? 0} failed cycle steps
                  </small>
                </article>
                <article>
                  <p>Payments vs charges</p>
                  <strong>
                    {formatMoney(loanHistorySummary?.totalPayments ?? 0)} / {formatMoney(loanHistorySummary?.totalCharges ?? 0)}
                  </strong>
                  <small>payments / charges over the last 90 days</small>
                </article>
                <article>
                  <p>Interest + subscriptions</p>
                  <strong>
                    {formatMoney(loanHistorySummary?.totalInterest ?? 0)} +{' '}
                    {formatMoney(loanHistorySummary?.totalSubscriptionFees ?? 0)}
                  </strong>
                  <small>interest accrual + subscription fees</small>
                </article>
              </div>
              {loanMutationHistory.results.length === 0 ? (
                <p className="empty-state">No loan history entries yet.</p>
              ) : (
                <ul className="timeline-list loan-history-list">
                  {loanMutationHistory.results.map((entry) => (
                    <li key={entry._id}>
                      <div>
                        <p>
                          {loanMutationTypeLabel(entry.mutationType)} · {entry.source}
                        </p>
                        <small>
                          {entry.cycleKey ? `${entry.cycleKey} · ` : ''}
                          {entry.notes ?? 'Loan mutation recorded'}
                        </small>
                        <small>
                          {formatMoney(entry.totalBefore)}
                          {' -> '}
                          {formatMoney(entry.totalAfter)}
                          {entry.amount !== undefined ? ` · amount ${formatMoney(entry.amount)}` : ''}
                        </small>
                      </div>
                      <strong>{new Date(entry.occurredAt).toLocaleDateString('en-GB')}</strong>
                    </li>
                  ))}
                </ul>
              )}
              {loanMutationHistory.status === 'CanLoadMore' || loanMutationHistory.status === 'LoadingMore' ? (
                <div className="loan-history-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn--sm"
                    disabled={loanMutationHistory.status !== 'CanLoadMore'}
                    onClick={() => loanMutationHistory.loadMore(18)}
                  >
                    {loanMutationHistory.status === 'LoadingMore' ? 'Loading...' : 'Load more history'}
                  </button>
                </div>
              ) : null}
            </section>

            <p className="subnote">
              Showing {visibleLoans.length} of {loans.length} loan{loans.length === 1 ? '' : 's'}.
            </p>

            {visibleLoans.length === 0 ? (
              <p className="empty-state">No loans match your search.</p>
            ) : (
              <div className="loan-rows">
                {visibleLoans.map((entry) => {
                  const projection = projectionsById.get(entry._id)
                  if (!projection) return null

                  const isEditing = loanEditId === entry._id
                  const isQuickOpen = quickAction?.loanId === entry._id
                  const firstRow = projection.rows[0]
                  const dueInDays = computeDueInDays(projection.dueDay)
                  const paymentBelowInterest =
                    firstRow ? firstRow.plannedLoanPayment + 0.000001 < firstRow.interestAccrued : false
                  const dueThisCycle = firstRow ? firstRow.totalPayment : 0
                  const projectedAfterPayment = firstRow ? firstRow.endingOutstanding : projection.currentOutstanding

                  return (
                    <article key={entry._id} className="loan-row-card">
                      <header className="loan-row-head">
                        <div>
                          <h3>{entry.name}</h3>
                          <p>{cadenceLabel(projection.cadence, projection.customInterval, projection.customUnit)}</p>
                        </div>
                        <div className="loan-row-pills">
                          <span className="pill pill--neutral">Day {projection.dueDay}</span>
                          {projection.apr > 0 ? <span className="pill pill--warning">APR {projection.apr.toFixed(2)}%</span> : null}
                          {paymentBelowInterest ? <span className="pill pill--critical">Payment below interest</span> : null}
                          <span className="pill pill--cadence">
                            Due in {dueInDays} day{dueInDays === 1 ? '' : 's'}
                          </span>
                        </div>
                      </header>

                      {isEditing ? (
                        <div className="loan-row-edit-grid">
                          <label>
                            <span>Name</span>
                            <input
                              value={loanEditDraft.name}
                              onChange={(event) => setLoanEditDraft((prev) => ({ ...prev, name: event.target.value }))}
                            />
                          </label>
                          <label>
                            <span>Balance</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              value={loanEditDraft.balance}
                              onChange={(event) => setLoanEditDraft((prev) => ({ ...prev, balance: event.target.value }))}
                            />
                          </label>
                          <label>
                            <span>Principal</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              value={loanEditDraft.principalBalance}
                              onChange={(event) =>
                                setLoanEditDraft((prev) => ({ ...prev, principalBalance: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            <span>Accrued interest</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              value={loanEditDraft.accruedInterest}
                              onChange={(event) =>
                                setLoanEditDraft((prev) => ({ ...prev, accruedInterest: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            <span>Payment model</span>
                            <select
                              value={loanEditDraft.minimumPaymentType}
                              onChange={(event) =>
                                setLoanEditDraft((prev) => ({
                                  ...prev,
                                  minimumPaymentType: event.target.value as LoanMinimumPaymentType,
                                  minimumPaymentPercent:
                                    event.target.value === 'percent_plus_interest'
                                      ? prev.minimumPaymentPercent || '2'
                                      : '',
                                }))
                              }
                            >
                              <option value="fixed">Fixed amount</option>
                              <option value="percent_plus_interest">% + interest</option>
                            </select>
                          </label>
                          <label>
                            <span>{loanEditDraft.minimumPaymentType === 'fixed' ? 'Minimum payment' : 'Minimum %'}</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              max={loanEditDraft.minimumPaymentType === 'fixed' ? undefined : '100'}
                              value={
                                loanEditDraft.minimumPaymentType === 'fixed'
                                  ? loanEditDraft.minimumPayment
                                  : loanEditDraft.minimumPaymentPercent
                              }
                              onChange={(event) =>
                                setLoanEditDraft((prev) =>
                                  prev.minimumPaymentType === 'fixed'
                                    ? { ...prev, minimumPayment: event.target.value }
                                    : { ...prev, minimumPaymentPercent: event.target.value },
                                )
                              }
                            />
                          </label>
                          <label>
                            <span>Extra payment</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              value={loanEditDraft.extraPayment}
                              onChange={(event) => setLoanEditDraft((prev) => ({ ...prev, extraPayment: event.target.value }))}
                            />
                          </label>
                          <label>
                            <span>Subscription/mo</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              value={loanEditDraft.subscriptionCost}
                              onChange={(event) =>
                                setLoanEditDraft((prev) => ({ ...prev, subscriptionCost: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            <span>Subscription payments left</span>
                            <input
                              type="number"
                              inputMode="numeric"
                              min="1"
                              step="1"
                              value={loanEditDraft.subscriptionPaymentCount}
                              onChange={(event) =>
                                setLoanEditDraft((prev) => ({ ...prev, subscriptionPaymentCount: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            <span>APR %</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              value={loanEditDraft.interestRate}
                              onChange={(event) => setLoanEditDraft((prev) => ({ ...prev, interestRate: event.target.value }))}
                            />
                          </label>
                          <label>
                            <span>Due day</span>
                            <input
                              type="number"
                              inputMode="numeric"
                              min="1"
                              max="31"
                              value={loanEditDraft.dueDay}
                              onChange={(event) => setLoanEditDraft((prev) => ({ ...prev, dueDay: event.target.value }))}
                            />
                          </label>
                          <label>
                            <span>Frequency</span>
                            <select
                              value={loanEditDraft.cadence}
                              onChange={(event) =>
                                setLoanEditDraft((prev) => ({
                                  ...prev,
                                  cadence: event.target.value as Cadence,
                                  customInterval: event.target.value === 'custom' ? prev.customInterval || '1' : '',
                                }))
                              }
                            >
                              {cadenceOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          {isCustomCadence(loanEditDraft.cadence) ? (
                            <>
                              <label>
                                <span>Custom interval</span>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min="1"
                                  step="1"
                                  value={loanEditDraft.customInterval}
                                  onChange={(event) =>
                                    setLoanEditDraft((prev) => ({ ...prev, customInterval: event.target.value }))
                                  }
                                />
                              </label>
                              <label>
                                <span>Custom unit</span>
                                <select
                                  value={loanEditDraft.customUnit}
                                  onChange={(event) =>
                                    setLoanEditDraft((prev) => ({ ...prev, customUnit: event.target.value as CustomCadenceUnit }))
                                  }
                                >
                                  {customCadenceUnitOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </>
                          ) : null}
                          <label className="loan-row-edit-notes">
                            <span>Notes</span>
                            <input
                              value={loanEditDraft.notes}
                              onChange={(event) => setLoanEditDraft((prev) => ({ ...prev, notes: event.target.value }))}
                            />
                          </label>
                        </div>
                      ) : (
                        <div className="loan-row-metrics">
                          <div>
                            <p>Total outstanding</p>
                            <strong>{formatMoney(projection.currentOutstanding)}</strong>
                            <small>
                              {formatMoney(projection.currentPrincipal)} principal · {formatMoney(projection.currentInterest)} interest
                              {' · '}
                              {formatMoney(projection.currentSubscriptionOutstanding)} subscription remaining
                            </small>
                          </div>
                          <div>
                            <p>Due this cycle</p>
                            <strong>{formatMoney(dueThisCycle)}</strong>
                            <small>
                              {formatMoney(firstRow?.plannedLoanPayment ?? 0)} loan + {formatMoney(firstRow?.subscriptionDue ?? 0)} subscription
                            </small>
                          </div>
                          <div>
                            <p>Projected next interest</p>
                            <strong>{formatMoney(projection.projectedNextMonthInterest)}</strong>
                            <small>{formatMoney(projectedAfterPayment)} after planned payment</small>
                          </div>
                          <div>
                            <p>Subscription / month</p>
                            <strong>{formatMoney(projection.subscriptionCost)}</strong>
                            <small>
                              {projection.subscriptionPaymentsRemaining > 0
                                ? `${projection.subscriptionPaymentsRemaining} payments left`
                                : 'No schedule'}
                              {' · '}
                              {formatMoney(firstRow?.subscriptionDue ?? 0)} due now
                            </small>
                          </div>
                        </div>
                      )}

                      <div className="loan-row-actions">
                        {isEditing ? (
                          <>
                            <button type="button" className="btn btn-secondary btn--sm" onClick={() => void saveLoanEdit()}>
                              Save
                            </button>
                            <button type="button" className="btn btn-ghost btn--sm" onClick={() => setLoanEditId(null)}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button type="button" className="btn btn-secondary btn--sm" onClick={() => startLoanEdit(entry)}>
                            Edit
                          </button>
                        )}

                        <button type="button" className="btn btn-ghost btn--sm" onClick={() => void onDeleteLoan(entry._id)}>
                          Remove
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn--sm"
                          onClick={() => {
                            setQuickAction({ loanId: entry._id, type: 'charge' })
                            setQuickAmount('')
                            setQuickNotes('')
                            setQuickError(null)
                          }}
                        >
                          Add charge
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn--sm"
                          onClick={() => {
                            setQuickAction({ loanId: entry._id, type: 'payment' })
                            setQuickAmount('')
                            setQuickNotes('')
                            setQuickError(null)
                          }}
                        >
                          Record payment
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn--sm"
                          onClick={() => {
                            setQuickAction({ loanId: entry._id, type: 'interest' })
                            setQuickAmount('')
                            setQuickNotes('')
                            setQuickError(null)
                          }}
                        >
                          Apply interest
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn--sm"
                          onClick={() => {
                            setQuickAction({ loanId: entry._id, type: 'subscription' })
                            setQuickAmount('')
                            setQuickNotes('')
                            setQuickError(null)
                          }}
                        >
                          Add subscription fee
                        </button>
                      </div>

                      {isQuickOpen ? (
                        <div className="loan-quick-action">
                          <div className="loan-quick-action-grid">
                            {quickAction.type === 'charge' || quickAction.type === 'payment' ? (
                              <label>
                                <span>Amount</span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min="0.01"
                                  step="0.01"
                                  value={quickAmount}
                                  onChange={(event) => setQuickAmount(event.target.value)}
                                  required
                                />
                              </label>
                            ) : null}
                            <label>
                              <span>Notes (optional)</span>
                              <input value={quickNotes} onChange={(event) => setQuickNotes(event.target.value)} />
                            </label>
                          </div>

                          {quickAction.type === 'payment' ? (
                            <p className="form-hint">
                              Outstanding: <strong>{formatMoney(projection.currentOutstanding)}</strong> ({formatMoney(
                                projection.currentSubscriptionOutstanding,
                              )}{' '}
                              subscription remaining, {formatMoney(firstRow?.subscriptionDue ?? 0)} due now +{' '}
                              {formatMoney(projection.currentLoanBalance)} loan balance)
                            </p>
                          ) : null}

                          {quickError ? <p className="inline-error">{quickError}</p> : null}

                          <div className="loan-quick-action-buttons">
                            <button type="button" className="btn btn-primary btn--sm" onClick={() => void submitQuickAction(entry)}>
                              {quickAction.type === 'charge'
                                ? 'Confirm charge'
                                : quickAction.type === 'payment'
                                  ? 'Confirm payment'
                                  : quickAction.type === 'interest'
                                    ? 'Apply interest now'
                                    : 'Log subscription fee'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn--sm"
                              onClick={() => {
                                setQuickAction(null)
                                setQuickAmount('')
                                setQuickNotes('')
                                setQuickError(null)
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  )
                })}
              </div>
            )}
          </>
        )}
      </article>
    </section>
  )
}
