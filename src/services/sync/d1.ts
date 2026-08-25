import type { AppState } from '../../types'
import { validateStateInput } from '../../lib/state-schema'
import { preparePortableState } from '../../lib/supabase'
import { D1_API_TOKEN, getD1WorkerUrl, isD1EnvConfigured } from './config'

export function getD1Configured(): boolean {
  return isD1EnvConfigured()
}
export const d1Configured = isD1EnvConfigured()
export function getD1WorkerUrlCached(): string | undefined {
  return getD1WorkerUrl()
}
export const d1WorkerUrl = getD1WorkerUrl()

export class CloudRevisionConflictError extends Error {
  constructor(public expectedRevision: number) {
    super('云端计划已被另一台设备更新。当前修改已保留在本机，请先比较冲突版本。')
    this.name = 'CloudRevisionConflictError'
  }
}

export interface CloudSnapshot {
  state: AppState
  revision: number
}

function validateCloudSnapshot(raw: unknown, revision: unknown): CloudSnapshot {
  const validation = validateStateInput(raw, 'cloud')
  if (!validation.success || !validation.data) throw new Error(`云端快照结构无效：${validation.issues.slice(0, 3).join('；')}`)
  return { state: validation.data, revision: Math.max(1, Number(revision) || 1) }
}

async function getAuthHeader(): Promise<Record<string, string>> {
  // D1 独立模式：若配置了 VITE_D1_API_TOKEN，则作为 Bearer 随每次请求发送，形成有效的浏览器→Worker 鉴权
  // 该 Token 是部署级共享密钥（VITE_ 会暴露在前端 bundle，仅防匿名爬取，生产建议改用 HttpOnly Cookie 或 Supabase JWT 校验）
  try {
    if (D1_API_TOKEN) return { Authorization: `Bearer ${D1_API_TOKEN}` }
    // 兼容：若配了 Supabase，尝试携带 Supabase access_token（Worker 可选校验）
    // 为避免循环依赖，不在此直接 import supabase；Worker 当前信任 userId  possession
    return {}
  } catch {
    return {}
  }
}

export async function uploadSnapshotD1(state: AppState, userId: string, expectedRevision?: number): Promise<{ savedAt: string; revision: number }> {
  const workerUrl = getD1WorkerUrl()
  if (!workerUrl) throw new Error('D1 Worker 未配置 (VITE_D1_WORKER_URL)')
  if (!userId) throw new Error('请先登录')
  const now = new Date().toISOString()
  const portable = preparePortableState(state)
  const payload = { ...portable, lastCloudSyncAt: now, updatedAt: state.updatedAt }
  const body: Record<string, unknown> = {
    userId,
    data: payload,
    client_updated_at: state.updatedAt,
    expectedRevision,
    revision: expectedRevision != null ? expectedRevision + 1 : 1,
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(await getAuthHeader()) }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  let response: Response
  try {
    response = await fetch(`${workerUrl}/snapshot`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (error) {
    clearTimeout(timeout)
    // Network failure -> local-first: throw but caller should treat as sync error, not block local
    throw new Error(error instanceof Error ? `D1 同步失败：${error.message}` : 'D1 同步失败')
  }
  clearTimeout(timeout)
  if (response.status === 409) {
    const text = await response.text().catch(() => '')
    let currentRevision = expectedRevision ?? 0
    try {
      const parsed = JSON.parse(text) as { currentRevision?: number }
      if (typeof parsed.currentRevision === 'number') currentRevision = parsed.currentRevision
    } catch {
      // ignore
    }
    throw new CloudRevisionConflictError(currentRevision)
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`D1 上传失败 ${response.status}: ${text.slice(0, 300)}`)
  }
  const data = (await response.json()) as { revision?: number; savedAt?: string }
  return { savedAt: data.savedAt ?? now, revision: Number(data.revision) || (expectedRevision != null ? expectedRevision + 1 : 1) }
}

export async function downloadSnapshotD1(userId: string): Promise<CloudSnapshot | undefined> {
  const workerUrl = getD1WorkerUrl()
  if (!workerUrl) throw new Error('D1 Worker 未配置')
  if (!userId) throw new Error('请先登录')
  const headers: Record<string, string> = { ...(await getAuthHeader()) }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  let response: Response
  try {
    response = await fetch(`${workerUrl}/snapshot?userId=${encodeURIComponent(userId)}`, {
      headers,
      signal: controller.signal,
    })
  } catch (error) {
    clearTimeout(timeout)
    throw new Error(error instanceof Error ? `D1 同步失败：${error.message}` : 'D1 同步失败')
  }
  clearTimeout(timeout)
  if (response.status === 404) return undefined
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`D1 下载失败 ${response.status}: ${text.slice(0, 300)}`)
  }
  const data = (await response.json()) as { data?: unknown; revision?: number }
  if (!data?.data) return undefined
  return validateCloudSnapshot(data.data, data.revision)
}
