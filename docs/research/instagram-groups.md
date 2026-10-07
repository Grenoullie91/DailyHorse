# Official API research: Instagram and Google Groups

| Source | Official API | Auth | Important limitation |
| --- | --- | --- | --- |
| Instagram | Meta Instagram Graph/API for professional accounts | Meta OAuth and approved permissions | Per-media fields vary by media type and permissions |
| Google Groups | No personal Groups analytics API | N/A | Group activity statistics are not available through a general official API |

## Instagram

**Official API:** Meta's Instagram API / Graph API for Instagram professional (Business or Creator) accounts.  
**Base URL:** `https://graph.facebook.com/{version}`.  
**Permissions:** depending on the chosen Meta login architecture and approved use case, `instagram_basic`, `instagram_manage_insights`, and sometimes Page/business permissions such as `pages_show_list` / `business_management`. Keep the access token server-side; long-lived token renewal is handled only by the connector.

**Endpoints planned:** `GET /{ig-user-id}/media` for media inventory; `GET /{ig-media-id}/insights?metric=...` for per-media insight metrics; `GET /{ig-user-id}/insights` for account-level insights.

**Available metrics (subject to media type/API version):** reach, views/plays, impressions where supported, likes, comments, shares, saves, accounts engaged, total interactions, profile activity and follower metrics. Reels, video, image, carousel and story support distinct metric sets. The connector requests only the metrics declared available for the returned media type.

**Limitations:** a post-level website click/conversion path is generally not a universal official metric. Profile/link clicks and website impact cannot be claimed for an individual post unless Meta returns that direct metric and the implementation records it. Unsupported content-type metrics are **Not available**, not zero. Meta changes API versions, insight windows and permissions; field availability is checked against API responses at sync time.

## Google Groups

Google has Groups Settings and Groups Migration APIs and, for Workspace administrators, Admin SDK Reports/audit data. These do not provide a general official API for a private user's `groups.google.com/my-groups` membership, post analytics or engagement metrics.

**Verdict:** **NOT AVAILABLE through official API** for the requested personal Google Groups performance/dashboard integration. This dashboard deliberately does not store cookies, scrape pages, copy browser sessions or automate an interactive Google login. The Data Sources page communicates this explicitly.
