<script setup lang="ts">
/**
 * 板块 05 联络接口(PRD 4.6 通讯录):左侧分组列表 + 中部联系人/群组卡片 + 右侧详情面板。
 * 通讯录同时容纳个人联系人与微信群/钉钉群等群组记录(kind 区分),联系人可属于多个分组。
 * 智能联动:对接事项临近截止(本周内或已逾期)的联系人标红「待跟进」,顶部横幅提醒。
 * 拨号走系统 tel: 协议;微信复制微信号到剪贴板(用户确认的离线桌面行为)。
 */
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import type { Contact, ContactGroup, WorkEvent } from '@shared/types'
import { db } from '@/api/db'
import { initials } from '@/utils/dashboard'
import { eventState } from '@/utils/calendar'
import {
  deadlineLabel,
  filterContacts,
  followupOf,
  sortContacts,
  type ContactSortMode
} from '@/utils/contacts'
import ContactEditorDialog from '@/components/ContactEditorDialog.vue'
import GroupManageDialog from '@/components/GroupManageDialog.vue'
import ImportContactsDialog from '@/components/ImportContactsDialog.vue'

// ---------- 数据 ----------
const contacts = ref<Contact[]>([])
const groups = ref<ContactGroup[]>([])
const events = ref<WorkEvent[]>([])
const groupsOf = ref(new Map<number, number[]>())
const selected = ref<'all' | 'favorite' | number>('all')

async function load(): Promise<void> {
  try {
    const [cs, gs, evs, ms] = await Promise.all([
      db.contacts.list(),
      db.contactGroups.list(),
      db.events.list(),
      db.contacts.memberships()
    ])
    contacts.value = cs
    groups.value = gs
    events.value = evs
    const map = new Map<number, number[]>()
    for (const m of ms) {
      if (!map.has(m.contact_id)) map.set(m.contact_id, [])
      map.get(m.contact_id)!.push(m.group_id)
    }
    groupsOf.value = map
    // 当前选中项被删除时回落
    if (typeof selected.value === 'number' && !gs.some((g) => g.id === selected.value)) {
      selected.value = 'all'
    }
    if (selectedContact.value && !cs.some((c) => c.id === selectedContact.value?.id)) {
      selectedContact.value = null
    }
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '加载失败')
  }
}

onMounted(load)

// ---------- 待跟进联动 ----------
const followupIds = computed(() => {
  const ids = new Set<number>()
  for (const c of contacts.value) {
    if (followupOf(c, events.value).due) ids.add(c.id)
  }
  return ids
})

/** 横幅:按最近截止排序的待跟进联系人 */
const followups = computed(() =>
  contacts.value
    .filter((c) => followupIds.value.has(c.id))
    .map((c) => ({ contact: c, info: followupOf(c, events.value) }))
    .sort((a, b) =>
      (a.info.items[0]?.end_time ?? '').localeCompare(b.info.items[0]?.end_time ?? '')
    )
)

const bannerText = computed(() => {
  const first = followups.value[0]
  if (!first) return null
  const ev = first.info.items[0]
  const dept = first.contact.department ? `(${first.contact.department})` : ''
  const base = `${first.contact.name}${dept}的「${ev.title}」${deadlineLabel(ev.end_time!)}截止,请尽快联系`
  const more = followups.value.length > 1 ? `,另有 ${followups.value.length - 1} 位联系人待跟进` : ''
  return base + more
})

// ---------- 筛选与排序 ----------
const q = ref('')
const sortMode = ref<ContactSortMode>('name')
const kindFilter = ref<'all' | 'person' | 'group'>('all')
const onlyFollowup = ref(false)

const visibleContacts = computed(() => {
  const filtered = filterContacts(contacts.value, {
    groupId: typeof selected.value === 'number' ? selected.value : null,
    q: q.value,
    kind: kindFilter.value,
    onlyFavorite: selected.value === 'favorite',
    onlyFollowup: onlyFollowup.value,
    followupIds: followupIds.value,
    groupsOf: groupsOf.value
  })
  return sortContacts(filtered, sortMode.value, followupIds.value)
})

const groupCounts = computed(() => {
  const map = new Map<number, number>()
  for (const gids of groupsOf.value.values()) {
    for (const gid of gids) map.set(gid, (map.get(gid) ?? 0) + 1)
  }
  return map
})

function countLabel(gid: number): number {
  return groupCounts.value.get(gid) ?? 0
}

const currentLabel = computed(() => {
  if (selected.value === 'all') return '全部联系人'
  if (selected.value === 'favorite') return '⭐ 常用联系人'
  return groups.value.find((g) => g.id === selected.value)?.name ?? ''
})

const currentIcon = computed(() => {
  if (typeof selected.value !== 'number') return selected.value === 'favorite' ? '⭐' : '📇'
  return groups.value.find((g) => g.id === selected.value)?.icon ?? '📁'
})

const summaryText = computed(() => {
  const persons = visibleContacts.value.filter((c) => c.kind === 'person').length
  const grps = visibleContacts.value.filter((c) => c.kind === 'group').length
  return `共 ${visibleContacts.value.length} 位成员 · ${persons} 位联系人 · ${grps} 个群组`
})

// ---------- 拨号 / 微信(用户确认:拨号唤起系统 tel:,微信复制到剪贴板) ----------
async function dial(c: Contact): Promise<void> {
  if (!c.phone) {
    ElMessage.warning('该联系人未登记电话')
    return
  }
  const digits = c.phone.replace(/[^\d+]/g, '')
  const res = await window.api.shell.openExternal(`tel:${digits}`)
  if (!res.ok) {
    ElMessage.error('无法唤起电话拨号,请确认系统已安装电话软件')
  }
}

async function copyWechat(c: Contact): Promise<void> {
  const text = c.kind === 'group' ? c.name : c.wechat || c.name
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(c.kind === 'group' ? `群名「${text}」已复制,请在微信中搜索` : `微信号「${text}」已复制,请在微信中搜索`)
  } catch {
    ElMessage.info(`${text}`)
  }
}

// ---------- 详情面板 ----------
const selectedContact = ref<Contact | null>(null)

function openDetail(c: Contact): void {
  selectedContact.value = c
}

const relatedEvents = computed(() =>
  selectedContact.value
    ? events.value
        .filter((e) => e.contact_id === selectedContact.value?.id && e.kind === 'task')
        .sort((a, b) => (b.start_time ?? '').localeCompare(a.start_time ?? ''))
    : []
)

async function toggleFavorite(c: Contact): Promise<void> {
  try {
    await db.contacts.update(c.id, { is_favorite: c.is_favorite === 1 ? 0 : 1 })
    await load()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '操作失败')
  }
}

async function removeContact(c: Contact): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除「${c.name}」吗?关联的对接事项将变为未指定对接人,不影响事项本身。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
    await db.contacts.remove(c.id)
    selectedContact.value = null
    ElMessage.success('已删除')
    await load()
  } catch (err) {
    if (err === 'cancel' || err === 'close') return
    ElMessage.error(err instanceof Error ? err.message : '删除失败')
  }
}

// ---------- 弹窗 ----------
const editorVisible = ref(false)
const editorContact = ref<Contact | null>(null)
const groupManageVisible = ref(false)
const importVisible = ref(false)

function openCreate(): void {
  editorContact.value = null
  editorVisible.value = true
}

function openEdit(): void {
  editorContact.value = selectedContact.value
  editorVisible.value = true
}

function onSaved(): void {
  load()
}

function selectGroup(v: 'all' | 'favorite' | number): void {
  selected.value = v
  onlyFollowup.value = false
  selectedContact.value = null
}

function contactGroupsLabel(c: Contact): string {
  const gids = groupsOf.value.get(c.id) ?? []
  return gids.map((id) => groups.value.find((g) => g.id === id)?.name ?? '').filter(Boolean).join('、')
}
</script>

<template>
  <div class="ct-page">
    <!-- 左侧:分组列表 -->
    <aside class="ct-side">
      <div class="ct-side__head">
        <span class="ct-side__title">分组</span>
        <button class="ct-side__mini" title="管理分组" @click="groupManageVisible = true">➕</button>
      </div>
      <button
        class="ct-side__item"
        :class="{ 'is-active': selected === 'all' }"
        @click="selectGroup('all')"
      >
        <span class="ct-side__icon">📇</span>
        <span class="ct-side__name">全部联系人</span>
        <span class="ct-side__count">{{ contacts.length }}</span>
      </button>
      <button
        v-for="g in groups"
        :key="g.id"
        class="ct-side__item"
        :class="{ 'is-active': selected === g.id }"
        @click="selectGroup(g.id)"
      >
        <span class="ct-side__icon">{{ g.icon }}</span>
        <span class="ct-side__name">{{ g.name }}</span>
        <span class="ct-side__count">{{ countLabel(g.id) }}</span>
      </button>
      <button
        class="ct-side__item"
        :class="{ 'is-active': selected === 'favorite' }"
        @click="selectGroup('favorite')"
      >
        <span class="ct-side__icon">⭐</span>
        <span class="ct-side__name">常用联系人</span>
        <span class="ct-side__count">{{ contacts.filter((c) => c.is_favorite === 1).length }}</span>
      </button>

      <div class="ct-side__actions">
        <el-button @click="importVisible = true">📥 导入</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">联系人</el-button>
      </div>
    </aside>

    <!-- 中部:卡片列表 -->
    <div class="ct-main">
      <div class="ct-main__head">
        <span class="ct-main__title">{{ currentIcon }} {{ currentLabel }}</span>
        <span class="ct-main__summary">{{ summaryText }}</span>
        <el-input
          v-model="q"
          placeholder="🔍 搜索姓名/部门/电话/微信"
          clearable
          style="width: 220px"
        />
        <el-select v-model="sortMode" style="width: 120px">
          <el-option label="按姓名" value="name" />
          <el-option label="常用优先" value="favorite" />
          <el-option label="待跟进优先" value="followup" />
        </el-select>
        <el-select v-model="kindFilter" style="width: 110px">
          <el-option label="全部类型" value="all" />
          <el-option label="仅联系人" value="person" />
          <el-option label="仅群组" value="group" />
        </el-select>
      </div>

      <div v-if="bannerText" class="ct-banner" @click="onlyFollowup = !onlyFollowup">
        <span class="ct-banner__label">⏰ 待跟进提醒</span>
        <span class="ct-banner__text">{{ bannerText }}</span>
        <span class="ct-banner__action">{{ onlyFollowup ? '显示全部' : '只看待跟进' }}</span>
      </div>

      <div class="ct-list">
        <div
          v-for="c in visibleContacts"
          :key="c.id"
          class="ct-card"
          :class="{ 'is-selected': selectedContact?.id === c.id, 'is-group': c.kind === 'group' }"
          @click="openDetail(c)"
        >
          <span class="ct-card__avatar" :style="{ background: c.avatar_color }">
            {{ c.kind === 'group' ? '💬' : initials(c.name) }}
          </span>
          <span class="ct-card__body">
            <span class="ct-card__name">
              {{ c.name }}
              <span v-if="c.kind === 'group'" class="ct-card__tag ct-card__tag--group">群</span>
              <span v-if="followupIds.has(c.id)" class="ct-card__tag ct-card__tag--follow">待跟进</span>
              <span v-if="c.is_favorite === 1" class="ct-card__tag ct-card__tag--fav">⭐</span>
            </span>
            <span class="ct-card__dept">
              <template v-if="c.kind === 'person'">
                {{ [c.department, c.position].filter(Boolean).join(' · ') || '未填写部门' }}
              </template>
              <template v-else>
                {{ c.department || '群组' }} · {{ c.member_count ?? '?' }}人
              </template>
            </span>
            <span v-if="c.kind === 'group' && c.purpose" class="ct-card__purpose">📌 {{ c.purpose }}</span>
            <span v-if="c.kind === 'person' && c.phone" class="ct-card__phone">📱 {{ c.phone }}</span>
          </span>
          <span class="ct-card__actions" @click.stop>
            <template v-if="c.kind === 'person'">
              <button class="ct-card__btn" :disabled="!c.phone" @click="dial(c)">📞 拨号</button>
              <button class="ct-card__btn" @click="copyWechat(c)">💬 微信</button>
            </template>
            <template v-else>
              <button class="ct-card__btn" @click="copyWechat(c)">📱 打开微信</button>
            </template>
          </span>
        </div>
        <div v-if="!visibleContacts.length" class="ct-empty">
          当前筛选下没有联系人,点右上角「联系人」新建,或 📥 导入 CSV。
        </div>
      </div>
    </div>

    <!-- 右侧:详情面板 -->
    <aside class="ct-panel">
      <template v-if="selectedContact">
        <div class="ct-panel__head">
          <span class="ct-panel__avatar" :style="{ background: selectedContact.avatar_color }">
            {{ selectedContact.kind === 'group' ? '💬' : initials(selectedContact.name) }}
          </span>
          <div class="ct-panel__name">
            <div class="ct-panel__title">
              {{ selectedContact.name }}
              <span v-if="selectedContact.kind === 'group'" class="ct-card__tag ct-card__tag--group">群</span>
              <span v-if="followupIds.has(selectedContact.id)" class="ct-card__tag ct-card__tag--follow">待跟进</span>
            </div>
            <div class="ct-panel__dept">
              <template v-if="selectedContact.kind === 'person'">
                {{ [selectedContact.department, selectedContact.position].filter(Boolean).join(' · ') || '未填写部门' }}
              </template>
              <template v-else>
                {{ selectedContact.department || '群组' }} · {{ selectedContact.member_count ?? '?' }}人
              </template>
            </div>
          </div>
        </div>

        <div class="ct-panel__fields">
          <template v-if="selectedContact.kind === 'person'">
            <div v-if="selectedContact.phone" class="ct-panel__field">
              <span class="ct-panel__label">📱 电话</span>
              <span class="ct-panel__value">{{ selectedContact.phone }}</span>
              <button class="ct-card__btn" @click="dial(selectedContact)">📞 拨号</button>
            </div>
            <div v-if="selectedContact.wechat" class="ct-panel__field">
              <span class="ct-panel__label">💬 微信</span>
              <span class="ct-panel__value">{{ selectedContact.wechat }}</span>
              <button class="ct-card__btn" @click="copyWechat(selectedContact)">复制</button>
            </div>
            <div v-if="selectedContact.email" class="ct-panel__field">
              <span class="ct-panel__label">📧 邮箱</span>
              <span class="ct-panel__value">{{ selectedContact.email }}</span>
            </div>
          </template>
          <template v-else>
            <div v-if="selectedContact.purpose" class="ct-panel__field">
              <span class="ct-panel__label">📌 群用途</span>
              <span class="ct-panel__value">{{ selectedContact.purpose }}</span>
            </div>
          </template>
          <div v-if="contactGroupsLabel(selectedContact)" class="ct-panel__field">
            <span class="ct-panel__label">🏷️ 所属分组</span>
            <span class="ct-panel__value">{{ contactGroupsLabel(selectedContact) }}</span>
          </div>
          <div v-if="selectedContact.remark" class="ct-panel__field">
            <span class="ct-panel__label">📝 备注</span>
            <span class="ct-panel__value">{{ selectedContact.remark }}</span>
          </div>
        </div>

        <div class="ct-panel__section">
          <div class="ct-panel__section-title">关联对接事项({{ relatedEvents.length }})</div>
          <div v-for="ev in relatedEvents.slice(0, 6)" :key="ev.id" class="ct-panel__ev">
            <span class="ct-panel__ev-state" :class="`is-${eventState(ev).key.replace('_', '-')}`">
              {{ eventState(ev).label }}
            </span>
            <span class="ct-panel__ev-title">{{ ev.title }}</span>
            <span v-if="ev.end_time" class="ct-panel__ev-deadline">截止 {{ deadlineLabel(ev.end_time) }}</span>
          </div>
          <div v-if="!relatedEvents.length" class="ct-panel__none">暂无关联对接事项</div>
        </div>

        <div class="ct-panel__actions">
          <el-button size="small" @click="openEdit">编辑</el-button>
          <el-button size="small" @click="toggleFavorite(selectedContact)">
            {{ selectedContact.is_favorite === 1 ? '取消常用' : '⭐ 设为常用' }}
          </el-button>
          <el-button size="small" type="danger" plain @click="removeContact(selectedContact)">删除</el-button>
        </div>
      </template>
      <div v-else class="ct-panel__placeholder">
        <div class="ct-panel__placeholder-icon">👆</div>
        <div class="ct-panel__placeholder-text">点击左侧卡片查看详情</div>
      </div>
    </aside>

    <!-- 弹窗 -->
    <ContactEditorDialog
      v-model="editorVisible"
      :contact="editorContact"
      :groups="groups"
      :contacts="contacts"
      @saved="onSaved"
    />
    <GroupManageDialog v-model="groupManageVisible" :groups="groups" @changed="onSaved" />
    <ImportContactsDialog v-model="importVisible" @saved="onSaved" />
  </div>
</template>

<style scoped>
.ct-page {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  max-width: 1500px;
  margin: 0 auto;
  /* 三栏最小可用宽度(侧 140 + 主 200 + 详情 215 + 间距):更窄时整体横向滚动,不挤压主区 */
  min-width: 587px;
}

/* ---------- 左侧分组 ---------- */
.ct-side {
  width: 190px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ct-side__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.ct-side__title {
  font-size: 12px;
  color: var(--wa-text-muted);
}

.ct-side__mini {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: var(--wa-text-muted);
}

.ct-side__mini:hover {
  color: var(--wa-brand);
}

.ct-side__item {
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  padding: 7px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--wa-text);
  text-align: left;
}

.ct-side__item:hover {
  background: #f8f9fa;
}

.ct-side__item.is-active {
  background: var(--wa-brand-soft);
}

.ct-side__item.is-active .ct-side__name {
  color: var(--wa-brand-text);
  font-weight: 600;
}

.ct-side__icon {
  flex-shrink: 0;
}

.ct-side__name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ct-side__count {
  font-size: 11px;
  color: var(--wa-text-muted);
}

.ct-side__actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.ct-side__actions .el-button {
  flex: 1;
}

/* ---------- 中部 ---------- */
.ct-main {
  flex: 1;
  min-width: 200px;
}

.ct-main__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.ct-main__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--wa-ink);
}

.ct-main__summary {
  font-size: 12px;
  color: var(--wa-text-muted);
  flex: 1;
  min-width: 120px;
}

.ct-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fff5f5;
  border: 1px solid #ffc9c9;
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 10px;
  cursor: pointer;
}

.ct-banner__label {
  font-size: 12px;
  font-weight: 600;
  color: #e03131;
  flex-shrink: 0;
}

.ct-banner__text {
  font-size: 12px;
  color: #c92a2a;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ct-banner__action {
  font-size: 12px;
  color: #e03131;
  flex-shrink: 0;
  text-decoration: underline;
}

/* ---------- 卡片 ---------- */
.ct-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ct-card {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--wa-border);
  border-radius: 8px;
  background: #fff;
  padding: 10px 14px;
  cursor: pointer;
}

.ct-card:hover {
  border-color: var(--wa-brand);
  box-shadow: 0 2px 8px rgba(18, 184, 134, 0.12);
}

.ct-card.is-selected {
  border-color: var(--wa-brand);
  box-shadow: 0 2px 8px rgba(18, 184, 134, 0.2);
}

.ct-card__avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  color: #fff;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ct-card__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ct-card__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--wa-ink);
  display: flex;
  align-items: center;
  gap: 6px;
}

.ct-card__dept {
  font-size: 12px;
  color: var(--wa-text-muted);
}

.ct-card__purpose {
  font-size: 12px;
  color: var(--wa-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ct-card__phone {
  font-size: 12px;
  color: var(--wa-text-muted);
}

.ct-card__tag {
  font-size: 11px;
  padding: 0 6px;
  border-radius: 999px;
  flex-shrink: 0;
}

.ct-card__tag--follow {
  background: #ffe3e3;
  color: #e03131;
  font-weight: 600;
}

.ct-card__tag--group {
  background: #e7f5ff;
  color: #1971c2;
}

.ct-card__tag--fav {
  background: #fff9db;
  color: #f08c00;
}

.ct-card__actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.ct-card__btn {
  border: 1px solid var(--wa-border);
  background: #fff;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--wa-text);
  cursor: pointer;
}

.ct-card__btn:hover:not(:disabled) {
  border-color: var(--wa-brand);
  color: var(--wa-brand);
}

.ct-card__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ct-empty {
  text-align: center;
  color: var(--wa-text-muted);
  font-size: 13px;
  padding: 32px 0;
}

/* ---------- 右侧详情 ---------- */
.ct-panel {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 窄窗口自适应(拖小窗口/整体缩放):压缩侧栏与详情面板,主区保持可用宽度 */
@media (max-width: 1150px) {
  .ct-side {
    width: 140px;
  }

  .ct-panel {
    width: 215px;
  }
}

.ct-panel__head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ct-panel__avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  color: #fff;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ct-panel__name {
  min-width: 0;
}

.ct-panel__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--wa-ink);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.ct-panel__dept {
  font-size: 12px;
  color: var(--wa-text-muted);
}

.ct-panel__fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--wa-border);
  border-radius: 8px;
  padding: 10px 12px;
}

.ct-panel__field {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.ct-panel__label {
  color: var(--wa-text-muted);
  flex-shrink: 0;
  width: 78px;
}

.ct-panel__value {
  color: var(--wa-text);
  flex: 1;
  min-width: 0;
  word-break: break-all;
}

.ct-panel__section {
  border: 1px solid var(--wa-border);
  border-radius: 8px;
  padding: 10px 12px;
}

.ct-panel__section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--wa-text-muted);
  margin-bottom: 8px;
}

.ct-panel__ev {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 4px 0;
}

.ct-panel__ev-state {
  flex-shrink: 0;
  font-size: 11px;
  padding: 0 6px;
  border-radius: 999px;
  background: #f1f3f5;
  color: #868e96;
}

.ct-panel__ev-state.is-not-started {
  background: #e7f5ff;
  color: #1971c2;
}

.ct-panel__ev-state.is-in-progress {
  background: #e7f5ff;
  color: #1971c2;
}

.ct-panel__ev-state.is-ended,
.ct-panel__ev-state.is-done {
  background: #e6fcf5;
  color: #0ca678;
}

.ct-panel__ev-state.is-cancelled {
  background: #f1f3f5;
  color: #adb5bd;
  text-decoration: line-through;
}

.ct-panel__ev-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--wa-text);
}

.ct-panel__ev-deadline {
  flex-shrink: 0;
  color: #e03131;
  font-size: 11px;
}

.ct-panel__none {
  font-size: 12px;
  color: #adb5bd;
}

.ct-panel__actions {
  display: flex;
  gap: 6px;
}

.ct-panel__placeholder {
  border: 1px dashed var(--wa-border);
  border-radius: 8px;
  padding: 48px 12px;
  text-align: center;
  color: var(--wa-text-muted);
  font-size: 13px;
}

.ct-panel__placeholder-icon {
  font-size: 28px;
  margin-bottom: 6px;
}
</style>
