/**
 * 例行事项日期逻辑验收测试(src/shared/recurrence.ts)。
 * 运行方式:npm run test:recurrence
 * 覆盖:日期解析/加减、跨月跨年与闰年、星期标签、每周日期展开、
 *       开始时间 + 默认时长、每周规则文案。
 */
import {
  addDaysStr,
  addMinutesToDateTime,
  addMonthsStr,
  diffMinutes,
  firstWeeklyOnOrAfter,
  fmtDateStr,
  fmtDateTimeStr,
  formatWeeklyRule,
  parseDateStr,
  parseDateTimeStr,
  timeOf,
  weekdayLabel,
  weekdayOf,
  weeklyDatesBetween
} from '../src/shared/recurrence'

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

function eq(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected)
}

console.log('【1】日期解析与格式化')
check('parseDateStr 解析日期', fmtDateStr(parseDateStr('2026-10-23')) === '2026-10-23')
check('parseDateStr 忽略时间部分', fmtDateStr(parseDateStr('2026-10-23 15:30')) === '2026-10-23')
check('parseDateTimeStr 含时分', fmtDateTimeStr(parseDateTimeStr('2026-10-23 15:30')) === '2026-10-23 15:30')
check('timeOf 取 HH:MM', timeOf('2026-10-23 15:30') === '15:30')
check('timeOf 凌晨补零', timeOf('2026-10-23 00:05') === '00:05')

console.log('【2】日期加减(跨月/跨年/闰年)')
check('跨月', addDaysStr('2026-10-31', 1) === '2026-11-01')
check('跨年', addDaysStr('2026-12-31', 1) === '2027-01-01')
check('闰年 2 月 28 日 +1', addDaysStr('2028-02-28', 1) === '2028-02-29')
check('闰年 2 月 29 日 +1', addDaysStr('2028-02-29', 1) === '2028-03-01')
check('平年 2 月 28 日 +1', addDaysStr('2027-02-28', 1) === '2027-03-01')
check('负数跨月', addDaysStr('2026-11-01', -1) === '2026-10-31')
check('加一个月月末收缩', addMonthsStr('2026-01-31', 1) === '2026-02-28')
check('闰年加一个月月末收缩', addMonthsStr('2028-01-31', 1) === '2028-02-29')
check('十二月加一个月跨年', addMonthsStr('2026-12-31', 1) === '2027-01-31')
check('减一个月月末收缩', addMonthsStr('2026-03-31', -1) === '2026-02-28')
check('加十二个月', addMonthsStr('2026-10-21', 12) === '2027-10-21')

console.log('【3】星期判断')
check('2026-10-23 为周五', weekdayOf('2026-10-23') === 5)
check('2026-10-25 为周日', weekdayOf('2026-10-25') === 0)
check('2026-10-26 为周一', weekdayOf('2026-10-26') === 1)
check('中文星期标签', weekdayLabel('2026-10-23') === '周五' && weekdayLabel('2026-10-25') === '周日')

console.log('【4】从锚点日期起每周同一天')
check('同一天返回自身', firstWeeklyOnOrAfter('2026-10-23', '2026-10-23') === '2026-10-23')
check('锚点前的周一取当周周五', firstWeeklyOnOrAfter('2026-10-23', '2026-10-19') === '2026-10-23')
check('锚点后的周六顺延一周', firstWeeklyOnOrAfter('2026-10-23', '2026-10-24') === '2026-10-30')
check('周四取次日周五', firstWeeklyOnOrAfter('2026-10-23', '2026-10-22') === '2026-10-23')
check('起点早于锚点仍按周几对齐', firstWeeklyOnOrAfter('2026-10-23', '2026-10-02') === '2026-10-02')
check('跨年对齐', firstWeeklyOnOrAfter('2026-12-25', '2027-01-02') === '2027-01-08')
check('周五起点返回周五', firstWeeklyOnOrAfter('2026-12-25', '2027-01-01') === '2027-01-01')

console.log('【5】每周日期区间展开')
check(
  '五周区间含首尾',
  eq(weeklyDatesBetween('2026-10-23', '2026-10-23', '2026-11-20'), [
    '2026-10-23',
    '2026-10-30',
    '2026-11-06',
    '2026-11-13',
    '2026-11-20'
  ])
)
check(
  '从区间中间起算',
  eq(weeklyDatesBetween('2026-10-23', '2026-10-24', '2026-11-06'), [
    '2026-10-30',
    '2026-11-06'
  ])
)
check('终点早于首期返回空', weeklyDatesBetween('2026-10-23', '2026-10-23', '2026-10-22').length === 0)
check(
  '跨年区间',
  eq(weeklyDatesBetween('2026-12-25', '2026-12-20', '2027-01-08'), [
    '2026-12-25',
    '2027-01-01',
    '2027-01-08'
  ])
)
check(
  '未来 12 个月约 53 期',
  weeklyDatesBetween('2026-10-23', '2026-10-23', '2027-10-23').length === 53
)
check('每期间隔 7 天', (() => {
  const dates = weeklyDatesBetween('2026-10-23', '2026-10-23', '2026-12-31')
  return dates.every((d, i) => i === 0 || diffMinutes(`${dates[i - 1]} 00:00`, `${d} 00:00`) === 7 * 24 * 60)
})())
check('空参数返回空', weeklyDatesBetween('', '2026-10-23', '2026-11-20').length === 0)

console.log('【6】开始时间 + 默认时长(事项 3 小时 / 会议 1 小时)')
check('事项默认结束 = 开始 +3 小时', addMinutesToDateTime('2026-10-23 15:30', 180) === '2026-10-23 18:30')
check('会议默认结束 = 开始 +1 小时', addMinutesToDateTime('2026-10-23 15:30', 60) === '2026-10-23 16:30')
check('跨天 23:30 +1 小时', addMinutesToDateTime('2026-10-23 23:30', 60) === '2026-10-24 00:30')
check('跨年 12-31 23:00 +3 小时', addMinutesToDateTime('2026-12-31 23:00', 180) === '2027-01-01 02:00')
check('负分钟跨天', addMinutesToDateTime('2026-10-24 00:30', -60) === '2026-10-23 23:30')
check('空时间返回空', addMinutesToDateTime('', 180) === '')
check('时长差 180 分钟', diffMinutes('2026-10-23 15:30', '2026-10-23 18:30') === 180)
check('时长差 90 分钟', diffMinutes('2026-10-23 14:00', '2026-10-23 15:30') === 90)
check('跨天时长差', diffMinutes('2026-10-23 23:00', '2026-10-24 01:30') === 150)
check('空值时长差为 0', diffMinutes('', '2026-10-23 18:30') === 0)

console.log('【7】每周规则文案')
check('周五 15:30', formatWeeklyRule('2026-10-23 15:30') === '每周五 15:30')
check('周日 09:00', formatWeeklyRule('2026-10-25 09:00') === '每周日 09:00')
check('空值无文案', formatWeeklyRule('') === '')
check('不足 16 位无文案', formatWeeklyRule('2026-10-23') === '')

console.log(`\n结果: ${passed} 项通过, ${failed} 项失败`)
if (failed > 0) {
  console.error('失败项:', failureDetails.join('; '))
  process.exit(1)
}
