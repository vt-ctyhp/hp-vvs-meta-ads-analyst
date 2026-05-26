import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildMetaInboxPresenceHeartbeat,
  filterActiveMetaInboxPresence,
  type MetaInboxPresenceRecord,
} from "../src/lib/meta-inbox-presence.ts";

const MIGRATION = readFileSync(
  "supabase/migrations/20260524130000_meta_inbox_presence.sql",
  "utf8",
);
const ROUTE = readFileSync(
  "src/app/api/social-inbox/conversations/[conversationId]/presence/route.ts",
  "utf8",
);
const SOCIAL_INBOX_LIB = readFileSync("src/lib/social-inbox.ts", "utf8");
const DESKTOP_INBOX = readFileSync("src/components/social-inbox-client.tsx", "utf8");
const PRESENCE_COLLISION_BANNER = readFileSync(
  "src/components/v2/inbox/presence-collision-banner.tsx",
  "utf8",
);
const SELECTED_ITEM_DETAIL = readFileSync(
  "src/components/v2/inbox/selected-item-detail.tsx",
  "utf8",
);

const NOW = "2026-05-24T12:00:00.000Z";
const CONVERSATION_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

describe("Meta inbox presence collision prevention", () => {
  it("creates ephemeral presence storage without conversation audit events", () => {
    assert.match(MIGRATION, /create table if not exists public\.meta_inbox_presence/);
    assert.match(MIGRATION, /activity in \('viewing', 'typing', 'replying'\)/);
    assert.match(MIGRATION, /meta_inbox_presence_user_conversation_idx/);
    assert.match(MIGRATION, /meta_inbox_presence_active_conversation_idx/);
    assert.match(MIGRATION, /Ephemeral operational state only; no conversation audit event is written/);
  });

  it("builds a bounded heartbeat row for viewing, typing, or replying", () => {
    const heartbeat = buildMetaInboxPresenceHeartbeat(
      CONVERSATION_ID,
      { activity: "replying" },
      {
        actorUserId: ACTOR_ID,
        displayName: "Vivian Sales Lead",
        now: NOW,
        ttlSeconds: 999,
      },
    );

    assert.equal(heartbeat.row.conversation_id, CONVERSATION_ID);
    assert.equal(heartbeat.row.app_user_id, ACTOR_ID);
    assert.equal(heartbeat.row.display_name, "Vivian Sales Lead");
    assert.equal(heartbeat.row.activity, "replying");
    assert.equal(heartbeat.row.last_seen_at, NOW);
    assert.equal(heartbeat.expiresAt, "2026-05-24T12:02:00.000Z");

    assert.throws(
      () =>
        buildMetaInboxPresenceHeartbeat(
          CONVERSATION_ID,
          { activity: "viewing" },
          { actorUserId: "local-test-app-user", now: NOW },
        ),
      /valid inbox user/i,
    );
  });

  it("filters out self and expired presence, prioritizing active reply conflicts", () => {
    const active = filterActiveMetaInboxPresence(
      [
        presenceFixture({ app_user_id: ACTOR_ID, activity: "replying" }),
        presenceFixture({ app_user_id: OTHER_ID, activity: "viewing" }),
        presenceFixture({
          app_user_id: "55555555-5555-4555-8555-555555555555",
          activity: "replying",
          expires_at: "2026-05-24T11:59:59.000Z",
        }),
        presenceFixture({
          app_user_id: "66666666-6666-4666-8666-666666666666",
          display_name: "Typing Teammate",
          activity: "typing",
          last_seen_at: "2026-05-24T12:00:10.000Z",
        }),
      ],
      { currentUserId: ACTOR_ID, now: NOW },
    );

    assert.deepEqual(
      active.map((presence) => [presence.display_name, presence.activity]),
      [
        ["Typing Teammate", "typing"],
        ["Other Teammate", "viewing"],
      ],
    );
  });

  it("exposes protected API and desktop warning UI", () => {
    assert.match(ROUTE, /requirePermissionFromRequest\(request, "view_inbox"\)/);
    assert.match(ROUTE, /recordSocialInboxPresence/);
    assert.match(SOCIAL_INBOX_LIB, /recordSocialInboxPresence/);
    assert.match(SOCIAL_INBOX_LIB, /send_inbox_reply/);
    assert.match(SOCIAL_INBOX_LIB, /meta_inbox_presence/);
    assert.match(SELECTED_ITEM_DETAIL, /PresenceCollisionBanner/);
    assert.match(DESKTOP_INBOX, /\/presence/);
    assert.match(PRESENCE_COLLISION_BANNER, /is replying now/);
    assert.match(PRESENCE_COLLISION_BANNER, /Advisory collision warning only/);
  });
});

function presenceFixture(
  overrides: Partial<MetaInboxPresenceRecord> = {},
): MetaInboxPresenceRecord {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    conversation_id: CONVERSATION_ID,
    app_user_id: OTHER_ID,
    display_name: "Other Teammate",
    activity: "viewing",
    last_seen_at: NOW,
    expires_at: "2026-05-24T12:01:00.000Z",
    ...overrides,
  };
}
