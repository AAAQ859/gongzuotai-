/**
 * 月末纲要草稿提醒(板块 09,PRD 4.7):
 * 每月最后一个工作日检查一次——若当月尚无纲要草稿,自动按已完成事项生成,
 * 并发送系统通知 + 应用内通知(点击跳转工作纲要页);同一月份只提醒一次。
 * 应用启动时检查,之后每小时检查(跨天/长期运行场景)。
 * 截图验收可用 SUMMARY_MONTH_END_FORCE=YYYY-MM-DD 模拟日期。
 */
import { Notification } from 'electron'
import type { BrowserWindow } from 'electron'
import {
  buildSummaryContent,
  fmtDateStr,
  isLastWorkday,
  monthRange,
  nowText,
  rangeSpanText,
  rangeTitle
} from '@shared/summary'
import * as eventsRepo from '../db/repositories/events'
import * as contactsRepo from '../db/repositories/contacts'
import * as summariesRepo from '../db/repositories/summaries'
import * as settingsRepo from '../db/repositories/settings'

const CHECK_MS = 60 * 60 * 1000
const REMINDED_KEY = 'summary_month_reminded'

function check(getWin: () => BrowserWindow | null): void {
  try {
    const now = new Date()
    const dateStr = process.env.SUMMARY_MONTH_END_FORCE || fmtDateStr(now)
    if (!isLastWorkday(dateStr)) return

    const monthKey = dateStr.slice(0, 7)
    if (settingsRepo.get(REMINDED_KEY) === monthKey) return

    const range = monthRange(monthKey)
    let draft = summariesRepo.get('month', monthKey)
    if (!draft) {
      const contacts = new Map(contactsRepo.list().map((c) => [c.id, c.name]))
      const content = buildSummaryContent(
        eventsRepo.list(),
        range,
        nowText(now),
        (id) => contacts.get(id)
      )
      draft = summariesRepo.save({
        period_type: 'month',
        period_key: monthKey,
        title: rangeTitle(range),
        range_start: range.start,
        range_end: range.end,
        content
      })
      console.log(`[summary] 已生成 ${monthKey} 月度纲要草稿 id=${draft.id}`)
    }

    settingsRepo.set(REMINDED_KEY, monthKey)
    const title = '📝 月度工作纲要'
    const body = `${rangeSpanText(range).replace('统计周期:', '')}已结束,纲要草稿已生成,点击查看并导出`
    try {
      if (Notification.isSupported()) new Notification({ title, body }).show()
    } catch (err) {
      console.warn('[summary] 系统通知发送失败:', err)
    }
    const win = getWin()
    if (win && !win.isDestroyed()) {
      win.webContents.send('app:in-app-notify', {
        title,
        body,
        route: '#/summary',
        persistent: false
      })
    }
  } catch (err) {
    console.warn('[summary] 月末检查失败:', err)
  }
}

export function startMonthlyReminder(getWin: () => BrowserWindow | null): void {
  // 延迟首次检查,等渲染层挂载 app:in-app-notify 监听器,避免启动瞬间的应用内通知丢失
  setTimeout(() => check(getWin), 3000)
  setInterval(() => check(getWin), CHECK_MS)
}

/** 供测试/截图验收直接触发一次 */
export function checkNow(getWin: () => BrowserWindow | null): void {
  check(getWin)
}
