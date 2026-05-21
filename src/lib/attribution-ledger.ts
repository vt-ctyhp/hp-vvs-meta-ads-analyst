import { differenceInCalendarDays, format, parseISO, subDays } from "date-fns";

import { selectBestPaidTouch } from "./attribution-touch-selection.ts";
import { createServiceClient } from "./supabase.ts";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LEDGER_DAYS = 30;
const MAX_LEDGER_VISITORS = 500;
const MAX_RELATED_ROWS = 2500;
const DETAIL_EVENT_WINDOW_AFTER_BOOKING_MS = 60_000;

type JsonRecord = Record<string, unknown>;

export type AttributionLedgerStatusSummary = {
  count: number;
  status: string;
};

export type AttributionLedgerRow = {
  adId: string | null;
  adsetId: string | null;
  acuityAppointmentId: string | null;
  appointmentType: string | null;
  bookingTime: string | null;
  browserName: string | null;
  campaignId: string | null;
  capiStatus: string | null;
  customerEmail: string | null;
  customerName: string | null;
  customerPhone: string | null;
  deviceBrowser: string | null;
  deviceCategory: string | null;
  fbc: string | null;
  fbp: string | null;
  firstPage: string | null;
  hasConversion: boolean;
  hasPaidTouch: boolean;
  lastPaidSource: string | null;
  lastSeen: string;
  metaEventId: string | null;
  osName: string | null;
  placement: string | null;
  sessionId: string | null;
  visitorId: string;
};

export type AttributionLedgerData = {
  rows: AttributionLedgerRow[];
  summary: {
    capiStatuses: AttributionLedgerStatusSummary[];
    visitorsShown: number;
    visitorsWithConversions: number;
    visitorsWithPaidTouch: number;
  };
  timeRange: {
    days: number;
    end: string;
    start: string;
  };
};

export type AttributionLedgerTouchSummary = {
  adId: string | null;
  adsetId: string | null;
  campaignId: string | null;
  capturedAt: string | null;
  content: string | null;
  fbcPresent: boolean;
  fbpPresent: boolean;
  fbclidPresent: boolean;
  medium: string | null;
  pageUrl: string | null;
  placement: string | null;
  referrer: string | null;
  source: string | null;
  sourceType: string | null;
};

export type AttributionLedgerTimelineEvent = {
  adId: string | null;
  adsetId: string | null;
  campaignId: string | null;
  category: "ad_touch" | "page" | "booking" | "conversion" | "capi" | "engagement";
  content: string | null;
  eventId: string | null;
  fbcPresent: boolean;
  fbpPresent: boolean;
  fbclidPresent: boolean;
  label: string;
  medium: string | null;
  occurredAt: string;
  pageUrl: string | null;
  placement: string | null;
  referrer: string | null;
  source: string | null;
  sourceType: string | null;
};

export type AttributionLedgerDetailData = {
  acuityAppointmentId: string | null;
  booking: {
    appointmentType: string | null;
    bookingTime: string | null;
    eventId: string | null;
    metaEventId: string | null;
    sessionId: string | null;
  } | null;
  capi: {
    eventId: string | null;
    status: string | null;
    testMode: boolean | null;
  };
  confidence: {
    explanation: string;
    level: "browser_session" | "browser_visitor" | "unmatched";
    signals: string[];
  };
  creditedTouch: AttributionLedgerTouchSummary | null;
  returnTouch: AttributionLedgerTouchSummary | null;
  summary: string | null;
  timeline: AttributionLedgerTimelineEvent[];
  visitorId: string;
};

type AttributionTouch = {
  browserName?: string;
  capturedAt?: string;
  deviceCategory?: string;
  fbc?: string;
  fbp?: string;
  osName?: string;
  pageUrl?: string;
  referrer?: string;
  source?: string;
  sourceType?: string;
  utm?: Record<string, string>;
};

export type AttributionLedgerEventRow = {
  browser_name: string | null;
  device_category: string | null;
  event_id: string;
  event_name: string;
  event_type: string;
  fbc: string | null;
  fbp: string | null;
  fbclid: string | null;
  occurred_at: string;
  os_name: string | null;
  page_url: string | null;
  properties: JsonRecord | null;
  raw_json: JsonRecord | null;
  referrer: string | null;
  session_id: string | null;
  source: string | null;
  source_type: string | null;
  utm_ad: string | null;
  utm_ad_id: string | null;
  utm_adset: string | null;
  utm_adset_id: string | null;
  utm_campaign: string | null;
  utm_campaign_id: string | null;
  utm_content: string | null;
  utm_creative: string | null;
  utm_id: string | null;
  utm_medium: string | null;
  utm_placement: string | null;
  utm_source: string | null;
  utm_term: string | null;
  visitor_id: string | null;
};

export type AttributionLedgerVisitorRow = {
  browser_name: string | null;
  conversion_event_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  device_category: string | null;
  fbc: string | null;
  fbp: string | null;
  first_page_url: string | null;
  first_seen_at: string;
  first_touch: JsonRecord | null;
  last_page_url: string | null;
  last_paid_touch: JsonRecord | null;
  last_seen_at: string;
  last_touch: JsonRecord | null;
  os_name: string | null;
  user_agent: string | null;
  visitor_id: string;
};

export type AttributionLedgerSessionRow = {
  browser_name: string | null;
  conversion_event_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  device_category: string | null;
  fbc: string | null;
  fbp: string | null;
  first_page_url: string | null;
  last_page_url: string | null;
  last_paid_touch: JsonRecord | null;
  last_seen_at: string;
  os_name: string | null;
  session_id: string;
  user_agent: string | null;
  visitor_id: string | null;
};

export type AttributionLedgerConversionRow = {
  acuity_appointment_id: string | null;
  appointment_type: string | null;
  browser_name: string | null;
  conversion_touch: JsonRecord | null;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  device_category: string | null;
  event_id: string;
  fbc: string | null;
  fbp: string | null;
  first_touch: JsonRecord | null;
  last_paid_touch: JsonRecord | null;
  last_touch: JsonRecord | null;
  meta_capi_status: string | null;
  meta_capi_test_mode: boolean | null;
  meta_event_id: string | null;
  occurred_at: string;
  os_name: string | null;
  page_url: string | null;
  properties: JsonRecord | null;
  raw_json: JsonRecord | null;
  received_at: string | null;
  referrer: string | null;
  session_id: string | null;
  source_type: string | null;
  user_agent: string | null;
  visitor_id: string | null;
};

type AttributionLedgerClient = {
  from: (table: "website_visitors") => {
    select: (columns: string) => LedgerSelectChain<AttributionLedgerVisitorRow[]>;
  };
} & {
  from: (table: "website_sessions") => {
    select: (columns: string) => LedgerSelectChain<AttributionLedgerSessionRow[]>;
  };
} & {
  from: (table: "website_events") => {
    select: (columns: string) => LedgerSelectChain<AttributionLedgerEventRow[]>;
  };
} & {
  from: (table: "website_conversions") => {
    select: (columns: string) => LedgerSelectChain<AttributionLedgerConversionRow[]>;
  };
};

type LedgerSelectChain<T> = PromiseLike<{ data: T | null; error: Error | null }> & {
  eq: (column: string, value: unknown) => LedgerSelectChain<T>;
  gte: (column: string, value: unknown) => LedgerSelectChain<T>;
  in: (column: string, values: unknown[]) => LedgerSelectChain<T>;
  limit: (count: number) => LedgerSelectChain<T>;
  lte: (column: string, value: unknown) => LedgerSelectChain<T>;
  order: (column: string, options: { ascending: boolean }) => LedgerSelectChain<T>;
};

export async function fetchAttributionLedgerData(input: {
  days?: number | null;
  endDate?: string | null;
  startDate?: string | null;
}): Promise<AttributionLedgerData> {
  const range = normalizeLedgerDateRange(input);
  const client = createServiceClient() as unknown as AttributionLedgerClient;
  const startIso = `${range.start}T00:00:00.000Z`;
  const endIso = `${range.end}T23:59:59.999Z`;

  const visitorsResult = await client
    .from("website_visitors")
    .select(
      [
        "visitor_id",
        "first_seen_at",
        "last_seen_at",
        "first_page_url",
        "last_page_url",
        "first_touch",
        "last_touch",
        "last_paid_touch",
        "fbp",
        "fbc",
        "user_agent",
        "device_category",
        "browser_name",
        "os_name",
        "customer_name",
        "customer_email",
        "customer_phone",
        "conversion_event_id",
      ].join(","),
    )
    .gte("last_seen_at", startIso)
    .lte("last_seen_at", endIso)
    .order("last_seen_at", { ascending: false })
    .limit(MAX_LEDGER_VISITORS);

  if (visitorsResult.error) throw visitorsResult.error;

  const visitors = visitorsResult.data || [];
  const visitorIds = visitors.map((visitor) => visitor.visitor_id);

  if (!visitorIds.length) {
    return buildAttributionLedgerData({
      conversions: [],
      events: [],
      range,
      sessions: [],
      visitors,
    });
  }

  const [sessionsResult, eventsResult, conversionsResult] = await Promise.all([
    client
      .from("website_sessions")
      .select(
        [
          "session_id",
          "visitor_id",
          "last_seen_at",
          "first_page_url",
          "last_page_url",
          "last_paid_touch",
          "fbp",
          "fbc",
          "user_agent",
          "device_category",
          "browser_name",
          "os_name",
          "customer_name",
          "customer_email",
          "customer_phone",
          "conversion_event_id",
        ].join(","),
      )
      .in("visitor_id", visitorIds)
      .order("last_seen_at", { ascending: false })
      .limit(MAX_RELATED_ROWS),
    client
      .from("website_events")
      .select(
        [
          "event_id",
          "session_id",
          "visitor_id",
          "source",
          "event_name",
          "event_type",
          "occurred_at",
          "page_url",
          "referrer",
          "utm_source",
          "utm_medium",
          "utm_campaign",
          "utm_content",
          "utm_term",
          "utm_id",
          "utm_creative",
          "utm_ad",
          "utm_ad_id",
          "utm_adset",
          "utm_adset_id",
          "utm_placement",
          "fbclid",
          "fbp",
          "fbc",
          "device_category",
          "browser_name",
          "os_name",
          "source_type",
          "properties",
          "raw_json",
        ].join(","),
      )
      .in("visitor_id", visitorIds)
      .order("occurred_at", { ascending: false })
      .limit(MAX_RELATED_ROWS),
    client
      .from("website_conversions")
      .select(
        [
          "event_id",
          "session_id",
          "visitor_id",
          "occurred_at",
          "received_at",
          "source_type",
          "acuity_appointment_id",
          "appointment_type",
          "customer_name",
          "customer_email",
          "customer_phone",
          "meta_event_id",
          "meta_capi_status",
          "meta_capi_test_mode",
          "fbp",
          "fbc",
          "user_agent",
          "device_category",
          "browser_name",
          "os_name",
          "page_url",
          "referrer",
          "first_touch",
          "last_touch",
          "last_paid_touch",
          "conversion_touch",
          "properties",
          "raw_json",
        ].join(","),
      )
      .in("visitor_id", visitorIds)
      .order("occurred_at", { ascending: false })
      .limit(MAX_RELATED_ROWS),
  ]);

  if (sessionsResult.error) throw sessionsResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (conversionsResult.error) throw conversionsResult.error;

  return buildAttributionLedgerData({
    conversions: conversionsResult.data || [],
    events: eventsResult.data || [],
    range,
    sessions: sessionsResult.data || [],
    visitors,
  });
}

export async function fetchAttributionLedgerDetail(input: {
  acuityAppointmentId?: string | null;
  visitorId: string;
}): Promise<AttributionLedgerDetailData | null> {
  const visitorId = input.visitorId.trim();
  if (!visitorId) return null;

  const client = createServiceClient() as unknown as AttributionLedgerClient;
  const [visitorsResult, sessionsResult, eventsResult, conversionsResult] = await Promise.all([
    client
      .from("website_visitors")
      .select(
        [
          "visitor_id",
          "first_seen_at",
          "last_seen_at",
          "first_page_url",
          "last_page_url",
          "first_touch",
          "last_touch",
          "last_paid_touch",
          "fbp",
          "fbc",
          "user_agent",
          "device_category",
          "browser_name",
          "os_name",
          "customer_name",
          "customer_email",
          "customer_phone",
          "conversion_event_id",
        ].join(","),
      )
      .eq("visitor_id", visitorId)
      .limit(1),
    client
      .from("website_sessions")
      .select(
        [
          "session_id",
          "visitor_id",
          "last_seen_at",
          "first_page_url",
          "last_page_url",
          "last_paid_touch",
          "fbp",
          "fbc",
          "user_agent",
          "device_category",
          "browser_name",
          "os_name",
          "customer_name",
          "customer_email",
          "customer_phone",
          "conversion_event_id",
        ].join(","),
      )
      .eq("visitor_id", visitorId)
      .order("last_seen_at", { ascending: false })
      .limit(50),
    client
      .from("website_events")
      .select(
        [
          "event_id",
          "session_id",
          "visitor_id",
          "source",
          "event_name",
          "event_type",
          "occurred_at",
          "page_url",
          "referrer",
          "utm_source",
          "utm_medium",
          "utm_campaign",
          "utm_content",
          "utm_term",
          "utm_id",
          "utm_creative",
          "utm_ad",
          "utm_ad_id",
          "utm_adset",
          "utm_adset_id",
          "utm_placement",
          "fbclid",
          "fbp",
          "fbc",
          "device_category",
          "browser_name",
          "os_name",
          "source_type",
          "properties",
          "raw_json",
        ].join(","),
      )
      .eq("visitor_id", visitorId)
      .order("occurred_at", { ascending: true })
      .limit(MAX_RELATED_ROWS),
    client
      .from("website_conversions")
      .select(
        [
          "event_id",
          "session_id",
          "visitor_id",
          "occurred_at",
          "received_at",
          "source_type",
          "acuity_appointment_id",
          "appointment_type",
          "customer_name",
          "customer_email",
          "customer_phone",
          "meta_event_id",
          "meta_capi_status",
          "meta_capi_test_mode",
          "fbp",
          "fbc",
          "user_agent",
          "device_category",
          "browser_name",
          "os_name",
          "page_url",
          "referrer",
          "first_touch",
          "last_touch",
          "last_paid_touch",
          "conversion_touch",
          "properties",
          "raw_json",
        ].join(","),
      )
      .eq("visitor_id", visitorId)
      .order("occurred_at", { ascending: false })
      .limit(50),
  ]);

  if (visitorsResult.error) throw visitorsResult.error;
  if (sessionsResult.error) throw sessionsResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (conversionsResult.error) throw conversionsResult.error;

  const visitor = (visitorsResult.data || [])[0] || null;
  if (!visitor) return null;

  return buildAttributionLedgerDetailData({
    acuityAppointmentId: input.acuityAppointmentId,
    conversions: conversionsResult.data || [],
    events: eventsResult.data || [],
    sessions: sessionsResult.data || [],
    visitor,
  });
}

export function buildAttributionLedgerDetailData(input: {
  acuityAppointmentId?: string | null;
  conversions: AttributionLedgerConversionRow[];
  events: AttributionLedgerEventRow[];
  sessions: AttributionLedgerSessionRow[];
  visitor: AttributionLedgerVisitorRow;
}): AttributionLedgerDetailData {
  const conversion = selectDetailConversion(input.conversions, input.acuityAppointmentId);
  const sessionsByVisitor = latestByVisitor(input.sessions, "last_seen_at");
  const session = sessionsByVisitor.get(input.visitor.visitor_id) || null;
  const eventTouches = input.events.flatMap(eventAttributionTouches);
  const creditedTouch = selectBestPaidTouch(
    [
      attributionTouch(input.visitor.last_paid_touch),
      attributionTouch(conversion?.last_paid_touch),
      attributionTouch(conversion?.conversion_touch),
      attributionTouch(session?.last_paid_touch),
      ...conversionAttributionTouches(conversion),
      ...eventTouches,
    ],
    { maxCapturedAt: conversion?.occurred_at },
  );
  const returnEvent = selectReturnEvent(input.events, conversion);
  const returnTouch = returnEvent ? eventRowTouch(returnEvent) : null;
  const timeline = buildDetailTimeline({
    conversion,
    creditedTouch,
    events: input.events,
    returnEvent,
  });
  const booking = conversion
    ? {
        appointmentType: conversion.appointment_type,
        bookingTime: conversion.occurred_at,
        eventId: conversion.event_id,
        metaEventId: conversion.meta_event_id,
        sessionId: conversion.session_id,
      }
    : null;

  return {
    acuityAppointmentId: conversion?.acuity_appointment_id || input.acuityAppointmentId || null,
    booking,
    capi: {
      eventId: conversion?.meta_event_id || null,
      status: conversion?.meta_capi_status || null,
      testMode: conversion?.meta_capi_test_mode ?? null,
    },
    confidence: confidenceForDetail(input.visitor, conversion, session),
    creditedTouch: summarizeTouch(creditedTouch),
    returnTouch: summarizeTouch(returnTouch),
    summary: summarizePath(creditedTouch, returnTouch, conversion),
    timeline,
    visitorId: input.visitor.visitor_id,
  };
}

export function buildAttributionLedgerData(input: {
  conversions: AttributionLedgerConversionRow[];
  events?: AttributionLedgerEventRow[];
  range: AttributionLedgerData["timeRange"];
  sessions: AttributionLedgerSessionRow[];
  visitors: AttributionLedgerVisitorRow[];
}): AttributionLedgerData {
  const rows = buildAttributionLedgerRows(input);
  const capiStatusCounts = new Map<string, number>();

  for (const row of rows) {
    if (!row.capiStatus) continue;
    capiStatusCounts.set(row.capiStatus, (capiStatusCounts.get(row.capiStatus) || 0) + 1);
  }

  return {
    rows,
    summary: {
      capiStatuses: Array.from(capiStatusCounts.entries())
        .map(([status, count]) => ({ count, status }))
        .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status)),
      visitorsShown: rows.length,
      visitorsWithConversions: rows.filter((row) => row.hasConversion).length,
      visitorsWithPaidTouch: rows.filter((row) => row.hasPaidTouch).length,
    },
    timeRange: input.range,
  };
}

export function buildAttributionLedgerRows(input: {
  conversions: AttributionLedgerConversionRow[];
  events?: AttributionLedgerEventRow[];
  sessions: AttributionLedgerSessionRow[];
  visitors: AttributionLedgerVisitorRow[];
}): AttributionLedgerRow[] {
  const sessionsByVisitor = latestByVisitor(input.sessions, "last_seen_at");
  const conversionsByVisitor = latestByVisitor(input.conversions, "occurred_at");
  const eventsByVisitor = groupByVisitor(input.events || []);

  return [...input.visitors]
    .sort((a, b) => timestampValue(b.last_seen_at) - timestampValue(a.last_seen_at))
    .map((visitor) => {
      const session = sessionsByVisitor.get(visitor.visitor_id) || null;
      const conversion = conversionsByVisitor.get(visitor.visitor_id) || null;
      const eventTouches = (eventsByVisitor.get(visitor.visitor_id) || []).flatMap(eventAttributionTouches);
      const paidTouch = selectBestPaidTouch(
        [
          attributionTouch(visitor.last_paid_touch),
          attributionTouch(conversion?.last_paid_touch),
          attributionTouch(conversion?.conversion_touch),
          attributionTouch(session?.last_paid_touch),
          ...conversionAttributionTouches(conversion),
          ...eventTouches,
        ],
        { maxCapturedAt: conversion?.occurred_at },
      );
      const campaignId = paidTouch?.utm?.campaignId || null;
      const adsetId = paidTouch?.utm?.adsetId || null;
      const adId = paidTouch?.utm?.adId || null;
      const placement = paidTouch?.utm?.placement || null;
      const source =
        paidTouch?.utm?.source || paidTouch?.sourceType || paidTouch?.source || conversion?.source_type || null;
      const deviceCategory =
        conversion?.device_category ||
        visitor.device_category ||
        session?.device_category ||
        paidTouch?.deviceCategory ||
        null;
      const browserName =
        conversion?.browser_name ||
        visitor.browser_name ||
        session?.browser_name ||
        paidTouch?.browserName ||
        null;
      const osName = conversion?.os_name || visitor.os_name || session?.os_name || paidTouch?.osName || null;

      return {
        adId,
        adsetId,
        acuityAppointmentId: conversion?.acuity_appointment_id || null,
        appointmentType: conversion?.appointment_type || null,
        bookingTime: conversion?.occurred_at || null,
        browserName,
        campaignId,
        capiStatus: conversion?.meta_capi_status || null,
        customerEmail:
          conversion?.customer_email || visitor.customer_email || session?.customer_email || null,
        customerName:
          conversion?.customer_name || visitor.customer_name || session?.customer_name || null,
        customerPhone:
          conversion?.customer_phone || visitor.customer_phone || session?.customer_phone || null,
        deviceBrowser: formatDeviceBrowser(deviceCategory, browserName, osName),
        deviceCategory,
        fbc: conversion?.fbc || visitor.fbc || session?.fbc || paidTouch?.fbc || null,
        fbp: conversion?.fbp || visitor.fbp || session?.fbp || paidTouch?.fbp || null,
        firstPage: visitor.first_page_url || session?.first_page_url || null,
        hasConversion: Boolean(conversion),
        hasPaidTouch: Boolean(paidTouch),
        lastPaidSource: source,
        lastSeen: visitor.last_seen_at,
        metaEventId: conversion?.meta_event_id || null,
        osName,
        placement,
        sessionId: conversion?.session_id || session?.session_id || null,
        visitorId: visitor.visitor_id,
      };
    });
}

function selectDetailConversion(
  conversions: AttributionLedgerConversionRow[],
  acuityAppointmentId?: string | null,
) {
  const normalizedAcuityId = acuityAppointmentId?.trim();
  if (normalizedAcuityId) {
    const match = conversions.find((conversion) => {
      return (
        conversion.acuity_appointment_id === normalizedAcuityId ||
        conversion.event_id === normalizedAcuityId ||
        conversion.event_id === `acuity-${normalizedAcuityId}`
      );
    });
    if (match) return match;
  }

  return [...conversions].sort((a, b) => timestampValue(b.occurred_at) - timestampValue(a.occurred_at))[0] || null;
}

function selectReturnEvent(
  events: AttributionLedgerEventRow[],
  conversion: AttributionLedgerConversionRow | null,
) {
  const bookingTime = timestampValue(conversion?.occurred_at);
  const sessionId = conversion?.session_id;
  const beforeBooking = events
    .filter((event) => {
      if (!event.page_url) return false;
      if (sessionId && event.session_id !== sessionId) return false;
      const eventTime = timestampValue(event.occurred_at);
      return !bookingTime || eventTime <= bookingTime;
    })
    .sort((a, b) => timestampValue(a.occurred_at) - timestampValue(b.occurred_at));

  return (
    beforeBooking.find((event) => event.event_name === "PageView") ||
    beforeBooking.find((event) => event.referrer || event.utm_source || event.utm_medium) ||
    beforeBooking[0] ||
    null
  );
}

function buildDetailTimeline(input: {
  conversion: AttributionLedgerConversionRow | null;
  creditedTouch: AttributionTouch | null;
  events: AttributionLedgerEventRow[];
  returnEvent: AttributionLedgerEventRow | null;
}) {
  const bookingTime = timestampValue(input.conversion?.occurred_at);
  const sessionId = input.conversion?.session_id;
  const windowEnd = bookingTime ? bookingTime + DETAIL_EVENT_WINDOW_AFTER_BOOKING_MS : null;
  const timeline: AttributionLedgerTimelineEvent[] = [];
  const creditedSummary = summarizeTouch(input.creditedTouch);

  if (input.creditedTouch?.capturedAt && creditedSummary) {
    timeline.push({
      ...touchTimelineFields(creditedSummary),
      category: "ad_touch",
      eventId: null,
      label: "Paid ad attribution captured",
      occurredAt: input.creditedTouch.capturedAt,
    });
  }

  for (const event of input.events) {
    if (sessionId && event.session_id !== sessionId) continue;
    const eventTime = timestampValue(event.occurred_at);
    if (bookingTime && eventTime > (windowEnd || bookingTime)) continue;
    const touch = eventRowTouch(event);
    const summary = summarizeTouch(touch);
    timeline.push({
      ...touchTimelineFields(summary),
      category: timelineCategory(event),
      eventId: event.event_id,
      label: timelineLabel(event, input.returnEvent),
      occurredAt: event.occurred_at,
    });
  }

  if (input.conversion) {
    timeline.push({
      ...touchTimelineFields(summarizeTouch(attributionTouch(input.conversion.conversion_touch))),
      category: "conversion",
      eventId: input.conversion.event_id,
      label: "Acuity booking created",
      occurredAt: input.conversion.occurred_at,
    });

    if (input.conversion.meta_capi_status) {
      timeline.push({
        adId: null,
        adsetId: null,
        campaignId: null,
        category: "capi",
        content: null,
        eventId: input.conversion.meta_event_id,
        fbcPresent: Boolean(input.conversion.fbc),
        fbpPresent: Boolean(input.conversion.fbp),
        fbclidPresent: false,
        label: `Meta CAPI ${input.conversion.meta_capi_status}`,
        medium: null,
        occurredAt: input.conversion.received_at || input.conversion.occurred_at,
        pageUrl: null,
        placement: null,
        referrer: null,
        source: "Meta CAPI",
        sourceType: input.conversion.source_type,
      });
    }
  }

  return dedupeTimeline(timeline).sort((a, b) => timestampValue(a.occurredAt) - timestampValue(b.occurredAt));
}

function summarizeTouch(touch: AttributionTouch | null): AttributionLedgerTouchSummary | null {
  if (!touch) return null;
  const utm = touch.utm || {};
  return {
    adId: utm.adId || null,
    adsetId: utm.adsetId || null,
    campaignId: utm.campaignId || null,
    capturedAt: touch.capturedAt || null,
    content: utm.content || null,
    fbcPresent: Boolean(touch.fbc),
    fbpPresent: Boolean(touch.fbp),
    fbclidPresent: Boolean(utm.fbclid),
    medium: utm.medium || null,
    pageUrl: sanitizeUrl(touch.pageUrl),
    placement: utm.placement || null,
    referrer: sanitizeUrl(touch.referrer),
    source: utm.source || touch.source || null,
    sourceType: touch.sourceType || null,
  };
}

function touchTimelineFields(summary: AttributionLedgerTouchSummary | null) {
  return {
    adId: summary?.adId || null,
    adsetId: summary?.adsetId || null,
    campaignId: summary?.campaignId || null,
    content: summary?.content || null,
    fbcPresent: Boolean(summary?.fbcPresent),
    fbpPresent: Boolean(summary?.fbpPresent),
    fbclidPresent: Boolean(summary?.fbclidPresent),
    medium: summary?.medium || null,
    pageUrl: summary?.pageUrl || null,
    placement: summary?.placement || null,
    referrer: summary?.referrer || null,
    source: summary?.source || null,
    sourceType: summary?.sourceType || null,
  };
}

function timelineCategory(event: AttributionLedgerEventRow): AttributionLedgerTimelineEvent["category"] {
  if (event.event_name === "PageView" || event.event_name === "ViewContent") return "page";
  if (event.event_type === "booking" || event.event_name.startsWith("Booking")) return "booking";
  if (event.event_type === "conversion" || event.event_name === "Schedule") return "conversion";
  return "engagement";
}

function timelineLabel(event: AttributionLedgerEventRow, returnEvent: AttributionLedgerEventRow | null) {
  if (returnEvent?.event_id === event.event_id) return "Returned from Instagram/social URL";
  const labels: Record<string, string> = {
    BookingClientConfirmed: "Booking confirmed in browser",
    BookingContactStarted: "Contact form started",
    BookingDateSelected: "Date selected",
    BookingSubmitAttempt: "Booking submitted",
    BookingTimeSelected: "Time selected",
    BookingVisitSelected: "Appointment type selected",
    PageView: "Page viewed",
    Schedule: "Acuity booking created",
    ViewContent: "Booking page content viewed",
  };
  return labels[event.event_name] || event.event_name;
}

function dedupeTimeline(events: AttributionLedgerTimelineEvent[]) {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = `${event.occurredAt}|${event.category}|${event.eventId || ""}|${event.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function confidenceForDetail(
  visitor: AttributionLedgerVisitorRow,
  conversion: AttributionLedgerConversionRow | null,
  session: AttributionLedgerSessionRow | null,
): AttributionLedgerDetailData["confidence"] {
  const signals = [`Same visitor ID: ${visitor.visitor_id}`];

  if (conversion?.session_id || session?.session_id) {
    signals.push(`Same session ID: ${conversion?.session_id || session?.session_id}`);
  }
  if (conversion?.fbc || visitor.fbc || session?.fbc) signals.push("_fbc present");
  if (conversion?.fbp || visitor.fbp || session?.fbp) signals.push("_fbp present");
  if (conversion?.event_id) signals.push(`Conversion event: ${conversion.event_id}`);

  if (conversion?.session_id || session?.session_id) {
    return {
      explanation:
        "Matched by the same website visitor ID and session ID. This is browser-level attribution, not 100% legal identity certainty.",
      level: "browser_session",
      signals,
    };
  }

  if (conversion) {
    return {
      explanation:
        "Matched by the same website visitor ID. This is browser-level attribution, not 100% legal identity certainty.",
      level: "browser_visitor",
      signals,
    };
  }

  return {
    explanation: "No booking conversion was found for this visitor in the detail lookup.",
    level: "unmatched",
    signals,
  };
}

function summarizePath(
  creditedTouch: AttributionTouch | null,
  returnTouch: AttributionTouch | null,
  conversion: AttributionLedgerConversionRow | null,
) {
  if (!conversion) return null;
  const parts: string[] = [];
  const creditedAt = creditedTouch?.capturedAt;
  const returnAt = returnTouch?.capturedAt;

  if (creditedAt) {
    parts.push(`Paid attribution captured ${formatDurationBetween(creditedAt, conversion.occurred_at)} before booking`);
  }

  if (returnTouch) {
    const source = returnTouch.utm?.content || returnTouch.utm?.source || returnTouch.source || "return visit";
    parts.push(`returned from ${source}`);
  }

  if (returnAt) {
    parts.push(`booked ${formatDurationBetween(returnAt, conversion.occurred_at)} later`);
  }

  return parts.length ? sentenceCase(`${parts.join("; ")}.`) : "Booking conversion found for this visitor.";
}

function formatDurationBetween(start: string, end: string) {
  const deltaMs = Math.abs(timestampValue(end) - timestampValue(start));
  const seconds = Math.round(deltaMs / 1_000);
  if (seconds < 90) return `${seconds}s`;
  const minutes = Math.round(deltaMs / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function sentenceCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function latestByVisitor<Row extends { visitor_id: string | null }>(
  rows: Row[],
  timestampColumn: keyof Row,
) {
  const latest = new Map<string, Row>();

  for (const row of rows) {
    if (!row.visitor_id) continue;
    const existing = latest.get(row.visitor_id);
    if (
      !existing ||
      timestampValue(row[timestampColumn]) > timestampValue(existing[timestampColumn])
    ) {
      latest.set(row.visitor_id, row);
    }
  }

  return latest;
}

function groupByVisitor<Row extends { visitor_id: string | null }>(rows: Row[]) {
  const groups = new Map<string, Row[]>();

  for (const row of rows) {
    if (!row.visitor_id) continue;
    groups.set(row.visitor_id, [...(groups.get(row.visitor_id) || []), row]);
  }

  return groups;
}

function conversionAttributionTouches(conversion: AttributionLedgerConversionRow | null) {
  if (!conversion) return [];
  return [
    ...storedAttributionTouches(conversion.properties, conversion.occurred_at, conversion.source_type),
    ...storedAttributionTouches(conversion.raw_json, conversion.occurred_at, conversion.source_type),
  ];
}

function eventAttributionTouches(row: AttributionLedgerEventRow) {
  return [
    eventRowTouch(row),
    ...storedAttributionTouches(row.properties, row.occurred_at, row.source_type, row.source),
    ...storedAttributionTouches(row.raw_json, row.occurred_at, row.source_type, row.source),
  ].filter((touch): touch is AttributionTouch => Boolean(touch));
}

function eventRowTouch(row: AttributionLedgerEventRow): AttributionTouch | null {
  return attributionPayloadTouch(
    {
      browserName: row.browser_name,
      capturedAt: row.occurred_at,
      deviceCategory: row.device_category,
      fbc: row.fbc,
      fbp: row.fbp,
      osName: row.os_name,
      pageUrl: row.page_url,
      referrer: row.referrer,
      source: row.source,
      sourceType: row.source_type,
      utm: {
        ad: row.utm_ad,
        adId: row.utm_ad_id,
        adset: row.utm_adset,
        adsetId: row.utm_adset_id,
        campaign: row.utm_campaign,
        campaignId: row.utm_campaign_id,
        content: row.utm_content,
        creative: row.utm_creative,
        fbclid: row.fbclid,
        id: row.utm_id,
        medium: row.utm_medium,
        placement: row.utm_placement,
        source: row.utm_source,
        term: row.utm_term,
      },
    },
    row.occurred_at,
    row.source_type,
    row.source,
  );
}

function storedAttributionTouches(
  value: unknown,
  fallbackCapturedAt?: string | null,
  fallbackSourceType?: string | null,
  fallbackSource?: string | null,
) {
  const record = objectRecord(value);
  if (!record) return [];

  const tracking = objectRecord(record.tracking);
  return [
    attributionPayloadTouch(record.attribution, fallbackCapturedAt, fallbackSourceType, fallbackSource),
    attributionPayloadTouch(tracking?.attribution, fallbackCapturedAt, fallbackSourceType, fallbackSource),
    attributionPayloadTouch(tracking, fallbackCapturedAt, fallbackSourceType, fallbackSource),
    attributionPayloadTouch(record, fallbackCapturedAt, fallbackSourceType, fallbackSource),
  ].filter((touch): touch is AttributionTouch => Boolean(touch));
}

function attributionPayloadTouch(
  value: unknown,
  fallbackCapturedAt?: string | null,
  fallbackSourceType?: string | null,
  fallbackSource?: string | null,
): AttributionTouch | null {
  const record = objectRecord(value);
  if (!record) return null;
  const utm = normalizedUtmRecord(record.utm);
  const touch: AttributionTouch = {
    browserName: stringValue(record.browserName),
    capturedAt: stringValue(record.capturedAt) || stringValue(fallbackCapturedAt),
    deviceCategory: stringValue(record.deviceCategory),
    fbc: stringValue(record.fbc),
    fbp: stringValue(record.fbp),
    osName: stringValue(record.osName),
    pageUrl: firstStringValue(record.pageUrl, record.landingPageUrl),
    referrer: stringValue(record.referrer),
    source: stringValue(record.source) || stringValue(fallbackSource),
    sourceType: stringValue(record.sourceType) || stringValue(fallbackSourceType),
    utm,
  };

  return hasTouchSignal(touch) ? touch : null;
}

function attributionTouch(value: unknown): AttributionTouch | null {
  const record = objectRecord(value);
  if (!record) return null;
  const touch: AttributionTouch = {
    browserName: stringValue(record.browserName),
    capturedAt: stringValue(record.capturedAt),
    deviceCategory: stringValue(record.deviceCategory),
    fbc: stringValue(record.fbc),
    fbp: stringValue(record.fbp),
    osName: stringValue(record.osName),
    pageUrl: stringValue(record.pageUrl),
    referrer: stringValue(record.referrer),
    source: stringValue(record.source),
    sourceType: stringValue(record.sourceType),
    utm: normalizedUtmRecord(record.utm),
  };

  return hasTouchSignal(touch) ? touch : null;
}

function hasTouchSignal(touch: AttributionTouch) {
  return Boolean(
    touch.fbc ||
      touch.fbp ||
      touch.source ||
      touch.sourceType ||
      touch.utm ||
      touch.deviceCategory ||
      touch.browserName ||
      touch.osName,
  );
}

function normalizeLedgerDateRange(input: {
  days?: number | null;
  endDate?: string | null;
  startDate?: string | null;
}) {
  const end =
    input.endDate && DATE_PATTERN.test(input.endDate)
      ? input.endDate
      : format(new Date(), "yyyy-MM-dd");
  const days =
    input.days && Number.isFinite(input.days)
      ? Math.min(Math.max(input.days, 1), 365)
      : DEFAULT_LEDGER_DAYS;
  const start =
    input.startDate && DATE_PATTERN.test(input.startDate)
      ? input.startDate
      : format(subDays(parseISO(end), days - 1), "yyyy-MM-dd");
  const normalizedDays = differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
  return { days: normalizedDays, end, start };
}

function objectRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function normalizedUtmRecord(value: unknown) {
  const record = objectRecord(value);
  if (!record) return undefined;
  const aliases: Record<string, string[]> = {
    ad: ["ad", "utm_ad"],
    adId: ["adId", "ad_id", "utm_ad_id"],
    adset: ["adset", "utm_adset"],
    adsetId: ["adsetId", "adset_id", "utm_adset_id"],
    campaign: ["campaign", "utm_campaign"],
    campaignId: ["campaignId", "campaign_id", "utm_campaign_id"],
    content: ["content", "utm_content"],
    creative: ["creative", "utm_creative"],
    fbclid: ["fbclid"],
    gclid: ["gclid"],
    id: ["id", "utm_id"],
    medium: ["medium", "utm_medium"],
    msclkid: ["msclkid"],
    placement: ["placement", "utm_placement"],
    source: ["source", "utm_source"],
    term: ["term", "utm_term"],
    ttclid: ["ttclid"],
  };
  const normalized: Record<string, string> = {};

  for (const [key, candidates] of Object.entries(aliases)) {
    const value = firstStringValue(...candidates.map((candidate) => record[candidate]));
    if (value) normalized[key] = value;
  }

  return Object.keys(normalized).length ? normalized : undefined;
}

function firstStringValue(...values: unknown[]) {
  for (const value of values) {
    const text = stringValue(value);
    if (text) return text;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function sanitizeUrl(value: string | null | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    for (const param of ["fbclid", "gclid", "msclkid", "ttclid"]) {
      if (url.searchParams.has(param)) url.searchParams.set(param, "redacted");
    }
    return url.toString();
  } catch {
    return value.replace(/((?:fbclid|gclid|msclkid|ttclid)=)[^&\s]+/gi, "$1redacted");
  }
}

function timestampValue(value: unknown) {
  return typeof value === "string" ? Date.parse(value) || 0 : 0;
}

function formatDeviceBrowser(
  deviceCategory: string | null,
  browserName: string | null,
  osName: string | null,
) {
  return [deviceCategory, browserName, osName].filter(Boolean).join(" / ") || null;
}
