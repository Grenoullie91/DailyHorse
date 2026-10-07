# Official API research: GitHub and YouTube

Checked against GitHub REST API and Google YouTube Data/Analytics API documentation. Implement only the official server-side APIs below.

| Source | Official API | Auth | Important limitation |
| --- | --- | --- | --- |
| GitHub | REST API, version `2022-11-28` | Fine-grained PAT / GitHub App | Repository traffic requires push access and has short retention |
| YouTube | Data API v3 and Analytics API v2 | Google OAuth 2.0 | Analytics is only available for the authenticated owner/channel |

## GitHub

**Base URL:** `https://api.github.com`  
**Authentication:** `Authorization: Bearer <fine-grained PAT>`; public repository metadata can be read without a token. Fine-grained tokens need repository access. Traffic endpoints require an account with push access to the repository; classic PATs historically use `repo` for private repositories.

**Endpoints used or planned**

- `GET /users/{username}/repos` and `GET /user/repos`: repositories, language, licence, stars, forks, issues, timestamps.
- `GET /repos/{owner}/{repo}/contributors`: contributor ranking.
- `GET /repos/{owner}/{repo}/releases`: releases.
- `GET /repos/{owner}/{repo}/traffic/views`: total and daily views / unique visitors.
- `GET /repos/{owner}/{repo}/traffic/clones`: total and daily clones / unique cloners.
- `GET /repos/{owner}/{repo}/traffic/popular/referrers` and `/traffic/popular/paths`: top referrers and content paths.

**Available metrics:** `stargazers_count`, `forks_count`, `open_issues_count`, primary `language`, SPDX `license.spdx_id`, `pushed_at`, contributors, releases, views, unique visitors, clones, unique cloners, referrers and popular paths.

**History and quotas:** views endpoint exposes the most recent **14 days**; clones exposes the most recent **14 days**. The dashboard stores daily snapshots locally to create long-term history. Authenticated REST API primary limit is generally 5,000 requests/hour; secondary rate limits also apply. The sync handles failures without deleting past local data.

**MIT identification:** use the repository `license.spdx_id === "MIT"`; this is a direct repository metadata field, not an inference.

## YouTube

**Data API base URL:** `https://www.googleapis.com/youtube/v3`  
**Analytics API base URL:** `https://youtubeanalytics.googleapis.com/v2`  
**Scopes:** `https://www.googleapis.com/auth/youtube.readonly` for read access; Google OAuth is mandatory for private owner analytics. API key is appropriate only for public Data API resources, never analytics.

**Endpoints planned**

- `GET /channels?part=snippet,statistics,contentDetails&mine=true` (or a configured channel ID): channel statistics.
- `GET /playlistItems?part=snippet,contentDetails&playlistId=...`: uploads.
- `GET /videos?part=snippet,statistics,contentDetails&id=...`: per-video public totals.
- `GET https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE...`: owner analytics by `day`, `video`, `country`, `deviceType`, `trafficSource` and supported traffic detail dimensions.

**Available analytics metrics:** views, likes, comments, shares, estimated minutes watched, average view duration, average view percentage, subscribers gained/lost, and eligible revenue metrics. `trafficSource` can identify sources such as YouTube Search, Suggested Videos, external and direct/unknown when supported by the selected report.

**Known limitations:** detailed Analytics reports are owned-channel data only. Retention curves are not exposed as a general per-second audience-retention API for ordinary channel reporting, so no retention curve is invented. Public `videos.statistics` has aggregate `viewCount`, `likeCount` and `commentCount`; it does not provide shares or watchtime. Default YouTube Data API quota is commonly 10,000 units/day; requests must be cached and batched. Analytics rows can change as YouTube finalizes data.
