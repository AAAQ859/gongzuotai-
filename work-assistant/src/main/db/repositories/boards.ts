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

export function listFileItems(boardId: number): { relative_path: string; name: string }[] {
  return getDb()
    .prepare('SELECT relative_path, name FROM file_items WHERE board_id = ? ORDER BY name')
    .all(boardId) as { relative_path: string; name: string }[]
}
