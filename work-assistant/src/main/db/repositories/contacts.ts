import type { Contact, ContactGroup } from '@shared/types'
import { asRow, asRows, getDb } from '../database'

// ---------- 联系人 ----------

export function list(search?: string): Contact[] {
  const db = getDb()
  if (search) {
    const like = `%${search}%`
    return asRows<Contact>(
      db
        .prepare(
          `SELECT * FROM contacts
           WHERE name LIKE ? OR department LIKE ? OR position LIKE ? OR phone LIKE ?
           ORDER BY is_favorite DESC, name`
        )
        .all(like, like, like, like)
    )
  }
  return asRows<Contact>(db.prepare('SELECT * FROM contacts ORDER BY is_favorite DESC, name').all())
}

export function get(id: number): Contact {
  const row = asRow<Contact>(getDb().prepare('SELECT * FROM contacts WHERE id = ?').get(id))
  if (!row) throw new Error(`联系人不存在: id=${id}`)
  return row
}

export interface ContactInput {
  name: string
  department?: string
  position?: string
  phone?: string
  wechat?: string
  email?: string
  remark?: string
  avatar_color?: string
  is_favorite?: number
}

export function create(input: ContactInput): Contact {
  const db = getDb()
  const info = db
    .prepare(
      `INSERT INTO contacts (name, department, position, phone, wechat, email, remark, avatar_color, is_favorite)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name,
      input.department ?? '',
      input.position ?? '',
      input.phone ?? '',
      input.wechat ?? '',
      input.email ?? '',
      input.remark ?? '',
      input.avatar_color ?? '#CED4DA',
      input.is_favorite ?? 0
    )
  return get(Number(info.lastInsertRowid))
}

export function update(id: number, patch: Partial<ContactInput>): Contact {
  const db = getDb()
  const current = get(id)
  const next = { ...current, ...patch }
  db.prepare(
    `UPDATE contacts SET name = ?, department = ?, position = ?, phone = ?, wechat = ?,
      email = ?, remark = ?, avatar_color = ?, is_favorite = ?, updated_at = datetime('now','localtime')
     WHERE id = ?`
  ).run(
    next.name,
    next.department,
    next.position,
    next.phone,
    next.wechat,
    next.email,
    next.remark,
    next.avatar_color,
    next.is_favorite,
    id
  )
  return get(id)
}

export function remove(id: number): void {
  getDb().prepare('DELETE FROM contacts WHERE id = ?').run(id)
}

/** 联系人所属分组 id 列表 */
export function groupIdsOf(contactId: number): number[] {
  const rows = asRows<{ group_id: number }>(
    getDb().prepare('SELECT group_id FROM contact_group_map WHERE contact_id = ?').all(contactId)
  )
  return rows.map((r) => r.group_id)
}

export function setGroups(contactId: number, groupIds: number[]): void {
  const db = getDb()
  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM contact_group_map WHERE contact_id = ?').run(contactId)
    const insert = db.prepare('INSERT INTO contact_group_map (contact_id, group_id) VALUES (?, ?)')
    for (const gid of groupIds) insert.run(contactId, gid)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

// ---------- 分组 ----------

export function listGroups(): ContactGroup[] {
  return asRows<ContactGroup>(
    getDb().prepare('SELECT * FROM contact_groups ORDER BY sort_order, id').all()
  )
}

export function getGroup(id: number): ContactGroup {
  const row = asRow<ContactGroup>(getDb().prepare('SELECT * FROM contact_groups WHERE id = ?').get(id))
  if (!row) throw new Error(`分组不存在: id=${id}`)
  return row
}

export function createGroup(input: { name: string; icon?: string; sort_order?: number }): ContactGroup {
  const db = getDb()
  const info = db
    .prepare('INSERT INTO contact_groups (name, icon, sort_order) VALUES (?, ?, ?)')
    .run(input.name, input.icon ?? '📁', input.sort_order ?? 0)
  return getGroup(Number(info.lastInsertRowid))
}

export function updateGroup(
  id: number,
  patch: Partial<Pick<ContactGroup, 'name' | 'icon' | 'sort_order'>>
): ContactGroup {
  const db = getDb()
  const current = getGroup(id)
  const next = { ...current, ...patch }
  db.prepare('UPDATE contact_groups SET name = ?, icon = ?, sort_order = ? WHERE id = ?').run(
    next.name,
    next.icon,
    next.sort_order,
    id
  )
  return getGroup(id)
}

export function removeGroup(id: number): void {
  getDb().prepare('DELETE FROM contact_groups WHERE id = ?').run(id)
}

export function listContactsByGroup(groupId: number): Contact[] {
  return asRows<Contact>(
    getDb()
      .prepare(
        `SELECT c.* FROM contacts c
         JOIN contact_group_map m ON m.contact_id = c.id
         WHERE m.group_id = ? ORDER BY c.name`
      )
      .all(groupId)
  )
}
