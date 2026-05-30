import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";

import {
  computeConversationSearchHaystack,
} from "../src/components/v2/inbox/conversation-search-haystack.ts";
import { computeInboxHighlights } from "../src/components/v2/inbox/inbox-highlights.ts";
import {
  useDrawerState,
  type UseDrawerStateReturn,
} from "../src/components/v2/inbox/use-drawer-state.ts";
import {
  useInboxFilters,
  type UseInboxFiltersReturn,
} from "../src/components/v2/inbox/use-inbox-filters.ts";
import type { MetaInboxQueueDisplayItem } from "../src/lib/meta-inbox-queue-view.ts";

describe("inbox deep modules", () => {
  it("computes status-sentence highlights from queue state", () => {
    assert.deepEqual(computeInboxHighlights([]), [
      { text: "Inbox is empty for the current connection" },
    ]);
    assert.deepEqual(
      computeInboxHighlights([
        itemFixture({ id: "n1", status: "Needs reply" }),
        itemFixture({ id: "n2", status: "Needs reply" }),
      ]),
      [{ text: "2 needing reply", tone: "warning" }],
    );
    assert.deepEqual(
      computeInboxHighlights([
        itemFixture({ id: "s1", status: "Synced" }),
        itemFixture({ id: "n1", status: "Needs reply" }),
      ]),
      [{ text: "1 needing reply", tone: "warning" }],
    );
    assert.deepEqual(
      computeInboxHighlights([
        itemFixture({ id: "s1", status: "Synced" }),
        itemFixture({ id: "s2", status: "Synced" }),
      ]),
      [{ text: "2 threads, all caught up", tone: "positive" }],
    );
  });

  it("builds a lower-cased conversation search haystack with the locked field set", () => {
    assert.equal(
      computeConversationSearchHaystack(
        itemFixture({
          brand: "HP",
          channel: "Instagram",
          type: "message",
          status: "Needs reply",
          sender: "Ada Customer",
          preview: "Can you price this necklace?",
          routingExplanation: "Cash route from campaign.",
          sourceChannel: "instagram_message",
          queueCategoryKey: "cash_for_gold",
          profile: profileFixture({ username: "ada.gems" }),
          firstTouch: firstTouchFixture({
            campaign_umbrella_id: "cash-umbrella",
            campaign_id: "campaign-1",
            adset_id: "adset-1",
            ad_id: "ad-1",
            creative_id: "creative-1",
            ref: "cash-ref",
          }),
        }),
      ),
      "hp instagram message needs reply ada customer ada.gems can you price this necklace? cash route from campaign. cash-umbrella campaign-1 adset-1 ad-1 creative-1 cash-ref cash for gold instagram message",
    );
  });

  it("handles missing optional search fields without throwing", () => {
    assert.equal(
      computeConversationSearchHaystack(
        itemFixture({
          sender: "Fallback Customer",
          profile: null,
          firstTouch: null,
          routingExplanation: null,
        }),
      ),
      "hp facebook message synced fallback customer preview general inquiry facebook message",
    );
  });

  it("filters the queue by every supported control", () => {
    const queue = queueFixture();

    assert.deepEqual(ids(renderInboxFilters(queue)), ["cash", "book", "custom", "repair"]);
    assert.deepEqual(
      ids(
        renderInboxFilters(queue, (filters) => {
          if (filters.queueCategoryFilter !== "cash_for_gold") {
            filters.setQueueCategoryFilter("cash_for_gold");
          }
        }),
      ),
      ["cash"],
    );
    assert.deepEqual(
      ids(
        renderInboxFilters(queue, (filters) => {
          if (filters.sourceChannelFilter !== "instagram_message") {
            filters.setSourceChannelFilter("instagram_message");
          }
        }),
      ),
      ["cash", "repair"],
    );
    assert.deepEqual(
      ids(
        renderInboxFilters(queue, (filters) => {
          if (filters.campaignUmbrellaFilter !== "appointment-umbrella") {
            filters.setCampaignUmbrellaFilter("appointment-umbrella");
          }
        }),
      ),
      ["book"],
    );
    assert.deepEqual(
      ids(
        renderInboxFilters(queue, (filters) => {
          if (filters.adFilter !== "ad-custom") filters.setAdFilter("ad-custom");
        }),
      ),
      ["custom"],
    );
    assert.deepEqual(
      ids(
        renderInboxFilters(queue, (filters) => {
          if (filters.creativeFilter !== "creative-repair") {
            filters.setCreativeFilter("creative-repair");
          }
        }),
      ),
      ["repair"],
    );
    assert.deepEqual(
      ids(
        renderInboxFilters(queue, (filters) => {
          if (filters.itemTypeFilter !== "comments") filters.setItemTypeFilter("comments");
        }),
      ),
      ["book"],
    );
    assert.deepEqual(
      ids(
        renderInboxFilters(queue, (filters) => {
          if (filters.statusFilter !== "needs-reply") {
            filters.setStatusFilter("needs-reply");
          }
        }),
      ),
      ["cash", "custom"],
    );
    assert.deepEqual(
      ids(
        renderInboxFilters(queue, (filters) => {
          if (filters.brandFilter !== "VVS") filters.setBrandFilter("VVS");
        }),
      ),
      ["book", "repair"],
    );
    assert.deepEqual(
      ids(
        renderInboxFilters(queue, (filters) => {
          if (filters.sourceFilter !== "instagram") filters.setSourceFilter("instagram");
        }),
      ),
      ["cash", "repair"],
    );
  });

  it("filters by follow-up, independent of needs reply", () => {
    const queue = [
      itemFixture({
        id: "fu-needs",
        status: "Needs reply",
        inboxConversation: followUpConversation("2026-06-02T15:30:00.000Z"),
      }),
      itemFixture({
        id: "fu-synced",
        status: "Synced",
        inboxConversation: followUpConversation("2026-05-28T09:00:00.000Z"),
      }),
      itemFixture({ id: "no-fu", status: "Needs reply", inboxConversation: null }),
    ];

    // Follow-up surfaces every conversation with a follow-up date, whether or
    // not it also needs a reply.
    assert.deepEqual(
      ids(
        renderInboxFilters(queue, (filters) => {
          if (filters.statusFilter !== "follow-up") filters.setStatusFilter("follow-up");
        }),
      ),
      ["fu-needs", "fu-synced"],
    );

    // Needs-reply is independent: it ignores the follow-up date entirely.
    assert.deepEqual(
      ids(
        renderInboxFilters(queue, (filters) => {
          if (filters.statusFilter !== "needs-reply") filters.setStatusFilter("needs-reply");
        }),
      ),
      ["fu-needs", "no-fu"],
    );
  });

  it("combines filters as an intersection", () => {
    assert.deepEqual(
      ids(
        renderInboxFilters(queueFixture(), (filters) => {
          if (filters.brandFilter !== "HP") filters.setBrandFilter("HP");
          if (filters.sourceFilter !== "facebook") filters.setSourceFilter("facebook");
        }),
      ),
      ["custom"],
    );
  });

  it("searches every haystack field", () => {
    const queue = queueFixture();
    const cases: Array<[string, string[]]> = [
      ["Ada Customer", ["cash"]],
      ["ada.gems", ["cash"]],
      ["price necklace", ["cash"]],
      ["cash route", ["cash"]],
      ["cash-umbrella", ["cash"]],
      ["campaign-custom", ["custom"]],
      ["adset-repair", ["repair"]],
      ["ad-book", ["book"]],
      ["creative-repair", ["repair"]],
      ["book-ref", ["book"]],
      ["cash for gold", ["cash"]],
      ["instagram message", ["cash", "repair"]],
      ["vvs", ["book", "repair"]],
      ["facebook", ["book", "custom"]],
      ["comment", ["book"]],
    ];

    for (const [query, expectedIds] of cases) {
      assert.deepEqual(
        ids(
          renderInboxFilters(queue, (filters) => {
            if (filters.query !== query) filters.setQuery(query);
          }),
        ),
        expectedIds,
        query,
      );
    }
  });

  it("reports dirty filters, then reset clears filters and query", () => {
    const dirty = renderInboxFilters(queueFixture(), (filters) => {
      if (filters.query !== "ada") filters.setQuery("ada");
    });
    assert.equal(dirty.filtersDirty, true);

    const reset = renderInboxFiltersThroughReset(queueFixture());
    assert.equal(reset.filtersDirty, false);
    assert.equal(reset.query, "");
    assert.equal(reset.statusFilter, "all");
    assert.deepEqual(ids(reset), ["cash", "book", "custom", "repair"]);
  });

  it("returns deduplicated attribution filter options", () => {
    const filters = renderInboxFilters(queueFixture());

    assert.deepEqual(filters.attributionFilterOptions.campaignUmbrellas, [
      ["appointment-umbrella", "appointment-umbrella"],
      ["cash-umbrella", "cash-umbrella"],
      ["custom-umbrella", "custom-umbrella"],
      ["repair-umbrella", "repair-umbrella"],
    ]);
    assert.deepEqual(filters.attributionFilterOptions.ads, [
      ["ad-book", "book-ref · ad-book"],
      ["ad-cash", "cash-ref · ad-cash"],
      ["ad-custom", "custom-ref · ad-custom"],
      ["ad-repair", "repair-ref · ad-repair"],
    ]);
    assert.deepEqual(filters.attributionFilterOptions.creatives, [
      ["creative-book", "book-ref · creative-book"],
      ["creative-cash", "cash-ref · creative-cash"],
      ["creative-custom", "custom-ref · creative-custom"],
      ["creative-repair", "repair-ref · creative-repair"],
    ]);
  });

  it("keeps drawer state and preset transitions explicit", () => {
    assert.deepEqual(drawerStateAfterSteps([]), { drawer: null, preset: null });
    assert.deepEqual(drawerStateAfterSteps([(state) => state.open("audit")]), {
      drawer: "audit",
      preset: null,
    });
    assert.deepEqual(drawerStateAfterSteps([(state) => state.open("details", "close")]), {
      drawer: "details",
      preset: "close",
    });
    assert.deepEqual(
      drawerStateAfterSteps([
        (state) => state.open("details", "close"),
        (state) => state.close(),
      ]),
      { drawer: null, preset: null },
    );
    assert.deepEqual(
      drawerStateAfterSteps([
        (state) => state.open("details", "close"),
        (state) => state.open("notes"),
      ]),
      { drawer: "notes", preset: null },
    );
  });
});

function renderInboxFilters(
  queue: MetaInboxQueueDisplayItem[],
  configure?: (filters: UseInboxFiltersReturn) => void,
): UseInboxFiltersReturn {
  let captured: UseInboxFiltersReturn | null = null;

  function Probe() {
    const filters = useInboxFilters(queue);
    configure?.(filters);
    captured = filters;
    return React.createElement("div");
  }

  renderToString(React.createElement(Probe));
  return expectCaptured<UseInboxFiltersReturn>(captured, "inbox filters");
}

function renderInboxFiltersThroughReset(queue: MetaInboxQueueDisplayItem[]): UseInboxFiltersReturn {
  let captured: UseInboxFiltersReturn | null = null;

  function Probe() {
    const filters = useInboxFilters(queue);
    const [phase, setPhase] = React.useState(0);

    if (phase === 0) {
      filters.setQuery("ada");
      filters.setStatusFilter("needs-reply");
      setPhase(1);
    } else if (phase === 1) {
      filters.reset();
      setPhase(2);
    } else {
      captured = filters;
    }

    return React.createElement("div");
  }

  renderToString(React.createElement(Probe));
  return expectCaptured<UseInboxFiltersReturn>(captured, "reset inbox filters");
}

function drawerStateAfterSteps(steps: Array<(state: UseDrawerStateReturn) => void>) {
  let captured: Pick<UseDrawerStateReturn, "drawer" | "preset"> | null = null;

  function Probe() {
    const state = useDrawerState();
    const [step, setStep] = React.useState(0);

    if (step < steps.length) {
      steps[step](state);
      setStep(step + 1);
    } else {
      captured = { drawer: state.drawer, preset: state.preset };
    }

    return React.createElement("div");
  }

  renderToString(React.createElement(Probe));
  return expectCaptured<Pick<UseDrawerStateReturn, "drawer" | "preset">>(
    captured,
    "drawer state",
  );
}

function expectCaptured<T>(value: T | null, label: string): T {
  if (value === null) {
    throw new Error(`${label} probe did not render`);
  }
  return value;
}

function ids(filters: UseInboxFiltersReturn | MetaInboxQueueDisplayItem[]) {
  const queue = Array.isArray(filters) ? filters : filters.filteredQueue;
  return queue.map((item) => item.id);
}

function queueFixture() {
  return [
    itemFixture({
      id: "cash",
      brand: "HP",
      channel: "Instagram",
      platform: "instagram",
      type: "message",
      status: "Needs reply",
      sender: "Ada Customer",
      preview: "Can you price necklace?",
      routingExplanation: "Cash route from campaign.",
      sourceChannel: "instagram_message",
      queueCategoryKey: "cash_for_gold",
      profile: profileFixture({ username: "ada.gems" }),
      firstTouch: firstTouchFixture({
        campaign_umbrella_id: "cash-umbrella",
        campaign_id: "campaign-cash",
        adset_id: "adset-cash",
        ad_id: "ad-cash",
        creative_id: "creative-cash",
        ref: "cash-ref",
      }),
    }),
    itemFixture({
      id: "book",
      brand: "VVS",
      channel: "Facebook",
      platform: "facebook",
      type: "comment",
      status: "Synced",
      sender: "Ben Booker",
      preview: "Need Saturday visit.",
      routingExplanation: "Appointment route from comment.",
      sourceChannel: "facebook_public_comment",
      queueCategoryKey: "book_appointment",
      firstTouch: firstTouchFixture({
        campaign_umbrella_id: "appointment-umbrella",
        campaign_id: "campaign-book",
        adset_id: "adset-book",
        ad_id: "ad-book",
        creative_id: "creative-book",
        ref: "book-ref",
      }),
    }),
    itemFixture({
      id: "custom",
      brand: "HP",
      channel: "Facebook",
      platform: "facebook",
      type: "message",
      status: "Needs reply",
      sender: "Cora Custom",
      preview: "Can you remake my ring?",
      routingExplanation: "Custom route.",
      sourceChannel: "facebook_message",
      queueCategoryKey: "custom_jewelry",
      firstTouch: firstTouchFixture({
        campaign_umbrella_id: "custom-umbrella",
        campaign_id: "campaign-custom",
        adset_id: "adset-custom",
        ad_id: "ad-custom",
        creative_id: "creative-custom",
        ref: "custom-ref",
      }),
    }),
    itemFixture({
      id: "repair",
      brand: "VVS",
      channel: "Instagram",
      platform: "instagram",
      type: "message",
      status: "Synced",
      sender: "Rae Repair",
      preview: "Ring sizing question.",
      routingExplanation: "Repair route.",
      sourceChannel: "instagram_message",
      queueCategoryKey: "repair_service",
      firstTouch: firstTouchFixture({
        campaign_umbrella_id: "repair-umbrella",
        campaign_id: "campaign-repair",
        adset_id: "adset-repair",
        ad_id: "ad-repair",
        creative_id: "creative-repair",
        ref: "repair-ref",
      }),
    }),
  ];
}

function itemFixture(
  overrides: Partial<MetaInboxQueueDisplayItem> = {},
): MetaInboxQueueDisplayItem {
  return {
    id: "item",
    sourceId: "source",
    channel: "Facebook",
    platform: "facebook",
    brand: "HP",
    type: "message",
    sender: "Customer",
    preview: "Preview",
    status: "Synced",
    time: "1h",
    timestamp: "2026-05-24T12:00:00.000Z",
    sourceChannel: "facebook_message",
    queueCategoryKey: "general_inquiry",
    conversationStatus: "new_inquiry",
    sendEligibility: "unknown",
    replyWindowExpiresAt: null,
    humanAgentWindowExpiresAt: null,
    routingExplanation: null,
    routingConfidence: null,
    inboxConversation: null,
    profile: null,
    contactMethods: [],
    firstTouch: null,
    sendAttempts: [],
    commentActions: [],
    conversationEvents: [],
    savedReplies: [],
    notes: [],
    qaScorecards: [],
    ...overrides,
  };
}

function profileFixture(
  overrides: Partial<NonNullable<MetaInboxQueueDisplayItem["profile"]>> = {},
): NonNullable<MetaInboxQueueDisplayItem["profile"]> {
  return {
    id: "profile",
    platform: "instagram",
    page_id: null,
    ig_user_id: "ig-user",
    participant_id: "participant",
    display_name: "Ada Customer",
    username: "ada.gems",
    profile_picture_url: null,
    profile_url: null,
    profile_reference: "instagram:participant",
    last_profile_synced_at: null,
    ...overrides,
  };
}

function firstTouchFixture(
  overrides: Partial<NonNullable<MetaInboxQueueDisplayItem["firstTouch"]>> = {},
): NonNullable<MetaInboxQueueDisplayItem["firstTouch"]> {
  return {
    id: "first-touch",
    conversation_id: "conversation",
    first_message_id: null,
    first_message_at: null,
    ad_id: null,
    ref: null,
    source_post_id: null,
    source_media_id: null,
    source_comment_id: null,
    source_product_id: null,
    source_permalink: null,
    campaign_umbrella_id: null,
    campaign_id: null,
    adset_id: null,
    creative_id: null,
    attribution_method: "meta_referral",
    attribution_confidence: null,
    creative_image_url: null,
    ad_title: null,
    ...overrides,
  };
}

function followUpConversation(
  followUpAt: string,
): NonNullable<MetaInboxQueueDisplayItem["inboxConversation"]> {
  return { follow_up_at: followUpAt } as unknown as NonNullable<
    MetaInboxQueueDisplayItem["inboxConversation"]
  >;
}
