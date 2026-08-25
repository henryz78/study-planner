/**
 * Sync provider config – local-first, D1 is opt-in.
 * - `auto`: prefer D1 if configured, fallback to Supabase, then local
 * - `supabase` / `d1` / `local` : explicit choice
 * Stored in localStorage; env var VITE_D1_WORKER_URL enables D1 option.
 */

export type SyncProviderId = 'auto' | 'supabase' | 'd1' | 'local'

export interface SyncConfig {
  provider: SyncProviderId
}

const STORAGE_KEY = 'study-planner:sync-config'
const DEFAULT: SyncConfig = { provider: 'auto' }

export function getD1WorkerUrl(): string | undefined {
  const raw = import.meta.env.VITE_D1_WORKER_URL as string | undefined
  if (raw !== undefined) {
    const trimmed = raw.replace(/\/+$/, '').trim()
    return trimmed || undefined
  }
  if (typeof window !== 'undefined') {
    try {
      const { hostname, port, host } = window.location as unknown as { hostname: string; port: string; host: string }
      // Vite 本地开发
      if ((hostname === 'localhost' || hostname === '127.0.0.1') && (port === '5173' || port === '' || host === 'localhost' || host === 'localhost:5173')) {
        // jsdom 默认 http://localhost deepen check: if no explicit Vite dev, treat as not Pages
        // 仅当明确是 Pages 预览/生产才视为可用
        // 为避免测试环境误判，此处对 jsdom 默认 localhost 返回 undefined
        if (typeof host === 'string' && host === 'localhost') return undefined
        if (port === '' && hostname === 'localhost') return undefined
        return undefined
      }
      // wrangler pages dev
      if (hostname === '127.0.0.1' && port === '8788') return ''
      if (hostname.includes('pages.dev')) return ''
      if (hostname !== 'localhost' && hostname !== '127.0.0.1') return ''
      return undefined
    } catch {
      return undefined
    }
  }
  return undefined
}

export const D1_WORKER_URL = getD1WorkerUrl()
export const d1EnvConfigured = getD1WorkerUrl() !== undefined

export function isD1EnvConfigured(): boolean {
  return getD1WorkerUrl() !== undefined
}

function getStorage(): Storage | undefined {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
    const g = globalThis as unknown as { localStorage?: Storage }
    if (g.localStorage) return g.localStorage
  } catch {
    // ignore
  }
  return undefined
}

export function loadSyncConfig(): SyncConfig {
  try {
    const storage = getStorage()
    const raw = storage?.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT }
    const parsed = JSON.parse(raw) as Partial<SyncConfig>
    const provider = parsed.provider
    if (provider === 'auto' || provider === 'supabase' || provider === 'd1' || provider === 'local') {
      return { provider }
    }
    return { ...DEFAULT }
  } catch {
    return { ...DEFAULT }
  }
}

export function saveSyncConfig(config: SyncConfig): void {
  try {
    const storage = getStorage()
    storage?.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // quota or privacy mode: ignore, keep in-memory
  }
}

export function getEffectiveProvider(config: SyncConfig, supabaseConfigured: boolean): 'supabase' | 'd1' | 'local' {
  const pref = config.provider
  const d1Ok = isD1EnvConfigured()
  if (pref === 'local') return 'local'
  if (pref === 'd1') return d1Ok ? 'd1' : supabaseConfigured ? 'supabase' : 'local'
  if (pref === 'supabase') return supabaseConfigured ? 'supabase' : d1Ok ? 'd1' : 'local'
  // auto
  if (d1Ok) return 'd1'
  if (supabaseConfigured) return 'supabase'
  return 'local'
}

export const D1_API_TOKEN = (import.meta.env.VITE_D1_API_TOKEN as string | undefined)?.trim()

export function getD1ApiToken(): string | undefined {
  return (import.meta.env.VITE_D1_API_TOKEN as string | undefined)?.trim() || undefined
}

const D1_USER_ID_KEY = 'study-planner:d1-user-id'

/**
 * D1 独立身份：不依赖 Supabase Auth。
 * 首次调用时生成高熵随机 ID（crypto.randomUUID）并持久化到本机存储，
 * 该 ID 同时作为 `user_id` 主键与 possession 凭证（知道 ID 才能读写）。
 * 浏览器→Worker 仅凭此 ID 即可同步，无需 Supabase 登录。
 */
export function getOrCreateD1UserId(): string {
  try {
    const storage = getStorage()
    let id = storage?.getItem(D1_USER_ID_KEY) ?? undefined
    if (id && id.trim()) return id.trim()
    const newId =
      (globalThis.crypto as Crypto | undefined)?.randomUUID?.() ??
      `d1-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`
    try {
      storage?.setItem(D1_USER_ID_KEY, newId)
    } catch {
      // ignore quota
    }
    return newId
  } catch {
    return `d1-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}

export const SYNC_SECURITY_NOTE_D1 =
  'D1 通过 Cloudflare Worker 同步，数据经 Worker 写入 D1。Worker 需配置 CORS 与可选 API_TOKEN；D1 独立模式下，浏览器本机随机生成的 sync key（高熵 UUID）即为读写凭证，需妥善保管本机存储，生产建议在 Worker 校验 Supabase JWT 或绑定 API_TOKEN。'
