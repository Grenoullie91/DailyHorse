import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

type GoogleClientFile = { web?: { client_id?: string; client_secret?: string; redirect_uris?: string[] }; installed?: { client_id?: string; client_secret?: string; redirect_uris?: string[] } };
let clientFile: GoogleClientFile = {};
const clientFilePath = process.env.GOOGLE_CLIENT_SECRET_FILE;
if (clientFilePath && fs.existsSync(clientFilePath)) clientFile = JSON.parse(fs.readFileSync(clientFilePath, "utf8")) as GoogleClientFile;
const googleClient = clientFile.web ?? clientFile.installed ?? {};

export const config = {
  port: Number(process.env.PORT ?? 4174),
  host: process.env.HOST ?? "127.0.0.1",
  dataDir: path.resolve(process.env.DATA_DIR ?? "data"),
  syncIntervalMinutes: Number(process.env.SYNC_INTERVAL_MINUTES ?? 60),
  github: { username: process.env.GITHUB_USERNAME ?? "Grenoullie91", token: process.env.GITHUB_TOKEN },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? googleClient.client_id,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? googleClient.client_secret,
    accessToken: process.env.GOOGLE_ACCESS_TOKEN,
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
    ga4PropertyId: process.env.GA4_PROPERTY_ID,
    searchConsoleSiteUrl: process.env.SEARCH_CONSOLE_SITE_URL,
    businessAccountId: process.env.GOOGLE_BUSINESS_ACCOUNT_ID,
    businessLocationId: process.env.GOOGLE_BUSINESS_LOCATION_ID,
    playDeveloperAccountId: process.env.PLAY_DEVELOPER_ACCOUNT_ID,
  },
  youtube: { channelId: process.env.YOUTUBE_CHANNEL_ID, handle: process.env.YOUTUBE_CHANNEL_HANDLE },
  instagram: { accountId: process.env.INSTAGRAM_ACCOUNT_ID, token: process.env.INSTAGRAM_ACCESS_TOKEN },
  play: { serviceAccountFile: process.env.PLAY_SERVICE_ACCOUNT_FILE, packageNames: (process.env.PLAY_PACKAGE_NAMES ?? "").split(",").map((value) => value.trim()).filter(Boolean) },
  meta: { appId: process.env.META_APP_ID, appSecret: process.env.META_APP_SECRET, redirectUri: process.env.META_REDIRECT_URI ?? "http://127.0.0.1:4174/api/oauth/meta/callback" },
};
