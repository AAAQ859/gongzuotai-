<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import router from './router'

// 系统通知点击 → 主进程导航指令(提醒引擎发送 '#/meetings' 等路由)
onMounted(() => {
  window.api.onNavigate((route) => {
    router.push(route)
  })
})

const route = useRoute()

const navGroups = computed(() => [
  {
    key: 'main',
    label: '主要功能',
    items: router.options.routes.filter((r) => r.meta?.group === 'main')
  },
  {
    key: 'other',
    label: '其他',
    items: router.options.routes.filter((r) => r.meta?.group === 'other')
  }
])

const currentTitle = computed(() => route.meta?.title ?? '工作台助手')

const todayText = computed(() => {
  const d = new Date()
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · 周${week}`
})
</script>

<template>
  <el-container class="app-shell">
    <!-- 左侧导航 -->
    <el-aside width="220px" class="app-aside">
      <div class="app-brand">
        <div class="app-brand__logo">W</div>
        <div class="app-brand__name">工作台助手</div>
      </div>

      <el-menu :default-active="route.path" router class="app-nav">
        <template v-for="group in navGroups" :key="group.key">
          <el-menu-item-group :title="group.label">
            <el-menu-item v-for="item in group.items" :key="item.path" :index="item.path">
              <el-icon><component :is="item.meta!.icon" /></el-icon>
              <span>{{ item.meta!.title }}</span>
            </el-menu-item>
          </el-menu-item-group>
        </template>
      </el-menu>

      <div class="app-aside__footer">
        <div class="app-aside__avatar">我</div>
        <div class="app-aside__user">
          <div class="app-aside__username">我的工作台</div>
          <div class="app-aside__status">离线模式</div>
        </div>
      </div>
    </el-aside>

    <!-- 主内容区 -->
    <el-container class="app-main">
      <el-header height="64px" class="app-header">
        <div>
          <div class="app-header__title">{{ currentTitle }}</div>
          <div class="app-header__subtitle">{{ todayText }}</div>
        </div>
      </el-header>
      <el-main class="app-content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.app-shell {
  height: 100%;
}

.app-aside {
  background: var(--wa-bg-sidebar);
  border-right: 1px solid var(--wa-border);
  display: flex;
  flex-direction: column;
}

.app-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 16px;
  border-bottom: 1px solid var(--wa-border);
}

.app-brand__logo {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, #12b886, #228be6);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  flex-shrink: 0;
}

.app-brand__name {
  font-weight: 600;
  font-size: 14px;
  color: var(--wa-text);
}

.app-nav {
  flex: 1;
  border-right: none;
  background: transparent;
  padding: 6px 8px;
  overflow-y: auto;
}

.app-nav :deep(.el-menu-item-group__title) {
  font-size: 11px;
  color: #adb5bd;
  padding: 10px 10px 6px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.app-nav :deep(.el-menu-item) {
  height: 36px;
  line-height: 36px;
  border-radius: 6px;
  margin-bottom: 2px;
  color: #495057;
  font-size: 13px;
}

.app-nav :deep(.el-menu-item:hover) {
  background: var(--wa-border);
}

.app-nav :deep(.el-menu-item.is-active) {
  background: var(--wa-brand-soft);
  color: var(--wa-brand-text);
  font-weight: 500;
}

.app-aside__footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-top: 1px solid var(--wa-border);
}

.app-aside__avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #ced4da;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.app-aside__user {
  flex: 1;
  min-width: 0;
}

.app-aside__username {
  font-size: 12px;
  font-weight: 500;
  color: var(--wa-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-aside__status {
  font-size: 11px;
  color: var(--wa-success);
  display: flex;
  align-items: center;
  gap: 4px;
}

.app-aside__status::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--wa-success);
}

.app-main {
  background: #fff;
}

.app-header {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--wa-border);
}

.app-header__title {
  font-size: 18px;
  font-weight: 600;
  color: var(--wa-text);
}

.app-header__subtitle {
  font-size: 12px;
  color: var(--wa-text-muted);
  margin-top: 2px;
}

.app-content {
  padding: 20px 24px;
  overflow-y: auto;
  background: #fff;
}
</style>
