import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  assertMetaInboxConversationMutationAccess,
  assertMetaInboxOperationalWriteAccess,
  type MetaInboxQueueAccessDecision,
} from "../src/lib/meta-inbox-access.ts";
import type { SocialInboxData } from "../src/lib/social-inbox.ts";

const SOCIAL_INBOX_LIB = readFileSync("src/lib/social-inbox.ts", "utf8");

describe("Meta inbox mutation authorization", () => {
  it("blocks read-only inbox roles from operational writes at the service boundary", () => {
    for (const role of ["marketing", "read_only", "client_advisor", "joc"]) {
      assert.throws(
        () =>
          assertMetaInboxOperationalWriteAccess({
            appUserId: "11111111-1111-4111-8111-111111111111",
            roles: [role],
            permissions: ["send_inbox_reply", "manage_inbox_state"],
          }),
        /sales, sales lead, or admin/i,
        role,
      );
    }
  });

  it("requires a linked app user before a sales operator can write", () => {
    assert.throws(
      () =>
        assertMetaInboxOperationalWriteAccess({
          appUserId: null,
          roles: ["sales"],
          permissions: ["send_inbox_reply"],
        }),
      /linked app user/i,
    );
  });

  it("allows sales and sales leads to mutate only conversations in accessible queues", () => {
    const access: MetaInboxQueueAccessDecision = {
      mode: "team",
      allowedQueueCategoryKeys: ["cash_for_gold", "book_appointment"],
      reason: "team_queue_access",
    };

    assert.doesNotThrow(() =>
      assertMetaInboxConversationMutationAccess(
        conversationFixture("cash_for_gold"),
        access,
        { targetQueueCategoryKey: "book_appointment" },
      ),
    );

    assert.throws(
      () =>
        assertMetaInboxConversationMutationAccess(
          conversationFixture("vn_product"),
          access,
        ),
      /access to this inbox queue/i,
    );

    assert.throws(
      () =>
        assertMetaInboxConversationMutationAccess(
          conversationFixture("cash_for_gold"),
          access,
          { targetQueueCategoryKey: "vn_product" },
        ),
      /target inbox queue/i,
    );
  });

  it("uses the mutation authorization helper inside exported inbox write helpers", () => {
    assert.match(SOCIAL_INBOX_LIB, /resolveSocialInboxMutationAccess/);
    assert.match(SOCIAL_INBOX_LIB, /assertMetaInboxOperationalWriteAccess/);
    assert.match(SOCIAL_INBOX_LIB, /assertMetaInboxConversationMutationAccess/);
  });

  it("protects every exported inbox mutation helper with service-level write access", () => {
    for (const helper of [
      "updateSocialInboxConversationWorkflow",
      "updateSocialInboxConversationContactMethod",
      "createSocialInboxSendAttempt",
      "retrySocialInboxSendAttempt",
      "queueSocialInboxSendAttempt",
      "createSocialInboxCommentAction",
      "queueSocialInboxCommentAction",
      "retrySocialInboxCommentAction",
      "createSocialInboxSavedReply",
      "updateSocialInboxSavedReplyStatus",
      "createSocialInboxConversationNote",
      "createSocialInboxQaScorecard",
    ]) {
      assert.match(exportedFunctionSource(helper), /resolveSocialInboxMutationAccess/, helper);
    }
  });

  it("checks conversation queue access before conversation-bound writes", () => {
    for (const helper of [
      "updateSocialInboxConversationWorkflow",
      "updateSocialInboxConversationContactMethod",
      "createSocialInboxSendAttempt",
      "retrySocialInboxSendAttempt",
      "queueSocialInboxSendAttempt",
      "createSocialInboxCommentAction",
      "queueSocialInboxCommentAction",
      "retrySocialInboxCommentAction",
      "createSocialInboxConversationNote",
      "createSocialInboxQaScorecard",
    ]) {
      assert.match(
        exportedFunctionSource(helper),
        /requireMutableConversation|assertMetaInboxConversationMutationAccess/,
        helper,
      );
    }
  });
});

function conversationFixture(
  queueCategoryKey: SocialInboxData["inboxConversations"][number]["queue_category_key"],
): Pick<SocialInboxData["inboxConversations"][number], "queue_category_key"> {
  return {
    queue_category_key: queueCategoryKey,
  };
}

function exportedFunctionSource(name: string) {
  const start = SOCIAL_INBOX_LIB.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `${name} should be exported`);

  const rest = SOCIAL_INBOX_LIB.slice(start);
  const next = rest.slice(1).search(/\nexport async function /);
  return next === -1 ? rest : rest.slice(0, next + 1);
}
