import { differenceInCalendarDays, format, parseISO, subDays } from "date-fns";

import { selectBestPaidTouch } from "./attribution-touch-selection.ts";
import { createServiceClient } from "./supabase.ts";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LEDGER_DAYS = 30;
const MAX_LEDGER_VISITORS = 500;
const MAX_RELATED_ROWS = 2500;

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

type AttributionTouch = {
  browserName?: string;
  capturedAt?: string;
  deviceCategory?: string;
  fbc?: string;
  fbp?: string;
  osName?: string;
  source?: string;
  sourceType?: string;
  utm?: Record<string, string>;
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
  meta_event_id: string | null;
  occurred_at: string;
  os_name: string | null;
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
      range,
      sessions: [],
      visitors,
    });
  }

  const [sessionsResult, conversionsResult] = await Promise.all([
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
      .from("website_conversions")
      .select(
        [
          "event_id",
          "session_id",
          "visitor_id",
          "occurred_at",
          "source_type",
          "acuity_appointment_id",
          "appointment_type",
          "customer_name",
          "customer_email",
          "customer_phone",
          "meta_event_id",
          "meta_capi_status",
          "fbp",
          "fbc",
          "user_agent",
          "device_category",
          "browser_name",
          "os_name",
          "first_touch",
          "last_touch",
          "last_paid_touch",
          "conversion_touch",
        ].join(","),
      )
      .in("visitor_id", visitorIds)
      .order("occurred_at", { ascending: false })
      .limit(MAX_RELATED_ROWS),
  ]);

  if (sessionsResult.error) throw sessionsResult.error;
  if (conversionsResult.error) throw conversionsResult.error;

  return buildAttributionLedgerData({
    conversions: conversionsResult.data || [],
    range,
    sessions: sessionsResult.data || [],
    visitors,
  });
}

export function buildAttributionLedgerData(input: {
  conversions: AttributionLedgerConversionRow[];
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
  sessions: AttributionLedgerSessionRow[];
  visitors: AttributionLedgerVisitorRow[];
}): AttributionLedgerRow[] {
  const sessionsByVisitor = latestByVisitor(input.sessions, "last_seen_at");
  const conversionsByVisitor = latestByVisitor(input.conversions, "occurred_at");

  return [...input.visitors]
    .sort((a, b) => timestampValue(b.last_seen_at) - timestampValue(a.last_seen_at))
    .map((visitor) => {
      const session = sessionsByVisitor.get(visitor.visitor_id) || null;
      const conversion = conversionsByVisitor.get(visitor.visitor_id) || null;
      const paidTouch = selectBestPaidTouch(
        [
          attributionTouch(visitor.last_paid_touch),
          attributionTouch(conversion?.last_paid_touch),
          attributionTouch(conversion?.conversion_touch),
          attributionTouch(session?.last_paid_touch),
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

function attributionTouch(value: unknown): AttributionTouch | null {
  const record = objectRecord(value);
  if (!record) return null;
  const utmRecord = objectRecord(record.utm);
  const utm = utmRecord ? stringRecord(utmRecord) : undefined;
  const touch: AttributionTouch = {
    browserName: stringValue(record.browserName),
    capturedAt: stringValue(record.capturedAt),
    deviceCategory: stringValue(record.deviceCategory),
    fbc: stringValue(record.fbc),
    fbp: stringValue(record.fbp),
    osName: stringValue(record.osName),
    source: stringValue(record.source),
    sourceType: stringValue(record.sourceType),
    utm: utm && Object.keys(utm).length ? utm : undefined,
  };

  if (
    touch.fbc ||
    touch.fbp ||
    touch.source ||
    touch.sourceType ||
    touch.utm ||
    touch.deviceCategory ||
    touch.browserName ||
    touch.osName
  ) {
    return touch;
  }

  return null;
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

function stringRecord(value: JsonRecord) {
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, stringValue(item)])
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
