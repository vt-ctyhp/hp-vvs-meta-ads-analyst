import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  enrichCustomerJourneyDetailWithCreativePreviews,
  enrichCustomerLedgerRowsWithCreativePreviews,
  type CustomerLedgerCreativeClient,
} from "../src/lib/customer-ledger-creative-enrichment.ts";
import type { CustomerLedgerRow } from "../src/lib/convert-customer-ledger.ts";
import type {
  CustomerJourneyLedgerDetailData,
  CustomerJourneyLedgerTimelineEvent,
} from "../src/lib/customer-journey-ledger.ts";

describe("customer ledger creative enrichment", () => {
  it("joins ad rows to creative rows and prefers cached preview URLs", async () => {
    const client = mockCreativeClient({
      meta_ads: [
        {
          ad_id: "ad-1",
          creative_id: "creative-1",
          last_synced_at: "2026-05-21T15:00:00.000Z",
          meta_account_id: "account-1",
          name: "Ad name",
          preview_url: "https://meta.example/ad-preview",
        },
      ],
      meta_creatives: [
        {
          body: "Body copy",
          creative_id: "creative-1",
          image_url: "https://cdn.example/image.jpg",
          meta_account_id: "account-1",
          name: "Creative name",
          preview_source: "synced",
          preview_url: "https://meta.example/creative-preview",
          supabase_image_url: "https://cache.example/image.jpg",
          supabase_thumbnail_url: "https://cache.example/thumb.jpg",
          thumbnail_url: "https://cdn.example/thumb.jpg",
          title: "Creative title",
        },
      ],
    });

    const rows = await enrichCustomerLedgerRowsWithCreativePreviews(
      [ledgerRow({ adId: "ad-1" })],
      { client },
    );

    assert.deepEqual(rows[0].creativePreview, {
      adId: "ad-1",
      adName: "Ad name",
      body: "Body copy",
      creativeId: "creative-1",
      creativeName: "Creative name",
      imageUrl: "https://cache.example/image.jpg",
      previewHtml: null,
      previewSource: "synced",
      previewUrl: "https://meta.example/creative-preview",
      thumbnailUrl: "https://cache.example/thumb.jpg",
      title: "Creative title",
    });
    assert.deepEqual(client.queries.map((query) => query.table), [
      "meta_ads",
      "meta_creatives",
    ]);
  });

  it("prefers cached image URLs before Meta CDN image URLs for thumbnail fallback", async () => {
    const client = mockCreativeClient({
      meta_ads: [
        {
          ad_id: "ad-1",
          creative_id: "creative-1",
          meta_account_id: "account-1",
          name: "Ad name",
          preview_url: "https://meta.example/ad-preview",
        },
      ],
      meta_creatives: [
        {
          creative_id: "creative-1",
          image_url: "https://cdn.example/image.jpg",
          meta_account_id: "account-1",
          supabase_image_url: "https://cache.example/image.jpg",
        },
      ],
    });

    const rows = await enrichCustomerLedgerRowsWithCreativePreviews(
      [ledgerRow({ adId: "ad-1" })],
      { client },
    );

    assert.equal(rows[0].creativePreview?.thumbnailUrl, "https://cache.example/image.jpg");
  });

  it("falls back to cached duplicate creative media before uncached current-environment rows", async () => {
    const client = mockCreativeClient({
      meta_ads: [
        {
          ad_id: "ad-1",
          creative_id: "creative-1",
          environment: "production",
          meta_account_id: "account-1",
          name: "Production ad",
        },
      ],
      meta_creatives: [
        {
          creative_id: "creative-1",
          environment: "production",
          last_synced_at: "2026-05-22T02:00:00.000Z",
          meta_account_id: "account-1",
          name: "Production uncached creative",
          thumbnail_url: "https://cdn.example/production-thumb.jpg",
        },
        {
          creative_id: "creative-1",
          environment: "staging",
          last_synced_at: "2026-05-21T02:00:00.000Z",
          meta_account_id: "account-1",
          name: "Cached duplicate creative",
          supabase_thumbnail_url: "https://cache.example/staging-thumb.jpg",
        },
      ],
    });

    const rows = await enrichCustomerLedgerRowsWithCreativePreviews(
      [ledgerRow({ adId: "ad-1" })],
      { client },
    );

    assert.equal(rows[0].creativePreview?.creativeName, "Cached duplicate creative");
    assert.equal(
      rows[0].creativePreview?.thumbnailUrl,
      "https://cache.example/staging-thumb.jpg",
    );
  });

  it("keeps ad-level preview fields separate from durable display media", async () => {
    const client = mockCreativeClient({
      meta_ads: [
        {
          ad_id: "ad-1",
          creative_id: "creative-missing",
          meta_account_id: "account-1",
          name: "Ad fallback",
          preview_html: "<iframe />",
          preview_source: "meta_ad",
          preview_url: "https://meta.example/ad-preview",
        },
      ],
      meta_creatives: [],
    });

    const rows = await enrichCustomerLedgerRowsWithCreativePreviews(
      [ledgerRow({ adId: "ad-1" })],
      { client },
    );

    assert.equal(rows[0].creativePreview?.adName, "Ad fallback");
    assert.equal(rows[0].creativePreview?.creativeName, null);
    assert.equal(rows[0].creativePreview?.thumbnailUrl, null);
    assert.equal(rows[0].creativePreview?.imageUrl, null);
    assert.equal(rows[0].creativePreview?.previewUrl, "https://meta.example/ad-preview");
    assert.equal(rows[0].creativePreview?.previewHtml, "<iframe />");
    assert.equal(rows[0].creativePreview?.previewSource, "meta_ad");
  });

  it("does not expose volatile Meta CDN creative URLs as display media", async () => {
    const client = mockCreativeClient({
      meta_ads: [
        {
          ad_id: "ad-1",
          creative_id: "creative-1",
          meta_account_id: "account-1",
          name: "Ad name",
          preview_url: "https://meta.example/ad-preview",
        },
      ],
      meta_creatives: [
        {
          creative_id: "creative-1",
          image_url: "https://cdn.example/image.jpg",
          meta_account_id: "account-1",
          preview_url: "https://meta.example/creative-preview",
          thumbnail_url: "https://cdn.example/thumb.jpg",
          video_thumbnail_url: "https://cdn.example/video.jpg",
        },
      ],
    });

    const rows = await enrichCustomerLedgerRowsWithCreativePreviews(
      [ledgerRow({ adId: "ad-1" })],
      { client },
    );

    assert.equal(rows[0].creativePreview?.thumbnailUrl, null);
    assert.equal(rows[0].creativePreview?.imageUrl, null);
    assert.equal(rows[0].creativePreview?.previewUrl, "https://meta.example/creative-preview");
  });

  it("does not query metadata when no rows carry ad IDs", async () => {
    const client = mockCreativeClient({
      meta_ads: [],
      meta_creatives: [],
    });
    const originalRows = [ledgerRow({ adId: null })];

    const rows = await enrichCustomerLedgerRowsWithCreativePreviews(originalRows, {
      client,
    });

    assert.equal(rows, originalRows);
    assert.equal(client.queries.length, 0);
    assert.equal(rows[0].creativePreview, null);
  });

  it("chooses duplicate ad rows deterministically", async () => {
    const client = mockCreativeClient({
      meta_ads: [
        {
          ad_id: "ad-1",
          creative_id: null,
          last_synced_at: "2026-05-21T16:00:00.000Z",
          meta_account_id: "account-1",
          name: "Newer row without creative",
        },
        {
          ad_id: "ad-1",
          creative_id: "creative-1",
          last_synced_at: "2026-05-20T16:00:00.000Z",
          meta_account_id: "account-1",
          name: "Older row with creative",
        },
      ],
      meta_creatives: [
        {
          creative_id: "creative-1",
          meta_account_id: "account-1",
          name: "Selected creative",
          thumbnail_url: "https://cdn.example/thumb.jpg",
        },
      ],
    });

    const rows = await enrichCustomerLedgerRowsWithCreativePreviews(
      [ledgerRow({ adId: "ad-1" })],
      { client },
    );

    assert.equal(rows[0].creativePreview?.adName, "Older row with creative");
    assert.equal(rows[0].creativePreview?.creativeName, "Selected creative");
  });

  it("returns original rows when metadata queries fail", async () => {
    const warning: unknown[][] = [];
    const client = mockCreativeClient({
      meta_ads: new Error("metadata unavailable"),
      meta_creatives: [],
    });
    const originalRows = [ledgerRow({ adId: "ad-1" })];

    const rows = await enrichCustomerLedgerRowsWithCreativePreviews(originalRows, {
      client,
      logger: {
        warn: (...args: unknown[]) => warning.push(args),
      },
    });

    assert.equal(rows, originalRows);
    assert.equal(rows[0].creativePreview, null);
    assert.equal(warning.length, 1);
  });

  it("adds ad and creative names to customer journey timeline events", async () => {
    const client = mockCreativeClient({
      meta_ads: [
        {
          ad_id: "ad-1",
          creative_id: "creative-1",
          meta_account_id: "account-1",
          name: "Clicked ad",
        },
      ],
      meta_creatives: [
        {
          creative_id: "creative-1",
          meta_account_id: "account-1",
          name: "Clicked creative",
        },
      ],
    });

    const detail = journeyDetail({
      timeline: [timelineEvent({ adId: "ad-1", eventId: "hp_evt-ad-one" })],
    });

    const enriched = await enrichCustomerJourneyDetailWithCreativePreviews(detail, {
      client,
    });

    assert.equal(enriched.timeline[0].adName, "Clicked ad");
    assert.equal(enriched.timeline[0].creativeId, "creative-1");
    assert.equal(enriched.timeline[0].creativeName, "Clicked creative");
  });
});

type MockTable = "meta_ads" | "meta_creatives";
type MockResponse = Record<string, unknown>[] | Error;

function mockCreativeClient(responses: Record<MockTable, MockResponse>) {
  const queries: Array<{
    column: string;
    columns: string;
    table: MockTable;
    values: string[];
  }> = [];
  const client = {
    queries,
    from(table: MockTable) {
      return {
        select(columns: string) {
          return {
            async in(column: string, values: string[]) {
              queries.push({ column, columns, table, values });
              const response = responses[table];
              if (response instanceof Error) {
                return { data: null, error: response };
              }
              return { data: response, error: null };
            },
          };
        },
      };
    },
  };
  return client as CustomerLedgerCreativeClient & { queries: typeof queries };
}

function ledgerRow(overrides: Partial<CustomerLedgerRow> = {}): CustomerLedgerRow {
  return {
    adId: "ad-1",
    adsetId: "adset-1",
    acuityAppointmentId: "1708622080",
    appointmentType: "Schedule",
    brand: "HP",
    campaignId: "campaign-1",
    capiStatus: "sent",
    creativePreview: null,
    customerEmail: "customer@example.com",
    customerName: "Customer",
    customerPhone: "555-0100",
    deviceBrowser: "mobile / Mobile Safari / iOS",
    eventId: "conversion-1",
    firstPage: "https://www.hungphatusa.com/",
    geoCity: "San Jose",
    geoCountry: "US",
    geoRegion: "CA",
    geoTimezone: "America/Los_Angeles",
    hasConversion: true,
    hasPaidTouch: true,
    occurredAt: "2026-05-20T23:49:18.756Z",
    paidTouchCampaign: "campaign-1",
    paidTouchSource: "ig",
    placement: "Instagram_Stories",
    rowId: "conversion-1",
    sessionId: "session-1",
    sourceType: "paid_meta",
    visitorId: "visitor-1",
    ...overrides,
  };
}

function journeyDetail(
  overrides: Partial<CustomerJourneyLedgerDetailData> = {},
): CustomerJourneyLedgerDetailData {
  return {
    acuityAppointmentId: "1708622080",
    booking: {
      appointmentType: "Schedule",
      bookingTime: "2026-05-20T23:49:18.756Z",
      eventId: "conversion-1",
      metaEventId: "meta-event-1",
      sessionId: "session-1",
    },
    bookingSessionEntrySource: null,
    capi: {
      eventId: "meta-event-1",
      status: "sent",
      testMode: false,
    },
    confidence: {
      explanation: "Matched by visitor.",
      level: "browser_session",
      signals: [],
    },
    creditedTouch: null,
    geoCity: "San Jose",
    geoCountry: "US",
    geoRegion: "CA",
    geoTimezone: "America/Los_Angeles",
    returnTouch: null,
    summary: "Booking found.",
    timeline: [],
    visitorId: "visitor-1",
    ...overrides,
  };
}

function timelineEvent(
  overrides: Partial<CustomerJourneyLedgerTimelineEvent> = {},
): CustomerJourneyLedgerTimelineEvent {
  return {
    adId: null,
    adsetId: null,
    campaignId: null,
    category: "page",
    content: null,
    eventId: "hp_evt-1",
    fbcPresent: false,
    fbpPresent: false,
    fbclidPresent: false,
    label: "Meta ad landing page viewed",
    medium: null,
    occurredAt: "2026-05-20T23:48:27.772Z",
    pageUrl: "https://www.hungphatusa.com/pages/book-an-appointment",
    placement: null,
    referrer: "https://l.instagram.com/",
    source: "ig",
    sourceType: "paid_meta",
    ...overrides,
  };
}
