-- Migration: ai_reply_training_profiles
--
-- Shared Supabase ledger file. This repo writes seconds=30
-- so it cannot collide with the sales-standalone-app-v1 repo (which writes seconds=00).

create table if not exists public.ai_reply_prompt_profiles (
  id uuid primary key default gen_random_uuid(),
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  brand text not null check (brand in ('HP', 'VVS', 'Unassigned')),
  name text not null,
  version integer not null default 1 check (version > 0),
  business_context text not null default '',
  sales_guidance text not null default '',
  tone_guidance text not null default '',
  disallowed_claims text[] not null default '{}'::text[],
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ai_reply_prompt_profiles_active_brand_idx
  on public.ai_reply_prompt_profiles (environment, brand)
  where active;

create unique index if not exists ai_reply_prompt_profiles_version_idx
  on public.ai_reply_prompt_profiles (environment, brand, version);

create table if not exists public.ai_reply_training_examples (
  id uuid primary key default gen_random_uuid(),
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  prompt_profile_id uuid references public.ai_reply_prompt_profiles(id) on delete set null,
  brand text not null check (brand in ('HP', 'VVS', 'Unassigned')),
  title text not null,
  source text not null default 'synthetic'
    check (source in ('synthetic', 'real', 'operator_feedback')),
  conversation_messages jsonb not null default '[]'::jsonb,
  ideal_response text not null default '',
  critique text,
  rating integer check (rating is null or rating between 1 and 5),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_reply_training_examples_lookup_idx
  on public.ai_reply_training_examples (environment, brand, active, updated_at desc);

create index if not exists ai_reply_training_examples_profile_idx
  on public.ai_reply_training_examples (environment, prompt_profile_id, active, updated_at desc);

create table if not exists public.ai_reply_suggestion_feedback (
  id uuid primary key default gen_random_uuid(),
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  suggestion_id uuid references public.ai_reply_suggestions(id) on delete cascade,
  conversation_id uuid references public.meta_inbox_conversations(id) on delete set null,
  rating text not null check (rating in ('good', 'mixed', 'bad')),
  feedback_text text not null default '',
  final_reply_text text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists ai_reply_suggestion_feedback_suggestion_idx
  on public.ai_reply_suggestion_feedback (environment, suggestion_id, created_at desc);

create index if not exists ai_reply_suggestion_feedback_conversation_idx
  on public.ai_reply_suggestion_feedback (environment, conversation_id, created_at desc);

alter table public.ai_reply_suggestions
  add column if not exists conversation_id uuid references public.meta_inbox_conversations(id) on delete set null,
  add column if not exists provider text not null default 'anthropic'
    check (provider in ('anthropic')),
  add column if not exists prompt_profile_id uuid references public.ai_reply_prompt_profiles(id) on delete set null,
  add column if not exists request_context jsonb not null default '{}'::jsonb,
  add column if not exists strategy text,
  add column if not exists next_best_action text
    check (
      next_best_action is null or next_best_action in (
        'invite_to_store',
        'ask_clarifying_question',
        'answer_question',
        'collect_contact_info',
        'handoff_to_human',
        'no_reply_needed'
      )
    ),
  add column if not exists confidence text
    check (confidence is null or confidence in ('low', 'medium', 'high')),
  add column if not exists risk_flags text[] not null default '{}'::text[],
  add column if not exists tone_notes text[] not null default '{}'::text[],
  add column if not exists usage jsonb not null default '{}'::jsonb;

create index if not exists ai_reply_suggestions_conversation_idx
  on public.ai_reply_suggestions (environment, conversation_id, created_at desc);

create index if not exists ai_reply_suggestions_prompt_profile_idx
  on public.ai_reply_suggestions (environment, prompt_profile_id, created_at desc);

alter table public.meta_inbox_send_attempts
  add column if not exists ai_reply_suggestion_id uuid references public.ai_reply_suggestions(id) on delete set null;

create index if not exists meta_inbox_send_attempts_ai_reply_suggestion_idx
  on public.meta_inbox_send_attempts (environment, ai_reply_suggestion_id)
  where ai_reply_suggestion_id is not null;

drop trigger if exists ai_reply_prompt_profiles_set_updated_at
  on public.ai_reply_prompt_profiles;
create trigger ai_reply_prompt_profiles_set_updated_at
  before update on public.ai_reply_prompt_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists ai_reply_training_examples_set_updated_at
  on public.ai_reply_training_examples;
create trigger ai_reply_training_examples_set_updated_at
  before update on public.ai_reply_training_examples
  for each row execute function public.set_updated_at();

alter table public.ai_reply_prompt_profiles enable row level security;
alter table public.ai_reply_training_examples enable row level security;
alter table public.ai_reply_suggestion_feedback enable row level security;

grant select, insert, update, delete on table public.ai_reply_prompt_profiles
  to ads_analyst_web;
grant select on table public.ai_reply_prompt_profiles
  to ads_analyst_worker;

grant select, insert, update, delete on table public.ai_reply_training_examples
  to ads_analyst_web;
grant select on table public.ai_reply_training_examples
  to ads_analyst_worker;

grant select, insert on table public.ai_reply_suggestion_feedback
  to ads_analyst_web;
grant select on table public.ai_reply_suggestion_feedback
  to ads_analyst_worker;

do $$
declare
  t text;
begin
  foreach t in array array[
    'ai_reply_prompt_profiles',
    'ai_reply_training_examples',
    'ai_reply_suggestion_feedback'
  ]
  loop
    execute format('drop policy if exists ads_analyst_select on public.%I', t);
    execute format(
      'create policy ads_analyst_select on public.%I for select to ads_analyst_web, ads_analyst_worker using (analytics.ads_analyst_environment_matches(environment))',
      t
    );

    execute format('drop policy if exists ads_analyst_web_insert on public.%I', t);
    execute format(
      'create policy ads_analyst_web_insert on public.%I for insert to ads_analyst_web with check (analytics.ads_analyst_environment_matches(environment))',
      t
    );
  end loop;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'ai_reply_prompt_profiles',
    'ai_reply_training_examples'
  ]
  loop
    execute format('drop policy if exists ads_analyst_web_update on public.%I', t);
    execute format('drop policy if exists ads_analyst_web_delete on public.%I', t);
    execute format(
      'create policy ads_analyst_web_update on public.%I for update to ads_analyst_web using (analytics.ads_analyst_environment_matches(environment)) with check (analytics.ads_analyst_environment_matches(environment))',
      t
    );
    execute format(
      'create policy ads_analyst_web_delete on public.%I for delete to ads_analyst_web using (analytics.ads_analyst_environment_matches(environment))',
      t
    );
  end loop;
end $$;

insert into public.ai_reply_prompt_profiles (
  brand,
  name,
  version,
  business_context,
  sales_guidance,
  tone_guidance,
  disallowed_claims,
  active
) values
(
  'HP',
  'Hung Phat inbox closer v1',
  1,
  'Hung Phat is a jewelry showroom. Inbox replies should move customers toward a useful sales next step: visit the store, book an appointment, or answer one clear question when the answer is known.',
  'For cash-for-gold, trade-in, appraisal, custom jewelry, sizing, and uncertain inventory, guide the customer into the store for assessment instead of quoting remotely. Never invent prices, payouts, availability, or appointment times.',
  'Warm, concise, confident, human, and senior-sales-associate direct. Match the customer language and energy. No pressure tactics, no cheap promotion language, no markdown.',
  array[
    'guaranteed payout',
    'exact value without assessment',
    'confirmed appointment time not in context',
    'unverified inventory availability'
  ],
  true
),
(
  'VVS',
  'VVS inbox closer v1',
  1,
  'VVS replies should help jewelry customers choose the next useful step, usually a showroom visit, appointment, or one precise clarification.',
  'Answer only from known context. If value, fit, availability, or authenticity requires inspection, guide the customer toward an in-person assessment.',
  'Warm, concise, confident, and natural. Match the customer language and energy. No pressure tactics, no markdown.',
  array[
    'guaranteed value',
    'confirmed appointment time not in context',
    'unverified inventory availability'
  ],
  true
)
on conflict do nothing;

comment on table public.ai_reply_prompt_profiles is
  'Minimal editable Anthropic reply guidance: business context, sales rules, tone guidance, and disallowed claims.';
comment on table public.ai_reply_training_examples is
  'Optional synthetic or operator-reviewed examples for calibrating inbox reply suggestions without canned-response buckets.';
comment on table public.ai_reply_suggestion_feedback is
  'Human feedback on AI reply suggestions, including final edited reply text when useful for later calibration.';
comment on column public.meta_inbox_send_attempts.ai_reply_suggestion_id is
  'Optional pointer to the AI draft that a human approved, edited, or used before creating this send attempt.';
