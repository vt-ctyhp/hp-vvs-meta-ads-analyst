import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCustomerLedgerStatusSentence,
  countCustomerLedgerCapiGaps,
  countUnreadThreads,
  customerJourneyLedgerRequestFromSearchParams,
  customerLedgerRowsFromJourneys,
} from "../src/lib/convert-customer-ledger.ts";
import type { CustomerJourneyLedgerRow } from "../src/lib/customer-journey-ledger.ts";

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
      acuityAppointmentId: "1708622080",
      appointmentType: "General Meeting",
      brand: "HP",
      capiStatus: "sent",
      customerEmail: "customer@example.com",
      customerName: "Conversion Customer",
      eventId: "conversion-1",
      hasConversion: true,
      hasPaidTouch: true,
      occurredAt: "2026-05-20T23:49:18.756Z",
      paidTouchCampaign: "campaign-1",
      paidTouchSource: "ig",
      rowId: "conversion-1",
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
    assert.equal(rows[0].occurredAt, "2026-05-20T20:00:00.000Z");
    assert.equal(rows[0].rowId, "visitor-1");
    assert.equal(countCustomerLedgerCapiGaps(rows), 0);
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

  it("maps Convert search params to shared ledger date input", () => {
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
      "10 customers → 1 booking (10.0%). 2 conversations waiting.",
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
