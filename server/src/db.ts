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

// Additive migrations keep existing local SQLite files intact during upgrades.
db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
function migrate(id: string, sql: string) {
  if (db.prepare("SELECT 1 FROM schema_migrations WHERE id=?").get(id)) return;
  db.transaction(() => {
    db.exec(sql);
    db.prepare("INSERT INTO schema_migrations(id,applied_at) VALUES (?,?)").run(id, new Date().toISOString());
  })();
}

migrate("2026-10-07-work-os", `
  CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE research_queue (id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT, url TEXT, status TEXT NOT NULL DEFAULT 'inbox', project_id TEXT REFERENCES projects(id) ON DELETE SET NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE integration_setup (provider TEXT PRIMARY KEY, state TEXT NOT NULL, detail TEXT NOT NULL, updated_at TEXT NOT NULL);
  ALTER TABLE agent_tasks ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
  CREATE INDEX idx_agent_tasks_project ON agent_tasks(project_id, status);
  CREATE INDEX idx_research_queue_status ON research_queue(status, created_at);
  INSERT INTO integration_setup(provider,state,detail,updated_at) VALUES
    ('mail','setup_needed','Mail is not connected. Setup is intentionally manual.',datetime('now')),
    ('calendar','setup_needed','Calendar is not connected. Setup is intentionally manual.',datetime('now'));
`);

migrate("2026-10-07-today-integrations", `
  CREATE TABLE calendar_selections (calendar_id TEXT PRIMARY KEY, selected INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL);
`);

migrate("2026-10-07-remote-files", `
  CREATE TABLE remote_profiles (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, host TEXT NOT NULL, port INTEGER NOT NULL,
    protocol TEXT NOT NULL, username TEXT NOT NULL, remote_root TEXT NOT NULL,
    local_root TEXT NOT NULL, environment TEXT NOT NULL DEFAULT 'production',
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
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
