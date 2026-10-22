/**
 * 工作统计图表(板块 10)纯计算:
 * 近 N 个月完成趋势、事项分类占比、对接人活跃度。
 * 不依赖 DOM,可在测试中独立验证(见 tests/work-stats-tests.ts)。
 */
import type { Contact, WorkEvent } from '@shared/types'
import { categoryColor, pad2 } from './dashboard'

export interface MonthSlot {
  /** 'YYYY-MM' */
  key: string
  /** '5月' */
  label: string
}

export interface TrendPoint extends MonthSlot {
  /** 完成事项数(按 completed_at 归月) */
  done: number
  /** 已召开会议数(按 start_time 归月) */
  meetings: number
}

export interface CategorySlice {
  name: string
  count: number
  /** 0-100,保留一位小数 */
  percent: number
  color: string
}

export interface ContactRank {
  id: number
  name: string
  department: string
  count: number
}

/** 最近 N 个月的槽位(含当前月,从早到晚) */
export function monthSlots(now: Date, months = 6): MonthSlot[] {
  const n = Math.max(1, Math.floor(months))
  const slots: MonthSlot[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    slots.push({ key: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`, label: `${d.getMonth() + 1}月` })
  }
  return slots
}

/** 近 N 个月完成事项 / 已召开会议的月度趋势 */
export function monthlyTrend(events: WorkEvent[], now: Date, months = 6): TrendPoint[] {
  const slots = monthSlots(now, months)
  const keys = new Set(slots.map((s) => s.key))
  const nowDt = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`
  const doneByMonth = new Map<string, number>()
  const meetingByMonth = new Map<string, number>()

  for (const e of events) {
    if (e.status === 'cancelled') continue
    if (e.kind === 'task' && e.status === 'done' && e.completed_at) {
      const key = e.completed_at.slice(0, 7)
      if (keys.has(key)) doneByMonth.set(key, (doneByMonth.get(key) ?? 0) + 1)
    } else if (e.kind === 'meeting' && e.start_time) {
      const key = e.start_time.slice(0, 7)
      if (!keys.has(key)) continue
      const held = e.status === 'done' || e.start_time <= nowDt
      if (held) meetingByMonth.set(key, (meetingByMonth.get(key) ?? 0) + 1)
    }
  }

  return slots.map((s) => ({
    ...s,
    done: doneByMonth.get(s.key) ?? 0,
    meetings: meetingByMonth.get(s.key) ?? 0
  }))
}

/** 近 N 个月已完成事项按分类聚合(最多 limit 项,其余合并为「其他」) */
export function categoryBreakdown(
  events: WorkEvent[],
  now: Date,
  months = 6,
  limit = 6
): CategorySlice[] {
  const keys = new Set(monthSlots(now, months).map((s) => s.key))
  const counts = new Map<string, number>()
  let total = 0

  for (const e of events) {
    if (e.kind !== 'task' || e.status !== 'done' || !e.completed_at) continue
    if (!keys.has(e.completed_at.slice(0, 7))) continue
    const name = e.category.trim() || '未分类'
    counts.set(name, (counts.get(name) ?? 0) + 1)
    total++
  }
  if (!total) return []

  const sorted = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hans-CN')
  )
  const max = Math.max(1, Math.floor(limit))
  const head = sorted.slice(0, max)
  const tail = sorted.slice(max)
  const rows = head.map(([name, count]) => ({ name, count }))
  if (tail.length) {
    rows.push({ name: '其他', count: tail.reduce((sum, [, c]) => sum + c, 0) })
  }

  return rows.map(({ name, count }) => ({
    name,
    count,
    percent: Math.round((count / total) * 1000) / 10,
    color: name === '未分类' || name === '其他' ? '#ADB5BD' : categoryColor(name)
  }))
}

/** 近 N 个月完成事项按关联对接人聚合(Top N) */
export function contactActivity(
  events: WorkEvent[],
  contacts: Contact[],
  now: Date,
  months = 6,
  limit = 5
): ContactRank[] {
  const keys = new Set(monthSlots(now, months).map((s) => s.key))
  const counts = new Map<number, number>()

  for (const e of events) {
    if (e.kind !== 'task' || e.status !== 'done' || !e.completed_at) continue
    if (e.contact_id == null || !keys.has(e.completed_at.slice(0, 7))) continue
    counts.set(e.contact_id, (counts.get(e.contact_id) ?? 0) + 1)
  }

  const byId = new Map(contacts.map((c) => [c.id, c]))
  return [...counts.entries()]
    .map(([id, count]) => {
      const c = byId.get(id)
      return {
        id,
        name: c?.name?.trim() || '未知联系人',
        department: c?.department?.trim() || '',
        count
      }
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hans-CN'))
    .slice(0, Math.max(1, Math.floor(limit)))
}

/** 柱状图 Y 轴上限:取 1/2/5×10^n 的整齐刻度 */
export function niceMax(values: number[]): number {
  const max = Math.max(1, ...values.filter((v) => Number.isFinite(v) && v > 0))
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)))
  for (const step of [1, 2, 5, 10]) {
    if (max <= step * magnitude) return step * magnitude
  }
  return 10 * magnitude
}

/** 数值映射为柱高(px),0 时返回 0 */
export function barHeight(value: number, max: number, height: number): number {
  if (value <= 0 || max <= 0) return 0
  return Math.round(Math.min(1, value / max) * height * 100) / 100
}
