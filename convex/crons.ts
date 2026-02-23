import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

crons.daily(
  'Apply retention policies',
  { hourUTC: 3, minuteUTC: 15 },
  internal.ops.applyRetentionGlobal,
  {},
)

export default crons

