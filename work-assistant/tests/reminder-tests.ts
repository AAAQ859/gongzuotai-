/**
 * 提醒系统纯逻辑验收测试(板块 06):
 * - 主进程引擎计算:src/main/reminders/logic.ts(addMinutesStr/computeRemindAt/nextDailyOccurrence/followupCount/withContact)
 * - 提醒文案:src/shared/reminder-text.ts(fmtCn/followupScript)
 * - 提醒中心展示逻辑:src/renderer/src/utils/reminders.ts(hasScript/scriptOf/statusLabel)
 * 运行方式:npm run test:reminder
 */
import type { Reminder } from '@shared/types'
import { fmtCn, followupScript } from '../src/shared/reminder-text'
import {
  addMinutesStr,
  computeRemindAt,
  followupCount,
  nextDailyOccurrence,
  withContact,
  type ReminderEventLike
} from '../src/main/reminders/logic'
import { hasScript, scriptOf, statusLabel } from '../src/renderer/src/utils/reminders'

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

function mkEvent(partial: Partial<ReminderEventLike>): ReminderEventLike {
  return {
    kind: 'task',
    title: '测试事项',
    start_time: null,
    end_time: null,
    location: '',
    status: 'todo',
    category: '',
    reminder_enabled: 1,
    reminder_minutes: null,
    reminder_days: null,
    ...partial
  }
}

function mkReminder(partial: Partial<Reminder>): Reminder {
  return {
    id: 1,
    event_id: null,
    remind_at: '2026-10-21 09:00',
    type: 'deadline',
    message: '',
    status: 'pending',
    created_at: '2026-10-21 08:00',
    fired_at: null,
    ...partial
  }
}

console.log('【1】时间计算 addMinutesStr')
check('同小时加分钟', addMinutesStr('2026-10-21 09:30', 15) === '2026-10-21 09:45')
check('跨小时进位', addMinutesStr('2026-10-21 09:50', 30) === '2026-10-21 10:20')
check('跨天进位', addMinutesStr('2026-10-21 23:50', 30) === '2026-10-22 00:20')
check('跨月进位', addMinutesStr('2026-10-31 23:50', 30) === '2026-11-01 00:20')
check('跨年进位', addMinutesStr('2026-12-31 23:50', 30) === '2027-01-01 00:20')
check('减分钟', addMinutesStr('2026-10-21 00:10', -30) === '2026-10-20 23:40')
check('跨多天(1440 分钟)', addMinutesStr('2026-10-21 18:00', 1440) === '2026-10-22 18:00')

console.log('【2】会议会前提醒 computeRemindAt(meeting)')
check(
  '事件级提前量优先',
  (() => {
    const r = computeRemindAt(
      mkEvent({ kind: 'meeting', title: '晨会', start_time: '2026-10-21 10:00', reminder_enabled: 1, reminder_minutes: 30 }),
      15,
      '2026-10-21 09:00'
    )
    return !!r && r.remindAt === '2026-10-21 09:30' && r.type === 'event'
  })()
)
check(
  '未指定提前量回落全局设置',
  (() => {
    const r = computeRemindAt(
      mkEvent({ kind: 'meeting', start_time: '2026-10-21 10:00', reminder_enabled: 1 }),
      15,
      '2026-10-21 09:00'
    )
    return !!r && r.remindAt === '2026-10-21 09:45'
  })()
)
check(
  '全局设置关闭(0)时不提醒',
  computeRemindAt(mkEvent({ kind: 'meeting', start_time: '2026-10-21 10:00', reminder_enabled: 1 }), 0, '2026-10-21 09:00') === null
)
check(
  'reminder_enabled=0 显式关闭',
  computeRemindAt(mkEvent({ kind: 'meeting', start_time: '2026-10-21 10:00', reminder_enabled: 0, reminder_minutes: 30 }), 15, '2026-10-21 09:00') === null
)
check(
  '无开始时间不提醒',
  computeRemindAt(mkEvent({ kind: 'meeting', reminder_enabled: 1, reminder_minutes: 30 }), 15, '2026-10-21 09:00') === null
)
check(
  '已取消会议不提醒',
  computeRemindAt(mkEvent({ kind: 'meeting', status: 'cancelled', start_time: '2026-10-21 10:00', reminder_enabled: 1, reminder_minutes: 30 }), 15, '2026-10-21 09:00') === null
)
check(
  '已结束会议不提醒',
  computeRemindAt(mkEvent({ kind: 'meeting', status: 'done', start_time: '2026-10-21 10:00', reminder_enabled: 1, reminder_minutes: 30 }), 15, '2026-10-21 09:00') === null
)
check(
  '提醒时刻已过则跳过',
  computeRemindAt(mkEvent({ kind: 'meeting', start_time: '2026-10-21 10:00', reminder_enabled: 1, reminder_minutes: 30 }), 15, '2026-10-21 09:31') === null
)
check(
  '提醒消息含中文时间与地点',
  (() => {
    const r = computeRemindAt(
      mkEvent({ kind: 'meeting', title: '韩亚协调会', start_time: '2026-10-22 14:00', location: '3号会议室', reminder_enabled: 1, reminder_minutes: 15 }),
      15,
      '2026-10-22 13:00'
    )
    return !!r && r.message === '「韩亚协调会」将于 10月22日 14:00 开始 · 3号会议室'
  })()
)

console.log('【3】事项截止提醒 computeRemindAt(task)')
check(
  '事件级提前量',
  (() => {
    const r = computeRemindAt(
      mkEvent({ title: '报告提交', end_time: '2026-10-21 18:00', reminder_enabled: 1, reminder_minutes: 30 }),
      15,
      '2026-10-21 09:00'
    )
    return !!r && r.remindAt === '2026-10-21 17:30' && r.type === 'deadline'
  })()
)
check(
  'reminder_days 折算分钟',
  (() => {
    const r = computeRemindAt(
      mkEvent({ end_time: '2026-10-21 18:00', reminder_enabled: 1, reminder_days: 1 }),
      15,
      '2026-10-20 09:00'
    )
    return !!r && r.remindAt === '2026-10-20 18:00'
  })()
)
check(
  '无提前量设置不提醒(事项不回落全局)',
  computeRemindAt(mkEvent({ end_time: '2026-10-21 18:00', reminder_enabled: 1 }), 15, '2026-10-21 09:00') === null
)
check(
  '无截止时间不提醒',
  computeRemindAt(mkEvent({ reminder_enabled: 1, reminder_minutes: 30 }), 15, '2026-10-21 09:00') === null
)
check(
  '已完成事项不提醒',
  computeRemindAt(mkEvent({ status: 'done', end_time: '2026-10-21 18:00', reminder_enabled: 1, reminder_minutes: 30 }), 15, '2026-10-21 09:00') === null
)
check(
  '已取消事项不提醒',
  computeRemindAt(mkEvent({ status: 'cancelled', end_time: '2026-10-21 18:00', reminder_enabled: 1, reminder_minutes: 30 }), 15, '2026-10-21 09:00') === null
)
check(
  '截止提醒消息',
  (() => {
    const r = computeRemindAt(
      mkEvent({ title: '月度安全报告', end_time: '2026-10-23 17:00', reminder_enabled: 1, reminder_minutes: 1440 }),
      15,
      '2026-10-22 09:00'
    )
    return !!r && r.message === '「月度安全报告」将于 10月23日 17:00 截止'
  })()
)

console.log('【4】对接人追加 withContact')
check('有对接人追加', withContact('「X」将于 10月21日 18:00 截止', '张经理') === '「X」将于 10月21日 18:00 截止,对接人:张经理')
check('无对接人原样返回', withContact('「X」将于 10月21日 18:00 截止', null) === '「X」将于 10月21日 18:00 截止')

console.log('【5】晨间推送 nextDailyOccurrence')
check('今天未到点 → 今天', nextDailyOccurrence('2026-10-21 08:00', '09:00') === '2026-10-21 09:00')
check('今天已过点 → 明天', nextDailyOccurrence('2026-10-21 09:01', '09:00') === '2026-10-22 09:00')
check('正好到点 → 明天(严格大于才算未过)', nextDailyOccurrence('2026-10-21 09:00', '09:00') === '2026-10-22 09:00')
check('跨月', nextDailyOccurrence('2026-10-31 20:00', '09:00') === '2026-11-01 09:00')

console.log('【6】对接催办统计 followupCount')
const now = '2026-10-21 12:00'
check(
  '仅统计逾期未完成的对接事项',
  followupCount(
    [
      mkEvent({ category: '对接', end_time: '2026-10-20 18:00' }),
      mkEvent({ category: '报告', end_time: '2026-10-20 18:00' }),
      mkEvent({ kind: 'meeting', category: '对接', end_time: '2026-10-20 18:00' })
    ],
    now
  ) === 1
)
check('已完成/已取消不计', followupCount(
  [
    mkEvent({ category: '对接', end_time: '2026-10-20 18:00', status: 'done' }),
    mkEvent({ category: '对接', end_time: '2026-10-20 18:00', status: 'cancelled' })
  ],
  now
) === 0)
check('未逾期不计(未来截止)', followupCount([mkEvent({ category: '对接', end_time: '2026-10-22 18:00' })], now) === 0)
check('无截止时间不计', followupCount([mkEvent({ category: '对接' })], now) === 0)
check('恰好到期未逾不计(严格小于)', followupCount([mkEvent({ category: '对接', end_time: '2026-10-21 12:00' })], now) === 0)

console.log('【7】提醒文案 fmtCn / followupScript')
check('fmtCn 常规', fmtCn('2026-10-22 09:30') === '10月22日 09:30')
check('fmtCn 不补零', fmtCn('2026-01-05 08:05') === '1月5日 08:05')
check(
  '催办话术组装',
  followupScript('张经理', '国际航班换季计划确认', '10月23日 18:00') ===
    '张经理,您好!「国际航班换季计划确认」将于 10月23日 18:00 截止,请尽快安排,谢谢!'
)

console.log('【8】提醒中心展示逻辑 hasScript / scriptOf / statusLabel')
const dl = mkReminder({
  type: 'deadline',
  message: '「国际航班换季计划确认」将于 10月23日 18:00 截止,对接人:张经理'
})
check('截止+对接人 → 有话术', hasScript(dl))
check('会前提醒无语术', !hasScript(mkReminder({ type: 'event', message: '「晨会」将于 10月21日 10:00 开始,对接人:李工' })))
check('截止但无对接人 → 无语术', !hasScript(mkReminder({ type: 'deadline', message: '「报告」将于 10月21日 18:00 截止' })))
check(
  '话术从消息提取重组',
  scriptOf(dl) === '张经理,您好!「国际航班换季计划确认」将于 10月23日 18:00 截止,请尽快安排,谢谢!',
  scriptOf(dl) ?? 'null'
)
check('无话术记录返回 null', scriptOf(mkReminder({ type: 'event', message: 'x' })) === null)
check('statusLabel 计数', statusLabel('pending', 3) === '待触发(3)')
check('statusLabel 未知状态兜底', statusLabel('x', 0) === 'x(0)')

console.log(`\n结果: ${passed} 项通过, ${failed} 项失败`)
if (failed > 0) {
  console.error('失败项:', failureDetails.join('; '))
  process.exit(1)
}
