-- Speed up Optimize Creatives' Supabase-first page load.
--
-- The page filters to current delivery status before reading daily insight
-- rows. These composite indexes keep the filtered insight lookup from falling
-- back to broad scans when the selected status maps to a bounded ad-id set.

create index if not exists meta_daily_insights_ad_date_idx
  on public.meta_daily_insights(ad_id, date_start desc);

create index if not exists meta_daily_insights_brand_umbrella_date_idx
  on public.meta_daily_insights(brand_id, campaign_umbrella, date_start desc);

create index if not exists meta_ads_effective_status_ad_idx
  on public.meta_ads(effective_status, status, ad_id);
