import type { CustomerJourneyLedgerRow } from "./customer-journey-ledger.ts";

export type CustomerLedgerSearchParams = {
  days?: string | null;
  end?: string | null;
  start?: string | null;
};

export type CustomerLedgerCreativePreview = {
  adId: string;
  adName: string | null;
  body: string | null;
  creativeId: string | null;
  creativeName: string | null;
  imageUrl: string | null;
  previewHtml: string | null;
  previewSource: string | null;
  previewUrl: string | null;
  thumbnailUrl: string | null;
  title: string | null;
};

export type CustomerLedgerRow = {
  adId: string | null;
  adsetId: string | null;
  acuityAppointmentId: string | null;
  appointmentType: string | null;
  brand: string | null;
  capiStatus: string | null;
  campaignId: string | null;
  creativePreview: CustomerLedgerCreativePreview | null;
  customerEmail: string | null;
  customerName: string | null;
  customerPhone: string | null;
  deviceBrowser: string | null;
  eventId: string | null;
  firstPage: string | null;
  geoCity: string | null;
  geoCountry: string | null;
  geoRegion: string | null;
  geoTimezone: string | null;
  hasConversion: boolean;
  hasPaidTouch: boolean;
  occurredAt: string;
  paidTouchCampaign: string | null;
  paidTouchSource: string | null;
  placement: string | null;
  rowId: string;
  sessionId: string | null;
  sourceType: string | null;
  visitorId: string | null;
};

export type CustomerJourneyLedgerRequest = {
  days?: number | null;
  endDate?: string | null;
  startDate?: string | null;
};

export type CustomerLedgerDetailIdentity =
  | {
      data: {
        acuityAppointmentId: string | null;
        eventId: string | null;
        visitorId: string | null;
      };
      error: null;
    }
  | {
      data: null;
      error: string;
    };

export function customerJourneyLedgerRequestFromSearchParams(
  params: CustomerLedgerSearchParams,
): CustomerJourneyLedgerRequest {
  const days = parseDays(params.days);

  return {
    days,
    endDate: params.end || null,
    startDate: params.start || null,
  };
}

export function customerLedgerRowsFromJourneys(
  rows: CustomerJourneyLedgerRow[],
): CustomerLedgerRow[] {
  return rows.map((row) => {
    const eventId = row.conversionEventId || null;
    return {
      adId: row.adId,
      adsetId: row.adsetId,
      acuityAppointmentId: row.acuityAppointmentId,
      appointmentType: row.appointmentType,
      brand: row.brand,
      capiStatus: row.capiStatus,
      campaignId: row.campaignId,
      creativePreview: null,
      customerEmail: row.customerEmail,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      deviceBrowser: row.deviceBrowser,
      eventId,
      firstPage: row.firstPage,
      geoCity: row.geoCity,
      geoCountry: row.geoCountry,
      geoRegion: row.geoRegion,
      geoTimezone: row.geoTimezone,
      hasConversion: row.hasConversion,
      hasPaidTouch: row.hasPaidTouch,
      occurredAt: row.bookingTime || row.lastSeen,
      paidTouchCampaign: row.campaignId,
      paidTouchSource: row.lastPaidSource,
      placement: row.placement,
      rowId: eventId || row.visitorId || row.acuityAppointmentId || row.lastSeen,
      sessionId: row.sessionId,
      sourceType: row.lastPaidSourceType,
      visitorId: row.visitorId,
    };
  });
}

export function customerLedgerDetailIdentityFromSearchParams(
  searchParams: URLSearchParams,
): CustomerLedgerDetailIdentity {
  const visitorId = searchParams.get("visitorId")?.trim() || null;
  const acuityAppointmentId =
    searchParams.get("acuityAppointmentId")?.trim() || null;
  const eventId = searchParams.get("eventId")?.trim() || null;

  if (!visitorId && !acuityAppointmentId && !eventId) {
    return {
      data: null,
      error: "visitorId, acuityAppointmentId, or eventId is required.",
    };
  }

  return {
    data: {
      acuityAppointmentId,
      eventId,
      visitorId,
    },
    error: null,
  };
}

export function customerLedgerDetailUrl(
  row: Pick<CustomerLedgerRow, "acuityAppointmentId" | "eventId" | "visitorId">,
) {
  const params = new URLSearchParams();
  if (row.visitorId) {
    params.set("visitorId", row.visitorId);
  }
  if (row.acuityAppointmentId) {
    params.set("acuityAppointmentId", row.acuityAppointmentId);
  } else if (row.eventId) {
    params.set("eventId", row.eventId);
  }
  return `/api/convert/customer-ledger/detail?${params.toString()}`;
}

export function countCustomerLedgerCapiGaps(rows: CustomerLedgerRow[]): number {
  return rows.filter((row) => {
    if (!row.hasConversion) return false;
    const status = (row.capiStatus ?? "").toLowerCase();
    return status === "failed" || status === "error" || !row.capiStatus;
  }).length;
}

export function countUnreadThreads(
  threads: Array<{ unread_count?: number | null }>,
): number {
  return threads.reduce((sum, thread) => sum + (thread.unread_count || 0), 0);
}

export function buildCustomerLedgerStatusSentence({
  bookings,
  rows,
  sessionNoun = "session",
  sessions,
  unreadConversations,
}: {
  bookings: number;
  rows: CustomerLedgerRow[];
  sessionNoun?: string;
  sessions: number;
  unreadConversations: number;
}): string {
  const gaps = countCustomerLedgerCapiGaps(rows);
  const sessionUnit = `${sessionNoun}${sessions === 1 ? "" : "s"}`;

  if (sessions === 0 && bookings === 0 && unreadConversations === 0 && rows.length === 0) {
    return `No ${sessionNoun} activity in this range yet. Once the booking pixel + inbox sync are live, traffic + bookings + conversations land here.`;
  }

  const pieces: string[] = [];
  if (sessions > 0 || bookings > 0) {
    const rate = sessions > 0 ? ((bookings / sessions) * 100).toFixed(1) : null;
    pieces.push(
      `${sessions.toLocaleString()} ${sessionUnit} → ${bookings} booking${
        bookings === 1 ? "" : "s"
      }${rate ? ` (${rate}%)` : ""}.`,
    );
  }
  if (unreadConversations > 0) {
    pieces.push(
      `${unreadConversations} conversation${
        unreadConversations === 1 ? "" : "s"
      } waiting.`,
    );
  }
  if (gaps > 0) {
    pieces.push(
      `${gaps} attribution / CAPI gap${gaps === 1 ? "" : "s"} to clear.`,
    );
  }
  return pieces.join(" ");
}

function parseDays(value?: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
