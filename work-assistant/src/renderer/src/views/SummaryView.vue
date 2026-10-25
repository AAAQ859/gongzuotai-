<script setup lang="ts">
/**
 * 工作纲要导出(板块 09,PRD 4.7):
 * 按月/周/自定义区间自动归集已完成工作(例行/对接/会议/报告),
 * 支持编辑补充、保存草稿、模板设置,并导出 Word/Excel/PDF/纯文本。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Contact, WorkEvent } from '@shared/types'
import type {
  SummaryContent,
  SummaryDraft,
  SummaryExportPayload,
  SummaryFormat,
  SummaryItem,
  SummaryMode,
  SummarySection,
  SummaryTemplate
} from '@shared/summary'
import {
  SUMMARY_SECTIONS,
  addDaysStr,
  buildSummaryContent,
  cnNumber,
  customRange,
  emptySummaryContent,
  fmtDateStr,
  isLastWorkday,
  monthRange,
  normalizeSummaryContent,
  normalizeSummaryTemplate,
  nowText,
  parseSummaryTemplate,
  rangeLabel,
  rangeSpanText,
  rangeTitle,
  summaryStats,
  visibleSections,
  weekRange
} from '@shared/summary'
import { db } from '@/api/db'

const FORMATS: Array<{ format: SummaryFormat; icon: string; name: string; desc: string }> = [
  { format: 'docx', icon: '📄', name: 'Word 文档', desc: '.docx · 标准公文格式' },
  { format: 'xlsx', icon: '📊', name: 'Excel 表格', desc: '.xlsx · 纲要 + 明细' },
  { format: 'pdf', icon: '📕', name: 'PDF 文档', desc: '.pdf · 打印版式' },
  { format: 'txt', icon: '📝', name: '纯文本', desc: '.txt · 便于复制粘贴' }
]

const MODE_TABS: Array<{ key: SummaryMode; label: string }> = [
  { key: 'month', label: '按月汇总' },
  { key: 'week', label: '按周汇总' },
  { key: 'custom', label: '自定义区间' }
]

const today = fmtDateStr(new Date())
const todayMonth = today.slice(0, 7)
const monthStart = `${todayMonth}-01`

const mode = ref<SummaryMode>('month')
const monthValue = ref(todayMonth)
const weekAnchor = ref(today)
const customDates = ref<string[] | null>([monthStart, today])

const events = ref<WorkEvent[]>([])
const contacts = ref<Contact[]>([])
const content = ref<SummaryContent>(emptySummaryContent())
const draft = ref<SummaryDraft | null>(null)
const template = ref<SummaryTemplate>(normalizeSummaryTemplate(null))
const templateDraft = ref<SummaryTemplate>(normalizeSummaryTemplate(null))
const templateVisible = ref(false)

const loading = ref(true)
const editing = ref(false)
const exporting = ref<SummaryFormat | null>(null)
const lastExportPath = ref('')
const lastExportName = ref('')
const lastExportFormat = ref<SummaryFormat | null>(null)
let manualSeq = 0
let loadSeq = 0
let baseReady = false

const range = computed(() => {
  if (mode.value === 'month') return monthRange(monthValue.value)
  if (mode.value === 'week') return weekRange(weekAnchor.value)
  const [start, end] = customDates.value ?? [today, today]
  return customRange(start, end)
})

const rangeKey = computed(() => `${range.value.mode}:${range.value.key}`)
const title = computed(() => rangeTitle(range.value))
const periodText = computed(() => rangeSpanText(range.value))
const shortLabel = computed(() => rangeLabel(range.value))
const thisMonth = computed(() => mode.value === 'month' && range.value.key === todayMonth)
const monthEndHint = computed(() => isLastWorkday(today))

const stats = computed(() => summaryStats(events.value, range.value, nowText()))
const statCards = computed(() => [
  { key: 'completed', label: '完成工作项', value: stats.value.completed, unit: '项', icon: '✅', tone: 'green' },
  { key: 'meetings', label: '参加会议', value: stats.value.meetings, unit: '场', icon: '📅', tone: 'blue' },
  {
    key: 'meeting_notices',
    label: '会议通知',
    value: stats.value.meeting_notices,
    unit: '场',
    icon: '📨',
    tone: 'cyan'
  },
  { key: 'contacts', label: '对接事项', value: stats.value.contacts, unit: '项', icon: '🤝', tone: 'amber' },
  { key: 'reports', label: '输出报告', value: stats.value.reports, unit: '份', icon: '📄', tone: 'purple' }
])

const displaySections = computed(() => {
  const enabled = content.value.sections.filter((s) => template.value.sections.includes(s.key))
  return editing.value ? enabled : enabled.filter((s) => s.items.length > 0)
})
const templateSectionText = computed(() =>
  SUMMARY_SECTIONS.filter((s) => template.value.sections.includes(s.key))
    .map((s) => s.title)
    .join('、')
)

function nameOf(id: number): string | undefined {
  return contacts.value.find((c) => c.id === id)?.name
}

async function loadBase(): Promise<void> {
  const [evs, cts, rawTemplate] = await Promise.all([
    db.events.list(),
    db.contacts.list(),
    db.settings.get('summary_template', '')
  ])
  events.value = evs
  contacts.value = cts
  template.value = parseSummaryTemplate(rawTemplate)
}

async function loadSummary(): Promise<void> {
  const seq = ++loadSeq
  loading.value = true
  editing.value = false
  try {
    const d = await db.summaries.get(range.value.mode, range.value.key)
    if (seq !== loadSeq) return
    draft.value = d
    content.value = d
      ? normalizeSummaryContent(d.content)
      : buildSummaryContent(events.value, range.value, nowText(), nameOf)
  } catch (err) {
    if (seq === loadSeq) ElMessage.error(err instanceof Error ? err.message : '纲要加载失败')
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

watch(rangeKey, () => {
  if (baseReady) loadSummary()
})

onMounted(async () => {
  try {
    await loadBase()
    baseReady = true
    await loadSummary()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '数据加载失败')
    loading.value = false
  }
})

function setMode(next: SummaryMode): void {
  if (mode.value === next) return
  mode.value = next
  if (next === 'month') monthValue.value = todayMonth
  if (next === 'week') weekAnchor.value = today
  if (next === 'custom') customDates.value = [monthStart, today]
}

function shiftMonth(delta: number): void {
  const [y, m] = monthValue.value.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  monthValue.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function shiftWeek(delta: number): void {
  weekAnchor.value = addDaysStr(weekAnchor.value, delta * 7)
}

function goCurrent(): void {
  if (mode.value === 'month') monthValue.value = todayMonth
  else if (mode.value === 'week') weekAnchor.value = today
  else customDates.value = [monthStart, today]
}

function startEdit(): void {
  editing.value = true
  if (!displaySections.value.length) {
    ElMessage.info('本期暂无自动归集事项,可在下方章节中手动补充')
  }
}

function cancelEdit(): void {
  loadSummary()
}

function defaultItemDate(): string {
  return today >= range.value.start && today <= range.value.end ? today : range.value.end
}

function addItem(section: SummarySection): void {
  const item: SummaryItem = {
    id: `manual-${Date.now()}-${manualSeq++}`,
    title: '',
    description: '',
    date: defaultItemDate(),
    source: 'manual'
  }
  section.items.push(item)
}

function removeItem(section: SummarySection, index: number): void {
  section.items.splice(index, 1)
}

function cleanContent(next: SummaryContent): SummaryContent {
  return normalizeSummaryContent({
    sections: next.sections.map((s) => ({
      ...s,
      items: s.items.map((it) => ({
        ...it,
        title: it.title.trim(),
        description: it.description.trim()
      }))
    })),
    note: next.note.trim()
  })
}

async function saveDraft(): Promise<void> {
  if (content.value.sections.some((s) => s.items.some((it) => !it.title.trim()))) {
    ElMessage.warning('请填写所有事项标题,或删除空白事项')
    return
  }
  try {
    const next = cleanContent(content.value)
    const saved = await db.summaries.save({
      period_type: range.value.mode,
      period_key: range.value.key,
      title: title.value,
      range_start: range.value.start,
      range_end: range.value.end,
      content: next
    })
    draft.value = saved
    content.value = normalizeSummaryContent(saved.content)
    editing.value = false
    ElMessage.success('纲要草稿已保存')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '保存失败')
  }
}

async function regenerate(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '重新生成将覆盖已保存的纲要草稿(含手动补充内容),确定继续吗?',
      '重新生成',
      { type: 'warning', confirmButtonText: '重新生成', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  try {
    const generated = buildSummaryContent(events.value, range.value, nowText(), nameOf)
    const saved = await db.summaries.save({
      period_type: range.value.mode,
      period_key: range.value.key,
      title: title.value,
      range_start: range.value.start,
      range_end: range.value.end,
      content: generated
    })
    draft.value = saved
    content.value = normalizeSummaryContent(saved.content)
    editing.value = false
    ElMessage.success('已按当前数据重新生成')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '重新生成失败')
  }
}

async function clearDraft(): Promise<void> {
  try {
    await ElMessageBox.confirm('恢复自动生成将删除已保存的纲要草稿,确定继续吗?', '恢复自动生成', {
      type: 'warning',
      confirmButtonText: '恢复',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }
  try {
    await db.summaries.remove(range.value.mode, range.value.key)
    draft.value = null
    editing.value = false
    content.value = buildSummaryContent(events.value, range.value, nowText(), nameOf)
    ElMessage.success('已恢复为自动生成')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '操作失败')
  }
}

function openTemplate(): void {
  templateDraft.value = normalizeSummaryTemplate(JSON.parse(JSON.stringify(template.value)))
  templateVisible.value = true
}

async function saveTemplate(): Promise<void> {
  if (!templateDraft.value.sections.length) {
    ElMessage.warning('至少保留一个纲要章节')
    return
  }
  try {
    const next = normalizeSummaryTemplate(templateDraft.value)
    await db.settings.set('summary_template', JSON.stringify(next))
    template.value = next
    templateVisible.value = false
    ElMessage.success('模板设置已保存')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '模板保存失败')
  }
}

function buildPayload(): SummaryExportPayload {
  return {
    title: title.value,
    rangeStart: range.value.start,
    rangeEnd: range.value.end,
    periodLabel: periodText.value,
    stats: stats.value,
    sections: visibleSections(content.value, template.value),
    note: content.value.note,
    template: template.value,
    generatedAt: nowText()
  }
}

async function exportAs(format: SummaryFormat): Promise<void> {
  if (editing.value) {
    ElMessage.warning('请先保存或取消编辑,再导出')
    return
  }
  if (exporting.value) return
  exporting.value = format
  try {
    // Vue 响应式 Proxy 无法通过 IPC 结构化克隆,先转为纯 JSON 对象
    const payload = JSON.parse(JSON.stringify(buildPayload())) as SummaryExportPayload
    const res = await window.api.summary.export(format, payload)
    if (res) {
      lastExportPath.value = res.path
      lastExportName.value = res.path.split(/[\\/]/).pop() ?? res.path
      lastExportFormat.value = res.format
      ElMessage.success(`已导出:${lastExportName.value}`)
    }
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '导出失败')
  } finally {
    exporting.value = null
  }
}

function shortDate(date: string): string {
  const parts = date.split('-')
  return parts.length === 3 ? `${Number(parts[1])}月${Number(parts[2])}日` : date
}

function formatOf(format: SummaryFormat): { icon: string; name: string } {
  const f = FORMATS.find((x) => x.format === format)
  return f ? { icon: f.icon, name: f.name } : { icon: '', name: format }
}
</script>

<template>
  <div class="sm-page">
    <div class="sm-head">
      <div>
        <div class="sm-head__title">📝 工作内容纲要</div>
        <div class="sm-head__sub">自动归集已完成工作,生成月/周纲要并一键导出</div>
      </div>
      <div class="sm-head__actions">
        <el-button @click="openTemplate">⚙️ 模板设置</el-button>
      </div>
    </div>

    <div class="sm-toolbar">
      <div class="sm-tabs">
        <button
          v-for="tab in MODE_TABS"
          :key="tab.key"
          class="sm-tab"
          :class="{ 'is-active': mode === tab.key }"
          @click="setMode(tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="sm-period">
        <template v-if="mode === 'month'">
          <button class="sm-arrow" title="上个月" @click="shiftMonth(-1)">‹</button>
          <el-date-picker
            v-model="monthValue"
            type="month"
            value-format="YYYY-MM"
            format="YYYY年M月"
            :clearable="false"
            size="small"
            class="sm-month-picker"
          />
          <button class="sm-arrow" title="下个月" @click="shiftMonth(1)">›</button>
        </template>
        <template v-else-if="mode === 'week'">
          <button class="sm-arrow" title="上一周" @click="shiftWeek(-1)">‹</button>
          <span class="sm-week-label">{{ shortLabel }}</span>
          <button class="sm-arrow" title="下一周" @click="shiftWeek(1)">›</button>
        </template>
        <template v-else>
          <el-date-picker
            v-model="customDates"
            type="daterange"
            value-format="YYYY-MM-DD"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            :clearable="false"
            size="small"
            class="sm-range-picker"
          />
        </template>
        <el-button v-if="!thisMonth || mode !== 'month'" size="small" text @click="goCurrent">
          回到今天
        </el-button>
      </div>

      <div class="sm-period-hint">{{ periodText }}</div>
    </div>

    <div v-if="monthEndHint" class="sm-month-end">
      <span>📌 今天是本月最后一个工作日,建议生成并导出月度工作纲要。</span>
      <el-button size="small" type="primary" plain @click="saveDraft">保存为草稿</el-button>
    </div>

    <div v-if="template.include_stats" class="sm-stats">
      <div v-for="card in statCards" :key="card.key" class="sm-stat" :class="`sm-stat--${card.tone}`">
        <div class="sm-stat__icon">{{ card.icon }}</div>
        <div class="sm-stat__body">
          <div class="sm-stat__value">{{ card.value }}<span>{{ card.unit }}</span></div>
          <div class="sm-stat__label">{{ card.label }}</div>
        </div>
      </div>
    </div>
    <div v-else class="sm-stats-off">统计卡片已在模板中关闭</div>

    <div class="sm-body">
      <main class="sm-paper">
        <div class="sm-paper__head">
          <div class="sm-paper__heading">
            <div class="sm-paper__title">{{ title }}</div>
            <div class="sm-paper__meta">
              {{ periodText }} · {{ draft ? '已保存草稿' : '自动生成' }}
              <span v-if="draft" class="sm-badge">草稿</span>
            </div>
          </div>
          <div class="sm-paper__actions">
            <template v-if="!editing">
              <el-button size="small" @click="startEdit">✏️ 编辑</el-button>
              <el-button v-if="draft" size="small" text @click="regenerate">↻ 重新生成</el-button>
            </template>
            <template v-else>
              <el-button size="small" type="primary" @click="saveDraft">💾 保存</el-button>
              <el-button size="small" @click="cancelEdit">取消</el-button>
            </template>
          </div>
        </div>

        <div v-if="loading" class="sm-loading">纲要生成中…</div>

        <div v-else-if="!displaySections.length" class="sm-empty">
          <div class="sm-empty__icon">📝</div>
          <div class="sm-empty__title">本期暂无已完成事项</div>
          <div class="sm-empty__hint">
            可切换周期查看,或在日程/会议/时间轴中将事项标记完成后回来;也可以直接手动补充。
          </div>
          <el-button type="primary" plain @click="startEdit">✏️ 手动补充</el-button>
        </div>

        <div v-else class="sm-sections">
          <section v-for="(section, si) in displaySections" :key="section.key" class="sm-section">
            <div class="sm-section__head">
              <span class="sm-section__num">{{ cnNumber(si + 1) }}、</span>
              <span class="sm-section__title">{{ section.title }}</span>
              <span class="sm-section__count">{{ section.items.length }} 项</span>
              <button v-if="editing" class="sm-add-item" @click="addItem(section)">+ 添加事项</button>
            </div>

            <div
              v-for="(item, ii) in section.items"
              :key="item.id"
              class="sm-item"
              :class="{ 'is-editing': editing }"
            >
              <template v-if="!editing">
                <span class="sm-item__idx">{{ String(ii + 1).padStart(2, '0') }}.</span>
                <div class="sm-item__body">
                  <div class="sm-item__title">
                    {{ item.title }}
                    <span v-if="item.source === 'manual'" class="sm-item__manual">手动</span>
                  </div>
                  <div v-if="item.description" class="sm-item__desc">{{ item.description }}</div>
                </div>
                <span class="sm-item__date">{{ shortDate(item.date) }}</span>
              </template>

              <template v-else>
                <div class="sm-edit__row">
                  <span class="sm-item__idx">{{ String(ii + 1).padStart(2, '0') }}.</span>
                  <el-date-picker
                    v-model="item.date"
                    type="date"
                    value-format="YYYY-MM-DD"
                    :clearable="false"
                    size="small"
                    class="sm-edit__date"
                  />
                  <el-input
                    v-model="item.title"
                    size="small"
                    placeholder="事项标题"
                    maxlength="80"
                    class="sm-edit__title"
                  />
                  <el-button link type="danger" size="small" @click="removeItem(section, ii)">
                    删除
                  </el-button>
                </div>
                <el-input
                  v-model="item.description"
                  type="textarea"
                  :rows="2"
                  size="small"
                  maxlength="500"
                  placeholder="工作内容(可留空)"
                  class="sm-edit__desc"
                />
              </template>
            </div>

            <div v-if="editing && !section.items.length" class="sm-section__empty">
              暂无事项,点「+ 添加事项」补充
            </div>
          </section>

          <div v-if="template.include_note" class="sm-note">
            <template v-if="!editing">
              <span class="sm-note__label">备注:</span>{{ content.note }}
            </template>
            <el-input
              v-else
              v-model="content.note"
              type="textarea"
              :rows="3"
              maxlength="500"
              placeholder="备注(可留空)"
            />
          </div>
        </div>
      </main>

      <aside class="sm-side">
        <div class="sm-card">
          <div class="sm-card__title">📤 导出选项</div>
          <div class="sm-card__hint">导出到「文档\工作台助手\工作纲要」</div>
          <button
            v-for="f in FORMATS"
            :key="f.format"
            class="sm-export"
            :class="{ 'is-busy': exporting === f.format }"
            :disabled="!!exporting"
            @click="exportAs(f.format)"
          >
            <span class="sm-export__icon">{{ f.icon }}</span>
            <span class="sm-export__body">
              <span class="sm-export__name">{{ f.name }}</span>
              <span class="sm-export__desc">{{ f.desc }}</span>
            </span>
            <span class="sm-export__arrow">{{ exporting === f.format ? '…' : '↗' }}</span>
          </button>
          <div v-if="lastExportPath" class="sm-last-export" :title="lastExportPath">
            <div class="sm-last-export__head">
              ✅ 最近导出 · {{ formatOf(lastExportFormat ?? 'txt').name }}
            </div>
            <div class="sm-last-export__name">{{ lastExportName }}</div>
            <div class="sm-last-export__path">{{ lastExportPath }}</div>
          </div>
        </div>

        <div class="sm-card">
          <div class="sm-card__title">⚙️ 当前模板</div>
          <div class="sm-template-line">
            <span>统计卡片</span><b>{{ template.include_stats ? '显示' : '隐藏' }}</b>
          </div>
          <div class="sm-template-line">
            <span>备注</span><b>{{ template.include_note ? '显示' : '隐藏' }}</b>
          </div>
          <div class="sm-template-line sm-template-line--block">
            <span>章节</span><b>{{ templateSectionText }}</b>
          </div>
          <el-button size="small" text @click="openTemplate">调整模板</el-button>
        </div>

        <div class="sm-card">
          <div class="sm-card__title">💾 草稿状态</div>
          <template v-if="draft">
            <div class="sm-draft-state">
              已保存 · {{ draft.updated_at.slice(0, 16) }}
            </div>
            <div class="sm-card__hint">导出时使用当前预览内容;修改后请先保存。</div>
            <div class="sm-card__actions">
              <el-button size="small" @click="saveDraft">保存当前</el-button>
              <el-button size="small" type="danger" text @click="clearDraft">恢复自动生成</el-button>
            </div>
          </template>
          <template v-else>
            <div class="sm-draft-state">当前为自动生成(未保存)</div>
            <div class="sm-card__hint">可先编辑并保存草稿,下次打开仍保留。</div>
            <el-button size="small" @click="saveDraft">保存为草稿</el-button>
          </template>
        </div>
      </aside>
    </div>

    <el-dialog v-model="templateVisible" title="模板设置" width="460px" :close-on-click-modal="false">
      <div class="sm-tpl-dialog">
        <div class="sm-tpl-group">
          <div class="sm-tpl-label">显示内容</div>
          <el-checkbox v-model="templateDraft.include_stats">
            统计卡片(完成工作项 / 参加会议 / 会议通知 / 对接事项 / 输出报告)
          </el-checkbox>
          <el-checkbox v-model="templateDraft.include_note">备注</el-checkbox>
        </div>
        <div class="sm-tpl-group">
          <div class="sm-tpl-label">纲要章节</div>
          <el-checkbox-group v-model="templateDraft.sections">
            <el-checkbox v-for="s in SUMMARY_SECTIONS" :key="s.key" :value="s.key">
              {{ s.icon }} {{ s.title }}
            </el-checkbox>
          </el-checkbox-group>
        </div>
        <div class="sm-tpl-hint">至少保留一个章节;模板同时作用于页面预览与导出文件。</div>
      </div>
      <template #footer>
        <el-button @click="templateVisible = false">取消</el-button>
        <el-button type="primary" @click="saveTemplate">保存模板</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.sm-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
}

.sm-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.sm-head__title {
  font-size: 18px;
  font-weight: 600;
  color: var(--wa-text);
}

.sm-head__sub {
  font-size: 12px;
  color: var(--wa-text-muted);
  margin-top: 3px;
}

.sm-head__actions {
  flex-shrink: 0;
}

.sm-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 8px 10px;
  background: #f8faf9;
  border: 1px solid var(--wa-border);
  border-radius: 8px;
  margin-bottom: 10px;
}

.sm-tabs {
  display: flex;
  background: #fff;
  border: 1px solid var(--wa-border);
  border-radius: 6px;
  overflow: hidden;
}

.sm-tab {
  border: none;
  background: transparent;
  padding: 5px 12px;
  font-size: 12.5px;
  color: var(--wa-text-muted);
  cursor: pointer;
  border-right: 1px solid var(--wa-border);
}

.sm-tab:last-child {
  border-right: none;
}

.sm-tab:hover {
  color: var(--wa-brand-text);
  background: var(--wa-brand-soft);
}

.sm-tab.is-active {
  background: var(--wa-brand);
  color: #fff;
}

.sm-period {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sm-arrow {
  width: 26px;
  height: 26px;
  border: 1px solid var(--wa-border);
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  color: var(--wa-text-secondary);
  font-size: 16px;
  line-height: 1;
}

.sm-arrow:hover {
  border-color: var(--wa-brand);
  color: var(--wa-brand-text);
  background: var(--wa-brand-soft);
}

.sm-month-picker {
  width: 128px;
}

.sm-range-picker {
  width: 238px;
}

.sm-week-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--wa-text);
  min-width: 210px;
  text-align: center;
}

.sm-period-hint {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--wa-text-muted);
}

.sm-month-end {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 12px;
  margin-bottom: 10px;
  border: 1px solid #ffd8a8;
  background: #fff9db;
  border-radius: 6px;
  font-size: 12px;
  color: #995c00;
}

.sm-stats {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.sm-stat {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--wa-border);
  border-radius: 8px;
  background: #fff;
}

.sm-stat__icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  flex-shrink: 0;
}

.sm-stat--green .sm-stat__icon {
  background: #ebfbee;
}

.sm-stat--blue .sm-stat__icon {
  background: #e7f5ff;
}

.sm-stat--amber .sm-stat__icon {
  background: #fff4e6;
}

.sm-stat--purple .sm-stat__icon {
  background: #f3f0ff;
}

.sm-stat--cyan .sm-stat__icon {
  background: #e3fafc;
}

.sm-stat__value {
  font-size: 20px;
  font-weight: 700;
  color: var(--wa-text);
  line-height: 1.1;
}

.sm-stat__value span {
  font-size: 11px;
  font-weight: 400;
  color: var(--wa-text-muted);
  margin-left: 2px;
}

.sm-stat__label {
  font-size: 11.5px;
  color: var(--wa-text-muted);
  margin-top: 3px;
}

.sm-stats-off {
  font-size: 11.5px;
  color: var(--wa-text-muted);
  padding: 6px 2px 10px;
}

.sm-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}

.sm-paper {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  background: #fff;
  border: 1px solid var(--wa-border);
  border-radius: 9px;
  padding: 20px 24px 26px;
  box-shadow: 0 1px 3px rgba(22, 42, 36, 0.04);
}

.sm-paper__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 2px solid #edf7f3;
  margin-bottom: 14px;
}

.sm-paper__heading {
  min-width: 0;
}

.sm-paper__title {
  font-size: 20px;
  font-weight: 700;
  color: #1a2b26;
  letter-spacing: 0.5px;
  line-height: 1.4;
}

.sm-paper__meta {
  font-size: 11.5px;
  color: var(--wa-text-muted);
  margin-top: 5px;
}

.sm-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 8px;
  background: #fff4e6;
  color: #b35c00;
  font-size: 10px;
  line-height: 16px;
}

.sm-paper__actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.sm-loading {
  padding: 60px 0;
  text-align: center;
  color: var(--wa-text-muted);
  font-size: 13px;
}

.sm-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 52px 20px;
  gap: 8px;
}

.sm-empty__icon {
  font-size: 42px;
  opacity: 0.65;
}

.sm-empty__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--wa-text-secondary);
}

.sm-empty__hint {
  font-size: 12px;
  color: var(--wa-text-muted);
  max-width: 360px;
  line-height: 1.7;
  margin-bottom: 6px;
}

.sm-sections {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sm-section__head {
  display: flex;
  align-items: center;
  gap: 3px;
  padding-bottom: 6px;
  border-bottom: 1px solid #f1f3f5;
  margin-bottom: 8px;
}

.sm-section__num,
.sm-section__title {
  font-size: 14.5px;
  font-weight: 700;
  color: #0b7a5a;
}

.sm-section__count {
  font-size: 10.5px;
  color: var(--wa-text-muted);
  background: #f1f3f5;
  border-radius: 8px;
  padding: 0 7px;
  line-height: 17px;
  margin-left: 6px;
}

.sm-add-item {
  margin-left: auto;
  border: 1px dashed #b2d9ca;
  background: #f4fbf8;
  color: var(--wa-brand-text);
  font-size: 11.5px;
  border-radius: 5px;
  padding: 2px 8px;
  cursor: pointer;
}

.sm-add-item:hover {
  background: var(--wa-brand-soft);
  border-color: var(--wa-brand);
}

.sm-item {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 5px 6px;
  border-radius: 5px;
  line-height: 1.7;
}

.sm-item:not(.is-editing):hover {
  background: #fafcfb;
}

.sm-item__idx {
  flex-shrink: 0;
  font-family: 'Consolas', monospace;
  font-size: 12px;
  color: #74b9a5;
  padding-top: 1px;
}

.sm-item__body {
  flex: 1;
  min-width: 0;
}

.sm-item__title {
  font-size: 13.5px;
  font-weight: 600;
  color: #2b3a35;
}

.sm-item__manual {
  font-size: 9.5px;
  font-weight: 400;
  color: #b35c00;
  background: #fff4e6;
  padding: 0 5px;
  border-radius: 7px;
  margin-left: 5px;
  line-height: 15px;
  display: inline-block;
}

.sm-item__desc {
  font-size: 12px;
  color: #6c757d;
  margin-top: 1px;
  white-space: pre-wrap;
  word-break: break-word;
}

.sm-item__date {
  flex-shrink: 0;
  font-size: 10.5px;
  color: #adb5bd;
  padding-top: 3px;
}

.sm-item.is-editing {
  display: block;
  padding: 8px;
  margin-bottom: 2px;
  background: #fafcfb;
  border: 1px solid #edf1ef;
}

.sm-edit__row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sm-edit__date {
  width: 136px;
  flex-shrink: 0;
}

.sm-edit__title {
  flex: 1;
  min-width: 0;
}

.sm-edit__desc {
  margin-top: 6px;
  padding-left: 24px;
}

.sm-section__empty {
  font-size: 11.5px;
  color: #adb5bd;
  padding: 8px 10px;
  border: 1px dashed #e9ecef;
  border-radius: 6px;
}

.sm-note {
  margin-top: 6px;
  padding: 10px 12px;
  border-radius: 6px;
  background: #f8faf9;
  border: 1px dashed #dee2e6;
  font-size: 11.5px;
  color: #6c757d;
  line-height: 1.7;
  white-space: pre-wrap;
}

.sm-note__label {
  font-weight: 600;
  color: #495057;
}

.sm-side {
  width: 226px;
  flex-shrink: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sm-card {
  border: 1px solid var(--wa-border);
  border-radius: 8px;
  padding: 12px;
  background: #fff;
}

.sm-card__title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--wa-text);
  margin-bottom: 6px;
}

.sm-card__hint {
  font-size: 10.5px;
  color: var(--wa-text-muted);
  line-height: 1.5;
  margin-bottom: 8px;
}

.sm-export {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  margin-bottom: 6px;
  border: 1px solid var(--wa-border);
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  text-align: left;
  transition:
    border-color 0.15s,
    background 0.15s;
}

.sm-export:hover:not(:disabled) {
  border-color: var(--wa-brand);
  background: var(--wa-brand-soft);
}

.sm-export:disabled {
  cursor: default;
  opacity: 0.65;
}

.sm-export.is-busy {
  border-color: var(--wa-brand);
  background: var(--wa-brand-soft);
}

.sm-export__icon {
  font-size: 17px;
  flex-shrink: 0;
}

.sm-export__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.sm-export__name {
  font-size: 12px;
  font-weight: 600;
  color: var(--wa-text);
}

.sm-export__desc {
  font-size: 9.5px;
  color: var(--wa-text-muted);
  margin-top: 1px;
}

.sm-export__arrow {
  color: #adb5bd;
  font-size: 12px;
  flex-shrink: 0;
}

.sm-last-export {
  margin-top: 8px;
  padding: 8px;
  border-radius: 6px;
  background: #ebfbee;
  color: #2b8a3e;
  font-size: 10.5px;
  line-height: 1.5;
  overflow: hidden;
}

.sm-last-export__head {
  font-weight: 600;
}

.sm-last-export__name {
  margin-top: 2px;
  font-family: 'Consolas', monospace;
  word-break: break-all;
}

.sm-last-export__path {
  margin-top: 2px;
  color: #69a37c;
  word-break: break-all;
  max-height: 45px;
  overflow: hidden;
}

.sm-template-line {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: var(--wa-text-muted);
  padding: 3px 0;
}

.sm-template-line b {
  color: var(--wa-text-secondary);
  font-weight: 500;
  text-align: right;
}

.sm-template-line--block {
  align-items: flex-start;
}

.sm-template-line--block b {
  max-width: 150px;
  line-height: 1.45;
}

.sm-draft-state {
  font-size: 11px;
  color: #2b8a3e;
  background: #ebfbee;
  border-radius: 5px;
  padding: 5px 7px;
  margin-bottom: 6px;
}

.sm-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.sm-tpl-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sm-tpl-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--wa-text-secondary);
  margin-bottom: 6px;
}

.sm-tpl-group :deep(.el-checkbox) {
  margin-right: 14px;
}

.sm-tpl-hint {
  font-size: 11px;
  color: var(--wa-text-muted);
  line-height: 1.6;
}

@media (max-width: 1200px) {
  .sm-side {
    width: 196px;
  }

  .sm-stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .sm-paper {
    padding: 16px 18px 22px;
  }

  .sm-period-hint {
    width: 100%;
    margin-left: 0;
  }

  .sm-stat {
    padding: 8px 9px;
    gap: 7px;
  }

  .sm-stat__icon {
    width: 28px;
    height: 28px;
    font-size: 14px;
  }

  .sm-stat__value {
    font-size: 17px;
  }
}

@media (max-width: 1050px) {
  .sm-side {
    width: 184px;
  }

  .sm-paper__title {
    font-size: 17px;
  }

  .sm-edit__date {
    width: 124px;
  }
}
</style>
