import * as Sentry from '@sentry/react'

let initialized = false
let consentActive = false

export const setDiagnosticsConsent = (enabled: boolean) => {
  consentActive = enabled
}

export const initDiagnostics = (args: { dsn: string; environment?: string }) => {
  consentActive = true
  if (initialized) return
  if (!args.dsn) return

  Sentry.init({
    dsn: args.dsn,
    environment: args.environment,
    sendDefaultPii: false,
    tracesSampleRate: 0.05,
    beforeSend(event) {
      if (!consentActive) {
        return null
      }
      // Defensive: don't ship finance content.
      return {
        ...event,
        request: undefined,
        user: undefined,
        breadcrumbs: undefined,
        contexts: undefined,
        extra: undefined,
      }
    },
  })

  initialized = true
}

export const diagnosticsEnabled = () => initialized

export const captureException = (error: unknown) => {
  if (!initialized || !consentActive) return
  Sentry.captureException(error)
}
