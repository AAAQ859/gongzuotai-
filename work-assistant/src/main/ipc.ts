import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron'
import { mkdirSync, readFileSync } from 'node:fs'
import { extname } from 'node:path'
import * as XLSX from 'xlsx'
import { DatabaseSync } from 'node:sqlite'
import type { DbResult, DbStatus } from '@shared/types'
import type { FilesResult } from '@shared/files'
import type { BackupCreateResult, BackupRestoreResult } from '@shared/backup'
import { TRAY_CLOSE_KEY } from '@shared/tray'
import type {
  SummaryExportPayload,
  SummaryExportResult,
  SummaryFormat
} from '@shared/summary'
import { dbFilePath, schemaVersion } from './db/database'
import * as calendarsRepo from './db/repositories/calendars'
import * as eventsRepo from './db/repositories/events'
import type { EventInput } from './db/repositories/events'
import type { SeriesInput } from './db/repositories/series'
import * as contactsRepo from './db/repositories/contacts'
import * as boardsRepo from './db/repositories/boards'
import * as summariesRepo from './db/repositories/summaries'
import * as remindersRepo from './db/repositories/reminders'
import * as settingsRepo from './db/repositories/settings'
import * as reminderEngine from './reminders/engine'
import * as seriesService from './series/service'
import * as filesService from './files/service'
import { exportSummary } from './summary/export'
import { backupDirPath, createBackup, restoreBackup } from './backup/service'
import {
  applyAutoLaunchFromSettings,
  setAutoLaunch,
  showMainWindow,
  trayStatus
} from './tray'

type Handler = (payload: unknown) => unknown

/** 例行事项一次生成多期,逐期同步提醒;单期失败不影响整体 */
function syncReminders(ids: number[]): void {
  for (const id of ids) {
    try {
      reminderEngine.syncEventReminders(id)
    } catch {
      // 忽略单期提醒同步失败(事项本身已创建成功)
    }
  }
}

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
      'summary_drafts',
      'event_series',
      'event_series_exceptions',
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
  'events.create': (p) => {
    const input = p as EventInput
    // 例行事项:创建系列并展开未来 12 个月的独立期次,返回首期
    if (input.task_type === 'routine') {
      const result = seriesService.createSeries(input)
      syncReminders(result.createdIds)
      return result.first
    }
    const row = eventsRepo.create(input)
    reminderEngine.syncEventReminders(row.id)
    return row
  },
  'events.update': (p) => {
    const { id, scope, ...patch } = p as { id: number; scope?: 'one' | 'series' } & Partial<EventInput>
    const current = eventsRepo.get(id)
    if (scope === 'series' && current.series_id != null) {
      const seriesPatch: Partial<SeriesInput> = {
        calendar_id: patch.calendar_id,
        title: patch.title,
        description: patch.description,
        start_time: patch.start_time ?? undefined,
        end_time: patch.end_time ?? undefined,
        location: patch.location,
        attendees: patch.attendees,
        category: patch.category,
        tags: patch.tags,
        contact_id: patch.contact_id,
        reminder_enabled: patch.reminder_enabled,
        reminder_minutes: patch.reminder_minutes,
        reminder_days: patch.reminder_days
      }
      const result = seriesService.updateSeries(current.series_id, seriesPatch)
      syncReminders(result.createdIds)
      // 原期次可能已被重新生成;优先返回本期仍在的记录,其次返回剩余首期
      const remaining = eventsRepo.listBySeries(current.series_id)
      return remaining.find((e) => e.id === id) ?? result.first ?? remaining[0] ?? null
    }
    // 仅修改本次:把原发生日期登记为例外,后续系列续期不覆盖
    seriesService.markOccurrenceEdited(current)
    const row = eventsRepo.update(id, patch)
    reminderEngine.syncEventReminders(id)
    return row
  },
  'events.setStatus': (p) => {
    const { id, status } = p as { id: number; status: 'todo' | 'in_progress' | 'done' | 'cancelled' }
    const row = eventsRepo.setStatus(id, status)
    reminderEngine.syncEventReminders(id)
    return row
  },
  'events.remove': (p) => {
    const { id, scope } = p as { id: number; scope?: 'one' | 'series' }
    const ev = eventsRepo.get(id)
    if (scope === 'series' && ev.series_id != null) {
      seriesService.deleteSeries(ev.series_id)
    } else {
      seriesService.removeOccurrence(id, 'one')
    }
    return null
  },

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
  'boards.create': (p) => {
    // 板块即本地文件夹:未指定位置时在「文档\工作台助手\板块名」自动创建并回填 root_path;
    // 创建失败(无权限等)则回滚板块记录,避免出现没有落盘目录的空板块
    const row = boardsRepo.create(p as Parameters<typeof boardsRepo.create>[0])
    try {
      filesService.ensureBoardRoot(row.id)
    } catch (err) {
      boardsRepo.remove(row.id)
      throw err
    }
    return boardsRepo.get(row.id)
  },
  'boards.update': (p) => {
    const { id, ...patch } = p as { id: number } & Parameters<typeof boardsRepo.update>[1]
    const row = boardsRepo.update(id, patch)
    if (patch.root_path !== undefined) filesService.ensureBoardRoot(id)
    return row
  },
  'boards.remove': (p) => boardsRepo.remove((p as { id: number }).id),

  // ---------- 工作纲要(板块 09) ----------
  'summaries.get': (p) => {
    const { type, key } = p as { type: 'month' | 'week' | 'custom'; key: string }
    return summariesRepo.get(type, key)
  },
  'summaries.save': (p) => summariesRepo.save(p as Parameters<typeof summariesRepo.save>[0]),
  'summaries.remove': (p) => {
    const { type, key } = p as { type: 'month' | 'week' | 'custom'; key: string }
    summariesRepo.remove(type, key)
    return null
  },

  // ---------- 提醒 ----------
  'reminders.pending': (p) => remindersRepo.listPending((p as { before?: string })?.before),
  'reminders.listAll': () => remindersRepo.listAll(),
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
    reminderEngine.onReminderSettingsChanged(key)
    return { key, value }
  },
  'settings.all': () => settingsRepo.all()
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function registerIpc(): void {
  ipcMain.handle('db:invoke', (_event, action: string, payload?: unknown): DbResult => {
    try {
      const handler = handlers[action]
      if (!handler) return { ok: false, error: `未知操作: ${action}` }
      return { ok: true, data: handler(payload) }
    } catch (err) {
      return { ok: false, error: errText(err) }
    }
  })

  // ---------- 文件板块(板块 08):板块=本地文件夹 ----------
  ipcMain.handle('files.defaultRoot', (): FilesResult<{ root: string }> => {
    return { ok: true, data: { root: filesService.defaultRootDir() } }
  })

  ipcMain.handle(
    'files.list',
    (_event, p: { boardId: number; path?: string }): FilesResult<{ dir: string; entries: unknown[] }> => {
      try {
        return { ok: true, data: filesService.listDir(p.boardId, p.path ?? '') }
      } catch (err) {
        return { ok: false, error: errText(err) }
      }
    }
  )

  ipcMain.handle('files.scan', (_event, p: { boardId: number }): FilesResult<{ files: number; folders: number }> => {
    try {
      return { ok: true, data: filesService.scanBoard(p.boardId) }
    } catch (err) {
      return { ok: false, error: errText(err) }
    }
  })

  ipcMain.handle(
    'files.scanAll',
    (): FilesResult<{ counts: Record<number, number>; errors: string[] }> => {
      try {
        const errors: string[] = []
        for (const b of boardsRepo.list()) {
          try {
            filesService.scanBoard(b.id)
          } catch (err) {
            errors.push(`${b.name}: ${errText(err)}`)
          }
        }
        return { ok: true, data: { counts: boardsRepo.countsByBoard(), errors } }
      } catch (err) {
        return { ok: false, error: errText(err) }
      }
    }
  )

  ipcMain.handle('files.counts', (): FilesResult<Record<number, number>> => {
    try {
      return { ok: true, data: boardsRepo.countsByBoard() }
    } catch (err) {
      return { ok: false, error: errText(err) }
    }
  })

  ipcMain.handle(
    'files.createFolder',
    (_event, p: { boardId: number; path?: string; name: string }): FilesResult<null> => {
      try {
        filesService.createFolder(p.boardId, p.path ?? '', p.name)
        return { ok: true, data: null }
      } catch (err) {
        return { ok: false, error: errText(err) }
      }
    }
  )

  ipcMain.handle(
    'files.upload',
    async (
      _event,
      p: { boardId: number; path?: string }
    ): Promise<FilesResult<{ copied: number } | null>> => {
      try {
        return { ok: true, data: await filesService.pickAndUpload(p.boardId, p.path ?? '') }
      } catch (err) {
        return { ok: false, error: errText(err) }
      }
    }
  )

  ipcMain.handle(
    'files.copyPaths',
    (_event, p: { boardId: number; path?: string; paths: string[] }): FilesResult<{ copied: number }> => {
      try {
        return { ok: true, data: filesService.copyFiles(p.boardId, p.path ?? '', p.paths ?? []) }
      } catch (err) {
        return { ok: false, error: errText(err) }
      }
    }
  )

  ipcMain.handle(
    'files.open',
    async (_event, p: { boardId: number; path: string }): Promise<FilesResult<null>> => {
      try {
        const res = await filesService.openFile(p.boardId, p.path)
        return res.ok ? { ok: true, data: null } : { ok: false, error: res.error }
      } catch (err) {
        return { ok: false, error: errText(err) }
      }
    }
  )

  ipcMain.handle(
    'files.reveal',
    (_event, p: { boardId: number; path: string }): FilesResult<null> => {
      try {
        const res = filesService.revealFile(p.boardId, p.path)
        return res.ok ? { ok: true, data: null } : { ok: false, error: res.error }
      } catch (err) {
        return { ok: false, error: errText(err) }
      }
    }
  )

  ipcMain.handle(
    'files.openBoardFolder',
    async (_event, p: { boardId: number }): Promise<FilesResult<null>> => {
      try {
        const err = await shell.openPath(filesService.ensureBoardRoot(p.boardId))
        return err ? { ok: false, error: err } : { ok: true, data: null }
      } catch (err) {
        return { ok: false, error: errText(err) }
      }
    }
  )

  ipcMain.handle('files.search', (_event, p: { query: string }): FilesResult<unknown[]> => {
    try {
      return { ok: true, data: filesService.search(p.query ?? '') }
    } catch (err) {
      return { ok: false, error: errText(err) }
    }
  })

  ipcMain.handle(
    'files.pickFolder',
    async (_event, p: { defaultPath?: string }): Promise<FilesResult<string | null>> => {
      try {
        return { ok: true, data: await filesService.pickFolder(p?.defaultPath) }
      } catch (err) {
        return { ok: false, error: errText(err) }
      }
    }
  )

  // ---------- 工作纲要导出(板块 09) ----------
  ipcMain.handle(
    'summary:export',
    async (
      event,
      p: { format: SummaryFormat; payload: SummaryExportPayload }
    ): Promise<FilesResult<SummaryExportResult | null>> => {
      try {
        const parent = BrowserWindow.fromWebContents(event.sender)
        return { ok: true, data: await exportSummary(p.format, p.payload, parent) }
      } catch (err) {
        return { ok: false, error: errText(err) }
      }
    }
  )

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

  // 测试提醒(设置页「测试通知」按钮):系统通知 + 应用内通知双通道。
  // 系统 toast 可能被 Windows「勿扰/专注助手」或该应用通知设置抑制(仅进通知中心不弹横幅),
  // 应用内通知保证用户始终能看到一次可见反馈。
  ipcMain.handle('shell:testNotification', async (event): Promise<{ ok: boolean; system: boolean; error?: string }> => {
    const title = '🔔 测试通知'
    const body = '工作台助手提醒功能正常'
    try {
      const supported = Notification.isSupported()
      if (supported) new Notification({ title, body }).show()
      // 测试通知为即时反馈,应用内卡片 8 秒自动消失(到点提醒才是常驻)
      event.sender.send('app:in-app-notify', { title, body, route: null, persistent: false })
      return { ok: true, system: supported }
    } catch (err) {
      return { ok: false, system: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // 打开 Windows 通知设置(设置页诊断提示;仅 win32)
  ipcMain.handle('shell:openNotificationSettings', async (): Promise<{ ok: boolean; error?: string }> => {
    if (process.platform !== 'win32') return { ok: false, error: '仅 Windows 支持打开通知设置' }
    try {
      await shell.openExternal('ms-settings:notifications')
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ---------- 系统托盘 / 开机自启(板块 10) ----------
  ipcMain.handle('app:trayStatus', () => trayStatus())

  ipcMain.handle('app:setCloseToTray', (_event, enabled: boolean) => {
    settingsRepo.set(TRAY_CLOSE_KEY, enabled ? '1' : '0')
    return trayStatus()
  })

  ipcMain.handle('app:setAutoLaunch', (_event, enabled: boolean) => {
    setAutoLaunch(!!enabled)
    return trayStatus()
  })

  ipcMain.handle('app:showWindow', () => {
    showMainWindow()
    return trayStatus()
  })

  // ---------- 数据备份 / 恢复(板块 10) ----------
  ipcMain.handle(
    'backup:create',
    async (event): Promise<FilesResult<BackupCreateResult | null>> => {
      try {
        const parent = BrowserWindow.fromWebContents(event.sender)
        return { ok: true, data: await createBackup(parent) }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle(
    'backup:restore',
    async (event): Promise<FilesResult<BackupRestoreResult | null>> => {
      try {
        const parent = BrowserWindow.fromWebContents(event.sender)
        const result = await restoreBackup(parent)
        // 备份内的设置可能改变开机自启意图,恢复后按新设置校正系统注册项
        if (result) applyAutoLaunchFromSettings()
        return { ok: true, data: result }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle('backup:dir', (): string => backupDirPath())

  ipcMain.handle('backup:openDir', async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      const dir = backupDirPath()
      mkdirSync(dir, { recursive: true })
      const err = await shell.openPath(dir)
      return err ? { ok: false, error: err } : { ok: true }
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
