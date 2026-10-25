<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import type { Calendar, Contact, WorkEvent } from '@shared/types'
import { db } from '@/api/db'
import {
  buildMonthGrid,
  categoryColor,
  computeSummary,
  fmtDate,
  greeting,
  eventColorsByDay,
  weekdayText
} from '@/utils/dashboard'
import WorkStats from '@/components/WorkStats.vue'
import EventEditorDialog from '@/components/EventEditorDialog.vue'
import TodoDialog from '@/components/TodoDialog.vue'

const router = useRouter()

// ---------- 数据 ----------
const events = ref<WorkEvent[]>([])
const calendars = ref<Calendar[]>([])
const contacts = ref<Contact[]>([])
const now = new Date()
const keyword = ref('')

const summary = computed(() => computeSummary(events.value, now))
const greet = greeting(now.getHours())
const dateLine = `${fmtDate(now)} · 周${weekdayText(now)}`

const focusText = computed(() => {
  const n = summary.value.focusCount
  return n > 0 ? `今天有 ${n} 件事需要关注` : '今天没有需要关注的事 🎉'
})

const categories = computed(() => {
  const set = new Set<string>()
  for (const e of events.value) if (e.category) set.add(e.category)
  return [...set]
})

function openTaskCount(list: WorkEvent[]): number {
  return list.filter((e) => e.status !== 'done').length
}

const todayTaskOpen = computed(() => openTaskCount(summary.value.todayTasks))
const tomorrowTaskOpen = computed(() => openTaskCount(summary.value.tomorrowTasks))
const todayTodoCount = computed(() => todayTaskOpen.value + summary.value.todayMeetings.length)
const tomorrowTodoCount = computed(
  () => tomorrowTaskOpen.value + summary.value.tomorrowMeetings.length
)

const todayFiltered = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  if (!k) return summary.value.todayEvents
  return summary.value.todayEvents.filter(
    (e) =>
      e.title.toLowerCase().includes(k) ||
      e.location.toLowerCase().includes(k) ||
      e.category.toLowerCase().includes(k) ||
      e.attendees.some((a) => a.name.toLowerCase().includes(k))
  )
})

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

// ---------- 完成状态切换 ----------
async function toggleDone(ev: WorkEvent): Promise<void> {
  try {
    await db.events.setStatus(ev.id, ev.status === 'done' ? 'todo' : 'done')
    await load()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '操作失败')
  }
}

// ---------- 迷你月历 ----------
const calYear = ref(now.getFullYear())
const calMonth = ref(now.getMonth() + 1)
const calTitle = computed(() => `${calYear.value}年${calMonth.value}月`)
const grid = computed(() => buildMonthGrid(calYear.value, calMonth.value))
const dayColors = computed(() =>
  eventColorsByDay(events.value, calendars.value, calYear.value, calMonth.value)
)
const todayStr = fmtDate(now)

function shiftMonth(delta: number): void {
  let m = calMonth.value + delta
  let y = calYear.value
  if (m < 1) {
    m = 12
    y--
  } else if (m > 12) {
    m = 1
    y++
  }
  calMonth.value = m
  calYear.value = y
}

// ---------- 新增 / 待办详情 ----------
const editorVisible = ref(false)

function openEditor(): void {
  editorVisible.value = true
}

const todoVisible = ref(false)
const todoMode = ref<'today' | 'tomorrow'>('today')
const todoLabel = computed(() => (todoMode.value === 'today' ? '今日' : '明日'))
const todoDate = computed(() =>
  todoMode.value === 'today' ? summary.value.today : summary.value.tomorrow
)
const todoTasks = computed(() =>
  todoMode.value === 'today' ? summary.value.todayTasks : summary.value.tomorrowTasks
)
const todoMeetings = computed(() =>
  todoMode.value === 'today' ? summary.value.todayMeetings : summary.value.tomorrowMeetings
)

function openTodos(mode: 'today' | 'tomorrow'): void {
  todoMode.value = mode
  todoVisible.value = true
}

// ---------- 展示辅助 ----------
function timeText(ev: WorkEvent): string {
  if (!ev.start_time) return '全天'
  return ev.start_time.slice(11)
}

function subText(ev: WorkEvent): string {
  const parts: string[] = []
  if (ev.location) parts.push(`地点：${ev.location}`)
  if (ev.attendees.length) parts.push(`参会人：${ev.attendees.map((a) => a.name).join('、')}`)
  else if (ev.kind === 'task' && ev.contact_id != null) {
    const c = contacts.value.find((x) => x.id === ev.contact_id)
    if (c) parts.push(`对接人：${c.name}`)
  }
  return parts.join(' · ')
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
</script>

<template>
  <div class="dash">
    <!-- 顶部问候 + 快捷操作 -->
    <div class="dash-hero">
      <div>
        <div class="dash-hero__greet">{{ greet.icon }} {{ greet.text }}</div>
        <div class="dash-hero__date">{{ dateLine }} · {{ focusText }}</div>
      </div>
      <div class="dash-hero__actions">
        <el-input
          v-model="keyword"
          class="dash-search"
          placeholder="搜索标题 / 地点 / 分类"
          clearable
          :prefix-icon="Search"
        />
        <el-button type="primary" :icon="Plus" @click="openEditor">新增</el-button>
      </div>
    </div>

    <!-- 四个关键指标卡:今日/明日待办优先,删除待对接 -->
    <div class="dash-cards">
      <div class="stat-card stat-card--today" @click="openTodos('today')">
        <div class="stat-card__icon stat-card__icon--today">📋</div>
        <div class="stat-card__body">
          <div class="stat-card__num">{{ todayTodoCount }}</div>
          <div class="stat-card__label">今日待办</div>
          <div class="stat-card__sub">
            {{ summary.todayMeetings.length }} 场会议 · {{ todayTaskOpen }} 项事项
          </div>
        </div>
      </div>
      <div class="stat-card stat-card--tomorrow" @click="openTodos('tomorrow')">
        <div class="stat-card__icon stat-card__icon--tomorrow">📅</div>
        <div class="stat-card__body">
          <div class="stat-card__num">{{ tomorrowTodoCount }}</div>
          <div class="stat-card__label">明日待办</div>
          <div class="stat-card__sub">
            {{ summary.tomorrowMeetings.length }} 场会议 · {{ tomorrowTaskOpen }} 项事项
          </div>
        </div>
      </div>
      <div class="stat-card" @click="router.push('/calendar')">
        <div class="stat-card__icon stat-card__icon--todo">📝</div>
        <div class="stat-card__body">
          <div class="stat-card__num">{{ summary.weekTasks.length }}</div>
          <div class="stat-card__label">本周待办</div>
          <div class="stat-card__sub">已完成 {{ summary.weekDone }} 项</div>
        </div>
      </div>
      <div class="stat-card" @click="router.push('/calendar')">
        <div class="stat-card__icon stat-card__icon--deadline">⏰</div>
        <div class="stat-card__body">
          <div class="stat-card__num">{{ summary.soon.length + summary.overdue.length }}</div>
          <div class="stat-card__label">临近截止</div>
          <div class="stat-card__sub">
            {{ summary.overdue.length > 0 ? `含逾期 ${summary.overdue.length} 项` : '3天内到期' }}
          </div>
        </div>
      </div>
    </div>

    <!-- 今日日程 + 右侧(迷你日历 / 待对接) -->
    <div class="dash-grid">
      <div class="panel">
        <div class="panel__head">
          <span class="panel__title">今日日程</span>
          <el-link type="primary" :underline="false" @click="router.push('/calendar')">
            查看全部 →
          </el-link>
        </div>
        <div v-if="todayFiltered.length" class="today-list">
          <div v-for="ev in todayFiltered" :key="ev.id" class="today-item">
            <div class="today-item__time">{{ timeText(ev) }}</div>
            <div
              class="today-item__dot"
              :style="{ background: calendars.find((c) => c.id === ev.calendar_id)?.color ?? '#CED4DA' }"
            ></div>
            <div class="today-item__main">
              <div class="today-item__row">
                <span class="today-item__title" :class="{ 'is-done': ev.status === 'done' }">
                  {{ ev.title }}
                </span>
                <span
                  v-if="ev.category"
                  class="today-item__chip"
                  :style="{ color: categoryColor(ev.category), background: categoryColor(ev.category) + '1A' }"
                >
                  {{ ev.category }}
                </span>
              </div>
              <div v-if="subText(ev)" class="today-item__sub">{{ subText(ev) }}</div>
            </div>
            <button
              v-if="ev.kind === 'task'"
              class="today-item__check"
              :class="{ 'is-done': ev.status === 'done' }"
              :title="ev.status === 'done' ? '标记为未完成' : '标记为已完成'"
              @click="toggleDone(ev)"
            >
              <span v-if="ev.status === 'done'">✓</span>
            </button>
          </div>
        </div>
        <div v-else class="panel__empty">🎉 今天没有安排</div>
      </div>

      <div class="dash-side">
        <div class="panel">
          <div class="panel__head">
            <span class="panel__title">本月日历</span>
            <span class="cal-nav">
              <button class="cal-nav__btn" @click="shiftMonth(-1)">‹</button>
              <span class="cal-nav__title">{{ calTitle }}</span>
              <button class="cal-nav__btn" @click="shiftMonth(1)">›</button>
            </span>
          </div>
          <div class="cal-weekdays">
            <span v-for="w in WEEKDAYS" :key="w">{{ w }}</span>
          </div>
          <div class="cal-grid">
            <div
              v-for="cell in grid"
              :key="cell.dateStr"
              class="cal-cell"
              :class="{ 'is-out': !cell.inMonth, 'is-today': cell.dateStr === todayStr }"
            >
              <span class="cal-cell__day">{{ cell.day }}</span>
              <span class="cal-cell__dots">
                <i
                  v-for="(c, i) in dayColors.get(cell.dateStr) ?? []"
                  :key="i"
                  :style="{ background: c }"
                ></i>
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- 工作统计图表(板块 10):完成趋势 / 事项分类 / 对接人活跃度 -->
    <WorkStats :events="events" :contacts="contacts" :now="now" />

    <!-- 新增/编辑:与日历、会议页共用同一套字段 -->
    <EventEditorDialog
      v-model="editorVisible"
      :event="null"
      :default-date="todayStr"
      :calendars="calendars"
      :contacts="contacts"
      :categories="categories"
      @saved="load"
    />

    <!-- 今日/明日待办详情:会议在上、事项在下 -->
    <TodoDialog
      v-model="todoVisible"
      :label="todoLabel"
      :date="todoDate"
      :tasks="todoTasks"
      :meetings="todoMeetings"
      :contacts="contacts"
      :now="now"
      @changed="load"
    />
  </div>
</template>

<style scoped>
.dash {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ---------- 顶部 ---------- */
.dash-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.dash-hero__greet {
  font-size: 22px;
  font-weight: 700;
  color: var(--wa-ink);
}

.dash-hero__date {
  margin-top: 4px;
  font-size: 13px;
  color: var(--wa-text-muted);
}

.dash-hero__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dash-search {
  width: 260px;
}

/* ---------- 指标卡 ---------- */
.dash-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: #fff;
  border: 1px solid var(--wa-border);
  border-radius: 10px;
  cursor: pointer;
  transition:
    box-shadow 0.15s,
    transform 0.15s;
}

.stat-card:hover {
  box-shadow: 0 4px 14px rgba(18, 184, 134, 0.12);
  transform: translateY(-1px);
}

.stat-card__icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.stat-card--today {
  border-color: #c5e3f8;
}
.stat-card--tomorrow {
  border-color: #dcd2f7;
}
.stat-card__icon--today {
  background: #e7f5ff;
}
.stat-card__icon--tomorrow {
  background: #f3f0ff;
}
.stat-card__icon--todo {
  background: #e6fcf5;
}
.stat-card__icon--deadline {
  background: #fff4e6;
}

.stat-card__num {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--wa-ink);
}

.stat-card__label {
  font-size: 13px;
  color: var(--wa-text);
  margin-top: 2px;
}

.stat-card__sub {
  font-size: 11px;
  color: var(--wa-text-muted);
  margin-top: 2px;
}

/* ---------- 面板 ---------- */
.dash-grid {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  gap: 14px;
  align-items: start;
}

.dash-side {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.panel {
  background: #fff;
  border: 1px solid var(--wa-border);
  border-radius: 10px;
  padding: 16px;
}

.panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.panel__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--wa-ink);
}

.panel__empty {
  padding: 28px 0;
  text-align: center;
  color: var(--wa-text-muted);
  font-size: 13px;
}

/* ---------- 今日日程 ---------- */
.today-list {
  display: flex;
  flex-direction: column;
}

.today-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 6px;
  border-radius: 6px;
}

.today-item:hover {
  background: #f8f9fa;
}

.today-item__time {
  width: 44px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--wa-text-muted);
  font-variant-numeric: tabular-nums;
  padding-top: 2px;
}

.today-item__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 6px;
  flex-shrink: 0;
}

.today-item__main {
  flex: 1;
  min-width: 0;
}

.today-item__row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.today-item__title {
  font-size: 13.5px;
  color: var(--wa-text);
  word-break: break-all;
}

.today-item__title.is-done {
  text-decoration: line-through;
  color: var(--wa-text-muted);
}

.today-item__chip {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 999px;
  white-space: nowrap;
}

.today-item__sub {
  margin-top: 3px;
  font-size: 12px;
  color: var(--wa-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.today-item__check {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1.5px solid #ced4da;
  background: transparent;
  cursor: pointer;
  margin-top: 2px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #fff;
  padding: 0;
}

.today-item__check:hover {
  border-color: var(--wa-brand);
}

.today-item__check.is-done {
  background: var(--wa-brand);
  border-color: var(--wa-brand);
}

/* ---------- 迷你月历 ---------- */
.cal-nav {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cal-nav__btn {
  width: 22px;
  height: 22px;
  border: 1px solid var(--wa-border);
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  color: var(--wa-text-muted);
}

.cal-nav__btn:hover {
  border-color: var(--wa-brand);
  color: var(--wa-brand);
}

.cal-nav__title {
  font-size: 12px;
  color: var(--wa-text-muted);
  min-width: 68px;
  text-align: center;
}

.cal-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  font-size: 11px;
  color: var(--wa-text-muted);
  margin-bottom: 4px;
}

.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.cal-cell {
  aspect-ratio: 1.15;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font-size: 12px;
  color: var(--wa-text);
}

.cal-cell.is-out {
  color: #dee2e6;
}

.cal-cell.is-today {
  background: var(--wa-brand);
}

.cal-cell.is-today .cal-cell__day {
  color: #fff;
  font-weight: 700;
}

.cal-cell__dots {
  display: flex;
  gap: 2px;
  height: 4px;
}

.cal-cell__dots i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  display: block;
}

</style>
