<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import type { Calendar, Contact, WorkEvent } from '@shared/types'
import { db } from '@/api/db'
import { categoryColor, fmtDate } from '@/utils/dashboard'
import {
  WEEKDAY_HEADER,
  applyCalendarFilter,
  buildMonthGridSunday,
  buildWeekDays,
  countEventsByCalendar,
  countFollowupsDue,
  eventState,
  fmtTimeRange,
  groupCalendars,
  groupEventsByDay,
  layoutMonthCell,
  rangeTitle,
  shiftAnchor,
  viewRange,
  type CalendarViewMode
} from '@/utils/calendar'
import EventDetailDialog from '@/components/EventDetailDialog.vue'
import EventEditorDialog from '@/components/EventEditorDialog.vue'
import CalendarManageDialog from '@/components/CalendarManageDialog.vue'

// ---------- 数据 ----------
const events = ref<WorkEvent[]>([])
const calendars = ref<Calendar[]>([])
const contacts = ref<Contact[]>([])

const view = ref<CalendarViewMode>('month')
const anchor = ref(new Date())
const todayStr = fmtDate(new Date())

async function load(): Promise<void> {
  try {
    ;[events.value, calendars.value, contacts.value] = await Promise.all([
      db.events.list(),
      db.calendars.list(),
      db.contacts.list()
    ])
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '加载失败')
  }
}

onMounted(load)

// ---------- 派生状态 ----------
const title = computed(() => rangeTitle(view.value, anchor.value))
const range = computed(() => viewRange(view.value, anchor.value))
const calendarGroups = computed(() => groupCalendars(calendars.value))
const followupCount = computed(() => countFollowupsDue(events.value))

/** 侧栏「只看该日历」筛选:点击行切换,再点取消;与勾选显隐叠加 */
const activeCalId = ref<number | null>(null)
const hiddenCalIds = computed(
  () => new Set(calendars.value.filter((c) => c.is_visible !== 1).map((c) => c.id))
)
const visibleEvents = computed(() =>
  applyCalendarFilter(events.value, activeCalId.value, hiddenCalIds.value)
)

function toggleActive(cal: Calendar, e?: MouseEvent): void {
  // 阻止 label 默认行为向 checkbox 转发点击,否则点行会连带翻转可见性
  e?.preventDefault()
  activeCalId.value = activeCalId.value === cal.id ? null : cal.id
}

// ---------- 日历管理 ----------
const manageVisible = ref(false)

function onManageChanged(): void {
  load()
}

const categories = computed(() => {
  const set = new Set<string>()
  for (const e of events.value) if (e.category) set.add(e.category)
  return [...set]
})

function countOf(calId: number): number {
  return countEventsByCalendar(events.value, calId, range.value.from, range.value.to)
}

async function toggleVisibility(cal: Calendar): Promise<void> {
  try {
    await db.calendars.update(cal.id, { is_visible: cal.is_visible === 1 ? 0 : 1 })
    await load()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '操作失败')
  }
}

// ---------- 视图数据 ----------
const monthCells = computed(() =>
  buildMonthGridSunday(anchor.value.getFullYear(), anchor.value.getMonth() + 1)
)
const monthEventsByDay = computed(() =>
  groupEventsByDay(visibleEvents.value, monthCells.value[0].dateStr, monthCells.value[41].dateStr)
)
const monthLayouts = computed(() => {
  const map = new Map<string, ReturnType<typeof layoutMonthCell>>()
  for (const [day, list] of monthEventsByDay.value) map.set(day, layoutMonthCell(list))
  return map
})
const weekDays = computed(() => buildWeekDays(anchor.value))
const weekEventsByDay = computed(() =>
  groupEventsByDay(visibleEvents.value, fmtDate(weekDays.value[0]), fmtDate(weekDays.value[6]))
)
const dayEvents = computed(() => {
  const d = fmtDate(anchor.value)
  return (visibleEvents.value.filter((e) => e.start_time?.slice(0, 10) === d) ?? []).sort((a, b) =>
    (a.start_time ?? '').localeCompare(b.start_time ?? '')
  )
})

function navigate(delta: number): void {
  anchor.value = shiftAnchor(view.value, anchor.value, delta)
}

function goToday(): void {
  anchor.value = new Date()
}

function openDay(dateStr: string): void {
  const [y, m, d] = dateStr.split('-').map(Number)
  anchor.value = new Date(y, m - 1, d)
  view.value = 'day'
}

// ---------- 详情 / 编辑 ----------
const detailVisible = ref(false)
const detailEvent = ref<WorkEvent | null>(null)
const editorVisible = ref(false)
const editorEvent = ref<WorkEvent | null>(null)
const editorDefaultDate = ref('')

function openDetail(ev: WorkEvent): void {
  detailEvent.value = ev
  detailVisible.value = true
}

function openCreate(): void {
  editorEvent.value = null
  editorDefaultDate.value = fmtDate(anchor.value)
  editorVisible.value = true
}

function openEdit(): void {
  editorEvent.value = detailEvent.value
  editorDefaultDate.value = ''
  editorVisible.value = true
  detailVisible.value = false
}

function onChanged(): void {
  load()
}

function onSaved(): void {
  load()
}

function onDeleted(): void {
  load()
}

function dayHeader(d: Date): { week: string; date: string; isToday: boolean } {
  return {
    week: `周${WEEKDAY_HEADER[d.getDay()]}`,
    date: fmtDate(d),
    isToday: fmtDate(d) === todayStr
  }
}
</script>

<template>
  <div class="cal-page">
    <!-- 左侧日历分类 -->
    <aside class="cal-side">
      <div v-for="group in calendarGroups" :key="group.key" class="cal-side__group">
        <div class="cal-side__group-title">{{ group.label }}</div>
        <label
          v-for="cal in group.items"
          :key="cal.id"
          class="cal-side__item"
          :class="{
            'is-hidden': cal.is_visible !== 1,
            'is-active': activeCalId === cal.id
          }"
        >
          <input
            type="checkbox"
            :checked="cal.is_visible === 1"
            @click.stop
            @change="toggleVisibility(cal)"
          />
          <span
            class="cal-side__body"
            :title="activeCalId === cal.id ? '点击取消只看该类' : '点击只看该类事项'"
            @click="toggleActive(cal, $event)"
          >
            <span class="cal-side__dot" :style="{ background: cal.color }"></span>
            <span class="cal-side__name">{{ cal.name }}</span>
            <span class="cal-side__count">{{ countOf(cal.id) }}</span>
          </span>
        </label>
      </div>

      <button class="cal-side__manage" @click="manageVisible = true">⚙ 管理日历</button>

      <div v-if="followupCount > 0" class="cal-tip">
        💡 本周有 {{ followupCount }} 项对接事项临近截止,请及时跟进。
      </div>
    </aside>

    <!-- 主区域 -->
    <div class="cal-main">
      <div class="cal-toolbar">
        <el-button type="primary" :icon="Plus" @click="openCreate">新建日程</el-button>
        <div class="cal-toolbar__nav">
          <button class="cal-toolbar__btn" @click="navigate(-1)">‹</button>
          <button class="cal-toolbar__btn" @click="goToday">今天</button>
          <button class="cal-toolbar__btn" @click="navigate(1)">›</button>
        </div>
        <div class="cal-toolbar__title">{{ title }}</div>
        <el-segmented
          v-model="view"
          :options="[
            { label: '日', value: 'day' },
            { label: '周', value: 'week' },
            { label: '月', value: 'month' }
          ]"
        />
      </div>

      <!-- 无日历引导 -->
      <div v-if="!calendars.length" class="cal-empty-hint">
        🗓 还没有日历分类,点击左侧「⚙ 管理日历」创建第一个日历(如:例行工作、会议日程)。
      </div>

      <!-- 月视图 -->
      <div v-if="view === 'month'" class="cal-month">
        <div class="cal-month__head">
          <span v-for="w in WEEKDAY_HEADER" :key="w" class="cal-month__weekday">周{{ w }}</span>
        </div>
        <div class="cal-month__grid">
          <div
            v-for="cell in monthCells"
            :key="cell.dateStr"
            class="cal-month__cell"
            :class="{
              'is-out': !cell.inMonth,
              'is-today': cell.dateStr === todayStr
            }"
            @click="openDay(cell.dateStr)"
          >
            <span class="cal-month__day">{{ cell.day }}</span>
            <div class="cal-month__blocks">
              <button
                v-for="ev in (monthLayouts.get(cell.dateStr) ?? { visible: [], more: 0 }).visible"
                :key="ev.id"
                class="cal-month__block"
                :class="`is-${eventState(ev).key.replace('_', '-')}`"
                :style="{
                  background: calendars.find((c) => c.id === ev.calendar_id)?.color ?? '#CED4DA'
                }"
                :title="ev.title"
                @click.stop="openDetail(ev)"
              >
                {{ ev.title }}
              </button>
              <button
                v-if="(monthLayouts.get(cell.dateStr) ?? { visible: [], more: 0 }).more > 0"
                class="cal-month__more"
                @click.stop="openDay(cell.dateStr)"
              >
                +{{ (monthLayouts.get(cell.dateStr) ?? { visible: [], more: 0 }).more }} 更多
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 周视图 -->
      <div v-else-if="view === 'week'" class="cal-week">
        <div
          v-for="d in weekDays"
          :key="fmtDate(d)"
          class="cal-week__col"
          :class="{ 'is-today': fmtDate(d) === todayStr }"
        >
          <div class="cal-week__head" @click="openDay(fmtDate(d))">
            <span class="cal-week__week">{{ dayHeader(d).week }}</span>
            <span class="cal-week__date" :class="{ 'is-today-num': dayHeader(d).isToday }">
              {{ d.getDate() }}
            </span>
          </div>
          <div class="cal-week__body">
            <button
              v-for="ev in weekEventsByDay.get(fmtDate(d)) ?? []"
              :key="ev.id"
              class="cal-week__item"
              :class="`is-${eventState(ev).key.replace('_', '-')}`"
              @click="openDetail(ev)"
            >
              <span class="cal-week__time">{{ fmtTimeRange(ev) }}</span>
              <span class="cal-week__title">{{ ev.title }}</span>
            </button>
            <div v-if="!(weekEventsByDay.get(fmtDate(d)) ?? []).length" class="cal-week__empty"></div>
          </div>
        </div>
      </div>

      <!-- 日视图 -->
      <div v-else class="cal-day">
        <div class="cal-day__head">
          <span class="cal-day__title">{{ title }}</span>
          <span class="cal-day__count">{{ dayEvents.length }} 项安排</span>
        </div>
        <div v-if="dayEvents.length" class="cal-day__list">
          <button v-for="ev in dayEvents" :key="ev.id" class="cal-day__item" @click="openDetail(ev)">
            <span class="cal-day__bar" :style="{ background: calendars.find((c) => c.id === ev.calendar_id)?.color ?? '#CED4DA' }"></span>
            <span class="cal-day__time">{{ fmtTimeRange(ev) }}</span>
            <span class="cal-day__main">
              <span class="cal-day__title" :class="`is-${eventState(ev).key.replace('_', '-')}`">
                {{ ev.title }}
              </span>
              <span class="cal-day__sub">
                <span v-if="ev.category" class="cal-day__chip" :style="{ color: categoryColor(ev.category), background: categoryColor(ev.category) + '1A' }">{{ ev.category }}</span>
                <template v-if="ev.location">{{ ev.location }}</template>
                <template v-if="ev.attendees.length">参会:{{ ev.attendees.map((a) => a.name).join('、') }}</template>
                <template v-if="ev.kind === 'task' && ev.contact_id != null">
                  对接人:{{ contacts.find((c) => c.id === ev.contact_id)?.name }}
                </template>
              </span>
            </span>
            <span class="cal-day__meta">
              <span class="cal-day__state" :class="`is-${eventState(ev).key.replace('_', '-')}`">
                {{ eventState(ev).label }}
              </span>
              <span class="cal-day__kind">{{ ev.kind === 'meeting' ? '会议' : '事项' }}</span>
            </span>
          </button>
        </div>
        <div v-else class="cal-day__empty">🎉 当天没有安排</div>
      </div>
    </div>

    <!-- 详情 / 编辑 -->
    <EventDetailDialog
      v-model="detailVisible"
      :event="detailEvent"
      :calendars="calendars"
      :contacts="contacts"
      @changed="onChanged"
      @edit="openEdit"
    />
    <EventEditorDialog
      v-model="editorVisible"
      :event="editorEvent"
      :default-date="editorDefaultDate"
      :calendars="calendars"
      :contacts="contacts"
      :categories="categories"
      @saved="onSaved"
      @deleted="onDeleted"
    />
    <CalendarManageDialog
      v-model="manageVisible"
      :calendars="calendars"
      :events="events"
      @changed="onManageChanged"
    />
  </div>
</template>

<style scoped>
.cal-page {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  max-width: 1400px;
  margin: 0 auto;
}

/* ---------- 左侧日历分类 ---------- */
.cal-side {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 窄窗口自适应(拖小窗口/整体缩放):侧栏收窄(置于主规则之后,媒体匹配时覆盖) */
@media (max-width: 1150px) {
  .cal-side {
    width: 160px;
  }
}

.cal-side__group-title {
  font-size: 12px;
  color: var(--wa-text-muted);
  margin-bottom: 6px;
}

.cal-side__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--wa-text);
}

.cal-side__item:hover {
  background: #f8f9fa;
}

.cal-side__item.is-hidden {
  color: #adb5bd;
}

.cal-side__item.is-hidden .cal-side__dot {
  opacity: 0.35;
}

.cal-side__item.is-active {
  background: var(--wa-brand-soft);
}

.cal-side__item.is-active .cal-side__name {
  color: var(--wa-brand-text);
  font-weight: 600;
}

.cal-side__item input {
  accent-color: var(--wa-brand);
  flex-shrink: 0;
}

.cal-side__body {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.cal-side__manage {
  border: 1px dashed var(--wa-border);
  background: transparent;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 12px;
  color: var(--wa-text-muted);
  cursor: pointer;
}

.cal-side__manage:hover {
  border-color: var(--wa-brand);
  color: var(--wa-brand);
}

.cal-side__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.cal-side__name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cal-side__count {
  font-size: 11px;
  color: var(--wa-text-muted);
}

.cal-tip {
  background: var(--wa-brand-soft);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--wa-brand-text);
  line-height: 1.5;
}

/* ---------- 工具栏 ---------- */
.cal-main {
  flex: 1;
  min-width: 0;
}

.cal-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 12px;
}

.cal-toolbar__nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.cal-toolbar__btn {
  border: 1px solid var(--wa-border);
  background: #fff;
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 13px;
  cursor: pointer;
  color: var(--wa-text);
}

.cal-toolbar__btn:hover {
  border-color: var(--wa-brand);
  color: var(--wa-brand);
}

.cal-toolbar__title {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  color: var(--wa-ink);
}

/* ---------- 月视图 ---------- */
.cal-month__head {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-bottom: 1px solid var(--wa-border);
  padding-bottom: 6px;
}

.cal-month__weekday {
  text-align: center;
  font-size: 12px;
  color: var(--wa-text-muted);
}

.cal-month__grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-left: 1px solid var(--wa-border);
  border-top: 1px solid var(--wa-border);
}

.cal-month__cell {
  min-height: 96px;
  border-right: 1px solid var(--wa-border);
  border-bottom: 1px solid var(--wa-border);
  padding: 6px;
  cursor: pointer;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.cal-month__cell:hover {
  background: #fbfdfd;
}

.cal-month__cell.is-out {
  background: #fafbfc;
}

.cal-month__cell.is-out .cal-month__day {
  color: #ced4da;
}

.cal-month__cell.is-today {
  background: var(--wa-brand-soft);
}

.cal-month__day {
  font-size: 12px;
  color: var(--wa-text);
  font-weight: 500;
  align-self: flex-end;
}

.cal-month__cell.is-today .cal-month__day {
  background: var(--wa-brand);
  color: #fff;
  border-radius: 50%;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cal-month__blocks {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cal-month__block {
  border: none;
  border-radius: 4px;
  color: #fff;
  font-size: 11px;
  padding: 2px 6px;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cal-month__block:hover {
  filter: brightness(0.92);
}

.cal-month__block.is-done {
  opacity: 0.55;
  text-decoration: line-through;
}

.cal-month__block.is-cancelled {
  opacity: 0.4;
  text-decoration: line-through;
}

.cal-month__block.is-not-started {
  opacity: 0.6;
  border: 1px dashed rgba(255, 255, 255, 0.8);
}

.cal-month__block.is-ended {
  opacity: 0.45;
}

.cal-month__more {
  border: none;
  background: transparent;
  color: var(--wa-text-muted);
  font-size: 11px;
  text-align: left;
  padding: 0 2px;
  cursor: pointer;
}

.cal-month__more:hover {
  color: var(--wa-brand);
}

/* ---------- 周视图 ---------- */
.cal-week {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-left: 1px solid var(--wa-border);
  border-top: 1px solid var(--wa-border);
}

.cal-week__col {
  border-right: 1px solid var(--wa-border);
  border-bottom: 1px solid var(--wa-border);
  min-height: 420px;
  background: #fff;
}

.cal-week__col.is-today {
  background: var(--wa-brand-soft);
}

.cal-week__head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 0;
  border-bottom: 1px solid var(--wa-border);
  cursor: pointer;
}

.cal-week__week {
  font-size: 11px;
  color: var(--wa-text-muted);
}

.cal-week__date {
  font-size: 16px;
  font-weight: 600;
  color: var(--wa-text);
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cal-week__date.is-today-num {
  background: var(--wa-brand);
  color: #fff;
}

.cal-week__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
}

.cal-week__item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  border: none;
  background: #fff;
  border-left: 3px solid #ced4da;
  border-radius: 4px;
  padding: 4px 6px;
  cursor: pointer;
  text-align: left;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.cal-week__item:hover {
  box-shadow: 0 2px 6px rgba(18, 184, 134, 0.18);
}

.cal-week__item.is-done {
  opacity: 0.6;
}

.cal-week__item.is-cancelled {
  opacity: 0.45;
  text-decoration: line-through;
}

.cal-week__item.is-not-started {
  border-left-style: dashed;
  opacity: 0.7;
}

.cal-week__item.is-ended {
  opacity: 0.5;
}

.cal-week__time {
  font-size: 10px;
  color: var(--wa-text-muted);
}

.cal-week__title {
  font-size: 12px;
  color: var(--wa-text);
  word-break: break-all;
}

/* ---------- 日视图 ---------- */
.cal-day__head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  border-bottom: 1px solid var(--wa-border);
  padding-bottom: 8px;
  margin-bottom: 8px;
}

.cal-day__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--wa-ink);
}

.cal-day__count {
  font-size: 12px;
  color: var(--wa-text-muted);
}

.cal-day__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cal-day__item {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--wa-border);
  border-radius: 8px;
  background: #fff;
  padding: 10px 12px;
  cursor: pointer;
  text-align: left;
}

.cal-day__item:hover {
  border-color: var(--wa-brand);
  box-shadow: 0 2px 8px rgba(18, 184, 134, 0.12);
}

.cal-day__bar {
  width: 4px;
  align-self: stretch;
  border-radius: 2px;
  flex-shrink: 0;
}

.cal-day__time {
  width: 96px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--wa-text-muted);
  font-variant-numeric: tabular-nums;
}

.cal-day__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.cal-day__title {
  font-size: 14px;
  color: var(--wa-text);
  word-break: break-all;
}

.cal-day__title.is-done {
  text-decoration: line-through;
  color: var(--wa-text-muted);
}

.cal-day__title.is-cancelled {
  text-decoration: line-through;
  color: #adb5bd;
}

.cal-day__title.is-not-started {
  color: #868e96;
}

.cal-day__title.is-ended {
  color: var(--wa-text-muted);
}

.cal-day__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.cal-day__state {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 999px;
}

.cal-day__state.is-not-started {
  color: #868e96;
  background: #f1f3f5;
}

.cal-day__state.is-in-progress {
  color: #12b886;
  background: #e6f7f1;
}

.cal-day__state.is-ended {
  color: #868e96;
  background: #f1f3f5;
}

.cal-day__state.is-done {
  color: #2f9e44;
  background: #ebfbee;
}

.cal-day__state.is-cancelled {
  color: #868e96;
  background: #f1f3f5;
  text-decoration: line-through;
}

.cal-day__sub {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--wa-text-muted);
  flex-wrap: wrap;
}

.cal-day__chip {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 999px;
}

.cal-day__kind {
  font-size: 11px;
  color: var(--wa-text-muted);
  border: 1px solid var(--wa-border);
  border-radius: 4px;
  padding: 1px 6px;
  flex-shrink: 0;
}

.cal-day__empty {
  padding: 60px 0;
  text-align: center;
  color: var(--wa-text-muted);
}

.cal-empty-hint {
  padding: 80px 0;
  text-align: center;
  color: var(--wa-text-muted);
  font-size: 14px;
}
</style>
