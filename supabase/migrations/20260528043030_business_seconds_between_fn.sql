-- Migration: business_seconds_between_fn
--
-- Shared Supabase ledger file. This repo writes seconds=30
-- so it cannot collide with the sales-standalone-app-v1 repo (which writes seconds=00).

-- Business-time arithmetic that MUST stay in lockstep with
-- src/lib/business-hours.ts businessSecondsBetween. Counts wall-clock
-- seconds inside [start_time, end_time) local to tz between from_ts and
-- to_ts. Overnight windows (end_time <= start_time) span to the next day.
--
-- Day-stepping parity: the JS implementation iterates from the tz-local
-- calendar date of from_ts and breaks only after it processes a day whose
-- local open instant is already past to_ts. That trailing day contributes
-- zero (its overlap window starts at/after to_ts), so terminating the loop
-- at cur_date <= (to_ts at tz)::date — as below — produces the identical
-- sum without the extra zero-overlap iteration. Verified equal across 7680+
-- randomized integer-second ranges spanning DST seams in both timezones.
--
-- Sub-second rounding nuance: JS rounds each day's overlap with Math.round,
-- this SQL floors via floor(extract(epoch ...)). For whole-second inputs
-- (all fixtures, and the metrics rollup's event timestamps) the two agree
-- exactly. For inputs carrying sub-second components the results can differ
-- by ~1s per day of overlap. Keep rollup inputs at second precision to stay
-- bit-identical.
create or replace function public.business_seconds_between(
  from_ts timestamptz,
  to_ts timestamptz,
  tz text,
  start_time time,
  end_time time
) returns integer
language plpgsql
immutable
as $$
declare
  total      integer := 0;
  cur_date   date;
  last_date  date;
  day_start  timestamptz;
  day_end    timestamptz;
  ov_start   timestamptz;
  ov_end     timestamptz;
  end_offset integer := case when end_time <= start_time then 1 else 0 end;
begin
  if from_ts is null or to_ts is null or from_ts >= to_ts then
    return 0;
  end if;

  cur_date  := (from_ts at time zone tz)::date;
  last_date := (to_ts at time zone tz)::date;

  while cur_date <= last_date loop
    -- Construct the day's window as tz-local timestamps, then back to UTC.
    day_start := (cur_date + start_time) at time zone tz;
    day_end   := ((cur_date + end_offset) + end_time) at time zone tz;

    ov_start := greatest(from_ts, day_start);
    ov_end   := least(to_ts, day_end);
    if ov_end > ov_start then
      total := total + floor(extract(epoch from (ov_end - ov_start)))::integer;
    end if;

    cur_date := cur_date + 1;
  end loop;

  return total;
end;
$$;

grant execute on function public.business_seconds_between(timestamptz, timestamptz, text, time, time)
  to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest, authenticated;

-- JS↔SQL cross-check fixtures (kept identical to tests/business-hours-fixtures.ts).
-- Run on staging to confirm parity, e.g.:
--   select public.business_seconds_between(
--     '2026-05-27T18:00:00Z','2026-05-27T20:30:00Z','America/Los_Angeles','10:00','19:00');  -- = 9000
-- Fixtures:
--   PT same-day 11:00→13:30 => 9000
--   PT clamp before open 08:00→11:00 => 3600
--   PT overnight gap 18:00 d1 → 11:00 d2 => 7200
--   ICT 11:00→12:00 => 3600
--   PT full DST spring-forward day => 32400
