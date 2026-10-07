import { BaseConnector } from "./base.js";
import type { SourceStatus } from "../types.js";

export class PlaceholderConnector extends BaseConnector {
  constructor(public id: string, public name: string, private detail: string, private required: boolean = true, private unavailableStatus: Extract<SourceStatus, "unavailable" | "permission_missing"> = "unavailable") { super(); }
  async status(): Promise<{ status: SourceStatus; detail: string }> { return { status: this.required ? "authentication_required" : this.unavailableStatus, detail: this.detail }; }
  async collect(): Promise<number> { throw new Error(this.detail); }
}
