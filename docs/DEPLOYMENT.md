# Deployment (Vercel + Clerk + Convex)

This app is a Vite SPA (React + TS) deployed to Vercel, with Clerk auth and a Convex backend.

## Environments

Recommended setup:

1. Separate Convex deployments for `staging` and `production`.
2. Separate Vercel projects (or at least separate Vercel environment variables) for `staging` and `production`.
3. Separate Clerk instances/keys per environment if you want true isolation.

## Vercel Environment Variables (Frontend)

Set these in your Vercel Project Settings:

- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_CONVEX_URL`
- `VITE_CONVEX_SITE_URL` (used to download authenticated exports via Convex HTTP actions)
- `VITE_SENTRY_DSN` (optional; used only when the user opts-in to Diagnostics in Settings)

Notes:

- Never commit real keys. Use `.env.local` for local dev and Vercel env vars for deploys.
- Keep `VITE_` prefix for any client-side variables.

## Convex Environment Variables (Backend)

Set these per Convex deployment:

- `CLERK_FRONTEND_API_URL`
  - The URL for your Clerk frontend API (Clerk dashboard shows the correct value for your instance).
- `CLIENT_ORIGIN`
  - Used by `convex/http.ts` to set CORS for `GET /exports/download`.
  - Set this to your Vercel app origin, e.g. `https://your-app.vercel.app`.

Example commands:

```bash
npx convex env set CLERK_FRONTEND_API_URL https://YOUR_INSTANCE.clerk.accounts.dev
npx convex env set CLIENT_ORIGIN https://your-app.vercel.app
```

## Security Headers + CSP

`vercel.json` sets a baseline of security headers and a **CSP in report-only mode**:

- Header: `Content-Security-Policy-Report-Only`

After validating Clerk sign-in, Convex calls, Google Fonts, and PWA behavior on a preview/staging deployment, you can switch to enforcement:

1. In `vercel.json`, rename:
   - `Content-Security-Policy-Report-Only` -> `Content-Security-Policy`
2. Redeploy.

If anything breaks, revert the change and redeploy.

