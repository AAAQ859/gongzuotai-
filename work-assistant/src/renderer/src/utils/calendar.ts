/**
 * 日程日历纯计算逻辑:三视图(日/周/月)网格、范围标题、事件分组与布局。
 * 不依赖 DOM / 数据库,可在测试中独立验证(见 tests/calendar-tests.ts)。
 * 注意:PRD 4.2 日历页以周日为每周第一天(仪表盘迷你月历为周一,两者刻意不同)。
 */
import type { Calendar, WorkEvent } from '@shared/types'
import { addDays, dayDiff, fmtDate, pad2, parseDate, weekdayText } from './dashboard'

export const WEEKDAY_HEADER = ['日', '一', '二', '三', '四', '五', '六']

export type CalendarViewMode = 'month' | 'week' | 'day'

export interface MonthCellS {
  day: number
  /** 'YYYY-MM-DD' */
  dateStr: string
  inMonth: boolean
  weekday: number
}

/** 月视图 6×7 网格(周日为首),含前后月补位 */
export function buildMonthGridSunday(year: number, month: number): MonthCellS[] {
  const first = new Date(year, month - 1, 1)
  const startOffset = first.getDay()
  const cells: MonthCellS[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, month - 1, 1 - startOffset + i)
    cells.push({
      day: d.getDate(),
      dateStr: fmtDate(d),
      inMonth: d.getMonth() === month - 1,
      weekday: d.getDay()
    })
  }
  return cells
}

/** 周视图 7 天(自 anchor 所在周的周日开始) */
export function buildWeekDays(anchor: Date): Date[] {
  const start = new Date(
    anchor.getFullYear(),
    anchor.getMonth(),
    anchor.getDate() - anchor.getDay()
  )
  return Array.from(
    { length: 7 },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
  )
}

/** 'YYYY-MM-DD' → 'YYYY年M月D日' */
export function fmtDateCn(s: string): string {
  const [y, m, d] = s.split('-').map(Number)
  return `${y}年${m}月${d}日`
}

/** 视图范围标题:月 '2026年10月' / 周 '2026年10月18日 - 2026年10月24日' / 日 '2026年10月21日 · 周三' */
export function rangeTitle(view: CalendarViewMode, anchor: Date): string {
  if (view === 'month') return `${anchor.getFullYear()}年${anchor.getMonth() + 1}月`
  if (view === 'day') return `${fmtDateCn(fmtDate(anchor))} · 周${weekdayText(anchor)}`
  const days = buildWeekDays(anchor)
  return `${fmtDateCn(fmtDate(days[0]))} - ${fmtDateCn(fmtDate(days[6]))}`
}

/** 视图切换锚点偏移:月 ±1 月 / 周 ±7 天 / 日 ±1 天 */
export function shiftAnchor(view: CalendarViewMode, anchor: Date, delta: number): Date {
  if (view === 'month') return new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1)
  const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())
  d.setDate(d.getDate() + delta * (view === 'week' ? 7 : 1))
  return d
}

/** 视图范围起止('YYYY-MM-DD') */
export function viewRange(view: CalendarViewMode, anchor: Date): { from: string; to: string } {
  if (view === 'month') {
    const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
    return { from: fmtDate(from), to: fmtDate(to) }
  }
  if (view === 'day') {
    const d = fmtDate(anchor)
    return { from: d, to: d }
  }
  const days = buildWeekDays(anchor)
  return { from: fmtDate(days[0]), to: fmtDate(days[6]) }
}

/** 按天分组(start_time 落在 [from, to] 内的事件) */
export function groupEventsByDay(
  events: WorkEvent[],
  from: string,
  to: string
): Map<string, WorkEvent[]> {
  const map = new Map<string, WorkEvent[]>()
  for (const e of events) {
    const d = e.start_time?.slice(0, 10)
    if (!d || d < from || d > to) continue
    if (!map.has(d)) map.set(d, [])
    map.get(d)!.push(e)
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
  }
  return map
}

export interface MonthCellLayout {
  visible: WorkEvent[]
  /** 超出 3 条后折叠的数量 */
  more: number
}

/** 月视图单元格:最多展示 3 条,其余折叠为 "+N" */
export function layoutMonthCell(dayEvents: WorkEvent[]): MonthCellLayout {
  if (dayEvents.length <= 3) return { visible: dayEvents, more: 0 }
  return { visible: dayEvents.slice(0, 3), more: dayEvents.length - 3 }
}

/** 日历分类在视图范围内的非取消事项数(侧栏计数) */
export function countEventsByCalendar(
  events: WorkEvent[],
  calendarId: number,
  from: string,
  to: string
): number {
  return events.filter(
    (e) =>
      e.calendar_id === calendarId &&
      e.status !== 'cancelled' &&
      e.start_time &&
      e.start_time.slice(0, 10) >= from &&
      e.start_time.slice(0, 10) <= to
  ).length
}

/** 本周(含逾期)待跟进对接事项数,用于顶部提醒横幅 */
export function countFollowupsDue(
  events: WorkEvent[],
  now: Date = new Date()
): number {
  const today = fmtDate(now)
  const nowDt = `${today} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`
  const weekEnd = addDays(today, 6 - now.getDay()) // 本周六
  return events.filter(
    (e) =>
      e.kind === 'task' &&
      e.category === '对接' &&
      e.status !== 'done' &&
      e.status !== 'cancelled' &&
      !!e.end_time &&
      (e.end_time! < nowDt || e.end_time! <= `${weekEnd} 23:59`)
  ).length
}

/** 时间范围文案:'09:30 - 10:30' / '全天' / 仅有开始时间 */
export function fmtTimeRange(e: WorkEvent): string {
  if (!e.start_time) return '全天'
  const start = e.start_time.slice(11)
  const end = e.end_time?.slice(11)
  return end ? `${start} - ${end}` : start
}

/** 日历分类按 PRD 分组:我的日历(schedule)/ 部门日历(meeting) */
export interface CalendarGroup {
  key: string
  label: string
  items: Calendar[]
}

export function groupCalendars(calendars: Calendar[]): CalendarGroup[] {
  return [
    { key: 'mine', label: '我的日历', items: calendars.filter((c) => c.kind === 'schedule') },
    { key: 'dept', label: '部门日历', items: calendars.filter((c) => c.kind === 'meeting') }
  ]
}

/** 相邻两天的天数差(用于测试断言) */
export { dayDiff }

// ============ 状态自动识别 ============
// 规则(用户确认):手动状态优先(done/cancelled/in_progress);未手动标记的按开始/结束时间自动推导:
//   未到开始时间 → 未开始;开始后未到结束 → 进行中;到结束时间后 → 已结束

export interface EventStateInfo {
  key: 'not_started' | 'in_progress' | 'ended' | 'done' | 'cancelled'
  label: string
}

export function eventState(ev: WorkEvent, now: Date = new Date()): EventStateInfo {
  if (ev.status === 'done') return { key: 'done', label: '已完成' }
  if (ev.status === 'cancelled') return { key: 'cancelled', label: '已取消' }
  if (ev.status === 'in_progress') return { key: 'in_progress', label: '进行中' }
  const nowDt = `${fmtDate(now)} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`
  if (ev.end_time && nowDt >= ev.end_time) return { key: 'ended', label: '已结束' }
  if (ev.start_time && nowDt < ev.start_time) return { key: 'not_started', label: '未开始' }
  if (ev.start_time || ev.end_time) return { key: 'in_progress', label: '进行中' }
  return { key: 'not_started', label: '未开始' } // 无任何时间 → 待安排
}

// ============ 侧栏筛选 ============
/** 应用侧栏显隐与「只看该日历」筛选:
 *  activeCalId 非空时仅保留该日历的事项(未分类事项不显示);hiddenIds 中的日历被勾选隐藏 */
export function applyCalendarFilter(
  events: WorkEvent[],
  activeCalId: number | null,
  hiddenIds: Set<number>
): WorkEvent[] {
  return events.filter((e) => {
    if (activeCalId != null && e.calendar_id !== activeCalId) return false
    if (e.calendar_id != null && hiddenIds.has(e.calendar_id)) return false
    return true
  })
}
