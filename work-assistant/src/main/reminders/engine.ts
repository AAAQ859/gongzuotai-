/**
 * 提醒引擎(板块 06):推送模型 + 定时触发。
 * - 事件保存/删除时同步其提醒行(syncEventReminders);应用启动时全量回填(syncAll)
 * - 每 REMINDER_TICK_MS(默认 30 秒,截图验收可用环境变量调快)检查到期提醒:
 *   标记 fired 并弹出 Windows 系统通知,点击通知聚焦窗口并跳转对应页面
 * - 晨间推送:每天 daily_push_time 一次(daily 行单行滚动)
 * - 对接催办:存在已逾期未完成的对接事项时每天一次汇总提醒
 * 纯计算逻辑见 logic.ts(有单测)。
 */
import { Notification } from 'electron'
import type { BrowserWindow } from 'electron'
import type { ReminderType } from '@shared/types'
import * as eventsRepo from '../db/repositories/events'
import * as contactsRepo from '../db/repositories/contacts'
import * as remindersRepo from '../db/repositories/reminders'
import * as settingsRepo from '../db/repositories/settings'
import { computeRemindAt, followupCount, nextDailyOccurrence, nowStr, withContact } from './logic'

const DEFAULT_TICK_MS = 30_000

/** 与事件关联的待触发提醒行同步:删除该事件所有 pending 行,再按当前设置重建一条 */
export function syncEventReminders(eventId: number): void {
  const ev = eventsRepo.get(eventId)
  // 删除该事件所有待触发行(含历史遗留的 pending,避免重复),再按当前设置重建一条
  remindersRepo.removePendingByEvent(eventId)
  const globalMins = parseMins(settingsRepo.get('meeting_reminder_minutes', '15'))
  const now = nowStr()
  const computed = computeRemindAt(ev, globalMins, now)
  if (!computed) return
  let contactName: string | null = null
  if (ev.contact_id != null) {
    try {
      contactName = contactsRepo.get(ev.contact_id).name
    } catch {
      contactName = null
    }
  }
  remindersRepo.create({
    event_id: eventId,
    remind_at: computed.remindAt,
    type: computed.type,
    message: withContact(computed.message, contactName)
  })
}

/** 全量回填:所有事件的提醒行 + 晨间推送行(应用启动时调用) */
export function syncAll(): void {
  for (const ev of eventsRepo.list()) {
    try {
      syncEventReminders(ev.id)
    } catch {
      // 单个事件回填失败不影响其余
    }
  }
  syncDaily()
}

/** 晨间推送行:保持唯一一条 pending daily,指向下一次推送时刻 */
export function syncDaily(): void {
  remindersRepo.removePendingByType('daily')
  const time = settingsRepo.get('daily_push_time', '09:00') || '09:00'
  remindersRepo.create({
    event_id: null,
    remind_at: nextDailyOccurrence(nowStr(), time),
    type: 'daily',
    message: '今日会议清单与待办事项晨间推送'
  })
}

function parseMins(v: string): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** 触发到期提醒:标记 fired 并弹系统通知 */
function fire(reminder: { id: number; event_id: number | null; remind_at: string; type: string; message: string }): void {
  let eventTitle = ''
  let location = ''
  if (reminder.event_id != null) {
    try {
      const ev = eventsRepo.get(reminder.event_id)
      eventTitle = ev.title
      location = ev.location
    } catch {
      // 事件已被删除(级联删除提醒行,正常不会走到)
    }
  }
  const titles: Record<string, string> = {
    event: '会前提醒',
    deadline: '截止提醒',
    followup: '对接事项催办',
    daily: '今日工作清单'
  }
  let body = reminder.message
  if (reminder.type === 'event' && location) body = `${reminder.message}`
  remindersRepo.markFired(reminder.id)
  showNotification(titles[reminder.type] ?? '提醒', body, reminder.type, reminder.event_id)
  // 通知渲染层刷新提醒中心(若已打开)
  getWin?.()?.webContents.send('app:reminders-changed')
  console.log(`[reminder] fired id=${reminder.id} type=${reminder.type} event=${eventTitle} at=${nowStr()}`)
}

/** 通知点击跳转路由(事件级提醒按类型导航) */
const NAV_BY_TYPE: Record<string, string> = {
  event: '#/meetings',
  deadline: '#/calendar',
  followup: '#/contacts',
  daily: '#/dashboard'
}

let getWin: (() => BrowserWindow | null) | null = null

function showNotification(title: string, body: string, type: string, eventId: number | null): void {
  const route = NAV_BY_TYPE[type] ?? '#/reminders'
  // 应用内通知兜底:系统 toast 被「勿扰/专注助手」或应用通知设置抑制时,窗口内仍可见。
  // 到点提醒常驻(persistent),不自动消失,直到用户点击或手动关闭——最小化/离开后回来也不错过
  getWin?.()?.webContents.send('app:in-app-notify', { title, body, route, persistent: true })
  if (!Notification.isSupported()) {
    console.log('[reminder] Notification unsupported, skip toast')
    return
  }
  const n = new Notification({ title, body, silent: false })
  n.on('click', () => {
    const win = getWin?.()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      win.webContents.send('app:navigate', route)
    }
  })
  n.show()
}

/** 一轮检查:到期 pending 行触发;催办汇总按天触发 */
function tick(): void {
  const now = nowStr()
  for (const r of remindersRepo.listPending(now)) {
    // 会议提醒:会议已结束(错过窗口)则静默忽略,不再打扰
    if (r.type === 'event' && r.event_id != null) {
      try {
        const ev = eventsRepo.get(r.event_id)
        if (ev.end_time && ev.end_time <= now) {
          remindersRepo.dismiss(r.id)
          console.log(`[reminder] missed meeting reminder dismissed id=${r.id}`)
          continue
        }
      } catch {
        continue
      }
    }
    fire(r)
  }
  // 对接催办:每天一次
  const today = now.slice(0, 10)
  const firedToday = (type: ReminderType): boolean =>
    remindersRepo
      .listByTypeFiredSince(type, today)
      .length > 0
  const overdue = followupCount(eventsRepo.list(), now)
  if (overdue > 0 && !firedToday('followup')) {
    const r = remindersRepo.create({
      event_id: null,
      remind_at: now,
      type: 'followup',
      message: `有 ${overdue} 项对接事项已逾期,请及时跟进`
    })
    fire(r)
  }
}

/** 启动引擎:立即回填一次并开始定时检查 */
export function startEngine(winProvider: () => BrowserWindow | null): void {
  getWin = winProvider
  try {
    syncAll()
  } catch (err) {
    console.error('[reminder] syncAll failed:', err)
  }
  const tickMs = Number(process.env.REMINDER_TICK_MS) || DEFAULT_TICK_MS
  setInterval(() => {
    try {
      tick()
    } catch (err) {
      console.error('[reminder] tick failed:', err)
    }
  }, tickMs)
}

/** 设置变更联动(ipc 层调用):会议提醒分钟数 → 重算全部会议;推送时间 → 重建 daily 行 */
export function onReminderSettingsChanged(key: string): void {
  if (key === 'meeting_reminder_minutes') {
    for (const ev of eventsRepo.list()) {
      if (ev.kind === 'meeting') {
        try {
          syncEventReminders(ev.id)
        } catch {
          // 忽略单个失败
        }
      }
    }
  }
  if (key === 'daily_push_time') syncDaily()
}
