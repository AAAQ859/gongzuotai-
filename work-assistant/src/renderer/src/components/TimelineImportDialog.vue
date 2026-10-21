<script setup lang="ts">
/**
 * 时间轴节点批量导入(板块 07,PRD 4.3「📥 导入文件」):Excel(.xlsx)优先、CSV 兼容。
 * 主进程统一读取(与联络导入同一条 IPC 链路),语义解析走 utils/timeline.parseTimelineRows。
 * 列(有表头自动识别,中英文均可;无表头按固定列序):
 *   日期(必填,支持 YYYY-MM-DD / M-D / M月D日)· 标题(必填) · 描述 · 日历(按名匹配,无则新建) ·
 *   分类 · 开始时间(HH:mm) · 结束时间 · 对接人(按姓名匹配已有联系人)
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { Calendar, Contact } from '@shared/types'
import { db } from '@/api/db'
import { parseCsvLine } from '@/utils/contacts'
import { parseTimelineRows, type TimelineImportRow } from '@/utils/timeline'

const props = defineProps<{
  modelValue: boolean
  calendars: Calendar[]
  contacts: Contact[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved'): void
}>()

const fileName = ref('')
const rows = ref<TimelineImportRow[]>([])
const errors = ref<string[]>([])
const importing = ref(false)
const importingText = ref('')

const preview = computed(() => rows.value.slice(0, 8))

const NEW_COLOR_PALETTE = ['#12B886', '#339AF0', '#FF922B', '#9775FA', '#F06595', '#51CF66', '#F59F00', '#22B8CF']

function nextColor(): string {
  return NEW_COLOR_PALETTE[props.calendars.filter((c) => c.kind === 'schedule').length % NEW_COLOR_PALETTE.length]
}

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      fileName.value = ''
      rows.value = []
      errors.value = []
    }
  }
)

async function pickFile(): Promise<void> {
  try {
    const picked = await window.api.shell.pickImportFile()
    if (!picked) return
    const res = await window.api.shell.readImportFile(picked.path)
    const grid: string[][] =
      res.kind === 'xlsx' ? (res.raw as string[][]) : (res.raw as string).split(/\r?\n/).map(parseCsvLine)
    const parsed = parseTimelineRows(grid, new Date())
    fileName.value = picked.name
    rows.value = parsed.rows
    errors.value = parsed.errors
    if (!parsed.rows.length) {
      ElMessage.warning(parsed.errors.length ? parsed.errors[0] : '文件中没有可导入的节点')
    }
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '读取文件失败')
  }
}

async function doImport(): Promise<void> {
  if (!rows.value.length) return
  importing.value = true
  try {
    // 按名匹配日历(无则新建)与对接人(仅匹配已有联系人,不自动新建)
    const calIdByName = new Map(props.calendars.map((c) => [c.name, c.id]))
    const contactIdByName = new Map(props.contacts.map((c) => [c.name, c.id]))
    let created = 0
    for (const row of rows.value) {
      importingText.value = `正在导入 ${created + 1}/${rows.value.length}:${row.title}`
      let calendarId: number | null = null
      if (row.calendar) {
        const found = calIdByName.get(row.calendar)
        if (found != null) {
          calendarId = found
        } else {
          const cal = await db.calendars.create({ name: row.calendar, kind: 'schedule', color: nextColor() })
          calIdByName.set(row.calendar, cal.id)
          calendarId = cal.id
        }
      }
      await db.events.create({
        kind: 'task',
        title: row.title,
        description: row.description || undefined,
        calendar_id: calendarId,
        category: row.category || undefined,
        start_time: row.start,
        end_time: row.end,
        contact_id: row.contact ? (contactIdByName.get(row.contact) ?? null) : null,
        // 有截止时间的导入节点默认截止前 30 分钟提醒(与编辑器默认一致)
        reminder_enabled: row.end ? 1 : 0,
        reminder_minutes: row.end ? 30 : null
      })
      created++
    }
    ElMessage.success(`已导入 ${created} 个工作节点${errors.value.length ? `,跳过/忽略 ${errors.value.length} 项` : ''}`)
    emit('update:modelValue', false)
    emit('saved')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '导入失败')
  } finally {
    importing.value = false
    importingText.value = ''
  }
}

function timeCell(r: TimelineImportRow, key: 'start' | 'end'): string {
  return r[key] ? (r[key] as string).slice(11) : ''
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="📥 导入工作节点"
    width="720px"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="imp-block">
      <div class="imp-row">
        <el-button @click="pickFile">选择 Excel/CSV 文件</el-button>
        <span v-if="fileName" class="imp-file">{{ fileName }}</span>
      </div>
      <div class="imp-tip">
        支持 Excel(.xlsx)与 CSV:读取第一个工作表;列:日期(必填)、标题(必填)、描述、日历、分类、开始时间、结束时间、对接人(中英文表头均可,无表头按此列序);缺日期/标题的行自动跳过。
      </div>
    </div>

    <div v-if="errors.length" class="imp-errors">
      <div class="imp-errors__title">⚠️ 提示({{ errors.length }} 条)</div>
      <div v-for="(e, i) in errors.slice(0, 6)" :key="i" class="imp-errors__item">{{ e }}</div>
      <div v-if="errors.length > 6" class="imp-errors__item">…共 {{ errors.length }} 条提示</div>
    </div>

    <div v-if="preview.length" class="imp-preview">
      <div class="imp-preview__title">预览(前 {{ Math.min(8, rows.length) }} 行,共 {{ rows.length }} 行)</div>
      <el-table :data="preview" size="small" max-height="260">
        <el-table-column prop="date" label="日期" width="90" />
        <el-table-column prop="title" label="标题" min-width="140" show-overflow-tooltip />
        <el-table-column label="时间" width="100">
          <template #default="{ row }">
            {{ timeCell(row, 'start') }}<template v-if="row.end"> - {{ timeCell(row, 'end') }}</template>
          </template>
        </el-table-column>
        <el-table-column prop="calendar" label="日历" width="90" />
        <el-table-column prop="category" label="分类" width="70" />
        <el-table-column prop="contact" label="对接人" width="80" />
      </el-table>
    </div>

    <template #footer>
      <span v-if="importing" class="imp-progress">{{ importingText }}</span>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="importing" :disabled="!rows.length" @click="doImport">
        导入 {{ rows.length ? `(${rows.length})` : '' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.imp-block {
  margin-bottom: 8px;
}

.imp-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.imp-file {
  font-size: 13px;
  color: var(--wa-text);
}

.imp-tip {
  font-size: 12px;
  color: var(--wa-text-muted);
  margin-top: 8px;
  line-height: 1.6;
}

.imp-errors {
  background: #FFF9DB;
  border: 1px solid #FFE8A3;
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 10px;
}

.imp-errors__title {
  font-size: 12px;
  font-weight: 600;
  color: #E67700;
  margin-bottom: 4px;
}

.imp-errors__item {
  font-size: 12px;
  color: #E67700;
  line-height: 1.7;
}

.imp-preview__title {
  font-size: 12px;
  color: var(--wa-text-muted);
  margin-bottom: 6px;
}

.imp-progress {
  float: left;
  font-size: 12px;
  color: var(--wa-text-muted);
  line-height: 32px;
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
