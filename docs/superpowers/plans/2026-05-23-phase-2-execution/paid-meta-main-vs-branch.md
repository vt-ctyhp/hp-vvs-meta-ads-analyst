# Paid Meta confirmed bookings — main vs my branch comparison

_Investigated: 2026-05-24, after user reported that the live (main) version shows accurate data while the local (my branch) shows "1"._

## Plain-English summary

**The math that produces "1" is the exact same code on main and on my branch.** I checked. My branch's only changes to `src/lib/website-analytics.ts` are: (a) adding a 30-second cache wrapper, (b) splitting one function into "cached" and "uncached" halves. The actual count of "Paid Meta confirmed bookings" is computed by code that I didn't touch.

So **if you see different numbers on live vs locally, the difference is not from my code changes.** It has to be one of these:

1. **You might be looking at a different metric.** The funnel shows several similar-sounding rows: "Confirmed bookings" (probably ~30), "Paid Meta confirmed bookings" (1), and others. They mean different things.

2. **The live website may be showing a stale Vercel cache.** Production sometimes serves a snapshot from before recent data was synced.

3. **The database is in the same state for both** — both your local dev and production point at the same Supabase project. So the numbers should agree once any cache catches up.

## The 8th-grade version of what this metric actually means

Think of three buckets the website needs to know about for one booking:

- **Bucket A — "Someone booked an appointment in Acuity"** — this gets written to `appointment_events`. We have ~30 of these in the last 30 days.
- **Bucket B — "The booking happened through the website, and we tracked where the visitor came from"** — this gets written to `website_conversions`. We only have ~11 of these in the last 30 days.
- **Bucket C — "The visitor came from a Meta ad we paid for"** — this is determined by looking at info inside Bucket B (specifically `last_paid_touch`). We have 4 of these in the last 30 days.

**The "Paid Meta confirmed bookings" number requires all three buckets to line up on the same booking.** It says: "There was an Acuity booking, AND we have website tracking for it, AND that tracking shows a paid Meta source."

Right now in the database, **only 1 booking in the last 30 days satisfies all three**:
- Bucket A says yes (we have an appointment row)
- Bucket B says yes (we have a conversion row)
- Bucket C says yes (the tracking shows paid Meta)

For the other 29 Acuity bookings, **Bucket B is empty** — the appointment exists but we never tracked where the visitor came from. So we can't say whether they came from Meta or anywhere else. The metric just doesn't count them.

## Why "Bucket B is mostly empty" is the real bug

Two separate systems write to these tables:

- **Acuity webhook** → writes to `appointment_events` (Bucket A) every time someone books in Acuity. Works fine.
- **Website's booking form, with the tracking script intact** → calls `/api/website/conversions` → writes to `website_conversions` (Bucket B).

The second one only runs when:
- The user finds the booking page through the website (not through Acuity's direct link)
- They don't have an ad blocker
- The tracking script loaded properly
- The user actually completed the booking flow on the website (didn't switch to a different device, etc.)

So for any booking that came in via Acuity's hosted page, or via someone clicking a direct link, **Bucket B never gets a row.** That's why 29 of 30 Acuity bookings are missing their conversion record.

## Are either of them right? Neither? Both?

**Both main and my branch correctly compute "1"** given the data in the database. The CODE is right.

**Neither is showing the answer the user actually wants.** The user wants "how many bookings came from Meta paid ads" which the data CAN partially answer differently:

- Of the 30 Acuity bookings in window, how many have a matching visitor on file (via `customer_email` → `website_visitors.customer_email`)?
- Of those matched visitors, how many had `last_paid_touch` set to Meta in their visit history?

This alternative calc DOESN'T require Bucket B to have been populated. It pulls the attribution from Bucket A → visitor lookup → visitor's known tracking. **This would likely show a much larger number, closer to what you expect.**

## Recommended solutions (in order)

### 1. Don't change anything yet — first verify what's on live vs local (~5 min)

Refresh the live site's /website-funnel right now and tell me the number it shows for "Paid Meta confirmed bookings." If it's also 1, then the data is consistent — you may have been comparing different metrics. If it's a different number on live, **screenshot both** and we'll find the discrepancy.

### 2. Recompute attribution from visitor data (~1 day)

Don't rely on `website_conversions` being populated. For each Acuity appointment, look up the visitor by email/phone in `website_visitors`, then check their `last_paid_touch`. Most of the 29 missing-attribution bookings are actually attributable this way — the visitor IS in the DB, we just never linked the booking to them.

### 3. Show data coverage in the UI (~half day)

Change the funnel display from:
```
Paid Meta confirmed bookings: 1
```

To:
```
Confirmed bookings: 30
  ├─ With tracked attribution: 1
  │    ├─ Paid Meta: 1
  │    ├─ Direct: 0
  │    └─ Other: 0
  └─ Without tracked attribution: 29
```

So you can see the limitation clearly instead of guessing at it.

### 4. Fix the Acuity webhook → website_conversions ingestion (days)

The structural fix: every Acuity webhook also creates a `website_conversions` row, looking up the visitor's last paid touch by email/phone first. Closes the gap going forward but doesn't help historical data.

## Bottom line

- My changes did NOT change this number. Same code on both branches.
- The "1" is the correct answer to what the metric CURRENTLY asks.
- The metric is asking the wrong question because the data lifecycle has a 96% gap.
- Fix #2 (recompute from visitor lookups) closes the gap for current + historical data, ~1 day of work.
