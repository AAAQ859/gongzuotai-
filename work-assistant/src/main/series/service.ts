/**
 * 例行事项服务:把「每周固定星期/时间」展开为 events 表中的独立期次。
 *
 * 设计(用户确认):
 * - 每一期都是独立事项,可单独完成、编辑、删除;
 * - 创建时生成未来 12 个月,应用启动时自动续期;
 * - 编辑/删除整个系列只影响未来未完成的期次,历史与已完成保留;
 * - 「仅本次」修改/删除会写入例外日期,后续续期不会把它重新生成。
 */
import type { AttendeeRef, WorkEvent } from '@shared/types'
import type { EventInput } from '../db/repositories/events'
import type { SeriesInput } from '../db/repositories/series'
import * as eventsRepo from '../db/repositories/events'
import * as seriesRepo from '../db/repositories/series'
import {
  addDaysStr,
  addMonthsStr,
  fmtDateStr,
  parseDateStr,
  timeOf,
  weeklyDatesBetween
} from '../../shared/recurrence'

/** 首次生成/续期的滚动窗口:未来 12 个月 */
export const HORIZON_MONTHS = 12

export interface SeriesCreateResult {
  seriesId: number
  first: WorkEvent
  createdIds: number[]
}

export interface SeriesUpdateResult {
  seriesId: number
  first: WorkEvent | null
  createdIds: number[]
  deleted: number
}

export interface SeriesDeleteResult {
  seriesId: number
  deleted: number
}

function todayOf(now: Date): string {
  return fmtDateStr(now)
}

function maxDate(a: string, b: string): string {
  return a >= b ? a : b
}

function dayOffset(fromDateTime: string, toDateTime: string): number {
  const from = parseDateStr(fromDateTime).getTime()
  const to = parseDateStr(toDateTime).getTime()
  return Math.round((to - from) / 86_400_000)
}

function validateRange(start: string, end: string): void {
  if (!start || !end) throw new Error('例行事项需要开始时间和结束时间')
  if (end <= start) throw new Error('结束时间必须晚于开始时间')
}

/** 系列模板 → 某一期的时间(保留跨天时长) */
function occurrenceTimes(series: seriesRepo.SeriesInput | ReturnType<typeof seriesRepo.get>, date: string): {
  start: string
  end: string
} {
  const startTime = timeOf(series.start_time)
  const endTime = timeOf(series.end_time)
  const offset = dayOffset(series.start_time, series.end_time)
  return {
    start: `${date} ${startTime}`,
    end: `${addDaysStr(date, offset)} ${endTime}`
  }
}

function createOccurrence(series: ReturnType<typeof seriesRepo.get>, date: string): WorkEvent {
  const times = occurrenceTimes(series, date)
  return eventsRepo.create({
    calendar_id: series.calendar_id,
    kind: 'task',
    title: series.title,
    description: series.description,
    start_time: times.start,
    end_time: times.end,
    location: series.location,
    attendees: [],
    status: 'todo',
    category: series.category,
    task_type: 'routine',
    series_id: series.id,
    tags: series.tags,
    contact_id: series.contact_id,
    reminder_enabled: series.reminder_enabled,
    reminder_minutes: series.reminder_minutes,
    reminder_days: series.reminder_days
  })
}

/** 新建例行事项:创建系列并生成未来 12 个月(含用户选择的首次日期) */
export function createSeries(input: EventInput, now: Date = new Date()): SeriesCreateResult {
  if (input.kind === 'meeting') throw new Error('会议不支持每周重复,请将类型改为事项')
  if (!input.start_time || !input.end_time) throw new Error('例行事项需要开始时间和结束时间')
  validateRange(input.start_time, input.end_time)

  const seriesInput: SeriesInput = {
    calendar_id: input.calendar_id ?? null,
    title: input.title,
    description: input.description ?? '',
    start_time: input.start_time,
    end_time: input.end_time,
    location: input.location ?? '',
    attendees: [] as AttendeeRef[],
    category: input.category ?? '',
    tags: input.tags ?? [],
    contact_id: input.contact_id ?? null,
    reminder_enabled: input.reminder_enabled ?? 1,
    reminder_minutes: input.reminder_minutes ?? null,
    reminder_days: input.reminder_days ?? null
  }
  const series = seriesRepo.create(seriesInput)

  const anchorDate = input.start_time.slice(0, 10)
  const until = maxDate(addMonthsStr(todayOf(now), HORIZON_MONTHS), anchorDate)
  const dates = weeklyDatesBetween(anchorDate, anchorDate, until)
  const createdIds: number[] = []
  for (const date of dates) createdIds.push(createOccurrence(series, date).id)

  seriesRepo.setGeneratedUntil(series.id, dates[dates.length - 1] ?? anchorDate)
  if (!createdIds.length) throw new Error('例行事项生成失败')
  return {
    seriesId: series.id,
    first: eventsRepo.get(createdIds[0]),
    createdIds
  }
}

/** 应用启动时续期:把每个系列补到「今天 + 12 个月」,跳过例外与已存在期次 */
export function extendAll(now: Date = new Date()): number[] {
  const today = todayOf(now)
  const createdIds: number[] = []
  for (const series of seriesRepo.listActive()) {
    try {
      if (!series.start_time || !series.end_time) continue
      const anchorDate = series.start_time.slice(0, 10)
      const fromDate = series.generated_until ? addDaysStr(series.generated_until, 7) : anchorDate
      const until = maxDate(addMonthsStr(today, HORIZON_MONTHS), anchorDate)
      if (fromDate > until) continue

      const dates = weeklyDatesBetween(anchorDate, fromDate, until)
      if (!dates.length) continue
      const exceptions = seriesRepo.exceptions(series.id)
      const existing = new Set(
        eventsRepo
          .listBySeries(series.id)
          .map((e) => e.start_time?.slice(0, 10))
          .filter((d): d is string => !!d)
      )
      for (const date of dates) {
        if (exceptions.has(date) || existing.has(date)) continue
        createdIds.push(createOccurrence(series, date).id)
      }
      seriesRepo.setGeneratedUntil(series.id, dates[dates.length - 1])
    } catch {
      // 单个系列异常不影响其余系列续期
    }
  }
  return createdIds
}

/**
 * 修改整个系列:
 * 1) 更新模板;2) 删除未来未完成期次(已完成、已取消、已单独修改的期次保留);
 * 3) 从今天起按新模板重新生成未来 12 个月。
 */
export function updateSeries(
  seriesId: number,
  patch: Partial<SeriesInput>,
  now: Date = new Date()
): SeriesUpdateResult {
  const current = seriesRepo.get(seriesId)
  const nextStart = patch.start_time ?? current.start_time
  const nextEnd = patch.end_time ?? current.end_time
  validateRange(nextStart, nextEnd)
  const updated = seriesRepo.update(seriesId, patch)

  const today = todayOf(now)
  const exceptions = seriesRepo.exceptions(seriesId)
  let deleted = 0
  for (const ev of eventsRepo.listBySeries(seriesId)) {
    const date = ev.start_time?.slice(0, 10)
    if (!date || date < today) continue
    if (ev.status === 'done') continue
    if (exceptions.has(date)) continue
    if (ev.status === 'cancelled') {
      // 保留用户主动取消的这一期,并阻止重新生成
      seriesRepo.addException(seriesId, date)
      continue
    }
    eventsRepo.remove(ev.id)
    deleted++
  }

  const anchorDate = updated.start_time.slice(0, 10)
  const until = maxDate(addMonthsStr(today, HORIZON_MONTHS), anchorDate)
  // 从今天起重新排期:即使从较晚的一期进入编辑,也不会漏掉今天到该期之间的周次
  const dates = weeklyDatesBetween(anchorDate, today, until)
  const createdIds: number[] = []
  if (dates.length) {
    const blocked = seriesRepo.exceptions(seriesId)
    const existing = new Set(
      eventsRepo
        .listBySeries(seriesId)
        .map((e) => e.start_time?.slice(0, 10))
        .filter((d): d is string => !!d)
    )
    for (const date of dates) {
      if (blocked.has(date) || existing.has(date)) continue
      createdIds.push(createOccurrence(updated, date).id)
    }
    seriesRepo.setGeneratedUntil(seriesId, dates[dates.length - 1])
  }

  return {
    seriesId,
    first: createdIds.length ? eventsRepo.get(createdIds[0]) : null,
    createdIds,
    deleted
  }
}

/** 删除整个系列:仅删除未来未完成期次,历史与已完成保留 */
export function deleteSeries(seriesId: number, now: Date = new Date()): SeriesDeleteResult {
  const today = todayOf(now)
  let deleted = 0
  for (const ev of eventsRepo.listBySeries(seriesId)) {
    const date = ev.start_time?.slice(0, 10)
    if (!date || date < today) continue
    if (ev.status === 'done') continue
    eventsRepo.remove(ev.id)
    deleted++
  }
  seriesRepo.remove(seriesId)
  return { seriesId, deleted }
}

/** 删除单期:记录例外日期后删除,续期不会再生 */
export function removeOccurrence(eventId: number, scope: 'one' | 'series', now: Date = new Date()): void {
  const ev = eventsRepo.get(eventId)
  if (scope === 'series' && ev.series_id != null) {
    deleteSeries(ev.series_id, now)
    return
  }
  if (ev.series_id != null && ev.start_time) {
    seriesRepo.addException(ev.series_id, ev.start_time.slice(0, 10))
  }
  eventsRepo.remove(eventId)
}

/** 仅修改本次前调用:把原发生日期登记为例外,避免后续系列续期覆盖/复制 */
export function markOccurrenceEdited(event: WorkEvent): void {
  if (event.series_id != null && event.start_time) {
    seriesRepo.addException(event.series_id, event.start_time.slice(0, 10))
  }
}
