import { describe, expect, it } from "vitest";
import { cpuUsage, networkRate, parseMemInfo, parseNetworkCounters } from "../server/src/services/system";

describe("system metric parsers and samples", () => {
  it("uses Linux MemAvailable for memory usage", () => {
    expect(parseMemInfo("MemTotal:       16000 kB\nMemAvailable:    6000 kB\n")).toEqual({ totalBytes: 16_384_000, availableBytes: 6_144_000 });
  });
  it("ignores loopback while totaling network interfaces", () => {
    const dev = "Inter-|   Receive                                                |  Transmit\n face |bytes packets errs drop fifo frame compressed multicast|bytes packets errs drop fifo colls carrier compressed\n    lo: 999 0 0 0 0 0 0 0 999 0 0 0 0 0 0 0\n  eth0: 120 0 0 0 0 0 0 0 240 0 0 0 0 0 0 0";
    expect(parseNetworkCounters(dev)).toEqual({ received: 120, transmitted: 240 });
  });
  it("calculates CPU and network deltas", () => {
    expect(cpuUsage({ idle: 40, total: 100 }, { idle: 70, total: 200 })).toBe(70);
    expect(networkRate({ received: 10, transmitted: 20 }, { received: 210, transmitted: 120 }, 2_000)).toEqual({ receivedBytesPerSecond: 100, transmittedBytesPerSecond: 50 });
  });
});
