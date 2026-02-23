import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type OfflineQueueStatus = 'queued' | 'conflict'

export type OfflineQueueEntry = {
  id: string
  key: string
  args: unknown
  status: OfflineQueueStatus
  attempts: number
  lastError?: string
  createdAt: number
}

type OfflineExecutorMap = Record<string, (args: unknown) => Promise<unknown>>

type UseOfflineQueueArgs = {
  storageKey: string
  executors: OfflineExecutorMap
  userId: string | null | undefined
  onMetric?: (metric: {
    event: string
    queuedCount: number
    conflictCount: number
    flushAttempted: number
    flushSucceeded: number
  }) => void | Promise<void>
}

const parseStoredQueue = (value: string | null): OfflineQueueEntry[] => {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as OfflineQueueEntry[]) : []
  } catch {
    return []
  }
}

const isNetworkError = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('offline') ||
    message.includes('failed to fetch')
  )
}

const isConflictError = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return (
    message.includes('not found') ||
    message.includes('validation') ||
    message.includes('unauthorized') ||
    message.includes('ownership')
  )
}

export const useOfflineQueue = ({ storageKey, executors, userId, onMetric }: UseOfflineQueueArgs) => {
  const scopedStorageKey = useMemo(() => (userId ? `${storageKey}:${userId}` : null), [storageKey, userId])
  const previousKeyRef = useRef<string | null>(null)

  const [entries, setEntries] = useState<OfflineQueueEntry[]>(() => {
    if (typeof window === 'undefined') {
      return []
    }
    if (!scopedStorageKey) {
      return []
    }
    return parseStoredQueue(window.localStorage.getItem(scopedStorageKey))
  })
  const [isFlushing, setIsFlushing] = useState(false)
  const executorsRef = useRef<OfflineExecutorMap>(executors)

  useEffect(() => {
    executorsRef.current = executors
  }, [executors])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    if (!scopedStorageKey) {
      return
    }
    window.localStorage.setItem(scopedStorageKey, JSON.stringify(entries))
  }, [entries, scopedStorageKey])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const previous = previousKeyRef.current
    if (previous && !scopedStorageKey) {
      // Clear prior user's queue on sign-out.
      window.localStorage.removeItem(previous)
    }

    previousKeyRef.current = scopedStorageKey

    if (!scopedStorageKey) {
      setEntries([])
      return
    }

    setEntries(parseStoredQueue(window.localStorage.getItem(scopedStorageKey)))
  }, [scopedStorageKey])

  const enqueue = useCallback((key: string, args: unknown, status: OfflineQueueStatus = 'queued', lastError?: string) => {
    setEntries((previous) => [
      ...previous,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        key,
        args,
        status,
        attempts: 0,
        createdAt: Date.now(),
        lastError,
      },
    ])
  }, [])

  const flushQueue = useCallback(async () => {
    if (isFlushing) {
      return
    }

    setIsFlushing(true)
    let attempted = 0
    let succeeded = 0
    let conflicts = 0
    try {
      const snapshot = [...entries]
      for (const entry of snapshot) {
        if (entry.status !== 'queued') {
          continue
        }

        attempted += 1
        const executor = executorsRef.current[entry.key]
        if (!executor) {
          conflicts += 1
          setEntries((previous) =>
            previous.map((current) =>
              current.id === entry.id
                ? { ...current, status: 'conflict', lastError: `Missing executor: ${entry.key}` }
                : current,
            ),
          )
          continue
        }

        try {
          await executor(entry.args)
          succeeded += 1
          setEntries((previous) => previous.filter((current) => current.id !== entry.id))
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (isConflictError(error)) {
            conflicts += 1
          }
          setEntries((previous) =>
            previous.map((current) =>
              current.id === entry.id
                ? {
                    ...current,
                    status: isConflictError(error) ? 'conflict' : 'queued',
                    attempts: current.attempts + 1,
                    lastError: message,
                  }
                : current,
            ),
          )
        }
      }
      if (attempted > 0 && onMetric) {
        await onMetric({
          event: 'offline_queue_flush',
          queuedCount: snapshot.filter((entry) => entry.status === 'queued').length,
          conflictCount: conflicts,
          flushAttempted: attempted,
          flushSucceeded: succeeded,
        })
      }
    } finally {
      setIsFlushing(false)
    }
  }, [entries, isFlushing, onMetric])

  useEffect(() => {
    const onOnline = () => {
      void flushQueue()
    }

    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('online', onOnline)
    }
  }, [flushQueue])

  const runOrQueue = useCallback(
    async <TArgs, TResult>(key: string, args: TArgs, execute: (payload: TArgs) => Promise<TResult>) => {
      if (!navigator.onLine) {
        enqueue(key, args, 'queued', 'Queued while offline')
        return { queued: true as const, result: null }
      }

      try {
        const result = await execute(args)
        return { queued: false as const, result }
      } catch (error) {
        if (isNetworkError(error)) {
          enqueue(key, args, 'queued', 'Queued after network failure')
          return { queued: true as const, result: null }
        }
        throw error
      }
    },
    [enqueue],
  )

  const retryEntry = useCallback(
    async (id: string) => {
      setEntries((previous) =>
        previous.map((entry) => (entry.id === id ? { ...entry, status: 'queued', lastError: undefined } : entry)),
      )
      await flushQueue()
    },
    [flushQueue],
  )

  const discardEntry = useCallback((id: string) => {
    setEntries((previous) => previous.filter((entry) => entry.id !== id))
  }, [])

  const clearConflicts = useCallback(() => {
    setEntries((previous) => previous.filter((entry) => entry.status !== 'conflict'))
  }, [])

  const pendingCount = useMemo(() => entries.filter((entry) => entry.status === 'queued').length, [entries])
  const conflictCount = useMemo(() => entries.filter((entry) => entry.status === 'conflict').length, [entries])

  return {
    entries,
    pendingCount,
    conflictCount,
    isFlushing,
    runOrQueue,
    flushQueue,
    retryEntry,
    discardEntry,
    clearConflicts,
  }
}
