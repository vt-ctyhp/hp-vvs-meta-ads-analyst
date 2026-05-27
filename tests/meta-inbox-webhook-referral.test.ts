import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  webhookReferralRow,
  webhookMessageRow,
} from "../src/lib/meta-webhook-shape.ts";
import {
  applyCampaignUmbrellaRouting,
  buildMetaInboxNormalizationBatch,
  enrichFirstTouchSourceWithAd,
  type MetaAdsLookupRow,
  type MetaInboxFirstTouchCandidate,
} from "../src/lib/meta-inbox-normalization.ts";

describe("webhook referral capture", () => {
  it("extracts thread and referral from a messaging_referrals event", () => {
    const row = webhookReferralRow(
      "page",
      { id: "page-1" },
      {
        sender: { id: "customer-1", name: "Agnes A." },
        recipient: { id: "page-1" },
        timestamp: 1748246280000,
        referral: {
          ref: "cash-for-gold-may",
          ad_id: "ad-555",
          source: "ADS",
          type: "OPEN_THREAD",
          ads_context_data: {
            ad_title: "Cash for Gold – May 2026",
            photo_url: "https://cdn.example/ad.jpg",
          },
        },
      },
    );

    assert.ok(row, "should return a row");
    assert.equal(row.thread.platform, "facebook");
    assert.equal(row.thread.page_id, "page-1");
    assert.equal(row.thread.participant_id, "customer-1");
    assert.equal(row.thread.participant_name, "Agnes A.");
    assert.equal(row.thread.thread_type, "message");

    assert.ok(row.referral, "should include referral record");
    assert.equal(row.referral.ad_id, "ad-555");
    assert.equal(row.referral.ref, "cash-for-gold-may");
    assert.equal(row.referral.source, "ADS");
    assert.equal(row.referral.type, "OPEN_THREAD");
    assert.deepEqual(row.referral.ads_context_data, {
      ad_title: "Cash for Gold – May 2026",
      photo_url: "https://cdn.example/ad.jpg",
    });

    // referral data is embedded at paths firstTouchFromMessage searches
    const threadRaw = row.thread.raw_json as Record<string, unknown>;
    const embeddedReferral = threadRaw.referral as Record<string, unknown>;
    assert.equal(embeddedReferral.ad_id, "ad-555");
    assert.equal(embeddedReferral.ref, "cash-for-gold-may");
  });

  it("extracts thread and referral from an Instagram messaging_referral event", () => {
    // Instagram uses object='instagram' and singular 'messaging_referral'
    // field name on the webhook subscription. Field name differs but the
    // event payload shape is the same as Facebook's (referral block with
    // ref, ad_id, source, type, ads_context_data). This test guards the
    // platform-detection branch in webhookReferralRow.
    const row = webhookReferralRow(
      "instagram",
      { id: "ig-user-1" },
      {
        sender: { id: "ig-customer-1", username: "agnes_a" },
        recipient: { id: "ig-user-1" },
        timestamp: 1748246280000,
        referral: {
          ref: "cash-for-gold-may",
          ad_id: "ad-555",
          source: "ADS",
          type: "OPEN_THREAD",
          ads_context_data: {
            ad_title: "Cash for Gold – May 2026",
          },
        },
      },
    );

    assert.ok(row, "should return a row");
    assert.equal(row.thread.platform, "instagram");
    assert.equal(row.thread.ig_user_id, "ig-user-1");
    assert.equal(row.thread.page_id, null);
    assert.equal(row.thread.participant_id, "ig-customer-1");
    assert.equal(row.thread.participant_name, "agnes_a");
    assert.equal(row.thread.thread_id, "instagram:webhook:ig-user-1:ig-customer-1");
    assert.equal(row.referral.ad_id, "ad-555");
    assert.equal(row.referral.ref, "cash-for-gold-may");
    assert.equal(row.referral.source, "ADS");
  });

  it("returns null when no referral block present", () => {
    const row = webhookReferralRow(
      "page",
      { id: "page-1" },
      {
        sender: { id: "customer-1" },
        recipient: { id: "page-1" },
        timestamp: 1748246280000,
        message: { mid: "mid.1", text: "hi" },
      },
    );

    assert.equal(row, null);
  });
});

describe("webhookMessageRow referral embedding", () => {
  it("embeds event.message.referral into thread raw_json", () => {
    const row = webhookMessageRow(
      "page",
      { id: "page-1" },
      {
        sender: { id: "customer-1", name: "Chris B." },
        recipient: { id: "page-1" },
        message: {
          mid: "mid.1",
          text: "Interested in selling gold",
          referral: {
            ad_id: "ad-777",
            ref: "sell-gold-promo",
            source_url: "https://fb.me/source",
            ads_context_data: {
              ad_title: "Sell Gold Promo",
            },
          },
        },
        timestamp: 1748246280000,
      },
    );

    assert.ok(row);
    const threadRaw = row.thread.raw_json as Record<string, unknown>;
    const referral = threadRaw.referral as Record<string, unknown>;
    assert.equal(referral.ad_id, "ad-777");
    assert.equal(referral.ref, "sell-gold-promo");
  });
});

describe("inbound-only message text scanning", () => {
  it("does not route by outbound auto-reply keywords", () => {
    const batch = buildMetaInboxNormalizationBatch({
      now: new Date("2026-05-23T01:00:00.000Z"),
      threads: [
        {
          id: "thread-1",
          platform: "facebook",
          thread_id: "facebook:webhook:page-1:customer-1",
          page_id: "page-1",
          participant_id: "customer-1",
          snippet: "Hello",
          last_message_at: "2026-05-23T00:01:00.000Z",
        },
      ],
      messages: [
        {
          id: "msg-inbound",
          platform: "facebook",
          thread_id: "facebook:webhook:page-1:customer-1",
          message_id: "mid.1",
          direction: "inbound",
          sender_id: "customer-1",
          body: "Hello, I have a question",
          sent_at: "2026-05-23T00:00:00.000Z",
        },
        {
          id: "msg-outbound",
          platform: "facebook",
          thread_id: "facebook:webhook:page-1:customer-1",
          message_id: "mid.2",
          direction: "outbound",
          sender_id: "page-1",
          body: "Thank you for your interest! Would you like to book an appointment for a consultation?",
          sent_at: "2026-05-23T00:01:00.000Z",
        },
      ],
    });

    assert.equal(batch.conversations[0].queueCategoryKey, "general_inquiry");
    assert.equal(batch.conversations[0].routingSource, "fallback");
    assert.equal(batch.conversations[0].routingConfidence, 0.35);
    assert.ok(
      batch.conversations[0].routingExplanation.includes("No ad attribution captured"),
      `Expected honest explanation, got: ${batch.conversations[0].routingExplanation}`,
    );
  });

  it("enriches first-touch source with campaign/adset/creative when ad row resolves", () => {
    const base: MetaInboxFirstTouchCandidate = {
      canonicalConversationKey: "key",
      firstMessageId: null,
      firstMessageAt: null,
      referralJson: { ad_id: "ad-555" },
      adId: "ad-555",
      adsContextDataJson: {},
      ref: null,
      sourcePostId: null,
      sourceMediaId: null,
      sourceCommentId: null,
      sourceProductId: null,
      sourcePermalink: null,
      campaignUmbrellaId: null,
      campaignId: null,
      adsetId: null,
      creativeId: null,
      attributionMethod: "meta_referral",
      attributionConfidence: 0.95,
      rawPayloadJson: {},
    };

    const enriched = enrichFirstTouchSourceWithAd(base, {
      ad_id: "ad-555",
      campaign_id: "camp-1",
      ad_set_id: "as-1",
      creative_id: "cre-1",
      campaign_name: "Cash for Gold – May 2026",
      ad_set_name: "CFG May All",
      campaign_umbrella: null,
    });

    assert.equal(enriched.campaignId, "camp-1");
    assert.equal(enriched.adsetId, "as-1");
    assert.equal(enriched.creativeId, "cre-1");
    // Stored umbrella missing → falls back to regex classification of the
    // campaign + ad-set names; "Cash for Gold" pattern matches.
    assert.equal(enriched.campaignUmbrellaId, "Cash for Gold US");
  });

  it("prefers the stored campaign_umbrella over re-running the regex classifier", () => {
    const base: MetaInboxFirstTouchCandidate = {
      canonicalConversationKey: "key",
      firstMessageId: null,
      firstMessageAt: null,
      referralJson: { ad_id: "ad-stored" },
      adId: "ad-stored",
      adsContextDataJson: {},
      ref: null,
      sourcePostId: null,
      sourceMediaId: null,
      sourceCommentId: null,
      sourceProductId: null,
      sourcePermalink: null,
      campaignUmbrellaId: null,
      campaignId: null,
      adsetId: null,
      creativeId: null,
      attributionMethod: "meta_referral",
      attributionConfidence: 0.95,
      rawPayloadJson: {},
    };

    // Stored umbrella ("Book Appts US") deliberately disagrees with what
    // the regex would derive from the campaign name ("Cash for Gold ...").
    // The stored value wins because it already accounts for analyst
    // overrides + inherited classification.
    const enriched = enrichFirstTouchSourceWithAd(base, {
      ad_id: "ad-stored",
      campaign_id: "camp-stored",
      ad_set_id: null,
      creative_id: null,
      campaign_name: "Cash for Gold relaunch",
      ad_set_name: null,
      campaign_umbrella: "Book Appts US",
    });

    assert.equal(enriched.campaignUmbrellaId, "Book Appts US");
  });

  it("leaves first-touch source unchanged when no ad row resolves", () => {
    const base: MetaInboxFirstTouchCandidate = {
      canonicalConversationKey: "key",
      firstMessageId: null,
      firstMessageAt: null,
      referralJson: { ad_id: "ad-unknown" },
      adId: "ad-unknown",
      adsContextDataJson: {},
      ref: null,
      sourcePostId: null,
      sourceMediaId: null,
      sourceCommentId: null,
      sourceProductId: null,
      sourcePermalink: null,
      campaignUmbrellaId: null,
      campaignId: null,
      adsetId: null,
      creativeId: null,
      attributionMethod: "meta_referral",
      attributionConfidence: 0.95,
      rawPayloadJson: {},
    };

    const enriched = enrichFirstTouchSourceWithAd(base, null);

    assert.equal(enriched.campaignId, null);
    assert.equal(enriched.adsetId, null);
    assert.equal(enriched.creativeId, null);
    assert.equal(enriched.campaignUmbrellaId, null);
    assert.equal(enriched.attributionMethod, "meta_referral");
    assert.equal(enriched.attributionConfidence, 0.95);
  });

  it("does not auto-route by inbound message keywords (umbrella routing only)", () => {
    // Previously a body containing "book appointment" was enough to route
    // the thread into the book_appointment queue. That produced too many
    // false positives (a customer saying "I might book an appointment
    // someday") and made inbox queues drift from analyst campaign
    // attribution. Routing now requires an ad referral resolving to a
    // recognised campaign umbrella; without one, the thread lands in
    // general_inquiry regardless of body text.
    const batch = buildMetaInboxNormalizationBatch({
      now: new Date("2026-05-23T01:00:00.000Z"),
      threads: [
        {
          id: "thread-2",
          platform: "facebook",
          thread_id: "facebook:webhook:page-1:customer-2",
          page_id: "page-1",
          participant_id: "customer-2",
          snippet: "I want to book appointment",
          last_message_at: "2026-05-23T00:00:00.000Z",
        },
      ],
      messages: [
        {
          id: "msg-inbound-2",
          platform: "facebook",
          thread_id: "facebook:webhook:page-1:customer-2",
          message_id: "mid.3",
          direction: "inbound",
          sender_id: "customer-2",
          body: "I want to book appointment",
          sent_at: "2026-05-23T00:00:00.000Z",
        },
      ],
    });

    assert.equal(batch.conversations[0].queueCategoryKey, "general_inquiry");
    assert.equal(batch.conversations[0].routingSource, "fallback");
  });

  it("routes click-to-Messenger threads to the queue matching the stored campaign umbrella", () => {
    const batch = buildMetaInboxNormalizationBatch({
      now: new Date("2026-05-23T01:00:00.000Z"),
      threads: [
        {
          id: "thread-3",
          platform: "facebook",
          thread_id: "facebook:webhook:page-1:customer-3",
          page_id: "page-1",
          participant_id: "customer-3",
          snippet: "hi",
          last_message_at: "2026-05-23T00:00:00.000Z",
        },
      ],
      messages: [
        {
          id: "msg-inbound-3",
          platform: "facebook",
          thread_id: "facebook:webhook:page-1:customer-3",
          message_id: "mid.4",
          direction: "inbound",
          sender_id: "customer-3",
          body: "hi",
          sent_at: "2026-05-23T00:00:00.000Z",
          raw_json: { message: { referral: { ad_id: "ad-book-1" } } },
        },
      ],
    });
    const adLookup = new Map<string, MetaAdsLookupRow>([
      [
        "ad-book-1",
        {
          ad_id: "ad-book-1",
          campaign_id: "camp-book-1",
          ad_set_id: "as-book-1",
          creative_id: "cre-book-1",
          campaign_name: null,
          ad_set_name: null,
          campaign_umbrella: "Book Appts US",
        },
      ],
    ]);
    const enriched = applyCampaignUmbrellaRouting(batch, adLookup);
    assert.equal(enriched.conversations[0].queueCategoryKey, "book_appointment");
    assert.equal(enriched.conversations[0].routingSource, "campaign_umbrella");
  });
});
