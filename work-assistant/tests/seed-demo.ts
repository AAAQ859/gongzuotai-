/**
 * 验收演示数据播种:向指定数据目录写入与 PRD 仪表盘原型一致的演示数据,
 * 并输出 DEMO_SUMMARY(JSON)供截图验收比对。
 * 日历分类不再内置预设 —— 由本脚本按演示需要自行创建(与产品行为一致:用户自建)。
 * 幂等:播种前删除旧数据库文件,整体重建。
 * 用法:npm run demo:seed -- <数据目录>
 */
import { existsSync, rmSync } from 'fs'
import { closeDatabase, dbFilePath, initDatabaseAt } from '../src/main/db/database'
import * as calendars from '../src/main/db/repositories/calendars'
import * as contacts from '../src/main/db/repositories/contacts'
import * as events from '../src/main/db/repositories/events'
import * as reminders from '../src/main/db/repositories/reminders'
import { fmtCn } from '../src/shared/reminder-text'
import { addDays, computeSummary, fmtDate, startOfWeek } from '../src/renderer/src/utils/dashboard'
import { buildTimeline } from '../src/renderer/src/utils/timeline'

const dir = process.argv[2]
if (!dir) {
  console.error('用法: node seed-demo.js <数据目录>')
  process.exit(1)
}

if (existsSync(dbFilePath(dir))) rmSync(dbFilePath(dir))

initDatabaseAt(dir)

const now = new Date()
const today = fmtDate(now)
const weekStart = fmtDate(startOfWeek(now))

// 日历分类:演示数据自行创建(产品不内置预设)
const calDefs = [
  { name: '例行工作', color: '#12B886', kind: 'schedule' as const },
  { name: '对接事项', color: '#339AF0', kind: 'schedule' as const },
  { name: '报告提交', color: '#FF922B', kind: 'schedule' as const },
  { name: '临时通知', color: '#9775FA', kind: 'schedule' as const },
  { name: '客运部会议日程', color: '#F06595', kind: 'meeting' as const },
  { name: '韩亚项目组', color: '#51CF66', kind: 'meeting' as const }
]
const cals = calDefs.map((d) => calendars.create(d))
const byName = (name: string): number => {
  const c = cals.find((x) => x.name === name)
  if (!c) throw new Error(`缺少日历分类: ${name}`)
  return c.id
}

// 联系人(PRD 4.6 通讯录:姓名/部门/职位/电话/微信/邮箱,群组记录同表 kind='group')
const li = contacts.create({
  name: '李工',
  department: '质安部',
  position: '质量主管',
  phone: '138-0000-1234',
  wechat: 'ligong-qa',
  email: 'li@example.com',
  avatar_color: '#339AF0',
  is_favorite: 1
})
const zhang = contacts.create({
  name: '张经理',
  department: '国际部',
  position: '国际事务经理',
  phone: '139-0000-5678',
  wechat: 'zhang-intl',
  avatar_color: '#12B886'
})
const wang = contacts.create({
  name: '王主任',
  department: '综合部',
  position: '综合办主任',
  phone: '135-0000-9012',
  wechat: 'wang-zonghe',
  avatar_color: '#9775FA',
  is_favorite: 1
})
const piao = contacts.create({
  name: '朴经理',
  department: '韩亚航空',
  position: '驻站代表',
  phone: '136-0000-3456',
  wechat: 'piao-hanya',
  avatar_color: '#F06595'
})
const jin = contacts.create({
  name: '金科长',
  department: '韩亚航空',
  position: '运控部',
  phone: '137-0000-7890',
  wechat: 'jin-hanya',
  avatar_color: '#51CF66'
})
const zhangAir = contacts.create({
  name: '张主任',
  department: '双流机场',
  position: '地服部',
  phone: '134-0000-1112',
  wechat: 'zhang-shuangliu',
  avatar_color: '#FF922B'
})
const cui = contacts.create({
  name: '崔姐',
  department: '国际部',
  position: '结算',
  phone: '133-0000-1314',
  wechat: 'cui-jiesuan',
  avatar_color: '#22B8CF'
})

// 群组记录(kind='group')
const hyaGroup = contacts.create({
  name: '韩亚协调工作群',
  kind: 'group',
  department: '微信群',
  member_count: 12,
  purpose: '主要对接韩亚航班事宜',
  avatar_color: '#51CF66'
})
const keyunGroup = contacts.create({
  name: '客运部通知群',
  kind: 'group',
  department: '钉钉群',
  member_count: 35,
  purpose: '部门通知与工作安排',
  avatar_color: '#339AF0'
})

// 通讯录分组(无预设,演示数据自行创建)与成员关系(联系人可属多个分组)
const groupDefs = [
  { name: '韩亚项目组', icon: '✈️' },
  { name: '客运部内部', icon: '🏢' },
  { name: '双流机场', icon: '🏭' },
  { name: '质安部', icon: '🛡️' },
  { name: '国际部', icon: '🌍' },
  { name: '微信群组', icon: '💬' }
]
const grps = groupDefs.map((d) => contacts.createGroup(d))
const gidOf = (name: string): number => {
  const g = grps.find((x) => x.name === name)
  if (!g) throw new Error(`缺少分组: ${name}`)
  return g.id
}
const memberships: Array<[number, string[]]> = [
  [li.id, ['韩亚项目组', '质安部', '客运部内部']],
  [zhang.id, ['国际部']],
  [wang.id, ['客运部内部']],
  [piao.id, ['韩亚项目组']],
  [jin.id, ['韩亚项目组']],
  [zhangAir.id, ['双流机场']],
  [cui.id, ['国际部']],
  [hyaGroup.id, ['韩亚项目组', '微信群组']],
  [keyunGroup.id, ['微信群组']]
]
for (const [cid, gnames] of memberships) {
  contacts.setGroups(cid, gnames.map(gidOf))
}

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
// 集团公司会议:会前 30 分钟提醒(提醒中心待触发演示)
mk({
  calendar_id: byName('客运部会议日程'),
  kind: 'meeting',
  title: '集团公司会议',
  category: '例会',
  start_time: `${addDays(today, 1)} 10:00`,
  end_time: `${addDays(today, 1)} 11:00`,
  location: '集团公司大楼',
  reminder_enabled: 1,
  reminder_minutes: 30
})
mk({
  calendar_id: byName('韩亚项目组'),
  kind: 'meeting',
  title: '换季风险分析会',
  category: '协调会',
  start_time: `${addDays(today, 10)} 09:30`,
  end_time: `${addDays(today, 10)} 11:00`
})

// 时间轴历史节点(板块 07:PRD 4.3 原型的已完成节点)
const reportDone = events.create({
  calendar_id: byName('报告提交'),
  kind: 'task',
  title: '月度报告提交',
  category: '报告',
  description: '上月工作汇总报告,含数据统计和下月计划',
  start_time: `${addDays(today, -20)} 09:00`,
  end_time: `${addDays(today, -20)} 10:00`
})
events.setStatus(reportDone.id, 'done')
const routineDone = events.create({
  calendar_id: byName('客运部会议日程'),
  kind: 'meeting',
  title: '部门例会',
  category: '例会',
  description: '每周四例行部门会议,汇报本周工作进展',
  start_time: `${addDays(today, -12)} 09:30`,
  end_time: `${addDays(today, -12)} 10:30`,
  location: '天府B216会议室',
  attendees: [
    { contact_id: wang.id, name: '王主任' },
    { contact_id: zhang.id, name: '张经理' }
  ]
})
events.setStatus(routineDone.id, 'done')

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
  end_time: `${addDays(today, 2)} 18:00`,
  reminder_enabled: 1,
  reminder_minutes: 1440 // 截止前 1 天提醒(提醒中心待触发演示)
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
// PRD 4.3 原型节点(板块 07)
mk({
  calendar_id: byName('客运部会议日程'),
  kind: 'meeting',
  title: 'TV香港航空对接会',
  category: '会议',
  description: '与香港航空协调冬季航班时刻',
  start_time: `${addDays(today, 1)} 10:00`,
  end_time: `${addDays(today, 1)} 11:30`,
  location: '线上会议'
})
mk({
  calendar_id: byName('报告提交'),
  kind: 'task',
  title: '航班换季准备材料提交',
  category: '报告',
  description: '冬春航季换季全部准备材料汇总提交',
  start_time: `${addDays(today, 4)} 09:00`,
  end_time: `${addDays(today, 4)} 12:00`
})
// 已逾期的对接事项(对接催办汇总演示:应用启动后引擎每天触发一次催办提醒)
mk({
  calendar_id: byName('对接事项'),
  kind: 'task',
  title: '航线资料催收',
  category: '对接',
  contact_id: piao.id,
  start_time: `${addDays(today, -3)} 09:00`,
  end_time: `${addDays(today, -1)} 18:00`
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

// 本月其他日期的事件(月/周视图与侧栏计数演示;均在当前周之外,不影响板块 02 汇总口径)
// endOffset = null 表示无截止时间;默认当日 10:00 结束
const spread: Array<{ cal: string; kind: 'task' | 'meeting'; title: string; category: string; offset: number; contact?: number; endOffset?: number | null }> = [
  { cal: '例行工作', kind: 'task', title: '上周复盘', category: '例行', offset: -3, endOffset: null },
  { cal: '对接事项', kind: 'task', title: '西伯利亚航空对接', category: '对接', offset: 6, contact: zhang.id, endOffset: 8 },
  { cal: '例行工作', kind: 'task', title: '周报整理', category: '例行', offset: 8 },
  { cal: '韩亚项目组', kind: 'meeting', title: '韩亚周例会', category: '例会', offset: 9 },
  { cal: '对接事项', kind: 'task', title: '双流综保区对接', category: '对接', offset: 11, contact: wang.id },
  { cal: '客运部会议日程', kind: 'meeting', title: '公司安委会议', category: '例会', offset: 13 },
  { cal: '报告提交', kind: 'task', title: '集团材料汇总', category: '报告', offset: 16 },
  { cal: '韩亚项目组', kind: 'meeting', title: '东航协调会', category: '协调会', offset: 18 },
  { cal: '例行工作', kind: 'task', title: '月度例会准备', category: '例会', offset: 20 },
  { cal: '临时通知', kind: 'task', title: '国防安全培训报名', category: '培训', offset: 23 }
]
for (const s of spread) {
  const d = addDays(today, s.offset)
  const endD = s.endOffset === null ? null : addDays(today, s.endOffset ?? s.offset)
  mk({
    calendar_id: byName(s.cal),
    kind: s.kind,
    title: s.title,
    category: s.category,
    contact_id: s.contact ?? null,
    start_time: `${d} 09:00`,
    end_time: endD ? `${endD} 10:00` : null
  })
}

// 提醒历史记录(提醒中心「已触发/已忽略」演示;待触发行由应用启动时引擎回填,不在此预置)
const firedDaily = reminders.create({
  event_id: null,
  remind_at: `${addDays(today, -1)} 09:00`,
  type: 'daily',
  message: '今日会议清单与待办事项晨间推送'
})
reminders.markFired(firedDaily.id)
const firedDeadline = reminders.create({
  event_id: null,
  remind_at: `${addDays(today, -1)} 14:00`,
  type: 'deadline',
  message: `「月度安全报告提交」将于 ${fmtCn(`${addDays(today, -1)} 17:00`)} 截止,对接人:王主任`
})
reminders.markFired(firedDeadline.id)
const dismissedOne = reminders.create({
  event_id: null,
  remind_at: `${today} 08:30`,
  type: 'event',
  message: `「部门例会」将于 ${fmtCn(`${today} 09:30`)} 开始 · 天府B216会议室 / 双流连线`
})
reminders.dismiss(dismissedOne.id)

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
  focus: summary.focusCount,
  contacts: contacts.list().length,
  contactGroups: grps.length,
  reminderRows: reminders.listAll().length,
  timelineNodes: buildTimeline(events.list(), fmtDate(now).slice(0, 7), fmtDate(now)).flatMap(
    (g) => g.items
  ).length
}
console.log('DEMO_SUMMARY: ' + JSON.stringify(demo))

closeDatabase()
