/**
 * 数据库迁移:按版本顺序执行,已执行版本记录于 schema_migrations 表
 */

export interface Migration {
  version: number
  name: string
  up: string
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial-schema',
    up: `
-- ============ 日历分类 ============
CREATE TABLE calendars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#12B886',
  kind TEXT NOT NULL DEFAULT 'schedule' CHECK (kind IN ('schedule','meeting')),
  is_visible INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ============ 事项(日程/会议/时间轴节点统一) ============
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  calendar_id INTEGER REFERENCES calendars(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'task' CHECK (kind IN ('task','meeting')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  start_time TEXT,
  end_time TEXT,
  all_day INTEGER NOT NULL DEFAULT 0,
  location TEXT NOT NULL DEFAULT '',
  attendees TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done','cancelled')),
  category TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  reminder_enabled INTEGER NOT NULL DEFAULT 1,
  reminder_minutes INTEGER,
  reminder_days INTEGER,
  related_files TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX idx_events_start ON events(start_time);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_calendar ON events(calendar_id);
CREATE INDEX idx_events_kind ON events(kind);

-- 标题/描述全文索引(板块 10 全文检索使用)
CREATE VIRTUAL TABLE events_fts USING fts5(title, description, content='events', content_rowid='id');

CREATE TRIGGER events_ai AFTER INSERT ON events BEGIN
  INSERT INTO events_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
END;
CREATE TRIGGER events_ad AFTER DELETE ON events BEGIN
  INSERT INTO events_fts(events_fts, rowid, title, description) VALUES ('delete', old.id, old.title, old.description);
END;
CREATE TRIGGER events_au AFTER UPDATE ON events BEGIN
  INSERT INTO events_fts(events_fts, rowid, title, description) VALUES ('delete', old.id, old.title, old.description);
  INSERT INTO events_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
END;

-- ============ 联系人 ============
CREATE TABLE contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  wechat TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  remark TEXT NOT NULL DEFAULT '',
  avatar_color TEXT NOT NULL DEFAULT '#CED4DA',
  is_favorite INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE contact_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '📁',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE contact_group_map (
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES contact_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, group_id)
);

-- ============ 文件板块 ============
CREATE TABLE file_boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '📁',
  color TEXT NOT NULL DEFAULT '#FFD43B',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 文件索引(板块 08 文件板块使用)
CREATE TABLE file_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL REFERENCES file_boards(id) ON DELETE CASCADE,
  relative_path TEXT NOT NULL,
  name TEXT NOT NULL,
  ext TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  mtime TEXT NOT NULL DEFAULT '',
  indexed_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX idx_file_items_board ON file_items(board_id);
CREATE INDEX idx_file_items_name ON file_items(name);

-- ============ 提醒 ============
CREATE TABLE reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  remind_at TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'event' CHECK (type IN ('event','deadline','followup','daily')),
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fired','dismissed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  fired_at TEXT
);

CREATE INDEX idx_reminders_pending ON reminders(status, remind_at);

-- ============ 设置 ============
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ============ 默认设置 ============
-- 注意:日历分类不再内置预设,由用户在日历页「管理日历」中自行创建(见 v3 迁移)
INSERT INTO settings (key, value) VALUES
  ('meeting_reminder_minutes', '15'),
  ('daily_push_time', '09:00'),
  ('deadline_reminder_days', '2'),
  ('followup_reminder_days', '2');
`
  },
  {
    version: 2,
    name: 'fts-standalone-for-cjk',
    // unicode61 分词器不切分中文,触发器自动同步无法用于中文检索。
    // 改为独立 FTS 表 + 应用层分词维护(events.ts 在写入时对汉字插空格建索引,查询时同样分词)
    up: `
DROP TRIGGER IF EXISTS events_ai;
DROP TRIGGER IF EXISTS events_ad;
DROP TRIGGER IF EXISTS events_au;
DROP TABLE IF EXISTS events_fts;
CREATE VIRTUAL TABLE events_fts USING fts5(title, description);
`
  },
  {
    version: 3,
    name: 'no-preset-calendars',
    // 日历分类由用户自行创建(日历页「管理日历」)。清理 v1 内置的 6 个预设日历,
    // 仅删除尚无事项关联的(保护用户已实际使用的分类)
    up: `
DELETE FROM calendars
 WHERE name IN ('例行工作','对接事项','报告提交','临时通知','客运部会议日程','韩亚项目组')
   AND id NOT IN (SELECT DISTINCT calendar_id FROM events WHERE calendar_id IS NOT NULL);
`
  },
  {
    version: 4,
    name: 'contact-kind-for-groups',
    // 板块 05 联络接口:通讯录同时容纳个人联系人与微信群/钉钉群等群组记录(PRD 4.6)
    up: `
ALTER TABLE contacts ADD COLUMN kind TEXT NOT NULL DEFAULT 'person';
ALTER TABLE contacts ADD COLUMN member_count INTEGER;
ALTER TABLE contacts ADD COLUMN purpose TEXT NOT NULL DEFAULT '';
`
  },
  {
    version: 5,
    name: 'file-item-content',
    // 板块 08 文件板块:文件索引带正文文本,支持跨板块按内容检索
    // (txt/md/csv/json 等文本 + xlsx 单元格 + docx 正文;PDF 仅按文件名)
    up: `
ALTER TABLE file_items ADD COLUMN content TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_file_items_board_path ON file_items(board_id, relative_path);
`
  },
  {
    version: 6,
    name: 'summary-drafts',
    // 板块 09 工作纲要导出:按周期保存用户编辑后的纲要草稿
    // (content 为 SummaryContent JSON,含章节/手动补充事项/备注)
    up: `
CREATE TABLE summary_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_type TEXT NOT NULL CHECK (period_type IN ('month','week','custom')),
  period_key TEXT NOT NULL,
  title TEXT NOT NULL,
  range_start TEXT NOT NULL,
  range_end TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (period_type, period_key)
);
CREATE INDEX idx_summary_drafts_updated ON summary_drafts(updated_at);
`
  },
  {
    version: 7,
    name: 'routine-task-series',
    // 例行事项(每周固定星期/时间):系列表保存模板,每周期次在 events 中落地为独立行,
    // 可单独完成、编辑、删除;例外日期表防止「仅删除/仅修改本次」被后续续期重新生成。
    // 历史事项默认 task_type='temporary',行为不变。
    up: `
CREATE TABLE event_series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  calendar_id INTEGER REFERENCES calendars(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  attendees TEXT NOT NULL DEFAULT '[]',
  category TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  reminder_enabled INTEGER NOT NULL DEFAULT 1,
  reminder_minutes INTEGER,
  reminder_days INTEGER,
  generated_until TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE event_series_exceptions (
  series_id INTEGER NOT NULL REFERENCES event_series(id) ON DELETE CASCADE,
  occurrence_date TEXT NOT NULL,
  PRIMARY KEY (series_id, occurrence_date)
);

ALTER TABLE events ADD COLUMN task_type TEXT NOT NULL DEFAULT 'temporary';
ALTER TABLE events ADD COLUMN series_id INTEGER REFERENCES event_series(id) ON DELETE SET NULL;
CREATE INDEX idx_events_series ON events(series_id);
CREATE INDEX idx_event_series_active ON event_series(active);
`
  },
  {
    version: 8,
    name: 'meeting-display-and-summary-notice',
    // 会议信息默认使用文字标签(用户可在设置页切回图标);
    // 工作纲要新增「会议通知」章节:已有自定义模板一次性补入该章节
    // (紧跟「会议参与」之后,保持与标准章节一致),之后用户仍可在模板设置中关闭。
    // 空 sections 不补,避免破坏原有回退语义。
    up: `
INSERT OR IGNORE INTO settings (key, value) VALUES ('meeting_display_mode', 'text');

UPDATE settings
   SET value = json_set(value, '$.sections', json((
     SELECT json_group_array(v) FROM (
       SELECT json_each.value AS v, json_each.key AS k, 0 AS sub
         FROM json_each(json_extract(settings.value, '$.sections'))
       UNION ALL
       SELECT 'meeting_notice', json_each.key, 1
         FROM json_each(json_extract(settings.value, '$.sections'))
        WHERE json_each.value = 'meeting'
       UNION ALL
       SELECT 'meeting_notice', json_array_length(json_extract(settings.value, '$.sections')) - 1, 1
        WHERE NOT EXISTS (
          SELECT 1
            FROM json_each(json_extract(settings.value, '$.sections'))
           WHERE json_each.value = 'meeting'
        )
       ORDER BY k, sub
     )
   )))
 WHERE key = 'summary_template'
   AND json_valid(value)
   AND json_type(value, '$.sections') = 'array'
   AND json_array_length(value, '$.sections') > 0
   AND NOT EXISTS (
     SELECT 1
       FROM json_each(json_extract(settings.value, '$.sections'))
      WHERE json_each.value = 'meeting_notice'
   );
`
  }
]
