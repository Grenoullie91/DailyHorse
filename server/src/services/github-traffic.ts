import { db } from "../db.js";

type Capability = { state: "available" | "permission_missing" | "authentication_required" | "unavailable"; detail: string; checkedAt: string | null };

export function topRepositories(days = 14) {
  const periodDays = Math.min(Math.max(Math.floor(days), 1), 14);
  const capability = db.prepare("SELECT state,detail,checked_at FROM github_capabilities WHERE capability='traffic_views'").get() as { state: Capability["state"]; detail: string; checked_at: string } | undefined;
  const source = db.prepare("SELECT status,status_detail FROM sources WHERE id='github'").get() as { status: string; status_detail: string | null } | undefined;
  const repositories = db.prepare(`
    SELECT c.name,c.url,
      COALESCE(SUM(CASE WHEN m.metric='repository_views' THEN m.value END), 0) AS views,
      COALESCE(SUM(CASE WHEN m.metric='unique_visitors' THEN m.value END), 0) AS uniqueVisitors,
      COALESCE(SUM(CASE WHEN m.metric='repository_views' AND substr(m.captured_at,1,10)=date('now') THEN m.value END), 0) AS todayViews
    FROM content c
    JOIN metric_snapshots m ON m.content_id=c.id
    WHERE c.source_id='github'
      AND m.metric IN ('repository_views','unique_visitors')
      AND m.captured_at >= datetime('now', ?)
      AND json_extract(m.dimensions_json, '$.granularity')='day'
    GROUP BY c.id
    ORDER BY views DESC, c.name COLLATE NOCASE
    LIMIT 12
  `).all(`-${periodDays - 1} days`);
  return {
    days: periodDays,
    capability: capability ? { state: capability.state, detail: capability.detail, checkedAt: capability.checked_at } : (source?.status === "authentication_required"
      ? { state: "authentication_required", detail: source.status_detail ?? "GitHub authentication is required for Traffic Views.", checkedAt: null }
      : { state: "unavailable", detail: "Traffic Views has not been checked yet. Run a GitHub sync.", checkedAt: null }),
    repositories,
  };
}
