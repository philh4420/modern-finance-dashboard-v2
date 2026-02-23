# Purchases Phase 3 Release Checklist

## 1. Staging Signoff
1. Deploy staging with latest schema + functions.
2. Run Purchases Phase 3 QA matrix (`docs/PURCHASES_PHASE3_QA.md`).
3. Confirm signoff for:
- audit event completeness (source + before/after)
- month-close idempotency and retry behavior
- print/report correctness
- no cross-user data access

## 2. Data + Migration Safety
1. Run Convex codegen and ensure no type drift.
2. Verify new table/index availability:
- `purchaseMonthCloseRuns`
- `financeAuditEvents.by_userId_entityType_createdAt`
3. Backfill is not required; verify old data still reads correctly.

## 3. Monitoring Thresholds (Initial)
1. Alert if `runPurchaseMonthClose` failure rate > 2% over 24h.
2. Alert if purchase mutation audit insert failures > 0 in production.
3. Track median Purchases tab load and paginated history latency.
4. Track print generation error rate.

## 4. Security + Privacy Checks
1. Confirm ownership checks on all purchase/split/template mutations.
2. Confirm export includes:
- purchases
- purchaseSplits
- purchaseSplitTemplates
- purchaseMonthCloseRuns
- financeAuditEvents
3. Confirm deletion removes `purchaseMonthCloseRuns`.
4. Confirm retention policy deletes old `purchaseMonthCloseRuns` under cycle/audit policy.

## 5. Rollback Notes
1. Frontend rollback:
- Revert to previous Vercel deployment.
2. Backend rollback:
- Revert Convex function changes.
- Keep schema additive changes in place (safe backward-compatible table/index additions).
3. If purchase close behavior regresses:
- Disable manual close button in UI via hotfix.
- Keep core purchases CRUD available while patch is prepared.

## 6. Production Go/No-Go
1. Go only if all are true:
- QA matrix pass
- zero P0/P1 defects
- print outputs reconciled with UI totals
- monitoring alerts configured
2. Record release note with:
- build/version
- release timestamp
- approver
- known limitations

