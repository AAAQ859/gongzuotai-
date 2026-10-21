<script setup lang="ts">
/**
 * 事项/会议完整编辑器(新增 + 编辑),供日程日历、会议日历等板块复用。
 * 自包含数据库调用,成功后 emit('saved'),删除后 emit('deleted')。
 */
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Calendar, Contact, EventKind, WorkEvent } from '@shared/types'
import { db } from '@/api/db'
import { fmtDateTime, roundToNextHalfHour } from '@/utils/dashboard'

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

const saving = ref(false)
const form = reactive({
  kind: 'task' as EventKind,
  title: '',
  calendar_id: null as number | string | null,
  category: '',
  start_time: '',
  end_time: '',
  location: '',
  attendees: [] as { contact_id: number | null; name: string }[],
  contact_id: null as number | string | null,
  status: 'todo' as WorkEvent['status'],
  description: '',
  reminder: 30 // 0=不提醒;15/30/60/1440=提前分钟数
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

function initForm(): void {
  const ev = props.event
  if (ev) {
    form.kind = ev.kind
    form.title = ev.title
    form.calendar_id = ev.calendar_id
    form.category = ev.category
    form.start_time = ev.start_time ?? ''
    form.end_time = ev.end_time ?? ''
    form.location = ev.location
    form.attendees = ev.attendees.map((a) => ({ ...a }))
    form.contact_id = ev.contact_id
    form.status = ev.status
    form.description = ev.description
    const mins = ev.reminder_minutes ?? (ev.reminder_days ? ev.reminder_days * 1440 : null)
    form.reminder = ev.reminder_enabled && mins ? mins : 0
    return
  }
  const base = props.defaultDate ? `${props.defaultDate} 09:00` : null
  const start = base ?? fmtDateTime(roundToNextHalfHour(new Date()))
  const [d, t] = start.split(' ')
  const [h, m] = t.split(':').map(Number)
  const endHour = h + 1
  form.kind = props.defaultKind ?? 'task'
  form.title = ''
  form.calendar_id = calendarOptions.value[0]?.value ?? null
  form.category = ''
  form.start_time = start
  form.end_time = `${d} ${String(endHour).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  form.location = ''
  form.attendees = []
  form.contact_id = null
  form.status = 'todo'
  form.description = ''
  form.reminder = 30 // 默认:结束前 30 分钟提醒(用户确认)
}

watch(
  () => props.modelValue,
  (v) => {
    if (v) initForm()
  }
)

function onKindChange(): void {
  form.calendar_id = calendarOptions.value[0]?.value ?? null
}

function contactName(id: number | null): string {
  return props.contacts.find((c) => c.id === id)?.name ?? ''
}

function onAttendeesChange(ids: number[]): void {
  form.attendees = ids.map((id) => ({ contact_id: id, name: contactName(id) }))
}

async function submit(): Promise<void> {
  if (!form.title.trim()) {
    ElMessage.warning('请输入标题')
    return
  }
  if (form.start_time && form.end_time && form.end_time < form.start_time) {
    ElMessage.warning('结束时间不能早于开始时间')
    return
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
    const payload = {
      kind: form.kind,
      title: form.title.trim(),
      calendar_id: calendarId as number | null,
      category: form.category.trim() || undefined,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      location: form.location.trim() || undefined,
      // IPC 结构化克隆不接受 Vue reactive Proxy,须先转普通对象
      attendees: form.kind === 'meeting' ? form.attendees.map((a) => ({ ...a })) : [],
      contact_id: form.kind === 'task' ? (contactId as number | null) : null,
      status: form.kind === 'task' ? form.status : undefined,
      description: form.description.trim() || undefined,
      reminder_enabled: form.end_time && form.reminder > 0 ? 1 : 0,
      reminder_minutes: form.end_time && form.reminder > 0 ? form.reminder : null
    }
    if (props.event) {
      await db.events.update(props.event.id, payload)
      ElMessage.success('已保存')
    } else {
      await db.events.create({ ...payload, status: form.kind === 'task' ? form.status : undefined })
      ElMessage.success('已新增')
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
  try {
    await ElMessageBox.confirm(`确定删除「${props.event.title}」吗?删除后不可恢复。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
    await db.events.remove(props.event.id)
    ElMessage.success('已删除')
    emit('update:modelValue', false)
    emit('deleted')
  } catch (err) {
    if (err === 'cancel' || err === 'close') return
    ElMessage.error(err instanceof Error ? err.message : '删除失败')
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="event ? '编辑日程' : '新建日程'"
    width="520px"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-form label-width="80px" @submit.prevent>
      <el-form-item label="类型">
        <el-radio-group v-model="form.kind" :disabled="!!event" @change="onKindChange">
          <el-radio-button value="task">事项</el-radio-button>
          <el-radio-button value="meeting">会议</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="标题" required>
        <el-input v-model="form.title" placeholder="要做什么?" maxlength="100" />
      </el-form-item>
      <el-form-item :label="form.kind === 'meeting' ? '会议日历' : '所属日历'">
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
          placeholder="如:例会 / 对接 / 报告(可自定义)"
          style="width: 100%"
        >
          <el-option v-for="c in props.categories" :key="c" :label="c" :value="c" />
        </el-select>
      </el-form-item>
      <el-form-item label="开始时间">
        <el-date-picker
          v-model="form.start_time"
          type="datetime"
          value-format="YYYY-MM-DD HH:mm"
          format="YYYY-MM-DD HH:mm"
          placeholder="选择开始时间"
          style="width: 100%"
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
        />
      </el-form-item>
      <el-form-item v-if="form.kind === 'meeting'" label="地点">
        <el-input v-model="form.location" placeholder="会议室 / 线上会议" />
      </el-form-item>
      <el-form-item v-if="form.kind === 'meeting'" label="参会人">
        <el-select
          :model-value="form.attendees.map((a) => a.contact_id).filter((v): v is number => v != null)"
          multiple
          filterable
          placeholder="选择参会人"
          style="width: 100%"
          @update:model-value="onAttendeesChange"
        >
          <el-option
            v-for="c in contacts"
            :key="c.id"
            :label="c.department ? `${c.name} · ${c.department}` : c.name"
            :value="c.id"
          />
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
      <el-form-item v-if="form.kind === 'task' && form.end_time" label="结束前提醒">
        <el-select v-model="form.reminder" style="width: 100%">
          <el-option label="不提醒" :value="0" />
          <el-option label="提前 15 分钟" :value="15" />
          <el-option label="提前 30 分钟" :value="30" />
          <el-option label="提前 1 小时" :value="60" />
          <el-option label="提前 1 天" :value="1440" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="form.kind === 'task'" label="状态">
        <el-select v-model="form.status" style="width: 100%">
          <el-option label="待办(按时间自动识别)" value="todo" />
          <el-option label="进行中" value="in_progress" />
          <el-option label="已完成" value="done" />
          <el-option label="已取消" value="cancelled" />
        </el-select>
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.description" type="textarea" :rows="3" placeholder="补充说明(可选)" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button v-if="event" type="danger" plain style="float: left" @click="remove">删除</el-button>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>
