/**
 * 数据库层验收测试:在 Electron 内置 Node 环境运行(node:sqlite 与 FTS5 行为与应用运行时一致)
 * 运行方式:npm run test:db
 */
import { mkdtempSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  initDatabaseAt,
  getDb,
  schemaVersion,
  closeDatabase,
  dbFilePath
} from '../src/main/db/database'
import * as calendars from '../src/main/db/repositories/calendars'
import * as events from '../src/main/db/repositories/events'
import * as contacts from '../src/main/db/repositories/contacts'
import * as boards from '../src/main/db/repositories/boards'
import * as summaries from '../src/main/db/repositories/summaries'
import * as reminders from '../src/main/db/repositories/reminders'
import * as settings from '../src/main/db/repositories/settings'
import { migrations } from '../src/main/db/migrations'
import { emptySummaryContent } from '../src/shared/summary'

let passed = 0
let failed = 0
const failureDetails: string[] = []

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    failureDetails.push(name)
    console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`)
  }
}

function eq<T>(actual: T, expected: T): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected)
}

const tempDir = mkdtempSync(join(tmpdir(), 'wa-dbtest-'))

try {
  console.log('【1】数据库初始化与迁移')
  initDatabaseAt(tempDir)
  check('数据库文件已创建', existsSync(dbFilePath(tempDir)))
  check('迁移全部应用', schemaVersion() === migrations.length, `实际 v${schemaVersion()}`)
  const tables = (
    getDb().prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]
  ).map((r) => r.name)
  for (const t of [
    'calendars',
    'events',
    'events_fts',
    'contacts',
    'contact_groups',
    'contact_group_map',
    'file_boards',
    'file_items',
    'summary_drafts',
    'reminders',
    'settings',
    'schema_migrations'
  ]) {
    check(`表 ${t} 存在`, tables.includes(t))
  }

  console.log('【2】默认种子数据')
  const defCalendars = calendars.list()
  check('日历分类不内置预设(用户自建)', defCalendars.length === 0, `实际 ${defCalendars.length}`)
  check(
    '默认提醒设置存在',
    settings.get('meeting_reminder_minutes') === '15' &&
      settings.get('daily_push_time') === '09:00'
  )

  console.log('【3】日历分类 CRUD')
  const cal = calendars.create({ name: '测试日历', color: '#123456', kind: 'schedule' })
  check('创建成功且 id 有效', cal.id > 0)
  check('列表包含新分类', calendars.list().some((c) => c.id === cal.id))
  const calUpdated = calendars.update(cal.id, { color: '#654321' })
  check('更新生效', calUpdated.color === '#654321')
  calendars.remove(cal.id)
  check('删除生效', !calendars.list().some((c) => c.id === cal.id))

  console.log('【4】事项 CRUD 与 JSON 字段')
  const ev = events.create({
    title: '向质安部要Q3质量数据',
    kind: 'meeting',
    start_time: '2026-10-20 12:00',
    end_time: '2026-10-20 12:30',
    attendees: [{ contact_id: null, name: '李工' }],
    tags: ['对接', '催办'],
    related_files: ['D:/工作台/Q3数据.xlsx'],
    reminder_days: 2
  })
  check('创建成功', ev.id > 0)
  const evGot = events.get(ev.id)
  check('attendees JSON 解析', eq(evGot.attendees, [{ contact_id: null, name: '李工' }]))
  check('tags JSON 解析', eq(evGot.tags, ['对接', '催办']))
  check('related_files JSON 解析', eq(evGot.related_files, ['D:/工作台/Q3数据.xlsx']))
  check('kind 默认与覆盖', evGot.kind === 'meeting' && evGot.status === 'todo')

  console.log('【5】事项筛选与状态流转')
  events.create({ title: '十一月事项', start_time: '2026-11-05 09:00' })
  const oct = events.list({ from: '2026-10-01', to: '2026-10-31' })
  check(
    '日期区间筛选正确',
    oct.some((e) => e.title === '向质安部要Q3质量数据') && !oct.some((e) => e.title === '十一月事项')
  )
  const doneEv = events.setStatus(ev.id, 'done')
  check('状态流转为已完成', doneEv.status === 'done' && doneEv.completed_at !== null)
  check('按状态筛选生效', events.list({ status: 'done' }).some((e) => e.id === ev.id))

  console.log('【6】FTS5 全文检索与触发器同步')
  const ftsEv = events.create({ title: '关于2024年航班换季的通知', description: '冬春航季' })
  check('FTS 命中"换季"', events.searchFts('换季').some((e) => e.id === ftsEv.id))
  events.update(ftsEv.id, { title: '关于2025年暑运的通知' })
  check('更新后旧词失效', !events.searchFts('换季').some((e) => e.id === ftsEv.id))
  check('更新后新词命中', events.searchFts('暑运').some((e) => e.id === ftsEv.id))
  events.remove(ftsEv.id)
  check('删除后索引同步移除', !events.searchFts('暑运').some((e) => e.id === ftsEv.id))

  console.log('【7】联系人、分组与多对多关联')
  const c1 = contacts.create({ name: '李工', department: '质安部', phone: '13800001234' })
  const g1 = contacts.createGroup({ name: '质安部' })
  const g2 = contacts.createGroup({ name: '常用' })
  contacts.setGroups(c1.id, [g1.id, g2.id])
  check('setGroups 多分组写入', eq(contacts.groupIdsOf(c1.id), [g1.id, g2.id]))
  check('按分组查询联系人', contacts.listContactsByGroup(g1.id).some((c) => c.id === c1.id))
  check('关键词搜索联系人', contacts.list('质安').some((c) => c.id === c1.id))
  const c1u = contacts.update(c1.id, { position: '质量主管' })
  check('联系人更新生效', c1u.position === '质量主管')
  contacts.remove(c1.id)
  check(
    '删除联系人级联清理分组映射',
    getDb().prepare('SELECT COUNT(*) AS c FROM contact_group_map WHERE contact_id = ?').get(c1.id)
      ?.c === 0
  )

  console.log('【8】文件板块 CRUD')
  const b1 = boards.create({ name: '客运部工作', root_path: 'D:/我的工作台/客运部工作' })
  check('板块创建成功', b1.id > 0 && boards.list().some((b) => b.id === b1.id))
  const b1u = boards.update(b1.id, { icon: '📋' })
  check('板块更新生效', b1u.icon === '📋')
  boards.remove(b1.id)
  check('板块删除生效', !boards.list().some((b) => b.id === b1.id))

  console.log('【9】提醒生命周期')
  const r1 = reminders.create({
    event_id: ev.id,
    remind_at: '2026-10-18 09:00',
    type: 'deadline',
    message: '李工的Q3数据还有2天截止'
  })
  check(
    '待触发提醒可查询',
    reminders.listPending('2026-10-19 00:00').some((r) => r.id === r1.id)
  )
  reminders.markFired(r1.id)
  check('标记已触发后不再待触发', !reminders.listPending('2026-10-19 00:00').some((r) => r.id === r1.id))
  check(
    '按事项查询提醒记录',
    reminders.listByEvent(ev.id).some((r) => r.id === r1.id && r.status === 'fired')
  )

  console.log('【10】设置读写')
  settings.set('test_key', 'v1')
  check('设置写入读取', settings.get('test_key') === 'v1')
  check('全部设置包含写入项', settings.all()['test_key'] === 'v1')
  check('待办会议默认文字标签', settings.get('meeting_display_mode') === 'text')
  const v8 = migrations.find((m) => m.version === 8)
  check('v8 迁移已定义', v8?.name === 'meeting-display-and-summary-notice')
  settings.set(
    'summary_template',
    JSON.stringify({
      include_stats: true,
      include_note: true,
      sections: ['routine', 'meeting', 'report']
    })
  )
  if (v8) getDb().exec(v8.up)
  const upgradedTemplate = JSON.parse(settings.get('summary_template') ?? '{}') as {
    sections?: string[]
  }
  check(
    'v8 在会议参与后补入会议通知章节',
    eq(upgradedTemplate.sections, ['routine', 'meeting', 'meeting_notice', 'report'])
  )
  if (v8) getDb().exec(v8.up)
  check(
    'v8 补章节迁移幂等',
    eq(JSON.parse(settings.get('summary_template') ?? '{}').sections, [
      'routine',
      'meeting',
      'meeting_notice',
      'report'
    ])
  )
  settings.set(
    'summary_template',
    JSON.stringify({ include_stats: true, include_note: true, sections: ['routine', 'report'] })
  )
  if (v8) getDb().exec(v8.up)
  check(
    'v8 无会议章节时追加到末尾',
    eq(JSON.parse(settings.get('summary_template') ?? '{}').sections, [
      'routine',
      'report',
      'meeting_notice'
    ])
  )

  console.log('【10.5】工作纲要草稿')
  check('未保存的周期返回 null', summaries.get('month', '2026-10') === null)
  const draftContent = emptySummaryContent()
  draftContent.note = '本月补充说明'
  draftContent.sections[0].items.push({
    id: 'manual-1',
    title: '手动补充事项',
    description: '补充说明',
    date: '2026-10-08',
    source: 'manual'
  })
  const savedDraft = summaries.save({
    period_type: 'month',
    period_key: '2026-10',
    title: '2026年10月工作内容纲要',
    range_start: '2026-10-01',
    range_end: '2026-10-31',
    content: draftContent
  })
  check('草稿保存成功', savedDraft.id > 0)
  check('草稿标题落库', savedDraft.title === '2026年10月工作内容纲要')
  check('草稿内容 JSON 可读回', savedDraft.content.sections[0].items.length === 1)
  check('草稿备注落库', savedDraft.content.note === '本月补充说明')
  check('按周期读取草稿', summaries.get('month', '2026-10')?.id === savedDraft.id)
  check('不同周期互不影响', summaries.get('week', '2026-10-19') === null)
  const updatedDraft = summaries.save({
    period_type: 'month',
    period_key: '2026-10',
    title: '2026年10月工作内容纲要(修订)',
    range_start: '2026-10-01',
    range_end: '2026-10-31',
    content: draftContent
  })
  check('同周期重复保存为覆盖更新', updatedDraft.id === savedDraft.id)
  check(
    '覆盖后仅一条记录',
    (getDb().prepare("SELECT COUNT(*) n FROM summary_drafts WHERE period_type='month'").get() as { n: number }).n === 1
  )
  check('覆盖后标题更新', summaries.get('month', '2026-10')?.title.includes('修订') === true)
  summaries.save({
    period_type: 'week',
    period_key: '2026-10-19',
    title: '2026年10月19日 - 10月25日工作内容纲要',
    range_start: '2026-10-19',
    range_end: '2026-10-25',
    content: emptySummaryContent()
  })
  check('周草稿与月草稿并存', summaries.get('week', '2026-10-19') !== null)
  summaries.remove('week', '2026-10-19')
  check('删除草稿', summaries.get('week', '2026-10-19') === null)

  console.log('【11】外键行为与迁移幂等')
  const calOwn = calendars.create({ name: '自建日历', color: '#123456', kind: 'schedule' })
  const evCal = events.create({ title: '外键测试', calendar_id: calOwn.id })
  calendars.remove(calOwn.id)
  check('删除日历后事项 calendar_id 置空', events.get(evCal.id).calendar_id === null)
  events.remove(evCal.id)
  closeDatabase()
  initDatabaseAt(tempDir)
  check('重开数据库迁移幂等', schemaVersion() === migrations.length)
  check('重开数据库数据持久化', calendars.list().length === 0, `实际 ${calendars.list().length}`)
  check('重开后纲要草稿仍在', summaries.get('month', '2026-10')?.title.includes('修订') === true)
  const calPersist = calendars.create({ name: '重开自建', kind: 'meeting' })
  closeDatabase()
  initDatabaseAt(tempDir)
  check('重开后自建日历仍在', calendars.list().some((c) => c.id === calPersist.id))
  closeDatabase()
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

console.log(`\n结果: ${passed} 项通过, ${failed} 项失败`)
if (failed > 0) {
  console.error('失败项:', failureDetails.join('; '))
  process.exit(1)
}
