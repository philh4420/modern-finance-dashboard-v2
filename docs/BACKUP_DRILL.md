# Backup + Restore Drill (Monthly)

Goal: prove you can export production data and restore it into staging reliably.

## 1) Export from Production

From the repo:

```bash
# Export from prod to a zip file
npx convex export --prod --path backups/backup-$(date +%F).zip
```

Optional (includes file storage blobs too):

```bash
npx convex export --prod --include-file-storage --path backups/backup-$(date +%F)-with-storage.zip
```

## 2) Restore into Staging (Replace Tables)

Pick a staging deployment and restore the snapshot:

```bash
# Replace imported tables in staging (staging only)
npx convex import --deployment-name YOUR_STAGING_DEPLOYMENT --replace -y backups/backup-YYYY-MM-DD.zip
```

## 3) Validate the App Against Staging

Checklist:

- Sign in works (Clerk modal).
- CRUD works for Income/Bills/Cards/Loans/Purchases/Accounts/Goals.
- Monthly cycle runs successfully.
- Settings: consent toggles, export generation + download.
- Print report generates a readable output with correct purchase totals for a month range.

## 4) Record Outcome

Log:

- Export time + file size
- Import time
- Any errors
- Any missing tables/fields

