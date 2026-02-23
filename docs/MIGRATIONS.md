# Convex Schema Changes + Migrations

Convex schema changes are safest when rolled out in **additive** steps.

## Safe Rollout Pattern

1. **Add new fields as optional**
   - Update `convex/schema.ts` with `v.optional(...)`.
2. **Deploy**
   - Ensure the app still works with existing documents missing the new fields.
3. **Backfill (if needed)**
   - Prefer a Convex action/mutation that iterates user docs in batches and patches defaults.
4. **Switch to required (only after backfill)**
   - If you truly need the field required, remove `v.optional` once all docs have it.

## Index Changes

- Add new indexes in `convex/schema.ts`.
- Update queries to use the new indexes (`.withIndex('by_userId_...', ...)`) before relying on them for performance.

## Developer Workflow

```bash
# Generate types after backend changes
npx convex codegen

# Validate locally
npm run lint
npm run build
```

## Production Rollout Checklist

1. Deploy backend changes to staging.
2. Validate core flows: sign-in, CRUD, monthly cycle, settings consent, export/download, retention.
3. Deploy frontend to staging.
4. If you introduced a backfill, run it in staging first and confirm counts.
5. Repeat for production.

