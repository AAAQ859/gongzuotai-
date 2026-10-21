/**
 * 共享类型定义:主进程 / 预加载 / 渲染进程共用
 */

// ---------- 基础枚举 ----------

export type EventKind = 'task' | 'meeting'
export type EventStatus = 'todo' | 'in_progress' | 'done' | 'cancelled'
export type CalendarKind = 'schedule' | 'meeting'
export type ReminderType = 'event' | 'deadline' | 'followup' | 'daily'
export type ReminderStatus = 'pending' | 'fired' | 'dismissed'

// ---------- 实体 ----------

export interface Calendar {
  id: number
  name: string
  color: string
  kind: CalendarKind
  is_visible: number
  sort_order: number
  created_at: string
}

export interface AttendeeRef {
  contact_id: number | null
  name: string
}

export interface WorkEvent {
  id: number
  calendar_id: number | null
  kind: EventKind
  title: string
  description: string
  /** 'YYYY-MM-DD HH:MM' 本地时间 */
  start_time: string | null
  end_time: string | null
  all_day: number
  location: string
  attendees: AttendeeRef[]
  status: EventStatus
  /** 自定义分类标签(如:例行周报/对接事项/报告提交) */
  category: string
  tags: string[]
  /** 关联对接人 */
  contact_id: number | null
  reminder_enabled: number
  /** 提前 N 分钟提醒 */
  reminder_minutes: number | null
  /** 提前 N 天提醒 */
  reminder_days: number | null
  /** 关联文件路径列表 */
  related_files: string[]
  sort_order: number
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type ContactKind = 'person' | 'group'

export interface Contact {
  id: number
  name: string
  /** 'person' 个人联系人 / 'group' 微信群、钉钉群等群组记录 */
  kind: ContactKind
  department: string
  position: string
  phone: string
  wechat: string
  email: string
  remark: string
  avatar_color: string
  is_favorite: number
  /** 群组记录:群成员数 */
  member_count: number | null
  /** 群组记录:群用途(如「主要对接韩亚航班事宜」) */
  purpose: string
  created_at: string
  updated_at: string
}

export interface ContactGroup {
  id: number
  name: string
  icon: string
  sort_order: number
  created_at: string
}

export interface FileBoard {
  id: number
  name: string
  /** 板块对应的本地文件夹路径 */
  root_path: string
  icon: string
  color: string
  sort_order: number
  created_at: string
}

export interface FileItem {
  id: number
  board_id: number
  relative_path: string
  name: string
  ext: string
  size: number
  mtime: string
  indexed_at: string
}

export interface Reminder {
  id: number
  event_id: number | null
  /** 'YYYY-MM-DD HH:MM' */
  remind_at: string
  type: ReminderType
  message: string
  status: ReminderStatus
  created_at: string
  fired_at: string | null
}

export interface DbStatus {
  path: string
  schemaVersion: number
  tables: Record<string, number>
}

// ---------- IPC ----------

export interface DbResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

/** 数据库 IPC 操作名(database.ts 中的路由表与此保持一致) */
export const DB_ACTIONS = {
  dbStatus: 'db.status',
  calendarsList: 'calendars.list',
  calendarsCreate: 'calendars.create',
  calendarsUpdate: 'calendars.update',
  calendarsRemove: 'calendars.remove',
  eventsList: 'events.list',
  eventsGet: 'events.get',
  eventsCreate: 'events.create',
  eventsUpdate: 'events.update',
  eventsRemove: 'events.remove',
  eventsSetStatus: 'events.setStatus',
  contactsList: 'contacts.list',
  contactsCreate: 'contacts.create',
  contactsUpdate: 'contacts.update',
  contactsRemove: 'contacts.remove',
  contactsSetGroups: 'contacts.setGroups',
  contactsBatchCreate: 'contacts.batchCreate',
  contactsMemberships: 'contacts.memberships',
  contactsGroupsOf: 'contacts.groupsOf',
  groupsList: 'contactGroups.list',
  groupsCreate: 'contactGroups.create',
  groupsUpdate: 'contactGroups.update',
  groupsRemove: 'contactGroups.remove',
  boardsList: 'boards.list',
  boardsCreate: 'boards.create',
  boardsUpdate: 'boards.update',
  boardsRemove: 'boards.remove',
  remindersPending: 'reminders.pending',
  remindersCreate: 'reminders.create',
  remindersMarkFired: 'reminders.markFired',
  remindersDismiss: 'reminders.dismiss',
  settingsGet: 'settings.get',
  settingsSet: 'settings.set',
  settingsAll: 'settings.all'
} as const

export type DbAction = (typeof DB_ACTIONS)[keyof typeof DB_ACTIONS]

export interface DbApi {
  invoke<T = unknown>(action: DbAction, payload?: unknown): Promise<DbResult<T>>
}
