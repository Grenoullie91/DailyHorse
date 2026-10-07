import { db, updateSource } from "../db.js";
import type { Connector } from "../types.js";

export abstract class BaseConnector implements Connector {
  abstract id: string;
  abstract name: string;
  abstract status(): Promise<{ status: any; detail: string }>;
  abstract collect(): Promise<number>;

  async sync() {
    const startedAt = new Date().toISOString();
    const run = db.prepare("INSERT INTO sync_runs(source_id,started_at,status) VALUES (?,?,'running')").run(this.id, startedAt);
    updateSource(this.id, "syncing", "Synchronization running");
    try {
      const records = await this.collect();
      db.prepare("UPDATE sync_runs SET finished_at=?,status='success',records_written=? WHERE id=?").run(new Date().toISOString(), records, run.lastInsertRowid);
      updateSource(this.id, "connected", `Last sync wrote ${records} records`, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown connector error";
      db.prepare("UPDATE sync_runs SET finished_at=?,status='error',error_message=? WHERE id=?").run(new Date().toISOString(), message, run.lastInsertRowid);
      updateSource(this.id, "error", message);
      throw error;
    }
  }
}
