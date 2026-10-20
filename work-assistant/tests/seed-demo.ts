/**
 * 验收演示数据播种:向指定数据目录写入与 PRD 仪表盘原型一致的演示数据,
 * 并输出 DEMO_SUMMARY(JSON)供截图验收比对。
 * 用法:npm run demo:seed -- <数据目录>
 */
import { closeDatabase, initDatabaseAt } from '../src/main/db/database'
import * as calendars from '../src/main/db/repositories/calendars'
import * as contacts from '../src/main/db/repositories/contacts'
import * as events from '../src/main/db/repositories/events'
import { addDays, computeSummary, fmtDate, startOfWeek } from '../src/renderer/src/utils/dashboard'

const dir = process.argv[2]
if (!dir) {
  console.error('用法: node seed-demo.js <数据目录>')
  process.exit(1)
}

initDatabaseAt(dir)

const now = new Date()
const today = fmtDate(now)
const weekStart = fmtDate(startOfWeek(now))

const cals = calendars.list()
const byName = (name: string): number => {
  const c = cals.find((x) => x.name === name)
  if (!c) throw new Error(`缺少日历分类: ${name}`)
  return c.id
}

// 联系人
const li = contacts.create({ name: '李工', department: '质安部', avatar_color: '#339AF0' })
const zhang = contacts.create({ name: '张经理', department: '国际部', avatar_color: '#12B886' })
const wang = contacts.create({ name: '王主任', department: '综合部', avatar_color: '#9775FA' })

const mk = (p: Parameters<typeof events.create>[0]): void => {
  events.create(p)
}

// 今日会议 ×3
mk({
  calendar_id: byName('客运部会议日程'),
  kind: 'meeting',
  title: '部门例会',
  category: '例会',
  start_time: `${today} 09:30`,
  end_time: `${today} 10:30`,
  location: '天府B216会议室 / 双流连线',
  attendees: [
    { contact_id: wang.id, name: '王主任' },
    { contact_id: zhang.id, name: '张经理' }
  ]
})
mk({
  calendar_id: byName('韩亚项目组'),
  kind: 'meeting',
  title: '韩亚协调会 + 文审',
  category: '协调会',
  start_time: `${today} 14:00`,
  end_time: `${today} 15:30`,
  location: '线上会议',
  attendees: [{ contact_id: li.id, name: '李工' }]
})
mk({
  calendar_id: byName('客运部会议日程'),
  kind: 'meeting',
  title: '晚间安全视频会',
  category: '例会',
  start_time: `${today} 20:00`,
  end_time: `${today} 21:00`,
  location: '线上会议'
})

// 远期会议(迷你日历点缀)
mk({
  calendar_id: byName('客运部会议日程'),
  kind: 'meeting',
  title: '集团公司会议',
  category: '例会',
  start_time: `${addDays(today, 1)} 10:00`,
  end_time: `${addDays(today, 1)} 11:00`,
  location: '集团公司大楼'
})
mk({
  calendar_id: byName('韩亚项目组'),
  kind: 'meeting',
  title: '换季风险分析会',
  category: '协调会',
  start_time: `${addDays(today, 10)} 09:30`,
  end_time: `${addDays(today, 10)} 11:00`
})

// 待办
mk({
  calendar_id: byName('对接事项'),
  kind: 'task',
  title: '向质安部索要Q3质量数据',
  category: '对接',
  contact_id: li.id,
  start_time: `${today} 12:00`,
  end_time: `${today} 18:00`
})
mk({
  calendar_id: byName('对接事项'),
  kind: 'task',
  title: '国际航班换季计划确认',
  category: '对接',
  contact_id: zhang.id,
  start_time: `${today} 09:00`,
  end_time: `${addDays(today, 2)} 18:00`
})
mk({
  calendar_id: byName('报告提交'),
  kind: 'task',
  title: '月度安全报告提交',
  category: '报告',
  start_time: `${today} 10:00`,
  end_time: `${addDays(today, 2)} 17:00`
})
mk({
  calendar_id: byName('例行工作'),
  kind: 'task',
  title: '企业微信培训报名',
  category: '培训',
  start_time: `${today} 16:00`,
  end_time: `${addDays(today, 2)} 12:00`
})
mk({
  calendar_id: byName('临时通知'),
  kind: 'task',
  title: '航延餐食协调',
  category: '协调',
  start_time: `${addDays(today, 4)} 10:00`,
  end_time: `${addDays(today, 4)} 18:00`
})
const doneEv = events.create({
  calendar_id: byName('例行工作'),
  kind: 'task',
  title: '津补贴申报',
  category: '例行',
  start_time: `${weekStart} 09:00`,
  end_time: `${weekStart} 18:00`
})
events.setStatus(doneEv.id, 'done')

// 汇总输出(供验收比对)
const summary = computeSummary(events.list(), now)
const demo = {
  todayMeetings: summary.todayMeetings.length,
  nextAt: summary.nextMeeting ? summary.nextMeeting.start_time!.slice(11) : null,
  weekTasks: summary.weekTasks.length,
  weekDone: summary.weekDone,
  soon: summary.soon.length,
  overdue: summary.overdue.length,
  followups: summary.followups.length,
  todayEvents: summary.todayEvents.length,
  focus: summary.focusCount
}
console.log('DEMO_SUMMARY: ' + JSON.stringify(demo))

closeDatabase()
