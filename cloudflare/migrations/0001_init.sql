CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  site TEXT NOT NULL,
  display_name TEXT,
  page_url TEXT,
  endpoint TEXT,
  model TEXT,
  text TEXT,
  attachments_json TEXT,
  raw TEXT,
  name TEXT,
  mime_type TEXT,
  size INTEGER,
  hash TEXT,
  skipped INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_records_ts ON records(ts DESC);
CREATE INDEX IF NOT EXISTS idx_records_kind ON records(kind);
CREATE INDEX IF NOT EXISTS idx_records_site ON records(site);