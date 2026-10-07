import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { db } from "../db.js";
import { workOs } from "./work-os.js";

export type RemoteProfile = { id: string; name: string; host: string; port: number; protocol: "sftp"; username: string; remoteRoot: string; localRoot: string; environment: "production" | "staging" | "development"; projectId: string | null };
export type FileEntry = { name: string; path: string; directory: boolean; size: number | null; modified: string | null };
export type Transfer = { id: string; direction: "upload" | "download"; name: string; target: string; status: "queued" | "transferring" | "completed" | "failed"; error?: string };
export class RemoteFilesError extends Error { constructor(message: string, readonly status = 400, readonly existing?: FileEntry) { super(message); } }
const transfers = new Map<string, Transfer>();
const safeSegment = /^[a-zA-Z0-9._ -]+$/;
const now = () => new Date().toISOString();

export function validRelativePath(value: string) { return value === "" || value.split("/").every((part) => safeSegment.test(part) && part !== "." && part !== ".."); }
export function validRemoteRoot(value: string) { return value.startsWith("/") && validRelativePath(value.slice(1)); }
export function validHost(value: string) { return /^(?=.{1,253}$)([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(value); }
export function redactConnectionError(value: string) { return value.replace(/(?:password|passphrase|private key)[^\n]*/gi, "credential hidden").slice(0, 220); }
function quoted(value: string) { if (!/^[a-zA-Z0-9._ /-]+$/.test(value)) throw new RemoteFilesError("Der Pfad enthält nicht unterstützte Zeichen."); return `"${value}"`; }
function parseProfile(row: Record<string, unknown>): RemoteProfile { return { id: String(row.id), name: String(row.name), host: String(row.host), port: Number(row.port), protocol: "sftp", username: String(row.username), remoteRoot: String(row.remote_root), localRoot: String(row.local_root), environment: row.environment as RemoteProfile["environment"], projectId: row.project_id ? String(row.project_id) : null }; }
function sftp(profile: RemoteProfile, batch: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("sftp", ["-b", "-", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "UserKnownHostsFile=~/.ssh/known_hosts", "-P", String(profile.port), `${profile.username}@${profile.host}`], { stdio: ["pipe", "pipe", "pipe"] });
    let output = ""; let errors = ""; const timeout = setTimeout(() => { child.kill(); reject(new RemoteFilesError("Die SFTP-Verbindung hat zu lange benötigt.", 504)); }, 30_000);
    child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { errors += chunk; }); child.on("error", () => { clearTimeout(timeout); reject(new RemoteFilesError("SFTP ist auf diesem System nicht verfügbar.", 503)); }); child.on("close", (code) => { clearTimeout(timeout); code === 0 ? resolve(output) : reject(new RemoteFilesError(redactConnectionError(errors) || "SFTP-Verbindung fehlgeschlagen.", 502)); }); child.stdin.end(batch);
  });
}
async function localPath(profile: RemoteProfile, relative: string) { if (!validRelativePath(relative)) throw new RemoteFilesError("Ungültiger lokaler Pfad."); const root = await fs.realpath(profile.localRoot); const candidate = path.resolve(root, relative); if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) throw new RemoteFilesError("Lokaler Pfad liegt außerhalb des konfigurierten Roots."); const resolved = await fs.realpath(candidate).catch(async () => path.join(await fs.realpath(path.dirname(candidate)), path.basename(candidate))); if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new RemoteFilesError("Lokaler Pfad liegt außerhalb des konfigurierten Roots."); return resolved; }
function remotePath(profile: RemoteProfile, relative: string) { if (!validRelativePath(relative)) throw new RemoteFilesError("Ungültiger Serverpfad."); const root = profile.remoteRoot === "/" ? "/" : profile.remoteRoot.replace(/\/$/, ""); return relative ? `${root === "/" ? "" : root}/${relative}` : root; }
function fileEntry(relative: string, stats: { isDirectory(): boolean; size: number; mtime: Date }): FileEntry { return { name: path.basename(relative), path: relative, directory: stats.isDirectory(), size: stats.isDirectory() ? null : stats.size, modified: stats.mtime.toISOString() }; }
function remoteEntries(output: string, relative: string) { return output.split("\n").flatMap((line) => { const match = line.match(/^([d-]).*?\s+(\d+)\s+\w+\s+\d+\s+[\d:]+\s+(.+)$/); if (!match || !safeSegment.test(match[3])) return []; return [{ name: match[3], path: relative ? `${relative}/${match[3]}` : match[3], directory: match[1] === "d", size: Number(match[2]), modified: null }]; }); }

export const remoteFiles = {
  profiles() { return (db.prepare("SELECT * FROM remote_profiles ORDER BY name").all() as Record<string, unknown>[]).map(parseProfile); },
  profile(id: string) { const row = db.prepare("SELECT * FROM remote_profiles WHERE id=?").get(id) as Record<string, unknown> | undefined; if (!row) throw new RemoteFilesError("Unbekannte Verbindung.", 404); return parseProfile(row); },
  async create(input: Omit<RemoteProfile, "id">) {
    if (!input.name.trim() || input.name.length > 120 || !validHost(input.host) || !/^[a-zA-Z0-9._-]{1,80}$/.test(input.username) || input.protocol !== "sftp" || !Number.isInteger(input.port) || input.port < 1 || input.port > 65535 || !validRemoteRoot(input.remoteRoot) || !["production", "staging", "development"].includes(input.environment)) throw new RemoteFilesError("Ungültiges Verbindungsprofil.");
    if (input.projectId) workOs.assertProject(input.projectId); const root = await fs.realpath(input.localRoot); if (!(await fs.stat(root)).isDirectory()) throw new RemoteFilesError("Der lokale Root muss ein vorhandener Ordner sein.");
    const id = crypto.randomUUID(); db.prepare("INSERT INTO remote_profiles(id,name,host,port,protocol,username,remote_root,local_root,environment,project_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(id, input.name.trim(), input.host, input.port, "sftp", input.username, input.remoteRoot.replace(/\/$/, "") || "/", root, input.environment, input.projectId, now(), now()); return this.profile(id);
  },
  async local(profileId: string, relative = "") { const profile = this.profile(profileId); const folder = await localPath(profile, relative); const entries = await fs.readdir(folder, { withFileTypes: true }); return Promise.all(entries.filter((entry) => !entry.isSymbolicLink()).map(async (entry) => fileEntry(relative ? `${relative}/${entry.name}` : entry.name, await fs.stat(path.join(folder, entry.name))))).then((items) => items.sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name))); },
  async remote(profileId: string, relative = "") { const profile = this.profile(profileId); const output = await sftp(profile, `ls -l ${quoted(remotePath(profile, relative))}\n`); return remoteEntries(output, relative).sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name)); },
  queue() { return [...transfers.values()].reverse(); },
  async transfer(profileId: string, direction: "upload" | "download", source: string, destination: string, overwrite = false) {
    const profile = this.profile(profileId); const local = direction === "upload" ? await localPath(profile, source) : await localPath(profile, destination); const remote = direction === "upload" ? remotePath(profile, destination) : remotePath(profile, source);
    if (direction === "upload" && (await fs.stat(local)).isDirectory()) throw new RemoteFilesError("Ordnerübertragungen sind in dieser Phase nicht verfügbar.");
    if (direction === "upload" && !overwrite) { const existing = remoteEntries(await sftp(profile, `-ls -l ${quoted(remote)}\n`), "")[0]; if (existing) throw new RemoteFilesError("Eine Serverdatei existiert bereits.", 409, existing); }
    if (direction === "download") { await fs.mkdir(path.dirname(local), { recursive: true }); try { if (!overwrite) { const stat = await fs.stat(local); throw new RemoteFilesError("Eine lokale Datei existiert bereits.", 409, fileEntry(destination, stat)); } } catch (error) { if (!(error as NodeJS.ErrnoException).code && !(error instanceof RemoteFilesError)) throw error; if (error instanceof RemoteFilesError) throw error; } }
    const id = crypto.randomUUID(); const transfer: Transfer = { id, direction, name: path.basename(source), target: direction === "upload" ? destination : destination, status: "queued" }; transfers.set(id, transfer); transfer.status = "transferring";
    try { await sftp(profile, `${direction === "upload" ? "put" : "get"} ${quoted(direction === "upload" ? local : remote)} ${quoted(direction === "upload" ? remote : local)}\n`); transfer.status = "completed"; } catch (error) { transfer.status = "failed"; transfer.error = error instanceof Error ? error.message : "Übertragung fehlgeschlagen."; } return transfer;
  },
};
