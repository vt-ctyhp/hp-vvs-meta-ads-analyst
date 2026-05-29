import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildMetaInboxSavedReplyCreate,
  buildMetaInboxSavedReplyStatusUpdate,
  canApproveSharedSavedReplies,
  filterMetaInboxSavedRepliesForConversation,
  type MetaInboxSavedReply,
  type MetaInboxSavedReplyActor,
} from "../src/lib/meta-inbox-saved-replies.ts";

const MIGRATION = readFileSync(
  "supabase/migrations/20260524140000_meta_inbox_saved_replies.sql",
  "utf8",
);
const ROUTE = readFileSync("src/app/api/social-inbox/saved-replies/route.ts", "utf8");
const SOCIAL_INBOX_LIB = readFileSync("src/lib/social-inbox.ts", "utf8");
const INBOX_MUTATIONS = readFileSync(
  "src/components/v2/inbox/use-social-inbox-mutations.ts",
  "utf8",
);
const REPLY_COMPOSER = readFileSync("src/components/v2/inbox/reply-composer.tsx", "utf8");
const SCHEMA_GUARD = readFileSync("src/lib/meta-inbox-schema.ts", "utf8");
const DATA_BOUNDARIES = readFileSync("src/lib/data-boundaries.ts", "utf8");

const NOW = "2026-05-24T12:00:00.000Z";
const SALES_USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const SALES: MetaInboxSavedReplyActor = { appUserId: SALES_USER_ID, roles: ["sales"] };
const SALES_LEAD: MetaInboxSavedReplyActor = {
  appUserId: OTHER_USER_ID,
  roles: ["sales_lead"],
};

describe("Meta inbox saved replies foundation", () => {
  it("creates scoped storage for personal drafts and approved shared templates", () => {
    assert.match(MIGRATION, /create table if not exists public\.meta_inbox_saved_replies/);
    for (const column of [
      "title",
      "body",
      "visibility",
      "approval_status",
      "owner_user_id",
      "created_by",
      "approved_by",
      "queue_category_key",
      "source_channel",
      "language",
      "lead_quality",
      "usage_count",
    ]) {
      assert.match(MIGRATION, new RegExp(column));
    }
    assert.match(MIGRATION, /visibility in \('personal', 'shared'\)/);
    assert.match(MIGRATION, /approval_status in/);
    assert.match(MIGRATION, /meta_inbox_saved_replies_lookup_idx/);
    assert.match(MIGRATION, /meta_inbox_saved_replies_owner_idx/);
    assert.match(MIGRATION, /meta_inbox_saved_replies_shared_review_idx/);
    assert.match(SCHEMA_GUARD, /meta_inbox_saved_replies/);
    assert.match(DATA_BOUNDARIES, /meta_inbox_saved_replies/);
  });

  it("creates personal drafts owned by one sales user", () => {
    const result = buildMetaInboxSavedReplyCreate(
      {
        title: "Price follow-up",
        body: "Thanks for reaching out. Do you have a target budget?",
        queueCategoryKey: "custom_jewelry",
        sourceChannel: "instagram_message",
        leadQuality: "medium_intent",
      },
      SALES,
      NOW,
    );

    assert.equal(result.row.visibility, "personal");
    assert.equal(result.row.approval_status, "draft");
    assert.equal(result.row.owner_user_id, SALES_USER_ID);
    assert.equal(result.row.created_by, SALES_USER_ID);
    assert.equal(result.row.approved_by, null);
    assert.equal(result.row.queue_category_key, "custom_jewelry");
    assert.equal(result.row.source_channel, "instagram_message");
    assert.equal(result.row.lead_quality, "medium_intent");
  });

  it("routes shared templates through sales lead/admin approval", () => {
    const pending = buildMetaInboxSavedReplyCreate(
      {
        title: "Appointment CTA",
        body: "We can help. What day works best for a visit?",
        visibility: "shared",
        queueCategoryKey: "book_appointment",
      },
      SALES,
      NOW,
    );
    assert.equal(pending.row.visibility, "shared");
    assert.equal(pending.row.approval_status, "pending_approval");
    assert.equal(pending.row.approved_by, null);

    assert.equal(canApproveSharedSavedReplies(SALES), false);
    assert.equal(canApproveSharedSavedReplies(SALES_LEAD), true);
    assert.throws(
      () =>
        buildMetaInboxSavedReplyCreate(
          {
            title: "Direct approve",
            body: "Approved body",
            visibility: "shared",
            approveShared: true,
          },
          SALES,
          NOW,
        ),
      /sales lead or admin/i,
    );

    const approved = buildMetaInboxSavedReplyCreate(
      {
        title: "Lead approved",
        body: "Approved body",
        visibility: "shared",
        approveShared: true,
      },
      SALES_LEAD,
      NOW,
    );
    assert.equal(approved.row.approval_status, "approved");
    assert.equal(approved.row.approved_by, OTHER_USER_ID);

    const update = buildMetaInboxSavedReplyStatusUpdate(
      savedReplyFixture({ visibility: "shared", approval_status: "pending_approval" }),
      { approvalStatus: "approved" },
      SALES_LEAD,
      NOW,
    );
    assert.equal(update.approval_status, "approved");
    assert.equal(update.approved_by, OTHER_USER_ID);
    assert.equal(update.approved_at, NOW);
  });

  it("filters templates by actor, queue, source, language, and lead quality", () => {
    const filtered = filterMetaInboxSavedRepliesForConversation(
      [
        savedReplyFixture({ id: "personal-match", visibility: "personal", owner_user_id: SALES_USER_ID }),
        savedReplyFixture({ id: "shared-match", queue_category_key: "cash_for_gold" }),
        savedReplyFixture({ id: "shared-other-queue", queue_category_key: "vn_product" }),
        savedReplyFixture({ id: "shared-other-source", source_channel: "instagram_message" }),
        savedReplyFixture({ id: "shared-other-language", language: "vi" }),
        savedReplyFixture({ id: "shared-pending", approval_status: "pending_approval" }),
        savedReplyFixture({ id: "other-personal", visibility: "personal", owner_user_id: OTHER_USER_ID }),
        savedReplyFixture({
          id: "high-intent",
          queue_category_key: "cash_for_gold",
          lead_quality: "high_intent",
        }),
      ],
      {
        actorUserId: SALES_USER_ID,
        queueCategoryKey: "cash_for_gold",
        sourceChannel: "facebook_message",
        leadQuality: "high_intent",
        language: "en",
      },
    );

    assert.deepEqual(
      filtered.map((reply) => reply.id),
      ["high-intent", "shared-match", "personal-match"],
    );
  });

  it("wires protected API, data loading, and composer UI", () => {
    assert.match(ROUTE, /requirePermissionFromRequest\(request, "send_inbox_reply"\)/);
    assert.match(ROUTE, /requirePermissionFromRequest\(request, "manage_inbox_state"\)/);
    assert.match(ROUTE, /createSocialInboxSavedReply/);
    assert.match(ROUTE, /updateSocialInboxSavedReplyStatus/);
    assert.match(SOCIAL_INBOX_LIB, /meta_inbox_saved_replies/);
    assert.match(SOCIAL_INBOX_LIB, /savedReplies: SocialInboxSavedReply\[\]/);
    assert.match(SOCIAL_INBOX_LIB, /filterMetaInboxSavedRepliesForProfile/);
    assert.match(REPLY_COMPOSER, /Insert a saved reply/);
    assert.match(REPLY_COMPOSER, /Save as template/);
    assert.match(REPLY_COMPOSER, /Shared/);
    assert.match(INBOX_MUTATIONS, /\/api\/social-inbox\/saved-replies/);
  });
});

function savedReplyFixture(
  overrides: Partial<MetaInboxSavedReply> = {},
): MetaInboxSavedReply {
  return {
    id: "reply-1",
    title: "Template",
    body: "Thanks for reaching out.",
    visibility: "shared",
    approval_status: "approved",
    owner_user_id: null,
    created_by: SALES_USER_ID,
    approved_by: SALES_USER_ID,
    approved_at: NOW,
    queue_category_key: null,
    source_channel: null,
    language: "en",
    lead_quality: null,
    active: true,
    usage_count: 0,
    last_used_at: null,
    metadata: {},
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}
