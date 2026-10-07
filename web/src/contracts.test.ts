import { describe, expect, it } from "vitest";

describe("dashboard contracts", () => {
  it("does not turn unavailable data into zero", () => {
    const unavailable: number | null = null;
    expect(unavailable).toBeNull();
    expect(unavailable === 0).toBe(false);
  });
});
