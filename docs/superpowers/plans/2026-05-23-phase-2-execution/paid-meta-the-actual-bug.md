# Paid Meta confirmed bookings — the actual bug

_Found: 2026-05-24, after the user provided a screenshot showing live shows 5._

## The bug, in one sentence

**Commit `1d0a630` on May 23 silently broke this metric.** It changed how "Paid Meta confirmed bookings" is counted, and the new version almost never returns anything because it requires data that 96% of bookings don't have. Live is running the OLD version (the one you remember as accurate). Main is running the NEW broken version.

## What changed

In commit `1d0a630` ("fix(convert): count bookings from Acuity appointments"), the calculation in `src/lib/website-analytics.ts` changed from:

**Before (live now, what you see as "5"):**
```ts
// "Count every paid-Meta conversion row in the window."
const paidMetaScheduleConversions = scheduleConversions.filter((conversion) =>
  isPaidMetaAttributedScheduleConversion(conversion, scheduleConversions),
);
```

**After (main now, what my local shows as "1"):**
```ts
// "For each Acuity appointment in the window, count it only if there's
//  a matching paid-Meta conversion row with the same acuity_appointment_id."
const paidMetaScheduleConversions = appointmentRows.filter((appointment) => {
  const conversion = scheduleConversionsByAcuityId.get(acuityAppointmentIdForRow(appointment));
  return Boolean(conversion && isPaidMetaAttributedScheduleConversion(conversion, scheduleConversions));
});
```

## Why "5" → "1" with the new code

| | Pre-`1d0a630` (live) | Post-`1d0a630` (main) |
|---|---|---|
| What it counts | Paid-Meta conversions in window | Paid-Meta conversions tied to a valid Acuity appointment in window |
| Today's data | **5** | **1** |

The 5 paid-Meta conversions (Chris, Jasmeen, Ella, Adrian, TestVivianne) all exist in the DB. But only **1 of them has a matching valid Acuity appointment in the same 30-day window** (Jasmeen). The other 4:
- Chris: matching appointment but status is "canceled" → excluded
- Ella: matching appointment but visit_date_time is May 26 (future) → excluded
- Adrian, TestVivianne: no matching `appointment_events` row at all → excluded

So the new code is technically computing a more rigorous question, but the data answers it as 1.

## Who is "right"?

**Live (5) is what the user actually wants to see.** Every one of the 5 rows in the customer ledger represents a real paid-Meta-attributed booking. The user sees Jasmeen made a booking that was confirmed via Meta — and 4 others.

**Main (1) is technically more rigorous but practically wrong** — it only counts bookings that satisfy a 3-way data join that almost never holds. The intent of `1d0a630` ("use Acuity appointments as the funnel denominator") was reasonable, but the implementation strips out the conversion-only bookings rather than including them.

## 8th-grade version

Imagine you're tracking how many people booked through a Meta ad.

- The **old way** said: "I'll count how many times my booking tracker recorded 'this came from Meta.'" Today: **5**.
- The **new way** said: "I'll count those, but only if I can also find a matching Acuity calendar entry that hasn't been canceled and is scheduled within the last 30 days."
- The new way is much pickier. Most of the time the calendar lookup fails (the booking was made through Acuity's own page, the calendar entry was canceled, the visit is next week, etc.). So today the new way says **1** instead of 5.

Neither version is "wrong" in code. But the new version asks a question that the data rarely answers, so it dishonestly looks like business dropped to almost zero. The old version is what you remember as accurate.

## Why the spike missed this

Track 1 of the spike audited the `/analyst` RPC against the raw data. It did not audit `/convert` or `/website-funnel` against the *previous version* of the same metric. The "did this commit change the number?" question never got asked.

This is the third spike-miss in this thread:
1. **Pagination bug in audit tool** — invalidated the "RPC is broken" finding
2. **Paid Meta booking attribution gap** — I previously framed this as a data-ingestion problem, which is also true but not THIS specific bug
3. **`1d0a630` silently changed the metric from "5" to "1"** — this is the immediate cause of the user's complaint

The audit lesson: **for any metric the user distrusts, also check the git log for recent changes to that metric's computation.** I didn't.

## Recommended fix

### Option 1 — Revert just the count (~10 min)

Restore the pre-`1d0a630` calc for `paidMetaScheduleConversions` while keeping the rest of the commit's improvements (`websiteScheduleConversions`, `metaAttributedBookings`, the trend changes, etc.). Numbers go back to 5.

```ts
const paidMetaScheduleConversions = scheduleConversions.filter((conversion) =>
  isPaidMetaAttributedScheduleConversion(conversion, scheduleConversions),
);
```

### Option 2 — Show both numbers (~30 min)

Surface both interpretations so the operator can see the gap:
- "Paid Meta conversions: 5"
- "Paid Meta confirmed via Acuity: 1"

### Option 3 — Honest hybrid (~1 day)

Count all 5 paid-Meta conversions, AND attempt to link them to Acuity appointments. Show: "5 paid-Meta bookings, 1 with matching Acuity appointment, 4 with attribution-only (no matched calendar entry)."

## Recommendation

**Option 1 first** (10 minutes, reverts the regression). Ship it today. The numbers go back to matching what live shows and what the user expects.

Then optionally Option 2 or 3 later, to add the rigor that `1d0a630` was reaching for without breaking the working metric.

## Why does live show 5 if main has the broken code?

Vercel hasn't deployed the post-`1d0a630` code yet, or there's deployment lag. Live is still serving the pre-`1d0a630` build. Once Vercel auto-deploys main (or you trigger a deploy), live's number will drop from 5 to 1 — and you'll be staring at the regression directly. **Fix Option 1 before that happens.**
