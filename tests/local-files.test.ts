import { describe, expect, it } from "vitest";
import { validLocalRelativePath, validLocalRootName } from "../server/src/services/local-files.js";

describe("local files security boundaries", () => {
  it("allows only relative paths without traversal", () => {
    expect(validLocalRelativePath("work/assets/logo.png")).toBe(true);
    expect(validLocalRelativePath("../.ssh")).toBe(false);
    expect(validLocalRelativePath("/etc/passwd")).toBe(false);
    expect(validLocalRelativePath("work/../../secret")).toBe(false);
  });
  it("requires a concise display name for trusted roots", () => {
    expect(validLocalRootName("Current project")).toBe(true);
    expect(validLocalRootName("   ")).toBe(false);
  });
});
