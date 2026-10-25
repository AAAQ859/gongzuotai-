/**
 * 验收演示数据播种:向指定数据目录写入与 PRD 仪表盘原型一致的演示数据,
 * 并输出 DEMO_SUMMARY(JSON)供截图验收比对。
 * 日历分类不再内置预设 —— 由本脚本按演示需要自行创建(与产品行为一致:用户自建)。
 * 幂等:播种前删除旧数据库文件,整体重建。
 * 用法:npm run demo:seed -- <数据目录>
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import AdmZip from 'adm-zip'
import * as XLSX from 'xlsx'
import { closeDatabase, dbFilePath, getDb, initDatabaseAt } from '../src/main/db/database'
import * as fileBoardsRepo from '../src/main/db/repositories/boards'
import * as calendars from '../src/main/db/repositories/calendars'
import * as contacts from '../src/main/db/repositories/contacts'
import * as events from '../src/main/db/repositories/events'
import * as reminders from '../src/main/db/repositories/reminders'
import * as seriesService from '../src/main/series/service'
import { scanFolder } from '../src/main/files/extract'
import { fmtCn } from '../src/shared/reminder-text'
import {
  buildSummaryContent,
  monthRange,
  rangeSpanText,
  rangeTitle,
  summaryStats
} from '../src/shared/summary'
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

/** 标记完成并把完成时间回填到指定日期(演示数据用,保证月度纲要有历史完成项) */
function markDoneOn(id: number, date: string, time = '17:00'): void {
  events.setStatus(id, 'done')
  getDb().prepare('UPDATE events SET completed_at = ? WHERE id = ?').run(`${date} ${time}`, id)
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
  description: '汇报客运部本月安全服务与换季保障工作',
  start_time: `${addDays(today, 1)} 10:00`,
  end_time: `${addDays(today, 1)} 11:00`,
  location: '集团公司大楼 3 楼会议室',
  attendees: [
    { contact_id: wang.id, name: '王主任' },
    { contact_id: zhang.id, name: '张经理' }
  ],
  reminder_enabled: 1,
  reminder_minutes: 30
})
mk({
  calendar_id: byName('客运部会议日程'),
  kind: 'meeting',
  title: '换季航班保障协调会',
  category: '协调会',
  description: '确认换季首日航班保障、异常航班处置与信息通报流程',
  start_time: `${addDays(today, 1)} 15:00`,
  end_time: `${addDays(today, 1)} 16:00`,
  location: '天府B216会议室',
  attendees: [
    { contact_id: li.id, name: '李工' },
    { contact_id: piao.id, name: '朴经理' }
  ],
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
markDoneOn(reportDone.id, addDays(today, -20), '16:00')
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
markDoneOn(routineDone.id, addDays(today, -12), '10:30')

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
  description: '与香港航空协调冬季航班时刻与地面保障接口',
  start_time: `${addDays(today, 1)} 10:00`,
  end_time: `${addDays(today, 1)} 11:30`,
  location: '线上会议',
  attendees: [
    { contact_id: zhang.id, name: '张经理' },
    { contact_id: null, name: '香港航空 陈经理' }
  ]
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
markDoneOn(doneEv.id, weekStart, '17:30')

// 明日临时事项(用于「明日待办」中会议/事项分列演示)
mk({
  calendar_id: byName('例行工作'),
  kind: 'task',
  title: '整理换季检查单',
  category: '例行',
  description: '补齐换季检查单签字页,交综合部归档',
  start_time: `${addDays(today, 1)} 09:00`,
  end_time: `${addDays(today, 1)} 11:00`,
  contact_id: wang.id
})

// 例行事项演示:每周固定星期/时间,自动排入未来 12 个月日历
/** 今天起第一个目标星期(0=周日 … 5=周五),当天即为该星期时返回今天 */
function nextWeekday(target: number): string {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return addDays(today, (target - base.getDay() + 7) % 7)
}
const weeklyReportDate = nextWeekday(5)
seriesService.createSeries(
  {
    calendar_id: byName('例行工作'),
    title: '提交周报',
    category: '例行',
    description: '汇总本周工作进展与下周计划,发送部门群',
    start_time: `${weeklyReportDate} 15:30`,
    end_time: `${weeklyReportDate} 16:30`,
    location: '办公室',
    contact_id: wang.id,
    reminder_enabled: 1,
    reminder_minutes: 30
  },
  now
)
const weeklyPlanDate = addDays(today, 1)
seriesService.createSeries(
  {
    calendar_id: byName('例行工作'),
    title: '周计划梳理',
    category: '例行',
    description: '整理本周重点任务与待办优先级',
    start_time: `${weeklyPlanDate} 08:30`,
    end_time: `${weeklyPlanDate} 09:00`,
    location: '工位'
  },
  now
)

// 工作纲要演示(板块 09):本月/本周的已完成例行、对接、报告与会议
const extraDoneDefs: Array<{
  kind: 'task' | 'meeting'
  cal: string
  title: string
  category: string
  offset: number
  description: string
  contact?: number
  location?: string
}> = [
  {
    kind: 'task',
    cal: '对接事项',
    title: '韩亚航空换季计划对接确认',
    category: '对接',
    offset: -2,
    contact: zhang.id,
    description: '与韩亚航空确认冬春航季时刻与保障要求,更新对接台账'
  },
  {
    kind: 'task',
    cal: '报告提交',
    title: '10月安全服务简报',
    category: '报告',
    offset: -1,
    description: '汇总10月安全服务数据,形成月度简报报送质安部'
  },
  {
    kind: 'task',
    cal: '例行工作',
    title: '办公物资需求统计',
    category: '例行',
    offset: -5,
    description: '统计各岗位办公物资需求并提交综合部'
  },
  {
    kind: 'task',
    cal: '对接事项',
    title: '双流机场保障资源确认',
    category: '对接',
    offset: -7,
    contact: wang.id,
    description: '与双流机场地服确认换季保障资源与联络人'
  },
  {
    kind: 'meeting',
    cal: '韩亚项目组',
    title: '换季保障周例会',
    category: '例会',
    offset: -2,
    description: '换季保障周例会,通报准备进度并协调待办',
    location: '天府B216会议室'
  },
  // 历史完成项(板块 10 工作统计图表:近 6 个月趋势/分类/对接人演示数据)
  {
    kind: 'task',
    cal: '对接事项',
    title: '暑运保障资源复盘',
    category: '对接',
    offset: -38,
    contact: li.id,
    description: '复盘暑运期间保障资源使用情况,整理对接问题清单'
  },
  {
    kind: 'meeting',
    cal: '客运部会议日程',
    title: '暑运总结会',
    category: '例会',
    offset: -45,
    description: '客运部暑运工作总结会',
    location: '天府B216会议室'
  },
  {
    kind: 'task',
    cal: '报告提交',
    title: '暑运安全服务总结报告',
    category: '报告',
    offset: -66,
    description: '汇总暑运安全服务数据并形成总结报告'
  },
  {
    kind: 'task',
    cal: '例行工作',
    title: '岗位值班表编排',
    category: '例行',
    offset: -75,
    description: '编排下一周期岗位值班表'
  },
  {
    kind: 'meeting',
    cal: '韩亚项目组',
    title: '韩亚项目月度协调会',
    category: '协调会',
    offset: -95,
    description: '与韩亚项目组召开月度协调会',
    location: '线上会议'
  },
  {
    kind: 'task',
    cal: '对接事项',
    title: '双流机场地服对接',
    category: '对接',
    offset: -105,
    contact: wang.id,
    description: '与双流机场地服对接航班保障事宜'
  },
  {
    kind: 'task',
    cal: '报告提交',
    title: '二季度服务数据分析',
    category: '报告',
    offset: -125,
    description: '分析二季度服务数据并形成报告'
  },
  {
    kind: 'meeting',
    cal: '客运部会议日程',
    title: '季度安全讲评会',
    category: '例会',
    offset: -155,
    description: '参加客运部季度安全讲评会',
    location: '天府B216会议室'
  }
]
for (const d of extraDoneDefs) {
  const date = addDays(today, d.offset)
  const row = events.create({
    calendar_id: byName(d.cal),
    kind: d.kind,
    title: d.title,
    category: d.category,
    description: d.description,
    contact_id: d.contact ?? null,
    start_time: `${date} 09:30`,
    end_time: `${date} ${d.kind === 'meeting' ? '10:30' : '18:00'}`,
    location: d.location ?? ''
  })
  markDoneOn(row.id, date, d.kind === 'meeting' ? '10:30' : '17:00')
}

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

// ---------- 文件板块演示数据(板块 08):真实文件夹 + 文件 + 索引 ----------
// 板块对应本地文件夹,播种到 <数据目录>/demo-files 下,重启后仍可浏览与检索
const demoRoot = resolve(dir, 'demo-files')
rmSync(demoRoot, { recursive: true, force: true })

function demoPath(rel: string): string {
  const full = resolve(demoRoot, rel)
  mkdirSync(dirname(full), { recursive: true })
  return full
}

function writeText(rel: string, text: string): void {
  writeFileSync(demoPath(rel), text, 'utf8')
}

function writeXlsx(rel: string, rows: string[][]): void {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1')
  XLSX.writeFile(wb, demoPath(rel))
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 生成最小可用 docx(仅正文段落),供 docx 正文提取链路演示 */
function writeDocx(rel: string, paragraphs: string[]): void {
  const zip = new AdmZip()
  zip.addFile(
    '[Content_Types].xml',
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '</Types>'
    )
  )
  zip.addFile(
    '_rels/.rels',
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>'
    )
  )
  const body = paragraphs
    .map((p) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(p)}</w:t></w:r></w:p>`)
    .join('')
  zip.addFile(
    'word/document.xml',
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        `<w:body>${body}</w:body></w:document>`
    )
  )
  zip.writeZip(demoPath(rel))
}

/** 仅用于列表展示的占位 PDF(内容检索不解析 PDF) */
function writePdf(rel: string, title: string): void {
  writeText(
    rel,
    `%PDF-1.4\n% 工作台助手演示文件:${title}\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n` +
      '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
      '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n' +
      'trailer<</Root 1 0 R>>\n%%EOF\n'
  )
}

// 客运部工作
writeText(
  '客运部工作/月度报告/1月工作月报.md',
  '# 1月工作月报\n\n本月完成冬春航季换季准备、部门例会组织与月度安全报告提交。\n下月重点:航班换季保障、人员排班优化。\n'
)
writeText(
  '客运部工作/月度报告/2月工作月报.md',
  '# 2月工作月报\n\n完成春运保障复盘,整理旅客服务改进建议 6 条。\n'
)
writeText(
  '客运部工作/例会纪要/周例会纪要-第38周.md',
  '周例会纪要\n时间:周四 09:30\n地点:天府B216会议室\n议题:本周工作进展、换季准备情况、下周计划。\n'
)
writeXlsx('客运部工作/2024冬春换季/换季航班计划表.xlsx', [
  ['航班号', '航线', '换季日期', '机型'],
  ['TV9811', '成都—香港', '2024-10-27', 'A319'],
  ['TV9823', '成都—首尔', '2024-10-27', 'A320'],
  ['TV9866', '成都—曼谷', '2024-10-28', 'A321']
])
writeText(
  '客运部工作/2024冬春换季/换季工作检查单.csv',
  '序号,检查项,负责人,完成情况\n1,航班时刻核对,王主任,已完成\n2,机组排班确认,张经理,进行中\n3,地面保障对接,李工,已完成\n'
)
writeDocx('客运部工作/部门工作制度.docx', [
  '客运部工作制度',
  '本制度适用于客运部全体人员,自发布之日起执行。',
  '一、例会管理:每周四召开部门例会,遇航班换季另行安排专题会。',
  '二、文件管理:工作文件统一归档到部门文件板块,按项目与月份分类。'
])
writeXlsx('客运部工作/人员通讯录.xlsx', [
  ['姓名', '部门', '职位', '电话'],
  ['王主任', '综合部', '综合办主任', '135-0000-9012'],
  ['张经理', '国际部', '国际事务经理', '139-0000-5678'],
  ['李工', '质安部', '质量主管', '138-0000-1234']
])
writePdf('客运部工作/岗位操作手册.pdf', '岗位操作手册')
writeText(
  '客运部工作/换季工作总结.txt',
  '2024冬春换季工作总结\n\n本次换季共调整航班 18 班,完成时刻核对、机组排班与地面保障对接。\n存在问题:部分航线资料回收不及时,后续建立催办清单。\n'
)
writeText(
  '客运部工作/值班安排表.csv',
  '日期,值班人员,联系电话\n周一,王主任,135-0000-9012\n周二,张经理,139-0000-5678\n'
)

// 韩亚项目
writeXlsx('韩亚项目/韩亚航班计划.xlsx', [
  ['航班号', '航线', '班期', '换季调整'],
  ['OZ323', '成都—首尔', '每日', '冬春航季加密至每日两班'],
  ['OZ324', '首尔—成都', '每日', '时刻提前 20 分钟']
])
writeText(
  '韩亚项目/合作协议要点.md',
  '# 韩亚项目合作协议要点\n\n- 对接人:朴经理(驻站代表)、金科长(运控部)\n- 协调机制:每周一次线上协调会\n- 换季期间每日通报航班执行情况\n'
)
writeText(
  '韩亚项目/对接联系人清单.csv',
  '姓名,单位,职位,电话\n朴经理,韩亚航空,驻站代表,136-0000-3456\n金科长,韩亚航空,运控部,137-0000-7890\n'
)
writeDocx('韩亚项目/韩亚协调会纪要.docx', [
  '韩亚协调会纪要',
  '时间:本周二 14:00,线上会议。',
  '议题:冬春换季航班计划、文审材料提交、异常航班协调流程。',
  '结论:换季计划按韩亚总部批复执行,文审材料于月底前提交。'
])

// 双流机场
writeDocx('双流机场/双流机场对接纪要.docx', [
  '双流机场对接纪要',
  '与机场地服部张主任对接行李保障与特殊旅客服务流程。',
  '下一步:完善综保区货运对接清单。'
])
writeText(
  '双流机场/地服保障流程.txt',
  '双流机场地服保障流程\n1. 航班落地前 30 分钟确认机位\n2. 行李分拣与转运\n3. 特殊旅客交接\n'
)
writeText(
  '双流机场/2026年度时刻协调说明.md',
  '# 2026年度时刻协调说明\n\n按机场时刻管理要求,提交年度航班时刻需求与换季调整方案。\n'
)

// 年度工作
writeText(
  '年度工作/年度工作总结大纲.md',
  '# 年度工作总结大纲\n\n一、年度重点工作完成情况\n二、换季保障与安全质量\n三、存在问题与改进措施\n四、下一年度工作计划\n'
)
writeXlsx('年度工作/年度重点工作清单.xlsx', [
  ['序号', '重点工作', '牵头人', '完成情况'],
  ['1', '冬春航季换季保障', '王主任', '进行中'],
  ['2', '服务质量提升专项', '李工', '已完成']
])

// 安全质量
writeText(
  '安全质量/安全检查记录.csv',
  '日期,检查区域,问题描述,整改情况\n2026-10-08,值机区,标识不清,已整改\n2026-10-15,行李分拣区,通道占用,整改中\n'
)
writeXlsx('安全质量/安全培训签到表.xlsx', [
  ['姓名', '培训主题', '签到日期'],
  ['王主任', '换季安全运行', '2026-10-10'],
  ['李工', '换季安全运行', '2026-10-10']
])

// 培训学习
writeText(
  '培训学习/企业微信使用指南.md',
  '# 企业微信使用指南\n\n1. 加入部门群与项目群\n2. 使用日程与会议功能\n3. 文件在群内共享后归档到文件板块\n'
)
writeText(
  '培训学习/培训计划.txt',
  '第四季度培训计划\n- 换季业务培训(10月)\n- 安全规章复训(11月)\n- 服务技能提升(12月)\n'
)

// 会议纪要
writeText(
  '会议纪要/2024冬春换季协调会纪要.md',
  '# 2024冬春换季协调会纪要\n\n时间:10月15日 14:00\n参会:客运部、韩亚项目组、双流机场地服部\n议题:换季航班计划、保障资源、应急预案\n结论:按换季计划执行,建立每日通报机制。\n'
)
writeDocx('会议纪要/部门例会纪要.docx', [
  '部门例会纪要',
  '本周完成换季准备材料汇总,下周进入换季运行保障阶段。',
  '各岗位按值班表落实,异常情况及时上报。'
])

interface DemoBoardDef {
  name: string
  folder: string
  icon: string
}
const demoBoardDefs: DemoBoardDef[] = [
  { name: '客运部工作', folder: '客运部工作', icon: '📋' },
  { name: '韩亚项目', folder: '韩亚项目', icon: '✈️' },
  { name: '双流机场', folder: '双流机场', icon: '🏢' },
  { name: '年度工作', folder: '年度工作', icon: '📊' },
  { name: '安全质量', folder: '安全质量', icon: '🛡️' },
  { name: '培训学习', folder: '培训学习', icon: '🎓' },
  { name: '会议纪要', folder: '会议纪要', icon: '📑' }
]
const demoBoards = demoBoardDefs.map((def) => {
  const root = resolve(demoRoot, def.folder)
  mkdirSync(root, { recursive: true })
  const board = fileBoardsRepo.create({ name: def.name, root_path: root, icon: def.icon })
  const scanned = scanFolder(root)
  fileBoardsRepo.replaceFileItems(board.id, scanned.items)
  return board
})
const demoFileCounts = fileBoardsRepo.countsByBoard()
const demoFileTotal = Object.values(demoFileCounts).reduce((a, b) => a + b, 0)

// 汇总输出(供验收比对)
const summary = computeSummary(events.list(), now)

// 工作纲要演示口径(板块 09):当前月,实时时刻(已召开会议才算参与)
const summaryRange = monthRange(today.slice(0, 7))
const summaryNow = `${today} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
const contactNames = new Map(contacts.list().map((c) => [c.id, c.name]))
const summaryContent = buildSummaryContent(
  events.list(),
  summaryRange,
  summaryNow,
  (id) => contactNames.get(id)
)
const demoSummaryStats = summaryStats(events.list(), summaryRange, summaryNow)

const routineSeriesCount = (
  getDb().prepare('SELECT COUNT(*) AS c FROM event_series WHERE active = 1').get() as { c: number }
).c

const demo = {
  todayMeetings: summary.todayMeetings.length,
  tomorrowMeetings: summary.tomorrowMeetings.length,
  todayTasks: summary.todayTasks.length,
  tomorrowTasks: summary.tomorrowTasks.length,
  routineSeries: routineSeriesCount,
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
  ).length,
  fileBoards: demoBoards.length,
  fileItems: demoFileTotal,
  fileBoardCounts: demoFileCounts,
  fileSearchHits: fileBoardsRepo.searchFileItems('换季').length,
  fileDemoRoot: demoRoot,
  summaryTitle: rangeTitle(summaryRange),
  summaryPeriod: rangeSpanText(summaryRange),
  summaryStats: demoSummaryStats,
  summarySections: summaryContent.sections.map((s) => ({
    key: s.key,
    title: s.title,
    count: s.items.length,
    titles: s.items.map((i) => i.title)
  }))
}
console.log('DEMO_SUMMARY: ' + JSON.stringify(demo))

closeDatabase()
