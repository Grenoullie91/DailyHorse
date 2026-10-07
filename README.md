# DailyHorse

DailyHorse is a local-first dashboard for personal work: provider metrics, editorial summaries, local file workspaces, a browser companion, and persistent OpenCode or shell sessions. It runs as a local Fastify service with a React/Vite interface and SQLite state.

## Local-First Model

- The application server and Vite development server bind only to `127.0.0.1`.
- The application is intended for one local user, not for network or multi-user deployment.
- Runtime state is stored locally in SQLite under `DATA_DIR` (default `data/`).
- Optional provider credentials are read from local environment variables or local credential files. They are not sent to the browser by the application.
- The optional Chromium extension redirects new tabs to the local dashboard. Its saved pages use `chrome.storage.local`; it does not request broad host permissions.

## Features

- Dashboard views for configured Google, GitHub, YouTube, Google Play, and Meta/Instagram data sources.
- Optional read-only IMAP mail and Google Calendar views.
- Local editorial summary data from an optional `EDITORIAL_ROOT` directory.
- Local and SFTP file workspaces.
- Device actions through a local KDE Connect command bridge.
- A work queue, local SQLite history, and PTY-backed OpenCode and shell sessions.

Provider integrations are optional. Unconfigured or unavailable sources are reported as such rather than replaced with estimated data.

## Security And Privacy

- The server has a fixed loopback-only listener; `HOST` cannot expose it externally.
- Workspace control and WebSocket endpoints require a short-lived, in-memory token issued to allowed local origins.
- Browser development CORS is restricted to the loopback Vite origin.
- Secrets, credential files, environment files, databases, logs, and build output are excluded from Git by `.gitignore`.
- Data from configured providers, local files, terminal sessions, and the optional extension remains on the local machine except where an enabled integration necessarily contacts its provider.

This is not an authentication boundary for a shared computer. Do not expose it through port forwarding, a reverse proxy, containers with published ports, or a network interface. The terminal and file features can act with the permissions of the local user.

## Requirements

- Node.js 22 or newer
- A supported local shell and `node-pty` build environment
- OpenCode on `PATH` for agent sessions
- Optional: Chromium for the extension and `systemd --user` for autostart

## Setup

```bash
cp .env.example .env
npm install
npm run build
npm start
```

Open `http://127.0.0.1:4174` in the same machine's browser. The production server serves the built web application from `dist/web`.

For development, run:

```bash
npm run dev
```

The Vite interface is available at `http://127.0.0.1:5174` and proxies API requests to the local application server.

## Configuration

Start with `.env.example` and keep `.env` local. All provider credentials are optional. Do not commit tokens, passwords, OAuth client files, service-account files, databases, or local paths.

| Setting | Purpose |
| --- | --- |
| `PORT` | Local application port; defaults to `4174`. |
| `DATA_DIR` | Directory for the local SQLite database; defaults to `data`. |
| `SYNC_INTERVAL_MINUTES` | Connector refresh interval; defaults to `60`. |
| `OPENCODE_WORKSPACE_DIR` | Initial directory for OpenCode and shell sessions; defaults to the current user's home directory. |
| `OPENCODE_MAX_AGENTS` | Concurrent OpenCode process limit from `1` to `8`; defaults to `3`. |
| `EDITORIAL_ROOT` | Optional directory containing editorial JSON and draft content. |
| `DASHBOARD_ASSETS_DIR` | Optional directory containing `logodashboard.png` and `Headerdashboard.png`. |
| Provider variables | Optional GitHub, Google, YouTube, Meta, Google Play, and IMAP configuration described in `.env.example`. |

OAuth redirect URIs in `.env.example` use loopback URLs and must be registered with the relevant provider if that integration is enabled.

## Browser Extension

Load `new-tab-extension/` as an unpacked extension in a Chromium-based browser from its extensions page with developer mode enabled. It opens the local dashboard for new tabs and provides a side panel for saved pages and currently open tabs.

## Autostart

After building, install the user service with:

```bash
npm run install-autostart
```

The generated service runs `npm start` from this project directory. Check it with `systemctl --user status haas-arts-dashboard.service`.

## Limitations

- This project is intentionally loopback-only and has no remote-access deployment mode.
- Provider data depends on external API availability, permissions, quotas, and configured credentials.
- OpenCode does not provide reliable universal task-progress percentages. The dashboard shows process state, output, timestamps, and attention states instead.
- Running tasks are reconciled conservatively after a dashboard restart and may require review.
- The optional editorial root and asset directory are local filesystem paths; absent directories produce empty editorial data or unavailable image assets.
- SFTP, terminal, file, device, and provider actions have the capabilities and failure modes of their local tools and configured accounts.

## Verification

```bash
npm run build
npm test
```

## License

[ISC](LICENSE)
