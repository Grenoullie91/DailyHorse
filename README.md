# DailyHorse

DailyHorse is a local-first personal command center for daily work. It brings projects, research, attention items, provider metrics, editorial context, files, and persistent OpenCode sessions into one loopback-only dashboard.

It is designed for one person on one machine. DailyHorse is not a hosted service, a team collaboration system, or a remote-access terminal.

## What It Does

### Today: a practical work surface

The **Today** view is the home for the current day rather than a generic activity feed:

- Create projects and see their open task counts and status.
- Capture research topics or links, associate them with a project, and move them from inbox to researching to ready.
- Queue work for OpenCode from the task list.
- Use the **Attention Center** to surface tasks that need review, calendar events, and integrations that still need setup.
- Inspect a compact local system summary: CPU, memory, home-disk usage, network throughput, uptime, and service status.
- See optional mail, calendar, device, and GitHub traffic information in the same view.

DailyHorse does not fabricate unavailable data. An unconfigured integration reports its setup state instead of displaying estimates.

### Projects, research, and attention

Projects are a lightweight organizing layer for tasks, research, and SFTP profiles. Research items are deliberately simple: a title, optional notes and URL, project association, and a small status workflow. Attention is an aggregate of actionable items, not an AI-generated priority score.

### Provider dashboard

The KPI and source views show collected metrics, time series, connector state, sync status, and provider-specific status details. Supported optional sources cover Google Analytics, Google Search Console, Google Business Profile, YouTube, Google Play, GitHub, and Instagram through the Meta Graph API.

GitHub also has a Today card for the top repositories by recorded Traffic Views over the most recent 14-day API window, including each repository's views, unique visitors, and views recorded today. GitHub's traffic endpoint needs the appropriate repository access; the UI reports missing authentication or permissions explicitly.

### Editorial context

An optional editorial directory supplies local summary data: published articles, draft count, recent articles, editorial-news suggestions, and source-health counts. DailyHorse reads this content; it does not create or publish editorial material. The dashboard can link to a separately running editorial interface when one is available.

## OpenCode Command Center

The OpenCode workspace is a local PTY command center, not a remote agent API.

- Start, restart, stop, and create OpenCode sessions.
- Queue prompts as tasks, with bounded concurrent agent processes.
- View agent sessions, active and queued jobs, and recent workspace events.
- Use live in-browser terminals for both OpenCode and a local login shell.
- Persist session, task, and event metadata in SQLite.
- Reconcile running work conservatively after a dashboard restart by marking it for attention.

OpenCode must be installed and available on `PATH`. A task being sent to a terminal process is not proof that the task completed; DailyHorse records process and queue state rather than pretending to know universal task progress.

## Files

### Local workspaces

Local files are opt-in. You add existing absolute directories as named roots, then browse only within those roots. The workspace supports listing folders, creating folders, renaming, copying, moving, and opening files with the local desktop handler.

Path traversal and symbolic-link escapes are rejected. Copy and move operations do not overwrite an existing destination. These controls reduce accidental scope expansion, but they are not a substitute for backups or careful use: actions still run with the permissions of the local user.

### SFTP workspaces

SFTP profiles pair a local root with a remote root and can be associated with a project and environment label. Transfers are file-only in the current implementation:

- Browse the configured local and remote roots.
- Upload or download individual files.
- Review queued, transferring, completed, or failed transfer state.
- Receive an explicit conflict when a destination already exists, then choose whether to retry with overwrite enabled.

SFTP credentials are stored through KDE Wallet when available, not in the application database. DailyHorse requires a matching, non-revoked host key in the user's SSH `known_hosts` before connecting. It does not accept unknown server keys automatically, and it redacts credential-like text from connection errors. Directory transfers, key-based SFTP authentication, and remote file editing are not implemented.

## Device Bridge

When `kdeconnect-cli` is installed, paired and reachable KDE Connect devices can be used from Today to:

- Send an HTTP(S) URL.
- Send clipboard text.
- Ring a device.
- Send a selected file up to 25 MB.

The bridge checks device identity, pairing, reachability, and advertised capability before invoking KDE Connect. Shared files are placed in a private temporary directory and removed after the command finishes.

## Browser Companion

The optional Chromium Manifest V3 extension replaces the new-tab page with the local dashboard and provides a side panel for saved pages and open tabs. Its data is stored in `chrome.storage.local`. It requests `sidePanel`, `storage`, and `tabs` permissions; it does not request broad host permissions.

Load `new-tab-extension/` as an unpacked extension from the browser's extensions page with Developer Mode enabled.

## Mail And Calendar

Mail and calendar are optional Today integrations:

- IMAP mail accounts expose read-only inbox, unread, flagged, and subject/sender search views. Message content is not sent or modified by DailyHorse.
- Google Calendar uses OAuth with a read-only calendar scope. Select the calendars to include, then view today's events.

No mail or calendar data is simulated when a provider is unavailable or not configured.

## System Overview

The Today system card reads local machine state: CPU use and load, memory and disk use, network rate excluding loopback, uptime, optional thermal value, and the local dashboard service state. It is informational only; it does not provide process management beyond the workspace's own terminal and OpenCode controls.

## Providers

All providers are optional. Credentials remain local and connector failures are shown as source state rather than silently masked.

| Provider | Data shown | Connection model |
| --- | --- | --- |
| Google Analytics | Active users, sessions, page views and available series | Google OAuth/token and Analytics property configuration |
| Google Search Console | Search clicks and available series | Google OAuth/token and site configuration |
| Google Business Profile | Configured business metrics | Google OAuth/token and account/location configuration |
| YouTube | Channel views and available content metrics | Google OAuth/token and channel configuration |
| Google Play | Configured package metrics | Local service-account file and package configuration |
| GitHub | Repository metadata, metrics, and Traffic Views rankings | Fine-grained token and account configuration |
| Instagram | Professional-account metrics | Meta Graph API credentials/OAuth configuration |
| IMAP mail | Read-only message lists and search | Locally configured account credentials |
| Google Calendar | Calendar selection and today's events | Google OAuth with read-only calendar access |

Connector refreshes run on the configured interval and can also be invoked from the command line with `npm run sync`.

## Architecture

```text
Chromium extension (optional)       Browser UI (React + Vite)
              |                              |
              +---------- loopback ----------+
                                             |
                                  Fastify local service
                  +--------------------------+--------------------------+
                  |             |             |             |          |
               SQLite       OpenCode PTYs  Local files     SFTP    KDE Connect
                  |             |             |             |          |
             work state     local shell    approved roots  known hosts  paired devices
                  |
       optional provider connectors and read-only integrations
```

The React interface talks to a Fastify service. Application state, task metadata, configured file roots and profiles, and collected provider snapshots live in local SQLite under `DATA_DIR`. `node-pty` backs the OpenCode and shell terminals. The production server serves the built web application; Vite proxies API requests during development.

## Security And Privacy

- The application server is fixed to `127.0.0.1`; it cannot be configured to listen on a network interface.
- Browser development CORS is restricted to the loopback Vite origin.
- Workspace APIs and terminal WebSockets require a short-lived, in-memory token issued only to approved local origins.
- Provider secrets are read from local environment variables or local credential files and are not exposed by the application to the browser.
- SFTP passwords use KDE Wallet where available. SFTP host keys must already be trusted through `known_hosts`.
- Local file operations are constrained to explicitly registered roots and reject traversal and symbolic links.
- The extension stores its own saved-page data locally and has no broad host permission.
- Provider, file, terminal, and device data stays on the machine except when an enabled integration must contact its configured external provider or device.

This is not an authentication boundary on a shared computer. Do not expose DailyHorse through a reverse proxy, port forwarding, published container ports, or any network interface. The terminal, files, and device bridge can act with the local user's permissions.

## Requirements

- Node.js 22 or newer.
- A supported local shell and native build prerequisites for `node-pty`.
- OpenCode on `PATH` to use agent sessions.
- Optional: a Chromium-based browser for the extension.
- Optional: KDE Connect CLI and KDE Wallet for device actions and protected SFTP credentials.
- Optional: `systemd --user` for autostart.

## Install And Run

```bash
git clone <repository-url>
cd dashboard-app
cp .env.example .env
npm install
npm run build
npm start
```

Open `http://127.0.0.1:4174` on the same machine. The production server serves the built UI from `dist/web`.

For development:

```bash
npm run dev
```

Vite is available at `http://127.0.0.1:5174` and proxies API calls to the local service.

To collect configured provider data without waiting for the scheduler:

```bash
npm run sync
```

After a production build, an optional user-level autostart service can be installed with:

```bash
npm run install-autostart
```

## Configuration

Start with `.env.example`, keep `.env` untracked, and configure only the integrations you use. Never commit tokens, passwords, OAuth client files, service-account files, databases, logs, or local filesystem locations.

| Setting | Purpose |
| --- | --- |
| `PORT` | Local application port; defaults to `4174`. |
| `DATA_DIR` | Directory for local SQLite state; defaults to `data`. |
| `SYNC_INTERVAL_MINUTES` | Connector refresh cadence; defaults to `60`. |
| `OPENCODE_WORKSPACE_DIR` | Initial working directory for OpenCode and shell sessions; defaults to the current home directory. |
| `OPENCODE_MAX_AGENTS` | Concurrent OpenCode process limit from `1` to `8`; defaults to `3`. |
| `EDITORIAL_ROOT` | Optional local editorial data directory. |
| `DASHBOARD_ASSETS_DIR` | Optional directory for local dashboard image assets. |
| `GITHUB_USERNAME`, `GITHUB_TOKEN` | Optional GitHub account and fine-grained access token. |
| `GOOGLE_*`, `YOUTUBE_*` | Optional Google OAuth, Analytics, Search Console, Business, Calendar, and YouTube settings. |
| `PLAY_*` | Optional Google Play account, service-account file, and package settings. |
| `META_*` | Optional Meta/Instagram OAuth settings. |
| `IONOS_IMAP_ACCOUNTS` | Optional local JSON configuration for read-only IMAP accounts. |

Register the loopback redirect URIs from `.env.example` with Google or Meta when enabling those OAuth flows. Keep OAuth client and service-account files outside the repository.

## Development

```bash
npm install
npm run dev
npm test
npm run build
```

The codebase is split between `web/` for the React UI and `server/` for Fastify routes, local services, database access, connector scheduling, and integrations. Tests cover key contracts and safety-sensitive local files, SFTP, mail, device bridge, analytics, and system behavior.

## Limitations

- DailyHorse is intentionally single-user and loopback-only; remote and multi-user deployment are unsupported.
- Provider data depends on credentials, permissions, APIs, quotas, and external availability.
- GitHub Traffic Views are limited by GitHub's endpoint and require suitable repository permissions.
- OpenCode task state is operational metadata, not a reliable universal completion percentage or proof of success.
- A restart marks previously active agent work for review rather than assuming it continued.
- SFTP supports password-backed, host-key-verified individual file transfers only. It does not support folders, SSH keys, or remote editing.
- File and terminal controls remain powerful local-user operations despite their path and origin checks.
- Editorial data and optional assets are read from local directories; absent directories result in empty or unavailable content.
- KDE Connect features require the local CLI and a paired, reachable device.

## License

[ISC](LICENSE)
