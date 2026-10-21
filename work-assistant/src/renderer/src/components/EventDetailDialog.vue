<script setup lang="ts">
/**
 * 日程详情:标题、时间、分类、关联对接人、关联文件、备注 + 状态流转/编辑/删除操作。
 * 状态切换与删除自包含,成功后 emit('changed');编辑由父组件打开编辑器处理。
 */
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Calendar, Contact, WorkEvent } from '@shared/types'
import { db } from '@/api/db'
import { categoryColor, deadlineLabel } from '@/utils/dashboard'
import { eventState } from '@/utils/calendar'

const props = defineProps<{
  modelValue: boolean
  event: WorkEvent | null
  calendars: Calendar[]
  contacts: Contact[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'changed'): void
  (e: 'edit'): void
}>()

const busy = ref(false)

const calendar = computed(() =>
  props.event?.calendar_id != null
    ? props.calendars.find((c) => c.id === props.event!.calendar_id)
    : undefined
)
const contact = computed(() =>
  props.event?.contact_id != null
    ? props.contacts.find((c) => c.id === props.event!.contact_id)
    : undefined
)

/** 状态:手动优先,未手动标记的按开始/结束时间自动识别(见 utils/calendar.ts eventState) */
const statusMeta = computed<{ label: string; cls: string }>(() => {
  if (!props.event) return { label: '', cls: '' }
  const s = eventState(props.event)
  return { label: s.label, cls: `is-${s.key.replace('_', '-')}` }
})

function reminderText(): string {
  if (!props.event?.end_time || !props.event.reminder_enabled) return ''
  const mins = props.event.reminder_minutes ?? (props.event.reminder_days ? props.event.reminder_days * 1440 : null)
  if (!mins) return ''
  if (mins >= 1440 && mins % 1440 === 0) return `结束前 ${mins / 1440} 天提醒`
  if (mins >= 60 && mins % 60 === 0) return `结束前 ${mins / 60} 小时提醒`
  return `结束前 ${mins} 分钟提醒`
}

function timeText(): string {
  if (!props.event) return ''
  if (!props.event.start_time) return '全天'
  const day = props.event.start_time.slice(0, 10)
  const start = props.event.start_time.slice(11)
  const end = props.event.end_time?.slice(11)
  const endDay = props.event.end_time?.slice(0, 10)
  const cross = endDay && endDay !== day
  return end ? `${day} ${start} - ${cross ? endDay + ' ' : ''}${end}` : `${day} ${start}`
}

async function toggleStatus(): Promise<void> {
  if (!props.event) return
  busy.value = true
  try {
    const next = props.event.status === 'done' ? 'todo' : 'done'
    await db.events.setStatus(props.event.id, next)
    emit('changed')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '操作失败')
  } finally {
    busy.value = false
  }
}

async function remove(): Promise<void> {
  if (!props.event) return
  try {
    await ElMessageBox.confirm(`确定删除「${props.event.title}」吗?删除后不可恢复。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
    await db.events.remove(props.event.id)
    ElMessage.success('已删除')
    emit('update:modelValue', false)
    emit('changed')
  } catch (err) {
    if (err === 'cancel' || err === 'close') return
    ElMessage.error(err instanceof Error ? err.message : '删除失败')
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="日程详情"
    width="480px"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-if="event" class="detail">
      <div class="detail__head">
        <span
          class="detail__dot"
          :style="{ background: calendar?.color ?? '#CED4DA' }"
        ></span>
        <span class="detail__title">{{ event.title }}</span>
      </div>

      <div class="detail__rows">
        <div class="detail__row">
          <span class="detail__label">时间</span>
          <span class="detail__value">{{ timeText() }}</span>
        </div>
        <div class="detail__row">
          <span class="detail__label">分类</span>
          <span class="detail__value">
            <span
              v-if="event.category"
              class="detail__chip"
              :style="{ color: categoryColor(event.category), background: categoryColor(event.category) + '1A' }"
            >
              {{ event.category }}
            </span>
            <span v-if="calendar" class="detail__chip" :style="{ color: calendar.color, background: calendar.color + '1A' }">
              {{ calendar.name }}
            </span>
          </span>
        </div>
        <div v-if="event.location" class="detail__row">
          <span class="detail__label">地点</span>
          <span class="detail__value">{{ event.location }}</span>
        </div>
        <div v-if="event.attendees.length" class="detail__row">
          <span class="detail__label">参会人</span>
          <span class="detail__value">{{ event.attendees.map((a) => a.name).join('、') }}</span>
        </div>
        <div v-if="contact" class="detail__row">
          <span class="detail__label">对接人</span>
          <span class="detail__value">{{ contact.department ? `${contact.name} · ${contact.department}` : contact.name }}</span>
        </div>
        <div v-if="event.related_files.length" class="detail__row">
          <span class="detail__label">关联文件</span>
          <span class="detail__value">{{ event.related_files.join('、') }}</span>
        </div>
        <div class="detail__row">
          <span class="detail__label">状态</span>
          <span class="detail__value">
            <span class="detail__status" :class="statusMeta.cls">{{ statusMeta.label }}</span>
            <span v-if="event.kind === 'task' && event.end_time" class="detail__deadline">
              {{ deadlineLabel(event.end_time) }}
            </span>
          </span>
        </div>
        <div v-if="reminderText()" class="detail__row">
          <span class="detail__label">提醒</span>
          <span class="detail__value">🔔 {{ reminderText() }}</span>
        </div>
        <div v-if="event.description" class="detail__row">
          <span class="detail__label">备注</span>
          <span class="detail__value detail__desc">{{ event.description }}</span>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button type="danger" plain style="float: left" @click="remove">删除</el-button>
      <el-button v-if="event?.kind === 'task'" :loading="busy" @click="toggleStatus">
        {{ event.status === 'done' ? '标记未完成' : '标记完成' }}
      </el-button>
      <el-button type="primary" @click="emit('edit')">编辑</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.detail__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.detail__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.detail__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--wa-ink);
  word-break: break-all;
}

.detail__rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail__row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.detail__label {
  width: 56px;
  flex-shrink: 0;
  font-size: 13px;
  color: var(--wa-text-muted);
  padding-top: 1px;
}

.detail__value {
  flex: 1;
  font-size: 13px;
  color: var(--wa-text);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.detail__desc {
  white-space: pre-wrap;
  word-break: break-all;
}

.detail__chip {
  font-size: 12px;
  padding: 1px 8px;
  border-radius: 999px;
}

.detail__status {
  font-size: 12px;
  padding: 1px 8px;
  border-radius: 999px;
}

.detail__status.is-todo {
  color: #f59f00;
  background: #fff4e6;
}
.detail__status.is-not-started {
  color: #868e96;
  background: #f1f3f5;
}
.detail__status.is-in-progress {
  color: #12b886;
  background: #e6f7f1;
}
.detail__status.is-ended {
  color: #868e96;
  background: #f1f3f5;
}
.detail__status.is-done {
  color: #2f9e44;
  background: #ebfbee;
}
.detail__status.is-cancelled {
  color: #868e96;
  background: #f1f3f5;
  text-decoration: line-through;
}

.detail__deadline {
  font-size: 12px;
  color: var(--wa-brand-text);
  background: var(--wa-brand-soft);
  padding: 1px 8px;
  border-radius: 999px;
}
</style>
