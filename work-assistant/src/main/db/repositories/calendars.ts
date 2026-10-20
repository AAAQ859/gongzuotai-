import type { Calendar, CalendarKind } from '@shared/types'
import { asRow, asRows, getDb } from '../database'

export function list(kind?: CalendarKind): Calendar[] {
  const db = getDb()
  if (kind) {
    return asRows<Calendar>(
      db.prepare('SELECT * FROM calendars WHERE kind = ? ORDER BY sort_order, id').all(kind)
    )
  }
  return asRows<Calendar>(db.prepare('SELECT * FROM calendars ORDER BY sort_order, id').all())
}

export function create(input: Pick<Calendar, 'name'> & Partial<Calendar>): Calendar {
  const db = getDb()
  const info = db
    .prepare(
      `INSERT INTO calendars (name, color, kind, is_visible, sort_order)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      input.name,
      input.color ?? '#12B886',
      input.kind ?? 'schedule',
      input.is_visible ?? 1,
      input.sort_order ?? 0
    )
  return get(Number(info.lastInsertRowid))
}

export function update(id: number, patch: Partial<Omit<Calendar, 'id' | 'created_at'>>): Calendar {
  const db = getDb()
  const current = get(id)
  const next = { ...current, ...patch }
  db.prepare(
    `UPDATE calendars SET name = ?, color = ?, kind = ?, is_visible = ?, sort_order = ? WHERE id = ?`
  ).run(next.name, next.color, next.kind, next.is_visible, next.sort_order, id)
  return get(id)
}

export function remove(id: number): void {
  getDb().prepare('DELETE FROM calendars WHERE id = ?').run(id)
}

export function get(id: number): Calendar {
  const row = asRow<Calendar>(getDb().prepare('SELECT * FROM calendars WHERE id = ?').get(id))
  if (!row) throw new Error(`日历分类不存在: id=${id}`)
  return row
}
