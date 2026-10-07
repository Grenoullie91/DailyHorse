import { BaseConnector } from "./base.js";
import { config } from "../config.js";
import { db } from "../db.js";
import type { SourceStatus } from "../types.js";
import { execFileSync } from "node:child_process";

type Repo = { id: number; name: string; full_name: string; html_url: string; description: string | null; language: string | null; stargazers_count: number; forks_count: number; open_issues_count: number; pushed_at: string; license: { spdx_id: string } | null; owner: { login: string } };
type Traffic = { count: number; uniques: number; views?: Array<{ timestamp: string; count: number; uniques: number }> };

export class GitHubConnector extends BaseConnector {
  id = "github";
  name = "GitHub";
  private base = "https://api.github.com";
  private cliToken?: string;
  private token() {
    if (config.github.token) return config.github.token;
    if (this.cliToken !== undefined) return this.cliToken || undefined;
    try { this.cliToken = execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
    catch { this.cliToken = ""; }
    return this.cliToken || undefined;
  }
  private headers() { const token = this.token(); return { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(token ? { Authorization: `Bearer ${token}` } : {}) }; }
  async status(): Promise<{ status: SourceStatus; detail: string }> {
    return this.token() ? { status: "connected", detail: "Authenticated through the local GitHub CLI keyring; traffic metrics require repository push access." } : { status: "authentication_required", detail: "GITHUB_TOKEN or an authenticated GitHub CLI session is required for private data and traffic analytics." };
  }
  private async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.base}${endpoint}`, { headers: this.headers() });
    if (!response.ok) throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
    return response.json() as Promise<T>;
  }
  private snapshot(contentId: string, metric: string, value: number, capturedAt: string, dimensions?: object) {
    db.prepare("INSERT OR IGNORE INTO metric_snapshots(source_id,content_id,metric,value,captured_at,dimensions_json,fetched_at) VALUES ('github',?,?,?,?,?,?)")
      .run(contentId, metric, value, capturedAt, JSON.stringify(dimensions ?? {}), new Date().toISOString());
  }
  async collect(): Promise<number> {
    const repositories = await this.get<Repo[]>(`/users/${encodeURIComponent(config.github.username)}/repos?per_page=100&sort=updated`);
    const now = new Date().toISOString(); let count = 0;
    for (const repo of repositories) {
      const contentId = `github:repo:${repo.id}`;
      db.prepare("INSERT INTO channels(id,source_id,name,external_id,url,metadata_json) VALUES ('github:profile','github',?,?,?,?) ON CONFLICT(id) DO UPDATE SET metadata_json=excluded.metadata_json")
        .run(config.github.username, config.github.username, `https://github.com/${config.github.username}`, "{}");
      db.prepare("INSERT INTO content(id,source_id,channel_id,external_id,name,content_type,url,published_at,metadata_json) VALUES (?,'github','github:profile',?,?,?,?,?,?) ON CONFLICT(source_id,external_id) DO UPDATE SET name=excluded.name,metadata_json=excluded.metadata_json,url=excluded.url")
        .run(contentId, String(repo.id), repo.name, "repository", repo.html_url, repo.pushed_at, JSON.stringify({ description: repo.description, language: repo.language, license: repo.license?.spdx_id ?? null, fullName: repo.full_name }));
      for (const [metric, value] of [["stars", repo.stargazers_count], ["forks", repo.forks_count], ["open_issues", repo.open_issues_count]] as const) { this.snapshot(contentId, metric, value, now); count++; }
      if (!this.token()) continue;
      try {
        const [views, clones] = await Promise.all([this.get<Traffic>(`/repos/${repo.full_name}/traffic/views`), this.get<Traffic>(`/repos/${repo.full_name}/traffic/clones`)]);
        this.snapshot(contentId, "repository_views", views.count, now); this.snapshot(contentId, "unique_visitors", views.uniques, now);
        this.snapshot(contentId, "clones", clones.count, now); this.snapshot(contentId, "unique_cloners", clones.uniques, now); count += 4;
        for (const row of views.views ?? []) { this.snapshot(contentId, "repository_views", row.count, row.timestamp, { granularity: "day" }); this.snapshot(contentId, "unique_visitors", row.uniques, row.timestamp, { granularity: "day" }); count += 2; }
        for (const row of clones.views ?? []) { this.snapshot(contentId, "clones", row.count, row.timestamp, { granularity: "day" }); this.snapshot(contentId, "unique_cloners", row.uniques, row.timestamp, { granularity: "day" }); count += 2; }
      } catch (error) { /* Public repository metrics remain valid when traffic access is unavailable. */ }
    }
    return count;
  }
}
