import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  resolveMetaInboxCommentActionIdempotency,
  resolveMetaInboxSendAttemptIdempotency,
} from "../src/lib/meta-inbox-idempotency.ts";

const SOCIAL_INBOX = readFileSync("src/lib/social-inbox.ts", "utf8");
const COMMENT_ACTION_IDEMPOTENCY_MIGRATION = readFileSync(
  "supabase/migrations/20260524170000_meta_inbox_comment_action_idempotency_key_scope.sql",
  "utf8",
);

describe("Meta inbox create idempotency", () => {
  it("returns an existing send attempt for the same key and same payload", () => {
    const existing = sendAttempt({ id: "attempt-existing", idempotency_key: "submit-1" });
    const decision = resolveMetaInboxSendAttemptIdempotency(existing, {
      ...sendAttempt({ id: "attempt-new", idempotency_key: "submit-1" }),
      status: "approved",
    });

    assert.deepEqual(decision, { action: "return_existing", row: existing });
  });

  it("rejects a send attempt when the same key is reused with changed payload", () => {
    assert.throws(
      () =>
        resolveMetaInboxSendAttemptIdempotency(
          sendAttempt({ idempotency_key: "submit-1", reply_text: "First reply" }),
          sendAttempt({ idempotency_key: "submit-1", reply_text: "Changed reply" }),
        ),
      /idempotency key.*different send attempt payload/i,
    );
  });

  it("allows a later same-text send attempt when the submit key is new", () => {
    const decision = resolveMetaInboxSendAttemptIdempotency(
      sendAttempt({ idempotency_key: "submit-1", reply_text: "Same text" }),
      sendAttempt({ idempotency_key: "submit-2", reply_text: "Same text" }),
    );

    assert.deepEqual(decision, { action: "insert" });
  });

  it("returns an existing comment action for the same key and same payload", () => {
    const existing = commentAction({ id: "action-existing", idempotency_key: "comment-submit-1" });
    const decision = resolveMetaInboxCommentActionIdempotency(existing, {
      ...commentAction({ id: "action-new", idempotency_key: "comment-submit-1" }),
      status: "approved",
    });

    assert.deepEqual(decision, { action: "return_existing", row: existing });
  });

  it("rejects a comment action when the same key is reused with changed payload", () => {
    assert.throws(
      () =>
        resolveMetaInboxCommentActionIdempotency(
          commentAction({
            idempotency_key: "comment-submit-1",
            action_type: "hide",
            reason_note: "Spam link",
          }),
          commentAction({
            idempotency_key: "comment-submit-1",
            action_type: "delete",
            reason_note: "Spam link",
          }),
        ),
      /idempotency key.*different comment action payload/i,
    );
  });

  it("allows a later same comment reply when the submit key is new", () => {
    const decision = resolveMetaInboxCommentActionIdempotency(
      commentAction({ idempotency_key: "comment-submit-1", message_text: "Please DM us" }),
      commentAction({ idempotency_key: "comment-submit-2", message_text: "Please DM us" }),
    );

    assert.deepEqual(decision, { action: "insert" });
  });

  it("wires create paths through the idempotency resolver before inserting", () => {
    assert.match(SOCIAL_INBOX, /resolveMetaInboxSendAttemptIdempotency/);
    assert.match(SOCIAL_INBOX, /selectExistingSendAttemptForIdempotency/);
    assert.match(SOCIAL_INBOX, /resolveMetaInboxCommentActionIdempotency/);
    assert.match(SOCIAL_INBOX, /selectExistingCommentActionForIdempotency/);
  });

  it("keeps comment action idempotency unique by submit key across action types", () => {
    assert.match(COMMENT_ACTION_IDEMPOTENCY_MIGRATION, /drop index if exists meta_inbox_comment_actions_idempotency_idx/);
    assert.match(
      COMMENT_ACTION_IDEMPOTENCY_MIGRATION,
      /on public\.meta_inbox_comment_actions \(\s*environment,\s*conversation_id,\s*idempotency_key\s*\)/,
    );
  });
});

function sendAttempt(overrides: Record<string, unknown> = {}) {
  return {
    id: "attempt-1",
    conversation_id: "conversation-1",
    reply_text: "Thanks, we can help.",
    messaging_type: "RESPONSE",
    tag: null,
    attachment_ids: [],
    idempotency_key: "submit-1",
    status: "approved",
    ...overrides,
  };
}

function commentAction(overrides: Record<string, unknown> = {}) {
  return {
    id: "comment-action-1",
    conversation_id: "conversation-1",
    comment_id: "comment-1",
    action_type: "public_reply",
    message_text: "Please DM us",
    reason_note: null,
    idempotency_key: "comment-submit-1",
    status: "approved",
    ...overrides,
  };
}
