-- Phase 11: Send-tracking columns on ai_reply_suggestions.
--
-- When the operator confirms a reply in the inbox composer, the api/social-inbox/
-- send-reply route now performs an actual Meta Graph POST (gated behind the
-- ALLOW_LIVE_META_SEND env flag). To preserve the audit trail PRD §11 requires
-- we record the Meta-returned id, when it landed, and any error string returned
-- by Meta if the send failed.
--
-- Columns are nullable: a dry-run audit row (live send disabled) sets none of
-- them; a successful live send sets meta_send_id + sent_at; a failed live send
-- sets send_error.
alter table public.ai_reply_suggestions
  add column if not exists meta_send_id text,
  add column if not exists sent_at timestamptz,
  add column if not exists send_error text;

create index if not exists ai_reply_suggestions_sent_at_idx
  on public.ai_reply_suggestions (sent_at desc nulls last)
  where status = 'sent';
