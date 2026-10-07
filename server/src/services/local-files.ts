import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { db } from "../db.js";

export type LocalRoot = { id: string; name: string; path: string };
export type LocalFileEntry = { name: string; path: string; directory: boolean; size: number | null; modified: string | null };
export class LocalFilesError extends Error { constructor(message: string, readonly status = 400) { super(message); } }

const safeSegment = /^[a-zA-Z0-9._ -]+$/;
const now = () => new Date().toISOString();
export function validLocalRelativePath(value: string) { return value === "" || value.split("/").every((part) => safeSegment.test(part) && part !== "." && part !== ".."); }
export function validLocalRootName(value: string) { return value.trim().length > 0 && value.trim().length <= 120; }
function entry(relative: string, stat: { isDirectory(): boolean; size: number; mtime: Date }): LocalFileEntry { return { name: path.basename(relative), path: relative, directory: stat.isDirectory(), size: stat.isDirectory() ? null : stat.size, modified: stat.mtime.toISOString() }; }
function parseRoot(row: Record<string, unknown>): LocalRoot { return { id: String(row.id), name: String(row.name), path: String(row.root_path) }; }

async function rootPath(root: LocalRoot, relative: string, allowMissing = false) {
  if (!validLocalRelativePath(relative)) throw new LocalFilesError("Ungültiger lokaler Pfad.");
  const base = await fs.realpath(root.path);
  const candidate = path.resolve(base, relative);
  if (candidate !== base && !candidate.startsWith(`${base}${path.sep}`)) throw new LocalFilesError("Pfad liegt außerhalb des freigegebenen Roots.");
  try {
    const resolved = await fs.realpath(candidate);
    if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) throw new LocalFilesError("Pfad liegt außerhalb des freigegebenen Roots.");
    return resolved;
  } catch (error) {
    if (!allowMissing || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const parent = await fs.realpath(path.dirname(candidate));
    if (parent !== base && !parent.startsWith(`${base}${path.sep}`)) throw new LocalFilesError("Pfad liegt außerhalb des freigegebenen Roots.");
    return path.join(parent, path.basename(candidate));
  }
}

export const localFiles = {
  roots() { return (db.prepare("SELECT * FROM local_file_roots ORDER BY name").all() as Record<string, unknown>[]).map(parseRoot); },
  root(id: string) { const row = db.prepare("SELECT * FROM local_file_roots WHERE id=?").get(id) as Record<string, unknown> | undefined; if (!row) throw new LocalFilesError("Unbekannter lokaler Root.", 404); return parseRoot(row); },
  async create(input: { name?: unknown; path?: unknown }) {
    if (typeof input.name !== "string" || typeof input.path !== "string" || !validLocalRootName(input.name) || !path.isAbsolute(input.path)) throw new LocalFilesError("Name und absoluter Ordnerpfad sind erforderlich.");
    const resolved = await fs.realpath(input.path);
    if (!(await fs.stat(resolved)).isDirectory()) throw new LocalFilesError("Der Root muss ein vorhandener Ordner sein.");
    const id = crypto.randomUUID();
    try { db.prepare("INSERT INTO local_file_roots(id,name,root_path,created_at,updated_at) VALUES (?,?,?,?,?)").run(id, input.name.trim(), resolved, now(), now()); }
    catch { throw new LocalFilesError("Dieser Ordner ist bereits freigegeben.", 409); }
    return this.root(id);
  },
  async list(rootId: string, relative = "") {
    const folder = await rootPath(this.root(rootId), relative);
    const stat = await fs.lstat(folder); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new LocalFilesError("Der Pfad ist kein freigegebener Ordner.");
    const entries = await fs.readdir(folder, { withFileTypes: true });
    return Promise.all(entries.filter((item) => !item.isSymbolicLink()).map(async (item) => entry(relative ? `${relative}/${item.name}` : item.name, await fs.stat(path.join(folder, item.name))))).then((items) => items.sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name)));
  },
  async mkdir(rootId: string, relative: string) { const target = await rootPath(this.root(rootId), relative, true); await fs.mkdir(target); },
  async rename(rootId: string, source: string, destination: string) { const root = this.root(rootId); const from = await rootPath(root, source); const to = await rootPath(root, destination, true); if ((await fs.lstat(from)).isSymbolicLink()) throw new LocalFilesError("Symbolische Links werden nicht bearbeitet."); await fs.rename(from, to); },
  async copy(sourceRootId: string, source: string, destinationRootId: string, destination: string) { const from = await rootPath(this.root(sourceRootId), source); const to = await rootPath(this.root(destinationRootId), destination, true); if ((await fs.lstat(from)).isSymbolicLink()) throw new LocalFilesError("Symbolische Links werden nicht bearbeitet."); await fs.cp(from, to, { recursive: true, errorOnExist: true, force: false }); },
  async move(sourceRootId: string, source: string, destinationRootId: string, destination: string) { const from = await rootPath(this.root(sourceRootId), source); const to = await rootPath(this.root(destinationRootId), destination, true); if ((await fs.lstat(from)).isSymbolicLink()) throw new LocalFilesError("Symbolische Links werden nicht bearbeitet."); await fs.rename(from, to).catch(async (error: NodeJS.ErrnoException) => { if (error.code !== "EXDEV") throw error; await fs.cp(from, to, { recursive: true, errorOnExist: true, force: false }); await fs.rm(from, { recursive: true }); }); },
  async open(rootId: string, relative: string) { const target = await rootPath(this.root(rootId), relative); if ((await fs.lstat(target)).isSymbolicLink()) throw new LocalFilesError("Symbolische Links werden nicht geöffnet."); const child = spawn("xdg-open", [target], { detached: true, stdio: "ignore" }); child.unref(); },
};
