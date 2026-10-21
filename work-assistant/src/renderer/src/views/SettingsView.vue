<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { DbStatus } from '@shared/types'
import { DB_ACTIONS } from '@shared/types'
import { db } from '@/api/db'

const appVersion = ref('')
const dbStatus = ref<DbStatus | null>(null)
const dbError = ref('')

// 提醒设置(板块 06):修改即保存,主进程联动重算提醒行
const meetingMins = ref('15')
const dailyTime = ref('09:00')
const testing = ref(false)

onMounted(async () => {
  try {
    appVersion.value = await window.api.appVersion()
  } catch {
    appVersion.value = '未知'
  }
  const res = await window.api.db.invoke<DbStatus>(DB_ACTIONS.dbStatus)
  if (res.ok && res.data) {
    dbStatus.value = res.data
  } else {
    dbError.value = res.error ?? '无法读取数据库状态'
  }
  try {
    meetingMins.value = await db.settings.get('meeting_reminder_minutes', '15')
    dailyTime.value = await db.settings.get('daily_push_time', '09:00')
  } catch {
    // 设置读取失败时保留默认值
  }
})

async function saveMeetingMins(): Promise<void> {
  try {
    await db.settings.set('meeting_reminder_minutes', meetingMins.value)
    ElMessage.success('已保存,会议提醒已按新设置重新排期')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '保存失败')
  }
}

async function saveDailyTime(): Promise<void> {
  try {
    await db.settings.set('daily_push_time', dailyTime.value)
    ElMessage.success('已保存,晨间推送时间已更新')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '保存失败')
  }
}

async function testNotification(): Promise<void> {
  testing.value = true
  try {
    const res = await window.api.shell.testNotification()
    if (res.ok) {
      ElMessage.success('测试通知已弹出,请留意屏幕右下角')
    } else {
      ElMessage.warning(res.error ?? '当前系统不支持通知')
    }
  } finally {
    testing.value = false
  }
}
</script>

<template>
  <div class="settings-page">
    <el-card shadow="never" class="settings-card">
      <template #header>数据存储</template>
      <div v-if="dbStatus" class="settings-block">
        <div class="settings-row">
          <span class="settings-label">数据库文件</span>
          <span class="settings-mono">{{ dbStatus.path }}</span>
        </div>
        <div class="settings-row">
          <span class="settings-label">结构版本</span>
          <span>v{{ dbStatus.schemaVersion }}</span>
        </div>
        <div class="settings-row">
          <span class="settings-label">日历分类</span>
          <span>{{ dbStatus.tables.calendars ?? 0 }} 个</span>
        </div>
        <div class="settings-row">
          <span class="settings-label">事项</span>
          <span>{{ dbStatus.tables.events ?? 0 }} 条</span>
        </div>
        <div class="settings-row">
          <span class="settings-label">联系人</span>
          <span>{{ dbStatus.tables.contacts ?? 0 }} 位</span>
        </div>
        <div class="settings-row">
          <span class="settings-label">文件板块</span>
          <span>{{ dbStatus.tables.file_boards ?? 0 }} 个</span>
        </div>
        <div class="settings-row">
          <span class="settings-label">提醒</span>
          <span>{{ dbStatus.tables.reminders ?? 0 }} 条</span>
        </div>
      </div>
      <el-alert v-else-if="dbError" type="error" :title="dbError" :closable="false" />
      <el-skeleton v-else :rows="5" />
    </el-card>

    <el-card shadow="never" class="settings-card">
      <template #header>提醒设置</template>
      <div class="settings-row">
        <span class="settings-label">会议提前提醒</span>
        <el-select v-model="meetingMins" style="width: 180px" @change="saveMeetingMins">
          <el-option label="提前 5 分钟" value="5" />
          <el-option label="提前 10 分钟" value="10" />
          <el-option label="提前 15 分钟" value="15" />
          <el-option label="提前 30 分钟" value="30" />
          <el-option label="提前 1 小时" value="60" />
          <el-option label="关闭会议提醒" value="0" />
        </el-select>
      </div>
      <div class="settings-row">
        <span class="settings-label">晨间推送时间</span>
        <el-time-select
          v-model="dailyTime"
          start="06:00"
          end="12:00"
          step="00:10"
          placeholder="选择推送时间"
          @change="saveDailyTime"
        />
      </div>
      <div class="settings-row">
        <span class="settings-label">系统通知</span>
        <el-button size="small" :loading="testing" @click="testNotification">
          发送测试通知
        </el-button>
      </div>
      <div class="settings-hint">
        单个会议可在编辑器中单独指定提前量;未单独指定的会议按上方设置提醒。事项的截止提醒只在编辑事项时单独开启。
      </div>
    </el-card>

    <el-card shadow="never" class="settings-card">
      <template #header>关于</template>
      <div class="settings-row">
        <span class="settings-label">应用名称</span>
        <span>工作台助手 (Work Assistant)</span>
      </div>
      <div class="settings-row">
        <span class="settings-label">版本</span>
        <span>{{ appVersion }}</span>
      </div>
      <div class="settings-row">
        <span class="settings-label">运行模式</span>
        <el-tag type="success" effect="light" size="small">离线模式</el-tag>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.settings-card {
  max-width: 640px;
}

.settings-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px solid var(--wa-border);
  font-size: 13px;
}

.settings-row:last-child {
  border-bottom: none;
}

.settings-label {
  color: var(--wa-text-muted);
  flex-shrink: 0;
}

.settings-mono {
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
  word-break: break-all;
  text-align: right;
}

.settings-hint {
  font-size: 12px;
  color: var(--wa-text-muted);
  padding-top: 4px;
}
</style>
