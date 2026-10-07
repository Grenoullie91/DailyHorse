import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const extension = path.resolve(import.meta.dirname, "../../new-tab-extension");

describe("browser workspace extension", () => {
  it("uses the official side panel APIs without broad host access", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(extension, "manifest.json"), "utf8")) as { manifest_version: number; permissions: string[]; side_panel?: { default_path: string }; host_permissions?: string[] };
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(expect.arrayContaining(["sidePanel", "storage", "tabs"]));
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.side_panel?.default_path).toBe("sidepanel.html");
  });

  it("keeps saved pages local and validates URL schemes before opening them", () => {
    const source = fs.readFileSync(path.join(extension, "sidepanel.js"), "utf8");
    expect(source).toContain("chrome.storage.local");
    expect(source).toContain("/^https?:$/");
    expect(source).not.toContain("storage.sync");
  });
});
