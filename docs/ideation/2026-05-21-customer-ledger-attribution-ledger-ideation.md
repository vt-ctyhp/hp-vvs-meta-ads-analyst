---
date: 2026-05-21
topic: customer-ledger-attribution-ledger
focus: Convert customer ledger absorbing attribution ledger/detail, creative previews, customer timeline, and future sales/payment status
mode: repo-grounded
---

# Ideation: Customer Ledger + Attribution Ledger

## Grounding Context

### Codebase Context

The current `/convert` page already has the correct room shape: status sentence, signal strip, funnel visualization, customer ledger, and conversation queue. It is protected by `requirePagePermission("view_dashboard", "/convert")` and fetches funnel, inbox, and ledger data in parallel.

The current Convert customer ledger is intentionally thin. `fetchLedger()` queries only `website_conversions` and selects booking/customer/source/CAPI fields. The component comments state the row grain directly: "Each row = one website_conversion." That makes it useful as a booking list, but too narrow to replace the attribution ledger.

The attribution ledger is much richer and already uses the right database surfaces. `fetchAttributionLedgerData()` reads `website_visitors`, `website_sessions`, `website_events`, and `website_conversions` through the limited `web` client, then builds rows across visitor, session, event, paid touch, and conversion context.

The attribution detail builder already creates the narrative shape the user described:

- credited paid touch
- return touch
- booking details
- CAPI status
- confidence
- summary
- filtered timeline

The test suite already proves the desired story: a paid ad click, a later Instagram/link-in-bio return, booking submit, Acuity booking creation, CAPI status, and post-booking noise excluded.

Creative previews are already available elsewhere. `fetchCreativeAssets()` reads `meta_creatives` with `supabase_thumbnail_url`, `supabase_image_url`, `thumbnail_url`, `image_url`, `video_thumbnail_url`, and `preview_url`. The customer ledger can reuse this cache instead of fetching Meta media live.

Sales/ERP data has a hard ownership boundary. `customers`, `root_appointments`, `customer_info`, `documents`, and `payment_ledger` are Sales/ERP Core tables. Ads Analyst owns the website and Meta analytics tables. Existing boundary design exposes Sales/ERP data through narrow read-only `analytics.*` views, such as `analytics.sales_appointment_conversions_v1`, instead of granting Ads Analyst broad table access.

### Relevant Code References

- `src/app/(workspace)/convert/page.tsx:38` gates `/convert` with `view_dashboard`.
- `src/app/(workspace)/convert/page.tsx:116` queries `website_conversions` directly for the ledger.
- `src/components/v2/convert/customer-ledger.tsx:16` says each row is one `website_conversion`.
- `src/lib/attribution-ledger.ts:271` builds attribution data from visitor/session/event/conversion tables.
- `src/lib/attribution-ledger.ts:602` builds attribution detail data.
- `src/lib/attribution-ledger.ts:613` selects the credited paid touch from visitor, conversion, session, nested attribution, and event touches.
- `src/lib/attribution-ledger.ts:810` builds the detail timeline and limits noisy post-booking events.
- `tests/attribution-ledger.test.ts:248` verifies a sanitized booking timeline with credited and return touches.
- `src/lib/period-pivot-data.ts:412` shows the existing creative asset fetch pattern.
- `supabase/migrations/0007_documents_drive.sql:51` defines `payment_ledger` with invoice, paid, and balance fields.
- `supabase/migrations/20260520000000_ads_analyst_data_boundary.sql:479` defines a read-only Sales appointment conversion view for Ads Analyst.

### Past Learnings

No recent `docs/solutions/` learning artifacts were present in this worktree.

### External Context

Official Shopify docs confirm that order data can expose financial status and totals via the Admin GraphQL API, and transactions expose payment lifecycle fields such as kind, status, and amount. Shopify's webhook guidance also says apps should not rely only on webhooks and should run reconciliation jobs because delivery is not always guaranteed.

Sources:

- [Shopify Admin GraphQL OrderTransaction](https://shopify.dev/docs/api/admin-graphql/latest/objects/OrderTransaction)
- [Shopify Admin GraphQL orders query](https://shopify.dev/docs/api/admin-graphql/latest/queries/orders)
- [Shopify webhook best practices](https://shopify.dev/docs/apps/build/webhooks/best-practices)

Implication: future Shopify/sales status should land in a durable internal snapshot through webhook/import plus reconciliation, not by calling Shopify live for every table row.

## Topic Axes

- Ledger grain and identity matching
- Noise-filtered journey timeline
- Creative/ad preview context
- Sales/payment status integration
- Legacy attribution page consolidation

## Ranked Ideas

### 1. Make Convert's customer ledger use a shared customer-journey read model

**Description:** Extract the attribution ledger's row-building into a shared `fetchCustomerJourneyLedgerData` / `buildCustomerJourneyRows` layer. Convert should stop doing its own `website_conversions` query and consume these shared journey rows. The row grain should be "one customer journey" keyed by visitor plus latest conversion, not merely "one conversion event."

**Axis:** Ledger grain and identity matching

**Basis:** direct: `/convert` currently queries only `website_conversions`, while `src/lib/attribution-ledger.ts` already queries visitors, sessions, events, and conversions and merges them into rows.

**Rationale:** This is the cleanest path to phase out `/attribution-ledger`. It reuses the richer attribution logic instead of creating a third model.

**Downsides:** Requires careful naming because these are browser/customer journeys, not legally certain identities. Convert row types and tests need migration.

**Confidence:** 92%

**Complexity:** Medium

**Status:** Unexplored

### 2. Put a curated journey timeline drawer directly on Convert

**Description:** Move the attribution detail drawer behavior into the Convert `CustomerLedger` as the row expansion. Default the drawer to a story timeline showing first paid touch, return touch, key booking intent events, booking creation, and CAPI status. Keep an "all events" disclosure for debugging, but make the default view narrative.

**Axis:** Noise-filtered journey timeline

**Basis:** direct: `buildAttributionLedgerDetailData()` already returns `creditedTouch`, `returnTouch`, `summary`, `confidence`, and `timeline`. Tests assert it removes the post-booking page view and keeps the useful sequence.

**Rationale:** The feature the user wants is mostly already implemented. The product work is moving it into the Convert room and tightening which events are shown by default.

**Downsides:** Timeline labels need to be less technical. Some journeys will still be incomplete when tracking IDs are absent.

**Confidence:** 90%

**Complexity:** Medium

**Status:** Unexplored

### 3. Enrich the credited touch with creative thumbnail and ad context

**Description:** Add a batched enrichment step after journey rows are built: collect credited `adId`s, join `meta_ads.ad_id -> creative_id`, then join `meta_creatives` for cached image URLs and ad/creative labels. In the row, show a thumbnail plus campaign/ad name. In the drawer, show a larger creative preview with placement/source/timing.

**Axis:** Creative/ad preview context

**Basis:** direct: attribution rows already expose `adId`, `adsetId`, and `campaignId`; `fetchCreativeAssets()` already reads cached creative image fields from `meta_creatives`.

**Rationale:** This gives operators immediate visual context for "which ad did this customer come from?" without hitting the Meta API on page render.

**Downsides:** UTM `adId` can be missing or stale. The UI needs graceful fallbacks when only campaign/adset/source are known.

**Confidence:** 84%

**Complexity:** Medium

**Status:** Unexplored

### 4. Add a read-only Sales/ERP snapshot view for budget, invoice, paid, and balance

**Description:** Add an analytics view such as `analytics.sales_customer_finance_snapshot_v1` keyed first by Acuity external booking id / appointment event id, then by root appointment where allowed. Expose only the fields needed for Convert: budget range, sales stage, invoice total, amount paid, balance due, last payment date/status, and maybe owner/advisor. Do not copy this data into `website_conversions`.

**Axis:** Sales/payment status integration

**Basis:** direct: `documents` and `payment_ledger` already store document family, invoice total, amount received, and balance due; data-boundary docs/tests require Ads Analyst to avoid Sales/ERP writes and use narrow read-only views.

**Rationale:** This preserves Sales/ERP as the source of truth while letting Convert show "invoiced $1,000, paid $500, balance $500" beside the attribution story.

**Downsides:** Matching depends on a reliable Acuity/root appointment link. Payments may trail bookings, so the UI needs "not linked yet" and "no invoice yet" states.

**Confidence:** 86%

**Complexity:** Medium-High

**Status:** Unexplored

### 5. Use an explicit identity confidence ladder before joining sales or payment data

**Description:** Make identity matching visible and deterministic: Acuity appointment id / conversion event id first, exact root appointment mapping second, normalized email/phone hash third, and browser visitor/session only for attribution context. Payment status should require a booking/root match, not just visitor id.

**Axis:** Ledger grain and identity matching

**Basis:** direct: attribution detail already returns confidence as `browser_session`, `browser_visitor`, or `unmatched`; the booking API normalization preserves Acuity id, customer email/phone, session id, visitor id, fbc/fbp, and ad ids.

**Rationale:** This prevents the table from overstating certainty. Marketing can use browser-level attribution context, but sales/payment status should require a stronger identity link.

**Downsides:** Some rows will stay unlinked even when a human can infer the match. That is preferable to silent false positives.

**Confidence:** 88%

**Complexity:** Medium

**Status:** Unexplored

### 6. Retire `/attribution-ledger` in phases, not as a hard cutover

**Description:** Phase 1: Convert uses shared journey rows and the drawer. Phase 2: add parity filters and deep links to Convert. Phase 3: hide Attribution from nav. Phase 4: redirect existing attribution timeline links into `/convert?visitorId=...&acuityAppointmentId=...`. Keep the old API until links stop being used.

**Axis:** Legacy attribution page consolidation

**Basis:** direct: `docs/ui-rebuild-prd.md` already says `/website-funnel` and `/attribution-ledger` should merge into Convert, while routes still expose both old pages today.

**Rationale:** Deep links and debugging habits survive the migration while daily users learn one surface.

**Downsides:** Short-term duplication remains until parity is proven.

**Confidence:** 91%

**Complexity:** Low-Medium

**Status:** Unexplored

## Recommended Execution Sequence

1. Create a shared customer journey read model from `src/lib/attribution-ledger.ts`.
2. Change `/convert` to consume the shared rows instead of querying `website_conversions` directly.
3. Add the Convert drawer using the existing detail endpoint/data shape, with default timeline filters tuned to first paid touch, return touch, booking intent, conversion, and CAPI.
4. Add batched creative enrichment from `adId -> meta_ads -> meta_creatives`, using cached Supabase image fields first.
5. Add the read-only Sales/ERP finance/status view and join it only when the match confidence is strong enough.
6. Hide and then redirect `/attribution-ledger` after Convert reaches parity.

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Live Shopify/Admin API lookup per row | Too expensive and brittle for table rendering; better as webhook/import-backed snapshot plus reconciliation. |
| 2 | Copy raw attribution table into Convert | Preserves the noisy surface the user wants to remove. |
| 3 | LLM-generated summary for every row | Adds cost and nondeterminism before deterministic timeline rules are exhausted. |
| 4 | Store sales status directly on `website_conversions` | Violates source-of-truth boundaries and creates stale duplicated finance data. |
| 5 | Build a parallel customer profile table inside Ads Analyst | Duplicates Sales/ERP Core ownership and increases reconciliation burden. |
| 6 | Timeline compare mode | Interesting later, but not required to replace the attribution detail page. |
| 7 | Outcome feedback loop by paid amount | Strong future direction, but depends on the finance snapshot first. |
| 8 | Full raw event stream in default drawer | Directly conflicts with the requested noise reduction. |

## Simplest Robust Direction

The simplest robust architecture is not a new customer system. It is a shared read model:

- Ads/website attribution stays in Ads Analyst tables.
- Customer, appointment, document, and payment truth stays in Sales/ERP tables.
- Convert becomes the unified read surface.
- Sales/ERP contributes only narrow read-only status snapshots.
- The drawer defaults to a curated timeline, with raw events available only for debugging.

That keeps the implementation incremental, makes the old attribution page replaceable, and leaves room for revenue-quality attribution later without breaking the data boundary.
