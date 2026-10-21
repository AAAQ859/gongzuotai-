import type { FileBoard } from '@shared/types'
import { asRow, asRows, getDb } from '../database'

export function list(): FileBoard[] {
  return asRows<FileBoard>(getDb().prepare('SELECT * FROM file_boards ORDER BY sort_order, id').all())
}

export function get(id: number): FileBoard {
  const row = asRow<FileBoard>(getDb().prepare('SELECT * FROM file_boards WHERE id = ?').get(id))
  if (!row) throw new Error(`板块不存在: id=${id}`)
  return row
}

export interface BoardInput {
  name: string
  root_path?: string
  icon?: string
  color?: string
  sort_order?: number
}

export function create(input: BoardInput): FileBoard {
  const db = getDb()
  const info = db
    .prepare('INSERT INTO file_boards (name, root_path, icon, color, sort_order) VALUES (?, ?, ?, ?, ?)')
    .run(input.name, input.root_path ?? '', input.icon ?? '📁', input.color ?? '#FFD43B', input.sort_order ?? 0)
  return get(Number(info.lastInsertRowid))
}

export function update(id: number, patch: Partial<BoardInput>): FileBoard {
  const db = getDb()
  const current = get(id)
  const next = { ...current, ...patch }
  db.prepare(
    'UPDATE file_boards SET name = ?, root_path = ?, icon = ?, color = ?, sort_order = ? WHERE id = ?'
  ).run(next.name, next.root_path, next.icon, next.color, next.sort_order, id)
  return get(id)
}

export function remove(id: number): void {
  getDb().prepare('DELETE FROM file_boards WHERE id = ?').run(id)
}

// ---------- 文件索引(板块 08 使用) ----------

export interface FileItemInput {
  relative_path: string
  name: string
  ext: string
  size: number
  mtime: string
  content: string
}

/** 整体替换某板块的文件索引(扫描结果全量落库,保证与磁盘一致) */
export function replaceFileItems(boardId: number, items: FileItemInput[]): void {
  const db = getDb()
  const del = db.prepare('DELETE FROM file_items WHERE board_id = ?')
  const ins = db.prepare(
    'INSERT INTO file_items (board_id, relative_path, name, ext, size, mtime, content) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  db.exec('BEGIN')
  try {
    del.run(boardId)
    for (const it of items) {
      ins.run(boardId, it.relative_path, it.name, it.ext, it.size, it.mtime, it.content)
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

/** 各板块文件数:boardId → count */
export function countsByBoard(): Record<number, number> {
  const rows = getDb()
    .prepare('SELECT board_id, COUNT(*) AS n FROM file_items GROUP BY board_id')
    .all() as { board_id: number; n: number }[]
  return Object.fromEntries(rows.map((r) => [r.board_id, r.n]))
}

export function listFileItems(boardId: number): { relative_path: string; name: string }[] {
  return getDb()
    .prepare('SELECT relative_path, name FROM file_items WHERE board_id = ? ORDER BY name')
    .all(boardId) as { relative_path: string; name: string }[]
}

export interface FileSearchRow {
  board_id: number
  board_name: string
  board_icon: string
  relative_path: string
  name: string
  ext: string
  size: number
  mtime: string
  content: string
  /** 名称命中(1)优先于仅内容命中(0) */
  name_hit: number
}

/** 索引检索:文件名或正文包含关键词(最多 limit 条;名称命中优先) */
export function searchFileItems(query: string, limit = 100): FileSearchRow[] {
  const q = query.trim()
  if (!q) return []
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  return getDb()
    .prepare(
      `SELECT i.board_id, b.name AS board_name, b.icon AS board_icon,
              i.relative_path, i.name, i.ext, i.size, i.mtime, i.content,
              CASE WHEN i.name LIKE ? ESCAPE '\\' THEN 1 ELSE 0 END AS name_hit
         FROM file_items i
         JOIN file_boards b ON b.id = i.board_id
        WHERE i.name LIKE ? ESCAPE '\\' OR i.content LIKE ? ESCAPE '\\'
        ORDER BY name_hit DESC, i.name
        LIMIT ?`
    )
    .all(like, like, like, limit) as unknown as FileSearchRow[]
}
