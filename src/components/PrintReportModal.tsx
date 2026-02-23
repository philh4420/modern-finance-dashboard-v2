import { useMemo, useState, type ChangeEvent } from 'react'
import {
  CrudButton,
  CrudInput,
  CrudLabel,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  PillBadge,
  ScrollArea,
} from '@/components/ui'
import type { DefaultMonthPreset } from './financeTypes'

type PrintReportConfig = {
  startMonth: string
  endMonth: string
  includeDashboard: boolean
  includeIncome: boolean
  includeBills: boolean
  includeCards: boolean
  includeLoans: boolean
  includeAccounts: boolean
  includeGoals: boolean
  includePlanning: boolean
  includeReconcile: boolean
  includeNotes: boolean
  includeAuditLogs: boolean
  includePurchases: boolean
}

type PrintReportModalProps = {
  open: boolean
  onClose: () => void
  onStartPrint: (config: PrintReportConfig) => void
  locale?: string
  defaultMonthPreset?: DefaultMonthPreset
}

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

const isValidMonthKey = (value: string) => /^\d{4}-\d{2}$/.test(value)

const printReportRangeStorageKey = 'finance-print-report:last-range'

const shiftMonth = (value: Date, delta: number) => {
  const next = new Date(value.getTime())
  next.setMonth(next.getMonth() + delta)
  return next
}

const readLastUsedRange = () => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(printReportRangeStorageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { startMonth?: unknown; endMonth?: unknown }
    if (typeof parsed.startMonth !== 'string' || typeof parsed.endMonth !== 'string') return null
    if (!isValidMonthKey(parsed.startMonth) || !isValidMonthKey(parsed.endMonth)) return null
    return { startMonth: parsed.startMonth, endMonth: parsed.endMonth }
  } catch {
    return null
  }
}

const writeLastUsedRange = (startMonth: string, endMonth: string) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(printReportRangeStorageKey, JSON.stringify({ startMonth, endMonth }))
  } catch {
    // Ignore storage failures (private mode, quota, disabled storage).
  }
}

export function PrintReportModal({
  open,
  onClose,
  onStartPrint,
  locale,
  defaultMonthPreset = 'current',
}: PrintReportModalProps) {
  const defaults = useMemo(() => {
    const now = new Date()
    const current = monthKey(now)
    const previous = monthKey(shiftMonth(now, -1))
    const next = monthKey(shiftMonth(now, 1))
    const lastUsed = readLastUsedRange()

    if (defaultMonthPreset === 'last_used' && lastUsed) {
      return lastUsed
    }
    if (defaultMonthPreset === 'previous') {
      return { startMonth: previous, endMonth: previous }
    }
    if (defaultMonthPreset === 'next') {
      return { startMonth: next, endMonth: next }
    }
    return {
      startMonth: current,
      endMonth: current,
    }
  }, [defaultMonthPreset])

  const [startMonthValue, setStartMonthValue] = useState(defaults.startMonth)
  const [endMonthValue, setEndMonthValue] = useState(defaults.endMonth)
  const [includeDashboard, setIncludeDashboard] = useState(true)
  const [includeIncome, setIncludeIncome] = useState(true)
  const [includeBills, setIncludeBills] = useState(true)
  const [includeCards, setIncludeCards] = useState(true)
  const [includeLoans, setIncludeLoans] = useState(true)
  const [includeAccounts, setIncludeAccounts] = useState(true)
  const [includeGoals, setIncludeGoals] = useState(true)
  const [includePlanning, setIncludePlanning] = useState(true)
  const [includeReconcile, setIncludeReconcile] = useState(true)
  const [includePurchases, setIncludePurchases] = useState(true)
  const [includeNotes, setIncludeNotes] = useState(false)
  const [includeAuditLogs, setIncludeAuditLogs] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const monthLabel = useMemo(() => {
    const resolved = locale || 'en-US'
    return new Intl.DateTimeFormat(resolved, { month: 'short', year: 'numeric' })
  }, [locale])

  if (!open) {
    return null
  }

  const clearErrorIfPresent = () => {
    if (error) {
      setError(null)
    }
  }

  const handleToggle =
    (setter: (value: boolean) => void) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setter(event.target.checked)
      clearErrorIfPresent()
    }

  const validate = () => {
    if (!isValidMonthKey(startMonthValue) || !isValidMonthKey(endMonthValue)) {
      return 'Choose a valid month range.'
    }
    if (startMonthValue > endMonthValue) {
      return 'Start month must be before end month.'
    }
    if (
      !includeDashboard &&
      !includeIncome &&
      !includeBills &&
      !includeCards &&
      !includeLoans &&
      !includeAccounts &&
      !includeGoals &&
      !includePlanning &&
      !includeReconcile &&
      !includePurchases &&
      !includeAuditLogs
    ) {
      return 'Select at least one report section to print.'
    }
    return null
  }

  const formatMonth = (value: string) => {
    if (!isValidMonthKey(value)) return 'n/a'
    return monthLabel.format(new Date(`${value}-01T00:00:00`))
  }

  const startPrint = () => {
    const message = validate()
    if (message) {
      setError(message)
      return
    }

    writeLastUsedRange(startMonthValue, endMonthValue)

    onStartPrint({
      startMonth: startMonthValue,
      endMonth: endMonthValue,
      includeDashboard,
      includeIncome,
      includeBills,
      includeCards,
      includeLoans,
      includeAccounts,
      includeGoals,
      includePlanning,
      includeReconcile,
      includeNotes,
      includeAuditLogs,
      includePurchases,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : undefined)}>
      <DialogContent
        showCloseButton={false}
        className="modal modal--report max-w-[min(96vw,56rem)] gap-0 p-0 print:hidden"
      >
        <DialogHeader className="modal__header modal__header--report">
          <div>
            <p className="panel-kicker">Report</p>
            <DialogTitle id="print-report-title">Print Report</DialogTitle>
            <DialogDescription className="subnote text-inherit">
              Choose month range and sections to include in the print view.
            </DialogDescription>
          </div>
          <CrudButton type="button" className="btn btn-ghost btn--sm" onClick={onClose}>
            Close
          </CrudButton>
        </DialogHeader>

        <ScrollArea className="max-h-[72vh]">
          <div className="modal__body modal__body--report">
            <div className="modal-grid modal-grid--report">
              <CrudLabel className="modal-field-card" htmlFor="print-start-month">
                <span>Start month</span>
                <CrudInput
                  id="print-start-month"
                  type="month"
                  value={startMonthValue}
                  onChange={(event) => {
                    setStartMonthValue(event.target.value)
                    clearErrorIfPresent()
                  }}
                />
                <small className="subnote">Selected: {formatMonth(startMonthValue)}</small>
              </CrudLabel>

              <CrudLabel className="modal-field-card" htmlFor="print-end-month">
                <span>End month</span>
                <CrudInput
                  id="print-end-month"
                  type="month"
                  value={endMonthValue}
                  onChange={(event) => {
                    setEndMonthValue(event.target.value)
                    clearErrorIfPresent()
                  }}
                />
                <small className="subnote">Selected: {formatMonth(endMonthValue)}</small>
              </CrudLabel>
            </div>

            <div className="modal-range-summary" aria-label="Current selected range">
              <PillBadge className="pill pill--neutral">{formatMonth(startMonthValue)}</PillBadge>
              <PillBadge className="pill pill--neutral">to</PillBadge>
              <PillBadge className="pill pill--neutral">{formatMonth(endMonthValue)}</PillBadge>
            </div>

            <fieldset className="modal-options" aria-label="Report sections">
              <legend className="sr-only">Report sections</legend>
              <div className="modal-option-toolbar">
                <CrudButton
                  type="button"
                  className="btn btn-ghost btn--sm"
                  onClick={() => {
                    setIncludeDashboard(true)
                    setIncludeIncome(true)
                    setIncludeBills(true)
                    setIncludeCards(true)
                    setIncludeLoans(true)
                    setIncludeAccounts(true)
                    setIncludeGoals(true)
                    setIncludePlanning(true)
                    setIncludeReconcile(true)
                    setIncludePurchases(true)
                    setIncludeAuditLogs(true)
                    clearErrorIfPresent()
                  }}
                >
                  Select all sections
                </CrudButton>
                <CrudButton
                  type="button"
                  className="btn btn-ghost btn--sm"
                  onClick={() => {
                    setIncludeDashboard(true)
                    setIncludeIncome(false)
                    setIncludeBills(false)
                    setIncludeCards(false)
                    setIncludeLoans(false)
                    setIncludeAccounts(false)
                    setIncludeGoals(false)
                    setIncludePlanning(false)
                    setIncludeReconcile(false)
                    setIncludePurchases(false)
                    setIncludeAuditLogs(false)
                    clearErrorIfPresent()
                  }}
                >
                  Dashboard only
                </CrudButton>
              </div>

              <CrudLabel className={`modal-option-row ${includeDashboard ? 'modal-option-row--active' : ''}`} htmlFor="print-dashboard">
                <CrudInput id="print-dashboard" type="checkbox" checked={includeDashboard} onChange={handleToggle(setIncludeDashboard)} />
                <div>
                  <strong>Include dashboard</strong>
                  <small>Summary metrics, trust KPIs, and month-close snapshots.</small>
                </div>
              </CrudLabel>

              <CrudLabel className={`modal-option-row ${includeIncome ? 'modal-option-row--active' : ''}`} htmlFor="print-income">
                <CrudInput id="print-income" type="checkbox" checked={includeIncome} onChange={handleToggle(setIncludeIncome)} />
                <div>
                  <strong>Include income</strong>
                  <small>All income rows and cadence details.</small>
                </div>
              </CrudLabel>

              <CrudLabel className={`modal-option-row ${includeBills ? 'modal-option-row--active' : ''}`} htmlFor="print-bills">
                <CrudInput id="print-bills" type="checkbox" checked={includeBills} onChange={handleToggle(setIncludeBills)} />
                <div>
                  <strong>Include bills</strong>
                  <small>Bill obligations and due schedule.</small>
                </div>
              </CrudLabel>

              <CrudLabel className={`modal-option-row ${includeCards ? 'modal-option-row--active' : ''}`} htmlFor="print-cards">
                <CrudInput id="print-cards" type="checkbox" checked={includeCards} onChange={handleToggle(setIncludeCards)} />
                <div>
                  <strong>Include cards</strong>
                  <small>Card portfolio, risk/payoff analysis, and 12-month projections.</small>
                </div>
              </CrudLabel>

              <CrudLabel className={`modal-option-row ${includeLoans ? 'modal-option-row--active' : ''}`} htmlFor="print-loans">
                <CrudInput id="print-loans" type="checkbox" checked={includeLoans} onChange={handleToggle(setIncludeLoans)} />
                <div>
                  <strong>Include loans</strong>
                  <small>Loan balances, payment profiles, and cadence.</small>
                </div>
              </CrudLabel>

              <CrudLabel className={`modal-option-row ${includePlanning ? 'modal-option-row--active' : ''}`} htmlFor="print-planning">
                <CrudInput id="print-planning" type="checkbox" checked={includePlanning} onChange={handleToggle(setIncludePlanning)} />
                <div>
                  <strong>Include planning</strong>
                  <small>Planning/rule context from budget intelligence summary.</small>
                </div>
              </CrudLabel>

              <CrudLabel className={`modal-option-row ${includeReconcile ? 'modal-option-row--active' : ''}`} htmlFor="print-reconcile">
                <CrudInput id="print-reconcile" type="checkbox" checked={includeReconcile} onChange={handleToggle(setIncludeReconcile)} />
                <div>
                  <strong>Include reconcile</strong>
                  <small>Reconciliation quality and status overview for the selected range.</small>
                </div>
              </CrudLabel>

              <CrudLabel className={`modal-option-row ${includePurchases ? 'modal-option-row--active' : ''}`} htmlFor="print-purchases">
                <CrudInput id="print-purchases" type="checkbox" checked={includePurchases} onChange={handleToggle(setIncludePurchases)} />
                <div>
                  <strong>Include purchases</strong>
                  <small>Recommended for complete spending totals.</small>
                </div>
              </CrudLabel>

              <CrudLabel className={`modal-option-row ${includeAccounts ? 'modal-option-row--active' : ''}`} htmlFor="print-accounts">
                <CrudInput id="print-accounts" type="checkbox" checked={includeAccounts} onChange={handleToggle(setIncludeAccounts)} />
                <div>
                  <strong>Include accounts</strong>
                  <small>All cash/debt/investment balances.</small>
                </div>
              </CrudLabel>

              <CrudLabel className={`modal-option-row ${includeGoals ? 'modal-option-row--active' : ''}`} htmlFor="print-goals">
                <CrudInput id="print-goals" type="checkbox" checked={includeGoals} onChange={handleToggle(setIncludeGoals)} />
                <div>
                  <strong>Include goals</strong>
                  <small>Goal targets, current amounts, and priority.</small>
                </div>
              </CrudLabel>

              <CrudLabel className={`modal-option-row ${includeNotes ? 'modal-option-row--active' : ''}`} htmlFor="print-notes">
                <CrudInput id="print-notes" type="checkbox" checked={includeNotes} onChange={handleToggle(setIncludeNotes)} />
                <div>
                  <strong>Include notes</strong>
                  <small>Add free-text context from records.</small>
                </div>
              </CrudLabel>

              <CrudLabel className={`modal-option-row ${includeAuditLogs ? 'modal-option-row--active' : ''}`} htmlFor="print-audit">
                <CrudInput id="print-audit" type="checkbox" checked={includeAuditLogs} onChange={handleToggle(setIncludeAuditLogs)} />
                <div>
                  <strong>Include audit logs</strong>
                  <small>Add cycle and audit trail activity for the range.</small>
                </div>
              </CrudLabel>
            </fieldset>

            {error ? <p className="error-banner" role="alert">{error}</p> : null}
          </div>
        </ScrollArea>

        <DialogFooter className="modal__footer modal__footer--report">
          <CrudButton type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </CrudButton>
          <CrudButton type="button" className="btn btn-primary" onClick={startPrint}>
            Preview & Print
          </CrudButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export type { PrintReportConfig }
