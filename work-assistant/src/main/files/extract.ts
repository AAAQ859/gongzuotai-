/**
 * 文件夹递归扫描与正文提取(不依赖 Electron,可在演示数据播种脚本中复用)。
 * 支持:文本类按 UTF-8 读取;xlsx 遍历工作表单元格;docx 解包 word/document.xml;
 * PDF 等其余类型只建文件名索引。单文件解析失败不影响整体扫描。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import * as XLSX from 'xlsx'
import AdmZip from 'adm-zip'
// 使用相对导入:本模块同时被 Node 测试/播种脚本直接编译运行(tsc 不重写 @shared 别名)
import { isSearchableExt, isTextExt } from '../../shared/files'

export const MAX_CONTENT_CHARS = 200_000
export const MAX_SCAN_FILES = 5000
export const MAX_SCAN_DEPTH = 8

export interface ScannedFile {
  relative_path: string
  name: string
  ext: string
  size: number
  mtime: string
  content: string
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function fmtMtime(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

/** 提取文件正文(仅可检索类型;失败返回空串) */
export function extractContent(fullPath: string, ext: string): string {
  try {
    if (isTextExt(ext)) {
      const text = readFileSync(fullPath, 'utf8').replace(/^﻿/, '')
      return text.slice(0, MAX_CONTENT_CHARS)
    }
    if (ext === 'xlsx') {
      const wb = XLSX.readFile(fullPath, { cellText: true })
      const parts: string[] = []
      for (const name of wb.SheetNames) {
        parts.push(XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false }))
        if (parts.join('\n').length > MAX_CONTENT_CHARS) break
      }
      return parts.join('\n').slice(0, MAX_CONTENT_CHARS)
    }
    if (ext === 'docx') {
      const zip = new AdmZip(fullPath)
      const xml = zip.getEntry('word/document.xml')?.getData().toString('utf8') ?? ''
      const text = xml
        .replace(/<w:p[ >]/g, '\n<w:p ')
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/[ \t]+\n/g, '\n')
      return text.slice(0, MAX_CONTENT_CHARS)
    }
    return ''
  } catch {
    return ''
  }
}

/** 递归扫描文件夹;跳过点号开头的隐藏项,限制深度与文件数 */
export function scanFolder(root: string): { items: ScannedFile[]; folders: number } {
  const items: ScannedFile[] = []
  let folders = 0
  if (!existsSync(root)) return { items, folders }
  const walk = (dir: string, rel: string, depth: number): void => {
    if (depth > MAX_SCAN_DEPTH || items.length >= MAX_SCAN_FILES) return
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      return
    }
    for (const name of names) {
      if (name.startsWith('.')) continue
      if (items.length >= MAX_SCAN_FILES) return
      const full = resolve(dir, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      const childRel = rel ? `${rel}/${name}` : name
      if (st.isDirectory()) {
        folders++
        walk(full, childRel, depth + 1)
      } else if (st.isFile()) {
        const ext = extname(name).slice(1).toLowerCase()
        items.push({
          relative_path: childRel,
          name,
          ext,
          size: st.size,
          mtime: fmtMtime(st.mtime),
          content: isSearchableExt(ext) ? extractContent(full, ext) : ''
        })
      }
    }
  }
  walk(root, '', 0)
  return { items, folders }
}
