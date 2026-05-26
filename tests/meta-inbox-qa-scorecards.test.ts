import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildMetaInboxQaScorecardCreate,
  canCreateMetaInboxQaScorecard,
  mapMetaInboxQaScorecardRow,
  type MetaInboxQaScorecardActor,
} from "../src/lib/meta-inbox-qa-scorecards.ts";
import { buildMetaInboxManagerDashboard } from "../src/lib/meta-inbox-manager-dashboard.ts";
import { filterSocialInboxDataForQueueAccess } from "../src/lib/meta-inbox-access.ts";
import type { SocialInboxData } from "../src/lib/social-inbox.ts";

const MIGRATION = readFileSync(
  "supabase/migrations/20260524160000_meta_inbox_qa_scorecards.sql",
  "utf8",
);
const ROUTE = readFileSync(
  "src/app/api/social-inbox/conversations/[conversationId]/qa-scorecards/route.ts",
  "utf8",
);
const SOCIAL_INBOX_LIB = readFileSync("src/lib/social-inbox.ts", "utf8");
const MANAGER_DASHBOARD_LIB = readFileSync("src/lib/meta-inbox-manager-dashboard.ts", "utf8");
const DESKTOP_INBOX = readFileSync("src/components/social-inbox-client.tsx", "utf8");
const INBOX_MUTATIONS = readFileSync(
  "src/components/v2/inbox/use-social-inbox-mutations.ts",
  "utf8",
);
const INBOX_EYEBROW = readFileSync("src/components/v2/inbox/inbox-eyebrow.tsx", "utf8");
const QA_DRAWER = readFileSync("src/components/v2/inbox/qa-drawer-panel.tsx", "utf8");
const SCHEMA_GUARD = readFileSync("src/lib/meta-inbox-schema.ts", "utf8");
const DATA_BOUNDARIES = readFileSync("src/lib/data-boundaries.ts", "utf8");

const NOW = "2026-05-24T16:00:00.000Z";
const CONVERSATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SEND_ATTEMPT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SALES_USER_ID = "11111111-1111-4111-8111-111111111111";
const SALES_LEAD_ID = "22222222-2222-4222-8222-222222222222";
const SALES: MetaInboxQaScorecardActor = { appUserId: SALES_USER_ID, roles: ["sales"] };
const SALES_LEAD: MetaInboxQaScorecardActor = {
  appUserId: SALES_LEAD_ID,
  roles: ["sales_lead"],
};

describe("Meta inbox QA scorecards foundation", () => {
  it("creates optional QA scorecard storage for manager coaching", () => {
    assert.match(MIGRATION, /create table if not exists public\.meta_inbox_qa_scorecards/);
    for (const column of [
      "conversation_id",
      "send_attempt_id",
      "reviewed_user_id",
      "reviewed_by",
      "tone_score",
      "completeness_score",
      "accuracy_score",
      "next_step_score",
      "speed_score",
      "policy_compliance_score",
      "overall_score",
      "coaching_note",
    ]) {
      assert.match(MIGRATION, new RegExp(column));
    }
    assert.match(MIGRATION, /qa_scorecard_added/);
    assert.match(SCHEMA_GUARD, /20260524160000_meta_inbox_qa_scorecards\.sql/);
    assert.match(SCHEMA_GUARD, /meta_inbox_qa_scorecards/);
    assert.match(DATA_BOUNDARIES, /meta_inbox_qa_scorecards/);
  });

  it("lets sales leads create scored reviews with audit metadata", () => {
    const mutation = buildMetaInboxQaScorecardCreate(
      CONVERSATION_ID,
      {
        sendAttemptId: SEND_ATTEMPT_ID,
        reviewedUserId: SALES_USER_ID,
        toneScore: 5,
        completenessScore: 4,
        accuracyScore: 5,
        nextStepScore: 4,
        speedScore: 3,
        policyComplianceScore: 5,
        coachingNote: "  Strong tone. Ask for appointment sooner next time.  ",
      },
      SALES_LEAD,
      NOW,
    );

    assert.equal(mutation.row.conversation_id, CONVERSATION_ID);
    assert.equal(mutation.row.send_attempt_id, SEND_ATTEMPT_ID);
    assert.equal(mutation.row.reviewed_user_id, SALES_USER_ID);
    assert.equal(mutation.row.reviewed_by, SALES_LEAD_ID);
    assert.equal(mutation.row.overall_score, 4.3);
    assert.equal(mutation.row.coaching_note, "Strong tone. Ask for appointment sooner next time.");
    assert.deepEqual(mutation.event.newValue, {
      action: "created",
      qaScorecardId: null,
      reviewedUserId: SALES_USER_ID,
      sendAttemptId: SEND_ATTEMPT_ID,
      overallScore: 4.3,
    });
  });

  it("blocks frontline sales from creating manager QA scorecards", () => {
    assert.equal(canCreateMetaInboxQaScorecard(SALES), false);
    assert.equal(canCreateMetaInboxQaScorecard(SALES_LEAD), true);
    assert.throws(
      () =>
        buildMetaInboxQaScorecardCreate(
          CONVERSATION_ID,
          qaInput(),
          SALES,
          NOW,
        ),
      /sales lead or admin/i,
    );
  });

  it("shows QA only with conversations in the sales lead's allowed queues", () => {
    const filtered = filterSocialInboxDataForQueueAccess(dataFixture(), {
      mode: "team",
      allowedQueueCategoryKeys: ["cash_for_gold"],
      reason: "team_queue_access",
    });

    assert.deepEqual(
      filtered.qaScorecards.map((scorecard) => [scorecard.id, scorecard.overall_score]),
      [["qa-cash", 4.3]],
    );
  });

  it("rolls QA scorecards into the manager dashboard", () => {
    const dashboard = buildMetaInboxManagerDashboard(dataFixture(), {
      now: NOW,
    });

    assert.equal(dashboard.metrics.qaScorecardsReviewed, 2);
    assert.equal(dashboard.metrics.averageQaScore, 3.9);
    assert.match(MANAGER_DASHBOARD_LIB, /qaScorecardsReviewed/);
    assert.match(INBOX_EYEBROW, /QA avg/);
    assert.match(INBOX_EYEBROW, /averageQaScore/);
  });

  it("wires protected API, data loading, audit event, and QA drawer UI", () => {
    assert.match(ROUTE, /requirePermissionFromRequest\(request, "manage_inbox_state"\)/);
    assert.match(ROUTE, /createSocialInboxQaScorecard/);
    assert.match(SOCIAL_INBOX_LIB, /meta_inbox_qa_scorecards/);
    assert.match(SOCIAL_INBOX_LIB, /qaScorecards: SocialInboxQaScorecard\[\]/);
    assert.match(SOCIAL_INBOX_LIB, /qa_scorecard_added/);
    assert.match(DESKTOP_INBOX, /QaDrawerPanel/);
    assert.match(QA_DRAWER, /QA Scorecards/);
    assert.match(QA_DRAWER, /Add Scorecard/);
    assert.match(QA_DRAWER, /manager coaching only/);
    assert.match(INBOX_MUTATIONS, /\/qa-scorecards/);
  });
});

function qaInput() {
  return {
    toneScore: 4,
    completenessScore: 4,
    accuracyScore: 4,
    nextStepScore: 4,
    speedScore: 4,
    policyComplianceScore: 4,
  };
}

function dataFixture(): SocialInboxData {
  return {
    queueAccess: { mode: "all", allowedQueueCategoryKeys: null, reason: "full_access_role" },
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
    notes: [],
    syncRuns: [],
    inboxConversations: [
      conversationFixture("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "cash_for_gold"),
      conversationFixture("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "vn_product"),
    ],
    qaScorecards: [
      scorecardFixture({
        id: "qa-cash",
        conversation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        overall_score: 4.3,
      }),
      scorecardFixture({
        id: "qa-vn",
        conversation_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        overall_score: 3.5,
      }),
    ],
  };
}

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
    latest_outbound_at: NOW,
    last_activity_at: NOW,
    needs_reply: false,
    reply_window_expires_at: null,
    human_agent_window_expires_at: null,
    send_eligibility: "standard_reply_allowed",
    conversation_status: "needs_reply",
    assigned_team_id: null,
    assigned_user_id: null,
    follow_up_at: null,
    lead_quality: "high_intent",
    lead_quality_reason_tags: ["asked_price"],
    inbox_outcome: "no_outcome_yet",
    inbox_lost_reason: null,
    queue_category_key: queueCategoryKey,
    routing_source: "ad_referral",
    routing_confidence: 0.9,
    routing_explanation: "Route by first-touch ad.",
  };
}

function scorecardFixture(
  overrides: Partial<SocialInboxData["qaScorecards"][number]> = {},
): SocialInboxData["qaScorecards"][number] {
  return mapMetaInboxQaScorecardRow({
    id: "qa",
    conversation_id: CONVERSATION_ID,
    send_attempt_id: SEND_ATTEMPT_ID,
    reviewed_user_id: SALES_USER_ID,
    reviewed_by: SALES_LEAD_ID,
    tone_score: 4,
    completeness_score: 4,
    accuracy_score: 4,
    next_step_score: 4,
    speed_score: 4,
    policy_compliance_score: 4,
    overall_score: 4,
    coaching_note: null,
    metadata: {},
    deleted_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  });
}
