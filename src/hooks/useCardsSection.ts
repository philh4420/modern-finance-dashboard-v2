import { useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { CardEditDraft, CardEntry, CardForm, CardId } from '../components/financeTypes'
import { parseFloatInput, parseIntInput } from '../lib/financeHelpers'
import type { MutationHandlers } from './useMutationFeedback'

type UseCardsSectionArgs = {
  cards: CardEntry[]
} & MutationHandlers

const initialCardForm: CardForm = {
  name: '',
  creditLimit: '',
  usedLimit: '',
  allowOverLimitOverride: false,
  statementBalance: '',
  pendingCharges: '',
  minimumPaymentType: 'fixed',
  minimumPayment: '',
  minimumPaymentPercent: '',
  extraPayment: '0',
  spendPerMonth: '',
  interestRate: '',
  statementDay: '1',
  dueDay: '21',
}

const initialCardEditDraft: CardEditDraft = {
  name: '',
  creditLimit: '',
  usedLimit: '',
  allowOverLimitOverride: false,
  statementBalance: '',
  pendingCharges: '',
  minimumPaymentType: 'fixed',
  minimumPayment: '',
  minimumPaymentPercent: '',
  extraPayment: '0',
  spendPerMonth: '',
  interestRate: '',
  statementDay: '1',
  dueDay: '21',
}

export const useCardsSection = ({ cards, clearError, handleMutationError }: UseCardsSectionArgs) => {
  const addCard = useMutation(api.finance.addCard)
  const updateCard = useMutation(api.finance.updateCard)
  const removeCard = useMutation(api.finance.removeCard)
  const addCardCharge = useMutation(api.finance.addCardCharge)
  const recordCardPayment = useMutation(api.finance.recordCardPayment)
  const transferCardBalance = useMutation(api.finance.transferCardBalance)

  const [cardForm, setCardForm] = useState<CardForm>(initialCardForm)
  const [cardEditId, setCardEditId] = useState<CardId | null>(null)
  const [cardEditDraft, setCardEditDraft] = useState<CardEditDraft>(initialCardEditDraft)

  const onAddCard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    try {
      const minimumPaymentType = cardForm.minimumPaymentType
      await addCard({
        name: cardForm.name,
        creditLimit: parseFloatInput(cardForm.creditLimit, 'Credit limit'),
        usedLimit: parseFloatInput(cardForm.usedLimit, 'Used limit'),
        allowOverLimitOverride: cardForm.allowOverLimitOverride,
        statementBalance: cardForm.statementBalance
          ? parseFloatInput(cardForm.statementBalance, 'Statement balance')
          : undefined,
        pendingCharges: cardForm.pendingCharges
          ? parseFloatInput(cardForm.pendingCharges, 'Pending charges')
          : undefined,
        minimumPaymentType,
        minimumPayment:
          minimumPaymentType === 'fixed'
            ? parseFloatInput(cardForm.minimumPayment, 'Minimum payment')
            : 0,
        minimumPaymentPercent:
          minimumPaymentType === 'percent_plus_interest'
            ? parseFloatInput(cardForm.minimumPaymentPercent, 'Minimum payment %')
            : undefined,
        extraPayment: cardForm.extraPayment ? parseFloatInput(cardForm.extraPayment, 'Extra payment') : 0,
        spendPerMonth: parseFloatInput(cardForm.spendPerMonth, 'Spend per month'),
        interestRate: cardForm.interestRate ? parseFloatInput(cardForm.interestRate, 'Card APR') : undefined,
        statementDay: parseIntInput(cardForm.statementDay, 'Statement day'),
        dueDay: parseIntInput(cardForm.dueDay, 'Due day'),
      })

      setCardForm(initialCardForm)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onDeleteCard = async (id: CardId) => {
    clearError()
    try {
      if (cardEditId === id) {
        setCardEditId(null)
      }
      await removeCard({ id })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const startCardEdit = (entry: CardEntry) => {
    setCardEditId(entry._id)
    setCardEditDraft({
      name: entry.name,
      creditLimit: String(entry.creditLimit),
      usedLimit: String(entry.usedLimit),
      allowOverLimitOverride: false,
      statementBalance: String(entry.statementBalance ?? entry.usedLimit),
      pendingCharges: String(entry.pendingCharges ?? Math.max(entry.usedLimit - (entry.statementBalance ?? entry.usedLimit), 0)),
      minimumPaymentType: entry.minimumPaymentType ?? 'fixed',
      minimumPayment: String(entry.minimumPayment),
      minimumPaymentPercent: entry.minimumPaymentPercent !== undefined ? String(entry.minimumPaymentPercent) : '',
      extraPayment: String(entry.extraPayment ?? 0),
      spendPerMonth: String(entry.spendPerMonth),
      interestRate: entry.interestRate !== undefined ? String(entry.interestRate) : '',
      statementDay: String(entry.statementDay ?? 1),
      dueDay: String(entry.dueDay ?? 21),
    })
  }

  const saveCardEdit = async () => {
    if (!cardEditId) return

    clearError()
    try {
      const minimumPaymentType = cardEditDraft.minimumPaymentType
      await updateCard({
        id: cardEditId,
        name: cardEditDraft.name,
        creditLimit: parseFloatInput(cardEditDraft.creditLimit, 'Credit limit'),
        usedLimit: parseFloatInput(cardEditDraft.usedLimit, 'Used limit'),
        allowOverLimitOverride: cardEditDraft.allowOverLimitOverride,
        statementBalance: cardEditDraft.statementBalance
          ? parseFloatInput(cardEditDraft.statementBalance, 'Statement balance')
          : undefined,
        pendingCharges: cardEditDraft.pendingCharges
          ? parseFloatInput(cardEditDraft.pendingCharges, 'Pending charges')
          : undefined,
        minimumPaymentType,
        minimumPayment:
          minimumPaymentType === 'fixed'
            ? parseFloatInput(cardEditDraft.minimumPayment, 'Minimum payment')
            : 0,
        minimumPaymentPercent:
          minimumPaymentType === 'percent_plus_interest'
            ? parseFloatInput(cardEditDraft.minimumPaymentPercent, 'Minimum payment %')
            : undefined,
        extraPayment: cardEditDraft.extraPayment ? parseFloatInput(cardEditDraft.extraPayment, 'Extra payment') : 0,
        spendPerMonth: parseFloatInput(cardEditDraft.spendPerMonth, 'Spend per month'),
        interestRate: cardEditDraft.interestRate ? parseFloatInput(cardEditDraft.interestRate, 'Card APR') : undefined,
        statementDay: parseIntInput(cardEditDraft.statementDay, 'Statement day'),
        dueDay: parseIntInput(cardEditDraft.dueDay, 'Due day'),
      })
      setCardEditId(null)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onQuickAddCharge = async (id: CardId, amount: number, allowOverLimitOverride = false) => {
    clearError()
    try {
      await addCardCharge({ id, amount, allowOverLimitOverride })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onQuickRecordPayment = async (id: CardId, amount: number) => {
    clearError()
    try {
      await recordCardPayment({ id, amount })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onQuickTransferBalance = async (
    fromCardId: CardId,
    toCardId: CardId,
    amount: number,
    allowOverLimitOverride = false,
  ) => {
    clearError()
    try {
      await transferCardBalance({ fromCardId, toCardId, amount, allowOverLimitOverride })
    } catch (error) {
      handleMutationError(error)
    }
  }

  return {
    cardForm,
    setCardForm,
    cardEditId,
    setCardEditId,
    cardEditDraft,
    setCardEditDraft,
    onAddCard,
    onDeleteCard,
    startCardEdit,
    saveCardEdit,
    onQuickAddCharge,
    onQuickRecordPayment,
    onQuickTransferBalance,
    cards,
  }
}
