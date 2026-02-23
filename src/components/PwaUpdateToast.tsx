import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui'

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

export function PwaUpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swScriptUrl, registration: ServiceWorkerRegistration | undefined) {
      if (!registration) {
        return
      }

      setInterval(() => {
        void registration.update()
      }, UPDATE_CHECK_INTERVAL_MS)
    },
  })

  const dismiss = () => {
    setNeedRefresh(false)
  }

  if (!needRefresh) {
    return null
  }

  return (
    <aside
      className="fixed right-[clamp(0.85rem,1.5vw,1.35rem)] bottom-[clamp(0.85rem,1.5vw,1.35rem)] z-40 w-[min(26rem,calc(100vw-1.7rem))]"
      role="status"
      aria-live="polite"
      aria-label="Application update available"
    >
      <Card className="gap-0 border-[color:color-mix(in_oklab,var(--tone-finance)_35%,var(--stroke))] py-0 backdrop-blur-xl [background:radial-gradient(130%_180%_at_100%_-20%,color-mix(in_oklab,var(--tone-savings)_22%,transparent),transparent_62%),linear-gradient(150deg,color-mix(in_oklab,var(--surface-card)_92%,white_8%),color-mix(in_oklab,var(--surface-card)_97%,var(--tone-finance)_3%))] shadow-[0_20px_48px_-34px_color-mix(in_oklab,var(--tone-finance)_56%,transparent),0_14px_28px_-24px_color-mix(in_oklab,black_35%,transparent)]">
        <CardHeader className="gap-1 px-4 pt-4 pb-2">
          <CardTitle className="text-[0.92rem] font-semibold text-foreground">Update Available</CardTitle>
          <CardDescription className="text-[0.82rem] leading-5 text-muted-foreground">
            A new version is ready. Reload now to use the latest dashboard updates.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-end gap-2 px-4 pb-4">
          <Button
            type="button"
            size="sm"
            className="h-8 rounded-[0.78rem] border-transparent px-3 font-semibold text-primary-foreground [background:var(--fx-primary-gradient)] hover:[background:var(--fx-primary-gradient)]"
            onClick={() => void updateServiceWorker(true)}
          >
            Update Now
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 rounded-[0.78rem] px-3 font-semibold" onClick={dismiss}>
            Dismiss
          </Button>
        </CardContent>
      </Card>
    </aside>
  )
}
