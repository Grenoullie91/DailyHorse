import { BaseConnector } from "./base.js";
import { db } from "../db.js";
import { config } from "../config.js";
import { metaAccessToken } from "../services/meta-oauth.js";
import type { SourceStatus } from "../types.js";

type InstagramMedia = { id: string; caption?: string; media_type?: string; media_product_type?: string; permalink?: string; timestamp?: string; like_count?: number; comments_count?: number };

export class InstagramConnector extends BaseConnector {
  id = "instagram";
  name = "Instagram";
  private async request<T>(path: string, accessToken?: string) {
    const token = accessToken ?? await metaAccessToken();
    if (!token) throw new Error("Instagram authorization is required.");
    const url = new URL(`https://graph.facebook.com/v24.0${path}`);
    url.searchParams.set("access_token", token);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Instagram API ${response.status}: ${await response.text()}`);
    return response.json() as Promise<T>;
  }
  async status(): Promise<{ status: SourceStatus; detail: string }> {
    if (!config.meta.appId || !config.meta.appSecret) return { status: "authentication_required", detail: "Meta App ID and App Secret must be configured locally." };
    return await metaAccessToken() ? { status: "connected", detail: "Facebook Login connected; available metrics depend on media type and granted permissions." } : { status: "authentication_required", detail: "Facebook Login authorization required." };
  }
  private snapshot(contentId: string, metric: string, value: number, capturedAt: string, dimensions: object = {}) {
    db.prepare("INSERT OR IGNORE INTO metric_snapshots(source_id,content_id,metric,value,captured_at,dimensions_json,fetched_at) VALUES ('instagram',?,?,?,?,?,?)")
      .run(contentId, metric, value, capturedAt, JSON.stringify(dimensions), new Date().toISOString());
  }
  async collect() {
    const pages = await this.request<{ data?: Array<{ id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string; media_count?: number } }> }>("/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,media_count}");
    const page = pages.data?.find((candidate) => candidate.instagram_business_account);
    if (!page?.instagram_business_account) throw new Error("No Instagram professional account was found on the accessible Facebook Pages.");
    const profile = page.instagram_business_account;
    db.prepare("INSERT INTO channels(id,source_id,name,external_id,url,metadata_json) VALUES ('instagram:profile','instagram',?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,metadata_json=excluded.metadata_json")
      .run(profile.username ?? "Instagram", profile.id, profile.username ? `https://www.instagram.com/${profile.username}/` : null, JSON.stringify({ facebookPageId: page.id, facebookPageName: page.name, mediaCount: profile.media_count }));
    const mediaResponse = await this.request<{ data?: InstagramMedia[] }>(`/${profile.id}/media?fields=id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count&limit=100`, page.access_token);
    let writes = 0;
    for (const media of mediaResponse.data ?? []) {
      const contentId = `instagram:media:${media.id}`; const capturedAt = media.timestamp ?? new Date().toISOString();
      db.prepare("INSERT INTO content(id,source_id,channel_id,external_id,name,content_type,url,published_at,metadata_json) VALUES (?,'instagram','instagram:profile',?,?,?,?,?,?) ON CONFLICT(source_id,external_id) DO UPDATE SET name=excluded.name,metadata_json=excluded.metadata_json,url=excluded.url")
        .run(contentId, media.id, media.caption?.slice(0, 120) || `${media.media_product_type ?? media.media_type} ${media.id}`, media.media_product_type ?? media.media_type ?? "media", media.permalink ?? null, media.timestamp ?? null, JSON.stringify({ mediaType: media.media_type, productType: media.media_product_type }));
      for (const [metric, value] of [["instagram_likes", media.like_count], ["instagram_comments", media.comments_count]] as const) { if (typeof value === "number") { this.snapshot(contentId, metric, value, capturedAt); writes++; } }
      for (const metric of ["reach", "impressions", "saved", "shares", "total_interactions", "video_views"] as const) {
        try { const insights = await this.request<{ data?: Array<{ values?: Array<{ value: number }> }> }>(`/${media.id}/insights?metric=${metric}`, page.access_token); const value = insights.data?.[0]?.values?.[0]?.value; if (typeof value === "number") { this.snapshot(contentId, `instagram_${metric}`, value, capturedAt, { direct: true }); writes++; } }
        catch { /* Meta exposes insight metrics per media type; unavailable fields are intentionally omitted. */ }
      }
    }
    return writes;
  }
}
