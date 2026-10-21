/**
 * 提醒中心展示逻辑(纯函数,有单测)。文案生成复用 @shared/reminder-text(与主进程引擎一致)。
 */
import type { Reminder, ReminderType } from '@shared/types'
// 相对路径:纯逻辑单测(tsc → CommonJS)不经打包器,运行期无法解析 @shared 别名
import { followupScript, fmtCn } from '../../../shared/reminder-text'

export { followupScript, fmtCn }

export const TYPE_META: Record<ReminderType, { icon: string; label: string; route: string }> = {
  event: { icon: '📅', label: '会前提醒', route: '#/meetings' },
  deadline: { icon: '⏰', label: '截止提醒', route: '#/calendar' },
  followup: { icon: '🤝', label: '对接催办', route: '#/contacts' },
  daily: { icon: '🌅', label: '晨间推送', route: '#/dashboard' }
}

export const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: '待触发', cls: 'is-pending' },
  fired: { label: '已触发', cls: 'is-fired' },
  dismissed: { label: '已忽略', cls: 'is-dismissed' }
}

/** 提醒是否带催办话术(截止提醒且消息中含对接人) */
export function hasScript(r: Reminder): boolean {
  return r.type === 'deadline' && /对接人/.test(r.message)
}

/** 从提醒消息提取催办话术(消息内嵌对接人与截止;无则返回 null) */
export function scriptOf(r: Reminder): string | null {
  if (!hasScript(r)) return null
  const m = r.message.match(/「(.+?)」将于 (.+?) 截止/)
  if (!m) return null
  const name = r.message.match(/对接人:(.+)$/)?.[1] ?? ''
  return followupScript(name, m[1], m[2])
}

/** 按状态分组的 tab 计数文案 */
export function statusLabel(status: string, count: number): string {
  return `${STATUS_META[status]?.label ?? status}(${count})`
}
