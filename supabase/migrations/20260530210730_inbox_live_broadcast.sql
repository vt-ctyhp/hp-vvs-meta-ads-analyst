-- Migration: inbox_live_broadcast
--
-- Shared Supabase ledger file. This repo writes seconds=30
-- so it cannot collide with the sales-standalone-app-v1 repo (which writes seconds=00).

-- inbox_live_broadcast: Realtime Broadcast plumbing for the social inbox.
-- A trigger emits a content-free "inbox-changed" ping (ids only, no message text) on a
-- PRIVATE per-environment channel whenever an inbox row is written, so the web UI can
-- refetch + merge from the existing authorized endpoints without polling.

-- 1) Identity gate: is the current Supabase auth user an ACTIVE app user?
--    SECURITY DEFINER so an `authenticated` session can clear the RLS check by reading the
--    sales-owned identity view (granted to ads_analyst_web only). Owner privileges apply.
create or replace function analytics.is_active_inbox_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from analytics.ads_analyst_identity_profiles_v1 p
    where p.auth_user_id = (select auth.uid())
      and p.active
  );
$$;

revoke all on function analytics.is_active_inbox_user() from public;
grant execute on function analytics.is_active_inbox_user() to authenticated;

-- 2) Realtime Authorization: let active inbox users RECEIVE broadcasts on inbox:* topics.
--    realtime.messages has RLS enabled and no policies yet (default deny), so this is additive.
drop policy if exists "inbox broadcast readable by active inbox users" on realtime.messages;
create policy "inbox broadcast readable by active inbox users"
on realtime.messages
for select
to authenticated
using (
  realtime.topic() like 'inbox:%'
  and analytics.is_active_inbox_user()
);

-- 3) Trigger fn: emit a content-free ping for the row's environment. SECURITY DEFINER so the
--    inbox writer roles (ads_analyst_*) can broadcast via realtime.send. Best-effort: a
--    Realtime hiccup must NEVER roll back or block an inbox write.
create or replace function analytics.broadcast_inbox_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_env text;
  v_conversation_id uuid;
  v_kind text;
begin
  if tg_table_name = 'meta_inbox_conversations' then
    v_env := coalesce(new.environment, old.environment);
    v_conversation_id := coalesce(new.id, old.id);
    v_kind := 'conversation';
  else -- meta_inbox_conversation_events
    v_env := coalesce(new.environment, old.environment);
    v_conversation_id := coalesce(new.conversation_id, old.conversation_id);
    v_kind := 'event';
  end if;

  begin
    perform realtime.send(
      jsonb_build_object('conversationId', v_conversation_id, 'kind', v_kind),
      'inbox-changed',
      'inbox:' || v_env,
      true
    );
  exception when others then
    null; -- broadcasting is advisory only; swallow any Realtime error
  end;

  return null; -- AFTER trigger; return value ignored
end;
$$;

drop trigger if exists meta_inbox_conversations_broadcast on public.meta_inbox_conversations;
create trigger meta_inbox_conversations_broadcast
  after insert or update on public.meta_inbox_conversations
  for each row execute function analytics.broadcast_inbox_change();

drop trigger if exists meta_inbox_conversation_events_broadcast on public.meta_inbox_conversation_events;
create trigger meta_inbox_conversation_events_broadcast
  after insert or update on public.meta_inbox_conversation_events
  for each row execute function analytics.broadcast_inbox_change();
