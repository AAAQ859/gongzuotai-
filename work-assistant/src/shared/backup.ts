/**
 * 数据备份与恢复(板块 10)纯逻辑:
 * 备份包 = ZIP(manifest.json + work-assistant.db),不包含文件板块的实际文件。
 * 此模块只做清单构造/校验与文案,不依赖 Electron / 数据库,便于单元测试。
 */

export const BACKUP_APP = 'work-assistant'
export const BACKUP_KIND = 'work-assistant-backup'
export const BACKUP_VERSION = 1

export interface BackupCounts {
  calendars: number
  events: number
  contacts: number
  fileBoards: number
  fileItems: number
  summaryDrafts: number
  reminders: number
}

export interface BackupManifest {
  app: string
  kind: string
  version: number
  appVersion: string
  schemaVersion: number
  /** 'YYYY-MM-DD HH:MM' 本地时间 */
  createdAt: string
  counts: BackupCounts
  /** 备份包不含文件板块的实际文件,仅含索引 */
  includesFiles: boolean
}

export interface BackupCreateResult {
  path: string
  /** 字节 */
  size: number
  manifest: BackupManifest
}

export interface BackupRestoreResult {
  manifest: BackupManifest
  /** 恢复后实际读取到的数据量 */
  counts: BackupCounts
  /** 恢复前自动保存的当前数据副本 */
  safetyCopy: string
}

const COUNT_KEYS: Array<keyof BackupCounts> = [
  'calendars',
  'events',
  'contacts',
  'fileBoards',
  'fileItems',
  'summaryDrafts',
  'reminders'
]

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** 备份文件名:工作台助手备份-YYYYMMDD-HHmm.zip */
export function backupFileName(now: Date): string {
  return `工作台助手备份-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}.zip`
}

/** 构造完整清单(补全固定标识字段) */
export function buildBackupManifest(
  input: Omit<BackupManifest, 'app' | 'kind' | 'version'>
): BackupManifest {
  return { app: BACKUP_APP, kind: BACKUP_KIND, version: BACKUP_VERSION, ...input }
}

export type ManifestParseResult =
  | { ok: true; manifest: BackupManifest }
  | { ok: false; error: string }

/**
 * 校验备份清单。恢复前必须通过,避免误把其他 ZIP / 损坏数据当作备份。
 * 允许 schemaVersion 小于当前版本(恢复后由迁移自动升级),但拒绝更高版本。
 */
export function parseBackupManifest(raw: unknown): ManifestParseResult {
  if (!raw || typeof raw !== 'object') return { ok: false, error: '备份清单缺失或格式不正确' }
  const m = raw as Record<string, unknown>
  if (m.app !== BACKUP_APP) return { ok: false, error: '不是工作台助手的备份包' }
  if (m.kind !== BACKUP_KIND) return { ok: false, error: '备份包类型不正确' }
  if (m.version !== BACKUP_VERSION) {
    return { ok: false, error: `不支持的备份版本: ${String(m.version)}` }
  }
  if (typeof m.appVersion !== 'string' || !m.appVersion.trim()) {
    return { ok: false, error: '备份缺少应用版本信息' }
  }
  if (typeof m.schemaVersion !== 'number' || !Number.isInteger(m.schemaVersion) || m.schemaVersion < 1) {
    return { ok: false, error: '备份缺少数据库结构版本' }
  }
  if (typeof m.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(m.createdAt)) {
    return { ok: false, error: '备份缺少创建时间' }
  }
  if (m.includesFiles !== false) {
    return { ok: false, error: '备份格式不受支持(文件标记异常)' }
  }
  const counts = m.counts
  if (!counts || typeof counts !== 'object') return { ok: false, error: '备份缺少数据统计' }
  const c = counts as Record<string, unknown>
  for (const key of COUNT_KEYS) {
    const v = c[key]
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
      return { ok: false, error: `备份数据统计异常: ${key}` }
    }
  }
  return { ok: true, manifest: raw as BackupManifest }
}

/** 清单转人类可读摘要(备份/恢复成功提示) */
export function countsSummary(counts: BackupCounts): string {
  return [
    `${counts.calendars} 个日历`,
    `${counts.events} 条事项`,
    `${counts.contacts} 位联系人`,
    `${counts.fileBoards} 个文件板块`,
    `${counts.fileItems} 条文件索引`,
    `${counts.summaryDrafts} 份纲要草稿`,
    `${counts.reminders} 条提醒`
  ].join(' · ')
}
