create table if not exists public.ai_analysis_workbench_runs (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  output_mode text not null default 'answer_visuals' check (
    output_mode in ('answer_only', 'answer_visuals', 'full_dashboard')
  ),
  status text not null default 'created' check (
    status in ('created', 'running', 'completed', 'failed')
  ),
  title text not null,
  intent jsonb not null default '{}'::jsonb,
  query_plan jsonb not null default '{}'::jsonb,
  facts jsonb not null default '{}'::jsonb,
  visual_cards jsonb not null default '[]'::jsonb,
  source_notes jsonb not null default '[]'::jsonb,
  validation jsonb not null default '{}'::jsonb,
  lineage jsonb not null default '{}'::jsonb,
  answer jsonb not null default '{}'::jsonb,
  dashboard_packet jsonb,
  environment text not null default 'prod',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_analysis_workbench_runs_updated_idx
  on public.ai_analysis_workbench_runs(updated_at desc);

create index if not exists ai_analysis_workbench_runs_output_mode_idx
  on public.ai_analysis_workbench_runs(output_mode, updated_at desc);

drop trigger if exists ai_analysis_workbench_runs_set_updated_at
  on public.ai_analysis_workbench_runs;

create trigger ai_analysis_workbench_runs_set_updated_at
before update on public.ai_analysis_workbench_runs
for each row execute function public.set_updated_at();

alter table public.ai_analysis_workbench_runs enable row level security;

grant select, insert, update on public.ai_analysis_workbench_runs to ads_analyst_web;
grant select, insert, update on public.ai_analysis_workbench_runs to ads_analyst_worker;

drop policy if exists ads_analyst_select on public.ai_analysis_workbench_runs;
create policy ads_analyst_select
on public.ai_analysis_workbench_runs
for select to ads_analyst_web, ads_analyst_worker
using (analytics.ads_analyst_environment_matches(environment));

drop policy if exists ads_analyst_web_insert on public.ai_analysis_workbench_runs;
create policy ads_analyst_web_insert
on public.ai_analysis_workbench_runs
for insert to ads_analyst_web
with check (analytics.ads_analyst_environment_matches(environment));

drop policy if exists ads_analyst_web_update on public.ai_analysis_workbench_runs;
create policy ads_analyst_web_update
on public.ai_analysis_workbench_runs
for update to ads_analyst_web
using (analytics.ads_analyst_environment_matches(environment))
with check (analytics.ads_analyst_environment_matches(environment));

drop policy if exists ads_analyst_worker_insert on public.ai_analysis_workbench_runs;
create policy ads_analyst_worker_insert
on public.ai_analysis_workbench_runs
for insert to ads_analyst_worker
with check (analytics.ads_analyst_environment_matches(environment));

drop policy if exists ads_analyst_worker_update on public.ai_analysis_workbench_runs;
create policy ads_analyst_worker_update
on public.ai_analysis_workbench_runs
for update to ads_analyst_worker
using (analytics.ads_analyst_environment_matches(environment))
with check (analytics.ads_analyst_environment_matches(environment));
