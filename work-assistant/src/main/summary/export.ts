/**
 * 工作纲要导出(板块 09):TXT / Excel / Word / PDF。
 * - Word:adm-zip 生成最小 OOXML 包(标题、统计、四章节、备注)
 * - Excel:SheetJS 生成「工作纲要」与「导出说明」两个工作表
 * - PDF:隐藏 BrowserWindow 渲染打印版 HTML 后 webContents.printToPDF
 * 截图验收可用 SCREENSHOT_EXPORT_DIR 跳过系统保存对话框,直接写入指定目录。
 */
import { app, BrowserWindow, dialog } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import * as XLSX from 'xlsx'
import {
  cnNumber,
  customRange,
  rangeSpanText,
  renderSummaryText,
  summaryFileName
} from '@shared/summary'
import type {
  SummaryExportPayload,
  SummaryExportResult,
  SummaryFormat
} from '@shared/summary'

const FORMAT_META: Record<SummaryFormat, { label: string; ext: string; filter: string }> = {
  docx: { label: 'Word 文档', ext: 'docx', filter: 'Word 文档' },
  xlsx: { label: 'Excel 表格', ext: 'xlsx', filter: 'Excel 工作簿' },
  pdf: { label: 'PDF 文档', ext: 'pdf', filter: 'PDF 文档' },
  txt: { label: '纯文本', ext: 'txt', filter: '文本文件' }
}

function escapeXml(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function textRuns(text: string, opts: { bold?: boolean; color?: string; size?: number } = {}): string {
  const pieces = text.split('\n')
  const rPr = [
    opts.bold ? '<w:b/>' : '',
    opts.color ? `<w:color w:val="${opts.color}"/>` : '',
    opts.size ? `<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>` : ''
  ].join('')
  const rPrXml = rPr ? `<w:rPr>${rPr}</w:rPr>` : ''
  return pieces
    .map(
      (piece, idx) =>
        `${idx ? '<w:r><w:br/></w:r>' : ''}<w:r>${rPrXml}<w:t xml:space="preserve">${escapeXml(
          piece
        )}</w:t></w:r>`
    )
    .join('')
}

function paragraph(content: string, style?: string, jc?: string): string {
  const pPr = [
    style ? `<w:pStyle w:val="${style}"/>` : '',
    jc ? `<w:jc w:val="${jc}"/>` : ''
  ].join('')
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${content}</w:p>`
}

function buildDocx(payload: SummaryExportPayload): Buffer {
  const body: string[] = []
  body.push(paragraph(textRuns(payload.title), 'Title'))
  body.push(paragraph(textRuns(payload.periodLabel, { color: '666666', size: 20 }), 'Muted', 'center'))
  if (payload.template.include_stats) {
    body.push(
      paragraph(
        textRuns(
          `完成工作项 ${payload.stats.completed} 项 · 参加会议 ${payload.stats.meetings} 场 · ` +
            `对接事项 ${payload.stats.contacts} 项 · 输出报告 ${payload.stats.reports} 份`,
          { color: '444444' }
        ),
        'Stats',
        'center'
      )
    )
  }

  const filled = payload.sections.filter((s) => s.items.length > 0)
  if (!filled.length) {
    body.push(paragraph(textRuns('(本期暂无已完成事项)', { color: '888888' })))
  }
  filled.forEach((section, si) => {
    body.push(paragraph(textRuns(`${cnNumber(si + 1)}、${section.title}`), 'Heading1'))
    section.items.forEach((item, ii) => {
      const idx = String(ii + 1).padStart(2, '0')
      const titleRuns = textRuns(`${idx}. ${item.title}`, { bold: true })
      const descRuns = item.description
        ? textRuns(` — ${item.description}`, { color: '444444' })
        : ''
      body.push(paragraph(`${titleRuns}${descRuns}`, 'Item'))
    })
  })

  if (payload.template.include_note && payload.note) {
    body.push(paragraph(textRuns(`备注:${payload.note}`, { color: '666666', size: 20 }), 'Muted'))
  }
  body.push(
    paragraph(textRuns(`生成时间:${payload.generatedAt}`, { color: '999999', size: 18 }), 'Muted')
  )

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
${body.join('\n')}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
</w:body>
</w:document>`

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults>
  <w:rPrDefault><w:rPr>
    <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="宋体" w:cs="Times New Roman"/>
    <w:sz w:val="24"/><w:szCs w:val="24"/><w:color w:val="262626"/>
  </w:rPr></w:rPrDefault>
  <w:pPrDefault><w:pPr><w:spacing w:line="360" w:lineRule="auto" w:after="80"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal">
  <w:name w:val="Normal"/><w:qFormat/>
</w:style>
<w:style w:type="paragraph" w:styleId="Title">
  <w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/>
  <w:pPr><w:jc w:val="center"/><w:spacing w:before="240" w:after="240"/></w:pPr>
  <w:rPr><w:rFonts w:eastAsia="黑体"/><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Heading1">
  <w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/>
  <w:pPr><w:keepNext/><w:spacing w:before="260" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr>
  <w:rPr><w:rFonts w:eastAsia="黑体"/><w:b/><w:sz w:val="30"/><w:szCs w:val="30"/><w:color w:val="1F3A5F"/></w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Stats">
  <w:name w:val="Stats"/><w:basedOn w:val="Normal"/>
  <w:pPr><w:jc w:val="center"/><w:spacing w:after="160"/></w:pPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Item">
  <w:name w:val="Item"/><w:basedOn w:val="Normal"/>
  <w:pPr><w:ind w:left="240" w:hanging="240"/><w:spacing w:after="100"/></w:pPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Muted">
  <w:name w:val="Muted"/><w:basedOn w:val="Normal"/>
</w:style>
</w:styles>`

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

  const zip = new AdmZip()
  zip.addFile('[Content_Types].xml', Buffer.from(contentTypes, 'utf8'))
  zip.addFile('_rels/.rels', Buffer.from(rootRels, 'utf8'))
  zip.addFile('word/document.xml', Buffer.from(documentXml, 'utf8'))
  zip.addFile('word/styles.xml', Buffer.from(stylesXml, 'utf8'))
  zip.addFile('word/_rels/document.xml.rels', Buffer.from(docRels, 'utf8'))
  return zip.toBuffer()
}

function buildXlsx(payload: SummaryExportPayload): Buffer {
  const rows: Array<Array<string | number>> = [
    [payload.title],
    [payload.periodLabel],
    []
  ]
  if (payload.template.include_stats) {
    rows.push([
      '完成工作项',
      payload.stats.completed,
      '参加会议',
      payload.stats.meetings,
      '对接事项',
      payload.stats.contacts,
      '输出报告',
      payload.stats.reports
    ])
    rows.push([])
  }
  rows.push(['章节', '序号', '日期', '事项', '工作内容'])
  let seq = 0
  for (const section of payload.sections) {
    for (const item of section.items) {
      seq++
      rows.push([section.title, String(seq).padStart(2, '0'), item.date, item.title, item.description])
    }
  }
  if (seq === 0) rows.push(['', '', '', '(本期暂无已完成事项)', ''])

  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet['!cols'] = [{ wch: 18 }, { wch: 8 }, { wch: 12 }, { wch: 30 }, { wch: 62 }]
  sheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } }
  ]
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < 5; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })]
      if (!cell) continue
      cell.s = {
        alignment: { vertical: 'center', wrapText: true },
        font: r === 0 ? { bold: true, sz: 16 } : r === 1 ? { color: { rgb: '666666' } } : undefined
      }
    }
  }

  const metaRows: Array<Array<string>> = [
    ['工作纲要导出说明'],
    ['标题', payload.title],
    ['周期', payload.periodLabel],
    [rangeSpanText(customRange(payload.rangeStart, payload.rangeEnd))],
    ['生成时间', payload.generatedAt],
    ['统计口径', '完成任务按完成时间归集;会议按召开时间归集;对接/报告按已完成事项统计'],
    ['备注', payload.template.include_note ? payload.note : '(未包含备注)']
  ]
  const meta = XLSX.utils.aoa_to_sheet(metaRows)
  meta['!cols'] = [{ wch: 14 }, { wch: 80 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, '工作纲要')
  XLSX.utils.book_append_sheet(wb, meta, '导出说明')
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer
}

function buildPdfHtml(payload: SummaryExportPayload): string {
  const stats = payload.template.include_stats
    ? `<div class="stats">
        <span><b>${payload.stats.completed}</b> 完成工作项</span>
        <span><b>${payload.stats.meetings}</b> 参加会议</span>
        <span><b>${payload.stats.contacts}</b> 对接事项</span>
        <span><b>${payload.stats.reports}</b> 输出报告</span>
      </div>`
    : ''
  const filled = payload.sections.filter((s) => s.items.length > 0)
  const sections = filled
    .map(
      (section, si) => `<section>
  <h2>${cnNumber(si + 1)}、${escapeHtml(section.title)}</h2>
  ${section.items
    .map(
      (item, ii) => `<div class="item">
    <span class="idx">${String(ii + 1).padStart(2, '0')}.</span>
    <span class="title">${escapeHtml(item.title)}</span>
    ${item.description ? `<span class="desc"> — ${escapeHtml(item.description)}</span>` : ''}
  </div>`
    )
    .join('\n  ')}
</section>`
    )
    .join('\n')
  const note =
    payload.template.include_note && payload.note
      ? `<div class="note">备注:${escapeHtml(payload.note)}</div>`
      : ''
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Microsoft YaHei", "PingFang SC", "宋体", sans-serif; color: #262626; font-size: 12pt; line-height: 1.65; margin: 0; }
  h1 { font-family: "Microsoft YaHei", "黑体", sans-serif; text-align: center; font-size: 22pt; margin: 0 0 6mm; letter-spacing: 1px; }
  .period { text-align: center; color: #666; font-size: 10.5pt; margin-bottom: 4mm; }
  .stats { display: flex; justify-content: center; gap: 10mm; background: #f5f7fa; border-radius: 3mm; padding: 3mm 4mm; margin: 0 0 8mm; font-size: 10.5pt; color: #555; }
  .stats b { color: #1f3a5f; font-size: 14pt; margin-right: 1mm; }
  section { margin-bottom: 5mm; }
  h2 { font-family: "Microsoft YaHei", "黑体", sans-serif; font-size: 14pt; color: #1f3a5f; border-left: 3px solid #3b82f6; padding-left: 3mm; margin: 0 0 3mm; }
  .item { margin: 0 0 2mm; padding-left: 8mm; text-indent: -8mm; page-break-inside: avoid; }
  .idx { color: #3b82f6; font-weight: 600; margin-right: 2mm; }
  .title { font-weight: 600; }
  .desc { color: #444; }
  .note { margin-top: 5mm; padding-top: 3mm; border-top: 1px solid #e5e7eb; color: #666; font-size: 10pt; }
  .footer { margin-top: 6mm; color: #999; font-size: 9pt; text-align: right; }
  .empty { color: #888; }
</style></head><body>
<h1>${escapeHtml(payload.title)}</h1>
<div class="period">${escapeHtml(payload.periodLabel)}</div>
${stats}
${sections || '<div class="empty">(本期暂无已完成事项)</div>'}
${note}
<div class="footer">生成时间:${escapeHtml(payload.generatedAt)}</div>
</body></html>`
}

async function renderPdf(payload: SummaryExportPayload): Promise<Buffer> {
  const win = new BrowserWindow({
    width: 900,
    height: 1200,
    show: false,
    webPreferences: { sandbox: true, javascript: false }
  })
  try {
    const html = buildPdfHtml(payload)
    await win.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(html))
    await new Promise((r) => setTimeout(r, 250))
    return await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      preferCSSPageSize: true
    })
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

function writeByFormat(format: SummaryFormat, payload: SummaryExportPayload, target: string): void {
  if (format === 'docx') {
    writeFileSync(target, buildDocx(payload))
  } else if (format === 'xlsx') {
    writeFileSync(target, buildXlsx(payload))
  } else if (format === 'txt') {
    // 带 BOM,保证 Windows 记事本等老式编辑器正确识别 UTF-8
    writeFileSync(target, '﻿' + renderSummaryText(payload), 'utf8')
  } else {
    throw new Error('PDF 需通过异步导出流程生成')
  }
}

export function defaultExportDir(): string {
  return join(app.getPath('documents'), '工作台助手', '工作纲要')
}

function uniqueTarget(dir: string, fileName: string): string {
  let target = join(dir, fileName)
  if (!existsSync(target)) return target
  const base = fileName.replace(/\.[^.]+$/, '')
  const ext = fileName.slice(base.length)
  let i = 2
  while (existsSync(join(dir, `${base} (${i})${ext}`))) i++
  return join(dir, `${base} (${i})${ext}`)
}

export async function exportSummary(
  format: SummaryFormat,
  payload: SummaryExportPayload,
  parent?: BrowserWindow | null
): Promise<SummaryExportResult | null> {
  const meta = FORMAT_META[format]
  if (!meta) throw new Error(`不支持的导出格式: ${format}`)
  const dir = defaultExportDir()
  mkdirSync(dir, { recursive: true })
  const fileName = summaryFileName(payload.title, meta.ext)

  let target: string
  const forcedDir = process.env.SCREENSHOT_EXPORT_DIR
  if (forcedDir) {
    mkdirSync(forcedDir, { recursive: true })
    target = uniqueTarget(forcedDir, fileName)
  } else {
    const options = {
      title: `导出${meta.label}`,
      defaultPath: join(dir, fileName),
      filters: [{ name: meta.filter, extensions: [meta.ext] }]
    }
    const res = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options)
    if (res.canceled || !res.filePath) return null
    target = res.filePath
  }

  if (format === 'pdf') {
    writeFileSync(target, await renderPdf(payload))
  } else {
    writeByFormat(format, payload, target)
  }
  return { path: target, format }
}
