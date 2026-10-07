# Official API research: Google analytics, search, business, and Play

| Source | Official API | Auth | Important limitation |
| --- | --- | --- | --- |
| Website | Google Analytics Data API v1beta | OAuth 2.0 or service account added to GA4 property | No individual click-path attribution outside collected GA4 events |
| SEO | Search Console API v3 | OAuth 2.0 `webmasters.readonly` | Query data is sampled/limited and does not identify people |
| Business Profile | Business Profile Performance API v1 | OAuth 2.0 and verified GBP access | Availability depends on the location and API enablement |
| Play | Android Publisher v3 + Play Developer Reporting v1beta1 | Service account granted Play Console access | Reporting coverage and beta availability vary by report |

## Google Analytics 4

**Base URL:** `https://analyticsdata.googleapis.com/v1beta`  
**Authentication:** OAuth 2.0 user credential or service account explicitly added to the GA4 property. Scope: `https://www.googleapis.com/auth/analytics.readonly`.

**Endpoint:** `POST /properties/{property}:runReport` (and `batchRunReports`). Supported metrics include `activeUsers`, `newUsers`, `sessions`, `screenPageViews`, `eventCount`, `userEngagementDuration`, `averageSessionDuration`, `sessionsPerUser`, and configured key-event/conversion metrics. Useful dimensions include `date`, `landingPage`, `pagePath`, `pageTitle`, `sessionSource`, `sessionMedium`, `sessionDefaultChannelGroup`, `eventName`, and `fullPageUrl` where supported by the property.

**Limitations:** GA4 can report aggregate dimensions; it cannot honestly prove a social post caused an individual conversion unless tagging/events directly make that association measurable. Data freshness, retention and quotas are property/configuration dependent. Use the Data API quota response/property quota and cache completed reports.

## Google Search Console

**Base URL:** `https://searchconsole.googleapis.com/webmasters/v3`  
**Authentication/scope:** OAuth 2.0 with `https://www.googleapis.com/auth/webmasters.readonly` (or the non-readonly webmasters scope).

**Endpoint:** `POST /sites/{siteUrl}/searchAnalytics/query`. Metrics are clicks, impressions, CTR and position; dimensions are date, query, page, country, device and search appearance. The configured domain property is `sc-domain:haasarts.de`.

**Limitations:** Search Console performance history is normally available for up to 16 months. Query rows can be anonymized or omitted for privacy, totals can differ from a row breakdown, and API row limits apply. The dashboard must label search values as directly measured Search Console aggregates, never as conversion attribution.

## Google Business Profile

**Base URL:** `https://businessprofileperformance.googleapis.com/v1`  
**Authentication:** OAuth 2.0 for a user who has access to the Business Profile; configure the current Google Business Profile APIs in the Cloud project. Scope used by the relevant Business Profile API documentation is `https://www.googleapis.com/auth/business.manage`.

**Endpoints:** `GET /locations/{location}:getDailyMetricsTimeSeries` (where enabled) and performance search endpoints including `locations.searchkeywords.impressions.monthly.list`; account/location discovery uses the Business Profile Account Management and Business Information APIs. Report availability differs by metric/version.

**Metrics:** official profile performance can cover Search/Maps impressions and action metrics such as website clicks, calls and directions where exposed for the location/API. Exact metric names and ranges are validated at connection time and shown in the source dialog.

**Limitations:** no scrape of the public Google search result. API access, account/location IDs, region, verification, metrics and history vary. Unsupported metrics show **Not available through official API**, never zero.

**Current Haas Arts status:** the Google Business Profile API access application for this project was declined by Google. The dashboard therefore marks this source as unavailable and performs no workaround such as browser automation, cookies, scraping or copied sessions.

## Google Play Console

**APIs:** Android Publisher API v3 (`https://androidpublisher.googleapis.com/androidpublisher/v3`) and Google Play Developer Reporting API v1beta1 (`https://playdeveloperreporting.googleapis.com/v1beta1`).  
**Authentication:** a Google Cloud service account granted access in Play Console **Users and permissions**; scope `https://www.googleapis.com/auth/androidpublisher`.

**Officially available:** Android Publisher API exposes app/release management and user reviews (`reviews.list`, `reviews.get`, `reviews.reply`). Play Developer Reporting exposes supported Android vitals/error reports, including crash/ANR issue/report resources, subject to the reporting API's current product availability and permissions.

**Important limitation:** the Android Publisher API is not a general Play Console acquisition analytics API. Install/download totals, active-user reporting, version distribution, uninstalls and all vitals must be validated against the enabled Developer Reporting reports for the developer account. If a requested report/metric is absent, the UI states **Not available through official API**. No browser automation or copied Play Console session is used.
