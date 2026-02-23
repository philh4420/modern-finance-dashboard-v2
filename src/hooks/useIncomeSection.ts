import { useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import type {
  IncomeEditDraft,
  IncomeEntry,
  IncomeForm,
  IncomeChangeEventId,
  IncomeId,
  IncomePaymentCheckId,
  IncomePaymentStatus,
} from '../components/financeTypes'
import { isCustomCadence, parseCustomInterval, parseFloatInput, parseIntInput } from '../lib/financeHelpers'
import { isValidIsoDate } from '../lib/cadenceDates'
import type { MutationHandlers } from './useMutationFeedback'

type UseIncomeSectionArgs = {
  incomes: IncomeEntry[]
} & MutationHandlers

const initialIncomeForm: IncomeForm = {
  source: '',
  amount: '',
  actualAmount: '',
  grossAmount: '',
  taxAmount: '',
  nationalInsuranceAmount: '',
  pensionAmount: '',
  cadence: 'monthly',
  customInterval: '',
  customUnit: 'weeks',
  forecastSmoothingEnabled: false,
  forecastSmoothingMonths: '6',
  destinationAccountId: '',
  receivedDay: '',
  payDateAnchor: '',
  employerNote: '',
  notes: '',
}

const initialIncomeEditDraft: IncomeEditDraft = {
  source: '',
  amount: '',
  actualAmount: '',
  grossAmount: '',
  taxAmount: '',
  nationalInsuranceAmount: '',
  pensionAmount: '',
  cadence: 'monthly',
  customInterval: '',
  customUnit: 'weeks',
  forecastSmoothingEnabled: false,
  forecastSmoothingMonths: '6',
  destinationAccountId: '',
  receivedDay: '',
  payDateAnchor: '',
  employerNote: '',
  notes: '',
}

const roundCurrency = (value: number) => Math.round(value * 100) / 100

const parseOptionalNonNegativeFloat = (value: string, label: string) => {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const parsed = parseFloatInput(trimmed, label)
  if (parsed < 0) {
    throw new Error(`${label} cannot be negative.`)
  }
  return parsed
}

const parseOptionalIsoDateInput = (value: string, label: string) => {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  if (!isValidIsoDate(trimmed)) {
    throw new Error(`${label} must use YYYY-MM-DD format.`)
  }

  return trimmed
}

const parseOptionalAccountId = (value: string): Id<'accounts'> | undefined => {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }
  return trimmed as Id<'accounts'>
}

const parseForecastSmoothingMonthsInput = (value: string) => {
  const parsed = parseIntInput(value, 'Forecast smoothing lookback')
  if (!Number.isInteger(parsed) || parsed < 2 || parsed > 24) {
    throw new Error('Forecast smoothing lookback must be an integer between 2 and 24 months.')
  }
  return parsed
}

const parseIncomeAmounts = (
  input: Pick<
    IncomeForm,
    'amount' | 'actualAmount' | 'grossAmount' | 'taxAmount' | 'nationalInsuranceAmount' | 'pensionAmount'
  >,
) => {
  const parsedActualAmount = parseOptionalNonNegativeFloat(input.actualAmount, 'Income actual paid amount')
  const actualAmount = parsedActualAmount !== undefined ? roundCurrency(parsedActualAmount) : undefined
  const grossAmount = parseOptionalNonNegativeFloat(input.grossAmount, 'Income gross amount')
  const taxAmount = parseOptionalNonNegativeFloat(input.taxAmount, 'Income tax deduction')
  const nationalInsuranceAmount = parseOptionalNonNegativeFloat(input.nationalInsuranceAmount, 'Income NI deduction')
  const pensionAmount = parseOptionalNonNegativeFloat(input.pensionAmount, 'Income pension deduction')

  const deductionTotal = (taxAmount ?? 0) + (nationalInsuranceAmount ?? 0) + (pensionAmount ?? 0)
  if (deductionTotal > 0.000001 && grossAmount === undefined) {
    throw new Error('Gross amount is required when entering deductions.')
  }

  if (grossAmount !== undefined && deductionTotal > grossAmount + 0.000001) {
    throw new Error('Income deductions cannot exceed gross amount.')
  }

  const netAmount =
    grossAmount !== undefined || deductionTotal > 0
      ? Math.max((grossAmount ?? 0) - deductionTotal, 0)
      : parseFloatInput(input.amount, 'Income net amount')

  if (!Number.isFinite(netAmount) || netAmount <= 0) {
    throw new Error('Income net amount must be greater than 0.')
  }

  return {
    amount: roundCurrency(netAmount),
    actualAmount,
    grossAmount,
    taxAmount,
    nationalInsuranceAmount,
    pensionAmount,
  }
}

export const useIncomeSection = ({ incomes, clearError, handleMutationError }: UseIncomeSectionArgs) => {
  const addIncome = useMutation(api.finance.addIncome)
  const updateIncome = useMutation(api.finance.updateIncome)
  const removeIncome = useMutation(api.finance.removeIncome)
  const addIncomeChangeEvent = useMutation(api.finance.addIncomeChangeEvent)
  const removeIncomeChangeEvent = useMutation(api.finance.removeIncomeChangeEvent)
  const upsertIncomePaymentCheck = useMutation(api.finance.upsertIncomePaymentCheck)
  const bulkUpsertIncomePaymentChecks = useMutation(api.finance.bulkUpsertIncomePaymentChecks)
  const removeIncomePaymentCheck = useMutation(api.finance.removeIncomePaymentCheck)

  const [incomeForm, setIncomeForm] = useState<IncomeForm>(initialIncomeForm)
  const [incomeEditId, setIncomeEditId] = useState<IncomeId | null>(null)
  const [incomeEditDraft, setIncomeEditDraft] = useState<IncomeEditDraft>(initialIncomeEditDraft)

  const onAddIncome = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    try {
      const customInterval = isCustomCadence(incomeForm.cadence)
        ? parseCustomInterval(incomeForm.customInterval)
        : undefined
      const parsedAmounts = parseIncomeAmounts(incomeForm)
      const forecastSmoothingEnabled = incomeForm.forecastSmoothingEnabled
      const forecastSmoothingMonths = forecastSmoothingEnabled
        ? parseForecastSmoothingMonthsInput(incomeForm.forecastSmoothingMonths)
        : undefined

      await addIncome({
        source: incomeForm.source,
        ...parsedAmounts,
        cadence: incomeForm.cadence,
        customInterval,
        customUnit: isCustomCadence(incomeForm.cadence) ? incomeForm.customUnit : undefined,
        forecastSmoothingEnabled,
        forecastSmoothingMonths,
        destinationAccountId: parseOptionalAccountId(incomeForm.destinationAccountId),
        receivedDay: incomeForm.receivedDay ? parseIntInput(incomeForm.receivedDay, 'Received day') : undefined,
        payDateAnchor: parseOptionalIsoDateInput(incomeForm.payDateAnchor, 'Pay date anchor'),
        employerNote: incomeForm.employerNote || undefined,
        notes: incomeForm.notes || undefined,
      })

      setIncomeForm(initialIncomeForm)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onDeleteIncome = async (id: IncomeId) => {
    clearError()
    try {
      if (incomeEditId === id) {
        setIncomeEditId(null)
      }
      await removeIncome({ id })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onAddIncomeChangeEvent = async (input: {
    incomeId: IncomeId
    effectiveDate: string
    newAmount: string
    note: string
  }) => {
    clearError()
    try {
      const effectiveDate = input.effectiveDate.trim()
      if (!isValidIsoDate(effectiveDate)) {
        throw new Error('Effective date must use YYYY-MM-DD format.')
      }

      const newAmount = parseFloatInput(input.newAmount, 'New salary amount')
      if (!Number.isFinite(newAmount) || newAmount <= 0) {
        throw new Error('New salary amount must be greater than 0.')
      }

      await addIncomeChangeEvent({
        incomeId: input.incomeId,
        effectiveDate,
        newAmount: roundCurrency(newAmount),
        note: input.note.trim() || undefined,
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onDeleteIncomeChangeEvent = async (id: IncomeChangeEventId) => {
    clearError()
    try {
      await removeIncomeChangeEvent({ id })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const startIncomeEdit = (entry: IncomeEntry) => {
    setIncomeEditId(entry._id)
    setIncomeEditDraft({
      source: entry.source,
      amount: String(entry.amount),
      actualAmount: entry.actualAmount !== undefined ? String(entry.actualAmount) : '',
      grossAmount: entry.grossAmount !== undefined ? String(entry.grossAmount) : '',
      taxAmount: entry.taxAmount !== undefined ? String(entry.taxAmount) : '',
      nationalInsuranceAmount: entry.nationalInsuranceAmount !== undefined ? String(entry.nationalInsuranceAmount) : '',
      pensionAmount: entry.pensionAmount !== undefined ? String(entry.pensionAmount) : '',
      cadence: entry.cadence,
      customInterval: entry.customInterval ? String(entry.customInterval) : '',
      customUnit: entry.customUnit ?? 'weeks',
      forecastSmoothingEnabled: entry.forecastSmoothingEnabled ?? false,
      forecastSmoothingMonths: String(entry.forecastSmoothingMonths ?? 6),
      destinationAccountId: entry.destinationAccountId ? String(entry.destinationAccountId) : '',
      receivedDay: entry.receivedDay ? String(entry.receivedDay) : '',
      payDateAnchor: entry.payDateAnchor ?? '',
      employerNote: entry.employerNote ?? '',
      notes: entry.notes ?? '',
    })
  }

  const saveIncomeEdit = async () => {
    if (!incomeEditId) return

    clearError()
    try {
      const customInterval = isCustomCadence(incomeEditDraft.cadence)
        ? parseCustomInterval(incomeEditDraft.customInterval)
        : undefined
      const parsedAmounts = parseIncomeAmounts(incomeEditDraft)
      const forecastSmoothingEnabled = incomeEditDraft.forecastSmoothingEnabled
      const forecastSmoothingMonths = forecastSmoothingEnabled
        ? parseForecastSmoothingMonthsInput(incomeEditDraft.forecastSmoothingMonths)
        : undefined

      await updateIncome({
        id: incomeEditId,
        source: incomeEditDraft.source,
        ...parsedAmounts,
        cadence: incomeEditDraft.cadence,
        customInterval,
        customUnit: isCustomCadence(incomeEditDraft.cadence) ? incomeEditDraft.customUnit : undefined,
        forecastSmoothingEnabled,
        forecastSmoothingMonths,
        destinationAccountId: parseOptionalAccountId(incomeEditDraft.destinationAccountId),
        receivedDay: incomeEditDraft.receivedDay
          ? parseIntInput(incomeEditDraft.receivedDay, 'Received day')
          : undefined,
        payDateAnchor: parseOptionalIsoDateInput(incomeEditDraft.payDateAnchor, 'Pay date anchor'),
        employerNote: incomeEditDraft.employerNote || undefined,
        notes: incomeEditDraft.notes || undefined,
      })
      setIncomeEditId(null)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onUpsertIncomePaymentCheck = async (input: {
    incomeId: IncomeId
    cycleMonth: string
    status: IncomePaymentStatus
    receivedDay: string
    receivedAmount: string
    paymentReference: string
    payslipReference: string
    note: string
  }) => {
    clearError()
    try {
      const cycleMonth = input.cycleMonth.trim()
      if (!/^\d{4}-\d{2}$/.test(cycleMonth)) {
        throw new Error('Cycle month must use YYYY-MM format.')
      }

      await upsertIncomePaymentCheck({
        incomeId: input.incomeId,
        cycleMonth,
        status: input.status,
        receivedDay: input.receivedDay.trim() ? parseIntInput(input.receivedDay, 'Received day') : undefined,
        receivedAmount: parseOptionalNonNegativeFloat(input.receivedAmount, 'Received amount'),
        paymentReference: input.paymentReference.trim() || undefined,
        payslipReference: input.payslipReference.trim() || undefined,
        note: input.note.trim() || undefined,
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onBulkUpsertIncomePaymentChecks = async (input: {
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
  }) => {
    clearError()
    try {
      const cycleMonth = input.cycleMonth.trim()
      if (!/^\d{4}-\d{2}$/.test(cycleMonth)) {
        throw new Error('Cycle month must use YYYY-MM format.')
      }

      if (input.entries.length === 0) {
        throw new Error('Add at least one entry to bulk save.')
      }

      await bulkUpsertIncomePaymentChecks({
        cycleMonth,
        entries: input.entries.map((entry) => ({
          incomeId: entry.incomeId,
          status: entry.status,
          receivedDay: entry.receivedDay.trim() ? parseIntInput(entry.receivedDay, 'Received day') : undefined,
          receivedAmount: parseOptionalNonNegativeFloat(entry.receivedAmount, 'Received amount'),
          paymentReference: entry.paymentReference.trim() || undefined,
          payslipReference: entry.payslipReference.trim() || undefined,
          note: entry.note.trim() || undefined,
        })),
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onDeleteIncomePaymentCheck = async (id: IncomePaymentCheckId) => {
    clearError()
    try {
      await removeIncomePaymentCheck({ id })
    } catch (error) {
      handleMutationError(error)
    }
  }

  return {
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
    startIncomeEdit,
    saveIncomeEdit,
    onUpsertIncomePaymentCheck,
    onBulkUpsertIncomePaymentChecks,
    onDeleteIncomePaymentCheck,
    incomes,
  }
}
