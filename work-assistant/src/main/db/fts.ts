import type { DatabaseSync } from 'node:sqlite'

// ---------- 中文全文索引分词 ----------
// unicode61 分词器不切分中文(整段连续汉字是一个 token),因此写入时在汉字两侧插空格,
// 使每个汉字成为独立 token;查询时对关键词同样分词,配合短语匹配实现中文子串检索。

const CJK = /([一-鿿㐀-䶿])/g

export function segmentForFts(text: string): string {
  return text
    .replace(CJK, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 迁移 v2 升级时,把已有事项重建进独立 FTS 索引(新库无数据时为空操作) */
export function backfillFts(db: DatabaseSync): void {
  const rows = db.prepare('SELECT id, title, description FROM events').all() as {
    id: number
    title: string
    description: string
  }[]
  const insert = db.prepare('INSERT INTO events_fts (rowid, title, description) VALUES (?, ?, ?)')
  for (const r of rows) {
    insert.run(r.id, segmentForFts(r.title), segmentForFts(r.description))
  }
}
