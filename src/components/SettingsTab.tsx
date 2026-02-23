import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type {
  BillCategory,
  BillScope,
  ConsentLogEntry,
  ConsentSettingsView,
  DashboardCardId,
  DeletionJobEntry,
  DefaultMonthPreset,
  FinancePreference,
  MonthlyAutomationRetryStrategy,
  PlanningAutoApplyMode,
  PlanningNegativeForecastFallback,
  PlanningVersionKey,
  RetentionPolicyRow,
  SecuritySessionActivity,
  SettingsPreferenceHistoryEntry,
  SettingsProfileEntry,
  UiDensity,
  UserExportDownloadEntry,
  UserExportEntry,
  WeekStartDay,
} from './financeTypes'

type SettingsTabProps = {
  preferenceDraft: {
    displayName: string
    currency: string
    locale: string
    timezone: string
    weekStartDay: WeekStartDay
    defaultMonthPreset: DefaultMonthPreset
    dueRemindersEnabled: boolean
    dueReminderDays: string
    monthlyCycleAlertsEnabled: boolean
    reconciliationRemindersEnabled: boolean
    goalAlertsEnabled: boolean
    defaultBillCategory: BillCategory
    defaultBillScope: BillScope
    defaultPurchaseOwnership: FinancePreference['defaultPurchaseOwnership']
    defaultPurchaseCategory: string
    billNotesTemplate: string
    purchaseNotesTemplate: string
    uiDensity: UiDensity
    defaultLandingTab: FinancePreference['defaultLandingTab']
    dashboardCardOrder: DashboardCardId[]
    monthlyAutomationEnabled: boolean
    monthlyAutomationRunDay: string
    monthlyAutomationRunHour: string
    monthlyAutomationRunMinute: string
    monthlyAutomationRetryStrategy: MonthlyAutomationRetryStrategy
    monthlyAutomationMaxRetries: string
    alertEscalationFailureStreakThreshold: string
    alertEscalationFailedStepsThreshold: string
    planningDefaultVersionKey: PlanningVersionKey
    planningAutoApplyMode: PlanningAutoApplyMode
    planningNegativeForecastFallback: PlanningNegativeForecastFallback
  }
  setPreferenceDraft: Dispatch<
    SetStateAction<{
      displayName: string
      currency: string
      locale: string
      timezone: string
      weekStartDay: WeekStartDay
      defaultMonthPreset: DefaultMonthPreset
      dueRemindersEnabled: boolean
      dueReminderDays: string
      monthlyCycleAlertsEnabled: boolean
      reconciliationRemindersEnabled: boolean
      goalAlertsEnabled: boolean
      defaultBillCategory: BillCategory
      defaultBillScope: BillScope
      defaultPurchaseOwnership: FinancePreference['defaultPurchaseOwnership']
      defaultPurchaseCategory: string
      billNotesTemplate: string
      purchaseNotesTemplate: string
      uiDensity: UiDensity
      defaultLandingTab: FinancePreference['defaultLandingTab']
      dashboardCardOrder: DashboardCardId[]
      monthlyAutomationEnabled: boolean
      monthlyAutomationRunDay: string
      monthlyAutomationRunHour: string
      monthlyAutomationRunMinute: string
      monthlyAutomationRetryStrategy: MonthlyAutomationRetryStrategy
      monthlyAutomationMaxRetries: string
      alertEscalationFailureStreakThreshold: string
      alertEscalationFailedStepsThreshold: string
      planningDefaultVersionKey: PlanningVersionKey
      planningAutoApplyMode: PlanningAutoApplyMode
      planningNegativeForecastFallback: PlanningNegativeForecastFallback
    }>
  >
  isSavingPreferences: boolean
  hasUnsavedPreferences: boolean
  onSavePreferences: () => Promise<void>
  onResetPreferencesDraft: () => void
  moveDashboardCard: (cardId: DashboardCardId, direction: -1 | 1) => void
  currencyOptions: string[]
  localeOptions: string[]
  timezoneOptions: string[]
  weekStartDayOptions: Array<{ value: WeekStartDay; label: string }>
  defaultMonthPresetOptions: Array<{ value: DefaultMonthPreset; label: string }>
  uiDensityOptions: Array<{ value: UiDensity; label: string }>
  monthlyAutomationRetryStrategyOptions: Array<{ value: MonthlyAutomationRetryStrategy; label: string }>
  planningDefaultVersionOptions: Array<{ value: PlanningVersionKey; label: string }>
  planningAutoApplyModeOptions: Array<{ value: PlanningAutoApplyMode; label: string }>
  planningNegativeForecastFallbackOptions: Array<{ value: PlanningNegativeForecastFallback; label: string }>
  defaultLandingTabOptions: Array<{ value: FinancePreference['defaultLandingTab']; label: string }>
  dashboardCardOrderOptions: Array<{ id: DashboardCardId; label: string }>
  settingsProfiles: SettingsProfileEntry[]
  settingsPreferenceHistory: SettingsPreferenceHistoryEntry[]
  settingsProfileName: string
  setSettingsProfileName: Dispatch<SetStateAction<string>>
  settingsProfileDescription: string
  setSettingsProfileDescription: Dispatch<SetStateAction<string>>
  isSavingSettingsProfile: boolean
  applyingSettingsProfileId: string | null
  deletingSettingsProfileId: string | null
  restoringSettingsHistoryId: string | null
  onSaveSettingsProfile: () => Promise<void>
  onApplySettingsProfile: (profileId: string) => Promise<void>
  onDeleteSettingsProfile: (profileId: string) => Promise<void>
  onRestoreSettingsHistory: (auditEventId: string, target: 'before' | 'after') => Promise<void>
  consentSettings: ConsentSettingsView
  consentLogs: ConsentLogEntry[]
  latestExport: UserExportEntry | null
  exportHistory: UserExportEntry[]
  exportDownloadLogs: UserExportDownloadEntry[]
  latestDeletionJob: DeletionJobEntry | null
  retentionPolicies: RetentionPolicyRow[]
  isExporting: boolean
  onGenerateExport: () => Promise<void>
  onDownloadExportById: (exportId: string) => Promise<void>
  onDownloadLatestExport: () => Promise<void>
  deleteConfirmText: string
  setDeleteConfirmText: Dispatch<SetStateAction<string>>
  isDeleting: boolean
  onRequestDeletion: () => Promise<void>
  isApplyingRetention: boolean
  onRunRetentionNow: () => Promise<void>
  onToggleConsent: (type: 'diagnostics' | 'analytics', enabled: boolean) => Promise<void>
  onUpsertRetention: (policyKey: RetentionPolicyRow['policyKey'], retentionDays: number, enabled: boolean) => Promise<void>
  securitySessions: SecuritySessionActivity[]
  isLoadingSecuritySessions: boolean
  isRefreshingSecuritySessions: boolean
  hasLoadedSecuritySessions: boolean
  isRevokingAllSessions: boolean
  revokingSecuritySessionId: string | null
  clientDeviceSessionCount: number | null
  onRefreshSecuritySessions: () => Promise<void>
  onRevokeSecuritySession: (sessionId: string) => Promise<void>
  onSignOutAllSessions: () => Promise<void>
  cycleDateLabel: Intl.DateTimeFormat
}

type ConsentFilter = 'all' | 'diagnostics' | 'analytics'
type ConsentSortKey = 'newest' | 'oldest'
type RetentionSortKey = 'policy_asc' | 'retention_desc' | 'enabled_first'

const policyLabel = (policyKey: RetentionPolicyRow['policyKey']) => {
  switch (policyKey) {
    case 'exports':
      return 'Exports'
    case 'client_ops_metrics':
      return 'Client Ops Metrics'
    case 'cycle_audit_ledger':
      return 'Cycle / Audit / Ledger Logs'
    case 'consent_logs':
      return 'Consent Logs'
    case 'deletion_jobs':
      return 'Deletion Jobs'
    default:
      return policyKey
  }
}

const presetOptions = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '365 days', value: 365 },
  { label: '730 days', value: 730 },
  { label: 'Forever', value: 0 },
]

const exportStatusPill = (status: UserExportEntry['status']) => {
  if (status === 'ready') return 'pill pill--good'
  if (status === 'processing') return 'pill pill--warning'
  return 'pill pill--critical'
}

const deletionStatusPill = (status: DeletionJobEntry['status']) => {
  if (status === 'completed') return 'pill pill--good'
  if (status === 'running') return 'pill pill--warning'
  return 'pill pill--critical'
}

const sessionStatusPill = (status: string) => {
  if (status === 'active') return 'pill pill--good'
  if (status === 'pending') return 'pill pill--warning'
  return 'pill pill--neutral'
}

const consentTypePill = (type: ConsentLogEntry['consentType']) =>
  type === 'diagnostics' ? 'pill pill--neutral' : 'pill pill--cadence'

const parseDeletionProgress = (progressJson: string | undefined) => {
  if (!progressJson) return null
  try {
    const parsed = JSON.parse(progressJson) as unknown
    if (!parsed || typeof parsed !== 'object') return null

    const candidate = parsed as { processedDocs?: unknown; totalDocs?: unknown; table?: unknown; stage?: unknown }
    const processed = typeof candidate.processedDocs === 'number' ? candidate.processedDocs : null
    const total = typeof candidate.totalDocs === 'number' ? candidate.totalDocs : null
    const table = typeof candidate.table === 'string' ? candidate.table : null
    const stage = typeof candidate.stage === 'string' ? candidate.stage : null

    if (processed !== null && total !== null && total > 0) {
      return `${processed}/${total} records${table ? ` • ${table}` : ''}`
    }

    if (stage) {
      return stage
    }

    return null
  } catch {
    return null
  }
}

const parsePreferenceJson = (value: string | null | undefined) => {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

const computePreferenceDiffRows = (
  leftValue: Record<string, unknown> | null,
  rightValue: Record<string, unknown> | null,
  labels: Map<string, string>,
) => {
  if (!leftValue || !rightValue) return []
  const keys = new Set([...Object.keys(leftValue), ...Object.keys(rightValue)])
  const rows: Array<{ key: string; label: string; before: string; after: string }> = []
  for (const key of keys) {
    const left = leftValue[key]
    const right = rightValue[key]
    if (JSON.stringify(left) === JSON.stringify(right)) continue
    rows.push({
      key,
      label: labels.get(key) ?? key,
      before: left === undefined ? '—' : typeof left === 'string' ? left : JSON.stringify(left),
      after: right === undefined ? '—' : typeof right === 'string' ? right : JSON.stringify(right),
    })
  }
  return rows.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
}

const formatClockTime = (hourText: string, minuteText: string) => {
  const hour = Number.parseInt(hourText, 10)
  const minute = Number.parseInt(minuteText, 10)
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return 'Invalid time'
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function SettingsTab({
  preferenceDraft,
  setPreferenceDraft,
  isSavingPreferences,
  hasUnsavedPreferences,
  onSavePreferences,
  onResetPreferencesDraft,
  moveDashboardCard,
  currencyOptions,
  localeOptions,
  timezoneOptions,
  weekStartDayOptions,
  defaultMonthPresetOptions,
  uiDensityOptions,
  monthlyAutomationRetryStrategyOptions,
  planningDefaultVersionOptions,
  planningAutoApplyModeOptions,
  planningNegativeForecastFallbackOptions,
  defaultLandingTabOptions,
  dashboardCardOrderOptions,
  settingsProfiles,
  settingsPreferenceHistory,
  settingsProfileName,
  setSettingsProfileName,
  settingsProfileDescription,
  setSettingsProfileDescription,
  isSavingSettingsProfile,
  applyingSettingsProfileId,
  deletingSettingsProfileId,
  restoringSettingsHistoryId,
  onSaveSettingsProfile,
  onApplySettingsProfile,
  onDeleteSettingsProfile,
  onRestoreSettingsHistory,
  consentSettings,
  consentLogs,
  latestExport,
  exportHistory,
  exportDownloadLogs,
  latestDeletionJob,
  retentionPolicies,
  isExporting,
  onGenerateExport,
  onDownloadExportById,
  onDownloadLatestExport,
  deleteConfirmText,
  setDeleteConfirmText,
  isDeleting,
  onRequestDeletion,
  isApplyingRetention,
  onRunRetentionNow,
  onToggleConsent,
  onUpsertRetention,
  securitySessions,
  isLoadingSecuritySessions,
  isRefreshingSecuritySessions,
  hasLoadedSecuritySessions,
  isRevokingAllSessions,
  revokingSecuritySessionId,
  clientDeviceSessionCount,
  onRefreshSecuritySessions,
  onRevokeSecuritySession,
  onSignOutAllSessions,
  cycleDateLabel,
}: SettingsTabProps) {
  const [consentFilter, setConsentFilter] = useState<ConsentFilter>('all')
  const [consentSort, setConsentSort] = useState<ConsentSortKey>('newest')
  const [consentSearch, setConsentSearch] = useState('')

  const [retentionSort, setRetentionSort] = useState<RetentionSortKey>('policy_asc')
  const [retentionSearch, setRetentionSearch] = useState('')
  const [selectedProfileCompareId, setSelectedProfileCompareId] = useState<string | null>(null)
  const [selectedHistoryCompareId, setSelectedHistoryCompareId] = useState<string | null>(null)

  const visibleConsentLogs = useMemo(() => {
    const query = consentSearch.trim().toLowerCase()
    const filtered = consentLogs.filter((entry) => {
      const typeMatch = consentFilter === 'all' ? true : entry.consentType === consentFilter
      const searchMatch =
        query.length === 0
          ? true
          : `${entry.consentType} ${entry.version} ${entry.enabled ? 'enabled' : 'disabled'}`
              .toLowerCase()
              .includes(query)
      return typeMatch && searchMatch
    })

    return filtered.sort((a, b) => (consentSort === 'newest' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt))
  }, [consentFilter, consentLogs, consentSearch, consentSort])

  const visibleRetentionPolicies = useMemo(() => {
    const query = retentionSearch.trim().toLowerCase()
    const filtered = retentionPolicies.filter((policy) => {
      if (query.length === 0) return true
      const label = policyLabel(policy.policyKey).toLowerCase()
      return label.includes(query)
    })

    return filtered.sort((a, b) => {
      switch (retentionSort) {
        case 'policy_asc':
          return policyLabel(a.policyKey).localeCompare(policyLabel(b.policyKey), undefined, { sensitivity: 'base' })
        case 'retention_desc':
          return b.retentionDays - a.retentionDays
        case 'enabled_first': {
          const aKey = a.enabled ? 0 : 1
          const bKey = b.enabled ? 0 : 1
          return aKey - bKey || policyLabel(a.policyKey).localeCompare(policyLabel(b.policyKey), undefined, { sensitivity: 'base' })
        }
        default:
          return 0
      }
    })
  }, [retentionPolicies, retentionSearch, retentionSort])

  const hasConsentFilters = consentFilter !== 'all' || consentSort !== 'newest' || consentSearch.length > 0
  const hasRetentionFilters = retentionSort !== 'policy_asc' || retentionSearch.length > 0

  const retentionEnabledCount = retentionPolicies.filter((policy) => policy.enabled).length
  const retentionForeverCount = retentionPolicies.filter((policy) => policy.enabled && policy.retentionDays === 0).length
  const deletionProgress = parseDeletionProgress(latestDeletionJob?.progressJson)
  const securityActiveCount = securitySessions.filter((session) => session.status === 'active').length
  const securityThisDeviceCount = securitySessions.filter((session) => session.onThisDevice).length
  const recentSecurityActivity = [...securitySessions]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 8)

  const deleteReady = deleteConfirmText.trim().toUpperCase() === 'DELETE'
  const dashboardCardLabelMap = new Map(dashboardCardOrderOptions.map((option) => [option.id, option.label] as const))
  const defaultLandingTabLabel =
    defaultLandingTabOptions.find((option) => option.value === preferenceDraft.defaultLandingTab)?.label ??
    preferenceDraft.defaultLandingTab
  const notificationEnabledCount = [
    preferenceDraft.dueRemindersEnabled,
    preferenceDraft.monthlyCycleAlertsEnabled,
    preferenceDraft.reconciliationRemindersEnabled,
    preferenceDraft.goalAlertsEnabled,
  ].filter(Boolean).length

  const hasExportHistory = exportHistory.length > 0
  const hasExportDownloadAudit = exportDownloadLogs.length > 0

  const preferenceFieldLabels = useMemo(
    () =>
      new Map<string, string>([
        ['displayName', 'Display name'],
        ['currency', 'Currency'],
        ['locale', 'Locale'],
        ['timezone', 'Timezone'],
        ['weekStartDay', 'Week start day'],
        ['defaultMonthPreset', 'Default month preset'],
        ['dueRemindersEnabled', 'Due reminders enabled'],
        ['dueReminderDays', 'Due reminder lead days'],
        ['monthlyCycleAlertsEnabled', 'Monthly cycle alerts'],
        ['reconciliationRemindersEnabled', 'Reconciliation reminders'],
        ['goalAlertsEnabled', 'Goal alerts'],
        ['defaultBillCategory', 'Default bill category'],
        ['defaultBillScope', 'Default bill ownership'],
        ['defaultPurchaseOwnership', 'Default purchase ownership'],
        ['defaultPurchaseCategory', 'Default purchase category'],
        ['billNotesTemplate', 'Bill notes template'],
        ['purchaseNotesTemplate', 'Purchase notes template'],
        ['uiDensity', 'UI density'],
        ['defaultLandingTab', 'Default landing tab'],
        ['dashboardCardOrder', 'Dashboard card order'],
        ['monthlyAutomationEnabled', 'Monthly automation enabled'],
        ['monthlyAutomationRunDay', 'Monthly automation day'],
        ['monthlyAutomationRunHour', 'Monthly automation hour'],
        ['monthlyAutomationRunMinute', 'Monthly automation minute'],
        ['monthlyAutomationRetryStrategy', 'Monthly automation retry strategy'],
        ['monthlyAutomationMaxRetries', 'Monthly automation max retries'],
        ['alertEscalationFailureStreakThreshold', 'Alert escalation failure streak threshold'],
        ['alertEscalationFailedStepsThreshold', 'Alert escalation failed steps threshold'],
        ['planningDefaultVersionKey', 'Planning default version'],
        ['planningAutoApplyMode', 'Planning auto-apply mode'],
        ['planningNegativeForecastFallback', 'Planning negative forecast fallback'],
      ]),
    [],
  )

  const currentPreferenceComparable = useMemo(
    () => ({
      ...preferenceDraft,
      dashboardCardOrder: [...preferenceDraft.dashboardCardOrder],
      dueReminderDays: Number(preferenceDraft.dueReminderDays),
      monthlyAutomationRunDay: Number(preferenceDraft.monthlyAutomationRunDay),
      monthlyAutomationRunHour: Number(preferenceDraft.monthlyAutomationRunHour),
      monthlyAutomationRunMinute: Number(preferenceDraft.monthlyAutomationRunMinute),
      monthlyAutomationMaxRetries: Number(preferenceDraft.monthlyAutomationMaxRetries),
      alertEscalationFailureStreakThreshold: Number(preferenceDraft.alertEscalationFailureStreakThreshold),
      alertEscalationFailedStepsThreshold: Number(preferenceDraft.alertEscalationFailedStepsThreshold),
    }),
    [preferenceDraft],
  )

  const selectedProfile = settingsProfiles.find((profile) => profile._id === selectedProfileCompareId) ?? null
  const selectedProfileDiffRows = useMemo(
    () => computePreferenceDiffRows(parsePreferenceJson(selectedProfile?.preferenceJson), currentPreferenceComparable, preferenceFieldLabels),
    [currentPreferenceComparable, preferenceFieldLabels, selectedProfile?.preferenceJson],
  )

  const selectedHistory = settingsPreferenceHistory.find((entry) => entry._id === selectedHistoryCompareId) ?? null
  const selectedHistoryDiffRows = useMemo(
    () =>
      computePreferenceDiffRows(
        parsePreferenceJson(selectedHistory?.beforeJson),
        parsePreferenceJson(selectedHistory?.afterJson),
        preferenceFieldLabels,
      ),
    [preferenceFieldLabels, selectedHistory?.afterJson, selectedHistory?.beforeJson],
  )

  const settingsHealthChecks = useMemo(() => {
    const checks: Array<{ id: string; label: string; detail: string; severity: 'good' | 'warning' | 'critical' }> = []
    if (!preferenceDraft.monthlyAutomationEnabled) {
      checks.push({
        id: 'automation-disabled',
        label: 'Monthly automation is off',
        detail: 'Cycle auto-run preferences are configured but automatic monthly execution is disabled.',
        severity: 'warning',
      })
    } else {
      checks.push({
        id: 'automation-enabled',
        label: 'Monthly automation enabled',
        detail: `Auto-run scheduled for day ${preferenceDraft.monthlyAutomationRunDay} at ${formatClockTime(
          preferenceDraft.monthlyAutomationRunHour,
          preferenceDraft.monthlyAutomationRunMinute,
        )}.`,
        severity: 'good',
      })
    }

    if (preferenceDraft.planningAutoApplyMode !== 'manual_only' && preferenceDraft.planningNegativeForecastFallback === 'warn_only') {
      checks.push({
        id: 'planning-fallback-warn-only',
        label: 'Planning auto-apply fallback is warn-only',
        detail: 'Auto-apply is enabled but negative forecasts will only warn and not automatically rebalance.',
        severity: 'warning',
      })
    } else {
      checks.push({
        id: 'planning-fallback-covered',
        label: 'Planning fallback configured',
        detail: `Negative forecast behavior: ${preferenceDraft.planningNegativeForecastFallback.replaceAll('_', ' ')}.`,
        severity: 'good',
      })
    }

    if (!preferenceDraft.dueRemindersEnabled && !preferenceDraft.monthlyCycleAlertsEnabled && !preferenceDraft.reconciliationRemindersEnabled) {
      checks.push({
        id: 'alerts-mostly-off',
        label: 'Most reminders are disabled',
        detail: 'Due, cycle, and reconciliation reminders are all off. You may miss monthly maintenance steps.',
        severity: 'critical',
      })
    } else {
      checks.push({
        id: 'alerts-on',
        label: 'Operational reminders active',
        detail: 'At least one key reminder channel is enabled for regular finance maintenance.',
        severity: 'good',
      })
    }

    const exportsPolicy = retentionPolicies.find((policy) => policy.policyKey === 'exports')
    if (!exportsPolicy || !exportsPolicy.enabled) {
      checks.push({
        id: 'retention-exports-disabled',
        label: 'Export retention disabled',
        detail: 'Export ZIPs and download logs may remain longer than intended unless retention is enabled.',
        severity: 'warning',
      })
    } else {
      checks.push({
        id: 'retention-exports-enabled',
        label: 'Export retention enabled',
        detail: exportsPolicy.retentionDays === 0 ? 'Exports retention is set to forever.' : `Exports retained for ${exportsPolicy.retentionDays} days.`,
        severity: exportsPolicy.retentionDays === 0 ? 'warning' : 'good',
      })
    }

    const score = Math.max(
      0,
      Math.min(
        100,
        100 -
          checks.filter((check) => check.severity === 'critical').length * 25 -
          checks.filter((check) => check.severity === 'warning').length * 10,
      ),
    )

    return { checks, score }
  }, [preferenceDraft, retentionPolicies])

  return (
    <section className="content-grid" aria-label="Settings and trust controls">
      <article className="panel panel-trust-kpis">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Settings</p>
            <h2>Core settings foundation</h2>
            <p className="panel-value">Profile, notifications, defaults, and UI personalization</p>
          </div>
          <div className="panel-actions">
            <button
              type="button"
              className="btn btn-secondary btn--sm"
              onClick={() => void onSavePreferences()}
              disabled={isSavingPreferences || !hasUnsavedPreferences}
            >
              {isSavingPreferences ? 'Saving...' : 'Save settings'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              onClick={onResetPreferencesDraft}
              disabled={isSavingPreferences || !hasUnsavedPreferences}
            >
              Reset
            </button>
          </div>
        </header>

        <div className="trust-kpi-grid" aria-label="Settings foundation overview">
          <div className="trust-kpi-tile">
            <p>Profile</p>
            <strong>{preferenceDraft.displayName.trim() || 'Not set'}</strong>
            <small>{preferenceDraft.timezone}</small>
          </div>
          <div className="trust-kpi-tile">
            <p>Format</p>
            <strong>
              {preferenceDraft.currency} · {preferenceDraft.locale}
            </strong>
            <small>Week starts {preferenceDraft.weekStartDay}</small>
          </div>
          <div className="trust-kpi-tile">
            <p>Notifications</p>
            <strong>{notificationEnabledCount}/4 on</strong>
            <small>Due lead {preferenceDraft.dueReminderDays}d</small>
          </div>
          <div className="trust-kpi-tile">
            <p>Defaults</p>
            <strong>
              {preferenceDraft.defaultBillScope === 'personal' ? 'Personal' : 'Shared'} bills
            </strong>
            <small>{preferenceDraft.defaultPurchaseOwnership === 'personal' ? 'Personal' : 'Shared'} purchases</small>
          </div>
          <div className="trust-kpi-tile">
            <p>UI Density</p>
            <strong>{preferenceDraft.uiDensity}</strong>
            <small>Landing tab {defaultLandingTabLabel}</small>
          </div>
          <div className="trust-kpi-tile">
            <p>Dashboard order</p>
            <strong>{preferenceDraft.dashboardCardOrder.length} cards</strong>
            <small>{hasUnsavedPreferences ? 'Unsaved changes' : 'Synced with app shell'}</small>
          </div>
        </div>
      </article>

      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Phase 1</p>
            <h2>Profile + app preferences</h2>
            <p className="panel-value">Global formatting and calendar defaults used across the app shell</p>
          </div>
        </header>

        <div className="entry-form entry-form--grid">
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="settings-display-name">Display name</label>
              <input
                id="settings-display-name"
                value={preferenceDraft.displayName}
                placeholder="Optional"
                onChange={(event) => setPreferenceDraft((prev) => ({ ...prev, displayName: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="settings-timezone">Timezone</label>
              <select
                id="settings-timezone"
                value={preferenceDraft.timezone}
                onChange={(event) => setPreferenceDraft((prev) => ({ ...prev, timezone: event.target.value }))}
              >
                {timezoneOptions.map((timezone) => (
                  <option key={timezone} value={timezone}>
                    {timezone}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="settings-currency">Base currency</label>
              <select
                id="settings-currency"
                value={preferenceDraft.currency}
                onChange={(event) => setPreferenceDraft((prev) => ({ ...prev, currency: event.target.value }))}
              >
                {currencyOptions.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="settings-locale">Locale</label>
              <select
                id="settings-locale"
                value={preferenceDraft.locale}
                onChange={(event) => setPreferenceDraft((prev) => ({ ...prev, locale: event.target.value }))}
              >
                {localeOptions.map((locale) => (
                  <option key={locale} value={locale}>
                    {locale}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="settings-week-start">Week start day</label>
              <select
                id="settings-week-start"
                value={preferenceDraft.weekStartDay}
                onChange={(event) =>
                  setPreferenceDraft((prev) => ({ ...prev, weekStartDay: event.target.value as WeekStartDay }))
                }
              >
                {weekStartDayOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="settings-default-month">Default month</label>
              <select
                id="settings-default-month"
                value={preferenceDraft.defaultMonthPreset}
                onChange={(event) =>
                  setPreferenceDraft((prev) => ({ ...prev, defaultMonthPreset: event.target.value as DefaultMonthPreset }))
                }
              >
                {defaultMonthPresetOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="form-hint">
            Currency, locale, timezone, density, dashboard order, and landing tab are applied across the app shell after save.
          </p>
        </div>
      </article>

      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Phase 1</p>
            <h2>Notification controls</h2>
            <p className="panel-value">In-app reminder preferences and alert toggles</p>
          </div>
        </header>

        <div className="entry-form entry-form--grid">
          <div className="form-grid">
            <div className="form-field form-field--span2">
              <label className="checkbox-row" htmlFor="settings-due-reminders-enabled">
                <input
                  id="settings-due-reminders-enabled"
                  type="checkbox"
                  checked={preferenceDraft.dueRemindersEnabled}
                  onChange={(event) =>
                    setPreferenceDraft((prev) => ({ ...prev, dueRemindersEnabled: event.target.checked }))
                  }
                />
                Due reminders enabled
              </label>
            </div>

            <div className="form-field">
              <label htmlFor="settings-due-reminder-days">Due reminder lead days</label>
              <input
                id="settings-due-reminder-days"
                type="number"
                min="0"
                max="60"
                step="1"
                value={preferenceDraft.dueReminderDays}
                onChange={(event) => setPreferenceDraft((prev) => ({ ...prev, dueReminderDays: event.target.value }))}
              />
            </div>

            <div className="form-field form-field--span2">
              <label className="checkbox-row" htmlFor="settings-cycle-alerts-enabled">
                <input
                  id="settings-cycle-alerts-enabled"
                  type="checkbox"
                  checked={preferenceDraft.monthlyCycleAlertsEnabled}
                  onChange={(event) =>
                    setPreferenceDraft((prev) => ({ ...prev, monthlyCycleAlertsEnabled: event.target.checked }))
                  }
                />
                Monthly cycle alerts
              </label>
            </div>

            <div className="form-field form-field--span2">
              <label className="checkbox-row" htmlFor="settings-reconcile-reminders-enabled">
                <input
                  id="settings-reconcile-reminders-enabled"
                  type="checkbox"
                  checked={preferenceDraft.reconciliationRemindersEnabled}
                  onChange={(event) =>
                    setPreferenceDraft((prev) => ({ ...prev, reconciliationRemindersEnabled: event.target.checked }))
                  }
                />
                Reconciliation reminders
              </label>
            </div>

            <div className="form-field form-field--span2">
              <label className="checkbox-row" htmlFor="settings-goal-alerts-enabled">
                <input
                  id="settings-goal-alerts-enabled"
                  type="checkbox"
                  checked={preferenceDraft.goalAlertsEnabled}
                  onChange={(event) =>
                    setPreferenceDraft((prev) => ({ ...prev, goalAlertsEnabled: event.target.checked }))
                  }
                />
                Goal alerts
              </label>
            </div>
          </div>
        </div>
      </article>

      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Phase 1</p>
            <h2>Category + naming defaults</h2>
            <p className="panel-value">Defaults used when creating new bills and purchases</p>
          </div>
        </header>

        <div className="entry-form entry-form--grid">
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="settings-default-bill-category">Default bill category</label>
              <select
                id="settings-default-bill-category"
                value={preferenceDraft.defaultBillCategory}
                onChange={(event) =>
                  setPreferenceDraft((prev) => ({ ...prev, defaultBillCategory: event.target.value as BillCategory }))
                }
              >
                <option value="housing">Housing</option>
                <option value="utilities">Utilities</option>
                <option value="council_tax">Council Tax</option>
                <option value="insurance">Insurance</option>
                <option value="transport">Transport</option>
                <option value="health">Health</option>
                <option value="debt">Debt</option>
                <option value="subscriptions">Subscriptions</option>
                <option value="education">Education</option>
                <option value="childcare">Childcare</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="settings-default-bill-scope">Default bill ownership</label>
              <select
                id="settings-default-bill-scope"
                value={preferenceDraft.defaultBillScope}
                onChange={(event) =>
                  setPreferenceDraft((prev) => ({ ...prev, defaultBillScope: event.target.value as BillScope }))
                }
              >
                <option value="shared">Shared / household</option>
                <option value="personal">Personal</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="settings-default-purchase-ownership">Default purchase ownership</label>
              <select
                id="settings-default-purchase-ownership"
                value={preferenceDraft.defaultPurchaseOwnership}
                onChange={(event) =>
                  setPreferenceDraft((prev) => ({
                    ...prev,
                    defaultPurchaseOwnership: event.target.value as FinancePreference['defaultPurchaseOwnership'],
                  }))
                }
              >
                <option value="shared">Shared / household</option>
                <option value="personal">Personal</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="settings-default-purchase-category">Default purchase category</label>
              <input
                id="settings-default-purchase-category"
                value={preferenceDraft.defaultPurchaseCategory}
                placeholder="Optional"
                onChange={(event) =>
                  setPreferenceDraft((prev) => ({ ...prev, defaultPurchaseCategory: event.target.value }))
                }
              />
            </div>

            <div className="form-field form-field--span2">
              <label htmlFor="settings-bill-notes-template">Bill notes template</label>
              <textarea
                id="settings-bill-notes-template"
                rows={3}
                value={preferenceDraft.billNotesTemplate}
                placeholder="Optional default note for new bills"
                onChange={(event) => setPreferenceDraft((prev) => ({ ...prev, billNotesTemplate: event.target.value }))}
              />
            </div>

            <div className="form-field form-field--span2">
              <label htmlFor="settings-purchase-notes-template">Purchase notes template</label>
              <textarea
                id="settings-purchase-notes-template"
                rows={3}
                value={preferenceDraft.purchaseNotesTemplate}
                placeholder="Optional default note for new purchases"
                onChange={(event) =>
                  setPreferenceDraft((prev) => ({ ...prev, purchaseNotesTemplate: event.target.value }))
                }
              />
            </div>
          </div>

          <p className="form-hint">
            Bill and Purchase add forms will use these defaults for faster manual entry after you save.
          </p>
        </div>
      </article>

      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Phase 3</p>
            <h2>Automation + planning defaults</h2>
            <p className="panel-value">Monthly cycle auto-run preferences and planning fallback behavior</p>
          </div>
        </header>

        <div className="entry-form entry-form--grid">
          <div className="form-grid">
            <div className="form-field form-field--span2">
              <label className="checkbox-row" htmlFor="settings-monthly-automation-enabled">
                <input
                  id="settings-monthly-automation-enabled"
                  type="checkbox"
                  checked={preferenceDraft.monthlyAutomationEnabled}
                  onChange={(event) =>
                    setPreferenceDraft((prev) => ({ ...prev, monthlyAutomationEnabled: event.target.checked }))
                  }
                />
                Enable monthly automation preferences
              </label>
            </div>

            <div className="form-field">
              <label htmlFor="settings-monthly-automation-day">Auto-run day (1-31)</label>
              <input
                id="settings-monthly-automation-day"
                type="number"
                min="1"
                max="31"
                step="1"
                value={preferenceDraft.monthlyAutomationRunDay}
                onChange={(event) =>
                  setPreferenceDraft((prev) => ({ ...prev, monthlyAutomationRunDay: event.target.value }))
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="settings-monthly-automation-time">Auto-run time (HH:MM)</label>
              <div className="settings-inline-split">
                <input
                  id="settings-monthly-automation-time"
                  type="number"
                  min="0"
                  max="23"
                  step="1"
                  value={preferenceDraft.monthlyAutomationRunHour}
                  onChange={(event) =>
                    setPreferenceDraft((prev) => ({ ...prev, monthlyAutomationRunHour: event.target.value }))
                  }
                />
                <input
                  aria-label="Auto-run minute"
                  type="number"
                  min="0"
                  max="59"
                  step="1"
                  value={preferenceDraft.monthlyAutomationRunMinute}
                  onChange={(event) =>
                    setPreferenceDraft((prev) => ({ ...prev, monthlyAutomationRunMinute: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="settings-monthly-automation-retry">Retry behavior</label>
              <select
                id="settings-monthly-automation-retry"
                value={preferenceDraft.monthlyAutomationRetryStrategy}
                onChange={(event) =>
                  setPreferenceDraft((prev) => ({
                    ...prev,
                    monthlyAutomationRetryStrategy: event.target.value as MonthlyAutomationRetryStrategy,
                  }))
                }
              >
                {monthlyAutomationRetryStrategyOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="settings-monthly-automation-max-retries">Max retries</label>
              <input
                id="settings-monthly-automation-max-retries"
                type="number"
                min="0"
                max="10"
                step="1"
                value={preferenceDraft.monthlyAutomationMaxRetries}
                onChange={(event) =>
                  setPreferenceDraft((prev) => ({ ...prev, monthlyAutomationMaxRetries: event.target.value }))
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="settings-alert-failure-streak-threshold">Escalate after failure streak</label>
              <input
                id="settings-alert-failure-streak-threshold"
                type="number"
                min="1"
                max="12"
                step="1"
                value={preferenceDraft.alertEscalationFailureStreakThreshold}
                onChange={(event) =>
                  setPreferenceDraft((prev) => ({
                    ...prev,
                    alertEscalationFailureStreakThreshold: event.target.value,
                  }))
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="settings-alert-failed-steps-threshold">Escalate after failed steps</label>
              <input
                id="settings-alert-failed-steps-threshold"
                type="number"
                min="1"
                max="20"
                step="1"
                value={preferenceDraft.alertEscalationFailedStepsThreshold}
                onChange={(event) =>
                  setPreferenceDraft((prev) => ({
                    ...prev,
                    alertEscalationFailedStepsThreshold: event.target.value,
                  }))
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="settings-planning-default-version">Planning default version</label>
              <select
                id="settings-planning-default-version"
                value={preferenceDraft.planningDefaultVersionKey}
                onChange={(event) =>
                  setPreferenceDraft((prev) => ({
                    ...prev,
                    planningDefaultVersionKey: event.target.value as PlanningVersionKey,
                  }))
                }
              >
                {planningDefaultVersionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="settings-planning-auto-apply-mode">Planning auto-apply mode</label>
              <select
                id="settings-planning-auto-apply-mode"
                value={preferenceDraft.planningAutoApplyMode}
                onChange={(event) =>
                  setPreferenceDraft((prev) => ({
                    ...prev,
                    planningAutoApplyMode: event.target.value as PlanningAutoApplyMode,
                  }))
                }
              >
                {planningAutoApplyModeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field form-field--span2">
              <label htmlFor="settings-planning-negative-fallback">Negative forecast fallback behavior</label>
              <select
                id="settings-planning-negative-fallback"
                value={preferenceDraft.planningNegativeForecastFallback}
                onChange={(event) =>
                  setPreferenceDraft((prev) => ({
                    ...prev,
                    planningNegativeForecastFallback: event.target.value as PlanningNegativeForecastFallback,
                  }))
                }
              >
                {planningNegativeForecastFallbackOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bulk-summary" aria-label="Automation and planning defaults summary">
            <div>
              <p>Cycle automation</p>
              <strong>{preferenceDraft.monthlyAutomationEnabled ? 'Enabled' : 'Disabled'}</strong>
              <small>
                Day {preferenceDraft.monthlyAutomationRunDay} at{' '}
                {formatClockTime(preferenceDraft.monthlyAutomationRunHour, preferenceDraft.monthlyAutomationRunMinute)}
              </small>
            </div>
            <div>
              <p>Retry behavior</p>
              <strong>{preferenceDraft.monthlyAutomationRetryStrategy.replaceAll('_', ' ')}</strong>
              <small>Max retries {preferenceDraft.monthlyAutomationMaxRetries}</small>
            </div>
            <div>
              <p>Planning defaults</p>
              <strong>{preferenceDraft.planningDefaultVersionKey}</strong>
              <small>
                {preferenceDraft.planningAutoApplyMode.replaceAll('_', ' ')} • {preferenceDraft.planningNegativeForecastFallback.replaceAll('_', ' ')}
              </small>
            </div>
          </div>

          <p className="form-hint">
            These are power-user defaults for monthly operations and planning behavior. Save settings to persist them.
          </p>
        </div>
      </article>

      <article className="panel panel-trust-kpis">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Phase 3</p>
            <h2>Settings health panel</h2>
            <p className="panel-value">Misconfiguration checks and operational readiness signals</p>
          </div>
        </header>

        <div className="trust-kpi-grid" aria-label="Settings health score and checks">
          <div className="trust-kpi-tile">
            <p>Health score</p>
            <strong>{settingsHealthChecks.score}/100</strong>
            <small>Warnings and critical checks reduce score</small>
          </div>
          <div className="trust-kpi-tile">
            <p>Critical checks</p>
            <strong>{settingsHealthChecks.checks.filter((check) => check.severity === 'critical').length}</strong>
            <small>Require action before relying on automation</small>
          </div>
          <div className="trust-kpi-tile">
            <p>Warnings</p>
            <strong>{settingsHealthChecks.checks.filter((check) => check.severity === 'warning').length}</strong>
            <small>Recommended improvements</small>
          </div>
          <div className="trust-kpi-tile">
            <p>Automation window</p>
            <strong>
              Day {preferenceDraft.monthlyAutomationRunDay} {formatClockTime(preferenceDraft.monthlyAutomationRunHour, preferenceDraft.monthlyAutomationRunMinute)}
            </strong>
            <small>{preferenceDraft.monthlyAutomationEnabled ? 'Enabled' : 'Disabled'}</small>
          </div>
        </div>

        <div className="settings-health-list" role="list" aria-label="Settings health checks">
          {settingsHealthChecks.checks.map((check) => (
            <div key={check.id} className={`settings-health-row settings-health-row--${check.severity}`} role="listitem">
              <div>
                <strong>{check.label}</strong>
                <small>{check.detail}</small>
              </div>
              <span className={check.severity === 'critical' ? 'pill pill--critical' : check.severity === 'warning' ? 'pill pill--warning' : 'pill pill--good'}>
                {check.severity}
              </span>
            </div>
          ))}
        </div>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Phase 3</p>
            <h2>Settings profile templates</h2>
            <p className="panel-value">
              {settingsProfiles.length} reusable profile{settingsProfiles.length === 1 ? '' : 's'}
            </p>
          </div>
        </header>

        <div className="entry-form entry-form--grid">
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="settings-profile-name">Profile name</label>
              <input
                id="settings-profile-name"
                placeholder="Debt focus month"
                value={settingsProfileName}
                onChange={(event) => setSettingsProfileName(event.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="settings-profile-description">Description</label>
              <input
                id="settings-profile-description"
                placeholder="Optional notes"
                value={settingsProfileDescription}
                onChange={(event) => setSettingsProfileDescription(event.target.value)}
              />
            </div>
          </div>

          <div className="row-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void onSaveSettingsProfile()}
              disabled={isSavingSettingsProfile || settingsProfileName.trim().length < 2}
            >
              {isSavingSettingsProfile ? 'Saving profile...' : 'Save current settings as profile'}
            </button>
          </div>

          {!settingsProfiles.length ? (
            <p className="empty-state">No settings profiles yet. Save your current setup as a reusable template.</p>
          ) : (
            <div className="settings-profile-list" role="list" aria-label="Saved settings profiles">
              {settingsProfiles.map((profile) => {
                const diffCount = computePreferenceDiffRows(
                  parsePreferenceJson(profile.preferenceJson),
                  currentPreferenceComparable,
                  preferenceFieldLabels,
                ).length
                return (
                  <div key={profile._id} className="settings-profile-row" role="listitem">
                    <div className="settings-profile-row__meta">
                      <div>
                        <strong>{profile.name}</strong>
                        <small>{profile.description || 'No description'}</small>
                      </div>
                      <div>
                        <small>Updated {cycleDateLabel.format(new Date(profile.updatedAt))}</small>
                        <small>{profile.lastAppliedAt ? `Applied ${cycleDateLabel.format(new Date(profile.lastAppliedAt))}` : 'Not applied yet'}</small>
                      </div>
                    </div>
                    <div className="settings-profile-row__actions">
                      <span className="pill pill--neutral">{diffCount} changes vs current</span>
                      <button
                        type="button"
                        className="btn btn-ghost btn--sm"
                        onClick={() => setSelectedProfileCompareId((prev) => (prev === profile._id ? null : profile._id))}
                      >
                        {selectedProfileCompareId === profile._id ? 'Hide diff' : 'Compare'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn--sm"
                        onClick={() => void onApplySettingsProfile(profile._id)}
                        disabled={applyingSettingsProfileId === profile._id}
                      >
                        {applyingSettingsProfileId === profile._id ? 'Applying...' : 'Apply'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn--sm"
                        onClick={() => void onDeleteSettingsProfile(profile._id)}
                        disabled={deletingSettingsProfileId === profile._id}
                      >
                        {deletingSettingsProfileId === profile._id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {selectedProfile ? (
            <div className="settings-diff-panel" aria-label="Selected profile diff">
              <div className="settings-diff-panel__header">
                <div>
                  <p className="panel-kicker">Compare</p>
                  <h3>{selectedProfile.name} vs current draft</h3>
                </div>
                <span className="pill pill--neutral">{selectedProfileDiffRows.length} changed fields</span>
              </div>
              {selectedProfileDiffRows.length === 0 ? (
                <p className="empty-state">This profile matches the current draft.</p>
              ) : (
                <div className="table-wrap table-wrap--card">
                  <table className="data-table data-table--wide">
                    <thead>
                      <tr>
                        <th scope="col">Field</th>
                        <th scope="col">Profile</th>
                        <th scope="col">Current draft</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProfileDiffRows.slice(0, 20).map((row) => (
                        <tr key={row.key}>
                          <td>{row.label}</td>
                          <td>{row.before}</td>
                          <td>{row.after}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Phase 3</p>
            <h2>Settings change history + restore points</h2>
            <p className="panel-value">
              {settingsPreferenceHistory.length} preference change event{settingsPreferenceHistory.length === 1 ? '' : 's'}
            </p>
          </div>
        </header>

        {!settingsPreferenceHistory.length ? (
          <p className="empty-state">No settings preference changes have been recorded yet.</p>
        ) : (
          <>
            <div className="table-wrap table-wrap--card">
              <table className="data-table data-table--wide" data-testid="settings-history-table">
                <caption className="sr-only">Settings preference history and restore points</caption>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Action</th>
                    <th scope="col">Source</th>
                    <th scope="col">Changed fields</th>
                    <th scope="col">Restore</th>
                    <th scope="col">Compare</th>
                  </tr>
                </thead>
                <tbody>
                  {settingsPreferenceHistory.map((entry) => (
                    <tr key={entry._id}>
                      <td>{cycleDateLabel.format(new Date(entry.createdAt))}</td>
                      <td>{entry.action.replaceAll('_', ' ')}</td>
                      <td>{entry.source ?? 'unknown'}</td>
                      <td>{entry.changedFields.length ? entry.changedFields.slice(0, 4).join(', ') : 'n/a'}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn--sm"
                            onClick={() => void onRestoreSettingsHistory(entry._id, 'before')}
                            disabled={!entry.beforeJson || restoringSettingsHistoryId === entry._id}
                          >
                            Restore before
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn--sm"
                            onClick={() => void onRestoreSettingsHistory(entry._id, 'after')}
                            disabled={!entry.afterJson || restoringSettingsHistoryId === entry._id}
                          >
                            {restoringSettingsHistoryId === entry._id ? 'Restoring...' : 'Restore after'}
                          </button>
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn--sm"
                          onClick={() => setSelectedHistoryCompareId((prev) => (prev === entry._id ? null : entry._id))}
                        >
                          {selectedHistoryCompareId === entry._id ? 'Hide diff' : 'Compare'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedHistory ? (
              <div className="settings-diff-panel" aria-label="Selected history diff">
                <div className="settings-diff-panel__header">
                  <div>
                    <p className="panel-kicker">Restore point compare</p>
                    <h3>{selectedHistory.action.replaceAll('_', ' ')}</h3>
                  </div>
                  <span className="pill pill--neutral">{selectedHistoryDiffRows.length} changed fields</span>
                </div>
                {selectedHistoryDiffRows.length === 0 ? (
                  <p className="empty-state">No before/after diff is available for this event.</p>
                ) : (
                  <div className="table-wrap table-wrap--card">
                    <table className="data-table data-table--wide">
                      <thead>
                        <tr>
                          <th scope="col">Field</th>
                          <th scope="col">Before</th>
                          <th scope="col">After</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedHistoryDiffRows.slice(0, 24).map((row) => (
                          <tr key={row.key}>
                            <td>{row.label}</td>
                            <td>{row.before}</td>
                            <td>{row.after}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
          </>
        )}
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Phase 1</p>
            <h2>UI personalization</h2>
            <p className="panel-value">Density, default landing tab, and dashboard card order</p>
          </div>
        </header>

        <div className="entry-form entry-form--grid">
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="settings-ui-density">Density</label>
              <select
                id="settings-ui-density"
                value={preferenceDraft.uiDensity}
                onChange={(event) => setPreferenceDraft((prev) => ({ ...prev, uiDensity: event.target.value as UiDensity }))}
              >
                {uiDensityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="settings-default-landing-tab">Default landing tab</label>
              <select
                id="settings-default-landing-tab"
                value={preferenceDraft.defaultLandingTab}
                onChange={(event) =>
                  setPreferenceDraft((prev) => ({
                    ...prev,
                    defaultLandingTab: event.target.value as FinancePreference['defaultLandingTab'],
                  }))
                }
              >
                {defaultLandingTabOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field form-field--span2">
              <label>Dashboard card order</label>
              <div className="settings-order-list" role="list" aria-label="Dashboard card order">
                {preferenceDraft.dashboardCardOrder.map((cardId, index) => (
                  <div key={cardId} className="settings-order-row" role="listitem">
                    <div className="settings-order-row__meta">
                      <span className="settings-order-row__index">{index + 1}</span>
                      <div>
                        <strong>{dashboardCardLabelMap.get(cardId) ?? cardId}</strong>
                        <small>{cardId}</small>
                      </div>
                    </div>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn--sm"
                        onClick={() => moveDashboardCard(cardId, -1)}
                        disabled={index === 0}
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn--sm"
                        onClick={() => moveDashboardCard(cardId, 1)}
                        disabled={index === preferenceDraft.dashboardCardOrder.length - 1}
                      >
                        Down
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="row-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void onSavePreferences()}
              disabled={isSavingPreferences || !hasUnsavedPreferences}
            >
              {isSavingPreferences ? 'Saving settings...' : 'Save core settings'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onResetPreferencesDraft}
              disabled={isSavingPreferences || !hasUnsavedPreferences}
            >
              Reset changes
            </button>
          </div>
        </div>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Phase 2</p>
            <h2>Security center</h2>
            <p className="panel-value">
              {securityActiveCount} active session{securityActiveCount === 1 ? '' : 's'} •{' '}
              {clientDeviceSessionCount ?? securityThisDeviceCount} on this device
            </p>
          </div>
          <div className="panel-actions">
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              onClick={() => void onRefreshSecuritySessions()}
              disabled={isLoadingSecuritySessions || isRefreshingSecuritySessions || isRevokingAllSessions}
            >
              {isLoadingSecuritySessions || isRefreshingSecuritySessions ? 'Refreshing...' : 'Refresh sessions'}
            </button>
            <button
              type="button"
              className="btn btn-danger btn--sm"
              onClick={() => void onSignOutAllSessions()}
              disabled={isRevokingAllSessions || (hasLoadedSecuritySessions && securitySessions.length === 0)}
            >
              {isRevokingAllSessions ? 'Signing out...' : 'Sign out all sessions'}
            </button>
          </div>
        </header>

        <p className="subnote">
          Uses Clerk session activity to show devices, browsers, and recent sign-in history. Revoking a session will end
          it across devices.
        </p>

        {!hasLoadedSecuritySessions && isLoadingSecuritySessions ? (
          <p className="empty-state">Loading session activity...</p>
        ) : securitySessions.length === 0 ? (
          <p className="empty-state">No active session activity found for this user.</p>
        ) : (
          <>
            <div className="table-wrap table-wrap--card">
              <table className="data-table data-table--wide" data-testid="settings-security-sessions-table">
                <caption className="sr-only">Active sessions and devices</caption>
                <thead>
                  <tr>
                    <th scope="col">Device</th>
                    <th scope="col">Status</th>
                    <th scope="col">Last active</th>
                    <th scope="col">Signed in</th>
                    <th scope="col">Location</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {securitySessions.map((session) => (
                    <tr key={session.sessionId}>
                      <td>
                        <strong>{session.deviceLabel}</strong>
                        <small className="subnote">
                          {session.browserLabel}
                          {session.current ? ' • current' : session.onThisDevice ? ' • this device' : ''}
                        </small>
                      </td>
                      <td>
                        <span className={sessionStatusPill(session.status)}>{session.status}</span>
                      </td>
                      <td>{session.lastActiveAt > 0 ? cycleDateLabel.format(new Date(session.lastActiveAt)) : 'n/a'}</td>
                      <td>{session.createdAt > 0 ? cycleDateLabel.format(new Date(session.createdAt)) : 'n/a'}</td>
                      <td>
                        <strong>{session.locationLabel}</strong>
                        <small className="subnote">{session.ipAddress ?? 'No IP metadata'}</small>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn--sm"
                          onClick={() => void onRevokeSecuritySession(session.sessionId)}
                          disabled={isRevokingAllSessions || revokingSecuritySessionId === session.sessionId}
                        >
                          {revokingSecuritySessionId === session.sessionId ? 'Revoking...' : 'Revoke'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bulk-summary" aria-label="Recent sign-in activity">
              <div>
                <p>Recent sign-ins</p>
                <strong>{recentSecurityActivity.length}</strong>
                <small>Latest session creations</small>
              </div>
              <div>
                <p>Newest sign-in</p>
                <strong>
                  {recentSecurityActivity[0]?.createdAt
                    ? cycleDateLabel.format(new Date(recentSecurityActivity[0].createdAt))
                    : 'n/a'}
                </strong>
                <small>{recentSecurityActivity[0]?.browserLabel ?? 'No session activity'}</small>
              </div>
              <div>
                <p>Most recent activity</p>
                <strong>
                  {securitySessions[0]?.lastActiveAt ? cycleDateLabel.format(new Date(securitySessions[0].lastActiveAt)) : 'n/a'}
                </strong>
                <small>{securitySessions[0]?.deviceLabel ?? 'No active sessions'}</small>
              </div>
            </div>
          </>
        )}
      </article>

      <article className="panel panel-trust-kpis">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Settings</p>
            <h2>Trust + compliance center</h2>
            <p className="panel-value">Privacy, export, deletion, and retention controls</p>
          </div>
        </header>

        <div className="trust-kpi-grid" aria-label="Settings overview metrics">
          <div className="trust-kpi-tile">
            <p>Diagnostics</p>
            <strong>{consentSettings.diagnosticsEnabled ? 'On' : 'Off'}</strong>
            <small>Sentry opt-in</small>
          </div>
          <div className="trust-kpi-tile">
            <p>Analytics</p>
            <strong>{consentSettings.analyticsEnabled ? 'On' : 'Off'}</strong>
            <small>Product analytics toggle</small>
          </div>
          <div className="trust-kpi-tile">
            <p>Consent events</p>
            <strong>{consentLogs.length}</strong>
            <small>Audit trail entries</small>
          </div>
          <div className="trust-kpi-tile">
            <p>Latest export</p>
            <strong>{latestExport ? latestExport.status : 'none'}</strong>
            <small>{latestExport ? cycleDateLabel.format(new Date(latestExport.createdAt)) : 'No export yet'}</small>
          </div>
          <div className="trust-kpi-tile">
            <p>Deletion job</p>
            <strong>{latestDeletionJob ? latestDeletionJob.status : 'none'}</strong>
            <small>
              {latestDeletionJob ? cycleDateLabel.format(new Date(latestDeletionJob.updatedAt)) : 'No deletion jobs'}
            </small>
          </div>
          <div className="trust-kpi-tile">
            <p>Retention enabled</p>
            <strong>{retentionEnabledCount}</strong>
            <small>{retentionForeverCount} set to forever</small>
          </div>
        </div>
      </article>

      <article className="panel panel-launch">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Quick actions</p>
            <h2>Immediate operations</h2>
          </div>
        </header>

        <div className="entry-form entry-form--grid">
          <div className="row-actions">
            <button type="button" className="btn btn-primary" onClick={() => void onGenerateExport()} disabled={isExporting}>
              {isExporting ? 'Generating export...' : 'Generate export (ZIP)'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void onDownloadLatestExport()}
              disabled={!latestExport || latestExport.status !== 'ready'}
            >
              Download latest export
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void onRunRetentionNow()}
              disabled={isApplyingRetention}
            >
              {isApplyingRetention ? 'Applying retention...' : 'Run retention now'}
            </button>
          </div>

          {latestExport ? (
            <div className="bulk-summary" aria-label="Latest export details">
              <div>
                <p>Export status</p>
                <strong>
                  <span className={exportStatusPill(latestExport.status)}>{latestExport.status}</span>
                </strong>
                <small>{cycleDateLabel.format(new Date(latestExport.createdAt))}</small>
              </div>
              <div>
                <p>Export size</p>
                <strong>{latestExport.byteSize ? `${Math.max(1, Math.round(latestExport.byteSize / 1024))} KB` : 'n/a'}</strong>
                <small>Expires {cycleDateLabel.format(new Date(latestExport.expiresAt))}</small>
              </div>
            </div>
          ) : (
            <p className="subnote">No export has been generated yet.</p>
          )}

          {latestDeletionJob ? (
            <p className="subnote">
              Latest deletion job:{' '}
              <span className={deletionStatusPill(latestDeletionJob.status)}>{latestDeletionJob.status}</span>
              {deletionProgress ? ` • ${deletionProgress}` : ''}
            </p>
          ) : (
            <p className="subnote">No deletion jobs recorded.</p>
          )}
        </div>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Data portability</p>
            <h2>Export history</h2>
            <p className="panel-value">
              {exportHistory.length} export job{exportHistory.length === 1 ? '' : 's'} tracked
            </p>
          </div>
        </header>

        {!hasExportHistory ? (
          <p className="empty-state">No export jobs yet. Generate a ZIP export to create your first record.</p>
        ) : (
          <div className="table-wrap table-wrap--card">
            <table className="data-table data-table--wide" data-testid="settings-export-history-table">
              <caption className="sr-only">Export history</caption>
              <thead>
                <tr>
                  <th scope="col">Created</th>
                  <th scope="col">Status</th>
                  <th scope="col">Format</th>
                  <th scope="col">Size</th>
                  <th scope="col">Expires</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {exportHistory.map((entry) => (
                  <tr key={entry._id}>
                    <td>{cycleDateLabel.format(new Date(entry.createdAt))}</td>
                    <td>
                      <span className={exportStatusPill(entry.status)}>{entry.status}</span>
                    </td>
                    <td>{entry.formatVersion}</td>
                    <td>{entry.byteSize ? `${Math.max(1, Math.round(entry.byteSize / 1024))} KB` : 'n/a'}</td>
                    <td>{cycleDateLabel.format(new Date(entry.expiresAt))}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn--sm"
                        onClick={() => void onDownloadExportById(String(entry._id))}
                        disabled={entry.status !== 'ready'}
                      >
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Data portability</p>
            <h2>Download audit trail</h2>
            <p className="panel-value">
              {exportDownloadLogs.length} download event{exportDownloadLogs.length === 1 ? '' : 's'} recorded
            </p>
          </div>
        </header>

        {!hasExportDownloadAudit ? (
          <p className="empty-state">No export downloads recorded yet.</p>
        ) : (
          <div className="table-wrap table-wrap--card">
            <table className="data-table data-table--wide" data-testid="settings-export-download-audit-table">
              <caption className="sr-only">Export download audit trail</caption>
              <thead>
                <tr>
                  <th scope="col">Downloaded</th>
                  <th scope="col">Export ID</th>
                  <th scope="col">File</th>
                  <th scope="col">Size</th>
                  <th scope="col">Source</th>
                  <th scope="col">User agent</th>
                </tr>
              </thead>
              <tbody>
                {exportDownloadLogs.map((entry) => (
                  <tr key={entry._id}>
                    <td>{cycleDateLabel.format(new Date(entry.downloadedAt))}</td>
                    <td><code>{String(entry.exportId)}</code></td>
                    <td>{entry.filename}</td>
                    <td>{entry.byteSize ? `${Math.max(1, Math.round(entry.byteSize / 1024))} KB` : 'n/a'}</td>
                    <td>{entry.source ?? 'http_download'}</td>
                    <td>{entry.userAgent ?? 'n/a'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Privacy</p>
            <h2>Consent controls</h2>
            <p className="panel-value">Directly controls diagnostics and analytics collection</p>
          </div>
        </header>

        <div className="entry-form entry-form--grid">
          <div className="form-grid">
            <div className="form-field form-field--span2">
              <label className="checkbox-row" htmlFor="diagnostics-toggle">
                <input
                  id="diagnostics-toggle"
                  type="checkbox"
                  checked={consentSettings.diagnosticsEnabled}
                  onChange={(event) => void onToggleConsent('diagnostics', event.target.checked)}
                />
                Diagnostics (Sentry) opt-in
              </label>
            </div>

            <div className="form-field form-field--span2">
              <label className="checkbox-row" htmlFor="analytics-toggle">
                <input
                  id="analytics-toggle"
                  type="checkbox"
                  checked={consentSettings.analyticsEnabled}
                  onChange={(event) => void onToggleConsent('analytics', event.target.checked)}
                />
                Product analytics opt-in (placeholder)
              </label>
            </div>
          </div>

          <p className="form-hint">
            Changes are persisted and written to <strong>consent logs</strong> for audit history.
          </p>

          <div className="bulk-summary" aria-label="Data use explanations">
            <div>
              <p>Diagnostics (Sentry)</p>
              <strong>{consentSettings.diagnosticsEnabled ? 'Enabled' : 'Disabled'}</strong>
              <small>Error diagnostics only when you opt in. Finance records are not intentionally sent.</small>
            </div>
            <div>
              <p>Product analytics</p>
              <strong>{consentSettings.analyticsEnabled ? 'Enabled' : 'Disabled'}</strong>
              <small>Placeholder toggle for future analytics integration. No analytics SDK required in this phase.</small>
            </div>
            <div>
              <p>Data portability</p>
              <strong>ZIP export</strong>
              <small>JSON + CSV export files expire based on retention settings and downloads are audit logged.</small>
            </div>
          </div>
        </div>
      </article>

      <article className="panel panel-list">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Audit</p>
            <h2>Consent history</h2>
            <p className="panel-value">{visibleConsentLogs.length} in view</p>
          </div>
          <div className="panel-actions">
            <input
              aria-label="Search consent history"
              placeholder="Search type, version, state…"
              value={consentSearch}
              onChange={(event) => setConsentSearch(event.target.value)}
            />
            <select
              aria-label="Filter consent type"
              value={consentFilter}
              onChange={(event) => setConsentFilter(event.target.value as ConsentFilter)}
            >
              <option value="all">All types</option>
              <option value="diagnostics">Diagnostics</option>
              <option value="analytics">Analytics</option>
            </select>
            <select
              aria-label="Sort consent history"
              value={consentSort}
              onChange={(event) => setConsentSort(event.target.value as ConsentSortKey)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              onClick={() => {
                setConsentSearch('')
                setConsentFilter('all')
                setConsentSort('newest')
              }}
              disabled={!hasConsentFilters}
            >
              Clear
            </button>
          </div>
        </header>

        {consentLogs.length === 0 ? (
          <p className="empty-state">No consent changes logged yet.</p>
        ) : visibleConsentLogs.length === 0 ? (
          <p className="empty-state">No consent events match this filter.</p>
        ) : (
          <>
            <p className="subnote">
              Showing {visibleConsentLogs.length} of {consentLogs.length} consent event{consentLogs.length === 1 ? '' : 's'}.
            </p>
            <div className="table-wrap table-wrap--card">
              <table className="data-table" data-testid="settings-consent-history-table">
                <caption className="sr-only">Consent history</caption>
                <thead>
                  <tr>
                    <th scope="col">Type</th>
                    <th scope="col">State</th>
                    <th scope="col">Version</th>
                    <th scope="col">When</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleConsentLogs.map((entry) => (
                    <tr key={entry._id}>
                      <td>
                        <span className={consentTypePill(entry.consentType)}>{entry.consentType}</span>
                      </td>
                      <td>
                        <span className={entry.enabled ? 'pill pill--good' : 'pill pill--neutral'}>
                          {entry.enabled ? 'enabled' : 'disabled'}
                        </span>
                      </td>
                      <td>{entry.version}</td>
                      <td>{cycleDateLabel.format(new Date(entry.createdAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </article>

      <article className="panel panel-form">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Danger zone</p>
            <h2>Delete my Convex data</h2>
            <p className="panel-value">This removes your app records only</p>
          </div>
        </header>

        <div className="entry-form entry-form--grid">
          <div className="form-grid">
            <div className="form-field form-field--span2">
              <label htmlFor="delete-confirm">Type DELETE to confirm</label>
              <input
                id="delete-confirm"
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                placeholder="DELETE"
              />
            </div>
          </div>

          <div className="row-actions">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => void onRequestDeletion()}
              disabled={isDeleting || !deleteReady}
            >
              {isDeleting ? 'Deleting...' : 'Delete my data'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              onClick={() => setDeleteConfirmText('')}
              disabled={deleteConfirmText.length === 0 || isDeleting}
            >
              Clear
            </button>
          </div>

          <p className="form-hint">
            You must type <strong>DELETE</strong> exactly before the action is enabled.
          </p>

          {latestDeletionJob ? (
            <p className="subnote">
              Latest job status: <span className={deletionStatusPill(latestDeletionJob.status)}>{latestDeletionJob.status}</span> •{' '}
              {cycleDateLabel.format(new Date(latestDeletionJob.updatedAt))}
              {deletionProgress ? ` • ${deletionProgress}` : ''}
            </p>
          ) : null}
        </div>
      </article>

      <article className="panel panel-audit-events">
        <header className="panel-header">
          <div>
            <p className="panel-kicker">Operations</p>
            <h2>Retention policies</h2>
            <p className="panel-value">
              {visibleRetentionPolicies.length} in view • {retentionEnabledCount} enabled
            </p>
          </div>
          <div className="panel-actions">
            <input
              aria-label="Search retention policies"
              placeholder="Search policies…"
              value={retentionSearch}
              onChange={(event) => setRetentionSearch(event.target.value)}
            />
            <select
              aria-label="Sort retention policies"
              value={retentionSort}
              onChange={(event) => setRetentionSort(event.target.value as RetentionSortKey)}
            >
              <option value="policy_asc">Policy (A-Z)</option>
              <option value="retention_desc">Retention (high-low)</option>
              <option value="enabled_first">Enabled first</option>
            </select>
            <button
              type="button"
              className="btn btn-secondary btn--sm"
              onClick={() => void onRunRetentionNow()}
              disabled={isApplyingRetention}
            >
              {isApplyingRetention ? 'Applying...' : 'Run retention now'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn--sm"
              onClick={() => {
                setRetentionSearch('')
                setRetentionSort('policy_asc')
              }}
              disabled={!hasRetentionFilters}
            >
              Clear
            </button>
          </div>
        </header>

        {retentionPolicies.length === 0 ? (
          <p className="empty-state">Retention policies are unavailable.</p>
        ) : visibleRetentionPolicies.length === 0 ? (
          <p className="empty-state">No retention policies match this filter.</p>
        ) : (
          <div className="table-wrap table-wrap--card">
            <table className="data-table data-table--wide" data-testid="settings-retention-table">
              <caption className="sr-only">Retention policies</caption>
              <thead>
                <tr>
                  <th scope="col">Policy</th>
                  <th scope="col">Enabled</th>
                  <th scope="col">Retention</th>
                  <th scope="col">Update</th>
                </tr>
              </thead>
              <tbody>
                {visibleRetentionPolicies.map((policy) => (
                  <tr key={policy.policyKey}>
                    <td>{policyLabel(policy.policyKey)}</td>
                    <td>
                      <span className={policy.enabled ? 'pill pill--good' : 'pill pill--neutral'}>
                        {policy.enabled ? 'enabled' : 'disabled'}
                      </span>
                    </td>
                    <td>{policy.retentionDays === 0 ? 'Forever' : `${policy.retentionDays} days`}</td>
                    <td>
                      <div className="inline-cadence-controls">
                        <select
                          aria-label={`Retention days for ${policyLabel(policy.policyKey)}`}
                          value={policy.retentionDays}
                          onChange={(event) =>
                            void onUpsertRetention(policy.policyKey, Number(event.target.value), policy.enabled)
                          }
                        >
                          {presetOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label={`Retention enabled state for ${policyLabel(policy.policyKey)}`}
                          value={policy.enabled ? 'enabled' : 'disabled'}
                          onChange={(event) =>
                            void onUpsertRetention(
                              policy.policyKey,
                              policy.retentionDays,
                              event.target.value === 'enabled',
                            )
                          }
                        >
                          <option value="disabled">Disabled</option>
                          <option value="enabled">Enabled</option>
                        </select>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  )
}
