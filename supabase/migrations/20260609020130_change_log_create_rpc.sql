-- Migration: change_log_create_rpc
--
-- Shared Supabase ledger file. This repo writes seconds=30
-- so it cannot collide with the sales-standalone-app-v1 repo (which writes seconds=00).
--
-- Atomic create for a change-log entry. The TypeScript path previously issued
-- three sequential, non-transactional writes (entry, entities, 'create' revision);
-- a failure after the first left an orphan entry that was active, listed in the UI,
-- and fed to AI with no entities and no audit row. This wraps all three inserts in
-- one transaction so the entry is never persisted without its entities and revision.
--
-- Environment is derived from analytics.current_ads_analyst_environment() (the same
-- expression used as the column default and by the RLS policies in
-- 20260608225930_change_log.sql), so scoping stays identical to the direct-insert path.

create or replace function public.create_change_log_entry(
  p_brand_code       text,
  p_meta_account_id  text,
  p_event_date       date,
  p_effective_start  date,
  p_effective_end    date,
  p_change_type      text,
  p_title            text,
  p_reason           text,
  p_before_value     text,
  p_after_value      text,
  p_raw_input        text,
  p_verify_entity    text,
  p_verify_value     text,
  p_created_by       uuid,
  p_created_by_email text,
  p_entities         jsonb,
  p_actor_id         uuid,
  p_actor_email      text,
  p_snapshot         jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, analytics
as $$
declare
  v_env      text := analytics.current_ads_analyst_environment();
  v_entry_id uuid;
begin
  insert into public.change_log_entries (
    environment, brand_code, meta_account_id, event_date,
    effective_start, effective_end, change_type, title, reason,
    before_value, after_value, raw_input, verify_entity, verify_value,
    created_by, created_by_email
  ) values (
    v_env, p_brand_code, p_meta_account_id, p_event_date,
    p_effective_start, p_effective_end, p_change_type, p_title, p_reason,
    p_before_value, p_after_value, p_raw_input,
    coalesce(p_verify_entity, 'none'), coalesce(p_verify_value, 'na'),
    p_created_by, p_created_by_email
  )
  returning id into v_entry_id;

  if p_entities is not null and jsonb_array_length(p_entities) > 0 then
    insert into public.change_log_entry_entities (
      entry_id, environment, entity_kind, entity_meta_id, entity_name, match_status
    )
    select
      v_entry_id,
      v_env,
      e ->> 'entity_kind',
      e ->> 'entity_meta_id',
      e ->> 'entity_name',
      coalesce(e ->> 'match_status', 'unmatched')
    from jsonb_array_elements(p_entities) as e;
  end if;

  insert into public.change_log_entry_revisions (
    entry_id, environment, action, snapshot, actor_id, actor_email
  ) values (
    v_entry_id, v_env, 'create', coalesce(p_snapshot, '{}'::jsonb), p_actor_id, p_actor_email
  );

  return v_entry_id;
end;
$$;

grant execute on function public.create_change_log_entry(
  text, text, date, date, date, text, text, text, text, text, text, text, text,
  uuid, text, jsonb, uuid, text, jsonb
) to ads_analyst_web;

comment on function public.create_change_log_entry(
  text, text, date, date, date, text, text, text, text, text, text, text, text,
  uuid, text, jsonb, uuid, text, jsonb
) is
  'Atomically inserts a change-log entry, its entities, and the create revision in one transaction; returns the new entry id. Environment is taken from analytics.current_ads_analyst_environment().';
