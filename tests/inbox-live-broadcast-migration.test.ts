import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const MIGRATIONS_DIR = resolve("supabase/migrations");

function migrationContaining(snippet: string): string {
  const file = readdirSync(MIGRATIONS_DIR)
    .filter((n) => n.endsWith(".sql"))
    .find((n) => readFileSync(resolve(MIGRATIONS_DIR, n), "utf8").includes(snippet));
  if (!file) throw new Error(`No migration contains: ${snippet}`);
  return readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
}

describe("inbox live broadcast migration", () => {
  const sql = migrationContaining("function analytics.broadcast_inbox_change");

  it("defines the active-inbox-user identity gate as SECURITY DEFINER and grants execute to authenticated", () => {
    assert.match(sql, /create or replace function analytics\.is_active_inbox_user\(\)/i);
    assert.match(sql, /security definer/i);
    assert.match(sql, /set search_path = ''/i);
    assert.match(sql, /ads_analyst_identity_profiles_v1/);
    assert.match(sql, /grant execute on function analytics\.is_active_inbox_user\(\) to authenticated/i);
    assert.match(sql, /revoke all on function analytics\.is_active_inbox_user\(\) from public/i);
  });

  it("adds a realtime.messages read policy scoped to inbox topics + active users", () => {
    assert.match(sql, /on realtime\.messages/i);
    assert.match(sql, /for select/i);
    assert.match(sql, /realtime\.topic\(\) like 'inbox:%'/);
    assert.match(sql, /analytics\.is_active_inbox_user\(\)/);
  });

  it("emits a content-free realtime.send ping that cannot block writes", () => {
    assert.match(sql, /perform realtime\.send\(/i);
    assert.match(sql, /'inbox-changed'/);
    assert.match(sql, /'inbox:' \|\| v_env/);
    assert.match(sql, /exception when others then/i);
  });

  it("fires AFTER INSERT OR UPDATE on conversations and conversation_events", () => {
    assert.match(
      sql,
      /create trigger meta_inbox_conversations_broadcast\s+after insert or update on public\.meta_inbox_conversations/i,
    );
    assert.match(
      sql,
      /create trigger meta_inbox_conversation_events_broadcast\s+after insert or update on public\.meta_inbox_conversation_events/i,
    );
  });
});
