import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildMetaInboxConversationNoteCreate,
  canCreateManagerCoaching,
  mapMetaInboxConversationNoteRow,
  type MetaInboxConversationNoteActor,
} from "../src/lib/meta-inbox-notes.ts";
import { filterSocialInboxDataForQueueAccess } from "../src/lib/meta-inbox-access.ts";
import type { SocialInboxData } from "../src/lib/social-inbox.ts";

const MIGRATION = readFileSync(
  "supabase/migrations/20260524150000_meta_inbox_notes.sql",
  "utf8",
);
const ROUTE = readFileSync(
  "src/app/api/social-inbox/conversations/[conversationId]/notes/route.ts",
  "utf8",
);
const SOCIAL_INBOX_LIB = readFileSync("src/lib/social-inbox.ts", "utf8");
const DESKTOP_INBOX = readFileSync("src/components/social-inbox-client.tsx", "utf8");
const NOTES_DRAWER = readFileSync("src/components/v2/inbox/notes-drawer-panel.tsx", "utf8");
const SCHEMA_GUARD = readFileSync("src/lib/meta-inbox-schema.ts", "utf8");
const DATA_BOUNDARIES = readFileSync("src/lib/data-boundaries.ts", "utf8");

const NOW = "2026-05-24T15:00:00.000Z";
const CONVERSATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SALES_USER_ID = "11111111-1111-4111-8111-111111111111";
const SALES_LEAD_ID = "22222222-2222-4222-8222-222222222222";
const SALES: MetaInboxConversationNoteActor = { appUserId: SALES_USER_ID, roles: ["sales"] };
const SALES_LEAD: MetaInboxConversationNoteActor = {
  appUserId: SALES_LEAD_ID,
  roles: ["sales_lead"],
};

describe("Meta inbox notes and manager coaching foundation", () => {
  it("creates operational storage for internal notes and manager coaching", () => {
    assert.match(MIGRATION, /create table if not exists public\.meta_inbox_notes/);
    for (const column of [
      "conversation_id",
      "note_type",
      "body",
      "created_by",
      "mention_user_ids",
      "metadata",
      "deleted_at",
    ]) {
      assert.match(MIGRATION, new RegExp(column));
    }
    assert.match(MIGRATION, /note_type in \(/);
    assert.match(MIGRATION, /internal_note/);
    assert.match(MIGRATION, /manager_coaching/);
    assert.match(MIGRATION, /meta_inbox_notes_conversation_idx/);
    assert.match(MIGRATION, /meta_inbox_notes_actor_idx/);
    assert.match(MIGRATION, /meta_inbox_notes_mentions_idx/);
    assert.match(MIGRATION, /note_added/);
    assert.match(SCHEMA_GUARD, /20260524150000_meta_inbox_notes\.sql/);
    assert.match(SCHEMA_GUARD, /meta_inbox_notes/);
    assert.match(DATA_BOUNDARIES, /meta_inbox_notes/);
  });

  it("builds trimmed internal notes, mention IDs, and audit event metadata", () => {
    const mutation = buildMetaInboxConversationNoteCreate(
      CONVERSATION_ID,
      {
        body: "  Customer asked for a weekend follow-up.  ",
        mentionUserIds: [SALES_LEAD_ID, SALES_LEAD_ID, "not-a-uuid"],
      },
      SALES,
      NOW,
    );

    assert.equal(mutation.row.conversation_id, CONVERSATION_ID);
    assert.equal(mutation.row.note_type, "internal_note");
    assert.equal(mutation.row.body, "Customer asked for a weekend follow-up.");
    assert.equal(mutation.row.created_by, SALES_USER_ID);
    assert.deepEqual(mutation.row.mention_user_ids, [SALES_LEAD_ID]);
    assert.equal(mutation.event.eventType, "note_added");
    assert.deepEqual(mutation.event.newValue, {
      action: "created",
      noteType: "internal_note",
      hasMentions: true,
      mentionCount: 1,
    });
  });

  it("limits manager coaching creation to sales lead/admin", () => {
    assert.equal(canCreateManagerCoaching(SALES), false);
    assert.equal(canCreateManagerCoaching(SALES_LEAD), true);

    assert.throws(
      () =>
        buildMetaInboxConversationNoteCreate(
          CONVERSATION_ID,
          { noteType: "manager_coaching", body: "Tighten response framing." },
          SALES,
          NOW,
        ),
      /sales lead or admin/i,
    );

    const mutation = buildMetaInboxConversationNoteCreate(
      CONVERSATION_ID,
      { noteType: "manager_coaching", body: "Coach toward appointment ask." },
      SALES_LEAD,
      NOW,
    );
    assert.equal(mutation.row.note_type, "manager_coaching");
    assert.equal(mutation.event.metadata.noteType, "manager_coaching");
  });

  it("maps note rows without leaking raw Meta payload into product UI", () => {
    const note = mapMetaInboxConversationNoteRow({
      id: "note-1",
      conversation_id: CONVERSATION_ID,
      note_type: "manager_coaching",
      body: "Use clearer next step.",
      created_by: SALES_LEAD_ID,
      mention_user_ids: [SALES_USER_ID, "bad"],
      metadata: { source: "inbox_notes" },
      deleted_by: null,
      deleted_at: null,
      created_at: NOW,
      updated_at: NOW,
    });

    assert.equal(note.note_type, "manager_coaching");
    assert.deepEqual(note.mention_user_ids, [SALES_USER_ID]);
    assert.deepEqual(note.metadata, { source: "inbox_notes" });
  });

  it("shows notes only with conversations in the sales user's allowed queues", () => {
    const filtered = filterSocialInboxDataForQueueAccess(
      {
        queueAccess: {
          mode: "all",
          allowedQueueCategoryKeys: null,
          reason: "full_access_role",
        },
        threads: [],
        messages: [],
        comments: [],
        customerProfiles: [],
        customerContactMethods: [],
        firstTouchSources: [],
        sendAttempts: [],
        commentActions: [],
        conversationEvents: [],
        savedReplies: [],
        qaScorecards: [],
        syncRuns: [],
        inboxConversations: [
          conversationFixture("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "cash_for_gold"),
          conversationFixture("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "vn_product"),
        ],
        notes: [
          mapMetaInboxConversationNoteRow({
            id: "note-cash",
            conversation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            note_type: "internal_note",
            body: "Customer has weekend availability.",
            created_by: SALES_USER_ID,
            mention_user_ids: [],
            metadata: {},
            created_at: NOW,
            updated_at: NOW,
          }),
          mapMetaInboxConversationNoteRow({
            id: "note-vn",
            conversation_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            note_type: "manager_coaching",
            body: "Coach VN queue response separately.",
            created_by: SALES_LEAD_ID,
            mention_user_ids: [],
            metadata: {},
            created_at: NOW,
            updated_at: NOW,
          }),
        ],
      },
      {
        mode: "team",
        allowedQueueCategoryKeys: ["cash_for_gold"],
        reason: "team_queue_access",
      },
    );

    assert.deepEqual(
      filtered.notes.map((note) => [note.id, note.body]),
      [["note-cash", "Customer has weekend availability."]],
    );
  });

  it("wires protected API, data loading, queue filtering, and drawer UI", () => {
    assert.match(ROUTE, /requirePermissionFromRequest\(request, "manage_inbox_state"\)/);
    assert.match(ROUTE, /createSocialInboxConversationNote/);
    assert.match(SOCIAL_INBOX_LIB, /meta_inbox_notes/);
    assert.match(SOCIAL_INBOX_LIB, /notes: SocialInboxConversationNote\[\]/);
    assert.match(SOCIAL_INBOX_LIB, /note_added/);
    assert.match(DESKTOP_INBOX, /NotesDrawerPanel/);
    assert.match(NOTES_DRAWER, /Notes & Coaching/);
    assert.match(NOTES_DRAWER, /Add Note/);
    assert.match(NOTES_DRAWER, /never sent to the customer/);
    assert.match(DESKTOP_INBOX, /\/notes/);
  });
});

function conversationFixture(
  id: string,
  queueCategoryKey: SocialInboxData["inboxConversations"][number]["queue_category_key"],
): SocialInboxData["inboxConversations"][number] {
  return {
    id,
    canonical_conversation_key: `facebook:thread:${id}`,
    source_channel: "facebook_message",
    source_type: "message_thread",
    platform: "facebook",
    customer_profile_id: null,
    page_id: "page-1",
    ig_user_id: null,
    participant_id: "customer-1",
    platform_thread_id: id,
    parent_content_id: null,
    source_id: id,
    first_inbound_at: NOW,
    latest_inbound_at: NOW,
    latest_outbound_at: null,
    last_activity_at: NOW,
    needs_reply: true,
    reply_window_expires_at: null,
    human_agent_window_expires_at: null,
    send_eligibility: "standard_reply_allowed",
    conversation_status: "needs_reply",
    assigned_team_id: null,
    assigned_user_id: null,
    follow_up_at: null,
    lead_quality: null,
    lead_quality_reason_tags: [],
    inbox_outcome: "no_outcome_yet",
    inbox_lost_reason: null,
    queue_category_key: queueCategoryKey,
    routing_source: "ad_referral",
    routing_confidence: 0.9,
    routing_explanation: "Route by first-touch ad.",
  };
}
