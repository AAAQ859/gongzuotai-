<script setup lang="ts">
/**
 * 今日/明日待办详情:会议区在上、事项区在下,两类绝不混排。
 * 会议按开始时间升序,突出名称、时间、地点、参会人/组织、备注,便于每天 17:00 截图汇报。
 */
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import type { Contact, WorkEvent } from '@shared/types'
import { db } from '@/api/db'
import { categoryColor } from '@/utils/dashboard'
import { eventState } from '@/utils/calendar'
import { weekdayLabel } from '@shared/recurrence'

const props = defineProps<{
  modelValue: boolean
  label: string
  date: string
  tasks: WorkEvent[]
  meetings: WorkEvent[]
  contacts: Contact[]
  now: Date
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'changed'): void
}>()

const byStart = (a: WorkEvent, b: WorkEvent): number =>
  (a.start_time ?? '').localeCompare(b.start_time ?? '')

const sortedMeetings = computed(() => [...props.meetings].sort(byStart))
const openTasks = computed(() =>
  props.tasks.filter((e) => e.status !== 'done').sort(byStart)
)
const doneTasks = computed(() => props.tasks.filter((e) => e.status === 'done').sort(byStart))

const title = computed(() => `${props.label}待办 · ${props.date} ${weekdayLabel(props.date)}`)
const openTaskCount = computed(() => openTasks.value.length)
const summaryText = computed(
  () => `${sortedMeetings.value.length} 场会议 · ${openTaskCount.value} 项未完成事项`
)

function nowText(): string {
  const d = props.now
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function timeRange(ev: WorkEvent): string {
  if (!ev.start_time) return '全天'
  const startDay = ev.start_time.slice(0, 10)
  const start = ev.start_time.slice(11)
  if (!ev.end_time) return start
  const endDay = ev.end_time.slice(0, 10)
  const end = ev.end_time.slice(11)
  return endDay && endDay !== startDay ? `${start} - 次日 ${end}` : `${start} - ${end}`
}

function endTimeText(ev: WorkEvent): string {
  return ev.end_time?.slice(11) ?? ''
}

function contactName(id: number | null): string {
  return props.contacts.find((c) => c.id === id)?.name ?? ''
}

function metaState(ev: WorkEvent): { label: string; key: string } {
  // 以视图生成时刻为准判断会议状态;明日会议恒为未开始
  const s = eventState(ev, props.now)
  return { label: s.label, key: s.key }
}

async function toggleDone(ev: WorkEvent): Promise<void> {
  try {
    await db.events.setStatus(ev.id, ev.status === 'done' ? 'todo' : 'done')
    emit('changed')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '操作失败')
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="760px"
    top="4vh"
    append-to-body
    class="todo-dialog"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="todo">
      <div class="todo__summary">
        <span class="todo__summary-main">{{ summaryText }}</span>
        <span class="todo__summary-time">截至 {{ nowText() }}</span>
      </div>

      <!-- 待办会议:置于上方,按开始时间升序 -->
      <section class="todo-section">
        <div class="todo-section__head">
          <span class="todo-section__icon todo-section__icon--meeting">🤝</span>
          <span class="todo-section__title">待办会议</span>
          <span class="todo-section__count">{{ sortedMeetings.length }}</span>
          <span class="todo-section__hint">按开始时间顺序</span>
        </div>

        <div v-if="sortedMeetings.length" class="meeting-list">
          <article v-for="ev in sortedMeetings" :key="ev.id" class="meeting-card">
            <div class="meeting-card__time">
              <div class="meeting-card__start">{{ ev.start_time?.slice(11) ?? '全天' }}</div>
              <div v-if="endTimeText(ev)" class="meeting-card__end">至 {{ endTimeText(ev) }}</div>
              <span class="meeting-card__state" :class="`is-${metaState(ev).key.replace('_', '-')}`">
                {{ metaState(ev).label }}
              </span>
            </div>

            <div class="meeting-card__body">
              <div class="meeting-card__title-row">
                <h3 class="meeting-card__title">{{ ev.title }}</h3>
                <span
                  v-if="ev.category"
                  class="meeting-card__chip"
                  :style="{
                    color: categoryColor(ev.category),
                    background: categoryColor(ev.category) + '1A'
                  }"
                >
                  {{ ev.category }}
                </span>
              </div>

              <div class="meeting-card__meta">
                <span class="meeting-card__meta-item">🕘 {{ timeRange(ev) }}</span>
                <span v-if="ev.location" class="meeting-card__meta-item">📍 {{ ev.location }}</span>
                <span v-if="ev.attendees.length" class="meeting-card__meta-item">
                  👥 {{ ev.attendees.map((a) => a.name).join('、') }}
                </span>
              </div>

              <div v-if="ev.description" class="meeting-card__note">📝 {{ ev.description }}</div>
            </div>
          </article>
        </div>
        <div v-else class="todo-empty">这一天没有会议安排</div>
      </section>

      <!-- 待办事项:置于下方 -->
      <section class="todo-section">
        <div class="todo-section__head">
          <span class="todo-section__icon todo-section__icon--task">📝</span>
          <span class="todo-section__title">待办事项</span>
          <span class="todo-section__count">{{ openTaskCount }}</span>
          <span v-if="doneTasks.length" class="todo-section__hint">已完成 {{ doneTasks.length }} 项</span>
        </div>

        <div v-if="openTasks.length || doneTasks.length" class="task-list">
          <div v-for="ev in openTasks" :key="ev.id" class="task-item">
            <button
              class="task-item__check"
              title="标记为已完成"
              @click="toggleDone(ev)"
            ></button>
            <div class="task-item__main">
              <div class="task-item__title-row">
                <span class="task-item__title">{{ ev.title }}</span>
                <span v-if="ev.task_type === 'routine'" class="task-item__routine">🔁 例行</span>
                <span
                  v-if="ev.category"
                  class="task-item__chip"
                  :style="{
                    color: categoryColor(ev.category),
                    background: categoryColor(ev.category) + '1A'
                  }"
                >
                  {{ ev.category }}
                </span>
              </div>
              <div class="task-item__meta">
                <span>🕘 {{ timeRange(ev) }}</span>
                <span v-if="ev.contact_id != null">👤 {{ contactName(ev.contact_id) }}</span>
                <span v-if="ev.location">📍 {{ ev.location }}</span>
              </div>
            </div>
          </div>

          <div v-if="doneTasks.length" class="task-done-label">已完成</div>
          <div v-for="ev in doneTasks" :key="ev.id" class="task-item task-item--done">
            <button
              class="task-item__check task-item__check--done"
              title="标记为未完成"
              @click="toggleDone(ev)"
            >✓</button>
            <div class="task-item__main">
              <div class="task-item__title-row">
                <span class="task-item__title">{{ ev.title }}</span>
                <span v-if="ev.task_type === 'routine'" class="task-item__routine">🔁 例行</span>
                <span
                  v-if="ev.category"
                  class="task-item__chip"
                  :style="{
                    color: categoryColor(ev.category),
                    background: categoryColor(ev.category) + '1A'
                  }"
                >
                  {{ ev.category }}
                </span>
              </div>
              <div class="task-item__meta">
                <span>🕘 {{ timeRange(ev) }}</span>
                <span v-if="ev.contact_id != null">👤 {{ contactName(ev.contact_id) }}</span>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="todo-empty">这一天没有待办事项</div>
      </section>
    </div>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.todo {
  max-height: 70vh;
  overflow-y: auto;
  padding-right: 4px;
}

.todo__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  margin-bottom: 16px;
  background: #f8f9fa;
  border-radius: 8px;
}

.todo__summary-main {
  font-size: 14px;
  font-weight: 600;
  color: var(--wa-ink);
}

.todo__summary-time {
  font-size: 12px;
  color: var(--wa-text-muted);
  font-variant-numeric: tabular-nums;
}

.todo-section + .todo-section {
  margin-top: 22px;
}

.todo-section__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.todo-section__icon {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  font-size: 14px;
}

.todo-section__icon--meeting {
  background: #e7f5ff;
}

.todo-section__icon--task {
  background: #e6fcf5;
}

.todo-section__title {
  font-size: 15px;
  font-weight: 700;
  color: var(--wa-ink);
}

.todo-section__count {
  min-width: 22px;
  height: 20px;
  padding: 0 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: var(--wa-brand);
  border-radius: 999px;
}

.todo-section__hint {
  margin-left: auto;
  font-size: 12px;
  color: var(--wa-text-muted);
}

/* ---------- 会议卡片 ---------- */
.meeting-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.meeting-card {
  display: flex;
  gap: 16px;
  padding: 15px 18px;
  background: linear-gradient(180deg, #fbfdff 0%, #fff 100%);
  border: 1px solid #dce8f5;
  border-left: 4px solid #339af0;
  border-radius: 10px;
}

.meeting-card__time {
  width: 82px;
  flex-shrink: 0;
  padding-top: 2px;
  text-align: right;
}

.meeting-card__start {
  font-size: 24px;
  font-weight: 800;
  line-height: 1.1;
  color: #1971c2;
  font-variant-numeric: tabular-nums;
}

.meeting-card__end {
  margin-top: 2px;
  font-size: 12px;
  color: var(--wa-text-muted);
  font-variant-numeric: tabular-nums;
}

.meeting-card__state {
  display: inline-block;
  margin-top: 7px;
  padding: 1px 8px;
  font-size: 11px;
  border-radius: 999px;
  color: var(--wa-text-muted);
  background: #f1f3f5;
}

.meeting-card__state.is-ended {
  color: #868e96;
  background: #f1f3f5;
}

.meeting-card__state.is-in-progress {
  color: #1971c2;
  background: #e7f5ff;
}

.meeting-card__state.is-not-started {
  color: var(--wa-brand-text);
  background: var(--wa-brand-soft);
}

.meeting-card__body {
  flex: 1;
  min-width: 0;
}

.meeting-card__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.meeting-card__title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.35;
  color: var(--wa-ink);
  word-break: break-all;
}

.meeting-card__chip {
  padding: 1px 8px;
  font-size: 11px;
  border-radius: 999px;
  white-space: nowrap;
}

.meeting-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  margin-top: 7px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--wa-text);
}

.meeting-card__meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.meeting-card__note {
  margin-top: 8px;
  padding: 7px 10px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--wa-text);
  background: #f8f9fa;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-all;
}

/* ---------- 事项列表 ---------- */
.task-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--wa-border);
  border-radius: 10px;
  overflow: hidden;
}

.task-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  background: #fff;
}

.task-item + .task-item {
  border-top: 1px solid #f1f3f5;
}

.task-item:hover {
  background: #fbfcfd;
}

.task-item__check {
  width: 20px;
  height: 20px;
  margin-top: 1px;
  flex-shrink: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #fff;
  background: transparent;
  border: 1.5px solid #ced4da;
  border-radius: 50%;
  cursor: pointer;
}

.task-item__check:hover {
  border-color: var(--wa-brand);
}

.task-item__check--done {
  background: var(--wa-brand);
  border-color: var(--wa-brand);
}

.task-item__main {
  flex: 1;
  min-width: 0;
}

.task-item__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.task-item__title {
  font-size: 14px;
  font-weight: 500;
  color: var(--wa-text);
  word-break: break-all;
}

.task-item__routine {
  padding: 1px 8px;
  font-size: 11px;
  color: var(--wa-brand-text);
  background: var(--wa-brand-soft);
  border-radius: 999px;
  white-space: nowrap;
}

.task-item__chip {
  padding: 1px 8px;
  font-size: 11px;
  border-radius: 999px;
  white-space: nowrap;
}

.task-item__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--wa-text-muted);
}

.task-item--done .task-item__title {
  color: var(--wa-text-muted);
  text-decoration: line-through;
}

.task-item--done {
  background: #fbfbfb;
}

.task-done-label {
  padding: 8px 14px 4px;
  font-size: 11px;
  color: var(--wa-text-muted);
  background: #fbfbfb;
  border-top: 1px solid #f1f3f5;
}

.todo-empty {
  padding: 22px 0;
  text-align: center;
  font-size: 13px;
  color: var(--wa-text-muted);
  background: #fbfcfd;
  border: 1px dashed var(--wa-border);
  border-radius: 10px;
}
</style>
