const clerkIssuerDomain =
  process.env.CLERK_FRONTEND_API_URL ?? 'https://tender-cheetah-73.clerk.accounts.dev'

export default {
  providers: [
    {
      domain: clerkIssuerDomain,
      applicationID: 'convex',
    },
  ],
}
