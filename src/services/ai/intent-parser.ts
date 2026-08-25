import { z } from 'zod'
import type { AppStatePortable, PlanChangeEvent, Priority } from '../../types'
import type { PlanChangeEventDraft, PlanIntentParser } from '../../lib/intent'
import { parsePastedText } from '../../lib/intake'
import { todayISO } from '../../lib/date'
import { cloneActiveState } from '../../lib/state'
import { uid } from '../../lib/id'
import type { AIProvider } from './provider'
import type { AIConfig } from './config'
import { isAIConfigured } from './config'

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/

const aiTaskSchema = z.object({
  title: z.string().trim().min(1),
  subject: z.string().trim().min(1).optional(),
  quantity: z.number().int().min(1).max(100).optional(),
  unitMinutes: z.number().int().min(5).max(1440).optional(),
  latestDate: z.string().regex(isoDateRegex).optional(),
  desiredDate: z.string().regex(isoDateRegex).optional(),
  preferredDate: z.string().regex(isoDateRegex).optional(),
  fixedDate: z.string().regex(isoDateRegex).optional(),
  priority: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(5)]).optional(),
  notes: z.string().optional(),
})

const createTasksSchema = z.object({
  intent: z.literal('create_tasks'),
  tasks: z.array(aiTaskSchema).min(1).max(10),
  transientNote: z.string().optional(),
})

const availabilitySchema = z.object({
  intent: z.literal('availability_change'),
  startDate: z.string().regex(isoDateRegex),
  endDate: z.string().regex(isoDateRegex),
  mode: z.enum(['unavailable', 'reduced']),
  availableMinutes: z.number().int().min(0).max(1440).optional(),
  reason: z.string().optional(),
})

const goalDeadlineSchema = z.object({
  intent: z.literal('goal_deadline'),
  goalId: z.string().optional(),
  goalTitle: z.string().optional(),
  newLatestDate: z.string().regex(isoDateRegex),
  newDesiredDate: z.string().regex(isoDateRegex).optional(),
})

const prioritySchema = z.object({
  intent: z.literal('priority_change'),
  taskTitles: z.array(z.string().trim().min(1)).min(1).max(10),
  newPriority: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(5)]),
})

const executionSchema = z.object({
  intent: z.literal('execution_difference'),
  date: z.string().regex(isoDateRegex).optional(),
  description: z.string().optional(),
})

const transientSchema = z.object({
  intent: z.literal('transient'),
  note: z.string().min(1),
  recognizedAs: z.string().optional(),
})

const aiOutputSchema = z.discriminatedUnion('intent', [
  createTasksSchema,
  availabilitySchema,
  goalDeadlineSchema,
  prioritySchema,
  executionSchema,
  transientSchema,
])

export type AIOutput = z.infer<typeof aiOutputSchema>

function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) return fence[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) return text.slice(start, end + 1)
  return text.trim()
}

function buildSystemPrompt(today: string, context: AppStatePortable): string {
  const goals = context.goals.slice(0, 10).map(g => `${g.title} (id:${g.id.slice(0, 6)} latest:${g.latestDate})`).join('; ') || '无'
  const assignmentTitles = context.assignments.slice(0, 20).map(a => a.title).join('; ') || '无'
  return [
    `你是 Study Planner 的意图解析器。今天是 ${today}，计划范围 ${context.settings.startDate} 至 ${context.settings.endDate}。`,
    '只输出一个 JSON 对象，不要输出其他文字。',
    'intent 必须是以下之一：',
    '- create_tasks: 用户想新建任务/任务组。tasks 至少 1 项，每项含 title 必填，quantity 默认1，unitMinutes 默认30，priority 0|1|2|3|5，subject 可选，latestDate/desiredDate 等为 YYYY-MM-DD。',
    '- availability_change: 用户说某天没空/只能学一会儿。startDate/endDate 为 YYYY-MM-DD，mode 为 unavailable(完全没空) 或 reduced(降低容量)，reduced 时需 availableMinutes。',
    '- goal_deadline: 修改目标期限。提供 goalTitle 或 goalId 与 newLatestDate 必填。',
    '- priority_change: 修改任务优先级。taskTitles 为任务标题关键词，newPriority 为 0/1/2/3/5。',
    '- execution_difference: 今天没完成/需要重排。date 可选，默认今天。',
    '- transient: 识别到 Topic/Mastery 如“第5章掌握30%”等当前模型未支持的内容，仅做识别，不持久化。',
    '日期必须基于今天换算为绝对 YYYY-MM-DD，不要输出“下周五”等相对表达。',
    `当前目标：${goals}`,
    `当前任务标题示例：${assignmentTitles}`,
    '若无法确定，优先选 create_tasks；若包含掌握度/章节等未支持模型，输出 transient。',
    '示例：',
    '{"intent":"create_tasks","tasks":[{"title":"数学卷","quantity":5,"unitMinutes":60,"latestDate":"2026-08-29"}]}',
    '{"intent":"availability_change","startDate":"2026-08-27","endDate":"2026-08-27","mode":"unavailable","reason":"临时有事"}',
    '{"intent":"goal_deadline","goalTitle":"化学","newLatestDate":"2026-09-04"}',
    '{"intent":"priority_change","taskTitles":["化学预习"],"newPriority":5}',
    '{"intent":"execution_difference","date":"2026-08-26"}',
    '{"intent":"transient","note":"识别到第5章掌握30%，当前系统暂不保存掌握度","recognizedAs":"topic-mastery"}',
  ].join('\n')
}

function toPriority(value: unknown, fallback: Priority = 3): Priority {
  const allowed: Priority[] = [0, 1, 2, 3, 5]
  const num = typeof value === 'number' ? value : Number(value)
  return (allowed as number[]).includes(num) ? (num as Priority) : fallback
}

function fallbackDraftFromRegex(input: string): PlanChangeEventDraft | undefined {
  const result = parsePastedText(input)
  if (!result.drafts.length) return undefined
  const drafts = result.drafts
  const affectedDates = Array.from(new Set(drafts.flatMap(d => [d.latestDate, d.desiredDate, d.fixedDate, d.preferredDate].filter(Boolean) as string[]))).sort()
  return {
    type: 'new-task-insertion',
    action: 'insert',
    title: drafts.length === 1 ? `创建任务组：${drafts[0].title}` : `创建 ${drafts.length} 个任务组`,
    description: `正则解析得到 ${drafts.length} 项任务组草稿，将进入录入批次待排期。`,
    affectedGoalIds: [],
    affectedGroupIds: [],
    affectedAssignmentIds: [],
    affectedDates,
    metadata: { aiTasks: drafts, source: 'regex-fallback', intent: 'create_tasks' },
  }
}

function convertOutput(output: AIOutput, context: AppStatePortable, input: string): PlanChangeEventDraft {
  switch (output.intent) {
    case 'create_tasks': {
      const drafts = output.tasks.map(t => ({
        title: t.title,
        subject: t.subject ?? '其他',
        quantity: t.quantity ?? 1,
        unitMinutes: t.unitMinutes ?? 30,
        priority: toPriority(t.priority),
        latestDate: t.latestDate,
        desiredDate: t.desiredDate,
        preferredDate: t.preferredDate,
        fixedDate: t.fixedDate,
        notes: t.notes,
        activityType: 'normal' as const,
        highIntensity: false,
        countInStats: true,
        goalIds: [] as string[],
        recurring: false,
        allowSplit: false,
        prerequisiteGroupIds: [] as string[],
      }))
      const affectedDates = Array.from(new Set(drafts.flatMap(d => [d.latestDate, d.desiredDate].filter(Boolean) as string[]))).sort()
      const transientNote = output.transientNote
      return {
        type: 'new-task-insertion',
        action: 'insert',
        title: drafts.length === 1 ? `创建任务组：${drafts[0].title}` : `创建 ${drafts.length} 个任务组`,
        description: transientNote ? `${transientNote}` : `AI 解析得到 ${drafts.length} 项任务组，将进入录入批次待排期。`,
        affectedGoalIds: [],
        affectedGroupIds: [],
        affectedAssignmentIds: [],
        affectedDates,
        metadata: { aiTasks: drafts, source: 'ai', intent: output.intent, transientNote, originalInput: input },
      }
    }
    case 'availability_change': {
      const dates = output.startDate === output.endDate ? [output.startDate] : [output.startDate, output.endDate]
      const isUnavailable = output.mode === 'unavailable'
      return {
        type: 'availability-change',
        action: 'repair',
        title: isUnavailable ? `调整日期可用时间：${output.startDate} 至 ${output.endDate} 不可用` : `调整日期可用时间：${output.startDate} 至 ${output.endDate}`,
        description: isUnavailable
          ? `${output.startDate} 至 ${output.endDate} 完全不安排学习任务（${output.reason ?? 'AI 识别'}）。`
          : `${output.startDate} 至 ${output.endDate} 每天可用 ${output.availableMinutes ?? 60} 分钟（${output.reason ?? 'AI 识别'}）。`,
        affectedGoalIds: [],
        affectedGroupIds: [],
        affectedAssignmentIds: [],
        affectedDates: dates,
        metadata: {
          aiAvailability: output,
          source: 'ai',
          availabilityMode: output.mode,
          capacityMinutes: isUnavailable ? 0 : (output.availableMinutes ?? 60),
          reason: output.reason,
          originalInput: input,
        },
      }
    }
    case 'goal_deadline': {
      const goal = output.goalId
        ? context.goals.find(g => g.id === output.goalId)
        : output.goalTitle
          ? context.goals.find(g => g.title.includes(output.goalTitle!))
          : undefined
      return {
        type: 'goal-tightening',
        action: 'repair',
        title: goal ? `修改目标期限：${goal.title}` : `修改目标期限：${output.goalTitle ?? output.goalId ?? '未知目标'}`,
        description: goal
          ? `将“${goal.title}”的最晚日期调整为 ${output.newLatestDate}${output.newDesiredDate ? `（期望 ${output.newDesiredDate}）` : ''}。`
          : `未找到匹配目标“${output.goalTitle ?? output.goalId}”，将尝试按标题创建或请在目标页手动选择。`,
        affectedGoalIds: goal ? [goal.id] : [],
        affectedGroupIds: [],
        affectedAssignmentIds: [],
        affectedDates: [output.newLatestDate],
        metadata: {
          aiGoalDeadline: output,
          source: 'ai',
          goalId: goal?.id,
          goalTitle: output.goalTitle,
          newLatestDate: output.newLatestDate,
          newDesiredDate: output.newDesiredDate,
          originalInput: input,
        },
      }
    }
    case 'priority_change': {
      const matchedIds = output.taskTitles.flatMap(title =>
        context.assignments.filter(a => a.title.includes(title)).map(a => a.id)
      )
      const groupIds = Array.from(new Set(
        output.taskTitles.flatMap(title =>
          context.taskGroups.filter(g => g.title.includes(title)).map(g => g.id)
        )
      ))
      return {
        type: 'rule-change',
        action: 'repair',
        title: `调整优先级：${output.taskTitles.join('、')}`,
        description: `将相关任务优先级调整为 ${output.newPriority}。`,
        affectedGoalIds: [],
        affectedGroupIds: groupIds,
        affectedAssignmentIds: matchedIds,
        affectedDates: [],
        metadata: {
          aiPriority: output,
          source: 'ai',
          newPriority: output.newPriority,
          taskTitles: output.taskTitles,
          originalInput: input,
        },
      }
    }
    case 'execution_difference': {
      const date = output.date ?? todayISO()
      return {
        type: 'execution-difference',
        action: 'repair',
        title: '修复执行差异并重排',
        description: output.description ?? `处理 ${date} 的执行差异，重新安排未完成任务。`,
        affectedGoalIds: [],
        affectedGroupIds: [],
        affectedAssignmentIds: context.assignments.filter(a => a.scheduledDate === date && a.status !== 'done').map(a => a.id),
        affectedDates: [date],
        metadata: { aiExecution: output, source: 'ai', originalInput: input },
      }
    }
    case 'transient': {
      return {
        type: 'rule-change',
        action: 'repair',
        title: '已识别但暂不保存',
        description: output.note,
        affectedGoalIds: [],
        affectedGroupIds: [],
        affectedAssignmentIds: [],
        affectedDates: [],
        metadata: { transient: true, recognizedAs: output.recognizedAs, note: output.note, source: 'ai', originalInput: input },
      }
    }
    default:
      return {
        type: 'rule-change',
        action: 'repair',
        title: '未识别的意图',
        description: 'AI 未能识别为可执行意图，已回退到正则解析。',
        affectedGoalIds: [],
        affectedGroupIds: [],
        affectedAssignmentIds: [],
        affectedDates: [],
        metadata: { source: 'ai-fallback', originalInput: input },
      }
  }
}

export class AIIntentParser implements PlanIntentParser {
  constructor(
    private readonly provider: AIProvider,
    private readonly config: AIConfig,
  ) {}

  async parseUserIntent(input: string, context: AppStatePortable): Promise<PlanChangeEventDraft> {
    const trimmed = input.trim()
    if (!trimmed) throw new Error('输入为空')
    if (!isAIConfigured(this.config)) {
      const fallback = fallbackDraftFromRegex(trimmed)
      if (fallback) return fallback
      throw new Error('AI 未启用，已回退正则但未识别到任务')
    }
    try {
      const today = todayISO()
      const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: buildSystemPrompt(today, context) },
        { role: 'user', content: trimmed },
      ]
      const raw = await this.provider.chat(messages, { model: this.config.model })
      const jsonStr = extractJson(raw)
      const parsed = JSON.parse(jsonStr) as unknown
      const validated = aiOutputSchema.safeParse(parsed)
      if (!validated.success) {
        const issues = validated.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
        throw new Error(`AI 输出校验失败: ${issues}`)
      }
      return convertOutput(validated.data, context, trimmed)
    } catch (error) {
      const fallback = fallbackDraftFromRegex(trimmed)
      if (fallback) return fallback
      if (error instanceof Error) throw error
      throw new Error('AI 解析失败且正则回退未命中')
    }
  }
}

export function createAIIntentParser(provider: AIProvider, config: AIConfig): PlanIntentParser {
  return new AIIntentParser(provider, config)
}

export function isTransientDraft(draft: PlanChangeEventDraft): boolean {
  return Boolean((draft.metadata as Record<string, unknown> | undefined)?.transient)
}

export function isCreateTasksDraft(draft: PlanChangeEventDraft): boolean {
  const meta = draft.metadata as Record<string, unknown> | undefined
  return Boolean(meta?.aiTasks && Array.isArray(meta.aiTasks))
}

/**
 * 将非录入类 AI draft 转为可直接进入 Proposal 的 preparedState。
 * create_tasks 由调用方走 intake 流程，此处返回 undefined。
 * 其他类型在此构造 calendarConstraints / goal 更新等最小草稿。
 */
export function prepareStateFromAIDraft(
  base: import('../../types').AppState,
  draft: PlanChangeEventDraft,
): { state: import('../../types').AppState; event: PlanChangeEvent } | undefined {
  const meta = draft.metadata as Record<string, unknown> | undefined
  if (!meta || isCreateTasksDraft(draft) || isTransientDraft(draft)) return undefined
  const now = new Date().toISOString()
  const next = cloneActiveState(base)
  let event: PlanChangeEvent

  if (draft.type === 'availability-change' && meta.aiAvailability) {
    const avail = meta.aiAvailability as { startDate: string; endDate: string; mode: string; availableMinutes?: number; reason?: string }
    next.calendarConstraints.push({
      id: uid('constraint'),
      startDate: avail.startDate,
      endDate: avail.endDate,
      kind: avail.mode === 'unavailable' ? 'unavailable' : 'reduced-capacity',
      capacityMinutes: avail.mode === 'unavailable' ? 0 : Math.max(0, Math.min(1440, (avail.availableMinutes as number) ?? 60)),
      protected: true,
      reason: (avail.reason as string | undefined)?.trim() || 'AI 识别：调整日期可用时间',
      createdAt: now,
      updatedAt: now,
    })
    event = {
      id: uid('event'),
      type: draft.type,
      action: draft.action,
      title: draft.title,
      description: draft.description,
      affectedGoalIds: draft.affectedGoalIds ?? [],
      affectedGroupIds: draft.affectedGroupIds ?? [],
      affectedAssignmentIds: draft.affectedAssignmentIds ?? [],
      affectedDates: draft.affectedDates ?? [],
      createdAt: now,
      metadata: { ...(draft.metadata ?? {}), originalInput: meta.originalInput },
    }
    next.changeEvents = [...next.changeEvents, event].slice(-100)
    next.updatedAt = now
    return { state: next, event }
  }

  if (draft.type === 'goal-tightening' && meta.aiGoalDeadline) {
    const info = meta.aiGoalDeadline as { goalTitle?: string; newLatestDate: string; newDesiredDate?: string; goalId?: string }
    const goal = info.goalId ? next.goals.find(g => g.id === info.goalId) : next.goals.find(g => g.title.includes(info.goalTitle ?? ''))
    if (!goal) return undefined
    goal.latestDate = info.newLatestDate
    if (info.newDesiredDate) goal.desiredDate = info.newDesiredDate
    goal.updatedAt = now
    event = {
      id: uid('event'),
      type: draft.type,
      action: draft.action,
      title: draft.title,
      description: draft.description,
      affectedGoalIds: [goal.id],
      affectedGroupIds: draft.affectedGroupIds ?? [],
      affectedAssignmentIds: draft.affectedAssignmentIds ?? [],
      affectedDates: [info.newLatestDate],
      createdAt: now,
      metadata: { ...(draft.metadata ?? {}) },
    }
    next.changeEvents = [...next.changeEvents, event].slice(-100)
    next.updatedAt = now
    return { state: next, event }
  }

  if (draft.type === 'rule-change' && meta.aiPriority) {
    const info = meta.aiPriority as { taskTitles: string[]; newPriority: number }
    let affectedGroupIds: string[] = []
    for (const title of info.taskTitles) {
      for (const group of next.taskGroups) {
        if (group.title.includes(title) || title.includes(group.title)) {
          group.priority = info.newPriority as import('../../types').Priority
          group.updatedAt = now
          affectedGroupIds.push(group.id)
        }
      }
    }
    if (!affectedGroupIds.length) return undefined
    affectedGroupIds = Array.from(new Set(affectedGroupIds))
    const affectedAssignmentIds = next.assignments.filter(a => affectedGroupIds.includes(a.groupId)).map(a => a.id)
    event = {
      id: uid('event'),
      type: draft.type,
      action: draft.action,
      title: draft.title,
      description: draft.description,
      affectedGoalIds: [],
      affectedGroupIds,
      affectedAssignmentIds,
      affectedDates: [],
      createdAt: now,
      metadata: { ...(draft.metadata ?? {}) },
    }
    next.changeEvents = [...next.changeEvents, event].slice(-100)
    next.updatedAt = now
    return { state: next, event }
  }

  if (draft.type === 'execution-difference') {
    event = {
      id: uid('event'),
      type: draft.type,
      action: draft.action,
      title: draft.title,
      description: draft.description,
      affectedGoalIds: draft.affectedGoalIds ?? [],
      affectedGroupIds: draft.affectedGroupIds ?? [],
      affectedAssignmentIds: draft.affectedAssignmentIds ?? [],
      affectedDates: draft.affectedDates ?? [],
      createdAt: now,
      metadata: { ...(draft.metadata ?? {}) },
    }
    next.changeEvents = [...next.changeEvents, event].slice(-100)
    next.updatedAt = now
    return { state: next, event }
  }

  return undefined
}
