import type { ActionCtx, MutationCtx, QueryCtx } from '../_generated/server'

export const requireIdentity = async (
  ctx: QueryCtx | MutationCtx | ActionCtx,
  message = 'You must be signed in.',
) => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new Error(message)
  }
  return identity
}

export const assertOwned = <TDoc extends { userId: string }>(
  doc: TDoc | null | undefined,
  userId: string,
  label: string,
) => {
  if (!doc || doc.userId !== userId) {
    throw new Error(`${label} not found.`)
  }
  return doc
}

export const getOwned = async <TDoc extends { userId: string }>(
  ctx: MutationCtx | QueryCtx,
  id: unknown,
  userId: string,
  label: string,
) => {
  const doc = (await ctx.db.get(id as never)) as TDoc | null
  return assertOwned(doc, userId, label)
}
