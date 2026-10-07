import { describe, expect, it } from "vitest";
import { parseDevices, safeUploadName, validHttpUrl } from "../server/src/services/device-bridge.js";

describe("device bridge parsing and boundaries", () => {
  it("parses paired reachable and offline devices without inventing battery data", () => {
    const devices = parseDevices("- Pixel: abcdef123456 (Gekoppelt und Erreichbar)\n- Tablet: fedcba654321 (Gekoppelt)");
    expect(devices).toMatchObject([{ id: "abcdef123456", paired: true, reachable: true, batteryLevel: null }, { id: "fedcba654321", paired: true, reachable: false, capabilities: [] }]);
  });
  it("accepts only web links", () => { expect(validHttpUrl("https://example.com")).toBe(true); expect(validHttpUrl("javascript:alert(1)")).toBe(false); expect(validHttpUrl("file:///etc/passwd")).toBe(false); });
  it("keeps uploaded filenames out of paths", () => { expect(safeUploadName("../../private notes.txt")).toBe("private_notes.txt"); });
});
