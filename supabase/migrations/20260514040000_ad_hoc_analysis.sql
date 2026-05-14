create table if not exists public.ai_analysis_dashboards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  prompt text not null,
  mode text not null default 'fast' check (mode in ('fast', 'deep')),
  spec jsonb not null,
  model_plan text not null,
  model_analysis text,
  source_transparency jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid references public.ai_analysis_dashboards(id) on delete cascade,
  prompt text not null,
  mode text not null default 'fast' check (mode in ('fast', 'deep')),
  model_plan text not null,
  model_analysis text,
  token_estimate jsonb not null default '{}'::jsonb,
  source_transparency jsonb not null default '{}'::jsonb,
  result_preview jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_analysis_dashboards_created_idx
  on public.ai_analysis_dashboards(created_at desc);

create index if not exists ai_analysis_runs_dashboard_created_idx
  on public.ai_analysis_runs(dashboard_id, created_at desc);

drop trigger if exists ai_analysis_dashboards_set_updated_at on public.ai_analysis_dashboards;
create trigger ai_analysis_dashboards_set_updated_at before update on public.ai_analysis_dashboards
for each row execute function public.set_updated_at();

alter table public.ai_analysis_dashboards enable row level security;
alter table public.ai_analysis_runs enable row level security;
