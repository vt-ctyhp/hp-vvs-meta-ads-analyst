-- Meta inbox saved replies/templates foundation.
-- Personal drafts are owned by one sales user; shared templates require
-- sales lead/admin approval before frontline sales can use them.

create table if not exists public.meta_inbox_saved_replies (
  id uuid primary key default gen_random_uuid(),
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  title text not null check (length(btrim(title)) > 0),
  body text not null check (length(btrim(body)) > 0),
  visibility text not null check (visibility in ('personal', 'shared')),
  approval_status text not null check (approval_status in (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'archived'
  )),
  owner_user_id uuid,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  queue_category_key text check (
    queue_category_key is null
    or queue_category_key in (
      'cash_for_gold',
      'book_appointment',
      'us_product',
      'vn_product',
      'custom_jewelry',
      'repair_service',
      'general_inquiry',
      'uncategorized_needs_review'
    )
  ),
  source_channel text check (
    source_channel is null
    or source_channel in (
      'facebook_message',
      'instagram_message',
      'facebook_public_comment',
      'instagram_public_comment',
      'private_reply_from_comment',
      'ad_referral',
      'other_unknown'
    )
  ),
  language text not null default 'en',
  lead_quality text check (
    lead_quality is null
    or lead_quality in (
      'high_intent',
      'medium_intent',
      'low_intent',
      'not_a_fit',
      'spam_invalid'
    )
  ),
  active boolean not null default true,
  usage_count integer not null default 0 check (usage_count >= 0),
  last_used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    visibility <> 'personal'
    or (owner_user_id is not null and approval_status = 'draft')
  ),
  check (
    visibility <> 'shared'
    or approval_status in ('pending_approval', 'approved', 'rejected', 'archived')
  ),
  check (
    approval_status <> 'approved'
    or (approved_by is not null and approved_at is not null)
  )
);

create index if not exists meta_inbox_saved_replies_lookup_idx
  on public.meta_inbox_saved_replies (
    environment,
    active,
    visibility,
    approval_status,
    queue_category_key,
    source_channel,
    language,
    lead_quality
  );

create index if not exists meta_inbox_saved_replies_owner_idx
  on public.meta_inbox_saved_replies (
    environment,
    owner_user_id,
    active,
    updated_at desc
  )
  where visibility = 'personal';

create index if not exists meta_inbox_saved_replies_shared_review_idx
  on public.meta_inbox_saved_replies (
    environment,
    approval_status,
    updated_at desc
  )
  where visibility = 'shared';

drop trigger if exists meta_inbox_saved_replies_set_updated_at
  on public.meta_inbox_saved_replies;
create trigger meta_inbox_saved_replies_set_updated_at
  before update on public.meta_inbox_saved_replies
  for each row execute function public.set_updated_at();

alter table public.meta_inbox_saved_replies enable row level security;

grant select, insert, update, delete on table public.meta_inbox_saved_replies
  to ads_analyst_web;

drop policy if exists ads_analyst_web_select on public.meta_inbox_saved_replies;
drop policy if exists ads_analyst_web_insert on public.meta_inbox_saved_replies;
drop policy if exists ads_analyst_web_update on public.meta_inbox_saved_replies;
drop policy if exists ads_analyst_web_delete on public.meta_inbox_saved_replies;

create policy ads_analyst_web_select on public.meta_inbox_saved_replies
  for select to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_web_insert on public.meta_inbox_saved_replies
  for insert to ads_analyst_web
  with check (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_web_update on public.meta_inbox_saved_replies
  for update to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_web_delete on public.meta_inbox_saved_replies
  for delete to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment));

comment on table public.meta_inbox_saved_replies is
  'Inbox-owned saved replies/templates. Personal drafts are sales-user scoped; shared templates require sales lead/admin approval.';
comment on column public.meta_inbox_saved_replies.queue_category_key is
  'Optional canonical queue category scope. Null means all queues.';
comment on column public.meta_inbox_saved_replies.source_channel is
  'Optional Meta source channel scope. Null means all channels.';
comment on column public.meta_inbox_saved_replies.lead_quality is
  'Optional canonical lead quality scope. Null means all lead qualities.';
