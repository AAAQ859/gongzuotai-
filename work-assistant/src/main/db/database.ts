import { DatabaseSync } from 'node:sqlite'
import type { SQLOutputValue } from 'node:sqlite'
import { join, dirname } from 'path'
import { mkdirSync } from 'fs'
import { migrations } from './migrations'
import { backfillFts } from './fts'

let db: DatabaseSync | null = null

/** node:sqlite 行结果转为实体类型 */
export function asRows<T>(rows: Record<string, SQLOutputValue>[]): T[] {
  return rows as unknown as T[]
}

export function asRow<T>(row: Record<string, SQLOutputValue> | undefined): T | undefined {
  return row as unknown as T | undefined
}

export function dbFilePath(dataDir: string): string {
  return join(dataDir, 'db', 'work-assistant.db')
}

/** 打开(必要时创建)数据库并执行迁移。数据目录使用 Electron userData。 */
export function initDatabase(dataDir: string): DatabaseSync {
  if (db) return db

  const path = dbFilePath(dataDir)
  mkdirSync(dirname(path), { recursive: true })

  db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db)
  return db
}

/** 仅测试使用:在指定目录打开独立数据库实例,并设为当前活动数据库 */
export function initDatabaseAt(dataDir: string): DatabaseSync {
  const path = dbFilePath(dataDir)
  mkdirSync(dirname(path), { recursive: true })
  const testDb = new DatabaseSync(path)
  testDb.exec('PRAGMA journal_mode = WAL')
  testDb.exec('PRAGMA foreign_keys = ON')
  migrate(testDb)
  db = testDb
  return testDb
}

/** 仅测试使用:关闭并清空当前数据库句柄 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

function migrate(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `)

  const appliedRows = database
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all() as { version: number }[]
  const applied = new Set(appliedRows.map((r) => r.version))

  let needsFtsBackfill = false
  for (const m of migrations) {
    if (applied.has(m.version)) continue
    database.exec('BEGIN')
    try {
      database.exec(m.up)
      database
        .prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
        .run(m.version, m.name)
      database.exec('COMMIT')
    } catch (err) {
      database.exec('ROLLBACK')
      throw new Error(`迁移 v${m.version}(${m.name}) 失败: ${err instanceof Error ? err.message : err}`)
    }
    if (m.version === 2) needsFtsBackfill = true
  }
  if (needsFtsBackfill) backfillFts(database)
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error('数据库未初始化:请先调用 initDatabase()')
  return db
}

export function schemaVersion(): number {
  const rows = getDb()
    .prepare('SELECT MAX(version) AS v FROM schema_migrations')
    .get() as { v: number | null }
  return rows.v ?? 0
}
