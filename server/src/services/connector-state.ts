export type ConnectorState = "connected" | "syncing" | "unsupported" | "access_required" | "setup_required" | "operational_error";

export type SourceRow = { id: string; name: string; status: string; status_detail: string; last_success_at: string | null; last_attempt_at: string | null };

export function connectorState(source: SourceRow) {
  if (source.status === "unavailable") return { ...source, state: "unsupported" as ConnectorState, state_label: "Nicht unterstützt", action: null };
  if (source.status === "permission_missing") return { ...source, state: "access_required" as ConnectorState, state_label: "Freigabe erforderlich", action: "Externe API-Freigabe prüfen" };
  if (source.status === "authentication_required") return source.last_success_at
    ? { ...source, state: "setup_required" as ConnectorState, state_label: "Aktuell nicht verfügbar", action: "Lokale Konfiguration prüfen" }
    : { ...source, state: "setup_required" as ConnectorState, state_label: "Einrichtung erforderlich", action: "Lokale Konfiguration prüfen" };
  if (source.status === "error") return { ...source, state: "operational_error" as ConnectorState, state_label: "Aktueller Fehler", action: "Verbindung und letzten Fehler prüfen" };
  if (source.status === "syncing") return { ...source, state: "syncing" as ConnectorState, state_label: "Synchronisiert", action: null };
  return { ...source, state: "connected" as ConnectorState, state_label: "Verbunden", action: null };
}
