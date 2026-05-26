import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  webhookReferralRow,
  webhookMessageRow,
} from "../src/lib/meta-webhook-shape.ts";
import {
  buildMetaInboxNormalizationBatch,
  enrichFirstTouchSourceWithAd,
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
      batch.conversations[0].routingExplanation.includes("No ad referral captured"),
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
    });

    assert.equal(enriched.campaignId, "camp-1");
    assert.equal(enriched.adsetId, "as-1");
    assert.equal(enriched.creativeId, "cre-1");
    assert.ok(
      enriched.campaignUmbrellaId,
      `expected campaign_umbrella_id set, got ${enriched.campaignUmbrellaId}`,
    );
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

  it("still routes by inbound customer text keywords", () => {
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

    assert.equal(batch.conversations[0].queueCategoryKey, "book_appointment");
    assert.equal(batch.conversations[0].routingSource, "message_keyword");
    assert.equal(batch.conversations[0].routingConfidence, 0.6);
  });
});
