alter table public.website_events
  add column if not exists geo_country text,
  add column if not exists geo_region text,
  add column if not exists geo_city text,
  add column if not exists geo_timezone text;

alter table public.website_sessions
  add column if not exists geo_country text,
  add column if not exists geo_region text,
  add column if not exists geo_city text,
  add column if not exists geo_timezone text;

alter table public.website_visitors
  add column if not exists geo_country text,
  add column if not exists geo_region text,
  add column if not exists geo_city text,
  add column if not exists geo_timezone text;

alter table public.website_conversions
  add column if not exists geo_country text,
  add column if not exists geo_region text,
  add column if not exists geo_city text,
  add column if not exists geo_timezone text;

create index if not exists website_events_geo_location_idx
  on public.website_events(geo_country, geo_region, geo_city, occurred_at desc);

comment on column public.website_events.geo_city is
  'Approximate city derived server-side from hosting provider IP geolocation headers. Raw IP is not stored.';
comment on column public.website_sessions.geo_city is
  'Approximate city derived from linked browser website events.';
comment on column public.website_visitors.geo_city is
  'Approximate city derived from linked browser website events.';
comment on column public.website_conversions.geo_city is
  'Approximate city copied from linked browser visitor/session attribution when available.';

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
         geo_country = null,
         geo_region = null,
         geo_city = null,
         geo_timezone = null,
         raw_json = raw_json - 'customer' - 'email' - 'phone' - 'firstName' - 'lastName',
         updated_at = now()
   where last_seen_at < p_cutoff
     and (
       customer_name is not null or customer_email is not null or customer_phone is not null
       or geo_country is not null or geo_region is not null or geo_city is not null or geo_timezone is not null
     );
  get diagnostics v_visitors = row_count;

  update public.website_sessions
     set customer_name = null,
         customer_email = null,
         customer_phone = null,
         geo_country = null,
         geo_region = null,
         geo_city = null,
         geo_timezone = null,
         raw_json = raw_json - 'customer' - 'email' - 'phone' - 'firstName' - 'lastName',
         updated_at = now()
   where last_seen_at < p_cutoff
     and (
       customer_name is not null or customer_email is not null or customer_phone is not null
       or geo_country is not null or geo_region is not null or geo_city is not null or geo_timezone is not null
     );
  get diagnostics v_sessions = row_count;

  update public.website_events
     set customer_name = null,
         customer_email = null,
         customer_phone = null,
         geo_country = null,
         geo_region = null,
         geo_city = null,
         geo_timezone = null,
         raw_json = raw_json - 'customer' - 'email' - 'phone' - 'firstName' - 'lastName',
         updated_at = now()
   where occurred_at < p_cutoff
     and (
       customer_name is not null or customer_email is not null or customer_phone is not null
       or geo_country is not null or geo_region is not null or geo_city is not null or geo_timezone is not null
     );
  get diagnostics v_events = row_count;

  update public.website_conversions
     set customer_name = null,
         customer_first_name = null,
         customer_last_name = null,
         customer_email = null,
         customer_phone = null,
         geo_country = null,
         geo_region = null,
         geo_city = null,
         geo_timezone = null,
         raw_json = raw_json - 'customer' - 'email' - 'phone' - 'firstName' - 'lastName',
         anonymized_at = coalesce(anonymized_at, now()),
         updated_at = now()
   where occurred_at < p_cutoff
     and anonymized_at is null;
  get diagnostics v_conversions = row_count;

  return query select v_visitors, v_sessions, v_events, v_conversions;
end;
$$;
