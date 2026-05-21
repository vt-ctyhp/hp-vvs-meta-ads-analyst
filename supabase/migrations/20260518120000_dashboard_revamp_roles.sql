-- AI Dashboard Revamp v1 — Day 1
-- Adds the four new user roles introduced by the executive snapshot / sales review
-- framework, and a per-user last-visit timestamp to power the "Since you last looked"
-- callout on the new landing page.
--
-- The user_role enum lives in the remote (Supabase-managed) schema; this file
-- adds new values idempotently so it can be re-run safely.

alter type public.user_role add value if not exists 'executive';
alter type public.user_role add value if not exists 'sales_appointment_reviewer';
alter type public.user_role add value if not exists 'sales_creative_reviewer';
alter type public.user_role add value if not exists 'sales_lead';

alter table public.users
  add column if not exists user_last_visit_at timestamptz;

comment on column public.users.user_last_visit_at is
  'Last time this user loaded an authenticated app surface. Drives the "Since you last looked" callout on the executive snapshot. Updated server-side on each authenticated page load.';
