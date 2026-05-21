import type { CustomerJourneyLedgerRow } from "./customer-journey-ledger.ts";

export type CustomerLedgerSearchParams = {
  days?: string | null;
  end?: string | null;
  start?: string | null;
};

export type CustomerLedgerRow = {
  acuityAppointmentId: string | null;
  appointmentType: string | null;
  brand: string | null;
  capiStatus: string | null;
  customerEmail: string | null;
  customerName: string | null;
  eventId: string | null;
  hasConversion: boolean;
  hasPaidTouch: boolean;
  occurredAt: string;
  paidTouchCampaign: string | null;
  paidTouchSource: string | null;
  rowId: string;
  sourceType: string | null;
  visitorId: string;
};

export type CustomerJourneyLedgerRequest = {
  days?: number | null;
  endDate?: string | null;
  startDate?: string | null;
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
      acuityAppointmentId: row.acuityAppointmentId,
      appointmentType: row.appointmentType,
      brand: row.brand,
      capiStatus: row.capiStatus,
      customerEmail: row.customerEmail,
      customerName: row.customerName,
      eventId,
      hasConversion: row.hasConversion,
      hasPaidTouch: row.hasPaidTouch,
      occurredAt: row.bookingTime || row.lastSeen,
      paidTouchCampaign: row.campaignId,
      paidTouchSource: row.lastPaidSource,
      rowId: eventId || row.visitorId,
      sourceType: row.lastPaidSourceType,
      visitorId: row.visitorId,
    };
  });
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
  sessions,
  unreadConversations,
}: {
  bookings: number;
  rows: CustomerLedgerRow[];
  sessions: number;
  unreadConversations: number;
}): string {
  const gaps = countCustomerLedgerCapiGaps(rows);

  if (sessions === 0 && bookings === 0 && unreadConversations === 0 && rows.length === 0) {
    return "No customer activity in this range yet. Once the booking pixel + inbox sync are live, traffic + bookings + conversations land here.";
  }

  const pieces: string[] = [];
  if (sessions > 0 || bookings > 0) {
    const rate = sessions > 0 ? ((bookings / sessions) * 100).toFixed(1) : null;
    pieces.push(
      `${sessions.toLocaleString()} customers → ${bookings} booking${
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
