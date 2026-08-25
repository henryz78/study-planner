/**
 * Cloudflare Pages Function for D1 sync
 * Migrated from worker/d1/src/index.ts with minimal changes.
 * Integrated into Pages so Dashboard is source of truth for D1 bindings, env vars, domains.
 * Local dev: `npx wrangler pages dev` with D1 binding, or copy worker/d1/wrangler.toml.example
 */

export interface Env {
  DB: D1Database
  ALLOWED_ORIGINS?: string
  API_TOKEN?: string
}

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean)
  const allowOrigin = !allowed?.length || !origin || allowed.includes(origin) || allowed.includes('*')
    ? origin ?? '*'
    : allowed[0]
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

function jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

async function handleGet(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const url = new URL(request.url)
  const userId = url.searchParams.get('userId') || url.searchParams.get('user_id')
  if (!userId) {
    return jsonResponse({ error: 'Missing userId' }, 400, cors)
  }

  const row = await env.DB.prepare('SELECT user_id, data, revision, client_updated_at, updated_at FROM study_snapshots WHERE user_id = ?')
    .bind(userId)
    .first<{ user_id: string; data: string; revision: number; client_updated_at: string; updated_at: string }>()

  if (!row) {
    return jsonResponse({ error: 'Not found' }, 404, cors)
  }

  let parsedData: unknown
  try {
    parsedData = JSON.parse(row.data)
  } catch {
    parsedData = row.data
  }

  return jsonResponse(
    {
      data: parsedData,
      revision: row.revision,
      client_updated_at: row.client_updated_at,
      updated_at: row.updated_at,
    },
    200,
    cors,
  )
}

async function handlePut(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  let body: {
    userId?: string
    user_id?: string
    data?: unknown
    revision?: number
    expectedRevision?: number
    client_updated_at?: string
    clientUpdatedAt?: string
    updatedAt?: string
  }
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400, cors)
  }

  const userId = body.userId || body.user_id
  const data = body.data
  if (!userId || data === undefined) {
    return jsonResponse({ error: 'Missing userId or data' }, 400, cors)
  }

  const clientUpdatedAt = body.client_updated_at || body.clientUpdatedAt || new Date().toISOString()
  const now = new Date().toISOString()
  const dataStr = typeof data === 'string' ? data : JSON.stringify(data)
  const expectedRevision = body.expectedRevision ?? (body.revision != null ? body.revision - 1 : undefined)

  if (expectedRevision === undefined) {
    const existing = await env.DB.prepare('SELECT revision FROM study_snapshots WHERE user_id = ?').bind(userId).first<{ revision: number }>()
    if (!existing) {
      const nextRevision = body.revision ?? 1
      await env.DB.prepare(
        'INSERT INTO study_snapshots (user_id, data, revision, client_updated_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
        .bind(userId, dataStr, nextRevision, clientUpdatedAt, now)
        .run()
      return jsonResponse({ revision: nextRevision, savedAt: now }, 200, cors)
    }
    const nextRevision = existing.revision + 1
    await env.DB.prepare(
      'UPDATE study_snapshots SET data = ?, revision = ?, client_updated_at = ?, updated_at = ? WHERE user_id = ?',
    )
      .bind(dataStr, nextRevision, clientUpdatedAt, now, userId)
      .run()
    return jsonResponse({ revision: nextRevision, savedAt: now }, 200, cors)
  }

  const current = await env.DB.prepare('SELECT revision FROM study_snapshots WHERE user_id = ?').bind(userId).first<{ revision: number }>()
  if (!current) {
    return jsonResponse({ error: 'Not found', expectedRevision }, 404, cors)
  }
  if (current.revision !== expectedRevision) {
    return jsonResponse({ error: 'Revision conflict', expectedRevision, currentRevision: current.revision }, 409, cors)
  }
  const nextRevision = expectedRevision + 1
  const result = await env.DB.prepare(
    'UPDATE study_snapshots SET data = ?, revision = ?, client_updated_at = ?, updated_at = ? WHERE user_id = ? AND revision = ?',
  )
    .bind(dataStr, nextRevision, clientUpdatedAt, now, userId, expectedRevision)
    .run()
  if (result.meta.changes === 0) {
    return jsonResponse({ error: 'Revision conflict', expectedRevision }, 409, cors)
  }
  return jsonResponse({ revision: nextRevision, savedAt: now }, 200, cors)
}

// Pages Functions entry – handles all methods for /api/d1/snapshot
export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context
  const url = new URL(request.url)
  const origin = request.headers.get('Origin')
  const cors = corsHeaders(origin, env)

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  if (env.API_TOKEN) {
    const auth = request.headers.get('Authorization')
    if (auth !== `Bearer ${env.API_TOKEN}`) {
      return jsonResponse({ error: 'Unauthorized' }, 401, cors)
    }
  }

  const pathname = url.pathname
  // Pages Functions at functions/api/d1/snapshot.ts handles /api/d1/snapshot
  // Also accept /snapshot for flexibility (when called via Worker URL)
  if (pathname === '/api/d1/snapshot' || pathname === '/snapshot' || pathname === '/api/snapshot') {
    if (request.method === 'GET') {
      return handleGet(request, env, cors)
    }
    if (request.method === 'PUT' || request.method === 'POST') {
      return handlePut(request, env, cors)
    }
    return jsonResponse({ error: 'Method not allowed' }, 405, cors)
  }

  // Health check for Pages Function
  if (pathname === '/api/d1/health' || pathname === '/health' || pathname === '/') {
    return jsonResponse({ ok: true, service: 'study-planner-d1-sync (Pages)' }, 200, cors)
  }

  return jsonResponse({ error: 'Not found' }, 404, cors)
}
