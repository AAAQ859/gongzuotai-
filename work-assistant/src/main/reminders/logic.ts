/**
 * 提醒引擎纯计算逻辑(不依赖 Electron/数据库,可在 tests/reminder-tests.ts 单测)。
 * 时间统一为本地时间字符串 'YYYY-MM-DD HH:MM'(与全应用口径一致)。
 *
 * 统计口径(板块 06 定型):
 * - 会议会前提醒:事件级 reminder_minutes 为空时回落全局设置 meeting_reminder_minutes(默认 15);
 *   reminder_enabled=0 为显式关闭(旧数据);已取消/已结束会议不提醒。
 * - 事项截止提醒:仅事件级 reminder_minutes 明确设置时提醒(编辑器默认 30 分钟,可选 1 天等);
 *   已取消/已完成不提醒;无截止时间不提醒。
 * - 晨间推送:每天 daily_push_time(默认 09:00)触发一次。
 * - 对接催办:存在已逾期未完成的「对接」事项时,每天触发一次汇总提醒。
 */
import { fmtCn } from '../../shared/reminder-text'

export interface ReminderEventLike {
  kind: 'task' | 'meeting'
  title: string
  start_time: string | null
  end_time: string | null
  location: string
  status: string
  category: string
  reminder_enabled: number
  reminder_minutes: number | null
  reminder_days: number | null
}

export interface ComputedReminder {
  remindAt: string
  type: 'event' | 'deadline'
  message: string
}

/** 日期时间字符串加减分钟('2026-10-21 09:30' + 45 → '2026-10-21 10:15') */
export function addMinutesStr(dateStr: string, mins: number): string {
  const [d, t] = dateStr.split(' ')
  const [y, m, day] = d.split('-').map(Number)
  const [hh, mm] = t.split(':').map(Number)
  const dt = new Date(y, m - 1, day, hh, mm + mins)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}`
}

/** 当前本地时间字符串 */
export function nowStr(d: Date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export { fmtCn } from '../../shared/reminder-text'

/** 计算事件提醒(会议按开始时间,事项按截止时间);不满足条件或已过期返回 null */
export function computeRemindAt(
  ev: ReminderEventLike,
  globalMeetingMins: number | null,
  now: string
): ComputedReminder | null {
  if (ev.status === 'cancelled' || ev.status === 'done') return null
  if (ev.kind === 'meeting') {
    if (!ev.start_time) return null
    if (!ev.reminder_enabled) return null
    const mins = ev.reminder_minutes ?? globalMeetingMins
    if (!mins || mins <= 0) return null
    const remindAt = addMinutesStr(ev.start_time, -mins)
    if (remindAt <= now) return null
    const where = ev.location ? ` · ${ev.location}` : ''
    return { remindAt, type: 'event', message: `「${ev.title}」将于 ${fmtCn(ev.start_time)} 开始${where}` }
  }
  // task:截止前提醒
  if (!ev.end_time) return null
  if (!ev.reminder_enabled) return null
  const mins = ev.reminder_minutes ?? (ev.reminder_days ? ev.reminder_days * 1440 : null)
  if (!mins || mins <= 0) return null
  const remindAt = addMinutesStr(ev.end_time, -mins)
  if (remindAt <= now) return null
  return { remindAt, type: 'deadline', message: `「${ev.title}」将于 ${fmtCn(ev.end_time)} 截止` }
}

/** 提醒消息追加对接人(引擎同步时查询联系人姓名后调用) */
export function withContact(message: string, contactName: string | null): string {
  return contactName ? `${message},对接人:${contactName}` : message
}

/** 下一个晨间推送时刻:今天 time 未过则今天,否则明天 */
export function nextDailyOccurrence(now: string, time: string): string {
  const [d] = now.split(' ')
  const candidate = `${d} ${time}`
  return candidate > now ? candidate : addMinutesStr(candidate, 1440)
}

/** 已逾期未完成的对接事项数(催办汇总口径) */
export function followupCount(events: ReminderEventLike[], now: string): number {
  return events.filter(
    (ev) =>
      ev.kind === 'task' &&
      ev.category === '对接' &&
      ev.status !== 'done' &&
      ev.status !== 'cancelled' &&
      !!ev.end_time &&
      (ev.end_time as string) < now
  ).length
}
