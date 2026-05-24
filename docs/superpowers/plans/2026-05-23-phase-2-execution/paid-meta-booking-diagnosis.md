# "Paid Meta confirmed bookings = 1" — full diagnosis

_Investigated: 2026-05-24 01:30 PDT, in response to a user report that this metric on /website-funnel "only shows one in the last 30 days" and is wrong._

## TL;DR

**The metric calculation is correct. The data feeding it is structurally incomplete.** /website-funnel can only count a booking as "Paid Meta confirmed" when ALL THREE of these line up on the same `acuity_appointment_id`:

1. An `appointment_events` row exists with `visit_date_time` in the window
2. A `website_conversions` row exists with `event_name = "Schedule"` and the same `acuity_appointment_id`
3. The conversion's `last_paid_touch` (or fallback `source_type = "paid_meta"`) points to a Meta-paid touch within the lookback window

In production right now (last 30d), only **1 of 30 valid Acuity-sourced appointments** has the all-three line-up. So the metric correctly shows 1.

The other 29 Acuity bookings have **no matching `website_conversions` record at all** — the ingestion that's supposed to pair them never wrote a row.

## How the metric is computed

`src/lib/website-analytics.ts:996` → `paidMetaScheduleConversions`:

```ts
const paidMetaScheduleConversions = appointmentRows.filter((appointment) => {
  const conversion = scheduleConversionsByAcuityId.get(acuityAppointmentIdForRow(appointment));
  return Boolean(conversion && isPaidMetaAttributedScheduleConversion(conversion, scheduleConversions));
});
```

Where:
- `appointmentRows` = `appointment_events` in window with valid status (drops cancelled/rescheduled)
- `scheduleConversionsByAcuityId` = lookup of `website_conversions` where `event_name = "Schedule"`, keyed by `acuity_appointment_id`
- `isPaidMetaAttributedScheduleConversion` (line 2672) requires either a Meta-attributed paid touch within `PAID_META_ATTRIBUTION_LOOKBACK_DAYS` (=30d), or `source_type = "paid_meta"` with no prior booking from the same identity

This logic is sound. Every condition is reasonable. The math is right.

## The actual numbers (last 30 days, prod)

### Appointments by booking source × status

| booking_source | scheduled | active | completed | canceled | rescheduled | duplicate | other | total |
|---|---|---|---|---|---|---|---|---|
| manual | 18 | 2 | 9 | 1 | 16 | 14 | — | 60 |
| **acuity** | **21** | **7** | **2** | **7** | — | — | — | **37** |
| calendly | — | 4 | — | — | — | — | — | 4 |
| test | — | — | — | — | — | — | 1 | 1 |

**Valid Acuity-sourced bookings in window (excludes canceled/rescheduled): 30**

### website_conversions in same window

- Total: **11** (against 30 valid Acuity bookings)
- By `source_type`: `paid_meta = 4`, `direct = 7`

### The 4 paid-Meta conversions vs appointment_events join

| conversion `acuity_id` | matching appointment_event? | visit_date_time | in window? | counts? |
|---|---|---|---|---|
| 1709637713 | ✅ yes (active) | 2026-05-23 | ✅ yes | **YES — this is the "1"** |
| 1708622080 | ✅ yes (active) | 2026-05-26 | ❌ outside window (future) | NO |
| 1708409464 | ❌ no matching row | — | — | NO |
| 1708008215 | ❌ no matching row | — | — | NO |

So the metric is computing exactly what the data supports. 1 is the truthful answer to "how many appointments confirmed to occur in this 30-day window where we also have a website conversion record that pins the attribution to Paid Meta."

### Of 30 valid Acuity appointments, how many have ANY website_conversion?

**1 of 30**, and that one is `source_type = "direct"`.

**29 of 30 Acuity bookings have ZERO matching website_conversions row.** They came through Acuity, the appointment_events row was created, but no website_conversions record exists to attach the visitor's tracking context.

## Root causes (in order of severity)

### Root cause #1 — The conversion ingestion has a coverage gap

The `/api/website/conversions` endpoint expects to be called by the website's booking form (with tracking context). It's NOT called by the Acuity webhook itself. So:
- Appointment_events gets a row whenever Acuity fires a booking webhook (works for all 30 valid bookings)
- website_conversions only gets a row when the user books THROUGH the website with tracking script intact

The 29 missing conversions are bookings that either:
- Came through Acuity's hosted booking page directly (no website tracking)
- Were made by users with ad-blockers / tracking blocked
- Failed the silent ingestion (no observability on failures)
- Predate the website-conversion endpoint deployment

This isn't a bug in code, it's a missing wire: Acuity → website_conversions doesn't exist end-to-end.

### Root cause #2 — The metric requires a 3-way join that almost always fails

Even when conversions DO exist, the metric requires:
- `appointment_events.visit_date_time` in window
- `website_conversions.acuity_appointment_id` matches
- `website_conversions.last_paid_touch` is Meta-attributed AND within lookback

Acuity booking `1708622080` is a perfect example: paid Meta conversion exists, matching appointment exists — but the user's visit is on 2026-05-26 (next week). It's not "in the last 30 days" by visit time. Doesn't count. Yet it's clearly a paid-Meta-attributed booking; just hasn't happened yet.

### Root cause #3 — The acuity_id space is heterogeneous

`appointment_events.external_booking_id` is one of three formats:
- Real Acuity IDs (numeric like `1709637713`) — for `booking_source = "acuity"`
- Synthetic IDs (`AP-YYYYMMDD-NNN#row-N`) — for `booking_source = "manual"`
- Other identifiers for `calendly`, `test`

Manual and Calendly bookings can NEVER match a `website_conversions` row keyed by Acuity ID. They're 64 of the 102 appointments in the window. They're structurally invisible to the Paid Meta metric.

## Why the spike missed this — honest accounting

This is the second data correctness miss after the audit-tool pagination bug. The spike's investigative scope had real gaps:

1. **Track 1 (data correctness) deeply audited the /analyst RPC only.** /convert and /website-funnel correctness was assessed via "Track 1.4 lite" which only counted NULLs and table sizes. The funnel KPI computations themselves were never validated.

2. **The spike NOTED the data sparsity** as a "data scale flag" — from `track-1-reconciliation.md`:
   > `website_conversions has only 12 rows total. Either this is an early-stage product with low conversion volume, or conversions aren't being ingested correctly. Worth user confirmation.`
   
   But the spike framed it as a yellow flag, not as "the funnel's primary attribution metric is structurally broken because of this." That was the wrong framing.

3. **No external source-of-truth comparison was performed.** If anyone had compared Acuity's booking count for the window (30 Acuity-sourced bookings) against the dashboard's "Paid Meta confirmed bookings" (1), the structural problem would have been visible in 5 minutes. The spike explicitly skipped external-SoT checks as out-of-scope.

4. **The metric's source code was inspected for correctness in the abstract**, not validated against actual data. The compute logic looked sane. Nobody asked "does the data even exist to satisfy this query?"

5. **Track 4a focused on /convert visitor display**, not on the funnel's attribution KPIs.

6. **The Phase 2.5 cache layer just shipped doesn't change this** — caching doesn't fix the underlying ingestion gap. It just serves the same (still-wrong) number faster.

## What the user is right about

This metric **has been wrong for a long time** and the spike should have caught it. The pattern is:
- Sparse `website_conversions` table (13 rows ever for a product with 30+ bookings/month)
- 96% of Acuity bookings unattributed via website tracking
- A metric that only counts when all three of (acuity appointment, website conversion, Meta-paid touch) line up

The spike's TL;DR claimed "data accuracy: /analyst correct for every tested window" — true for /analyst, but the rebuilds I confidently said weren't needed include this very piece of the product the user has been complaining about.

## What "the right answer" should look like

There are several viable fixes, layered:

### A. Fix the ingestion gap (the structural fix, days to weeks)

Make every Acuity webhook ALSO create a `website_conversions` row, pulling the visitor context from:
- The most recent `website_sessions` row for the user (matched by email/phone)
- Or `website_visitors` directly if the booking includes a `fbclid` / `visitor_id`

If no visitor context is found, write a `website_conversions` row anyway with `source_type = "unattributed"` so the funnel KPIs can distinguish "0 paid Meta bookings" from "we don't know the attribution for 29 of 30 bookings."

### B. Compute attribution at read time from multiple sources (~1 day, immediate)

Don't rely on the join into `website_conversions` being populated. Compute:
- For each `appointment_events` row in window
- Look up the visitor via `customer_email` → `website_visitors.customer_email` match
- If visitor found, check `visitor.last_paid_touch` for Meta-paid signal within lookback
- Sum into the metric independently of whether a `website_conversions` row was ever created

This catches the 28 currently-missing attributions that DO have a matchable visitor on file.

### C. Surface data coverage to the user (~half day, immediate)

In the funnel UI, show:
- "30 Acuity bookings in window"
- "Of these, 1 has tracked attribution"
- "Of attributed, 1 is Paid Meta, 0 are Direct, 0 are Other"

So when the number is 1, the user knows it's because of attribution coverage, not because they only got 1 Meta-attributed booking.

### D. Stop using `visit_date_time` as the window filter for attribution metrics (~half day)

Use `booked_at` (when Acuity says the appointment was BOOKED, not when the visit happens). That way a booking made today for a visit next week still counts in this week's Paid Meta metric. This is more aligned with attribution windows in Meta Ads Manager.

## Recommendation

**Ship B + C this week as the immediate fix.** B closes the 96% attribution gap using data that's already in the database (`website_visitors` matched by email/phone). C makes the limitation transparent to the user even where attribution truly can't be determined.

**Schedule A for the followup sprint.** The Acuity → website_conversions ingestion is the structural fix but it's larger and needs design.

**Add this to the v3 plan as a new Phase 6.5** (or replace Phase 4's "fix website_conversions NULL visitor_id" with this broader scope — they're the same underlying gap).

## Audit lesson (the recurring one)

Every data-correctness complaint from the user has turned out to be real and has had a specific cause that the spike missed. The pattern across all of them:

1. **Pagination bug in audit tool** (fixed in `5988ccc`) — invalidated the "RPC is broken" finding
2. **Paid Meta booking attribution gap** (this report) — invalidated the "data correctness audit was sufficient" finding

Future investigations need to add a hard rule: **for every metric the user distrusts, manually compute what the metric SHOULD be from external truth (Acuity / Meta Ads Manager / Shopify) and compare to what the dashboard shows.** Internal-consistency checks alone are not sufficient.
