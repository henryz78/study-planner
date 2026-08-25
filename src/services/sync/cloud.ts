/**
 * Cloud abstraction – keeps Supabase support, adds D1 as opt-in.
 * Local-first: if cloud provider is not configured or fails, callers receive error
 * but local IndexedDB usage remains unaffected.
 *
 * App.tsx can import from here instead of directly from supabase for snapshot sync,
 * while auth (getSession/signIn/signUp/signOut) stays Supabase-only.
 */

import {
  supabase,
  supabaseConfigured,
  getSession as getSupabaseSession,
  signIn as supabaseSignIn,
  signUp as supabaseSignUp,
  signOut as supabaseSignOut,
  uploadSnapshot as uploadSupabase,
  downloadSnapshot as downloadSupabase,
  CloudRevisionConflictError,
  isMissingCloudRevisionColumn,
  preparePortableState,
  type CloudSnapshot,
} from '../../lib/supabase'
import {
  loadSyncConfig,
  getEffectiveProvider,
  d1EnvConfigured,
  getOrCreateD1UserId,
} from './config'
import {
  uploadSnapshotD1,
  downloadSnapshotD1,
  CloudRevisionConflictError as D1ConflictError,
} from './d1'

// Re-export shared types & helpers
export { CloudRevisionConflictError, isMissingCloudRevisionColumn, preparePortableState }
export type { CloudSnapshot }
export { supabase, supabaseConfigured }

export const cloudConfigured = supabaseConfigured || d1EnvConfigured

export function getEffectiveSyncProvider(): 'supabase' | 'd1' | 'local' {
  const config = loadSyncConfig()
  return getEffectiveProvider(config, supabaseConfigured)
}

// Auth stays Supabase-only for Supabase provider; D1 can work independently via local sync key
export const getSession = getSupabaseSession
export const signIn = supabaseSignIn
export const signUp = supabaseSignUp
export const signOut = supabaseSignOut

export async function getSyncUserIdForProvider(provider: 'supabase' | 'd1' | 'local', explicitUserId?: string): Promise<string | undefined> {
  if (explicitUserId) return explicitUserId
  if (provider === 'd1') {
    // Try Supabase session first (if user is logged in, reuse its id for continuity), otherwise use local D1 key
    try {
      const session = await getSupabaseSession()
      if (session?.user.id) return session.user.id
    } catch {
      // ignore
    }
    return getOrCreateD1UserId()
  }
  if (provider === 'supabase') {
    const session = await getSupabaseSession()
    if (!session) throw new Error('请先登录')
    return session.user.id
  }
  return undefined
}

// Snapshot sync – delegates based on effective provider, with local-first error handling
export async function uploadSnapshot(state: import('../../types').AppState, userId?: string, expectedRevision?: number) {
  const provider = getEffectiveSyncProvider()
  if (provider === 'd1') {
    const resolvedId = userId ?? (await getSyncUserIdForProvider('d1', userId))
    if (!resolvedId) throw new Error('无法确定同步身份')
    try {
      return await uploadSnapshotD1(state, resolvedId, expectedRevision)
    } catch (error) {
      if (error instanceof D1ConflictError) throw new CloudRevisionConflictError(error.expectedRevision)
      throw error
    }
  }
  if (provider === 'supabase') {
    return uploadSupabase(state, userId, expectedRevision)
  }
  throw new Error('云同步未配置（Supabase 与 D1 均未配置）')
}

export async function downloadSnapshot(userId?: string): Promise<CloudSnapshot | undefined> {
  const provider = getEffectiveSyncProvider()
  if (provider === 'd1') {
    const resolvedId = userId ?? (await getSyncUserIdForProvider('d1', userId))
    if (!resolvedId) return undefined
    try {
      return await downloadSnapshotD1(resolvedId)
    } catch (error) {
      if (error instanceof D1ConflictError) throw new CloudRevisionConflictError(error.expectedRevision)
      throw error
    }
  }
  if (provider === 'supabase') {
    return downloadSupabase(userId)
  }
  return undefined
}

async function resolveUserId(userId?: string): Promise<string> {
  if (userId) return userId
  const session = await getSupabaseSession()
  if (!session) throw new Error('请先登录')
  return session.user.id
}
