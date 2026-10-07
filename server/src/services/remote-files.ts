import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { Client, type SFTPWrapper } from "ssh2";
import { db } from "../db.js";
import { workOs } from "./work-os.js";
import { sftpCredentials } from "./sftp-credentials.js";

export type RemoteProfile = { id: string; name: string; host: string; port: number; protocol: "sftp"; username: string; remoteRoot: string; localRoot: string; environment: "production" | "staging" | "development"; projectId: string | null };
export type FileEntry = { name: string; path: string; directory: boolean; size: number | null; modified: string | null };
export type Transfer = { id: string; direction: "upload" | "download"; name: string; target: string; status: "queued" | "transferring" | "completed" | "failed"; error?: string };
export class RemoteFilesError extends Error { constructor(message: string, readonly status = 400, readonly existing?: FileEntry) { super(message); } }
const transfers = new Map<string, Transfer>();
const safeSegment = /^[a-zA-Z0-9._ -]+$/;
const now = () => new Date().toISOString();

export function validRelativePath(value: string) { return value === "" || value.split("/").every((part) => safeSegment.test(part) && part !== "." && part !== ".."); }
export function normalizeRemotePath(value: string) {
  if (!value.startsWith("/") || !value.split("/").every((part) => part === "" || (safeSegment.test(part) && part !== "." && part !== ".."))) throw new RemoteFilesError("Ungültiger Serverpfad.");
  const segments = value.split("/").filter(Boolean);
  return segments.length ? `/${segments.join("/")}` : "/";
}
export function validRemoteRoot(value: string) { try { normalizeRemotePath(value); return true; } catch { return false; } }
export function validHost(value: string) { return /^(?=.{1,253}$)([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(value); }
export function redactConnectionError(value: string) { return value.replace(/(?:password|passphrase|private key)[^\n]*/gi, "credential hidden").slice(0, 220); }
function parseProfile(row: Record<string, unknown>): RemoteProfile { return { id: String(row.id), name: String(row.name), host: String(row.host), port: Number(row.port), protocol: "sftp", username: String(row.username), remoteRoot: normalizeRemotePath(String(row.remote_root)), localRoot: String(row.local_root), environment: row.environment as RemoteProfile["environment"], projectId: row.project_id ? String(row.project_id) : null }; }
const knownHosts = path.join(os.homedir(), ".ssh", "known_hosts");

async function knownHostKeys(profile: RemoteProfile) {
  const lookup = profile.port === 22 ? profile.host : `[${profile.host}]:${profile.port}`;
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn("ssh-keygen", ["-F", lookup, "-f", knownHosts], { stdio: ["ignore", "pipe", "ignore"] });
    let result = "";
    child.stdout.on("data", (chunk: Buffer) => { result += chunk; });
    child.on("error", () => reject(new RemoteFilesError("ssh-keygen ist für die Server-Schlüsselprüfung nicht verfügbar.", 503)));
    child.on("close", (code) => code === 0 ? resolve(result) : code === 1 ? resolve("") : reject(new RemoteFilesError("Server-Schlüssel konnte nicht geprüft werden.", 503)));
  });
  return output.split(/\r?\n/).flatMap((line) => {
    if (!line || line.startsWith("#")) return [];
    const fields = line.trim().split(/\s+/);
    const offset = fields[0].startsWith("@") ? 1 : 0;
    const encoded = fields[offset + 2];
    if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return [];
    const key = Buffer.from(encoded, "base64");
    return key.length && key.toString("base64") === encoded ? [{ key, revoked: fields[0] === "@revoked" }] : [];
  });
}

async function connect(profile: RemoteProfile) {
  const keys = await knownHostKeys(profile);
  if (!keys.some(({ revoked }) => !revoked)) throw new RemoteFilesError("Der Server-Schlüssel ist nicht in ~/.ssh/known_hosts hinterlegt.", 502);
  let password: string;
  try { password = await sftpCredentials.read(profile.id); } catch { throw new RemoteFilesError("SFTP-Credential fehlt oder KDE Wallet ist nicht verfügbar.", 401); }
  return new Promise<{ client: Client; sftp: SFTPWrapper }>((resolve, reject) => {
    const client = new Client();
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      password = ""; client.end();
      reject(error);
    };
    client.on("error", (error) => fail(new RemoteFilesError(redactConnectionError(error.message) || "SFTP-Verbindung fehlgeschlagen.", 502)));
    client.on("keyboard-interactive", (_name, _instructions, _language, prompts, finish) => finish(prompts.map(() => password)));
    client.on("ready", () => client.sftp((error, sftp) => {
      if (error || !sftp) return fail(new RemoteFilesError(redactConnectionError(error?.message ?? "") || "SFTP-Verbindung fehlgeschlagen.", 502));
      if (!settled) { settled = true; password = ""; resolve({ client, sftp }); }
    }));
    client.connect({ host: profile.host, port: profile.port, username: profile.username, password, tryKeyboard: true, readyTimeout: 30_000, hostVerifier: (actual: Buffer) => !keys.some(({ key, revoked }) => revoked && key.equals(actual)) && keys.some(({ key, revoked }) => !revoked && key.equals(actual)) });
  });
}

async function withSftp<T>(profile: RemoteProfile, action: (sftp: SFTPWrapper) => Promise<T>) {
  const { client, sftp } = await connect(profile);
  try { return await action(sftp); } catch (error) { throw error instanceof RemoteFilesError ? error : new RemoteFilesError(redactConnectionError(error instanceof Error ? error.message : "") || "SFTP-Vorgang fehlgeschlagen.", 502); } finally { client.end(); }
}
async function localPath(profile: RemoteProfile, relative: string) { if (!validRelativePath(relative)) throw new RemoteFilesError("Ungültiger lokaler Pfad."); const root = await fs.realpath(profile.localRoot); const candidate = path.resolve(root, relative); if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) throw new RemoteFilesError("Lokaler Pfad liegt außerhalb des konfigurierten Roots."); const resolved = await fs.realpath(candidate).catch(async () => path.join(await fs.realpath(path.dirname(candidate)), path.basename(candidate))); if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new RemoteFilesError("Lokaler Pfad liegt außerhalb des konfigurierten Roots."); return resolved; }
function remotePath(profile: RemoteProfile, relative: string) { if (!validRelativePath(relative)) throw new RemoteFilesError("Ungültiger Serverpfad."); const root = normalizeRemotePath(profile.remoteRoot); return relative ? normalizeRemotePath(`${root}/${relative}`) : root; }
function fileEntry(relative: string, stats: { isDirectory(): boolean; size: number; mtime: Date }): FileEntry { return { name: path.basename(relative), path: relative, directory: stats.isDirectory(), size: stats.isDirectory() ? null : stats.size, modified: stats.mtime.toISOString() }; }
function remoteEntries(entries: { filename: string; attrs: { isDirectory(): boolean; size: number; mtime: number } }[], relative: string) { return entries.flatMap((entry) => !safeSegment.test(entry.filename) || entry.filename === "." || entry.filename === ".." ? [] : [{ name: entry.filename, path: relative ? `${relative}/${entry.filename}` : entry.filename, directory: entry.attrs.isDirectory(), size: entry.attrs.isDirectory() ? null : entry.attrs.size, modified: entry.attrs.mtime ? new Date(entry.attrs.mtime * 1000).toISOString() : null }]); }
function readdir(sftp: SFTPWrapper, remote: string) { return new Promise<Parameters<typeof remoteEntries>[0]>((resolve, reject) => sftp.readdir(remote, (error, entries) => error ? reject(error) : resolve(entries))); }
function stat(sftp: SFTPWrapper, remote: string) { return new Promise<{ isDirectory(): boolean; size: number; mtime: number }>((resolve, reject) => sftp.stat(remote, (error, attrs) => error ? reject(error) : resolve(attrs))); }
function transferFile(sftp: SFTPWrapper, direction: "upload" | "download", local: string, remote: string) { return new Promise<void>((resolve, reject) => (direction === "upload" ? sftp.fastPut.bind(sftp, local, remote) : sftp.fastGet.bind(sftp, remote, local))((error) => error ? reject(error) : resolve())); }

export const remoteFiles = {
  profiles() { return (db.prepare("SELECT * FROM remote_profiles ORDER BY name").all() as Record<string, unknown>[]).map(parseProfile); },
  profile(id: string) { const row = db.prepare("SELECT * FROM remote_profiles WHERE id=?").get(id) as Record<string, unknown> | undefined; if (!row) throw new RemoteFilesError("Unbekannte Verbindung.", 404); return parseProfile(row); },
  async create(input: Omit<RemoteProfile, "id">) {
    if (!input.name.trim() || input.name.length > 120 || !validHost(input.host) || !/^[a-zA-Z0-9._-]{1,80}$/.test(input.username) || input.protocol !== "sftp" || !Number.isInteger(input.port) || input.port < 1 || input.port > 65535 || !validRemoteRoot(input.remoteRoot) || !["production", "staging", "development"].includes(input.environment)) throw new RemoteFilesError("Ungültiges Verbindungsprofil.");
    if (input.projectId) workOs.assertProject(input.projectId); const root = await fs.realpath(input.localRoot); if (!(await fs.stat(root)).isDirectory()) throw new RemoteFilesError("Der lokale Root muss ein vorhandener Ordner sein.");
    const id = crypto.randomUUID(); db.prepare("INSERT INTO remote_profiles(id,name,host,port,protocol,username,remote_root,local_root,environment,project_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(id, input.name.trim(), input.host, input.port, "sftp", input.username, normalizeRemotePath(input.remoteRoot), root, input.environment, input.projectId, now(), now()); return this.profile(id);
  },
  async local(profileId: string, relative = "") { const profile = this.profile(profileId); const folder = await localPath(profile, relative); const entries = await fs.readdir(folder, { withFileTypes: true }); return Promise.all(entries.filter((entry) => !entry.isSymbolicLink()).map(async (entry) => fileEntry(relative ? `${relative}/${entry.name}` : entry.name, await fs.stat(path.join(folder, entry.name))))).then((items) => items.sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name))); },
  async remote(profileId: string, relative = "") { const profile = this.profile(profileId); const entries = await withSftp(profile, (client) => readdir(client, remotePath(profile, relative))); return remoteEntries(entries, relative).sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name)); },
  queue() { return [...transfers.values()].reverse(); },
  async transfer(profileId: string, direction: "upload" | "download", source: string, destination: string, overwrite = false) {
    const profile = this.profile(profileId); const local = direction === "upload" ? await localPath(profile, source) : await localPath(profile, destination); const remote = direction === "upload" ? remotePath(profile, destination) : remotePath(profile, source);
    if (direction === "upload" && (await fs.stat(local)).isDirectory()) throw new RemoteFilesError("Ordnerübertragungen sind in dieser Phase nicht verfügbar.");
    if (direction === "upload" && !overwrite) { const existing = await withSftp(profile, async (client) => { try { const attrs = await stat(client, remote); return { name: path.basename(destination), path: destination, directory: attrs.isDirectory(), size: attrs.isDirectory() ? null : attrs.size, modified: attrs.mtime ? new Date(attrs.mtime * 1000).toISOString() : null }; } catch (error) { if ((error as { code?: unknown }).code === 2) return undefined; throw error; } }); if (existing) throw new RemoteFilesError("Eine Serverdatei existiert bereits.", 409, existing); }
    if (direction === "download") { await fs.mkdir(path.dirname(local), { recursive: true }); try { if (!overwrite) { const stat = await fs.stat(local); throw new RemoteFilesError("Eine lokale Datei existiert bereits.", 409, fileEntry(destination, stat)); } } catch (error) { if (!(error as NodeJS.ErrnoException).code && !(error instanceof RemoteFilesError)) throw error; if (error instanceof RemoteFilesError) throw error; } }
    const id = crypto.randomUUID(); const transfer: Transfer = { id, direction, name: path.basename(source), target: direction === "upload" ? destination : destination, status: "queued" }; transfers.set(id, transfer); transfer.status = "transferring";
    try { await withSftp(profile, (client) => transferFile(client, direction, local, remote)); transfer.status = "completed"; } catch (error) { transfer.status = "failed"; transfer.error = error instanceof Error ? error.message : "Übertragung fehlgeschlagen."; } return transfer;
  },
};
