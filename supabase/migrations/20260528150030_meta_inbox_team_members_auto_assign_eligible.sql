-- supabase/migrations/20260528150030_meta_inbox_team_members_auto_assign_eligible.sql
-- Migration: meta_inbox_team_members.auto_assign_eligible
--
-- Shared Supabase ledger file. This repo writes seconds=30 so it cannot collide
-- with the sales-standalone-app-v1 repo (which writes seconds=00).
--
-- Opt-in flag for the round-robin auto-assign pool. A member only joins the pool
-- for the categories their team covers when this is true, so leads/part-timers
-- can be excluded without removing them from the team. The column inherits the
-- table's existing grants and env-match RLS.

alter table public.meta_inbox_team_members
  add column if not exists auto_assign_eligible boolean not null default false;

comment on column public.meta_inbox_team_members.auto_assign_eligible is
  'When true, this member joins the round-robin auto-assign pool for the categories their team covers (spec 2026-05-28-inbox-auto-assign-design).';
