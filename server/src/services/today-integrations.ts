import { ImapFlow } from "imapflow";
import { config } from "../config.js";
import { db } from "../db.js";
import { googleAccessToken } from "./google-oauth.js";

type MailAccount = { id: string; email: string; password: string; host?: string; port?: number; tls?: boolean };
type MailFilter = "inbox" | "unread" | "flagged" | "search";
const integrationState = (provider: "mail" | "calendar", state: string, detail: string) =>
  db.prepare("INSERT INTO integration_setup(provider,state,detail,updated_at) VALUES (?,?,?,?) ON CONFLICT(provider) DO UPDATE SET state=excluded.state,detail=excluded.detail,updated_at=excluded.updated_at").run(provider, state, detail, new Date().toISOString());

function accounts(): MailAccount[] {
  if (!config.ionos.accountsJson) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(config.ionos.accountsJson); } catch { throw new Error("IONOS_IMAP_ACCOUNTS must be valid JSON."); }
  if (!Array.isArray(parsed)) throw new Error("IONOS_IMAP_ACCOUNTS must be a JSON array.");
  return parsed.map((account) => {
    const item = account as Partial<MailAccount>;
    if (!item.id || !item.email || !item.password || !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id)) throw new Error("Every IONOS account needs a safe id, email, and password.");
    return { id: item.id, email: item.email, password: item.password, host: item.host ?? "imap.ionos.com", port: item.port ?? 993, tls: item.tls ?? true };
  });
}

function attachmentMetadata(structure: any, result: Array<{ filename: string | null; contentType: string | null; size: number | null }> = []) {
  if (!structure) return result;
  if (structure.disposition === "attachment" || structure.dispositionParameters?.filename || structure.parameters?.name) result.push({ filename: structure.dispositionParameters?.filename ?? structure.parameters?.name ?? null, contentType: structure.type ? `${structure.type}/${structure.subtype}` : null, size: structure.size ?? null });
  for (const child of structure.childNodes ?? []) attachmentMetadata(child, result);
  return result;
}

function headerValue(headers: Buffer | undefined, name: string) {
  const match = headers?.toString("utf8").match(new RegExp(`^${name}:\\s*([^\\r\\n]+)`, "im"));
  return match?.[1] ?? null;
}

async function withMailbox<T>(accountId: string, readOnly: boolean, action: (client: ImapFlow) => Promise<T>) {
  const account = accounts().find((item) => item.id === accountId);
  if (!account) throw new Error("Unknown mail account.");
  const client = new ImapFlow({ host: account.host!, port: account.port!, secure: account.tls!, auth: { user: account.email, pass: account.password }, logger: false });
  try { await client.connect(); await client.mailboxOpen("INBOX", { readOnly }); const value = await action(client); integrationState("mail", "connected", `${accounts().length} IONOS account(s) configured; Inbox access is read-only.`); return value; }
  catch (error) { integrationState("mail", "error", error instanceof Error ? error.message : "Unable to connect to IONOS IMAP."); throw error; }
  finally { if (client.usable) await client.logout().catch(() => undefined); }
}

export const todayIntegrations = {
  setup() {
    try { const mail = accounts(); if (!mail.length) integrationState("mail", "setup_needed", "Add IONOS_IMAP_ACCOUNTS locally to connect mail."); }
    catch (error) { integrationState("mail", "error", error instanceof Error ? error.message : "Invalid mail setup."); }
    const google = db.prepare("SELECT 1 FROM oauth_tokens WHERE provider='google'").get() || config.google.accessToken;
    if (!google) integrationState("calendar", "setup_needed", "Connect Google to grant read-only Calendar access.");
    return db.prepare("SELECT provider,state,detail,updated_at FROM integration_setup ORDER BY provider").all();
  },
  async messages(accountId: string, filter: MailFilter = "inbox", search = "") {
    return withMailbox(accountId, true, async (client) => {
      const criteria = filter === "unread" ? { seen: false } : filter === "flagged" ? { flagged: true } : filter === "search" && search.trim() ? { or: [{ subject: search.trim() }, { from: search.trim() }, { to: search.trim() }] } : { all: true };
      const uids = (await client.search(criteria, { uid: true })) || [];
      const messages: any[] = [];
      for await (const message of client.fetch(uids.slice(-100), { uid: true, envelope: true, flags: true, internalDate: true, bodyStructure: true, headers: ["message-id", "in-reply-to", "references"] }, { uid: true })) {
        const envelope = message.envelope;
        messages.push({ uid: message.uid, subject: envelope?.subject ?? "(no subject)", from: envelope?.from?.map((item) => item.address ?? item.name).filter(Boolean) ?? [], to: envelope?.to?.map((item) => item.address ?? item.name).filter(Boolean) ?? [], date: message.internalDate ? new Date(message.internalDate).toISOString() : null, unread: !message.flags?.has("\\Seen"), flagged: message.flags?.has("\\Flagged") ?? false, messageId: headerValue(message.headers, "message-id"), inReplyTo: headerValue(message.headers, "in-reply-to"), references: headerValue(message.headers, "references"), attachments: attachmentMetadata(message.bodyStructure) });
      }
      return { account: { id: accountId, email: accounts().find((item) => item.id === accountId)?.email }, messages: messages.reverse() };
    });
  },
  async changeMessage(accountId: string, uid: number, action: "read" | "unread" | "flag" | "unflag") {
    return withMailbox(accountId, false, async (client) => {
      const flag = action === "read" || action === "unread" ? "\\Seen" : "\\Flagged";
      if (action === "read" || action === "flag") await client.messageFlagsAdd(uid, [flag], { uid: true }); else await client.messageFlagsRemove(uid, [flag], { uid: true });
      return { ok: true };
    });
  },
  async calendars() {
    try {
      const token = await googleAccessToken();
      if (!token) throw new Error("Google Calendar is not connected.");
      const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`Google Calendar request failed (${response.status}). Reconnect Google if the Calendar scope was just added.`);
      const body = await response.json() as { items?: Array<{ id: string; summary: string; primary?: boolean; backgroundColor?: string }> };
      const selected = new Set((db.prepare("SELECT calendar_id FROM calendar_selections WHERE selected=1").all() as Array<{ calendar_id: string }>).map((row) => row.calendar_id));
      const calendars = (body.items ?? []).map((calendar) => ({ ...calendar, selected: selected.size ? selected.has(calendar.id) : Boolean(calendar.primary) }));
      integrationState("calendar", "connected", `${calendars.filter((calendar) => calendar.selected).length} calendar(s) selected locally.`);
      return { calendars };
    } catch (error) { integrationState("calendar", "error", error instanceof Error ? error.message : "Unable to load calendars."); throw error; }
  },
  async events() {
    const { calendars } = await this.calendars();
    const token = await googleAccessToken();
    const timeMin = new Date(); timeMin.setHours(0, 0, 0, 0); const timeMax = new Date(timeMin); timeMax.setDate(timeMax.getDate() + 1);
    const events = (await Promise.all(calendars.filter((calendar) => calendar.selected).map(async (calendar) => {
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events`); url.search = new URLSearchParams({ timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), singleEvents: "true", orderBy: "startTime" }).toString();
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error(`Unable to load events for ${calendar.summary}.`);
      const body = await response.json() as { items?: Array<any> };
      return (body.items ?? []).map((event) => ({ id: event.id, calendarId: calendar.id, calendar: calendar.summary, summary: event.summary ?? "(no title)", start: event.start?.dateTime ?? event.start?.date ?? null, end: event.end?.dateTime ?? event.end?.date ?? null, allDay: Boolean(event.start?.date && !event.start?.dateTime) }));
    }))).flat().sort((a, b) => String(a.start).localeCompare(String(b.start)));
    return { events };
  },
  selectCalendars(ids: string[]) {
    const transaction = db.transaction(() => { db.prepare("UPDATE calendar_selections SET selected=0,updated_at=?").run(new Date().toISOString()); const statement = db.prepare("INSERT INTO calendar_selections(calendar_id,selected,updated_at) VALUES (?,1,?) ON CONFLICT(calendar_id) DO UPDATE SET selected=1,updated_at=excluded.updated_at"); for (const id of ids) statement.run(id, new Date().toISOString()); });
    transaction();
  },
  accounts: () => accounts().map(({ id, email }) => ({ id, email })),
};
