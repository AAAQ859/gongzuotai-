/**
 * 会议日历纯计算逻辑:日视图时间轴定位与重叠分列、下一场会议与倒计时、
 * 今日/明日会议清单汇总。不依赖 DOM / 数据库,可在测试中独立验证。
 * 注意:会议数据与日程日历互通(同一 events 表 kind='meeting'),此处仅会议场景的展示口径。
 */
import type { WorkEvent } from '@shared/types'
import { addDays, fmtDate, pad2 } from './dashboard'

/** 时间轴显示范围(PRD 4.5:08:00 - 18:00) */
export const TIMELINE_START = 8 * 60 // 480
export const TIMELINE_END = 18 * 60 // 1080

export interface TimelineBlock {
  ev: WorkEvent
  /** 距时间轴顶部的偏移(px),按 hourHeight 折算 */
  top: number
  height: number
  /** 重叠并排时该块的列位置(0 起) */
  col: number
  /** 该块所在列组的总列数 */
  cols: number
}

/** 'YYYY-MM-DD HH:MM' → 当日分钟数;空返回 null */
function toMinutes(t: string | null): number | null {
  if (!t) return null
  const [h, m] = t.slice(11).split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

/**
 * 日视图时间轴布局:会议块按开始/结束分钟定位,重叠会议自动并排分列。
 * 早于 08:00 的部分收敛到轴顶;开始时间不早于 18:00 的会议不参与布局(超出显示范围,
 * 仅在右侧清单中体现);无开始时间的会议不参与布局。
 */
export function layoutTimeline(meetings: WorkEvent[], hourHeight = 60): TimelineBlock[] {
  const items = meetings
    .filter((e) => {
      const m = toMinutes(e.start_time)
      return m != null && m < TIMELINE_END
    })
    .map((e) => {
      const start = Math.min(Math.max(toMinutes(e.start_time)!, TIMELINE_START), TIMELINE_END)
      const endRaw = toMinutes(e.end_time) ?? start + 30
      const end = Math.min(Math.max(endRaw, start + 15), TIMELINE_END)
      return { ev: e, start, end }
    })
    .sort((a, b) => a.start - b.start || (a.end - b.end))

  // 贪心分列:与已有列重叠则换下一列
  const colEnds: number[] = []
  const assigned = items.map((item) => {
    let col = colEnds.findIndex((end) => end <= item.start)
    if (col < 0) {
      col = colEnds.length
      colEnds.push(0)
    }
    colEnds[col] = item.end
    return { ...item, col }
  })
  // 列宽按「与该块实际重叠的块数」计:重叠聚成一组均分泳道,尾接/错峰的不被压窄
  return assigned.map((item) => {
    const cols = Math.max(
      1,
      assigned.filter((o) => o.start < item.end && o.end > item.start).length
    )
    return {
      ev: item.ev,
      top: ((item.start - TIMELINE_START) / 60) * hourHeight,
      height: ((item.end - item.start) / 60) * hourHeight,
      col: item.col,
      cols
    }
  })
}

/** 下一场会议(已开始未结束或未开始中最近的)+ 倒计时文案 */
export function nextMeeting(
  meetings: WorkEvent[],
  now: Date = new Date()
): { ev: WorkEvent; text: string } | null {
  const nowDt = `${fmtDate(now)} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`
  const cands = meetings.filter((e) => {
    if (!e.start_time) return false
    if (e.status === 'cancelled') return false
    if (e.end_time && e.end_time <= nowDt) return false
    return true
  })
  if (!cands.length) return null
  cands.sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
  const ev = cands[0]
  return { ev, text: countdownText(ev.start_time!, now) }
}

/** 倒计时文案:PRD 风格「还有 2 小时 15 分 / 还有 X 分钟 / 即将开始」 */
export function countdownText(startTime: string, now: Date = new Date()): string {
  const [d, t] = startTime.split(' ')
  const [y, m, dd] = d.split('-').map(Number)
  const [h, mi] = t.split(':').map(Number)
  const target = new Date(y, m - 1, dd, h, mi)
  const diff = target.getTime() - now.getTime()
  const mins = Math.round(diff / 60000)
  if (mins <= 0) return '即将开始'
  if (mins < 60) return `还有 ${mins} 分钟`
  const hh = Math.floor(mins / 60)
  const mm = mins % 60
  return mm > 0 ? `还有 ${hh} 小时 ${mm} 分` : `还有 ${hh} 小时`
}

/** 指定日期的会议(按时段排序) */
export function meetingsOn(meetings: WorkEvent[], dateStr: string): WorkEvent[] {
  return meetings
    .filter((e) => e.start_time?.slice(0, 10) === dateStr)
    .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
}

/** 清单汇总:共 N 场 · 已结束 M 场(PRD 右侧列表头部) */
export function meetingSummary(dayMeetings: WorkEvent[], now: Date = new Date()): {
  total: number
  ended: number
} {
  const nowDt = `${fmtDate(now)} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`
  const total = dayMeetings.filter((e) => e.status !== 'cancelled').length
  const ended = dayMeetings.filter(
    (e) => e.status !== 'cancelled' && e.end_time && e.end_time <= nowDt
  ).length
  return { total, ended }
}

/** 明日日期串 */
export function tomorrowOf(dateStr: string): string {
  return addDays(dateStr, 1)
}

/** 人名缩写(取首字符,用于头像) */
export function avatarText(name: string): string {
  return name.trim().charAt(0) || '?'
}

/** 会议地点图标:含「线上」/「视频」/「腾讯会议」等关键词用 💻,否则 📍 */
export function locationIcon(location: string): string {
  if (!location) return '📍'
  return /线上|视频|腾讯|Zoom|Teams|Webex/i.test(location) ? '💻' : '📍'
}
