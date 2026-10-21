import { app, dialog, ipcMain, shell } from 'electron'
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import * as XLSX from 'xlsx'
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
  'contacts.batchCreate': (p) =>
    contactsRepo.batchCreate((p as { inputs: Array<Parameters<typeof contactsRepo.create>[0]> }).inputs),
  'contacts.memberships': () => contactsRepo.memberships(),
  'contacts.groupsOf': (p) => contactsRepo.groupIdsOf((p as { id: number }).id),
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

  // ---------- 系统集成 ----------
  // 拨号:仅允许 tel: 协议唤起系统电话软件(用户确认的设计);其他协议一律拒绝
  ipcMain.handle('shell:openExternal', async (_event, url: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'tel:') return { ok: false, error: '仅支持 tel: 协议' }
      await shell.openExternal(url)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // 通讯录导入:选择 Excel/CSV 文件(仅选文件,内容由 file:readImportFile 读取解析)
  ipcMain.handle(
    'file:pickImportFile',
    async (): Promise<{ path: string; name: string } | null> => {
      const picked = await dialog.showOpenDialog({
        title: '选择通讯录文件',
        properties: ['openFile'],
        filters: [
          { name: 'Excel 文件', extensions: ['xlsx', 'xls'] },
          { name: 'CSV 文件', extensions: ['csv', 'txt'] }
        ]
      })
      if (picked.canceled || !picked.filePaths.length) return null
      const path = picked.filePaths[0]
      return { path, name: path.split(/[\\/]/).pop() ?? path }
    }
  )

  // 通讯录导入:读取并解析为表格网格。
  // - .xlsx/.xls:SheetJS 解析首个工作表,统一转字符串单元格(日期/数字原样取值)
  // - .csv/.txt:UTF-8 文本原样返回,由渲染层纯逻辑解析(可单测)
  ipcMain.handle(
    'file:readImportFile',
    async (
      _event,
      filePath: string
    ): Promise<{ kind: 'xlsx' | 'csv'; raw: string | string[][] }> => {
      const ext = extname(filePath).toLowerCase()
      if (ext === '.xlsx' || ext === '.xls') {
        const wb = XLSX.read(readFileSync(filePath), { type: 'buffer' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
          header: 1,
          raw: false,
          defval: ''
        })
        return { kind: 'xlsx', raw: rows.map((r) => r.map((c) => String(c ?? '').trim())) }
      }
      // 其余扩展名按 CSV 文本处理
      let text = readFileSync(filePath, 'utf8')
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
      return { kind: 'csv', raw: text }
    }
  )
}
