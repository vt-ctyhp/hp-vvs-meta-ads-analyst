-- Add `quarter` time-grain dimension to aggregate_meta_daily_insights.
--
-- Mirrors the existing `month` pattern. The dashboard's new period-pivot
-- table needs Quarter as a frequency option (Day | Week | Month | Quarter)
-- per the UI rebuild PRD §13 update. Existing callers ignore unknown
-- columns; this migration is purely additive at the API level.
--
-- Postgres requires DROP + CREATE when a `returns table(...)` signature
-- changes, so we explicitly drop the old definition before re-creating it
-- with the new `quarter` column. Re-grant EXECUTE to the module roles
-- afterward.

drop function if exists public.aggregate_meta_daily_insights(
  date,
  date,
  text[],
  jsonb,
  text,
  text,
  integer
);

create or replace function public.aggregate_meta_daily_insights(
  p_start date,
  p_end date,
  p_dimensions text[] default '{}'::text[],
  p_filters jsonb default '[]'::jsonb,
  p_sort_field text default 'spend',
  p_sort_direction text default 'desc',
  p_limit integer default 100
)
returns table (
  date text,
  week text,
  month text,
  quarter text,
  brand text,
  campaign_umbrella text,
  campaign text,
  campaign_id text,
  ad_set text,
  ad_set_id text,
  ad text,
  ad_id text,
  creative text,
  creative_id text,
  spend numeric,
  monthly_budget numeric,
  impressions bigint,
  reach bigint,
  clicks bigint,
  leads bigint,
  bookings bigint,
  conversions bigint,
  website_bookings numeric,
  messaging_contacts numeric,
  new_messaging_contacts numeric,
  primary_results numeric,
  secondary_results numeric,
  ctr numeric,
  cpm numeric,
  cpc numeric,
  cpl numeric,
  frequency numeric,
  source_rows bigint
)
language sql
stable
set search_path = public
as $$
  with filtered as (
    select
      i.*,
      coalesce(b.code, 'Unassigned') as brand_code,
      case when 'date' = any(p_dimensions) then i.date_start::text end as date_dim,
      case
        when 'week' = any(p_dimensions)
        then (i.date_start - (((extract(dow from i.date_start)::integer + 6) % 7))::integer)::text
      end as week_dim,
      case when 'month' = any(p_dimensions) then to_char(date_trunc('month', i.date_start), 'YYYY-MM') end as month_dim,
      case when 'quarter' = any(p_dimensions) then to_char(date_trunc('quarter', i.date_start), 'YYYY-"Q"Q') end as quarter_dim,
      case when 'brand' = any(p_dimensions) then coalesce(b.code, 'Unassigned') end as brand_dim,
      case when 'campaign_umbrella' = any(p_dimensions) then coalesce(i.campaign_umbrella, 'Needs review') end as umbrella_dim,
      case when 'campaign' = any(p_dimensions) then coalesce(i.campaign_id, i.campaign_name, 'unknown') end as campaign_key,
      case when 'campaign' = any(p_dimensions) then coalesce(i.campaign_name, i.campaign_id, 'Unknown campaign') end as campaign_display,
      case when 'ad_set' = any(p_dimensions) then coalesce(i.ad_set_id, i.ad_set_name, 'unknown') end as ad_set_key,
      case when 'ad_set' = any(p_dimensions) then coalesce(i.ad_set_name, i.ad_set_id, 'Unknown ad set') end as ad_set_display,
      case when 'ad' = any(p_dimensions) then coalesce(i.ad_id, i.ad_name, 'unknown') end as ad_key,
      case when 'ad' = any(p_dimensions) then coalesce(i.ad_name, i.ad_id, 'Unknown ad') end as ad_display,
      case when 'creative' = any(p_dimensions) then coalesce(i.creative_id, 'unknown') end as creative_key,
      case when 'creative' = any(p_dimensions) then coalesce(i.creative_id, 'Unknown creative') end as creative_display,
      date_trunc('month', i.date_start)::date as month_start,
      coalesce(s.daily_budget, 0) as daily_budget,
      extract(day from (date_trunc('month', i.date_start)::date + interval '1 month - 1 day'))::numeric as days_in_month,
      coalesce((
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(i.actions) a
        where a ->> 'action_type' in ('offsite_conversion.fb_pixel_custom')
      ), 0) as website_bookings_raw,
      coalesce((
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(i.actions) a
        where a ->> 'action_type' in ('onsite_conversion.total_messaging_connection')
      ), 0) as messaging_contacts_raw,
      coalesce((
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(i.actions) a
        where a ->> 'action_type' in ('onsite_conversion.messaging_first_reply')
      ), 0) as new_messaging_contacts_raw
    from public.meta_daily_insights i
    left join public.brands b on b.id = i.brand_id
    left join public.meta_ad_sets s
      on s.meta_account_id = i.meta_account_id
     and s.ad_set_id = i.ad_set_id
    where i.date_start >= p_start
      and i.date_start <= p_end
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_filters, '[]'::jsonb)) f
        where coalesce(f ->> 'value', '') <> ''
          and not (
            case coalesce(f ->> 'operator', 'contains')
              when 'equals' then
                lower(
                  case coalesce(f ->> 'field', 'search')
                    when 'brand' then coalesce(b.code, 'Unassigned')
                    when 'campaign_umbrella' then coalesce(i.campaign_umbrella, '')
                    when 'campaign' then concat_ws(' ', i.campaign_name, i.campaign_id)
                    when 'ad_set' then concat_ws(' ', i.ad_set_name, i.ad_set_id)
                    when 'ad' then concat_ws(' ', i.ad_name, i.ad_id)
                    when 'creative' then coalesce(i.creative_id, '')
                    else concat_ws(' ', coalesce(b.code, 'Unassigned'), i.campaign_umbrella, i.campaign_name, i.ad_set_name, i.ad_name, i.creative_id)
                  end
                ) = lower(coalesce(f ->> 'value', ''))
              else
                position(
                  lower(coalesce(f ->> 'value', '')) in lower(
                    case coalesce(f ->> 'field', 'search')
                      when 'brand' then coalesce(b.code, 'Unassigned')
                      when 'campaign_umbrella' then coalesce(i.campaign_umbrella, '')
                      when 'campaign' then concat_ws(' ', i.campaign_name, i.campaign_id)
                      when 'ad_set' then concat_ws(' ', i.ad_set_name, i.ad_set_id)
                      when 'ad' then concat_ws(' ', i.ad_name, i.ad_id)
                      when 'creative' then coalesce(i.creative_id, '')
                      else concat_ws(' ', coalesce(b.code, 'Unassigned'), i.campaign_umbrella, i.campaign_name, i.ad_set_name, i.ad_name, i.creative_id)
                    end
                  )
                ) > 0
            end
          )
      )
  ),
  ranked as (
    select
      filtered.*,
      row_number() over (
        partition by
          date_dim,
          week_dim,
          month_dim,
          quarter_dim,
          brand_dim,
          umbrella_dim,
          campaign_key,
          ad_set_key,
          ad_key,
          creative_key,
          meta_account_id,
          ad_set_id,
          month_start
        order by date_start asc
      ) as budget_rank
    from filtered
  ),
  grouped as (
    select
      date_dim,
      week_dim,
      month_dim,
      quarter_dim,
      brand_dim,
      umbrella_dim,
      campaign_key,
      max(campaign_display) as campaign_display,
      ad_set_key,
      max(ad_set_display) as ad_set_display,
      ad_key,
      max(ad_display) as ad_display,
      creative_key,
      max(creative_display) as creative_display,
      round(sum(spend), 2) as spend,
      round(sum(case when budget_rank = 1 and daily_budget > 0 then daily_budget * days_in_month else 0 end), 2) as monthly_budget,
      sum(impressions)::bigint as impressions,
      sum(reach)::bigint as reach,
      sum(clicks)::bigint as clicks,
      sum(leads)::bigint as leads,
      sum(bookings)::bigint as bookings,
      sum(conversions)::bigint as conversions,
      round(sum(website_bookings_raw), 2) as website_bookings,
      round(sum(messaging_contacts_raw), 2) as messaging_contacts,
      round(sum(new_messaging_contacts_raw), 2) as new_messaging_contacts,
      round(sum(
        case
          when coalesce(campaign_umbrella, 'Needs review') = 'Book Appts US'
          then website_bookings_raw
          else messaging_contacts_raw
        end
      ), 2) as primary_results,
      round(sum(
        case
          when coalesce(campaign_umbrella, 'Needs review') in ('Facebook US Product', 'Facebook VN Product')
          then new_messaging_contacts_raw
          else 0
        end
      ), 2) as secondary_results,
      count(*)::bigint as source_rows
    from ranked
    group by
      date_dim,
      week_dim,
      month_dim,
      quarter_dim,
      brand_dim,
      umbrella_dim,
      campaign_key,
      ad_set_key,
      ad_key,
      creative_key
  ),
  shaped as (
    select
      date_dim as date,
      week_dim as week,
      month_dim as month,
      quarter_dim as quarter,
      brand_dim as brand,
      umbrella_dim as campaign_umbrella,
      campaign_display as campaign,
      campaign_key as campaign_id,
      ad_set_display as ad_set,
      ad_set_key as ad_set_id,
      ad_display as ad,
      ad_key as ad_id,
      creative_display as creative,
      creative_key as creative_id,
      spend,
      monthly_budget,
      impressions,
      reach,
      clicks,
      leads,
      bookings,
      conversions,
      website_bookings,
      messaging_contacts,
      new_messaging_contacts,
      primary_results,
      secondary_results,
      round(case when impressions > 0 then (clicks::numeric / impressions::numeric) * 100 else 0 end, 2) as ctr,
      round(case when impressions > 0 then (spend / impressions::numeric) * 1000 else 0 end, 2) as cpm,
      round(case when clicks > 0 then spend / clicks::numeric else 0 end, 2) as cpc,
      round(case when leads > 0 then spend / leads::numeric else null end, 2) as cpl,
      round(case when reach > 0 then impressions::numeric / reach::numeric else 0 end, 2) as frequency,
      source_rows
    from grouped
  )
  select *
  from shaped
  order by
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'date' then date end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'date' then date end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'week' then week end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'week' then week end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'month' then month end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'month' then month end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'quarter' then quarter end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'quarter' then quarter end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'brand' then brand end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'brand' then brand end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'campaign_umbrella' then campaign_umbrella end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'campaign_umbrella' then campaign_umbrella end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'campaign' then campaign end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'campaign' then campaign end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'ad_set' then ad_set end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'ad_set' then ad_set end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'ad' then ad end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'ad' then ad end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'creative' then creative end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'creative' then creative end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'spend' then spend end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'spend' then spend end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'monthly_budget' then monthly_budget end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'monthly_budget' then monthly_budget end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'impressions' then impressions end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'impressions' then impressions end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'clicks' then clicks end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'clicks' then clicks end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'leads' then leads end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'leads' then leads end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'bookings' then bookings end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'bookings' then bookings end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'conversions' then conversions end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'conversions' then conversions end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'website_bookings' then website_bookings end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'website_bookings' then website_bookings end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'messaging_contacts' then messaging_contacts end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'messaging_contacts' then messaging_contacts end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'new_messaging_contacts' then new_messaging_contacts end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'new_messaging_contacts' then new_messaging_contacts end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'primary_results' then primary_results end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'primary_results' then primary_results end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'secondary_results' then secondary_results end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'secondary_results' then secondary_results end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'ctr' then ctr end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'ctr' then ctr end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'cpm' then cpm end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'cpm' then cpm end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'cpc' then cpc end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'cpc' then cpc end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'cpl' then cpl end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'cpl' then cpl end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'frequency' then frequency end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'frequency' then frequency end desc nulls last,
    date asc nulls last,
    week asc nulls last,
    month asc nulls last,
    quarter asc nulls last,
    campaign_umbrella asc nulls last,
    campaign asc nulls last
  limit least(greatest(coalesce(p_limit, 100), 1), 10000);
$$;

-- Re-grant EXECUTE to the Ads Analyst module roles. DROP FUNCTION removed
-- the prior grants; without these, the limited-mode runtime would lose
-- access to the dashboard RPC.
grant execute on function public.aggregate_meta_daily_insights(
  date,
  date,
  text[],
  jsonb,
  text,
  text,
  integer
) to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest;
