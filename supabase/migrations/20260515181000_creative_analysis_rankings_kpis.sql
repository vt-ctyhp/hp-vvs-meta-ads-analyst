alter table public.meta_daily_insights
  add column if not exists objective text,
  add column if not exists optimization_goal text,
  add column if not exists cost_per_action_type jsonb not null default '[]'::jsonb,
  add column if not exists quality_ranking text,
  add column if not exists engagement_rate_ranking text,
  add column if not exists conversion_rate_ranking text,
  add column if not exists kpi_label text,
  add column if not exists kpi_action_type text,
  add column if not exists kpi_value numeric not null default 0,
  add column if not exists cost_per_kpi numeric;

create index if not exists meta_daily_insights_rankings_date_idx
  on public.meta_daily_insights(date_start desc, quality_ranking, engagement_rate_ranking, conversion_rate_ranking);

create index if not exists meta_daily_insights_kpi_date_idx
  on public.meta_daily_insights(date_start desc, kpi_label, kpi_action_type);
