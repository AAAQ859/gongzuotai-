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
  calendar_id: null as number | null,
  category: '',
  start_time: '',
  end_time: '',
  location: '',
  attendees: [] as { contact_id: number | null; name: string }[],
  contact_id: null as number | null,
  status: 'todo' as WorkEvent['status'],
  description: ''
})

const calendarOptions = computed(() =>
  props.calendars
    .filter((c) => (form.kind === 'meeting' ? c.kind === 'meeting' : c.kind === 'schedule'))
    .map((c) => ({ value: c.id, label: c.name }))
)

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
    return
  }
  const base = props.defaultDate ? `${props.defaultDate} 09:00` : null
  const start = base ?? fmtDateTime(roundToNextHalfHour(new Date()))
  const [d, t] = start.split(' ')
  const [h, m] = t.split(':').map(Number)
  const endHour = h + 1
  form.kind = 'task'
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
    const payload = {
      kind: form.kind,
      title: form.title.trim(),
      calendar_id: form.calendar_id,
      category: form.category.trim() || undefined,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      location: form.location.trim() || undefined,
      attendees: form.kind === 'meeting' ? form.attendees : [],
      contact_id: form.kind === 'task' ? form.contact_id : null,
      status: form.kind === 'task' ? form.status : undefined,
      description: form.description.trim() || undefined
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
        <el-select v-model="form.calendar_id" placeholder="选择日历分类" style="width: 100%">
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
            :label="`${c.name} · ${c.department}`"
            :value="c.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item v-if="form.kind === 'task'" label="对接人">
        <el-select v-model="form.contact_id" clearable placeholder="选择联系人(可选)" style="width: 100%">
          <el-option
            v-for="c in contacts"
            :key="c.id"
            :label="`${c.name} · ${c.department}`"
            :value="c.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item v-if="form.kind === 'task'" label="状态">
        <el-select v-model="form.status" style="width: 100%">
          <el-option label="待办" value="todo" />
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
