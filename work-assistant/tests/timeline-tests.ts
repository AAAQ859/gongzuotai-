/**
 * 月度时间轴纯逻辑验收测试(板块 07,utils/timeline.ts)。
 * 运行方式:npm run test:timeline
 * 固定验收日期:2026-10-21(周三),月份 2026-10。
 */
import type { WorkEvent } from '@shared/types'
import {
  buildTimeline,
  dateLabel,
  isUrging,
  monthProgress,
  nodeDate,
  normalizeDate,
  normalizeTime,
  parseTimelineRows,
  timelineStatus,
  timelineSummary,
  type TimelineStatus
} from '../src/renderer/src/utils/timeline'

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
function mkEvent(partial: Partial<WorkEvent>): WorkEvent {
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
    task_type: 'temporary',
    series_id: null,
    tags: [],
    contact_id: null,
    reminder_enabled: 0,
    reminder_minutes: null,
    reminder_days: null,
    related_files: [],
    sort_order: 0,
    completed_at: null,
    created_at: '',
    updated_at: '',
    ...partial
  }
}

const TODAY = '2026-10-21'

console.log('【1】主日期 nodeDate')
check('start 优先', nodeDate(mkEvent({ start_time: '2026-10-20 09:00', end_time: '2026-10-22 18:00' })) === '2026-10-20')
check('无 start 用 end', nodeDate(mkEvent({ end_time: '2026-10-22 18:00' })) === '2026-10-22')
check('均无返回 null', nodeDate(mkEvent({})) === null)

console.log('【2】状态判定 timelineStatus')
check('已完成', timelineStatus(mkEvent({ status: 'done' }), TODAY) === 'done')
check('已取消', timelineStatus(mkEvent({ status: 'cancelled' }), TODAY) === 'cancelled')
check('进行中', timelineStatus(mkEvent({ status: 'in_progress' }), TODAY) === 'in_progress')
check('已逾期(截止已过)', timelineStatus(mkEvent({ end_time: '2026-10-20 18:00' }), TODAY) === 'overdue')
check('今日截止', timelineStatus(mkEvent({ end_time: '2026-10-21 18:00' }), TODAY) === 'due_today')
check('今日无截止 → 今日', timelineStatus(mkEvent({ start_time: '2026-10-21 09:00' }), TODAY) === 'today')
check('今日但截止在未来 → 今日', timelineStatus(mkEvent({ start_time: '2026-10-21 09:00', end_time: '2026-10-23 18:00' }), TODAY) === 'today')
check('未来 → 待开始', timelineStatus(mkEvent({ start_time: '2026-10-25 09:00' }), TODAY) === 'pending')
check('过去日期未完成 → 逾期(无时间按 end 兜底)', timelineStatus(mkEvent({ start_time: '2026-10-19 09:00', end_time: '2026-10-19 18:00' }), TODAY) === 'overdue')

console.log('【3】催办中标签 isUrging')
check('对接+逾期 → 催办中', isUrging(mkEvent({ category: '对接' }), 'overdue'))
check('对接+今日截止 → 催办中', isUrging(mkEvent({ category: '对接' }), 'due_today'))
check('报告+逾期 → 不显示', !isUrging(mkEvent({ category: '报告' }), 'overdue'))
check('对接+待开始 → 不显示', !isUrging(mkEvent({ category: '对接' }), 'pending'))

console.log('【4】日期头 dateLabel')
check('10月1日 · 周四', dateLabel('2026-10-01') === '10月1日 · 周四')
check('10月21日 · 周三', dateLabel('2026-10-21') === '10月21日 · 周三')
check('跨月不补零', dateLabel('2026-01-05') === '1月5日 · 周一')

console.log('【5】本月进度 monthProgress')
check('10月21日 → 68%', monthProgress('2026-10-21') === 68, String(monthProgress('2026-10-21')))
check('月末 → 100%', monthProgress('2026-10-31') === 100)
check('月初 → 3%', monthProgress('2026-10-01') === 3, String(monthProgress('2026-10-01')))
check('二月 14 日 → 50%', monthProgress('2026-02-14') === 50)

console.log('【6】时间轴构建 buildTimeline')
const evs = [
  mkEvent({ id: 1, title: 'A未来', start_time: '2026-10-25 09:00' }),
  mkEvent({ id: 2, title: 'B逾期', end_time: '2026-10-20 18:00' }),
  mkEvent({ id: 3, title: 'C今日早', start_time: '2026-10-21 09:00' }),
  mkEvent({ id: 4, title: 'D今日晚', start_time: '2026-10-21 14:00' }),
  mkEvent({ id: 5, title: 'E下月', start_time: '2026-11-01 09:00' }),
  mkEvent({ id: 6, title: 'F无日期' }),
  mkEvent({ id: 7, title: 'G同日无时间', start_time: '2026-10-21 09:00' }),
  mkEvent({ id: 8, title: 'H同日sort优先', start_time: '2026-10-21 09:00', sort_order: -1 }),
  mkEvent({ id: 9, title: 'I已完成', start_time: '2026-10-02 10:00', status: 'done' })
]
const groups = buildTimeline(evs, '2026-10', TODAY)
check('仅本月事件(5 组)', groups.map((g) => g.date).join('|') === '2026-10-02|2026-10-20|2026-10-21|2026-10-25', JSON.stringify(groups.map((g) => g.date)))
check('今日组标记', (() => { const g = groups.find((x) => x.date === TODAY); return !!g && g.isToday })())
check('同日按时间升序', (() => {
  const g = groups.find((x) => x.date === TODAY)
  return !!g && g.items.map((n) => n.ev.title).join('|') === 'H同日sort优先|C今日早|G同日无时间|D今日晚'
})())
check('同日同时刻 sort_order 优先', (() => {
  const g = groups.find((x) => x.date === TODAY)
  return !!g && g.items[0].ev.title === 'H同日sort优先'
})())
check('组内状态正确', (() => {
  const g = groups.find((x) => x.date === '2026-10-20')
  return !!g && g.items[0].status === 'overdue'
})())
check('已完成组状态', (() => {
  const g = groups.find((x) => x.date === '2026-10-02')
  return !!g && g.items[0].status === 'done'
})())
check('组头文案', groups[0].label === '10月2日 · 周五')

console.log('【7】汇总 timelineSummary')
const summaryNodes = buildTimeline(
  [
    mkEvent({ id: 1, title: 'done1', status: 'done', start_time: '2026-10-02 09:00' }),
    mkEvent({ id: 2, title: 'done2', status: 'done', start_time: '2026-10-03 09:00' }),
    mkEvent({ id: 3, title: 'active1', status: 'in_progress', start_time: '2026-10-05 09:00' }),
    mkEvent({ id: 4, title: 'overdue1', end_time: '2026-10-10 18:00' }),
    mkEvent({ id: 5, title: 'due1', end_time: '2026-10-21 18:00' }),
    mkEvent({ id: 6, title: 'today1', start_time: '2026-10-21 09:00' }),
    mkEvent({ id: 7, title: 'pend1', start_time: '2026-10-25 09:00' }),
    mkEvent({ id: 8, title: 'pend2', start_time: '2026-10-28 09:00' }),
    mkEvent({ id: 9, title: 'cancelled', status: 'cancelled', start_time: '2026-10-09 09:00' })
  ],
  '2026-10',
  TODAY
).flatMap((g) => g.items)
const s = timelineSummary(summaryNodes)
check('总数不含已取消', s.total === 8, JSON.stringify(s))
check('已完成 2', s.done === 2)
check('进行中 4(进行中+逾期+今日截止+今日)', s.active === 4, String(s.active))
check('待开始 2', s.pending === 2)

console.log('【8】导入日期/时间解析 normalizeDate / normalizeTime')
const NOW = new Date(2026, 9, 21)
check('YYYY-MM-DD', normalizeDate('2026-10-01', NOW) === '2026-10-01')
check('YYYY/M/D', normalizeDate('2026/1/5', NOW) === '2026-01-05')
check('M-D 当年', normalizeDate('10-01', NOW) === '2026-10-01')
check('M月D日 当年', normalizeDate('10月1日', NOW) === '2026-10-01')
check('非法日期 null', normalizeDate('abc', NOW) === null)
check('HH:mm 拼日期', normalizeTime('09:30', '2026-10-01') === '2026-10-01 09:30')
check('H:mm 补零', normalizeTime('9:05', '2026-10-01') === '2026-10-01 09:05')
check('完整日期时间', normalizeTime('2026-10-02 10:00', '2026-10-01') === '2026-10-02 10:00')
check('空 → null', normalizeTime('', '2026-10-01') === null)
check('非法时间 null', normalizeTime('上午', '2026-10-01') === null)

console.log('【9】导入网格解析 parseTimelineRows')
check(
  '中文表头 + 完整行',
  (() => {
    const r = parseTimelineRows(
      [
        ['日期', '标题', '描述', '日历', '分类', '开始时间', '结束时间', '对接人'],
        ['10-01', '月度报告提交', '上月汇总', '报告提交', '报告', '09:00', '10:00', '王主任'],
        ['10月22日', 'TV香港航空对接会', '', '会议安排', '会议', '10:00', '11:30', '']
      ],
      NOW
    )
    return (
      r.rows.length === 2 &&
      r.rows[0].date === '2026-10-01' &&
      r.rows[0].start === '2026-10-01 09:00' &&
      r.rows[0].end === '2026-10-01 10:00' &&
      r.rows[0].contact === '王主任' &&
      r.rows[1].date === '2026-10-22' &&
      r.rows[1].start === '2026-10-22 10:00' &&
      r.rows[1].contact === '' &&
      r.errors.length === 0
    )
  })(),
  JSON.stringify(parseTimelineRows([['日期', '标题'], ['10-01', 'x']], NOW))
)
check(
  '英文表头',
  (() => {
    const r = parseTimelineRows([['date', 'title', 'end'], ['2026-10-25', '航班换季材料', '17:00']], NOW)
    return r.rows.length === 1 && r.rows[0].end === '2026-10-25 17:00'
  })()
)
check(
  '无表头固定列序',
  (() => {
    const r = parseTimelineRows([['10-03', '部门例会', '周会', '例行工作', '例行', '09:30', '10:30', '']], NOW)
    return r.rows.length === 1 && r.rows[0].calendar === '例行工作' && r.rows[0].category === '例行'
  })()
)
check(
  '缺日期跳过并报错',
  (() => {
    const r = parseTimelineRows([['日期', '标题'], ['', '无日期事项'], ['10-05', '正常事项']], NOW)
    return r.rows.length === 1 && r.rows[0].title === '正常事项' && r.errors.some((e) => e.includes('第 1 行缺少日期'))
  })()
)
check(
  '缺标题跳过并报错',
  (() => {
    const r = parseTimelineRows([['10-05', '']], NOW)
    return r.rows.length === 0 && r.errors.some((e) => e.includes('第 1 行缺少标题'))
  })()
)
check(
  '时间无法识别忽略并提示',
  (() => {
    const r = parseTimelineRows([['10-05', '事项', '', '', '', '上午十点', '']], NOW)
    return r.rows.length === 1 && r.rows[0].start === null && r.errors.some((e) => e.includes('开始时间无法识别'))
  })()
)
check(
  '结束早于开始忽略结束时间',
  (() => {
    const r = parseTimelineRows([['10-05', '事项', '', '', '', '10:00', '09:00']], NOW)
    return r.rows.length === 1 && r.rows[0].start === '2026-10-05 10:00' && r.rows[0].end === null && r.errors.some((e) => e.includes('结束时间早于开始时间'))
  })()
)
check(
  '空行与空白行跳过',
  parseTimelineRows([['日期', '标题'], [], ['   ', ''], ['10-06', '有效']], NOW).rows.length === 1
)

console.log(`\n结果: ${passed} 项通过, ${failed} 项失败`)
if (failed > 0) {
  console.error('失败项:', failureDetails.join('; '))
  process.exit(1)
}
