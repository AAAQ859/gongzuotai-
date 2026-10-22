/**
 * 数据备份与恢复(板块 10):
 * - 备份:VACUUM INTO 生成一致性数据库副本 + manifest,打包为 ZIP
 *   (含日程/会议/联系人/文件索引/纲要草稿/设置;不含文件板块的实际文件)
 * - 恢复:严格校验 ZIP 与清单 → 校验 SQLite 完整性/结构版本 → 自动保存当前数据安全副本
 *   → 替换数据库 → 重新打开并执行迁移(旧备份自动升级)
 * 截图验收可用 SCREENSHOT_BACKUP_DIR / SCREENSHOT_BACKUP_RESTORE 跳过系统对话框。
 */
import { app, BrowserWindow, dialog } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import AdmZip from 'adm-zip'
import { DatabaseSync } from 'node:sqlite'
import type {
  BackupCounts,
  BackupCreateResult,
  BackupManifest,
  BackupRestoreResult
} from '@shared/backup'
import { backupFileName, buildBackupManifest, parseBackupManifest } from '@shared/backup'
import { closeDatabase, dbFilePath, getDb, initDatabase, schemaVersion } from '../db/database'
import { migrations } from '../db/migrations'
import * as settingsRepo from '../db/repositories/settings'

const DB_ENTRY = 'work-assistant.db'
const MANIFEST_ENTRY = 'manifest.json'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function nowText(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 当前数据库各表数据量(只读当前连接,备份/恢复提示用) */
export function readCounts(): BackupCounts {
  const db = getDb()
  const count = (table: string): number =>
    (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c
  return {
    calendars: count('calendars'),
    events: count('events'),
    contacts: count('contacts'),
    fileBoards: count('file_boards'),
    fileItems: count('file_items'),
    summaryDrafts: count('summary_drafts'),
    reminders: count('reminders')
  }
}

/** 生成一致性的当前数据库副本(VACUUM INTO,自动合并 WAL) */
function vacuumInto(target: string): void {
  rmSync(target, { force: true })
  const escaped = target.replace(/'/g, "''")
  getDb().exec(`VACUUM INTO '${escaped}'`)
}

function defaultBackupDir(): string {
  return join(app.getPath('documents'), '工作台助手', '备份')
}

function uniqueTarget(dir: string, fileName: string): string {
  let target = join(dir, fileName)
  if (!existsSync(target)) return target
  const base = fileName.replace(/\.[^.]+$/, '')
  const ext = fileName.slice(base.length)
  let i = 2
  while (existsSync(join(dir, `${base} (${i})${ext}`))) i++
  return join(dir, `${base} (${i})${ext}`)
}

export async function createBackup(
  parent?: BrowserWindow | null
): Promise<BackupCreateResult | null> {
  const now = new Date()
  const fileName = backupFileName(now)
  const dir = defaultBackupDir()

  let target: string
  const forcedDir = process.env.SCREENSHOT_BACKUP_DIR
  if (forcedDir) {
    mkdirSync(forcedDir, { recursive: true })
    target = uniqueTarget(forcedDir, fileName)
  } else {
    mkdirSync(dir, { recursive: true })
    const options = {
      title: '备份工作台助手数据',
      defaultPath: join(dir, fileName),
      filters: [{ name: 'ZIP 备份包', extensions: ['zip'] }]
    }
    const res = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options)
    if (res.canceled || !res.filePath) return null
    target = res.filePath
  }

  const tmpDir = join(tmpdir(), 'work-assistant-backup', String(now.getTime()))
  const tmpDb = join(tmpDir, DB_ENTRY)
  try {
    mkdirSync(tmpDir, { recursive: true })
    vacuumInto(tmpDb)
    const manifest = buildBackupManifest({
      appVersion: app.getVersion(),
      schemaVersion: schemaVersion(),
      createdAt: nowText(now),
      counts: readCounts(),
      includesFiles: false
    })
    const zip = new AdmZip()
    zip.addLocalFile(tmpDb, '', DB_ENTRY)
    zip.addFile(MANIFEST_ENTRY, Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'))
    zip.writeZip(target)
    return { path: target, size: statSync(target).size, manifest }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

export async function restoreBackup(
  parent?: BrowserWindow | null
): Promise<BackupRestoreResult | null> {
  let zipPath: string
  const forced = process.env.SCREENSHOT_BACKUP_RESTORE
  if (forced) {
    zipPath = forced
  } else {
    const options = {
      title: '选择工作台助手备份包',
      properties: ['openFile' as const],
      filters: [{ name: 'ZIP 备份包', extensions: ['zip'] }]
    }
    const res = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (res.canceled || !res.filePaths.length) return null
    zipPath = res.filePaths[0]
  }

  if (!existsSync(zipPath)) throw new Error(`备份文件不存在: ${zipPath}`)

  // ---------- 1. 读取并校验备份包 ----------
  let zip: AdmZip
  try {
    zip = new AdmZip(zipPath)
  } catch {
    throw new Error('无法读取备份包,请确认文件为有效的 ZIP 格式')
  }
  const dbEntry = zip.getEntry(DB_ENTRY)
  const manifestEntry = zip.getEntry(MANIFEST_ENTRY)
  if (!dbEntry || !manifestEntry) throw new Error('备份包缺少数据库或清单文件')

  let rawManifest: unknown
  try {
    rawManifest = JSON.parse(zip.readAsText(MANIFEST_ENTRY))
  } catch {
    throw new Error('备份清单损坏,无法解析')
  }
  const parsed = parseBackupManifest(rawManifest)
  if (!parsed.ok) throw new Error(parsed.error)
  const manifest: BackupManifest = parsed.manifest

  const maxSupported = migrations.reduce((m, x) => Math.max(m, x.version), 0)
  if (manifest.schemaVersion > maxSupported) {
    throw new Error(
      `备份来自较新版本(数据库 v${manifest.schemaVersion},当前支持 v${maxSupported}),请先升级应用`
    )
  }

  // ---------- 2. 解压到临时目录并校验数据库 ----------
  const tmpDir = join(tmpdir(), 'work-assistant-restore', String(Date.now()))
  const tmpDb = join(tmpDir, DB_ENTRY)
  try {
    mkdirSync(tmpDir, { recursive: true })
    const dbData = zip.readFile(DB_ENTRY)
    if (!dbData) throw new Error('备份包中的数据库文件为空')
    writeFileSync(tmpDb, dbData)

    let check: DatabaseSync | null = null
    try {
      check = new DatabaseSync(tmpDb, { readOnly: true })
      const integrity = check.prepare('PRAGMA integrity_check').get() as { integrity_check?: string }
      if (integrity.integrity_check !== 'ok') throw new Error('备份数据库完整性校验失败')
      const tables = new Set(
        (
          check
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
            .all() as { name: string }[]
        ).map((r) => r.name)
      )
      for (const required of ['schema_migrations', 'events', 'contacts', 'settings']) {
        if (!tables.has(required)) throw new Error(`备份数据库缺少数据表: ${required}`)
      }
      const row = check.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as {
        v: number | null
      }
      if ((row.v ?? 0) > maxSupported) {
        throw new Error(`备份数据库结构 v${row.v} 高于当前应用,无法恢复`)
      }
    } finally {
      check?.close()
    }

    // ---------- 3. 自动保存当前数据安全副本 ----------
    const safetyDir = join(app.getPath('userData'), 'db', 'backups')
    mkdirSync(safetyDir, { recursive: true })
    const stamp = nowText(new Date()).replace(/[-: ]/g, '')
    const safetyCopy = uniqueTarget(safetyDir, `恢复前自动备份-${stamp}.db`)
    vacuumInto(safetyCopy)

    // ---------- 4. 替换数据库并重新打开(旧备份自动迁移) ----------
    const dbPath = dbFilePath(app.getPath('userData'))
    closeDatabase()
    try {
      for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) rmSync(f, { force: true })
      copyFileSync(tmpDb, dbPath)
      initDatabase(app.getPath('userData'))
    } catch (err) {
      // 替换后初始化失败:回滚到安全副本,避免应用处于无数据库状态
      try {
        for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) rmSync(f, { force: true })
        copyFileSync(safetyCopy, dbPath)
        initDatabase(app.getPath('userData'))
      } catch {
        // 回滚也失败时保留原始错误
      }
      throw new Error(
        `恢复失败,已尝试回滚: ${err instanceof Error ? err.message : String(err)}`
      )
    }

    // 记录本次恢复所用的备份包,避免恢复后「上次备份」信息回到旧值/丢失
    settingsRepo.set('last_backup_at', manifest.createdAt)
    settingsRepo.set('last_backup_path', zipPath)

    return {
      manifest,
      counts: readCounts(),
      safetyCopy
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

/** 读取备份包清单(恢复前预览用;目前 UI 直接恢复) */
export function readBackupManifest(zipPath: string): BackupManifest {
  const zip = new AdmZip(readFileSync(zipPath))
  const parsed = parseBackupManifest(JSON.parse(zip.readAsText(MANIFEST_ENTRY)))
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed.manifest
}

/** 默认备份目录(设置页提示用) */
export function backupDirPath(): string {
  return defaultBackupDir()
}
