import crypto from "node:crypto";
import { config } from "../config.js";
import { db } from "../db.js";

const states = new Set<string>();
const scopes = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/business.manage",
  "https://www.googleapis.com/auth/calendar.readonly",
];

export function authorizationUrl() {
  if (!config.google.clientId || !config.google.clientSecret) throw new Error("Google OAuth client credentials are not configured.");
  const state = crypto.randomUUID(); states.add(state);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: config.google.clientId, redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? "http://127.0.0.1:4174/api/oauth/google/callback", response_type: "code", access_type: "offline", prompt: "consent", scope: scopes.join(" "), state }).toString();
  return url.toString();
}

export async function completeAuthorization(code: string, state: string) {
  if (!states.delete(state)) throw new Error("OAuth state is invalid or has expired.");
  const body = new URLSearchParams({ code, client_id: config.google.clientId!, client_secret: config.google.clientSecret!, redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? "http://127.0.0.1:4174/api/oauth/google/callback", grant_type: "authorization_code" });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) throw new Error(`Google token exchange failed: ${await response.text()}`);
  const token = await response.json() as { access_token: string; refresh_token?: string; expires_in?: number };
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
  db.prepare("INSERT INTO oauth_tokens(provider,access_token,refresh_token,expires_at,updated_at) VALUES ('google',?,?,?,?) ON CONFLICT(provider) DO UPDATE SET access_token=excluded.access_token,refresh_token=COALESCE(excluded.refresh_token,oauth_tokens.refresh_token),expires_at=excluded.expires_at,updated_at=excluded.updated_at")
    .run(token.access_token, token.refresh_token ?? null, expiresAt, new Date().toISOString());
}

export async function googleAccessToken() {
  const stored = db.prepare("SELECT access_token,refresh_token,expires_at FROM oauth_tokens WHERE provider='google'").get() as { access_token: string; refresh_token: string | null; expires_at: string | null } | undefined;
  if (!stored) return config.google.accessToken;
  if (!stored.expires_at || new Date(stored.expires_at).getTime() > Date.now() + 60_000) return stored.access_token;
  if (!stored.refresh_token || !config.google.clientId || !config.google.clientSecret) throw new Error("Google OAuth token expired; reconnect required.");
  const body = new URLSearchParams({ client_id: config.google.clientId, client_secret: config.google.clientSecret, refresh_token: stored.refresh_token, grant_type: "refresh_token" });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) throw new Error("Google OAuth refresh failed; reconnect required.");
  const token = await response.json() as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();
  db.prepare("UPDATE oauth_tokens SET access_token=?,expires_at=?,updated_at=? WHERE provider='google'").run(token.access_token, expiresAt, new Date().toISOString());
  return token.access_token;
}
