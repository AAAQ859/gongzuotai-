import type { SQLInputValue } from 'node:sqlite'
import type { AttendeeRef, EventKind, EventStatus, TaskType, WorkEvent } from '@shared/types'
import { asRow, asRows, getDb } from '../database'
import { segmentForFts } from '../fts'

type Row = Omit<WorkEvent, 'attendees' | 'tags' | 'related_files'> & {
  attendees: string
  tags: string
  related_files: string
}

export interface EventFilter {
  from?: string
  to?: string
  status?: EventStatus
  calendarId?: number
  kind?: EventKind
  /** 关键词(标题/描述模糊匹配) */
  search?: string
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function mapRow(row: Row): WorkEvent {
  return {
    ...row,
    attendees: parseJson<AttendeeRef[]>(row.attendees, []),
    tags: parseJson<string[]>(row.tags, []),
    related_files: parseJson<string[]>(row.related_files, [])
  }
}

// ---------- 全文索引维护(分词逻辑见 ../fts) ----------

function indexFts(id: number, title: string, description: string): void {
  getDb()
    .prepare('INSERT INTO events_fts (rowid, title, description) VALUES (?, ?, ?)')
    .run(id, segmentForFts(title), segmentForFts(description))
}

function dropFts(id: number): void {
  getDb().prepare('DELETE FROM events_fts WHERE rowid = ?').run(id)
}

export function list(filter: EventFilter = {}): WorkEvent[] {
  const db = getDb()
  const conds: string[] = []
  const params: SQLInputValue[] = []
  if (filter.from) {
    conds.push('start_time >= ?')
    params.push(filter.from)
  }
  if (filter.to) {
    conds.push('start_time <= ?')
    params.push(filter.to)
  }
  if (filter.status) {
    conds.push('status = ?')
    params.push(filter.status)
  }
  if (filter.calendarId) {
    conds.push('calendar_id = ?')
    params.push(filter.calendarId)
  }
  if (filter.kind) {
    conds.push('kind = ?')
    params.push(filter.kind)
  }
  if (filter.search) {
    conds.push('(title LIKE ? OR description LIKE ?)')
    params.push(`%${filter.search}%`, `%${filter.search}%`)
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const rows = asRows<Row>(
    db.prepare(`SELECT * FROM events ${where} ORDER BY start_time, sort_order, id`).all(...params)
  )
  return rows.map(mapRow)
}

export function get(id: number): WorkEvent {
  const row = asRow<Row>(getDb().prepare('SELECT * FROM events WHERE id = ?').get(id))
  if (!row) throw new Error(`事项不存在: id=${id}`)
  return mapRow(row)
}

/** 某个例行系列已生成的全部期次(按开始时间排序) */
export function listBySeries(seriesId: number): WorkEvent[] {
  const rows = asRows<Row>(
    getDb()
      .prepare('SELECT * FROM events WHERE series_id = ? ORDER BY start_time, id')
      .all(seriesId)
  )
  return rows.map(mapRow)
}

export interface EventInput {
  calendar_id?: number | null
  kind?: EventKind
  title: string
  description?: string
  start_time?: string | null
  end_time?: string | null
  all_day?: number
  location?: string
  attendees?: AttendeeRef[]
  status?: EventStatus
  category?: string
  /** 事项类型:临时/例行;会议传 temporary(默认) */
  task_type?: TaskType
  /** 例行事项所属系列 id(仅系列服务内部使用) */
  series_id?: number | null
  tags?: string[]
  contact_id?: number | null
  reminder_enabled?: number
  reminder_minutes?: number | null
  reminder_days?: number | null
  related_files?: string[]
  sort_order?: number
}

export function create(input: EventInput): WorkEvent {
  const db = getDb()
  const info = db
    .prepare(
      `INSERT INTO events (calendar_id, kind, title, description, start_time, end_time, all_day,
        location, attendees, status, category, task_type, series_id, tags, contact_id, reminder_enabled,
        reminder_minutes, reminder_days, related_files, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.calendar_id ?? null,
      input.kind ?? 'task',
      input.title,
      input.description ?? '',
      input.start_time ?? null,
      input.end_time ?? null,
      input.all_day ?? 0,
      input.location ?? '',
      JSON.stringify(input.attendees ?? []),
      input.status ?? 'todo',
      input.category ?? '',
      input.task_type ?? 'temporary',
      input.series_id ?? null,
      JSON.stringify(input.tags ?? []),
      input.contact_id ?? null,
      input.reminder_enabled ?? 1,
      input.reminder_minutes ?? null,
      input.reminder_days ?? null,
      JSON.stringify(input.related_files ?? []),
      input.sort_order ?? 0
    )
  const id = Number(info.lastInsertRowid)
  indexFts(id, input.title, input.description ?? '')
  return get(id)
}

export function update(id: number, patch: Partial<EventInput>): WorkEvent {
  const db = getDb()
  const current = get(id)
  const next: Required<EventInput> = {
    calendar_id: patch.calendar_id !== undefined ? patch.calendar_id : current.calendar_id,
    kind: patch.kind ?? current.kind,
    title: patch.title ?? current.title,
    description: patch.description ?? current.description,
    start_time: patch.start_time !== undefined ? patch.start_time : current.start_time,
    end_time: patch.end_time !== undefined ? patch.end_time : current.end_time,
    all_day: patch.all_day ?? current.all_day,
    location: patch.location ?? current.location,
    attendees: patch.attendees ?? current.attendees,
    status: patch.status ?? current.status,
    category: patch.category ?? current.category,
    task_type: patch.task_type ?? current.task_type,
    series_id: patch.series_id !== undefined ? patch.series_id : current.series_id,
    tags: patch.tags ?? current.tags,
    contact_id: patch.contact_id !== undefined ? patch.contact_id : current.contact_id,
    reminder_enabled: patch.reminder_enabled ?? current.reminder_enabled,
    reminder_minutes:
      patch.reminder_minutes !== undefined ? patch.reminder_minutes : current.reminder_minutes,
    reminder_days: patch.reminder_days !== undefined ? patch.reminder_days : current.reminder_days,
    related_files: patch.related_files ?? current.related_files,
    sort_order: patch.sort_order ?? current.sort_order
  }
  db.prepare(
    `UPDATE events SET calendar_id = ?, kind = ?, title = ?, description = ?, start_time = ?,
      end_time = ?, all_day = ?, location = ?, attendees = ?, status = ?, category = ?,
      task_type = ?, series_id = ?, tags = ?, contact_id = ?, reminder_enabled = ?,
      reminder_minutes = ?, reminder_days = ?, related_files = ?, sort_order = ?,
      updated_at = datetime('now','localtime')
     WHERE id = ?`
  ).run(
    next.calendar_id,
    next.kind,
    next.title,
    next.description,
    next.start_time,
    next.end_time,
    next.all_day,
    next.location,
    JSON.stringify(next.attendees),
    next.status,
    next.category,
    next.task_type,
    next.series_id,
    JSON.stringify(next.tags),
    next.contact_id,
    next.reminder_enabled,
    next.reminder_minutes,
    next.reminder_days,
    JSON.stringify(next.related_files),
    next.sort_order,
    id
  )
  if (patch.title !== undefined || patch.description !== undefined) {
    dropFts(id)
    indexFts(id, next.title, next.description)
  }
  return get(id)
}

export function setStatus(id: number, status: EventStatus): WorkEvent {
  const db = getDb()
  db.prepare(
    `UPDATE events SET status = ?, completed_at = ?, updated_at = datetime('now','localtime')
     WHERE id = ?`
  ).run(status, status === 'done' ? now() : null, id)
  return get(id)
}

export function remove(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM events_fts WHERE rowid = ?').run(id)
  db.prepare('DELETE FROM events WHERE id = ?').run(id)
}

/** 全文检索(events_fts),供板块 10 使用;此处先行提供基础能力 */
export function searchFts(keyword: string, limit = 50): WorkEvent[] {
  const segmented = segmentForFts(keyword)
  if (!segmented) return []
  // 双引号短语匹配:确保分词后的字符按顺序相邻命中
  const query = `"${segmented.replace(/"/g, '')}"`
  const rows = asRows<Row>(
    getDb()
      .prepare(
        `SELECT e.* FROM events_fts f JOIN events e ON e.id = f.rowid
         WHERE events_fts MATCH ? ORDER BY rank LIMIT ?`
      )
      .all(query, limit)
  )
  return rows.map(mapRow)
}

function now(): string {
  return new Date()
    .toLocaleString('sv-SE', { hour12: false })
    .replace('T', ' ')
    .slice(0, 16)
}
