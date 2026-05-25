-- Meta inbox environment relationship hardening.
--
-- RLS keeps normal module roles inside the active Ads Analyst environment, but
-- service-role style clients bypass RLS. These composite keys make new child
-- rows carry the same environment as their parent rows at the database layer.

create unique index if not exists meta_social_threads_environment_id_idx
  on public.meta_social_threads (environment, id);

create unique index if not exists meta_social_messages_environment_id_idx
  on public.meta_social_messages (environment, id);

create unique index if not exists meta_social_comments_environment_id_idx
  on public.meta_social_comments (environment, id);

create unique index if not exists meta_inbox_teams_environment_id_idx
  on public.meta_inbox_teams (environment, id);

create unique index if not exists meta_inbox_customer_profiles_environment_id_idx
  on public.meta_inbox_customer_profiles (environment, id);

create unique index if not exists meta_inbox_conversations_environment_id_idx
  on public.meta_inbox_conversations (environment, id);

create unique index if not exists meta_inbox_send_attempts_environment_id_idx
  on public.meta_inbox_send_attempts (environment, id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'meta_inbox_team_members_environment_team_fk') then
    alter table public.meta_inbox_team_members
      add constraint meta_inbox_team_members_environment_team_fk
      foreign key (environment, team_id)
      references public.meta_inbox_teams(environment, id)
      on delete cascade
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'meta_inbox_team_queue_access_environment_team_fk') then
    alter table public.meta_inbox_team_queue_access
      add constraint meta_inbox_team_queue_access_environment_team_fk
      foreign key (environment, team_id)
      references public.meta_inbox_teams(environment, id)
      on delete cascade
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'meta_inbox_conversations_environment_thread_fk') then
    alter table public.meta_inbox_conversations
      add constraint meta_inbox_conversations_environment_thread_fk
      foreign key (environment, raw_thread_id)
      references public.meta_social_threads(environment, id)
      on delete set null
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'meta_inbox_conversations_environment_comment_fk') then
    alter table public.meta_inbox_conversations
      add constraint meta_inbox_conversations_environment_comment_fk
      foreign key (environment, raw_comment_id)
      references public.meta_social_comments(environment, id)
      on delete set null
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'meta_inbox_conversations_environment_profile_fk') then
    alter table public.meta_inbox_conversations
      add constraint meta_inbox_conversations_environment_profile_fk
      foreign key (environment, customer_profile_id)
      references public.meta_inbox_customer_profiles(environment, id)
      on delete set null
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'meta_inbox_conversations_environment_team_fk') then
    alter table public.meta_inbox_conversations
      add constraint meta_inbox_conversations_environment_team_fk
      foreign key (environment, assigned_team_id)
      references public.meta_inbox_teams(environment, id)
      on delete set null
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'meta_inbox_contact_methods_environment_profile_fk') then
    alter table public.meta_inbox_customer_contact_methods
      add constraint meta_inbox_contact_methods_environment_profile_fk
      foreign key (environment, customer_profile_id)
      references public.meta_inbox_customer_profiles(environment, id)
      on delete cascade
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'meta_inbox_contact_methods_environment_message_fk') then
    alter table public.meta_inbox_customer_contact_methods
      add constraint meta_inbox_contact_methods_environment_message_fk
      foreign key (environment, provided_in_message_id)
      references public.meta_social_messages(environment, id)
      on delete set null
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'meta_inbox_first_touch_sources_environment_conversation_fk') then
    alter table public.meta_inbox_first_touch_sources
      add constraint meta_inbox_first_touch_sources_environment_conversation_fk
      foreign key (environment, conversation_id)
      references public.meta_inbox_conversations(environment, id)
      on delete cascade
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'meta_inbox_first_touch_sources_environment_message_fk') then
    alter table public.meta_inbox_first_touch_sources
      add constraint meta_inbox_first_touch_sources_environment_message_fk
      foreign key (environment, first_message_id)
      references public.meta_social_messages(environment, id)
      on delete set null
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'meta_inbox_conversation_events_environment_conversation_fk') then
    alter table public.meta_inbox_conversation_events
      add constraint meta_inbox_conversation_events_environment_conversation_fk
      foreign key (environment, conversation_id)
      references public.meta_inbox_conversations(environment, id)
      on delete cascade
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'meta_inbox_send_attempts_environment_conversation_fk') then
    alter table public.meta_inbox_send_attempts
      add constraint meta_inbox_send_attempts_environment_conversation_fk
      foreign key (environment, conversation_id)
      references public.meta_inbox_conversations(environment, id)
      on delete cascade
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'meta_inbox_attachments_environment_conversation_fk') then
    alter table public.meta_inbox_attachments
      add constraint meta_inbox_attachments_environment_conversation_fk
      foreign key (environment, conversation_id)
      references public.meta_inbox_conversations(environment, id)
      on delete cascade
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'meta_inbox_attachments_environment_message_fk') then
    alter table public.meta_inbox_attachments
      add constraint meta_inbox_attachments_environment_message_fk
      foreign key (environment, message_id)
      references public.meta_social_messages(environment, id)
      on delete set null
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'meta_inbox_attachments_environment_send_attempt_fk') then
    alter table public.meta_inbox_attachments
      add constraint meta_inbox_attachments_environment_send_attempt_fk
      foreign key (environment, send_attempt_id)
      references public.meta_inbox_send_attempts(environment, id)
      on delete set null
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'meta_inbox_comment_actions_environment_conversation_fk') then
    alter table public.meta_inbox_comment_actions
      add constraint meta_inbox_comment_actions_environment_conversation_fk
      foreign key (environment, conversation_id)
      references public.meta_inbox_conversations(environment, id)
      on delete cascade
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'meta_inbox_presence_environment_conversation_fk') then
    alter table public.meta_inbox_presence
      add constraint meta_inbox_presence_environment_conversation_fk
      foreign key (environment, conversation_id)
      references public.meta_inbox_conversations(environment, id)
      on delete cascade
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'meta_inbox_notes_environment_conversation_fk') then
    alter table public.meta_inbox_notes
      add constraint meta_inbox_notes_environment_conversation_fk
      foreign key (environment, conversation_id)
      references public.meta_inbox_conversations(environment, id)
      on delete cascade
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'meta_inbox_qa_scorecards_environment_conversation_fk') then
    alter table public.meta_inbox_qa_scorecards
      add constraint meta_inbox_qa_scorecards_environment_conversation_fk
      foreign key (environment, conversation_id)
      references public.meta_inbox_conversations(environment, id)
      on delete cascade
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'meta_inbox_qa_scorecards_environment_send_attempt_fk') then
    alter table public.meta_inbox_qa_scorecards
      add constraint meta_inbox_qa_scorecards_environment_send_attempt_fk
      foreign key (environment, send_attempt_id)
      references public.meta_inbox_send_attempts(environment, id)
      on delete set null
      not valid;
  end if;
end $$;
