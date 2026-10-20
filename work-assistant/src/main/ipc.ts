import { app, ipcMain } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import type { DbResult, DbStatus } from '@shared/types'
import { dbFilePath, schemaVersion } from './db/database'
import * as calendarsRepo from './db/repositories/calendars'
import * as eventsRepo from './db/repositories/events'
import * as contactsRepo from './db/repositories/contacts'
import * as boardsRepo from './db/repositories/boards'
import * as remindersRepo from './db/repositories/reminders'
import * as settingsRepo from './db/repositories/settings'

type Handler = (payload: unknown) => unknown

/** 数据库操作路由表:action 名与 shared/types.ts 的 DB_ACTIONS 保持一致 */
const handlers: Record<string, Handler> = {
  'db.status': (): DbStatus => {
    const tables = [
      'calendars',
      'events',
      'contacts',
      'contact_groups',
      'contact_group_map',
      'file_boards',
      'file_items',
      'reminders',
      'settings'
    ]
    const db = dbFilePath(app.getPath('userData'))
    // 行数统计走独立只读连接,避免与主连接相互阻塞
    const conn = new DatabaseSync(db, { readOnly: true })
    const counts: Record<string, number> = {}
    try {
      for (const t of tables) {
        const row = conn.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }
        counts[t] = row.c
      }
    } finally {
      conn.close()
    }
    return { path: db, schemaVersion: schemaVersion(), tables: counts }
  },

  // ---------- 日历分类 ----------
  'calendars.list': (p) => calendarsRepo.list((p as { kind?: 'schedule' | 'meeting' })?.kind),
  'calendars.create': (p) => calendarsRepo.create(p as Parameters<typeof calendarsRepo.create>[0]),
  'calendars.update': (p) => {
    const { id, ...patch } = p as { id: number }
    return calendarsRepo.update(id, patch)
  },
  'calendars.remove': (p) => calendarsRepo.remove((p as { id: number }).id),

  // ---------- 事项 ----------
  'events.list': (p) => eventsRepo.list((p ?? {}) as Parameters<typeof eventsRepo.list>[0]),
  'events.get': (p) => eventsRepo.get((p as { id: number }).id),
  'events.create': (p) => eventsRepo.create(p as Parameters<typeof eventsRepo.create>[0]),
  'events.update': (p) => {
    const { id, ...patch } = p as { id: number }
    return eventsRepo.update(id, patch)
  },
  'events.setStatus': (p) => {
    const { id, status } = p as { id: number; status: 'todo' | 'in_progress' | 'done' | 'cancelled' }
    return eventsRepo.setStatus(id, status)
  },
  'events.remove': (p) => eventsRepo.remove((p as { id: number }).id),

  // ---------- 联系人 ----------
  'contacts.list': (p) => contactsRepo.list((p as { search?: string })?.search),
  'contacts.create': (p) => contactsRepo.create(p as Parameters<typeof contactsRepo.create>[0]),
  'contacts.update': (p) => {
    const { id, ...patch } = p as { id: number }
    return contactsRepo.update(id, patch)
  },
  'contacts.remove': (p) => contactsRepo.remove((p as { id: number }).id),
  'contacts.setGroups': (p) => {
    const { contactId, groupIds } = p as { contactId: number; groupIds: number[] }
    contactsRepo.setGroups(contactId, groupIds)
    return { groupIds: contactsRepo.groupIdsOf(contactId) }
  },
  'contactGroups.list': () => contactsRepo.listGroups(),
  'contactGroups.create': (p) =>
    contactsRepo.createGroup(p as Parameters<typeof contactsRepo.createGroup>[0]),
  'contactGroups.update': (p) => {
    const { id, ...patch } = p as { id: number }
    return contactsRepo.updateGroup(id, patch)
  },
  'contactGroups.remove': (p) => contactsRepo.removeGroup((p as { id: number }).id),

  // ---------- 文件板块 ----------
  'boards.list': () => boardsRepo.list(),
  'boards.create': (p) => boardsRepo.create(p as Parameters<typeof boardsRepo.create>[0]),
  'boards.update': (p) => {
    const { id, ...patch } = p as { id: number }
    return boardsRepo.update(id, patch)
  },
  'boards.remove': (p) => boardsRepo.remove((p as { id: number }).id),

  // ---------- 提醒 ----------
  'reminders.pending': (p) => remindersRepo.listPending((p as { before?: string })?.before),
  'reminders.create': (p) =>
    remindersRepo.create(p as Parameters<typeof remindersRepo.create>[0]),
  'reminders.markFired': (p) => remindersRepo.markFired((p as { id: number }).id),
  'reminders.dismiss': (p) => remindersRepo.dismiss((p as { id: number }).id),

  // ---------- 设置 ----------
  'settings.get': (p) => {
    const { key, defaultValue } = p as { key: string; defaultValue?: string }
    return settingsRepo.get(key, defaultValue)
  },
  'settings.set': (p) => {
    const { key, value } = p as { key: string; value: string }
    settingsRepo.set(key, value)
    return { key, value }
  },
  'settings.all': () => settingsRepo.all()
}

export function registerIpc(): void {
  ipcMain.handle('db:invoke', (_event, action: string, payload?: unknown): DbResult => {
    try {
      const handler = handlers[action]
      if (!handler) return { ok: false, error: `未知操作: ${action}` }
      return { ok: true, data: handler(payload) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
