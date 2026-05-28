-- Add current-state budget fields to aggregate_meta_daily_insights for Ask AI.
--
-- Daily/lifetime/remaining budgets come from current Meta campaign/ad-set
-- metadata. monthly_budget remains an estimate from daily budget x days in
-- month and is kept separate so Ask AI does not confuse budget with spend.

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
  daily_budget numeric,
  lifetime_budget numeric,
  budget_remaining numeric,
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
  with runtime_claims as (
    select
      nullif(current_setting('request.jwt.claim.ads_analyst_environment', true), '') as direct_ads_environment,
      nullif(current_setting('request.jwt.claim.app_environment', true), '') as direct_app_environment,
      nullif(current_setting('request.jwt.claims', true), '')::jsonb as claims
  ),
  runtime_input as (
    select lower(coalesce(
      direct_ads_environment,
      direct_app_environment,
      claims ->> 'ads_analyst_environment',
      claims ->> 'app_environment',
      'production'
    )) as environment
    from runtime_claims
  ),
  runtime as (
    select case
      when environment in ('production', 'staging') then environment
      else 'production'
    end as environment
    from runtime_input
  ),
  enriched as (
    select
      i.*,
      coalesce(b.code, 'Unassigned') as brand_code,
      case
        when coalesce(c.daily_budget, 0) > 0 then coalesce(c.daily_budget, 0)
        else coalesce(s.daily_budget, 0)
      end as configured_daily_budget,
      case
        when coalesce(c.lifetime_budget, 0) > 0 then coalesce(c.lifetime_budget, 0)
        else coalesce(s.lifetime_budget, 0)
      end as configured_lifetime_budget,
      case
        when coalesce(c.budget_remaining, 0) > 0 then coalesce(c.budget_remaining, 0)
        else coalesce(s.budget_remaining, 0)
      end as configured_budget_remaining,
      case
        when coalesce(c.daily_budget, 0) > 0 then concat('campaign:', coalesce(c.campaign_id, i.campaign_id, 'unknown'))
        when coalesce(s.daily_budget, 0) > 0 then concat('ad_set:', coalesce(s.ad_set_id, i.ad_set_id, 'unknown'))
        else null
      end as daily_budget_entity_key,
      case
        when coalesce(c.lifetime_budget, 0) > 0 then concat('campaign:', coalesce(c.campaign_id, i.campaign_id, 'unknown'))
        when coalesce(s.lifetime_budget, 0) > 0 then concat('ad_set:', coalesce(s.ad_set_id, i.ad_set_id, 'unknown'))
        else null
      end as lifetime_budget_entity_key,
      case
        when coalesce(c.budget_remaining, 0) > 0 then concat('campaign:', coalesce(c.campaign_id, i.campaign_id, 'unknown'))
        when coalesce(s.budget_remaining, 0) > 0 then concat('ad_set:', coalesce(s.ad_set_id, i.ad_set_id, 'unknown'))
        else null
      end as budget_remaining_entity_key,
      case
        when upper(coalesce(a.effective_status, a.status, s.effective_status, s.status, c.effective_status, c.status, '')) = 'ACTIVE'
          then 'live'
        when upper(coalesce(a.effective_status, a.status, s.effective_status, s.status, c.effective_status, c.status, '')) = 'PAUSED'
          then 'paused'
        else 'off'
      end as delivery_status
    from public.meta_daily_insights i
    cross join runtime r
    left join public.brands b
      on b.environment = r.environment
     and b.id = i.brand_id
    left join public.meta_campaigns c
      on c.environment = r.environment
     and c.meta_account_id = i.meta_account_id
     and c.campaign_id = i.campaign_id
    left join public.meta_ad_sets s
      on s.environment = r.environment
     and s.meta_account_id = i.meta_account_id
     and s.ad_set_id = i.ad_set_id
    left join public.meta_ads a
      on a.environment = r.environment
     and a.meta_account_id = i.meta_account_id
     and a.ad_id = i.ad_id
    where i.environment = r.environment
      and i.date_start >= p_start
      and i.date_start <= p_end
  ),
  filtered as (
    select
      e.*,
      case when 'date' = any(p_dimensions) then e.date_start::text end as date_dim,
      case
        when 'week' = any(p_dimensions)
        then (e.date_start - (((extract(dow from e.date_start)::integer + 6) % 7))::integer)::text
      end as week_dim,
      case when 'month' = any(p_dimensions) then to_char(date_trunc('month', e.date_start), 'YYYY-MM') end as month_dim,
      case when 'quarter' = any(p_dimensions) then to_char(date_trunc('quarter', e.date_start), 'YYYY-"Q"Q') end as quarter_dim,
      case when 'brand' = any(p_dimensions) then e.brand_code end as brand_dim,
      case when 'campaign_umbrella' = any(p_dimensions) then coalesce(e.campaign_umbrella, 'Needs review') end as umbrella_dim,
      case when 'campaign' = any(p_dimensions) then coalesce(e.campaign_id, e.campaign_name, 'unknown') end as campaign_key,
      case when 'campaign' = any(p_dimensions) then coalesce(e.campaign_name, e.campaign_id, 'Unknown campaign') end as campaign_display,
      case when 'ad_set' = any(p_dimensions) then coalesce(e.ad_set_id, e.ad_set_name, 'unknown') end as ad_set_key,
      case when 'ad_set' = any(p_dimensions) then coalesce(e.ad_set_name, e.ad_set_id, 'Unknown ad set') end as ad_set_display,
      case when 'ad' = any(p_dimensions) then coalesce(e.ad_id, e.ad_name, 'unknown') end as ad_key,
      case when 'ad' = any(p_dimensions) then coalesce(e.ad_name, e.ad_id, 'Unknown ad') end as ad_display,
      case when 'creative' = any(p_dimensions) then coalesce(e.creative_id, 'unknown') end as creative_key,
      case when 'creative' = any(p_dimensions) then coalesce(e.creative_id, 'Unknown creative') end as creative_display,
      coalesce(e.configured_daily_budget, 0) as daily_budget,
      coalesce(e.configured_lifetime_budget, 0) as lifetime_budget,
      coalesce(e.configured_budget_remaining, 0) as budget_remaining,
      extract(day from (date_trunc('month', p_end)::date + interval '1 month - 1 day'))::numeric as days_in_month,
      coalesce((
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(e.actions) a
        where a ->> 'action_type' = 'offsite_conversion.fb_pixel_custom'
      ), (
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(e.actions) a
        where a ->> 'action_type' = 'schedule'
      ), (
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(e.actions) a
        where a ->> 'action_type' = 'submit_application'
      ), (
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(e.actions) a
        where a ->> 'action_type' = 'booking'
      ), (
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(e.actions) a
        where a ->> 'action_type' = 'appointment'
      ), 0) as website_bookings_raw,
      coalesce((
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(e.actions) a
        where a ->> 'action_type' = 'onsite_conversion.messaging_conversation_started_7d'
      ), (
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(e.actions) a
        where a ->> 'action_type' = 'onsite_conversion.total_messaging_connection'
      ), (
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(e.actions) a
        where a ->> 'action_type' = 'onsite_conversion.messaging_first_reply'
      ), 0) as messaging_contacts_raw,
      coalesce((
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(e.actions) a
        where a ->> 'action_type' = 'onsite_conversion.messaging_first_reply'
      ), 0) as new_messaging_contacts_raw,
      coalesce((
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(e.actions) a
        where a ->> 'action_type' = 'lead'
      ), (
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(e.actions) a
        where a ->> 'action_type' = 'onsite_conversion.lead'
      ), (
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(e.actions) a
        where a ->> 'action_type' = 'onsite_conversion.lead_grouped'
      ), (
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(e.actions) a
        where a ->> 'action_type' = 'onsite_web_lead'
      ), (
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(e.actions) a
        where a ->> 'action_type' = 'offsite_conversion.fb_pixel_lead'
      ), (
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(e.actions) a
        where a ->> 'action_type' = 'offsite_complete_registration_add_meta_leads'
      ), 0) as leads_raw,
      coalesce((
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(e.actions) a
        where a ->> 'action_type' = 'omni_purchase'
      ), (
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(e.actions) a
        where a ->> 'action_type' = 'purchase'
      ), (
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(e.actions) a
        where a ->> 'action_type' = 'onsite_conversion.purchase'
      ), (
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(e.actions) a
        where a ->> 'action_type' = 'onsite_app_purchase'
      ), (
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(e.actions) a
        where a ->> 'action_type' = 'onsite_web_purchase'
      ), (
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(e.actions) a
        where a ->> 'action_type' = 'onsite_web_app_purchase'
      ), (
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(e.actions) a
        where a ->> 'action_type' = 'offsite_conversion.fb_pixel_purchase'
      ), 0) + coalesce((
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(e.actions) a
        where a ->> 'action_type' = 'complete_registration'
      ), (
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(e.actions) a
        where a ->> 'action_type' = 'offsite_conversion.fb_pixel_complete_registration'
      ), (
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(e.actions) a
        where a ->> 'action_type' = 'offsite_complete_registration_add_meta_leads'
      ), 0) as conversions_raw
    from enriched e
    where not exists (
      select 1
      from jsonb_array_elements(coalesce(p_filters, '[]'::jsonb)) f
      where coalesce(f ->> 'value', '') <> ''
        and not (
          case coalesce(f ->> 'operator', 'contains')
            when 'equals' then
              lower(
                case coalesce(f ->> 'field', 'search')
                  when 'brand' then e.brand_code
                  when 'campaign_umbrella' then coalesce(e.campaign_umbrella, '')
                  when 'campaign' then concat_ws(' ', e.campaign_name, e.campaign_id)
                  when 'ad_set' then concat_ws(' ', e.ad_set_name, e.ad_set_id)
                  when 'ad' then concat_ws(' ', e.ad_name, e.ad_id)
                  when 'creative' then coalesce(e.creative_id, '')
                  when 'delivery_status' then e.delivery_status
                  else concat_ws(' ', e.brand_code, e.campaign_umbrella, e.campaign_name, e.ad_set_name, e.ad_name, e.creative_id)
                end
              ) = lower(coalesce(f ->> 'value', ''))
            else
              position(
                lower(coalesce(f ->> 'value', '')) in lower(
                  case coalesce(f ->> 'field', 'search')
                    when 'brand' then e.brand_code
                    when 'campaign_umbrella' then coalesce(e.campaign_umbrella, '')
                    when 'campaign' then concat_ws(' ', e.campaign_name, e.campaign_id)
                    when 'ad_set' then concat_ws(' ', e.ad_set_name, e.ad_set_id)
                    when 'ad' then concat_ws(' ', e.ad_name, e.ad_id)
                    when 'creative' then coalesce(e.creative_id, '')
                    when 'delivery_status' then e.delivery_status
                    else concat_ws(' ', e.brand_code, e.campaign_umbrella, e.campaign_name, e.ad_set_name, e.ad_name, e.creative_id)
                  end
                )
              ) > 0
          end
        )
    )
  ),
  ranked as (
    select
      f.*,
      row_number() over (
        partition by
          f.date_dim,
          f.week_dim,
          f.month_dim,
          f.quarter_dim,
          f.brand_dim,
          f.umbrella_dim,
          f.campaign_key,
          f.ad_set_key,
          f.ad_key,
          f.creative_key,
          f.meta_account_id,
          f.daily_budget_entity_key
        order by
          case when f.delivery_status = 'live' then 0 else 1 end,
          f.date_start asc
      ) as monthly_budget_rank,
      row_number() over (
        partition by
          f.date_dim,
          f.week_dim,
          f.month_dim,
          f.quarter_dim,
          f.brand_dim,
          f.umbrella_dim,
          f.campaign_key,
          f.ad_set_key,
          f.ad_key,
          f.creative_key,
          f.meta_account_id,
          f.daily_budget_entity_key
        order by f.date_start desc
      ) as daily_budget_rank,
      row_number() over (
        partition by
          f.date_dim,
          f.week_dim,
          f.month_dim,
          f.quarter_dim,
          f.brand_dim,
          f.umbrella_dim,
          f.campaign_key,
          f.ad_set_key,
          f.ad_key,
          f.creative_key,
          f.meta_account_id,
          f.lifetime_budget_entity_key
        order by f.date_start desc
      ) as lifetime_budget_rank,
      row_number() over (
        partition by
          f.date_dim,
          f.week_dim,
          f.month_dim,
          f.quarter_dim,
          f.brand_dim,
          f.umbrella_dim,
          f.campaign_key,
          f.ad_set_key,
          f.ad_key,
          f.creative_key,
          f.meta_account_id,
          f.budget_remaining_entity_key
        order by f.date_start desc
      ) as budget_remaining_rank
    from filtered as f
  ),
  grouped as (
    select
      r.date_dim,
      r.week_dim,
      r.month_dim,
      r.quarter_dim,
      r.brand_dim,
      r.umbrella_dim,
      r.campaign_key,
      max(r.campaign_display) as campaign_display,
      r.ad_set_key,
      max(r.ad_set_display) as ad_set_display,
      r.ad_key,
      max(r.ad_display) as ad_display,
      r.creative_key,
      max(r.creative_display) as creative_display,
      round(sum(r.spend), 2) as spend,
      round(sum(case when r.monthly_budget_rank = 1 and r.delivery_status = 'live' and r.daily_budget > 0 then r.daily_budget * r.days_in_month else 0 end), 2) as monthly_budget,
      round(sum(case when r.daily_budget_rank = 1 and r.daily_budget > 0 then r.daily_budget else 0 end), 2) as daily_budget,
      round(sum(case when r.lifetime_budget_rank = 1 and r.lifetime_budget > 0 then r.lifetime_budget else 0 end), 2) as lifetime_budget,
      round(sum(case when r.budget_remaining_rank = 1 and r.budget_remaining > 0 then r.budget_remaining else 0 end), 2) as budget_remaining,
      sum(r.impressions)::bigint as impressions,
      sum(r.reach)::bigint as reach,
      sum(r.clicks)::bigint as clicks,
      round(sum(r.leads_raw), 0)::bigint as leads,
      round(sum(r.website_bookings_raw), 0)::bigint as bookings,
      round(sum(r.conversions_raw), 0)::bigint as conversions,
      round(sum(r.website_bookings_raw), 2) as website_bookings,
      round(sum(r.messaging_contacts_raw), 2) as messaging_contacts,
      round(sum(r.new_messaging_contacts_raw), 2) as new_messaging_contacts,
      round(sum(
        case
          when coalesce(r.campaign_umbrella, 'Needs review') = 'Book Appts US'
          then r.website_bookings_raw
          else r.messaging_contacts_raw
        end
      ), 2) as primary_results,
      round(sum(
        case
          when coalesce(r.campaign_umbrella, 'Needs review') in ('Facebook US Product', 'Facebook VN Product')
          then r.new_messaging_contacts_raw
          else 0
        end
      ), 2) as secondary_results,
      count(*)::bigint as source_rows
    from ranked as r
    group by
      r.date_dim,
      r.week_dim,
      r.month_dim,
      r.quarter_dim,
      r.brand_dim,
      r.umbrella_dim,
      r.campaign_key,
      r.ad_set_key,
      r.ad_key,
      r.creative_key
  ),
  shaped as (
    select
      g.date_dim as date,
      g.week_dim as week,
      g.month_dim as month,
      g.quarter_dim as quarter,
      g.brand_dim as brand,
      g.umbrella_dim as campaign_umbrella,
      g.campaign_display as campaign,
      g.campaign_key as campaign_id,
      g.ad_set_display as ad_set,
      g.ad_set_key as ad_set_id,
      g.ad_display as ad,
      g.ad_key as ad_id,
      g.creative_display as creative,
      g.creative_key as creative_id,
      g.spend,
      g.monthly_budget,
      g.daily_budget,
      g.lifetime_budget,
      g.budget_remaining,
      g.impressions,
      g.reach,
      g.clicks,
      g.leads,
      g.bookings,
      g.conversions,
      g.website_bookings,
      g.messaging_contacts,
      g.new_messaging_contacts,
      g.primary_results,
      g.secondary_results,
      round(case when g.impressions > 0 then (g.clicks::numeric / g.impressions::numeric) * 100 else 0 end, 2) as ctr,
      round(case when g.impressions > 0 then (g.spend / g.impressions::numeric) * 1000 else 0 end, 2) as cpm,
      round(case when g.clicks > 0 then g.spend / g.clicks::numeric else 0 end, 2) as cpc,
      round(case when g.leads > 0 then g.spend / g.leads::numeric else null end, 2) as cpl,
      round(case when g.reach > 0 then g.impressions::numeric / g.reach::numeric else 0 end, 2) as frequency,
      g.source_rows
    from grouped as g
  )
  select s.*
  from shaped as s
  order by
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'date' then s.date end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'date' then s.date end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'week' then s.week end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'week' then s.week end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'month' then s.month end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'month' then s.month end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'quarter' then s.quarter end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'quarter' then s.quarter end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'brand' then s.brand end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'brand' then s.brand end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'campaign_umbrella' then s.campaign_umbrella end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'campaign_umbrella' then s.campaign_umbrella end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'campaign' then s.campaign end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'campaign' then s.campaign end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'ad_set' then s.ad_set end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'ad_set' then s.ad_set end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'ad' then s.ad end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'ad' then s.ad end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'creative' then s.creative end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'creative' then s.creative end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'spend' then s.spend end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'spend' then s.spend end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'monthly_budget' then s.monthly_budget end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'monthly_budget' then s.monthly_budget end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'daily_budget' then s.daily_budget end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'daily_budget' then s.daily_budget end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'lifetime_budget' then s.lifetime_budget end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'lifetime_budget' then s.lifetime_budget end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'budget_remaining' then s.budget_remaining end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'budget_remaining' then s.budget_remaining end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'impressions' then s.impressions end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'impressions' then s.impressions end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'clicks' then s.clicks end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'clicks' then s.clicks end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'leads' then s.leads end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'leads' then s.leads end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'bookings' then s.bookings end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'bookings' then s.bookings end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'conversions' then s.conversions end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'conversions' then s.conversions end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'website_bookings' then s.website_bookings end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'website_bookings' then s.website_bookings end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'messaging_contacts' then s.messaging_contacts end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'messaging_contacts' then s.messaging_contacts end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'new_messaging_contacts' then s.new_messaging_contacts end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'new_messaging_contacts' then s.new_messaging_contacts end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'primary_results' then s.primary_results end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'primary_results' then s.primary_results end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'secondary_results' then s.secondary_results end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'secondary_results' then s.secondary_results end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'ctr' then s.ctr end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'ctr' then s.ctr end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'cpm' then s.cpm end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'cpm' then s.cpm end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'cpc' then s.cpc end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'cpc' then s.cpc end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'cpl' then s.cpl end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'cpl' then s.cpl end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'frequency' then s.frequency end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'frequency' then s.frequency end desc nulls last,
    s.date asc nulls last,
    s.week asc nulls last,
    s.month asc nulls last,
    s.quarter asc nulls last,
    s.campaign_umbrella asc nulls last,
    s.campaign asc nulls last
  limit least(greatest(coalesce(p_limit, 100), 1), 10000);
$$;

grant execute on function public.aggregate_meta_daily_insights(
  date,
  date,
  text[],
  jsonb,
  text,
  text,
  integer
) to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest, authenticated, service_role;
