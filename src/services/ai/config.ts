const STORAGE_KEY = 'study-planner:ai-config'

export interface AIConfig {
  enabled: boolean
  baseUrl: string
  apiKey: string
  model: string
}

export const AI_CONFIG_SECURITY_NOTE =
  'Key 存储在浏览器本机 localStorage，不代表加密安全存储；同源脚本与 DevTools 可访问。服务端 Key 必须走 Cloudflare Worker Secret，不应填入此处。'

const DEFAULT: AIConfig = {
  enabled: false,
  baseUrl: 'https://api.openai.com',
  apiKey: '',
  model: 'gpt-4o-mini',
}

export function loadAIConfig(): AIConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT }
    const parsed = JSON.parse(raw) as Partial<AIConfig>
    return {
      enabled: Boolean(parsed.enabled),
      baseUrl: typeof parsed.baseUrl === 'string' && parsed.baseUrl.trim() ? parsed.baseUrl.trim() : DEFAULT.baseUrl,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : '',
      model: typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim() : DEFAULT.model,
    }
  } catch {
    return { ...DEFAULT }
  }
}

export function saveAIConfig(config: AIConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // quota or privacy mode: silently ignore, UI still holds in-memory value
  }
}

export function isAIConfigured(config: AIConfig): boolean {
  return Boolean(config.enabled && config.apiKey.trim() && config.baseUrl.trim() && config.model.trim())
}
