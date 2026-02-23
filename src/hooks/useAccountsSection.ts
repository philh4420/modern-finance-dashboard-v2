import { useEffect, useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type {
  AccountEditDraft,
  AccountEntry,
  AccountForm,
  AccountId,
  AccountReconciliationForm,
  AccountTransferForm,
} from '../components/financeTypes'
import { parseFloatInput, toIsoToday } from '../lib/financeHelpers'
import type { MutationHandlers } from './useMutationFeedback'

type UseAccountsSectionArgs = {
  accounts: AccountEntry[]
} & MutationHandlers

const initialAccountForm: AccountForm = {
  name: '',
  type: 'checking',
  purpose: 'spending',
  ledgerBalance: '',
  pendingBalance: '0',
  balance: '',
  liquid: true,
}

const initialAccountEditDraft: AccountEditDraft = {
  name: '',
  type: 'checking',
  purpose: 'spending',
  ledgerBalance: '',
  pendingBalance: '0',
  balance: '',
  liquid: true,
}

const initialTransferForm = (): AccountTransferForm => ({
  sourceAccountId: '',
  destinationAccountId: '',
  amount: '',
  transferDate: toIsoToday(),
  reference: '',
  note: '',
})

const initialReconciliationForm = (): AccountReconciliationForm => ({
  accountId: '',
  cycleMonth: new Date().toISOString().slice(0, 7),
  statementStartBalance: '',
  statementEndBalance: '',
  reconciled: true,
  applyAdjustment: false,
  note: '',
})

export const useAccountsSection = ({ accounts, clearError, handleMutationError }: UseAccountsSectionArgs) => {
  const addAccount = useMutation(api.finance.addAccount)
  const updateAccount = useMutation(api.finance.updateAccount)
  const removeAccount = useMutation(api.finance.removeAccount)
  const addAccountTransfer = useMutation(api.finance.addAccountTransfer)
  const upsertAccountReconciliationCheck = useMutation(api.finance.upsertAccountReconciliationCheck)

  const [accountForm, setAccountForm] = useState<AccountForm>(initialAccountForm)
  const [accountEditId, setAccountEditId] = useState<AccountId | null>(null)
  const [accountEditDraft, setAccountEditDraft] = useState<AccountEditDraft>(initialAccountEditDraft)
  const [accountTransferForm, setAccountTransferForm] = useState<AccountTransferForm>(initialTransferForm)
  const [accountReconciliationForm, setAccountReconciliationForm] = useState<AccountReconciliationForm>(
    initialReconciliationForm,
  )

  useEffect(() => {
    const availableIds = new Set(accounts.map((entry) => String(entry._id)))
    const firstId = accounts[0]?._id ? String(accounts[0]._id) : ''

    setAccountTransferForm((prev) => {
      const nextSource = availableIds.has(prev.sourceAccountId) ? prev.sourceAccountId : firstId
      const nextDestination = availableIds.has(prev.destinationAccountId) ? prev.destinationAccountId : ''
      const normalizedDestination = nextDestination === nextSource ? '' : nextDestination

      if (prev.sourceAccountId === nextSource && prev.destinationAccountId === normalizedDestination) {
        return prev
      }

      return {
        ...prev,
        sourceAccountId: nextSource,
        destinationAccountId: normalizedDestination,
      }
    })

    setAccountReconciliationForm((prev) => {
      const nextAccountId = availableIds.has(prev.accountId) ? prev.accountId : firstId
      if (prev.accountId === nextAccountId) {
        return prev
      }

      return {
        ...prev,
        accountId: nextAccountId,
      }
    })
  }, [accounts])

  const onAddAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    try {
      const ledgerBalance = parseFloatInput(accountForm.ledgerBalance, 'Account ledger balance')
      const pendingBalance = parseFloatInput(accountForm.pendingBalance || '0', 'Account pending balance')
      const balance = ledgerBalance + pendingBalance

      await addAccount({
        name: accountForm.name,
        type: accountForm.type,
        purpose: accountForm.purpose,
        ledgerBalance,
        pendingBalance,
        balance,
        liquid: accountForm.liquid,
      })

      setAccountForm(initialAccountForm)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const onDeleteAccount = async (id: AccountId) => {
    clearError()
    try {
      if (accountEditId === id) {
        setAccountEditId(null)
      }
      await removeAccount({ id })
    } catch (error) {
      handleMutationError(error)
    }
  }

  const startAccountEdit = (entry: AccountEntry) => {
    setAccountEditId(entry._id)
    setAccountEditDraft({
      name: entry.name,
      type: entry.type,
      purpose: entry.purpose ?? (entry.type === 'debt' ? 'debt' : 'spending'),
      ledgerBalance: String(entry.ledgerBalance ?? entry.balance),
      pendingBalance: String(entry.pendingBalance ?? 0),
      balance: String(entry.balance),
      liquid: entry.liquid,
    })
  }

  const saveAccountEdit = async () => {
    if (!accountEditId) return

    clearError()
    try {
      const ledgerBalance = parseFloatInput(accountEditDraft.ledgerBalance, 'Account ledger balance')
      const pendingBalance = parseFloatInput(accountEditDraft.pendingBalance || '0', 'Account pending balance')
      const balance = ledgerBalance + pendingBalance

      await updateAccount({
        id: accountEditId,
        name: accountEditDraft.name,
        type: accountEditDraft.type,
        purpose: accountEditDraft.purpose,
        ledgerBalance,
        pendingBalance,
        balance,
        liquid: accountEditDraft.liquid,
      })
      setAccountEditId(null)
    } catch (error) {
      handleMutationError(error)
    }
  }

  const submitAccountTransfer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    try {
      if (accountTransferForm.sourceAccountId.length === 0) {
        throw new Error('Select a source account.')
      }
      if (accountTransferForm.destinationAccountId.length === 0) {
        throw new Error('Select a destination account.')
      }
      if (accountTransferForm.sourceAccountId === accountTransferForm.destinationAccountId) {
        throw new Error('Source and destination must be different accounts.')
      }

      const amount = parseFloatInput(accountTransferForm.amount, 'Transfer amount')
      if (amount <= 0) {
        throw new Error('Transfer amount must be greater than 0.')
      }

      await addAccountTransfer({
        sourceAccountId: accountTransferForm.sourceAccountId as AccountId,
        destinationAccountId: accountTransferForm.destinationAccountId as AccountId,
        amount,
        transferDate: accountTransferForm.transferDate,
        reference: accountTransferForm.reference || undefined,
        note: accountTransferForm.note || undefined,
      })

      setAccountTransferForm((prev) => ({
        ...initialTransferForm(),
        sourceAccountId: prev.sourceAccountId,
        destinationAccountId: prev.destinationAccountId,
      }))
    } catch (error) {
      handleMutationError(error)
    }
  }

  const submitAccountReconciliation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()

    try {
      if (accountReconciliationForm.accountId.length === 0) {
        throw new Error('Select an account to reconcile.')
      }
      if (!/^\d{4}-\d{2}$/.test(accountReconciliationForm.cycleMonth)) {
        throw new Error('Cycle month must use YYYY-MM format.')
      }

      const statementStartBalance = parseFloatInput(
        accountReconciliationForm.statementStartBalance,
        'Statement start balance',
      )
      const statementEndBalance = parseFloatInput(accountReconciliationForm.statementEndBalance, 'Statement end balance')

      await upsertAccountReconciliationCheck({
        accountId: accountReconciliationForm.accountId as AccountId,
        cycleMonth: accountReconciliationForm.cycleMonth,
        statementStartBalance,
        statementEndBalance,
        reconciled: accountReconciliationForm.reconciled,
        applyAdjustment: accountReconciliationForm.applyAdjustment,
        note: accountReconciliationForm.note || undefined,
      })

      setAccountReconciliationForm((prev) => ({
        ...prev,
        statementStartBalance: '',
        statementEndBalance: '',
        note: '',
        applyAdjustment: false,
      }))
    } catch (error) {
      handleMutationError(error)
    }
  }

  return {
    accountForm,
    setAccountForm,
    accountEditId,
    setAccountEditId,
    accountEditDraft,
    setAccountEditDraft,
    onAddAccount,
    onDeleteAccount,
    startAccountEdit,
    saveAccountEdit,
    accountTransferForm,
    setAccountTransferForm,
    submitAccountTransfer,
    accountReconciliationForm,
    setAccountReconciliationForm,
    submitAccountReconciliation,
    accounts,
  }
}
