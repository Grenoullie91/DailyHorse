import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { config } from "./config.js";
import { overview, sourceStatuses, metricSeries, insights } from "./services/analytics.js";
import { connectorById } from "./connectors/index.js";
import { startScheduler, syncConnector } from "./scheduler.js";
import { authorizationUrl, completeAuthorization } from "./services/google-oauth.js";
import { metaAuthorizationUrl, completeMetaAuthorization } from "./services/meta-oauth.js";
import { editorialOverview } from "./services/editorial.js";
import { workspace, type WorkspaceTarget } from "./services/workspace.js";
import { workOs, type ProjectStatus, type ResearchStatus } from "./services/work-os.js";
import { todayIntegrations } from "./services/today-integrations.js";

const app = Fastify({ logger: true });
await app.register(cors, { origin: `http://${config.host}:5174` });
await app.register(websocket);
const workspaceTokens = new Map<string, number>();
const allowedOrigins = new Set(["http://127.0.0.1:4174", "http://localhost:4174", "http://127.0.0.1:5174", "http://localhost:5174"]);
function validWorkspaceRequest(origin: string | undefined, token: string | undefined) { const expires = token ? workspaceTokens.get(token) : undefined; return !!origin && allowedOrigins.has(origin) && !!expires && expires > Date.now(); }
function requireWorkspaceToken(request: { headers: Record<string, string | string[] | undefined> }, reply: { code: (status: number) => { send: (body: object) => unknown } }) { return validWorkspaceRequest(request.headers.origin as string | undefined, request.headers["x-daily-horse-token"] as string | undefined) ? undefined : reply.code(401).send({ error: "Authenticated local workspace session required." }); }
app.get("/api/health", async () => ({ ok: true, now: new Date().toISOString() }));
app.get("/api/overview", async () => overview());
app.get("/api/sources", async () => sourceStatuses());
app.get("/api/series/:metric", async (request) => metricSeries((request.params as { metric: string }).metric, Number((request.query as { days?: string }).days ?? 30)));
app.get("/api/insights", async () => insights());
app.get("/api/editorial", async () => editorialOverview());
app.get("/api/workspace/bootstrap", async (request, reply) => {
  const origin = request.headers.origin;
  if (!origin || !allowedOrigins.has(origin)) return reply.code(403).send({ error: "Local dashboard origin required." });
  const token = crypto.randomBytes(24).toString("base64url"); workspaceTokens.set(token, Date.now() + 5 * 60_000);
  return { token, status: workspace.status() };
});
app.get("/api/workspace/status", async (request, reply) => requireWorkspaceToken(request, reply) ?? workspace.status());
app.post("/api/workspace/control", async (request, reply) => {
  const denied = requireWorkspaceToken(request, reply); if (denied) return denied;
  const body = request.body as { action?: "start" | "restart" | "new" | "stop"; target?: WorkspaceTarget };
  if (!body || !["start", "restart", "new", "stop"].includes(body.action ?? "") || !["agent", "terminal"].includes(body.target ?? "")) return reply.code(400).send({ error: "Invalid workspace control." });
  return workspace.control(body.action!, body.target!);
});
app.post("/api/workspace/task", async (request, reply) => {
  const denied = requireWorkspaceToken(request, reply); if (denied) return denied;
  const body = request.body as { message?: string }; if (typeof body?.message !== "string") return reply.code(400).send({ error: "Task text required." });
  try { return workspace.taskInput(body.message); } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Task rejected." }); }
});
app.get("/api/workspace/command-center", async (request, reply) => requireWorkspaceToken(request, reply) ?? workspace.snapshot());
app.post("/api/workspace/sessions", async (request, reply) => { const denied = requireWorkspaceToken(request, reply); if (denied) return denied; const body = request.body as { name?: string; cwd?: string }; try { return { id: workspace.createSession(body.name ?? "", body.cwd) }; } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Unable to create session." }); } });
app.post("/api/workspace/tasks", async (request, reply) => { const denied = requireWorkspaceToken(request, reply); if (denied) return denied; const body = request.body as { title?: string; prompt?: string; cwd?: string; sessionId?: string; priority?: number; projectId?: string }; try { return { id: workspace.createTask({ title: body.title ?? "", prompt: body.prompt ?? "", cwd: body.cwd, sessionId: body.sessionId, priority: body.priority, projectId: body.projectId }) }; } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Unable to queue task." }); } });
app.post("/api/workspace/tasks/:id/status", async (request, reply) => { const denied = requireWorkspaceToken(request, reply); if (denied) return denied; const body = request.body as { status?: "completed" | "cancelled" | "needs_attention"; result?: string }; if (!body || !["completed", "cancelled", "needs_attention"].includes(body.status ?? "")) return reply.code(400).send({ error: "Invalid task status." }); try { workspace.completeTask((request.params as { id: string }).id, body.status!, body.result); return workspace.snapshot(); } catch (error) { return reply.code(404).send({ error: error instanceof Error ? error.message : "Unknown task." }); } });
app.get("/api/work-os", async (request, reply) => { const denied = requireWorkspaceToken(request, reply); if (denied) return denied; todayIntegrations.setup(); return workOs.snapshot(); });
app.get("/api/today/mail/accounts", async (request, reply) => { const denied = requireWorkspaceToken(request, reply); if (denied) return denied; try { return { accounts: todayIntegrations.accounts() }; } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid mail setup." }); } });
app.get("/api/today/mail/messages", async (request, reply) => { const denied = requireWorkspaceToken(request, reply); if (denied) return denied; const query = request.query as { accountId?: string; filter?: string; search?: string }; if (!query.accountId || !["inbox", "unread", "flagged", "search"].includes(query.filter ?? "inbox")) return reply.code(400).send({ error: "A mail account and valid filter are required." }); try { return await todayIntegrations.messages(query.accountId, (query.filter ?? "inbox") as "inbox" | "unread" | "flagged" | "search", query.search); } catch (error) { return reply.code(502).send({ error: error instanceof Error ? error.message : "Unable to load mail." }); } });
app.get("/api/today/calendars", async (request, reply) => { const denied = requireWorkspaceToken(request, reply); if (denied) return denied; try { return await todayIntegrations.calendars(); } catch (error) { return reply.code(502).send({ error: error instanceof Error ? error.message : "Unable to load calendars." }); } });
app.get("/api/today/events", async (request, reply) => { const denied = requireWorkspaceToken(request, reply); if (denied) return denied; try { return await todayIntegrations.events(); } catch (error) { return reply.code(502).send({ error: error instanceof Error ? error.message : "Unable to load events." }); } });
app.put("/api/today/calendars/selection", async (request, reply) => { const denied = requireWorkspaceToken(request, reply); if (denied) return denied; const ids = (request.body as { ids?: unknown })?.ids; if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || id.length > 500)) return reply.code(400).send({ error: "Calendar ids are required." }); todayIntegrations.selectCalendars(ids); return { ok: true }; });
app.post("/api/work-os/projects", async (request, reply) => { const denied = requireWorkspaceToken(request, reply); if (denied) return denied; const body = request.body as { name?: string; description?: string }; try { return { id: workOs.createProject({ name: body.name ?? "", description: body.description }) }; } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Unable to create project." }); } });
app.patch("/api/work-os/projects/:id", async (request, reply) => { const denied = requireWorkspaceToken(request, reply); if (denied) return denied; try { workOs.updateProject((request.params as { id: string }).id, (request.body as { status?: ProjectStatus }).status as ProjectStatus); return workOs.snapshot(); } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Unable to update project." }); } });
app.post("/api/work-os/research", async (request, reply) => { const denied = requireWorkspaceToken(request, reply); if (denied) return denied; const body = request.body as { title?: string; notes?: string; url?: string; projectId?: string }; try { return { id: workOs.createResearch({ title: body.title ?? "", notes: body.notes, url: body.url, projectId: body.projectId }) }; } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Unable to add research." }); } });
app.patch("/api/work-os/research/:id", async (request, reply) => { const denied = requireWorkspaceToken(request, reply); if (denied) return denied; try { workOs.updateResearch((request.params as { id: string }).id, (request.body as { status?: ResearchStatus }).status as ResearchStatus); return workOs.snapshot(); } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Unable to update research." }); } });
app.get("/api/workspace/socket", { websocket: true }, (socket, request) => {
  const protocols = request.headers["sec-websocket-protocol"]?.split(",").map((value) => value.trim()) ?? [];
  const token = protocols[1]; const target = (new URL(request.url, "http://localhost")).searchParams.get("target") as WorkspaceTarget;
  if (!validWorkspaceRequest(request.headers.origin, token) || !["agent", "terminal"].includes(target)) return socket.close(1008, "Unauthorized local workspace connection");
  const detach = workspace.attach(target, (data) => socket.send(JSON.stringify({ type: "output", data })));
  socket.send(JSON.stringify({ type: "status", status: workspace.status() }));
  socket.on("message", (raw: Buffer) => { try { const message = JSON.parse(raw.toString()) as { type?: string; data?: string; cols?: number; rows?: number }; if (message.type === "input" && typeof message.data === "string") workspace.input(target, message.data); if (message.type === "resize") workspace.resize(target, Number(message.cols), Number(message.rows)); } catch { socket.close(1003, "Invalid terminal message"); } });
  socket.on("close", detach);
});
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
