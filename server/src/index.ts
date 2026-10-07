import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import fs from "node:fs";
import { config } from "./config.js";
import { overview, sourceStatuses, metricSeries, insights } from "./services/analytics.js";
import { connectorById } from "./connectors/index.js";
import { startScheduler, syncConnector } from "./scheduler.js";
import { authorizationUrl, completeAuthorization } from "./services/google-oauth.js";
import { metaAuthorizationUrl, completeMetaAuthorization } from "./services/meta-oauth.js";
import { editorialOverview } from "./services/editorial.js";

const app = Fastify({ logger: true });
await app.register(cors, { origin: `http://${config.host}:5174` });
app.get("/api/health", async () => ({ ok: true, now: new Date().toISOString() }));
app.get("/api/overview", async () => overview());
app.get("/api/sources", async () => sourceStatuses());
app.get("/api/series/:metric", async (request) => metricSeries((request.params as { metric: string }).metric, Number((request.query as { days?: string }).days ?? 30)));
app.get("/api/insights", async () => insights());
app.get("/api/editorial", async () => editorialOverview());
app.get("/api/assets/:asset", async (request, reply) => {
  const files: Record<string, string> = { logo: "/home/haas/Downloads/logodashboard.png", header: "/home/haas/Downloads/Headerdashboard.png" };
  const file = files[(request.params as { asset: string }).asset];
  if (!file || !fs.existsSync(file)) return reply.code(404).send({ error: "Asset not found" });
  return reply.type("image/png").send(fs.createReadStream(file));
});
app.post("/api/sync", async () => syncConnector());
app.post("/api/sync/:sourceId", async (request, reply) => {
  const sourceId = (request.params as { sourceId: string }).sourceId;
  if (!connectorById.has(sourceId)) return reply.code(404).send({ error: "Unknown source" });
  return syncConnector(sourceId);
});
app.get("/api/oauth/google/start", async (_, reply) => reply.redirect(authorizationUrl()));
app.get("/api/oauth/google/callback", async (request, reply) => {
  const { code, state, error } = request.query as { code?: string; state?: string; error?: string };
  if (error || !code || !state) return reply.code(400).type("text/html").send("<h1>Google connection was not completed.</h1>");
  try { await completeAuthorization(code, state); return reply.type("text/html").send("<script>location.replace('/')</script><p>Google connected. You can close this window.</p>"); }
  catch (oauthError) { return reply.code(400).type("text/html").send(`<h1>Google connection failed</h1><p>${oauthError instanceof Error ? oauthError.message : "Unknown error"}</p>`); }
});
app.get("/api/oauth/meta/start", async (_, reply) => reply.redirect(metaAuthorizationUrl()));
app.get("/api/oauth/meta/callback", async (request, reply) => {
  const { code, state, error } = request.query as { code?: string; state?: string; error?: string };
  if (error || !code || !state) return reply.code(400).type("text/html").send("<h1>Instagram connection was not completed.</h1>");
  try { await completeMetaAuthorization(code, state); return reply.type("text/html").send("<script>location.replace('/')</script><p>Instagram connected. You can close this window.</p>"); }
  catch (oauthError) { return reply.code(400).type("text/html").send(`<h1>Instagram connection failed</h1><p>${oauthError instanceof Error ? oauthError.message : "Unknown error"}</p>`); }
});
const webRoot = path.resolve("dist/web");
if (fs.existsSync(webRoot)) {
  await app.register(fastifyStatic, { root: webRoot });
  app.setNotFoundHandler((_, reply) => reply.sendFile("index.html"));
}
startScheduler();
await app.listen({ host: config.host, port: config.port });
