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

-- ============ 默认数据(与 PRD 原型一致) ============
INSERT INTO calendars (name, color, kind, sort_order) VALUES
  ('例行工作', '#12B886', 'schedule', 1),
  ('对接事项', '#339AF0', 'schedule', 2),
  ('报告提交', '#FF922B', 'schedule', 3),
  ('临时通知', '#9775FA', 'schedule', 4),
  ('客运部会议日程', '#F06595', 'meeting', 5),
  ('韩亚项目组', '#51CF66', 'meeting', 6);

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
  }
]
