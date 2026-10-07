import { db } from "../db.js";
import type { SourceInfo } from "../types.js";

const sourceForMetric: Record<string, [string, string]> = {
  users: ["Google Analytics 4", "activeUsers"], new_users: ["Google Analytics 4", "newUsers"], sessions: ["Google Analytics 4", "sessions"], pageviews: ["Google Analytics 4", "screenPageViews"], engagement: ["Google Analytics 4", "userEngagementDuration"], website_clicks: ["Google Analytics 4", "click event"], youtube_views: ["YouTube", "views"], instagram_reach: ["Instagram", "reach"], search_clicks: ["Google Search Console", "clicks"], play_downloads: ["Google Play Console", "installs"], github_views: ["GitHub", "traffic/views"], repository_views: ["GitHub", "traffic/views"], stars: ["GitHub", "stargazers_count"], forks: ["GitHub", "forks_count"], clones: ["GitHub", "traffic/clones"], unique_visitors: ["GitHub", "traffic/views.uniques"], unique_cloners: ["GitHub", "traffic/clones.uniques"],
};
export function sourceInfo(metric: string): SourceInfo {
  const [source, apiMetric] = sourceForMetric[metric] ?? ["Unknown source", metric];
  const sourceRow = db.prepare("SELECT last_success_at,status_detail FROM sources WHERE name=?").get(source) as { last_success_at: string | null; status_detail: string } | undefined;
  return { source, metric: apiMetric, fetchedAt: sourceRow?.last_success_at ?? null, attribution: "directly_measured", availability: sourceRow?.last_success_at ? "available" : "unavailable", detail: sourceRow?.status_detail };
}
export function overview() {
  const kpis = ["users", "new_users", "sessions", "pageviews", "engagement", "website_clicks", "youtube_views", "instagram_reach", "search_clicks", "play_downloads", "github_views"].map((metric) => {
    const row = db.prepare("SELECT value,captured_at FROM metric_snapshots WHERE metric=? ORDER BY captured_at DESC,id DESC LIMIT 1").get(metric) as { value: number; captured_at: string } | undefined;
    return { id: metric, value: row?.value ?? null, capturedAt: row?.captured_at ?? null, info: sourceInfo(metric) };
  });
  const github = db.prepare("SELECT c.id,c.name,c.url,c.metadata_json, MAX(CASE WHEN m.metric='repository_views' THEN m.value END) views, MAX(CASE WHEN m.metric='clones' THEN m.value END) clones, MAX(CASE WHEN m.metric='stars' THEN m.value END) stars, MAX(CASE WHEN m.metric='forks' THEN m.value END) forks FROM content c LEFT JOIN metric_snapshots m ON c.id=m.content_id WHERE c.source_id='github' GROUP BY c.id ORDER BY COALESCE(views,0) DESC, COALESCE(stars,0) DESC LIMIT 12").all();
  return { kpis, github };
}
export function sourceStatuses() { return db.prepare("SELECT id,name,status,status_detail,last_success_at,last_attempt_at FROM sources ORDER BY CASE id WHEN 'ga4' THEN 1 WHEN 'search_console' THEN 2 WHEN 'youtube' THEN 3 WHEN 'instagram' THEN 4 WHEN 'github' THEN 5 ELSE 99 END").all(); }
export function metricSeries(metric: string, days = 30) { return db.prepare("SELECT substr(captured_at,1,10) AS date,SUM(value) AS value FROM metric_snapshots WHERE metric=? AND captured_at >= datetime('now', ?) GROUP BY substr(captured_at,1,10) ORDER BY date").all(metric, `-${Math.min(Math.max(days, 1), 365)} days`); }
export function insights() {
  const repositories = db.prepare("SELECT c.name,MAX(CASE WHEN m.metric='repository_views' THEN m.value END) views,MAX(CASE WHEN m.metric='stars' THEN m.value END) stars FROM content c LEFT JOIN metric_snapshots m ON m.content_id=c.id WHERE c.source_id='github' GROUP BY c.id HAVING views IS NOT NULL OR stars IS NOT NULL ORDER BY COALESCE(views,0) DESC LIMIT 3").all() as Array<{ name: string; views: number | null; stars: number | null }>;
  return repositories.map((repo, index) => ({ kind: index === 0 ? "top" : "info", title: index === 0 ? "Open-source top performer" : "Repository activity", text: `${repo.name}: ${repo.views ?? 0} GitHub views, ${repo.stars ?? 0} stars.`, metric: "repository_views", attribution: "directly_measured" }));
}
