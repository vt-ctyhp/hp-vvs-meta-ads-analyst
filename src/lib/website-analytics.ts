import { createHash, randomUUID } from "node:crypto";
import { addDays, differenceInCalendarDays, format, parseISO, subDays } from "date-fns";
import { z } from "zod";

import { BOOKING_ACTION_TYPES, actionArray, actionCount } from "./meta-kpi.ts";
import { createServiceClient } from "./supabase.ts";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_ALLOWED_ORIGINS = [
  "https://www.hungphatusa.com",
  "https://hungphatusa.com",
  "https://330744.myshopify.com",
  "https://hp-vvs-meta-ads-analyst.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
];
const DEFAULT_ALLOWED_WILDCARDS = ["*.shopifypreview.com"];
const MAX_EVENTS = 15000;
const MAX_APPOINTMENT_CONVERSIONS = 2000;

const jsonObjectSchema = z.record(z.string(), z.unknown()).catch({});
const eventTypeSchema = z.enum([
  "page",
  "engagement",
  "click",
  "search",
  "booking",
  "conversion",
  "error",
  "custom",
]);

const websiteEventSchema = z.object({
  eventId: z.string().trim().min(1).max(200).optional(),
  eventName: z.string().trim().min(1).max(80),
  eventType: eventTypeSchema.optional(),
  occurredAt: z.string().trim().datetime().optional(),
  sessionId: z.string().trim().min(1).max(200).optional(),
  visitorId: z.string().trim().min(1).max(200).optional(),
  brand: z.string().trim().min(1).max(20).optional(),
  pageUrl: z.string().trim().url().optional(),
  pagePath: z.string().trim().max(300).optional(),
  pageTitle: z.string().trim().max(250).optional(),
  pageGroup: z.string().trim().max(80).optional(),
  referrer: z.string().trim().max(1000).optional(),
  utm: z
    .object({
      ad: z.string().trim().max(180).optional(),
      adId: z.string().trim().max(120).optional(),
      adset: z.string().trim().max(180).optional(),
      adsetId: z.string().trim().max(120).optional(),
      source: z.string().trim().max(120).optional(),
      medium: z.string().trim().max(120).optional(),
      campaign: z.string().trim().max(180).optional(),
      campaignId: z.string().trim().max(120).optional(),
      content: z.string().trim().max(180).optional(),
      creative: z.string().trim().max(180).optional(),
      fbclid: z.string().trim().max(500).optional(),
      gclid: z.string().trim().max(500).optional(),
      id: z.string().trim().max(120).optional(),
      msclkid: z.string().trim().max(500).optional(),
      placement: z.string().trim().max(120).optional(),
      term: z.string().trim().max(180).optional(),
      ttclid: z.string().trim().max(500).optional(),
    })
    .optional(),
  attribution: jsonObjectSchema.optional(),
  fbp: z.string().trim().max(300).optional(),
  fbc: z.string().trim().max(300).optional(),
  userAgent: z.string().trim().max(600).optional(),
  properties: jsonObjectSchema.optional(),
});

const customerSchema = z
  .object({
    email: z.string().trim().email().optional(),
    firstName: z.string().trim().max(80).optional(),
    lastName: z.string().trim().max(80).optional(),
    name: z.string().trim().max(180).optional(),
    phone: z.string().trim().max(40).optional(),
  })
  .optional();

const conversionEventSchema = websiteEventSchema.extend({
  eventName: z.string().trim().min(1).max(80).default("Schedule"),
  eventType: eventTypeSchema.default("conversion"),
  metaEventName: z.string().trim().max(80).optional(),
  metaEventId: z.string().trim().max(200).optional(),
  metaCapiStatus: z.string().trim().max(40).optional(),
  metaCapiTestMode: z.boolean().optional(),
  acuityAppointmentId: z.string().trim().max(80).optional(),
  appointmentType: z.string().trim().max(180).optional(),
  customer: customerSchema,
});

export type WebsiteEventInput = z.input<typeof websiteEventSchema>;
export type WebsiteConversionInput = z.input<typeof conversionEventSchema>;

type WebsiteEventRow = {
  event_id: string;
  environment: string;
  session_id: string | null;
  visitor_id: string | null;
  brand: string;
  source: string;
  event_name: string;
  event_type: string;
  occurred_at: string;
  received_at?: string;
  page_url: string | null;
  page_path: string | null;
  page_title: string | null;
  page_group: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  utm_id: string | null;
  utm_campaign_id: string | null;
  utm_creative: string | null;
  utm_ad: string | null;
  utm_ad_id: string | null;
  utm_adset: string | null;
  utm_adset_id: string | null;
  utm_placement: string | null;
  fbclid: string | null;
  gclid: string | null;
  msclkid: string | null;
  ttclid: string | null;
  fbp: string | null;
  fbc: string | null;
  user_agent: string | null;
  device_category: string | null;
  browser_name: string | null;
  os_name: string | null;
  source_type: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  conversion_event_id: string | null;
  ip_hash: string | null;
  meta_event_name: string | null;
  meta_event_id: string | null;
  acuity_appointment_id: string | null;
  appointment_type: string | null;
  properties: Record<string, unknown>;
  raw_json: Record<string, unknown>;
};

type WebsiteSessionRow = {
  session_id: string;
  visitor_id: string | null;
  brand: string;
  first_seen_at: string;
  last_seen_at: string;
  first_page_url: string | null;
  last_page_url: string | null;
  first_referrer: string | null;
  last_referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  utm_id: string | null;
  utm_campaign_id: string | null;
  utm_creative: string | null;
  utm_ad: string | null;
  utm_ad_id: string | null;
  utm_adset: string | null;
  utm_adset_id: string | null;
  utm_placement: string | null;
  fbclid: string | null;
  gclid: string | null;
  msclkid: string | null;
  ttclid: string | null;
  fbp: string | null;
  fbc: string | null;
  user_agent: string | null;
  device_category: string | null;
  browser_name: string | null;
  os_name: string | null;
  first_touch: AttributionTouch | null;
  last_touch: AttributionTouch | null;
  last_paid_touch: AttributionTouch | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  conversion_event_id: string | null;
  ip_hash: string | null;
  raw_json: Record<string, unknown>;
};

type WebsiteVisitorRow = {
  visitor_id: string;
  brand: string;
  first_seen_at: string;
  last_seen_at: string;
  first_page_url: string | null;
  last_page_url: string | null;
  first_referrer: string | null;
  last_referrer: string | null;
  first_touch: AttributionTouch | null;
  last_touch: AttributionTouch | null;
  last_paid_touch: AttributionTouch | null;
  fbp: string | null;
  fbc: string | null;
  user_agent: string | null;
  device_category: string | null;
  browser_name: string | null;
  os_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  conversion_event_id: string | null;
  ip_hash: string | null;
  raw_json: Record<string, unknown>;
};

type WebsiteConversionRow = {
  event_id: string;
  session_id: string | null;
  visitor_id: string | null;
  brand: string;
  event_name: string;
  occurred_at: string;
  page_url: string | null;
  page_path: string | null;
  referrer: string | null;
  event_source_url: string | null;
  source_type: string | null;
  acuity_appointment_id: string | null;
  appointment_type: string | null;
  customer_name: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_email_hash: string | null;
  customer_phone_hash: string | null;
  customer_first_name_hash: string | null;
  customer_last_name_hash: string | null;
  meta_event_name: string | null;
  meta_event_id: string | null;
  meta_capi_status: string | null;
  meta_capi_test_mode: boolean | null;
  fbp: string | null;
  fbc: string | null;
  user_agent: string | null;
  device_category: string | null;
  browser_name: string | null;
  os_name: string | null;
  ip_hash: string | null;
  first_touch: AttributionTouch | null;
  last_touch: AttributionTouch | null;
  last_paid_touch: AttributionTouch | null;
  conversion_touch: AttributionTouch | null;
  tracking_completeness: Record<string, unknown>;
  properties: Record<string, unknown>;
  raw_json: Record<string, unknown>;
};

export type AttributionTouch = {
  capturedAt: string;
  eventId: string;
  eventName: string;
  fbc?: string;
  fbp?: string;
  pagePath?: string;
  pageUrl?: string;
  referrer?: string;
  source: string;
  sourceType: string;
  userAgent?: string;
  deviceCategory?: string;
  browserName?: string;
  osName?: string;
  utm?: Record<string, string>;
};

type MetaInsightRow = {
  date_start: string;
  bookings: string | number | null;
  conversions: string | number | null;
  actions: unknown;
};

export type AppointmentEventConversionRow = {
  id: string;
  appt_id: string;
  booking_source: string;
  external_booking_id: string | null;
  visit_date_time: string | null;
  visit_type: string | null;
  brand: string;
  status: string;
  source: string | null;
  booked_at: string | null;
  created_at: string;
  raw_payload: unknown;
};

type WebsiteSupabaseClient = {
  from: (table: "website_events") => {
    insert: (row: Partial<WebsiteEventRow>) => WebsiteInsertChain;
    update: (row: Partial<WebsiteEventRow>) => WebsiteUpdateChain;
    upsert: (
      row: WebsiteEventRow,
      options: { onConflict: string },
    ) => WebsiteUpsertChain;
    select: (columns: string) => WebsiteSelectChain<WebsiteEventRow[]>;
  };
} & {
  from: (table: "website_sessions") => {
    insert: (row: WebsiteSessionRow) => WebsiteInsertChain;
    update: (row: Partial<WebsiteSessionRow>) => WebsiteUpdateChain;
    upsert: (
      row: WebsiteSessionRow,
      options: { onConflict: string },
    ) => WebsiteUpsertChain;
    select: (columns: string) => WebsiteSelectChain<WebsiteSessionRow[]>;
  };
} & {
  from: (table: "website_visitors") => {
    insert: (row: WebsiteVisitorRow) => WebsiteInsertChain;
    update: (row: Partial<WebsiteVisitorRow>) => WebsiteUpdateChain;
    upsert: (
      row: WebsiteVisitorRow,
      options: { onConflict: string },
    ) => WebsiteUpsertChain;
    select: (columns: string) => WebsiteSelectChain<WebsiteVisitorRow[]>;
  };
} & {
  from: (table: "website_conversions") => {
    upsert: (
      row: WebsiteConversionRow,
      options: { onConflict: string },
    ) => WebsiteUpsertChain;
    select: (columns: string) => WebsiteSelectChain<WebsiteConversionRow[]>;
  };
} & {
  from: (table: "meta_daily_insights") => {
    select: (columns: string) => WebsiteSelectChain<MetaInsightRow[]>;
  };
} & {
  from: (table: "appointment_events") => {
    select: (columns: string) => WebsiteSelectChain<AppointmentEventConversionRow[]>;
  };
};

type WebsiteSelectChain<T> = PromiseLike<{ data: T | null; error: Error | null }> & {
  eq: (column: string, value: unknown) => WebsiteSelectChain<T>;
  gte: (column: string, value: unknown) => WebsiteSelectChain<T>;
  in: (column: string, values: unknown[]) => WebsiteSelectChain<T>;
  lte: (column: string, value: unknown) => WebsiteSelectChain<T>;
  order: (column: string, options: { ascending: boolean }) => WebsiteSelectChain<T>;
  limit: (count: number) => WebsiteSelectChain<T>;
  maybeSingle: () => Promise<{
    data: T extends Array<infer Row> ? Row | null : T | null;
    error: Error | null;
  }>;
  single: () => Promise<{
    data: T extends Array<infer Row> ? Row : T;
    error: Error | null;
  }>;
};

type WebsiteInsertChain = PromiseLike<{ data: unknown; error: Error | null }> & {
  select: (columns: string) => {
    single: () => Promise<{ data: unknown; error: Error | null }>;
  };
};

type WebsiteUpsertChain = PromiseLike<{ data: unknown; error: Error | null }> & {
  select: (columns: string) => {
    single: () => Promise<{ data: unknown; error: Error | null }>;
  };
};

type WebsiteUpdateChain = {
  eq: (column: string, value: unknown) => Promise<{ data: unknown; error: Error | null }>;
};

export type WebsiteFunnelData = {
  configured: boolean;
  sourceTransparency: {
    timeRange: { start: string; end: string; days: number };
    recordCounts: Record<string, number>;
  };
  overview: {
    sessions: number;
    pageViews: number;
    engagedSessions: number;
    importantClicks: number;
    searches: number;
    scrollDepthEvents: number;
    bookingStarts: number;
    schedules: number;
    metaAttributedBookings: number;
    metaPaidSessions: number;
    customerLinkedEvents: number;
    completeTrackingConversions: number;
    discrepancy: number;
  };
  funnel: Array<{
    key: string;
    label: string;
    count: number;
    rateFromPrevious: number | null;
    rateFromStart: number | null;
  }>;
  pages: Array<{
    pageGroup: string;
    pagePath: string;
    pageTitle: string;
    pageViews: number;
    sessions: number;
    importantClicks: number;
    searches: number;
    maxScrollDepth: number;
    schedules: number;
  }>;
  trend: Array<{
    date: string;
    pageViews: number;
    bookingSteps: number;
    schedules: number;
    metaAttributedBookings: number;
  }>;
  recentEvents: Array<{
    adId: string | null;
    adsetId: string | null;
    campaignId: string | null;
    customerName: string | null;
    eventName: string;
    eventType: string;
    source: string;
    sourceType: string | null;
    occurredAt: string;
    pagePath: string | null;
    pageGroup: string | null;
    eventId: string;
    metaEventId: string | null;
    acuityAppointmentId: string | null;
  }>;
};

export type WebsiteConversionReconciliationResult = {
  checkedAppointments: number;
  eligibleAppointments: number;
  insertedConversions: number;
  skippedExistingConversions: number;
};

export type WebsiteAttributionResolution = {
  bestTouch: AttributionTouch | null;
  eventSourceUrl?: string;
  fbc?: string;
  fbp?: string;
  firstTouch: AttributionTouch | null;
  lastPaidTouch: AttributionTouch | null;
  lastTouch: AttributionTouch | null;
  ok: boolean;
  sessionId?: string;
  sourceType?: string;
  utm?: Record<string, string>;
  visitorId?: string;
};

const attributionResolveSchema = z.object({
  eventSourceUrl: z.string().trim().url().optional(),
  fbc: z.string().trim().max(300).optional(),
  fbp: z.string().trim().max(300).optional(),
  pageUrl: z.string().trim().url().optional(),
  sessionId: z.string().trim().min(1).max(200).optional(),
  visitorId: z.string().trim().min(1).max(200).optional(),
});

type ReconciledWebsiteConversionInput = WebsiteConversionInput & {
  eventId: string;
  eventName: "Schedule";
  eventType: "conversion";
  occurredAt: string;
};

export function corsHeadersForRequest(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = isAllowedOrigin(origin);
  const headers = new Headers({
    "Access-Control-Allow-Headers":
      "authorization, content-type, x-hp-website-event-secret",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  });

  if (origin && allowed) headers.set("Access-Control-Allow-Origin", origin);
  return { allowed, headers, origin };
}

export function assertAllowedOrigin(request: Request) {
  const { allowed, origin } = corsHeadersForRequest(request);
  if (origin && !allowed) {
    throw new Error(`Origin is not allowed for website event ingestion: ${origin}`);
  }
}

export function isAuthorizedConversionRequest(request: Request) {
  const secret = process.env.WEBSITE_EVENT_SHARED_SECRET?.trim();
  if (!secret) return false;

  const auth = request.headers.get("authorization");
  const header = request.headers.get("x-hp-website-event-secret");
  return auth === `Bearer ${secret}` || header === secret;
}

export async function recordBrowserWebsiteEvent(input: unknown, request: Request) {
  assertAllowedOrigin(request);
  const parsed = websiteEventSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Invalid website event payload." };
  }

  return recordWebsiteEvent(parsed.data, {
    request,
    source: "shopify_browser",
  });
}

export async function recordServerWebsiteConversion(input: unknown, request: Request) {
  const parsed = conversionEventSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Invalid website conversion payload." };
  }

  return recordWebsiteEvent(parsed.data, {
    request,
    source: "booking_api",
  });
}

export async function resolveWebsiteAttribution(input: unknown): Promise<WebsiteAttributionResolution> {
  const parsed = attributionResolveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, bestTouch: null, firstTouch: null, lastPaidTouch: null, lastTouch: null };
  }

  const client = createWebsiteClient();
  const visitor = parsed.data.visitorId
    ? await findVisitor(client, parsed.data.visitorId)
    : null;
  const session = parsed.data.sessionId
    ? await findSession(client, parsed.data.sessionId)
    : null;
  const firstTouch = visitor?.first_touch || session?.first_touch || null;
  const lastTouch = mostRecentTouch(visitor?.last_touch, session?.last_touch);
  const lastPaidTouch = mostRecentTouch(visitor?.last_paid_touch, session?.last_paid_touch);
  const bestTouch = lastPaidTouch || lastTouch || firstTouch;
  const fbc = parsed.data.fbc || bestTouch?.fbc || visitor?.fbc || session?.fbc || undefined;
  const fbp = parsed.data.fbp || bestTouch?.fbp || visitor?.fbp || session?.fbp || undefined;
  const eventSourceUrl = attributionEventSourceUrl(
    parsed.data.eventSourceUrl || parsed.data.pageUrl,
    bestTouch,
  );

  return {
    bestTouch,
    eventSourceUrl,
    fbc,
    fbp,
    firstTouch,
    lastPaidTouch,
    lastTouch,
    ok: true,
    sessionId: parsed.data.sessionId,
    sourceType: bestTouch?.sourceType,
    utm: bestTouch?.utm,
    visitorId: parsed.data.visitorId,
  };
}

export async function fetchWebsiteFunnelData(input: {
  startDate?: string | null;
  endDate?: string | null;
  days?: number | null;
}): Promise<WebsiteFunnelData> {
  const range = normalizeDateRange(input);
  const reconciliation = await reconcileAppointmentConversionsForRange(range);
  const client = createWebsiteClient();
  const startIso = `${range.start}T00:00:00.000Z`;
  const endIso = `${range.end}T23:59:59.999Z`;

  const [eventsResult, metaResult] = await Promise.all([
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
          "page_path",
          "page_title",
          "page_group",
          "source_type",
          "utm_campaign_id",
          "utm_adset_id",
          "utm_ad_id",
          "meta_event_id",
          "acuity_appointment_id",
          "customer_name",
          "customer_email",
          "customer_phone",
          "properties",
        ].join(","),
      )
      .gte("occurred_at", startIso)
      .lte("occurred_at", endIso)
      .order("occurred_at", { ascending: false })
      .limit(MAX_EVENTS),
    client
      .from("meta_daily_insights")
      .select("date_start,bookings,conversions,actions")
      .gte("date_start", range.start)
      .lte("date_start", range.end)
      .limit(50000),
  ]);

  if (eventsResult.error) throw eventsResult.error;
  if (metaResult.error) throw metaResult.error;

  const events = (eventsResult.data || []) as WebsiteEventRow[];
  const metaRows = (metaResult.data || []) as MetaInsightRow[];
  const sessions = new Set(events.map((event) => event.session_id).filter(Boolean));
  const engagedSessions = new Set(
    events
      .filter((event) => event.event_name.startsWith("Engaged"))
      .map((event) => event.session_id)
      .filter(Boolean),
  );
  const schedules = events.filter(isScheduleEvent);
  const metaPaidSessions = new Set(
    events
      .filter((event) => event.source_type === "paid_meta")
      .map((event) => event.session_id)
      .filter(Boolean),
  );
  const customerLinkedEvents = events.filter((event) => Boolean(event.customer_email || event.customer_phone)).length;
  const completeTrackingConversions = schedules.filter((event) => {
    const completeness = objectRecord(event.properties?.trackingCompleteness);
    return completeness.complete === true;
  }).length;
  const metaAttributedBookings = metaRows.reduce((sum, row) => {
    const actionBookings = actionCount(actionArray(row.actions), BOOKING_ACTION_TYPES);
    return sum + Math.max(numberValue(row.bookings), actionBookings);
  }, 0);

  return {
    configured: true,
    sourceTransparency: {
      timeRange: range,
      recordCounts: {
        appointment_events_checked: reconciliation.checkedAppointments,
        appointment_events_eligible: reconciliation.eligibleAppointments,
        appointment_events_reconciled: reconciliation.insertedConversions,
        meta_daily_insights: metaRows.length,
        website_events: events.length,
      },
    },
    overview: {
      sessions: sessions.size,
      pageViews: countEvents(events, "PageView"),
      engagedSessions: engagedSessions.size,
      importantClicks: countType(events, "click"),
      searches: countEvents(events, "Search"),
      scrollDepthEvents: countEvents(events, "ScrollDepth"),
      bookingStarts: countEvents(events, "BookingVisitSelected"),
      schedules: schedules.length,
      metaAttributedBookings,
      metaPaidSessions: metaPaidSessions.size,
      customerLinkedEvents,
      completeTrackingConversions,
      discrepancy: schedules.length - metaAttributedBookings,
    },
    funnel: buildFunnel(events, schedules.length),
    pages: buildPages(events),
    trend: buildTrend(events, metaRows, range.start, range.end),
    recentEvents: events.slice(0, 50).map((event) => ({
      adId: event.utm_ad_id,
      adsetId: event.utm_adset_id,
      campaignId: event.utm_campaign_id,
      customerName: event.customer_name,
      eventName: event.event_name,
      eventType: event.event_type,
      source: event.source,
      sourceType: event.source_type,
      occurredAt: event.occurred_at,
      pagePath: event.page_path,
      pageGroup: event.page_group,
      eventId: event.event_id,
      metaEventId: event.meta_event_id,
      acuityAppointmentId: event.acuity_appointment_id,
    })),
  };
}

export async function reconcileAppointmentConversionsToWebsiteEvents(input: {
  startDate?: string | null;
  endDate?: string | null;
  days?: number | null;
}): Promise<WebsiteConversionReconciliationResult> {
  return reconcileAppointmentConversionsForRange(normalizeDateRange(input));
}

async function reconcileAppointmentConversionsForRange(range: {
  start: string;
  end: string;
  days: number;
}): Promise<WebsiteConversionReconciliationResult> {
  const client = createWebsiteClient();
  const startIso = `${range.start}T00:00:00.000Z`;
  const endIso = `${range.end}T23:59:59.999Z`;

  const appointmentsResult = await client
    .from("appointment_events")
    .select(
      [
        "id",
        "appt_id",
        "booking_source",
        "external_booking_id",
        "visit_date_time",
        "visit_type",
        "brand",
        "status",
        "source",
        "booked_at",
        "created_at",
        "raw_payload",
      ].join(","),
    )
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .order("created_at", { ascending: false })
    .limit(MAX_APPOINTMENT_CONVERSIONS);

  if (appointmentsResult.error) throw appointmentsResult.error;

  const appointmentRows = appointmentsResult.data || [];
  const conversions = appointmentRows
    .map(appointmentEventToWebsiteConversionInput)
    .filter((conversion): conversion is ReconciledWebsiteConversionInput =>
      Boolean(conversion?.eventId),
    );

  if (!conversions.length) {
    return {
      checkedAppointments: appointmentRows.length,
      eligibleAppointments: 0,
      insertedConversions: 0,
      skippedExistingConversions: 0,
    };
  }

  const existingResult = await client
    .from("website_events")
    .select("event_id")
    .in(
      "event_id",
      conversions.map((conversion) => conversion.eventId),
    )
    .limit(conversions.length);

  if (existingResult.error) throw existingResult.error;

  const existingEventIds = new Set(
    (existingResult.data || []).map((event) => event.event_id),
  );
  let insertedConversions = 0;

  for (const conversion of conversions) {
    if (existingEventIds.has(conversion.eventId)) continue;
    await recordWebsiteEvent(conversion, {
      request: new Request("https://hp-vvs-meta-ads-analyst.internal/appointment-reconciliation"),
      source: "booking_api",
    });
    insertedConversions += 1;
  }

  return {
    checkedAppointments: appointmentRows.length,
    eligibleAppointments: conversions.length,
    insertedConversions,
    skippedExistingConversions: conversions.length - insertedConversions,
  };
}

export function appointmentEventToWebsiteConversionInput(
  row: AppointmentEventConversionRow,
): ReconciledWebsiteConversionInput | null {
  const acuityAppointmentId = row.external_booking_id?.trim();
  if (row.booking_source !== "acuity" || !acuityAppointmentId) return null;

  const rawPayload = objectRecord(row.raw_payload);
  const appointment = objectRecord(rawPayload.appointment);
  const appointmentType = trimmedString(appointment.type) || trimmedString(row.visit_type);
  const firstName = trimmedString(appointment.firstName);
  const lastName = trimmedString(appointment.lastName);
  const email = trimmedString(appointment.email);
  const phone = trimmedString(appointment.phone);
  const appointmentTypeId = primitiveValue(appointment.appointmentTypeID);
  const calendarId = primitiveValue(appointment.calendarID);
  const duration = primitiveValue(appointment.duration);
  const timezone = trimmedString(appointment.timezone);
  const visitDateTime = timestampValue(appointment.datetime) || timestampValue(row.visit_date_time);
  const occurredAt =
    timestampValue(appointment.datetimeCreated) ||
    timestampValue(row.created_at) ||
    timestampValue(row.booked_at) ||
    new Date().toISOString();

  const properties: Record<string, unknown> = {
    appointmentEventId: row.id,
    appointmentRecordId: row.appt_id,
    appointmentSource: row.source,
    appointmentStatus: row.status,
    reconciledFromAppointmentEvent: true,
  };

  if (visitDateTime) properties.datetime = visitDateTime;
  if (timezone) properties.timezone = timezone;
  if (appointmentTypeId !== null) properties.appointmentTypeID = appointmentTypeId;
  if (calendarId !== null) properties.calendarID = calendarId;
  if (duration !== null) properties.duration = duration;

  return {
    eventId: `acuity-${acuityAppointmentId}`,
    eventName: "Schedule",
    eventType: "conversion",
    occurredAt,
    brand: websiteBrand(row.brand),
    pageUrl: bookingPageUrl(row.brand),
    pagePath: "/pages/book-an-appointment",
    pageGroup: "booking",
    properties,
    metaEventName: "Schedule",
    metaEventId: `acuity-${acuityAppointmentId}`,
    acuityAppointmentId,
    appointmentType: appointmentType ? appointmentType.slice(0, 180) : undefined,
    customer: {
      email: email || undefined,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      name: [firstName, lastName].filter(Boolean).join(" ") || undefined,
      phone: phone || undefined,
    },
  };
}

async function recordWebsiteEvent(
  input: z.infer<typeof websiteEventSchema> & Partial<z.infer<typeof conversionEventSchema>>,
  options: { request: Request; source: string },
) {
  const environment = websiteAttributionEnvironment();
  const occurredAt = input.occurredAt || new Date().toISOString();
  const pageUrl = input.pageUrl || null;
  const pagePath = input.pagePath || pathFromUrl(pageUrl);
  const pageGroup = input.pageGroup || classifyPagePath(pagePath);
  const eventName = input.eventName || "Schedule";
  const eventType = input.eventType || inferEventType(eventName);
  const eventId = input.eventId || `${options.source}-${randomUUID()}`;
  const ipHash = hashIpAddress(requestIpAddress(options.request));
  const userAgent = input.userAgent || options.request.headers.get("user-agent") || null;
  const brand = input.brand || "HP";
  const device = parseDevice(userAgent);
  const utm = normalizeUtm(input.utm);
  const sourceType = classifySourceType({ fbc: input.fbc, referrer: input.referrer, utm });
  const customer = normalizeCustomer(input.customer);
  const row: WebsiteEventRow = {
    event_id: eventId,
    environment,
    session_id: input.sessionId || null,
    visitor_id: input.visitorId || null,
    brand,
    source: options.source,
    event_name: eventName,
    event_type: eventType,
    occurred_at: occurredAt,
    page_url: pageUrl,
    page_path: pagePath,
    page_title: input.pageTitle || null,
    page_group: pageGroup,
    referrer: input.referrer || null,
    utm_source: utm.source || null,
    utm_medium: utm.medium || null,
    utm_campaign: utm.campaign || null,
    utm_content: utm.content || null,
    utm_term: utm.term || null,
    utm_id: utm.id || null,
    utm_campaign_id: utm.campaignId || null,
    utm_creative: utm.creative || null,
    utm_ad: utm.ad || null,
    utm_ad_id: utm.adId || null,
    utm_adset: utm.adset || null,
    utm_adset_id: utm.adsetId || null,
    utm_placement: utm.placement || null,
    fbclid: utm.fbclid || null,
    gclid: utm.gclid || null,
    msclkid: utm.msclkid || null,
    ttclid: utm.ttclid || null,
    fbp: input.fbp || null,
    fbc: input.fbc || null,
    user_agent: userAgent,
    device_category: device.deviceCategory,
    browser_name: device.browserName,
    os_name: device.osName,
    source_type: sourceType,
    customer_name: customer.name || null,
    customer_email: customer.email || null,
    customer_phone: customer.phone || null,
    conversion_event_id: isConversionEventName(eventName, input.metaEventName) ? eventId : null,
    ip_hash: ipHash,
    meta_event_name: input.metaEventName || (eventName === "Schedule" ? "Schedule" : null),
    meta_event_id: input.metaEventId || null,
    acuity_appointment_id: input.acuityAppointmentId || null,
    appointment_type: input.appointmentType || null,
    properties: input.properties || {},
    raw_json: {
      ...input,
      receivedFrom: options.source,
    },
  };

  const client = createWebsiteClient();
  const touch = attributionTouch(row);
  const visitor = row.visitor_id ? await upsertWebsiteVisitor(client, row, touch) : null;
  if (row.session_id) {
    await upsertWebsiteSession(client, row, touch);
  }
  const conversionContext = isConversionEventName(eventName, row.meta_event_name)
    ? {
        customer,
        firstTouch: visitor?.first_touch || null,
        lastTouch: visitor?.last_touch || touch,
        lastPaidTouch: visitor?.last_paid_touch || (isPaidTouch(touch) ? touch : null),
        touch,
        trackingCompleteness: trackingCompletenessReport({
          customer,
          firstTouch: visitor?.first_touch || null,
          lastPaidTouch: visitor?.last_paid_touch || (isPaidTouch(touch) ? touch : null),
          row,
        }),
      }
    : null;
  if (conversionContext) {
    row.properties = {
      ...row.properties,
      trackingCompleteness: conversionContext.trackingCompleteness,
    };
  }

  const { data, error } = await client
    .from("website_events")
    .upsert(row, { onConflict: "environment,event_id" })
    .select("id")
    .single();
  if (error) throw error;

  if (conversionContext) {
    await upsertWebsiteConversion(client, row, input, {
      customer: conversionContext.customer,
      firstTouch: conversionContext.firstTouch,
      lastPaidTouch: conversionContext.lastPaidTouch,
      lastTouch: conversionContext.lastTouch,
      touch: conversionContext.touch,
      trackingCompleteness: conversionContext.trackingCompleteness,
    });

    if (customer.name || customer.email || customer.phone) {
      await backfillLinkedCustomer(client, row, customer);
    }
  }

  return {
    eventId,
    id: data,
    ok: true as const,
  };
}

function websiteAttributionEnvironment() {
  return process.env.WEBSITE_ATTRIBUTION_ENVIRONMENT?.trim() || "production";
}

function createWebsiteClient() {
  return createServiceClient() as unknown as WebsiteSupabaseClient;
}

async function findVisitor(client: WebsiteSupabaseClient, visitorId: string) {
  const { data, error } = await client
    .from("website_visitors")
    .select("visitor_id,brand,first_seen_at,last_seen_at,first_page_url,last_page_url,first_referrer,last_referrer,first_touch,last_touch,last_paid_touch,fbp,fbc,user_agent,device_category,browser_name,os_name,customer_name,customer_email,customer_phone,conversion_event_id,ip_hash,raw_json")
    .eq("visitor_id", visitorId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function findSession(client: WebsiteSupabaseClient, sessionId: string) {
  const { data, error } = await client
    .from("website_sessions")
    .select("session_id,visitor_id,brand,first_seen_at,last_seen_at,first_page_url,last_page_url,first_referrer,last_referrer,utm_source,utm_medium,utm_campaign,utm_content,utm_term,utm_id,utm_campaign_id,utm_creative,utm_ad,utm_ad_id,utm_adset,utm_adset_id,utm_placement,fbclid,gclid,msclkid,ttclid,fbp,fbc,user_agent,device_category,browser_name,os_name,first_touch,last_touch,last_paid_touch,customer_name,customer_email,customer_phone,conversion_event_id,ip_hash,raw_json")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function upsertWebsiteVisitor(
  client: WebsiteSupabaseClient,
  row: WebsiteEventRow,
  touch: AttributionTouch,
) {
  if (!row.visitor_id) return null;

  const existing = await findVisitor(client, row.visitor_id);
  const next: WebsiteVisitorRow = {
    visitor_id: row.visitor_id,
    brand: row.brand,
    first_seen_at: existing?.first_seen_at || row.occurred_at,
    last_seen_at: row.occurred_at,
    first_page_url: existing?.first_page_url || row.page_url,
    last_page_url: row.page_url,
    first_referrer: existing?.first_referrer || row.referrer,
    last_referrer: row.referrer,
    first_touch: existing?.first_touch || touch,
    last_touch: touch,
    last_paid_touch: isPaidTouch(touch) ? touch : existing?.last_paid_touch || null,
    fbp: row.fbp || existing?.fbp || null,
    fbc: row.fbc || existing?.fbc || null,
    user_agent: row.user_agent || existing?.user_agent || null,
    device_category: row.device_category || existing?.device_category || null,
    browser_name: row.browser_name || existing?.browser_name || null,
    os_name: row.os_name || existing?.os_name || null,
    customer_name: row.customer_name || existing?.customer_name || null,
    customer_email: row.customer_email || existing?.customer_email || null,
    customer_phone: row.customer_phone || existing?.customer_phone || null,
    conversion_event_id: row.conversion_event_id || existing?.conversion_event_id || null,
    ip_hash: row.ip_hash || existing?.ip_hash || null,
    raw_json: {
      ...(existing?.raw_json || {}),
      latestEventId: row.event_id,
    },
  };

  const { error } = existing
    ? await client.from("website_visitors").update(next).eq("visitor_id", row.visitor_id)
    : await client.from("website_visitors").insert(next);
  if (error) throw error;
  return next;
}

async function upsertWebsiteSession(
  client: WebsiteSupabaseClient,
  row: WebsiteEventRow,
  touch: AttributionTouch,
) {
  if (!row.session_id) return null;

  const existing = await findSession(client, row.session_id);
  const next: WebsiteSessionRow = {
    session_id: row.session_id,
    visitor_id: row.visitor_id || existing?.visitor_id || null,
    brand: row.brand,
    first_seen_at: existing?.first_seen_at || row.occurred_at,
    last_seen_at: row.occurred_at,
    first_page_url: existing?.first_page_url || row.page_url,
    last_page_url: row.page_url,
    first_referrer: existing?.first_referrer || row.referrer,
    last_referrer: row.referrer,
    utm_source: row.utm_source || existing?.utm_source || null,
    utm_medium: row.utm_medium || existing?.utm_medium || null,
    utm_campaign: row.utm_campaign || existing?.utm_campaign || null,
    utm_content: row.utm_content || existing?.utm_content || null,
    utm_term: row.utm_term || existing?.utm_term || null,
    utm_id: row.utm_id || existing?.utm_id || null,
    utm_campaign_id: row.utm_campaign_id || existing?.utm_campaign_id || null,
    utm_creative: row.utm_creative || existing?.utm_creative || null,
    utm_ad: row.utm_ad || existing?.utm_ad || null,
    utm_ad_id: row.utm_ad_id || existing?.utm_ad_id || null,
    utm_adset: row.utm_adset || existing?.utm_adset || null,
    utm_adset_id: row.utm_adset_id || existing?.utm_adset_id || null,
    utm_placement: row.utm_placement || existing?.utm_placement || null,
    fbclid: row.fbclid || existing?.fbclid || null,
    gclid: row.gclid || existing?.gclid || null,
    msclkid: row.msclkid || existing?.msclkid || null,
    ttclid: row.ttclid || existing?.ttclid || null,
    fbp: row.fbp || existing?.fbp || null,
    fbc: row.fbc || existing?.fbc || null,
    user_agent: row.user_agent || existing?.user_agent || null,
    device_category: row.device_category || existing?.device_category || null,
    browser_name: row.browser_name || existing?.browser_name || null,
    os_name: row.os_name || existing?.os_name || null,
    first_touch: existing?.first_touch || touch,
    last_touch: touch,
    last_paid_touch: isPaidTouch(touch) ? touch : existing?.last_paid_touch || null,
    customer_name: row.customer_name || existing?.customer_name || null,
    customer_email: row.customer_email || existing?.customer_email || null,
    customer_phone: row.customer_phone || existing?.customer_phone || null,
    conversion_event_id: row.conversion_event_id || existing?.conversion_event_id || null,
    ip_hash: row.ip_hash || existing?.ip_hash || null,
    raw_json: {
      ...(existing?.raw_json || {}),
      latestEventId: row.event_id,
    },
  };

  const { error } = existing
    ? await client.from("website_sessions").update(next).eq("session_id", row.session_id)
    : await client.from("website_sessions").insert(next);
  if (error) throw error;
  return next;
}

async function upsertWebsiteConversion(
  client: WebsiteSupabaseClient,
  row: WebsiteEventRow,
  input: Partial<z.infer<typeof conversionEventSchema>>,
  context: {
    customer: NormalizedCustomer;
    firstTouch: AttributionTouch | null;
    lastPaidTouch: AttributionTouch | null;
    lastTouch: AttributionTouch | null;
    touch: AttributionTouch;
    trackingCompleteness: Record<string, unknown>;
  },
) {
  const conversion: WebsiteConversionRow = {
    event_id: row.event_id,
    session_id: row.session_id,
    visitor_id: row.visitor_id,
    brand: row.brand,
    event_name: row.event_name,
    occurred_at: row.occurred_at,
    page_url: row.page_url,
    page_path: row.page_path,
    referrer: row.referrer,
    event_source_url: row.page_url,
    source_type: row.source_type,
    acuity_appointment_id: row.acuity_appointment_id,
    appointment_type: row.appointment_type,
    customer_name: context.customer.name || null,
    customer_first_name: context.customer.firstName || null,
    customer_last_name: context.customer.lastName || null,
    customer_email: context.customer.email || null,
    customer_phone: context.customer.phone || null,
    customer_email_hash: context.customer.email ? sha256(normalizeEmail(context.customer.email)) : null,
    customer_phone_hash: context.customer.phone ? sha256(normalizePhone(context.customer.phone)) : null,
    customer_first_name_hash: context.customer.firstName ? sha256(normalizeName(context.customer.firstName)) : null,
    customer_last_name_hash: context.customer.lastName ? sha256(normalizeName(context.customer.lastName)) : null,
    meta_event_name: row.meta_event_name,
    meta_event_id: row.meta_event_id,
    meta_capi_status: input.metaCapiStatus || null,
    meta_capi_test_mode: input.metaCapiTestMode ?? null,
    fbp: row.fbp,
    fbc: row.fbc,
    user_agent: row.user_agent,
    device_category: row.device_category,
    browser_name: row.browser_name,
    os_name: row.os_name,
    ip_hash: row.ip_hash,
    first_touch: context.firstTouch,
    last_touch: context.lastTouch,
    last_paid_touch: context.lastPaidTouch,
    conversion_touch: context.touch,
    tracking_completeness: context.trackingCompleteness,
    properties: {
      ...(input.properties || {}),
      trackingCompleteness: context.trackingCompleteness,
    },
    raw_json: {
      ...input,
      receivedFrom: row.source,
    },
  };

  const { error } = await client.from("website_conversions").upsert(conversion, {
    onConflict: "event_id",
  });
  if (error) throw error;
}

async function backfillLinkedCustomer(
  client: WebsiteSupabaseClient,
  row: WebsiteEventRow,
  customer: NormalizedCustomer,
) {
  const patch = {
    customer_name: customer.name || null,
    customer_email: customer.email || null,
    customer_phone: customer.phone || null,
    conversion_event_id: row.event_id,
  };

  if (row.visitor_id) {
    const eventUpdate = await client.from("website_events").update(patch).eq("visitor_id", row.visitor_id);
    if (eventUpdate.error) throw eventUpdate.error;
    const visitorUpdate = await client.from("website_visitors").update(patch).eq("visitor_id", row.visitor_id);
    if (visitorUpdate.error) throw visitorUpdate.error;
  }

  if (row.session_id) {
    const eventUpdate = await client.from("website_events").update(patch).eq("session_id", row.session_id);
    if (eventUpdate.error) throw eventUpdate.error;
    const sessionUpdate = await client.from("website_sessions").update(patch).eq("session_id", row.session_id);
    if (sessionUpdate.error) throw sessionUpdate.error;
  }
}

type NormalizedCustomer = {
  email?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  phone?: string;
};

function normalizeCustomer(value: unknown): NormalizedCustomer {
  const record = objectRecord(value);
  const firstName = trimmedString(record.firstName).slice(0, 80) || undefined;
  const lastName = trimmedString(record.lastName).slice(0, 80) || undefined;
  const explicitName = trimmedString(record.name).slice(0, 180) || undefined;
  const name = explicitName || [firstName, lastName].filter(Boolean).join(" ") || undefined;
  const email = normalizeEmail(trimmedString(record.email)) || undefined;
  const phone = trimmedString(record.phone).slice(0, 40) || undefined;
  return { email, firstName, lastName, name, phone };
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string) {
  return value.replace(/[^\d]/g, "");
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeUtm(input: z.infer<typeof websiteEventSchema>["utm"]): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input || {})
      .map(([key, value]) => [key, typeof value === "string" ? value.trim() : ""])
      .filter(([, value]) => value),
  );
}

function attributionTouch(row: WebsiteEventRow): AttributionTouch {
  const utm = cleanRecord({
    ad: row.utm_ad || undefined,
    adId: row.utm_ad_id || undefined,
    adset: row.utm_adset || undefined,
    adsetId: row.utm_adset_id || undefined,
    campaign: row.utm_campaign || undefined,
    campaignId: row.utm_campaign_id || undefined,
    content: row.utm_content || undefined,
    creative: row.utm_creative || undefined,
    fbclid: row.fbclid || undefined,
    gclid: row.gclid || undefined,
    id: row.utm_id || undefined,
    medium: row.utm_medium || undefined,
    msclkid: row.msclkid || undefined,
    placement: row.utm_placement || undefined,
    source: row.utm_source || undefined,
    term: row.utm_term || undefined,
    ttclid: row.ttclid || undefined,
  }) as Record<string, string>;

  return {
    capturedAt: row.occurred_at,
    eventId: row.event_id,
    eventName: row.event_name,
    fbc: row.fbc || undefined,
    fbp: row.fbp || undefined,
    pagePath: row.page_path || undefined,
    pageUrl: row.page_url || undefined,
    referrer: row.referrer || undefined,
    source: row.source,
    sourceType: row.source_type || "direct",
    userAgent: row.user_agent || undefined,
    deviceCategory: row.device_category || undefined,
    browserName: row.browser_name || undefined,
    osName: row.os_name || undefined,
    utm: Object.keys(utm).length ? utm : undefined,
  };
}

export function isPaidTouch(touch: AttributionTouch | null | undefined) {
  if (!touch) return false;
  if (touch.fbc || touch.utm?.fbclid || touch.utm?.adId || touch.utm?.adsetId || touch.utm?.campaignId) {
    return true;
  }
  return touch.sourceType.startsWith("paid_");
}

function classifySourceType(input: {
  fbc?: string;
  referrer?: string;
  utm: Record<string, string>;
}) {
  const source = (input.utm.source || "").toLowerCase();
  const medium = (input.utm.medium || "").toLowerCase();
  const referrer = (input.referrer || "").toLowerCase();
  const hasMeta =
    Boolean(input.fbc || input.utm.fbclid || input.utm.adId || input.utm.adsetId || input.utm.campaignId) ||
    source.includes("facebook") ||
    source.includes("instagram") ||
    source.includes("meta") ||
    referrer.includes("facebook.com") ||
    referrer.includes("instagram.com");

  if (hasMeta && isPaidMedium(medium)) return "paid_meta";
  if (hasMeta && (input.fbc || input.utm.fbclid || input.utm.adId)) return "paid_meta";
  if (input.utm.gclid || input.utm.msclkid) return "paid_search";
  if (isPaidMedium(medium)) return source.includes("social") ? "paid_social" : "paid_other";
  if (source || referrer) return "referral";
  return "direct";
}

function isPaidMedium(value: string) {
  return ["paid", "paid_social", "cpc", "ppc", "paid-search", "paidsearch", "social_paid"].some((needle) =>
    value.includes(needle),
  );
}

function isConversionEventName(eventName: string, metaEventName?: string | null) {
  return eventName === "Schedule" || metaEventName === "Schedule";
}

function trackingCompletenessReport(input: {
  customer: NormalizedCustomer;
  firstTouch: AttributionTouch | null;
  lastPaidTouch: AttributionTouch | null;
  row: WebsiteEventRow;
}) {
  const checks = {
    adId: Boolean(input.lastPaidTouch?.utm?.adId || input.row.utm_ad_id),
    adsetId: Boolean(input.lastPaidTouch?.utm?.adsetId || input.row.utm_adset_id),
    campaignId: Boolean(input.lastPaidTouch?.utm?.campaignId || input.row.utm_campaign_id),
    customerEmail: Boolean(input.customer.email),
    customerName: Boolean(input.customer.name),
    customerPhone: Boolean(input.customer.phone),
    fbc: Boolean(input.row.fbc || input.lastPaidTouch?.fbc),
    fbp: Boolean(input.row.fbp || input.lastPaidTouch?.fbp),
    firstTouch: Boolean(input.firstTouch),
    lastPaidTouch: Boolean(input.lastPaidTouch),
    userAgent: Boolean(input.row.user_agent),
  };
  const missing = Object.entries(checks)
    .filter(([, present]) => !present)
    .map(([key]) => key);
  return {
    checks,
    complete: missing.length === 0,
    missing,
    score: Object.keys(checks).length - missing.length,
    total: Object.keys(checks).length,
  };
}

function mostRecentTouch(
  left: AttributionTouch | null | undefined,
  right: AttributionTouch | null | undefined,
) {
  if (!left) return right || null;
  if (!right) return left;
  return Date.parse(right.capturedAt) > Date.parse(left.capturedAt) ? right : left;
}

function attributionEventSourceUrl(value: string | undefined, touch: AttributionTouch | null) {
  if (!value) return undefined;
  if (!touch?.utm) return value;

  try {
    const url = new URL(value);
    for (const [key, touchValue] of Object.entries(touch.utm)) {
      const paramName = utmParamName(key);
      if (paramName && touchValue && !url.searchParams.has(paramName)) {
        url.searchParams.set(paramName, touchValue);
      }
    }
    return url.toString();
  } catch {
    return value;
  }
}

function utmParamName(key: string) {
  const names: Record<string, string> = {
    ad: "utm_ad",
    adId: "utm_ad_id",
    adset: "utm_adset",
    adsetId: "utm_adset_id",
    campaign: "utm_campaign",
    campaignId: "utm_campaign_id",
    content: "utm_content",
    creative: "utm_creative",
    fbclid: "fbclid",
    gclid: "gclid",
    id: "utm_id",
    medium: "utm_medium",
    msclkid: "msclkid",
    placement: "utm_placement",
    source: "utm_source",
    term: "utm_term",
    ttclid: "ttclid",
  };
  return names[key];
}

function parseDevice(userAgent: string | null) {
  const value = userAgent || "";
  const lower = value.toLowerCase();
  const deviceCategory = /ipad|tablet/.test(lower)
    ? "tablet"
    : /mobi|iphone|android/.test(lower)
      ? "mobile"
      : value
        ? "desktop"
        : null;
  const browserName = lower.includes("edg/")
    ? "Edge"
    : lower.includes("chrome/")
      ? "Chrome"
      : lower.includes("safari/")
        ? "Safari"
        : lower.includes("firefox/")
          ? "Firefox"
          : value
            ? "Other"
            : null;
  const osName = lower.includes("iphone") || lower.includes("ipad")
    ? "iOS"
    : lower.includes("android")
      ? "Android"
      : lower.includes("mac os")
        ? "macOS"
        : lower.includes("windows")
          ? "Windows"
          : value
            ? "Other"
            : null;

  return { browserName, deviceCategory, osName };
}

function cleanRecord(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== ""),
  );
}

function allowedOrigins() {
  const configured = process.env.WEBSITE_EVENT_ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return configured?.length ? configured : DEFAULT_ALLOWED_ORIGINS;
}

function allowedWildcards() {
  const configured = process.env.WEBSITE_EVENT_ALLOWED_ORIGIN_WILDCARDS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return configured?.length ? configured : DEFAULT_ALLOWED_WILDCARDS;
}

function isAllowedOrigin(origin: string | null) {
  if (!origin) return true;
  if (allowedOrigins().includes(origin)) return true;
  return allowedWildcards().some((pattern) => wildcardMatches(pattern, origin));
}

function wildcardMatches(pattern: string, origin: string) {
  if (!pattern.startsWith("*.")) return pattern === origin;
  try {
    const hostname = new URL(origin).hostname;
    return hostname.endsWith(pattern.slice(1));
  } catch {
    return false;
  }
}

function inferEventType(eventName: string) {
  if (eventName === "PageView" || eventName === "ViewContent") return "page";
  if (eventName === "Search") return "search";
  if (eventName.includes("Click")) return "click";
  if (eventName.startsWith("Booking")) return "booking";
  if (eventName === "Schedule") return "conversion";
  if (eventName === "ScrollDepth" || eventName.startsWith("Engaged")) return "engagement";
  return "custom";
}

export function classifyPagePath(pagePath: string | null) {
  const path = (pagePath || "").toLowerCase();
  if (!path || path === "/") return "home";
  if (path.includes("/book-an-appointment")) return "booking";
  if (path.includes("/custom-jewelry-design") || path.includes("/jewelry-design")) {
    return "custom_design";
  }
  if (path.includes("/about-us") || path.includes("/our-story")) return "our_story";
  if (path.includes("/our_store") || path.includes("/visit")) return "visit";
  if (path.includes("/collections/engagement-ring")) return "engagement";
  if (path.includes("/collections/high-jewelry") || path.includes("/collections/fine-jewelry")) {
    return "fine_jewelry";
  }
  if (path.includes("/products/")) return "product";
  if (path.includes("/collections/")) return "collection";
  if (path.includes("/search")) return "search";
  return "other";
}

function pathFromUrl(pageUrl: string | null) {
  if (!pageUrl) return null;
  try {
    return new URL(pageUrl).pathname;
  } catch {
    return null;
  }
}

function requestIpAddress(request: Request) {
  return (
    firstHeaderValue(request.headers.get("x-forwarded-for")) ||
    firstHeaderValue(request.headers.get("x-real-ip")) ||
    firstHeaderValue(request.headers.get("cf-connecting-ip")) ||
    firstHeaderValue(request.headers.get("x-vercel-forwarded-for"))
  );
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function hashIpAddress(value: string | null) {
  if (!value) return null;
  const salt = process.env.WEBSITE_EVENT_IP_HASH_SALT || "hp-website-events";
  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

function normalizeDateRange(input: {
  startDate?: string | null;
  endDate?: string | null;
  days?: number | null;
}) {
  const end = input.endDate && DATE_PATTERN.test(input.endDate) ? input.endDate : format(new Date(), "yyyy-MM-dd");
  const days = input.days && Number.isFinite(input.days) ? Math.min(Math.max(input.days, 1), 365) : 30;
  const start =
    input.startDate && DATE_PATTERN.test(input.startDate)
      ? input.startDate
      : format(subDays(parseISO(end), days - 1), "yyyy-MM-dd");
  const normalizedDays = differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
  return { start, end, days: normalizedDays };
}

function countEvents(events: WebsiteEventRow[], eventName: string) {
  return events.filter((event) => event.event_name === eventName).length;
}

function countType(events: WebsiteEventRow[], eventType: string) {
  return events.filter((event) => event.event_type === eventType).length;
}

function isScheduleEvent(event: WebsiteEventRow) {
  return event.event_name === "Schedule" || event.meta_event_name === "Schedule";
}

function buildFunnel(events: WebsiteEventRow[], scheduleCount: number) {
  const rows = [
    {
      key: "booking_page_view",
      label: "Viewed booking page",
      count: events.filter(
        (event) => event.event_name === "PageView" && event.page_group === "booking",
      ).length,
    },
    { key: "visit_selected", label: "Selected visit type", count: countEvents(events, "BookingVisitSelected") },
    { key: "date_selected", label: "Selected date", count: countEvents(events, "BookingDateSelected") },
    { key: "time_selected", label: "Selected time", count: countEvents(events, "BookingTimeSelected") },
    { key: "contact_started", label: "Started contact form", count: countEvents(events, "BookingContactStarted") },
    { key: "submit_attempt", label: "Submitted booking form", count: countEvents(events, "BookingSubmitAttempt") },
    { key: "schedule", label: "Acuity appointment created", count: scheduleCount },
  ];
  const start = rows[0]?.count || 0;
  return rows.map((row, index) => {
    const previous = index > 0 ? rows[index - 1]?.count || 0 : null;
    return {
      ...row,
      rateFromPrevious: previous ? row.count / previous : null,
      rateFromStart: start ? row.count / start : null,
    };
  });
}

function buildPages(events: WebsiteEventRow[]) {
  const pages = new Map<
    string,
    {
      pageGroup: string;
      pagePath: string;
      pageTitle: string;
      pageViews: number;
      sessions: Set<string>;
      importantClicks: number;
      searches: number;
      maxScrollDepth: number;
      schedules: number;
    }
  >();

  for (const event of events) {
    const pagePath = event.page_path || pathFromUrl(event.page_url) || "(unknown)";
    const key = `${event.page_group || "other"}:${pagePath}`;
    const current =
      pages.get(key) ||
      {
        pageGroup: event.page_group || "other",
        pagePath,
        pageTitle: event.page_title || pagePath,
        pageViews: 0,
        sessions: new Set<string>(),
        importantClicks: 0,
        searches: 0,
        maxScrollDepth: 0,
        schedules: 0,
      };

    if (event.session_id) current.sessions.add(event.session_id);
    if (event.event_name === "PageView") current.pageViews += 1;
    if (event.event_type === "click") current.importantClicks += 1;
    if (event.event_name === "Search") current.searches += 1;
    if (isScheduleEvent(event)) current.schedules += 1;
    if (event.event_name === "ScrollDepth") {
      current.maxScrollDepth = Math.max(current.maxScrollDepth, numberValue(event.properties?.depth));
    }
    pages.set(key, current);
  }

  return Array.from(pages.values())
    .map((page) => ({
      ...page,
      sessions: page.sessions.size,
    }))
    .sort((a, b) => b.pageViews - a.pageViews)
    .slice(0, 100);
}

function buildTrend(events: WebsiteEventRow[], metaRows: MetaInsightRow[], start: string, end: string) {
  const rows = new Map<
    string,
    {
      date: string;
      pageViews: number;
      bookingSteps: number;
      schedules: number;
      metaAttributedBookings: number;
    }
  >();
  const startDate = parseISO(start);
  const days = differenceInCalendarDays(parseISO(end), startDate);
  for (let offset = 0; offset <= days; offset += 1) {
    const date = format(addDays(startDate, offset), "yyyy-MM-dd");
    rows.set(date, {
      date,
      pageViews: 0,
      bookingSteps: 0,
      schedules: 0,
      metaAttributedBookings: 0,
    });
  }

  for (const event of events) {
    const date = event.occurred_at.slice(0, 10);
    const row = rows.get(date);
    if (!row) continue;
    if (event.event_name === "PageView") row.pageViews += 1;
    if (event.event_type === "booking") row.bookingSteps += 1;
    if (isScheduleEvent(event)) row.schedules += 1;
  }

  for (const metaRow of metaRows) {
    const row = rows.get(metaRow.date_start);
    if (!row) continue;
    const actionBookings = actionCount(actionArray(metaRow.actions), BOOKING_ACTION_TYPES);
    row.metaAttributedBookings += Math.max(numberValue(metaRow.bookings), actionBookings);
  }

  return Array.from(rows.values());
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function primitiveValue(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  return null;
}

function trimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function timestampValue(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function websiteBrand(brand: string) {
  return brand === "vvs" ? "VVS" : "HP";
}

function bookingPageUrl(brand: string) {
  if (brand === "hpusa") return "https://www.hungphatusa.com/pages/book-an-appointment";
  return undefined;
}

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
