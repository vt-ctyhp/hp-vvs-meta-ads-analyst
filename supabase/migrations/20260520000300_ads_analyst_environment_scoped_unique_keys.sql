-- Phase 5 environment-scoped unique keys for Ads Analyst staging separation.
--
-- This migration is schema-only. It does not insert, update, delete, backfill,
-- or otherwise mutate application data.
--
-- Apply only after:
-- 1. Phase 2 module roles/views are applied.
-- 2. Phase 3 environment columns/RLS are applied.
-- 3. Phase 4 environment-aware runtime functions are applied.
-- 4. Application write paths are deployed with ADS_ANALYST_ENVIRONMENT set.
--
-- After this migration is applied, ADS_ANALYST_USE_ENVIRONMENT_SCOPED_UPSERTS
-- may be enabled so upsert conflict targets include the environment column.

create or replace function pg_temp.unique_constraint_column_list(
  p_table regclass,
  p_conkey int2[]
)
returns text[]
language sql
stable
as $$
  select array_agg(a.attname order by key_columns.ordinality)
  from unnest(p_conkey) with ordinality as key_columns(attnum, ordinality)
  join pg_attribute a
    on a.attrelid = p_table
   and a.attnum = key_columns.attnum;
$$;

create or replace function pg_temp.add_unique_constraint_if_missing(
  p_table regclass,
  p_constraint_name text,
  p_columns text[]
)
returns void
language plpgsql
as $$
declare
  column_list text;
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = p_table
      and conname = p_constraint_name
      and contype = 'u'
  ) then
    return;
  end if;

  select string_agg(format('%I', column_name), ', ')
  into column_list
  from unnest(p_columns) as column_name;

  execute format(
    'alter table %s add constraint %I unique (%s)',
    p_table,
    p_constraint_name,
    column_list
  );
end;
$$;

create or replace function pg_temp.drop_unique_constraints_by_columns(
  p_table regclass,
  p_columns text[]
)
returns void
language plpgsql
as $$
declare
  constraint_row record;
begin
  for constraint_row in
    select c.conname
    from pg_constraint c
    where c.conrelid = p_table
      and c.contype = 'u'
      and pg_temp.unique_constraint_column_list(p_table, c.conkey) = p_columns
  loop
    execute format('alter table %s drop constraint %I', p_table, constraint_row.conname);
  end loop;
end;
$$;

-- Meta Ads catalog and insights.
select pg_temp.add_unique_constraint_if_missing(
  'public.brands'::regclass,
  'brands_environment_code_key',
  array['environment', 'code']
);
select pg_temp.add_unique_constraint_if_missing(
  'public.meta_ad_accounts'::regclass,
  'meta_ad_accounts_environment_account_key',
  array['environment', 'meta_account_id']
);
select pg_temp.add_unique_constraint_if_missing(
  'public.meta_campaigns'::regclass,
  'meta_campaigns_environment_account_campaign_key',
  array['environment', 'meta_account_id', 'campaign_id']
);
select pg_temp.add_unique_constraint_if_missing(
  'public.meta_ad_sets'::regclass,
  'meta_ad_sets_environment_account_ad_set_key',
  array['environment', 'meta_account_id', 'ad_set_id']
);
select pg_temp.add_unique_constraint_if_missing(
  'public.meta_creatives'::regclass,
  'meta_creatives_environment_account_creative_key',
  array['environment', 'meta_account_id', 'creative_id']
);
select pg_temp.add_unique_constraint_if_missing(
  'public.meta_ads'::regclass,
  'meta_ads_environment_account_ad_key',
  array['environment', 'meta_account_id', 'ad_id']
);
select pg_temp.add_unique_constraint_if_missing(
  'public.meta_daily_insights'::regclass,
  'meta_daily_insights_environment_account_ad_date_key',
  array['environment', 'meta_account_id', 'ad_id', 'date_start']
);
select pg_temp.add_unique_constraint_if_missing(
  'public.campaign_umbrella_overrides'::regclass,
  'campaign_umbrella_overrides_environment_entity_key',
  array['environment', 'meta_account_id', 'entity_type', 'entity_id']
);

select pg_temp.drop_unique_constraints_by_columns('public.brands'::regclass, array['code']);
select pg_temp.drop_unique_constraints_by_columns(
  'public.meta_ad_accounts'::regclass,
  array['meta_account_id']
);
select pg_temp.drop_unique_constraints_by_columns(
  'public.meta_campaigns'::regclass,
  array['meta_account_id', 'campaign_id']
);
select pg_temp.drop_unique_constraints_by_columns(
  'public.meta_ad_sets'::regclass,
  array['meta_account_id', 'ad_set_id']
);
select pg_temp.drop_unique_constraints_by_columns(
  'public.meta_creatives'::regclass,
  array['meta_account_id', 'creative_id']
);
select pg_temp.drop_unique_constraints_by_columns(
  'public.meta_ads'::regclass,
  array['meta_account_id', 'ad_id']
);
select pg_temp.drop_unique_constraints_by_columns(
  'public.meta_daily_insights'::regclass,
  array['meta_account_id', 'ad_id', 'date_start']
);
select pg_temp.drop_unique_constraints_by_columns(
  'public.campaign_umbrella_overrides'::regclass,
  array['meta_account_id', 'entity_type', 'entity_id']
);

-- Social inbox and AI reply state.
select pg_temp.add_unique_constraint_if_missing(
  'public.meta_social_pages'::regclass,
  'meta_social_pages_environment_page_key',
  array['environment', 'page_id']
);
select pg_temp.add_unique_constraint_if_missing(
  'public.meta_social_threads'::regclass,
  'meta_social_threads_environment_thread_key',
  array['environment', 'platform', 'thread_id']
);
select pg_temp.add_unique_constraint_if_missing(
  'public.meta_social_messages'::regclass,
  'meta_social_messages_environment_message_key',
  array['environment', 'platform', 'message_id']
);
select pg_temp.add_unique_constraint_if_missing(
  'public.meta_social_comments'::regclass,
  'meta_social_comments_environment_comment_key',
  array['environment', 'platform', 'comment_id']
);
select pg_temp.add_unique_constraint_if_missing(
  'public.social_thread_summaries'::regclass,
  'social_thread_summaries_environment_thread_key',
  array['environment', 'platform', 'thread_id']
);

select pg_temp.drop_unique_constraints_by_columns(
  'public.meta_social_pages'::regclass,
  array['page_id']
);
select pg_temp.drop_unique_constraints_by_columns(
  'public.meta_social_threads'::regclass,
  array['platform', 'thread_id']
);
select pg_temp.drop_unique_constraints_by_columns(
  'public.meta_social_messages'::regclass,
  array['platform', 'message_id']
);
select pg_temp.drop_unique_constraints_by_columns(
  'public.meta_social_comments'::regclass,
  array['platform', 'comment_id']
);
select pg_temp.drop_unique_constraints_by_columns(
  'public.social_thread_summaries'::regclass,
  array['platform', 'thread_id']
);

select pg_temp.add_unique_constraint_if_missing(
  'public.brand_voice_guidelines'::regclass,
  'brand_voice_guidelines_environment_version_key',
  array['environment', 'brand', 'language', 'version']
);
select pg_temp.drop_unique_constraints_by_columns(
  'public.brand_voice_guidelines'::regclass,
  array['brand', 'language', 'version']
);

create unique index if not exists brand_voice_guidelines_environment_active_idx
  on public.brand_voice_guidelines(environment, brand, language)
  where active;

drop index if exists public.brand_voice_guidelines_active_idx;

-- Website funnel events.
select pg_temp.add_unique_constraint_if_missing(
  'public.website_sessions'::regclass,
  'website_sessions_environment_session_key',
  array['environment', 'session_id']
);
select pg_temp.add_unique_constraint_if_missing(
  'public.website_events'::regclass,
  'website_events_environment_event_key',
  array['environment', 'event_id']
);

select pg_temp.drop_unique_constraints_by_columns(
  'public.website_sessions'::regclass,
  array['session_id']
);
select pg_temp.drop_unique_constraints_by_columns(
  'public.website_events'::regclass,
  array['event_id']
);

comment on index public.brand_voice_guidelines_environment_active_idx is
  'One active brand voice guideline per Ads Analyst environment, brand, and language.';
