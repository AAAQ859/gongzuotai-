/**
 * 联络接口纯逻辑验收测试(utils/contacts.ts)。
 * 运行方式:npm run test:contacts
 */
import type { Contact, WorkEvent } from '@shared/types'
import {
  deadlineLabel,
  filterContacts,
  followupOf,
  parseContactsCsv,
  parseCsvLine,
  sortContacts
} from '../src/renderer/src/utils/contacts'

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
function mkContact(partial: Partial<Contact>): Contact {
  seq++
  return {
    id: seq,
    name: `联系人${seq}`,
    kind: 'person',
    department: '',
    position: '',
    phone: '',
    wechat: '',
    email: '',
    remark: '',
    avatar_color: '#CED4DA',
    is_favorite: 0,
    member_count: null,
    purpose: '',
    created_at: '',
    updated_at: '',
    ...partial
  }
}

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
  }
}

console.log('【1】CSV 行解析')
check('普通行按逗号切分', JSON.stringify(parseCsvLine('a,b,c')) === '["a","b","c"]')
check('双引号包裹含逗号字段', JSON.stringify(parseCsvLine('"张,三",质安部,主管')) === '["张,三","质安部","主管"]')
check('"" 转义为字面双引号', parseCsvLine('"他说""你好""",x')[0] === '他说"你好"')
check('空行 → 单个空串', JSON.stringify(parseCsvLine('')) === '[""]')

console.log('【2】CSV 导入解析(带表头)')
const withHeader = `姓名,部门,职位,电话,微信,邮箱,备注
李工,质安部,质量主管,13800001234,ligong,li@example.com,负责Q3数据
朴经理,韩亚航空,驻站代表,13900005678,piaojl,,
"金,科长",韩亚航空,运控部,13700009012,,,
,缺少姓名行,,`
const h = parseContactsCsv(withHeader)
check('解析 3 行有效', h.rows.length === 3)
check('首行姓名', h.rows[0].name === '李工' && h.rows[0].department === '质安部')
check('职位/电话/微信/邮箱/备注', h.rows[0].position === '质量主管' && h.rows[0].phone === '13800001234' && h.rows[0].wechat === 'ligong' && h.rows[0].remark === '负责Q3数据')
check('缺列补空串', h.rows[1].email === '' && h.rows[1].remark === '')
check('引号包裹含逗号姓名', h.rows[2].name === '金,科长')
check('缺姓名行记录错误', h.errors.length === 1 && /第 5 行/.test(h.errors[0]), h.errors.join(';'))

console.log('【3】CSV 导入解析(无表头固定列序)')
const noHeader = `王主任,综合部,主任,13500001111,wang,,
崔姐,国际部,结算,13600002222,,cui@example.com,`
const nh = parseContactsCsv(noHeader)
check('无表头按列序解析 2 行', nh.rows.length === 2)
check('列序:姓名/部门/职位/电话/微信/邮箱/备注', nh.rows[0].name === '王主任' && nh.rows[0].wechat === 'wang' && nh.rows[0].email === '')
check('第二行邮箱/备注', nh.rows[1].email === 'cui@example.com' && nh.rows[1].phone === '13600002222')
check('英文表头兼容', parseContactsCsv('Name,Department\nAlice,QA').rows[0].name === 'Alice')

console.log('【4】待跟进联动与截止文案')
const NOW = new Date(2026, 9, 21, 10, 0) // 2026-10-21 周三
const li = mkContact({ id: 100, name: '李工', department: '质安部' })
const zhang = mkContact({ id: 101, name: '张主任', department: '综合部' })
const evs = [
  mkEvent({ contact_id: 100, category: '对接', end_time: '2026-10-21 18:00' }), // 今日截止 → 待跟进
  mkEvent({ contact_id: 100, category: '对接', end_time: '2026-10-24 18:00' }), // 本周六 → 待跟进
  mkEvent({ contact_id: 100, category: '对接', end_time: '2026-10-20 18:00', status: 'done' }), // 已完成 → 不算
  mkEvent({ contact_id: 100, category: '报告', end_time: '2026-10-21 18:00' }), // 非对接 → 不算
  mkEvent({ contact_id: 101, category: '对接', end_time: '2026-10-26 18:00' }), // 下周 → 不算
  mkEvent({ contact_id: 101, category: '对接', end_time: '2026-10-20 09:00' }) // 已逾期 → 待跟进
]
const fu = followupOf(li, evs, NOW)
check('李工待跟进 2 项(今日+本周六)', fu.due && fu.items.length === 2)
check('按截止排序:今日在前', fu.items[0].end_time === '2026-10-21 18:00')
const fu2 = followupOf(zhang, evs, NOW)
check('张主任仅逾期项算待跟进', fu2.due && fu2.items.length === 1)
check('截止文案-已逾期', deadlineLabel('2026-10-20 09:00', NOW) === '已逾期')
check('截止文案-今日', deadlineLabel('2026-10-21 23:59', NOW) === '今日')
check('截止文案-明日', deadlineLabel('2026-10-22 10:00', NOW) === '明日')
check('截止文案-N天后', deadlineLabel('2026-10-24 10:00', NOW) === '3天后')

console.log('【5】分组/类型/搜索/常用筛选')
const c1 = mkContact({ name: '李工', kind: 'person', department: '质安部', is_favorite: 1 })
const c2 = mkContact({ name: '韩亚协调工作群', kind: 'group', department: '微信群', member_count: 12 })
const c3 = mkContact({ name: '朴经理', kind: 'person', department: '韩亚航空', phone: '13900005678' })
const groupsOf = new Map<number, number[]>([
  [c1.id, [1, 2]],
  [c2.id, [2]],
  [c3.id, [1]]
])
const all = [c1, c2, c3]
const f = (patch: Partial<Parameters<typeof filterContacts>[1]> = {}) =>
  filterContacts(all, {
    groupId: null,
    q: '',
    kind: 'all',
    onlyFavorite: false,
    onlyFollowup: false,
    followupIds: new Set(),
    groupsOf,
    ...patch
  })
check('分组1 → 李工+朴经理', f({ groupId: 1 }).map((c) => c.id).join() === `${c1.id},${c3.id}`)
check('分组2 → 李工+群组(联系人可属多分组)', f({ groupId: 2 }).map((c) => c.id).join() === `${c1.id},${c2.id}`)
check('仅群组', f({ kind: 'group' }).map((c) => c.id).join() === String(c2.id))
check('常用筛选', f({ onlyFavorite: true }).map((c) => c.id).join() === String(c1.id))
check('搜索电话命中', f({ q: '1390000' }).map((c) => c.id).join() === String(c3.id))
check('搜索群用途命中', (() => {
  const g = mkContact({ name: 'X群', kind: 'group', purpose: '主要对接韩亚航班事宜' })
  return filterContacts([g], { groupId: null, q: '韩亚航班', kind: 'all', onlyFavorite: false, onlyFollowup: false, followupIds: new Set(), groupsOf: new Map() }).length === 1
})())
check('待跟进筛选', f({ onlyFollowup: true, followupIds: new Set([c1.id]) }).map((c) => c.id).join() === String(c1.id))
check('分组+类型叠加', f({ groupId: 2, kind: 'group' }).map((c) => c.id).join() === String(c2.id))

console.log('【6】排序')
const sAll = [c2, c3, c1]
check('按姓名(中文拼音序)', sortContacts(sAll, 'name', new Set()).map((c) => c.name).join('|') === '韩亚协调工作群|李工|朴经理', sortContacts(sAll, 'name', new Set()).map((c) => c.name).join('|'))
check('常用优先', sortContacts(sAll, 'favorite', new Set())[0].id === c1.id)
check('待跟进优先', sortContacts(sAll, 'followup', new Set([c3.id]))[0].id === c3.id)

console.log(`\n结果: ${passed} 项通过, ${failed} 项失败`)
if (failed > 0) {
  console.error('失败项:', failureDetails.join('; '))
  process.exit(1)
}
