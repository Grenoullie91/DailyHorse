import crypto from "node:crypto";
import { db } from "../db.js";

export type ProjectStatus = "active" | "on_hold" | "completed";
export type ResearchStatus = "inbox" | "researching" | "ready" | "dismissed";
const now = () => new Date().toISOString();

function assertProject(id: string | undefined) {
  if (id && !db.prepare("SELECT 1 FROM projects WHERE id=?").get(id)) throw new Error("Unknown project.");
}

export const workOs = {
  assertProject,
  createProject(input: { name: string; description?: string }) {
    if (!input.name.trim() || input.name.trim().length > 120) throw new Error("Project name must contain 1 to 120 characters.");
    const id = crypto.randomUUID();
    db.prepare("INSERT INTO projects(id,name,description,status,created_at,updated_at) VALUES (?,?,?,?,?,?)").run(id, input.name.trim(), input.description?.trim().slice(0, 2_000) || null, "active", now(), now());
    return id;
  },
  updateProject(id: string, status: ProjectStatus) {
    if (!["active", "on_hold", "completed"].includes(status)) throw new Error("Invalid project status.");
    if (!db.prepare("UPDATE projects SET status=?,updated_at=? WHERE id=?").run(status, now(), id).changes) throw new Error("Unknown project.");
  },
  createResearch(input: { title: string; notes?: string; url?: string; projectId?: string }) {
    if (!input.title.trim() || input.title.trim().length > 240) throw new Error("Research title must contain 1 to 240 characters.");
    if (input.url && !/^https?:\/\//i.test(input.url)) throw new Error("Research URL must use http or https.");
    assertProject(input.projectId);
    const id = crypto.randomUUID();
    db.prepare("INSERT INTO research_queue(id,title,notes,url,project_id,status,created_at,updated_at) VALUES (?,?,?,?,?,'inbox',?,?)").run(id, input.title.trim(), input.notes?.trim().slice(0, 4_000) || null, input.url || null, input.projectId || null, now(), now());
    return id;
  },
  updateResearch(id: string, status: ResearchStatus) {
    if (!["inbox", "researching", "ready", "dismissed"].includes(status)) throw new Error("Invalid research status.");
    if (!db.prepare("UPDATE research_queue SET status=?,updated_at=? WHERE id=?").run(status, now(), id).changes) throw new Error("Unknown research item.");
  },
  snapshot() {
    const projects = db.prepare(`SELECT p.*, COUNT(t.id) AS task_count, SUM(CASE WHEN t.status IN ('queued','starting','running','waiting') THEN 1 ELSE 0 END) AS open_task_count FROM projects p LEFT JOIN agent_tasks t ON t.project_id=p.id GROUP BY p.id ORDER BY CASE p.status WHEN 'active' THEN 0 WHEN 'on_hold' THEN 1 ELSE 2 END,p.updated_at DESC`).all();
    const tasks = db.prepare("SELECT id,title,status,priority,project_id,created_at FROM agent_tasks WHERE status IN ('queued','starting','running','waiting','needs_attention','failed') ORDER BY priority,created_at DESC LIMIT 50").all();
    const research = db.prepare("SELECT r.*,p.name AS project_name FROM research_queue r LEFT JOIN projects p ON p.id=r.project_id WHERE r.status != 'dismissed' ORDER BY CASE r.status WHEN 'researching' THEN 0 WHEN 'inbox' THEN 1 ELSE 2 END,r.created_at DESC LIMIT 30").all();
    const attention = [
      ...db.prepare("SELECT 'task' AS type,id,title AS label,status,created_at,project_id,NULL AS detail FROM agent_tasks WHERE status IN ('needs_attention','failed') ORDER BY created_at DESC LIMIT 30").all(),
      ...db.prepare("SELECT 'event' AS type,CAST(id AS TEXT) AS id,kind AS label,'event' AS status,created_at,NULL AS project_id,detail FROM agent_events WHERE kind IN ('agent.crashed','task.failed') ORDER BY created_at DESC LIMIT 20").all(),
      ...db.prepare("SELECT 'setup' AS type,provider AS id,provider AS label,state AS status,updated_at AS created_at,NULL AS project_id,detail FROM integration_setup WHERE state != 'connected'").all(),
    ].sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));
    return { projects, tasks, research, attention, setups: db.prepare("SELECT * FROM integration_setup ORDER BY provider").all() };
  },
};
