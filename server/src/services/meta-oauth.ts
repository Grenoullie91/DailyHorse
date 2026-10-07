import crypto from "node:crypto";
import { config } from "../config.js";
import { db } from "../db.js";

const states = new Set<string>();
const scopes = ["instagram_basic", "pages_show_list"];

export function metaAuthorizationUrl() {
  if (!config.meta.appId || !config.meta.appSecret) throw new Error("Meta App ID and App Secret must be configured locally.");
  const state = crypto.randomUUID(); states.add(state);
  const url = new URL("https://www.facebook.com/v24.0/dialog/oauth");
  url.search = new URLSearchParams({ client_id: config.meta.appId, redirect_uri: config.meta.redirectUri, response_type: "code", scope: scopes.join(","), state }).toString();
  return url.toString();
}

export async function completeMetaAuthorization(code: string, state: string) {
  if (!states.delete(state)) throw new Error("Meta OAuth state is invalid or has expired.");
  const body = new URLSearchParams({ client_id: config.meta.appId!, client_secret: config.meta.appSecret!, grant_type: "authorization_code", redirect_uri: config.meta.redirectUri, code });
  const exchange = await fetch("https://graph.facebook.com/v24.0/oauth/access_token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!exchange.ok) throw new Error(`Meta token exchange failed: ${await exchange.text()}`);
  const shortToken = await exchange.json() as { access_token: string };
  const longUrl = new URL("https://graph.facebook.com/v24.0/oauth/access_token");
  longUrl.search = new URLSearchParams({ grant_type: "fb_exchange_token", client_id: config.meta.appId!, client_secret: config.meta.appSecret!, fb_exchange_token: shortToken.access_token }).toString();
  const longExchange = await fetch(longUrl);
  if (!longExchange.ok) throw new Error(`Meta long-lived token exchange failed: ${await longExchange.text()}`);
  const token = await longExchange.json() as { access_token: string; expires_in?: number };
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
  db.prepare("INSERT INTO oauth_tokens(provider,access_token,refresh_token,expires_at,updated_at) VALUES ('meta',?,?,?,?) ON CONFLICT(provider) DO UPDATE SET access_token=excluded.access_token,expires_at=excluded.expires_at,updated_at=excluded.updated_at")
    .run(token.access_token, null, expiresAt, new Date().toISOString());
}

export async function metaAccessToken() {
  const stored = db.prepare("SELECT access_token,expires_at FROM oauth_tokens WHERE provider='meta'").get() as { access_token: string; expires_at: string | null } | undefined;
  if (!stored) return undefined;
  if (!stored.expires_at || new Date(stored.expires_at).getTime() > Date.now() + 7 * 86400000) return stored.access_token;
  throw new Error("Meta access token is near expiry; reconnect required.");
}
