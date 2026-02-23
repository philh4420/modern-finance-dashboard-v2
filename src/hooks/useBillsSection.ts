import { useEffect, useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type {
  AccountId,
  BillEditDraft,
  BillEntry,
  BillForm,
  BillId,
  BillPaymentCheckId,
  FinancePreference,
} from '../components/financeTypes'
import { isCustomCadence, parseCustomInterval, parseFloatInput, parseIntInput } from '../lib/financeHelpers'
import type { MutationHandlers } from './useMutationFeedback'

type UseBillsSectionArgs = {
  bills: BillEntry[]
  preference?: FinancePreference
} & MutationHandlers

const initialBillForm: BillForm = {
  name: '',
  amount: '',
  dueDay: '',
  cadence: 'monthly',
  customInterval: '',
  customUnit: 'weeks',
  category: 'other',
  scope: 'shared',
  deductible: false,
  isSubscription: false,
  cancelReminderDays: '7',
  linkedAccountId: '',
  autopay: true,
  notes: '',
}

const initialBillEditDraft: BillEditDraft = {
  name: '',
  amount: '',
  dueDay: '',
  cadence: 'monthly',
  customInterval: '',
  customUnit: 'weeks',
  category: 'other',
  scope: 'shared',
  deductible: false,
  isSubscription: false,
  cancelReminderDays: '7',
  linkedAccountId: '',
  autopay: false,
  notes: '',
}

const buildInitialBillForm = (preference?: FinancePreference): BillForm => ({
  ...initialBillForm,
  category: preference?.defaultBillCategory ?? initialBillForm.category,
  scope: preference?.defaultBillScope ?? initialBillForm.scope,
  notes: preference?.billNotesTemplate ?? initialBillForm.notes,
})

const isBillFormUntouched = (form: BillForm) =>
  form.name.trim().length === 0 &&
  form.amount.trim().length === 0 &&
  form.dueDay.trim().length === 0 &&
  form.cadence === initialBillForm.cadence &&
  form.customInterval.trim().length === 0 &&
  form.customUnit === initialBillForm.customUnit &&
  form.deductible === initialBillForm.deductible &&
  form.isSubscription === initialBillForm.isSubscription &&
  form.cancelReminderDays === initialBillForm.cancelReminderDays &&
  form.linkedAccountId.trim().length === 0 &&
  form.autopay === initialBillForm.autopay

export const useBillsSection = ({ bills, preference, clearError, handleMutationError }: UseBillsSectionArgs) => {
  const addBill = useMutation(api.finance.addBill)
  const updateBill = useMutation(api.finance.updateBill)
  const removeBill = useMutation(api.finance.removeBill)
  const upsertBillPaymentCheck = useMutation(api.finance.upsertBillPaymentCheck)
  const removeBillPaymentCheck = useMutation(api.finance.removeBillPaymentCheck)
  const resolveBillDuplicateOverlap = useMutation(api.finance.resolveBillDuplicateOverlap)
  const runBillsMonthlyBulkAction = useMutation(api.finance.runBillsMonthlyBulkAction)

  const [billForm, setBillForm] = useState<BillForm>(() => buildInitialBillForm(preference))
  const [billEditId, setBillEditId] = useState<BillId | null>(null)
  const [billEditDraft, setBillEditDraft] = useState<BillEditDraft>(initialBillEditDraft)

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setBillForm((previous) => {
        if (!isBillFormUntouched(previous)) {
          return previous
        }
        return {
          ...previous,
          category: preference?.defaultBillCategory ?? initialBillForm.category,
          scope: preference?.defaultBillScope ?? initialBillForm.scope,
          notes: preference?.billNotesTemplate ?? initialBillForm.notes,
        }
      })
    }, 0)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [preference?.billNotesTemplate, preference?.defaultBillCategory, preference?.defaultBillScope])

  const onAddBill = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    try {
      const customInterval = isCustomCadence(billForm.cadence) ? parseCustomInterval(billForm.customInterval) : undefined
      const cancelReminderDays =
        billForm.isSubscription && billForm.cancelReminderDays.trim().length > 0
          ? parseIntInput(billForm.cancelReminderDays, 'Cancel reminder days')
          : undefined

      await addBill({
        name: billForm.name,
        amount: parseFloatInput(billForm.amount, 'Bill amount'),
        dueDay: parseIntInput(billForm.dueDay, 'Due day'),
        cadence: billForm.cadence,
        customInterval,
        customUnit: isCustomCadence(billForm.cadence) ? billForm.customUnit : undefined,
        category: billForm.category,
        scope: billForm.scope,
        deductible: billForm.deductible,
        isSubscription: billForm.isSubscription,
        cancelReminderDays,
        linkedAccountId: billForm.linkedAccountId ? (billForm.linkedAccountId as AccountId) : undefined,
        autopay: billForm.autopay,
        notes: billForm.notes || undefined,
      })

      setBillForm(buildInitialBillForm(preference))
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onDeleteBill = async (id: BillId) => {
    clearError()
    try {
      if (billEditId === id) {
        setBillEditId(null)
      }
      await removeBill({ id })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const startBillEdit = (entry: BillEntry) => {
    setBillEditId(entry._id)
    setBillEditDraft({
      name: entry.name,
      amount: String(entry.amount),
      dueDay: String(entry.dueDay),
      cadence: entry.cadence,
      customInterval: entry.customInterval ? String(entry.customInterval) : '',
      customUnit: entry.customUnit ?? 'weeks',
      category: entry.category ?? 'other',
      scope: entry.scope ?? 'shared',
      deductible: entry.deductible ?? false,
      isSubscription: entry.isSubscription ?? false,
      cancelReminderDays: String(entry.cancelReminderDays ?? 7),
      linkedAccountId: entry.linkedAccountId ? String(entry.linkedAccountId) : '',
      autopay: entry.autopay,
      notes: entry.notes ?? '',
    })
  }

  const saveBillEdit = async () => {
    if (!billEditId) return

    clearError()
    try {
      const customInterval = isCustomCadence(billEditDraft.cadence)
        ? parseCustomInterval(billEditDraft.customInterval)
        : undefined
      const cancelReminderDays =
        billEditDraft.isSubscription && billEditDraft.cancelReminderDays.trim().length > 0
          ? parseIntInput(billEditDraft.cancelReminderDays, 'Cancel reminder days')
          : undefined

      await updateBill({
        id: billEditId,
        name: billEditDraft.name,
        amount: parseFloatInput(billEditDraft.amount, 'Bill amount'),
        dueDay: parseIntInput(billEditDraft.dueDay, 'Due day'),
        cadence: billEditDraft.cadence,
        customInterval,
        customUnit: isCustomCadence(billEditDraft.cadence) ? billEditDraft.customUnit : undefined,
        category: billEditDraft.category,
        scope: billEditDraft.scope,
        deductible: billEditDraft.deductible,
        isSubscription: billEditDraft.isSubscription,
        cancelReminderDays,
        linkedAccountId: billEditDraft.linkedAccountId ? (billEditDraft.linkedAccountId as AccountId) : undefined,
        autopay: billEditDraft.autopay,
        notes: billEditDraft.notes || undefined,
      })
      setBillEditId(null)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onUpsertBillPaymentCheck = async (args: {
    billId: BillId
    cycleMonth: string
    expectedAmount: string
    actualAmount?: string
    paidDay?: string
    note?: string
  }) => {
    clearError()
    try {
      const expectedAmount = parseFloatInput(args.expectedAmount, 'Planned amount')
      const actualAmountText = args.actualAmount?.trim() ?? ''
      const paidDayText = args.paidDay?.trim() ?? ''

      const actualAmount = actualAmountText.length > 0 ? parseFloatInput(actualAmountText, 'Actual paid amount') : undefined
      const paidDay = paidDayText.length > 0 ? parseIntInput(paidDayText, 'Paid day') : undefined

      await upsertBillPaymentCheck({
        billId: args.billId,
        cycleMonth: args.cycleMonth.trim(),
        expectedAmount,
        actualAmount,
        paidDay,
        note: args.note?.trim() || undefined,
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onDeleteBillPaymentCheck = async (id: BillPaymentCheckId) => {
    clearError()
    try {
      await removeBillPaymentCheck({ id })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onResolveBillDuplicateOverlap = async (args: {
    primaryBillId: BillId
    secondaryBillId: BillId
    resolution: 'merge' | 'archive_duplicate' | 'mark_intentional'
  }) => {
    clearError()
    try {
      await resolveBillDuplicateOverlap({
        primaryBillId: args.primaryBillId,
        secondaryBillId: args.secondaryBillId,
        resolution: args.resolution,
      })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onRunBillsMonthlyBulkAction = async (args: {
    action: 'roll_recurring_forward' | 'mark_all_paid_from_account' | 'reconcile_batch'
    cycleMonth: string
    fundingAccountId?: AccountId
  }) => {
    clearError()
    try {
      return await runBillsMonthlyBulkAction({
        action: args.action,
        cycleMonth: args.cycleMonth,
        fundingAccountId: args.fundingAccountId,
      })
    } catch (error) {
      handleMutationError(error)
      throw error
    }
  }

  return {
    billForm,
    setBillForm,
    billEditId,
    setBillEditId,
    billEditDraft,
    setBillEditDraft,
    onAddBill,
    onDeleteBill,
    onUpsertBillPaymentCheck,
    onDeleteBillPaymentCheck,
    onResolveBillDuplicateOverlap,
    onRunBillsMonthlyBulkAction,
    startBillEdit,
    saveBillEdit,
    bills,
  }
}
