import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";

export type CpuSample = { idle: number; total: number };
export type NetworkCounters = { received: number; transmitted: number };

export type SystemSummary = {
  capturedAt: string;
  cpu: { usagePercent: number | null; cores: number; loadAverage: number[] };
  memory: { totalBytes: number; availableBytes: number; usedBytes: number; usedPercent: number };
  disk: { path: string; totalBytes: number; availableBytes: number; usedBytes: number; usedPercent: number } | null;
  thermalCelsius: number | null;
  network: { receivedBytesPerSecond: number | null; transmittedBytesPerSecond: number | null };
  uptimeSeconds: number;
  system: { platform: string; release: string; architecture: string; hostname: string };
  service: { name: string; status: "active" | "inactive" | "unavailable" };
};

export function parseMemInfo(contents: string) {
  const values = Object.fromEntries(contents.split("\n").flatMap((line) => {
    const match = line.match(/^(MemTotal|MemAvailable):\s+(\d+)\s+kB$/);
    return match ? [[match[1], Number(match[2]) * 1024]] : [];
  }));
  return { totalBytes: values.MemTotal ?? os.totalmem(), availableBytes: values.MemAvailable ?? os.freemem() };
}

export function parseNetworkCounters(contents: string): NetworkCounters {
  return contents.split("\n").slice(2).reduce<NetworkCounters>((total, line) => {
    const match = line.match(/^\s*([^:]+):\s*(\d+)\s+(?:\d+\s+){7}(\d+)/);
    if (!match || match[1].trim() === "lo") return total;
    return { received: total.received + Number(match[2]), transmitted: total.transmitted + Number(match[3]) };
  }, { received: 0, transmitted: 0 });
}

export function cpuUsage(previous: CpuSample | undefined, current: CpuSample) {
  if (!previous) return null;
  const total = current.total - previous.total;
  return total > 0 ? Math.max(0, Math.min(100, ((total - (current.idle - previous.idle)) / total) * 100)) : null;
}

export function networkRate(previous: NetworkCounters | undefined, current: NetworkCounters, elapsedMs: number) {
  if (!previous || elapsedMs <= 0) return { receivedBytesPerSecond: null, transmittedBytesPerSecond: null };
  return {
    receivedBytesPerSecond: Math.max(0, (current.received - previous.received) * 1000 / elapsedMs),
    transmittedBytesPerSecond: Math.max(0, (current.transmitted - previous.transmitted) * 1000 / elapsedMs),
  };
}

function read(path: string) { try { return fs.readFileSync(path, "utf8"); } catch { return null; } }
function cpuSample(): CpuSample {
  const times = os.cpus().reduce((sample, cpu) => ({ idle: sample.idle + cpu.times.idle, total: sample.total + Object.values(cpu.times).reduce((sum, time) => sum + time, 0) }), { idle: 0, total: 0 });
  return times;
}
function thermalCelsius() {
  const zones = read("/sys/class/thermal/thermal_zone0/temp");
  const value = zones ? Number(zones.trim()) : NaN;
  return Number.isFinite(value) && value > 0 ? value / (value > 1000 ? 1000 : 1) : null;
}
function disk() {
  try {
    const path = os.homedir(); const stats = fs.statfsSync(path); const totalBytes = Number(stats.blocks) * Number(stats.bsize); const availableBytes = Number(stats.bavail) * Number(stats.bsize);
    return { path, totalBytes, availableBytes, usedBytes: totalBytes - availableBytes, usedPercent: totalBytes ? ((totalBytes - availableBytes) / totalBytes) * 100 : 0 };
  } catch { return null; }
}
function dashboardService() {
  try {
    execFileSync("systemctl", ["is-active", "--quiet", "haas-arts-dashboard.service"], { stdio: "ignore", timeout: 1_000 });
    return { name: "haas-arts-dashboard.service", status: "active" as const };
  } catch (error) {
    return { name: "haas-arts-dashboard.service", status: (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT" ? "unavailable" : "inactive") as "inactive" | "unavailable" };
  }
}

export class SystemMetrics {
  private previousCpu: CpuSample | undefined;
  private previousNetwork: NetworkCounters | undefined;
  private previousAt = 0;

  summary(): SystemSummary {
    const now = Date.now(); const currentCpu = cpuSample(); const currentNetwork = parseNetworkCounters(read("/proc/net/dev") ?? "");
    const memory = parseMemInfo(read("/proc/meminfo") ?? ""); const usedBytes = Math.max(0, memory.totalBytes - memory.availableBytes);
    const summary: SystemSummary = {
      capturedAt: new Date(now).toISOString(),
      cpu: { usagePercent: cpuUsage(this.previousCpu, currentCpu), cores: os.cpus().length, loadAverage: os.loadavg() },
      memory: { ...memory, usedBytes, usedPercent: memory.totalBytes ? usedBytes / memory.totalBytes * 100 : 0 },
      disk: disk(), thermalCelsius: thermalCelsius(), network: networkRate(this.previousNetwork, currentNetwork, now - this.previousAt), uptimeSeconds: os.uptime(),
      system: { platform: os.platform(), release: os.release(), architecture: os.arch(), hostname: os.hostname() }, service: dashboardService(),
    };
    this.previousCpu = currentCpu; this.previousNetwork = currentNetwork; this.previousAt = now;
    return summary;
  }
}

export const systemMetrics = new SystemMetrics();
