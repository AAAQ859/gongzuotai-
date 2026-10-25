/**
 * 例行事项(每周固定星期/时间)的纯日期逻辑。
 * 主进程生成周期、渲染层表单默认值、测试共用,不依赖数据库与 DOM。
 */

const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六']
const DAY_MS = 86_400_000

/** 'YYYY-MM-DD' 或 'YYYY-MM-DD HH:MM' → 本地日期(时间部分忽略) */
export function parseDateStr(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

/** Date → 'YYYY-MM-DD' */
export function fmtDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Date → 'YYYY-MM-DD HH:MM' */
export function fmtDateTimeStr(d: Date): string {
  return `${fmtDateStr(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 'YYYY-MM-DD' 加 N 天 */
export function addDaysStr(dateStr: string, n: number): string {
  const d = parseDateStr(dateStr)
  d.setDate(d.getDate() + n)
  return fmtDateStr(d)
}

/** 星期几:0=周日 … 6=周六(与 Date.getDay 一致) */
export function weekdayOf(dateStr: string): number {
  return parseDateStr(dateStr).getDay()
}

/** 中文星期标签,如「周五」 */
export function weekdayLabel(dateStr: string): string {
  return `周${WEEKDAY_CN[weekdayOf(dateStr)]}`
}

/** 从 'YYYY-MM-DD HH:MM' 中取 'HH:MM' */
export function timeOf(value: string): string {
  const i = value.indexOf(' ')
  return i >= 0 ? value.slice(i + 1, i + 6) : value.slice(11, 16)
}

/** 日期加 N 个月(月末自动收缩,如 1-31 + 1 月 → 2-28) */
export function addMonthsStr(dateStr: string, months: number): string {
  const d = parseDateStr(dateStr)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, lastDay))
  return fmtDateStr(d)
}

/** 解析 'YYYY-MM-DD HH:MM' 为本地 Date */
export function parseDateTimeStr(value: string): Date {
  const [datePart, timePart = '00:00'] = value.split(' ')
  const [y, m, d] = datePart.split('-').map(Number)
  const [hh, mm] = timePart.split(':').map(Number)
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0)
}

/** 日期时间加 N 分钟,返回 'YYYY-MM-DD HH:MM' */
export function addMinutesToDateTime(value: string, minutes: number): string {
  if (!value) return ''
  const d = parseDateTimeStr(value)
  d.setMinutes(d.getMinutes() + minutes)
  return fmtDateTimeStr(d)
}

/** b - a 的分钟数(a、b 均为 'YYYY-MM-DD HH:MM') */
export function diffMinutes(a: string, b: string): number {
  if (!a || !b) return 0
  return Math.round((parseDateTimeStr(b).getTime() - parseDateTimeStr(a).getTime()) / 60_000)
}

/** 锚点日期起、不早于 fromDate 的第一个每周同一星期日期 */
export function firstWeeklyOnOrAfter(anchorDate: string, fromDate: string): string {
  const anchor = parseDateStr(anchorDate).getTime()
  const from = parseDateStr(fromDate).getTime()
  const days = Math.round((from - anchor) / DAY_MS)
  const mod = ((days % 7) + 7) % 7
  return addDaysStr(fromDate, (7 - mod) % 7)
}

/**
 * 生成 [fromDate, untilDate] 区间内、锚点日期每周重复的所有日期(含首尾)。
 * 仅生成日期,是否跳过例外、是否已存在由调用方处理。
 */
export function weeklyDatesBetween(anchorDate: string, fromDate: string, untilDate: string): string[] {
  if (!anchorDate || !fromDate || !untilDate) return []
  const until = untilDate.slice(0, 10)
  let current = firstWeeklyOnOrAfter(anchorDate, fromDate)
  const out: string[] = []
  // 12 个月约 53 期;上限仅防御异常输入
  for (let guard = 0; current <= until && guard < 1000; guard++) {
    out.push(current)
    current = addDaysStr(current, 7)
  }
  return out
}

/** 例行规则的人类可读文本,如「每周五 15:30」 */
export function formatWeeklyRule(startTime: string): string {
  if (!startTime || startTime.length < 16) return ''
  return `每周${WEEKDAY_CN[weekdayOf(startTime)]} ${timeOf(startTime)}`
}
