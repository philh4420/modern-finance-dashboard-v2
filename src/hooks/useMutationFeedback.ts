import { useCallback, useState } from 'react'

export type MutationHandlers = {
  clearError: () => void
  handleMutationError: (error: unknown) => void
}

export const useMutationFeedback = () => {
  const [errorMessage, setErrorMessage] = useState('')

  const clearError = useCallback(() => {
    setErrorMessage('')
  }, [])

  const handleMutationError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Something went wrong. Try again.'
    setErrorMessage(message)
  }, [])

  return {
    errorMessage,
    clearError,
    handleMutationError,
  }
}
