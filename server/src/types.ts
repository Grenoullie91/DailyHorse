export type SourceStatus = "connected" | "syncing" | "authentication_required" | "permission_missing" | "unavailable" | "error";
export type Attribution = "directly_measured" | "derived" | "estimated" | "unavailable";

export interface Connector {
  id: string;
  name: string;
  status(): Promise<{ status: SourceStatus; detail: string }>;
  sync(): Promise<void>;
}

export interface SourceInfo {
  source: string;
  metric: string;
  fetchedAt: string | null;
  attribution: Attribution;
  availability: "available" | "unavailable";
  detail?: string;
}
