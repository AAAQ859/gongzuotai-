/**
 * 工作统计图表纯逻辑验收测试(utils/work-stats.ts)。
 * 运行方式:npm run test:stats
 * 覆盖:月份槽位(含跨年/边界)、月度完成趋势、分类占比(排序/合并其他/未分类)、
 *       对接人活跃度(排序/回退/上限)、niceMax 整齐刻度、barHeight 映射。
 */
import type { Contact, WorkEvent } from '../src/shared/types'
import {
  barHeight,
  categoryBreakdown,
  contactActivity,
  monthSlots,
  monthlyTrend,
  niceMax
} from '../src/renderer/src/utils/work-stats'

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

function event(over: Partial<WorkEvent> = {}): WorkEvent {
  return {
    id: 1,
    calendar_id: 1,
    kind: 'task',
    title: '事项',
    description: '',
    start_time: null,
    end_time: null,
    all_day: 0,
    location: '',
    attendees: [],
    status: 'done',
    category: '',
    tags: [],
    contact_id: null,
    reminder_enabled: 0,
    reminder_minutes: null,
    reminder_days: null,
    related_files: [],
    sort_order: 0,
    completed_at: null,
    created_at: '2026-01-01 00:00',
    updated_at: '2026-01-01 00:00',
    ...over
  }
}

function contact(over: Partial<Contact> = {}): Contact {
  return {
    id: 1,
    name: '张三',
    kind: 'person',
    department: '',
    position: '',
    phone: '',
    wechat: '',
    email: '',
    remark: '',
    avatar_color: '',
    is_favorite: 0,
    member_count: null,
    purpose: '',
    created_at: '',
    updated_at: '',
    ...over
  }
}

const NOW = new Date(2026, 9, 22, 10, 0) // 2026-10-22 10:00

// ---------- monthSlots ----------
{
  const slots = monthSlots(NOW, 6)
  check('6 个月槽位数量', slots.length === 6)
  check('槽位从早到晚', slots[0].key === '2026-05' && slots[5].key === '2026-10')
  check('槽位文案为「5月」', slots[0].label === '5月' && slots[5].label === '10月')
  check('槽位格式 YYYY-MM 补零', slots[0].key === '2026-05' && slots[5].key === '2026-10')

  const crossYear = monthSlots(new Date(2027, 1, 15), 6)
  check(
    '跨年槽位正确(2026-09 → 2027-02)',
    crossYear[0].key === '2026-09' && crossYear[5].key === '2027-02'
  )
  check('跨年文案正确', crossYear[0].label === '9月' && crossYear[4].label === '1月')

  check('months=1 仅当前月', monthSlots(NOW, 1).length === 1 && monthSlots(NOW, 1)[0].key === '2026-10')
  check('months=0 至少 1 个月', monthSlots(NOW, 0).length === 1)
  check('months 取整', monthSlots(NOW, 3.9).length === 3)
  check('默认 6 个月', monthSlots(NOW).length === 6)
}

// ---------- monthlyTrend ----------
{
  const events: WorkEvent[] = [
    event({ id: 1, status: 'done', completed_at: '2026-10-01 09:00' }),
    event({ id: 2, status: 'done', completed_at: '2026-10-20 18:30' }),
    event({ id: 3, status: 'done', completed_at: '2026-05-01 00:00' }),
    event({ id: 4, status: 'done', completed_at: '2026-04-30 23:59' }), // 范围外
    event({ id: 5, status: 'todo', completed_at: '2026-10-05 09:00' }), // 未完成
    event({ id: 6, status: 'cancelled', completed_at: '2026-10-06 09:00' }), // 已取消
    event({ id: 7, status: 'done', completed_at: null }),
    event({
      id: 8,
      kind: 'meeting',
      status: 'todo',
      start_time: '2026-09-10 14:00',
      completed_at: null
    }),
    event({ id: 9, kind: 'meeting', status: 'done', start_time: '2026-08-01 09:00' }),
    event({ id: 10, kind: 'meeting', status: 'todo', start_time: '2026-10-30 09:00' }), // 尚未召开
    event({ id: 11, kind: 'meeting', status: 'cancelled', start_time: '2026-07-01 09:00' }),
    event({ id: 12, kind: 'meeting', status: 'todo', start_time: '2026-03-01 09:00' }) // 范围外
  ]
  const trend = monthlyTrend(events, NOW, 6)
  const byKey = new Map(trend.map((p) => [p.key, p]))
  check('趋势槽位数量', trend.length === 6)
  check('10 月完成 2 项', byKey.get('2026-10')?.done === 2)
  check('5 月完成 1 项', byKey.get('2026-05')?.done === 1)
  check('范围外月份不产生槽位', !byKey.has('2026-04'))
  check('范围内完成合计 = 3', trend.reduce((s, p) => s + p.done, 0) === 3)
  check('往期未完成会议按已召开计入(9 月 1 场)', byKey.get('2026-09')?.meetings === 1)
  check('已完成会议按开始时间计入(8 月 1 场)', byKey.get('2026-08')?.meetings === 1)
  check('未来会议不计入(10 月 0 场)', byKey.get('2026-10')?.meetings === 0)
  check('取消会议不计入(7 月 0 场)', byKey.get('2026-07')?.meetings === 0)
  check('范围外会议不计入(3 月无槽位)', !byKey.has('2026-03'))
  check('空数据全为 0', monthlyTrend([], NOW, 6).every((p) => p.done === 0 && p.meetings === 0))

  const crossYear = monthlyTrend(
    [
      event({ status: 'done', completed_at: '2026-12-31 23:59' }),
      event({ status: 'done', completed_at: '2027-01-01 00:00' })
    ],
    new Date(2027, 1, 1),
    6
  )
  check(
    '跨年归月不串月',
    crossYear.find((p) => p.key === '2026-12')?.done === 1 &&
      crossYear.find((p) => p.key === '2027-01')?.done === 1
  )
}

// ---------- categoryBreakdown ----------
{
  const events: WorkEvent[] = [
    event({ status: 'done', category: '报告材料', completed_at: '2026-10-01 09:00' }),
    event({ status: 'done', category: '报告材料', completed_at: '2026-09-01 09:00' }),
    event({ status: 'done', category: ' 报告材料 ', completed_at: '2026-08-01 09:00' }),
    event({ status: 'done', category: '对接协调', completed_at: '2026-10-02 09:00' }),
    event({ status: 'done', category: '例行工作', completed_at: '2026-10-03 09:00' }),
    event({ status: 'done', category: '', completed_at: '2026-10-04 09:00' }),
    event({ status: 'done', category: '   ', completed_at: '2026-10-05 09:00' }),
    event({ status: 'todo', category: '报告材料', completed_at: '2026-10-06 09:00' }),
    event({ status: 'cancelled', category: '报告材料', completed_at: '2026-10-07 09:00' }),
    event({ status: 'done', category: '报告材料', completed_at: '2026-04-01 09:00' }) // 范围外
  ]
  const rows = categoryBreakdown(events, NOW, 6, 6)
  const byName = new Map(rows.map((r) => [r.name, r]))
  check('分类聚合数量(报告材料/对接协调/例行工作/未分类)', rows.length === 4)
  check('分类名称前后空格归一', byName.get('报告材料')?.count === 3)
  check('空分类归入「未分类」', byName.get('未分类')?.count === 2)
  check('未完成/取消不计入', byName.get('报告材料')?.count === 3)
  check('按数量降序', rows[0].name === '报告材料')
  check('百分比保留一位小数', rows.every((r) => Number.isInteger(r.percent * 10)))
  check('百分比之和约等于 100', Math.abs(rows.reduce((s, r) => s + r.percent, 0) - 100) < 0.2)
  check('「未分类」使用灰色', byName.get('未分类')?.color === '#ADB5BD')
  check('有分类项使用分类色(非灰)', byName.get('对接协调')?.color !== '#ADB5BD')
  check('无数据返回空数组', categoryBreakdown([], NOW, 6, 6).length === 0)
  check('全部非完成事项返回空数组', categoryBreakdown([event({ status: 'todo' })], NOW, 6, 6).length === 0)

  const many: WorkEvent[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((name, i) =>
    event({ status: 'done', category: name, completed_at: `2026-10-0${i + 1} 09:00` })
  )
  const limited = categoryBreakdown(many, NOW, 6, 6)
  check('超过 limit 合并「其他」(6 + 其他)', limited.length === 7)
  check('「其他」数量为尾部合计 1', limited[6].name === '其他' && limited[6].count === 1)
  check('「其他」使用灰色', limited[6].color === '#ADB5BD')
  check('limit=1 时 1 项 + 其他', categoryBreakdown(many, NOW, 6, 1).length === 2)
  check('limit=0 按 1 处理', categoryBreakdown(many, NOW, 6, 0).length === 2)
  check('分类并列按名称排序', (() => {
    const tie = categoryBreakdown(
      [
        event({ status: 'done', category: '乙', completed_at: '2026-10-01 09:00' }),
        event({ status: 'done', category: '甲', completed_at: '2026-10-02 09:00' })
      ],
      NOW,
      6,
      6
    )
    return tie.map((r) => r.name).join(',') === '甲,乙'
  })())
}

// ---------- contactActivity ----------
{
  const contacts: Contact[] = [
    contact({ id: 1, name: '张三', department: ' 办公室 ' }),
    contact({ id: 2, name: '', department: '财务部' }),
    contact({ id: 3, name: '李四', department: '市场部' })
  ]
  const events: WorkEvent[] = [
    event({ status: 'done', contact_id: 1, completed_at: '2026-10-01 09:00' }),
    event({ status: 'done', contact_id: 1, completed_at: '2026-09-01 09:00' }),
    event({ status: 'done', contact_id: 2, completed_at: '2026-10-02 09:00' }),
    event({ status: 'done', contact_id: 3, completed_at: '2026-08-02 09:00' }),
    event({ status: 'done', contact_id: 99, completed_at: '2026-10-03 09:00' }), // 联系人已删除
    event({ status: 'todo', contact_id: 3, completed_at: '2026-10-04 09:00' }),
    event({ status: 'done', contact_id: 3, completed_at: '2026-04-04 09:00' }), // 范围外
    event({ status: 'done', contact_id: null, completed_at: '2026-10-05 09:00' })
  ]
  const rows = contactActivity(events, contacts, NOW, 6, 5)
  const byId = new Map(rows.map((r) => [r.id, r]))
  check('对接人聚合数量', rows.length === 4)
  check('数量降序(张三 2 项居首)', rows[0].id === 1 && rows[0].count === 2)
  check('部门去除前后空格', byId.get(1)?.department === '办公室')
  check('缺失联系人回退「未知联系人」', byId.get(99)?.name === '未知联系人')
  check('联系人名为空白时回退', byId.get(2)?.name === '未知联系人')
  check('未完成/取消/范围外不计入', byId.get(3)?.count === 1)
  check('Top N 限制', contactActivity(events, contacts, NOW, 6, 2).length === 2)
  check('limit=0 按 1 处理', contactActivity(events, contacts, NOW, 6, 0).length === 1)
  check('无关联完成事项返回空数组', contactActivity([], contacts, NOW, 6, 5).length === 0)
  check('并列按名称排序', (() => {
    const tie = contactActivity(
      [
        event({ status: 'done', contact_id: 1, completed_at: '2026-10-01 09:00' }),
        event({ status: 'done', contact_id: 3, completed_at: '2026-10-02 09:00' })
      ],
      contacts,
      NOW,
      6,
      5
    )
    return tie.map((r) => r.name).join(',') === '李四,张三' // 本地化拼音排序:l 在 z 前
  })())
}

// ---------- niceMax ----------
check('niceMax([]) = 1', niceMax([]) === 1)
check('niceMax([0, 0]) = 1', niceMax([0, 0]) === 1)
check('niceMax([3]) = 5', niceMax([3]) === 5)
check('niceMax([5]) = 5', niceMax([5]) === 5)
check('niceMax([6]) = 10', niceMax([6]) === 10)
check('niceMax([10]) = 10', niceMax([10]) === 10)
check('niceMax([11]) = 20', niceMax([11]) === 20)
check('niceMax([100]) = 100', niceMax([100]) === 100)
check('niceMax([101]) = 200', niceMax([101]) === 200)
check('niceMax([499]) = 500', niceMax([499]) === 500)
check('niceMax([1000]) = 1000', niceMax([1000]) === 1000)
check('niceMax 下限 1(小数计数按 1 处理)', niceMax([0.5]) === 1)
check('niceMax([0.3]) = 1', niceMax([0.3]) === 1)
check('niceMax 忽略负数', niceMax([-5, 3]) === 5)
check('niceMax 取最大值', niceMax([1, 7, 2]) === 10)
check('niceMax 过滤 NaN/Infinity', niceMax([NaN, Infinity, 4]) === 5)

// ---------- barHeight ----------
check('barHeight 0 → 0', barHeight(0, 10, 100) === 0)
check('barHeight max=0 → 0', barHeight(5, 0, 100) === 0)
check('barHeight 负值 → 0', barHeight(-1, 10, 100) === 0)
check('barHeight 5/10 → 半高', barHeight(5, 10, 100) === 50)
check('barHeight 超过 max 封顶', barHeight(20, 10, 100) === 100)
check('barHeight 保留两位小数', barHeight(1, 3, 100) === 33.33)
check('barHeight 高度比例', barHeight(2, 5, 136) === 54.4)

console.log('')
if (failed) {
  console.log(`✗ 工作统计测试失败 ${failed} 项 / 共 ${passed + failed} 项`)
  for (const f of failureDetails) console.log(`  - ${f}`)
  process.exit(1)
}
console.log(`✓ 工作统计测试全部通过(${passed} 项)`)
