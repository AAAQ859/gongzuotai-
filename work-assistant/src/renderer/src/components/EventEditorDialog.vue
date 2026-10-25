<script setup lang="ts">
/**
 * 事项/会议完整编辑器(新增 + 编辑),供日程日历、会议日历、仪表盘复用。
 *
 * - 事项:标题、事项分类标签、开始/结束时间、对接人;开始时间变更后结束时间默认 +3 小时
 * - 会议:会议名称、参会人/组织、时间、地点、备注;结束时间默认 +1 小时
 * - 事项分为临时事项 / 例行事项;例行事项按每周同一星期与时间自动排入日历
 * - 编辑例行事项时可选择「仅本次」或「整个系列」
 */
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { AttendeeRef, Calendar, Contact, EventKind, TaskType, WorkEvent } from '@shared/types'
import { SELF_ATTENDEE_NAME } from '@shared/types'
import { db } from '@/api/db'
import type { CreateEventInput } from '@/api/db'
import { fmtDate, fmtDateTime, roundToNextHalfHour } from '@/utils/dashboard'
import {
  addMinutesToDateTime,
  diffMinutes,
  formatWeeklyRule
} from '@shared/recurrence'
import SeriesDeleteDialog from '@/components/SeriesDeleteDialog.vue'

const props = defineProps<{
  modelValue: boolean
  /** 传入则为编辑模式 */
  event: WorkEvent | null
  /** 新增时的默认日期('YYYY-MM-DD') */
  defaultDate?: string
  /** 新增时的默认类型(会议日历页传 'meeting') */
  defaultKind?: EventKind
  calendars: Calendar[]
  contacts: Contact[]
  /** 已有分类标签(供下拉联想) */
  categories?: string[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved'): void
  (e: 'deleted'): void
}>()

const TASK_DEFAULT_MINUTES = 180
const MEETING_DEFAULT_MINUTES = 60

const saving = ref(false)
const deleteScopeVisible = ref(false)
const form = reactive({
  kind: 'task' as EventKind,
  task_type: 'temporary' as TaskType,
  title: '',
  calendar_id: null as number | string | null,
  category: '',
  start_time: '',
  end_time: '',
  location: '',
  attendeeValues: [] as Array<number | string>,
  contact_id: null as number | string | null,
  status: 'todo' as WorkEvent['status'],
  description: '',
  reminder: 30, // 0=不提醒;15/30/60/1440=提前分钟数;-1=会议跟随全局
  scope: 'one' as 'one' | 'series'
})

/** 用于开始时间变化时保持原时长;避免把已有 1 小时事项强行扩成 3 小时 */
let lastStart = ''
let lastEnd = ''

const isRoutineEditing = computed(
  () => !!props.event && props.event.task_type === 'routine' && props.event.series_id != null
)

const weeklyRuleText = computed(() =>
  form.start_time ? formatWeeklyRule(form.start_time) : ''
)

const dialogTitle = computed(() => {
  const kind = form.kind === 'meeting' ? '会议' : form.task_type === 'routine' ? '例行事项' : '事项'
  return `${props.event ? '编辑' : '新建'}${kind}`
})

const calendarOptions = computed(() =>
  props.calendars
    .filter((c) => (form.kind === 'meeting' ? c.kind === 'meeting' : c.kind === 'schedule'))
    .map((c) => ({ value: c.id, label: c.name }))
)

/** 新日历/联系人轮转取色 */
const NEW_COLOR_PALETTE = ['#12B886', '#339AF0', '#FF922B', '#9775FA', '#F06595', '#51CF66', '#F59F00', '#22B8CF']
function nextColor(kind: 'schedule' | 'meeting'): string {
  const same = props.calendars.filter((c) => c.kind === kind)
  return NEW_COLOR_PALETTE[same.length % NEW_COLOR_PALETTE.length]
}

function defaultEnd(start: string, minutes: number): string {
  return start ? addMinutesToDateTime(start, minutes) : ''
}

function initForm(): void {
  const ev = props.event
  if (ev) {
    form.kind = ev.kind
    form.task_type = ev.task_type
    form.title = ev.title
    form.calendar_id = ev.calendar_id
    form.category = ev.category
    form.start_time = ev.start_time ?? ''
    form.end_time = ev.end_time ?? ''
    form.location = ev.location
    form.attendeeValues = ev.attendees.map((a) => a.contact_id ?? a.name)
    form.contact_id = ev.contact_id
    form.status = ev.status
    form.description = ev.description
    form.scope = 'one'
    const mins = ev.reminder_minutes ?? (ev.reminder_days ? ev.reminder_days * 1440 : null)
    // 会议未单独指定提前量时为「跟随全局设置」(-1);事项无提前量则视为不提醒
    form.reminder = ev.reminder_enabled ? (mins ?? (ev.kind === 'meeting' ? -1 : 0)) : 0
    lastStart = form.start_time
    lastEnd = form.end_time
    return
  }

  const today = fmtDate(new Date())
  const defaultDate = props.defaultDate ?? today
  // 默认日期是今天时从下一个半点开始;其他日期默认 09:00
  const start =
    defaultDate === today ? fmtDateTime(roundToNextHalfHour(new Date())) : `${defaultDate} 09:00`
  form.kind = props.defaultKind ?? 'task'
  form.task_type = 'temporary'
  form.title = ''
  form.calendar_id = calendarOptions.value[0]?.value ?? null
  form.category = ''
  form.start_time = start
  form.end_time = defaultEnd(
    start,
    form.kind === 'task' ? TASK_DEFAULT_MINUTES : MEETING_DEFAULT_MINUTES
  )
  form.location = ''
  form.attendeeValues = []
  form.contact_id = null
  form.status = 'todo'
  form.description = ''
  form.scope = 'one'
  // 会议默认跟随全局设置(-1),事项默认结束前 30 分钟提醒(用户确认)
  form.reminder = form.kind === 'meeting' ? -1 : 30
  lastStart = form.start_time
  lastEnd = form.end_time
}

watch(
  () => props.modelValue,
  (v) => {
    if (v) initForm()
  }
)

function onKindChange(): void {
  form.calendar_id = calendarOptions.value[0]?.value ?? null
  if (form.kind === 'meeting') {
    form.reminder = -1
  } else if (form.reminder < 0) {
    form.reminder = 30
  }
  // 切换类型时按新类型恢复默认时长(仍可由用户手动调整)
  if (form.start_time) {
    form.end_time = defaultEnd(
      form.start_time,
      form.kind === 'task' ? TASK_DEFAULT_MINUTES : MEETING_DEFAULT_MINUTES
    )
    lastStart = form.start_time
    lastEnd = form.end_time
  }
}

function onStartChange(value: string | null): void {
  if (!value) return
  // 保持当前起止间隔;新建时该间隔已按事项 3 小时 / 会议 1 小时初始化
  const currentSpan = lastStart && lastEnd ? diffMinutes(lastStart, lastEnd) : 0
  const span =
    currentSpan > 0
      ? currentSpan
      : form.kind === 'task'
        ? TASK_DEFAULT_MINUTES
        : MEETING_DEFAULT_MINUTES
  form.end_time = addMinutesToDateTime(value, span)
  lastStart = value
  lastEnd = form.end_time
}

function onEndChange(value: string | null): void {
  lastEnd = value ?? ''
}

function contactName(id: number): string {
  return props.contacts.find((c) => c.id === id)?.name ?? ''
}

/** 参会人/组织:联系人取 id,直接输入的名称以文本保存(contact_id=null) */
function attendeePayload(): AttendeeRef[] {
  const out: AttendeeRef[] = []
  const seen = new Set<string>()
  for (const value of form.attendeeValues) {
    const name = typeof value === 'number' ? contactName(value) : String(value).trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    out.push({ contact_id: typeof value === 'number' ? value : null, name })
  }
  return out
}

async function submit(): Promise<void> {
  const title = form.title.trim()
  if (!title) {
    ElMessage.warning(form.kind === 'meeting' ? '请输入会议名称' : '请输入标题')
    return
  }
  if (form.start_time && form.end_time && form.end_time < form.start_time) {
    ElMessage.warning('结束时间不能早于开始时间')
    return
  }
  if (form.kind === 'task' && form.task_type === 'routine') {
    if (!form.start_time || !form.end_time) {
      ElMessage.warning('例行事项需要开始时间和结束时间')
      return
    }
  }

  saving.value = true
  try {
    // 日历 / 对接人:下拉允许直接输入新名称,字符串值即时创建后取 id
    let calendarId = form.calendar_id
    if (typeof calendarId === 'string') {
      const name = calendarId.trim()
      if (!name) {
        ElMessage.warning('请输入日历名称')
        return
      }
      const cal = await db.calendars.create({
        name,
        kind: form.kind === 'meeting' ? 'meeting' : 'schedule',
        color: nextColor(form.kind === 'meeting' ? 'meeting' : 'schedule')
      })
      calendarId = cal.id
    }
    let contactId = form.contact_id
    if (typeof contactId === 'string') {
      const name = contactId.trim()
      if (!name) {
        ElMessage.warning('请输入对接人姓名')
        return
      }
      const c = await db.contacts.create({ name })
      contactId = c.id
    }

    const isRoutine = form.kind === 'task' && form.task_type === 'routine'
    const payload: CreateEventInput = {
      kind: form.kind,
      title,
      calendar_id: calendarId as number | null,
      category: form.category.trim(),
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      location: form.kind === 'meeting' ? form.location.trim() : undefined,
      // IPC 结构化克隆不接受 Vue reactive Proxy,须先转普通对象
      attendees: form.kind === 'meeting' ? attendeePayload() : [],
      contact_id: form.kind === 'task' ? (contactId as number | null) : null,
      status: form.kind === 'task' ? form.status : undefined,
      description: form.description.trim(),
      task_type: form.kind === 'task' ? form.task_type : undefined,
      // 会议:0=不提醒、-1=跟随全局设置(分钟存 null)、正数=单独指定;事项:按结束时间提前
      reminder_enabled:
        form.kind === 'meeting'
          ? form.start_time && form.reminder !== 0
            ? 1
            : 0
          : form.end_time && form.reminder > 0
            ? 1
            : 0,
      reminder_minutes:
        form.kind === 'meeting'
          ? form.reminder > 0
            ? form.reminder
            : null
          : form.end_time && form.reminder > 0
            ? form.reminder
            : null
    }

    if (props.event) {
      const scope = isRoutineEditing.value ? form.scope : 'one'
      await db.events.update(props.event.id, { ...payload, scope })
      ElMessage.success(scope === 'series' ? '已保存,未来期次已同步' : '已保存')
    } else {
      await db.events.create(payload)
      ElMessage.success(
        isRoutine ? '已新增,未来 12 个月已自动排入日历' : '已新增'
      )
    }
    emit('update:modelValue', false)
    emit('saved')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '保存失败')
  } finally {
    saving.value = false
  }
}

async function remove(): Promise<void> {
  if (!props.event) return
  if (props.event.series_id != null) {
    deleteScopeVisible.value = true
    return
  }
  try {
    await ElMessageBox.confirm(`确定删除「${props.event.title}」吗?删除后不可恢复。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
    await db.events.remove(props.event.id, 'one')
    ElMessage.success('已删除')
    emit('update:modelValue', false)
    emit('deleted')
  } catch (err) {
    if (err === 'cancel' || err === 'close') return
    ElMessage.error(err instanceof Error ? err.message : '删除失败')
  }
}

async function onDeleteScope(scope: 'one' | 'series'): Promise<void> {
  if (!props.event) return
  deleteScopeVisible.value = false
  try {
    await db.events.remove(props.event.id, scope)
    ElMessage.success(scope === 'series' ? '已删除整个系列' : '已删除本次')
    emit('update:modelValue', false)
    emit('deleted')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '删除失败')
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="dialogTitle"
    width="560px"
    top="4vh"
    append-to-body
    class="event-editor"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-form label-width="104px" @submit.prevent>
      <el-form-item label="类型">
        <el-radio-group v-model="form.kind" :disabled="!!event" @change="onKindChange">
          <el-radio-button value="task">事项</el-radio-button>
          <el-radio-button value="meeting">会议</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item :label="form.kind === 'meeting' ? '会议名称' : '标题'" required>
        <el-input
          v-model="form.title"
          :placeholder="form.kind === 'meeting' ? '会议名称' : '要做什么?'"
          maxlength="100"
        />
      </el-form-item>

      <el-form-item v-if="form.kind === 'task' && !event" label="事项类型">
        <el-radio-group v-model="form.task_type">
          <el-radio-button value="temporary">临时事项</el-radio-button>
          <el-radio-button value="routine">例行事项</el-radio-button>
        </el-radio-group>
        <div class="form-tip">
          {{
            form.task_type === 'routine'
              ? '每周固定星期与时间,保存后自动排入日历'
              : '一次性或时间不固定的事项'
          }}
        </div>
      </el-form-item>
      <el-form-item v-else-if="form.kind === 'task' && event" label="事项类型">
        <span class="type-badge" :class="{ 'type-badge--routine': event.task_type === 'routine' }">
          {{ event.task_type === 'routine' ? '🔁 例行事项' : '临时事项' }}
        </span>
        <span v-if="isRoutineEditing" class="form-tip form-tip--inline">{{ weeklyRuleText }}</span>
      </el-form-item>

      <el-form-item v-if="form.kind === 'meeting'" label="参会人/组织">
        <el-select
          v-model="form.attendeeValues"
          multiple
          filterable
          allow-create
          default-first-option
          clearable
          placeholder="选择联系人或「我」,也可输入组织名后回车"
          style="width: 100%"
        >
          <el-option label="我(本人)" :value="SELF_ATTENDEE_NAME" />
          <el-option
            v-for="c in contacts"
            :key="c.id"
            :label="c.department ? `${c.name} · ${c.department}` : c.name"
            :value="c.id"
          />
        </el-select>
        <div class="form-tip">
          本人参加的会议请选择「我」;工作纲要据此区分会议参与和会议通知。也可直接输入组织名,如「韩亚航空运行部」
        </div>
      </el-form-item>

      <el-form-item label="开始时间">
        <el-date-picker
          v-model="form.start_time"
          type="datetime"
          value-format="YYYY-MM-DD HH:mm"
          format="YYYY-MM-DD HH:mm"
          placeholder="选择开始时间"
          style="width: 100%"
          @change="onStartChange"
        />
      </el-form-item>
      <el-form-item label="结束时间">
        <el-date-picker
          v-model="form.end_time"
          type="datetime"
          value-format="YYYY-MM-DD HH:mm"
          format="YYYY-MM-DD HH:mm"
          placeholder="选择结束时间"
          style="width: 100%"
          @change="onEndChange"
        />
        <div class="form-tip">
          {{
            form.kind === 'task'
              ? '默认开始时间后 3 小时结束,可手动调整'
              : '默认开始时间后 1 小时结束,可手动调整'
          }}
        </div>
      </el-form-item>

      <el-form-item v-if="form.kind === 'meeting'" label="地点">
        <el-input v-model="form.location" placeholder="会议室 / 线上会议" />
      </el-form-item>

      <el-form-item v-if="form.kind === 'task'" label="事项分类标签">
        <el-select
          v-model="form.category"
          filterable
          allow-create
          default-first-option
          clearable
          placeholder="如:例行工作 / 对接 / 报告(可自定义)"
          style="width: 100%"
        >
          <el-option v-for="c in props.categories" :key="c" :label="c" :value="c" />
        </el-select>
      </el-form-item>

      <el-form-item v-if="form.kind === 'task'" label="对接人">
        <el-select
          v-model="form.contact_id"
          filterable
          allow-create
          default-first-option
          clearable
          placeholder="选择联系人,或输入新姓名回车创建"
          style="width: 100%"
        >
          <el-option
            v-for="c in contacts"
            :key="c.id"
            :label="c.department ? `${c.name} · ${c.department}` : c.name"
            :value="c.id"
          />
        </el-select>
      </el-form-item>

      <template v-if="form.kind === 'meeting'">
        <el-divider content-position="left">更多设置(可选)</el-divider>
        <el-form-item label="会议日历">
          <el-select
            v-model="form.calendar_id"
            filterable
            allow-create
            default-first-option
            placeholder="选择日历,或输入新名称回车新建"
            style="width: 100%"
          >
            <el-option v-for="c in calendarOptions" :key="c.value" :label="c.label" :value="c.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="分类标签">
          <el-select
            v-model="form.category"
            filterable
            allow-create
            default-first-option
            clearable
            placeholder="如:例会 / 协调会(可自定义)"
            style="width: 100%"
          >
            <el-option v-for="c in props.categories" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.start_time" label="开始前提醒">
          <el-select v-model="form.reminder" style="width: 100%">
            <el-option label="跟随全局设置(设置页可改)" :value="-1" />
            <el-option label="不提醒" :value="0" />
            <el-option label="提前 15 分钟" :value="15" />
            <el-option label="提前 30 分钟" :value="30" />
            <el-option label="提前 1 小时" :value="60" />
          </el-select>
        </el-form-item>
      </template>

      <template v-if="form.kind === 'task'">
        <el-form-item v-if="form.end_time" label="结束前提醒">
          <el-select v-model="form.reminder" style="width: 100%">
            <el-option label="不提醒" :value="0" />
            <el-option label="提前 15 分钟" :value="15" />
            <el-option label="提前 30 分钟" :value="30" />
            <el-option label="提前 1 小时" :value="60" />
            <el-option label="提前 1 天" :value="1440" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status" style="width: 100%">
            <el-option label="待办(按时间自动识别)" value="todo" />
            <el-option label="进行中" value="in_progress" />
            <el-option label="已完成" value="done" />
            <el-option label="已取消" value="cancelled" />
          </el-select>
        </el-form-item>
      </template>

      <el-form-item label="备注">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="3"
          :placeholder="form.kind === 'meeting' ? '会议备注(可选)' : '补充说明(可选)'"
        />
      </el-form-item>

      <div v-if="form.kind === 'task' && form.task_type === 'routine'" class="routine-hint">
        <div class="routine-hint__title">🔁 {{ weeklyRuleText || '每周重复' }}</div>
        <div>
          保存后自动生成未来 12 个月,每一期都可单独勾选完成;修改或删除时可选择仅本次或整个系列。
        </div>
      </div>

      <el-form-item v-if="isRoutineEditing" label="修改范围">
        <el-radio-group v-model="form.scope">
          <el-radio value="one">仅本次</el-radio>
          <el-radio value="series">整个系列</el-radio>
        </el-radio-group>
        <div class="form-tip">
          {{
            form.scope === 'series'
              ? '未来未完成的期次会按新内容更新,历史与已完成保留'
              : '只修改这一期,其他周次不变'
          }}
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button v-if="event" type="danger" plain style="float: left" @click="remove">删除</el-button>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>

  <SeriesDeleteDialog
    v-model="deleteScopeVisible"
    :event="event"
    @choose="onDeleteScope"
  />
</template>

<style scoped>
/* 表单字段较多:内容区内滚动,保证 1280×800 下「保存」始终可见 */
:global(.event-editor .el-dialog__body) {
  max-height: 62vh;
  overflow-y: auto;
  padding-right: 8px;
}

.form-tip {
  width: 100%;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--wa-text-muted);
}

.form-tip--inline {
  width: auto;
  margin: 0 0 0 10px;
}

.type-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  font-size: 12px;
  color: var(--wa-text);
  background: #f1f3f5;
  border-radius: 999px;
}

.type-badge--routine {
  color: var(--wa-brand-text);
  background: var(--wa-brand-soft);
  font-weight: 600;
}

.routine-hint {
  margin-top: 4px;
  padding: 10px 14px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--wa-text);
  background: var(--wa-brand-soft);
  border: 1px solid rgba(18, 184, 134, 0.22);
  border-radius: 8px;
}

.routine-hint__title {
  margin-bottom: 2px;
  font-size: 13px;
  font-weight: 600;
  color: var(--wa-brand-text);
}
</style>
