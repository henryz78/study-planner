import { describe, expect, it } from 'vitest'
import { buildBlankState } from '../src/lib/seed'
import { computePlanningHealth } from '../src/lib/planning-health'
import { todayISO, shiftDate } from '../src/lib/date'

describe('Planning Health', () => {
  it('空计划显示来得及且无风险', () => {
    const state = buildBlankState()
    const health = computePlanningHealth(state, todayISO())
    expect(health.status).toBe('comfortable')
    expect(health.risks.length).toBe(0)
    expect(health.nextAction.kind).toBe('keep')
    expect(health.gapMinutes).toBeGreaterThan(0)
  })

  it('大量未完成任务导致超载', () => {
    const state = buildBlankState()
    // add 20 tasks each 120min => 2400min, horizon 14 days with default ~210min*14=2940, but with low capacity should overload
    // force low capacity: set regularMinutes to 60
    state.settings.regularMinutes = 60
    state.settings.studyMinutes = 60
    for (let i = 0; i < 20; i += 1) {
      state.assignments.push({
        id: `a-${i}`,
        groupId: 'g-1',
        index: i + 1,
        title: `任务${i}`,
        estimatedMinutes: 120,
        actualMinutes: 0,
        progress: 0,
        status: 'todo',
        locked: false,
        timeEntries: [],
        scheduleSource: 'system',
        intentStrength: 'normal',
      } as unknown as typeof state.assignments[number])
    }
    state.taskGroups.push({
      id: 'g-1',
      subject: '其他',
      title: '测试组',
      priority: 3,
      quantity: 20,
      unitMinutes: 120,
      targetDate: state.settings.endDate,
      dueDate: state.settings.endDate,
      countInStats: true,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as typeof state.taskGroups[number])
    const health = computePlanningHealth(state, todayISO(), 14)
    expect(health.status).toBe('overloaded')
    expect(health.gapMinutes).toBeLessThan(0)
    expect(health.nextAction.kind).toBe('reduce-load')
  })

  it('已逾期目标产生风险 reason', () => {
    const state = buildBlankState()
    const today = todayISO()
    const overdueDate = shiftDate(today, -1)
    state.goals.push({
      id: 'goal-1',
      title: 'Calculus',
      priority: 5,
      latestDate: overdueDate,
      status: 'active',
      completionConditions: [{ id: 'c1', groupId: 'g-1', mode: 'all' }],
      linkedTaskGroupIds: [],
      linkedAssignmentIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as typeof state.goals[number])
    state.taskGroups.push({
      id: 'g-1',
      subject: '数学',
      title: 'Calculus 组',
      priority: 5,
      quantity: 1,
      unitMinutes: 60,
      targetDate: overdueDate,
      dueDate: overdueDate,
      countInStats: true,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as typeof state.taskGroups[number])
    state.assignments.push({
      id: 'a-1',
      groupId: 'g-1',
      index: 1,
      title: 'Calculus 任务',
      estimatedMinutes: 60,
      actualMinutes: 0,
      progress: 0,
      status: 'todo',
      locked: false,
      timeEntries: [],
      scheduleSource: 'system',
      intentStrength: 'normal',
    } as unknown as typeof state.assignments[number])
    const health = computePlanningHealth(state, today, 14)
    expect(health.risks.length).toBeGreaterThan(0)
    expect(health.risks[0].reason).toContain('Calculus')
    expect(health.risks[0].gapMinutes).toBeLessThan(0)
  })

  it('下一步 action 在有风险时指向最紧急目标', () => {
    const state = buildBlankState()
    const today = todayISO()
    const soon = shiftDate(today, 2)
    state.goals.push({
      id: 'goal-1',
      title: 'Chemistry',
      priority: 3,
      latestDate: soon,
      status: 'active',
      completionConditions: [{ id: 'c1', groupId: 'g-1', mode: 'all' }],
      linkedTaskGroupIds: [],
      linkedAssignmentIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as typeof state.goals[number])
    state.taskGroups.push({
      id: 'g-1',
      subject: '化学',
      title: 'Chemistry 组',
      priority: 3,
      quantity: 5,
      unitMinutes: 120,
      targetDate: soon,
      dueDate: soon,
      countInStats: true,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as typeof state.taskGroups[number])
    for (let i = 0; i < 5; i += 1) {
      state.assignments.push({
        id: `a-${i}`,
        groupId: 'g-1',
        index: i + 1,
        title: `Chemistry ${i}`,
        estimatedMinutes: 120,
        actualMinutes: 0,
        progress: 0,
        status: 'todo',
        locked: false,
        timeEntries: [],
        scheduleSource: 'system',
        intentStrength: 'normal',
      } as unknown as typeof state.assignments[number])
    }
    // reduce capacity to make it tight
    state.settings.regularMinutes = 60
    state.settings.studyMinutes = 60
    const health = computePlanningHealth(state, today, 14)
    expect(health.nextAction.label).toContain('Chemistry')
  })

  it('deadline 为 today 与 horizonEnd 的边界正确处理', () => {
    const today = todayISO()
    const horizonEnd = shiftDate(today, 13)
    for (const latestDate of [today, horizonEnd]) {
      const state = buildBlankState()
      state.goals.push({
        id: `goal-${latestDate}`,
        title: `Goal-${latestDate}`,
        priority: 3,
        latestDate,
        status: 'active',
        completionConditions: [{ id: 'c1', groupId: 'g-1', mode: 'all' }],
        linkedTaskGroupIds: [],
        linkedAssignmentIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as unknown as typeof state.goals[number])
      state.taskGroups.push({
        id: 'g-1',
        subject: '其他',
        title: '组',
        priority: 3,
        quantity: 1,
        unitMinutes: 60,
        targetDate: latestDate,
        dueDate: latestDate,
        countInStats: true,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as unknown as typeof state.taskGroups[number])
      state.assignments.push({
        id: `a-${latestDate}`,
        groupId: 'g-1',
        index: 1,
        title: '任务',
        estimatedMinutes: 60,
        actualMinutes: 0,
        progress: 0,
        status: 'todo',
        locked: false,
        timeEntries: [],
        scheduleSource: 'system',
        intentStrength: 'normal',
      } as unknown as typeof state.assignments[number])
      const health = computePlanningHealth(state, today, 14)
      const risk = health.risks.find(r => r.goalId === `goal-${latestDate}`)
      // deadline on boundary should be considered within horizon and produce a reason
      expect(risk).toBeDefined()
      expect(risk!.daysUntil).toBeGreaterThanOrEqual(1)
    }
  })

  it('deadline 超出 horizon 的远期任务不计入 14 天 banner 缺口（避免与 per-goal 矛盾）', () => {
    const today = todayISO()
    const farDeadline = shiftDate(today, 30)
    const state = buildBlankState()
    // keep default capacity (~210) so far goal has enough capacity (30d*210=6300 > 3600) and horizon banner stays comfortable
    // horizon 14 天容量约 840，远期任务 30*120=3600，若计入全量会超载，但语义修复后应不计入
    state.goals.push({
      id: 'goal-far',
      title: 'FarGoal',
      priority: 3,
      latestDate: farDeadline,
      status: 'active',
      completionConditions: [{ id: 'c1', groupId: 'g-far', mode: 'all' }],
      linkedTaskGroupIds: [],
      linkedAssignmentIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as typeof state.goals[number])
    state.taskGroups.push({
      id: 'g-far',
      subject: '其他',
      title: 'Far 组',
      priority: 3,
      quantity: 30,
      unitMinutes: 120,
      targetDate: farDeadline,
      dueDate: farDeadline,
      countInStats: true,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as typeof state.taskGroups[number])
    for (let i = 0; i < 30; i += 1) {
      state.assignments.push({
        id: `far-${i}`,
        groupId: 'g-far',
        index: i + 1,
        title: `Far ${i}`,
        estimatedMinutes: 120,
        actualMinutes: 0,
        progress: 0,
        status: 'todo',
        locked: false,
        timeEntries: [],
        scheduleSource: 'system',
        intentStrength: 'normal',
      } as unknown as typeof state.assignments[number])
    }
    const health = computePlanningHealth(state, today, 14)
    // banner 应基于 horizon 内相关剩余，不应因远期任务而超载
    expect(health.status).not.toBe('overloaded')
    expect(health.gapMinutes).toBeGreaterThan(0)
    // per-goal 风险应显示余量而非缺口（容量 30 天 >> 剩余）
    // 由于远期，gap 为正，可能不被列为风险（needAttention 为 false），这与 banner 一致无矛盾
    const farRisk = health.risks.find(r => r.goalId === 'goal-far')
    if (farRisk) {
      expect(farRisk.gapMinutes).toBeGreaterThan(0)
    }
  })

  it('零容量时正确判为超载', () => {
    const state = buildBlankState()
    const today = todayISO()
    state.settings.regularMinutes = 0
    state.settings.studyMinutes = 0
    state.settings.travelMinutes = 0
    state.assignments.push({
      id: 'a-zero',
      groupId: 'g-zero',
      index: 1,
      title: '任务',
      estimatedMinutes: 30,
      actualMinutes: 0,
      progress: 0,
      status: 'todo',
      locked: false,
      timeEntries: [],
      scheduleSource: 'system',
      intentStrength: 'normal',
    } as unknown as typeof state.assignments[number])
    state.taskGroups.push({
      id: 'g-zero',
      subject: '其他',
      title: '组',
      priority: 3,
      quantity: 1,
      unitMinutes: 30,
      targetDate: state.settings.endDate,
      dueDate: state.settings.endDate,
      countInStats: true,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as typeof state.taskGroups[number])
    const health = computePlanningHealth(state, today, 14)
    expect(health.totalCapacityMinutes).toBe(0)
    expect(health.status).toBe('overloaded')
    expect(health.gapMinutes).toBeLessThan(0)
  })

  it('共享 TaskGroup 的双目标不重复计算 horizon 剩余', () => {
    const today = todayISO()
    const deadline = shiftDate(today, 5)
    const state = buildBlankState()
    state.settings.regularMinutes = 60
    state.settings.studyMinutes = 60
    state.taskGroups.push({
      id: 'g-shared',
      subject: '其他',
      title: '共享组',
      priority: 3,
      quantity: 2,
      unitMinutes: 60,
      targetDate: deadline,
      dueDate: deadline,
      countInStats: true,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as typeof state.taskGroups[number])
    for (let i = 0; i < 2; i += 1) {
      state.assignments.push({
        id: `shared-${i}`,
        groupId: 'g-shared',
        index: i + 1,
        title: `共享任务${i}`,
        estimatedMinutes: 60,
        actualMinutes: 0,
        progress: 0,
        status: 'todo',
        locked: false,
        timeEntries: [],
        scheduleSource: 'system',
        intentStrength: 'normal',
      } as unknown as typeof state.assignments[number])
    }
    // 两个目标共享同一组
    state.goals.push({
      id: 'goal-a',
      title: 'GoalA',
      priority: 3,
      latestDate: deadline,
      status: 'active',
      completionConditions: [{ id: 'c-a', groupId: 'g-shared', mode: 'all' }],
      linkedTaskGroupIds: [],
      linkedAssignmentIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as typeof state.goals[number])
    state.goals.push({
      id: 'goal-b',
      title: 'GoalB',
      priority: 3,
      latestDate: deadline,
      status: 'active',
      completionConditions: [{ id: 'c-b', groupId: 'g-shared', mode: 'all' }],
      linkedTaskGroupIds: [],
      linkedAssignmentIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as typeof state.goals[number])
    const health = computePlanningHealth(state, today, 14)
    // horizon 剩余应去重为 120 而非 240
    expect(health.totalRemainingMinutes).toBe(120)
    // per-goal 各自 120 剩余，但全局不重复
    expect(health.risks.length).toBe(2)
  })
})
