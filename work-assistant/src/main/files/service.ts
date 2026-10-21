/**
 * 文件板块主进程服务(板块 08):板块=本地文件夹。
 * - 目录列举/新建文件夹/上传(复制)/打开/定位
 * - 板块扫描:递归索引 file_items(含正文文本,供跨板块内容检索)
 * - 正文提取:文本类 UTF-8 读取、xlsx 单元格、docx 正文(adm-zip 解包 XML);PDF 仅文件名
 */
import { app, dialog, shell } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { basename, isAbsolute, resolve, sep } from 'node:path'
import { extOf, snippetOf, type FileEntry, type FileSearchHit } from '@shared/files'
import { fmtMtime, scanFolder } from './extract'
import * as boardsRepo from '../db/repositories/boards'

/** 板块根目录默认位置:文档\工作台助手 */
export function defaultRootDir(): string {
  return resolve(app.getPath('documents'), '工作台助手')
}

/** 安全拼接:相对路径不得越出板块根目录 */
function safeJoin(root: string, rel: string): string {
  const base = resolve(root)
  const target = resolve(base, rel || '.')
  if (target !== base && !target.startsWith(base + sep)) {
    throw new Error('非法路径:超出板块文件夹范围')
  }
  return target
}

/** 确保板块文件夹存在并返回根路径(空 root_path 时在 文档\工作台助手\板块名 创建) */
export function ensureBoardRoot(boardId: number): string {
  const board = boardsRepo.get(boardId)
  let root = board.root_path.trim()
  if (!root) {
    root = resolve(defaultRootDir(), sanitizeFolderName(board.name))
    boardsRepo.update(board.id, { root_path: root })
  }
  mkdirSync(root, { recursive: true })
  return root
}

/** 文件夹名清洗:去掉 Windows 非法字符 */
export function sanitizeFolderName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '').trim() || '未命名板块'
}

/** 列举板块内某个相对目录(文件夹在前、名称排序在渲染层完成) */
export function listDir(boardId: number, relPath: string): { dir: string; entries: FileEntry[] } {
  const root = ensureBoardRoot(boardId)
  const dir = safeJoin(root, relPath)
  if (!existsSync(dir)) throw new Error('文件夹不存在')
  const entries: FileEntry[] = []
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue
    const full = resolve(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    const isDir = st.isDirectory()
    let childCount: number | undefined
    if (isDir) {
      try {
        childCount = readdirSync(full, { withFileTypes: true }).filter(
          (d) => d.isFile() && !d.name.startsWith('.')
        ).length
      } catch {
        childCount = 0
      }
    }
    entries.push({
      name,
      is_dir: isDir,
      size: isDir ? 0 : st.size,
      mtime: fmtMtime(st.mtime),
      ext: isDir ? '' : extOf(name),
      child_count: childCount
    })
  }
  // 面包屑规范化:去掉空段
  const norm = relPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  return { dir: norm, entries }
}

/** 新建文件夹 */
export function createFolder(boardId: number, relPath: string, name: string): void {
  const clean = name.trim()
  if (!clean) throw new Error('文件夹名称不能为空')
  if (/[\\/:*?"<>|]/.test(clean)) throw new Error('名称不能包含 \\ / : * ? " < > |')
  const root = ensureBoardRoot(boardId)
  mkdirSync(safeJoin(root, `${relPath ? relPath + '/' : ''}${clean}`), { recursive: true })
}

/** 扫描板块文件夹并全量重建索引;返回文件数与目录数 */
export function scanBoard(boardId: number): { files: number; folders: number } {
  const root = ensureBoardRoot(boardId)
  const res = scanFolder(root)
  boardsRepo.replaceFileItems(boardId, res.items)
  return { files: res.items.length, folders: res.folders }
}

/** 复制一批外部文件到板块目录(重名自动加序号),返回复制数量 */
export function copyFiles(boardId: number, relPath: string, paths: string[]): { copied: number } {
  const root = ensureBoardRoot(boardId)
  const dir = safeJoin(root, relPath)
  mkdirSync(dir, { recursive: true })
  let copied = 0
  for (const p of paths) {
    try {
      if (!isAbsolute(p) || !existsSync(p)) continue
      const st = statSync(p)
      if (!st.isFile()) continue
      const name = basename(p)
      let target = resolve(dir, name)
      if (existsSync(target)) {
        const dot = name.lastIndexOf('.')
        const stem = dot > 0 ? name.slice(0, dot) : name
        const ext = dot > 0 ? name.slice(dot) : ''
        let i = 1
        while (existsSync(target)) {
          target = resolve(dir, `${stem} (${i})${ext}`)
          i++
        }
      }
      copyFileSync(p, target)
      copied++
    } catch {
      // 单个文件失败不影响其余文件
    }
  }
  return { copied }
}

/** 选择文件(多选)并复制到当前目录 */
export async function pickAndUpload(
  boardId: number,
  relPath: string
): Promise<{ copied: number } | null> {
  const res = await dialog.showOpenDialog({
    title: '选择要上传的文件',
    properties: ['openFile', 'multiSelections']
  })
  if (res.canceled || !res.filePaths.length) return null
  return copyFiles(boardId, relPath, res.filePaths)
}

/** 选择本地文件夹(新建板块时指定位置) */
export async function pickFolder(defaultPath?: string): Promise<string | null> {
  const res = await dialog.showOpenDialog({
    title: '选择板块对应的文件夹',
    defaultPath: defaultPath || defaultRootDir(),
    properties: ['openDirectory', 'createDirectory']
  })
  if (res.canceled || !res.filePaths.length) return null
  return res.filePaths[0]
}

/** 打开文件(委托系统默认程序) */
export async function openFile(boardId: number, relPath: string): Promise<{ ok: boolean; error?: string }> {
  const root = ensureBoardRoot(boardId)
  const full = safeJoin(root, relPath)
  if (!existsSync(full)) return { ok: false, error: '文件不存在,请刷新后重试' }
  const err = await shell.openPath(full)
  return err ? { ok: false, error: err } : { ok: true }
}

/** 在资源管理器中定位文件 */
export function revealFile(boardId: number, relPath: string): { ok: boolean; error?: string } {
  const root = ensureBoardRoot(boardId)
  const full = safeJoin(root, relPath)
  if (!existsSync(full)) return { ok: false, error: '文件不存在,请刷新后重试' }
  shell.showItemInFolder(full)
  return { ok: true }
}

/** 跨板块检索:文件名 + 正文;名称命中优先,正文命中带片段 */
export function search(query: string): FileSearchHit[] {
  const q = query.trim()
  if (!q) return []
  return boardsRepo.searchFileItems(q).map((r) => ({
    board_id: r.board_id,
    board_name: r.board_name,
    board_icon: r.board_icon,
    relative_path: r.relative_path,
    name: r.name,
    ext: r.ext,
    size: r.size,
    mtime: r.mtime,
    snippet: r.name_hit ? null : snippetOf(r.content, q),
    name_hit: r.name_hit === 1
  }))
}
