import type { Cadence, CustomCadenceUnit } from '../components/financeTypes'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

const monthsBetween = (from: Date, to: Date) =>
  (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())

const dateWithClampedDay = (year: number, month: number, day: number) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(day, daysInMonth))
}

const parseIsoDateValue = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null
  }

  const [yearText, monthText, dayText] = value.split('-')
  const year = Number.parseInt(yearText, 10)
  const month = Number.parseInt(monthText, 10)
  const day = Number.parseInt(dayText, 10)

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }

  const parsed = new Date(year, month - 1, day)
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null
  }

  return parsed
}

const resolveCadenceAnchorDate = (createdAt: number, payDateAnchor?: string) => {
  if (payDateAnchor) {
    const parsed = parseIsoDateValue(payDateAnchor)
    if (parsed) {
      return startOfDay(parsed)
    }
  }
  return startOfDay(new Date(createdAt))
}

const nextDateByMonthCycle = (day: number, cycleMonths: number, anchorDate: Date, now: Date) => {
  const anchorMonthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)
  let probeYear = now.getFullYear()
  let probeMonth = now.getMonth()

  for (let i = 0; i < 36; i += 1) {
    const candidate = dateWithClampedDay(probeYear, probeMonth, day)
    const candidateMonthStart = new Date(candidate.getFullYear(), candidate.getMonth(), 1)
    const monthDiff = monthsBetween(anchorMonthStart, candidateMonthStart)

    if (candidate >= now && monthDiff >= 0 && monthDiff % cycleMonths === 0) {
      return candidate
    }

    probeMonth += 1
    if (probeMonth > 11) {
      probeMonth = 0
      probeYear += 1
    }
  }

  return null
}

const nextOneTimeDate = (day: number, anchorDate: Date, now: Date) => {
  const candidate = dateWithClampedDay(anchorDate.getFullYear(), anchorDate.getMonth(), day)
  const scheduled = candidate < anchorDate ? anchorDate : candidate
  return scheduled >= now ? scheduled : null
}

export const isValidIsoDate = (value: string) => parseIsoDateValue(value) !== null

export const nextDateForCadence = (args: {
  cadence: Cadence
  createdAt: number
  dayOfMonth?: number
  customInterval?: number
  customUnit?: CustomCadenceUnit
  payDateAnchor?: string
  now?: Date
}) => {
  const today = startOfDay(args.now ?? new Date())
  const anchorDate = resolveCadenceAnchorDate(args.createdAt, args.payDateAnchor)

  if (args.cadence === 'one_time') {
    const normalizedDay = clamp(args.dayOfMonth ?? anchorDate.getDate(), 1, 31)
    return nextOneTimeDate(normalizedDay, anchorDate, today)
  }

  if (args.cadence === 'weekly' || args.cadence === 'biweekly') {
    const interval = args.cadence === 'weekly' ? 7 : 14
    const base = new Date(anchorDate.getTime())

    for (let i = 0; i < 2000 && base < today; i += 1) {
      base.setDate(base.getDate() + interval)
    }

    return base
  }

  if (args.cadence === 'custom') {
    if (!args.customInterval || !args.customUnit) {
      return null
    }

    const base = new Date(anchorDate.getTime())

    if (args.customUnit === 'days' || args.customUnit === 'weeks') {
      const interval = args.customUnit === 'days' ? args.customInterval : args.customInterval * 7

      for (let i = 0; i < 4000 && base < today; i += 1) {
        base.setDate(base.getDate() + interval)
      }

      return base
    }

    const cycleMonths = args.customUnit === 'months' ? args.customInterval : args.customInterval * 12
    const normalizedDay = clamp(args.dayOfMonth ?? anchorDate.getDate(), 1, 31)
    return nextDateByMonthCycle(normalizedDay, cycleMonths, anchorDate, today)
  }

  const cycleMonths = args.cadence === 'monthly' ? 1 : args.cadence === 'quarterly' ? 3 : 12
  const normalizedDay = clamp(args.dayOfMonth ?? anchorDate.getDate(), 1, 31)
  return nextDateByMonthCycle(normalizedDay, cycleMonths, anchorDate, today)
}

export const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
