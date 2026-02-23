import { Fragment, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type {
  AccountEntry,
  Cadence,
  CustomCadenceUnit,
  CustomCadenceUnitOption,
  IncomeChangeDirection,
  IncomeChangeEventEntry,
  IncomeChangeEventId,
  IncomeEditDraft,
  IncomeEntry,
  IncomeForm,
  IncomeId,
  IncomePaymentCheckEntry,
  IncomePaymentCheckId,
  IncomePaymentStatus,
  CadenceOption,
} from './financeTypes'
import {
  computeIncomeDeductionsTotal,
  hasIncomeBreakdown,
  resolveIncomeGrossAmount,
  resolveIncomeNetAmount,
  roundCurrency,
  toMonthlyAmount,
} from '../lib/incomeMath'
import { nextDateForCadence, toIsoDate } from '../lib/cadenceDates'

type IncomeSortKey =
  | 'source_asc'
  | 'account_asc'
  | 'planned_desc'
  | 'planned_asc'
  | 'actual_desc'
  | 'variance_desc'
  | 'cadence_asc'
  | 'next_payday_asc'
  | 'day_asc'

const parseOptionalMoneyInput = (value: string) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const parseOptionalPositiveInt = (value: string) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

type IncomePaymentReliability = {
  total: number
  onTime: number
  late: number
  missed: number
  onTimeRate: number
  lateStreak: number
  missedStreak: number
  lateOrMissedStreak: number
  score: number | null
  lastStatus: IncomePaymentStatus | null
}

type IncomeStatusTag = 'confirmed' | 'pending' | 'at_risk' | 'missed'
type IncomeTrendWindowDays = 30 | 90 | 365

type IncomeSourceTrendWindow = {
  days: IncomeTrendWindowDays
  total: number
  averagePerDay: number
  entryCount: number
}

type IncomeSourceTrendCard = {
  id: IncomeId
  source: string
  status: IncomeStatusTag
  windows: IncomeSourceTrendWindow[]
  lastLoggedDate: string | null
}

type IncomeChangeDraft = {
  effectiveDate: string
  newAmount: string
  note: string
}

type BulkIncomeRowDraft = {
  incomeId: IncomeId
  source: string
  status: IncomePaymentStatus
  receivedDay: string
  receivedAmount: string
  paymentReference: string
  payslipReference: string
  note: string
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const incomeTrendWindowDays: IncomeTrendWindowDays[] = [30, 90, 365]

const normalizeImportStatus = (value: string): IncomePaymentStatus | null => {
  const normalized = value.trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_')
  if (normalized === 'on_time' || normalized === 'late' || normalized === 'missed') {
    return normalized
  }
  if (normalized === 'ontime') {
    return 'on_time'
  }
  return null
}

const reliabilityStatusLabel = (status: IncomePaymentStatus) => {
  if (status === 'on_time') return 'On time'
  if (status === 'late') return 'Late'
  return 'Missed'
}

const reliabilityStatusPillClass = (status: IncomePaymentStatus) => {
  if (status === 'on_time') return 'pill pill--good'
  if (status === 'late') return 'pill pill--warning'
  return 'pill pill--critical'
}

const incomeStatusLabel = (status: IncomeStatusTag) => {
  if (status === 'confirmed') return 'Confirmed'
  if (status === 'at_risk') return 'At-risk'
  if (status === 'missed') return 'Missed'
  return 'Pending'
}

const incomeStatusPillClass = (status: IncomeStatusTag) => {
  if (status === 'confirmed') return 'pill pill--good'
  if (status === 'at_risk') return 'pill pill--warning'
  if (status === 'missed') return 'pill pill--critical'
  return 'pill pill--neutral'
}

const incomeChangeDirectionLabel = (direction: IncomeChangeDirection) => {
  if (direction === 'increase') return 'Increase'
  if (direction === 'decrease') return 'Decrease'
  return 'No change'
}

const incomeChangeDirectionPillClass = (direction: IncomeChangeDirection) => {
  if (direction === 'increase') return 'pill pill--good'
  if (direction === 'decrease') return 'pill pill--warning'
  return 'pill pill--neutral'
}

const resolveIncomeStatusTag = (args: {
  currentCycleCheck: IncomePaymentCheckEntry | null
  latestPaymentCheck: IncomePaymentCheckEntry | null
  reliability: IncomePaymentReliability
  hasActualPaidAmount: boolean
}): IncomeStatusTag => {
  const cycleStatus = args.currentCycleCheck?.status ?? null
  if (cycleStatus === 'missed') return 'missed'
  if (cycleStatus === 'late') return 'at_risk'
  if (cycleStatus === 'on_time') return 'confirmed'

  if (args.reliability.missedStreak > 0) return 'missed'
  if (args.reliability.lateOrMissedStreak > 0) return 'at_risk'

  if (args.latestPaymentCheck?.status === 'on_time' || args.hasActualPaidAmount) {
    return 'confirmed'
  }

  return 'pending'
}

const resolveIncomePaymentLogAmount = (entry: IncomePaymentCheckEntry) => {
  if (entry.status === 'missed') {
    return 0
  }

  if (typeof entry.receivedAmount === 'number' && Number.isFinite(entry.receivedAmount)) {
    return Math.max(entry.receivedAmount, 0)
  }

  return Math.max(entry.expectedAmount, 0)
}

const toIncomeCycleDate = (cycleMonth: string, day: number) => {
  if (!/^\d{4}-\d{2}$/.test(cycleMonth)) {
    return null
  }

  const year = Number.parseInt(cycleMonth.slice(0, 4), 10)
  const month = Number.parseInt(cycleMonth.slice(5, 7), 10)
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null
  }

  const daysInMonth = new Date(year, month, 0).getDate()
  return new Date(year, month - 1, clamp(day, 1, daysInMonth))
}

const monthKeyToDate = (monthKey: string) => {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    return null
  }

  const year = Number.parseInt(monthKey.slice(0, 4), 10)
  const month = Number.parseInt(monthKey.slice(5, 7), 10)
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null
  }

  return new Date(year, month - 1, 1)
}

const buildLookbackMonthKeys = (anchorMonthKey: string, months: number) => {
  const anchorDate = monthKeyToDate(anchorMonthKey) ?? new Date()
  const keys: string[] = []
  let cursor = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)
  for (let index = 0; index < months; index += 1) {
    keys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`)
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1)
  }
  return keys
}

const normalizeLookbackMonths = (value: number | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 6
  }
  const rounded = Math.round(value)
  return clamp(rounded, 2, 24)
}

const resolveIncomeForecastMonthlyAmount = (
  income: IncomeEntry,
  checks: IncomePaymentCheckEntry[],
  anchorMonthKey: string,
) => {
  const baselineCycleAmount = resolveIncomeNetAmount(income)
  const baselineMonthlyAmount = roundCurrency(
    toMonthlyAmount(baselineCycleAmount, income.cadence, income.customInterval, income.customUnit),
  )
  if (!income.forecastSmoothingEnabled) {
    return baselineMonthlyAmount
  }

  const lookbackMonths = normalizeLookbackMonths(income.forecastSmoothingMonths)
  const checksByMonth = new Map<string, IncomePaymentCheckEntry>()
  checks.forEach((entry) => {
    const existing = checksByMonth.get(entry.cycleMonth)
    if (!existing || entry.updatedAt > existing.updatedAt) {
      checksByMonth.set(entry.cycleMonth, entry)
    }
  })

  const monthKeys = buildLookbackMonthKeys(anchorMonthKey, lookbackMonths)
  const total = monthKeys.reduce((sum, monthKey) => {
    const paymentCheck = checksByMonth.get(monthKey)
    if (!paymentCheck) {
      return sum + baselineMonthlyAmount
    }
    const cycleAmount = resolveIncomePaymentLogAmount(paymentCheck)
    return sum + toMonthlyAmount(cycleAmount, income.cadence, income.customInterval, income.customUnit)
  }, 0)

  return roundCurrency(total / monthKeys.length)
}

const incomeTableColumnCount = 7

const calculateIncomePaymentReliability = (checks: IncomePaymentCheckEntry[]): IncomePaymentReliability => {
  if (checks.length === 0) {
    return {
      total: 0,
      onTime: 0,
      late: 0,
      missed: 0,
      onTimeRate: 0,
      lateStreak: 0,
      missedStreak: 0,
      lateOrMissedStreak: 0,
      score: null,
      lastStatus: null,
    }
  }

  const sorted = [...checks].sort((left, right) => {
    const byMonth = right.cycleMonth.localeCompare(left.cycleMonth)
    if (byMonth !== 0) {
      return byMonth
    }
    return right.updatedAt - left.updatedAt
  })

  const onTime = sorted.filter((entry) => entry.status === 'on_time').length
  const late = sorted.filter((entry) => entry.status === 'late').length
  const missed = sorted.filter((entry) => entry.status === 'missed').length
  const total = sorted.length
  const onTimeRate = total > 0 ? onTime / total : 0

  const streakFor = (status: IncomePaymentStatus) => {
    let streak = 0
    for (const entry of sorted) {
      if (entry.status !== status) {
        break
      }
      streak += 1
    }
    return streak
  }

  let lateOrMissedStreak = 0
  for (const entry of sorted) {
    if (entry.status === 'on_time') {
      break
    }
    lateOrMissedStreak += 1
  }

  const lateStreak = streakFor('late')
  const missedStreak = streakFor('missed')
  const scorePenalty = lateOrMissedStreak * 12 + missedStreak * 6
  const score = clamp(Math.round(onTimeRate * 100 - scorePenalty), 0, 100)

  return {
    total,
    onTime,
    late,
    missed,
    onTimeRate,
    lateStreak,
    missedStreak,
    lateOrMissedStreak,
    score,
    lastStatus: sorted[0]?.status ?? null,
  }
}

type IncomeTabProps = {
  incomes: IncomeEntry[]
  accounts: AccountEntry[]
  incomePaymentChecks: IncomePaymentCheckEntry[]
  incomeChangeEvents: IncomeChangeEventEntry[]
  monthlyIncome: number
  incomeForm: IncomeForm
  setIncomeForm: Dispatch<SetStateAction<IncomeForm>>
  incomeEditId: IncomeId | null
  setIncomeEditId: Dispatch<SetStateAction<IncomeId | null>>
  incomeEditDraft: IncomeEditDraft
  setIncomeEditDraft: Dispatch<SetStateAction<IncomeEditDraft>>
  onAddIncome: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onDeleteIncome: (id: IncomeId) => Promise<void>
  onAddIncomeChangeEvent: (input: {
    incomeId: IncomeId
    effectiveDate: string
    newAmount: string
    note: string
  }) => Promise<void>
  onDeleteIncomeChangeEvent: (id: IncomeChangeEventId) => Promise<void>
  saveIncomeEdit: () => Promise<void>
  startIncomeEdit: (entry: IncomeEntry) => void
  onUpsertIncomePaymentCheck: (input: {
    incomeId: IncomeId
    cycleMonth: string
    status: IncomePaymentStatus
    receivedDay: string
    receivedAmount: string
    paymentReference: string
    payslipReference: string
    note: string
  }) => Promise<void>
  onBulkUpsertIncomePaymentChecks: (input: {
    cycleMonth: string
    entries: Array<{
      incomeId: IncomeId
      status: IncomePaymentStatus
      receivedDay: string
      receivedAmount: string
      paymentReference: string
      payslipReference: string
      note: string
    }>
  }) => Promise<void>
  onDeleteIncomePaymentCheck: (id: IncomePaymentCheckId) => Promise<void>
  cadenceOptions: CadenceOption[]
  customCadenceUnitOptions: CustomCadenceUnitOption[]
  isCustomCadence: (cadence: Cadence) => boolean
  cadenceLabel: (cadence: Cadence, customInterval?: number, customUnit?: CustomCadenceUnit) => string
  formatMoney: (value: number) => string
}

export function IncomeTab({
  incomes,
  accounts,
  incomePaymentChecks,
  incomeChangeEvents,
  monthlyIncome,
  incomeForm,
  setIncomeForm,
  incomeEditId,
  setIncomeEditId,
  incomeEditDraft,
  setIncomeEditDraft,
  onAddIncome,
  onDeleteIncome,
  onAddIncomeChangeEvent,
  onDeleteIncomeChangeEvent,
  saveIncomeEdit,
  startIncomeEdit,
  onUpsertIncomePaymentCheck,
  onBulkUpsertIncomePaymentChecks,
  onDeleteIncomePaymentCheck,
  cadenceOptions,
  customCadenceUnitOptions,
  isCustomCadence,
  cadenceLabel,
  formatMoney,
}: IncomeTabProps) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<IncomeSortKey>('source_asc')
  const currentCycleMonth = new Date().toISOString().slice(0, 7)
  const [changeTrackerIncomeId, setChangeTrackerIncomeId] = useState<IncomeId | null>(null)
  const [changeDraft, setChangeDraft] = useState<IncomeChangeDraft>({
    effectiveDate: toIsoDate(new Date()),
    newAmount: '',
    note: '',
  })
  const [paymentLogIncomeId, setPaymentLogIncomeId] = useState<IncomeId | null>(null)
  const [paymentLogDraft, setPaymentLogDraft] = useState<{
    cycleMonth: string
    status: IncomePaymentStatus
    receivedDay: string
    receivedAmount: string
    paymentReference: string
    payslipReference: string
    note: string
  }>({
    cycleMonth: currentCycleMonth,
    status: 'on_time',
    receivedDay: '',
    receivedAmount: '',
    paymentReference: '',
    payslipReference: '',
    note: '',
  })
  const [bulkModeOpen, setBulkModeOpen] = useState(false)
  const [bulkCycleMonth, setBulkCycleMonth] = useState(currentCycleMonth)
  const [bulkRows, setBulkRows] = useState<BulkIncomeRowDraft[]>([])
  const [bulkImportText, setBulkImportText] = useState('')
  const [bulkImportError, setBulkImportError] = useState<string | null>(null)
  const [isBulkSaving, setIsBulkSaving] = useState(false)

  const formGrossAmount = parseOptionalMoneyInput(incomeForm.grossAmount)
  const formTaxAmount = parseOptionalMoneyInput(incomeForm.taxAmount)
  const formNationalInsuranceAmount = parseOptionalMoneyInput(incomeForm.nationalInsuranceAmount)
  const formPensionAmount = parseOptionalMoneyInput(incomeForm.pensionAmount)
  const formActualAmount = parseOptionalMoneyInput(incomeForm.actualAmount)
  const formDeductionTotal = computeIncomeDeductionsTotal({
    taxAmount: formTaxAmount,
    nationalInsuranceAmount: formNationalInsuranceAmount,
    pensionAmount: formPensionAmount,
  })
  const formManualNetAmount = parseOptionalMoneyInput(incomeForm.amount)
  const formDerivedNetAmount =
    formGrossAmount !== undefined || formDeductionTotal > 0
      ? roundCurrency(Math.max((formGrossAmount ?? 0) - formDeductionTotal, 0))
      : undefined
  const formPayDateAnchor = incomeForm.payDateAnchor.trim()
  const formCustomInterval = isCustomCadence(incomeForm.cadence)
    ? parseOptionalPositiveInt(incomeForm.customInterval)
    : undefined
  const formNextPayday =
    formPayDateAnchor.length > 0
      ? nextDateForCadence({
          cadence: incomeForm.cadence,
          createdAt: 0,
          dayOfMonth: parseOptionalPositiveInt(incomeForm.receivedDay),
          customInterval: formCustomInterval,
          customUnit: isCustomCadence(incomeForm.cadence) ? incomeForm.customUnit : undefined,
          payDateAnchor: formPayDateAnchor,
        })
      : null

  const monthlyBreakdown = useMemo(() => {
    return incomes.reduce(
      (totals, entry) => {
        const grossAmount = resolveIncomeGrossAmount(entry)
        const deductionTotal = computeIncomeDeductionsTotal(entry)
        const netAmount = resolveIncomeNetAmount(entry)
        const plannedMonthly = toMonthlyAmount(netAmount, entry.cadence, entry.customInterval, entry.customUnit)

        totals.gross += toMonthlyAmount(grossAmount, entry.cadence, entry.customInterval, entry.customUnit)
        totals.deductions += toMonthlyAmount(deductionTotal, entry.cadence, entry.customInterval, entry.customUnit)
        totals.net += plannedMonthly
        if (typeof entry.actualAmount === 'number' && Number.isFinite(entry.actualAmount)) {
          totals.expectedTracked += plannedMonthly
          totals.receivedActual += toMonthlyAmount(
            Math.max(entry.actualAmount, 0),
            entry.cadence,
            entry.customInterval,
            entry.customUnit,
          )
          totals.trackedCount += 1
        }
        return totals
      },
      { gross: 0, deductions: 0, net: 0, expectedTracked: 0, receivedActual: 0, trackedCount: 0 },
    )
  }, [incomes])

  const trackedVarianceMonthly = roundCurrency(monthlyBreakdown.receivedActual - monthlyBreakdown.expectedTracked)
  const untrackedCount = Math.max(incomes.length - monthlyBreakdown.trackedCount, 0)
  const accountNameById = useMemo(() => {
    const map = new Map<string, string>()
    accounts.forEach((account) => {
      map.set(String(account._id), account.name)
    })
    return map
  }, [accounts])
  const accountOptions = useMemo(
    () =>
      [...accounts].sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }),
      ),
    [accounts],
  )

  const paymentChecksByIncomeId = useMemo(() => {
    const map = new Map<IncomeId, IncomePaymentCheckEntry[]>()
    incomePaymentChecks.forEach((entry) => {
      const current = map.get(entry.incomeId as IncomeId) ?? []
      current.push(entry)
      map.set(entry.incomeId as IncomeId, current)
    })

    map.forEach((entries, incomeId) => {
      const sorted = [...entries].sort((left, right) => {
        const byMonth = right.cycleMonth.localeCompare(left.cycleMonth)
        if (byMonth !== 0) {
          return byMonth
        }
        return right.updatedAt - left.updatedAt
      })
      map.set(incomeId, sorted)
    })

    return map
  }, [incomePaymentChecks])

  const changeEventsByIncomeId = useMemo(() => {
    const map = new Map<IncomeId, IncomeChangeEventEntry[]>()
    incomeChangeEvents.forEach((entry) => {
      const key = entry.incomeId as IncomeId
      const current = map.get(key) ?? []
      current.push(entry)
      map.set(key, current)
    })

    map.forEach((entries, key) => {
      const sorted = [...entries].sort((left, right) => {
        const byEffectiveDate = right.effectiveDate.localeCompare(left.effectiveDate)
        if (byEffectiveDate !== 0) {
          return byEffectiveDate
        }
        return right.createdAt - left.createdAt
      })
      map.set(key, sorted)
    })

    return map
  }, [incomeChangeEvents])
  const totalIncomeChangesTracked = incomeChangeEvents.length

  const forecastNormalizedMonthlyIncome = useMemo(
    () =>
      roundCurrency(
        incomes.reduce((sum, entry) => {
          const checks = paymentChecksByIncomeId.get(entry._id) ?? []
          return sum + resolveIncomeForecastMonthlyAmount(entry, checks, currentCycleMonth)
        }, 0),
      ),
    [currentCycleMonth, incomes, paymentChecksByIncomeId],
  )
  const smoothingEnabledCount = useMemo(
    () => incomes.filter((entry) => entry.forecastSmoothingEnabled).length,
    [incomes],
  )

  const overallReliability = useMemo(
    () => calculateIncomePaymentReliability(incomePaymentChecks),
    [incomePaymentChecks],
  )
  const incomeById = useMemo(() => {
    const map = new Map<IncomeId, IncomeEntry>()
    incomes.forEach((entry) => {
      map.set(entry._id, entry)
    })
    return map
  }, [incomes])
  const incomeIdBySource = useMemo(() => {
    const map = new Map<string, IncomeId>()
    incomes.forEach((entry) => {
      map.set(entry.source.trim().toLowerCase(), entry._id)
    })
    return map
  }, [incomes])
  const buildBulkRowsForMonth = (cycleMonth: string): BulkIncomeRowDraft[] =>
    [...incomes]
      .sort((left, right) => left.source.localeCompare(right.source, undefined, { sensitivity: 'base' }))
      .map((entry) => {
        const currentMonthCheck = (paymentChecksByIncomeId.get(entry._id) ?? []).find(
          (paymentCheck) => paymentCheck.cycleMonth === cycleMonth,
        )
        const fallbackAmount =
          typeof entry.actualAmount === 'number' && Number.isFinite(entry.actualAmount)
            ? roundCurrency(Math.max(entry.actualAmount, 0))
            : roundCurrency(resolveIncomeNetAmount(entry))
        return {
          incomeId: entry._id,
          source: entry.source,
          status: currentMonthCheck?.status ?? 'on_time',
          receivedDay: currentMonthCheck?.receivedDay
            ? String(currentMonthCheck.receivedDay)
            : entry.receivedDay
              ? String(entry.receivedDay)
              : '',
          receivedAmount:
            currentMonthCheck?.status === 'missed'
              ? ''
              : currentMonthCheck?.receivedAmount !== undefined
                ? String(currentMonthCheck.receivedAmount)
                : String(fallbackAmount),
          paymentReference: currentMonthCheck?.paymentReference ?? '',
          payslipReference: currentMonthCheck?.payslipReference ?? '',
          note: currentMonthCheck?.note ?? '',
        }
      })

  const openPaymentLog = (entry: IncomeEntry) => {
    setBulkModeOpen(false)
    setChangeTrackerIncomeId(null)
    setPaymentLogIncomeId(entry._id)
    setPaymentLogDraft({
      cycleMonth: currentCycleMonth,
      status: 'on_time',
      receivedDay: entry.receivedDay ? String(entry.receivedDay) : '',
      receivedAmount: entry.actualAmount !== undefined ? String(entry.actualAmount) : String(resolveIncomeNetAmount(entry)),
      paymentReference: '',
      payslipReference: '',
      note: '',
    })
  }

  const closePaymentLog = () => {
    setPaymentLogIncomeId(null)
    setPaymentLogDraft({
      cycleMonth: currentCycleMonth,
      status: 'on_time',
      receivedDay: '',
      receivedAmount: '',
      paymentReference: '',
      payslipReference: '',
      note: '',
    })
  }

  const openChangeTracker = (entry: IncomeEntry) => {
    setBulkModeOpen(false)
    setPaymentLogIncomeId(null)
    setChangeTrackerIncomeId(entry._id)
    setChangeDraft({
      effectiveDate: toIsoDate(new Date()),
      newAmount: String(resolveIncomeNetAmount(entry)),
      note: '',
    })
  }

  const closeChangeTracker = () => {
    setChangeTrackerIncomeId(null)
    setChangeDraft({
      effectiveDate: toIsoDate(new Date()),
      newAmount: '',
      note: '',
    })
  }

  const openBulkMode = () => {
    setPaymentLogIncomeId(null)
    setChangeTrackerIncomeId(null)
    setBulkModeOpen(true)
    setBulkCycleMonth(currentCycleMonth)
    setBulkRows(buildBulkRowsForMonth(currentCycleMonth))
    setBulkImportText('')
    setBulkImportError(null)
  }

  const closeBulkMode = () => {
    setBulkModeOpen(false)
    setBulkImportError(null)
  }

  const applyBulkDefaultValues = () => {
    setBulkRows((prev) =>
      prev.map((row) => {
        const income = incomeById.get(row.incomeId)
        if (!income) {
          return row
        }
        if (row.status === 'missed') {
          return {
            ...row,
            receivedDay: '',
            receivedAmount: '',
            paymentReference: '',
            payslipReference: '',
          }
        }
        return {
          ...row,
          receivedDay: row.receivedDay || (income.receivedDay ? String(income.receivedDay) : ''),
          receivedAmount: row.receivedAmount || String(roundCurrency(resolveIncomeNetAmount(income))),
        }
      }),
    )
  }

  const applyBulkImportText = () => {
    const lines = bulkImportText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    if (lines.length === 0) {
      setBulkImportError('Paste at least one CSV line to import.')
      return
    }

    const nextRows = bulkRows.map((row) => ({ ...row }))
    const rowIndexByIncomeId = new Map<string, number>()
    nextRows.forEach((row, index) => {
      rowIndexByIncomeId.set(String(row.incomeId), index)
    })

    const errors: string[] = []
    lines.forEach((line, lineIndex) => {
      const columns = line.split(',').map((column) => column.trim())
      if (lineIndex === 0 && columns[0]?.toLowerCase() === 'source') {
        return
      }

      const source = columns[0]
      if (!source) {
        errors.push(`Line ${lineIndex + 1} is missing a source name.`)
        return
      }
      const incomeId = incomeIdBySource.get(source.toLowerCase())
      if (!incomeId) {
        errors.push(`Line ${lineIndex + 1} source "${source}" was not found.`)
        return
      }
      const rowIndex = rowIndexByIncomeId.get(String(incomeId))
      if (rowIndex === undefined) {
        errors.push(`Line ${lineIndex + 1} source "${source}" is not in the current bulk view.`)
        return
      }

      const currentRow = nextRows[rowIndex]
      const statusInput = columns[1] ?? ''
      const normalizedStatus = statusInput ? normalizeImportStatus(statusInput) : currentRow.status
      if (statusInput && !normalizedStatus) {
        errors.push(`Line ${lineIndex + 1} has invalid status "${statusInput}". Use on_time, late, or missed.`)
        return
      }

      nextRows[rowIndex] = {
        ...currentRow,
        status: normalizedStatus ?? currentRow.status,
        receivedDay: columns[2] !== undefined && columns[2] !== '' ? columns[2] : currentRow.receivedDay,
        receivedAmount: columns[3] !== undefined && columns[3] !== '' ? columns[3] : currentRow.receivedAmount,
        paymentReference: columns[4] !== undefined ? columns[4] : currentRow.paymentReference,
        payslipReference: columns[5] !== undefined ? columns[5] : currentRow.payslipReference,
        note: columns[6] !== undefined ? columns[6] : currentRow.note,
      }
    })

    if (errors.length > 0) {
      setBulkImportError(errors.slice(0, 2).join(' '))
      return
    }

    setBulkRows(nextRows)
    setBulkImportError(null)
  }

  const saveBulkIncomeLogs = async () => {
    if (bulkRows.length === 0) {
      setBulkImportError('No income rows available to bulk save.')
      return
    }

    setIsBulkSaving(true)
    try {
      await onBulkUpsertIncomePaymentChecks({
        cycleMonth: bulkCycleMonth,
        entries: bulkRows.map((row) => ({
          incomeId: row.incomeId,
          status: row.status,
          receivedDay: row.status === 'missed' ? '' : row.receivedDay,
          receivedAmount: row.status === 'missed' ? '' : row.receivedAmount,
          paymentReference: row.status === 'missed' ? '' : row.paymentReference,
          payslipReference: row.status === 'missed' ? '' : row.payslipReference,
          note: row.note,
        })),
      })
      setBulkRows(buildBulkRowsForMonth(bulkCycleMonth))
      setBulkImportText('')
      setBulkImportError(null)
    } finally {
      setIsBulkSaving(false)
    }
  }

  const visibleIncomes = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = query
      ? incomes.filter((entry) => {
          const notes = entry.notes ?? ''
          const destinationAccountName = entry.destinationAccountId
            ? accountNameById.get(String(entry.destinationAccountId)) ?? ''
            : ''
          return `${entry.source} ${notes} ${destinationAccountName}`.toLowerCase().includes(query)
        })
      : incomes.slice()

    const sorted = [...filtered].sort((a, b) => {
      const plannedA = resolveIncomeNetAmount(a)
      const plannedB = resolveIncomeNetAmount(b)
      const actualA = typeof a.actualAmount === 'number' ? a.actualAmount : Number.NEGATIVE_INFINITY
      const actualB = typeof b.actualAmount === 'number' ? b.actualAmount : Number.NEGATIVE_INFINITY
      const varianceA =
        typeof a.actualAmount === 'number' ? roundCurrency(a.actualAmount - plannedA) : Number.NEGATIVE_INFINITY
      const varianceB =
        typeof b.actualAmount === 'number' ? roundCurrency(b.actualAmount - plannedB) : Number.NEGATIVE_INFINITY
      const nextPaydayA = nextDateForCadence({
        cadence: a.cadence,
        createdAt: a.createdAt,
        dayOfMonth: a.receivedDay,
        customInterval: a.customInterval ?? undefined,
        customUnit: a.customUnit ?? undefined,
        payDateAnchor: a.payDateAnchor,
      })
      const nextPaydayB = nextDateForCadence({
        cadence: b.cadence,
        createdAt: b.createdAt,
        dayOfMonth: b.receivedDay,
        customInterval: b.customInterval ?? undefined,
        customUnit: b.customUnit ?? undefined,
        payDateAnchor: b.payDateAnchor,
      })
      const nextPaydayAAt = nextPaydayA ? nextPaydayA.getTime() : Number.POSITIVE_INFINITY
      const nextPaydayBAt = nextPaydayB ? nextPaydayB.getTime() : Number.POSITIVE_INFINITY

      switch (sortKey) {
        case 'source_asc':
          return a.source.localeCompare(b.source, undefined, { sensitivity: 'base' })
        case 'account_asc': {
          const accountNameA = a.destinationAccountId
            ? accountNameById.get(String(a.destinationAccountId)) ?? 'Unassigned'
            : 'Unassigned'
          const accountNameB = b.destinationAccountId
            ? accountNameById.get(String(b.destinationAccountId)) ?? 'Unassigned'
            : 'Unassigned'
          return accountNameA.localeCompare(accountNameB, undefined, { sensitivity: 'base' })
        }
        case 'planned_desc':
          return plannedB - plannedA
        case 'planned_asc':
          return plannedA - plannedB
        case 'actual_desc':
          return actualB - actualA
        case 'variance_desc':
          return varianceB - varianceA
        case 'cadence_asc':
          return cadenceLabel(a.cadence, a.customInterval, a.customUnit).localeCompare(
            cadenceLabel(b.cadence, b.customInterval, b.customUnit),
            undefined,
            { sensitivity: 'base' },
          )
        case 'next_payday_asc':
          return nextPaydayAAt - nextPaydayBAt
        case 'day_asc':
          return (a.receivedDay ?? 999) - (b.receivedDay ?? 999)
        default:
          return 0
      }
    })

    return sorted
  }, [accountNameById, cadenceLabel, incomes, search, sortKey])

  const sourceTrendCards = useMemo<IncomeSourceTrendCard[]>(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const cards = visibleIncomes.map((entry) => {
      const checks = paymentChecksByIncomeId.get(entry._id) ?? []
      const reliability = calculateIncomePaymentReliability(checks)
      const latestPaymentCheck = checks[0] ?? null
      const currentCycleCheck = checks.find((paymentCheck) => paymentCheck.cycleMonth === currentCycleMonth) ?? null

      const windows = incomeTrendWindowDays.map((days) => {
        const cutoff = new Date(today)
        cutoff.setDate(cutoff.getDate() - (days - 1))

        const entriesInWindow = checks.filter((paymentCheck) => {
          const eventDay = paymentCheck.receivedDay ?? paymentCheck.expectedDay ?? entry.receivedDay ?? 1
          const eventDate = toIncomeCycleDate(paymentCheck.cycleMonth, eventDay)
          return eventDate !== null && eventDate >= cutoff && eventDate <= today
        })

        const total = roundCurrency(
          entriesInWindow.reduce((sum, paymentCheck) => sum + resolveIncomePaymentLogAmount(paymentCheck), 0),
        )

        return {
          days,
          total,
          averagePerDay: roundCurrency(total / days),
          entryCount: entriesInWindow.length,
        }
      })

      const lastLoggedDate =
        checks
          .map((paymentCheck) => {
            const eventDay = paymentCheck.receivedDay ?? paymentCheck.expectedDay ?? entry.receivedDay ?? 1
            return toIncomeCycleDate(paymentCheck.cycleMonth, eventDay)
          })
          .find((eventDate) => eventDate !== null)
          ?.toISOString()
          .slice(0, 10) ?? null

      return {
        id: entry._id,
        source: entry.source,
        status: resolveIncomeStatusTag({
          currentCycleCheck,
          latestPaymentCheck,
          reliability,
          hasActualPaidAmount: typeof entry.actualAmount === 'number' && Number.isFinite(entry.actualAmount),
        }),
        windows,
        lastLoggedDate,
      }
    })

    return cards.sort(
      (left, right) =>
        right.windows[0].total - left.windows[0].total ||
        left.source.localeCompare(right.source, undefined, { sensitivity: 'base' }),
    )
  }, [currentCycleMonth, paymentChecksByIncomeId, visibleIncomes])

  return (
    <section className="editor-grid income-tab-shell" aria-label="Income management">
      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Income</p>
            <h2>Add income source</h2>
            <p className="panel-value">
              {incomes.length} source{incomes.length === 1 ? '' : 's'} · {formatMoney(monthlyIncome)} / month
            </p>
            <p className="subnote">
              Forecast normalized: {formatMoney(forecastNormalizedMonthlyIncome)} / month ({smoothingEnabledCount} source
              {smoothingEnabledCount === 1 ? '' : 's'} smoothed)
            </p>
          </div>
        </header>
        <form className="entry-form entry-form--grid" onSubmit={onAddIncome} aria-describedby="income-form-hint">
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="income-source">Source</label>
              <input
                id="income-source"
                value={incomeForm.source}
                onChange={(event) => setIncomeForm((prev) => ({ ...prev, source: event.target.value }))}
                autoComplete="organization"
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="income-amount">Planned net amount</label>
              <input
                id="income-amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={incomeForm.amount}
                onChange={(event) => setIncomeForm((prev) => ({ ...prev, amount: event.target.value }))}
                required={formGrossAmount === undefined && formDeductionTotal <= 0}
              />
            </div>

            <div className="form-field">
              <label htmlFor="income-actual">Actual paid amount</label>
              <input
                id="income-actual"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Optional"
                value={incomeForm.actualAmount}
                onChange={(event) => setIncomeForm((prev) => ({ ...prev, actualAmount: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="income-gross">Gross amount</label>
              <input
                id="income-gross"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Optional"
                value={incomeForm.grossAmount}
                onChange={(event) => setIncomeForm((prev) => ({ ...prev, grossAmount: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="income-tax">Tax deduction</label>
              <input
                id="income-tax"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Optional"
                value={incomeForm.taxAmount}
                onChange={(event) => setIncomeForm((prev) => ({ ...prev, taxAmount: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="income-ni">NI deduction</label>
              <input
                id="income-ni"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Optional"
                value={incomeForm.nationalInsuranceAmount}
                onChange={(event) =>
                  setIncomeForm((prev) => ({
                    ...prev,
                    nationalInsuranceAmount: event.target.value,
                  }))
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="income-pension">Pension deduction</label>
              <input
                id="income-pension"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Optional"
                value={incomeForm.pensionAmount}
                onChange={(event) => setIncomeForm((prev) => ({ ...prev, pensionAmount: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="income-cadence">Frequency</label>
              <select
                id="income-cadence"
                value={incomeForm.cadence}
                onChange={(event) =>
                  setIncomeForm((prev) => ({
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

            <div className="form-field form-field--span2">
              <label className="checkbox-row" htmlFor="income-forecast-smoothing">
                <input
                  id="income-forecast-smoothing"
                  type="checkbox"
                  checked={incomeForm.forecastSmoothingEnabled}
                  onChange={(event) =>
                    setIncomeForm((prev) => ({
                      ...prev,
                      forecastSmoothingEnabled: event.target.checked,
                      forecastSmoothingMonths: prev.forecastSmoothingMonths || '6',
                    }))
                  }
                />
                Use seasonal smoothing for forecast math
              </label>
              <div className="inline-cadence-controls">
                <label htmlFor="income-forecast-smoothing-months">Lookback (months)</label>
                <select
                  id="income-forecast-smoothing-months"
                  value={incomeForm.forecastSmoothingMonths}
                  disabled={!incomeForm.forecastSmoothingEnabled}
                  onChange={(event) =>
                    setIncomeForm((prev) => ({
                      ...prev,
                      forecastSmoothingMonths: event.target.value,
                    }))
                  }
                >
                  <option value="3">3</option>
                  <option value="6">6</option>
                  <option value="9">9</option>
                  <option value="12">12</option>
                  <option value="18">18</option>
                  <option value="24">24</option>
                </select>
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="income-destination-account">Default landing account</label>
              <select
                id="income-destination-account"
                value={incomeForm.destinationAccountId}
                onChange={(event) =>
                  setIncomeForm((prev) => ({
                    ...prev,
                    destinationAccountId: event.target.value,
                  }))
                }
              >
                <option value="">Unassigned cash pool</option>
                {accountOptions.map((account) => (
                  <option key={account._id} value={String(account._id)}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="income-day">Received day</label>
              <input
                id="income-day"
                type="number"
                inputMode="numeric"
                min="1"
                max="31"
                placeholder="Optional"
                value={incomeForm.receivedDay}
                onChange={(event) => setIncomeForm((prev) => ({ ...prev, receivedDay: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="income-anchor">Pay date anchor</label>
              <input
                id="income-anchor"
                type="date"
                value={incomeForm.payDateAnchor}
                onChange={(event) => setIncomeForm((prev) => ({ ...prev, payDateAnchor: event.target.value }))}
              />
            </div>

            {isCustomCadence(incomeForm.cadence) ? (
              <div className="form-field form-field--span2">
                <label htmlFor="income-custom-interval">Custom cadence</label>
                <div className="inline-cadence-controls">
                  <input
                    id="income-custom-interval"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={incomeForm.customInterval}
                    onChange={(event) =>
                      setIncomeForm((prev) => ({
                        ...prev,
                        customInterval: event.target.value,
                      }))
                    }
                    required
                  />
                  <select
                    id="income-custom-unit"
                    value={incomeForm.customUnit}
                    onChange={(event) =>
                      setIncomeForm((prev) => ({
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
              <label htmlFor="income-employer-note">Employer note</label>
              <input
                id="income-employer-note"
                type="text"
                placeholder="Optional payroll / employer context"
                value={incomeForm.employerNote}
                onChange={(event) => setIncomeForm((prev) => ({ ...prev, employerNote: event.target.value }))}
              />
            </div>

            <div className="form-field form-field--span2">
              <label htmlFor="income-notes">Notes</label>
              <textarea
                id="income-notes"
                rows={3}
                placeholder="Optional"
                value={incomeForm.notes}
                onChange={(event) => setIncomeForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>
          </div>

          <p id="income-form-hint" className="form-hint">
            {formDerivedNetAmount !== undefined
              ? `Derived net ${formatMoney(formDerivedNetAmount)} = gross ${formatMoney(formGrossAmount ?? 0)} - deductions ${formatMoney(formDeductionTotal)}.`
              : formManualNetAmount !== undefined
                ? `Using manual net amount ${formatMoney(formManualNetAmount)}. Add gross + deductions to auto-calculate net.`
                : 'Enter planned net amount directly or provide gross + deductions to auto-calculate net.'}{' '}
            {formActualAmount !== undefined
              ? `Actual paid captured as ${formatMoney(formActualAmount)} for expected vs received variance. `
              : 'Add Actual paid amount to track expected vs received variance. '}{' '}
            {incomeForm.forecastSmoothingEnabled
              ? `Forecast smoothing enabled with ${incomeForm.forecastSmoothingMonths} month lookback. `
              : 'Enable forecast smoothing to normalize irregular or seasonal income from payment logs. '}{' '}
            Tip: use <strong>Custom</strong> for 4-week pay cycles and set <strong>Pay date anchor</strong> for
            accurate next payday prediction. Next predicted payday:{' '}
            <strong>{formNextPayday ? toIsoDate(formNextPayday) : 'n/a'}</strong>.
          </p>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Add income
            </button>
          </div>
        </form>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Income</p>
            <h2>Current entries</h2>
            <p className="panel-value">{formatMoney(monthlyIncome)} planned net/month</p>
            <p className="subnote">
              {formatMoney(forecastNormalizedMonthlyIncome)} forecast-normalized/month from smoothing + payment history.
            </p>
          </div>
          <div className="panel-actions">
            <input
              aria-label="Search income entries"
              placeholder="Search sources or notes…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              aria-label="Sort income entries"
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as IncomeSortKey)}
            >
              <option value="source_asc">Source (A-Z)</option>
              <option value="account_asc">Landing account</option>
              <option value="planned_desc">Planned net (high-low)</option>
              <option value="planned_asc">Planned net (low-high)</option>
              <option value="actual_desc">Actual paid (high-low)</option>
              <option value="variance_desc">Variance (high-low)</option>
              <option value="cadence_asc">Frequency</option>
              <option value="next_payday_asc">Next payday</option>
              <option value="day_asc">Received day</option>
            </select>
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              onClick={() => {
                setSearch('')
                setSortKey('source_asc')
              }}
              disabled={search.length === 0 && sortKey === 'source_asc'}
            >
              Clear
            </button>
          </div>
        </header>

        {incomes.length === 0 ? (
          <p className="empty-state">No income entries added yet.</p>
        ) : (
          <>
            <p className="subnote">
              Showing {visibleIncomes.length} of {incomes.length} source{incomes.length === 1 ? '' : 's'} ·{' '}
              {formatMoney(monthlyIncome)} planned net/month scheduled.
            </p>
            <p className="subnote">
              Forecast normalized run-rate {formatMoney(forecastNormalizedMonthlyIncome)} / month.
            </p>
            <p className="subnote">
              Salary change events tracked: {totalIncomeChangesTracked}. Use <strong>Track change</strong> on any row to
              log increase/decrease history with an effective date.
            </p>
            <p className="subnote">
              Actuals tracked on {monthlyBreakdown.trackedCount}/{incomes.length} sources · {untrackedCount} pending
              actual value{untrackedCount === 1 ? '' : 's'}.
            </p>
            <section className="income-bulk-mode" aria-label="Bulk add and import monthly income logs">
              <header className="income-bulk-mode-head">
                <div>
                  <h3>Bulk add/import monthly logs</h3>
                  <p>Capture all sources for one month in a single save operation.</p>
                </div>
                {!bulkModeOpen ? (
                  <button type="button" className="btn btn-secondary btn--sm" onClick={openBulkMode}>
                    Open bulk mode
                  </button>
                ) : (
                  <button type="button" className="btn btn-ghost btn--sm" onClick={closeBulkMode}>
                    Close bulk mode
                  </button>
                )}
              </header>

              {bulkModeOpen ? (
                <>
                  <div className="income-bulk-mode-toolbar">
                    <label className="income-bulk-field">
                      <span>Cycle month</span>
                      <input
                        type="month"
                        value={bulkCycleMonth}
                        onChange={(event) => {
                          const month = event.target.value
                          setBulkCycleMonth(month)
                          if (month) {
                            setBulkRows(buildBulkRowsForMonth(month))
                          }
                        }}
                      />
                    </label>
                    <div className="income-bulk-mode-toolbar-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn--sm"
                        onClick={() => setBulkRows(buildBulkRowsForMonth(bulkCycleMonth))}
                      >
                        Reload month
                      </button>
                      <button type="button" className="btn btn-ghost btn--sm" onClick={applyBulkDefaultValues}>
                        Use planned defaults
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn--sm"
                        onClick={() => void saveBulkIncomeLogs()}
                        disabled={isBulkSaving}
                      >
                        {isBulkSaving ? 'Saving…' : `Save ${bulkRows.length} rows`}
                      </button>
                    </div>
                  </div>

                  <div className="income-bulk-import">
                    <label htmlFor="income-bulk-import-text">CSV import (optional)</label>
                    <textarea
                      id="income-bulk-import-text"
                      rows={3}
                      placeholder="Source,status,receivedDay,receivedAmount,paymentReference,payslipReference,note"
                      value={bulkImportText}
                      onChange={(event) => setBulkImportText(event.target.value)}
                    />
                    <div className="income-bulk-import-actions">
                      <button type="button" className="btn btn-ghost btn--sm" onClick={applyBulkImportText}>
                        Apply CSV to table
                      </button>
                      <small>
                        Format: <code>source,status,day,amount,paymentRef,payslipRef,note</code>
                      </small>
                    </div>
                    {bulkImportError ? <p className="income-bulk-error">{bulkImportError}</p> : null}
                  </div>

                  <div className="table-wrap table-wrap--card">
                    <table className="data-table data-table--income-bulk" data-testid="income-bulk-table">
                      <caption className="sr-only">Bulk monthly income logs</caption>
                      <thead>
                        <tr>
                          <th scope="col">Source</th>
                          <th scope="col">Status</th>
                          <th scope="col">Day</th>
                          <th scope="col">Amount</th>
                          <th scope="col">Payment ref</th>
                          <th scope="col">Payslip ref</th>
                          <th scope="col">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkRows.map((row) => (
                          <tr key={row.incomeId}>
                            <td>{row.source}</td>
                            <td>
                              <select
                                className="inline-select"
                                value={row.status}
                                onChange={(event) => {
                                  const nextStatus = event.target.value as IncomePaymentStatus
                                  setBulkRows((prev) =>
                                    prev.map((entry) =>
                                      entry.incomeId === row.incomeId
                                        ? {
                                            ...entry,
                                            status: nextStatus,
                                            receivedDay: nextStatus === 'missed' ? '' : entry.receivedDay,
                                            receivedAmount: nextStatus === 'missed' ? '' : entry.receivedAmount,
                                            paymentReference: nextStatus === 'missed' ? '' : entry.paymentReference,
                                            payslipReference: nextStatus === 'missed' ? '' : entry.payslipReference,
                                          }
                                        : entry,
                                    ),
                                  )
                                }}
                              >
                                <option value="on_time">On time</option>
                                <option value="late">Late</option>
                                <option value="missed">Missed</option>
                              </select>
                            </td>
                            <td>
                              <input
                                className="inline-input"
                                type="number"
                                min="1"
                                max="31"
                                value={row.receivedDay}
                                disabled={row.status === 'missed'}
                                onChange={(event) =>
                                  setBulkRows((prev) =>
                                    prev.map((entry) =>
                                      entry.incomeId === row.incomeId ? { ...entry, receivedDay: event.target.value } : entry,
                                    ),
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                className="inline-input"
                                type="number"
                                min="0"
                                step="0.01"
                                value={row.receivedAmount}
                                disabled={row.status === 'missed'}
                                onChange={(event) =>
                                  setBulkRows((prev) =>
                                    prev.map((entry) =>
                                      entry.incomeId === row.incomeId
                                        ? { ...entry, receivedAmount: event.target.value }
                                        : entry,
                                    ),
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                className="inline-input"
                                type="text"
                                value={row.paymentReference}
                                disabled={row.status === 'missed'}
                                onChange={(event) =>
                                  setBulkRows((prev) =>
                                    prev.map((entry) =>
                                      entry.incomeId === row.incomeId
                                        ? { ...entry, paymentReference: event.target.value }
                                        : entry,
                                    ),
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                className="inline-input"
                                type="text"
                                value={row.payslipReference}
                                disabled={row.status === 'missed'}
                                onChange={(event) =>
                                  setBulkRows((prev) =>
                                    prev.map((entry) =>
                                      entry.incomeId === row.incomeId
                                        ? { ...entry, payslipReference: event.target.value }
                                        : entry,
                                    ),
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                className="inline-input"
                                type="text"
                                value={row.note}
                                onChange={(event) =>
                                  setBulkRows((prev) =>
                                    prev.map((entry) =>
                                      entry.incomeId === row.incomeId ? { ...entry, note: event.target.value } : entry,
                                    ),
                                  )
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </section>
            <div className="bulk-summary income-breakdown-summary">
              <div>
                <p>Gross income</p>
                <strong>{formatMoney(monthlyBreakdown.gross)}</strong>
                <small>monthly run-rate</small>
              </div>
              <div>
                <p>Deductions</p>
                <strong>{formatMoney(monthlyBreakdown.deductions)}</strong>
                <small>tax + NI + pension</small>
              </div>
              <div>
                <p>Planned net</p>
                <strong>{formatMoney(monthlyBreakdown.net)}</strong>
                <small>gross - deductions</small>
              </div>
              <div>
                <p>Actual received</p>
                <strong>{formatMoney(monthlyBreakdown.receivedActual)}</strong>
                <small>
                  {monthlyBreakdown.trackedCount}/{incomes.length} sources tracked
                </small>
              </div>
              <div>
                <p>Variance</p>
                <strong className={trackedVarianceMonthly < 0 ? 'amount-negative' : 'amount-positive'}>
                  {formatMoney(trackedVarianceMonthly)}
                </strong>
                <small>actual - planned for tracked sources</small>
              </div>
              <div>
                <p>Reliability score</p>
                <strong>
                  {overallReliability.score !== null ? `${overallReliability.score}/100` : 'n/a'}
                </strong>
                <small>
                  {overallReliability.total} logs · {(overallReliability.onTimeRate * 100).toFixed(0)}% on-time ·{' '}
                  {overallReliability.lateOrMissedStreak} late/missed streak
                </small>
              </div>
              <div>
                <p>Forecast normalized</p>
                <strong>{formatMoney(forecastNormalizedMonthlyIncome)}</strong>
                <small>{smoothingEnabledCount} smoothing-enabled source{smoothingEnabledCount === 1 ? '' : 's'}</small>
              </div>
              <div>
                <p>Change history</p>
                <strong>{totalIncomeChangesTracked}</strong>
                <small>effective-dated salary adjustments tracked</small>
              </div>
            </div>
            <section className="income-source-trends" aria-label="Source-level income trends">
              <header className="income-source-trends-head">
                <h3>Source-level trend cards</h3>
                <p>Rolling totals and daily averages from logged income checks.</p>
              </header>
              <div className="income-source-trends-grid">
                {sourceTrendCards.map((trend) => (
                  <article key={trend.id} className="income-source-trend-card">
                    <div className="income-source-trend-head">
                      <p>{trend.source}</p>
                      <span className={incomeStatusPillClass(trend.status)}>{incomeStatusLabel(trend.status)}</span>
                    </div>
                    <div className="income-source-trend-windows">
                      {trend.windows.map((window) => (
                        <div key={`${trend.id}-${window.days}`} className="income-source-trend-window">
                          <p>{window.days}d</p>
                          <strong>{formatMoney(window.total)}</strong>
                          <small>
                            {formatMoney(window.averagePerDay)}/day · {window.entryCount} log
                            {window.entryCount === 1 ? '' : 's'}
                          </small>
                        </div>
                      ))}
                    </div>
                    <small className="income-source-trend-foot">
                      {trend.lastLoggedDate ? `Last logged ${trend.lastLoggedDate}` : 'No payment logs yet'}
                    </small>
                  </article>
                ))}
              </div>
            </section>
            <div className="table-wrap table-wrap--card">
              <table className="data-table data-table--income" data-testid="income-table">
                <caption className="sr-only">Income entries</caption>
                <colgroup>
                  <col className="income-col income-col--source" />
                  <col className="income-col income-col--cashflow" />
                  <col className="income-col income-col--reliability" />
                  <col className="income-col income-col--profile" />
                  <col className="income-col income-col--schedule" />
                  <col className="income-col income-col--notes" />
                  <col className="income-col income-col--actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Source</th>
                    <th scope="col">Cashflow</th>
                    <th scope="col">Reliability</th>
                    <th scope="col">Profile</th>
                    <th scope="col">Schedule</th>
                    <th scope="col">Notes</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleIncomes.map((entry) => {
                    const isEditing = incomeEditId === entry._id
                    const grossAmount = resolveIncomeGrossAmount(entry)
                    const deductionTotal = computeIncomeDeductionsTotal(entry)
                    const netAmount = resolveIncomeNetAmount(entry)
                    const actualPaidAmount =
                      typeof entry.actualAmount === 'number' && Number.isFinite(entry.actualAmount)
                        ? roundCurrency(Math.max(entry.actualAmount, 0))
                        : undefined
                    const varianceAmount =
                      actualPaidAmount !== undefined ? roundCurrency(actualPaidAmount - netAmount) : undefined
                    const entryHasBreakdown = hasIncomeBreakdown(entry)
                    const effectiveDeductionRate = grossAmount > 0 ? (deductionTotal / grossAmount) * 100 : 0
                    const editGrossAmount = parseOptionalMoneyInput(incomeEditDraft.grossAmount)
                    const editTaxAmount = parseOptionalMoneyInput(incomeEditDraft.taxAmount)
                    const editNationalInsuranceAmount = parseOptionalMoneyInput(incomeEditDraft.nationalInsuranceAmount)
                    const editPensionAmount = parseOptionalMoneyInput(incomeEditDraft.pensionAmount)
                    const editDeductionTotal = computeIncomeDeductionsTotal({
                      taxAmount: editTaxAmount,
                      nationalInsuranceAmount: editNationalInsuranceAmount,
                      pensionAmount: editPensionAmount,
                    })
                    const editManualNetAmount = parseOptionalMoneyInput(incomeEditDraft.amount)
                    const editPlannedNetAmount =
                      editGrossAmount !== undefined || editDeductionTotal > 0
                        ? roundCurrency(Math.max((editGrossAmount ?? 0) - editDeductionTotal, 0))
                        : editManualNetAmount
                    const editActualPaidAmount = parseOptionalMoneyInput(incomeEditDraft.actualAmount)
                    const editVarianceAmount =
                      editActualPaidAmount !== undefined && editPlannedNetAmount !== undefined
                        ? roundCurrency(editActualPaidAmount - editPlannedNetAmount)
                        : undefined
                    const rowPaymentChecks = paymentChecksByIncomeId.get(entry._id) ?? []
                    const rowChangeEvents = changeEventsByIncomeId.get(entry._id) ?? []
                    const rowReliability = calculateIncomePaymentReliability(rowPaymentChecks)
                    const rowForecastNormalizedMonthly = resolveIncomeForecastMonthlyAmount(
                      entry,
                      rowPaymentChecks,
                      currentCycleMonth,
                    )
                    const smoothingLookbackMonths = normalizeLookbackMonths(entry.forecastSmoothingMonths)
                    const latestPaymentCheck = rowPaymentChecks[0] ?? null
                    const currentCycleCheck =
                      rowPaymentChecks.find((paymentCheck) => paymentCheck.cycleMonth === currentCycleMonth) ?? null
                    const incomeStatus = resolveIncomeStatusTag({
                      currentCycleCheck,
                      latestPaymentCheck,
                      reliability: rowReliability,
                      hasActualPaidAmount: actualPaidAmount !== undefined,
                    })
                    const isPaymentLogOpen = paymentLogIncomeId === entry._id
                    const isChangeTrackerOpen = changeTrackerIncomeId === entry._id
                    const editCustomInterval = isCustomCadence(incomeEditDraft.cadence)
                      ? parseOptionalPositiveInt(incomeEditDraft.customInterval)
                      : undefined
                    const nextPayday = nextDateForCadence({
                      cadence: entry.cadence,
                      createdAt: entry.createdAt,
                      dayOfMonth: entry.receivedDay,
                      customInterval: entry.customInterval ?? undefined,
                      customUnit: entry.customUnit ?? undefined,
                      payDateAnchor: entry.payDateAnchor,
                    })
                    const editNextPayday = nextDateForCadence({
                      cadence: incomeEditDraft.cadence,
                      createdAt: entry.createdAt,
                      dayOfMonth: parseOptionalPositiveInt(incomeEditDraft.receivedDay),
                      customInterval: editCustomInterval,
                      customUnit: isCustomCadence(incomeEditDraft.cadence) ? incomeEditDraft.customUnit : undefined,
                      payDateAnchor: incomeEditDraft.payDateAnchor.trim() || undefined,
                    })

                    return (
                      <Fragment key={entry._id}>
                        <tr className={isEditing ? 'table-row--editing' : undefined}>
                          <td>
                            <div className="cell-stack">
                              <strong>{entry.source}</strong>
                              <small>Gross {formatMoney(grossAmount)}</small>
                              {entryHasBreakdown ? (
                                <small>
                                  Deductions {formatMoney(deductionTotal)} ({effectiveDeductionRate.toFixed(1)}%)
                                </small>
                              ) : (
                                <small>Using net-only input</small>
                              )}
                            </div>
                          </td>
                          <td className="table-amount">
                            <div className="cell-stack">
                              <strong>{formatMoney(netAmount)}</strong>
                              <small>{entryHasBreakdown ? 'Gross minus deductions' : 'Planned net input'}</small>
                              {actualPaidAmount !== undefined ? (
                                <small>Actual {formatMoney(actualPaidAmount)}</small>
                              ) : (
                                <small>Actual not logged</small>
                              )}
                              {varianceAmount !== undefined ? (
                                <small className={varianceAmount < 0 ? 'amount-negative' : 'amount-positive'}>
                                  Variance {formatMoney(varianceAmount)}
                                </small>
                              ) : (
                                <small>Variance n/a</small>
                              )}
                            </div>
                          </td>
                          <td className="income-reliability-cell">
                            {rowReliability.total === 0 ? (
                              <div className="cell-stack">
                                <span className="pill pill--neutral">No logs</span>
                                <small>Start logging monthly outcomes to score reliability.</small>
                              </div>
                            ) : (
                              <div className="cell-stack">
                                <strong>
                                  {rowReliability.score !== null ? `${rowReliability.score}/100` : 'n/a'} reliability
                                </strong>
                                <small>
                                  {(rowReliability.onTimeRate * 100).toFixed(0)}% on-time · {rowReliability.total} log
                                  {rowReliability.total === 1 ? '' : 's'}
                                </small>
                                <small>
                                  Late streak {rowReliability.lateStreak} · Missed streak {rowReliability.missedStreak}
                                </small>
                                {latestPaymentCheck ? (
                                  <span className={reliabilityStatusPillClass(latestPaymentCheck.status)}>
                                    {latestPaymentCheck.cycleMonth} · {reliabilityStatusLabel(latestPaymentCheck.status)}
                                  </span>
                                ) : null}
                              </div>
                            )}
                          </td>
                          <td>
                            <div className="cell-stack">
                              <span className={incomeStatusPillClass(incomeStatus)}>{incomeStatusLabel(incomeStatus)}</span>
                              {entry.destinationAccountId ? (
                                accountNameById.has(String(entry.destinationAccountId)) ? (
                                  <span className="pill pill--neutral">
                                    {accountNameById.get(String(entry.destinationAccountId))}
                                  </span>
                                ) : (
                                  <span className="pill pill--warning">Missing account</span>
                                )
                              ) : (
                                <span className="pill pill--neutral">Unassigned account</span>
                              )}
                              <span className="pill pill--cadence">
                                {cadenceLabel(entry.cadence, entry.customInterval, entry.customUnit)}
                              </span>
                              {entry.forecastSmoothingEnabled ? (
                                <small>
                                  Smoothing on ({smoothingLookbackMonths}m) · {formatMoney(rowForecastNormalizedMonthly)} / month
                                </small>
                              ) : (
                                <small>Smoothing off</small>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="cell-stack">
                              <span className="pill pill--neutral">{entry.receivedDay ? `Day ${entry.receivedDay}` : 'No day'}</span>
                              <small>Anchor {entry.payDateAnchor ?? '-'}</small>
                              <span className="pill pill--neutral">{nextPayday ? toIsoDate(nextPayday) : 'Next n/a'}</span>
                            </div>
                          </td>
                          <td>
                            <div className="cell-stack">
                              {entry.employerNote ? (
                                <small className="cell-truncate" title={entry.employerNote}>
                                  Employer: {entry.employerNote}
                                </small>
                              ) : (
                                <small>Employer note: -</small>
                              )}
                              <span className="cell-truncate" title={entry.notes ?? ''}>
                                {entry.notes ?? '-'}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className="row-actions row-actions--income">
                              {isEditing ? (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn--sm"
                                    onClick={() => void saveIncomeEdit()}
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn--sm"
                                    onClick={() => setIncomeEditId(null)}
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn--sm"
                                    onClick={() => startIncomeEdit(entry)}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn--sm"
                                    onClick={() => openPaymentLog(entry)}
                                  >
                                    Log payment
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn--sm"
                                    onClick={() => (isChangeTrackerOpen ? closeChangeTracker() : openChangeTracker(entry))}
                                  >
                                    {isChangeTrackerOpen ? 'Close change' : 'Track change'}
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                className="btn btn-ghost btn--sm"
                                onClick={() => void onDeleteIncome(entry._id)}
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isEditing ? (
                          <tr className="table-row--quick table-row--edit">
                            <td colSpan={incomeTableColumnCount}>
                              <div className="income-edit-panel">
                                <div className="income-edit-head">
                                  <h3>Edit income source</h3>
                                  <p>
                                    Update full income details for <strong>{entry.source}</strong> in a full-width editor.
                                  </p>
                                </div>
                                <div className="income-edit-summary">
                                  <div>
                                    <p>Planned net preview</p>
                                    <strong>
                                      {editPlannedNetAmount !== undefined ? formatMoney(editPlannedNetAmount) : 'n/a'}
                                    </strong>
                                  </div>
                                  <div>
                                    <p>Actual preview</p>
                                    <strong>
                                      {editActualPaidAmount !== undefined ? formatMoney(editActualPaidAmount) : 'Not logged'}
                                    </strong>
                                  </div>
                                  <div>
                                    <p>Variance preview</p>
                                    <strong className={editVarianceAmount !== undefined ? (editVarianceAmount < 0 ? 'amount-negative' : 'amount-positive') : undefined}>
                                      {editVarianceAmount !== undefined ? formatMoney(editVarianceAmount) : 'n/a'}
                                    </strong>
                                  </div>
                                  <div>
                                    <p>Next payday preview</p>
                                    <strong>{editNextPayday ? toIsoDate(editNextPayday) : 'n/a'}</strong>
                                  </div>
                                </div>
                                <div className="income-edit-grid">
                                  <label className="income-edit-field">
                                    <span>Source</span>
                                    <input
                                      className="inline-input"
                                      value={incomeEditDraft.source}
                                      onChange={(event) =>
                                        setIncomeEditDraft((prev) => ({
                                          ...prev,
                                          source: event.target.value,
                                        }))
                                      }
                                    />
                                  </label>

                                  <label className="income-edit-field">
                                    <span>Landing account</span>
                                    <select
                                      className="inline-select"
                                      value={incomeEditDraft.destinationAccountId}
                                      onChange={(event) =>
                                        setIncomeEditDraft((prev) => ({
                                          ...prev,
                                          destinationAccountId: event.target.value,
                                        }))
                                      }
                                    >
                                      <option value="">Unassigned</option>
                                      {accountOptions.map((account) => (
                                        <option key={account._id} value={String(account._id)}>
                                          {account.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>

                                  <label className="income-edit-field">
                                    <span>Gross amount</span>
                                    <input
                                      className="inline-input"
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      placeholder="Optional"
                                      value={incomeEditDraft.grossAmount}
                                      onChange={(event) =>
                                        setIncomeEditDraft((prev) => ({
                                          ...prev,
                                          grossAmount: event.target.value,
                                        }))
                                      }
                                    />
                                  </label>

                                  <label className="income-edit-field">
                                    <span>Tax deduction</span>
                                    <input
                                      className="inline-input"
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      placeholder="Optional"
                                      value={incomeEditDraft.taxAmount}
                                      onChange={(event) =>
                                        setIncomeEditDraft((prev) => ({
                                          ...prev,
                                          taxAmount: event.target.value,
                                        }))
                                      }
                                    />
                                  </label>

                                  <label className="income-edit-field">
                                    <span>NI deduction</span>
                                    <input
                                      className="inline-input"
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      placeholder="Optional"
                                      value={incomeEditDraft.nationalInsuranceAmount}
                                      onChange={(event) =>
                                        setIncomeEditDraft((prev) => ({
                                          ...prev,
                                          nationalInsuranceAmount: event.target.value,
                                        }))
                                      }
                                    />
                                  </label>

                                  <label className="income-edit-field">
                                    <span>Pension deduction</span>
                                    <input
                                      className="inline-input"
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      placeholder="Optional"
                                      value={incomeEditDraft.pensionAmount}
                                      onChange={(event) =>
                                        setIncomeEditDraft((prev) => ({
                                          ...prev,
                                          pensionAmount: event.target.value,
                                        }))
                                      }
                                    />
                                  </label>

                                  <label className="income-edit-field">
                                    <span>Planned net</span>
                                    <input
                                      className="inline-input"
                                      type="number"
                                      min="0.01"
                                      step="0.01"
                                      value={incomeEditDraft.amount}
                                      onChange={(event) =>
                                        setIncomeEditDraft((prev) => ({
                                          ...prev,
                                          amount: event.target.value,
                                        }))
                                      }
                                    />
                                  </label>

                                  <label className="income-edit-field">
                                    <span>Actual paid</span>
                                    <input
                                      className="inline-input"
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      placeholder="Optional"
                                      value={incomeEditDraft.actualAmount}
                                      onChange={(event) =>
                                        setIncomeEditDraft((prev) => ({
                                          ...prev,
                                          actualAmount: event.target.value,
                                        }))
                                      }
                                    />
                                  </label>

                                  <label className="income-edit-field income-edit-field--span2">
                                    <span>Frequency</span>
                                    <div className="inline-cadence-controls">
                                      <select
                                        className="inline-select"
                                        value={incomeEditDraft.cadence}
                                        onChange={(event) =>
                                          setIncomeEditDraft((prev) => ({
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
                                      {isCustomCadence(incomeEditDraft.cadence) ? (
                                        <>
                                          <input
                                            className="inline-input inline-cadence-number"
                                            type="number"
                                            min="1"
                                            step="1"
                                            value={incomeEditDraft.customInterval}
                                            onChange={(event) =>
                                              setIncomeEditDraft((prev) => ({
                                                ...prev,
                                                customInterval: event.target.value,
                                              }))
                                            }
                                          />
                                          <select
                                            className="inline-select inline-cadence-unit"
                                            value={incomeEditDraft.customUnit}
                                            onChange={(event) =>
                                              setIncomeEditDraft((prev) => ({
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
                                        </>
                                      ) : null}
                                    </div>
                                  </label>

                                  <label className="income-edit-field">
                                    <span>Received day</span>
                                    <input
                                      className="inline-input"
                                      type="number"
                                      min="1"
                                      max="31"
                                      value={incomeEditDraft.receivedDay}
                                      onChange={(event) =>
                                        setIncomeEditDraft((prev) => ({
                                          ...prev,
                                          receivedDay: event.target.value,
                                        }))
                                      }
                                    />
                                  </label>

                                  <label className="income-edit-field">
                                    <span>Pay date anchor</span>
                                    <input
                                      className="inline-input"
                                      type="date"
                                      value={incomeEditDraft.payDateAnchor}
                                      onChange={(event) =>
                                        setIncomeEditDraft((prev) => ({
                                          ...prev,
                                          payDateAnchor: event.target.value,
                                        }))
                                      }
                                    />
                                  </label>

                                  <label className="income-edit-field income-edit-field--span2">
                                    <span>Forecast smoothing</span>
                                    <div className="income-edit-smoothing">
                                      <label className="checkbox-row">
                                        <input
                                          type="checkbox"
                                          checked={incomeEditDraft.forecastSmoothingEnabled}
                                          onChange={(event) =>
                                            setIncomeEditDraft((prev) => ({
                                              ...prev,
                                              forecastSmoothingEnabled: event.target.checked,
                                              forecastSmoothingMonths: prev.forecastSmoothingMonths || '6',
                                            }))
                                          }
                                        />
                                        Smoothing enabled
                                      </label>
                                      <select
                                        className="inline-select"
                                        value={incomeEditDraft.forecastSmoothingMonths}
                                        disabled={!incomeEditDraft.forecastSmoothingEnabled}
                                        onChange={(event) =>
                                          setIncomeEditDraft((prev) => ({
                                            ...prev,
                                            forecastSmoothingMonths: event.target.value,
                                          }))
                                        }
                                      >
                                        <option value="3">3 months</option>
                                        <option value="6">6 months</option>
                                        <option value="9">9 months</option>
                                        <option value="12">12 months</option>
                                        <option value="18">18 months</option>
                                        <option value="24">24 months</option>
                                      </select>
                                    </div>
                                  </label>

                                  <label className="income-edit-field income-edit-field--span2">
                                    <span>Employer note</span>
                                    <input
                                      className="inline-input"
                                      placeholder="Optional employer or payroll note"
                                      value={incomeEditDraft.employerNote}
                                      onChange={(event) =>
                                        setIncomeEditDraft((prev) => ({
                                          ...prev,
                                          employerNote: event.target.value,
                                        }))
                                      }
                                    />
                                  </label>

                                  <label className="income-edit-field income-edit-field--span2">
                                    <span>Notes</span>
                                    <input
                                      className="inline-input"
                                      placeholder="Optional general note"
                                      value={incomeEditDraft.notes}
                                      onChange={(event) =>
                                        setIncomeEditDraft((prev) => ({
                                          ...prev,
                                          notes: event.target.value,
                                        }))
                                      }
                                    />
                                  </label>
                                </div>
                                <div className="income-edit-actions">
                                  <button
                                    type="button"
                                    className="btn btn-primary btn--sm"
                                    onClick={() => void saveIncomeEdit()}
                                  >
                                    Save income changes
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn--sm"
                                    onClick={() => setIncomeEditId(null)}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                        {isPaymentLogOpen ? (
                          <tr className="table-row--quick">
                            <td colSpan={incomeTableColumnCount}>
                              <div className="income-payment-log-panel">
                                <div className="income-payment-log-head">
                                  <h3>Payment reliability log</h3>
                                  <p>
                                    Track on-time, late, and missed outcomes by month for <strong>{entry.source}</strong>.
                                  </p>
                                </div>

                                <div className="income-payment-log-fields">
                                  <label className="income-payment-log-field">
                                    <span>Month</span>
                                    <input
                                      type="month"
                                      value={paymentLogDraft.cycleMonth}
                                      onChange={(event) =>
                                        setPaymentLogDraft((prev) => ({
                                          ...prev,
                                          cycleMonth: event.target.value,
                                        }))
                                      }
                                    />
                                  </label>

                                  <label className="income-payment-log-field">
                                    <span>Status</span>
                                    <select
                                      value={paymentLogDraft.status}
                                      onChange={(event) => {
                                        const status = event.target.value as IncomePaymentStatus
                                        setPaymentLogDraft((prev) => ({
                                          ...prev,
                                          status,
                                          receivedDay: status === 'missed' ? '' : prev.receivedDay,
                                          receivedAmount: status === 'missed' ? '' : prev.receivedAmount,
                                          paymentReference: status === 'missed' ? '' : prev.paymentReference,
                                          payslipReference: status === 'missed' ? '' : prev.payslipReference,
                                        }))
                                      }}
                                    >
                                      <option value="on_time">On time</option>
                                      <option value="late">Late</option>
                                      <option value="missed">Missed</option>
                                    </select>
                                  </label>

                                  <label className="income-payment-log-field">
                                    <span>Received day</span>
                                    <input
                                      type="number"
                                      min="1"
                                      max="31"
                                      placeholder={entry.receivedDay ? `Expected day ${entry.receivedDay}` : 'Optional'}
                                      value={paymentLogDraft.receivedDay}
                                      onChange={(event) =>
                                        setPaymentLogDraft((prev) => ({
                                          ...prev,
                                          receivedDay: event.target.value,
                                        }))
                                      }
                                      disabled={paymentLogDraft.status === 'missed'}
                                    />
                                  </label>

                                  <label className="income-payment-log-field">
                                    <span>Received amount</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      placeholder="Optional"
                                      value={paymentLogDraft.receivedAmount}
                                      onChange={(event) =>
                                        setPaymentLogDraft((prev) => ({
                                          ...prev,
                                          receivedAmount: event.target.value,
                                        }))
                                      }
                                      disabled={paymentLogDraft.status === 'missed'}
                                    />
                                  </label>

                                  <label className="income-payment-log-field">
                                    <span>Payment reference</span>
                                    <input
                                      type="text"
                                      placeholder="Optional bank/payroll ref"
                                      value={paymentLogDraft.paymentReference}
                                      onChange={(event) =>
                                        setPaymentLogDraft((prev) => ({
                                          ...prev,
                                          paymentReference: event.target.value,
                                        }))
                                      }
                                      disabled={paymentLogDraft.status === 'missed'}
                                    />
                                  </label>

                                  <label className="income-payment-log-field">
                                    <span>Payslip reference</span>
                                    <input
                                      type="text"
                                      placeholder="Optional payslip ID"
                                      value={paymentLogDraft.payslipReference}
                                      onChange={(event) =>
                                        setPaymentLogDraft((prev) => ({
                                          ...prev,
                                          payslipReference: event.target.value,
                                        }))
                                      }
                                      disabled={paymentLogDraft.status === 'missed'}
                                    />
                                  </label>

                                  <label className="income-payment-log-field income-payment-log-field--note">
                                    <span>Note</span>
                                    <input
                                      type="text"
                                      placeholder="Optional context"
                                      value={paymentLogDraft.note}
                                      onChange={(event) =>
                                        setPaymentLogDraft((prev) => ({
                                          ...prev,
                                          note: event.target.value,
                                        }))
                                      }
                                    />
                                  </label>
                                </div>

                                <p className="income-payment-log-hint">
                                  If expected day is set and you mark <strong>On time</strong> with a later received day,
                                  it will be normalized to <strong>Late</strong>.
                                </p>

                                <div className="income-payment-log-actions">
                                  <button
                                    type="button"
                                    className="btn btn-primary btn--sm"
                                    onClick={() =>
                                      void onUpsertIncomePaymentCheck({
                                        incomeId: entry._id,
                                        cycleMonth: paymentLogDraft.cycleMonth,
                                        status: paymentLogDraft.status,
                                        receivedDay: paymentLogDraft.receivedDay,
                                        receivedAmount: paymentLogDraft.receivedAmount,
                                        paymentReference: paymentLogDraft.paymentReference,
                                        payslipReference: paymentLogDraft.payslipReference,
                                        note: paymentLogDraft.note,
                                      })
                                    }
                                  >
                                    Save log
                                  </button>
                                  <button type="button" className="btn btn-ghost btn--sm" onClick={closePaymentLog}>
                                    Close
                                  </button>
                                </div>

                                {rowPaymentChecks.length > 0 ? (
                                  <ul className="income-payment-log-history">
                                    {rowPaymentChecks.slice(0, 6).map((paymentCheck) => (
                                      <li key={paymentCheck._id}>
                                        <span className={reliabilityStatusPillClass(paymentCheck.status)}>
                                          {paymentCheck.cycleMonth} · {reliabilityStatusLabel(paymentCheck.status)}
                                        </span>
                                        <small>
                                          {paymentCheck.receivedDay ? `Day ${paymentCheck.receivedDay}` : 'No day'} ·{' '}
                                          {paymentCheck.receivedAmount !== undefined
                                            ? formatMoney(paymentCheck.receivedAmount)
                                            : 'No amount'}
                                        </small>
                                        <small>
                                          {paymentCheck.paymentReference
                                            ? `Payment ref ${paymentCheck.paymentReference}`
                                            : 'No payment ref'}{' '}
                                          ·{' '}
                                          {paymentCheck.payslipReference
                                            ? `Payslip ${paymentCheck.payslipReference}`
                                            : 'No payslip ref'}
                                        </small>
                                        <button
                                          type="button"
                                          className="btn btn-ghost btn--sm"
                                          onClick={() => void onDeleteIncomePaymentCheck(paymentCheck._id)}
                                        >
                                          Remove
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                        {isChangeTrackerOpen ? (
                          <tr className="table-row--quick">
                            <td colSpan={incomeTableColumnCount}>
                              <div className="income-change-tracker-panel">
                                <div className="income-change-tracker-head">
                                  <h3>Income change tracker</h3>
                                  <p>
                                    Track effective-dated salary changes for <strong>{entry.source}</strong>. Current planned
                                    net: <strong>{formatMoney(netAmount)}</strong>.
                                  </p>
                                </div>

                                <div className="income-change-tracker-fields">
                                  <label className="income-change-tracker-field">
                                    <span>Effective date</span>
                                    <input
                                      type="date"
                                      value={changeDraft.effectiveDate}
                                      onChange={(event) =>
                                        setChangeDraft((prev) => ({
                                          ...prev,
                                          effectiveDate: event.target.value,
                                        }))
                                      }
                                      max={toIsoDate(new Date())}
                                    />
                                  </label>

                                  <label className="income-change-tracker-field">
                                    <span>New net amount</span>
                                    <input
                                      type="number"
                                      min="0.01"
                                      step="0.01"
                                      inputMode="decimal"
                                      placeholder={String(resolveIncomeNetAmount(entry))}
                                      value={changeDraft.newAmount}
                                      onChange={(event) =>
                                        setChangeDraft((prev) => ({
                                          ...prev,
                                          newAmount: event.target.value,
                                        }))
                                      }
                                    />
                                  </label>

                                  <label className="income-change-tracker-field income-change-tracker-field--note">
                                    <span>Note</span>
                                    <input
                                      type="text"
                                      placeholder="Optional context for this change"
                                      value={changeDraft.note}
                                      onChange={(event) =>
                                        setChangeDraft((prev) => ({
                                          ...prev,
                                          note: event.target.value,
                                        }))
                                      }
                                    />
                                  </label>
                                </div>

                                <p className="income-change-tracker-hint">
                                  Saving writes a dated increase/decrease entry and updates this source&apos;s planned net.
                                </p>

                                <div className="income-change-tracker-actions">
                                  <button
                                    type="button"
                                    className="btn btn-primary btn--sm"
                                    onClick={() =>
                                      void onAddIncomeChangeEvent({
                                        incomeId: entry._id,
                                        effectiveDate: changeDraft.effectiveDate,
                                        newAmount: changeDraft.newAmount,
                                        note: changeDraft.note,
                                      })
                                    }
                                  >
                                    Save change
                                  </button>
                                  <button type="button" className="btn btn-ghost btn--sm" onClick={closeChangeTracker}>
                                    Close
                                  </button>
                                </div>

                                {rowChangeEvents.length > 0 ? (
                                  <ul className="income-change-tracker-history">
                                    {rowChangeEvents.slice(0, 8).map((changeEvent) => {
                                      const deltaLabel = `${changeEvent.deltaAmount > 0 ? '+' : ''}${formatMoney(
                                        changeEvent.deltaAmount,
                                      )}`
                                      return (
                                        <li key={changeEvent._id}>
                                          <div className="income-change-tracker-history-main">
                                            <span className={incomeChangeDirectionPillClass(changeEvent.direction)}>
                                              {incomeChangeDirectionLabel(changeEvent.direction)}
                                            </span>
                                            <strong>{changeEvent.effectiveDate}</strong>
                                            <small>
                                              {formatMoney(changeEvent.previousAmount)} to {formatMoney(changeEvent.newAmount)} (
                                              <span
                                                className={
                                                  changeEvent.deltaAmount < 0
                                                    ? 'amount-negative'
                                                    : changeEvent.deltaAmount > 0
                                                      ? 'amount-positive'
                                                      : undefined
                                                }
                                              >
                                                {deltaLabel}
                                              </span>
                                              )
                                            </small>
                                            {changeEvent.note ? (
                                              <small className="income-change-tracker-note">{changeEvent.note}</small>
                                            ) : null}
                                          </div>
                                          <button
                                            type="button"
                                            className="btn btn-ghost btn--sm"
                                            onClick={() => void onDeleteIncomeChangeEvent(changeEvent._id)}
                                          >
                                            Remove
                                          </button>
                                        </li>
                                      )
                                    })}
                                  </ul>
                                ) : (
                                  <p className="income-change-tracker-empty">
                                    No salary change events tracked for this source yet.
                                  </p>
                                )}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </article>
    </section>
  )
}
