/**
 * 联络接口纯计算逻辑:通讯录导入解析(Excel 网格与 CSV 共用)、分组/类型/待跟进筛选与排序、对接事项联动。
 * 不依赖 DOM / 数据库,可在测试中独立验证(见 tests/contacts-tests.ts)。
 * 数据口径:通讯录同时容纳个人联系人与群组记录(PRD 4.6),二者同表、以 kind 区分。
 */
import type { Contact, WorkEvent } from '@shared/types'
import { addDays, dayDiff, fmtDate, pad2 } from './dashboard'

// ============ CSV 导入解析 ============

export interface CsvContact {
  name: string
  department: string
  position: string
  phone: string
  wechat: string
  email: string
  remark: string
}

/** 解析一行 CSV(支持双引号包裹与 "" 转义) */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuote = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuote = true
    } else if (ch === ',') {
      cells.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  cells.push(cur)
  return cells
}

/**
 * 解析通讯录表格网格(CSV 与 Excel 共用):首行可为表头(按列名识别,兼容 姓名/名称/name 等),
 * 无表头时按固定列序 姓名,部门,职位,电话,微信,邮箱,备注。缺姓名的行跳过并记录错误。
 */
export function parseContactsRows(grid: (string | number)[][]): { rows: CsvContact[]; errors: string[] } {
  const errors: string[] = []
  if (!grid.length || !grid.some((r) => r.some((c) => String(c).trim()))) {
    return { rows: [], errors: ['文件为空'] }
  }

  const header = grid[0].map((c) => String(c ?? '').trim())
  const hasHeader = header.some((h) => /姓名|名称|name/i.test(h))
  const col = (patterns: RegExp): number => (hasHeader ? header.findIndex((h) => patterns.test(h)) : -1)
  const idx = hasHeader
    ? {
        name: col(/姓名|名称|name/i),
        dept: col(/部门|单位|机构|公司/i),
        pos: col(/职位|职务|岗位/i),
        phone: col(/电话|手机|tel/i),
        wechat: col(/微信|wechat/i),
        email: col(/邮箱|邮件|email/i),
        remark: col(/备注|说明|remark/i)
      }
    : { name: 0, dept: 1, pos: 2, phone: 3, wechat: 4, email: 5, remark: 6 }

  const rows: CsvContact[] = []
  grid.slice(hasHeader ? 1 : 0).forEach((cells, i) => {
    if (!cells.some((c) => String(c).trim())) return
    const cell = (n: number): string => (n >= 0 && n < cells.length ? String(cells[n] ?? '').trim() : '')
    const name = cell(idx.name)
    if (!name) {
      errors.push(`第 ${i + (hasHeader ? 2 : 1)} 行缺少姓名,已跳过`)
      return
    }
    rows.push({
      name,
      department: cell(idx.dept),
      position: cell(idx.pos),
      phone: cell(idx.phone),
      wechat: cell(idx.wechat),
      email: cell(idx.email),
      remark: cell(idx.remark)
    })
  })
  return { rows, errors }
}

/** 解析通讯录 CSV 文本:先按行拆分为网格,再走 parseContactsRows(与 Excel 共用语义解析) */
export function parseContactsCsv(text: string): { rows: CsvContact[]; errors: string[] } {
  return parseContactsRows(text.split(/\r?\n/).map((l) => parseCsvLine(l)))
}

// ============ 待跟进联动(PRD 4.6 智能联动) ============

export interface FollowupInfo {
  due: boolean
  items: WorkEvent[]
}

/** 该联系人的待跟进对接事项:分类「对接」、未完成、有截止时间、已逾期或本周六(含)前截止 */
export function followupOf(contact: Contact, events: WorkEvent[], now: Date = new Date()): FollowupInfo {
  const today = fmtDate(now)
  const nowDt = `${today} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`
  const weekEnd = addDays(today, 6 - now.getDay())
  const items = events
    .filter(
      (e) =>
        e.kind === 'task' &&
        e.category === '对接' &&
        e.contact_id === contact.id &&
        e.status !== 'done' &&
        e.status !== 'cancelled' &&
        !!e.end_time &&
        (e.end_time! < nowDt || e.end_time! <= `${weekEnd} 23:59`)
    )
    .sort((a, b) => (a.end_time ?? '').localeCompare(b.end_time ?? ''))
  return { due: items.length > 0, items }
}

/** 截止文案:已逾期 / 今日 / 明日 / N天后 */
export function deadlineLabel(endTime: string, now: Date = new Date()): string {
  const today = fmtDate(now)
  const nowDt = `${today} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`
  if (endTime < nowDt) return '已逾期'
  const d = endTime.slice(0, 10)
  if (d === today) return '今日'
  if (d === addDays(today, 1)) return '明日'
  return `${dayDiff(today, d)}天后`
}

// ============ 筛选与排序 ============

export interface ContactFilter {
  /** null = 全部;伪分组「常用联系人」由调用方以 onlyFavorite 表达 */
  groupId: number | null
  q: string
  kind: 'all' | 'person' | 'group'
  onlyFavorite: boolean
  onlyFollowup: boolean
  followupIds: Set<number>
  /** contact_id → 所属分组 id 列表 */
  groupsOf: Map<number, number[]>
}

export function filterContacts(contacts: Contact[], f: ContactFilter): Contact[] {
  return contacts.filter((c) => {
    if (f.onlyFavorite && c.is_favorite !== 1) return false
    if (f.groupId != null && !(f.groupsOf.get(c.id) ?? []).includes(f.groupId)) return false
    if (f.kind !== 'all' && c.kind !== f.kind) return false
    if (f.onlyFollowup && !f.followupIds.has(c.id)) return false
    if (f.q) {
      const q = f.q.toLowerCase()
      const hay = [c.name, c.department, c.position, c.phone, c.wechat, c.email, c.remark, c.purpose]
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

export type ContactSortMode = 'name' | 'favorite' | 'followup'

export function sortContacts(
  list: Contact[],
  mode: ContactSortMode,
  followupIds: Set<number>
): Contact[] {
  const arr = [...list]
  if (mode === 'favorite') {
    arr.sort((a, b) => b.is_favorite - a.is_favorite || a.name.localeCompare(b.name, 'zh'))
  } else if (mode === 'followup') {
    arr.sort(
      (a, b) =>
        Number(followupIds.has(b.id)) - Number(followupIds.has(a.id)) ||
        a.name.localeCompare(b.name, 'zh')
    )
  } else {
    arr.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  }
  return arr
}
