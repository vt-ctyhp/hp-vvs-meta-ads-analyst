-- Meta inbox optional QA scorecards for manager coaching.
-- Internal-only: scorecards are never sent to customers or Meta.

create table if not exists public.meta_inbox_qa_scorecards (
  id uuid primary key default gen_random_uuid(),
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  conversation_id uuid not null references public.meta_inbox_conversations(id) on delete cascade,
  send_attempt_id uuid references public.meta_inbox_send_attempts(id) on delete set null,
  reviewed_user_id uuid,
  reviewed_by uuid not null,
  tone_score integer not null check (tone_score between 1 and 5),
  completeness_score integer not null check (completeness_score between 1 and 5),
  accuracy_score integer not null check (accuracy_score between 1 and 5),
  next_step_score integer not null check (next_step_score between 1 and 5),
  speed_score integer not null check (speed_score between 1 and 5),
  policy_compliance_score integer not null check (policy_compliance_score between 1 and 5),
  overall_score numeric(4, 1) not null check (overall_score between 1 and 5),
  coaching_note text,
  metadata jsonb not null default '{}'::jsonb,
  deleted_by uuid,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meta_inbox_qa_scorecards_conversation_idx
  on public.meta_inbox_qa_scorecards (environment, conversation_id, created_at desc)
  where deleted_at is null;

create index if not exists meta_inbox_qa_scorecards_reviewed_user_idx
  on public.meta_inbox_qa_scorecards (environment, reviewed_user_id, created_at desc)
  where deleted_at is null;

create index if not exists meta_inbox_qa_scorecards_reviewer_idx
  on public.meta_inbox_qa_scorecards (environment, reviewed_by, created_at desc)
  where deleted_at is null;

drop trigger if exists meta_inbox_qa_scorecards_set_updated_at
  on public.meta_inbox_qa_scorecards;
create trigger meta_inbox_qa_scorecards_set_updated_at
  before update on public.meta_inbox_qa_scorecards
  for each row execute function public.set_updated_at();

alter table public.meta_inbox_qa_scorecards enable row level security;

grant select, insert, update on table public.meta_inbox_qa_scorecards
  to ads_analyst_web;

drop policy if exists ads_analyst_web_select on public.meta_inbox_qa_scorecards;
drop policy if exists ads_analyst_web_insert on public.meta_inbox_qa_scorecards;
drop policy if exists ads_analyst_web_update on public.meta_inbox_qa_scorecards;

create policy ads_analyst_web_select on public.meta_inbox_qa_scorecards
  for select to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_web_insert on public.meta_inbox_qa_scorecards
  for insert to ads_analyst_web
  with check (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_web_update on public.meta_inbox_qa_scorecards
  for update to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

comment on table public.meta_inbox_qa_scorecards is
  'Manager QA reviews for inbox conversations or selected sales replies. Internal-only coaching data.';
comment on column public.meta_inbox_qa_scorecards.overall_score is
  'Average of tone, completeness, accuracy, next step, speed, and policy/compliance risk scores.';

-- Contract marker for tests and reviewers: QA creates write
-- meta_inbox_conversation_events rows where event_type = 'qa_scorecard_added'.
