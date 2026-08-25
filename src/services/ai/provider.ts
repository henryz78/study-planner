export type AIChatRole = 'system' | 'user' | 'assistant'

export interface AIChatMessage {
  role: AIChatRole
  content: string
}

export interface AIProvider {
  chat(messages: AIChatMessage[], opts?: { model?: string; temperature?: number }): Promise<string>
}

export interface OpenAICompatibleConfig {
  baseUrl: string
  apiKey: string
  model: string
}

export class OpenAICompatibleProvider implements AIProvider {
  constructor(private readonly config: OpenAICompatibleConfig) {}

  async chat(messages: AIChatMessage[], opts?: { model?: string; temperature?: number }): Promise<string> {
    const base = this.config.baseUrl.replace(/\/+$/, '').replace(/\/v1\/chat\/completions$/, '').replace(/\/v1$/, '')
    const url = `${base}/v1/chat/completions`
    const model = opts?.model ?? this.config.model
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts?.temperature ?? 0.2,
      }),
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`AI 请求失败 ${response.status}: ${text.slice(0, 300)}`)
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string }; delta?: { content?: string } }>
      error?: { message?: string }
    }
    if (data.error?.message) throw new Error(data.error.message)
    const content = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.delta?.content
    if (!content) throw new Error('AI 返回空内容')
    return content
  }
}
