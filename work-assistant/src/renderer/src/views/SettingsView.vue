<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { DbStatus } from '@shared/types'
import type { TrayStatus } from '@shared/tray'
import type { BackupRestoreResult } from '@shared/backup'
import { DB_ACTIONS } from '@shared/types'
import { countsSummary } from '@shared/backup'
import { formatSize } from '@shared/files'
import { db } from '@/api/db'
import {
  UI_SCALE_OPTIONS,
  applyUiZoom,
  normalizeUiZoom,
  uiScalePercent
} from '@/utils/ui-scale'
import type { MeetingDisplayMode } from '@shared/display'
import {
  loadMeetingDisplayMode,
  meetingDisplayMode,
  saveMeetingDisplayMode
} from '@/utils/meeting-display'

const appVersion = ref('')
const dbStatus = ref<DbStatus | null>(null)
const dbError = ref('')

// 提醒设置(板块 06):修改即保存,主进程联动重算提醒行
const meetingMins = ref('15')
const dailyTime = ref('09:00')
const testing = ref(false)

// 显示设置(字体大小,整体缩放):修改即保存并立即应用
const activeZoom = ref(1)

// 系统托盘与开机自启(板块 10)
const trayStatus = ref<TrayStatus | null>(null)
const closeToTray = ref(true)
const autoLaunch = ref(false)

// 数据备份与恢复(板块 10)
const backupDir = ref('')
const lastBackupAt = ref('')
const lastBackupPath = ref('')
const backingUp = ref(false)
const restoring = ref(false)

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
    await loadMeetingDisplayMode(true)
    lastBackupAt.value = await db.settings.get('last_backup_at', '')
    lastBackupPath.value = await db.settings.get('last_backup_path', '')
  } catch {
    // 设置读取失败时保留默认值
  }
  try {
    trayStatus.value = await window.api.system.trayStatus()
    closeToTray.value = trayStatus.value.closeToTray
    autoLaunch.value = trayStatus.value.autoLaunch
    backupDir.value = await window.api.backup.dir()
  } catch {
    // 托盘/备份信息读取失败时保留默认值
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

async function onMeetingDisplayModeChange(mode: MeetingDisplayMode): Promise<void> {
  try {
    await saveMeetingDisplayMode(mode)
    ElMessage.success(
      mode === 'text'
        ? '会议时间、地点、参会人已改为文字标签'
        : '会议时间、地点、参会人已改为图标前缀'
    )
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

// ---------- 系统托盘与开机自启(板块 10) ----------

async function saveCloseToTray(): Promise<void> {
  try {
    trayStatus.value = await window.api.system.setCloseToTray(closeToTray.value)
    closeToTray.value = trayStatus.value.closeToTray
    ElMessage.success(
      closeToTray.value ? '已开启:关闭窗口时隐藏到系统托盘' : '已关闭:关闭窗口将退出应用'
    )
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '保存失败')
  }
}

async function saveAutoLaunch(): Promise<void> {
  try {
    trayStatus.value = await window.api.system.setAutoLaunch(autoLaunch.value)
    autoLaunch.value = trayStatus.value.autoLaunch
    ElMessage.success(autoLaunch.value ? '已设置开机自动启动' : '已取消开机自动启动')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '设置开机自启失败')
  }
}

// ---------- 数据备份与恢复(板块 10) ----------

async function openBackupDir(): Promise<void> {
  const res = await window.api.backup.openDir()
  if (!res.ok) ElMessage.warning(res.error ?? '无法打开备份文件夹')
}

async function doBackup(): Promise<void> {
  if (backingUp.value) return
  backingUp.value = true
  try {
    const res = await window.api.backup.create()
    if (!res) return // 用户取消保存对话框
    lastBackupAt.value = res.manifest.createdAt
    lastBackupPath.value = res.path
    try {
      await db.settings.set('last_backup_at', res.manifest.createdAt)
      await db.settings.set('last_backup_path', res.path)
    } catch {
      // 备份已成功,仅记录失败,不影响结果
    }
    ElMessage({
      message: `备份完成(${formatSize(res.size)}):${res.path}`,
      type: 'success',
      duration: 8000
    })
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '备份失败')
  } finally {
    backingUp.value = false
  }
}

async function doRestore(): Promise<void> {
  if (restoring.value) return
  try {
    await ElMessageBox.confirm(
      '恢复会用备份包中的数据覆盖当前的日程、会议、联系人、文件板块索引、纲要草稿与设置。' +
        '文件板块中的本地文件不会被改动;恢复前会自动保存一份当前数据的安全副本。确定继续吗?',
      '恢复数据',
      { confirmButtonText: '选择备份包并恢复', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }

  restoring.value = true
  let res: BackupRestoreResult | null = null
  try {
    res = await window.api.backup.restore()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '恢复失败')
    return
  } finally {
    restoring.value = false
  }
  if (!res) return // 用户取消选择备份文件

  try {
    await ElMessageBox.alert(
      `已恢复到 ${res.manifest.createdAt} 的备份。\n\n恢复后数据:${countsSummary(res.counts)}\n\n` +
        `恢复前的数据已自动保存为安全副本:\n${res.safetyCopy}\n\n点击「重新载入」刷新界面。`,
      '恢复成功',
      {
        confirmButtonText: '重新载入',
        showCancelButton: false,
        customClass: 'backup-restore-alert'
      }
    )
  } catch {
    // 关闭提示框时也继续刷新
  }
  location.reload()
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
      <div class="settings-row">
        <span class="settings-label">会议信息显示</span>
        <el-radio-group
          v-model="meetingDisplayMode"
          size="small"
          @change="onMeetingDisplayModeChange"
        >
          <el-radio-button value="text">文字标签</el-radio-button>
          <el-radio-button value="icon">图标前缀</el-radio-button>
        </el-radio-group>
      </div>
      <div class="settings-hint">
        字体与界面按比例同步缩放(整体缩放),点击后立即生效并自动保存,重启应用保持。窗口过小时各板块会自动重排,不会重叠。
        <br />
        会议信息显示:文字标签使用「时间 / 地点 / 参会人」,图标前缀使用「🕘 / 📍 / 👥」;作用于今日/明日待办弹窗与会议日历。
      </div>
    </el-card>

    <el-card shadow="never" class="settings-card">
      <template #header>系统托盘与启动</template>
      <div class="settings-row">
        <span class="settings-label">关闭窗口时隐藏到托盘</span>
        <el-switch v-model="closeToTray" @change="saveCloseToTray" />
      </div>
      <div class="settings-row">
        <span class="settings-label">开机自动启动</span>
        <el-switch v-model="autoLaunch" @change="saveAutoLaunch" />
      </div>
      <div class="settings-row">
        <span class="settings-label">托盘状态</span>
        <el-tag :type="trayStatus?.active ? 'success' : 'info'" effect="light" size="small">
          {{ trayStatus?.active ? '运行中' : '未启用' }}
        </el-tag>
      </div>
      <div class="settings-row">
        <span class="settings-label">托盘菜单</span>
        <span>{{ (trayStatus?.menu ?? []).join(' · ') }}</span>
      </div>
      <div class="settings-hint">
        开启后点窗口右上角关闭不会退出应用,而是收起到任务栏右下角的托盘图标;单击托盘图标可重新打开,右键菜单可进入工作纲要、提醒中心或完全退出。
        开机自启在安装版中随 Windows 登录启动;开发模式注册的是当前开发启动方式,打包后自动切换为安装版路径。
      </div>
    </el-card>

    <el-card shadow="never" class="settings-card">
      <template #header>数据备份与恢复</template>
      <div class="settings-row">
        <span class="settings-label">默认备份位置</span>
        <span class="settings-mono">{{ backupDir || '读取中…' }}</span>
      </div>
      <div class="settings-row">
        <span class="settings-label">上次备份时间</span>
        <span>{{ lastBackupAt || '暂无备份' }}</span>
      </div>
      <div v-if="lastBackupPath" class="settings-row">
        <span class="settings-label">上次备份文件</span>
        <span class="settings-mono">{{ lastBackupPath }}</span>
      </div>
      <div class="settings-row">
        <span class="settings-label">备份操作</span>
        <div class="settings-actions">
          <el-button type="primary" size="small" :loading="backingUp" @click="doBackup">
            立即备份
          </el-button>
          <el-button size="small" :loading="restoring" @click="doRestore">从备份恢复</el-button>
          <el-button size="small" link @click="openBackupDir">打开备份文件夹</el-button>
        </div>
      </div>
      <div class="settings-hint">
        备份包含日程、会议、联系人、文件板块索引、纲要草稿与设置,保存为 ZIP 备份包;
        不包含文件板块中的实际文件,恢复后请确保这些文件仍在原位置。恢复前会自动保存当前数据的安全副本,恢复成功后界面自动刷新。
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

/* 恢复成功提示保留换行(数据摘要/安全副本路径分行显示) */
:global(.backup-restore-alert .el-message-box__message) {
  white-space: pre-line;
}
</style>
