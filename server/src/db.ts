import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

fs.mkdirSync(config.dataDir, { recursive: true });
export const db = new Database(path.join(config.dataDir, "haas-arts.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL,
  status_detail TEXT, last_success_at TEXT, last_attempt_at TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id), name TEXT NOT NULL,
  external_id TEXT, url TEXT, metadata_json TEXT
);
CREATE TABLE IF NOT EXISTS content (
  id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id), channel_id TEXT,
  external_id TEXT NOT NULL, name TEXT NOT NULL, content_type TEXT NOT NULL, url TEXT,
  published_at TEXT, metadata_json TEXT, UNIQUE(source_id, external_id)
);
CREATE TABLE IF NOT EXISTS metric_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL REFERENCES sources(id),
  channel_id TEXT, content_id TEXT, metric TEXT NOT NULL, value REAL NOT NULL,
  captured_at TEXT NOT NULL, period_start TEXT, period_end TEXT, dimensions_json TEXT,
  attribution TEXT NOT NULL DEFAULT 'directly_measured', fetched_at TEXT NOT NULL,
  UNIQUE(source_id, content_id, metric, captured_at, dimensions_json)
);
CREATE TABLE IF NOT EXISTS traffic_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL REFERENCES sources(id),
  channel_id TEXT, source_name TEXT NOT NULL, medium TEXT, value REAL NOT NULL,
  captured_at TEXT NOT NULL, dimensions_json TEXT, attribution TEXT NOT NULL DEFAULT 'directly_measured'
);
CREATE TABLE IF NOT EXISTS journeys (
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL REFERENCES sources(id),
  source_label TEXT NOT NULL, landing_label TEXT NOT NULL, next_label TEXT, event_label TEXT,
  conversion_label TEXT, value REAL NOT NULL, captured_at TEXT NOT NULL, attribution TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL REFERENCES sources(id), started_at TEXT NOT NULL,
  finished_at TEXT, status TEXT NOT NULL, records_written INTEGER NOT NULL DEFAULT 0, error_message TEXT
);
  CREATE TABLE IF NOT EXISTS oauth_tokens (
  provider TEXT PRIMARY KEY, access_token TEXT NOT NULL, refresh_token TEXT,
  expires_at TEXT, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS agent_sessions (id TEXT PRIMARY KEY, name TEXT NOT NULL, cwd TEXT NOT NULL, status TEXT NOT NULL, task_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, error TEXT);
  CREATE TABLE IF NOT EXISTS agent_tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, prompt TEXT NOT NULL, cwd TEXT, session_id TEXT, priority INTEGER NOT NULL DEFAULT 2, status TEXT NOT NULL, created_at TEXT NOT NULL, started_at TEXT, completed_at TEXT, result TEXT);
  CREATE TABLE IF NOT EXISTS agent_events (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, session_id TEXT, task_id TEXT, detail TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_snapshots_metric_date ON metric_snapshots(metric, captured_at);
CREATE INDEX IF NOT EXISTS idx_snapshots_source ON metric_snapshots(source_id, captured_at);
`);

const sources = [
  ["github", "GitHub"], ["ga4", "Google Analytics 4"], ["search_console", "Google Search Console"],
  ["youtube", "YouTube"], ["instagram", "Instagram"], ["google_business", "Google Business Profile"],
  ["google_play", "Google Play Console"], ["google_groups", "Google Groups"],
] as const;
const insert = db.prepare("INSERT OR IGNORE INTO sources (id,name,status,status_detail,updated_at) VALUES (?,?,'authentication_required','Connection required',?)");
for (const [id, name] of sources) insert.run(id, name, new Date().toISOString());

export function updateSource(id: string, status: string, detail: string, success = false) {
  const now = new Date().toISOString();
  db.prepare("UPDATE sources SET status=?,status_detail=?,last_attempt_at=?,last_success_at=CASE WHEN ? THEN ? ELSE last_success_at END,updated_at=? WHERE id=?")
    .run(status, detail, now, success ? 1 : 0, now, now, id);
}
