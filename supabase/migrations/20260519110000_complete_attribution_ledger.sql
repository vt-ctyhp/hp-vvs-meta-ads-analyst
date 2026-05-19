create table if not exists public.website_visitors (
  id uuid primary key default gen_random_uuid(),
  visitor_id text not null unique,
  brand text not null default 'HP',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  first_page_url text,
  last_page_url text,
  first_referrer text,
  last_referrer text,
  first_touch jsonb,
  last_touch jsonb,
  last_paid_touch jsonb,
  fbp text,
  fbc text,
  user_agent text,
  device_category text,
  browser_name text,
  os_name text,
  customer_name text,
  customer_email text,
  customer_phone text,
  conversion_event_id text,
  ip_hash text,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.website_sessions
  add column if not exists last_referrer text,
  add column if not exists utm_id text,
  add column if not exists utm_campaign_id text,
  add column if not exists utm_creative text,
  add column if not exists utm_ad text,
  add column if not exists utm_ad_id text,
  add column if not exists utm_adset text,
  add column if not exists utm_adset_id text,
  add column if not exists utm_placement text,
  add column if not exists fbclid text,
  add column if not exists gclid text,
  add column if not exists msclkid text,
  add column if not exists ttclid text,
  add column if not exists device_category text,
  add column if not exists browser_name text,
  add column if not exists os_name text,
  add column if not exists first_touch jsonb,
  add column if not exists last_touch jsonb,
  add column if not exists last_paid_touch jsonb,
  add column if not exists customer_name text,
  add column if not exists customer_email text,
  add column if not exists customer_phone text,
  add column if not exists conversion_event_id text;

alter table public.website_events
  add column if not exists utm_id text,
  add column if not exists utm_campaign_id text,
  add column if not exists utm_creative text,
  add column if not exists utm_ad text,
  add column if not exists utm_ad_id text,
  add column if not exists utm_adset text,
  add column if not exists utm_adset_id text,
  add column if not exists utm_placement text,
  add column if not exists fbclid text,
  add column if not exists gclid text,
  add column if not exists msclkid text,
  add column if not exists ttclid text,
  add column if not exists device_category text,
  add column if not exists browser_name text,
  add column if not exists os_name text,
  add column if not exists source_type text,
  add column if not exists customer_name text,
  add column if not exists customer_email text,
  add column if not exists customer_phone text,
  add column if not exists conversion_event_id text;

create table if not exists public.website_conversions (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  session_id text,
  visitor_id text,
  brand text not null default 'HP',
  event_name text not null default 'Schedule',
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  page_url text,
  page_path text,
  referrer text,
  event_source_url text,
  source_type text,
  acuity_appointment_id text,
  appointment_type text,
  customer_name text,
  customer_first_name text,
  customer_last_name text,
  customer_email text,
  customer_phone text,
  customer_email_hash text,
  customer_phone_hash text,
  customer_first_name_hash text,
  customer_last_name_hash text,
  meta_event_name text,
  meta_event_id text,
  meta_capi_status text,
  meta_capi_test_mode boolean,
  fbp text,
  fbc text,
  user_agent text,
  device_category text,
  browser_name text,
  os_name text,
  ip_hash text,
  first_touch jsonb,
  last_touch jsonb,
  last_paid_touch jsonb,
  conversion_touch jsonb,
  tracking_completeness jsonb not null default '{}'::jsonb,
  properties jsonb not null default '{}'::jsonb,
  raw_json jsonb not null default '{}'::jsonb,
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists website_events_visitor_idx
  on public.website_events(visitor_id, occurred_at desc);

create index if not exists website_events_paid_touch_idx
  on public.website_events(source_type, occurred_at desc)
  where source_type in ('paid_meta', 'paid_search', 'paid_social', 'paid_other');

create index if not exists website_visitors_last_seen_idx
  on public.website_visitors(last_seen_at desc);

create index if not exists website_visitors_last_paid_touch_idx
  on public.website_visitors using gin(last_paid_touch);

create index if not exists website_conversions_occurred_at_idx
  on public.website_conversions(occurred_at desc);

create index if not exists website_conversions_acuity_idx
  on public.website_conversions(acuity_appointment_id);

create index if not exists website_conversions_visitor_idx
  on public.website_conversions(visitor_id, occurred_at desc);

do $$
begin
  if to_regclass('public.website_visitors') is not null
     and not exists (
       select 1 from pg_trigger
       where tgname = 'website_visitors_set_updated_at'
         and tgrelid = 'public.website_visitors'::regclass
     ) then
    create trigger website_visitors_set_updated_at before update on public.website_visitors
    for each row execute function public.set_updated_at();
  end if;

  if to_regclass('public.website_conversions') is not null
     and not exists (
       select 1 from pg_trigger
       where tgname = 'website_conversions_set_updated_at'
         and tgrelid = 'public.website_conversions'::regclass
     ) then
    create trigger website_conversions_set_updated_at before update on public.website_conversions
    for each row execute function public.set_updated_at();
  end if;
end;
$$;

alter table public.website_sessions enable row level security;
alter table public.website_visitors enable row level security;
alter table public.website_events enable row level security;
alter table public.website_conversions enable row level security;

create or replace function public.anonymize_expired_website_attribution(
  p_cutoff timestamptz default now() - interval '24 months'
)
returns table(
  visitors_anonymized integer,
  sessions_anonymized integer,
  events_anonymized integer,
  conversions_anonymized integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visitors integer := 0;
  v_sessions integer := 0;
  v_events integer := 0;
  v_conversions integer := 0;
begin
  update public.website_visitors
     set customer_name = null,
         customer_email = null,
         customer_phone = null,
         raw_json = raw_json - 'customer' - 'email' - 'phone' - 'firstName' - 'lastName',
         updated_at = now()
   where last_seen_at < p_cutoff
     and (customer_name is not null or customer_email is not null or customer_phone is not null);
  get diagnostics v_visitors = row_count;

  update public.website_sessions
     set customer_name = null,
         customer_email = null,
         customer_phone = null,
         raw_json = raw_json - 'customer' - 'email' - 'phone' - 'firstName' - 'lastName',
         updated_at = now()
   where last_seen_at < p_cutoff
     and (customer_name is not null or customer_email is not null or customer_phone is not null);
  get diagnostics v_sessions = row_count;

  update public.website_events
     set customer_name = null,
         customer_email = null,
         customer_phone = null,
         raw_json = raw_json - 'customer' - 'email' - 'phone' - 'firstName' - 'lastName',
         updated_at = now()
   where occurred_at < p_cutoff
     and (customer_name is not null or customer_email is not null or customer_phone is not null);
  get diagnostics v_events = row_count;

  update public.website_conversions
     set customer_name = null,
         customer_first_name = null,
         customer_last_name = null,
         customer_email = null,
         customer_phone = null,
         raw_json = raw_json - 'customer' - 'email' - 'phone' - 'firstName' - 'lastName',
         anonymized_at = coalesce(anonymized_at, now()),
         updated_at = now()
   where occurred_at < p_cutoff
     and anonymized_at is null;
  get diagnostics v_conversions = row_count;

  return query select v_visitors, v_sessions, v_events, v_conversions;
end;
$$;
