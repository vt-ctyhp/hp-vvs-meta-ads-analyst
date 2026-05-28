-- Migration: compute_inbox_metrics_daily_fn
--
-- Shared Supabase ledger file. This repo writes seconds=30
-- so it cannot collide with the sales-standalone-app-v1 repo (which writes seconds=00).

-- Idempotent per-(user, date) rollup for a given timezone. Computes, for
-- every user whose effective tz = p_tz, the metrics for p_target_date in
-- that tz: avg first-response business-seconds, on-time/total replies, and
-- team claims. SLA = 10800 business-seconds (3h). Reuses
-- public.business_seconds_between so SQL matches business-hours.ts.
--
-- Response-time inputs are wrapped in date_trunc('second', ...): that function
-- floors sub-second overlap while business-hours.ts rounds with Math.round, so
-- the two diverge by ~1s/day on sub-second inputs. Truncating to whole seconds
-- keeps this rollup bit-identical with the JS "today" compute.
create or replace function public.compute_inbox_metrics_daily_for_tz(
  p_tz text,
  p_target_date date
) returns integer
language plpgsql
security definer
set search_path = public, analytics
as $$
declare
  v_env        text := analytics.current_ads_analyst_environment();
  v_start_time time := '10:00:00';
  v_end_time   time := '19:00:00';
  v_day_start  timestamptz := (p_target_date + v_start_time) at time zone p_tz;
  v_day_end    timestamptz := (p_target_date + v_end_time)   at time zone p_tz;
  v_rows       integer := 0;
begin
  -- Users whose effective tz matches p_tz: explicit preference rows, plus
  -- (when p_tz is the PT default) users with no preference row who appear
  -- as approvers/assignees in this environment.
  with effective_users as (
    select up.user_id
      from public.meta_inbox_user_preferences up
     where up.environment = v_env and up.timezone = p_tz
    union
    select distinct sa.approved_by as user_id
      from public.meta_inbox_send_attempts sa
     where sa.environment = v_env
       and sa.approved_by is not null
       and p_tz = 'America/Los_Angeles'
       and not exists (
         select 1 from public.meta_inbox_user_preferences up2
          where up2.environment = v_env and up2.user_id = sa.approved_by
       )
  ),
  -- First sent reply per conversation by each user on the target day.
  first_reply as (
    select sa.approved_by as user_id,
           sa.conversation_id,
           min(sa.sent_at) as first_outbound_at
      from public.meta_inbox_send_attempts sa
      join effective_users eu on eu.user_id = sa.approved_by
     where sa.environment = v_env
       and sa.status = 'sent'
       and sa.sent_at >= v_day_start
       and sa.sent_at <  v_day_end
     group by sa.approved_by, sa.conversation_id
  ),
  response_rows as (
    select fr.user_id,
           public.business_seconds_between(
             date_trunc('second', c.first_inbound_at),
             date_trunc('second', fr.first_outbound_at),
             coalesce(qc.timezone, p_tz),
             coalesce(qc.business_hours_start, v_start_time),
             coalesce(qc.business_hours_end, v_end_time)
           ) as response_sec,
           (fr.first_outbound_at - c.first_inbound_at) <= interval '7 days' as fresh
      from first_reply fr
      join public.meta_inbox_conversations c on c.id = fr.conversation_id
      left join public.meta_inbox_queue_categories qc
             on qc.environment = v_env and qc.key = c.queue_category_key
     where c.first_inbound_at is not null
  ),
  per_user as (
    select user_id,
           round(avg(response_sec) filter (where fresh))::integer as avg_response_seconds,
           count(*) filter (where response_sec <= 10800)            as on_time_replies,
           count(*)                                                  as total_replies
      from response_rows
     group by user_id
  ),
  claims as (
    select (e.new_value->>'assignedUserId')::uuid as user_id, count(*) as team_claims
      from public.meta_inbox_conversation_events e
     where e.environment = v_env
       and e.event_type = 'assignment_changed'
       and e.event_at >= v_day_start and e.event_at < v_day_end
       and (e.previous_value->>'assignedUserId') is null
       and (e.new_value->>'assignedUserId') is not null
     group by (e.new_value->>'assignedUserId')
  )
  insert into public.meta_inbox_metrics_daily as m (
    environment, user_id, date, timezone,
    avg_response_seconds, on_time_replies, total_replies, team_claims,
    breached_at_eod, computed_at
  )
  select v_env, eu.user_id, p_target_date, p_tz,
         pu.avg_response_seconds,
         coalesce(pu.on_time_replies, 0),
         coalesce(pu.total_replies, 0),
         coalesce(cl.team_claims, 0),
         0,
         now()
    from effective_users eu
    left join per_user pu on pu.user_id = eu.user_id
    left join claims cl   on cl.user_id = eu.user_id
   where eu.user_id is not null
  on conflict (environment, user_id, date) do update
     set timezone             = excluded.timezone,
         avg_response_seconds = excluded.avg_response_seconds,
         on_time_replies      = excluded.on_time_replies,
         total_replies        = excluded.total_replies,
         team_claims          = excluded.team_claims,
         computed_at          = now();

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

grant execute on function public.compute_inbox_metrics_daily_for_tz(text, date)
  to ads_analyst_worker, ads_analyst_ingest;

comment on function public.compute_inbox_metrics_daily_for_tz(text, date) is
  'Idempotent per-user daily metrics upsert for one timezone. SLA=10800 business-seconds; mirrors business-hours.ts. breached_at_eod reserved (0 in v1).';
