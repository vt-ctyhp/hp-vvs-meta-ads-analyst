import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCustomerLedgerStatusSentence,
  countCustomerLedgerCapiGaps,
  countUnreadThreads,
  customerLedgerDetailIdentityFromSearchParams,
  customerLedgerDetailUrl,
  customerJourneyLedgerRequestFromSearchParams,
  customerLedgerRowsFromJourneys,
} from "../src/lib/convert-customer-ledger.ts";
import type { CustomerJourneyLedgerRow } from "../src/lib/customer-journey-ledger.ts";
import type { fetchWebsiteFunnelData } from "../src/lib/website-analytics.ts";

type WebsiteFunnelRequest = Parameters<typeof fetchWebsiteFunnelData>[0];

describe("Convert customer ledger adapter", () => {
  it("maps conversion journeys to the table row shape", () => {
    const rows = customerLedgerRowsFromJourneys([
      journeyRow({
        appointmentType: "General Meeting",
        bookingTime: "2026-05-20T23:49:18.756Z",
        brand: "HP",
        campaignId: "campaign-1",
        capiStatus: "sent",
        conversionEventId: "conversion-1",
        customerEmail: "customer@example.com",
        customerName: "Conversion Customer",
        hasConversion: true,
        lastPaidSource: "ig",
        lastPaidSourceType: "paid_meta",
      }),
    ]);

    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
      adId: "ad-1",
      adsetId: "adset-1",
      acuityAppointmentId: "1708622080",
      appointmentType: "General Meeting",
      brand: "HP",
      capiStatus: "sent",
      campaignId: "campaign-1",
      creativePreview: null,
      customerEmail: "customer@example.com",
      customerName: "Conversion Customer",
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
    });
  });

  it("maps non-converting journeys without creating CAPI gaps", () => {
    const rows = customerLedgerRowsFromJourneys([
      journeyRow({
        acuityAppointmentId: null,
        appointmentType: null,
        bookingTime: null,
        capiStatus: null,
        conversionEventId: null,
        customerName: null,
        hasConversion: false,
        hasPaidTouch: false,
        lastPaidSource: null,
        lastPaidSourceType: null,
        lastSeen: "2026-05-20T20:00:00.000Z",
      }),
    ]);

    assert.equal(rows[0].eventId, null);
    assert.equal(rows[0].firstPage, "https://www.hungphatusa.com/");
    assert.equal(rows[0].occurredAt, "2026-05-20T20:00:00.000Z");
    assert.equal(rows[0].rowId, "visitor-1");
    assert.equal(rows[0].creativePreview, null);
    assert.equal(countCustomerLedgerCapiGaps(rows), 0);
  });

  it("keeps rows without paid touch valid and leaves ad context empty", () => {
    const rows = customerLedgerRowsFromJourneys([
      journeyRow({
        adId: null,
        adsetId: null,
        campaignId: null,
        hasPaidTouch: false,
        lastPaidSource: null,
        lastPaidSourceType: null,
        placement: null,
      }),
    ]);

    assert.equal(rows[0].adId, null);
    assert.equal(rows[0].adsetId, null);
    assert.equal(rows[0].campaignId, null);
    assert.equal(rows[0].placement, null);
    assert.equal(rows[0].creativePreview, null);
    assert.equal(rows[0].hasPaidTouch, false);
  });

  it("passes approximate location through to customer ledger rows", () => {
    const rows = customerLedgerRowsFromJourneys([
      journeyRow({
        geoCity: "Oakland",
        geoCountry: "US",
        geoRegion: "CA",
        geoTimezone: "America/Los_Angeles",
      }),
    ]);

    assert.equal(rows[0].geoCity, "Oakland");
    assert.equal(rows[0].geoRegion, "CA");
    assert.equal(rows[0].geoCountry, "US");
    assert.equal(rows[0].geoTimezone, "America/Los_Angeles");
  });

  it("counts CAPI gaps only for conversion rows with missing or failed statuses", () => {
    const rows = customerLedgerRowsFromJourneys([
      journeyRow({ capiStatus: null, conversionEventId: "missing" }),
      journeyRow({ capiStatus: "failed", conversionEventId: "failed" }),
      journeyRow({ capiStatus: "error", conversionEventId: "error" }),
      journeyRow({ capiStatus: "sent", conversionEventId: "sent" }),
      journeyRow({ capiStatus: "pending", conversionEventId: "pending" }),
      journeyRow({
        bookingTime: null,
        capiStatus: null,
        conversionEventId: null,
        hasConversion: false,
        visitorId: "visitor-no-booking",
      }),
    ]);

    assert.equal(countCustomerLedgerCapiGaps(rows), 3);
  });

  it("maps Convert search params to the shared ledger and funnel date input", () => {
    assert.deepEqual(
      customerJourneyLedgerRequestFromSearchParams({
        days: "14",
      }),
      { days: 14, endDate: null, startDate: null },
    );

    assert.deepEqual(
      customerJourneyLedgerRequestFromSearchParams({
        days: "not-a-number",
        end: "2026-05-21",
        start: "2026-05-01",
      }),
      { days: undefined, endDate: "2026-05-21", startDate: "2026-05-01" },
    );

    const sharedRequest: WebsiteFunnelRequest = customerJourneyLedgerRequestFromSearchParams({
      end: "2026-05-21",
      start: "2026-05-01",
    });
    assert.deepEqual(sharedRequest, {
      days: undefined,
      endDate: "2026-05-21",
      startDate: "2026-05-01",
    });
  });

  it("parses Convert detail identity params and builds drawer URLs", () => {
    const parsed = customerLedgerDetailIdentityFromSearchParams(
      new URLSearchParams({
        acuityAppointmentId: " 1708622080 ",
        visitorId: " visitor-1 ",
      }),
    );

    assert.deepEqual(parsed, {
      data: {
        acuityAppointmentId: "1708622080",
        eventId: null,
        visitorId: "visitor-1",
      },
      error: null,
    });

    assert.equal(
      customerLedgerDetailUrl(
        customerLedgerRowsFromJourneys([journeyRow()])[0],
      ),
      "/api/convert/customer-ledger/detail?visitorId=visitor-1&acuityAppointmentId=1708622080",
    );
  });

  it("supports appointment-only Convert detail identity params", () => {
    const parsed = customerLedgerDetailIdentityFromSearchParams(
      new URLSearchParams({
        acuityAppointmentId: " 1709178617 ",
      }),
    );

    assert.deepEqual(parsed, {
      data: {
        acuityAppointmentId: "1709178617",
        eventId: null,
        visitorId: null,
      },
      error: null,
    });

    assert.equal(
      customerLedgerDetailUrl(
        customerLedgerRowsFromJourneys([
          journeyRow({
            acuityAppointmentId: "1709178617",
            conversionEventId: "acuity-1709178617",
            visitorId: null,
          }),
        ])[0],
      ),
      "/api/convert/customer-ledger/detail?acuityAppointmentId=1709178617",
    );
  });

  it("rejects Convert detail identity params without any row identity", () => {
    assert.deepEqual(
      customerLedgerDetailIdentityFromSearchParams(new URLSearchParams()),
      {
        data: null,
        error: "visitorId, acuityAppointmentId, or eventId is required.",
      },
    );
  });

  it("builds the Convert status sentence without treating visitors as CAPI gaps", () => {
    const rows = customerLedgerRowsFromJourneys([
      journeyRow({ capiStatus: "sent", conversionEventId: "sent" }),
      journeyRow({
        bookingTime: null,
        capiStatus: null,
        conversionEventId: null,
        hasConversion: false,
        visitorId: "visitor-no-booking",
      }),
    ]);

    assert.equal(countUnreadThreads([{ unread_count: 2 }, { unread_count: null }]), 2);
    assert.equal(
      buildCustomerLedgerStatusSentence({
        bookings: 1,
        rows,
        sessions: 10,
        unreadConversations: 2,
      }),
      "10 sessions → 1 booking (10.0%). 2 conversations waiting.",
    );
    assert.equal(
      buildCustomerLedgerStatusSentence({
        bookings: 12,
        rows,
        sessionNoun: "booking session",
        sessions: 258,
        unreadConversations: 0,
      }),
      "258 booking sessions → 12 bookings (4.7%).",
    );
  });
});

function journeyRow(
  overrides: Partial<CustomerJourneyLedgerRow> = {},
): CustomerJourneyLedgerRow {
  return {
    adId: "ad-1",
    adsetId: "adset-1",
    acuityAppointmentId: "1708622080",
    appointmentType: "Schedule",
    bookingTime: "2026-05-20T23:49:18.756Z",
    brand: null,
    browserName: "Mobile Safari",
    campaignId: "campaign-1",
    capiStatus: "sent",
    conversionEventId: "conversion-1",
    customerEmail: "customer@example.com",
    customerName: "Customer",
    customerPhone: "555-0100",
    deviceBrowser: "mobile / Mobile Safari / iOS",
    deviceCategory: "mobile",
    fbc: "fb.1.1.click",
    fbp: "fb.1.1.browser",
    firstPage: "https://www.hungphatusa.com/",
    geoCity: "San Jose",
    geoCountry: "US",
    geoRegion: "CA",
    geoTimezone: "America/Los_Angeles",
    hasConversion: true,
    hasPaidTouch: true,
    lastPaidSource: "ig",
    lastPaidSourceType: "paid_meta",
    lastSeen: "2026-05-20T23:50:00.000Z",
    metaEventId: "meta-event-1",
    osName: "iOS",
    placement: "Instagram_Stories",
    sessionId: "session-1",
    visitorId: "visitor-1",
    ...overrides,
  };
}
