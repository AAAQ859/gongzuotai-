/**
 * 仪表盘纯计算逻辑:日期工具 + 汇总统计。
 * 不依赖 DOM / 数据库,可在测试中独立验证(见 tests/dashboard-tests.ts)。
 */
import type { Calendar, WorkEvent } from '@shared/types'

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** 'YYYY-MM-DD' */
export function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 'YYYY-MM-DD HH:MM' */
export function fmtDateTime(d: Date): string {
  return `${fmtDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 'YYYY-MM-DD' → Date(本地时区零点) */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** 日期字符串加 N 天,返回 'YYYY-MM-DD' */
export function addDays(s: string, n: number): string {
  const d = parseDate(s)
  d.setDate(d.getDate() + n)
  return fmtDate(d)
}

/** 两个 'YYYY-MM-DD' 之间的天数差(to - from) */
export function dayDiff(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86400000)
}

/** 本周一(零点) */
export function startOfWeek(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7))
  return r
}

export function weekdayText(d: Date): string {
  return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
}

/** 按时段问候 */
export function greeting(hour: number): { text: string; icon: string } {
  if (hour < 5) return { text: '夜深了', icon: '🌙' }
  if (hour < 12) return { text: '早上好', icon: '☀️' }
  if (hour < 14) return { text: '中午好', icon: '☀️' }
  if (hour < 18) return { text: '下午好', icon: '☀️' }
  return { text: '晚上好', icon: '🌙' }
}

/** 向上取整到下一个半点(快捷新增的默认时间) */
export function roundToNextHalfHour(d: Date): Date {
  const r = new Date(d)
  r.setSeconds(0, 0)
  if (r.getMinutes() > 30) {
    r.setHours(r.getHours() + 1, 0)
  } else if (r.getMinutes() > 0) {
    r.setMinutes(30)
  } else if (r.getMinutes() === 30) {
    r.setMinutes(30)
  }
  return r
}

export interface DashboardSummary {
  today: string
  nowDt: string
  weekStart: string
  weekEnd: string
  /** 今日会议(按开始时间排序) */
  todayMeetings: WorkEvent[]
  /** 下一场未开始的会议 */
  nextMeeting: WorkEvent | undefined
  /** 本周待办(周一起步的所有事项类) */
  weekTasks: WorkEvent[]
  /** 本周已完成数量 */
  weekDone: number
  /** 3 天内到期(含今天)的未完成任务 */
  soon: WorkEvent[]
  /** 已逾期的未完成任务 */
  overdue: WorkEvent[]
  /** 待对接清单(分类=对接、未完成、7 天内到期或已逾期) */
  followups: WorkEvent[]
  /** 今日全部日程(事项+会议,按开始时间排序) */
  todayEvents: WorkEvent[]
  /** 需要关注的事项数 = 今日日程数 + 逾期数 */
  focusCount: number
}

export function computeSummary(events: WorkEvent[], now: Date = new Date()): DashboardSummary {
  const today = fmtDate(now)
  const nowDt = fmtDateTime(now)
  const weekStart = fmtDate(startOfWeek(now))
  const weekEnd = addDays(weekStart, 6)
  const weekStartDt = `${weekStart} 00:00`
  const weekEndDt = `${weekEnd} 23:59`
  const soonEndDt = `${addDays(today, 2)} 23:59`
  const followEndDt = `${addDays(today, 7)} 23:59`

  const byStart = (a: WorkEvent, b: WorkEvent): number =>
    (a.start_time ?? '').localeCompare(b.start_time ?? '')
  const byEnd = (a: WorkEvent, b: WorkEvent): number =>
    (a.end_time ?? '').localeCompare(b.end_time ?? '')

  const todayMeetings = events
    .filter((e) => e.kind === 'meeting' && e.start_time?.slice(0, 10) === today)
    .sort(byStart)
  const nextMeeting = todayMeetings.find((e) => e.start_time && e.start_time >= nowDt)

  const weekTasks = events.filter(
    (e) => e.kind === 'task' && e.start_time && e.start_time >= weekStartDt && e.start_time <= weekEndDt
  )
  const weekDone = weekTasks.filter((e) => e.status === 'done').length

  const open = (e: WorkEvent): boolean =>
    e.kind === 'task' && e.status !== 'done' && e.status !== 'cancelled' && !!e.end_time
  const soon = events.filter(
    (e) => open(e) && e.end_time! >= `${today} 00:00` && e.end_time! <= soonEndDt
  )
  const overdue = events.filter((e) => open(e) && e.end_time! < nowDt)

  const followups = events
    .filter(
      (e) =>
        e.kind === 'task' &&
        e.category === '对接' &&
        e.status !== 'done' &&
        e.status !== 'cancelled' &&
        !!e.end_time &&
        (e.end_time! < nowDt || e.end_time! <= followEndDt)
    )
    .sort(byEnd)

  const todayEvents = events
    .filter((e) => e.start_time?.slice(0, 10) === today)
    .sort(byStart)

  return {
    today,
    nowDt,
    weekStart,
    weekEnd,
    todayMeetings,
    nextMeeting,
    weekTasks,
    weekDone,
    soon,
    overdue,
    followups,
    todayEvents,
    focusCount: todayEvents.length + overdue.length
  }
}

/** 截止日期的人类可读标签 */
export function deadlineLabel(end: string, now: Date = new Date()): string {
  if (end < fmtDateTime(now)) return '已逾期'
  const d = dayDiff(fmtDate(now), end.slice(0, 10))
  if (d <= 0) return '今日截止'
  if (d === 1) return '明日截止'
  return `${d}天后`
}

const CATEGORY_PALETTE = [
  '#12B886',
  '#339AF0',
  '#FF922B',
  '#9775FA',
  '#F06595',
  '#51CF66',
  '#5C7CFA',
  '#FF6B6B',
  '#FCC419',
  '#22B8CF'
]

/** 分类标签取色(同名同色,稳定可预测) */
export function categoryColor(category: string): string {
  if (!category) return '#868E96'
  let h = 0
  for (let i = 0; i < category.length; i++) h = (h * 31 + category.charCodeAt(i)) >>> 0
  return CATEGORY_PALETTE[h % CATEGORY_PALETTE.length]
}

export interface MonthCell {
  day: number
  /** 'YYYY-MM-DD' */
  dateStr: string
  inMonth: boolean
}

/** 月历 6×7 网格(周一起步),含前后月补位 */
export function buildMonthGrid(year: number, month: number): MonthCell[] {
  const first = new Date(year, month - 1, 1)
  const startOffset = (first.getDay() + 6) % 7
  const cells: MonthCell[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, month - 1, 1 - startOffset + i)
    cells.push({ day: d.getDate(), dateStr: fmtDate(d), inMonth: d.getMonth() === month - 1 })
  }
  return cells
}

/** 某月每天的事项颜色点(供迷你月历渲染,每天最多 3 个) */
export function eventColorsByDay(
  events: WorkEvent[],
  calendars: Calendar[],
  year: number,
  month: number
): Map<string, string[]> {
  const colorOf = new Map(calendars.map((c) => [c.id, c.color]))
  const prefix = `${year}-${pad2(month)}-`
  const map = new Map<string, Set<string>>()
  for (const e of events) {
    if (!e.start_time?.startsWith(prefix)) continue
    const day = e.start_time.slice(0, 10)
    const color = e.calendar_id != null ? (colorOf.get(e.calendar_id) ?? '#CED4DA') : '#CED4DA'
    if (!map.has(day)) map.set(day, new Set())
    map.get(day)!.add(color)
  }
  return new Map([...map.entries()].map(([k, v]) => [k, [...v].slice(0, 3)]))
}
