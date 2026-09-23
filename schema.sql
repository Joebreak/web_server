-- 本地 / 遠端 D1 建表（表名對應 API 路徑 /api/d1/...）
CREATE TABLE IF NOT EXISTS d1 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room INTEGER NOT NULL,
  round INTEGER NOT NULL DEFAULT 0,
  type TEXT,
  list TEXT,
  data TEXT
);
