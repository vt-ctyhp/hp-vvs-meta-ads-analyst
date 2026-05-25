import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { deliverQueuedMetaInboxCommentActions } from "../src/lib/meta-inbox-comment-action-worker.ts";

const WORKER = readFileSync("src/lib/meta-inbox-comment-action-worker.ts", "utf8");
const ROUTE = readFileSync("src/app/api/cron/meta-inbox-comment-actions/route.ts", "utf8");
const MIGRATION = readFileSync(
  "supabase/migrations/20260524120000_meta_inbox_comment_actions.sql",
  "utf8",
);
const ENVIRONMENT = "production";

describe("Meta inbox comment action delivery worker", () => {
  it("stays disabled unless live Meta sends are explicitly enabled", () => {
    assert.match(WORKER, /isLiveSendEnabled\(\)/);
    assert.match(WORKER, /status: "disabled"/);
    assert.match(WORKER, /live: false/);
    assert.match(WORKER, /succeeded: 0/);
  });

  it("processes queued comment actions through the delivery target helper", () => {
    assert.match(WORKER, /from\("meta_inbox_comment_actions"\)/);
    assert.match(WORKER, /\.in\("status", \["queued", "failed_retryable"\]\)/);
    assert.match(WORKER, /isCommentActionDueForDelivery/);
    assert.match(WORKER, /buildMetaInboxCommentActionSendingUpdate/);
    assert.match(WORKER, /buildMetaInboxCommentActionDeliveryTarget/);
    assert.match(WORKER, /managedPageResolver\(target\.pageSelector\)/);
    assert.match(WORKER, /buildMetaInboxCommentActionSuccessUpdate/);
    assert.match(WORKER, /buildMetaInboxCommentActionFailureUpdate/);
    assert.match(WORKER, /event_type: event\.eventType/);
  });

  it("uses the target Graph method, omits DELETE bodies, and records Meta responses", () => {
    assert.match(WORKER, /method: target\.graphMethod/);
    assert.match(WORKER, /target\.graphMethod !== "DELETE"/);
    assert.match(WORKER, /metaResponse: record/);
    assert.match(WORKER, /stringField\(record\.id\)/);
    assert.match(WORKER, /target\.expectedResultId/);
  });

  it("exposes an authorized cron route and queue index", () => {
    assert.match(ROUTE, /isAuthorizedCronRequest/);
    assert.match(ROUTE, /deliverQueuedMetaInboxCommentActions/);
    assert.match(ROUTE, /maxDuration = 120/);
    assert.match(MIGRATION, /meta_inbox_comment_actions_delivery_queue_idx/);
    assert.match(MIGRATION, /where status = 'queued'/);
  });

  it("does not mark a Meta-accepted comment action as failed when audit persistence fails", async () => {
    const previousFlag = process.env.ALLOW_LIVE_META_SEND;
    const originalFetch = globalThis.fetch;
    process.env.ALLOW_LIVE_META_SEND = "true";
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ id: "comment-action-accepted" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    try {
      const supabase = fakeCommentActionSupabase({ failSecondEventInsert: true });
      const result = await deliverQueuedMetaInboxCommentActions({
        limit: 1,
        now: "2026-05-24T12:00:00.000Z",
        supabase,
        managedPageResolver: async () => ({
          pageId: "page-1",
          accessToken: "page-token",
          igUserId: null,
        }),
      } as never);

      assert.equal(result.succeeded, 1);
      assert.equal(result.failedRetryable, 0);
      assert.equal(result.failedTerminal, 0);
      assert.equal(
        supabase.updates.some((update) =>
          update.table === "meta_inbox_comment_actions" &&
          String(update.row.status || "").startsWith("failed_")
        ),
        false,
      );
      assert.equal(
        supabase.updates.some((update) =>
          update.table === "meta_inbox_comment_actions" &&
          update.row.status === "succeeded" &&
          update.row.meta_action_id === "comment-action-accepted"
        ),
        true,
      );
    } finally {
      globalThis.fetch = originalFetch;
      if (previousFlag === undefined) delete process.env.ALLOW_LIVE_META_SEND;
      else process.env.ALLOW_LIVE_META_SEND = previousFlag;
    }
  });

  it("delivers queued and due retryable comment actions while skipping future retries", async () => {
    const previousFlag = process.env.ALLOW_LIVE_META_SEND;
    const originalFetch = globalThis.fetch;
    process.env.ALLOW_LIVE_META_SEND = "true";
    const deliveredBodies: string[] = [];
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body || "{}")) as { message?: string };
      deliveredBodies.push(body.message || "unknown");
      return new Response(JSON.stringify({ id: `comment-action-${deliveredBodies.length}` }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    try {
      const supabase = fakeCommentActionLifecycleSupabase([
        actionFixture({
          id: "queued-action",
          message_text: "queued-action",
          status: "queued",
        }),
        actionFixture({
          id: "due-retry-action",
          message_text: "due-retry-action",
          status: "failed_retryable",
          attempt_count: 2,
          next_retry_at: "2026-05-24T11:59:00.000Z",
        }),
        actionFixture({
          id: "future-retry-action",
          message_text: "future-retry-action",
          status: "failed_retryable",
          attempt_count: 2,
          next_retry_at: "2026-05-24T12:30:00.000Z",
        }),
      ]);

      const result = await deliverQueuedMetaInboxCommentActions({
        limit: 10,
        now: "2026-05-24T12:00:00.000Z",
        supabase,
        managedPageResolver: async () => ({
          pageId: "page-1",
          accessToken: "page-token",
          igUserId: null,
        }),
      } as never);

      assert.equal(result.scanned, 2);
      assert.equal(result.attempted, 2);
      assert.equal(result.succeeded, 2);
      assert.deepEqual(deliveredBodies, ["queued-action", "due-retry-action"]);
      assert.deepEqual(
        supabase.finalStatuses(),
        {
          "queued-action": "succeeded",
          "due-retry-action": "succeeded",
          "future-retry-action": "failed_retryable",
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
      if (previousFlag === undefined) delete process.env.ALLOW_LIVE_META_SEND;
      else process.env.ALLOW_LIVE_META_SEND = previousFlag;
    }
  });
});

function actionFixture(overrides: Record<string, unknown> = {}) {
  return {
    environment: ENVIRONMENT,
    id: "55555555-5555-4555-8555-555555555555",
    conversation_id: "33333333-3333-4333-8333-333333333333",
    comment_id: "comment-1",
    action_type: "public_reply",
    message_text: "Thanks for reaching out.",
    reason_note: null,
    status: "queued",
    attempt_count: 1,
    next_retry_at: null,
    meta_error_message: null,
    ...overrides,
  };
}

function fakeCommentActionSupabase(options: { failSecondEventInsert?: boolean } = {}) {
  const action = actionFixture();
  const conversation = {
    environment: ENVIRONMENT,
    id: "33333333-3333-4333-8333-333333333333",
    source_type: "public_comment",
    source_id: "comment-1",
    platform: "facebook",
    page_id: "page-1",
    ig_user_id: null,
  };
  const updates: Array<{ table: string; row: Record<string, unknown> }> = [];
  let eventInsertCount = 0;

  return {
    updates,
    from(table: string) {
      if (table === "meta_inbox_comment_actions") {
        return {
          select() {
            return queryChain([{ ...action }]);
          },
          update(row: Record<string, unknown>) {
            updates.push({ table, row });
            return updateChain({ ...action, ...row });
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

function fakeCommentActionLifecycleSupabase(actions: Record<string, unknown>[]) {
  const rowsById = new Map<string, Record<string, unknown>>(actions.map((action) => [
    String(action.id),
    { ...action, environment: ENVIRONMENT },
  ]));
  const conversation = {
    environment: ENVIRONMENT,
    id: "33333333-3333-4333-8333-333333333333",
    source_type: "public_comment",
    source_id: "comment-1",
    platform: "facebook",
    page_id: "page-1",
    ig_user_id: null,
  };

  return {
    finalStatuses() {
      return Object.fromEntries(
        Array.from(rowsById.entries()).map(([id, row]) => [id, row.status]),
      );
    },
    from(table: string) {
      if (table === "meta_inbox_comment_actions") {
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

function selectSingleChain(data: Record<string, unknown> | null, error: Error | null = null) {
  return {
    select() {
      return {
        single: () => Promise.resolve({ data, error }),
      };
    },
  };
}
