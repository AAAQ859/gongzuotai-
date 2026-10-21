<script setup lang="ts">
/**
 * 提醒中心(板块 06):集中查看全部提醒记录。
 * - 待触发:引擎已排期的提醒,可「忽略」;到期后弹出系统通知并转入已触发
 * - 已触发:历史弹出记录;截止提醒带对接人时可一键复制催办话术
 * - 已忽略:手动忽略的记录
 * 点击「查看」跳转对应功能页(与系统通知点击行为一致)。
 */
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { Reminder, ReminderStatus } from '@shared/types'
import router from '@/router'
import { db } from '@/api/db'
import { STATUS_META, TYPE_META, fmtCn, hasScript, scriptOf, statusLabel } from '@/utils/reminders'

const rows = ref<Reminder[]>([])
const tab = ref<ReminderStatus | 'all'>('pending')
const loading = ref(true)

async function load(): Promise<void> {
  loading.value = true
  try {
    rows.value = await db.reminders.listAll()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '提醒记录加载失败')
  } finally {
    loading.value = false
  }
}

const counts = computed(() => ({
  pending: rows.value.filter((r) => r.status === 'pending').length,
  fired: rows.value.filter((r) => r.status === 'fired').length,
  dismissed: rows.value.filter((r) => r.status === 'dismissed').length
}))

const filtered = computed(() =>
  tab.value === 'all' ? rows.value : rows.value.filter((r) => r.status === tab.value)
)

/** 时间展示:待触发 → 计划时刻;已触发/已忽略 → 实际处理时刻 */
function whenText(r: Reminder): string {
  if (r.status === 'pending') return `计划 ${fmtCn(r.remind_at)}`
  const t = r.fired_at?.slice(0, 16)
  if (!t) return '—'
  return r.status === 'dismissed' ? `忽略于 ${fmtCn(t)}` : `触发于 ${fmtCn(t)}`
}

async function dismiss(r: Reminder): Promise<void> {
  try {
    await db.reminders.dismiss(r.id)
    ElMessage.success('已忽略该提醒,到期不再弹出')
    await load()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '操作失败')
  }
}

async function copyScript(r: Reminder): Promise<void> {
  const text = scriptOf(r)
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('催办话术已复制,去微信粘贴发送')
  } catch {
    ElMessage.error('复制失败,请手动选择文本复制')
  }
}

function go(r: Reminder): void {
  router.push(TYPE_META[r.type].route)
}

onMounted(load)
</script>

<template>
  <div class="rem-page">
    <div class="rem-head">
      <div>
        <div class="rem-head__title">提醒中心</div>
        <div class="rem-head__desc">会前提醒 · 截止提醒 · 晨间推送 · 对接催办,集中查看与处理</div>
      </div>
      <el-button size="small" @click="load">
        <el-icon><Refresh /></el-icon>
        <span>刷新</span>
      </el-button>
    </div>

    <el-tabs v-model="tab" class="rem-tabs">
      <el-tab-pane :label="statusLabel('pending', counts.pending)" name="pending" />
      <el-tab-pane :label="statusLabel('fired', counts.fired)" name="fired" />
      <el-tab-pane :label="statusLabel('dismissed', counts.dismissed)" name="dismissed" />
      <el-tab-pane :label="`全部(${rows.length})`" name="all" />
    </el-tabs>

    <div v-if="loading" class="rem-empty">加载中…</div>
    <div v-else-if="!filtered.length" class="rem-empty">
      <div class="rem-empty__icon">🔕</div>
      <div class="rem-empty__text">{{ tab === 'pending' ? '暂无待触发的提醒' : '暂无记录' }}</div>
      <div class="rem-empty__hint">
        新建事项或会议并开启提醒后,将在到达提前量时通过系统通知弹出
      </div>
    </div>
    <div v-else class="rem-list">
      <div v-for="r in filtered" :key="r.id" class="rem-item">
        <div class="rem-item__icon">{{ TYPE_META[r.type].icon }}</div>
        <div class="rem-item__body">
          <div class="rem-item__meta">
            <span class="rem-item__type">{{ TYPE_META[r.type].label }}</span>
            <span class="rem-item__when">{{ whenText(r) }}</span>
            <el-tag size="small" effect="light" :class="STATUS_META[r.status].cls">
              {{ STATUS_META[r.status].label }}
            </el-tag>
          </div>
          <div class="rem-item__msg">{{ r.message }}</div>
        </div>
        <div class="rem-item__actions">
          <el-button v-if="hasScript(r)" size="small" type="primary" plain @click="copyScript(r)">
            复制话术
          </el-button>
          <el-button v-if="r.status === 'pending'" size="small" @click="dismiss(r)">忽略</el-button>
          <el-button size="small" text type="primary" @click="go(r)">查看 →</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rem-page {
  max-width: 860px;
}

.rem-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.rem-head__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--wa-text);
}

.rem-head__desc {
  font-size: 12px;
  color: var(--wa-text-muted);
  margin-top: 2px;
}

.rem-tabs {
  margin-bottom: 4px;
}

.rem-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rem-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--wa-border);
  border-radius: 8px;
  background: #fff;
}

.rem-item__icon {
  font-size: 20px;
  line-height: 1.4;
  flex-shrink: 0;
}

.rem-item__body {
  flex: 1;
  min-width: 0;
}

.rem-item__meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rem-item__type {
  font-size: 12px;
  font-weight: 600;
  color: var(--wa-brand-text);
}

.rem-item__when {
  font-size: 12px;
  color: var(--wa-text-muted);
}

.rem-item__msg {
  font-size: 13px;
  color: var(--wa-text);
  margin-top: 6px;
  word-break: break-all;
}

.rem-item__actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.rem-empty {
  text-align: center;
  color: var(--wa-text-muted);
  font-size: 13px;
  padding: 56px 0;
}

.rem-empty__icon {
  font-size: 32px;
  margin-bottom: 10px;
}

.rem-empty__text {
  font-size: 14px;
  color: var(--wa-text);
}

.rem-empty__hint {
  font-size: 12px;
  margin-top: 6px;
}

:deep(.el-tag.is-pending) {
  background: #fff3bf;
  color: #b8860b;
  border-color: #ffe08a;
}

:deep(.el-tag.is-fired) {
  background: #d3f9d8;
  color: #2b8a3e;
  border-color: #b2f2bb;
}

:deep(.el-tag.is-dismissed) {
  background: #f1f3f5;
  color: #868e96;
  border-color: #dee2e6;
}
</style>
