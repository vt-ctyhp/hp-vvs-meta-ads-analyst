-- Migration: meta_inbox_queue_business_hours
--
-- Shared Supabase ledger file. This repo writes seconds=30
-- so it cannot collide with the sales-standalone-app-v1 repo (which writes seconds=00).

-- Per-queue business-hours config powering SLA business-time math.
-- 7 days/week, no holidays (v1). Hours changes apply going forward (no versioning).
alter table public.meta_inbox_queue_categories
  add column if not exists timezone             text not null default 'America/Los_Angeles',
  add column if not exists business_hours_start time not null default '10:00:00',
  add column if not exists business_hours_end   time not null default '19:00:00';

-- VN Product queue runs on Vietnam business hours (ICT). The foundation
-- migration uses key = 'vn_product' (there is no 'vn_%' slug column).
update public.meta_inbox_queue_categories
   set timezone = 'Asia/Ho_Chi_Minh', updated_at = now()
 where key = 'vn_product';

comment on column public.meta_inbox_queue_categories.timezone is
  'IANA tz for this queue''s SLA business-time clock. Conversation SLA uses queue tz; personal metrics use user tz.';

