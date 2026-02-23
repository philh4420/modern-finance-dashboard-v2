import { describe, expect, it } from 'vitest'
import type { LoanEntry } from '../components/financeTypes'
import { analyzeLoanRefinance, buildLoanProjectionModel } from './loanIntelligence'

const buildLoan = (overrides: Partial<LoanEntry>): LoanEntry =>
  ({
    _id: 'loan_test',
    _creationTime: 0,
    userId: 'user_test',
    name: 'Test loan',
    balance: 1000,
    minimumPayment: 100,
    dueDay: 12,
    cadence: 'monthly',
    createdAt: Date.now(),
    ...overrides,
  }) as LoanEntry

describe('loanIntelligence', () => {
  it('projects zero interest for zero APR loans', () => {
    const model = buildLoanProjectionModel(
      buildLoan({
        name: 'Zero APR',
        balance: 1200,
        principalBalance: 1200,
        accruedInterest: 0,
        interestRate: 0,
        minimumPayment: 100,
      }),
      { maxMonths: 12, loanEvents: [] },
    )

    expect(model.projectedNextMonthInterest).toBe(0)
    expect(model.projectedAnnualInterest).toBe(0)
  })

  it('supports subscription-only periods when principal is zero', () => {
    const model = buildLoanProjectionModel(
      buildLoan({
        name: 'Subscription only',
        balance: 0,
        principalBalance: 0,
        accruedInterest: 0,
        minimumPayment: 0,
        subscriptionCost: 14,
        subscriptionPaymentCount: 3,
        subscriptionOutstanding: 42,
      }),
      { maxMonths: 12, loanEvents: [] },
    )

    expect(model.rows[0]?.plannedLoanPayment ?? 0).toBe(0)
    expect(model.rows[0]?.subscriptionDue ?? 0).toBe(14)
    expect(model.horizons[12].totalSubscriptionPaid).toBe(42)
  })

  it('flags payment-below-interest scenarios in first projection row', () => {
    const model = buildLoanProjectionModel(
      buildLoan({
        name: 'High APR',
        balance: 1000,
        principalBalance: 1000,
        accruedInterest: 0,
        interestRate: 60,
        minimumPayment: 5,
        minimumPaymentType: 'fixed',
      }),
      { maxMonths: 12, loanEvents: [] },
    )

    expect((model.rows[0]?.plannedLoanPayment ?? 0) < (model.rows[0]?.interestAccrued ?? 0)).toBe(true)
  })

  it('returns stable refinance analysis outputs', () => {
    const baseModel = buildLoanProjectionModel(
      buildLoan({
        name: 'Refinance base',
        balance: 5000,
        principalBalance: 5000,
        accruedInterest: 0,
        interestRate: 24,
        minimumPayment: 240,
      }),
      { maxMonths: 36, loanEvents: [] },
    )

    const result = analyzeLoanRefinance(baseModel, {
      apr: 10,
      fees: 100,
      termMonths: 24,
    })

    expect(Number.isFinite(result.monthlyPayment)).toBe(true)
    expect(Number.isFinite(result.totalRefinanceCost)).toBe(true)
    expect(result.monthlyPayment).toBeGreaterThan(0)
  })

  it('drops payment consistency score when no payment history is logged', () => {
    const model = buildLoanProjectionModel(
      buildLoan({
        name: 'Consistency test',
        balance: 1800,
        principalBalance: 1800,
        accruedInterest: 0,
        interestRate: 19.9,
        minimumPayment: 120,
      }),
      { maxMonths: 12, loanEvents: [] },
    )

    expect(model.paymentConsistencyScore).toBeLessThan(50)
  })
})
