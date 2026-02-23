import { describe, expect, it } from 'vitest'
import {
  addCalendarMonthsKeepingDay,
  applyCardMonthlyLifecycle,
  applyLoanMonthlyLifecycle,
  countCompletedMonthlyCycles,
  toCycleKey,
  toMonthlyAmount,
} from './financeMath'

describe('financeMath', () => {
  it('converts custom 4-week cadence to monthly amount', () => {
    const monthly = toMonthlyAmount(100, 'custom', 4, 'weeks')
    expect(monthly).toBeCloseTo(108.7, 1)
  })

  it('counts completed monthly cycles using calendar month boundaries', () => {
    const from = new Date('2026-01-15T10:00:00Z').getTime()
    const onBoundary = new Date('2026-02-15T09:00:00Z')
    const beforeBoundary = new Date('2026-02-14T23:00:00Z')

    expect(countCompletedMonthlyCycles(from, onBoundary)).toBe(1)
    expect(countCompletedMonthlyCycles(from, beforeBoundary)).toBe(0)
  })

  it('applies card lifecycle with spend, apr, and payment', () => {
    const result = applyCardMonthlyLifecycle(
      {
        usedLimit: 1000,
        spendPerMonth: 100,
        minimumPayment: 50,
        interestRate: 24,
      },
      1,
    )

    expect(result.balance).toBeCloseTo(1070, 2)
    expect(result.statementBalance).toBeCloseTo(1070, 2)
    expect(result.dueBalance).toBeCloseTo(1020, 2)
    expect(result.interestAccrued).toBeCloseTo(20, 2)
    expect(result.paymentsApplied).toBeCloseTo(50, 2)
    expect(result.spendAdded).toBeCloseTo(100, 2)
  })

  it('applies card lifecycle with percent + interest minimum payment type', () => {
    const result = applyCardMonthlyLifecycle(
      {
        usedLimit: 1000,
        statementBalance: 1000,
        pendingCharges: 0,
        spendPerMonth: 0,
        minimumPaymentType: 'percent_plus_interest',
        minimumPaymentPercent: 2,
        extraPayment: 15,
        minimumPayment: 0,
        interestRate: 24,
      },
      1,
    )

    expect(result.dueBalance).toBeCloseTo(1020, 2)
    expect(result.paymentsApplied).toBeCloseTo(55, 2)
    expect(result.balance).toBeCloseTo(965, 2)
  })

  it('applies loan lifecycle with apr and amortizing payment', () => {
    const result = applyLoanMonthlyLifecycle(
      {
        balance: 1000,
        minimumPayment: 200,
        interestRate: 12,
        cadence: 'monthly',
      },
      1,
    )

    expect(result.balance).toBeCloseTo(810, 2)
    expect(result.interestAccrued).toBeCloseTo(10, 2)
    expect(result.paymentsApplied).toBeCloseTo(200, 2)
  })

  it('keeps the same day when adding calendar months where possible', () => {
    const date = new Date(2026, 0, 31)
    const moved = addCalendarMonthsKeepingDay(date, 1)
    expect(moved.getDate()).toBe(28)
  })

  it('builds canonical cycle keys', () => {
    expect(toCycleKey(new Date('2026-07-04T00:00:00Z'))).toBe('2026-07')
  })
})
