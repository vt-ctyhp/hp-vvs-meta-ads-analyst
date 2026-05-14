alter table public.meta_campaigns
  add column if not exists campaign_umbrella text,
  add column if not exists campaign_umbrella_confidence text,
  add column if not exists campaign_umbrella_source text,
  add column if not exists campaign_umbrella_reason text;

alter table public.meta_ad_sets
  add column if not exists campaign_umbrella text,
  add column if not exists campaign_umbrella_confidence text,
  add column if not exists campaign_umbrella_source text,
  add column if not exists campaign_umbrella_reason text;

alter table public.meta_ads
  add column if not exists campaign_umbrella text,
  add column if not exists campaign_umbrella_confidence text,
  add column if not exists campaign_umbrella_source text,
  add column if not exists campaign_umbrella_reason text;

alter table public.meta_daily_insights
  add column if not exists campaign_umbrella text,
  add column if not exists campaign_umbrella_confidence text,
  add column if not exists campaign_umbrella_source text,
  add column if not exists campaign_umbrella_reason text;

create table if not exists public.campaign_umbrella_overrides (
  id uuid primary key default gen_random_uuid(),
  meta_account_id text not null,
  entity_type text not null check (entity_type in ('campaign', 'ad_set', 'ad')),
  entity_id text not null,
  campaign_umbrella text not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meta_account_id, entity_type, entity_id)
);

create index if not exists meta_campaigns_umbrella_idx
  on public.meta_campaigns(campaign_umbrella);

create index if not exists meta_ad_sets_umbrella_idx
  on public.meta_ad_sets(campaign_umbrella);

create index if not exists meta_ads_umbrella_idx
  on public.meta_ads(campaign_umbrella);

create index if not exists meta_daily_insights_umbrella_date_idx
  on public.meta_daily_insights(campaign_umbrella, date_start desc);

create index if not exists campaign_umbrella_overrides_lookup_idx
  on public.campaign_umbrella_overrides(meta_account_id, entity_type, entity_id);

drop trigger if exists campaign_umbrella_overrides_set_updated_at on public.campaign_umbrella_overrides;
create trigger campaign_umbrella_overrides_set_updated_at before update on public.campaign_umbrella_overrides
for each row execute function public.set_updated_at();

alter table public.campaign_umbrella_overrides enable row level security;
