<script setup lang="ts">
/**
 * 会议提醒设置(PRD 4.5):会前 N 分钟弹窗提醒 + 每日会议清单推送时间。
 * 写入 settings 表(meeting_reminder_minutes / daily_push_time),
 * 到点通知由板块 06 基础提醒系统消费。
 */
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { db } from '@/api/db'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved'): void
}>()

const minutes = ref(15)
const pushTime = ref('09:00')
const saving = ref(false)

async function load(): Promise<void> {
  try {
    const [m, t] = await Promise.all([
      db.settings.get('meeting_reminder_minutes', '15'),
      db.settings.get('daily_push_time', '09:00')
    ])
    minutes.value = Number(m) || 15
    pushTime.value = t || '09:00'
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '读取设置失败')
  }
}

onMounted(load)

async function save(): Promise<void> {
  saving.value = true
  try {
    await Promise.all([
      db.settings.set('meeting_reminder_minutes', String(minutes.value)),
      db.settings.set('daily_push_time', pushTime.value)
    ])
    ElMessage.success('提醒设置已保存')
    emit('update:modelValue', false)
    emit('saved')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="🔔 提醒设置"
    width="420px"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-form label-width="140px" @submit.prevent>
      <el-form-item label="会前弹窗提醒">
        <el-select v-model="minutes" style="width: 100%">
          <el-option label="提前 5 分钟" :value="5" />
          <el-option label="提前 10 分钟" :value="10" />
          <el-option label="提前 15 分钟" :value="15" />
          <el-option label="提前 30 分钟" :value="30" />
          <el-option label="提前 1 小时" :value="60" />
          <el-option label="不提醒" :value="0" />
        </el-select>
      </el-form-item>
      <el-form-item label="每日会议清单推送">
        <el-time-select
          v-model="pushTime"
          start="06:00"
          step="00:30"
          end="12:00"
          placeholder="选择推送时间"
          style="width: 100%"
        />
      </el-form-item>
    </el-form>
    <p class="remind-tip">
      💡 通知由「提醒中心」统一弹出(板块 06 生效);本页仅设置提醒时机。
    </p>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.remind-tip {
  font-size: 12px;
  color: var(--wa-text-muted);
  margin: 0;
}
</style>
