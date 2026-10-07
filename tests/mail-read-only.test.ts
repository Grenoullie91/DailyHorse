import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const service = fs.readFileSync(path.resolve(import.meta.dirname, "../server/src/services/today-integrations.ts"), "utf8");
const routes = fs.readFileSync(path.resolve(import.meta.dirname, "../server/src/index.ts"), "utf8");

describe("IONOS mail connector read-only boundary", () => {
  it("opens the mailbox read-only for message access", () => {
    expect(service).toContain('mailboxOpen("INBOX", { readOnly })');
    expect(service).toContain("withMailbox(accountId, true");
  });

  it("contains no mutating IMAP command or public mutation route", () => {
    for (const forbidden of ["messageFlagsAdd", "messageFlagsRemove", "messageMove", "messageDelete", "mailboxMove", "append("]) {
      expect(service).not.toContain(forbidden);
    }
    expect(routes).not.toContain("/api/today/mail/messages/:uid");
  });
});
