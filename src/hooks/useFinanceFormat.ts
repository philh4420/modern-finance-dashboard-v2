import { useMemo, useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { FinancePreference } from '../components/financeTypes'
import { currencyOptions, defaultPreference, fallbackLocaleOptions } from '../lib/financeConstants'
import { isValidLocale } from '../lib/financeHelpers'
import type { MutationHandlers } from './useMutationFeedback'

type UseFinanceFormatArgs = {
  preference: FinancePreference
} & MutationHandlers

export const useFinanceFormat = ({ preference, clearError, handleMutationError }: UseFinanceFormatArgs) => {
  const upsertFinancePreference = useMutation(api.finance.upsertFinancePreference)

  const [formatOverride, setFormatOverride] = useState<Partial<FinancePreference>>({})

  const localeOptions = useMemo(() => {
    const fromNavigator = typeof navigator !== 'undefined' ? navigator.languages : []
    const combined = Array.from(new Set([...fallbackLocaleOptions, ...fromNavigator]))
    return combined.filter((locale) => isValidLocale(locale))
  }, [])

  const displayedFormat = {
    currency: formatOverride.currency ?? preference.currency,
    locale: formatOverride.locale ?? preference.locale,
  }

  const moneyFormatter = useMemo(() => {
    try {
      return new Intl.NumberFormat(preference.locale, {
        style: 'currency',
        currency: preference.currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    } catch {
      return new Intl.NumberFormat(defaultPreference.locale, {
        style: 'currency',
        currency: defaultPreference.currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    }
  }, [preference.currency, preference.locale])

  const percentFormatter = useMemo(() => {
    try {
      return new Intl.NumberFormat(preference.locale, {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })
    } catch {
      return new Intl.NumberFormat(defaultPreference.locale, {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })
    }
  }, [preference.locale])

  const formatMoney = (value: number) => moneyFormatter.format(Number.isFinite(value) ? value : 0)
  const formatPercent = (value: number) => percentFormatter.format(Number.isFinite(value) ? value : 0)

  const onSaveFormat = async () => {
    clearError()

    try {
      await upsertFinancePreference({
        currency: displayedFormat.currency,
        locale: displayedFormat.locale,
      })
      setFormatOverride({})
    } catch (error) {
      handleMutationError(error)
    }
  }

  return {
    currencyOptions,
    localeOptions,
    formatOverride,
    setFormatOverride,
    displayedFormat,
    formatMoney,
    formatPercent,
    onSaveFormat,
  }
}
