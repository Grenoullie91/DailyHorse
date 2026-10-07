import fs from "node:fs";
import path from "node:path";

const root = process.env.EDITORIAL_ROOT ?? "/home/haas/Dokumente/Projekte/haasarts.de/blog";
function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(path.join(root, file), "utf8")) as T; } catch { return fallback; }
}

export function editorialOverview() {
  const articles = readJson<{ generated?: string; articles?: Array<{ title: string; url: string; date: string; category: string; readingTime?: number }> }>("data/articles.json", {});
  const news = readJson<{ updatedAt?: string; items?: Array<{ id: string; title: string; source: string; sourceItemUrl: string; score?: number; status?: string; verdict?: string }> }>("data/news-cache.json", {});
  const health = readJson<{ updatedAt?: string; counts?: Record<string, number> }>("data/source-health.json", {});
  const draftsDir = path.join(root, "content/drafts");
  const draftCount = fs.existsSync(draftsDir) ? fs.readdirSync(draftsDir, { recursive: true }).filter((entry) => String(entry).endsWith(".md")).length : 0;
  const suggestions = (news.items ?? []).filter((item) => item.status === "new" && item.verdict !== "reject").sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 6);
  return { publishedCount: articles.articles?.length ?? 0, draftCount, generatedAt: articles.generated ?? null, latest: (articles.articles ?? []).slice(0, 5), suggestions, newsUpdatedAt: news.updatedAt ?? null, sourceHealth: health.counts ?? {}, sourceHealthUpdatedAt: health.updatedAt ?? null, adminUrl: "http://127.0.0.1:8081/", blogUrl: "https://www.haasarts.de/blog/" };
}
