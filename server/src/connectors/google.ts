import { BaseConnector } from "./base.js";
import { config } from "../config.js";
import { db } from "../db.js";
import type { SourceStatus } from "../types.js";
import { googleAccessToken } from "../services/google-oauth.js";

abstract class GoogleConnector extends BaseConnector {
  protected async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const accessToken = await googleAccessToken();
    if (!accessToken) throw new Error("Google OAuth access token is not configured.");
    const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...init.headers } });
    if (!response.ok) throw new Error(`Google API ${response.status}: ${await response.text()}`);
    return response.json() as Promise<T>;
  }
  protected putMetric(metric: string, value: number, capturedAt: string, dimensions: object = {}) {
    db.prepare("INSERT OR IGNORE INTO metric_snapshots(source_id,metric,value,captured_at,dimensions_json,fetched_at) VALUES (?,?,?,?,?,?)")
      .run(this.id, metric, value, capturedAt, JSON.stringify(dimensions), new Date().toISOString());
  }
  protected configured(required?: string) { return Boolean((config.google.accessToken || db.prepare("SELECT 1 FROM oauth_tokens WHERE provider='google'").get()) && required); }
}

export class Ga4Connector extends GoogleConnector {
  id = "ga4"; name = "Google Analytics 4";
  async status(): Promise<{ status: SourceStatus; detail: string }> { return this.configured(config.google.ga4PropertyId) ? { status: "connected", detail: "OAuth and GA4 property configured." } : { status: "authentication_required", detail: "GOOGLE_ACCESS_TOKEN and GA4_PROPERTY_ID required." }; }
  async collect() {
    const property = config.google.ga4PropertyId!;
    const report = await this.request<{ rows?: Array<{ dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }> }>(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`, { method: "POST", body: JSON.stringify({ dateRanges: [{ startDate: "30daysAgo", endDate: "today" }], dimensions: [{ name: "date" }], metrics: [{ name: "activeUsers" }, { name: "newUsers" }, { name: "sessions" }, { name: "screenPageViews" }, { name: "userEngagementDuration" }, { name: "eventCount" }] }) });
    const metrics = ["users", "new_users", "sessions", "pageviews", "engagement", "events"]; let writes = 0;
    for (const row of report.rows ?? []) { const date = row.dimensionValues[0]?.value; const capturedAt = date?.match(/^\d{8}$/) ? `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6)}T00:00:00.000Z` : new Date().toISOString(); row.metricValues.forEach((entry, index) => { this.putMetric(metrics[index], Number(entry.value), capturedAt, { granularity: "day" }); writes++; }); }
    return writes;
  }
}

export class SearchConsoleConnector extends GoogleConnector {
  id = "search_console"; name = "Google Search Console";
  async status(): Promise<{ status: SourceStatus; detail: string }> { return this.configured(config.google.searchConsoleSiteUrl) ? { status: "connected", detail: "OAuth and verified Search Console property configured." } : { status: "authentication_required", detail: "GOOGLE_ACCESS_TOKEN and SEARCH_CONSOLE_SITE_URL required." }; }
  async collect() {
    const site = encodeURIComponent(config.google.searchConsoleSiteUrl!);
    const endDate = new Date().toISOString().slice(0, 10); const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const report = await this.request<{ rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }> }>(`https://searchconsole.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`, { method: "POST", body: JSON.stringify({ startDate: start, endDate, dimensions: ["date"], rowLimit: 25000 }) });
    let writes = 0;
    for (const row of report.rows ?? []) { const capturedAt = `${row.keys[0]}T00:00:00.000Z`; for (const [metric, value] of [["search_clicks", row.clicks], ["search_impressions", row.impressions], ["search_ctr", row.ctr], ["search_position", row.position]] as const) { this.putMetric(metric, value, capturedAt, { granularity: "day" }); writes++; } }
    return writes;
  }
}

export class YouTubeConnector extends GoogleConnector {
  id = "youtube"; name = "YouTube";
  async status(): Promise<{ status: SourceStatus; detail: string }> { return (config.google.accessToken || db.prepare("SELECT 1 FROM oauth_tokens WHERE provider='google'").get()) ? { status: "connected", detail: "Google OAuth configured; channel owner access is validated at sync." } : { status: "authentication_required", detail: "Google OAuth token with YouTube Analytics access required." }; }
  async collect() {
    const report = await this.request<{ rows?: Array<Array<string | number>> }>("https://youtubeanalytics.googleapis.com/v2/reports?ids=channel%3D%3DMINE&startDate=" + new Date(Date.now() - 30 * 86400000).toISOString().slice(0,10) + "&endDate=" + new Date().toISOString().slice(0,10) + "&metrics=views,likes,comments,shares,estimatedMinutesWatched,averageViewDuration&dimensions=day&sort=day");
    const metrics = ["youtube_views", "youtube_likes", "youtube_comments", "youtube_shares", "youtube_watch_minutes", "youtube_average_view_duration"]; let writes = 0;
    for (const row of report.rows ?? []) { const capturedAt = `${row[0]}T00:00:00.000Z`; metrics.forEach((metric, index) => { this.putMetric(metric, Number(row[index + 1]), capturedAt, { granularity: "day" }); writes++; }); }
    return writes;
  }
}
