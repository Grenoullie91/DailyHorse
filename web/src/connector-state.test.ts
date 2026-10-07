import { describe, expect, it } from "vitest";
import { connectorState } from "../../server/src/services/connector-state";

const source = (status: string, last_success_at: string | null = null) => ({ id: "google_play", name: "Google Play Console", status, status_detail: "Detail", last_success_at, last_attempt_at: null });

describe("connector status semantics", () => {
  it("keeps provider limitations neutral", () => expect(connectorState(source("unavailable"))).toMatchObject({ state: "unsupported", state_label: "Nicht unterstützt", action: null }));
  it("separates required external approval from local setup", () => {
    expect(connectorState(source("permission_missing"))).toMatchObject({ state: "access_required", state_label: "Freigabe erforderlich" });
    expect(connectorState(source("authentication_required"))).toMatchObject({ state: "setup_required", state_label: "Einrichtung erforderlich" });
  });
  it("retains historical success while showing a current setup failure", () => expect(connectorState(source("authentication_required", "2026-10-07T16:50:51.000Z"))).toMatchObject({ state: "setup_required", state_label: "Aktuell nicht verfügbar", last_success_at: "2026-10-07T16:50:51.000Z" }));
  it("marks runtime failures independently of the last successful sync", () => expect(connectorState(source("error", "2026-10-07T16:50:51.000Z"))).toMatchObject({ state: "operational_error", state_label: "Aktueller Fehler" }));
});
