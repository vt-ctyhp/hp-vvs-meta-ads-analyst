import { createHash, randomUUID } from "node:crypto";
import { addDays, differenceInCalendarDays, format, parseISO, subDays } from "date-fns";
import { z } from "zod";

import { BOOKING_ACTION_TYPES, actionArray, actionCount } from "./meta-kpi";
import { createServiceClient } from "./supabase";

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
      source: z.string().trim().max(120).optional(),
      medium: z.string().trim().max(120).optional(),
      campaign: z.string().trim().max(180).optional(),
      content: z.string().trim().max(180).optional(),
      term: z.string().trim().max(180).optional(),
    })
    .optional(),
  fbp: z.string().trim().max(300).optional(),
  fbc: z.string().trim().max(300).optional(),
  userAgent: z.string().trim().max(600).optional(),
  properties: jsonObjectSchema.optional(),
});

const conversionEventSchema = websiteEventSchema.extend({
  eventName: z.string().trim().min(1).max(80).default("Schedule"),
  eventType: eventTypeSchema.default("conversion"),
  metaEventName: z.string().trim().max(80).optional(),
  metaEventId: z.string().trim().max(200).optional(),
  acuityAppointmentId: z.string().trim().max(80).optional(),
  appointmentType: z.string().trim().max(180).optional(),
});

export type WebsiteEventInput = z.input<typeof websiteEventSchema>;
export type WebsiteConversionInput = z.input<typeof conversionEventSchema>;

type WebsiteEventRow = {
  event_id: string;
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
  fbp: string | null;
  fbc: string | null;
  user_agent: string | null;
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
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbp: string | null;
  fbc: string | null;
  user_agent: string | null;
  ip_hash: string | null;
  raw_json: Record<string, unknown>;
};

type MetaInsightRow = {
  date_start: string;
  bookings: string | number | null;
  conversions: string | number | null;
  actions: unknown;
};

type WebsiteSupabaseClient = {
  from: (table: "website_events") => {
    upsert: (
      row: WebsiteEventRow,
      options: { onConflict: string },
    ) => { select: (columns: string) => { single: () => Promise<{ data: unknown; error: Error | null }> } };
    select: (columns: string) => WebsiteSelectChain<WebsiteEventRow[]>;
  };
} & {
  from: (table: "website_sessions") => {
    upsert: (
      row: WebsiteSessionRow,
      options: { onConflict: string },
    ) => Promise<{ data: unknown; error: Error | null }>;
  };
} & {
  from: (table: "meta_daily_insights") => {
    select: (columns: string) => WebsiteSelectChain<MetaInsightRow[]>;
  };
};

type WebsiteSelectChain<T> = PromiseLike<{ data: T | null; error: Error | null }> & {
  gte: (column: string, value: unknown) => WebsiteSelectChain<T>;
  lte: (column: string, value: unknown) => WebsiteSelectChain<T>;
  order: (column: string, options: { ascending: boolean }) => WebsiteSelectChain<T>;
  limit: (count: number) => WebsiteSelectChain<T>;
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
    eventName: string;
    eventType: string;
    source: string;
    occurredAt: string;
    pagePath: string | null;
    pageGroup: string | null;
    eventId: string;
    metaEventId: string | null;
    acuityAppointmentId: string | null;
  }>;
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

export async function fetchWebsiteFunnelData(input: {
  startDate?: string | null;
  endDate?: string | null;
  days?: number | null;
}): Promise<WebsiteFunnelData> {
  const range = normalizeDateRange(input);
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
          "meta_event_id",
          "acuity_appointment_id",
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
  const metaAttributedBookings = metaRows.reduce((sum, row) => {
    const actionBookings = actionCount(actionArray(row.actions), BOOKING_ACTION_TYPES);
    return sum + Math.max(numberValue(row.bookings), actionBookings);
  }, 0);

  return {
    configured: true,
    sourceTransparency: {
      timeRange: range,
      recordCounts: {
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
      discrepancy: schedules.length - metaAttributedBookings,
    },
    funnel: buildFunnel(events, schedules.length),
    pages: buildPages(events),
    trend: buildTrend(events, metaRows, range.start, range.end),
    recentEvents: events.slice(0, 50).map((event) => ({
      eventName: event.event_name,
      eventType: event.event_type,
      source: event.source,
      occurredAt: event.occurred_at,
      pagePath: event.page_path,
      pageGroup: event.page_group,
      eventId: event.event_id,
      metaEventId: event.meta_event_id,
      acuityAppointmentId: event.acuity_appointment_id,
    })),
  };
}

async function recordWebsiteEvent(
  input: z.infer<typeof websiteEventSchema> & Partial<z.infer<typeof conversionEventSchema>>,
  options: { request: Request; source: string },
) {
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
  const row: WebsiteEventRow = {
    event_id: eventId,
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
    utm_source: input.utm?.source || null,
    utm_medium: input.utm?.medium || null,
    utm_campaign: input.utm?.campaign || null,
    utm_content: input.utm?.content || null,
    utm_term: input.utm?.term || null,
    fbp: input.fbp || null,
    fbc: input.fbc || null,
    user_agent: userAgent,
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
  if (row.session_id) {
    const sessionRow: WebsiteSessionRow = {
      session_id: row.session_id,
      visitor_id: row.visitor_id,
      brand,
      first_seen_at: occurredAt,
      last_seen_at: occurredAt,
      first_page_url: pageUrl,
      last_page_url: pageUrl,
      first_referrer: row.referrer,
      utm_source: row.utm_source,
      utm_medium: row.utm_medium,
      utm_campaign: row.utm_campaign,
      utm_content: row.utm_content,
      utm_term: row.utm_term,
      fbp: row.fbp,
      fbc: row.fbc,
      user_agent: row.user_agent,
      ip_hash: row.ip_hash,
      raw_json: { source: options.source },
    };
    const { error } = await client.from("website_sessions").upsert(sessionRow, {
      onConflict: "session_id",
    });
    if (error) throw error;
  }

  const { data, error } = await client
    .from("website_events")
    .upsert(row, { onConflict: "event_id" })
    .select("id")
    .single();
  if (error) throw error;

  return {
    eventId,
    id: data,
    ok: true as const,
  };
}

function createWebsiteClient() {
  return createServiceClient() as unknown as WebsiteSupabaseClient;
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

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
