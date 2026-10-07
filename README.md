# Haas Arts Digital Performance Dashboard

Local-first daily dashboard for the digital performance of Haas Arts. It runs locally at `http://127.0.0.1:4174`, persists metric snapshots in SQLite, and never puts external API credentials in the frontend.

## Current delivery

- Production-ready local React dashboard with dark/light mode, responsive layout, source dialogs, KPI availability states, content table, GitHub open-source view, source-status page and no fabricated data.
- Fastify API and SQLite/WAL persistence with normalized `sources`, `channels`, `content`, `metric_snapshots`, `traffic_sources`, `journeys` and `sync_runs` tables.
- Connector lifecycle architecture: authenticate/configure -> collect -> normalize -> persist -> report sync state.
- Working GitHub connector: repository metadata, MIT identification, stars, forks, issues, and owner traffic views/clones when the token has the required repository access. GitHub's short traffic history is retained locally as snapshots.
- Working Google connectors for GA4 daily users/sessions/pageviews/engagement/events, Search Console daily clicks/impressions/CTR/position, and YouTube Analytics daily views/likes/comments/shares/watchtime once a valid OAuth access token is configured.
- Explicit, secure connection states for GA4, Search Console, YouTube, Instagram, Google Business, Google Play and Google Groups. The first four remain connection-required until OAuth/service credentials are configured; Groups is explicitly unavailable through a suitable official analytics API.

## Requirements

- Node.js 22+ and npm
- A local desktop session with `systemd --user` for autostart
- API credentials only for sources you choose to connect

## Install and run

```bash
cd ~/dashboard-app
cp .env.example .env
npm install
npm run build
npm start
```

Open `http://127.0.0.1:4174`. For development with hot reload, run `npm run dev` and open `http://127.0.0.1:5174`.

## GitHub setup

1. Create a fine-grained PAT belonging to `Grenoullie91` with access to the required repositories.
2. Grant the token the minimum repository permissions needed for metadata. GitHub traffic endpoints additionally require push-level repository access.
3. Add `GITHUB_TOKEN=...` to `.env`.
4. Run `npm run sync` or use **Aktualisieren** in the UI.

Alternatively, an authenticated local GitHub CLI (`gh auth login`) for the repository owner is used through the OS keyring. Its token is never copied into `.env`, the database or logs.

## Google / Meta configuration

Create OAuth credentials in the platform's official developer console. Secrets remain in `.env`; the browser only calls the local dashboard API.

The configured Google client file supports the local authorization route: open `http://127.0.0.1:4174/api/oauth/google/start`, sign in with an account that has access to GA4, Search Console and the Haas Arts YouTube channel, then grant the listed read-only scopes. Access/refresh tokens are stored only in the local SQLite database, never returned to the browser.

| Source | Required configuration | Main official scope / permission |
| --- | --- | --- |
| GA4 | Google OAuth or a service account added to the property; `GA4_PROPERTY_ID` | `analytics.readonly` |
| Search Console | OAuth user with verified property access; `SEARCH_CONSOLE_SITE_URL` | `webmasters.readonly` |
| YouTube | Google OAuth owner of the channel; `YOUTUBE_CHANNEL_ID` | `youtube.readonly` |
| Instagram | Professional account, approved Meta app permissions, account ID/token | `instagram_basic`, `instagram_manage_insights` |
| Google Business | OAuth user with Business Profile location access | `business.manage` |
| Google Play | Service account granted Play Console access | `androidpublisher` |

For Play, configure `PLAY_SERVICE_ACCOUNT_FILE` with an absolute path to a locally protected service-account JSON key and `PLAY_PACKAGE_NAMES` as a comma-separated allow-list. The dashboard uses a signed server-side JWT, does not copy the private key, and currently reads the official Android Publisher reviews endpoint. Installs, active users, uninstalls, version distribution and vitals are shown only after the respective Play Developer Reporting API report is available for the account; they are never inferred from reviews.

Detailed official API coverage, endpoint limitations and unavailable metrics are in `docs/research/`.

Google Business Profile data is available only if Google approves Business Profile API access for the Cloud project. A rejected application is represented as **Not available through official API**; this project will not bypass that restriction through scraping or browser automation.

For the configured Facebook Login variant, configure `META_APP_ID`, `META_APP_SECRET`, and `META_REDIRECT_URI` locally, use `instagram_business_basic`, `instagram_business_manage_insights` and `pages_show_list`, and link the professional Instagram account to an accessible Facebook Page. Meta permits the local HTTP exception only for `localhost`, so use `http://localhost:4174/api/oauth/meta/callback` during local development. Do not use normal Instagram credentials or browser cookies. Start the local authorization at `/api/oauth/meta/start`; tokens are stored only in the local SQLite database.

## Data model and attribution

- `sources`: connection and error state.
- `channels` and `content`: normalized platform entities.
- `metric_snapshots`: append-only historical values with period, dimensions, source and attribution.
- `traffic_sources`: acquisition breakdowns.
- `journeys`: only directly measured or explicitly derived flows.
- `sync_runs`: audit trail for every attempt.

Attribution labels are intentional: **directly measured**, **derived**, **estimated**, and **unavailable**. The application must never claim an Instagram/YouTube conversion path that the connected APIs do not directly measure.

## Synchronisation

The scheduler syncs at process startup and subsequently every `SYNC_INTERVAL_MINUTES` (minimum 15). The default is 60. `POST /api/sync` and each source page's action trigger a manual server-side sync. Connector failures preserve previously stored values and are visible under **Data Sources**.

## Autostart

Build once, then install the systemd user service:

```bash
cd ~/dashboard-app
npm run build
npm run install-autostart
```

The service uses `systemd --user`, no terminal window, and restarts after a failure. Confirm it with:

```bash
systemctl --user status haas-arts-dashboard.service
```

Remove it with `npm run uninstall-autostart`.

## Troubleshooting

- **Connection required:** fill the relevant `.env` values and ensure the external account has the documented permission.
- **GitHub traffic missing:** traffic endpoints require push-level access and only expose a short rolling window; check the token's repository access.
- **Metric is blank instead of zero:** this is intentional when a connector has not delivered the metric or the official API does not expose it.
- **Port is busy:** change `PORT` in `.env`, rebuild, and restart the systemd service.
- **Inspect service logs:** `journalctl --user -u haas-arts-dashboard.service -f`.

## Security

`.env`, SQLite data and logs are ignored by Git. Never copy browser cookies, hard-code credentials, or expose a token in the UI. This project uses only official APIs and server-side credentials.
