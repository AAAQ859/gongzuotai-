/**
 * 例行事项系列验收测试(数据库 + 系列服务)。
 * 运行方式:npm run test:series
 * 覆盖:迁移 v7、每周展开生成、启动续期幂等、仅本次删除/改期例外、
 *       整个系列编辑(保留历史/已完成/取消)、整个系列删除、外键清理。
 */
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { closeDatabase, getDb, initDatabaseAt, schemaVersion } from '../src/main/db/database'
import { migrations } from '../src/main/db/migrations'
import * as eventsRepo from '../src/main/db/repositories/events'
import * as seriesRepo from '../src/main/db/repositories/series'
import * as seriesService from '../src/main/series/service'
import { weeklyDatesBetween } from '../src/shared/recurrence'

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

function throwsWith(fn: () => unknown, text: string): boolean {
  try {
    fn()
    return false
  } catch (err) {
    return err instanceof Error && err.message.includes(text)
  }
}

const tempDir = mkdtempSync(join(tmpdir(), 'wa-series-test-'))
const NOW = new Date(2026, 9, 21, 10, 0) // 2026-10-21 周三
const MAIN_START = '2026-10-23 15:30'
const MAIN_END = '2026-10-23 16:30'

function datesOf(seriesId: number): string[] {
  return eventsRepo
    .listBySeries(seriesId)
    .map((e) => e.start_time?.slice(0, 10))
    .filter((d): d is string => !!d)
}

try {
  console.log('【1】迁移 v7 与表结构')
  initDatabaseAt(tempDir)
  check('迁移版本为最新', schemaVersion() === migrations.length, `实际 v${schemaVersion()}`)
  check('v7 已定义', migrations.some((m) => m.version === 7 && m.name === 'routine-task-series'))
  const tables = (
    getDb().prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]
  ).map((r) => r.name)
  check('event_series 表存在', tables.includes('event_series'))
  check('event_series_exceptions 表存在', tables.includes('event_series_exceptions'))
  const cols = (
    getDb().prepare('PRAGMA table_info(events)').all() as { name: string; dflt_value: string | null }[]
  )
  const colNames = cols.map((c) => c.name)
  check('events.task_type 列存在', colNames.includes('task_type'))
  check('events.series_id 列存在', colNames.includes('series_id'))
  check(
    'task_type 默认临时事项',
    cols.find((c) => c.name === 'task_type')?.dflt_value?.includes('temporary') === true
  )
  const legacy = eventsRepo.create({ title: '历史事项' })
  check('普通新建默认临时事项', legacy.task_type === 'temporary' && legacy.series_id === null)
  eventsRepo.remove(legacy.id)

  console.log('【2】创建例行事项与每周展开')
  check('会议不能建立例行系列', throwsWith(
    () =>
      seriesService.createSeries(
        { title: '例会', kind: 'meeting', start_time: MAIN_START, end_time: MAIN_END },
        NOW
      ),
    '会议不支持'
  ))
  check('缺少结束时间被拒绝', throwsWith(
    () => seriesService.createSeries({ title: '周报', start_time: MAIN_START }, NOW),
    '开始时间和结束时间'
  ))
  check('结束早于开始被拒绝', throwsWith(
    () =>
      seriesService.createSeries(
        { title: '周报', start_time: '2026-10-23 16:00', end_time: '2026-10-23 15:00' },
        NOW
      ),
    '结束时间必须晚于开始时间'
  ))
  check('非法创建不留下系列', seriesRepo.listActive().length === 0)

  const created = seriesService.createSeries(
    {
      title: '提交周报',
      kind: 'task',
      task_type: 'routine',
      description: '汇总本周进展',
      start_time: MAIN_START,
      end_time: MAIN_END,
      location: '办公室',
      category: '例行工作',
      reminder_enabled: 1,
      reminder_minutes: 30
    },
    NOW
  )
  check('系列已创建', created.seriesId > 0)
  check('返回首期为锚点日期', created.first.start_time === MAIN_START && created.first.end_time === MAIN_END)
  check('首期 id 与生成列表一致', created.first.id === created.createdIds[0])
  check('生成未来 12 个月共 52 期', created.createdIds.length === 52, `实际 ${created.createdIds.length}`)
  const series = seriesRepo.get(created.seriesId)
  check('模板保存标题/分类/提醒', series.title === '提交周报' && series.category === '例行工作' && series.reminder_minutes === 30)
  check('生成截止日期为最后一个周五', series.generated_until === '2027-10-15', String(series.generated_until))
  const initial = eventsRepo.listBySeries(created.seriesId)
  check('系列期次数量与返回一致', initial.length === 52)
  check('每期均为事项且标记例行', initial.every((e) => e.kind === 'task' && e.task_type === 'routine'))
  check('每期均关联系列', initial.every((e) => e.series_id === created.seriesId))
  check('每期为待办初始状态', initial.every((e) => e.status === 'todo'))
  check('每期时间一致', initial.every((e) => e.start_time?.slice(11) === '15:30' && e.end_time?.slice(11) === '16:30'))
  check(
    '每期均为周五',
    initial.every((e) => new Date(`${e.start_time!.slice(0, 10)}T00:00:00`).getDay() === 5)
  )
  check(
    '每期间隔 7 天',
    initial.every((e, i) => {
      if (i === 0) return true
      const prev = new Date(`${initial[i - 1].start_time!.slice(0, 10)}T00:00:00`).getTime()
      const cur = new Date(`${e.start_time!.slice(0, 10)}T00:00:00`).getTime()
      return Math.round((cur - prev) / 86400000) === 7
    })
  )
  check(
    '日期列表与纯逻辑展开一致',
    eq(datesOf(created.seriesId), weeklyDatesBetween(MAIN_START.slice(0, 10), MAIN_START.slice(0, 10), '2027-10-21'))
  )
  check('模板内容复制到期次', initial.every((e) => e.title === '提交周报' && e.location === '办公室' && e.description === '汇总本周进展'))

  const idempotent = seriesService.extendAll(NOW)
  check('启动续期幂等(无新增)', idempotent.length === 0 && eventsRepo.listBySeries(created.seriesId).length === 52)
  check('续期后截止日期不变', seriesRepo.get(created.seriesId).generated_until === '2027-10-15')

  console.log('【3】跨天例行事项保留跨天时长')
  const cross = seriesService.createSeries(
    {
      title: '夜间巡检',
      start_time: '2026-10-24 23:00',
      end_time: '2026-10-25 00:30',
      category: '例行工作'
    },
    NOW
  )
  const crossList = eventsRepo.listBySeries(cross.seriesId)
  check('跨天首期结束在次日 00:30', crossList[0].start_time === '2026-10-24 23:00' && crossList[0].end_time === '2026-10-25 00:30')
  check('第二期仍保持跨天', crossList[1].start_time === '2026-10-31 23:00' && crossList[1].end_time === '2026-11-01 00:30')
  check('跨天系列同样生成 52 期', crossList.length === 52, `实际 ${crossList.length}`)
  check('跨天系列末期为周六', crossList[crossList.length - 1].start_time?.slice(0, 10) === '2027-10-16')

  console.log('【4】仅删除本次:写入例外且续期不复活')
  const removedDate = '2026-11-06'
  const removedEv = eventsRepo.listBySeries(created.seriesId).find((e) => e.start_time?.startsWith(removedDate))
  check('找到待删除期次', removedEv !== undefined)
  seriesService.removeOccurrence(removedEv!.id, 'one', NOW)
  check('本期已删除', !datesOf(created.seriesId).includes(removedDate))
  check('例外日期已记录', seriesRepo.exceptions(created.seriesId).has(removedDate))
  seriesRepo.setGeneratedUntil(created.seriesId, '2026-10-30')
  const afterExceptionExtend = seriesService.extendAll(NOW)
  check('续期不会重新生成已删除期次', !datesOf(created.seriesId).includes(removedDate))
  check('仅删除本次后剩 51 期', eventsRepo.listBySeries(created.seriesId).length === 51)
  check('本次续期无其他新增', afterExceptionExtend.length === 0, `实际 ${afterExceptionExtend.length}`)

  console.log('【5】仅修改本次:登记例外并保留改期后的记录')
  const editedOriginalDate = '2026-11-13'
  const editedEv = eventsRepo.listBySeries(created.seriesId).find((e) => e.start_time?.startsWith(editedOriginalDate))
  check('找到待改期期次', editedEv !== undefined)
  seriesService.markOccurrenceEdited(editedEv!)
  eventsRepo.update(editedEv!.id, {
    start_time: '2026-11-12 10:00',
    end_time: '2026-11-12 11:00',
    description: '仅本次改期'
  })
  check('原发生日期已登记例外', seriesRepo.exceptions(created.seriesId).has(editedOriginalDate))
  seriesRepo.setGeneratedUntil(created.seriesId, '2026-11-06')
  seriesService.extendAll(NOW)
  const afterEdited = eventsRepo.listBySeries(created.seriesId)
  check('原日期未被重新生成', !afterEdited.some((e) => e.start_time?.startsWith(editedOriginalDate)))
  check(
    '改期后的本期保留',
    afterEdited.some((e) => e.id === editedEv!.id && e.start_time === '2026-11-12 10:00')
  )
  check('改期后仍为 51 期', afterEdited.length === 51, `实际 ${afterEdited.length}`)
  check('改期本期仍关联系列', eventsRepo.get(editedEv!.id).series_id === created.seriesId)

  console.log('【6】编辑整个系列:保留历史/已完成/取消,未来按新规则重排')
  const UPD_NOW = new Date(2026, 11, 1, 10, 0) // 2026-12-01 周二
  const doneEv = eventsRepo.listBySeries(created.seriesId).find((e) => e.start_time?.startsWith('2026-12-04'))
  const cancelEv = eventsRepo.listBySeries(created.seriesId).find((e) => e.start_time?.startsWith('2026-12-11'))
  check('找到待标记完成/取消的期次', doneEv !== undefined && cancelEv !== undefined)
  eventsRepo.setStatus(doneEv!.id, 'done')
  eventsRepo.setStatus(cancelEv!.id, 'cancelled')

  const updateResult = seriesService.updateSeries(
    created.seriesId,
    {
      title: '提交周报(新版)',
      start_time: '2026-12-03 16:30',
      end_time: '2026-12-03 17:30'
    },
    UPD_NOW
  )
  check('系列编辑有删除与重建', updateResult.deleted > 0 && updateResult.createdIds.length > 0)
  check('编辑后模板标题更新', seriesRepo.get(created.seriesId).title === '提交周报(新版)')
  check('返回首期为新规则时间', updateResult.first?.start_time === '2026-12-03 16:30')
  const afterUpdate = eventsRepo.listBySeries(created.seriesId)
  const afterDates = datesOf(created.seriesId)
  check('编辑后无重复日期', new Set(afterDates).size === afterDates.length)
  check('历史期次保留旧标题', afterUpdate.some((e) => e.start_time?.startsWith('2026-10-23') && e.title === '提交周报'))
  check('已删除的例外日期仍不存在', !afterDates.includes('2026-11-06'))
  check('仅本次改期记录保留', afterUpdate.some((e) => e.id === editedEv!.id && e.start_time === '2026-11-12 10:00'))
  check('已完成期次保留且不重建', (() => {
    const e = afterUpdate.find((x) => x.id === doneEv!.id)
    return e?.status === 'done' && e.start_time === doneEv!.start_time && e.title === '提交周报'
  })())
  check('已取消期次保留且阻止重建', (() => {
    const e = afterUpdate.find((x) => x.id === cancelEv!.id)
    return e?.status === 'cancelled' && seriesRepo.exceptions(created.seriesId).has('2026-12-11')
  })())
  const newDates = afterUpdate
    .filter((e) => e.start_time && e.start_time.slice(0, 10) >= '2026-12-03' && e.status === 'todo')
    .map((e) => e.start_time!.slice(0, 10))
  check(
    '未来未完成期次全部为周四 16:30',
    afterUpdate
      .filter((e) => e.start_time && e.start_time.slice(0, 10) >= '2026-12-03' && e.status === 'todo')
      .every((e) =>
        e.title === '提交周报(新版)' &&
        e.start_time?.slice(11) === '16:30' &&
        e.end_time?.slice(11) === '17:30' &&
        new Date(`${e.start_time!.slice(0, 10)}T00:00:00`).getDay() === 4
      )
  )
  check(
    '新规则日期完整无缺口',
    eq(newDates, weeklyDatesBetween('2026-12-03', '2026-12-01', '2027-12-01'))
  )
  check('模板生成截止日期已更新', seriesRepo.get(created.seriesId).generated_until === '2027-11-25', String(seriesRepo.get(created.seriesId).generated_until))

  const update2 = seriesService.updateSeries(
    created.seriesId,
    { start_time: '2027-01-07 16:30', end_time: '2027-01-07 17:30' },
    UPD_NOW
  )
  const afterUpdate2Dates = datesOf(created.seriesId)
  check('从较晚一期进入编辑仍有返回首期', update2.first?.start_time === '2026-12-03 16:30')
  check(
    '从较晚一期编辑不漏掉中间周次',
    eq(
      afterUpdate2Dates
        .filter((d) => d >= '2026-12-03' && d <= '2027-11-25')
        .filter((d) => new Date(`${d}T00:00:00`).getDay() === 4),
      weeklyDatesBetween('2027-01-07', '2026-12-01', '2027-12-01')
    )
  )
  check('连续编辑后无重复日期', new Set(afterUpdate2Dates).size === afterUpdate2Dates.length)
  check('非法系列编辑被拒绝且不写入', throwsWith(
    () => seriesService.updateSeries(
      created.seriesId,
      { start_time: '2026-12-03 17:00', end_time: '2026-12-03 16:00' },
      UPD_NOW
    ),
    '结束时间必须晚于开始时间'
  ) && seriesRepo.get(created.seriesId).start_time === '2027-01-07 16:30')

  console.log('【7】删除整个系列:只删未来未完成,历史与已完成保留')
  const DEL_NOW = new Date(2026, 11, 15, 10, 0) // 2026-12-15 周二
  const futureDone = eventsRepo.listBySeries(created.seriesId).find((e) => e.start_time?.startsWith('2026-12-17'))
  const futureCancel = eventsRepo.listBySeries(created.seriesId).find((e) => e.start_time?.startsWith('2027-01-07'))
  const pastEv = eventsRepo.listBySeries(created.seriesId).find((e) => e.start_time?.startsWith('2026-10-23'))
  check('找到删除测试所需的期次', futureDone !== undefined && futureCancel !== undefined && pastEv !== undefined)
  eventsRepo.setStatus(futureDone!.id, 'done')
  eventsRepo.setStatus(futureCancel!.id, 'cancelled')
  const deletedResult = seriesService.deleteSeries(created.seriesId, DEL_NOW)
  check('删除系列返回已删除数量', deletedResult.deleted > 0, `实际 ${deletedResult.deleted}`)
  check('系列期次不再按系列可查', eventsRepo.listBySeries(created.seriesId).length === 0)
  check('系列本身已删除', !seriesRepo.listActive().some((s) => s.id === created.seriesId))
  check('读取已删除系列报错', throwsWith(() => seriesRepo.get(created.seriesId), '不存在'))
  check('历史期次保留', (() => {
    try {
      const e = eventsRepo.get(pastEv!.id)
      return e.series_id === null && e.title === '提交周报'
    } catch {
      return false
    }
  })())
  check('未来已完成期次保留并解除系列关联', (() => {
    const e = eventsRepo.get(futureDone!.id)
    return e.status === 'done' && e.series_id === null && e.task_type === 'routine'
  })())
  check('未来已取消期次随系列删除', throwsWith(() => eventsRepo.get(futureCancel!.id), '不存在'))
  check('仅本次改期记录保留', eventsRepo.get(editedEv!.id).series_id === null)
  check(
    '系列例外记录级联清理',
    (getDb()
      .prepare('SELECT COUNT(*) AS c FROM event_series_exceptions WHERE series_id = ?')
      .get(created.seriesId) as { c: number }).c === 0
  )
  check(
    '无残留事项引用已删除系列',
    (getDb()
      .prepare('SELECT COUNT(*) AS c FROM events WHERE series_id = ?')
      .get(created.seriesId) as { c: number }).c === 0
  )

  console.log('【8】按「整个系列」删除单期入口')
  const crossOcc = eventsRepo.listBySeries(cross.seriesId)[0]
  check('跨天系列仍在', crossOcc !== undefined)
  seriesService.removeOccurrence(crossOcc.id, 'series', NOW)
  check('整个系列入口删除系列', !seriesRepo.listActive().some((s) => s.id === cross.seriesId))
  check('整个系列入口清空未来期次', eventsRepo.listBySeries(cross.seriesId).length === 0)
  check('整个系列入口删除目标期次', throwsWith(() => eventsRepo.get(crossOcc.id), '不存在'))

  closeDatabase()
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

console.log(`\n结果: ${passed} 项通过, ${failed} 项失败`)
if (failed > 0) {
  console.error('失败项:', failureDetails.join('; '))
  process.exit(1)
}
