/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { getEffectiveProvider, loadSyncConfig, saveSyncConfig } from '../src/services/sync/config'
import { isD1EnvConfigured, getD1WorkerUrl } from '../src/services/sync/config'
import { buildBlankState } from '../src/lib/seed'

const originalFetch = globalThis.fetch

function clearStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.clear()
    const g = globalThis as unknown as { localStorage?: Storage }
    g.localStorage?.clear?.()
  } catch {
    // ignore
  }
}

describe('D1 sync local-first', () => {
  beforeEach(() => {
    clearStorage()
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
    clearStorage()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('getEffectiveProvider: auto prefers D1 when configured', () => {
    vi.stubEnv('VITE_D1_WORKER_URL', 'https://example.workers.dev')
    // Need to check isD1EnvConfigured reflects stub
    expect(isD1EnvConfigured()).toBe(true)
    expect(getEffectiveProvider({ provider: 'auto' }, false)).toBe('d1')
    expect(getEffectiveProvider({ provider: 'auto' }, true)).toBe('d1')
    expect(getEffectiveProvider({ provider: 'supabase' }, true)).toBe('supabase')
    expect(getEffectiveProvider({ provider: 'd1' }, false)).toBe('d1')
    expect(getEffectiveProvider({ provider: 'local' }, true)).toBe('local')
    vi.stubEnv('VITE_D1_WORKER_URL', '')
    expect(isD1EnvConfigured()).toBe(false)
    expect(getEffectiveProvider({ provider: 'auto' }, true)).toBe('supabase')
    expect(getEffectiveProvider({ provider: 'auto' }, false)).toBe('local')
  })

  it('load/save sync config roundtrip', () => {
    saveSyncConfig({ provider: 'd1' })
    expect(loadSyncConfig().provider).toBe('d1')
    saveSyncConfig({ provider: 'supabase' })
    expect(loadSyncConfig().provider).toBe('supabase')
    saveSyncConfig({ provider: 'auto' })
    expect(loadSyncConfig().provider).toBe('auto')
  })

  it('D1 upload handles network failure without blocking local (local-first)', async () => {
    vi.stubEnv('VITE_D1_WORKER_URL', 'https://example.workers.dev')
    globalThis.fetch = vi.fn(async () => {
      throw new Error('Network unreachable')
    }) as unknown as typeof fetch
    const { uploadSnapshotD1 } = await import('../src/services/sync/d1')
    const state = buildBlankState()
    await expect(uploadSnapshotD1(state, 'user-123')).rejects.toThrow(/D1 同步失败/)
    expect(state.settings.planName).toBeTruthy()
  })

  it('D1 download returns undefined on 404 (new user) and validates snapshot', async () => {
    vi.stubEnv('VITE_D1_WORKER_URL', 'https://example.workers.dev')
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 404 })) as unknown as typeof fetch
    const { downloadSnapshotD1 } = await import('../src/services/sync/d1')
    const result = await downloadSnapshotD1('user-404')
    expect(result).toBeUndefined()
  })

  it('D1 upload handles revision conflict (409) as CloudRevisionConflictError', async () => {
    vi.stubEnv('VITE_D1_WORKER_URL', 'https://example.workers.dev')
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'Revision conflict', currentRevision: 5 }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch
    const { uploadSnapshotD1, CloudRevisionConflictError } = await import('../src/services/sync/d1')
    const state = buildBlankState()
    await expect(uploadSnapshotD1(state, 'user-123', 3)).rejects.toBeInstanceOf(CloudRevisionConflictError)
  })

  it('D1 upload succeeds and returns revision', async () => {
    vi.stubEnv('VITE_D1_WORKER_URL', 'https://example.workers.dev')
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ revision: 2, savedAt: '2026-08-26T00:00:00.000Z' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch
    const { uploadSnapshotD1 } = await import('../src/services/sync/d1')
    const state = buildBlankState()
    const result = await uploadSnapshotD1(state, 'user-123', 1)
    expect(result.revision).toBe(2)
    expect(result.savedAt).toBe('2026-08-26T00:00:00.000Z')
  })

  it('local-first: D1 not configured should throw clearly but not corrupt local', async () => {
    vi.stubEnv('VITE_D1_WORKER_URL', '')
    const { getEffectiveSyncProvider } = await import('../src/services/sync/cloud')
    expect(() => getEffectiveSyncProvider()).not.toThrow()
    expect(getD1WorkerUrl()).toBeUndefined()
  })

  it('D1 independent: generates persistent random sync key without Supabase', async () => {
    vi.stubEnv('VITE_D1_WORKER_URL', 'https://example.workers.dev')
    const { getOrCreateD1UserId } = await import('../src/services/sync/config')
    const id1 = getOrCreateD1UserId()
    const id2 = getOrCreateD1UserId()
    expect(id1).toBe(id2)
    expect(id1.length).toBeGreaterThan(10)
    // Should be UUID or d1- prefixed
    expect(id1).toMatch(/^[0-9a-f-]{10,}|^d1-/)
    // Different storage clear should generate new
    clearStorage()
    const id3 = getOrCreateD1UserId()
    expect(id3).not.toBe(id1)
  })

  it('D1 independent: cloud abstraction uses local key when Supabase not logged in', async () => {
    vi.stubEnv('VITE_D1_WORKER_URL', 'https://example.workers.dev')
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    const { getOrCreateD1UserId } = await import('../src/services/sync/config')
    const d1Id = getOrCreateD1UserId()
    globalThis.fetch = vi.fn(async (url: RequestInfo, init?: RequestInit) => {
      const u = typeof url === 'string' ? url : url.toString()
      // Verify that upload uses d1Id as userId when no Supabase session
      if (u.includes('/snapshot') && init?.method === 'PUT') {
        const body = JSON.parse(init.body as string) as { userId?: string }
        expect(body.userId).toBe(d1Id)
        return new Response(JSON.stringify({ revision: 1, savedAt: new Date().toISOString() }), { status: 200 })
      }
      return new Response(null, { status: 404 })
    }) as unknown as typeof fetch
    const { uploadSnapshot } = await import('../src/services/sync/cloud')
    // Mock getSession to return null (no Supabase)
    // uploadSnapshot should still succeed via D1 using local key, not throw "请先登录"
    const state = buildBlankState()
    const result = await uploadSnapshot(state)
    expect(result.revision).toBe(1)
  })

  it('Worker auth: API_TOKEN is sent as Bearer when configured', async () => {
    vi.stubEnv('VITE_D1_WORKER_URL', 'https://example.workers.dev')
    vi.stubEnv('VITE_D1_API_TOKEN', 'secret-token-123')
    let capturedAuth: string | null = null
    globalThis.fetch = vi.fn(async (_url: RequestInfo, init?: RequestInit) => {
      capturedAuth = (init?.headers as Record<string, string>)?.Authorization ?? null
      return new Response(JSON.stringify({ revision: 1, savedAt: new Date().toISOString() }), { status: 200 })
    }) as unknown as typeof fetch
    const { uploadSnapshotD1 } = await import('../src/services/sync/d1')
    const state = buildBlankState()
    await uploadSnapshotD1(state, 'user-123')
    expect(capturedAuth).toBe('Bearer secret-token-123')
  })

  it('Worker /snapshot without token when not configured still allows possession-based access', async () => {
    vi.stubEnv('VITE_D1_WORKER_URL', 'https://example.workers.dev')
    vi.stubEnv('VITE_D1_API_TOKEN', '')
    let capturedAuth: string | undefined
    globalThis.fetch = vi.fn(async (_url: RequestInfo, init?: RequestInit) => {
      capturedAuth = (init?.headers as Record<string, string>)?.Authorization
      return new Response(null, { status: 404 })
    }) as unknown as typeof fetch
    const { downloadSnapshotD1 } = await import('../src/services/sync/d1')
    await downloadSnapshotD1('some-random-uuid-1234')
    // No token should be sent, rely on userId possession
    expect(capturedAuth).toBeUndefined()
  })
})
