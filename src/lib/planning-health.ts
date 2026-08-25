import type { AppState, GoalProgress } from '../types'
import { dateRange, getCapacity, minutesText, shiftDate, todayISO } from './date'
import { effectiveMinutes } from './planner'
import { allGoalProgress } from './goals'

export type HealthStatus = 'comfortable' | 'tight' | 'overloaded'

export interface HealthRisk {
  goalId: string
  goalTitle: string
  remainingMinutes: number
  capacityMinutes: number
  gapMinutes: number
  daysUntil: number
  latestRisk: boolean
  desiredRisk: boolean
  reason: string
}

export interface NextAction {
  kind: 'focus' | 'adjust-deadline' | 'reduce-load' | 'keep'
  label: string
  detail: string
}

export interface PlanningHealth {
  today: string
  horizonDays: number
  totalCapacityMinutes: number
  totalRemainingMinutes: number
  gapMinutes: number
  status: HealthStatus
  risks: HealthRisk[]
  nextAction: NextAction
}

function totalCapacityForRange(state: AppState, from: string, to: string): number {
  if (from > to) return 0
  return dateRange(from, to).reduce((sum, date) => sum + getCapacity(state, date), 0)
}

function calcHorizonRemainingMinutes(state: AppState, today: string, horizonEnd: string): number {
  const relevantIds = new Set<string>()

  // 1) 已排期且落在 horizon 内
  for (const a of state.assignments) {
    if (a.status === 'done') continue
    if (a.scheduledDate && a.scheduledDate >= today && a.scheduledDate <= horizonEnd) {
      relevantIds.add(a.id)
    }
  }

  // 2) 未完成目标中，deadline 在 horizon 内（含逾期）的剩余任务
  const progresses = allGoalProgress(state)
  const allRemainingGoalIds = new Set<string>(progresses.flatMap(p => p.remainingAssignmentIds))
  for (const progress of progresses) {
    if (progress.completed) continue
    const goal = state.goals.find(g => g.id === progress.goalId)
    if (!goal) continue
    const deadlineWithinHorizon = goal.latestDate <= horizonEnd
    if (!deadlineWithinHorizon) continue
    for (const id of progress.remainingAssignmentIds) {
      const a = state.assignments.find(item => item.id === id)
      if (!a || a.status === 'done') continue
      relevantIds.add(id)
    }
  }

  // 3) 未排期且不属于任何目标剩余集合的孤立任务，视为 horizon 内待安排
  for (const a of state.assignments) {
    if (a.status === 'done') continue
    if (relevantIds.has(a.id)) continue
    if (a.scheduledDate != null) continue
    if (!allRemainingGoalIds.has(a.id)) {
      relevantIds.add(a.id)
    }
  }

  let total = 0
  for (const id of relevantIds) {
    const a = state.assignments.find(item => item.id === id)
    if (!a) continue
    const remaining = typeof a.remainingMinutes === 'number' ? a.remainingMinutes : effectiveMinutes(a)
    total += Math.max(0, remaining)
  }
  return total
}

function daysUntil(from: string, to: string): number {
  const diff = (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000
  return Math.max(0, Math.ceil(diff) + 1)
}

export function computePlanningHealth(state: AppState, today = todayISO(), horizonDays = 14): PlanningHealth {
  const horizonEnd = shiftDate(today, horizonDays - 1)
  const totalCapacityMinutes = totalCapacityForRange(state, today, horizonEnd)
  const totalRemainingMinutes = calcHorizonRemainingMinutes(state, today, horizonEnd)
  const gapMinutes = totalCapacityMinutes - totalRemainingMinutes

  let status: HealthStatus = 'comfortable'
  if (gapMinutes < 0) status = 'overloaded'
  else if (gapMinutes < 120) status = 'tight'

  const progresses: GoalProgress[] = allGoalProgress(state)
  const risks: HealthRisk[] = []

  for (const progress of progresses) {
    if (progress.completed) continue
    const goal = state.goals.find(g => g.id === progress.goalId)
    if (!goal) continue
    const remainingMinutes = progress.estimatedRemainingMinutes
    if (remainingMinutes <= 0) continue

    const latestDate = goal.latestDate
    const isOverdue = latestDate < today
    const capacityMinutes = isOverdue ? 0 : totalCapacityForRange(state, today, latestDate)
    // Alternatively, for risk we compare capacity until latestDate, not horizon, to reflect true deadline pressure
    const gap = capacityMinutes - remainingMinutes
    const needAttention = progress.latestRisk || progress.desiredRisk || gap < 0

    if (!needAttention) continue

    const days = isOverdue ? 0 : daysUntil(today, latestDate)
    const reason = isOverdue
      ? `${goal.title} · 已逾期 尚需 ${minutesText(remainingMinutes)} / 缺口 ${minutesText(-gap)}`
      : `${goal.title} · ${days} 天 尚需 ${minutesText(remainingMinutes)} / 可用 ${minutesText(capacityMinutes)} / ${gap < 0 ? `缺口 ${minutesText(-gap)}` : `余量 ${minutesText(gap)}`}`

    risks.push({
      goalId: goal.id,
      goalTitle: goal.title,
      remainingMinutes,
      capacityMinutes,
      gapMinutes: gap,
      daysUntil: days,
      latestRisk: progress.latestRisk,
      desiredRisk: progress.desiredRisk,
      reason,
    })
  }

  risks.sort((a, b) => a.gapMinutes - b.gapMinutes)

  // Keep top 3 riskiest
  const topRisks = risks.slice(0, 3)

  let nextAction: NextAction
  if (status === 'overloaded') {
    nextAction = {
      kind: 'reduce-load',
      label: '未来 14 天已超载',
      detail: `缺口 ${minutesText(-gapMinutes)}，建议减少负载或延长最近目标的截止日期`,
    }
  } else if (topRisks.length > 0) {
    const primary = topRisks[0]
    const isOverdue = primary.daysUntil === 0
    nextAction = {
      kind: primary.latestRisk ? 'adjust-deadline' : 'focus',
      label: isOverdue ? `优先处理已逾期「${primary.goalTitle}」` : `优先处理「${primary.goalTitle}」`,
      detail: primary.gapMinutes < 0 ? `尚缺 ${minutesText(-primary.gapMinutes)}，建议优先完成该目标相关任务` : primary.reason,
    }
  } else if (status === 'tight') {
    nextAction = {
      kind: 'focus',
      label: '节奏偏紧',
      detail: `余量 ${minutesText(gapMinutes)}，建议优先完成高优先级任务`,
    }
  } else {
    nextAction = {
      kind: 'keep',
      label: '计划富余',
      detail: `余量 ${minutesText(gapMinutes)}，可保持当前节奏或提前安排`,
    }
  }

  return {
    today,
    horizonDays,
    totalCapacityMinutes,
    totalRemainingMinutes,
    gapMinutes,
    status,
    risks: topRisks,
    nextAction,
  }
}
