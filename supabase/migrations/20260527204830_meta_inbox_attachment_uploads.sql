-- Migration: meta_inbox_attachment_uploads
--
-- Shared Supabase ledger file. This repo writes seconds=30
-- so it cannot collide with the sales-standalone-app-v1 repo (which writes seconds=00).

-- Public bucket for operator-uploaded inbox attachments. Meta needs a
-- fetchable media URL when the delivery worker sends attachment payloads.
insert into storage.buckets (id, name, public)
values ('meta-inbox-attachments', 'meta-inbox-attachments', true)
on conflict (id) do update set public = excluded.public;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'ads_analyst_web_meta_inbox_attachment_write'
  ) then
    create policy ads_analyst_web_meta_inbox_attachment_write
      on storage.objects
      for all
      to ads_analyst_web, ads_analyst_worker
      using (bucket_id = 'meta-inbox-attachments')
      with check (bucket_id = 'meta-inbox-attachments');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'ads_analyst_web_meta_inbox_attachment_read'
  ) then
    create policy ads_analyst_web_meta_inbox_attachment_read
      on storage.objects
      for select
      to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest
      using (bucket_id = 'meta-inbox-attachments');
  end if;
end$$;

comment on table public.meta_inbox_attachments is
  'Normalized Meta inbox attachment metadata for inbound display, operator uploads, and outbound approved send attempts.';
