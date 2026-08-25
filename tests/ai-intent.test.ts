import { describe, expect, it, vi } from 'vitest'
import { buildBlankState } from '../src/lib/seed'
import { AIIntentParser, isCreateTasksDraft, isTransientDraft, prepareStateFromAIDraft } from '../src/services/ai/intent-parser'
import type { AIProvider } from '../src/services/ai/provider'
import type { AIConfig } from '../src/services/ai/config'

function blankPortable() {
  const state = buildBlankState()
  return state
}

function mockProvider(response: string): AIProvider {
  return { chat: vi.fn(async () => response) }
}

const disabledConfig: AIConfig = { enabled: false, baseUrl: 'https://api.openai.com', apiKey: '', model: 'gpt-4o-mini' }
const enabledConfig: AIConfig = { enabled: true, baseUrl: 'https://api.openai.com', apiKey: 'sk-test', model: 'gpt-4o-mini' }

describe('AIIntentParser minimal vertical slice', () => {
  it('AI 未启用时回退到正则并生成 create_tasks 草稿', async () => {
    const provider = mockProvider('{}')
    const parser = new AIIntentParser(provider, disabledConfig)
    const draft = await parser.parseUserIntent('数学卷 5套每套60分钟 8月30日前完成', blankPortable())
    expect(draft.type).toBe('new-task-insertion')
    expect(isCreateTasksDraft(draft)).toBe(true)
    const tasks = (draft.metadata as Record<string, unknown>).aiTasks as Array<Record<string, unknown>>
    expect(tasks.length).toBeGreaterThan(0)
    expect(tasks[0].title).toBeTruthy()
  })

  it('AI 返回 create_tasks JSON → 正确校验并转换为 draft', async () => {
    const json = JSON.stringify({ intent: 'create_tasks', tasks: [{ title: '数学卷', quantity: 5, unitMinutes: 60, latestDate: '2026-08-29' }] })
    const provider = mockProvider(json)
    const parser = new AIIntentParser(provider, enabledConfig)
    const draft = await parser.parseUserIntent('数学卷 5套每套一小时周五前做完', blankPortable())
    expect(isCreateTasksDraft(draft)).toBe(true)
    expect(draft.affectedDates).toContain('2026-08-29')
  })

  it('AI 返回 transient → 标记 transient 且不落库', async () => {
    const json = JSON.stringify({ intent: 'transient', note: '识别到第5章掌握30%，当前系统暂不保存掌握度', recognizedAs: 'topic-mastery' })
    const provider = mockProvider(json)
    const parser = new AIIntentParser(provider, enabledConfig)
    const draft = await parser.parseUserIntent('第5章掌握30%', blankPortable())
    expect(isTransientDraft(draft)).toBe(true)
    expect(draft.description).toContain('掌握')
    expect((draft.metadata as Record<string, unknown>).transient).toBe(true)
  })

  it('AI 返回 availability_change → 可转为 preparedState 进入 Proposal', async () => {
    const json = JSON.stringify({ intent: 'availability_change', startDate: '2026-08-27', endDate: '2026-08-27', mode: 'unavailable', reason: '临时有事' })
    const provider = mockProvider(json)
    const parser = new AIIntentParser(provider, enabledConfig)
    const draft = await parser.parseUserIntent('明天没空', blankPortable())
    expect(draft.type).toBe('availability-change')
    const base = buildBlankState()
    const prepared = prepareStateFromAIDraft(base, draft)
    expect(prepared).toBeDefined()
    expect(prepared!.state.calendarConstraints.length).toBe(1)
    expect(prepared!.state.calendarConstraints[0].kind).toBe('unavailable')
  })

  it('AI 返回 goal_deadline → 可转为 preparedState 并更新目标期限', async () => {
    const base = buildBlankState()
    const goalId = 'goal-chem-001'
    base.goals.push({
      id: goalId,
      title: '化学目标',
      description: '',
      priority: 3,
      desiredDate: '2026-09-01',
      latestDate: '2026-09-10',
      status: 'active',
      completionConditions: [],
      linkedTaskGroupIds: [],
      linkedAssignmentIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as typeof base.goals[number])
    const portable = base as unknown as import('../src/types').AppStatePortable
    const json = JSON.stringify({ intent: 'goal_deadline', goalTitle: '化学', newLatestDate: '2026-09-04' })
    const provider = mockProvider(json)
    const parser = new AIIntentParser(provider, enabledConfig)
    const draft = await parser.parseUserIntent('把化学目标改到下周四', portable)
    expect(draft.type).toBe('goal-tightening')
    expect(draft.affectedGoalIds).toContain(goalId)
    const prepared = prepareStateFromAIDraft(base, draft)
    expect(prepared).toBeDefined()
    const updated = prepared!.state.goals.find(g => g.id === goalId)
    expect(updated?.latestDate).toBe('2026-09-04')
    expect(prepared!.event.type).toBe('goal-tightening')
  })

  it('AI 返回 priority_change → 可转为 preparedState 并更新任务组优先级', async () => {
    const base = buildBlankState()
    const groupId = 'group-chem-001'
    base.taskGroups.push({
      id: groupId,
      subject: '化学',
      title: '化学预习',
      priority: 3,
      quantity: 1,
      unitMinutes: 30,
      targetDate: base.settings.endDate,
      dueDate: base.settings.endDate,
      countInStats: true,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as typeof base.taskGroups[number])
    base.assignments.push({
      id: 'assign-001',
      groupId,
      index: 1,
      title: '化学预习',
      estimatedMinutes: 30,
      actualMinutes: 0,
      progress: 0,
      status: 'todo',
      locked: false,
      timeEntries: [],
      scheduleSource: 'system',
      intentStrength: 'normal',
    } as unknown as typeof base.assignments[number])
    const portable = base as unknown as import('../src/types').AppStatePortable
    const json = JSON.stringify({ intent: 'priority_change', taskTitles: ['化学预习'], newPriority: 5 })
    const provider = mockProvider(json)
    const parser = new AIIntentParser(provider, enabledConfig)
    const draft = await parser.parseUserIntent('化学预习这项优先一点', portable)
    expect(draft.type).toBe('rule-change')
    const prepared = prepareStateFromAIDraft(base, draft)
    expect(prepared).toBeDefined()
    const updated = prepared!.state.taskGroups.find(g => g.id === groupId)
    expect(updated?.priority).toBe(5)
    expect(prepared!.event.affectedGroupIds).toContain(groupId)
  })

  it('AI 返回 execution_difference → 可转为 preparedState 进入重排', async () => {
    const base = buildBlankState()
    // today is todayISO(), use it
    const today = new Date().toISOString().slice(0, 10)
    base.assignments.push({
      id: 'assign-today-001',
      groupId: 'group-001',
      index: 1,
      title: '今日任务',
      scheduledDate: today,
      estimatedMinutes: 30,
      actualMinutes: 0,
      progress: 0,
      status: 'todo',
      locked: false,
      timeEntries: [],
      scheduleSource: 'system',
      intentStrength: 'normal',
    } as unknown as typeof base.assignments[number])
    const portable = base as unknown as import('../src/types').AppStatePortable
    const json = JSON.stringify({ intent: 'execution_difference', date: today, description: '今天没完成帮我重排' })
    const provider = mockProvider(json)
    const parser = new AIIntentParser(provider, enabledConfig)
    const draft = await parser.parseUserIntent('今天没完成帮我重排', portable)
    expect(draft.type).toBe('execution-difference')
    expect(draft.affectedDates).toContain(today)
    const prepared = prepareStateFromAIDraft(base, draft)
    expect(prepared).toBeDefined()
    expect(prepared!.event.type).toBe('execution-difference')
    expect(prepared!.state.changeEvents.length).toBeGreaterThan(0)
  })

  it('AI 输出校验失败时回退到正则', async () => {
    const json = JSON.stringify({ intent: 'create_tasks', tasks: [] }) // min 1 fails
    const provider = mockProvider(json)
    const parser = new AIIntentParser(provider, enabledConfig)
    const draft = await parser.parseUserIntent('数学卷 2套每套30分钟', blankPortable())
    // fallback regex should still produce draft
    expect(draft.type).toBe('new-task-insertion')
    expect(isCreateTasksDraft(draft)).toBe(true)
  })

  it('AI disabled 时对 Topic/Mastery 仍可通过正则产生任务（不误判为 transient）', async () => {
    const provider = mockProvider(JSON.stringify({ intent: 'transient', note: 'x' }))
    const parser = new AIIntentParser(provider, disabledConfig)
    const draft = await parser.parseUserIntent('第5章掌握30% 需要学习化学 2套', blankPortable())
    // regex will extract "需要学习化学 2套" as task, transient only when AI enabled
    expect(draft.type).toBe('new-task-insertion')
  })
})
