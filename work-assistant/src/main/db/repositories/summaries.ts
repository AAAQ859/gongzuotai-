import type {
  SummaryContent,
  SummaryDraft,
  SummaryMode,
  SummarySection,
  SummarySectionKey,
  SummaryItem
} from '@shared/summary'
// 使用相对导入:本模块被 Node 测试直接编译运行(tsc 不重写 @shared 别名)
import { emptySummaryContent } from '../../../shared/summary'
import { asRow, getDb } from '../database'

type DraftRow = Omit<SummaryDraft, 'content'> & { content: string }

function parseContent(raw: string): SummaryContent {
  try {
    const parsed = JSON.parse(raw) as Partial<SummaryContent>
    if (!parsed || !Array.isArray(parsed.sections)) return emptySummaryContent()
    const sections: SummarySection[] = parsed.sections
      .filter((s): s is SummarySection => !!s && typeof s === 'object' && typeof s.key === 'string')
      .map((s) => ({
        key: s.key as SummarySectionKey,
        title: typeof s.title === 'string' ? s.title : String(s.key),
        items: Array.isArray(s.items)
          ? s.items.filter((it: SummaryItem) => it && typeof it.title === 'string')
          : []
      }))
    return {
      sections,
      note: typeof parsed.note === 'string' ? parsed.note : ''
    }
  } catch {
    return emptySummaryContent()
  }
}

function mapRow(row: DraftRow): SummaryDraft {
  return { ...row, content: parseContent(row.content) }
}

export function get(periodType: SummaryMode, periodKey: string): SummaryDraft | null {
  const row = asRow<DraftRow>(
    getDb()
      .prepare('SELECT * FROM summary_drafts WHERE period_type = ? AND period_key = ?')
      .get(periodType, periodKey)
  )
  return row ? mapRow(row) : null
}

export interface SaveDraftInput {
  period_type: SummaryMode
  period_key: string
  title: string
  range_start: string
  range_end: string
  content: SummaryContent
}

/** 保存/覆盖某周期草稿(周期唯一);返回落库后的记录 */
export function save(input: SaveDraftInput): SummaryDraft {
  const db = getDb()
  db.prepare(
    `INSERT INTO summary_drafts
       (period_type, period_key, title, range_start, range_end, content, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'))
     ON CONFLICT(period_type, period_key) DO UPDATE SET
       title = excluded.title,
       range_start = excluded.range_start,
       range_end = excluded.range_end,
       content = excluded.content,
       updated_at = datetime('now','localtime')`
  ).run(
    input.period_type,
    input.period_key,
    input.title,
    input.range_start,
    input.range_end,
    JSON.stringify(input.content)
  )
  const saved = get(input.period_type, input.period_key)
  if (!saved) throw new Error('纲要草稿保存失败')
  return saved
}

export function remove(periodType: SummaryMode, periodKey: string): void {
  getDb()
    .prepare('DELETE FROM summary_drafts WHERE period_type = ? AND period_key = ?')
    .run(periodType, periodKey)
}

export function latest(): SummaryDraft | null {
  const row = asRow<DraftRow>(
    getDb().prepare('SELECT * FROM summary_drafts ORDER BY updated_at DESC, id DESC LIMIT 1').get()
  )
  return row ? mapRow(row) : null
}
