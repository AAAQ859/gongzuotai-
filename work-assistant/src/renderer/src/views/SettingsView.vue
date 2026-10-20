<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { DbStatus } from '@shared/types'
import { DB_ACTIONS } from '@shared/types'

const appVersion = ref('')
const dbStatus = ref<DbStatus | null>(null)
const dbError = ref('')

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
})
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
</style>
