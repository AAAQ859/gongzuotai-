<script setup lang="ts">
/**
 * 日历分类管理:新增(名称/颜色/类型)、改名、换色、删除。
 * 日历不内置预设,全部由用户在此自行创建;删除时关联事项自动变为未分类(FK SET NULL)。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Calendar, WorkEvent } from '@shared/types'
import { db } from '@/api/db'

const props = defineProps<{
  modelValue: boolean
  calendars: Calendar[]
  events: WorkEvent[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'changed'): void
}>()

const NEW_COLOR_PALETTE = ['#12B886', '#339AF0', '#FF922B', '#9775FA', '#F06595', '#51CF66', '#F59F00', '#22B8CF']

const newName = ref('')
const newColor = ref(NEW_COLOR_PALETTE[0])
const newKind = ref<'schedule' | 'meeting'>('schedule')

const editingId = ref<number | null>(null)
const editingName = ref('')
const busy = ref(false)

const sorted = computed(() =>
  [...props.calendars].sort((a, b) => (a.kind === b.kind ? a.id - b.id : a.kind === 'schedule' ? -1 : 1))
)

function countOf(calId: number): number {
  return props.events.filter((e) => e.calendar_id === calId && e.status !== 'cancelled').length
}

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      newName.value = ''
      newColor.value =
        NEW_COLOR_PALETTE[props.calendars.length % NEW_COLOR_PALETTE.length]
      newKind.value = 'schedule'
      editingId.value = null
    }
  }
)

async function add(): Promise<void> {
  const name = newName.value.trim()
  if (!name) {
    ElMessage.warning('请输入日历名称')
    return
  }
  if (props.calendars.some((c) => c.name === name)) {
    ElMessage.warning('已存在同名日历')
    return
  }
  busy.value = true
  try {
    await db.calendars.create({ name, color: newColor.value, kind: newKind.value })
    ElMessage.success('已添加日历')
    newName.value = ''
    emit('changed')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '添加失败')
  } finally {
    busy.value = false
  }
}

function startRename(cal: Calendar): void {
  editingId.value = cal.id
  editingName.value = cal.name
}

async function saveRename(): Promise<void> {
  const name = editingName.value.trim()
  if (!name || editingId.value == null) return
  busy.value = true
  try {
    await db.calendars.update(editingId.value, { name })
    editingId.value = null
    emit('changed')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '改名失败')
  } finally {
    busy.value = false
  }
}

async function changeColor(cal: Calendar, color: string | null): Promise<void> {
  if (!color) return
  try {
    await db.calendars.update(cal.id, { color })
    emit('changed')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '换色失败')
  }
}

async function removeCal(cal: Calendar): Promise<void> {
  const n = countOf(cal.id)
  const tip =
    n > 0
      ? `确定删除「${cal.name}」吗?其下 ${n} 项日程将变为未分类。`
      : `确定删除「${cal.name}」吗?`
  try {
    await ElMessageBox.confirm(tip, '删除日历', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
    await db.calendars.remove(cal.id)
    ElMessage.success('已删除日历')
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
    title="管理日历"
    width="560px"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <!-- 新增 -->
    <div class="cal-mgr__add">
      <el-input
        v-model="newName"
        placeholder="日历名称,如:例行工作"
        maxlength="20"
        style="width: 180px"
        @keyup.enter="add"
      />
      <el-color-picker v-model="newColor" />
      <el-radio-group v-model="newKind">
        <el-radio-button value="schedule">我的日历</el-radio-button>
        <el-radio-button value="meeting">部门日历</el-radio-button>
      </el-radio-group>
      <el-button type="primary" :loading="busy" @click="add">添加</el-button>
    </div>

    <!-- 列表 -->
    <div class="cal-mgr__list">
      <div v-for="cal in sorted" :key="cal.id" class="cal-mgr__row">
        <span class="cal-mgr__dot" :style="{ background: cal.color }"></span>
        <template v-if="editingId === cal.id">
          <el-input
            v-model="editingName"
            size="small"
            maxlength="20"
            style="width: 180px"
            @keyup.enter="saveRename"
          />
          <el-button size="small" type="primary" @click="saveRename">保存</el-button>
          <el-button size="small" @click="editingId = null">取消</el-button>
        </template>
        <template v-else>
          <span class="cal-mgr__name">{{ cal.name }}</span>
          <span class="cal-mgr__kind">{{ cal.kind === 'schedule' ? '我的' : '部门' }}</span>
          <span class="cal-mgr__count">{{ countOf(cal.id) }} 项</span>
          <el-color-picker
            :model-value="cal.color"
            size="small"
            @update:model-value="(c: string | null) => changeColor(cal, c)"
          />
          <el-button size="small" @click="startRename(cal)">改名</el-button>
          <el-button size="small" type="danger" plain @click="removeCal(cal)">删除</el-button>
        </template>
      </div>
      <div v-if="!sorted.length" class="cal-mgr__empty">
        还没有日历,请在上方添加第一个日历分类。
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.cal-mgr__add {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--wa-brand-soft);
  border-radius: 8px;
  margin-bottom: 12px;
}

.cal-mgr__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
  overflow-y: auto;
}

.cal-mgr__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border: 1px solid var(--wa-border);
  border-radius: 8px;
}

.cal-mgr__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.cal-mgr__name {
  flex: 1;
  font-size: 14px;
  color: var(--wa-ink);
  font-weight: 500;
}

.cal-mgr__kind {
  font-size: 12px;
  color: var(--wa-text-muted);
  background: var(--wa-border);
  padding: 1px 8px;
  border-radius: 999px;
}

.cal-mgr__count {
  font-size: 12px;
  color: var(--wa-text-muted);
}

.cal-mgr__empty {
  text-align: center;
  color: var(--wa-text-muted);
  font-size: 13px;
  padding: 24px 0;
}
</style>
