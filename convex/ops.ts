import { v } from 'convex/values'
import { action, internalAction, internalMutation, internalQuery, mutation, query } from './_generated/server'
import { requireIdentity } from './lib/authz'
import type { Id } from './_generated/dataModel'
import { internal } from './_generated/api'

const KPI_SCHEMA_VERSION = 'kpi_v1'
const DEFAULT_WINDOW_DAYS = 30

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const normalizeText = (value: string) => value.trim().toLowerCase()

const isGenericCategory = (value: string) => {
  const normalized = normalizeText(value)
  return normalized.length === 0 || normalized === 'uncategorized' || normalized === 'other' || normalized === 'misc'
}

export const health = query({
  args: {},
  handler: async () => {
    return {
      ok: true,
      serverTime: Date.now(),
      deployment: process.env.CONVEX_DEPLOYMENT ?? 'unknown',
      schemaVersion: KPI_SCHEMA_VERSION,
      calcVersion: 'finance_calc_2026_02',
    }
  },
})

export const logClientOpsMetric = mutation({
  args: {
    event: v.string(),
    queuedCount: v.optional(v.number()),
    conflictCount: v.optional(v.number()),
    flushAttempted: v.optional(v.number()),
    flushSucceeded: v.optional(v.number()),
    payloadJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    const consent = await ctx.db
      .query('consentSettings')
      .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
      .first()

    if (!consent?.diagnosticsEnabled) {
      return { stored: false as const }
    }

    await ctx.db.insert('clientOpsMetrics', {
      userId: identity.subject,
      event: args.event.trim().slice(0, 64),
      queuedCount: args.queuedCount,
      conflictCount: args.conflictCount,
      flushAttempted: args.flushAttempted,
      flushSucceeded: args.flushSucceeded,
      payloadJson: args.payloadJson?.slice(0, 4000),
      createdAt: Date.now(),
    })

    return { stored: true as const }
  },
})

export const getKpis = query({
  args: {
    windowDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    const now = Date.now()

    const windowDays = clamp(Math.floor(args.windowDays ?? DEFAULT_WINDOW_DAYS), 7, 365)
    const windowStart = now - windowDays * 86400000

    if (!identity) {
      return {
        windowDays,
        updatedAt: now,
        accuracyRate: 100,
        syncFailureRate: null,
        cycleSuccessRate: 1,
        reconciliationCompletionRate: 1,
        counts: {
          purchases: 0,
          pending: 0,
          missingCategory: 0,
          duplicates: 0,
          anomalies: 0,
          splitMismatches: 0,
        },
      }
    }

    const [purchases, purchaseSplits, cycleRuns, clientOpsMetrics] = await Promise.all([
      ctx.db
        .query('purchases')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject).gte('createdAt', windowStart))
        .collect(),
      ctx.db
        .query('purchaseSplits')
        .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
        .collect(),
      ctx.db
        .query('monthlyCycleRuns')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject).gte('createdAt', windowStart))
        .collect(),
      ctx.db
        .query('clientOpsMetrics')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', identity.subject).gte('createdAt', windowStart))
        .collect(),
    ])

    const purchaseCount = purchases.length
    const pendingCount = purchases.filter((purchase) => (purchase.reconciliationStatus ?? 'posted') === 'pending').length
    const missingCategoryCount = purchases.filter((purchase) => isGenericCategory(purchase.category)).length

    const duplicateMap = new Map<string, number>()
    purchases.forEach((purchase) => {
      const key = `${normalizeText(purchase.item)}::${Math.round(purchase.amount * 100) / 100}::${purchase.purchaseDate}`
      duplicateMap.set(key, (duplicateMap.get(key) ?? 0) + 1)
    })
    const duplicateCount = [...duplicateMap.values()].filter((count) => count > 1).length

    const amounts = purchases.map((purchase) => purchase.amount)
    const mean = amounts.length > 0 ? amounts.reduce((sum, value) => sum + value, 0) / amounts.length : 0
    const variance =
      amounts.length > 1
        ? amounts.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (amounts.length - 1)
        : 0
    const std = Math.sqrt(variance)
    const anomalyCount = purchases.filter((purchase) => std > 0 && purchase.amount > mean + std * 2.5 && purchase.amount > 50).length

    const splitMap = new Map<string, number>()
    purchaseSplits.forEach((split) => {
      const key = String(split.purchaseId)
      splitMap.set(key, (splitMap.get(key) ?? 0) + split.amount)
    })
    const splitMismatchCount = purchases.filter((purchase) => {
      const splitTotal = splitMap.get(String(purchase._id))
      if (splitTotal === undefined) return false
      return Math.abs(Math.round(splitTotal * 100) / 100 - Math.round(purchase.amount * 100) / 100) > 0.01
    }).length

    const postedOrReconciled = purchases.filter((purchase) => (purchase.reconciliationStatus ?? 'posted') !== 'pending')
    const reconciled = postedOrReconciled.filter((purchase) => (purchase.reconciliationStatus ?? 'posted') === 'reconciled').length
    const reconciliationCompletionRate = postedOrReconciled.length > 0 ? reconciled / postedOrReconciled.length : 1

    const completedCycles = cycleRuns.filter((run) => run.status === 'completed').length
    const failedCycles = cycleRuns.filter((run) => run.status === 'failed').length
    const totalCycles = completedCycles + failedCycles
    const cycleSuccessRate = totalCycles > 0 ? completedCycles / totalCycles : 1

    const flushAttempted = clientOpsMetrics.reduce((sum, metric) => sum + (metric.flushAttempted ?? 0), 0)
    const flushSucceeded = clientOpsMetrics.reduce((sum, metric) => sum + (metric.flushSucceeded ?? 0), 0)
    const syncFailureRate = flushAttempted > 0 ? clamp((flushAttempted - flushSucceeded) / flushAttempted, 0, 1) : null

    const safeDiv = (numerator: number, denominator: number) => (denominator <= 0 ? 0 : numerator / denominator)
    const missingRate = safeDiv(missingCategoryCount, purchaseCount)
    const pendingRate = safeDiv(pendingCount, purchaseCount)
    const duplicateRate = safeDiv(duplicateCount, Math.max(purchaseCount, 1))
    const anomalyRate = safeDiv(anomalyCount, Math.max(purchaseCount, 1))
    const splitMismatchRate = safeDiv(splitMismatchCount, Math.max(purchaseCount, 1))

    const accuracyPenalty =
      missingRate * 25 +
      pendingRate * 20 +
      duplicateRate * 25 +
      anomalyRate * 15 +
      splitMismatchRate * 15
    const accuracyRate = clamp(1 - accuracyPenalty, 0, 1)

    return {
      windowDays,
      updatedAt: now,
      accuracyRate,
      syncFailureRate,
      cycleSuccessRate,
      reconciliationCompletionRate,
      counts: {
        purchases: purchaseCount,
        pending: pendingCount,
        missingCategory: missingCategoryCount,
        duplicates: duplicateCount,
        anomalies: anomalyCount,
        splitMismatches: splitMismatchCount,
      },
    }
  },
})

const POLICY_DEFAULTS: Record<string, { retentionDays: number; enabled: boolean }> = {
  exports: { retentionDays: 7, enabled: false },
  client_ops_metrics: { retentionDays: 90, enabled: false },
  cycle_audit_ledger: { retentionDays: 365, enabled: false },
  consent_logs: { retentionDays: 730, enabled: false },
  deletion_jobs: { retentionDays: 30, enabled: false },
}

type RetentionPolicyRow = {
  policyKey: string
  retentionDays: number
  enabled: boolean
}

export const getRetentionPolicies = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      return { policies: [] as RetentionPolicyRow[] }
    }

    const rows = await ctx.db
      .query('retentionPolicies')
      .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
      .collect()

    const map = new Map<string, RetentionPolicyRow>()
    rows.forEach((row) => {
      map.set(row.policyKey, {
        policyKey: row.policyKey,
        retentionDays: row.retentionDays,
        enabled: row.enabled,
      })
    })

    Object.entries(POLICY_DEFAULTS).forEach(([key, value]) => {
      if (!map.has(key)) {
        map.set(key, {
          policyKey: key,
          retentionDays: value.retentionDays,
          enabled: value.enabled,
        })
      }
    })

    return {
      policies: Array.from(map.values()).sort((a, b) => a.policyKey.localeCompare(b.policyKey)),
    }
  },
})

export const applyRetentionForUser = action({
  args: {
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const now = args.now ?? Date.now()

    const policies = (await ctx.runQuery(internal.ops._getRetentionPoliciesInternal, {
      userId: identity.subject,
    })) as RetentionPolicyRow[]

    const enabledPolicies = policies.filter((policy) => policy.enabled && policy.retentionDays > 0)
    if (enabledPolicies.length === 0) {
      return { applied: false as const, deleted: {} as Record<string, number> }
    }

    const deletedTotals: Record<string, number> = {}
    for (const policy of enabledPolicies) {
      const result = (await ctx.runMutation(internal.ops._applyRetentionPolicyInternal, {
        userId: identity.subject,
        policyKey: policy.policyKey,
        cutoff: now - policy.retentionDays * 86400000,
      })) as { deleted: number; storageIds?: Array<Id<'_storage'>> }

      deletedTotals[policy.policyKey] = (deletedTotals[policy.policyKey] ?? 0) + result.deleted

      if (result.storageIds && result.storageIds.length > 0) {
        for (const storageId of result.storageIds) {
          await ctx.storage.delete(storageId)
        }
      }
    }

    return { applied: true as const, deleted: deletedTotals }
  },
})

export const _getRetentionPoliciesInternal = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('retentionPolicies')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .collect()

    const map = new Map<string, RetentionPolicyRow>()
    rows.forEach((row) => {
      map.set(row.policyKey, { policyKey: row.policyKey, retentionDays: row.retentionDays, enabled: row.enabled })
    })

    Object.entries(POLICY_DEFAULTS).forEach(([key, value]) => {
      if (!map.has(key)) {
        map.set(key, { policyKey: key, retentionDays: value.retentionDays, enabled: value.enabled })
      }
    })

    return Array.from(map.values())
  },
})

export const _applyRetentionPolicyInternal = internalMutation({
  args: {
    userId: v.string(),
    policyKey: v.string(),
    cutoff: v.number(),
  },
  handler: async (ctx, args) => {
    const limit = 250
    const userId = args.userId
    const cutoff = args.cutoff

    let deleted = 0
    const storageIds: Array<Id<'_storage'>> = []

    if (args.policyKey === 'exports') {
      for (;;) {
        const batch = await ctx.db
          .query('userExports')
          .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId).lt('createdAt', cutoff))
          .take(limit)

        if (batch.length === 0) break

        batch.forEach((doc) => {
          if (doc.storageId) storageIds.push(doc.storageId)
        })

        await Promise.all(batch.map((doc) => ctx.db.delete(doc._id)))
        deleted += batch.length
      }

      for (;;) {
        const downloadBatch = await ctx.db
          .query('userExportDownloads')
          .withIndex('by_userId_downloadedAt', (q) => q.eq('userId', userId).lt('downloadedAt', cutoff))
          .take(limit)

        if (downloadBatch.length === 0) break

        await Promise.all(downloadBatch.map((doc) => ctx.db.delete(doc._id)))
        deleted += downloadBatch.length
      }

      return { deleted, storageIds }
    }

    if (args.policyKey === 'client_ops_metrics') {
      for (;;) {
        const batch = await ctx.db
          .query('clientOpsMetrics')
          .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId).lt('createdAt', cutoff))
          .take(limit)
        if (batch.length === 0) break
        await Promise.all(batch.map((doc) => ctx.db.delete(doc._id)))
        deleted += batch.length
      }
      return { deleted }
    }

    if (args.policyKey === 'consent_logs') {
      for (;;) {
        const batch = await ctx.db
          .query('consentLogs')
          .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId).lt('createdAt', cutoff))
          .take(limit)
        if (batch.length === 0) break
        await Promise.all(batch.map((doc) => ctx.db.delete(doc._id)))
        deleted += batch.length
      }
      return { deleted }
    }

    if (args.policyKey === 'deletion_jobs') {
      for (;;) {
        const batch = await ctx.db
          .query('deletionJobs')
          .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId).lt('createdAt', cutoff))
          .take(limit)
        if (batch.length === 0) break
        await Promise.all(batch.map((doc) => ctx.db.delete(doc._id)))
        deleted += batch.length
      }
      return { deleted }
    }

    // cycle_audit_ledger
    for (;;) {
      const batch = await ctx.db
        .query('ledgerLines')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId).lt('createdAt', cutoff))
        .take(limit)
      if (batch.length === 0) break
      await Promise.all(batch.map((doc) => ctx.db.delete(doc._id)))
      deleted += batch.length
    }

    for (;;) {
      const batch = await ctx.db
        .query('ledgerEntries')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId).lt('createdAt', cutoff))
        .take(limit)
      if (batch.length === 0) break
      await Promise.all(batch.map((doc) => ctx.db.delete(doc._id)))
      deleted += batch.length
    }

    for (;;) {
      const batch = await ctx.db
        .query('financeAuditEvents')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId).lt('createdAt', cutoff))
        .take(limit)
      if (batch.length === 0) break
      await Promise.all(batch.map((doc) => ctx.db.delete(doc._id)))
      deleted += batch.length
    }

    for (;;) {
      const batch = await ctx.db
        .query('monthCloseSnapshots')
        .withIndex('by_userId_ranAt', (q) => q.eq('userId', userId).lt('ranAt', cutoff))
        .take(limit)
      if (batch.length === 0) break
      await Promise.all(batch.map((doc) => ctx.db.delete(doc._id)))
      deleted += batch.length
    }

    for (;;) {
      const batch = await ctx.db
        .query('monthlyCycleRuns')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId).lt('createdAt', cutoff))
        .take(limit)
      if (batch.length === 0) break
      await Promise.all(batch.map((doc) => ctx.db.delete(doc._id)))
      deleted += batch.length
    }

    for (;;) {
      const batch = await ctx.db
        .query('purchaseMonthCloseRuns')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId).lt('createdAt', cutoff))
        .take(limit)
      if (batch.length === 0) break
      await Promise.all(batch.map((doc) => ctx.db.delete(doc._id)))
      deleted += batch.length
    }

    for (;;) {
      const batch = await ctx.db
        .query('loanEvents')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId).lt('createdAt', cutoff))
        .take(limit)
      if (batch.length === 0) break
      await Promise.all(batch.map((doc) => ctx.db.delete(doc._id)))
      deleted += batch.length
    }

    for (;;) {
      const batch = await ctx.db
        .query('loanCycleAuditEntries')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId).lt('createdAt', cutoff))
        .take(limit)
      if (batch.length === 0) break
      await Promise.all(batch.map((doc) => ctx.db.delete(doc._id)))
      deleted += batch.length
    }

    for (;;) {
      const batch = await ctx.db
        .query('cycleAuditLogs')
        .withIndex('by_userId_ranAt', (q) => q.eq('userId', userId).lt('ranAt', cutoff))
        .take(limit)
      if (batch.length === 0) break
      await Promise.all(batch.map((doc) => ctx.db.delete(doc._id)))
      deleted += batch.length
    }

    for (;;) {
      const batch = await ctx.db
        .query('cycleStepAlerts')
        .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId).lt('createdAt', cutoff))
        .take(limit)
      if (batch.length === 0) break
      await Promise.all(batch.map((doc) => ctx.db.delete(doc._id)))
      deleted += batch.length
    }

    return { deleted }
  },
})

export const applyRetentionGlobal = internalAction({
  args: {
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()

    const policies = await ctx.runQuery(internal.ops._listEnabledRetentionPolicies, {})
    const users = Array.from(new Set(policies.map((policy) => policy.userId)))

    for (const userId of users) {
      const userPolicies = policies.filter((policy) => policy.userId === userId)
      for (const policy of userPolicies) {
        const retentionDays = Math.max(0, Math.floor(policy.retentionDays))
        if (!policy.enabled || retentionDays <= 0) continue
        const result = (await ctx.runMutation(internal.ops._applyRetentionPolicyInternal, {
          userId,
          policyKey: policy.policyKey,
          cutoff: now - retentionDays * 86400000,
        })) as { deleted: number; storageIds?: Array<Id<'_storage'>> }
        if (result.storageIds && result.storageIds.length > 0) {
          for (const storageId of result.storageIds) {
            await ctx.storage.delete(storageId)
          }
        }
      }
    }

    return null
  },
})

export const _listEnabledRetentionPolicies = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('retentionPolicies').collect()
  },
})
