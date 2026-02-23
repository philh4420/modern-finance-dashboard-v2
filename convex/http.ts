import { httpRouter } from 'convex/server'
import { httpAction } from './_generated/server'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { requireIdentity } from './lib/authz'

const http = httpRouter()

const corsHeaders = (origin: string | null) => {
  const configured = process.env.CLIENT_ORIGIN
  const allowOrigin = configured ?? origin ?? '*'

  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Max-Age': '86400',
  }

  if (configured) {
    headers.Vary = 'Origin'
  }

  return headers
}

http.route({
  path: '/exports/download',
  method: 'OPTIONS',
  handler: httpAction(async (_ctx, request) => {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request.headers.get('Origin')),
    })
  }),
})

http.route({
  path: '/exports/download',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url)
    const exportId = url.searchParams.get('exportId')
    if (!exportId) {
      return new Response('Missing exportId', { status: 400, headers: corsHeaders(request.headers.get('Origin')) })
    }

    await requireIdentity(ctx)

    const exportDoc = (await ctx.runQuery(internal.privacy._getUserExportById, {
      id: exportId as unknown as Id<'userExports'>,
    })) as {
      _id: Id<'userExports'>
      userId: string
      status: 'processing' | 'ready' | 'failed' | 'expired'
      storageId?: Id<'_storage'> | null
      byteSize?: number | null
      createdAt: number
      expiresAt: number
    } | null

    if (!exportDoc) {
      return new Response('Export not found', { status: 404, headers: corsHeaders(request.headers.get('Origin')) })
    }

    if (Date.now() > exportDoc.expiresAt) {
      return new Response('Export expired', { status: 410, headers: corsHeaders(request.headers.get('Origin')) })
    }

    if (exportDoc.status !== 'ready' || !exportDoc.storageId) {
      return new Response('Export not ready', { status: 409, headers: corsHeaders(request.headers.get('Origin')) })
    }

    const blob = await ctx.storage.get(exportDoc.storageId)
    if (!blob) {
      return new Response('Export file missing', { status: 404, headers: corsHeaders(request.headers.get('Origin')) })
    }

    const filename = `finance-export-${new Date(exportDoc.createdAt).toISOString().slice(0, 10)}.zip`

    await ctx.runMutation(internal.privacy._logUserExportDownload, {
      exportId: exportDoc._id,
      filename,
      byteSize: exportDoc.byteSize ?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
      source: 'http_download',
    })

    return new Response(blob, {
      status: 200,
      headers: {
        ...corsHeaders(request.headers.get('Origin')),
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }),
})

export default http
