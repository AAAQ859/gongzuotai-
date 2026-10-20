import type { Reminder, ReminderType } from '@shared/types'
import { asRow, asRows, getDb } from '../database'

export function listPending(before?: string): Reminder[] {
  const db = getDb()
  if (before) {
    return asRows<Reminder>(
      db
        .prepare(`SELECT * FROM reminders WHERE status = 'pending' AND remind_at <= ? ORDER BY remind_at`)
        .all(before)
    )
  }
  return asRows<Reminder>(
    db.prepare(`SELECT * FROM reminders WHERE status = 'pending' ORDER BY remind_at`).all()
  )
}

export function listByEvent(eventId: number): Reminder[] {
  return asRows<Reminder>(
    getDb().prepare('SELECT * FROM reminders WHERE event_id = ? ORDER BY remind_at').all(eventId)
  )
}

export interface ReminderInput {
  event_id?: number | null
  remind_at: string
  type: ReminderType
  message?: string
}

export function create(input: ReminderInput): Reminder {
  const db = getDb()
  const info = db
    .prepare('INSERT INTO reminders (event_id, remind_at, type, message) VALUES (?, ?, ?, ?)')
    .run(input.event_id ?? null, input.remind_at, input.type, input.message ?? '')
  const row = asRow<Reminder>(db.prepare('SELECT * FROM reminders WHERE id = ?').get(info.lastInsertRowid))
  if (!row) throw new Error('提醒创建失败')
  return row
}

export function markFired(id: number): void {
  getDb()
    .prepare(`UPDATE reminders SET status = 'fired', fired_at = datetime('now','localtime') WHERE id = ?`)
    .run(id)
}

export function dismiss(id: number): void {
  getDb()
    .prepare(`UPDATE reminders SET status = 'dismissed', fired_at = datetime('now','localtime') WHERE id = ?`)
    .run(id)
}

export function countByStatus(): Record<string, number> {
  const rows = asRows<{ status: string; c: number }>(
    getDb().prepare('SELECT status, COUNT(*) AS c FROM reminders GROUP BY status').all()
  )
  return { pending: 0, fired: 0, dismissed: 0, ...Object.fromEntries(rows.map((r) => [r.status, r.c])) }
}
