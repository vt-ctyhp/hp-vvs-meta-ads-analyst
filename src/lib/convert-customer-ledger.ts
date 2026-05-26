import type { CustomerJourneyLedgerRow } from "./customer-journey-ledger.ts";

export type CustomerLedgerSearchParams = {
  capi?: string | null;
  days?: string | null;
  end?: string | null;
  q?: string | null;
  source?: string | null;
  start?: string | null;
  stage?: string | null;
  type?: string | null;
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
  appointmentSourceId: string | null;
  appointmentStatus: string | null;
  appointmentType: string | null;
  appointmentVisitDateTime: string | null;
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
  stageKeys: string[];
  visitorId: string | null;
};

export type CustomerJourneyLedgerRequest = {
  days?: number | null;
  endDate?: string | null;
  startDate?: string | null;
};

export type ConvertLedgerFilters = {
  capi: string;
  query: string;
  source: string;
  stage: string;
  type: string;
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
      appointmentSourceId: row.appointmentSourceId,
      appointmentStatus: row.appointmentStatus,
      appointmentType: row.appointmentType,
      appointmentVisitDateTime: row.appointmentVisitDateTime,
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
      occurredAt: customerLedgerActivityAt(row),
      paidTouchCampaign: row.campaignId,
      paidTouchSource: row.lastPaidSource,
      placement: row.placement,
      rowId: eventId || row.visitorId || row.acuityAppointmentId || row.lastSeen,
      sessionId: row.sessionId,
      sourceType: row.lastPaidSourceType,
      stageKeys: row.stageKeys || [],
      visitorId: row.visitorId,
    };
  });
}

export function convertLedgerFiltersFromSearchParams(
  params: CustomerLedgerSearchParams,
): ConvertLedgerFilters {
  return {
    capi: normalizedOption(params.capi, ["all", "sent", "gap", "failed", "missing"], "all"),
    query: params.q?.trim() || "",
    source: normalizedOption(params.source, ["all", "paid_meta", "direct", "unattributed"], "all"),
    stage: params.stage?.trim() || "all",
    type: params.type?.trim() || "all",
  };
}

export function filterCustomerLedgerRows(
  rows: CustomerLedgerRow[],
  filters: ConvertLedgerFilters,
): CustomerLedgerRow[] {
  const query = filters.query.toLowerCase();
  return rows.filter((row) => {
    if (filters.stage !== "all" && !row.stageKeys.includes(filters.stage)) return false;
    if (filters.type !== "all" && row.appointmentType !== filters.type) return false;
    if (!matchesSource(row, filters.source)) return false;
    if (!matchesCapi(row, filters.capi)) return false;
    if (query && !searchableRowText(row).includes(query)) return false;
    return true;
  });
}

export function convertFilterOptions(rows: CustomerLedgerRow[]) {
  return {
    appointmentTypes: Array.from(
      new Set(rows.map((row) => row.appointmentType).filter((value): value is string => Boolean(value))),
    ).sort((a, b) => a.localeCompare(b)),
  };
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

function normalizedOption(value: string | null | undefined, allowed: string[], fallback: string) {
  const normalized = value?.trim() || "";
  return allowed.includes(normalized) ? normalized : fallback;
}

function matchesSource(row: CustomerLedgerRow, source: string) {
  if (source === "all") return true;
  if (source === "paid_meta") {
    return row.sourceType === "paid_meta" || row.stageKeys.includes("paid_meta_bookings");
  }
  if (source === "direct") {
    return !row.hasPaidTouch && (row.sourceType === "direct" || row.sourceType === null);
  }
  if (source === "unattributed") {
    return !row.hasPaidTouch && !row.sourceType;
  }
  return true;
}

function customerLedgerActivityAt(
  row: Pick<CustomerJourneyLedgerRow, "appointmentVisitDateTime" | "bookingTime" | "lastSeen">,
) {
  return (
    nonAppointmentActivityAt(row.lastSeen, row.appointmentVisitDateTime) ||
    nonAppointmentActivityAt(row.bookingTime, row.appointmentVisitDateTime) ||
    ""
  );
}

function nonAppointmentActivityAt(value: string | null, appointmentTime: string | null) {
  if (!value) return "";
  if (!appointmentTime) return value;
  const valueTime = Date.parse(value);
  const appointmentTimestamp = Date.parse(appointmentTime);
  if (Number.isFinite(valueTime) && Number.isFinite(appointmentTimestamp)) {
    return valueTime === appointmentTimestamp ? "" : value;
  }
  return value === appointmentTime ? "" : value;
}

function matchesCapi(row: CustomerLedgerRow, capi: string) {
  const status = (row.capiStatus || "").toLowerCase();
  if (capi === "all") return true;
  if (capi === "sent") return status === "sent" || status === "success";
  if (capi === "failed") return status === "failed" || status === "error";
  if (capi === "missing") return !row.capiStatus;
  if (capi === "gap") return !row.capiStatus || status === "failed" || status === "error";
  return true;
}

function searchableRowText(row: CustomerLedgerRow) {
  return [
    row.adId,
    row.adsetId,
    row.acuityAppointmentId,
    row.appointmentType,
    row.brand,
    row.campaignId,
    row.customerEmail,
    row.customerName,
    row.customerPhone,
    row.eventId,
    row.paidTouchCampaign,
    row.paidTouchSource,
    row.placement,
    row.sessionId,
    row.sourceType,
    row.visitorId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function parseDays(value?: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
