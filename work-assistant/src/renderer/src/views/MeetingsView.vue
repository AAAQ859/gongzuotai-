<script setup lang="ts">
/**
 * 板块 04 会议日历(PRD 4.5):类共享日程小程序的会议管理。
 * 布局 = 左侧会议日历分类 + 中部日时间轴(08:00-18:00)/周/月 + 右侧会议详情列表。
 * 会议数据与日程日历互通(events kind='meeting'),侧重会议场景展示:参会人/地点/会前提醒。
 * 会议编辑器/详情/日历管理复用板块 03 共享组件。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import type { Calendar, Contact, WorkEvent } from '@shared/types'
import { db } from '@/api/db'
import { fmtDate } from '@/utils/dashboard'
import {
  WEEKDAY_HEADER,
  applyCalendarFilter,
  buildMonthGridSunday,
  buildWeekDays,
  eventState,
  fmtTimeRange,
  groupEventsByDay,
  layoutMonthCell,
  rangeTitle,
  shiftAnchor,
  viewRange,
  type CalendarViewMode
} from '@/utils/calendar'
import {
  TIMELINE_END,
  TIMELINE_START,
  avatarText,
  layoutTimeline,
  locationIcon,
  meetingSummary,
  meetingsOn,
  nextMeeting,
  tomorrowOf,
  type TimelineBlock
} from '@/utils/meeting'
import EventDetailDialog from '@/components/EventDetailDialog.vue'
import EventEditorDialog from '@/components/EventEditorDialog.vue'
import CalendarManageDialog from '@/components/CalendarManageDialog.vue'
import MeetingReminderDialog from '@/components/MeetingReminderDialog.vue'
import {
  loadMeetingDisplayMode,
  meetingDisplayMode
} from '@/utils/meeting-display'

// ---------- 数据 ----------
const events = ref<WorkEvent[]>([])
const calendars = ref<Calendar[]>([])
const contacts = ref<Contact[]>([])

const view = ref<CalendarViewMode>('day')
const anchor = ref(new Date())
const now = ref(new Date())
const todayStr = fmtDate(new Date())
let ticker: ReturnType<typeof setInterval> | null = null

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

onMounted(() => {
  load()
  loadMeetingDisplayMode(true)
  ticker = setInterval(() => {
    now.value = new Date()
  }, 60_000)
})

onUnmounted(() => {
  if (ticker) clearInterval(ticker)
})

// ---------- 会议数据口径:仅 kind='meeting' 且属于会议(部门)日历 ----------
const meetingCalendars = computed(() => calendars.value.filter((c) => c.kind === 'meeting'))

const activeCalId = ref<number | null>(null)
const hiddenCalIds = computed(
  () => new Set(meetingCalendars.value.filter((c) => c.is_visible !== 1).map((c) => c.id))
)
const meetings = computed(() =>
  applyCalendarFilter(
    events.value.filter((e) => e.kind === 'meeting'),
    activeCalId.value,
    hiddenCalIds.value
  )
)

const anchorStr = computed(() => fmtDate(anchor.value))
const title = computed(() => rangeTitle(view.value, anchor.value))
const range = computed(() => viewRange(view.value, anchor.value))
const isToday = computed(() => anchorStr.value === todayStr)
const isTextMode = computed(() => meetingDisplayMode.value === 'text')

function attendeeNames(ev: WorkEvent): string {
  return ev.attendees.map((a) => a.name).join('、')
}

function meetingStatusText(ev: WorkEvent): string {
  return eventState(ev).label
}

function countOf(calId: number): number {
  return meetings.value.filter(
    (e) => e.calendar_id === calId && e.status !== 'cancelled' && e.start_time &&
      e.start_time.slice(0, 10) >= range.value.from && e.start_time.slice(0, 10) <= range.value.to
  ).length
}

async function toggleVisibility(cal: Calendar): Promise<void> {
  try {
    await db.calendars.update(cal.id, { is_visible: cal.is_visible === 1 ? 0 : 1 })
    await load()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '操作失败')
  }
}

function toggleActive(cal: Calendar, e?: MouseEvent): void {
  // 阻止 label 默认行为向 checkbox 转发点击,否则点行会连带翻转可见性
  e?.preventDefault()
  activeCalId.value = activeCalId.value === cal.id ? null : cal.id
}

// ---------- 工具栏 ----------
function navigate(delta: number): void {
  anchor.value = shiftAnchor(view.value, anchor.value, delta)
}

function goToday(): void {
  anchor.value = new Date()
}

// ---------- 日视图时间轴 ----------
const hours = computed(() => {
  const list: number[] = []
  for (let h = TIMELINE_START / 60; h <= TIMELINE_END / 60; h++) list.push(h)
  return list
})
const dayMeetings = computed(() => meetingsOn(meetings.value, anchorStr.value))
const timelineBlocks = computed(() => layoutTimeline(dayMeetings.value))

/** 时间轴块定位:小时列占 60px(52 标签 + 8 间距),容器右内边距 8px,泳道宽 = 100% - 68px */
const TIMELINE_LANE_OFFSET = 68
function blockStyle(b: TimelineBlock): Record<string, string> {
  const n = b.cols
  const i = b.col
  const color = calendars.value.find((c) => c.id === b.ev.calendar_id)?.color ?? '#CED4DA'
  return {
    top: `${b.top}px`,
    height: `${b.height}px`,
    left: `calc(60px + ${((i * 100) / n).toFixed(2)}% - ${((i * TIMELINE_LANE_OFFSET) / n).toFixed(2)}px)`,
    width: `calc(${(100 / n).toFixed(2)}% - ${(TIMELINE_LANE_OFFSET / n).toFixed(2)}px)`,
    borderLeft: `3px solid ${color}`
  }
}
const nowLineTop = computed(() => {
  const min = now.value.getHours() * 60 + now.value.getMinutes()
  if (min < TIMELINE_START || min > TIMELINE_END) return null
  return ((min - TIMELINE_START) / 60) * 60
})

// ---------- 周 / 月视图 ----------
const weekDays = computed(() => buildWeekDays(anchor.value))
const weekMeetingsByDay = computed(() =>
  groupEventsByDay(meetings.value, fmtDate(weekDays.value[0]), fmtDate(weekDays.value[6]))
)
const monthCells = computed(() =>
  buildMonthGridSunday(anchor.value.getFullYear(), anchor.value.getMonth() + 1)
)
const monthMeetingsByDay = computed(() =>
  groupEventsByDay(meetings.value, monthCells.value[0].dateStr, monthCells.value[41].dateStr)
)
const monthLayouts = computed(() => {
  const map = new Map<string, ReturnType<typeof layoutMonthCell>>()
  for (const [day, list] of monthMeetingsByDay.value) map.set(day, layoutMonthCell(list))
  return map
})

// ---------- 右侧详情列表 ----------
const rightDayMeetings = computed(() => dayMeetings.value)
const rightSummary = computed(() => meetingSummary(rightDayMeetings.value, now.value))
const rightNext = computed(() => nextMeeting(rightDayMeetings.value, now.value))
const tomorrowMeetings = computed(() => meetingsOn(meetings.value, tomorrowOf(anchorStr.value)))

function dayHeader(d: Date): { week: string; date: string; isToday: boolean } {
  return {
    week: `周${WEEKDAY_HEADER[d.getDay()]}`,
    date: fmtDate(d),
    isToday: fmtDate(d) === todayStr
  }
}

function meetingLabel(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEKDAY_HEADER[d.getDay()]}`
}

function attendeeColor(a: { contact_id: number | null }): string {
  if (a.contact_id == null) return '#ADB5BD'
  return contacts.value.find((c) => c.id === a.contact_id)?.avatar_color ?? '#ADB5BD'
}

// ---------- 详情 / 编辑 / 管理 ----------
const detailVisible = ref(false)
const detailEvent = ref<WorkEvent | null>(null)
const editorVisible = ref(false)
const editorEvent = ref<WorkEvent | null>(null)
const editorDefaultDate = ref('')
const manageVisible = ref(false)
const remindVisible = ref(false)

function openDetail(ev: WorkEvent): void {
  detailEvent.value = ev
  detailVisible.value = true
}

function openCreate(): void {
  editorEvent.value = null
  editorDefaultDate.value = anchorStr.value
  editorVisible.value = true
}

function openEdit(): void {
  editorEvent.value = detailEvent.value
  editorDefaultDate.value = ''
  editorVisible.value = true
  detailVisible.value = false
}

function onDataChanged(): void {
  load()
}

function openDay(dateStr: string): void {
  const [y, m, d] = dateStr.split('-').map(Number)
  anchor.value = new Date(y, m - 1, d)
  view.value = 'day'
}
</script>

<template>
  <div class="mtg-page">
    <!-- 左侧会议日历分类 -->
    <aside class="mtg-side">
      <div class="mtg-side__group">
        <div class="mtg-side__group-title">会议日历</div>
        <label
          v-for="cal in meetingCalendars"
          :key="cal.id"
          class="mtg-side__item"
          :class="{ 'is-hidden': cal.is_visible !== 1, 'is-active': activeCalId === cal.id }"
        >
          <input
            type="checkbox"
            :checked="cal.is_visible === 1"
            @click.stop
            @change="toggleVisibility(cal)"
          />
          <span
            class="mtg-side__body"
            :title="activeCalId === cal.id ? '点击取消只看该日历' : '点击只看该日历会议'"
            @click="toggleActive(cal, $event)"
          >
            <span class="mtg-side__dot" :style="{ background: cal.color }"></span>
            <span class="mtg-side__name">{{ cal.name }}</span>
            <span class="mtg-side__count">{{ countOf(cal.id) }}</span>
          </span>
        </label>
        <div v-if="!meetingCalendars.length" class="mtg-side__empty">
          还没有会议日历,点下方「管理日历」创建。
        </div>
      </div>

      <button class="mtg-side__btn" @click="manageVisible = true">⚙ 管理日历</button>
      <button class="mtg-side__btn" @click="remindVisible = true">🔔 提醒设置</button>
    </aside>

    <!-- 中部视图 -->
    <div class="mtg-main">
      <div class="mtg-toolbar">
        <el-button type="primary" :icon="Plus" @click="openCreate">新建会议</el-button>
        <div class="mtg-toolbar__nav">
          <button class="mtg-toolbar__btn" @click="navigate(-1)">‹</button>
          <button class="mtg-toolbar__btn" @click="goToday">今天</button>
          <button class="mtg-toolbar__btn" @click="navigate(1)">›</button>
        </div>
        <div class="mtg-toolbar__title">{{ title }}</div>
        <el-segmented
          v-model="view"
          :options="[
            { label: '日', value: 'day' },
            { label: '周', value: 'week' },
            { label: '月', value: 'month' }
          ]"
        />
      </div>

      <!-- 日视图:时间轴 -->
      <div v-if="view === 'day'" class="mtg-timeline">
        <div v-for="h in hours" :key="h" class="mtg-timeline__row">
          <span class="mtg-timeline__hour">{{ String(h).padStart(2, '0') }}:00</span>
          <div class="mtg-timeline__lane"></div>
        </div>
        <div
          v-if="isToday && nowLineTop != null"
          class="mtg-timeline__now"
          :style="{ top: nowLineTop + 'px' }"
        ></div>
        <div
          v-for="b in timelineBlocks"
          :key="b.ev.id"
          class="mtg-block"
          :class="`is-${eventState(b.ev).key.replace('_', '-')}`"
          :style="blockStyle(b)"
          @click="openDetail(b.ev)"
        >
          <div class="mtg-block__title">{{ b.ev.title }}</div>
          <div class="mtg-block__sub">
            <template v-if="isTextMode">
              <span>时间：{{ fmtTimeRange(b.ev) }}</span>
              <span v-if="b.ev.location"> · 地点：{{ b.ev.location }}</span>
              <span v-if="b.ev.attendees.length"> · 参会人：{{ b.ev.attendees.length }} 人</span>
            </template>
            <template v-else>
              {{ fmtTimeRange(b.ev) }}
              <template v-if="b.ev.location">{{ locationIcon(b.ev.location) }} {{ b.ev.location }}</template>
              <template v-if="b.ev.attendees.length">👥 {{ b.ev.attendees.length }}人</template>
            </template>
          </div>
        </div>
        <div v-if="!timelineBlocks.length" class="mtg-timeline__empty">
          {{ isTextMode ? '当天没有会议' : '🎉 当天没有会议' }}
        </div>
      </div>

      <!-- 周视图 -->
      <div v-else-if="view === 'week'" class="mtg-week">
        <div
          v-for="d in weekDays"
          :key="fmtDate(d)"
          class="mtg-week__col"
          :class="{ 'is-today': fmtDate(d) === todayStr }"
        >
          <div class="mtg-week__head" @click="openDay(fmtDate(d))">
            <span class="mtg-week__week">{{ dayHeader(d).week }}</span>
            <span class="mtg-week__date" :class="{ 'is-today-num': dayHeader(d).isToday }">
              {{ d.getDate() }}
            </span>
          </div>
          <div class="mtg-week__body">
            <button
              v-for="ev in weekMeetingsByDay.get(fmtDate(d)) ?? []"
              :key="ev.id"
              class="mtg-week__item"
              :class="`is-${eventState(ev).key.replace('_', '-')}`"
              :style="{ borderLeftColor: calendars.find((c) => c.id === ev.calendar_id)?.color ?? '#CED4DA' }"
              @click="openDetail(ev)"
            >
              <span class="mtg-week__time">{{ fmtTimeRange(ev) }}</span>
              <span class="mtg-week__title">{{ ev.title }}</span>
              <span v-if="ev.location" class="mtg-week__loc">
                {{ isTextMode ? '地点：' : locationIcon(ev.location) + ' ' }}{{ ev.location }}
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- 月视图 -->
      <div v-else class="mtg-month">
        <div class="mtg-month__head">
          <span v-for="w in WEEKDAY_HEADER" :key="w" class="mtg-month__weekday">周{{ w }}</span>
        </div>
        <div class="mtg-month__grid">
          <div
            v-for="cell in monthCells"
            :key="cell.dateStr"
            class="mtg-month__cell"
            :class="{ 'is-out': !cell.inMonth, 'is-today': cell.dateStr === todayStr }"
            @click="openDay(cell.dateStr)"
          >
            <span class="mtg-month__day">{{ cell.day }}</span>
            <div class="mtg-month__blocks">
              <button
                v-for="ev in (monthLayouts.get(cell.dateStr) ?? { visible: [], more: 0 }).visible"
                :key="ev.id"
                class="mtg-month__block"
                :class="`is-${eventState(ev).key.replace('_', '-')}`"
                :style="{ background: calendars.find((c) => c.id === ev.calendar_id)?.color ?? '#CED4DA' }"
                :title="ev.title"
                @click.stop="openDetail(ev)"
              >
                {{ ev.title }}
              </button>
              <button
                v-if="(monthLayouts.get(cell.dateStr) ?? { visible: [], more: 0 }).more > 0"
                class="mtg-month__more"
                @click.stop="openDay(cell.dateStr)"
              >
                +{{ (monthLayouts.get(cell.dateStr) ?? { visible: [], more: 0 }).more }} 更多
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧会议详情列表 -->
    <aside class="mtg-panel">
      <div class="mtg-panel__head">
        <span class="mtg-panel__date">{{ meetingLabel(anchor) }}</span>
        <span class="mtg-panel__summary">
          {{ isToday ? '今日' : '当日' }}共 {{ rightSummary.total }} 场会议 · 已结束 {{ rightSummary.ended }} 场
        </span>
      </div>

      <div class="mtg-panel__next">
        <template v-if="rightNext">
          <span class="mtg-panel__next-label">
            {{ isTextMode ? '下一场会议' : '⏰ 下一场会议' }}
          </span>
          <span class="mtg-panel__next-title">{{ rightNext.ev.title }}</span>
          <span class="mtg-panel__next-time">
            {{ rightNext.ev.start_time!.slice(11) }} 开始 · {{ rightNext.text }}
          </span>
        </template>
        <template v-else>
          <span class="mtg-panel__next-label">
            {{ isTextMode ? '下一场会议' : '⏰ 下一场会议' }}
          </span>
          <span class="mtg-panel__next-empty">{{ isToday ? '今日会议已全部结束' : '当天暂无后续会议' }}</span>
        </template>
      </div>

      <div class="mtg-panel__section">
        <div class="mtg-panel__section-title">{{ isToday ? '今日会议' : '当日会议' }}</div>
        <button
          v-for="ev in rightDayMeetings"
          :key="ev.id"
          class="mtg-panel__item"
          @click="openDetail(ev)"
        >
          <span
            v-if="!isTextMode"
            class="mtg-panel__item-state"
            :class="`is-${eventState(ev).key.replace('_', '-')}`"
          >
            {{ eventState(ev).key === 'ended' || eventState(ev).key === 'done' ? '✓' : '·' }}
          </span>
          <span class="mtg-panel__item-main">
            <span class="mtg-panel__item-time">
              <template v-if="isTextMode">
                时间：{{ fmtTimeRange(ev) }} · {{ meetingStatusText(ev) }}
              </template>
              <template v-else>
                {{ fmtTimeRange(ev) }}
                <span v-if="eventState(ev).key === 'ended'" class="mtg-panel__ended">· 已结束</span>
              </template>
            </span>
            <span class="mtg-panel__item-title">{{ ev.title }}</span>
            <span class="mtg-panel__item-sub">
              <template v-if="isTextMode">
                <template v-if="ev.location">地点：{{ ev.location }}</template>
                <template v-if="ev.location && ev.attendees.length"> · </template>
                <template v-if="ev.attendees.length">参会人：{{ attendeeNames(ev) }}</template>
              </template>
              <template v-else>
                <template v-if="ev.location">{{ locationIcon(ev.location) }} {{ ev.location }}</template>
                <template v-if="ev.attendees.length">
                  参会人：{{ attendeeNames(ev) }}
                </template>
              </template>
            </span>
          </span>
          <span v-if="!isTextMode && ev.attendees.length" class="mtg-panel__avatars">
            <span
              v-for="a in ev.attendees.slice(0, 3)"
              :key="a.contact_id ?? a.name"
              class="mtg-panel__avatar"
              :style="{ background: attendeeColor(a) }"
              :title="a.name"
            >
              {{ avatarText(a.name) }}
            </span>
            <span v-if="ev.attendees.length > 3" class="mtg-panel__avatar-more">
              +{{ ev.attendees.length - 3 }}
            </span>
          </span>
        </button>
        <div v-if="!rightDayMeetings.length" class="mtg-panel__empty">当天没有会议安排</div>
      </div>

      <div class="mtg-panel__section">
        <div class="mtg-panel__section-title">次日会议</div>
        <button
          v-for="ev in tomorrowMeetings"
          :key="ev.id"
          class="mtg-panel__item"
          @click="openDetail(ev)"
        >
          <span class="mtg-panel__item-main">
            <span class="mtg-panel__item-time">{{ fmtTimeRange(ev) }}</span>
            <span class="mtg-panel__item-title">{{ ev.title }}</span>
            <span class="mtg-panel__item-sub">
              <template v-if="ev.location">
                {{ isTextMode ? '地点：' : locationIcon(ev.location) + ' ' }}{{ ev.location }}
              </template>
              <template v-if="ev.location && ev.description"> · </template>
              <template v-if="ev.description">备注：{{ ev.description }}</template>
            </span>
          </span>
        </button>
        <div v-if="!tomorrowMeetings.length" class="mtg-panel__empty">次日暂无会议</div>
      </div>
    </aside>

    <!-- 弹窗 -->
    <EventDetailDialog
      v-model="detailVisible"
      :event="detailEvent"
      :calendars="calendars"
      :contacts="contacts"
      @changed="onDataChanged"
      @edit="openEdit"
    />
    <EventEditorDialog
      v-model="editorVisible"
      :event="editorEvent"
      :default-date="editorDefaultDate"
      default-kind="meeting"
      :calendars="calendars"
      :contacts="contacts"
      @saved="onDataChanged"
      @deleted="onDataChanged"
    />
    <CalendarManageDialog
      v-model="manageVisible"
      :calendars="calendars"
      :events="events"
      kind-only="meeting"
      @changed="onDataChanged"
    />
    <MeetingReminderDialog v-model="remindVisible" @saved="onDataChanged" />
  </div>
</template>

<style scoped>
.mtg-page {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  max-width: 1500px;
  margin: 0 auto;
  /* 三栏最小可用宽度(侧 140 + 主 200 + 详情 215 + 间距):更窄时整体横向滚动,不挤压主区 */
  min-width: 587px;
}

/* ---------- 左侧 ---------- */
.mtg-side {
  width: 190px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mtg-side__group-title {
  font-size: 12px;
  color: var(--wa-text-muted);
  margin-bottom: 6px;
}

.mtg-side__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--wa-text);
}

.mtg-side__item:hover {
  background: #f8f9fa;
}

.mtg-side__item.is-hidden {
  color: #adb5bd;
}

.mtg-side__item.is-active {
  background: var(--wa-brand-soft);
}

.mtg-side__item.is-active .mtg-side__name {
  color: var(--wa-brand-text);
  font-weight: 600;
}

.mtg-side__item input {
  accent-color: var(--wa-brand);
}

.mtg-side__body {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.mtg-side__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.mtg-side__name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mtg-side__count {
  font-size: 11px;
  color: var(--wa-text-muted);
}

.mtg-side__empty {
  font-size: 12px;
  color: var(--wa-text-muted);
  padding: 8px;
  border: 1px dashed var(--wa-border);
  border-radius: 6px;
}

.mtg-side__btn {
  border: 1px dashed var(--wa-border);
  background: transparent;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 12px;
  color: var(--wa-text-muted);
  cursor: pointer;
  text-align: left;
}

.mtg-side__btn:hover {
  border-color: var(--wa-brand);
  color: var(--wa-brand);
}

/* ---------- 工具栏 ---------- */
.mtg-main {
  flex: 1;
  min-width: 200px;
}

.mtg-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 12px;
}

.mtg-toolbar__nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mtg-toolbar__btn {
  border: 1px solid var(--wa-border);
  background: #fff;
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 13px;
  cursor: pointer;
  color: var(--wa-text);
}

.mtg-toolbar__btn:hover {
  border-color: var(--wa-brand);
  color: var(--wa-brand);
}

.mtg-toolbar__title {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  color: var(--wa-ink);
}

/* ---------- 时间轴 ---------- */
.mtg-timeline {
  position: relative;
  border: 1px solid var(--wa-border);
  border-radius: 8px;
  background: #fff;
  padding: 8px 8px 8px 0;
}

.mtg-timeline__row {
  display: flex;
  height: 60px;
}

.mtg-timeline__hour {
  width: 52px;
  flex-shrink: 0;
  text-align: right;
  padding-right: 8px;
  font-size: 11px;
  color: var(--wa-text-muted);
  transform: translateY(-6px);
}

.mtg-timeline__lane {
  flex: 1;
  border-top: 1px solid #f1f3f5;
}

.mtg-timeline__now {
  position: absolute;
  left: 60px;
  right: 0;
  height: 2px;
  background: #fa5252;
  z-index: 2;
  pointer-events: none;
}

.mtg-timeline__empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--wa-text-muted);
  font-size: 13px;
}

.mtg-block {
  position: absolute;
  z-index: 1;
  border-radius: 6px;
  background: #fff;
  border: 1px solid var(--wa-border);
  border-left-width: 3px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  padding: 4px 8px;
  cursor: pointer;
  overflow: hidden;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mtg-block:hover {
  border-color: var(--wa-brand);
  box-shadow: 0 2px 8px rgba(18, 184, 134, 0.18);
}

.mtg-block__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--wa-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mtg-block__sub {
  font-size: 11px;
  color: var(--wa-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mtg-block.is-ended,
.mtg-block.is-done {
  opacity: 0.55;
}

.mtg-block.is-cancelled {
  opacity: 0.4;
  text-decoration: line-through;
}

/* ---------- 周视图 ---------- */
.mtg-week {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-left: 1px solid var(--wa-border);
  border-top: 1px solid var(--wa-border);
}

.mtg-week__col {
  border-right: 1px solid var(--wa-border);
  border-bottom: 1px solid var(--wa-border);
  min-height: 420px;
  background: #fff;
}

.mtg-week__col.is-today {
  background: var(--wa-brand-soft);
}

.mtg-week__head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 0;
  border-bottom: 1px solid var(--wa-border);
  cursor: pointer;
}

.mtg-week__week {
  font-size: 11px;
  color: var(--wa-text-muted);
}

.mtg-week__date {
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

.mtg-week__date.is-today-num {
  background: var(--wa-brand);
  color: #fff;
}

.mtg-week__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
}

.mtg-week__item {
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

.mtg-week__item.is-ended,
.mtg-week__item.is-done {
  opacity: 0.6;
}

.mtg-week__item.is-cancelled {
  opacity: 0.45;
  text-decoration: line-through;
}

.mtg-week__time {
  font-size: 10px;
  color: var(--wa-text-muted);
}

.mtg-week__title {
  font-size: 12px;
  color: var(--wa-text);
  word-break: break-all;
}

.mtg-week__loc {
  font-size: 10px;
  color: var(--wa-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

/* ---------- 月视图 ---------- */
.mtg-month__head {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-bottom: 1px solid var(--wa-border);
  padding-bottom: 6px;
}

.mtg-month__weekday {
  text-align: center;
  font-size: 12px;
  color: var(--wa-text-muted);
}

.mtg-month__grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-left: 1px solid var(--wa-border);
  border-top: 1px solid var(--wa-border);
}

.mtg-month__cell {
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

.mtg-month__cell.is-out {
  background: #fafbfc;
}

.mtg-month__cell.is-today {
  background: var(--wa-brand-soft);
}

.mtg-month__day {
  font-size: 12px;
  color: var(--wa-text);
  font-weight: 500;
  align-self: flex-end;
}

.mtg-month__cell.is-today .mtg-month__day {
  background: var(--wa-brand);
  color: #fff;
  border-radius: 50%;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mtg-month__blocks {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mtg-month__block {
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

.mtg-month__block.is-ended,
.mtg-month__block.is-done {
  opacity: 0.55;
}

.mtg-month__block.is-cancelled {
  opacity: 0.4;
  text-decoration: line-through;
}

.mtg-month__more {
  border: none;
  background: transparent;
  color: var(--wa-text-muted);
  font-size: 11px;
  text-align: left;
  padding: 0 2px;
  cursor: pointer;
}

/* ---------- 右侧详情列表 ---------- */
.mtg-panel {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 窄窗口自适应(拖小窗口/整体缩放):压缩侧栏与详情面板,主区保持可用宽度 */
@media (max-width: 1150px) {
  .mtg-side {
    width: 140px;
  }

  .mtg-panel {
    width: 215px;
  }
}

.mtg-panel__head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mtg-panel__date {
  font-size: 16px;
  font-weight: 600;
  color: var(--wa-ink);
}

.mtg-panel__summary {
  font-size: 12px;
  color: var(--wa-text-muted);
}

.mtg-panel__next {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--wa-brand-soft);
  border-radius: 8px;
  padding: 10px 12px;
}

.mtg-panel__next-label {
  font-size: 12px;
  color: var(--wa-brand-text);
  font-weight: 600;
}

.mtg-panel__next-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--wa-ink);
}

.mtg-panel__next-time {
  font-size: 12px;
  color: var(--wa-brand-text);
}

.mtg-panel__next-empty {
  font-size: 13px;
  color: var(--wa-text-muted);
}

.mtg-panel__section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--wa-ink);
  margin-bottom: 6px;
}

.mtg-panel__item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  border: 1px solid var(--wa-border);
  border-radius: 8px;
  background: #fff;
  padding: 8px 10px;
  margin-bottom: 6px;
  cursor: pointer;
  text-align: left;
}

.mtg-panel__item:hover {
  border-color: var(--wa-brand);
  box-shadow: 0 2px 8px rgba(18, 184, 134, 0.12);
}

.mtg-panel__item-state {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #fff;
  background: #ced4da;
}

.mtg-panel__item-state.is-ended,
.mtg-panel__item-state.is-done {
  background: #12b886;
}

.mtg-panel__item-state.is-in-progress {
  background: #339af0;
}

.mtg-panel__item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mtg-panel__item-time {
  font-size: 11px;
  color: var(--wa-text-muted);
}

.mtg-panel__ended {
  color: #868e96;
}

.mtg-panel__item-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--wa-ink);
  word-break: break-all;
}

.mtg-panel__item-sub {
  font-size: 11px;
  color: var(--wa-text-muted);
  word-break: break-all;
}

.mtg-panel__avatars {
  display: flex;
  flex-shrink: 0;
}

.mtg-panel__avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  color: #fff;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: -6px;
  border: 2px solid #fff;
}

.mtg-panel__avatar:first-child {
  margin-left: 0;
}

.mtg-panel__avatar-more {
  font-size: 11px;
  color: var(--wa-text-muted);
  align-self: center;
  margin-left: 4px;
}

.mtg-panel__empty {
  font-size: 12px;
  color: #adb5bd;
  padding: 8px 0;
}
</style>
