/**
 * 渲染进程数据访问层:封装 window.api.db.invoke,提供类型化调用。
 * 各板块视图统一通过本文件访问数据,不直接触碰 IPC。
 */
import { DB_ACTIONS } from '@shared/types'
import type {
  Calendar,
  Contact,
  ContactGroup,
  DbAction,
  EventKind,
  EventStatus,
  Reminder,
  WorkEvent
} from '@shared/types'

async function invoke<T>(action: DbAction, payload?: unknown): Promise<T> {
  const res = await window.api.db.invoke<T>(action, payload)
  if (!res.ok) throw new Error(res.error ?? '数据库操作失败')
  return res.data as T
}

export interface EventFilter {
  from?: string
  to?: string
  status?: EventStatus
  calendarId?: number
  kind?: EventKind
}

export interface CreateEventInput {
  calendar_id?: number | null
  kind?: EventKind
  title: string
  description?: string
  start_time?: string | null
  end_time?: string | null
  location?: string
  attendees?: { contact_id: number | null; name: string }[]
  status?: EventStatus
  category?: string
  contact_id?: number | null
  reminder_enabled?: number
  reminder_minutes?: number | null
}

export const db = {
  calendars: {
    list: (kind?: 'schedule' | 'meeting'): Promise<Calendar[]> =>
      invoke(DB_ACTIONS.calendarsList, kind ? { kind } : undefined),
    create: (input: { name: string; color?: string; kind?: 'schedule' | 'meeting' }): Promise<Calendar> =>
      invoke(DB_ACTIONS.calendarsCreate, input),
    update: (id: number, patch: Partial<Pick<Calendar, 'name' | 'color' | 'is_visible' | 'sort_order'>>): Promise<Calendar> =>
      invoke(DB_ACTIONS.calendarsUpdate, { id, ...patch }),
    remove: (id: number): Promise<void> => invoke(DB_ACTIONS.calendarsRemove, { id })
  },
  events: {
    list: (filter?: EventFilter): Promise<WorkEvent[]> =>
      invoke(DB_ACTIONS.eventsList, filter ?? {}),
    get: (id: number): Promise<WorkEvent> => invoke(DB_ACTIONS.eventsGet, { id }),
    create: (input: CreateEventInput): Promise<WorkEvent> => invoke(DB_ACTIONS.eventsCreate, input),
    update: (id: number, patch: Partial<CreateEventInput>): Promise<WorkEvent> =>
      invoke(DB_ACTIONS.eventsUpdate, { id, ...patch }),
    remove: (id: number): Promise<void> => invoke(DB_ACTIONS.eventsRemove, { id }),
    setStatus: (id: number, status: EventStatus): Promise<WorkEvent> =>
      invoke(DB_ACTIONS.eventsSetStatus, { id, status })
  },
  contacts: {
    list: (search?: string): Promise<Contact[]> => invoke(DB_ACTIONS.contactsList, search ? { search } : undefined),
    create: (
      input: {
        name: string
        kind?: Contact['kind']
        department?: string
        position?: string
        phone?: string
        wechat?: string
        email?: string
        remark?: string
        avatar_color?: string
        is_favorite?: number
        member_count?: number | null
        purpose?: string
      }
    ): Promise<Contact> => invoke(DB_ACTIONS.contactsCreate, input),
    update: (
      id: number,
      patch: Partial<{
        name: string
        kind: Contact['kind']
        department: string
        position: string
        phone: string
        wechat: string
        email: string
        remark: string
        avatar_color: string
        is_favorite: number
        member_count: number | null
        purpose: string
      }>
    ): Promise<Contact> => invoke(DB_ACTIONS.contactsUpdate, { id, ...patch }),
    remove: (id: number): Promise<void> => invoke(DB_ACTIONS.contactsRemove, { id }),
    setGroups: (contactId: number, groupIds: number[]): Promise<{ groupIds: number[] }> =>
      invoke(DB_ACTIONS.contactsSetGroups, { contactId, groupIds }),
    batchCreate: (
      inputs: Array<{
        name: string
        kind?: Contact['kind']
        department?: string
        position?: string
        phone?: string
        wechat?: string
        email?: string
        remark?: string
      }>
    ): Promise<{ created: number }> => invoke(DB_ACTIONS.contactsBatchCreate, { inputs }),
    memberships: (): Promise<Array<{ contact_id: number; group_id: number }>> =>
      invoke(DB_ACTIONS.contactsMemberships),
    groupsOf: (id: number): Promise<number[]> => invoke(DB_ACTIONS.contactsGroupsOf, { id })
  },
  contactGroups: {
    list: (): Promise<ContactGroup[]> => invoke(DB_ACTIONS.groupsList),
    create: (input: { name: string; icon?: string }): Promise<ContactGroup> =>
      invoke(DB_ACTIONS.groupsCreate, input),
    update: (id: number, patch: Partial<Pick<ContactGroup, 'name' | 'icon'>>): Promise<ContactGroup> =>
      invoke(DB_ACTIONS.groupsUpdate, { id, ...patch }),
    remove: (id: number): Promise<void> => invoke(DB_ACTIONS.groupsRemove, { id })
  },
  reminders: {
    /** 尚未触发的提醒(可按时刻过滤,提醒中心待触发 tab) */
    pending: (before?: string): Promise<Reminder[]> =>
      invoke(DB_ACTIONS.remindersPending, before ? { before } : undefined),
    /** 全部提醒记录(按计划时刻倒序) */
    listAll: (): Promise<Reminder[]> => invoke(DB_ACTIONS.remindersListAll),
    dismiss: (id: number): Promise<void> => invoke(DB_ACTIONS.remindersDismiss, { id })
  },
  settings: {
    get: (key: string, defaultValue?: string): Promise<string> =>
      invoke(DB_ACTIONS.settingsGet, { key, defaultValue }),
    set: (key: string, value: string): Promise<void> =>
      invoke(DB_ACTIONS.settingsSet, { key, value })
  }
}
