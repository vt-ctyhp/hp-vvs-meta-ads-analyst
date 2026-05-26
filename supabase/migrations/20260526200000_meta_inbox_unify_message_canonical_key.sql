-- Unify Meta inbox conversation canonical keys for message threads.
--
-- Background:
-- Until now, canonical_conversation_key for message threads embedded the
-- platform_thread_id. Webhook-created rows used a synthetic id of the
-- form "<platform>:webhook:<page>:<participant>"; polled rows used the
-- real "t_…" id. The same customer therefore produced two separate
-- conversation rows, and the inbox queue rendered each as its own card.
-- The webhook sibling showed only "Facebook Conversation / Conversation
-- history not synced yet" because the synthetic meta_social_threads row
-- never carried participant_name or snippet.
--
-- After this migration, canonical_conversation_key for message threads
-- is derived from (platform, COALESCE(page_id, ig_user_id), participant_id),
-- matching the new src/lib/meta-inbox-normalization.ts. Existing duplicate
-- rows are merged into a single survivor; child rows (events, send
-- attempts, notes, etc.) are re-parented onto the survivor.
--
-- Survivor selection: prefer the row whose platform_thread_id is NOT a
-- webhook-prefixed synthetic id; tie-break by latest last_activity_at,
-- then by id for determinism.
--
-- Idempotent: re-running performs zero updates once canonical keys are
-- already in the identity-based form and no duplicate identities remain.
--
-- IMPORTANT — deploy ordering:
-- This migration MUST run before the meta-inbox-normalization.ts code
-- change that produces identity-based keys ships. If the code ships
-- first, new webhook/polling events will write identity-based keys
-- while existing rows still hold thread-id-based keys, multiplying the
-- duplicates instead of removing them.

begin;

-- 1. Identify message-thread rows eligible for identity-based keys.
--    Rows lacking a business id or participant_id keep their existing key
--    (the normalization code falls back to the thread-id form for them).
create temporary table _mic_keyed on commit drop as
select
  c.id,
  c.environment,
  c.platform,
  c.page_id,
  c.ig_user_id,
  c.participant_id,
  c.platform_thread_id,
  c.last_activity_at,
  c.canonical_conversation_key as old_canonical_key,
  c.platform
    || ':message_thread:'
    || coalesce(c.page_id, c.ig_user_id)
    || ':'
    || c.participant_id as new_canonical_key
from public.meta_inbox_conversations c
where c.source_type = 'message_thread'
  and coalesce(c.page_id, c.ig_user_id) is not null
  and c.participant_id is not null;

create index on _mic_keyed (environment, new_canonical_key);
create index on _mic_keyed (id);

-- 2. Pick one survivor per (environment, new_canonical_key).
--    Polled rows beat webhook rows; most recent activity beats older.
create temporary table _mic_survivors on commit drop as
select distinct on (environment, new_canonical_key)
  id as survivor_id,
  environment,
  new_canonical_key
from _mic_keyed
order by
  environment,
  new_canonical_key,
  case
    when starts_with(coalesce(platform_thread_id, ''), platform || ':webhook:') then 1
    else 0
  end asc,
  last_activity_at desc nulls last,
  id;

-- 3. Map every losing row to its survivor.
create temporary table _mic_map on commit drop as
select
  k.id as loser_id,
  s.survivor_id,
  k.environment,
  k.new_canonical_key
from _mic_keyed k
join _mic_survivors s
  on s.environment = k.environment
 and s.new_canonical_key = k.new_canonical_key
where k.id <> s.survivor_id;

create index on _mic_map (loser_id);

-- 4. Re-parent child rows.

-- 4a. first_touch_sources: unique(environment, conversation_id). Drop the
--     loser's row when the survivor already has one; otherwise just point
--     the loser's row at the survivor.
delete from public.meta_inbox_first_touch_sources f
using _mic_map m
where f.conversation_id = m.loser_id
  and exists (
    select 1
    from public.meta_inbox_first_touch_sources f2
    where f2.environment = m.environment
      and f2.conversation_id = m.survivor_id
  );

update public.meta_inbox_first_touch_sources f
set conversation_id = m.survivor_id
from _mic_map m
where f.conversation_id = m.loser_id;

-- 4b. presence is ephemeral (expires_at-driven). Loser rows are safe to drop.
delete from public.meta_inbox_presence p
using _mic_map m
where p.conversation_id = m.loser_id;

-- 4c. All other child tables: simply point the FK at the survivor.
update public.meta_inbox_conversation_events e
set conversation_id = m.survivor_id
from _mic_map m
where e.conversation_id = m.loser_id;

update public.meta_inbox_send_attempts s
set conversation_id = m.survivor_id
from _mic_map m
where s.conversation_id = m.loser_id;

update public.meta_inbox_attachments a
set conversation_id = m.survivor_id
from _mic_map m
where a.conversation_id = m.loser_id;

update public.meta_inbox_comment_actions a
set conversation_id = m.survivor_id
from _mic_map m
where a.conversation_id = m.loser_id;

update public.meta_inbox_notes n
set conversation_id = m.survivor_id
from _mic_map m
where n.conversation_id = m.loser_id;

update public.meta_inbox_qa_scorecards q
set conversation_id = m.survivor_id
from _mic_map m
where q.conversation_id = m.loser_id;

-- 5. Delete the loser conversation rows. Any remaining FK references on
--    child tables not enumerated above will cascade per their own ON
--    DELETE CASCADE definitions.
delete from public.meta_inbox_conversations c
using _mic_map m
where c.id = m.loser_id;

-- 6. Rewrite canonical_conversation_key on every surviving message-thread
--    row that now has an identity. Skips rows whose key is already in the
--    new form.
update public.meta_inbox_conversations c
set canonical_conversation_key = k.new_canonical_key
from _mic_keyed k
where k.id = c.id
  and c.canonical_conversation_key <> k.new_canonical_key;

commit;
