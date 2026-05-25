import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, it } from "node:test";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const MIGRATION = join(
  REPO_ROOT,
  "supabase/migrations/20260523090000_meta_inbox_foundation.sql",
);
const migration = readFileSync(MIGRATION, "utf8");

describe("Meta inbox foundation migration", () => {
  it("creates the normalized inbox foundation tables", () => {
    for (const table of [
      "meta_inbox_queue_categories",
      "meta_inbox_teams",
      "meta_inbox_team_members",
      "meta_inbox_team_queue_access",
      "meta_inbox_customer_profiles",
      "meta_inbox_conversations",
      "meta_inbox_customer_contact_methods",
      "meta_inbox_first_touch_sources",
      "meta_inbox_conversation_events",
    ]) {
      assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
      assert.match(migration, new RegExp(`alter table public\\.%I enable row level security`));
      assert.match(migration, new RegExp(`'${table}'`));
    }
  });

  it("seeds every locked starter queue category", () => {
    for (const queue of [
      "cash_for_gold",
      "book_appointment",
      "us_product",
      "vn_product",
      "custom_jewelry",
      "repair_service",
      "general_inquiry",
      "uncategorized_needs_review",
    ]) {
      assert.match(migration, new RegExp(`'${queue}'`));
    }

    assert.match(migration, /on conflict \(environment, key\) do update/);
  });

  it("keeps queue category, source channel, status, quality, and outcome locked", () => {
    assert.match(migration, /queue_category_key text not null default 'uncategorized_needs_review'/);
    assert.match(migration, /source_channel text not null check/);
    assert.match(migration, /conversation_status text not null default 'new_inquiry'/);
    assert.match(migration, /lead_quality text check/);
    assert.match(migration, /lead_quality_reason_tags text\[\] not null default/);
    assert.match(migration, /inbox_outcome text not null default 'no_outcome_yet'/);
    assert.match(migration, /inbox_lost_reason text check/);
    assert.match(migration, /profile_key text not null/);
    assert.doesNotMatch(migration.toLowerCase(), /snooze/);
  });

  it("stores first-touch attribution and manager audit data", () => {
    for (const column of [
      "referral_json",
      "ads_context_data_json",
      "campaign_umbrella_id",
      "campaign_id",
      "adset_id",
      "ad_id",
      "creative_id",
      "raw_payload_json",
      "event_type",
      "previous_value",
      "new_value",
    ]) {
      assert.match(migration, new RegExp(column));
    }
  });

  it("keeps manager audit events append-only for application roles", () => {
    assert.match(migration, /if t = 'meta_inbox_conversation_events' then/);
    assert.match(migration, /dedupe_key text/);
    assert.match(migration, /meta_inbox_conversation_events_dedupe_idx/);
    assert.match(
      migration,
      /grant insert on table public\.%I to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest/,
    );
    assert.match(migration, /if t <> 'meta_inbox_conversation_events' then/);
  });

  it("enforces environment-scoped RLS for web, worker, and ingest roles", () => {
    assert.match(migration, /analytics\.current_ads_analyst_environment\(\)/);
    assert.match(migration, /analytics\.ads_analyst_environment_matches\(environment\)/);
    assert.match(
      migration,
      /to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest/,
    );
    assert.match(migration, /with check \(analytics\.ads_analyst_environment_matches\(environment\)\)/);
    assert.match(migration, /unique \(environment, canonical_conversation_key\)/);
    assert.match(migration, /unique \(environment, conversation_id\)/);
    assert.match(migration, /meta_inbox_customer_profiles_profile_key_idx/);
  });
});
