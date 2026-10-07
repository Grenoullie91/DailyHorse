import { spawn } from "node:child_process";
import path from "node:path";

const helper = path.resolve("server/helpers/kwallet_helper.py");
const entry = (profileId: string) => `dailyhorse:sftp:${profileId}`;

function call(operation: "has" | "write" | "read" | "remove", profileId: string, secret?: string) {
  return new Promise<{ ok: boolean; exists?: boolean; verified?: boolean; secret?: string; code?: string }>((resolve, reject) => {
    const child = spawn("/usr/bin/python3", [helper], { shell: false, stdio: ["pipe", "pipe", "ignore"] }); let output = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("credential_store_timeout")); }, 10_000);
    child.stdout.on("data", (chunk) => { output += chunk; if (output.length > 32_000) child.kill(); });
    child.on("error", () => { clearTimeout(timer); reject(new Error("credential_store_unavailable")); });
    child.on("close", () => { clearTimeout(timer); try { const result = JSON.parse(output) as { ok: boolean; exists?: boolean; verified?: boolean; secret?: string; code?: string }; result.ok ? resolve(result) : reject(new Error(result.code ?? "credential_store_failed")); } catch { reject(new Error("credential_store_malformed")); } });
    child.stdin.end(JSON.stringify({ operation, entry: entry(profileId), ...(secret === undefined ? {} : { secret }) }));
  });
}

export const sftpCredentials = {
  async exists(profileId: string) { return Boolean((await call("has", profileId)).exists); },
  async store(profileId: string, password: string) { if (!password || password.length > 1024) throw new Error("credential_write_failed"); const result = await call("write", profileId, password); if (!result.verified) throw new Error("credential_verification_failed"); },
  async read(profileId: string) { const result = await call("read", profileId); if (typeof result.secret !== "string") throw new Error("credential_read_failed"); return result.secret; },
  async remove(profileId: string) { await call("remove", profileId); },
};
