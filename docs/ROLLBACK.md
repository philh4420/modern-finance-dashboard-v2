# Rollback Playbook

## Vercel Rollback (Frontend)

Use the Vercel dashboard:

1. Open the project deployments.
2. Select the last known-good deployment.
3. Redeploy it (or promote it).

If a new security header/CSP change causes issues, rolling back the deployment immediately restores the prior header set.

## Convex Rollback (Backend/Data)

Convex doesn't have a "rollback button" for schema/data. Treat rollback as **restore from backup**.

Recommended approach:

1. Export a backup regularly (see `docs/BACKUP_DRILL.md`).
2. If needed, restore into **staging** first to validate.
3. Restore to production only as a last resort, because imports can be destructive.

## CSP Emergency Switch-Off

If CSP enforcement breaks sign-in or Convex calls:

1. Change `vercel.json` back to `Content-Security-Policy-Report-Only` (or remove CSP entirely).
2. Redeploy.

