/**
 * 仪表盘纯逻辑验收测试(utils/dashboard.ts)。
 * 运行方式:npm run test:dashboard
 */
import type { WorkEvent } from '@shared/types'
import {
  addDays,
  buildMonthGrid,
  categoryColor,
  computeSummary,
  dayDiff,
  deadlineLabel,
  eventColorsByDay,
  fmtDate,
  fmtDateTime,
  greeting,
  parseDate,
  roundToNextHalfHour,
  startOfWeek,
  weekdayText
} from '../src/renderer/src/utils/dashboard'

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

// ---------- 日期工具 ----------

console.log('【1】日期格式化与运算')
check('fmtDate 格式', fmtDate(new Date(2026, 9, 21)) === '2026-10-21')
check('fmtDateTime 补零', fmtDateTime(new Date(2026, 9, 21, 9, 5)) === '2026-10-21 09:05')
check('addDays 跨月进位', addDays('2026-10-31', 1) === '2026-11-01')
check('addDays 跨年进位', addDays('2026-12-31', 2) === '2027-01-02')
check('dayDiff 计算', dayDiff('2026-10-20', '2026-10-23') === 3)
check('startOfWeek 周一', fmtDate(startOfWeek(new Date(2026, 9, 21))) === '2026-10-19')
check('weekdayText', weekdayText(new Date(2026, 9, 21)) === '三')

console.log('【2】问候与取整')
check('凌晨问候', greeting(3).text === '夜深了')
check('早上问候', greeting(8).text === '早上好')
check('中午问候', greeting(12).text === '中午好')
check('下午问候', greeting(15).text === '下午好')
check('晚上问候', greeting(19).text === '晚上好')
check('取整 10:15 → 10:30', fmtDateTime(roundToNextHalfHour(new Date(2026, 9, 21, 10, 15))) === '2026-10-21 10:30')
check('取整 10:45 → 11:00', fmtDateTime(roundToNextHalfHour(new Date(2026, 9, 21, 10, 45))) === '2026-10-21 11:00')
check('取整 10:00 不变', fmtDateTime(roundToNextHalfHour(new Date(2026, 9, 21, 10, 0))) === '2026-10-21 10:00')

// ---------- 汇总统计 ----------

// 固定"现在":2026-10-21(周三)10:00
const NOW = new Date(2026, 9, 21, 10, 0)
const D = (s: string): string => s

let seq = 0
function mk(partial: Partial<WorkEvent> & { title?: string }): WorkEvent {
  seq++
  return {
    id: seq,
    calendar_id: null,
    kind: 'task',
    title: partial.title ?? `事项${seq}`,
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

console.log('【3】仪表盘汇总计算')
const m1 = mk({ kind: 'meeting', title: '晨会', calendar_id: 1, start_time: D('2026-10-21 09:00'), end_time: D('2026-10-21 10:00') })
const m2 = mk({ kind: 'meeting', title: '下午协调会', calendar_id: 2, start_time: D('2026-10-21 14:00'), end_time: D('2026-10-21 15:30') })
const m3 = mk({ kind: 'meeting', title: '明日会议', start_time: D('2026-10-22 10:00'), end_time: D('2026-10-22 11:00') })
const t1 = mk({ title: '周一事项(已逾期)', start_time: D('2026-10-19 09:00'), end_time: D('2026-10-20 18:00') })
const t2 = mk({ title: '今日截止', start_time: D('2026-10-21 09:00'), end_time: D('2026-10-21 23:00') })
const t3 = mk({ title: '三天边界内', start_time: D('2026-10-21 09:00'), end_time: D('2026-10-23 23:59') })
const t4 = mk({ title: '三天边界外', start_time: D('2026-10-21 09:00'), end_time: D('2026-10-24 00:00') })
const t5 = mk({ title: '本周已完成', start_time: D('2026-10-20 09:00'), end_time: D('2026-10-20 18:00'), status: 'done' })
const t6 = mk({ title: '上周事项', start_time: D('2026-10-12 09:00'), end_time: D('2026-10-12 18:00') })
const c1 = mk({ title: '已取消', start_time: D('2026-10-21 09:00'), end_time: D('2026-10-21 18:00'), status: 'cancelled' })
const f1 = mk({ title: '对接:质量数据', category: '对接', start_time: D('2026-10-21 09:00'), end_time: D('2026-10-22 18:00') })
const f2 = mk({ title: '对接:已完成', category: '对接', start_time: D('2026-10-21 09:00'), end_time: D('2026-10-22 18:00'), status: 'done' })
const f3 = mk({ title: '对接:远期', category: '对接', start_time: D('2026-10-21 09:00'), end_time: D('2026-11-10 18:00') })

const s = computeSummary([m1, m2, m3, t1, t2, t3, t4, t5, t6, c1, f1, f2, f3], NOW)

check('今日会议数 = 2', s.todayMeetings.length === 2, `实际 ${s.todayMeetings.length}`)
check('下一场为 14:00 协调会', s.nextMeeting?.id === m2.id, `实际 ${s.nextMeeting?.title}`)
check('本周待办 = 9(含已完成与取消)', s.weekTasks.length === 9, `实际 ${s.weekTasks.length}`)
check('本周已完成 = 2', s.weekDone === 2, `实际 ${s.weekDone}`)
check('临近截止含今日/三天内', s.soon.some((e) => e.id === t2.id) && s.soon.some((e) => e.id === t3.id))
check('临近截止排除三天外', !s.soon.some((e) => e.id === t4.id))
check('临近截止排除已取消', !s.soon.some((e) => e.id === c1.id))
check(
  '逾期 = 2(上周事项与本周一事项)',
  s.overdue.length === 2 && s.overdue.some((e) => e.id === t1.id) && s.overdue.some((e) => e.id === t6.id),
  `实际 ${s.overdue.length}`
)
check('待对接 = 1(排除已完成/远期)', s.followups.length === 1 && s.followups[0].id === f1.id, `实际 ${s.followups.length}`)
check('今日日程 = 9', s.todayEvents.length === 9, `实际 ${s.todayEvents.length}`)
check('关注数 = 今日日程 + 逾期', s.focusCount === s.todayEvents.length + s.overdue.length, `实际 ${s.focusCount}`)

console.log('【4】截止标签与取色')
check('今日截止', deadlineLabel('2026-10-21 23:00', NOW) === '今日截止')
check('明日截止', deadlineLabel('2026-10-22 18:00', NOW) === '明日截止')
check('N天后', deadlineLabel('2026-10-24 18:00', NOW) === '3天后')
check('已逾期', deadlineLabel('2026-10-20 18:00', NOW) === '已逾期')
check('取色稳定', categoryColor('对接') === categoryColor('对接'))
check('空分类灰色', categoryColor('') === '#868E96')

console.log('【5】月历网格与事件色点')
const grid = buildMonthGrid(2026, 10)
check('网格 42 格', grid.length === 42)
check('首格为周一', parseDate(grid[0].dateStr).getDay() === 1, grid[0].dateStr)
check(
  '逐日递增',
  dayDiff(grid[0].dateStr, grid[1].dateStr) === 1 && dayDiff(grid[0].dateStr, grid[41].dateStr) === 41,
  `首尾=${grid[0].dateStr}→${grid[41].dateStr} diff0-1=${dayDiff(grid[0].dateStr, grid[1].dateStr)} diff0-41=${dayDiff(grid[0].dateStr, grid[41].dateStr)}`
)
check('含 10 月 1 日与 31 日', grid.some((c) => c.dateStr === '2026-10-01') && grid.some((c) => c.dateStr === '2026-10-31'))
check('前后月补位标记', grid.some((c) => !c.inMonth) && grid.filter((c) => c.inMonth).length === 31)

const dayColors = eventColorsByDay(
  [m1, m2, m3],
  [
    { id: 1, name: '例行工作', color: '#12B886', kind: 'schedule', is_visible: 1, sort_order: 1, created_at: '' },
    { id: 2, name: '客运部会议日程', color: '#F06595', kind: 'meeting', is_visible: 1, sort_order: 1, created_at: '' }
  ],
  2026,
  10
)
check('按日聚合颜色', dayColors.get('2026-10-21')?.length === 2)
check('无事件日期无点', !dayColors.has('2026-10-30'))

console.log(`\n结果: ${passed} 项通过, ${failed} 项失败`)
if (failed > 0) {
  console.error('失败项:', failureDetails.join('; '))
  process.exit(1)
}
