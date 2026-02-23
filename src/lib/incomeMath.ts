import type { Cadence, CustomCadenceUnit } from '../components/financeTypes'

type IncomeAmountInput = {
  amount: number
  grossAmount?: number | null
  taxAmount?: number | null
  nationalInsuranceAmount?: number | null
  pensionAmount?: number | null
}

const finiteOrZero = (value: number | undefined | null) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

export const roundCurrency = (value: number) => Math.round(value * 100) / 100

export const toMonthlyAmount = (
  amount: number,
  cadence: Cadence,
  customInterval?: number,
  customUnit?: CustomCadenceUnit,
) => {
  switch (cadence) {
    case 'weekly':
      return (amount * 52) / 12
    case 'biweekly':
      return (amount * 26) / 12
    case 'monthly':
      return amount
    case 'quarterly':
      return amount / 3
    case 'yearly':
      return amount / 12
    case 'custom':
      if (!customInterval || !customUnit || customInterval <= 0) {
        return 0
      }
      if (customUnit === 'days') return (amount * 365.2425) / (customInterval * 12)
      if (customUnit === 'weeks') return (amount * 365.2425) / (customInterval * 7 * 12)
      if (customUnit === 'months') return amount / customInterval
      return amount / (customInterval * 12)
    case 'one_time':
      return 0
    default:
      return amount
  }
}

export const computeIncomeDeductionsTotal = (entry: {
  taxAmount?: number | null
  nationalInsuranceAmount?: number | null
  pensionAmount?: number | null
}) =>
  roundCurrency(
    finiteOrZero(entry.taxAmount) +
      finiteOrZero(entry.nationalInsuranceAmount) +
      finiteOrZero(entry.pensionAmount),
  )

export const resolveIncomeNetAmount = (entry: IncomeAmountInput) => {
  const grossAmount = finiteOrZero(entry.grossAmount)
  const deductionTotal = computeIncomeDeductionsTotal(entry)
  if (grossAmount > 0 || deductionTotal > 0) {
    return roundCurrency(Math.max(grossAmount - deductionTotal, 0))
  }
  return roundCurrency(Math.max(finiteOrZero(entry.amount), 0))
}

export const resolveIncomeGrossAmount = (entry: IncomeAmountInput) => {
  const grossAmount = finiteOrZero(entry.grossAmount)
  if (grossAmount > 0) {
    return roundCurrency(grossAmount)
  }
  return roundCurrency(resolveIncomeNetAmount(entry) + computeIncomeDeductionsTotal(entry))
}

export const hasIncomeBreakdown = (entry: {
  grossAmount?: number | null
  taxAmount?: number | null
  nationalInsuranceAmount?: number | null
  pensionAmount?: number | null
}) => finiteOrZero(entry.grossAmount) > 0 || computeIncomeDeductionsTotal(entry) > 0
