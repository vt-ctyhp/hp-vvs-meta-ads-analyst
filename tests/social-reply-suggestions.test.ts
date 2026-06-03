import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { streamSocialReply, suggestSocialReply } from "../src/lib/social-reply-suggestions.ts";
import type {
  AnthropicReplyClient,
  AnthropicReplyStreamClient,
} from "../src/lib/social-reply-anthropic.ts";
import type { SocialInboxConversationHistory } from "../src/lib/social-inbox.ts";

type JsonRecord = Record<string, unknown>;

describe("social reply suggestions", () => {
  it("uses normalized conversation history and stores Anthropic audit metadata", async () => {
    const supabase = fakeSupabase({
      ai_reply_prompt_profiles: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          brand: "HP",
          active: true,
          name: "HP closer",
          version: 2,
          business_context: "Move gold sellers into store assessment.",
          sales_guidance: "Do not quote remotely.",
          tone_guidance: "Warm and concise.",
          disallowed_claims: ["guaranteed payout"],
        },
      ],
      ai_reply_training_examples: [
        {
          id: "example-1",
          brand: "HP",
          prompt_profile_id: "55555555-5555-4555-8555-555555555555",
          active: true,
          title: "Gold visit",
          conversation_messages: [
            { speaker: "Customer", body: "Can I sell gold?" },
            { speaker: "Team", body: "Yes, please visit for assessment." },
          ],
          ideal_response: "Yes, please come in and our team can assess it for you.",
          critique: "Good because it avoids remote quote.",
          updated_at: "2026-06-01T10:00:00.000Z",
        },
      ],
    });
    const anthropicClient: AnthropicReplyClient = {
      messages: {
        async parse(request) {
          assert.match(JSON.stringify(request.messages), /Can I sell my gold today/);
          // Brand profile + examples now live in the cacheable system blocks, not the user turn.
          assert.match(JSON.stringify(request.system), /Move gold sellers into store assessment/);
          assert.match(JSON.stringify(request.system), /Yes, please come in and our team can assess it/);
          return {
            parsed_output: {
              draft: "Yes, please come by today and we can assess it in store.",
              strategy: "Customer wants cash for gold, so in-store assessment is the right close.",
              nextBestAction: "invite_to_store",
              confidence: "high",
              suggestedLanguage: "en",
              toneNotes: ["Direct close"],
              riskFlags: ["No payout quote"],
            },
            usage: { input_tokens: 200, output_tokens: 60 },
          };
        },
      },
    };

    const result = await withEnv(
      {
        AI_REPLY_SUGGESTIONS_ENABLED: "true",
        ANTHROPIC_REPLY_MODEL: "claude-test",
      },
      () =>
        suggestSocialReply(
          {
            conversationId: "33333333-3333-4333-8333-333333333333",
            language: "auto",
            staffGuidance: "Invite in today if natural.",
          },
          {
            appUserId: "11111111-1111-4111-8111-111111111111",
            roles: ["sales"],
            permissions: ["send_inbox_reply"],
          },
          {
            history: historyFixture(),
            supabase: supabase as never,
            anthropicClient,
          },
        ),
    );

    assert.equal(result.suggestionId, "99999999-9999-4999-8999-999999999999");
    assert.equal(result.nextBestAction, "invite_to_store");
    assert.equal(result.contextUsed.transcriptItems, 1);
    const insert = supabase.inserts.find((row) => row.table === "ai_reply_suggestions");
    assert.equal(insert?.row.conversation_id, "33333333-3333-4333-8333-333333333333");
    assert.equal(insert?.row.thread_id, "thread-1");
    assert.equal(insert?.row.comment_id, null);
    assert.equal(insert?.row.provider, "anthropic");
    assert.equal(insert?.row.prompt_profile_id, "55555555-5555-4555-8555-555555555555");
    assert.equal(insert?.row.next_best_action, "invite_to_store");
    assert.deepEqual(insert?.row.risk_flags, ["No payout quote"]);
  });
});

describe("social reply streaming", () => {
  it("streams growing draft snapshots and persists the final structured suggestion", async () => {
    const supabase = fakeSupabase({});
    const drafts: string[] = [];
    const snapshots = [
      '{"draft":"Yes',
      '{"draft":"Yes, please come by today',
      '{"draft":"Yes, please come by today.","strategy":"In-store assessment closes the sale."',
    ];

    const anthropicStreamClient: AnthropicReplyStreamClient = {
      messages: {
        stream(request) {
          assert.match(JSON.stringify(request.messages), /Can I sell my gold today/);
          const listeners: Array<(delta: string, snapshot: string) => void> = [];
          const messageStream = {
            on(_event: "text", listener: (delta: string, snapshot: string) => void) {
              listeners.push(listener);
              return messageStream;
            },
            async finalMessage() {
              for (const snapshot of snapshots) {
                for (const listener of listeners) listener("", snapshot);
              }
              return {
                parsed_output: {
                  draft: "Yes, please come by today.",
                  strategy: "In-store assessment closes the sale.",
                  nextBestAction: "invite_to_store",
                  confidence: "high",
                  suggestedLanguage: "en",
                  toneNotes: ["Direct close"],
                  riskFlags: ["No payout quote"],
                },
                usage: { input_tokens: 180, output_tokens: 40 },
              };
            },
          };
          return messageStream;
        },
      },
    };

    const result = await withEnv(
      { AI_REPLY_SUGGESTIONS_ENABLED: "true", ANTHROPIC_REPLY_MODEL: "claude-test" },
      () =>
        streamSocialReply(
          { conversationId: "33333333-3333-4333-8333-333333333333", language: "auto" },
          {
            appUserId: "11111111-1111-4111-8111-111111111111",
            roles: ["sales"],
            permissions: ["send_inbox_reply"],
          },
          {
            history: historyFixture(),
            supabase: supabase as never,
            anthropicStreamClient,
            onDraftDelta: (draft) => drafts.push(draft),
          },
        ),
    );

    // Each distinct snapshot surfaces a longer draft; duplicates are suppressed.
    assert.deepEqual(drafts, [
      "Yes",
      "Yes, please come by today",
      "Yes, please come by today.",
    ]);
    assert.equal(result.draft, "Yes, please come by today.");
    assert.equal(result.suggestionId, "99999999-9999-4999-8999-999999999999");
    assert.equal(result.nextBestAction, "invite_to_store");
    const insert = supabase.inserts.find((row) => row.table === "ai_reply_suggestions");
    assert.equal(insert?.row.draft, "Yes, please come by today.");
    assert.equal(insert?.row.next_best_action, "invite_to_store");
    assert.deepEqual(insert?.row.risk_flags, ["No payout quote"]);
  });
});

function fakeSupabase(dataByTable: Record<string, JsonRecord[]>) {
  const inserts: Array<{ table: string; row: JsonRecord }> = [];

  return {
    inserts,
    from(table: string) {
      return {
        select() {
          return fakeQuery(dataByTable[table] || []);
        },
        insert(row: JsonRecord) {
          inserts.push({ table, row });
          return fakeQuery([{ id: "99999999-9999-4999-8999-999999999999" }]);
        },
      };
    },
  };
}

function fakeQuery(seedRows: JsonRecord[]) {
  const filters: Array<{ column: string; value: unknown }> = [];
  let limitCount: number | null = null;

  const query = {
    select() {
      return query;
    },
    eq(column: string, value: unknown) {
      filters.push({ column, value });
      return query;
    },
    order() {
      return query;
    },
    limit(count: number) {
      limitCount = count;
      return query;
    },
    maybeSingle() {
      const rows = filteredRows();
      return Promise.resolve({ data: rows[0] || null, error: null });
    },
    single() {
      const rows = filteredRows();
      return Promise.resolve({ data: rows[0] || null, error: null });
    },
    then(
      resolve: (value: { data: JsonRecord[]; error: null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve({ data: filteredRows(), error: null }).then(resolve, reject);
    },
  };

  function filteredRows() {
    const rows = seedRows.filter((row) =>
      filters.every((filter) => row[filter.column] === filter.value),
    );
    return limitCount === null ? rows : rows.slice(0, limitCount);
  }

  return query;
}

function historyFixture(): SocialInboxConversationHistory {
  return {
    conversation: {
      id: "33333333-3333-4333-8333-333333333333",
      canonical_conversation_key: "instagram:thread-1",
      source_channel: "instagram_message",
      source_type: "message_thread",
      platform: "instagram",
      customer_profile_id: "profile-1",
      page_id: "page-1",
      ig_user_id: "ig-1",
      participant_id: "customer-1",
      platform_thread_id: "thread-1",
      parent_content_id: null,
      source_id: "thread-1",
      first_inbound_at: "2026-06-01T10:00:00.000Z",
      latest_inbound_at: "2026-06-01T10:00:00.000Z",
      latest_outbound_at: null,
      last_activity_at: "2026-06-01T10:00:00.000Z",
      needs_reply: true,
      reply_window_expires_at: "2026-06-02T10:00:00.000Z",
      human_agent_window_expires_at: "2026-06-08T10:00:00.000Z",
      send_eligibility: "standard_reply_allowed",
      conversation_status: "needs_reply",
      assigned_team_id: null,
      assigned_user_id: null,
      follow_up_at: null,
      lead_quality: null,
      lead_quality_reason_tags: [],
      inbox_outcome: "no_outcome_yet",
      inbox_lost_reason: null,
      queue_category_key: "cash_for_gold",
      routing_source: "ai",
      routing_confidence: 0.9,
      routing_explanation: null,
    },
    messages: [
      {
        id: "message-1",
        platform: "instagram",
        thread_id: "thread-1",
        message_id: "mid-1",
        direction: "inbound",
        sender_id: "customer-1",
        sender_name: "Emma",
        recipient_id: "page-1",
        recipient_name: "HP",
        body: "Can I sell my gold today?",
        attachments: [],
        sent_at: "2026-06-01T10:00:00.000Z",
      },
    ],
    comments: [],
    pageInfo: {
      pageSize: 1,
      returned: 1,
      knownTotal: 1,
      nextCursor: null,
      historyCompleteness: "complete_known_history",
    },
  };
}

async function withEnv<T>(
  values: Record<string, string | undefined>,
  callback: () => Promise<T>,
) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
