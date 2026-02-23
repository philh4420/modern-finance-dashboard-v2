import { v } from 'convex/values'
import { action, internalMutation, internalQuery, mutation, query } from './_generated/server'
import { requireIdentity } from './lib/authz'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { strToU8, zipSync } from 'fflate'

const consentTypeValidator = v.union(v.literal('diagnostics'), v.literal('analytics'))

const retentionPolicyKeyValidator = v.union(
  v.literal('exports'),
  v.literal('client_ops_metrics'),
  v.literal('cycle_audit_ledger'),
  v.literal('consent_logs'),
  v.literal('deletion_jobs'),
)

type DeletionTable =
  | 'incomePaymentChecks'
  | 'billPaymentChecks'
  | 'subscriptionPriceChanges'
  | 'incomeChangeEvents'
  | 'loanEvents'
  | 'loanCycleAuditEntries'
  | 'ledgerLines'
  | 'ledgerEntries'
  | 'financeAuditEvents'
  | 'monthCloseSnapshots'
  | 'monthlyCycleRuns'
  | 'purchaseMonthCloseRuns'
  | 'cycleAuditLogs'
  | 'cycleStepAlerts'
  | 'purchaseSplits'
  | 'purchases'
  | 'transactionRules'
  | 'envelopeBudgets'
  | 'planningMonthVersions'
  | 'planningActionTasks'
  | 'incomeAllocationRules'
  | 'incomeAllocationSuggestions'
  | 'purchaseSplitTemplates'
  | 'incomes'
  | 'bills'
  | 'cards'
  | 'loans'
  | 'accounts'
  | 'accountTransfers'
  | 'accountReconciliationChecks'
  | 'goals'
  | 'goalEvents'
  | 'financePreferences'
  | 'settingsProfiles'
  | 'userExportDownloads'
  | 'consentLogs'
  | 'consentSettings'
  | 'retentionPolicies'
  | 'clientOpsMetrics'

const deletionTableValidator = v.union(
  v.literal('incomePaymentChecks'),
  v.literal('billPaymentChecks'),
  v.literal('subscriptionPriceChanges'),
  v.literal('incomeChangeEvents'),
  v.literal('loanEvents'),
  v.literal('loanCycleAuditEntries'),
  v.literal('ledgerLines'),
  v.literal('ledgerEntries'),
  v.literal('financeAuditEvents'),
  v.literal('monthCloseSnapshots'),
  v.literal('monthlyCycleRuns'),
  v.literal('purchaseMonthCloseRuns'),
  v.literal('cycleAuditLogs'),
  v.literal('cycleStepAlerts'),
  v.literal('purchaseSplits'),
  v.literal('purchases'),
  v.literal('transactionRules'),
  v.literal('envelopeBudgets'),
  v.literal('planningMonthVersions'),
  v.literal('planningActionTasks'),
  v.literal('incomeAllocationRules'),
  v.literal('incomeAllocationSuggestions'),
  v.literal('purchaseSplitTemplates'),
  v.literal('incomes'),
  v.literal('bills'),
  v.literal('cards'),
  v.literal('loans'),
  v.literal('accounts'),
  v.literal('accountTransfers'),
  v.literal('accountReconciliationChecks'),
  v.literal('goals'),
  v.literal('goalEvents'),
  v.literal('financePreferences'),
  v.literal('settingsProfiles'),
  v.literal('userExportDownloads'),
  v.literal('consentLogs'),
  v.literal('consentSettings'),
  v.literal('retentionPolicies'),
  v.literal('clientOpsMetrics'),
)

const EXPORT_FORMAT_VERSION = 'finance_export_v1'
const CONSENT_VERSION = 'v1'

const nowPlusDays = (now: number, days: number) => now + days * 86400000

const safeJson = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return JSON.stringify({ error: 'Failed to serialize value.' }, null, 2)
  }
}

const csvEscape = (value: string) => {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replaceAll('"', '""')}"`
  }
  return value
}

const toCsv = (rows: Array<Record<string, unknown>>) => {
  if (rows.length === 0) {
    return ''
  }

  const headerSet = new Set<string>()
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => headerSet.add(key))
  })
  const headers = Array.from(headerSet).sort((a, b) => a.localeCompare(b))

  const lines: string[] = []
  lines.push(headers.map(csvEscape).join(','))

  rows.forEach((row) => {
    const line = headers
      .map((key) => {
        const raw = row[key]
        if (raw === undefined || raw === null) {
          return ''
        }
        if (typeof raw === 'string') {
          return csvEscape(raw)
        }
        if (typeof raw === 'number' || typeof raw === 'boolean') {
          return String(raw)
        }
        return csvEscape(safeJson(raw))
      })
      .join(',')
    lines.push(line)
  })

  return lines.join('\n')
}

const docsToPortableRows = <T extends { _id?: unknown }>(docs: T[]) =>
  docs.map((doc) => ({
    ...doc,
    _id: doc._id ? String(doc._id) : undefined,
  })) as Array<Record<string, unknown>>

const roundCurrency = (value: number) => Math.round(value * 100) / 100
const finiteOrZero = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
const clampPercent = (value: number) => Math.min(Math.max(value, 0), 100)

const toMonthlyAmount = (
  amount: number,
  cadence: string,
  customInterval?: number,
  customUnit?: string,
) => {
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
    default:
      return amount
  }
}

type LoanReportingBundle = {
  summaryRows: Array<Record<string, unknown>>
  amortizationRows: Array<Record<string, unknown>>
  interestTrendRows: Array<Record<string, unknown>>
  eventHistoryRows: Array<Record<string, unknown>>
  strategyRows: Array<Record<string, unknown>>
}

type AccountReportingBundle = {
  summaryRows: Array<Record<string, unknown>>
  transferRows: Array<Record<string, unknown>>
  reconciliationRows: Array<Record<string, unknown>>
  monthlyRows: Array<Record<string, unknown>>
}

const buildLoanReportingArtifacts = (payload: Record<string, Array<Record<string, unknown>>>): LoanReportingBundle => {
  const loans = payload.loans ?? []
  const loanEvents = payload.loanEvents ?? []

  const summaryRows: Array<Record<string, unknown>> = []
  const amortizationRows: Array<Record<string, unknown>> = []
  const interestTrendRows: Array<Record<string, unknown>> = []
  const eventHistoryRows: Array<Record<string, unknown>> = []

  const strategyCandidates: Array<{ loanId: string; name: string; apr: number; balance: number }> = []

  for (const loan of loans) {
    const loanId = String(loan._id ?? '')
    if (!loanId) continue

    const name = typeof loan.name === 'string' ? loan.name : 'Loan'
    const principalBase =
      loan.principalBalance !== undefined || loan.accruedInterest !== undefined
        ? Math.max(finiteOrZero(loan.principalBalance), 0)
        : Math.max(finiteOrZero(loan.balance), 0)
    const interestBase =
      loan.principalBalance !== undefined || loan.accruedInterest !== undefined
        ? Math.max(finiteOrZero(loan.accruedInterest), 0)
        : 0
    const subscriptionOutstanding = Math.max(finiteOrZero(loan.subscriptionOutstanding), 0)
    const subscriptionCost = Math.max(finiteOrZero(loan.subscriptionCost), 0)
    const minimumPaymentType = loan.minimumPaymentType === 'percent_plus_interest' ? 'percent_plus_interest' : 'fixed'
    const minimumPayment = Math.max(finiteOrZero(loan.minimumPayment), 0)
    const minimumPaymentPercent = clampPercent(finiteOrZero(loan.minimumPaymentPercent))
    const extraPayment = Math.max(finiteOrZero(loan.extraPayment), 0)
    const apr = Math.max(finiteOrZero(loan.interestRate), 0)
    const monthlyRate = apr > 0 ? apr / 100 / 12 : 0
    const cadence = typeof loan.cadence === 'string' ? loan.cadence : 'monthly'
    const customInterval = finiteOrZero(loan.customInterval) || undefined
    const customUnit = typeof loan.customUnit === 'string' ? loan.customUnit : undefined

    let principal = roundCurrency(principalBase)
    let accruedInterest = roundCurrency(interestBase)
    let subscription = roundCurrency(subscriptionOutstanding)
    let annualInterest = 0
    let nextMonthInterest = 0

    for (let monthIndex = 1; monthIndex <= 12; monthIndex += 1) {
      const openingLoan = roundCurrency(principal + accruedInterest)
      const openingOutstanding = roundCurrency(openingLoan + subscription)
      const interestAccrued = roundCurrency(openingLoan * monthlyRate)
      if (monthIndex === 1) {
        nextMonthInterest = interestAccrued
      }
      annualInterest += interestAccrued
      accruedInterest = roundCurrency(accruedInterest + interestAccrued)

      const dueBalance = roundCurrency(principal + accruedInterest)
      const cadenceMinimum = toMonthlyAmount(minimumPayment, cadence, customInterval, customUnit)
      const cadenceExtra = toMonthlyAmount(extraPayment, cadence, customInterval, customUnit)
      const minimumDueRaw =
        minimumPaymentType === 'percent_plus_interest'
          ? principal * (minimumPaymentPercent / 100) + accruedInterest
          : cadenceMinimum
      const minimumDue = roundCurrency(Math.min(dueBalance, Math.max(minimumDueRaw, 0)))
      const plannedLoanPayment = roundCurrency(Math.min(dueBalance, minimumDue + cadenceExtra))
      const paymentToInterest = roundCurrency(Math.min(accruedInterest, plannedLoanPayment))
      accruedInterest = roundCurrency(Math.max(accruedInterest - paymentToInterest, 0))
      const paymentToPrincipal = roundCurrency(Math.min(principal, plannedLoanPayment - paymentToInterest))
      principal = roundCurrency(Math.max(principal - paymentToPrincipal, 0))
      const subscriptionDue = roundCurrency(Math.min(subscription, subscriptionCost > 0 ? subscriptionCost : subscription))
      subscription = roundCurrency(Math.max(subscription - subscriptionDue, 0))
      const endingLoan = roundCurrency(principal + accruedInterest)
      const endingOutstanding = roundCurrency(endingLoan + subscription)

      amortizationRows.push({
        loanId,
        loanName: name,
        monthIndex,
        openingOutstanding,
        interestAccrued,
        plannedLoanPayment,
        subscriptionDue,
        totalPayment: roundCurrency(plannedLoanPayment + subscriptionDue),
        endingOutstanding,
      })

      interestTrendRows.push({
        loanId,
        loanName: name,
        monthIndex,
        interestAccrued,
      })

      if (openingOutstanding <= 0.000001 && endingOutstanding <= 0.000001) {
        break
      }
    }

    const currentOutstanding = roundCurrency(principalBase + interestBase + subscriptionOutstanding)
    summaryRows.push({
      loanId,
      loanName: name,
      currentOutstanding,
      projectedNextMonthInterest: roundCurrency(nextMonthInterest),
      projected12MonthInterest: roundCurrency(annualInterest),
      apr: roundCurrency(apr),
      cadence,
    })

    if (currentOutstanding > 0.005) {
      strategyCandidates.push({
        loanId,
        name,
        apr,
        balance: currentOutstanding,
      })
    }
  }

  const avalancheTarget = [...strategyCandidates].sort((left, right) => {
    if (right.apr !== left.apr) return right.apr - left.apr
    return right.balance - left.balance
  })[0]
  const snowballTarget = [...strategyCandidates].sort((left, right) => {
    if (left.balance !== right.balance) return left.balance - right.balance
    return right.apr - left.apr
  })[0]
  const recommendedMode =
    avalancheTarget && snowballTarget
      ? avalancheTarget.apr >= snowballTarget.apr
        ? 'avalanche'
        : 'snowball'
      : 'avalanche'
  const recommendedTarget = recommendedMode === 'avalanche' ? avalancheTarget : snowballTarget

  const strategyRows = [
    {
      strategy: 'avalanche',
      targetLoanId: avalancheTarget?.loanId ?? null,
      targetLoanName: avalancheTarget?.name ?? null,
      targetApr: avalancheTarget?.apr ?? null,
      targetBalance: avalancheTarget?.balance ?? null,
      recommended: recommendedMode === 'avalanche',
    },
    {
      strategy: 'snowball',
      targetLoanId: snowballTarget?.loanId ?? null,
      targetLoanName: snowballTarget?.name ?? null,
      targetApr: snowballTarget?.apr ?? null,
      targetBalance: snowballTarget?.balance ?? null,
      recommended: recommendedMode === 'snowball',
    },
    {
      strategy: 'recommended',
      targetLoanId: recommendedTarget?.loanId ?? null,
      targetLoanName: recommendedTarget?.name ?? null,
      targetApr: recommendedTarget?.apr ?? null,
      targetBalance: recommendedTarget?.balance ?? null,
      recommended: true,
    },
  ]

  for (const event of loanEvents) {
    const eventType = typeof event.eventType === 'string' ? event.eventType : 'payment'
    eventHistoryRows.push({
      loanId: event.loanId ? String(event.loanId) : null,
      eventType,
      source: typeof event.source === 'string' ? event.source : null,
      amount: finiteOrZero(event.amount),
      principalDelta: finiteOrZero(event.principalDelta),
      interestDelta: finiteOrZero(event.interestDelta),
      resultingBalance: finiteOrZero(event.resultingBalance),
      cycleKey: typeof event.cycleKey === 'string' ? event.cycleKey : null,
      occurredAt: finiteOrZero(event.occurredAt) || finiteOrZero(event.createdAt),
      notes: typeof event.notes === 'string' ? event.notes : null,
    })
  }

  return {
    summaryRows,
    amortizationRows,
    interestTrendRows,
    eventHistoryRows,
    strategyRows,
  }
}

const monthKeyFromDateOrTimestamp = (value: unknown, fallbackTimestamp: unknown) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}/.test(value)) {
    return value.slice(0, 7)
  }
  const fallback = finiteOrZero(fallbackTimestamp)
  return fallback > 0 ? new Date(fallback).toISOString().slice(0, 7) : null
}

const buildAccountReportingArtifacts = (payload: Record<string, Array<Record<string, unknown>>>): AccountReportingBundle => {
  const accounts = payload.accounts ?? []
  const accountTransfers = payload.accountTransfers ?? []
  const accountReconciliationChecks = payload.accountReconciliationChecks ?? []

  const accountNameById = new Map<string, string>()
  for (const account of accounts) {
    const accountId = String(account._id ?? '')
    if (!accountId) continue
    const name = typeof account.name === 'string' ? account.name : 'Account'
    accountNameById.set(accountId, name)
  }

  const transferRows = accountTransfers.map((entry) => {
    const sourceAccountId = String(entry.sourceAccountId ?? '')
    const destinationAccountId = String(entry.destinationAccountId ?? '')
    const amount = roundCurrency(Math.max(finiteOrZero(entry.amount), 0))
    const monthKey = monthKeyFromDateOrTimestamp(entry.transferDate, entry.createdAt)

    return {
      transferId: String(entry._id ?? ''),
      monthKey,
      transferDate: typeof entry.transferDate === 'string' ? entry.transferDate : null,
      sourceAccountId,
      sourceAccountName: (accountNameById.get(sourceAccountId) ?? sourceAccountId) || 'Deleted account',
      destinationAccountId,
      destinationAccountName: (accountNameById.get(destinationAccountId) ?? destinationAccountId) || 'Deleted account',
      amount,
      reference: typeof entry.reference === 'string' ? entry.reference : null,
      note: typeof entry.note === 'string' ? entry.note : null,
      createdAt: finiteOrZero(entry.createdAt),
    }
  })

  const reconciliationRows = accountReconciliationChecks.map((entry) => {
    const accountId = String(entry.accountId ?? '')
    const cycleMonth = typeof entry.cycleMonth === 'string' ? entry.cycleMonth : null
    const monthKey = monthKeyFromDateOrTimestamp(entry.cycleMonth, entry.updatedAt ?? entry.createdAt)

    return {
      reconciliationId: String(entry._id ?? ''),
      monthKey: cycleMonth && /^\d{4}-\d{2}$/.test(cycleMonth) ? cycleMonth : monthKey,
      cycleMonth,
      accountId,
      accountName: (accountNameById.get(accountId) ?? accountId) || 'Deleted account',
      statementStartBalance: roundCurrency(finiteOrZero(entry.statementStartBalance)),
      statementEndBalance: roundCurrency(finiteOrZero(entry.statementEndBalance)),
      ledgerEndBalance: roundCurrency(finiteOrZero(entry.ledgerEndBalance)),
      unmatchedDelta: roundCurrency(finiteOrZero(entry.unmatchedDelta)),
      reconciled: Boolean(entry.reconciled),
      updatedAt: finiteOrZero(entry.updatedAt) || finiteOrZero(entry.createdAt),
      createdAt: finiteOrZero(entry.createdAt),
    }
  })

  const summaryRows = accounts.map((account) => {
    const accountId = String(account._id ?? '')
    const name = typeof account.name === 'string' ? account.name : 'Account'
    const available = roundCurrency(finiteOrZero(account.balance))
    const hasLedger = account.ledgerBalance !== undefined && Number.isFinite(finiteOrZero(account.ledgerBalance))
    const hasPending = account.pendingBalance !== undefined && Number.isFinite(finiteOrZero(account.pendingBalance))
    const ledger = hasLedger
      ? roundCurrency(finiteOrZero(account.ledgerBalance))
      : roundCurrency(available - (hasPending ? finiteOrZero(account.pendingBalance) : 0))
    const pending = hasPending ? roundCurrency(finiteOrZero(account.pendingBalance)) : roundCurrency(available - ledger)

    const transferOutRows = transferRows.filter((row) => row.sourceAccountId === accountId)
    const transferInRows = transferRows.filter((row) => row.destinationAccountId === accountId)
    const transferOut = roundCurrency(transferOutRows.reduce((sum, row) => sum + finiteOrZero(row.amount), 0))
    const transferIn = roundCurrency(transferInRows.reduce((sum, row) => sum + finiteOrZero(row.amount), 0))
    const transferNet = roundCurrency(transferIn - transferOut)

    const accountReconciliationRows = reconciliationRows
      .filter((row) => row.accountId === accountId)
      .sort((left, right) => finiteOrZero(left.updatedAt) - finiteOrZero(right.updatedAt))
    const firstReconciliation = accountReconciliationRows[0]
    const lastReconciliation = accountReconciliationRows[accountReconciliationRows.length - 1]
    const openingBalance = roundCurrency(
      firstReconciliation ? finiteOrZero(firstReconciliation.statementStartBalance) : ledger - transferNet,
    )
    const closingBalance = roundCurrency(
      lastReconciliation ? finiteOrZero(lastReconciliation.statementEndBalance) : ledger,
    )
    const reconciliationChecks = accountReconciliationRows.length
    const reconciledCount = accountReconciliationRows.filter((row) => row.reconciled).length
    const pendingCount = reconciliationChecks - reconciledCount
    const unmatchedDeltaAbs = roundCurrency(
      accountReconciliationRows.reduce((sum, row) => sum + Math.abs(finiteOrZero(row.unmatchedDelta)), 0),
    )

    return {
      accountId,
      accountName: name,
      accountType: typeof account.type === 'string' ? account.type : null,
      liquid: Boolean(account.liquid),
      openingBalance,
      closingBalance,
      availableBalance: available,
      ledgerBalance: ledger,
      pendingBalance: pending,
      transferIn,
      transferOut,
      transferNet,
      transferInCount: transferInRows.length,
      transferOutCount: transferOutRows.length,
      reconciliationChecks,
      reconciledChecks: reconciledCount,
      pendingChecks: pendingCount,
      unmatchedDeltaAbs,
      latestCycleMonth: lastReconciliation?.cycleMonth ?? null,
    }
  })

  const monthKeySet = new Set<string>()
  transferRows.forEach((row) => {
    if (typeof row.monthKey === 'string') monthKeySet.add(row.monthKey)
  })
  reconciliationRows.forEach((row) => {
    if (typeof row.monthKey === 'string') monthKeySet.add(row.monthKey)
  })

  const monthlyRows = Array.from(monthKeySet)
    .sort((left, right) => left.localeCompare(right))
    .map((monthKey) => {
      const monthTransfers = transferRows.filter((row) => row.monthKey === monthKey)
      const monthReconciliations = reconciliationRows.filter((row) => row.monthKey === monthKey)
      const transferTotal = roundCurrency(monthTransfers.reduce((sum, row) => sum + finiteOrZero(row.amount), 0))
      const reconciledCount = monthReconciliations.filter((row) => row.reconciled).length

      return {
        monthKey,
        transferCount: monthTransfers.length,
        transferVolume: transferTotal,
        reconciliationChecks: monthReconciliations.length,
        reconciledChecks: reconciledCount,
        pendingChecks: monthReconciliations.length - reconciledCount,
        unmatchedDeltaAbs: roundCurrency(
          monthReconciliations.reduce((sum, row) => sum + Math.abs(finiteOrZero(row.unmatchedDelta)), 0),
        ),
      }
    })

  return {
    summaryRows,
    transferRows,
    reconciliationRows,
    monthlyRows,
  }
}

export const getConsentSettings = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      return {
        diagnosticsEnabled: false,
        analyticsEnabled: false,
        updatedAt: 0,
      }
    }

    const existing = await ctx.db
      .query('consentSettings')
      .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
      .first()

    return {
      diagnosticsEnabled: existing?.diagnosticsEnabled ?? false,
      analyticsEnabled: existing?.analyticsEnabled ?? false,
      updatedAt: existing?.updatedAt ?? 0,
    }
  },
})

export const getPrivacyData = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      return {
        consentSettings: {
          diagnosticsEnabled: false,
          analyticsEnabled: false,
          updatedAt: 0,
        },
        consentLogs: [],
        retentionPolicies: [],
        latestExport: null,
        exportHistory: [],
        exportDownloadLogs: [],
        latestDeletionJob: null,
      }
    }

    const [consentSettings, consentLogs, retentionPolicies, latestExport, exportHistory, exportDownloadLogs, latestDeletionJob] = await Promise.all([
      ctx.db
        .query('consentSettings')
        .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
        .first(),
      ctx.db
        .query('consentLogs')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(25),
      ctx.db
        .query('retentionPolicies')
        .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('userExports')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .first(),
      ctx.db
        .query('userExports')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(20),
      ctx.db
        .query('userExportDownloads')
        .withIndex('by_userId_downloadedAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .take(30),
      ctx.db
        .query('deletionJobs')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
        .order('desc')
        .first(),
    ])

    return {
      consentSettings: {
        diagnosticsEnabled: consentSettings?.diagnosticsEnabled ?? false,
        analyticsEnabled: consentSettings?.analyticsEnabled ?? false,
        updatedAt: consentSettings?.updatedAt ?? 0,
      },
      consentLogs,
      retentionPolicies,
      latestExport: latestExport ?? null,
      exportHistory,
      exportDownloadLogs,
      latestDeletionJob: latestDeletionJob ?? null,
    }
  },
})

export const setConsent = mutation({
  args: {
    consentType: consentTypeValidator,
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    const existing = await ctx.db
      .query('consentSettings')
      .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
      .first()

    const updatedAt = Date.now()
    const nextSettings = {
      diagnosticsEnabled:
        args.consentType === 'diagnostics' ? args.enabled : existing?.diagnosticsEnabled ?? false,
      analyticsEnabled: args.consentType === 'analytics' ? args.enabled : existing?.analyticsEnabled ?? false,
      updatedAt,
    }

    if (existing) {
      await ctx.db.patch(existing._id, nextSettings)
    } else {
      await ctx.db.insert('consentSettings', {
        userId: identity.subject,
        ...nextSettings,
      })
    }

    await ctx.db.insert('consentLogs', {
      userId: identity.subject,
      consentType: args.consentType,
      enabled: args.enabled,
      version: CONSENT_VERSION,
      createdAt: updatedAt,
    })

    return nextSettings
  },
})

export const upsertRetentionPolicy = mutation({
  args: {
    policyKey: retentionPolicyKeyValidator,
    retentionDays: v.number(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const policyKey = args.policyKey
    const retentionDays = Math.max(0, Math.floor(args.retentionDays))
    const updatedAt = Date.now()

    const existing = await ctx.db
      .query('retentionPolicies')
      .withIndex('by_userId_policyKey', (q) => q.eq('userId', identity.subject).eq('policyKey', policyKey))
      .first()

    if (existing) {
      await ctx.db.patch(existing._id, {
        retentionDays,
        enabled: args.enabled,
        updatedAt,
      })
      return
    }

    await ctx.db.insert('retentionPolicies', {
      userId: identity.subject,
      policyKey,
      retentionDays,
      enabled: args.enabled,
      updatedAt,
    })
  },
})

export const generateUserExport = action({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx)
    const now = Date.now()
    const expiresAt = nowPlusDays(now, 7)

    const exportId = (await ctx.runMutation(internal.privacy._createExportJob, {
      formatVersion: EXPORT_FORMAT_VERSION,
      expiresAt,
    })) as Id<'userExports'>

    try {
      const payload = (await ctx.runQuery(internal.privacy._collectExportData, {
        userId: identity.subject,
      })) as Record<string, Array<Record<string, unknown>>>
      const loanReporting = buildLoanReportingArtifacts(payload)
      const accountReporting = buildAccountReportingArtifacts(payload)
      const exportPayload = {
        ...payload,
        loanReportingSummary: loanReporting.summaryRows,
        loanAmortization12Month: loanReporting.amortizationRows,
        loanInterestTrend12Month: loanReporting.interestTrendRows,
        loanEventHistory: loanReporting.eventHistoryRows,
        loanStrategyRecommendation: loanReporting.strategyRows,
        accountReportingSummary: accountReporting.summaryRows,
        accountTransferSummary: accountReporting.transferRows,
        accountReconciliationSummary: accountReporting.reconciliationRows,
        accountMonthlySummary: accountReporting.monthlyRows,
      }

      const meta = {
        formatVersion: EXPORT_FORMAT_VERSION,
        calcVersion: 'finance_calc_2026_02',
        generatedAt: new Date(now).toISOString(),
        range: 'all',
        tables: Object.keys(exportPayload),
      }

      const files: Record<string, Uint8Array> = {
        'meta.json': strToU8(safeJson(meta)),
      }

      Object.entries(exportPayload).forEach(([table, rows]) => {
        files[`json/${table}.json`] = strToU8(safeJson(rows))
        files[`csv/${table}.csv`] = strToU8(toCsv(rows as Array<Record<string, unknown>>))
      })

      const zipped = zipSync(files, { level: 6 })
      const arrayBuffer = (zipped.buffer as ArrayBuffer).slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength)
      const blob = new Blob([arrayBuffer], { type: 'application/zip' })
      const storageId = await ctx.storage.store(blob)

      await ctx.runMutation(internal.privacy._finalizeExportJob, {
        exportId,
        storageId,
        byteSize: zipped.byteLength,
      })

      return {
        exportId: String(exportId),
        status: 'ready' as const,
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      await ctx.runMutation(internal.privacy._failExportJob, { exportId, reason })
      return {
        exportId: String(exportId),
        status: 'failed' as const,
        reason,
      }
    }
  },
})

export const requestDeletion = action({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx)
    const jobId = await ctx.runMutation(internal.privacy._startDeletionJob, {})

    const deleteTables: DeletionTable[] = [
      'incomePaymentChecks',
      'billPaymentChecks',
      'subscriptionPriceChanges',
      'incomeChangeEvents',
      'loanEvents',
      'loanCycleAuditEntries',
      'ledgerLines',
      'ledgerEntries',
      'financeAuditEvents',
      'monthCloseSnapshots',
      'monthlyCycleRuns',
      'purchaseMonthCloseRuns',
      'cycleAuditLogs',
      'cycleStepAlerts',
      'purchaseSplits',
      'purchaseSplitTemplates',
      'purchases',
      'transactionRules',
      'envelopeBudgets',
      'planningMonthVersions',
      'planningActionTasks',
      'incomeAllocationRules',
      'incomeAllocationSuggestions',
      'incomes',
      'bills',
      'cards',
      'loans',
      'accounts',
      'accountTransfers',
      'accountReconciliationChecks',
      'goals',
      'goalEvents',
      'financePreferences',
      'settingsProfiles',
      'userExportDownloads',
      'consentLogs',
      'consentSettings',
      'retentionPolicies',
      'clientOpsMetrics',
    ]

    try {
      // Exports need storage cleanup first.
      let exportBatch: { exportIds: Array<Id<'userExports'>>; storageIds: Array<Id<'_storage'>> }
      do {
        exportBatch = (await ctx.runQuery(internal.privacy._getUserExportsBatch, { limit: 10 })) as {
          exportIds: Array<Id<'userExports'>>
          storageIds: Array<Id<'_storage'>>
        }

        for (const storageId of exportBatch.storageIds) {
          await ctx.storage.delete(storageId)
        }

        if (exportBatch.exportIds.length > 0) {
          await ctx.runMutation(internal.privacy._deleteUserExportsByIds, { ids: exportBatch.exportIds })
        }
      } while (exportBatch.exportIds.length > 0)

      for (const table of deleteTables) {
        // Delete in batches until empty.
        for (;;) {
          const result = (await ctx.runMutation(internal.privacy._deleteUserDocsBatch, {
            table,
            limit: 250,
          })) as { deleted: number }

          await ctx.runMutation(internal.privacy._updateDeletionJobProgress, {
            jobId: jobId as Id<'deletionJobs'>,
            progressJson: safeJson({
              table,
              lastDeleted: result.deleted,
              at: new Date().toISOString(),
            }),
          })

          if (result.deleted === 0) {
            break
          }
        }
      }

      await ctx.runMutation(internal.privacy._completeDeletionJob, { jobId: jobId as Id<'deletionJobs'> })
      return { ok: true as const }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      await ctx.runMutation(internal.privacy._failDeletionJob, {
        jobId: jobId as Id<'deletionJobs'>,
        reason,
      })
      return { ok: false as const, reason }
    }
  },
})

export const _createExportJob = internalMutation({
  args: {
    formatVersion: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    return await ctx.db.insert('userExports', {
      userId: identity.subject,
      status: 'processing',
      storageId: undefined,
      byteSize: undefined,
      failureReason: undefined,
      formatVersion: args.formatVersion,
      createdAt: Date.now(),
      expiresAt: args.expiresAt,
    })
  },
})

export const _finalizeExportJob = internalMutation({
  args: {
    exportId: v.id('userExports'),
    storageId: v.id('_storage'),
    byteSize: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.exportId)
    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Export job not found.')
    }
    await ctx.db.patch(args.exportId, {
      storageId: args.storageId,
      byteSize: args.byteSize,
      status: 'ready',
      failureReason: undefined,
    })
  },
})

export const _failExportJob = internalMutation({
  args: {
    exportId: v.id('userExports'),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.exportId)
    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Export job not found.')
    }
    await ctx.db.patch(args.exportId, {
      status: 'failed',
      failureReason: args.reason.slice(0, 280),
      storageId: undefined,
      byteSize: undefined,
    })
  },
})

export const _collectExportData = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const userId = args.userId
    const [
      incomes,
      incomePaymentChecks,
      billPaymentChecks,
      subscriptionPriceChanges,
      incomeChangeEvents,
      loanEvents,
      loanCycleAuditEntries,
      bills,
      cards,
      loans,
      purchases,
      accounts,
      accountTransfers,
      accountReconciliationChecks,
      goals,
      goalEvents,
      transactionRules,
      envelopeBudgets,
      planningMonthVersions,
      planningActionTasks,
      incomeAllocationRules,
      incomeAllocationSuggestions,
      purchaseSplits,
      purchaseSplitTemplates,
      cycleAuditLogs,
      cycleStepAlerts,
      monthlyCycleRuns,
      purchaseMonthCloseRuns,
      monthCloseSnapshots,
      financeAuditEvents,
      ledgerEntries,
      ledgerLines,
      consentSettings,
      consentLogs,
      userExports,
      userExportDownloads,
      retentionPolicies,
      clientOpsMetrics,
      settingsProfiles,
    ] = await Promise.all([
      ctx.db.query('incomes').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('incomePaymentChecks').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('billPaymentChecks').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('subscriptionPriceChanges').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('incomeChangeEvents').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('loanEvents').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('loanCycleAuditEntries').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('bills').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('cards').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('loans').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('purchases').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('accounts').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('accountTransfers').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('accountReconciliationChecks').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('goals').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('goalEvents').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('transactionRules').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('envelopeBudgets').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('planningMonthVersions').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('planningActionTasks').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('incomeAllocationRules').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('incomeAllocationSuggestions').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('purchaseSplits').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('purchaseSplitTemplates').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('cycleAuditLogs').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('cycleStepAlerts').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('monthlyCycleRuns').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('purchaseMonthCloseRuns').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('monthCloseSnapshots').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('financeAuditEvents').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('ledgerEntries').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('ledgerLines').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('consentSettings').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('consentLogs').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('userExports').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('userExportDownloads').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('retentionPolicies').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('clientOpsMetrics').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('settingsProfiles').withIndex('by_userId', (q) => q.eq('userId', userId)).collect(),
    ])

    return {
      incomes: docsToPortableRows(incomes),
      incomePaymentChecks: docsToPortableRows(incomePaymentChecks),
      billPaymentChecks: docsToPortableRows(billPaymentChecks),
      subscriptionPriceChanges: docsToPortableRows(subscriptionPriceChanges),
      incomeChangeEvents: docsToPortableRows(incomeChangeEvents),
      loanEvents: docsToPortableRows(loanEvents),
      loanCycleAuditEntries: docsToPortableRows(loanCycleAuditEntries),
      bills: docsToPortableRows(bills),
      cards: docsToPortableRows(cards),
      loans: docsToPortableRows(loans),
      purchases: docsToPortableRows(purchases),
      accounts: docsToPortableRows(accounts),
      accountTransfers: docsToPortableRows(accountTransfers),
      accountReconciliationChecks: docsToPortableRows(accountReconciliationChecks),
      goals: docsToPortableRows(goals),
      goalEvents: docsToPortableRows(goalEvents),
      transactionRules: docsToPortableRows(transactionRules),
      envelopeBudgets: docsToPortableRows(envelopeBudgets),
      planningMonthVersions: docsToPortableRows(planningMonthVersions),
      planningActionTasks: docsToPortableRows(planningActionTasks),
      incomeAllocationRules: docsToPortableRows(incomeAllocationRules),
      incomeAllocationSuggestions: docsToPortableRows(incomeAllocationSuggestions),
      purchaseSplits: docsToPortableRows(purchaseSplits),
      purchaseSplitTemplates: docsToPortableRows(purchaseSplitTemplates),
      cycleAuditLogs: docsToPortableRows(cycleAuditLogs),
      cycleStepAlerts: docsToPortableRows(cycleStepAlerts),
      monthlyCycleRuns: docsToPortableRows(monthlyCycleRuns),
      purchaseMonthCloseRuns: docsToPortableRows(purchaseMonthCloseRuns),
      monthCloseSnapshots: docsToPortableRows(monthCloseSnapshots),
      financeAuditEvents: docsToPortableRows(financeAuditEvents),
      ledgerEntries: docsToPortableRows(ledgerEntries),
      ledgerLines: docsToPortableRows(ledgerLines),
      consentSettings: docsToPortableRows(consentSettings),
      consentLogs: docsToPortableRows(consentLogs),
      userExports: docsToPortableRows(userExports),
      userExportDownloads: docsToPortableRows(userExportDownloads),
      retentionPolicies: docsToPortableRows(retentionPolicies),
      clientOpsMetrics: docsToPortableRows(clientOpsMetrics),
      settingsProfiles: docsToPortableRows(settingsProfiles),
    }
  },
})

export const _startDeletionJob = internalMutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx)
    const now = Date.now()
    return await ctx.db.insert('deletionJobs', {
      userId: identity.subject,
      status: 'running',
      progressJson: safeJson({ startedAt: new Date(now).toISOString() }),
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const _updateDeletionJobProgress = internalMutation({
  args: {
    jobId: v.id('deletionJobs'),
    progressJson: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.jobId)
    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Deletion job not found.')
    }
    await ctx.db.patch(args.jobId, {
      progressJson: args.progressJson,
      updatedAt: Date.now(),
    })
  },
})

export const _completeDeletionJob = internalMutation({
  args: { jobId: v.id('deletionJobs') },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.jobId)
    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Deletion job not found.')
    }
    await ctx.db.patch(args.jobId, {
      status: 'completed',
      updatedAt: Date.now(),
      progressJson: safeJson({ completedAt: new Date().toISOString() }),
    })
  },
})

export const _failDeletionJob = internalMutation({
  args: { jobId: v.id('deletionJobs'), reason: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const existing = await ctx.db.get(args.jobId)
    if (!existing || existing.userId !== identity.subject) {
      throw new Error('Deletion job not found.')
    }
    await ctx.db.patch(args.jobId, {
      status: 'failed',
      updatedAt: Date.now(),
      progressJson: safeJson({ failedAt: new Date().toISOString(), reason: args.reason }),
    })
  },
})

export const _deleteUserDocsBatch = internalMutation({
  args: {
    table: deletionTableValidator,
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const limit = Math.max(1, Math.min(500, Math.floor(args.limit)))
    const table = args.table

    const docs = await ctx.db
      .query(table)
      .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
      .take(limit)

    await Promise.all(docs.map((doc) => ctx.db.delete(doc._id)))
    return { deleted: docs.length }
  },
})

export const _getUserExportsBatch = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const limit = Math.max(1, Math.min(50, Math.floor(args.limit)))
    const docs = await ctx.db
      .query('userExports')
      .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject))
      .order('desc')
      .take(limit)

    const exportIds = docs.map((doc) => doc._id)
    const storageIds = docs.map((doc) => doc.storageId).filter((id): id is Id<'_storage'> => Boolean(id))

    return { exportIds, storageIds }
  },
})

export const _deleteUserExportsByIds = internalMutation({
  args: { ids: v.array(v.id('userExports')) },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    for (const id of args.ids) {
      const doc = await ctx.db.get(id)
      if (!doc || doc.userId !== identity.subject) {
        continue
      }
      await ctx.db.delete(id)
    }
  },
})

export const _getUserExportById = internalQuery({
  args: { id: v.id('userExports') },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const doc = await ctx.db.get(args.id)
    if (!doc || doc.userId !== identity.subject) {
      return null
    }
    return doc
  },
})

export const _logUserExportDownload = internalMutation({
  args: {
    exportId: v.id('userExports'),
    filename: v.string(),
    byteSize: v.optional(v.number()),
    userAgent: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const exportDoc = await ctx.db.get(args.exportId)
    if (!exportDoc || exportDoc.userId !== identity.subject) {
      return { logged: false as const }
    }

    await ctx.db.insert('userExportDownloads', {
      userId: identity.subject,
      exportId: args.exportId,
      filename: args.filename,
      byteSize: args.byteSize,
      userAgent: args.userAgent,
      source: args.source,
      downloadedAt: Date.now(),
    })

    return { logged: true as const }
  },
})
