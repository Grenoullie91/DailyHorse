import cron from "node-cron";
import { config } from "./config.js";
import { connectors } from "./connectors/index.js";
import { updateSource } from "./db.js";

export async function syncConnector(id?: string) {
  const targets = id ? connectors.filter((connector) => connector.id === id) : connectors;
  const results = await Promise.allSettled(targets.map(async (connector) => {
    const status = await connector.status();
    if (status.status === "connected") await connector.sync(); else updateSource(connector.id, status.status, status.detail);
  }));
  return results.map((result, index) => ({ id: targets[index].id, ok: result.status === "fulfilled", error: result.status === "rejected" ? String(result.reason) : undefined }));
}
export function startScheduler() {
  const minutes = Math.max(15, config.syncIntervalMinutes);
  cron.schedule(`*/${minutes} * * * *`, () => void syncConnector());
  void syncConnector();
}
