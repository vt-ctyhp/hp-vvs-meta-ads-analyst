-- Migration: meta_inbox_send_attempts_approved_sent_idx
--
-- Shared Supabase ledger file. This repo writes seconds=30
-- so it cannot collide with the sales-standalone-app-v1 repo (which writes seconds=00).

-- Powers B1 (today avg first-response) and B3 (replies sent today) lookups
-- by approver within a sent_at window.
create index if not exists meta_inbox_send_attempts_approved_sent_idx
  on public.meta_inbox_send_attempts (environment, approved_by, sent_at)
  where status = 'sent';

