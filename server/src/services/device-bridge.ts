import { spawn, spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

export type DeviceAction = "share" | "clipboard" | "ring";
export type Device = { id: string; name: string; type: null; paired: boolean; reachable: boolean; batteryLevel: null; charging: null; capabilities: DeviceAction[] };

export class DeviceBridgeError extends Error { constructor(message: string, readonly status = 400) { super(message); } }

const cli = "kdeconnect-cli";
const deviceLine = /^-\s+(.+):\s+([a-zA-Z0-9]+)\s+\((.+)\)$/;

export function parseDevices(output: string): Device[] {
  return output.split("\n").flatMap((line) => {
    const match = line.match(deviceLine);
    if (!match) return [];
    const [, name, id, status] = match;
    const paired = /gekoppelt|paired/i.test(status);
    const reachable = /erreichbar|reachable/i.test(status);
    return [{ id, name, type: null, paired, reachable, batteryLevel: null, charging: null, capabilities: paired && reachable ? ["share", "clipboard", "ring"] : [] }];
  });
}

export function validHttpUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:"; } catch { return false; }
}

export function safeUploadName(value: string) {
  const name = path.basename(value).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return name && name !== "." ? name : "upload";
}

function invoke(args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(cli, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    const timer = setTimeout(() => { child.kill(); reject(new DeviceBridgeError("KDE Connect hat nicht rechtzeitig geantwortet.", 502)); }, 15_000);
    child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", () => { clearTimeout(timer); reject(new DeviceBridgeError("KDE Connect ist auf diesem System nicht verfügbar.", 503)); });
    child.on("close", (code) => { clearTimeout(timer); code === 0 ? resolve({ stdout, stderr }) : reject(new DeviceBridgeError("KDE Connect konnte die Aktion nicht übergeben.", 502)); });
  });
}

export class DeviceBridge {
  available() { return spawnSync(cli, ["--version"], { stdio: "ignore" }).status === 0; }
  async devices() { if (!this.available()) return { status: "unavailable" as const, devices: [] as Device[] }; const result = await invoke(["--list-devices"]); return { status: "available" as const, devices: parseDevices(result.stdout) }; }
  async device(id: string, action: DeviceAction) {
    if (!/^[a-zA-Z0-9]{8,128}$/.test(id)) throw new DeviceBridgeError("Ungültiges Gerät.");
    const { devices } = await this.devices(); const device = devices.find((item) => item.id === id);
    if (!device || !device.paired) throw new DeviceBridgeError("Dieses Gerät ist nicht gekoppelt.", 404);
    if (!device.reachable) throw new DeviceBridgeError("Das Gerät ist momentan nicht erreichbar.", 409);
    if (!device.capabilities.includes(action)) throw new DeviceBridgeError("Diese Aktion wird vom Gerät nicht unterstützt.", 409);
    return device;
  }
  async shareUrl(id: string, url: string) { if (!validHttpUrl(url)) throw new DeviceBridgeError("Nur gültige http(s)-Links können gesendet werden."); await this.device(id, "share"); await invoke(["--device", id, "--share", url]); }
  async shareText(id: string, text: string) { if (!text || text.length > 100_000) throw new DeviceBridgeError("Die Zwischenablage enthält keinen unterstützten Text."); await this.device(id, "clipboard"); await invoke(["--device", id, "--share-text", text]); }
  async ring(id: string) { await this.device(id, "ring"); await invoke(["--device", id, "--ring"]); }
  async shareFile(id: string, originalName: string, contents: Buffer) {
    if (!contents.length || contents.length > 25 * 1024 * 1024) throw new DeviceBridgeError("Dateien bis 25 MB können gesendet werden.");
    await this.device(id, "share");
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dailyhorse-device-"));
    const file = path.join(directory, `${crypto.randomUUID()}-${safeUploadName(originalName)}`);
    try { await fs.writeFile(file, contents, { mode: 0o600 }); await invoke(["--device", id, "--share", file]); }
    finally { await fs.rm(directory, { recursive: true, force: true }); }
  }
}

export const deviceBridge = new DeviceBridge();
