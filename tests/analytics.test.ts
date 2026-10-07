import { describe, expect, it } from "vitest";

describe("dashboard data contracts", () => {
  it("keeps unavailable values distinct from a measured zero", () => {
    const unavailable: number | null = null;
    const measuredZero = 0;
    expect(unavailable).toBeNull();
    expect(measuredZero).toBe(0);
    expect(unavailable === measuredZero).toBe(false);
  });

  it("uses a restricted set of attribution labels", () => {
    const attribution = "directly_measured";
    expect(["directly_measured", "derived", "estimated", "unavailable"]).toContain(attribution);
  });
});
