/**
 * 日程日历纯逻辑验收测试(utils/calendar.ts)。
 * 运行方式:npm run test:dashboard 之外的日历套件:npm run test:calendar
 */
import type { Calendar, WorkEvent } from '@shared/types'
import {
  WEEKDAY_HEADER,
  applyCalendarFilter,
  buildMonthGridSunday,
  buildWeekDays,
  countEventsByCalendar,
  countFollowupsDue,
  eventState,
  fmtTimeRange,
  groupCalendars,
  groupEventsByDay,
  layoutMonthCell,
  rangeTitle,
  shiftAnchor,
  viewRange
} from '../src/renderer/src/utils/calendar'
import { fmtDate, parseDate } from '../src/renderer/src/utils/dashboard'

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

console.log('【1】月视图网格(周日为首)')
const grid = buildMonthGridSunday(2026, 10)
check('表头为 周日..周六', WEEKDAY_HEADER.join('') === '日一二三四五六')
check('网格 42 格', grid.length === 42)
check('首格为 2026-09-27(周日)', grid[0].dateStr === '2026-09-27', grid[0].dateStr)
check('首格是周日', parseDate(grid[0].dateStr).getDay() === 0)
check('尾格为 2026-11-07(周六)', grid[41].dateStr === '2026-11-07', grid[41].dateStr)
check('含 10 月 1 日与 31 日', grid.some((c) => c.dateStr === '2026-10-01') && grid.some((c) => c.dateStr === '2026-10-31'))
check('前后月补位标记', grid.filter((c) => c.inMonth).length === 31 && grid.some((c) => !c.inMonth))

console.log('【2】周视图与范围')
// 2026-10-21 是周三 → 所在周自周日 10-18 起
const week = buildWeekDays(new Date(2026, 9, 21))
check('周视图 7 天', week.length === 7)
check('自周日 10-18 起', fmtDate(week[0]) === '2026-10-18', fmtDate(week[0]))
check('至周六 10-24 止', fmtDate(week[6]) === '2026-10-24', fmtDate(week[6]))

const anchor = new Date(2026, 9, 21)
check('月范围标题', rangeTitle('month', anchor) === '2026年10月')
check('周范围标题', rangeTitle('week', anchor) === '2026年10月18日 - 2026年10月24日')
check('日范围标题', rangeTitle('day', anchor) === '2026年10月21日 · 周三')

check('月视图范围', viewRange('month', anchor).from === '2026-10-01' && viewRange('month', anchor).to === '2026-10-31')
check('周视图范围', viewRange('week', anchor).from === '2026-10-18' && viewRange('week', anchor).to === '2026-10-24')
check('日视图范围', viewRange('day', anchor).from === '2026-10-21' && viewRange('day', anchor).to === '2026-10-21')

check('月切换 +1', fmtDate(shiftAnchor('month', anchor, 1)) === '2026-11-01')
check('月切换 -1 跨年', fmtDate(shiftAnchor('month', new Date(2026, 0, 15), -1)) === '2025-12-01')
check('周切换 +1', fmtDate(shiftAnchor('week', anchor, 1)) === '2026-10-28')
check('日切换 -1', fmtDate(shiftAnchor('day', anchor, -1)) === '2026-10-20')

// ---------- 事件夹具 ----------
let seq = 0
function mk(partial: Partial<WorkEvent>): WorkEvent {
  seq++
  return {
    id: seq,
    calendar_id: null,
    kind: 'task',
    title: `事项${seq}`,
    description: '',
    start_time: null,
    end_time: null,
    all_day: 0,
    location: '',
    attendees: [],
    status: 'todo',
    category: '',
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

console.log('【3】事件分组与月格布局')
const e1 = mk({ title: '早会', start_time: '2026-10-21 09:00' })
const e2 = mk({ title: '午会', start_time: '2026-10-21 14:00' })
const e3 = mk({ title: '跨月', start_time: '2026-09-30 10:00' })
const e4 = mk({ title: '下月', start_time: '2026-11-01 10:00' })
const e5 = mk({ title: '全天', start_time: null })

const byDay = groupEventsByDay([e1, e2, e3, e4, e5], '2026-10-01', '2026-10-31')
check('组内按时间排序', byDay.get('2026-10-21')?.[0].id === e1.id)
check('范围外不收录', !byDay.has('2026-09-30') && !byDay.has('2026-11-01'))
check('无开始时间不收录', ![...byDay.values()].flat().some((e) => e.id === e5.id))

const many = [1, 2, 3, 4, 5].map((i) => mk({ title: `第${i}条`, start_time: '2026-10-21 08:0' + i }))
const layout5 = layoutMonthCell(many)
check('5 条 → 显示 3 折叠 2', layout5.visible.length === 3 && layout5.more === 2)
const layout2 = layoutMonthCell(many.slice(0, 2))
check('2 条 → 全显示不折叠', layout2.visible.length === 2 && layout2.more === 0)

console.log('【4】侧栏计数与提醒横幅')
const c1 = mk({ calendar_id: 7, start_time: '2026-10-21 09:00' })
const c2 = mk({ calendar_id: 7, start_time: '2026-10-05 09:00' })
const c3 = mk({ calendar_id: 7, start_time: '2026-11-02 09:00' })
const c4 = mk({ calendar_id: 7, start_time: '2026-10-21 10:00', status: 'cancelled' })
check(
  '范围内非取消计数 = 2',
  countEventsByCalendar([c1, c2, c3, c4], 7, '2026-10-01', '2026-10-31') === 2
)

const NOW = new Date(2026, 9, 21, 10, 0)
const f1 = mk({ title: '对接A', category: '对接', end_time: '2026-10-24 18:00' })
const f2 = mk({ title: '对接B', category: '对接', end_time: '2026-10-20 18:00' })
const f3 = mk({ title: '对接C(下周)', category: '对接', end_time: '2026-10-26 18:00' })
const f4 = mk({ title: '对接D(完成)', category: '对接', end_time: '2026-10-22 18:00', status: 'done' })
const f5 = mk({ title: '非对接', category: '报告', end_time: '2026-10-22 18:00' })
check(
  '本周+逾期对接 = 2',
  countFollowupsDue([f1, f2, f3, f4, f5], NOW) === 2,
  `实际 ${countFollowupsDue([f1, f2, f3, f4, f5], NOW)}`
)

console.log('【5】时间文案与日历分组')
check('起止时间文案', fmtTimeRange(mk({ start_time: '2026-10-21 09:30', end_time: '2026-10-21 10:30' })) === '09:30 - 10:30')
check('仅开始时间', fmtTimeRange(mk({ start_time: '2026-10-21 09:30' })) === '09:30')
check('全天', fmtTimeRange(mk({ start_time: null })) === '全天')

const calList: Calendar[] = [
  { id: 1, name: '例行工作', color: '#12B886', kind: 'schedule', is_visible: 1, sort_order: 1, created_at: '' },
  { id: 2, name: '对接事项', color: '#339AF0', kind: 'schedule', is_visible: 1, sort_order: 2, created_at: '' },
  { id: 3, name: '客运部会议日程', color: '#F06595', kind: 'meeting', is_visible: 1, sort_order: 1, created_at: '' },
  { id: 4, name: '韩亚项目组', color: '#51CF66', kind: 'meeting', is_visible: 1, sort_order: 2, created_at: '' }
]
const groups = groupCalendars(calList)
check('我的日历 = schedule', groups[0].label === '我的日历' && groups[0].items.length === 2)
check('部门日历 = meeting', groups[1].label === '部门日历' && groups[1].items.length === 2)

console.log('【6】状态自动识别(手动优先,时间兜底)')
// NOW = 2026-10-21 10:00
const sNow = new Date(2026, 9, 21, 10, 0)
const sDone = mk({ status: 'done', start_time: '2026-10-21 09:00', end_time: '2026-10-21 11:00' })
const sCancel = mk({ status: 'cancelled', start_time: '2026-10-21 09:00', end_time: '2026-10-21 11:00' })
const sManual = mk({ status: 'in_progress', start_time: '2026-10-20 09:00', end_time: '2026-10-25 09:00' })
check('手动已完成优先', eventState(sDone, sNow).key === 'done' && eventState(sDone, sNow).label === '已完成')
check('手动已取消优先', eventState(sCancel, sNow).key === 'cancelled')
check('手动进行中优先', eventState(sManual, sNow).key === 'in_progress')
check(
  '未到开始时间 → 未开始',
  eventState(mk({ start_time: '2026-10-21 11:00', end_time: '2026-10-21 12:00' }), sNow).key === 'not_started'
)
check(
  '开始后未结束 → 进行中',
  eventState(mk({ start_time: '2026-10-21 09:00', end_time: '2026-10-21 11:00' }), sNow).key === 'in_progress'
)
check(
  '到结束时间 → 已结束',
  eventState(mk({ start_time: '2026-10-21 09:00', end_time: '2026-10-21 10:00' }), sNow).key === 'ended'
)
check(
  '开始时间即等于当前 → 进行中',
  eventState(mk({ start_time: '2026-10-21 10:00', end_time: '2026-10-21 12:00' }), sNow).key === 'in_progress'
)
check(
  '已逾期的今日事项 → 已结束',
  eventState(mk({ start_time: '2026-10-20 09:00', end_time: '2026-10-20 18:00' }), sNow).key === 'ended'
)
check(
  '仅开始时间已过 → 进行中',
  eventState(mk({ start_time: '2026-10-21 08:00' }), sNow).key === 'in_progress'
)
check(
  '仅开始时间未到 → 未开始',
  eventState(mk({ start_time: '2026-10-22 09:00' }), sNow).key === 'not_started'
)
check(
  '仅结束时间已过 → 已结束',
  eventState(mk({ end_time: '2026-10-20 18:00' }), sNow).key === 'ended'
)
check(
  '无任何时间 → 未开始(待安排)',
  eventState(mk({}), sNow).key === 'not_started'
)
check(
  '进行中事项提前手动完成 → 已完成',
  eventState(
    mk({ status: 'done', start_time: '2026-10-21 09:00', end_time: '2026-10-21 11:00' }),
    sNow
  ).key === 'done'
)

console.log('【7】侧栏筛选(只看该日历 × 勾选显隐)')
const fA = mk({ calendar_id: 1, start_time: '2026-10-21 09:00' })
const fB = mk({ calendar_id: 2, start_time: '2026-10-21 10:00' })
const fC = mk({ calendar_id: 1, start_time: '2026-10-21 11:00' })
const fNone = mk({ calendar_id: null, start_time: '2026-10-21 12:00' })
const all = [fA, fB, fC, fNone]
check(
  '只看日历1 → 仅该日历事项',
  applyCalendarFilter(all, 1, new Set()).map((e) => e.id).join() === `${fA.id},${fC.id}`
)
check(
  '无筛选时未分类事项可见',
  applyCalendarFilter(all, null, new Set()).some((e) => e.id === fNone.id)
)
check(
  '筛选日历1时未分类不可见',
  !applyCalendarFilter(all, 1, new Set()).some((e) => e.id === fNone.id)
)
check(
  '勾选隐藏叠加:隐藏日历2',
  applyCalendarFilter(all, null, new Set([2])).length === 3 &&
    !applyCalendarFilter(all, null, new Set([2])).some((e) => e.id === fB.id)
)
check(
  '筛选 + 隐藏同时生效',
  applyCalendarFilter(all, 1, new Set([1])).length === 0
)

console.log(`\n结果: ${passed} 项通过, ${failed} 项失败`)
if (failed > 0) {
  console.error('失败项:', failureDetails.join('; '))
  process.exit(1)
}
