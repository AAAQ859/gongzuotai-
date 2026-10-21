<script setup lang="ts">
/**
 * 月度时间轴(板块 07,PRD 4.3):中央纵向时间轴 + 右侧详情面板。
 * 节点与日历共用 events 数据;状态配色:绿=已完成、青=进行中/今日、红=已逾期/今日截止、灰=待开始。
 * 左侧主线带本月已过时长进度;支持按日历类型筛选、Excel/CSV 批量导入、手动添加节点。
 */
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Calendar, Contact, WorkEvent } from '@shared/types'
import { db } from '@/api/db'
import { fmtDate } from '@/utils/dashboard'
import EventEditorDialog from '@/components/EventEditorDialog.vue'
import TimelineImportDialog from '@/components/TimelineImportDialog.vue'
import {
  buildTimeline,
  dateLabel,
  isUrging,
  monthProgress,
  timelineStatus,
  timelineSummary,
  type TimelineStatus
} from '@/utils/timeline'

const STATUS_META: Record<TimelineStatus, { label: string; color: string }> = {
  done: { label: '已完成', color: '#51CF66' },
  in_progress: { label: '进行中', color: '#12B886' },
  overdue: { label: '已逾期', color: '#FA5252' },
  due_today: { label: '今日截止', color: '#FA5252' },
  today: { label: '今日', color: '#12B886' },
  pending: { label: '待开始', color: '#ADB5BD' },
  cancelled: { label: '已取消', color: '#ADB5BD' }
}

/** 分类标签配色(PRD 4.3:交接黄/例行绿/报告蓝/会议紫) */
const TAG_COLORS: Record<string, string> = {
  对接: '#E67700',
  例行: '#2B8A3E',
  报告: '#1971C2',
  会议: '#6741D9',
  例会: '#6741D9',
  协调会: '#6741D9',
  培训: '#0B7285'
}

const anchor = ref(new Date())
const events = ref<WorkEvent[]>([])
const calendars = ref<Calendar[]>([])
const contacts = ref<Contact[]>([])
const filterCal = ref<number | null>(null)
const selectedId = ref<number | null>(null)
const editorVisible = ref(false)
const editingEvent = ref<WorkEvent | null>(null)
const editorDefaultDate = ref('')
const importVisible = ref(false)
const loading = ref(true)

const monthKey = computed(
  () => `${anchor.value.getFullYear()}-${String(anchor.value.getMonth() + 1).padStart(2, '0')}`
)
const monthTitle = computed(() => `${anchor.value.getFullYear()}年${anchor.value.getMonth() + 1}月`)
const todayStr = computed(() => fmtDate(new Date()))

const filteredEvents = computed(() =>
  filterCal.value == null ? events.value : events.value.filter((ev) => ev.calendar_id === filterCal.value)
)
const groups = computed(() => buildTimeline(filteredEvents.value, monthKey.value, todayStr.value))
const nodes = computed(() => groups.value.flatMap((g) => g.items))
const summary = computed(() => timelineSummary(nodes.value))
const progress = computed(() => monthProgress(todayStr.value))
const categories = computed(() => [...new Set(events.value.map((e) => e.category).filter(Boolean))])
const selected = computed(() => events.value.find((e) => e.id === selectedId.value) ?? null)

async function load(): Promise<void> {
  loading.value = true
  try {
    ;[events.value, calendars.value, contacts.value] = await Promise.all([
      db.events.list(),
      db.calendars.list(),
      db.contacts.list()
    ])
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '数据加载失败')
  } finally {
    loading.value = false
  }
}

function navigate(delta: number): void {
  anchor.value = new Date(anchor.value.getFullYear(), anchor.value.getMonth() + delta, 1)
}

function goToday(): void {
  anchor.value = new Date()
}

function openCreate(): void {
  editingEvent.value = null
  // 默认日期:看当前月则今天,否则该月 1 日
  editorDefaultDate.value =
    monthKey.value === todayStr.value.slice(0, 7) ? todayStr.value : `${monthKey.value}-01`
  editorVisible.value = true
}

function openEdit(ev: WorkEvent): void {
  editingEvent.value = ev
  editorVisible.value = true
}

function selectNode(ev: WorkEvent): void {
  selectedId.value = ev.id
}

function onEditorSaved(): void {
  load()
}

function onEditorDeleted(): void {
  selectedId.value = null
  load()
}

async function toggleDone(ev: WorkEvent): Promise<void> {
  try {
    const next = ev.status === 'done' ? 'todo' : 'done'
    await db.events.setStatus(ev.id, next)
    ElMessage.success(next === 'done' ? '已标记完成' : '已恢复为待办')
    load()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '操作失败')
  }
}

async function removeEvent(ev: WorkEvent): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除「${ev.title}」吗?删除后不可恢复。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
    await db.events.remove(ev.id)
    selectedId.value = null
    ElMessage.success('已删除')
    load()
  } catch (err) {
    if (err === 'cancel' || err === 'close') return
    ElMessage.error(err instanceof Error ? err.message : '删除失败')
  }
}

function timeText(ev: WorkEvent): string {
  const t = (s: string): string => s.slice(11)
  if (ev.start_time && ev.end_time) {
    const d1 = ev.start_time.slice(0, 10)
    const d2 = ev.end_time.slice(0, 10)
    if (d1 !== d2) return `${ev.start_time} 起 · ${ev.end_time} 止`
    return `${t(ev.start_time)} - ${t(ev.end_time)}`
  }
  if (ev.start_time) return ev.start_time
  if (ev.end_time) return `截止 ${ev.end_time}`
  return ''
}

function contactName(id: number | null): string {
  if (id == null) return ''
  const c = contacts.value.find((x) => x.id === id)
  return c ? (c.department ? `${c.name} · ${c.department}` : c.name) : ''
}

function contactPhone(ev: WorkEvent): string {
  if (ev.contact_id == null) return ''
  return contacts.value.find((c) => c.id === ev.contact_id)?.phone ?? ''
}

function calendarName(id: number | null): string {
  return calendars.value.find((c) => c.id === id)?.name ?? ''
}

function tagColor(category: string): string {
  return TAG_COLORS[category] ?? '#868E96'
}

function metaOf(ev: WorkEvent): Array<{ icon: string; text: string }> {
  const metas: Array<{ icon: string; text: string }> = []
  const time = timeText(ev)
  if (time) metas.push({ icon: '🕐', text: time })
  if (ev.location) metas.push({ icon: '📍', text: ev.location })
  if (ev.attendees.length) metas.push({ icon: '👥', text: ev.attendees.map((a) => a.name).join('、') })
  if (ev.contact_id != null) metas.push({ icon: '👤', text: `对接人:${contactName(ev.contact_id)}` })
  if (ev.related_files.length) metas.push({ icon: '📎', text: `关联文件:${ev.related_files.length} 份` })
  return metas
}

function statusOf(ev: WorkEvent): TimelineStatus {
  return timelineStatus(ev, todayStr.value)
}

onMounted(load)
</script>

<template>
  <div class="tl-page">
    <div class="tl-head">
      <div class="tl-head__title">📊 {{ monthTitle }} 工作时间轴</div>
      <div class="tl-head__nav">
        <button class="tl-toolbar__btn" @click="navigate(-1)">‹</button>
        <button class="tl-toolbar__btn" @click="goToday">今天</button>
        <button class="tl-toolbar__btn" @click="navigate(1)">›</button>
      </div>
    </div>
    <div class="tl-summary">
      共 {{ summary.total }} 个工作节点 · 已完成 {{ summary.done }} 项 · 进行中
      {{ summary.active }} 项 · 待开始 {{ summary.pending }} 项
    </div>
    <div class="tl-toolbar">
      <div class="tl-filters">
        <button
          class="tl-filter"
          :class="{ 'is-active': filterCal === null }"
          @click="filterCal = null"
        >
          全部类型
        </button>
        <button
          v-for="c in calendars"
          :key="c.id"
          class="tl-filter"
          :class="{ 'is-active': filterCal === c.id }"
          @click="filterCal = c.id"
        >
          {{ c.name }}
        </button>
      </div>
      <div class="tl-actions">
        <el-button @click="importVisible = true">📥 导入文件</el-button>
        <el-button type="primary" @click="openCreate">+ 添加节点</el-button>
      </div>
    </div>

    <div class="tl-body">
      <div class="tl-main">
        <div v-if="loading" class="tl-empty">加载中…</div>
        <div v-else-if="!groups.length" class="tl-empty">
          <div class="tl-empty__icon">🗓️</div>
          <div>本月暂无工作节点</div>
          <div class="tl-empty__hint">点「+ 添加节点」录入,或「📥 导入文件」从 Excel/CSV 批量导入</div>
        </div>
        <div v-else class="tl-wrap">
          <div class="tl-axis">
            <div class="tl-axis__line">
              <div class="tl-axis__progress" :style="{ height: progress + '%' }" />
            </div>
          </div>
          <div class="tl-groups">
            <section v-for="g in groups" :key="g.date" class="tl-group">
              <div class="tl-group__date">
                {{ g.label }}
                <span v-if="g.isToday" class="tl-group__today">【今天】</span>
              </div>
              <div
                v-for="n in g.items"
                :key="n.ev.id"
                class="tl-item"
                :class="{ 'is-selected': selectedId === n.ev.id }"
                @click="selectNode(n.ev)"
              >
                <span
                  class="tl-item__dot"
                  :style="{ background: STATUS_META[n.status].color, boxShadow: `0 0 0 2px ${STATUS_META[n.status].color}` }"
                />
                <div class="tl-item__card">
                  <div class="tl-item__row1">
                    <span class="tl-item__status" :style="{ color: STATUS_META[n.status].color }">
                      {{ STATUS_META[n.status].label }}
                    </span>
                    <span class="tl-item__title">{{ n.ev.title }}</span>
                  </div>
                  <div v-if="n.ev.description" class="tl-item__desc">{{ n.ev.description }}</div>
                  <div v-if="metaOf(n.ev).length" class="tl-item__meta">
                    <span v-for="m in metaOf(n.ev)" :key="m.icon" class="tl-item__meta-item">
                      {{ m.icon }} {{ m.text }}
                    </span>
                  </div>
                  <div class="tl-item__tags">
                    <span
                      v-if="n.ev.category"
                      class="tl-tag"
                      :style="{ background: tagColor(n.ev.category) + '22', color: tagColor(n.ev.category) }"
                    >
                      {{ n.ev.category }}
                    </span>
                    <span v-if="calendarName(n.ev.calendar_id)" class="tl-tag tl-tag--cal">
                      {{ calendarName(n.ev.calendar_id) }}
                    </span>
                    <span v-if="isUrging(n.ev, n.status)" class="tl-tag tl-tag--urging">催办中</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      <aside class="tl-detail">
        <template v-if="selected">
          <div class="tl-detail__head">
            <span
              class="tl-detail__status"
              :style="{ color: STATUS_META[statusOf(selected)].color }"
            >
              {{ STATUS_META[statusOf(selected)].label }}
            </span>
            <span class="tl-detail__date">{{ dateLabel(selected.start_time?.slice(0, 10) ?? selected.end_time?.slice(0, 10) ?? todayStr) }}</span>
          </div>
          <div class="tl-detail__title">{{ selected.title }}</div>
          <div v-if="selected.description" class="tl-detail__desc">{{ selected.description }}</div>
          <div v-if="metaOf(selected).length" class="tl-detail__metas">
            <div v-for="m in metaOf(selected)" :key="m.icon" class="tl-detail__meta">
              {{ m.icon }} {{ m.text }}
            </div>
          </div>
          <div v-if="contactPhone(selected)" class="tl-detail__meta">📱 电话:{{ contactPhone(selected) }}</div>
          <div class="tl-detail__tags">
            <span
              v-if="selected.category"
              class="tl-tag"
              :style="{ background: tagColor(selected.category) + '22', color: tagColor(selected.category) }"
            >
              {{ selected.category }}
            </span>
            <span v-if="calendarName(selected.calendar_id)" class="tl-tag tl-tag--cal">
              {{ calendarName(selected.calendar_id) }}
            </span>
            <span v-if="isUrging(selected, statusOf(selected))" class="tl-tag tl-tag--urging">催办中</span>
          </div>
          <div class="tl-detail__actions">
            <el-button
              :type="selected.status === 'done' ? 'info' : 'success'"
              plain
              size="small"
              @click="toggleDone(selected)"
            >
              {{ selected.status === 'done' ? '↺ 恢复待办' : '✓ 标记完成' }}
            </el-button>
            <el-button size="small" @click="openEdit(selected)">✏️ 编辑</el-button>
            <el-button size="small" type="danger" plain @click="removeEvent(selected)">删除</el-button>
          </div>
        </template>
        <div v-else class="tl-detail__empty">
          <div class="tl-detail__empty-icon">👈</div>
          <div>点击左侧节点查看详情</div>
          <div class="tl-detail__empty-hint">可查看时间地点、对接人、关联文件,并标记完成或编辑</div>
        </div>
      </aside>
    </div>

    <EventEditorDialog
      v-model="editorVisible"
      :event="editingEvent"
      :default-date="editorDefaultDate"
      default-kind="task"
      :calendars="calendars"
      :contacts="contacts"
      :categories="categories"
      @saved="onEditorSaved"
      @deleted="onEditorDeleted"
    />
    <TimelineImportDialog
      v-model="importVisible"
      :calendars="calendars"
      :contacts="contacts"
      @saved="load"
    />
  </div>
</template>

<style scoped>
.tl-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.tl-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.tl-head__title {
  font-size: 18px;
  font-weight: 600;
  color: var(--wa-text);
}

.tl-head__nav {
  display: flex;
  gap: 4px;
}

.tl-toolbar__btn {
  min-width: 32px;
  height: 28px;
  border: 1px solid var(--wa-border);
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
  color: var(--wa-text);
  font-size: 13px;
}

.tl-toolbar__btn:hover {
  background: var(--wa-brand-soft);
  border-color: var(--wa-brand-text);
}

.tl-summary {
  font-size: 13px;
  color: var(--wa-text-muted);
  margin-bottom: 10px;
}

.tl-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.tl-filters {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tl-filter {
  height: 26px;
  padding: 0 12px;
  border: 1px solid var(--wa-border);
  border-radius: 13px;
  background: #fff;
  color: var(--wa-text-muted);
  font-size: 12px;
  cursor: pointer;
}

.tl-filter.is-active {
  background: var(--wa-brand-soft);
  border-color: var(--wa-brand-text);
  color: var(--wa-brand-text);
  font-weight: 500;
}

.tl-actions {
  display: flex;
  gap: 8px;
}

.tl-body {
  flex: 1;
  display: flex;
  gap: 16px;
  min-height: 0;
}

.tl-main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.tl-wrap {
  display: flex;
  gap: 14px;
}

.tl-axis {
  width: 10px;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding-top: 2px;
}

.tl-axis__line {
  position: relative;
  width: 3px;
  height: 100%;
  min-height: 120px;
  background: #E9ECEF;
  border-radius: 2px;
}

.tl-axis__progress {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  background: linear-gradient(#12B886, #228BE6);
  border-radius: 2px;
}

.tl-groups {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-bottom: 8px;
}

.tl-group__date {
  font-size: 13px;
  font-weight: 600;
  color: var(--wa-text);
  margin-bottom: 8px;
}

.tl-group__today {
  color: #FA5252;
  font-weight: 600;
}

.tl-item {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
  cursor: pointer;
}

.tl-item__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-top: 16px;
  flex-shrink: 0;
}

.tl-item__card {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--wa-border);
  border-radius: 8px;
  padding: 10px 14px;
  background: #fff;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.tl-item.is-selected .tl-item__card {
  border-color: var(--wa-brand-text);
  box-shadow: 0 0 0 2px var(--wa-brand-soft);
}

.tl-item__row1 {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.tl-item__status {
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.tl-item__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--wa-text);
}

.tl-item__desc {
  font-size: 12px;
  color: var(--wa-text-muted);
  margin-top: 4px;
}

.tl-item__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-top: 6px;
}

.tl-item__meta-item {
  font-size: 12px;
  color: #495057;
}

.tl-item__tags {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.tl-tag {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.tl-tag--cal {
  background: #F1F3F5;
  color: #868E96;
}

.tl-tag--urging {
  background: #FFF3BF;
  color: #E67700;
}

.tl-empty {
  text-align: center;
  color: var(--wa-text-muted);
  font-size: 13px;
  padding: 64px 0;
}

.tl-empty__icon {
  font-size: 32px;
  margin-bottom: 10px;
}

.tl-empty__hint {
  font-size: 12px;
  margin-top: 6px;
}

.tl-detail {
  width: 300px;
  flex-shrink: 0;
  border: 1px solid var(--wa-border);
  border-radius: 8px;
  padding: 16px;
  overflow-y: auto;
  background: #fff;
  align-self: flex-start;
}

.tl-detail__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tl-detail__status {
  font-size: 13px;
  font-weight: 600;
}

.tl-detail__date {
  font-size: 12px;
  color: var(--wa-text-muted);
}

.tl-detail__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--wa-text);
  margin-top: 8px;
}

.tl-detail__desc {
  font-size: 13px;
  color: var(--wa-text-muted);
  margin-top: 6px;
  line-height: 1.6;
}

.tl-detail__metas {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tl-detail__meta {
  font-size: 13px;
  color: #495057;
}

.tl-detail__tags {
  display: flex;
  gap: 6px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.tl-detail__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--wa-border);
}

.tl-detail__empty {
  text-align: center;
  color: var(--wa-text-muted);
  font-size: 13px;
  padding: 40px 0;
}

.tl-detail__empty-icon {
  font-size: 28px;
  margin-bottom: 10px;
}

.tl-detail__empty-hint {
  font-size: 12px;
  margin-top: 6px;
}
</style>
