<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElNotification } from 'element-plus'
import type { DbStatus } from '@shared/types'
import { DB_ACTIONS } from '@shared/types'
import { db } from '@/api/db'
import {
  UI_SCALE_OPTIONS,
  applyUiZoom,
  normalizeUiZoom,
  uiScalePercent
} from '@/utils/ui-scale'

const appVersion = ref('')
const dbStatus = ref<DbStatus | null>(null)
const dbError = ref('')

// 提醒设置(板块 06):修改即保存,主进程联动重算提醒行
const meetingMins = ref('15')
const dailyTime = ref('09:00')
const testing = ref(false)

// 显示设置(字体大小,整体缩放):修改即保存并立即应用
const activeZoom = ref(1)

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
    activeZoom.value = normalizeUiZoom(await db.settings.get('ui_zoom', '1'))
  } catch {
    // 设置读取失败时保留默认值
  }
})

async function saveUiZoom(zoom: number): Promise<void> {
  try {
    await db.settings.set('ui_zoom', String(zoom))
    activeZoom.value = zoom
    applyUiZoom(zoom)
    ElMessage.success(`字体大小已设为「${UI_SCALE_OPTIONS.find((o) => o.zoom === zoom)?.label ?? zoom}」`)
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '保存失败')
  }
}

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
      if (res.system) {
        ElMessage({
          message:
            '已发送系统通知与应用内通知。若没有看到系统弹窗,请检查 Windows「专注助手/勿扰」或该应用的通知设置。',
          type: 'info',
          duration: 6000
        })
      } else {
        ElMessage.warning('当前系统不支持通知,已弹出应用内提示')
      }
    } else {
      ElMessage.warning(res.error ?? '通知发送失败')
    }
  } finally {
    testing.value = false
  }
}

async function openNotificationSettings(): Promise<void> {
  const res = await window.api.shell.openNotificationSettings()
  if (!res.ok) ElMessage.warning(res.error ?? '无法打开系统通知设置')
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
        <div class="settings-actions">
          <el-button size="small" :loading="testing" @click="testNotification">
            发送测试通知
          </el-button>
          <el-button size="small" link @click="openNotificationSettings">
            打开 Windows 通知设置
          </el-button>
        </div>
      </div>
      <div class="settings-hint">
        单个会议可在编辑器中单独指定提前量;未单独指定的会议按上方设置提醒。事项的截止提醒只在编辑事项时单独开启。
        <br />
        若点「发送测试通知」看不到系统弹窗:Windows 11 可能开启了「专注助手/勿扰」,或把系统通知设为「仅通知中心」——
        此时应用内仍会弹出通知,提醒不会丢失;可点上方「打开 Windows 通知设置」检查。
      </div>
    </el-card>

    <el-card shadow="never" class="settings-card">
      <template #header>显示设置</template>
      <div class="settings-row">
        <span class="settings-label">字体大小</span>
        <div class="ui-scale-options" role="radiogroup" aria-label="字体大小">
          <button
            v-for="o in UI_SCALE_OPTIONS"
            :key="o.key"
            class="ui-scale-opt"
            :class="{ 'is-active': activeZoom === o.zoom }"
            :title="`${o.label} (${uiScalePercent(o.zoom)}%)`"
            @click="saveUiZoom(o.zoom)"
          >
            {{ o.label }} <span class="ui-scale-opt__pct">{{ uiScalePercent(o.zoom) }}%</span>
          </button>
        </div>
      </div>
      <div class="settings-hint">
        字体与界面按比例同步缩放(整体缩放),点击后立即生效并自动保存,重启应用保持。窗口过小时各板块会自动重排,不会重叠。
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

.settings-actions {
  display: flex;
  align-items: center;
  gap: 10px;
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

.ui-scale-options {
  display: flex;
  gap: 6px;
}

.ui-scale-opt {
  height: 30px;
  padding: 0 14px;
  border: 1px solid var(--wa-border);
  border-radius: 6px;
  background: #fff;
  color: var(--wa-text);
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
}

.ui-scale-opt:hover {
  background: var(--wa-brand-soft);
  border-color: var(--wa-brand-text);
}

.ui-scale-opt.is-active {
  background: var(--wa-brand-soft);
  border-color: var(--wa-brand-text);
  color: var(--wa-brand-text);
  font-weight: 600;
}

.ui-scale-opt__pct {
  font-size: 11px;
  color: var(--wa-text-muted);
}

.ui-scale-opt.is-active .ui-scale-opt__pct {
  color: var(--wa-brand-text);
}
</style>
