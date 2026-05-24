-- website_events partial index on acuity_appointment_id
--
-- Background: see docs/superpowers/plans/2026-05-23-phase-2-execution/perf-diagnosis.md
--
-- The customer-journey-ledger loader at src/lib/customer-journey-ledger.ts
-- batches calls to website_events.in(acuity_appointment_id, [ids]) when
-- resolving appointment-anchored timelines. Without an index on
-- acuity_appointment_id this devolves to a sequential scan over the full
-- events table (~1M rows in production). Measured cost: ~2.1s per batch of
-- 100 IDs. Most events do NOT have an acuity_appointment_id, so a partial
-- index keeps storage tight while still serving the .in() lookups.
--
-- Plain CREATE INDEX (not CONCURRENTLY) because Supabase CLI wraps migrations
-- in a transaction. Lock impact: at ~1M rows the build takes a few seconds
-- with a brief write lock; acceptable given website_events writes are
-- batched periodic syncs, not real-time.

create index if not exists website_events_acuity_idx
  on public.website_events (acuity_appointment_id)
  where acuity_appointment_id is not null;
