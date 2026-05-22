# Live Site Page Inventory

Date: 2026-05-21

Scope: current Next.js routes, server data loaders, client actions, and live Supabase data availability. Data checks were summary-only: table counts, timestamps, and aggregate metrics, not customer/message contents.

## Executive Decision

The live app now has two overlapping information architectures:

- Legacy IA: `/`, `/analyst`, `/creative-analysis`, `/attribution-ledger`, `/website-funnel`, `/inbox`, `/analysis`, `/admin/backfill`, `/users`, plus placeholders `/review` and `/outcomes`.
- New room IA: `/optimize`, `/convert`, `/operate`, plus sales shell `/m/inbox`.

The strongest product direction is to keep the new room IA as the primary product, because it matches the user jobs:

- `/optimize`: marketing performance decisions.
- `/convert`: customer journey, inbox, website funnel, attribution.
- `/operate`: admin/data operations.
- `/m/inbox`: sales reply workflow.

The legacy pages should be treated as source surfaces to merge into the rooms, not long-term top-level destinations. The exceptions are `/creative-analysis` and `/analysis`, which still hold depth that is not fully present in `/optimize`.

## Live Data Snapshot

Current live data is strong for Meta ads, social inbox, website behavior, and saved AI analysis. It is weaker for mature outcomes and still incomplete for signal/operate health in the new IA.

| Area | Live Availability | Notes |
| --- | ---: | --- |
| Meta daily insights | 120,900 rows, latest 2026-05-21 | Strong. Powers dashboard, analyst, creative, optimize. |
| Campaign/ad/ad set/creative metadata | 238 campaigns, 1,026 ad sets, 2,000 ads, 1,652 creatives | Strong. Creative metadata latest 2026-05-16, campaign/ad set latest 2026-05-21. |
| Last 30-day dashboard | $16,889 spend, 1.38M impressions, 44,396 clicks, 4,110 primary results, 34 website bookings | Strong enough to keep as core marketing performance. |
| Website events | 6,007 rows, latest 2026-05-21 | Useful, but booking conversion volume is still small. |
| Website conversions | 7 rows, latest 2026-05-20 | Keep, but present as attribution/debugging, not definitive sales truth. |
| Appointment events | 515 rows, latest 2026-05-21 | Useful source for reconciliation and future outcomes. |
| Social inbox | 331 threads, 1,526 messages, 11 comments, latest 2026-05-21 | Strong. Keep as primary sales/customer surface. |
| AI analysis dashboards | 18 total, 12 returned by current saved-dashboard loader | Useful. Should stay, but likely move into command palette/saved views. |
| AI reports | 2 reports, latest 2026-05-14 | Low activity; keep as generated artifact, not top-level page. |
| Backfill jobs/chunks | 6 jobs, 42 chunks | Useful for admin, but current local health/backfill read hit an analytics permission error. |
| AI signals | 0 rows | New signal strip exists but has no live signal data yet. Do not make it the only decision layer until populated. |
| System health | Critical locally due missing `CRON_SECRET` in `.env.local` | Live Vercel may differ; health surface is still important. |

## Route Inventory

### `/` Overview / Executive Snapshot

Audience: executive, admin, marketing, read-only.

Data pulled:

- `fetchDashboardData()` from `meta_daily_insights` via `aggregate_meta_daily_insights` RPC.
- Metadata from `brands`, `meta_ad_accounts`, `meta_campaigns`, `meta_ad_sets`, `meta_ads`, `meta_creatives`.
- Recent `ai_reports` and `sync_runs`.
- Default date window is current calendar week when `?wow=` is absent.

What the user does:

- Reads top story, hero metrics, umbrella scorecard, and "needs attention" items.
- Clicks umbrella/campaign links into `/analyst`.
- Understands that all displayed metrics are leading indicators, not closed-sale proof.

Keep decision: Keep the content, but do not keep `/` as a separate mental model long-term if `/optimize` becomes the default landing. Merge the executive snapshot into `/optimize` as an executive/read-only landing view or summary mode.

### `/analyst`

Audience: marketing power user, admin, analyst.

Data pulled:

- Same `fetchDashboardData()` payload as `/`.
- Last 30 days by default unless `days`, `start`, or `end` params are provided.
- Client actions call `/api/sync`, `/api/reports`, and `/api/chat`.

What the user does:

- Filters by brand, active/paused status, creative bucket, umbrella, and date range.
- Reviews performance by brand, umbrella, campaign, ad set, and creative.
- Opens creative drawer with previews, metrics, technical IDs, and Ads Manager link.
- Runs manual sync if permitted.
- Generates executive reports and asks chat questions.

Keep decision: Keep the analytical depth, but merge into `/optimize`. It is too valuable to remove, but too overlapping to remain a top-level destination once `/optimize` has equivalent filters, drilldowns, report/chat access, and creative drawer depth.

### `/optimize`

Audience: marketing operator, admin, read-only.

Data pulled:

- `fetchDashboardData()` for status sentence, trend, action counts, and filters.
- `fetchPeriodPivot()` for campaign -> ad set -> creative pivot by day/week/month/quarter and metrics: spend, primary results, cost per primary result, CTR, impressions, CPC.
- `meta_creatives` for creative asset enrichment.
- `SignalStrip` calls `/api/signals?room=optimize`, but live `ai_signals` count is currently 0.
- Empty-state sync button calls `/api/sync`.

What the user does:

- Starts with a status sentence: attention count, winners, 7-day spend and delta.
- Uses signal cards once signal data exists.
- Reads daily spend/results chart.
- Filters brand, group, date range, and status.
- Changes period pivot and expands campaign/ad set/creative hierarchy.
- Runs a sync when environment is empty and user has permission.

Keep decision: Keep as the primary marketing page. Add remaining high-value pieces from `/analyst` and `/creative-analysis`: creative diagnostic score, saved views, AI query/report entry points, and a stronger creative detail drawer.

### `/creative-analysis`

Audience: marketing creative decision-maker.

Data pulled:

- `fetchCreativeAnalysisData()` from stored `meta_daily_insights`, `brands`, `meta_ad_accounts`, `meta_ads`, `meta_creatives`.
- Optional `?live=1` path calls live Meta Insights for current data.
- Current live source is `stored_fallback`: 93 creative rows from 1,391 current stored insight rows and 1,707 prior rows.
- Status breakdown: 23 Scale Candidate, 13 Fatigue Watch, 1 Needs Hook Improvement, 56 Brand Fit Review.
- Client can fetch `/api/creative-analysis/ad-video-metrics`.

What the user does:

- Filters creatives by active/inactive/all, brand, umbrella, campaign, ad set, internal status, min spend, and search.
- Reviews period summary, diagnostic score, Meta ranking diagnostics, hook/retention/click/conversion/fatigue signals, preview assets, ad IDs, and raw advanced metrics.
- Opens a full creative detail view and adds notes locally in the UI.

Keep decision: Keep the information, but likely merge into `/optimize` as a "Creatives" tab or drilldown. This is one of the strongest pages for deciding what to scale/refresh; do not discard it.

### `/convert`

Audience: marketing operator, sales-adjacent customer workflow, admin.

Data pulled:

- `fetchWebsiteFunnelData()` from `website_events`, `meta_daily_insights`, and appointment reconciliation.
- `getSocialInboxData()` from `meta_social_threads`, `meta_social_messages`, `meta_social_comments`, `meta_social_sync_runs`.
- `website_conversions` ledger rows: customer, booking, CAPI, source, last paid touch.
- `SignalStrip` calls `/api/signals?room=convert`, but live `ai_signals` count is currently 0.

What the user does:

- Reads customer-to-booking status sentence.
- Reviews website funnel visualization.
- Checks customer ledger and CAPI/attribution gaps.
- Searches conversation queue and opens customer conversations in the future.

Keep decision: Keep as primary customer journey page. Merge `/website-funnel`, `/attribution-ledger`, and desktop `/inbox` here. Improve once signal data and conversation detail routing are complete.

### `/website-funnel`

Audience: marketing/debugging.

Data pulled:

- `fetchWebsiteFunnelData()` from `website_events`, `meta_daily_insights`, and appointment reconciliation.
- 30-day live overview: 111 sessions, 243 page views, 24 engaged sessions, 21 booking starts, 2 schedules, 34 paid Meta sessions, 18 customer-linked events.
- Funnel has inconsistent step rates because events are counted by step occurrences, not strict user progression.

What the user does:

- Reviews booking funnel, top pages, source/transparency, trend, and recent event stream.
- Diagnoses whether website/booking events are flowing.

Keep decision: Merge into `/convert`. Keep the data and debugging detail, but avoid a standalone top-level route unless someone is actively operating website analytics daily.

### `/attribution-ledger`

Audience: marketing/debugging/admin.

Data pulled:

- `fetchAttributionLedgerData()` from `website_visitors`, `website_sessions`, `website_events`, `website_conversions`.
- Detail drawer calls `/api/attribution-ledger/detail`.
- 30-day live state: 307 visitors shown, 73 with paid touch, 4 with conversions, 4 CAPI statuses marked sent.

What the user does:

- Reviews visitor/session-level attribution status.
- Opens detail drawer for credited touch, return touch, booking, CAPI state, and timeline.
- Diagnoses whether a booking can be tied back to Meta identifiers and paid touches.

Keep decision: Merge into `/convert` as "Attribution ledger" or "CAPI gaps". Keep for trust/debugging, but avoid making it a main nav item for non-technical users.

### `/inbox`

Audience: marketing, sales, admin.

Data pulled:

- `getSocialInboxData()` from social thread/message/comment/sync tables.
- Readiness checks call Meta permissions and configured ad account validation.
- Client actions call `/api/social-inbox/sync`, `/api/social-inbox`, and `/api/social-inbox/suggest-reply`.
- Current live inbox: 100 threads returned by page loader limit, 300 messages returned, 11 comments, 22 unread, Facebook only in returned threads.

What the user does:

- Searches sender/thread.
- Filters by channel/platform/status.
- Syncs inbox manually.
- Selects conversation/comment, reads context, writes a reply, optionally asks AI for a draft.

Keep decision: Keep the workflow, but split by audience. Sales should use `/m/inbox`; marketing/admin should see inbox inside `/convert`. A standalone `/inbox` is redundant once both are complete.

### `/m/inbox` and `/m/inbox/[conversationId]`

Audience: sales, client advisor, JOC, anyone with `view_inbox`.

Data pulled:

- `getSocialInboxData()` for threads, messages, comments, sync runs.
- Detail route looks up `t-<thread_id>` or `c-<comment_id>` from the same in-memory payload.
- Reply composer calls `/api/social-inbox/suggest-reply` and `/api/social-inbox/send-reply`.

What the user does:

- Uses a mobile-first conversation list.
- Searches by name/message.
- Opens a DM thread or comment detail.
- Asks AI for a reply draft.
- Sends only after explicit human confirmation and only with `send_inbox_reply`.

Keep decision: Keep as the primary sales page. It is focused and role-appropriate. Next needed improvement is assignment/read/snooze state if `manage_inbox_state` is meant to matter.

### `/analysis`

Audience: marketing power user/admin.

Data pulled:

- `fetchSavedAnalysisDashboards()` from `ai_analysis_dashboards`.
- Client calls `/api/analysis` for generate, save, rename, update, delete, and reload.
- Deeper analysis reads Meta history and writes `ai_analysis_runs`.
- Live saved-analysis data exists: 12 dashboards returned by loader, 27 runs in table.

What the user does:

- Types natural-language analysis requests.
- Gets generated widgets: metrics, charts, tables, notes, and debug/source panels.
- Saves dashboards, renames them, deletes them, and asks for modifications.

Keep decision: Keep, but move out of top nav. Best long-term home is command palette/Ask AI plus saved views inside `/optimize`. The saved-dashboard behavior is useful; the page as a destination is less important.

### `/operate`

Audience: admin.

Data pulled:

- `sync_runs` for recent pipeline history.
- `getMetaAdsBackfillState()` for backfill jobs, chunks, and coverage.
- `getSystemHealth()` for environment and sync freshness.
- `analytics.ads_analyst_identity_profiles_v1` for read-only roster.
- `SignalStrip` calls `/api/signals?room=operate`, but live `ai_signals` count is currently 0.

What the user does:

- Tabs between Pipelines, Coverage, Health, and People.
- Runs manual sync if permitted.
- Reviews sync runs, backfill jobs/chunks, historical coverage, health JSON, and read-only people roster.

Keep decision: Keep as the admin page, but fix/verify the backfill coverage permission path before relying on it. In local live-data checks, `getMetaAdsBackfillState()` hit `permission denied for schema analytics`.

### `/admin/backfill`

Audience: admin, marketing/read-only for visibility.

Data pulled:

- Client calls `/api/auth/me`, `/api/meta/backfill`, `/api/meta/backfill/run`, `/api/meta/backfill/month-resync`, and `/api/meta/data-health`.
- Data includes backfill jobs/chunks/coverage, Meta data health diagnostics, duplicate keys, missing required keys, stored history, missing/partial months, unusual spend jumps, and recent sync warnings.

What the user does:

- Views historical coverage.
- Queues/runs/pauses/resumes backfill if `manage_backfill`.
- Runs data health refresh and optional month comparison against Meta.

Keep decision: Merge into `/operate`. Keep all functionality, but do not keep as a separate nav destination once Operate is complete.

### `/users`

Audience: admin, read-only stakeholders.

Data pulled:

- Client calls `/api/auth/me` and `/api/users`.
- Legacy mode reads `users` and `user_roles`; limited mode reads `analytics.ads_analyst_identity_profiles_v1`.
- Current live data: 21 users and 31 role rows.

What the user does:

- Views user list and roles.
- If `manage_users`, invites users, toggles active/inactive, and edits roles.
- Current data-boundary docs say user-management writes are disabled or transitional for Ads Analyst.

Keep decision: Merge read-only roster into `/operate`. Keep write management only if this app is allowed to remain an identity admin surface; otherwise link to the true ERP/admin owner.

### `/review`

Audience: future sales review roles.

Data pulled:

- No live business data. Permission gated by `view_review`.

What the user does:

- Reads placeholder for v1.5 appointment outcome tagging and weekly creative ratings.

Keep decision: Do not keep as a primary nav item until the review queue exists. Keep route as placeholder/deep link if needed.

### `/outcomes`

Audience: future sales lead/executive/marketing.

Data pulled:

- No live business data. Permission gated by `view_outcomes`.

What the user does:

- Reads placeholder for validated outcomes by creative/umbrella.

Keep decision: Do not keep as primary nav item until sales review and closed-sale outcome data exist. Keep the concept; it is the missing piece that prevents leading metrics from being treated as final truth.

### `/login` and `/no-access`

Audience: all users.

Data pulled:

- Supabase Auth session.
- `users`/`user_roles` in legacy mode, or `analytics.ads_analyst_identity_profiles_v1` in limited mode.

What the user does:

- Signs in.
- Gets routed to first permitted app path under legacy IA, or role landing under the new workspace/sales shell.
- No-access page lets a signed-in user sign out.

Keep decision: Keep, but align naming with PRD eventually (`/sign-in`) and make landing logic consistent between legacy and new IA.

## API Surface Users Rely On

Keep these APIs stable while changing pages:

| API | Used By | Purpose |
| --- | --- | --- |
| `/api/sync` | `/analyst`, `/optimize`, `/operate` | Manual read-only Meta sync; requires `run_meta_sync`. |
| `/api/reports` | `/analyst` | Generate AI executive reports. |
| `/api/chat` | `/analyst` | Dashboard chat over performance data. |
| `/api/analysis` | `/analysis` | Generate/save/edit/delete ad-hoc analysis dashboards. |
| `/api/social-inbox/*` | `/inbox`, `/m/inbox` | Social inbox sync, reload, AI draft, human-approved send. |
| `/api/website/events` | Shopify/browser | Ingest website funnel events. |
| `/api/website/conversions` | Booking API | Ingest confirmed booking conversions. |
| `/api/attribution-ledger/detail` | `/attribution-ledger` | Visitor timeline and credited touch detail. |
| `/api/meta/backfill*` | `/admin/backfill`, `/operate` | Backfill state, batch run, month resync. |
| `/api/meta/data-health` | `/admin/backfill` | Data-health diagnostics and Meta comparison. |
| `/api/signals*` | `/optimize`, `/convert`, `/operate` | Signal strip read/act/dismiss; currently no live rows. |
| `/api/users` | `/users` | User/role payload and admin mutations. |
| `/api/system-health` | top nav, health pill, `/operate` | Env/sync freshness summary. |

## What To Keep

Keep as primary pages:

- `/optimize`
- `/convert`
- `/operate`
- `/m/inbox`
- `/login`
- `/no-access`

Keep as concepts/components, but merge into rooms:

- Executive snapshot from `/` into `/optimize`.
- Analyst depth from `/analyst` into `/optimize`.
- Creative diagnostics from `/creative-analysis` into `/optimize`.
- Website funnel from `/website-funnel` into `/convert`.
- Attribution ledger from `/attribution-ledger` into `/convert`.
- Desktop inbox from `/inbox` into `/convert`.
- Backfill/data health/users from `/admin/backfill` and `/users` into `/operate`.
- AI ad-hoc analysis from `/analysis` into command palette and saved views.

Do not promote until data/workflow exists:

- `/review`
- `/outcomes`
- Signal strip as the primary decision layer, because `ai_signals` currently has 0 live rows.

## Information To Preserve

The following information is decision-critical and should not be lost during page consolidation:

- Meta spend, impressions, reach, clicks, leads, bookings, website bookings, messaging contacts, primary results, cost per primary result, CTR, CPC, CPM, frequency.
- Brand, campaign umbrella/group, campaign, ad set, ad, and creative hierarchy.
- Creative preview assets, titles/bodies, Meta ranking diagnostics, video metrics, hook/retention/click/conversion/fatigue diagnostics, internal score/status.
- Date windows, prior-period comparison, data coverage, and source transparency.
- Saved AI dashboards and generated analysis widgets.
- Social inbox thread/message/comment state, unread count, latest message time, platform, participant, AI draft, approval/send audit path.
- Website funnel stages, page-level event detail, UTM/fbclid/fbp/fbc capture, CAPI status, paid-touch attribution, visitor/session timelines.
- Sync runs, backfill jobs/chunks, coverage by account/month, data-health diagnostics, health issues.
- User roles and permissions, but write management should remain aligned with the Sales/ERP ownership boundary.

## Open Product Questions

1. Should `/optimize` replace `/` for admin/marketing landing, or should `/` redirect by role while preserving a hidden executive snapshot route?
2. Should creative diagnostics become a tab in `/optimize`, or a drawer attached to the pivot table and action queue?
3. Should `/analysis` be available only through command palette, or should saved dashboards get a visible section in `/optimize`?
4. Is `/users` allowed to mutate identity long-term, or should Operate only show a read-only roster and link to the ERP/admin owner?
5. What is the minimum outcome data needed before `/outcomes` becomes real: appointment review only, closed sale/deal value, Shopify order matching, or all three?
6. Who owns inbox state actions like assignment, read/unread, and snooze: sales only, marketing too, or admin-managed rules?
