import { useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { LoanEditDraft, LoanEntry, LoanForm, LoanId } from '../components/financeTypes'
import { isCustomCadence, parseCustomInterval, parseFloatInput, parseIntInput } from '../lib/financeHelpers'
import type { MutationHandlers } from './useMutationFeedback'

type UseLoansSectionArgs = {
  loans: LoanEntry[]
} & MutationHandlers

const initialLoanForm: LoanForm = {
  name: '',
  balance: '',
  principalBalance: '',
  accruedInterest: '',
  minimumPaymentType: 'fixed',
  minimumPayment: '',
  minimumPaymentPercent: '',
  extraPayment: '0',
  subscriptionCost: '',
  subscriptionPaymentCount: '12',
  interestRate: '',
  dueDay: '',
  cadence: 'monthly',
  customInterval: '',
  customUnit: 'weeks',
  notes: '',
}

const initialLoanEditDraft: LoanEditDraft = {
  name: '',
  balance: '',
  principalBalance: '',
  accruedInterest: '',
  minimumPaymentType: 'fixed',
  minimumPayment: '',
  minimumPaymentPercent: '',
  extraPayment: '0',
  subscriptionCost: '',
  subscriptionPaymentCount: '12',
  interestRate: '',
  dueDay: '',
  cadence: 'monthly',
  customInterval: '',
  customUnit: 'weeks',
  notes: '',
}

export const useLoansSection = ({ loans, clearError, handleMutationError }: UseLoansSectionArgs) => {
  const addLoan = useMutation(api.finance.addLoan)
  const updateLoan = useMutation(api.finance.updateLoan)
  const removeLoan = useMutation(api.finance.removeLoan)
  const addLoanCharge = useMutation(api.finance.addLoanCharge)
  const recordLoanPayment = useMutation(api.finance.recordLoanPayment)
  const applyLoanInterestNow = useMutation(api.finance.applyLoanInterestNow)
  const applyLoanSubscriptionNow = useMutation(api.finance.applyLoanSubscriptionNow)

  const [loanForm, setLoanForm] = useState<LoanForm>(initialLoanForm)
  const [loanEditId, setLoanEditId] = useState<LoanId | null>(null)
  const [loanEditDraft, setLoanEditDraft] = useState<LoanEditDraft>(initialLoanEditDraft)

  const parseOptionalFloat = (value: string, label: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      return undefined
    }
    return parseFloatInput(trimmed, label)
  }

  const parseOptionalPositiveInt = (value: string, label: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      return undefined
    }
    const parsed = parseIntInput(trimmed, label)
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error(`${label} must be an integer greater than 0.`)
    }
    return parsed
  }

  const parseMinimumPayment = (input: {
    minimumPaymentType: LoanForm['minimumPaymentType']
    minimumPayment: string
  }) =>
    input.minimumPaymentType === 'fixed'
      ? parseFloatInput(input.minimumPayment, 'Loan minimum payment')
      : input.minimumPayment.trim().length > 0
        ? parseFloatInput(input.minimumPayment, 'Loan minimum payment')
        : 0

  const onAddLoan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    try {
      const customInterval = isCustomCadence(loanForm.cadence) ? parseCustomInterval(loanForm.customInterval) : undefined

      await addLoan({
        name: loanForm.name,
        balance: parseFloatInput(loanForm.balance, 'Loan balance'),
        principalBalance: parseOptionalFloat(loanForm.principalBalance, 'Loan principal balance'),
        accruedInterest: parseOptionalFloat(loanForm.accruedInterest, 'Loan accrued interest'),
        minimumPaymentType: loanForm.minimumPaymentType,
        minimumPayment: parseMinimumPayment(loanForm),
        minimumPaymentPercent:
          loanForm.minimumPaymentType === 'percent_plus_interest'
            ? parseFloatInput(loanForm.minimumPaymentPercent, 'Loan minimum payment %')
            : undefined,
        extraPayment: parseOptionalFloat(loanForm.extraPayment, 'Loan extra payment') ?? 0,
        subscriptionCost: parseOptionalFloat(loanForm.subscriptionCost, 'Loan subscription cost'),
        subscriptionPaymentCount: parseOptionalPositiveInt(
          loanForm.subscriptionPaymentCount,
          'Loan subscription payments left',
        ),
        interestRate: parseOptionalFloat(loanForm.interestRate, 'Loan APR'),
        dueDay: parseIntInput(loanForm.dueDay, 'Due day'),
        cadence: loanForm.cadence,
        customInterval,
        customUnit: isCustomCadence(loanForm.cadence) ? loanForm.customUnit : undefined,
        notes: loanForm.notes || undefined,
      })

      setLoanForm(initialLoanForm)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onDeleteLoan = async (id: LoanId) => {
    clearError()
    try {
      if (loanEditId === id) {
        setLoanEditId(null)
      }
      await removeLoan({ id })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const startLoanEdit = (entry: LoanEntry) => {
    setLoanEditId(entry._id)
    setLoanEditDraft({
      name: entry.name,
      balance: String(entry.balance),
      principalBalance: String(entry.principalBalance ?? entry.balance),
      accruedInterest: String(entry.accruedInterest ?? 0),
      minimumPaymentType: entry.minimumPaymentType ?? 'fixed',
      minimumPayment: String(entry.minimumPayment),
      minimumPaymentPercent: entry.minimumPaymentPercent !== undefined ? String(entry.minimumPaymentPercent) : '',
      extraPayment: String(entry.extraPayment ?? 0),
      subscriptionCost: entry.subscriptionCost !== undefined ? String(entry.subscriptionCost) : '',
      subscriptionPaymentCount:
        entry.subscriptionPaymentCount !== undefined
          ? String(entry.subscriptionPaymentCount)
          : entry.subscriptionCost !== undefined && entry.subscriptionCost > 0
            ? '12'
            : '',
      interestRate: entry.interestRate !== undefined ? String(entry.interestRate) : '',
      dueDay: String(entry.dueDay),
      cadence: entry.cadence,
      customInterval: entry.customInterval ? String(entry.customInterval) : '',
      customUnit: entry.customUnit ?? 'weeks',
      notes: entry.notes ?? '',
    })
  }

  const saveLoanEdit = async () => {
    if (!loanEditId) return

    clearError()
    try {
      const customInterval = isCustomCadence(loanEditDraft.cadence)
        ? parseCustomInterval(loanEditDraft.customInterval)
        : undefined

      await updateLoan({
        id: loanEditId,
        name: loanEditDraft.name,
        balance: parseFloatInput(loanEditDraft.balance, 'Loan balance'),
        principalBalance: parseOptionalFloat(loanEditDraft.principalBalance, 'Loan principal balance'),
        accruedInterest: parseOptionalFloat(loanEditDraft.accruedInterest, 'Loan accrued interest'),
        minimumPaymentType: loanEditDraft.minimumPaymentType,
        minimumPayment: parseMinimumPayment(loanEditDraft),
        minimumPaymentPercent:
          loanEditDraft.minimumPaymentType === 'percent_plus_interest'
            ? parseFloatInput(loanEditDraft.minimumPaymentPercent, 'Loan minimum payment %')
            : undefined,
        extraPayment: parseOptionalFloat(loanEditDraft.extraPayment, 'Loan extra payment') ?? 0,
        subscriptionCost: parseOptionalFloat(loanEditDraft.subscriptionCost, 'Loan subscription cost'),
        subscriptionPaymentCount: parseOptionalPositiveInt(
          loanEditDraft.subscriptionPaymentCount,
          'Loan subscription payments left',
        ),
        interestRate: parseOptionalFloat(loanEditDraft.interestRate, 'Loan APR'),
        dueDay: parseIntInput(loanEditDraft.dueDay, 'Due day'),
        cadence: loanEditDraft.cadence,
        customInterval,
        customUnit: isCustomCadence(loanEditDraft.cadence) ? loanEditDraft.customUnit : undefined,
        notes: loanEditDraft.notes || undefined,
      })
      setLoanEditId(null)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onQuickAddLoanCharge = async (id: LoanId, amount: number, notes?: string) => {
    clearError()
    try {
      await addLoanCharge({ id, amount, notes: notes?.trim() || undefined })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onQuickRecordLoanPayment = async (id: LoanId, amount: number, notes?: string) => {
    clearError()
    try {
      await recordLoanPayment({ id, amount, notes: notes?.trim() || undefined })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onQuickApplyLoanInterest = async (id: LoanId, notes?: string) => {
    clearError()
    try {
      await applyLoanInterestNow({ id, notes: notes?.trim() || undefined })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onQuickApplyLoanSubscription = async (id: LoanId, notes?: string) => {
    clearError()
    try {
      await applyLoanSubscriptionNow({ id, notes: notes?.trim() || undefined })
    } catch (error) {
      handleMutationError(error)
    }
  }

  return {
    loanForm,
    setLoanForm,
    loanEditId,
    setLoanEditId,
    loanEditDraft,
    setLoanEditDraft,
    onAddLoan,
    onDeleteLoan,
    startLoanEdit,
    saveLoanEdit,
    onQuickAddLoanCharge,
    onQuickRecordLoanPayment,
    onQuickApplyLoanInterest,
    onQuickApplyLoanSubscription,
    loans,
  }
}
