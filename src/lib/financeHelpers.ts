import {
  accountPurposeOptions,
  accountTypeOptions,
  billCategoryOptions,
  billScopeOptions,
  cadenceOptions,
  goalFundingSourceTypeOptions,
  goalPriorityOptions,
  goalTypeOptions,
} from './financeConstants'
import type {
  AccountPurpose,
  AccountType,
  BillCategory,
  BillScope,
  Cadence,
  CustomCadenceUnit,
  GoalFundingSourceType,
  GoalPriority,
  GoalType,
  InsightSeverity,
} from '../components/financeTypes'

export const isValidLocale = (locale: string) => {
  try {
    new Intl.NumberFormat(locale)
    return true
  } catch {
    return false
  }
}

export const parseFloatInput = (value: string, label: string) => {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid number.`)
  }
  return parsed
}

export const parseIntInput = (value: string, label: string) => {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid number.`)
  }
  return parsed
}

export const parseCustomInterval = (value: string) => {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error('Custom frequency interval must be at least 1.')
  }
  return parsed
}

export const toIsoToday = () => new Date().toISOString().slice(0, 10)

export const isCustomCadence = (cadence: Cadence) => cadence === 'custom'

const customCadenceLabel = (customInterval?: number, customUnit?: CustomCadenceUnit) => {
  if (!customInterval || !customUnit) {
    return 'Custom'
  }

  const unit = customInterval === 1 ? customUnit.slice(0, -1) : customUnit
  return `Every ${customInterval} ${unit}`
}

export const cadenceLabel = (cadence: Cadence, customInterval?: number, customUnit?: CustomCadenceUnit) => {
  if (cadence === 'custom') {
    return customCadenceLabel(customInterval, customUnit)
  }
  return cadenceOptions.find((option) => option.value === cadence)?.label ?? cadence
}

export const accountTypeLabel = (value: AccountType) =>
  accountTypeOptions.find((option) => option.value === value)?.label ?? value

export const accountPurposeLabel = (value: AccountPurpose) =>
  accountPurposeOptions.find((option) => option.value === value)?.label ?? value

export const priorityLabel = (priority: GoalPriority) =>
  goalPriorityOptions.find((option) => option.value === priority)?.label ?? priority

export const goalTypeLabel = (goalType: GoalType) =>
  goalTypeOptions.find((option) => option.value === goalType)?.label ?? goalType

export const goalFundingSourceTypeLabel = (value: GoalFundingSourceType) =>
  goalFundingSourceTypeOptions.find((option) => option.value === value)?.label ?? value

export const billCategoryLabel = (category: BillCategory) =>
  billCategoryOptions.find((option) => option.value === category)?.label ?? category

export const billScopeLabel = (scope: BillScope) =>
  billScopeOptions.find((option) => option.value === scope)?.label ?? scope

export const severityLabel = (severity: InsightSeverity) => {
  if (severity === 'critical') return 'Critical'
  if (severity === 'warning') return 'Watch'
  return 'Good'
}

export const daysUntilDate = (dateString: string) => {
  const target = new Date(`${dateString}T00:00:00`)
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const end = target.getTime()
  return Math.round((end - start) / 86400000)
}
