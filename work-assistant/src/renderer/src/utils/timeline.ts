/**
 * 月度时间轴纯逻辑(板块 07,有单测):
 * - 节点与日历共用 events 数据,按「主日期」(start 优先,end 兜底)归属月份
 * - 状态口径:绿=已完成、青=进行中/今日、红=已逾期/今日截止、灰=待开始(PRD 4.3)
 * - Excel/CSV 导入网格解析(与联络导入同一套主进程读取链路,语义层独立)
 */
import type { WorkEvent } from '@shared/types'
import { pad2, weekdayText } from './dashboard'

export type TimelineStatus =
  | 'done'
  | 'in_progress'
  | 'overdue'
  | 'due_today'
  | 'today'
  | 'pending'
  | 'cancelled'

export interface TimelineNode {
  ev: WorkEvent
  /** 主日期 'YYYY-MM-DD' */
  date: string
  status: TimelineStatus
}

export interface TimelineGroup {
  date: string
  /** '10月1日 · 周三' */
  label: string
  isToday: boolean
  items: TimelineNode[]
}

/** 事件主日期:start_time 的日期,无则 end_time 的日期;均无返回 null */
export function nodeDate(ev: WorkEvent): string | null {
  const s = ev.start_time ?? ev.end_time
  return s ? s.slice(0, 10) : null
}

/**
 * 时间轴状态(PRD 4.3 配色口径):
 * 已完成/已取消优先;逾期与今日截止为红色紧急;进行中与今日为青绿色;其余待开始灰色。
 */
export function timelineStatus(ev: WorkEvent, today: string): TimelineStatus {
  if (ev.status === 'done') return 'done'
  if (ev.status === 'cancelled') return 'cancelled'
  if (ev.status === 'in_progress') return 'in_progress'
  const end = ev.end_time
  if (end) {
    if (end < today) return 'overdue'
    if (end.slice(0, 10) === today) return 'due_today'
  }
  if (nodeDate(ev) === today) return 'today'
  return 'pending'
}

/** 是否显示「催办中」标签:对接事项已逾期或今日截止 */
export function isUrging(ev: WorkEvent, status: TimelineStatus): boolean {
  return ev.category === '对接' && (status === 'overdue' || status === 'due_today')
}

/** 日期头文案 '10月1日 · 周三' */
export function dateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const wd = weekdayText(new Date(y, m - 1, d))
  return `${m}月${d}日 · 周${wd}`
}

/**
 * 按月份构建时间轴分组:主日期落在 month('YYYY-MM') 内的事件,
 * 按日期升序、同日按开始时间升序(无时间排后)、再按 sort_order、id 稳定排序。
 */
export function buildTimeline(events: WorkEvent[], month: string, today: string): TimelineGroup[] {
  const nodes: TimelineNode[] = []
  for (const ev of events) {
    const date = nodeDate(ev)
    if (!date || !date.startsWith(month)) continue
    nodes.push({ ev, date, status: timelineStatus(ev, today) })
  }
  nodes.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    const at = a.ev.start_time ?? a.ev.end_time
    const bt = b.ev.start_time ?? b.ev.end_time
    if (at && bt && at !== bt) return at < bt ? -1 : 1
    if (!!at !== !!bt) return at ? -1 : 1
    if (a.ev.sort_order !== b.ev.sort_order) return a.ev.sort_order - b.ev.sort_order
    return a.ev.id - b.ev.id
  })
  const groups: TimelineGroup[] = []
  for (const n of nodes) {
    const last = groups[groups.length - 1]
    if (last && last.date === n.date) {
      last.items.push(n)
    } else {
      groups.push({ date: n.date, label: dateLabel(n.date), isToday: n.date === today, items: [n] })
    }
  }
  return groups
}

/** 汇总口径:已完成=done;进行中=in_progress+今日+逾期+今日截止;待开始=pending;已取消不计 */
export function timelineSummary(nodes: TimelineNode[]): {
  total: number
  done: number
  active: number
  pending: number
} {
  const s = { total: 0, done: 0, active: 0, pending: 0 }
  for (const n of nodes) {
    if (n.status === 'cancelled') continue
    s.total++
    if (n.status === 'done') s.done++
    else if (n.status === 'pending') s.pending++
    else s.active++
  }
  return s
}

/** 本月已过时长进度 0-100(今天占一天,月末为 100) */
export function monthProgress(today: string): number {
  const [y, m, d] = today.split('-').map(Number)
  const days = new Date(y, m, 0).getDate()
  return Math.round((d / days) * 100)
}

// ---------- Excel/CSV 导入解析 ----------

export interface TimelineImportRow {
  date: string
  title: string
  description: string
  calendar: string
  category: string
  start: string | null
  end: string | null
  contact: string
}

export interface TimelineParseResult {
  rows: TimelineImportRow[]
  errors: string[]
}

/** 支持 'YYYY-MM-DD' / 'YYYY/M/D' / 'M-D'(当年) / 'M月D日'(当年) */
export function normalizeDate(s: string, now: Date): string | null {
  const t = s.trim()
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (m) return `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}`
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})$/)
  if (m) return `${now.getFullYear()}-${pad2(+m[1])}-${pad2(+m[2])}`
  m = t.match(/^(\d{1,2})月(\d{1,2})日?$/)
  if (m) return `${now.getFullYear()}-${pad2(+m[1])}-${pad2(+m[2])}`
  return null
}

/** 支持 'HH:mm'(拼主日期)与 'YYYY-MM-DD HH:mm';无法识别返回 null */
export function normalizeTime(s: string | undefined, date: string): string | null {
  if (!s) return null
  const t = s.trim()
  if (!t) return null
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[ T](\d{1,2}):(\d{2})$/)
  if (m) return `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])} ${pad2(+m[4])}:${m[5]}`
  m = t.match(/^(\d{1,2}):(\d{2})$/)
  if (m) return `${date} ${pad2(+m[1])}:${m[2]}`
  return null
}

/** 表头列名 → 列序号(中英文均可) */
const COLUMNS: Record<string, number> = {
  日期: 0,
  date: 0,
  时间: 0,
  标题: 1,
  事项: 1,
  内容: 1,
  名称: 1,
  title: 1,
  描述: 2,
  备注: 2,
  说明: 2,
  desc: 2,
  description: 2,
  日历: 3,
  所属日历: 3,
  calendar: 3,
  分类: 4,
  标签: 4,
  类型: 4,
  category: 4,
  开始时间: 5,
  start: 5,
  结束时间: 6,
  截止: 6,
  截止时间: 6,
  end: 6,
  对接人: 7,
  联系人: 7,
  contact: 7
}

/**
 * 表头判定:首格是列名,或(首格不是有效日期且行内有列名)。
 * 数据行首格必为日期,即使标题恰好与列名重名(如「事项」)也不会误判。
 */
function detectHeader(firstRow: string[], now: Date): boolean {
  const first = (firstRow[0] ?? '').trim().toLowerCase()
  if (COLUMNS[first] !== undefined) return true
  if (normalizeDate(firstRow[0] ?? '', now)) return false
  return firstRow.some((c) => c.trim() !== '' && COLUMNS[c.trim().toLowerCase()] !== undefined)
}

/** 表头 → 列号数组(无表头按固定列序) */
function columnIndexes(firstRow: string[], hasHeader: boolean): number[] {
  if (!hasHeader) return [0, 1, 2, 3, 4, 5, 6, 7]
  const idx = [-1, -1, -1, -1, -1, -1, -1, -1]
  firstRow.forEach((c, i) => {
    const col = COLUMNS[c.trim().toLowerCase()]
    if (col !== undefined && idx[col] === -1) idx[col] = i
  })
  // 缺失列补 -1 → 空串
  return idx
}

/**
 * 解析导入网格(主进程读出的 xlsx 网格 / CSV 行):表头识别、缺日期/标题跳过、
 * 时间无法识别忽略该时间并提示。错误行号从数据首行起算(第 1 行 = 首个数据行)。
 */
export function parseTimelineRows(grid: string[][], now: Date): TimelineParseResult {
  const rows: TimelineImportRow[] = []
  const errors: string[] = []
  const cell = (r: string[], i: number): string => (i >= 0 && r[i] !== undefined ? String(r[i] ?? '').trim() : '')
  const first = grid[0] ?? []
  const hasHeader = detectHeader(first, now)
  const idx = columnIndexes(first, hasHeader)
  let n = 0
  for (let i = hasHeader ? 1 : 0; i < grid.length; i++) {
    const r = grid[i]
    if (r.some((c) => String(c ?? '').trim() !== '')) {
      const rowNum = ++n
      const date = normalizeDate(cell(r, idx[0]), now)
      const title = cell(r, idx[1])
      if (!date) {
        errors.push(`第 ${rowNum} 行缺少日期,已跳过`)
        continue
      }
      if (!title) {
        errors.push(`第 ${rowNum} 行缺少标题,已跳过`)
        continue
      }
      let start = normalizeTime(cell(r, idx[5]) || undefined, date)
      if (cell(r, idx[5]) && !start) errors.push(`第 ${rowNum} 行开始时间无法识别,已忽略`)
      let end = normalizeTime(cell(r, idx[6]) || undefined, date)
      if (cell(r, idx[6]) && !end) errors.push(`第 ${rowNum} 行结束时间无法识别,已忽略`)
      if (start && end && end < start) {
        errors.push(`第 ${rowNum} 行结束时间早于开始时间,已忽略结束时间`)
        end = null
      }
      rows.push({
        date,
        title,
        description: cell(r, idx[2]),
        calendar: cell(r, idx[3]),
        category: cell(r, idx[4]),
        start,
        end,
        contact: cell(r, idx[7])
      })
    }
  }
  return { rows, errors }
}
