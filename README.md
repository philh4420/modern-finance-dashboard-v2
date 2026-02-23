# Modern Finance Dashboard

Personal finance app with separate manual-entry sections for `Income`, `Bills`, `Cards`, and `Purchases`, plus a linked `Dashboard` summary.

## Stack

- React 19 + TypeScript + Vite 7
- Clerk (`@clerk/clerk-react`) for auth
- Convex for data and realtime sync
- Vercel for hosting

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Add local env vars in `.env.local`:

```bash
VITE_CLERK_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
VITE_CONVEX_URL=YOUR_CONVEX_URL
VITE_CONVEX_SITE_URL=YOUR_CONVEX_SITE_URL
CLERK_FRONTEND_API_URL=YOUR_CLERK_FRONTEND_API_URL
```

3. Run Convex and Vite:

```bash
npx convex dev
npm run dev
```

## Production Deploy (Vercel)

This repo is configured for Vercel via `vercel.json`:

- `framework`: `vite`
- `buildCommand`: `npm run build`
- `outputDirectory`: `dist`

### 1. Required Vercel Environment Variables

Set these in Vercel Project Settings -> Environment Variables:

- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_CONVEX_URL`
- `VITE_CONVEX_SITE_URL` (optional in app runtime, useful for links)

### 2. Convex Production Requirements

Deploy Convex production and use that URL for `VITE_CONVEX_URL`:

```bash
npx convex deploy
```

Set Convex auth env (in Convex deployment) so Clerk JWT validation works:

- `CLERK_FRONTEND_API_URL=https://<your-clerk-domain>.clerk.accounts.dev`

### 3. Clerk Dashboard Requirements

In Clerk, add your Vercel domain(s) to allowed origins/redirect URLs:

- `https://<your-project>.vercel.app`
- Custom domain if used

### 4. Deploy

Preview:

```bash
vercel deploy -y
```

Production:

```bash
vercel deploy --prod -y
```

## Notes

- No sample spreadsheet values are imported.
- Data starts empty and is fully manual-entry.
- The dashboard is derived from your entered records only.
# modern-finance-dashboard-v2
