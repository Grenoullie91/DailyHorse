import { describe, expect, it } from "vitest";
import { normalizeRemotePath, redactConnectionError, validHost, validRelativePath, validRemoteRoot } from "../server/src/services/remote-files.js";

describe("remote files security boundaries", () => {
  it("allows only relative paths without traversal", () => {
    expect(validRelativePath("dist/assets/app.js")).toBe(true);
    expect(validRelativePath("../.ssh/id_rsa")).toBe(false);
    expect(validRelativePath("/etc/passwd")).toBe(false);
    expect(validRelativePath("folder/../../secret")).toBe(false);
  });
  it("accepts host names but no URL-shaped hosts", () => {
    expect(validHost("staging.example.com")).toBe(true);
    expect(validHost("sftp://example.com")).toBe(false);
  });
  it("keeps configured remote roots inside their declared tree", () => { expect(validRemoteRoot("/public_html/assets")).toBe(true); expect(validRemoteRoot("/public_html/../private")).toBe(false); });
  it("normalizes POSIX remote roots without changing their tree", () => {
    expect(normalizeRemotePath("/htdocs//assets/")).toBe("/htdocs/assets");
    expect(normalizeRemotePath("/")).toBe("/");
    expect(() => normalizeRemotePath("/htdocs/../private")).toThrow("Ungültiger Serverpfad.");
  });
  it("redacts credential-shaped connection diagnostics", () => {
    expect(redactConnectionError("password rejected: private key /home/me/key")).not.toContain("/home/me/key");
  });
});
