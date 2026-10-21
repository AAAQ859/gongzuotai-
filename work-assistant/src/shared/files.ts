/**
 * 文件板块纯逻辑(板块 08,有单测):体积/类型/图标/排序/相对路径/面包屑/检索命中片段。
 * 渲染层(显示)与主进程(扫描索引/搜索)共用,保证两端口径一致。
 */

export interface FileEntryLike {
  name: string
  is_dir: boolean
}

/** 板块目录中的一项(主进程列举 → 渲染层展示) */
export interface FileEntry extends FileEntryLike {
  size: number
  mtime: string
  ext: string
  /** 文件夹的直接子文件数(文件为空) */
  child_count?: number
}

/** 文件板块 IPC 统一返回 */
export interface FilesResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

/** 全量重建索引结果 */
export interface ScanAllResult {
  counts: Record<number, number>
  errors: string[]
}

/** 跨板块检索命中项 */
export interface FileSearchHit {
  board_id: number
  board_name: string
  board_icon: string
  relative_path: string
  name: string
  ext: string
  size: number
  mtime: string
  /** 正文命中片段;名称命中为 null */
  snippet: string | null
  name_hit: boolean
}

/** 人类可读体积:'890 B' / '450 KB' / '2.3 MB' / '5.6 GB' */
export function formatSize(bytes: number): string {
  const n = Math.max(0, Math.round(bytes))
  if (n < 1024) return `${n} B`
  const kb = n / 1024
  if (kb < 1024) return `${trimZero(kb.toFixed(kb >= 100 ? 0 : 1))} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${trimZero(mb.toFixed(mb >= 100 ? 0 : 1))} MB`
  const gb = mb / 1024
  return `${trimZero(gb.toFixed(1))} GB`
}

function trimZero(s: string): string {
  return s.replace(/\.0$/, '')
}

/** 扩展名(小写、不含点);无扩展名返回空串 */
export function extOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const i = base.lastIndexOf('.')
  if (i <= 0) return ''
  return base.slice(i + 1).toLowerCase()
}

const TEXT_EXTS = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'log',
  'json',
  'xml',
  'yml',
  'yaml',
  'ini',
  'html',
  'htm'
])
const OFFICE_EXTS = new Set(['xlsx', 'docx'])

/** 纯文本类(可直接按 UTF-8 读取正文) */
export function isTextExt(ext: string): boolean {
  return TEXT_EXTS.has(ext.toLowerCase())
}

/** Office 文本可提取类(xlsx 单元格 / docx 正文) */
export function isOfficeExt(ext: string): boolean {
  return OFFICE_EXTS.has(ext.toLowerCase())
}

/** 参与内容检索的类型(文件名检索对所有类型生效) */
export function isSearchableExt(ext: string): boolean {
  return isTextExt(ext) || isOfficeExt(ext)
}

/** 文件类型图标(文件夹由 UI 单独处理) */
export function extIcon(ext: string): string {
  const e = ext.toLowerCase()
  if (e === 'pdf') return '📕'
  if (e === 'doc' || e === 'docx') return '📄'
  if (e === 'xls' || e === 'xlsx' || e === 'csv') return '📊'
  if (e === 'ppt' || e === 'pptx') return '📽️'
  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'].includes(e)) return '🖼️'
  if (e === 'zip' || e === 'rar' || e === '7z' || e === 'gz') return '🗜️'
  if (['mp4', 'avi', 'mov', 'mkv', 'wmv'].includes(e)) return '🎬'
  if (['mp3', 'wav', 'flac', 'aac', 'm4a'].includes(e)) return '🎵'
  if (TEXT_EXTS.has(e)) return '📝'
  return '📎'
}

/** 类型标签:'PDF' / 'DOCX' / '文件' */
export function extLabel(ext: string): string {
  const e = ext.toUpperCase()
  return e || '文件'
}

/** 排序:文件夹在前,同组按名称(中文按拼音、数字按大小)升序 */
export function sortFileEntries<T extends FileEntryLike>(entries: T[]): T[] {
  const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' })
  return [...entries].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
    return collator.compare(a.name, b.name)
  })
}

/** 拼接相对路径:'' + 'a.txt' → 'a.txt';'x' + 'y' → 'x/y' */
export function joinRelative(base: string, name: string): string {
  const b = base.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  const n = name.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (!b) return n
  if (!n) return b
  return `${b}/${n}`
}

/** 面包屑:'客运部工作/月度报告' → ['客运部工作','月度报告'];空 → [] */
export function breadcrumbSegments(relPath: string): string[] {
  return relPath
    .replace(/\\/g, '/')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 文件格中的日期文案:同年 'M-D',跨年 'YYYY-M-D' */
export function formatFileDate(value: string, now: Date): string {
  const m = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!m) return value
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  return y === now.getFullYear() ? `${mo}-${d}` : `${y}-${mo}-${d}`
}

/**
 * 检索命中片段:在正文中定位关键词,截取前后 radius 个字符(带省略号);
 * 未命中返回 null。命中位置对英文不区分大小写。
 */
export function snippetOf(content: string, query: string, radius = 24): string | null {
  const text = content.replace(/\s+/g, ' ')
  const q = query.trim()
  if (!q) return null
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx < 0) return null
  const start = Math.max(0, idx - radius)
  const end = Math.min(text.length, idx + q.length + radius)
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
}

/** 文件名是否命中关键词(不区分大小写) */
export function nameMatches(name: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  return q.length > 0 && name.toLowerCase().includes(q)
}
