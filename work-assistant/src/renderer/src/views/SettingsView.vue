<script setup lang="ts">
import { onMounted, ref } from 'vue'

const appVersion = ref('')

onMounted(async () => {
  try {
    appVersion.value = await window.api.appVersion()
  } catch {
    appVersion.value = '未知'
  }
})
</script>

<template>
  <div>
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
      <div class="settings-row">
        <span class="settings-label">数据存储</span>
        <span>本地 SQLite + 本地文件夹(板块 01 实现)</span>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.settings-card {
  max-width: 520px;
}

.settings-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--wa-border);
  font-size: 13px;
}

.settings-row:last-child {
  border-bottom: none;
}

.settings-label {
  color: var(--wa-text-muted);
}
</style>
