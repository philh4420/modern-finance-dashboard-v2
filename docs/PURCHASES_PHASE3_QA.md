# Purchases Phase 3 QA Matrix

## Scope
- Purchases trust layer (auditability, idempotent month close, paginated history, reporting fidelity, and performance behavior).
- Applies to manual entry + bulk operations + split/template flows.

## Environment
- Staging deployment with Clerk auth and Convex configured.
- Test user with seeded purchases across at least 6 months, including:
  - pending/posted/reconciled rows
  - duplicate-like rows
  - outlier amounts
  - split allocations
  - recurring candidates

## Scenarios
1. Refund flow
- Steps:
  - Create a purchase.
  - Update it to a negative offset path your workflow supports (or remove + re-add correction).
  - Reconcile status transitions pending -> posted -> reconciled.
- Expected:
  - `financeAuditEvents` contains purchase mutation entries with source + before/after snapshots.
  - No ownership leakage across users.
  - Reporting totals match visible purchase rows for range.

2. Disputed item flow
- Steps:
  - Add purchase as posted.
  - Move to pending (dispute/open case), then back to reconciled.
- Expected:
  - Reconciliation mutations logged with source metadata.
  - Pending/posted/reconciled counts and totals update correctly in Purchases tab and print report.

3. Split edit lifecycle
- Steps:
  - Save custom split lines.
  - Apply split template.
  - Clear splits.
- Expected:
  - Each mutation generates purchase audit entries.
  - Split totals remain validated to purchase amount.
  - Split/template actions are visible in mutation history.

4. Duplicate merge / archive / intentional
- Steps:
  - Use one-click actions from duplicate queue:
    - Merge
    - Archive duplicate
    - Mark intentional
- Expected:
  - Correct purchase records retained/updated.
  - Audit history includes action source and affected IDs.
  - Duplicate summary and print mutation section reflect actions.

5. Unreconciled close run
- Steps:
  - Keep month with pending purchases.
  - Run month close for that month from Purchases tab.
- Expected:
  - `purchaseMonthCloseRuns` completed entry with counts/amounts.
  - `monthCloseSnapshots` row for cycle key is upserted/recalculated.
  - Feedback message shows pending + cleared amounts.

6. Idempotent close behavior
- Steps:
  - Trigger `runPurchaseMonthClose` twice with same `idempotencyKey`.
- Expected:
  - Second call returns deduplicated response.
  - No duplicate completed run for same user/idempotency key.
  - Snapshot remains stable and consistent.

7. Retry-safe close behavior
- Steps:
  - Simulate transient failure (e.g. interrupt, re-run with a new idempotency key).
  - Re-run close for same month.
- Expected:
  - Failed run recorded with status `failed`.
  - Subsequent run succeeds and upserts snapshot.
  - No corrupted totals in month snapshot.

8. Large-history performance
- Steps:
  - Seed 5k+ purchase audit events.
  - Open Purchases tab and use mutation history.
  - Load more pages repeatedly.
- Expected:
  - Initial render remains responsive.
  - History loads in pages (no full history payload dump).
  - No browser freeze or mutation panel timeout.

9. Print reporting fidelity
- Steps:
  - Print range with purchases included.
- Expected:
  - Grouped monthly purchase tables present.
  - Category breakdown + reconciliation KPIs visible.
  - Purchase mutation history table visible in report range.
  - Totals match on-screen numbers for same range.

## Ownership / Auth Checks
- For each purchase mutation endpoint:
  - Verify cross-user document IDs are rejected.
  - Verify signed-out calls fail.

## Regression Checks
- Existing Purchases tab Phase 2 features still work:
  - duplicate detection
  - anomaly detection
  - recurring detector
  - split templates
  - CSV import

