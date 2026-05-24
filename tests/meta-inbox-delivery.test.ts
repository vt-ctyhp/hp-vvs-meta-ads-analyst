import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildMetaInboxDeliveryFailureUpdate,
  buildMetaInboxDeliverySendingUpdate,
  buildMetaInboxDeliverySuccessUpdate,
  buildMetaInboxDeliveryTarget,
  isRetryableMetaInboxDeliveryFailure,
  nextRetryAtForAttempt,
  type MetaInboxDeliveryAttempt,
  type MetaInboxDeliveryConversation,
} from "../src/lib/meta-inbox-delivery.ts";
import { deliverQueuedMetaInboxSendAttempts } from "../src/lib/meta-inbox-delivery-worker.ts";

const NOW = "2026-05-24T12:00:00.000Z";

describe("Meta inbox delivery worker foundation", () => {
  it("builds a Facebook message send target with response messaging type", () => {
    const target = buildMetaInboxDeliveryTarget(
      conversationFixture({
        platform: "facebook",
        source_type: "message_thread",
        page_id: "page-1",
        participant_id: "customer-1",
        platform_thread_id: "thread-1",
      }),
      attemptFixture({ messaging_type: "RESPONSE" }),
    );

    assert.equal(target.sourceType, "message");
    assert.equal(target.pageSelector, "page-1");
    assert.equal(target.graphPath, "me/messages");
    assert.deepEqual(target.graphBody, {
      recipient: { id: "customer-1" },
      message: { text: "Thanks for reaching out." },
      messaging_type: "RESPONSE",
    });
  });

  it("builds a public comment reply target", () => {
    const target = buildMetaInboxDeliveryTarget(
      conversationFixture({
        source_type: "public_comment",
        source_id: "comment-1",
        platform_thread_id: null,
      }),
      attemptFixture(),
    );

    assert.equal(target.sourceType, "comment");
    assert.equal(target.graphPath, "comment-1/comments");
    assert.deepEqual(target.graphBody, { message: "Thanks for reaching out." });
  });

  it("marks queued attempts as sending without double-incrementing retry counts", () => {
    assert.equal(
      buildMetaInboxDeliverySendingUpdate(
        attemptFixture({ attempt_count: 0 }),
        { now: NOW },
      ).update.attempt_count,
      1,
    );
    assert.equal(
      buildMetaInboxDeliverySendingUpdate(
        attemptFixture({ attempt_count: 3 }),
        { now: NOW },
      ).update.attempt_count,
      3,
    );
  });

  it("marks successful Meta sends as sent and clears error details", () => {
    const update = buildMetaInboxDeliverySuccessUpdate(
      attemptFixture({ status: "sending" }),
      { metaSendId: "mid.123", sentAt: NOW },
    );

    assert.equal(update.update.status, "sent");
    assert.equal(update.update.meta_send_id, "mid.123");
    assert.equal(update.update.sent_at, NOW);
    assert.equal(update.update.meta_error_message, null);
    assert.equal(update.event.newValue.action, "delivered");
  });

  it("classifies transient Meta failures as retryable with backoff", () => {
    const failure = {
      message: "Meta temporarily unavailable",
      httpStatus: 500,
      code: 2,
      subcode: null,
      traceId: "trace-1",
      isTransient: true,
    };
    const update = buildMetaInboxDeliveryFailureUpdate(
      attemptFixture({ status: "sending", attempt_count: 2 }),
      failure,
      { now: NOW },
    );

    assert.equal(isRetryableMetaInboxDeliveryFailure(failure), true);
    assert.equal(update.update.status, "failed_retryable");
    assert.equal(update.update.next_retry_at, "2026-05-24T12:10:00.000Z");
    assert.equal(update.update.meta_error_code, 2);
    assert.equal(update.update.meta_trace_id, "trace-1");
  });

  it("terminalizes retryable Meta send failures after the max delivery attempts", () => {
    const update = buildMetaInboxDeliveryFailureUpdate(
      attemptFixture({ status: "sending", attempt_count: 5 }),
      {
        message: "Meta still unavailable",
        httpStatus: 500,
        code: 2,
        subcode: null,
        traceId: "trace-max",
        isTransient: true,
      },
      { now: NOW },
    );

    assert.equal(update.update.status, "failed_terminal");
    assert.equal(update.update.next_retry_at, null);
    assert.equal(update.event.metadata.maxAttemptsReached, true);
  });

  it("classifies auth and permission failures as terminal", () => {
    const update = buildMetaInboxDeliveryFailureUpdate(
      attemptFixture({ status: "sending", attempt_count: 1 }),
      {
        message: "Unsupported post request",
        httpStatus: 403,
        code: 200,
        subcode: 33,
        traceId: "trace-2",
        isTransient: false,
      },
      { now: NOW },
    );

    assert.equal(update.update.status, "failed_terminal");
    assert.equal(update.update.next_retry_at, null);
    assert.equal(update.update.meta_error_subcode, 33);
  });

  it("keeps the live delivery worker gated behind ALLOW_LIVE_META_SEND", () => {
    const worker = readFileSync("src/lib/meta-inbox-delivery-worker.ts", "utf8");
    const route = readFileSync("src/app/api/cron/meta-inbox-delivery/route.ts", "utf8");

    assert.match(worker, /isLiveSendEnabled\(\)/);
    assert.match(worker, /status: "disabled"/);
    assert.match(route, /isAuthorizedCronRequest/);
    assert.match(route, /deliverQueuedMetaInboxSendAttempts/);
  });

  it("uses capped exponential retry delays", () => {
    assert.equal(nextRetryAtForAttempt(NOW, 1), "2026-05-24T12:05:00.000Z");
    assert.equal(nextRetryAtForAttempt(NOW, 2), "2026-05-24T12:10:00.000Z");
    assert.equal(nextRetryAtForAttempt(NOW, 8), "2026-05-24T13:00:00.000Z");
  });

  it("does not mark a Meta-accepted send as failed when local audit persistence fails", async () => {
    const previousFlag = process.env.ALLOW_LIVE_META_SEND;
    const originalFetch = globalThis.fetch;
    process.env.ALLOW_LIVE_META_SEND = "true";
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message_id: "mid.accepted" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    try {
      const supabase = fakeDeliverySupabase({ failSecondEventInsert: true });
      const result = await deliverQueuedMetaInboxSendAttempts({
        limit: 1,
        now: NOW,
        supabase,
        managedPageResolver: async () => ({
          pageId: "page-1",
          accessToken: "page-token",
          igUserId: null,
        }),
      } as never);

      assert.equal(result.delivered, 1);
      assert.equal(result.failedRetryable, 0);
      assert.equal(result.failedTerminal, 0);
      assert.equal(
        supabase.updates.some((update) =>
          update.table === "meta_inbox_send_attempts" &&
          String(update.row.status || "").startsWith("failed_")
        ),
        false,
      );
      assert.equal(
        supabase.updates.some((update) =>
          update.table === "meta_inbox_send_attempts" &&
          update.row.status === "sent" &&
          update.row.meta_send_id === "mid.accepted"
        ),
        true,
      );
    } finally {
      globalThis.fetch = originalFetch;
      if (previousFlag === undefined) delete process.env.ALLOW_LIVE_META_SEND;
      else process.env.ALLOW_LIVE_META_SEND = previousFlag;
    }
  });

  it("delivers queued and due retryable send attempts while skipping future retries", async () => {
    const previousFlag = process.env.ALLOW_LIVE_META_SEND;
    const originalFetch = globalThis.fetch;
    process.env.ALLOW_LIVE_META_SEND = "true";
    const deliveredIds: string[] = [];
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body || "{}")) as {
        message?: { text?: string };
      };
      deliveredIds.push(body.message?.text || "unknown");
      return new Response(JSON.stringify({ message_id: `mid.${deliveredIds.length}` }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    try {
      const supabase = fakeDeliveryLifecycleSupabase([
        attemptFixture({
          id: "queued-send",
          reply_text: "queued-send",
          status: "queued",
          attempt_count: 1,
        }),
        attemptFixture({
          id: "due-retry-send",
          reply_text: "due-retry-send",
          status: "failed_retryable",
          attempt_count: 2,
          next_retry_at: "2026-05-24T11:59:00.000Z",
        }),
        attemptFixture({
          id: "future-retry-send",
          reply_text: "future-retry-send",
          status: "failed_retryable",
          attempt_count: 2,
          next_retry_at: "2026-05-24T12:30:00.000Z",
        }),
      ]);

      const result = await deliverQueuedMetaInboxSendAttempts({
        limit: 10,
        now: NOW,
        supabase,
        managedPageResolver: async () => ({
          pageId: "page-1",
          accessToken: "page-token",
          igUserId: null,
        }),
      } as never);

      assert.equal(result.scanned, 2);
      assert.equal(result.attempted, 2);
      assert.equal(result.delivered, 2);
      assert.deepEqual(deliveredIds, ["queued-send", "due-retry-send"]);
      assert.deepEqual(
        supabase.finalStatuses(),
        {
          "queued-send": "sent",
          "due-retry-send": "sent",
          "future-retry-send": "failed_retryable",
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
      if (previousFlag === undefined) delete process.env.ALLOW_LIVE_META_SEND;
      else process.env.ALLOW_LIVE_META_SEND = previousFlag;
    }
  });
});

function conversationFixture(
  overrides: Partial<MetaInboxDeliveryConversation> = {},
): MetaInboxDeliveryConversation {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    source_type: "message_thread",
    platform: "facebook",
    page_id: "page-1",
    ig_user_id: null,
    participant_id: "customer-1",
    platform_thread_id: "thread-1",
    source_id: "thread-1",
    ...overrides,
  };
}

function attemptFixture(
  overrides: Partial<MetaInboxDeliveryAttempt> = {},
): MetaInboxDeliveryAttempt {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    conversation_id: "33333333-3333-4333-8333-333333333333",
    reply_text: "Thanks for reaching out.",
    status: "queued",
    messaging_type: "RESPONSE",
    tag: null,
    attempt_count: 1,
    next_retry_at: null,
    attachment_ids: [],
    attachments: [],
    ...overrides,
  };
}

function fakeDeliverySupabase(options: { failSecondEventInsert?: boolean } = {}) {
  const attempt = attemptFixture();
  const conversation = conversationFixture();
  const updates: Array<{ table: string; row: Record<string, unknown> }> = [];
  let eventInsertCount = 0;

  return {
    updates,
    from(table: string) {
      if (table === "meta_inbox_send_attempts") {
        return {
          select() {
            return queryChain([{ ...attempt }]);
          },
          update(row: Record<string, unknown>) {
            updates.push({ table, row });
            return updateChain({ ...attempt, ...row });
          },
        };
      }

      if (table === "meta_inbox_conversations") {
        return {
          select() {
            return queryChain([{ ...conversation }]);
          },
        };
      }

      if (table === "meta_social_messages") {
        return insertChain({ id: "outbound-row-1" });
      }

      if (table === "meta_inbox_conversation_events") {
        return {
          insert(row: Record<string, unknown>) {
            eventInsertCount += 1;
            if (options.failSecondEventInsert && eventInsertCount === 2) {
              return selectSingleChain(null, new Error("audit insert failed"));
            }
            return selectSingleChain({ id: `event-${eventInsertCount}`, ...row });
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

function fakeDeliveryLifecycleSupabase(attempts: MetaInboxDeliveryAttempt[]) {
  const rowsById = new Map(
    attempts.map((attempt) => [
      attempt.id,
      {
        ...attempt,
        next_retry_at: "next_retry_at" in attempt ? attempt.next_retry_at : null,
      } as Record<string, unknown>,
    ]),
  );
  const conversation = conversationFixture();

  return {
    finalStatuses() {
      return Object.fromEntries(
        Array.from(rowsById.entries()).map(([id, row]) => [id, row.status]),
      );
    },
    from(table: string) {
      if (table === "meta_inbox_send_attempts") {
        return {
          select() {
            return lifecycleQueryChain(Array.from(rowsById.values()));
          },
          update(row: Record<string, unknown>) {
            return lifecycleUpdateChain(rowsById, row);
          },
        };
      }

      if (table === "meta_inbox_conversations") {
        return {
          select() {
            return queryChain([{ ...conversation }]);
          },
        };
      }

      if (table === "meta_social_messages") {
        return insertChain({ id: "outbound-row-1" });
      }

      if (table === "meta_inbox_conversation_events") {
        return {
          insert(row: Record<string, unknown>) {
            return selectSingleChain({ id: "event-1", ...row });
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

function queryChain(data: Record<string, unknown>[]) {
  let rows = data;
  return {
    eq(column: string, value: unknown) {
      rows = rows.filter((row) => row[column] === value);
      return this;
    },
    in(column: string, values: unknown[]) {
      rows = rows.filter((row) => values.includes(row[column]));
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return Promise.resolve({ data: rows, error: null });
    },
  };
}

function updateChain(row: Record<string, unknown>) {
  return {
    eq() {
      return this;
    },
    select() {
      return {
        maybeSingle: () => Promise.resolve({ data: row, error: null }),
        single: () => Promise.resolve({ data: { id: row.id }, error: null }),
      };
    },
  };
}

function lifecycleQueryChain(data: Record<string, unknown>[]) {
  let rows = data;
  return {
    eq(column: string, value: unknown) {
      rows = rows.filter((row) => row[column] === value);
      return this;
    },
    in(column: string, values: unknown[]) {
      rows = rows.filter((row) => values.includes(row[column]));
      return this;
    },
    order() {
      return this;
    },
    limit(count: number) {
      return Promise.resolve({ data: rows.slice(0, count), error: null });
    },
  };
}

function lifecycleUpdateChain(
  rowsById: Map<string, Record<string, unknown>>,
  update: Record<string, unknown>,
) {
  const filters: Array<[string, unknown]> = [];
  return {
    eq(column: string, value: unknown) {
      filters.push([column, value]);
      return this;
    },
    select() {
      return {
        maybeSingle: () => {
          const row = matchingLifecycleRow(rowsById, filters);
          if (!row) return Promise.resolve({ data: null, error: null });
          Object.assign(row, update);
          return Promise.resolve({ data: { ...row }, error: null });
        },
        single: () => {
          const row = matchingLifecycleRow(rowsById, filters);
          if (!row) return Promise.resolve({ data: null, error: new Error("row not found") });
          Object.assign(row, update);
          return Promise.resolve({ data: { id: row.id }, error: null });
        },
      };
    },
  };
}

function matchingLifecycleRow(
  rowsById: Map<string, Record<string, unknown>>,
  filters: Array<[string, unknown]>,
) {
  return Array.from(rowsById.values()).find((row) =>
    filters.every(([column, value]) => row[column] === value),
  ) || null;
}

function insertChain(row: Record<string, unknown>) {
  return {
    insert() {
      return selectSingleChain(row);
    },
  };
}

function selectSingleChain(data: Record<string, unknown> | null, error: Error | null = null) {
  return {
    select() {
      return {
        single: () => Promise.resolve({ data, error }),
      };
    },
  };
}
