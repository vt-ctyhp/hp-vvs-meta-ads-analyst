-- Meta inbox foundation: normalized conversations, team queues, source attribution,
-- customer identity, and operational audit.
--
-- This is additive and analyst-owned. Raw Meta webhook/sync tables stay in this
-- app; Sales/ERP users are referenced only by their central app user id.

create table if not exists public.meta_inbox_queue_categories (
  id uuid primary key default gen_random_uuid(),
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  key text not null check (key in (
    'cash_for_gold',
    'book_appointment',
    'us_product',
    'vn_product',
    'custom_jewelry',
    'repair_service',
    'general_inquiry',
    'uncategorized_needs_review'
  )),
  label text not null,
  description text not null,
  sort_order integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (environment, key)
);

create table if not exists public.meta_inbox_teams (
  id uuid primary key default gen_random_uuid(),
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (environment, name)
);

create table if not exists public.meta_inbox_team_members (
  id uuid primary key default gen_random_uuid(),
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  team_id uuid not null references public.meta_inbox_teams(id) on delete cascade,
  app_user_id uuid not null,
  role text not null default 'member' check (role in ('member', 'lead')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, app_user_id)
);

create table if not exists public.meta_inbox_team_queue_access (
  id uuid primary key default gen_random_uuid(),
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  team_id uuid not null references public.meta_inbox_teams(id) on delete cascade,
  queue_category_key text not null check (queue_category_key in (
    'cash_for_gold',
    'book_appointment',
    'us_product',
    'vn_product',
    'custom_jewelry',
    'repair_service',
    'general_inquiry',
    'uncategorized_needs_review'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, queue_category_key)
);

create table if not exists public.meta_inbox_customer_profiles (
  id uuid primary key default gen_random_uuid(),
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  platform text not null check (platform in ('facebook', 'instagram')),
  page_id text,
  ig_user_id text,
  participant_id text not null,
  profile_key text not null,
  display_name text,
  username text,
  profile_picture_url text,
  profile_url text,
  profile_reference text,
  locale text,
  timezone text,
  raw_profile_json jsonb not null default '{}'::jsonb,
  last_profile_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meta_inbox_conversations (
  id uuid primary key default gen_random_uuid(),
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  canonical_conversation_key text not null,
  source_channel text not null check (source_channel in (
    'facebook_message',
    'instagram_message',
    'facebook_public_comment',
    'instagram_public_comment',
    'private_reply_from_comment',
    'ad_referral',
    'other_unknown'
  )),
  source_type text not null check (source_type in (
    'message_thread',
    'public_comment',
    'private_reply',
    'ad_referral',
    'other'
  )),
  platform text not null check (platform in ('facebook', 'instagram')),
  raw_thread_id uuid references public.meta_social_threads(id) on delete set null,
  raw_comment_id uuid references public.meta_social_comments(id) on delete set null,
  customer_profile_id uuid references public.meta_inbox_customer_profiles(id) on delete set null,
  page_id text,
  ig_user_id text,
  participant_id text,
  platform_thread_id text,
  parent_content_id text,
  source_id text,
  first_inbound_at timestamptz,
  latest_inbound_at timestamptz,
  latest_outbound_at timestamptz,
  last_activity_at timestamptz,
  needs_reply boolean not null default false,
  reply_window_expires_at timestamptz,
  human_agent_window_expires_at timestamptz,
  send_eligibility text not null default 'unknown' check (send_eligibility in (
    'standard_reply_allowed',
    'human_agent_allowed',
    'expired',
    'unknown'
  )),
  conversation_status text not null default 'new_inquiry' check (conversation_status in (
    'new_inquiry',
    'needs_reply',
    'waiting_on_customer',
    'follow_up_needed',
    'appointment_scheduled',
    'closed',
    'lost_lead'
  )),
  assigned_team_id uuid references public.meta_inbox_teams(id) on delete set null,
  assigned_user_id uuid,
  follow_up_at timestamptz,
  lead_quality text check (lead_quality in (
    'high_intent',
    'medium_intent',
    'low_intent',
    'not_a_fit',
    'spam_invalid'
  )),
  lead_quality_reason_tags text[] not null default '{}'::text[] check (
    lead_quality_reason_tags <@ array[
      'asked_appointment',
      'asked_price',
      'budget_shared',
      'design_details_shared',
      'custom_design',
      'diamond_inquiry',
      'repair_service',
      'price_shopping',
      'budget_mismatch',
      'timeline_mismatch',
      'wrong_product_service',
      'unresponsive',
      'duplicate',
      'spam_bot'
    ]::text[]
  ),
  inbox_outcome text not null default 'no_outcome_yet' check (inbox_outcome in (
    'no_outcome_yet',
    'booked',
    'showed_up',
    'no_show',
    'browsed',
    'sold',
    'lost'
  )),
  inbox_lost_reason text check (inbox_lost_reason in (
    'no_response',
    'price_concerns',
    'bought_elsewhere',
    'timeline_issue',
    'budget_not_aligned',
    'design_not_preferred',
    'cancelled_by_client',
    'duplicate_lead',
    'lost_after_no_show',
    'other'
  )),
  closed_at timestamptz,
  queue_category_key text not null default 'uncategorized_needs_review' check (queue_category_key in (
    'cash_for_gold',
    'book_appointment',
    'us_product',
    'vn_product',
    'custom_jewelry',
    'repair_service',
    'general_inquiry',
    'uncategorized_needs_review'
  )),
  routing_source text,
  routing_confidence numeric(5,4) check (routing_confidence is null or routing_confidence between 0 and 1),
  routing_explanation text,
  routing_rule_id uuid,
  manual_override_by uuid,
  manual_override_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (environment, canonical_conversation_key)
);

create table if not exists public.meta_inbox_customer_contact_methods (
  id uuid primary key default gen_random_uuid(),
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  customer_profile_id uuid not null references public.meta_inbox_customer_profiles(id) on delete cascade,
  type text not null check (type in ('phone', 'email')),
  value_normalized text not null,
  value_display text not null,
  source text not null default 'sales_entered' check (source in (
    'sales_entered',
    'webhook',
    'profile_enrichment',
    'future_verified_source'
  )),
  provided_in_message_id uuid references public.meta_social_messages(id) on delete set null,
  raw_input text,
  verified_for_matching_at timestamptz,
  entered_by uuid,
  entered_at timestamptz not null default now(),
  deleted_by uuid,
  deleted_at timestamptz,
  audit_event_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meta_inbox_first_touch_sources (
  id uuid primary key default gen_random_uuid(),
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  conversation_id uuid not null references public.meta_inbox_conversations(id) on delete cascade,
  first_message_id uuid references public.meta_social_messages(id) on delete set null,
  first_message_at timestamptz,
  referral_json jsonb not null default '{}'::jsonb,
  ad_id text,
  ads_context_data_json jsonb not null default '{}'::jsonb,
  ref text,
  source_post_id text,
  source_media_id text,
  source_comment_id text,
  source_product_id text,
  source_permalink text,
  campaign_umbrella_id text,
  campaign_id text,
  adset_id text,
  creative_id text,
  attribution_method text,
  attribution_confidence numeric(5,4) check (
    attribution_confidence is null or attribution_confidence between 0 and 1
  ),
  raw_payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (environment, conversation_id)
);

create table if not exists public.meta_inbox_conversation_events (
  id uuid primary key default gen_random_uuid(),
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  conversation_id uuid not null references public.meta_inbox_conversations(id) on delete cascade,
  event_type text not null check (event_type in (
    'conversation_created',
    'assignment_changed',
    'status_changed',
    'lead_quality_changed',
    'inbox_outcome_changed',
    'routing_changed',
    'follow_up_changed',
    'contact_method_changed',
    'comment_action',
    'send_attempt',
    'note_added',
    'qa_scorecard_added'
  )),
  actor_user_id uuid,
  dedupe_key text,
  event_at timestamptz not null default now(),
  previous_value jsonb,
  new_value jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.meta_inbox_queue_categories (environment, key, label, description, sort_order)
values
  (analytics.current_ads_analyst_environment(), 'cash_for_gold', 'Cash for Gold', 'Customers responding to cash-for-gold, selling, trade-in, or gold-buying offers.', 10),
  (analytics.current_ads_analyst_environment(), 'book_appointment', 'Book Appointment', 'Customers trying to schedule a visit, consultation, viewing, or phone follow-up.', 20),
  (analytics.current_ads_analyst_environment(), 'us_product', 'US Product', 'Product inquiries tied to the US store, US inventory, or US-market ads.', 30),
  (analytics.current_ads_analyst_environment(), 'vn_product', 'VN Product', 'Product inquiries tied to Vietnam inventory, Vietnam service, or Vietnam-market ads.', 40),
  (analytics.current_ads_analyst_environment(), 'custom_jewelry', 'Custom Jewelry', 'Custom design, redesign, CAD, made-to-order, or inspiration-photo conversations.', 50),
  (analytics.current_ads_analyst_environment(), 'repair_service', 'Repair / Service', 'Repair, resizing, cleaning, appraisal, warranty, or service conversations.', 60),
  (analytics.current_ads_analyst_environment(), 'general_inquiry', 'General Inquiry', 'Valid customer questions without a more specific queue match.', 70),
  (analytics.current_ads_analyst_environment(), 'uncategorized_needs_review', 'Uncategorized / Needs Review', 'Missing, unclear, or low-confidence routing that needs human review.', 80)
on conflict (environment, key) do update
set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order,
  active = true,
  updated_at = now();

create unique index if not exists meta_inbox_customer_profiles_identity_idx
  on public.meta_inbox_customer_profiles (
    environment,
    platform,
    coalesce(page_id, ''),
    coalesce(ig_user_id, ''),
    participant_id
  );

create unique index if not exists meta_inbox_customer_profiles_profile_key_idx
  on public.meta_inbox_customer_profiles (environment, profile_key);

create unique index if not exists meta_inbox_conversation_events_dedupe_idx
  on public.meta_inbox_conversation_events (environment, dedupe_key);

create unique index if not exists meta_inbox_active_contact_methods_uniq_idx
  on public.meta_inbox_customer_contact_methods (
    environment,
    customer_profile_id,
    type,
    value_normalized
  )
  where deleted_at is null;

create index if not exists meta_inbox_conversations_queue_idx
  on public.meta_inbox_conversations (
    environment,
    queue_category_key,
    conversation_status,
    needs_reply,
    last_activity_at desc nulls last
  );

create index if not exists meta_inbox_conversations_source_channel_idx
  on public.meta_inbox_conversations (environment, source_channel, last_activity_at desc nulls last);

create index if not exists meta_inbox_conversations_assignment_idx
  on public.meta_inbox_conversations (environment, assigned_team_id, assigned_user_id, last_activity_at desc nulls last);

create index if not exists meta_inbox_first_touch_ad_idx
  on public.meta_inbox_first_touch_sources (
    environment,
    campaign_umbrella_id,
    campaign_id,
    adset_id,
    ad_id,
    creative_id
  );

create index if not exists meta_inbox_conversation_events_lookup_idx
  on public.meta_inbox_conversation_events (environment, conversation_id, event_at desc);

create index if not exists meta_inbox_conversation_events_type_idx
  on public.meta_inbox_conversation_events (environment, event_type, event_at desc);

do $$
declare
  t text;
begin
  foreach t in array array[
    'meta_inbox_queue_categories',
    'meta_inbox_teams',
    'meta_inbox_team_members',
    'meta_inbox_team_queue_access',
    'meta_inbox_customer_profiles',
    'meta_inbox_conversations',
    'meta_inbox_customer_contact_methods',
    'meta_inbox_first_touch_sources',
    'meta_inbox_conversation_events'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', left(t || '_set_updated_at', 63), t);
    if t <> 'meta_inbox_conversation_events' then
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
        left(t || '_set_updated_at', 63),
        t
      );
    end if;

    execute format('alter table public.%I enable row level security', t);
    execute format(
      'grant select on table public.%I to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest',
      t
    );
    if t = 'meta_inbox_conversation_events' then
      execute format(
        'grant insert on table public.%I to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest',
        t
      );
    else
      execute format(
        'grant insert, update, delete on table public.%I to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest',
        t
      );
    end if;

    execute format('drop policy if exists ads_analyst_select on public.%I', t);
    execute format('drop policy if exists ads_analyst_web_insert on public.%I', t);
    execute format('drop policy if exists ads_analyst_web_update on public.%I', t);
    execute format('drop policy if exists ads_analyst_web_delete on public.%I', t);
    execute format('drop policy if exists ads_analyst_worker_insert on public.%I', t);
    execute format('drop policy if exists ads_analyst_worker_update on public.%I', t);
    execute format('drop policy if exists ads_analyst_worker_delete on public.%I', t);
    execute format('drop policy if exists ads_analyst_ingest_insert on public.%I', t);
    execute format('drop policy if exists ads_analyst_ingest_update on public.%I', t);
    execute format('drop policy if exists ads_analyst_ingest_delete on public.%I', t);

    execute format(
      'create policy ads_analyst_select on public.%I for select to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest using (analytics.ads_analyst_environment_matches(environment))',
      t
    );
    execute format(
      'create policy ads_analyst_web_insert on public.%I for insert to ads_analyst_web with check (analytics.ads_analyst_environment_matches(environment))',
      t
    );
    execute format(
      'create policy ads_analyst_worker_insert on public.%I for insert to ads_analyst_worker with check (analytics.ads_analyst_environment_matches(environment))',
      t
    );
    execute format(
      'create policy ads_analyst_ingest_insert on public.%I for insert to ads_analyst_ingest with check (analytics.ads_analyst_environment_matches(environment))',
      t
    );

    if t <> 'meta_inbox_conversation_events' then
      execute format(
        'create policy ads_analyst_web_update on public.%I for update to ads_analyst_web using (analytics.ads_analyst_environment_matches(environment)) with check (analytics.ads_analyst_environment_matches(environment))',
        t
      );
      execute format(
        'create policy ads_analyst_web_delete on public.%I for delete to ads_analyst_web using (analytics.ads_analyst_environment_matches(environment))',
        t
      );
      execute format(
        'create policy ads_analyst_worker_update on public.%I for update to ads_analyst_worker using (analytics.ads_analyst_environment_matches(environment)) with check (analytics.ads_analyst_environment_matches(environment))',
        t
      );
      execute format(
        'create policy ads_analyst_worker_delete on public.%I for delete to ads_analyst_worker using (analytics.ads_analyst_environment_matches(environment))',
        t
      );
      execute format(
        'create policy ads_analyst_ingest_update on public.%I for update to ads_analyst_ingest using (analytics.ads_analyst_environment_matches(environment)) with check (analytics.ads_analyst_environment_matches(environment))',
        t
      );
      execute format(
        'create policy ads_analyst_ingest_delete on public.%I for delete to ads_analyst_ingest using (analytics.ads_analyst_environment_matches(environment))',
        t
      );
    end if;
  end loop;
end $$;

comment on table public.meta_inbox_conversations is
  'Normalized operational inbox conversation row. Raw Meta thread/comment rows remain the ingestion source.';
comment on column public.meta_inbox_conversations.queue_category_key is
  'Locked operational queue category. The All view is the union of queues reachable through the user team membership.';
comment on column public.meta_inbox_conversations.source_channel is
  'Source-channel filter independent from operational queue category.';
comment on table public.meta_inbox_first_touch_sources is
  'First-touch Meta referral and ad/creative/campaign attribution captured at conversation start.';
comment on table public.meta_inbox_conversation_events is
  'Manager-visible audit trail for conversation state, assignment, routing, send attempts, notes, and scorecards.';
