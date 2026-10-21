<script setup lang="ts">
/**
 * 文件板块(板块 08,PRD 4.4):板块=本地独立文件夹。
 * 左侧板块列表(文件数)+ 主区文件网格 + 顶部跨板块检索(文件名与正文)。
 * 支持:新建板块(默认文档\工作台助手\板块名 或自选文件夹)、上传/拖拽复制、新建文件夹、
 * 打开/定位文件、重建索引(外部文件夹中的改动可被识别)。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FileBoard } from '@shared/types'
import {
  breadcrumbSegments,
  extIcon,
  extLabel,
  formatFileDate,
  formatSize,
  joinRelative,
  sortFileEntries,
  type FileEntry,
  type FileSearchHit
} from '@shared/files'
import { db } from '@/api/db'

const boards = ref<FileBoard[]>([])
const counts = ref<Record<number, number>>({})
const selectedBoardId = ref<number | null>(null)
const currentPath = ref('')
const entries = ref<FileEntry[]>([])
const loading = ref(false)
const rootDir = ref('')
const indexing = ref(false)

// 检索
const query = ref('')
const searchHits = ref<FileSearchHit[]>([])
const searching = ref(false)
let searchSeq = 0
let searchTimer: ReturnType<typeof setTimeout> | undefined

// 新建板块
const createVisible = ref(false)
const createName = ref('')
const createMode = ref<'default' | 'custom'>('default')
const createPath = ref('')
const createBusy = ref(false)

// 拖拽
const dragOver = ref(false)
let dragDepth = 0

const selectedBoard = computed(
  () => boards.value.find((b) => b.id === selectedBoardId.value) ?? null
)
const sortedEntries = computed(() => sortFileEntries(entries.value))
const crumbs = computed(() => breadcrumbSegments(currentPath.value))
const isSearchMode = computed(() => query.value.trim().length > 0)
const hitBoardCount = computed(() => new Set(searchHits.value.map((h) => h.board_id)).size)
const defaultPathHint = computed(
  () => `${rootDir.value}\\${createName.value.trim() || '板块名称'}`
)

function fmtDate(value: string): string {
  return formatFileDate(value, new Date())
}

function currentRoot(): number | null {
  return selectedBoardId.value
}

async function loadBoards(): Promise<void> {
  boards.value = await db.boards.list()
  // 选中板块被删除后自动落到第一个
  if (
    selectedBoardId.value == null ||
    !boards.value.some((b) => b.id === selectedBoardId.value)
  ) {
    selectedBoardId.value = boards.value[0]?.id ?? null
    currentPath.value = ''
  }
}

async function loadCounts(): Promise<void> {
  try {
    counts.value = await window.api.files.counts()
  } catch {
    // 计数失败不影响浏览
  }
}

/** 打开板块(默认根目录),同时重建该板块索引 */
async function openBoard(id: number, path = ''): Promise<void> {
  selectedBoardId.value = id
  currentPath.value = path
  query.value = ''
  await refresh()
}

/** 读取当前目录并后台重建索引(索引用于跨板块检索) */
async function refresh(): Promise<void> {
  const boardId = currentRoot()
  if (boardId == null) {
    entries.value = []
    return
  }
  loading.value = true
  try {
    const res = await window.api.files.list(boardId, currentPath.value)
    entries.value = res.entries
    currentPath.value = res.dir
  } catch (err) {
    entries.value = []
    ElMessage.error(err instanceof Error ? err.message : '文件夹读取失败')
  } finally {
    loading.value = false
  }
  window.api.files
    .scan(boardId)
    .then((r) => {
      counts.value = { ...counts.value, [boardId]: r.files }
    })
    .catch(() => {
      // 索引失败不阻塞浏览
    })
}

/** 后台同步全部板块索引(启动时/手动「重建全部索引」) */
async function syncAll(silent: boolean): Promise<void> {
  if (indexing.value) return
  indexing.value = true
  try {
    const res = await window.api.files.scanAll()
    counts.value = res.counts
    if (res.errors.length) {
      ElMessage.warning(`部分板块索引失败:${res.errors[0]}`)
    } else if (!silent) {
      ElMessage.success('已重建全部板块索引,搜索将包含最新文件')
    }
    if (isSearchMode.value) runSearch(query.value.trim())
  } catch (err) {
    if (!silent) ElMessage.error(err instanceof Error ? err.message : '重建索引失败')
  } finally {
    indexing.value = false
  }
}

function goCrumb(index: number): void {
  currentPath.value = crumbs.value.slice(0, index + 1).join('/')
  refresh()
}

function navigateTo(path: string): void {
  currentPath.value = path
  refresh()
}

/** 双击:文件夹进入,文件交给系统默认程序打开 */
function activate(item: FileEntry): void {
  if (item.is_dir) {
    navigateTo(joinRelative(currentPath.value, item.name))
  } else {
    openEntry(item)
  }
}

async function openEntry(item: FileEntry): Promise<void> {
  const boardId = currentRoot()
  if (boardId == null) return
  try {
    await window.api.files.open(boardId, joinRelative(currentPath.value, item.name))
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '打开失败')
  }
}

async function revealEntry(item: FileEntry): Promise<void> {
  const boardId = currentRoot()
  if (boardId == null) return
  try {
    await window.api.files.reveal(boardId, joinRelative(currentPath.value, item.name))
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '定位失败')
  }
}

async function upload(): Promise<void> {
  const boardId = currentRoot()
  if (boardId == null) return
  try {
    const res = await window.api.files.upload(boardId, currentPath.value)
    if (!res) return
    if (res.copied) {
      ElMessage.success(`已上传 ${res.copied} 个文件`)
      await refresh()
    } else {
      ElMessage.warning('没有可复制的文件')
    }
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '上传失败')
  }
}

async function newFolder(): Promise<void> {
  const boardId = currentRoot()
  if (boardId == null) return
  try {
    const { value } = await ElMessageBox.prompt('请输入文件夹名称', '新建文件夹', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputPlaceholder: '如:月度报告',
      inputPattern: /^[^\\/:*?"<>|]+$/,
      inputErrorMessage: '名称不能为空,且不能包含 \\ / : * ? " < > |'
    })
    await window.api.files.createFolder(boardId, currentPath.value, value.trim())
    ElMessage.success('文件夹已创建')
    await refresh()
  } catch (err) {
    // 用户取消时 element-plus 抛出 'cancel' 字符串,不提示
    if (err !== 'cancel' && err !== 'close') {
      ElMessage.error(err instanceof Error ? err.message : '创建文件夹失败')
    }
  }
}

async function openFolder(): Promise<void> {
  const boardId = currentRoot()
  if (boardId == null) return
  try {
    await window.api.files.openBoardFolder(boardId)
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '打开文件夹失败')
  }
}

// ---------- 跨板块检索 ----------
function runSearch(q: string): void {
  const seq = ++searchSeq
  searching.value = true
  window.api.files
    .search(q)
    .then((hits) => {
      if (seq === searchSeq) searchHits.value = hits
    })
    .catch((err) => {
      if (seq === searchSeq) {
        searchHits.value = []
        ElMessage.error(err instanceof Error ? err.message : '检索失败')
      }
    })
    .finally(() => {
      if (seq === searchSeq) searching.value = false
    })
}

watch(query, (value) => {
  clearTimeout(searchTimer)
  const q = value.trim()
  if (!q) {
    searchSeq++
    searchHits.value = []
    searching.value = false
    return
  }
  searching.value = true
  // 输入停顿后再检索,避免每敲一个字都查库
  searchTimer = setTimeout(() => runSearch(q), 250)
})

async function openHit(hit: FileSearchHit): Promise<void> {
  try {
    await window.api.files.open(hit.board_id, hit.relative_path)
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '打开失败')
  }
}

async function revealHit(hit: FileSearchHit): Promise<void> {
  try {
    await window.api.files.reveal(hit.board_id, hit.relative_path)
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '定位失败')
  }
}

// ---------- 板块管理 ----------
function openCreateDialog(): void {
  createName.value = ''
  createMode.value = 'default'
  createPath.value = ''
  createVisible.value = true
}

async function chooseCreatePath(): Promise<void> {
  try {
    const picked = await window.api.files.pickFolder()
    if (picked) createPath.value = picked
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '选择文件夹失败')
  }
}

async function submitCreate(): Promise<void> {
  const name = createName.value.trim()
  if (!name) {
    ElMessage.warning('请输入板块名称')
    return
  }
  if (boards.value.some((b) => b.name === name)) {
    ElMessage.warning('已存在同名板块,请换一个名称')
    return
  }
  if (createMode.value === 'custom' && !createPath.value) {
    ElMessage.warning('请选择板块对应的文件夹')
    return
  }
  createBusy.value = true
  try {
    const board = await db.boards.create({
      name,
      root_path: createMode.value === 'custom' ? createPath.value : undefined
    })
    createVisible.value = false
    await loadBoards()
    await openBoard(board.id)
    await loadCounts()
    ElMessage.success(`板块「${name}」已创建`)
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '创建板块失败')
  } finally {
    createBusy.value = false
  }
}

async function renameBoard(board: FileBoard): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('请输入新的板块名称', '重命名板块', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValue: board.name,
      inputPattern: /\S+/,
      inputErrorMessage: '板块名称不能为空'
    })
    const name = value.trim()
    if (name === board.name) return
    await db.boards.update(board.id, { name })
    await loadBoards()
    ElMessage.success('板块已重命名(本地文件夹位置不变)')
  } catch (err) {
    if (err !== 'cancel' && err !== 'close') {
      ElMessage.error(err instanceof Error ? err.message : '重命名失败')
    }
  }
}

async function deleteBoard(board: FileBoard): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `将删除板块「${board.name}」及其索引记录,本地文件夹和其中的文件不会被删除。`,
      '删除板块',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
    await db.boards.remove(board.id)
    await loadBoards()
    await loadCounts()
    if (selectedBoardId.value != null) {
      await refresh()
    } else {
      entries.value = []
      currentPath.value = ''
    }
    ElMessage.success('板块已删除(本地文件保留)')
  } catch (err) {
    if (err !== 'cancel' && err !== 'close') {
      ElMessage.error(err instanceof Error ? err.message : '删除失败')
    }
  }
}

// ---------- 拖拽上传 ----------
function onDragEnter(e: DragEvent): void {
  if (!e.dataTransfer?.types.includes('Files')) return
  dragDepth++
  dragOver.value = true
}

function onDragLeave(): void {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) dragOver.value = false
}

async function onDrop(e: DragEvent): Promise<void> {
  dragDepth = 0
  dragOver.value = false
  const boardId = currentRoot()
  if (boardId == null) return
  const files = Array.from(e.dataTransfer?.files ?? [])
  if (!files.length) return
  const paths = window.api.files.dropPaths(files)
  if (!paths.length) {
    ElMessage.warning('未能识别拖入的文件')
    return
  }
  try {
    const res = await window.api.files.copyPaths(boardId, currentPath.value, paths)
    if (res.copied) {
      ElMessage.success(
        res.copied === paths.length
          ? `已复制 ${res.copied} 个文件到当前文件夹`
          : `已复制 ${res.copied} 个文件(文件夹暂不支持拖拽)`
      )
      await refresh()
    } else {
      ElMessage.warning('没有可复制的文件')
    }
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '复制文件失败')
  }
}

onMounted(async () => {
  try {
    rootDir.value = await window.api.files.defaultRoot()
  } catch {
    rootDir.value = ''
  }
  try {
    await loadBoards()
    await loadCounts()
    if (selectedBoardId.value != null) await refresh()
    // 启动后后台重建全部索引,保证跨板块搜索反映磁盘最新内容
    syncAll(true)
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '文件板块加载失败')
  }
})
</script>

<template>
  <div class="fl-page">
    <div class="fl-head">
      <div>
        <div class="fl-head__title">文件板块</div>
        <div class="fl-head__sub">每个板块对应本地一个独立文件夹,文件改动会在打开板块时自动识别</div>
      </div>
      <div class="fl-head__actions">
        <el-button size="small" :loading="indexing" @click="syncAll(false)">🔄 重建全部索引</el-button>
        <el-button size="small" type="primary" @click="openCreateDialog">＋ 新建板块</el-button>
      </div>
    </div>

    <div class="fl-body">
      <!-- 左侧板块列表 -->
      <aside class="fl-side">
        <div class="fl-side__title">
          文件板块
          <span class="fl-side__total">{{ boards.length }}</span>
        </div>
        <div class="fl-side__list">
          <div
            v-for="b in boards"
            :key="b.id"
            class="fl-side__item"
            :class="{ 'is-active': b.id === selectedBoardId }"
            :title="b.root_path"
            @click="openBoard(b.id)"
          >
            <span class="fl-side__icon">{{ b.icon }}</span>
            <span class="fl-side__name">{{ b.name }}</span>
            <span class="fl-side__count">{{ counts[b.id] ?? 0 }}</span>
            <span class="fl-side__ops">
              <button title="重命名板块" @click.stop="renameBoard(b)">✏️</button>
              <button title="删除板块(保留本地文件)" @click.stop="deleteBoard(b)">🗑️</button>
            </span>
          </div>
          <div v-if="!boards.length" class="fl-side__empty">
            还没有文件板块<br />点击右上角「新建板块」创建
          </div>
        </div>
        <div class="fl-side__foot" :title="rootDir">
          <div class="fl-side__foot-title">💡 板块文件夹默认位置</div>
          <div class="fl-side__foot-path">{{ rootDir || '文档\\工作台助手' }}</div>
        </div>
      </aside>

      <!-- 主区域 -->
      <section
        class="fl-main"
        @dragenter.prevent="onDragEnter"
        @dragover.prevent
        @dragleave="onDragLeave"
        @drop.prevent="onDrop"
      >
        <div class="fl-toolbar">
          <div class="fl-crumbs">
            <template v-if="isSearchMode">
              <span class="fl-crumb__current">🔍 搜索结果</span>
            </template>
            <template v-else-if="selectedBoard">
              <button class="fl-crumb fl-crumb--board" @click="openBoard(selectedBoard.id)">
                {{ selectedBoard.icon }} {{ selectedBoard.name }}
              </button>
              <template v-for="(seg, i) in crumbs" :key="i">
                <span class="fl-crumb__sep">/</span>
                <button class="fl-crumb" @click="goCrumb(i)">{{ seg }}</button>
              </template>
              <template v-if="!crumbs.length">
                <span class="fl-crumb__sep">·</span>
                <span class="fl-crumb__current">全部文件</span>
              </template>
            </template>
            <span v-else class="fl-crumb__current">请选择或新建板块</span>
          </div>
          <div v-if="selectedBoard && !isSearchMode" class="fl-toolbar__actions">
            <el-button size="small" type="primary" @click="upload">⬆️ 上传</el-button>
            <el-button size="small" @click="newFolder">📂 新建文件夹</el-button>
            <el-button size="small" text @click="refresh">刷新</el-button>
            <el-button size="small" text @click="openFolder">打开文件夹</el-button>
          </div>
        </div>

        <div class="fl-search">
          <el-input
            v-model="query"
            size="large"
            clearable
            placeholder="跨板块搜索文件名与内容(txt / md / csv / xlsx / docx)"
          >
            <template #prefix><span class="fl-search__icon">🔍</span></template>
          </el-input>
        </div>

        <!-- 搜索结果 -->
        <div v-if="isSearchMode" class="fl-results">
          <div class="fl-results__summary">
            <template v-if="searching">正在检索「{{ query.trim() }}」…</template>
            <template v-else>
              找到 <b>{{ searchHits.length }}</b> 个与「{{ query.trim() }}」相关的文件
              <span v-if="searchHits.length"> · 来自 {{ hitBoardCount }} 个板块</span>
            </template>
          </div>
          <div v-if="!searching && !searchHits.length" class="fl-empty fl-empty--small">
            <div class="fl-empty__icon">🔍</div>
            <div class="fl-empty__title">没有找到匹配的文件</div>
            <div class="fl-empty__hint">试试其他关键词,或点击右上角「重建全部索引」后再搜索</div>
          </div>
          <div v-else class="fl-results__list">
            <div
              v-for="hit in searchHits"
              :key="hit.board_id + ':' + hit.relative_path"
              class="fl-hit"
              @dblclick="openHit(hit)"
            >
              <span class="fl-hit__icon">{{ extIcon(hit.ext) }}</span>
              <div class="fl-hit__body">
                <div class="fl-hit__name">{{ hit.name }}</div>
                <div v-if="hit.snippet" class="fl-hit__snippet">{{ hit.snippet }}</div>
                <div v-else class="fl-hit__snippet fl-hit__snippet--name">文件名命中</div>
                <div class="fl-hit__meta">
                  <span class="fl-hit__board">{{ hit.board_icon }} {{ hit.board_name }}</span>
                  <span>{{ extLabel(hit.ext) }}</span>
                  <span>{{ formatSize(hit.size) }}</span>
                  <span>{{ fmtDate(hit.mtime) }}</span>
                </div>
              </div>
              <div class="fl-hit__ops">
                <el-button size="small" text @click.stop="openHit(hit)">打开</el-button>
                <el-button size="small" text @click.stop="revealHit(hit)">定位</el-button>
              </div>
            </div>
          </div>
        </div>

        <!-- 文件网格 -->
        <div v-else v-loading="loading" class="fl-grid-wrap">
          <div v-if="!boards.length" class="fl-empty">
            <div class="fl-empty__icon">📁</div>
            <div class="fl-empty__title">用板块管理你的工作文件</div>
            <div class="fl-empty__hint">
              每个板块对应本地一个独立文件夹,例如「客运部工作」「韩亚项目」;<br />
              创建后可直接把文件拖进文件夹,应用会自动识别并显示。
            </div>
            <div class="fl-empty__actions">
              <el-button type="primary" @click="openCreateDialog">＋ 新建第一个板块</el-button>
            </div>
          </div>
          <div v-else-if="!entries.length && !loading" class="fl-empty">
            <div class="fl-empty__icon">🗂️</div>
            <div class="fl-empty__title">{{ crumbs.length ? '这个文件夹是空的' : '这个板块还没有文件' }}</div>
            <div class="fl-empty__hint">把文件拖到这里,或点击「上传」从电脑选择文件</div>
            <div class="fl-empty__actions">
              <el-button type="primary" @click="upload">⬆️ 上传文件</el-button>
              <el-button @click="newFolder">📂 新建文件夹</el-button>
            </div>
          </div>
          <div v-else class="fl-grid">
            <div
              v-for="item in sortedEntries"
              :key="item.name"
              class="fl-card"
              :class="{ 'is-dir': item.is_dir }"
              :title="item.is_dir ? '双击进入文件夹' : '双击打开文件'"
              @dblclick="activate(item)"
            >
              <div class="fl-card__icon">{{ item.is_dir ? '📁' : extIcon(item.ext) }}</div>
              <div class="fl-card__name">{{ item.name }}</div>
              <div class="fl-card__meta">
                <template v-if="item.is_dir">
                  文件夹 · {{ item.child_count ?? 0 }} 个文件
                </template>
                <template v-else>
                  {{ extLabel(item.ext) }} · {{ formatSize(item.size) }} · {{ fmtDate(item.mtime) }}
                </template>
              </div>
              <div class="fl-card__ops">
                <button
                  :title="item.is_dir ? '打开文件夹' : '打开文件'"
                  @click.stop="activate(item)"
                >
                  ↗
                </button>
                <button title="在文件夹中显示" @click.stop="revealEntry(item)">📍</button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="dragOver" class="fl-drop">松开鼠标,复制文件到当前文件夹</div>
      </section>
    </div>

    <!-- 新建板块 -->
    <el-dialog v-model="createVisible" title="新建文件板块" width="480px">
      <div class="fl-form">
        <div class="fl-form__label">板块名称</div>
        <el-input
          v-model="createName"
          maxlength="20"
          placeholder="如:客运部工作"
          @keyup.enter="submitCreate"
        />
        <div class="fl-form__label">文件夹位置</div>
        <el-radio-group v-model="createMode">
          <el-radio value="default">默认位置</el-radio>
          <el-radio value="custom">指定已有文件夹</el-radio>
        </el-radio-group>
        <div class="fl-form__path">
          {{ createMode === 'default' ? defaultPathHint : createPath || '尚未选择文件夹' }}
        </div>
        <el-button v-if="createMode === 'custom'" size="small" @click="chooseCreatePath">
          📂 选择文件夹
        </el-button>
        <div class="fl-form__hint">
          板块会绑定这个本地文件夹,文件夹中的改动会在打开板块时自动识别。
        </div>
      </div>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="createBusy" @click="submitCreate">创建板块</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.fl-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 640px;
}

.fl-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.fl-head__title {
  font-size: 18px;
  font-weight: 600;
  color: var(--wa-text);
}

.fl-head__sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--wa-text-muted);
}

.fl-head__actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.fl-body {
  flex: 1;
  display: flex;
  gap: 16px;
  min-height: 0;
}

/* ---------- 左侧板块 ---------- */
.fl-side {
  width: 198px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--wa-border);
  border-radius: 10px;
  background: #fbfdfc;
  min-height: 0;
}

.fl-side__title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--wa-text);
}

.fl-side__total {
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  border-radius: 9px;
  background: var(--wa-brand-soft);
  color: var(--wa-brand-text);
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}

.fl-side__list {
  flex: 1;
  overflow-y: auto;
  padding: 2px 8px 8px;
}

.fl-side__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 10px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--wa-text-secondary);
  transition: background 0.15s;
}

.fl-side__item:hover {
  background: #eef7f3;
}

.fl-side__item.is-active {
  background: var(--wa-brand-soft);
  color: var(--wa-brand-text);
  font-weight: 600;
}

.fl-side__icon {
  font-size: 16px;
  flex-shrink: 0;
}

.fl-side__name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fl-side__count {
  font-size: 11px;
  color: var(--wa-text-muted);
  flex-shrink: 0;
}

.fl-side__ops {
  display: none;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.fl-side__item:hover .fl-side__ops {
  display: flex;
}

.fl-side__item:hover .fl-side__count {
  display: none;
}

.fl-side__ops button {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 11px;
  padding: 2px;
  border-radius: 4px;
  line-height: 1;
}

.fl-side__ops button:hover {
  background: #fff;
}

.fl-side__empty {
  padding: 24px 8px;
  text-align: center;
  font-size: 12px;
  line-height: 1.8;
  color: var(--wa-text-muted);
}

.fl-side__foot {
  border-top: 1px solid var(--wa-border);
  padding: 10px 14px;
  font-size: 11px;
  color: var(--wa-text-muted);
}

.fl-side__foot-title {
  margin-bottom: 3px;
}

.fl-side__foot-path {
  color: var(--wa-text-secondary);
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---------- 主区域 ---------- */
.fl-main {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--wa-border);
  border-radius: 10px;
  padding: 12px 16px;
  background: #fff;
  min-height: 0;
}

.fl-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 32px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.fl-crumbs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  min-width: 0;
}

.fl-crumb {
  border: none;
  background: transparent;
  padding: 2px 4px;
  border-radius: 4px;
  font-size: 13px;
  color: var(--wa-text-secondary);
  cursor: pointer;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fl-crumb:hover {
  color: var(--wa-brand-text);
  background: var(--wa-brand-soft);
}

.fl-crumb--board {
  font-weight: 600;
  color: var(--wa-text);
}

.fl-crumb__sep {
  color: #ced4da;
  font-size: 12px;
}

.fl-crumb__current {
  font-size: 13px;
  color: var(--wa-text-muted);
}

.fl-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.fl-search {
  margin-bottom: 12px;
}

.fl-search__icon {
  font-size: 14px;
}

.fl-results {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.fl-results__summary {
  font-size: 12px;
  color: var(--wa-text-muted);
  margin-bottom: 10px;
}

.fl-results__summary b {
  color: var(--wa-brand-text);
}

.fl-results__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fl-hit {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--wa-border);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.fl-hit:hover {
  border-color: var(--wa-brand-text);
  box-shadow: 0 2px 8px rgba(18, 184, 134, 0.08);
}

.fl-hit__icon {
  font-size: 24px;
  line-height: 1;
  margin-top: 2px;
}

.fl-hit__body {
  flex: 1;
  min-width: 0;
}

.fl-hit__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--wa-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fl-hit__snippet {
  margin-top: 3px;
  font-size: 12px;
  color: var(--wa-text-secondary);
  line-height: 1.5;
}

.fl-hit__snippet--name {
  color: var(--wa-text-muted);
}

.fl-hit__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 5px;
  font-size: 11px;
  color: var(--wa-text-muted);
}

.fl-hit__board {
  color: var(--wa-brand-text);
  background: var(--wa-brand-soft);
  border-radius: 4px;
  padding: 0 6px;
}

.fl-hit__ops {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.fl-grid-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.fl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 12px;
  padding-bottom: 8px;
}

.fl-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 10px 12px;
  border: 1px solid var(--wa-border);
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
  user-select: none;
}

.fl-card:hover {
  border-color: var(--wa-brand-text);
  box-shadow: 0 4px 14px rgba(18, 184, 134, 0.1);
  transform: translateY(-1px);
}

.fl-card.is-dir {
  background: #fbfdfc;
}

.fl-card__icon {
  font-size: 34px;
  line-height: 1;
  margin-bottom: 8px;
}

.fl-card__name {
  width: 100%;
  font-size: 12px;
  font-weight: 500;
  color: var(--wa-text);
  text-align: center;
  line-height: 1.4;
  height: 34px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}

.fl-card__meta {
  margin-top: 4px;
  font-size: 11px;
  color: var(--wa-text-muted);
  text-align: center;
  line-height: 1.4;
}

.fl-card__ops {
  position: absolute;
  top: 6px;
  right: 6px;
  display: none;
  gap: 2px;
}

.fl-card:hover .fl-card__ops {
  display: flex;
}

.fl-card__ops button {
  border: none;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  width: 22px;
  height: 22px;
  border-radius: 11px;
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
  padding: 0;
}

.fl-card__ops button:hover {
  background: var(--wa-brand-soft);
}

.fl-empty {
  flex: 1;
  min-height: 240px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--wa-text-muted);
}

.fl-empty--small {
  min-height: 180px;
}

.fl-empty__icon {
  font-size: 44px;
  margin-bottom: 10px;
}

.fl-empty__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--wa-text-secondary);
  margin-bottom: 6px;
}

.fl-empty__hint {
  font-size: 12px;
  line-height: 1.8;
}

.fl-empty__actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.fl-drop {
  position: absolute;
  inset: 8px;
  border: 2px dashed var(--wa-brand);
  border-radius: 10px;
  background: rgba(230, 247, 241, 0.92);
  color: var(--wa-brand-text);
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 10;
}

/* ---------- 新建板块弹窗 ---------- */
.fl-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.fl-form__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--wa-text-secondary);
  margin-top: 2px;
}

.fl-form__path {
  font-size: 12px;
  color: var(--wa-text-secondary);
  background: #f8fafa;
  border: 1px solid var(--wa-border);
  border-radius: 6px;
  padding: 8px 10px;
  word-break: break-all;
  line-height: 1.5;
}

.fl-form__hint {
  font-size: 11px;
  color: var(--wa-text-muted);
  line-height: 1.6;
}

/* 窄窗口(1024 宽 / 缩放 120%)下压缩侧栏,主区保持可用 */
@media (max-width: 1150px) {
  .fl-side {
    width: 168px;
  }

  .fl-grid {
    grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  }
}
</style>
