/**
 * 会议日历纯逻辑验收测试(utils/meeting.ts)。
 * 运行方式:npm run test:meeting
 */
import type { WorkEvent } from '@shared/types'
import {
  layoutTimeline,
  nextMeeting,
  countdownText,
  meetingSummary,
  meetingsOn,
  tomorrowOf,
  avatarText,
  locationIcon,
  TIMELINE_END,
  TIMELINE_START
} from '../src/renderer/src/utils/meeting'

let passed = 0
let failed = 0
const failureDetails: string[] = []

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    failureDetails.push(name + (detail ? `(${detail})` : ''))
    console.log(`  ✗ ${name}${detail ? `  ${detail}` : ''}`)
  }
}

let seq = 0
function mk(partial: Partial<WorkEvent>): WorkEvent {
  seq++
  return {
    id: seq,
    calendar_id: null,
    kind: 'meeting',
    title: `会议${seq}`,
    description: '',
    start_time: null,
    end_time: null,
    all_day: 0,
    location: '',
    attendees: [],
    status: 'todo',
    category: '',
    task_type: 'temporary',
    series_id: null,
    tags: [],
    contact_id: null,
    reminder_enabled: 1,
    reminder_minutes: null,
    reminder_days: null,
    related_files: [],
    sort_order: 0,
    completed_at: null,
    created_at: '',
    updated_at: '',
    ...partial
  } as WorkEvent
}

console.log('【1】时间轴布局(08:00-18:00,60px/小时)')
const m1 = mk({ title: '部门例会', start_time: '2026-10-21 09:30', end_time: '2026-10-21 10:30' })
const m2 = mk({ title: '韩亚协调会', start_time: '2026-10-21 14:00', end_time: '2026-10-21 15:00' })
const m3 = mk({ title: '早间站会', start_time: '2026-10-21 07:30', end_time: '2026-10-21 08:30' })
const m4 = mk({ title: '晚间复盘', start_time: '2026-10-21 17:30', end_time: '2026-10-21 19:00' })
const m5 = mk({ title: '无时间待定', start_time: null })
const m6 = mk({ title: '仅开始时间', start_time: '2026-10-21 11:00' })

const blocks = layoutTimeline([m3, m1, m4, m2, m5, m6])
check('无开始时间不参与布局', !blocks.some((b) => b.ev.id === m5.id))
check('按开始时间排序', blocks.map((b) => b.ev.id).join(',') === `${m3.id},${m1.id},${m6.id},${m2.id},${m4.id}`)
check(
  '09:30 会议 top=90px',
  blocks.find((b) => b.ev.id === m1.id)?.top === 90,
  String(blocks.find((b) => b.ev.id === m1.id)?.top)
)
check('60 分钟会议 height=60px', blocks.find((b) => b.ev.id === m1.id)?.height === 60)
check('早于 08:00 收敛到轴顶(top=0)', blocks.find((b) => b.ev.id === m3.id)?.top === 0)
check('早于 08:00 的会议按边界截断', blocks.find((b) => b.ev.id === m3.id)?.height === 30)
check('晚于 18:00 收敛到轴底', blocks.find((b) => b.ev.id === m4.id)?.height === 30)
check('无结束时间默认 30 分钟', blocks.find((b) => b.ev.id === m6.id)?.height === 30)
check('无重叠时单列', blocks.every((b) => b.cols === 1 && b.col === 0))

const m7 = mk({ title: '晚间会议(超出范围)', start_time: '2026-10-21 20:00', end_time: '2026-10-21 21:00' })
check('开始于 18:00 及之后的会议不进时间轴', !layoutTimeline([m7]).length)

console.log('【2】重叠会议并排分列')
const o1 = mk({ title: '重叠A', start_time: '2026-10-21 10:00', end_time: '2026-10-21 12:00' })
const o2 = mk({ title: '重叠B', start_time: '2026-10-21 11:00', end_time: '2026-10-21 12:30' })
const o3 = mk({ title: '重叠C', start_time: '2026-10-21 10:30', end_time: '2026-10-21 11:30' })
const o4 = mk({ title: '尾接不重叠', start_time: '2026-10-21 12:30', end_time: '2026-10-21 13:00' })
const overlapped = layoutTimeline([o1, o2, o3, o4])
check('三重叠 → 3 列', overlapped.filter((b) => b.cols === 3).length === 3)
check('第一场在 0 列', overlapped.find((b) => b.ev.id === o1.id)?.col === 0)
check('第三场(10:30 先分列)在 1 列', overlapped.find((b) => b.ev.id === o3.id)?.col === 1)
check('第二场(两列均占)在 2 列', overlapped.find((b) => b.ev.id === o2.id)?.col === 2)
check('尾接(结束=开始)不重叠 → 复用 0 列', overlapped.find((b) => b.ev.id === o4.id)?.col === 0)
check('尾接会议不被压窄(单列全宽)', overlapped.find((b) => b.ev.id === o4.id)?.cols === 1)
check('时间轴常量 480-1080', TIMELINE_START === 480 && TIMELINE_END === 1080)

console.log('【3】下一场会议与倒计时')
const NOW = new Date(2026, 9, 21, 10, 0)
const n1 = mk({ title: '已结束', start_time: '2026-10-21 08:00', end_time: '2026-10-21 09:00' })
const n2 = mk({ title: '进行中', start_time: '2026-10-21 09:30', end_time: '2026-10-21 11:00' })
const n3 = mk({ title: '待开', start_time: '2026-10-21 14:00', end_time: '2026-10-21 15:00' })
const n4 = mk({ title: '已取消', start_time: '2026-10-21 13:00', end_time: '2026-10-21 14:00', status: 'cancelled' })
check(
  '进行中会议为下一场(即将开始)',
  nextMeeting([n1, n2, n3, n4], NOW)?.ev.id === n2.id,
  `实际 ${nextMeeting([n1, n2, n3, n4], NOW)?.ev.id}`
)
check('进行中倒计时文案 = 即将开始', nextMeeting([n2], NOW)?.text === '即将开始')
check('仅剩待开会议时选最早一场', nextMeeting([n1, n3], NOW)?.ev.id === n3.id)
check('已结束/已取消排除', nextMeeting([n1, n4], NOW) === null)
check('空列表 → null', nextMeeting([], NOW) === null)

console.log('【4】倒计时文案')
check('90 分钟 → 还有 1 小时 30 分', countdownText('2026-10-21 11:30', NOW) === '还有 1 小时 30 分')
check('45 分钟 → 还有 45 分钟', countdownText('2026-10-21 10:45', NOW) === '还有 45 分钟')
check('整 2 小时 → 还有 2 小时', countdownText('2026-10-21 12:00', NOW) === '还有 2 小时')
check('1 分钟 → 还有 1 分钟', countdownText('2026-10-21 10:01', NOW) === '还有 1 分钟')
check('已过开始 → 即将开始', countdownText('2026-10-21 09:59', NOW) === '即将开始')

console.log('【5】清单汇总 / 当日筛选 / 明日')
const NOW2 = new Date(2026, 9, 21, 12, 0)
const s1 = mk({ title: '上午会', start_time: '2026-10-21 09:00', end_time: '2026-10-21 10:00' })
const s2 = mk({ title: '下午会', start_time: '2026-10-21 14:00', end_time: '2026-10-21 15:00' })
const s3 = mk({ title: '已取消会', start_time: '2026-10-21 16:00', end_time: '2026-10-21 17:00', status: 'cancelled' })
const s4 = mk({ title: '明日会', start_time: '2026-10-22 10:00' })
const s5 = mk({ title: '晚间会', start_time: '2026-10-21 20:00', end_time: '2026-10-21 21:00' })
// meetingSummary 契约:入参为「当日会议」(视图侧已按日过滤),不含其他日期
check('汇总:共 3 场(不含取消)已结束 1 场', (() => {
  const r = meetingSummary([s1, s2, s3, s5], NOW2)
  return r.total === 3 && r.ended === 1
})(), JSON.stringify(meetingSummary([s1, s2, s3, s5], NOW2)))
check(
  '当日筛选按时段排序',
  meetingsOn([s3, s2, s1, s4], '2026-10-21').map((e) => e.id).join(',') === `${s1.id},${s2.id},${s3.id}`
)
check('明日 = 次日', tomorrowOf('2026-10-21') === '2026-10-22')
check('月末进位', tomorrowOf('2026-10-31') === '2026-11-01')
check('跨年进位', tomorrowOf('2026-12-31') === '2027-01-01')

console.log('【6】头像缩写与地点图标')
check('人名取首字符', avatarText('韩亚航空') === '韩')
check('空名 → ?', avatarText('  ') === '?')
check('线下地点 → 📍', locationIcon('天府B216') === '📍')
check('线上会议 → 💻', locationIcon('腾讯会议') === '💻')
check('Teams/Zoom 识别', locationIcon('Teams 会议') === '💻' && locationIcon('Zoom') === '💻')

console.log(`\n结果: ${passed} 项通过, ${failed} 项失败`)
if (failed > 0) {
  console.error('失败项:', failureDetails.join('; '))
  process.exit(1)
}
