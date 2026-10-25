/**
 * 例行事项系列仓储:保存每周重复模板与例外日期。
 * 每周期次本身仍存放在 events 表(series_id 关联),因此日历/统计/提醒无需特殊分支。
 */
import type { AttendeeRef, EventSeries } from '@shared/types'
import { asRow, asRows, getDb } from '../database'

type Row = Omit<EventSeries, 'attendees' | 'tags'> & {
  attendees: string
  tags: string
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function mapRow(row: Row): EventSeries {
  return {
    ...row,
    attendees: parseJson<AttendeeRef[]>(row.attendees, []),
    tags: parseJson<string[]>(row.tags, [])
  }
}

export interface SeriesInput {
  calendar_id?: number | null
  title: string
  description?: string
  start_time: string
  end_time: string
  location?: string
  attendees?: AttendeeRef[]
  category?: string
  tags?: string[]
  contact_id?: number | null
  reminder_enabled?: number
  reminder_minutes?: number | null
  reminder_days?: number | null
}

export function create(input: SeriesInput): EventSeries {
  const info = getDb()
    .prepare(
      `INSERT INTO event_series (calendar_id, title, description, start_time, end_time,
        location, attendees, category, tags, contact_id, reminder_enabled,
        reminder_minutes, reminder_days, generated_until)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
    )
    .run(
      input.calendar_id ?? null,
      input.title,
      input.description ?? '',
      input.start_time,
      input.end_time,
      input.location ?? '',
      JSON.stringify(input.attendees ?? []),
      input.category ?? '',
      JSON.stringify(input.tags ?? []),
      input.contact_id ?? null,
      input.reminder_enabled ?? 1,
      input.reminder_minutes ?? null,
      input.reminder_days ?? null
    )
  return get(Number(info.lastInsertRowid))
}

export function get(id: number): EventSeries {
  const row = asRow<Row>(getDb().prepare('SELECT * FROM event_series WHERE id = ?').get(id))
  if (!row) throw new Error(`例行事项系列不存在: id=${id}`)
  return mapRow(row)
}

export function listActive(): EventSeries[] {
  const rows = asRows<Row>(
    getDb().prepare('SELECT * FROM event_series WHERE active = 1 ORDER BY id').all()
  )
  return rows.map(mapRow)
}

export function update(id: number, patch: Partial<SeriesInput>): EventSeries {
  const current = get(id)
  const next = {
    calendar_id: patch.calendar_id !== undefined ? patch.calendar_id : current.calendar_id,
    title: patch.title ?? current.title,
    description: patch.description ?? current.description,
    start_time: patch.start_time ?? current.start_time,
    end_time: patch.end_time ?? current.end_time,
    location: patch.location ?? current.location,
    attendees: patch.attendees ?? current.attendees,
    category: patch.category ?? current.category,
    tags: patch.tags ?? current.tags,
    contact_id: patch.contact_id !== undefined ? patch.contact_id : current.contact_id,
    reminder_enabled: patch.reminder_enabled ?? current.reminder_enabled,
    reminder_minutes:
      patch.reminder_minutes !== undefined ? patch.reminder_minutes : current.reminder_minutes,
    reminder_days: patch.reminder_days !== undefined ? patch.reminder_days : current.reminder_days
  }
  getDb()
    .prepare(
      `UPDATE event_series SET calendar_id = ?, title = ?, description = ?, start_time = ?,
        end_time = ?, location = ?, attendees = ?, category = ?, tags = ?, contact_id = ?,
        reminder_enabled = ?, reminder_minutes = ?, reminder_days = ?,
        updated_at = datetime('now','localtime')
       WHERE id = ?`
    )
    .run(
      next.calendar_id,
      next.title,
      next.description,
      next.start_time,
      next.end_time,
      next.location,
      JSON.stringify(next.attendees),
      next.category,
      JSON.stringify(next.tags),
      next.contact_id,
      next.reminder_enabled,
      next.reminder_minutes,
      next.reminder_days,
      id
    )
  return get(id)
}

export function setGeneratedUntil(id: number, date: string): void {
  getDb()
    .prepare(
      `UPDATE event_series SET generated_until = ?, updated_at = datetime('now','localtime')
       WHERE id = ?`
    )
    .run(date, id)
}

export function remove(id: number): void {
  getDb().prepare('DELETE FROM event_series WHERE id = ?').run(id)
}

export function exceptions(seriesId: number): Set<string> {
  const rows = asRows<{ occurrence_date: string }>(
    getDb()
      .prepare('SELECT occurrence_date FROM event_series_exceptions WHERE series_id = ?')
      .all(seriesId)
  )
  return new Set(rows.map((r) => r.occurrence_date))
}

export function addException(seriesId: number, occurrenceDate: string): void {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO event_series_exceptions (series_id, occurrence_date)
       VALUES (?, ?)`
    )
    .run(seriesId, occurrenceDate)
}
