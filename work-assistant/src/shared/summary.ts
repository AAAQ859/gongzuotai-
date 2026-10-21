/**
 * 工作纲要纯逻辑(板块 09,有单测):周期计算、完成事项归集与分类、
 * 统计口径、模板归一化、文本导出与月末判定。
 * 主进程(月末草稿/导出)与渲染层(预览)共用,保证口径一致。
 */

export type SummaryMode = 'month' | 'week' | 'custom'
export type SummarySectionKey = 'routine' | 'coordination' | 'meeting' | 'report'

export interface SummarySectionDef {
  key: SummarySectionKey
  title: string
  icon: string
}

export const SUMMARY_SECTIONS: SummarySectionDef[] = [
  { key: 'routine', title: '例行工作', icon: '🔁' },
  { key: 'coordination', title: '对接协调', icon: '🤝' },
  { key: 'meeting', title: '会议参与', icon: '📅' },
  { key: 'report', title: '报告与材料输出', icon: '📄' }
]

export const SUMMARY_SECTION_KEYS: SummarySectionKey[] = SUMMARY_SECTIONS.map((s) => s.key)

export const DEFAULT_SUMMARY_NOTE =
  '纲要内容由系统从日程、时间轴、会议等模块自动归集生成,可手动编辑补充。'

export interface SummaryTemplate {
  /** 是否包含统计卡片 */
  include_stats: boolean
  /** 是否包含备注 */
  include_note: boolean
  /** 包含的章节 */
  sections: SummarySectionKey[]
}

export const DEFAULT_SUMMARY_TEMPLATE: SummaryTemplate = {
  include_stats: true,
  include_note: true,
  sections: [...SUMMARY_SECTION_KEYS]
}

export type SummaryItemSource = 'auto' | 'manual'

export interface SummaryItem {
  /** 自动项 'ev-<id>';手动项 'manual-<时间戳>-<序号>' */
  id: string
  title: string
  description: string
  /** YYYY-MM-DD */
  date: string
  source: SummaryItemSource
}

export interface SummarySection {
  key: SummarySectionKey
  title: string
  items: SummaryItem[]
}

export interface SummaryContent {
  sections: SummarySection[]
  note: string
}

/** 按周期保存的纲要草稿(用户编辑后持久化) */
export interface SummaryDraft {
  id: number
  period_type: SummaryMode
  period_key: string
  title: string
  range_start: string
  range_end: string
  content: SummaryContent
  created_at: string
  updated_at: string
}

export interface SummaryStats {
  /** 完成工作项(不含会议) */
  completed: number
  /** 参加会议(已召开且未取消) */
  meetings: number
  /** 对接事项(已完成) */
  contacts: number
  /** 输出报告/材料(已完成) */
  reports: number
}

export interface SummaryRange {
  mode: SummaryMode
  /** 月 'YYYY-MM';周 = 周一日期;自定义 'start_end' */
  key: string
  start: string
  end: string
}

/** 生成纲要所需的最小事项结构(与 WorkEvent 兼容) */
export interface SummaryEventLike {
  id: number
  kind: 'task' | 'meeting'
  title: string
  description: string
  category: string
  contact_id: number | null
  start_time: string | null
  end_time: string | null
  status: string
  location: string
  attendees: Array<{ contact_id: number | null; name: string }>
  completed_at: string | null
}

export type SummaryFormat = 'docx' | 'xlsx' | 'pdf' | 'txt'

export interface SummaryExportResult {
  path: string
  format: SummaryFormat
}

export interface SummaryExportPayload {
  title: string
  rangeStart: string
  rangeEnd: string
  periodLabel: string
  stats: SummaryStats
  sections: SummarySection[]
  note: string
  template: SummaryTemplate
  generatedAt: string
}

// ---------- 日期 ----------

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function fmtDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function parseDateStr(s: string): Date | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export function addDaysStr(s: string, days: number): string {
  const d = parseDateStr(s)
  if (!d) return s
  d.setDate(d.getDate() + days)
  return fmtDateStr(d)
}

/** 周一为一周起点 */
export function startOfWeekStr(s: string): string {
  const d = parseDateStr(s)
  if (!d) return s
  const dow = d.getDay() // 0 周日
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  return fmtDateStr(d)
}

export function monthRange(monthKey: string): SummaryRange {
  const m = /^(\d{4})-(\d{1,2})$/.exec(monthKey)
  const year = m ? Number(m[1]) : new Date().getFullYear()
  const month = m ? Number(m[2]) : new Date().getMonth() + 1
  const start = `${year}-${pad2(month)}-01`
  const end = fmtDateStr(new Date(year, month, 0))
  return { mode: 'month', key: `${year}-${pad2(month)}`, start, end }
}

export function weekRange(anchorDate: string): SummaryRange {
  const start = startOfWeekStr(anchorDate)
  return { mode: 'week', key: start, start, end: addDaysStr(start, 6) }
}

export function customRange(start: string, end: string): SummaryRange {
  const s = parseDateStr(start) ? start : fmtDateStr(new Date())
  const e = parseDateStr(end) ? end : s
  const [a, b] = s <= e ? [s, e] : [e, s]
  return { mode: 'custom', key: `${a}_${b}`, start: a, end: b }
}

function dateCn(s: string, withYear = true): string {
  const d = parseDateStr(s)
  if (!d) return s
  return withYear
    ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
    : `${d.getMonth() + 1}月${d.getDate()}日`
}

/** '2026年10月' / '2026年10月19日 - 10月25日' */
export function rangeLabel(range: SummaryRange): string {
  if (range.mode === 'month') {
    const d = parseDateStr(range.start)
    return d ? `${d.getFullYear()}年${d.getMonth() + 1}月` : range.key
  }
  const sameYear = range.start.slice(0, 4) === range.end.slice(0, 4)
  return `${dateCn(range.start)} - ${dateCn(range.end, !sameYear)}`
}

/** '2026年10月工作内容纲要' */
export function rangeTitle(range: SummaryRange): string {
  return `${rangeLabel(range)}工作内容纲要`
}

/** '统计周期:2026年10月1日 - 10月31日' */
export function rangeSpanText(range: SummaryRange): string {
  const sameYear = range.start.slice(0, 4) === range.end.slice(0, 4)
  return `统计周期:${dateCn(range.start)} - ${dateCn(range.end, !sameYear)}`
}

/** 用于标题/文件名:去掉 Windows 非法字符 */
export function summaryFileName(title: string, ext: string): string {
  const safe = title.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 80) || '工作内容纲要'
  return `${safe}.${ext}`
}

// ---------- 事件归集 ----------

function eventDate(ev: SummaryEventLike): string {
  if (ev.kind === 'meeting') {
    return (ev.start_time ?? ev.completed_at ?? ev.end_time ?? '').slice(0, 10)
  }
  return (ev.completed_at ?? ev.start_time ?? ev.end_time ?? '').slice(0, 10)
}

function eventDateTime(ev: SummaryEventLike): string {
  return ev.start_time ?? ev.completed_at ?? ''
}

function isHeldMeeting(ev: SummaryEventLike, now: string): boolean {
  if (ev.status === 'cancelled') return false
  if (ev.status === 'done') return true
  const at = eventDateTime(ev)
  return at !== '' && at <= now
}

/** 事项是否纳入纲要:任务=已完成;会议=已召开或已标记完成;排除取消 */
export function isCompletedInRange(
  ev: SummaryEventLike,
  range: SummaryRange,
  now: string
): boolean {
  if (ev.status === 'cancelled') return false
  const date = eventDate(ev)
  if (!date || date < range.start || date > range.end) return false
  if (ev.kind === 'meeting') return isHeldMeeting(ev, now)
  return ev.status === 'done'
}

/** 章节归类:会议 > 报告材料 > 对接协调 > 例行工作 */
export function sectionOfEvent(ev: SummaryEventLike): SummarySectionKey {
  if (ev.kind === 'meeting') return 'meeting'
  const text = `${ev.category}${ev.title}`
  if (/报告|材料|总结|汇报/.test(text)) return 'report'
  if (ev.contact_id != null || /对接|协调|沟通/.test(text)) return 'coordination'
  return 'routine'
}

export function selectSummaryEvents(
  events: SummaryEventLike[],
  range: SummaryRange,
  now: string
): SummaryEventLike[] {
  return events
    .filter((ev) => isCompletedInRange(ev, range, now))
    .sort((a, b) => {
      const da = eventDate(a)
      const db = eventDate(b)
      return da === db ? a.id - b.id : da.localeCompare(db)
    })
}

export function summaryStats(
  events: SummaryEventLike[],
  range: SummaryRange,
  now: string
): SummaryStats {
  const selected = selectSummaryEvents(events, range, now)
  const doneTasks = selected.filter((e) => e.kind !== 'meeting')
  const doneAll = selected.filter((e) => e.status === 'done')
  return {
    completed: doneTasks.length,
    meetings: selected.filter((e) => e.kind === 'meeting').length,
    contacts: doneAll.filter((e) => sectionOfEvent(e) === 'coordination').length,
    reports: doneAll.filter((e) => sectionOfEvent(e) === 'report').length
  }
}

/** 自动生成一条事项描述(无描述时按类型/地点/参会人组装) */
export function autoDescription(
  ev: SummaryEventLike,
  contactName?: (id: number) => string | undefined
): string {
  const desc = ev.description.trim()
  if (desc) return desc
  const d = parseDateStr(eventDate(ev))
  const day = d ? `${d.getMonth() + 1}月${d.getDate()}日` : ''
  if (ev.kind === 'meeting') {
    const time = (ev.start_time ?? '').slice(11, 16)
    const who = ev.attendees.map((a) => a.name).filter(Boolean)
    return `${day}${time ? ` ${time}` : ''}${ev.location ? `在${ev.location}` : ''}参加「${ev.title}」${
      who.length ? `,参会人员:${who.join('、')}` : ''
    }`
  }
  const contact =
    ev.contact_id != null ? contactName?.(ev.contact_id) ?? ev.attendees[0]?.name : undefined
  return `${day}完成「${ev.title}」${contact ? `,对接:${contact}` : ''}`
}

export function buildSummaryContent(
  events: SummaryEventLike[],
  range: SummaryRange,
  now: string,
  contactName?: (id: number) => string | undefined
): SummaryContent {
  const selected = selectSummaryEvents(events, range, now)
  const sections: SummarySection[] = SUMMARY_SECTIONS.map((def) => ({
    key: def.key,
    title: def.title,
    items: []
  }))
  const byKey = new Map(sections.map((s) => [s.key, s]))
  for (const ev of selected) {
    const key = sectionOfEvent(ev)
    byKey.get(key)?.items.push({
      id: `ev-${ev.id}`,
      title: ev.title,
      description: autoDescription(ev, contactName),
      date: eventDate(ev),
      source: 'auto'
    })
  }
  const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' })
  for (const section of sections) {
    section.items.sort((a, b) =>
      a.date === b.date ? collator.compare(a.title, b.title) : a.date.localeCompare(b.date)
    )
  }
  return { sections, note: DEFAULT_SUMMARY_NOTE }
}

export function emptySummaryContent(): SummaryContent {
  return {
    sections: SUMMARY_SECTIONS.map((def) => ({ key: def.key, title: def.title, items: [] })),
    note: DEFAULT_SUMMARY_NOTE
  }
}

/** 补全缺失章节/字段,保证编辑与导出始终拿到四章节结构 */
export function normalizeSummaryContent(value: SummaryContent | null | undefined): SummaryContent {
  const source = value?.sections ?? []
  const byKey = new Map(source.map((s) => [s.key, s]))
  return {
    sections: SUMMARY_SECTIONS.map((def) => {
      const section = byKey.get(def.key)
      return {
        key: def.key,
        title: def.title,
        items: Array.isArray(section?.items)
          ? section.items.map((it) => ({
              id: String(it.id ?? ''),
              title: String(it.title ?? ''),
              description: String(it.description ?? ''),
              date: String(it.date ?? ''),
              source: it.source === 'manual' ? 'manual' : 'auto'
            }))
          : []
      }
    }),
    note: typeof value?.note === 'string' ? value.note : DEFAULT_SUMMARY_NOTE
  }
}

export function visibleSections(
  content: SummaryContent,
  template: SummaryTemplate
): SummarySection[] {
  return content.sections.filter(
    (s) => template.sections.includes(s.key) && s.items.length > 0
  )
}

// ---------- 模板 ----------

export function normalizeSummaryTemplate(value: unknown): SummaryTemplate {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_SUMMARY_TEMPLATE, sections: [...SUMMARY_SECTION_KEYS] }
  }
  const obj = value as Record<string, unknown>
  const sections = Array.isArray(obj.sections)
    ? (obj.sections.filter((s): s is SummarySectionKey =>
        SUMMARY_SECTION_KEYS.includes(s as SummarySectionKey)
      ) as SummarySectionKey[])
    : []
  return {
    include_stats: typeof obj.include_stats === 'boolean' ? obj.include_stats : true,
    include_note: typeof obj.include_note === 'boolean' ? obj.include_note : true,
    sections: sections.length ? [...new Set(sections)] : [...SUMMARY_SECTION_KEYS]
  }
}

export function parseSummaryTemplate(raw: string | null | undefined): SummaryTemplate {
  if (!raw) return normalizeSummaryTemplate(null)
  try {
    return normalizeSummaryTemplate(JSON.parse(raw))
  } catch {
    return normalizeSummaryTemplate(null)
  }
}

// ---------- 导出文本 ----------

/** 纯文本导出内容(Word/PDF 共用相同的章节口径) */
export function renderSummaryText(payload: SummaryExportPayload): string {
  const lines: string[] = [payload.title, payload.periodLabel, '']
  if (payload.template.include_stats) {
    lines.push(
      `完成工作项 ${payload.stats.completed} 项 · 参加会议 ${payload.stats.meetings} 场 · ` +
        `对接事项 ${payload.stats.contacts} 项 · 输出报告 ${payload.stats.reports} 份`,
      ''
    )
  }
  const filled = payload.sections.filter((s) => s.items.length > 0)
  if (!filled.length) {
    lines.push('(本期暂无已完成事项)')
  }
  filled.forEach((section, si) => {
    lines.push(`${cnNumber(si + 1)}、${section.title}`)
    section.items.forEach((item, ii) => {
      const idx = String(ii + 1).padStart(2, '0')
      lines.push(`${idx}. ${item.title}${item.description ? ` — ${item.description}` : ''}`)
    })
    lines.push('')
  })
  if (payload.template.include_note && payload.note) {
    lines.push(`备注:${payload.note}`)
  }
  lines.push('', `生成时间:${payload.generatedAt}`)
  return lines.join('\n')
}

export function cnNumber(n: number): string {
  const cn = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
  return cn[n] ?? String(n)
}

// ---------- 月末提醒 ----------

/** 当月最后一个工作日(周一至周五;不含法定节假日) */
export function lastWorkdayOfMonth(year: number, month: number): string {
  const d = new Date(year, month, 0)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1)
  return fmtDateStr(d)
}

export function isLastWorkday(date: string): boolean {
  const d = parseDateStr(date)
  if (!d) return false
  return date === lastWorkdayOfMonth(d.getFullYear(), d.getMonth() + 1)
}

/** 从本地时间字符串生成 'YYYY-MM-DD HH:MM' */
export function nowText(d = new Date()): string {
  return `${fmtDateStr(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
