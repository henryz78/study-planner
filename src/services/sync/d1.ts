import type { AppState } from '../../types'
import { validateStateInput } from '../../lib/state-schema'
import { preparePortableState } from '../../lib/supabase'
import { getD1ApiToken, getD1WorkerUrl, isD1EnvConfigured } from './config'

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
  try {
    const token = getD1ApiToken()
    if (token) return { Authorization: `Bearer ${token}` }
    return {}
  } catch {
    return {}
  }
}

export async function uploadSnapshotD1(state: AppState, userId: string, expectedRevision?: number): Promise<{ savedAt: string; revision: number }> {
  const workerUrl = getD1WorkerUrl()
  if (workerUrl === undefined) throw new Error('D1 Worker 未配置 (VITE_D1_WORKER_URL 或 Pages 同源 /api/d1)')

  const base = workerUrl // '' 表示同源相对路径
  const endpoint = base ? `${base}/api/d1/snapshot` : '/api/d1/snapshot'
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
    response = await fetch(endpoint, {
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
  if (workerUrl === undefined) throw new Error('D1 Worker 未配置')
  const endpoint = workerUrl ? `${workerUrl}/api/d1/snapshot` : '/api/d1/snapshot'
  if (!userId) throw new Error('请先登录')
  const headers: Record<string, string> = { ...(await getAuthHeader()) }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  let response: Response
  try {
    response = await fetch(`${endpoint}?userId=${encodeURIComponent(userId)}`, {
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
