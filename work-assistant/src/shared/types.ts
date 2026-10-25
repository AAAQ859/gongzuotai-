/**
 * 共享类型定义:主进程 / 预加载 / 渲染进程共用
 */

// ---------- 基础枚举 ----------

export type EventKind = 'task' | 'meeting'
/** 事项类型:临时事项(一次性/时间不固定) / 例行事项(每周固定星期与时间) */
export type TaskType = 'temporary' | 'routine'
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
  /** 事项类型;会议固定为 temporary,不参与循环 */
  task_type: TaskType
  /** 例行事项所属系列 id;一次性事项为 null。每一期仍是一条独立事项,可单独完成 */
  series_id: number | null
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

/**
 * 例行事项系列:保存每周重复的模板。
 * 每周期次在 events 表中落地为独立行(series_id 指向本表),可单独完成、编辑或删除。
 */
export interface EventSeries {
  id: number
  calendar_id: number | null
  title: string
  description: string
  /** 首次发生时间('YYYY-MM-DD HH:MM'),同时是每周重复的锚点 */
  start_time: string
  end_time: string
  location: string
  attendees: AttendeeRef[]
  category: string
  tags: string[]
  contact_id: number | null
  reminder_enabled: number
  reminder_minutes: number | null
  reminder_days: number | null
  /** 已生成到的最后一个周期日期('YYYY-MM-DD') */
  generated_until: string | null
  active: number
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
  summariesGet: 'summaries.get',
  summariesSave: 'summaries.save',
  summariesRemove: 'summaries.remove',
  remindersPending: 'reminders.pending',
  remindersListAll: 'reminders.listAll',
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
