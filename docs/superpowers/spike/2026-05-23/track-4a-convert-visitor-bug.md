# Track 4a — /convert visitor display bug

_Investigated: 2026-05-23_

## User's complaint
> the Convert page does not show all of the website visitors when no filter is selected. It looks like it surfaces incorrectly on the UI as well.

## What the page actually does

`src/app/(workspace)/convert/page.tsx` renders four pieces — a status sentence, the filter bar, a funnel viz, and the "Customer ledger" table. The ledger is the surface the user means when they say "website visitors": it is the per-row list of customer journeys (`CustomerLedger` component, fed by `customerLedgerRowsFromJourneys(data.rows)` at page.tsx:178).

With no URL params the page builds `rangeRequest = { days: undefined, endDate: null, startDate: null }` (convert-customer-ledger.ts:91–101). That normalizes to the **last 30 days** (`DEFAULT_LEDGER_DAYS = 30`, customer-journey-ledger.ts:7). Stage/source/type/capi/query filters all default to `"all"` (convert-customer-ledger.ts:145–155), so the post-load filter `filterCustomerLedgerRows` (lines 157–170) is a pass-through.

The data pipeline that actually fills the ledger lives in `fetchCustomerJourneyLedgerData()` at customer-journey-ledger.ts:481–635. Despite its name and the visitor-shaped types, **it is structurally appointment-keyed**:

1. Pull `appointment_events` whose `visit_date_time` is in window (lines 500–510).
2. If zero appointments → return empty (lines 513–522). **No visitor branch ever runs.**
3. Otherwise fetch `website_conversions` and `website_events` filtered by `acuity_appointment_id IN (...)` (lines 524–547).
4. Derive `visitorIdsFromAppointments` only from `visitor_id` columns on those conversions/events (lines 549–556).
5. Fetch `website_visitors` only for that derived set (lines 558–571) — capped at `MAX_LEDGER_VISITORS = 500`.

Then `buildCustomerJourneyLedgerRows` (lines 1153–1231) iterates **appointments**, producing one row per appointment, and falls back to `conversionOnlyLedgerRow` or `appointmentLedgerRow` when no visitor/conversion match exists. There is no code path that emits a row per website visitor.

## Root cause(s) identified

1. **The ledger is structurally appointment-keyed, not visitor-keyed.** `fetchCustomerJourneyLedgerData()` only fetches `website_visitors` whose IDs appear on appointment-matched conversions/events (customer-journey-ledger.ts:549–571). A visitor that browsed the site but did not book is *unreachable* from this code path — even with all filters cleared. Empirically (last 30d, prod):
   - `website_visitors` total: **584** (all with `last_seen_at` in window)
   - Distinct `visitor_id` in `website_events` in window: **112**
   - Appointments in window (`visit_date_time` ∈ 30d): **109**
   - Conversions joinable to first 100 appointment IDs: **2 rows / 2 distinct visitors**
   - Events joinable to those 100 appointment IDs: **35 rows / 2 distinct visitors**
   
   So the loader returns approximately **2 visitor rows** + **~107 visitor-less appointment rows** = ~109 ledger rows, when the user reasonably expects to see all **112 active visitors** (or all 584 known visitors). About **110 of 112 visitors with site activity are silently invisible.**

2. **Default 30-day window further trims visible visitors.** Even without bug #1, the window-clamped default (DEFAULT_LEDGER_DAYS = 30, customer-journey-ledger.ts:7) is invisible to the user — no chip, no URL param, no UI affordance — so "no filter selected" actually has an implicit silent filter.

3. **NULL `visitor_id` rows do leak into the UI as broken rows.** When an appointment has no matching conversion **and** events without `visitor_id`, the appointment branch falls through to `appointmentLedgerRow({ visitor: null, … })` (customer-journey-ledger.ts:1200–1202 → 1382–1447). That row carries `visitorId: null`, blank `customerEmail/Name/Phone` (lines 1424–1426), no fbc/fbp, no geo from a visitor record, no device fingerprint — i.e. a row of em-dashes in every column the user expects to identify a person. The 50%-NULL `visitor_id` finding on `website_conversions` cascades the same way through `conversionOnlyLedgerRow` (customer-journey-ledger.ts:1209–1217).

4. **No de-dup against `appointmentSourceId` / `acuity_appointment_id`.** Because of #3 a single appointment can show up both as a visitor-attributed conversion row *and* as a visitor-less appointment row when the appointments list is denormalized in `uniqueValidAcuityAppointments`. (Less severe; mentioned for completeness.)

## Why it surfaces "incorrectly on the UI"

The `CustomerLedger` component (src/components/v2/convert/customer-ledger.tsx:150–238) is a TanStack table with columns Creative / **Customer** / Activity / **Location** / Brand / **Source** / CAPI / Type. When a row arrives with `visitorId=null, customerName=null, customerEmail=null, sourceType=null, capiStatus=null, deviceBrowser=null`, every cell falls back to `"—"` (lines 167–173, 230–234) or empty chips. Visually this reads as a row of dashes the user cannot click into meaningfully — drawer fetches keyed on `acuityAppointmentId` may still work, but the table itself shows nothing identifying. The header reads e.g. "Customer ledger · 109" while ≥95 % of rows are unidentified. That is the "surfaces incorrectly" half: the row count is honest about how many things exist, but the rows themselves are useless and the missing 110 active visitors are entirely absent.

A second UI defect: the page header reads "Customer ledger" with no copy explaining that the table is filtered to appointment-bookers — the user is told this is *all* customers, but it is "customers who booked an Acuity appointment in the last 30 days."

## Severity

**structurally-broken.** The loader's contract does not match what the UI promises. This is not a missing predicate or an off-by-one — the data flow begins from `appointment_events` and there is no entry point that yields visitors-without-appointments. The 500-row visitor cap (`MAX_LEDGER_VISITORS`) is irrelevant here because the loader never asks for the unconverted population. The NULL-visitor data quality issue is a separate problem that makes the broken loader look even worse on screen.

## Fix shape

A bug fix without a rebuild is plausible if the product intent is "all visitors (default 30d), with bookings/appointments stitched in":

1. In `fetchCustomerJourneyLedgerData`, fetch the visitor population first (e.g. `website_visitors WHERE last_seen_at BETWEEN start AND end ORDER BY last_seen_at DESC LIMIT 500`). Honor `MAX_LEDGER_VISITORS` as a real pagination cap with a visible "showing 500 of N" indicator.
2. Then fetch related sessions/events/conversions by visitor_id (already done) AND appointments by either visitor-derived conversion ↔ appointment join OR by `visit_date_time` window (current path) — union the two.
3. Change `buildCustomerJourneyLedgerRows` to iterate the visitor list as the primary axis, with an "orphaned appointments" (no visitor) bucket appended at the bottom and clearly labeled in the UI.
4. Add a visible "Last 30 days" chip in the filter bar (`ConvertFilterBar`) so the implicit window stops being a silent filter.
5. Suppress (or visually flag) rows where `visitorId=null AND customerEmail=null AND customerName=null AND capiStatus=null` — they're current data-quality noise from the 50%-NULL `website_conversions.visitor_id` problem and should be aggregated into a single "X unattributed bookings — open data quality" line, not interleaved with real journeys.

Realistic effort: ~1–2 days for steps 1–3, half a day for 4–5. No schema change required.

## How this affects the rebuild decision

This finding is a **fixable bug within Plan C scope**, not a structural argument for B. The loader is wrong in a single, well-defined way: it asks the database the wrong question (appointments → visitors instead of visitors → appointments). The shape of the data model (`website_visitors`, `website_sessions`, `website_events`, `website_conversions`, `appointment_events`) supports the correct query directly; only ~80 lines of `customer-journey-ledger.ts` need re-ordering. The pagination cap, default-window UX, and NULL-visitor presentation are independent polish items. Combined with Track 4's other findings (50% NULL `visitor_id` on `website_conversions`, 5.6% NULL `visit_date_time` on `appointment_events`), this is one of two surface bugs caused by the same underlying issue — the ingestion pipeline doesn't reliably stamp `visitor_id` on conversions — so fixing #3 above is more of a presentation patch than a real fix. The real fix lives in whatever populates `website_conversions.visitor_id`.
