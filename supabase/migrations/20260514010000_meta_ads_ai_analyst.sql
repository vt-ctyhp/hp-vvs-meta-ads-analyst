create extension if not exists pgcrypto;

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meta_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete set null,
  meta_account_id text not null unique,
  name text,
  currency text,
  timezone_name text,
  account_status integer,
  raw_json jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meta_campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete set null,
  account_id uuid references public.meta_ad_accounts(id) on delete cascade,
  meta_account_id text not null,
  campaign_id text not null,
  name text,
  objective text,
  buying_type text,
  status text,
  effective_status text,
  start_time timestamptz,
  stop_time timestamptz,
  created_time timestamptz,
  updated_time timestamptz,
  raw_json jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meta_account_id, campaign_id)
);

create table if not exists public.meta_ad_sets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete set null,
  account_id uuid references public.meta_ad_accounts(id) on delete cascade,
  campaign_ref_id uuid references public.meta_campaigns(id) on delete set null,
  meta_account_id text not null,
  campaign_id text,
  ad_set_id text not null,
  name text,
  status text,
  effective_status text,
  optimization_goal text,
  billing_event text,
  bid_strategy text,
  daily_budget numeric,
  lifetime_budget numeric,
  start_time timestamptz,
  end_time timestamptz,
  created_time timestamptz,
  updated_time timestamptz,
  targeting jsonb not null default '{}'::jsonb,
  raw_json jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meta_account_id, ad_set_id)
);

create table if not exists public.meta_creatives (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete set null,
  account_id uuid references public.meta_ad_accounts(id) on delete cascade,
  meta_account_id text not null,
  creative_id text not null,
  name text,
  title text,
  body text,
  call_to_action_type text,
  object_type text,
  object_story_id text,
  effective_object_story_id text,
  thumbnail_url text,
  image_url text,
  video_thumbnail_url text,
  preview_url text,
  preview_html text,
  preview_source text not null default 'fallback',
  asset_metadata jsonb not null default '{}'::jsonb,
  object_story_spec jsonb not null default '{}'::jsonb,
  asset_feed_spec jsonb not null default '{}'::jsonb,
  raw_json jsonb not null default '{}'::jsonb,
  last_preview_refresh_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meta_account_id, creative_id)
);

create table if not exists public.meta_ads (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete set null,
  account_id uuid references public.meta_ad_accounts(id) on delete cascade,
  campaign_ref_id uuid references public.meta_campaigns(id) on delete set null,
  ad_set_ref_id uuid references public.meta_ad_sets(id) on delete set null,
  creative_ref_id uuid references public.meta_creatives(id) on delete set null,
  meta_account_id text not null,
  campaign_id text,
  ad_set_id text,
  ad_id text not null,
  creative_id text,
  name text,
  status text,
  effective_status text,
  preview_source text not null default 'fallback',
  preview_url text,
  preview_html text,
  created_time timestamptz,
  updated_time timestamptz,
  raw_json jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meta_account_id, ad_id)
);

create table if not exists public.meta_daily_insights (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete set null,
  account_id uuid references public.meta_ad_accounts(id) on delete cascade,
  campaign_ref_id uuid references public.meta_campaigns(id) on delete set null,
  ad_set_ref_id uuid references public.meta_ad_sets(id) on delete set null,
  ad_ref_id uuid references public.meta_ads(id) on delete set null,
  creative_ref_id uuid references public.meta_creatives(id) on delete set null,
  meta_account_id text not null,
  campaign_id text,
  campaign_name text,
  ad_set_id text,
  ad_set_name text,
  ad_id text,
  ad_name text,
  creative_id text,
  date_start date not null,
  date_stop date not null,
  spend numeric not null default 0,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  frequency numeric not null default 0,
  cpm numeric not null default 0,
  cpc numeric not null default 0,
  ctr numeric not null default 0,
  clicks bigint not null default 0,
  inline_link_clicks bigint not null default 0,
  unique_clicks bigint not null default 0,
  conversions bigint not null default 0,
  leads bigint not null default 0,
  bookings bigint not null default 0,
  video_metrics jsonb not null default '{}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  action_values jsonb not null default '[]'::jsonb,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meta_account_id, ad_id, date_start)
);

create table if not exists public.ai_reports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null default 'executive',
  title text not null,
  time_range jsonb not null,
  ad_account_ids jsonb not null default '[]'::jsonb,
  record_counts jsonb not null default '{}'::jsonb,
  source_transparency jsonb not null default '{}'::jsonb,
  model text not null,
  content jsonb not null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.ai_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Executive chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ai_chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  source_transparency jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null,
  status text not null default 'running' check (status in ('running', 'success', 'failed', 'partial')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  ad_account_ids jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists meta_daily_insights_date_idx on public.meta_daily_insights(date_start desc);
create index if not exists meta_daily_insights_account_date_idx on public.meta_daily_insights(meta_account_id, date_start desc);
create index if not exists meta_daily_insights_campaign_idx on public.meta_daily_insights(campaign_id);
create index if not exists meta_daily_insights_ad_idx on public.meta_daily_insights(ad_id);
create index if not exists meta_ads_creative_idx on public.meta_ads(creative_id);
create index if not exists meta_creatives_preview_idx on public.meta_creatives(preview_source);
create index if not exists sync_runs_started_idx on public.sync_runs(started_at desc);
create index if not exists ai_reports_generated_idx on public.ai_reports(generated_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists brands_set_updated_at on public.brands;
create trigger brands_set_updated_at before update on public.brands
for each row execute function public.set_updated_at();

drop trigger if exists meta_ad_accounts_set_updated_at on public.meta_ad_accounts;
create trigger meta_ad_accounts_set_updated_at before update on public.meta_ad_accounts
for each row execute function public.set_updated_at();

drop trigger if exists meta_campaigns_set_updated_at on public.meta_campaigns;
create trigger meta_campaigns_set_updated_at before update on public.meta_campaigns
for each row execute function public.set_updated_at();

drop trigger if exists meta_ad_sets_set_updated_at on public.meta_ad_sets;
create trigger meta_ad_sets_set_updated_at before update on public.meta_ad_sets
for each row execute function public.set_updated_at();

drop trigger if exists meta_creatives_set_updated_at on public.meta_creatives;
create trigger meta_creatives_set_updated_at before update on public.meta_creatives
for each row execute function public.set_updated_at();

drop trigger if exists meta_ads_set_updated_at on public.meta_ads;
create trigger meta_ads_set_updated_at before update on public.meta_ads
for each row execute function public.set_updated_at();

drop trigger if exists meta_daily_insights_set_updated_at on public.meta_daily_insights;
create trigger meta_daily_insights_set_updated_at before update on public.meta_daily_insights
for each row execute function public.set_updated_at();

drop trigger if exists ai_chat_sessions_set_updated_at on public.ai_chat_sessions;
create trigger ai_chat_sessions_set_updated_at before update on public.ai_chat_sessions
for each row execute function public.set_updated_at();

alter table public.brands enable row level security;
alter table public.meta_ad_accounts enable row level security;
alter table public.meta_campaigns enable row level security;
alter table public.meta_ad_sets enable row level security;
alter table public.meta_ads enable row level security;
alter table public.meta_creatives enable row level security;
alter table public.meta_daily_insights enable row level security;
alter table public.ai_reports enable row level security;
alter table public.ai_chat_sessions enable row level security;
alter table public.ai_chat_messages enable row level security;
alter table public.sync_runs enable row level security;

insert into public.brands (code, name)
values ('HP', 'Hung Phat'), ('VVS', 'VVS')
on conflict (code) do update set name = excluded.name;
