<script setup lang="ts">
defineProps<{
  emoji: string
  title: string
  desc: string
  board: string
}>()
</script>

<template>
  <div class="placeholder-view">
    <el-card shadow="never" class="placeholder-card">
      <div class="placeholder-emoji">{{ emoji }}</div>
      <div class="placeholder-title">{{ title }}</div>
      <div class="placeholder-desc">{{ desc }}</div>
      <el-tag type="success" effect="light" round>{{ board }}</el-tag>
    </el-card>
  </div>
</template>

<style scoped>
.placeholder-view {
  display: flex;
  justify-content: center;
  padding-top: 60px;
}

.placeholder-card {
  width: 520px;
  text-align: center;
  padding: 24px 0;
}

.placeholder-emoji {
  font-size: 48px;
  margin-bottom: 12px;
}

.placeholder-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--wa-text);
  margin-bottom: 8px;
}

.placeholder-desc {
  font-size: 13px;
  color: var(--wa-text-muted);
  line-height: 1.7;
  margin-bottom: 16px;
}
</style>
