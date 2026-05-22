# Meta Ads Accuracy Contract

## Source Of Truth

Use Supabase as source of truth. For Meta Ads performance surfaces, start from `meta_daily_insights` and compare to `aggregate_meta_daily_insights` before trusting any UI, AI, report, or export layer.

Primary tables:

- `meta_daily_insights`: ad-level daily performance rows.
- `brands`: brand code lookup.
- `meta_campaigns`, `meta_ad_sets`, `meta_ads`, `meta_creatives`: hierarchy, status, metadata, and creative display context.
- `ai_reports`, `ai_chat_sessions`, `ai_chat_messages`, `ai_analysis_dashboards`, `ai_analysis_runs`: generated AI/report persistence.

Use `docs/supabase-schema.md` and the latest `supabase/migrations/*aggregate_meta_insights*.sql` for schema details.

## Known Regression Class

Prior bug: `aggregate_meta_daily_insights` overmultiplied metrics because environment-scoped joins were missing. A production insight row could join matching staging and production campaign/ad-set/ad metadata, multiplying spend and counts.

Guardrails:

- `meta_daily_insights.environment` must match runtime environment.
- Joined `brands`, `meta_campaigns`, `meta_ad_sets`, and `meta_ads` must also match runtime environment.
- Action families must use priority/coalesce semantics, not sum every alias in the family.
- `source_rows` from grouped RPC rows should reconcile to the total RPC row for the same range/filter.

## Metric Formulas

Base totals:

- `spend`: sum of row spend.
- `impressions`: sum of impressions.
- `reach`: sum of reach.
- `clicks`: sum of clicks.
- `website_bookings`: first present booking action family per row.
- `messaging_contacts`: first present messaging action family per row.
- `new_messaging_contacts`: `onsite_conversion.messaging_first_reply`.
- `leads`: first present lead action family per row.
- `conversions`: purchase family plus complete-registration family.
- `primary_results`: `website_bookings` for `Book Appts US`; otherwise `messaging_contacts`.
- `secondary_results`: `new_messaging_contacts` for Facebook product umbrellas; otherwise zero.

Rates:

- `ctr`: `clicks / impressions * 100`.
- `cpm`: `spend / impressions * 1000`.
- `cpc`: `spend / clicks`.
- `cpl`: `spend / leads`, null when leads are zero.
- `frequency`: `impressions / reach`.

Round only at display/API contract boundaries. Do not sum rounded rates; derive rates from summed numerators and denominators.

## Dates And Timezone

Use stored Meta `date_start` as a calendar date. Ranges are inclusive:

- `date_start >= start`
- `date_start <= end`

Sync/backfill documentation says dashboard date windows use California calendar dates. Do not shift stored `date_start` through UTC conversions in UI, AI prompts, or exports.

Relative AI ranges should end at the latest complete synced insight date unless the user explicitly asks to include today.

## Filters And Hierarchy

Filters must apply consistently before grouping:

- brand
- campaign umbrella/group
- delivery status
- search
- campaign
- ad set
- ad
- creative

Hierarchy checks:

- Campaign total equals sum of matching child ad-set/ad/creative rows for same range/filter.
- Ad-set total equals sum of matching child ad/creative rows.
- Unassigned or missing IDs must not disappear silently. They need explicit `unknown` or `Unassigned` handling.

## Currency, Percent, And Labels

Current UI formatters use USD. Any new surface must keep currency labels explicit. CTR is already a percent value from the RPC, so `1.8` displays as `1.80%`, not `0.018%` or `180%`.

Do not label primary KPI as a universal conversion. Use the surface's label contract: `Website Bookings` for booking umbrellas, `Messaging Contacts` for most others, and clear copy for secondary KPIs.

## Attribution Windows

Stored Meta insight rows already reflect the attribution settings used when they were synced from Meta. Do not claim a different attribution window unless the code has that value from the sync request or source row metadata.

Website attribution and CRM outcomes are separate systems. Do not mix them into Meta Ads performance or ROAS unless the surface explicitly joins those sources and documents identity/attribution confidence.

## ROAS

No current aggregate contract exposes revenue or purchase value for Meta Ads ROAS. Treat ROAS as unsupported unless a concrete revenue source, attribution rule, and query path are present for the audited surface.

Correct behavior when ROAS is requested but unsupported: say it is unavailable from current data, and offer the nearest supported metrics.

Incorrect behavior: infer ROAS from conversions, bookings, leads, or spend alone.

## AI Narrative Claims

Every AI number must be present in the source table/totals given to the model or directly derived from them. Check:

- Same date range and filter context appears in `sourceTransparency` or `analystDebug`.
- Same source function/table is named: `meta_daily_insights` and/or `aggregate_meta_daily_insights`.
- Claims do not combine different grains without saying so.
- Unsupported metrics are refused or caveated.
- Comparisons use an explicit baseline period and same filters.

If the answer contains a number that cannot be traced, treat it as a data accuracy bug.
