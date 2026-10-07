import crypto from "node:crypto";
import fs from "node:fs";
import { BaseConnector } from "./base.js";
import { config } from "../config.js";
import { db } from "../db.js";
import type { SourceStatus } from "../types.js";

type ServiceAccount = { type: string; client_email: string; private_key: string; token_uri?: string };
type Review = { reviewId: string; comments?: Array<{ userComment?: { starRating?: number; lastModified?: { seconds?: string } } }> };

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

export class GooglePlayConnector extends BaseConnector {
  id = "google_play";
  name = "Google Play Console";
  private token?: { value: string; expiresAt: number };

  private account(): ServiceAccount | undefined {
    const file = config.play.serviceAccountFile;
    if (!file || !fs.existsSync(file)) return undefined;
    const account = JSON.parse(fs.readFileSync(file, "utf8")) as ServiceAccount;
    return account.type === "service_account" && account.client_email && account.private_key ? account : undefined;
  }

  async status(): Promise<{ status: SourceStatus; detail: string }> {
    if (!this.account()) return { status: "authentication_required", detail: "PLAY_SERVICE_ACCOUNT_FILE must reference a valid local service-account JSON key." };
    if (!config.play.packageNames.length) return { status: "permission_missing", detail: "PLAY_PACKAGE_NAMES must contain the Android package names to report." };
    return { status: "connected", detail: "Local service-account key configured; Play Console permissions are validated at sync." };
  }

  private async accessToken() {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const account = this.account();
    if (!account) throw new Error("Play service-account key is unavailable.");
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = base64url(JSON.stringify({ iss: account.client_email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: account.token_uri ?? "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
    const signer = crypto.createSign("RSA-SHA256"); signer.update(`${header}.${payload}`); signer.end();
    const assertion = `${header}.${payload}.${signer.sign(account.private_key, "base64url")}`;
    const response = await fetch(account.token_uri ?? "https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
    if (!response.ok) throw new Error(`Play service-account token exchange failed: ${await response.text()}`);
    const token = await response.json() as { access_token: string; expires_in: number };
    this.token = { value: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 };
    return token.access_token;
  }

  private async request<T>(url: string): Promise<T> {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${await this.accessToken()}` } });
    if (!response.ok) throw new Error(`Google Play API ${response.status}: ${await response.text()}`);
    return response.json() as Promise<T>;
  }

  async collect() {
    let writes = 0; const failures: string[] = [];
    for (const packageName of config.play.packageNames) {
      try {
        const contentId = `google_play:app:${packageName}`;
        db.prepare("INSERT INTO channels(id,source_id,name,external_id,metadata_json) VALUES ('google_play:developer','google_play','Haas Arts Play Console','',?) ON CONFLICT(id) DO NOTHING").run("{}");
        db.prepare("INSERT INTO content(id,source_id,channel_id,external_id,name,content_type,metadata_json) VALUES (?,'google_play','google_play:developer',?,?, 'app',?) ON CONFLICT(source_id,external_id) DO UPDATE SET name=excluded.name")
          .run(contentId, packageName, packageName, JSON.stringify({ packageName }));
        const result = await this.request<{ reviews?: Review[] }>(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/reviews?maxResults=100`);
        const reviews = result.reviews ?? []; const ratings = reviews.flatMap((review) => review.comments?.map((comment) => comment.userComment?.starRating).filter((rating): rating is number => typeof rating === "number") ?? []);
        const now = new Date().toISOString();
        for (const [metric, value] of [["play_reviews", reviews.length], ["play_average_rating", ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0]] as const) {
          db.prepare("INSERT OR IGNORE INTO metric_snapshots(source_id,content_id,metric,value,captured_at,dimensions_json,fetched_at) VALUES ('google_play',?,?,?,?,?,?)")
            .run(contentId, metric, value, now, JSON.stringify({ scope: "reviews_api_page", packageName }), now); writes++;
        }
      } catch (error) { failures.push(`${packageName}: ${error instanceof Error ? error.message : "unknown error"}`); }
    }
    if (failures.length === config.play.packageNames.length) throw new Error(failures.join(" | "));
    return writes;
  }
}
