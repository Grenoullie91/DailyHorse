import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pty, { type IPty } from "node-pty";

export type WorkspaceTarget = "agent" | "terminal";
type Listener = (data: string) => void;
const home = process.env.OPENCODE_WORKSPACE_DIR ?? process.env.HOME ?? "/tmp";
const shell = process.env.SHELL ?? "/bin/bash";

class Workspace {
  private agent?: IPty; private terminal?: IPty; private listeners = new Map<WorkspaceTarget, Set<Listener>>([ ["agent", new Set()], ["terminal", new Set()] ]);
  private sessionId = crypto.randomUUID(); private task: string | null = null; private lastError: string | null = null;
  private spawn(target: WorkspaceTarget, fresh = false) {
    const current = target === "agent" ? this.agent : this.terminal;
    if (current) return current;
    const command = target === "agent" ? "opencode" : shell;
    const args = target === "agent" ? (fresh ? [home] : [home, "--continue"]) : ["-l"];
    try {
      const child = pty.spawn(command, args, { name: "xterm-256color", cols: 110, rows: 28, cwd: home, env: { ...process.env, TERM: "xterm-256color" } });
      child.onData((data) => this.listeners.get(target)?.forEach((listener) => listener(data)));
      child.onExit(({ exitCode }) => { if (target === "agent") { this.agent = undefined; this.task = null; } else this.terminal = undefined; if (exitCode !== 0) this.lastError = `${target} exited with code ${exitCode}`; });
      if (target === "agent") this.agent = child; else this.terminal = child;
      return child;
    } catch (error) { this.lastError = error instanceof Error ? error.message : "Unable to start local workspace"; throw error; }
  }
  status() {
    const cwd = fs.existsSync(home) ? home : process.env.HOME ?? home;
    let repository: string | null = null; let branch: string | null = null;
    try { let cursor = cwd; while (cursor !== path.dirname(cursor)) { if (fs.existsSync(path.join(cursor, ".git"))) { repository = cursor; break; } cursor = path.dirname(cursor); } } catch { /* Context remains available without Git. */ }
    return { version: 1, sessionId: this.sessionId, cwd, repository, branch, agent: this.agent ? "running" : "stopped", terminal: this.terminal ? "running" : "stopped", task: this.task, error: this.lastError };
  }
  control(action: "start" | "restart" | "new" | "stop", target: WorkspaceTarget) {
    const current = target === "agent" ? this.agent : this.terminal;
    if (action === "stop") { current?.kill(); return this.status(); }
    if (action === "restart" || action === "new") { current?.kill(); if (target === "agent" && action === "new") this.sessionId = crypto.randomUUID(); }
    this.spawn(target, target === "agent" && action === "new"); return this.status();
  }
  taskInput(message: string) { if (!message.trim() || message.length > 20_000) throw new Error("Task must contain between 1 and 20,000 characters."); this.spawn("agent").write(`${message.trim()}\r`); this.task = message.trim(); this.lastError = null; return this.status(); }
  attach(target: WorkspaceTarget, listener: Listener) { this.spawn(target); this.listeners.get(target)?.add(listener); return () => this.listeners.get(target)?.delete(listener); }
  input(target: WorkspaceTarget, data: string) { if (data.length > 64_000) throw new Error("Terminal input is too large."); this.spawn(target).write(data); }
  resize(target: WorkspaceTarget, cols: number, rows: number) { const process = target === "agent" ? this.agent : this.terminal; if (process && cols > 1 && rows > 1 && cols < 500 && rows < 300) process.resize(cols, rows); }
}
export const workspace = new Workspace();
