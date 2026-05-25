import { differenceInCalendarDays, format, parseISO, subDays } from "date-fns";
import { unstable_cache } from "next/cache.js";

import { selectOriginalPaidTouch } from "./attribution-touch-selection.ts";
import { createAdsAnalystClient } from "./ads-analyst-db.ts";
import { websiteAttributionEnvironment } from "./website-analytics.ts";

// Phase 2.5 (v3 plan): per-loader server-side cache. 30s TTL gives users
// near-instant subsequent loads + filter clicks while staying fresh enough
// for analytics (data syncs are minutes-grained, not seconds-grained).
const LEDGER_CACHE_TTL_SECONDS = 30;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LEDGER_DAYS = 30;
const MAX_LEDGER_VISITORS = 500;
const MAX_RELATED_ROWS = 2500;
const VISITOR_ID_QUERY_BATCH_SIZE = 100;
const ACUITY_APPOINTMENT_ID_BATCH_SIZE = 100;
const DETAIL_EVENT_WINDOW_AFTER_BOOKING_MS = 60_000;
const PAID_META_ATTRIBUTION_LOOKBACK_DAYS = 30;
const INVALID_APPOINTMENT_STATUSES = new Set(["canceled", "cancelled", "rescheduled"]);

// Phase 2.6 (visitor-only stage-key fix): event names that drive
// stageKeysForVisitorOnly when no full event history is fetched for
// unanchored visitors. Keep in sync with isBookingFormStartedLedgerEvent.
const BOOKING_FORM_EVENT_NAMES = [
  "BookingFormStarted",
  "BookingContactStarted",
  "BookingVisitSelected",
  "BookingDateSelected",
  "BookingTimeSelected",
  "BookingIdentityCaptured",
] as const;

const BOOKING_PAGE_URL_PATTERN = "%/book-an-appointment%";

type JsonRecord = Record<string, unknown>;

export type CustomerJourneyLedgerStatusSummary = {
  count: number;
  status: string;
};

export type CustomerJourneyLedgerRow = {
  adId: string | null;
  adsetId: string | null;
  acuityAppointmentId: string | null;
  appointmentSourceId: string | null;
  appointmentStatus: string | null;
  appointmentType: string | null;
  appointmentVisitDateTime: string | null;
  bookingTime: string | null;
  brand: string | null;
  browserName: string | null;
  campaignId: string | null;
  capiStatus: string | null;
  conversionEventId: string | null;
  customerEmail: string | null;
  customerName: string | null;
  customerPhone: string | null;
  deviceBrowser: string | null;
  deviceCategory: string | null;
  fbc: string | null;
  fbp: string | null;
  firstPage: string | null;
  geoCity: string | null;
  geoCountry: string | null;
  geoRegion: string | null;
  geoTimezone: string | null;
  hasConversion: boolean;
  hasPaidTouch: boolean;
  lastPaidSource: string | null;
  lastPaidSourceType: string | null;
  lastSeen: string;
  metaEventId: string | null;
  osName: string | null;
  placement: string | null;
  sessionId: string | null;
  stageKeys: string[];
  visitorId: string | null;
};

export type CustomerJourneyLedgerData = {
  rows: CustomerJourneyLedgerRow[];
  summary: {
    capiStatuses: CustomerJourneyLedgerStatusSummary[];
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

export type CustomerJourneyLedgerTouchSummary = {
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

export type CustomerJourneyLedgerTimelineEvent = {
  adId: string | null;
  adName?: string | null;
  adsetId: string | null;
  campaignId: string | null;
  category: "ad_touch" | "page" | "booking" | "conversion" | "capi" | "engagement";
  content: string | null;
  creativeId?: string | null;
  creativeName?: string | null;
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

export type CustomerJourneyLedgerDetailData = {
  acuityAppointmentId: string | null;
  appointmentSourceId: string | null;
  appointmentStatus: string | null;
  appointmentVisitDateTime: string | null;
  booking: {
    appointmentType: string | null;
    bookingTime: string | null;
    eventId: string | null;
    metaEventId: string | null;
    sessionId: string | null;
  } | null;
  bookingSessionEntrySource: CustomerJourneyLedgerTouchSummary | null;
  capi: {
    eventId: string | null;
    status: string | null;
    testMode: boolean | null;
  };
  confidence: {
    explanation: string;
    level: "browser_session" | "browser_visitor" | "conversion_only" | "appointment_only" | "unmatched";
    signals: string[];
  };
  creditedTouch: CustomerJourneyLedgerTouchSummary | null;
  geoCity: string | null;
  geoCountry: string | null;
  geoRegion: string | null;
  geoTimezone: string | null;
  returnTouch: CustomerJourneyLedgerTouchSummary | null;
  summary: string | null;
  timeline: CustomerJourneyLedgerTimelineEvent[];
  visitorId: string | null;
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

export type CustomerJourneyLedgerEventRow = {
  acuity_appointment_id: string | null;
  appointment_type: string | null;
  brand?: string | null;
  browser_name: string | null;
  device_category: string | null;
  event_id: string;
  event_name: string;
  event_type: string;
  fbc: string | null;
  fbp: string | null;
  fbclid: string | null;
  geo_city: string | null;
  geo_country: string | null;
  geo_region: string | null;
  geo_timezone: string | null;
  occurred_at: string;
  os_name: string | null;
  page_url: string | null;
  properties: JsonRecord | null;
  raw_json: JsonRecord | null;
  referrer: string | null;
  session_id: string | null;
  source: string | null;
  source_type: string | null;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
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

export type CustomerJourneyLedgerVisitorRow = {
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
  geo_city: string | null;
  geo_country: string | null;
  geo_region: string | null;
  geo_timezone: string | null;
  last_page_url: string | null;
  last_paid_touch: JsonRecord | null;
  last_seen_at: string;
  last_touch: JsonRecord | null;
  os_name: string | null;
  user_agent: string | null;
  visitor_id: string;
};

export type CustomerJourneyLedgerSessionRow = {
  browser_name: string | null;
  conversion_event_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  device_category: string | null;
  fbc: string | null;
  fbp: string | null;
  first_page_url: string | null;
  geo_city: string | null;
  geo_country: string | null;
  geo_region: string | null;
  geo_timezone: string | null;
  last_page_url: string | null;
  last_paid_touch: JsonRecord | null;
  last_seen_at: string;
  os_name: string | null;
  session_id: string;
  user_agent: string | null;
  visitor_id: string | null;
};

export type CustomerJourneyLedgerConversionRow = {
  acuity_appointment_id: string | null;
  appointment_type: string | null;
  brand: string | null;
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
  geo_city: string | null;
  geo_country: string | null;
  geo_region: string | null;
  geo_timezone: string | null;
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

export type CustomerJourneyLedgerAppointmentRow = {
  appt_id: string;
  booking_source: string;
  brand: string | null;
  booked_at: string | null;
  created_at: string;
  external_booking_id: string | null;
  id: string;
  raw_payload: JsonRecord | null;
  source: string | null;
  status: string | null;
  visit_date_time: string | null;
  visit_type: string | null;
};

export type CustomerJourneyLedgerClient = {
  from: (table: "website_visitors") => {
    select: (columns: string) => LedgerSelectChain<CustomerJourneyLedgerVisitorRow[]>;
  };
} & {
  from: (table: "website_sessions") => {
    select: (columns: string) => LedgerSelectChain<CustomerJourneyLedgerSessionRow[]>;
  };
} & {
  from: (table: "website_events") => {
    select: (columns: string) => LedgerSelectChain<CustomerJourneyLedgerEventRow[]>;
  };
} & {
  from: (table: "website_conversions") => {
    select: (columns: string) => LedgerSelectChain<CustomerJourneyLedgerConversionRow[]>;
  };
} & {
  from: (table: "appointment_events") => {
    select: (columns: string) => LedgerSelectChain<CustomerJourneyLedgerAppointmentRow[]>;
  };
};

type LedgerSelectChain<T> = PromiseLike<{ data: T | null; error: Error | null }> & {
  eq: (column: string, value: unknown) => LedgerSelectChain<T>;
  gte: (column: string, value: unknown) => LedgerSelectChain<T>;
  ilike: (column: string, pattern: string) => LedgerSelectChain<T>;
  in: (column: string, values: unknown[]) => LedgerSelectChain<T>;
  limit: (count: number) => LedgerSelectChain<T>;
  lte: (column: string, value: unknown) => LedgerSelectChain<T>;
  order: (column: string, options: { ascending: boolean }) => LedgerSelectChain<T>;
};

const VISITOR_COLUMNS = [
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
  "geo_country",
  "geo_region",
  "geo_city",
  "geo_timezone",
  "customer_name",
  "customer_email",
  "customer_phone",
  "conversion_event_id",
].join(",");

const SESSION_COLUMNS = [
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
  "geo_country",
  "geo_region",
  "geo_city",
  "geo_timezone",
  "customer_name",
  "customer_email",
  "customer_phone",
  "conversion_event_id",
].join(",");

const EVENT_COLUMNS = [
  "event_id",
  "session_id",
  "visitor_id",
  "brand",
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
  "geo_country",
  "geo_region",
  "geo_city",
  "geo_timezone",
  "device_category",
  "browser_name",
  "os_name",
  "source_type",
  "acuity_appointment_id",
  "appointment_type",
  "customer_name",
  "customer_email",
  "customer_phone",
  "properties",
  "raw_json",
].join(",");

const CONVERSION_COLUMNS = [
  "event_id",
  "session_id",
  "visitor_id",
  "occurred_at",
  "received_at",
  "source_type",
  "acuity_appointment_id",
  "appointment_type",
  "brand",
  "customer_name",
  "customer_email",
  "customer_phone",
  "meta_event_id",
  "meta_capi_status",
  "meta_capi_test_mode",
  "fbp",
  "fbc",
  "geo_country",
  "geo_region",
  "geo_city",
  "geo_timezone",
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
].join(",");

const APPOINTMENT_COLUMNS = [
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
].join(",");

// Public wrapper. When called with a custom `client` (tests use mock clients)
// the cache is bypassed — both because mock clients aren't serializable into
// a cache key and because tests need deterministic, isolated runs.
export async function fetchCustomerJourneyLedgerData(
  input: {
    days?: number | null;
    endDate?: string | null;
    startDate?: string | null;
  },
  client?: CustomerJourneyLedgerClient,
): Promise<CustomerJourneyLedgerData> {
  if (client) {
    return fetchCustomerJourneyLedgerDataUncached(input, client);
  }
  return fetchCustomerJourneyLedgerDataCached(input);
}

const fetchCustomerJourneyLedgerDataCached = unstable_cache(
  async (input: {
    days?: number | null;
    endDate?: string | null;
    startDate?: string | null;
  }): Promise<CustomerJourneyLedgerData> => {
    const client = createAdsAnalystClient("web") as unknown as CustomerJourneyLedgerClient;
    return fetchCustomerJourneyLedgerDataUncached(input, client);
  },
  ["customer-journey-ledger"],
  { revalidate: LEDGER_CACHE_TTL_SECONDS },
);

async function fetchCustomerJourneyLedgerDataUncached(
  input: {
    days?: number | null;
    endDate?: string | null;
    startDate?: string | null;
  },
  client: CustomerJourneyLedgerClient,
): Promise<CustomerJourneyLedgerData> {
  const range = normalizeCustomerJourneyLedgerDateRange(input);
  // Use the limited-mode web client. In limited-access mode (staging today,
  // production after cutover) SUPABASE_SERVICE_ROLE_KEY is intentionally
  // absent — `createServiceClient()` would throw. The web role's RLS still
  // permits reads on the customer journey tables for the current ads-analyst
  // environment.
  const startIso = `${range.start}T00:00:00.000Z`;
  const endIso = `${range.end}T23:59:59.999Z`;

  const [appointmentsResult, windowVisitorsResult, funnelActiveVisitorIds] = await Promise.all([
    client
      .from("appointment_events")
      .select(APPOINTMENT_COLUMNS)
      .gte("visit_date_time", startIso)
      .lte("visit_date_time", endIso)
      .order("visit_date_time", { ascending: false })
      .limit(MAX_RELATED_ROWS),
    // Phase 2 (v3 plan): fetch visitors active in the window directly so the
    // ledger surfaces browse-but-no-book visitors. Pre-Phase-2 the loader was
    // strictly appointment-keyed; visitors with neither appointment nor
    // conversion never became rows. See tests/customer-journey-ledger-visitor-first.test.ts.
    client
      .from("website_visitors")
      .select(VISITOR_COLUMNS)
      .gte("last_seen_at", startIso)
      .lte("last_seen_at", endIso)
      .order("last_seen_at", { ascending: false })
      .limit(MAX_LEDGER_VISITORS),
    fetchFunnelActiveVisitorIds(client, startIso, endIso),
  ]);

  if (appointmentsResult.error) throw appointmentsResult.error;
  if (windowVisitorsResult.error) throw windowVisitorsResult.error;

  const appointments = uniqueValidAcuityAppointments(appointmentsResult.data || []);
  const appointmentIds = appointments.map((appointment) => appointmentAcuityId(appointment));
  // Fetch visitor rows for booking-funnel-active visitor IDs separately so
  // they bypass the MAX_LEDGER_VISITORS top-N-by-recency cap on the broad
  // window query. Without this, /convert silently drops booking-funnel
  // visitors once window-active visitors exceed 500.
  const funnelActiveVisitors = funnelActiveVisitorIds.length
    ? await fetchRowsByVisitorIds<CustomerJourneyLedgerVisitorRow>(
        funnelActiveVisitorIds,
        (batch) =>
          client
            .from("website_visitors")
            .select(VISITOR_COLUMNS)
            .in("visitor_id", batch)
            .limit(MAX_RELATED_ROWS),
        "last_seen_at",
      )
    : [];
  const windowVisitors = uniqueVisitors([
    ...(windowVisitorsResult.data || []),
    ...funnelActiveVisitors,
  ]);

  if (!appointmentIds.length) {
    // No appointments in window, but window visitors may still exist —
    // pass them through so visitor-only rows can be emitted.
    if (!windowVisitors.length) {
      return buildCustomerJourneyLedgerData({
        appointments,
        conversions: [],
        events: [],
        range,
        sessions: [],
        visitors: [],
      });
    }

    const visitorIds = windowVisitors.map((v) => v.visitor_id);
    const [sessions, visitorEvents, visitorConversions] = await Promise.all([
      fetchRowsByVisitorIds<CustomerJourneyLedgerSessionRow>(
        visitorIds,
        (batch) =>
          client
            .from("website_sessions")
            .select(SESSION_COLUMNS)
            .in("visitor_id", batch)
            .order("last_seen_at", { ascending: false })
            .limit(MAX_RELATED_ROWS),
        "last_seen_at",
      ),
      fetchRowsByVisitorIds<CustomerJourneyLedgerEventRow>(
        visitorIds,
        (batch) =>
          client
            .from("website_events")
            .select(EVENT_COLUMNS)
            .in("visitor_id", batch)
            .order("occurred_at", { ascending: false })
            .limit(MAX_RELATED_ROWS),
        "occurred_at",
      ),
      fetchRowsByVisitorIds<CustomerJourneyLedgerConversionRow>(
        visitorIds,
        (batch) =>
          client
            .from("website_conversions")
            .select(CONVERSION_COLUMNS)
            .in("visitor_id", batch)
            .order("occurred_at", { ascending: false })
            .limit(MAX_RELATED_ROWS),
        "occurred_at",
      ),
    ]);

    return buildCustomerJourneyLedgerData({
      appointments,
      conversions: visitorConversions,
      events: visitorEvents,
      range,
      sessions,
      visitors: windowVisitors,
    });
  }

  // Fetch all Schedule conversions in window (matching the funnel's
  // fetchAllScheduleConversionsInWindow), not just those with a matching
  // valid Acuity appointment. Orphan conversions become conversion-anchored
  // rows below so /convert and the funnel agree on paid-Meta booking counts.
  const [conversionsInWindowResult, appointmentEvents] = await Promise.all([
    client
      .from("website_conversions")
      .select(CONVERSION_COLUMNS)
      .gte("occurred_at", startIso)
      .lte("occurred_at", endIso)
      .order("occurred_at", { ascending: false })
      .limit(MAX_RELATED_ROWS),
    fetchRowsByAcuityAppointmentIds<CustomerJourneyLedgerEventRow>(
      appointmentIds,
      (batch) =>
        client
          .from("website_events")
          .select(EVENT_COLUMNS)
          .in("acuity_appointment_id", batch)
          .order("occurred_at", { ascending: false })
          .limit(MAX_RELATED_ROWS),
      "occurred_at",
    ),
  ]);
  if (conversionsInWindowResult.error) throw conversionsInWindowResult.error;
  const rangeConversions = (conversionsInWindowResult.data || []) as CustomerJourneyLedgerConversionRow[];

  const visitorIdsFromAppointments = uniqueStrings([
    ...rangeConversions
      .map((conversion) => conversion.visitor_id)
      .filter((visitorId): visitorId is string => Boolean(visitorId)),
    ...appointmentEvents
      .map((event) => event.visitor_id)
      .filter((visitorId): visitorId is string => Boolean(visitorId)),
  ]);

  const appointmentDerivedVisitors = visitorIdsFromAppointments.length
    ? uniqueVisitors(
        await fetchRowsByVisitorIds<CustomerJourneyLedgerVisitorRow>(
          visitorIdsFromAppointments,
          (batch) =>
            client
              .from("website_visitors")
              .select(VISITOR_COLUMNS)
              .in("visitor_id", batch)
              .limit(MAX_LEDGER_VISITORS),
          "last_seen_at",
        ),
      )
    : [];
  // Merge appointment-derived visitors with window-active visitors, deduping
  // by visitor_id. Phase 2 (v3 plan): the merged set drives row emission so
  // browse-but-no-book visitors surface alongside appointment-anchored rows.
  const visitors = uniqueVisitors([...appointmentDerivedVisitors, ...windowVisitors]);
  const visitorIds = visitors.map((visitor) => visitor.visitor_id);

  if (!visitorIds.length) {
    return buildCustomerJourneyLedgerData({
      appointments,
      conversions: rangeConversions,
      events: appointmentEvents,
      range,
      sessions: [],
      visitors,
    });
  }

  // Phase 2.5 (v3 plan): only fetch the per-visitor session/event/conversion
  // fan-out for visitors that are anchored to an appointment or a conversion.
  // Visitor-only rows render from visitor-level fields alone (geo, last_paid_touch,
  // customer identity) and don't consume the related data — fetching it was
  // wasted work scaling linearly with window visitor count. Cut /convert load
  // by ~2-3 seconds at 30-day-window scale.
  const anchoredVisitorIds = new Set(visitorIdsFromAppointments);
  const anchoredVisitorIdList = visitors
    .filter((v) => anchoredVisitorIds.has(v.visitor_id))
    .map((v) => v.visitor_id);
  const unanchoredVisitorIdList = visitors
    .filter((v) => !anchoredVisitorIds.has(v.visitor_id))
    .map((v) => v.visitor_id);

  if (!anchoredVisitorIdList.length) {
    const unanchoredBookingEvents = await fetchBookingStageEventsForVisitors(
      client,
      unanchoredVisitorIdList,
      startIso,
      endIso,
    );
    return buildCustomerJourneyLedgerData({
      appointments,
      conversions: rangeConversions,
      events: uniqueEvents([...appointmentEvents, ...unanchoredBookingEvents]),
      range,
      sessions: [],
      visitors,
    });
  }

  const [sessions, visitorEvents, visitorConversions, unanchoredBookingEvents] = await Promise.all([
    fetchRowsByVisitorIds<CustomerJourneyLedgerSessionRow>(
      anchoredVisitorIdList,
      (batch) =>
        client
          .from("website_sessions")
          .select(SESSION_COLUMNS)
          .in("visitor_id", batch)
          .order("last_seen_at", { ascending: false })
          .limit(MAX_RELATED_ROWS),
      "last_seen_at",
    ),
    fetchRowsByVisitorIds<CustomerJourneyLedgerEventRow>(
      anchoredVisitorIdList,
      (batch) =>
        client
          .from("website_events")
          .select(EVENT_COLUMNS)
          .in("visitor_id", batch)
          .order("occurred_at", { ascending: false })
          .limit(MAX_RELATED_ROWS),
      "occurred_at",
    ),
    fetchRowsByVisitorIds<CustomerJourneyLedgerConversionRow>(
      anchoredVisitorIdList,
      (batch) =>
        client
          .from("website_conversions")
          .select(CONVERSION_COLUMNS)
          .in("visitor_id", batch)
          .order("occurred_at", { ascending: false })
          .limit(MAX_RELATED_ROWS),
      "occurred_at",
    ),
    fetchBookingStageEventsForVisitors(client, unanchoredVisitorIdList, startIso, endIso),
  ]);

  return buildCustomerJourneyLedgerData({
    appointments,
    conversions: uniqueConversions([
      ...rangeConversions,
      ...visitorConversions,
    ]),
    events: uniqueEvents([
      ...appointmentEvents,
      ...visitorEvents,
      ...unanchoredBookingEvents,
    ]),
    range,
    sessions,
    visitors,
  });
}

async function fetchRowsByVisitorIds<Row>(
  visitorIds: string[],
  queryBatch: (visitorIdBatch: string[]) => LedgerSelectChain<Row[]>,
  timestampColumn: keyof Row,
) {
  const rows: Row[] = [];

  for (const batch of chunks(visitorIds, VISITOR_ID_QUERY_BATCH_SIZE)) {
    const result = await queryBatch(batch);
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
  }

  return rows
    .sort((left, right) => timestampValue(right[timestampColumn]) - timestampValue(left[timestampColumn]))
    .slice(0, MAX_RELATED_ROWS);
}

// Phase 2.6: pull only booking-funnel events for the given visitor IDs in the
// selected date range.
// Used to populate stageKeysForVisitorOnly for unanchored visitors without
// re-paying the full fan-out cost that Phase 2.5 Fix A optimized away.
// Returns SPARSE event rows — only visitor_id, session_id, event_name,
// page_url, occurred_at are populated. Safe to merge into the events array
// passed to buildCustomerJourneyLedgerData because the consumers
// (eventAttributionTouches, geoFromRecords, etc.) gracefully handle null
// fields.
async function fetchBookingStageEventsForVisitors(
  client: CustomerJourneyLedgerClient,
  visitorIds: string[],
  startIso: string,
  endIso: string,
): Promise<CustomerJourneyLedgerEventRow[]> {
  if (!visitorIds.length) return [];

  const env = websiteAttributionEnvironment();
  // event_id is required: uniqueEvents() dedupes by event_id, and any row
  // without it collapses with every other such row to a single Map entry,
  // so the loader effectively sees one helper-fetched event total.
  const cols = "event_id,visitor_id,session_id,event_name,page_url,occurred_at";
  const rows: CustomerJourneyLedgerEventRow[] = [];

  for (const batch of chunks(visitorIds, VISITOR_ID_QUERY_BATCH_SIZE)) {
    const [funnelResult, pageViewResult] = await Promise.all([
      client
        .from("website_events")
        .select(cols)
        .eq("environment", env)
        .in("visitor_id", batch)
        .in("event_name", [...BOOKING_FORM_EVENT_NAMES])
        .gte("occurred_at", startIso)
        .lte("occurred_at", endIso)
        .limit(MAX_RELATED_ROWS),
      client
        .from("website_events")
        .select(cols)
        .eq("environment", env)
        .in("visitor_id", batch)
        .eq("event_name", "PageView")
        .ilike("page_url", BOOKING_PAGE_URL_PATTERN)
        .gte("occurred_at", startIso)
        .lte("occurred_at", endIso)
        .limit(MAX_RELATED_ROWS),
    ]);

    if (funnelResult.error) throw funnelResult.error;
    if (pageViewResult.error) throw pageViewResult.error;

    rows.push(...((funnelResult.data ?? []) as CustomerJourneyLedgerEventRow[]));
    rows.push(...((pageViewResult.data ?? []) as CustomerJourneyLedgerEventRow[]));
  }

  return rows;
}

// Return visitor_ids that had any booking-funnel event in window. Used to
// bypass the MAX_LEDGER_VISITORS top-N cap for the population the funnel
// counts — without that, visitors with booking PageViews / form events
// silently drop off /convert when there are more than 500 window-active
// visitors. Two cheap queries (visitor_id column only) keyed on the same
// filters the funnel uses.
async function fetchFunnelActiveVisitorIds(
  client: CustomerJourneyLedgerClient,
  startIso: string,
  endIso: string,
): Promise<string[]> {
  const env = websiteAttributionEnvironment();
  const [pageViewResult, formResult] = await Promise.all([
    client
      .from("website_events")
      .select("event_id,visitor_id")
      .eq("environment", env)
      .eq("event_name", "PageView")
      .ilike("page_url", BOOKING_PAGE_URL_PATTERN)
      .gte("occurred_at", startIso)
      .lte("occurred_at", endIso)
      .limit(MAX_RELATED_ROWS),
    client
      .from("website_events")
      .select("event_id,visitor_id")
      .eq("environment", env)
      .in("event_name", [...BOOKING_FORM_EVENT_NAMES])
      .gte("occurred_at", startIso)
      .lte("occurred_at", endIso)
      .limit(MAX_RELATED_ROWS),
  ]);
  if (pageViewResult.error) throw pageViewResult.error;
  if (formResult.error) throw formResult.error;

  const ids = new Set<string>();
  for (const row of (pageViewResult.data || []) as Array<{ visitor_id: string | null }>) {
    if (row.visitor_id) ids.add(row.visitor_id);
  }
  for (const row of (formResult.data || []) as Array<{ visitor_id: string | null }>) {
    if (row.visitor_id) ids.add(row.visitor_id);
  }
  return Array.from(ids);
}

async function fetchRowsByAcuityAppointmentIds<Row>(
  acuityAppointmentIds: string[],
  queryBatch: (acuityAppointmentIdBatch: string[]) => LedgerSelectChain<Row[]>,
  timestampColumn: keyof Row,
) {
  const rows: Row[] = [];

  for (const batch of chunks(acuityAppointmentIds, ACUITY_APPOINTMENT_ID_BATCH_SIZE)) {
    const result = await queryBatch(batch);
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
  }

  return rows
    .sort((left, right) => timestampValue(right[timestampColumn]) - timestampValue(left[timestampColumn]))
    .slice(0, MAX_RELATED_ROWS);
}

export async function fetchCustomerJourneyLedgerDetail(
  input: {
    acuityAppointmentId?: string | null;
    eventId?: string | null;
    visitorId?: string | null;
  },
  client: CustomerJourneyLedgerClient = createAdsAnalystClient(
    "web",
  ) as unknown as CustomerJourneyLedgerClient,
): Promise<CustomerJourneyLedgerDetailData | null> {
  const visitorId = input.visitorId?.trim() || null;
  const acuityAppointmentId = input.acuityAppointmentId?.trim() || null;
  const eventId = input.eventId?.trim() || null;

  if (!visitorId && !acuityAppointmentId && !eventId) return null;

  if (!visitorId) {
    return fetchCustomerJourneyLedgerConversionOnlyDetail(client, {
      acuityAppointmentId,
      eventId,
    });
  }

  return fetchCustomerJourneyLedgerVisitorDetail(client, {
    acuityAppointmentId,
    eventId,
    visitorId,
  });
}

async function fetchCustomerJourneyLedgerVisitorDetail(
  client: CustomerJourneyLedgerClient,
  input: {
    acuityAppointmentId?: string | null;
    eventId?: string | null;
    visitorId: string;
  },
): Promise<CustomerJourneyLedgerDetailData | null> {
  const visitorId = input.visitorId;
  const [visitorsResult, sessionsResult, eventsResult, conversionsResult] = await Promise.all([
    client
      .from("website_visitors")
      .select(VISITOR_COLUMNS)
      .eq("visitor_id", visitorId)
      .limit(1),
    client
      .from("website_sessions")
      .select(SESSION_COLUMNS)
      .eq("visitor_id", visitorId)
      .order("last_seen_at", { ascending: false })
      .limit(50),
    client
      .from("website_events")
      .select(EVENT_COLUMNS)
      .eq("visitor_id", visitorId)
      .order("occurred_at", { ascending: true })
      .limit(MAX_RELATED_ROWS),
    client
      .from("website_conversions")
      .select(CONVERSION_COLUMNS)
      .eq("visitor_id", visitorId)
      .order("occurred_at", { ascending: false })
      .limit(50),
  ]);

  if (visitorsResult.error) throw visitorsResult.error;
  if (sessionsResult.error) throw sessionsResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (conversionsResult.error) throw conversionsResult.error;

  const visitor = (visitorsResult.data || [])[0] || null;
  if (!visitor) {
    return fetchCustomerJourneyLedgerConversionOnlyDetail(client, {
      acuityAppointmentId: input.acuityAppointmentId,
      eventId: input.eventId,
      skipVisitorLookup: true,
    });
  }
  const appointment = await fetchDetailAppointmentByIdentity(client, {
    acuityAppointmentId: input.acuityAppointmentId,
    eventId: input.eventId,
  });

  return buildCustomerJourneyLedgerDetailData({
    acuityAppointmentId: input.acuityAppointmentId,
    appointment,
    eventId: input.eventId,
    conversions: conversionsResult.data || [],
    events: eventsResult.data || [],
    sessions: sessionsResult.data || [],
    visitor,
  });
}

async function fetchCustomerJourneyLedgerConversionOnlyDetail(
  client: CustomerJourneyLedgerClient,
  input: {
    acuityAppointmentId?: string | null;
    eventId?: string | null;
    skipVisitorLookup?: boolean;
  },
): Promise<CustomerJourneyLedgerDetailData | null> {
  const conversion = await fetchDetailConversionByIdentity(client, input);
  const appointment = await fetchDetailAppointmentByIdentity(client, {
    acuityAppointmentId: conversion?.acuity_appointment_id || input.acuityAppointmentId,
    eventId: conversion?.event_id || input.eventId,
  });

  const visitorId = conversion?.visitor_id?.trim();
  if (visitorId && !input.skipVisitorLookup) {
    const visitorDetail = await fetchCustomerJourneyLedgerVisitorDetail(client, {
      acuityAppointmentId: conversion?.acuity_appointment_id || input.acuityAppointmentId,
      eventId: conversion?.event_id || input.eventId,
      visitorId,
    });
    if (visitorDetail) return visitorDetail;
  }

  if (conversion) {
    return buildCustomerJourneyLedgerConversionOnlyDetailData({ appointment, conversion });
  }

  const event = await fetchDetailEventByIdentity(client, input);
  if (event?.visitor_id && !input.skipVisitorLookup) {
    const visitorDetail = await fetchCustomerJourneyLedgerVisitorDetail(client, {
      acuityAppointmentId: event.acuity_appointment_id || input.acuityAppointmentId,
      eventId: event.event_id || input.eventId,
      visitorId: event.visitor_id,
    });
    if (visitorDetail) return visitorDetail;
  }

  if (appointment || event) {
    return buildCustomerJourneyLedgerAppointmentOnlyDetailData({ appointment, event });
  }

  return null;
}

async function fetchDetailConversionByIdentity(
  client: CustomerJourneyLedgerClient,
  input: {
    acuityAppointmentId?: string | null;
    eventId?: string | null;
  },
) {
  const acuityAppointmentId = input.acuityAppointmentId?.trim();
  const eventId = input.eventId?.trim();

  if (acuityAppointmentId) {
    const result = await client
      .from("website_conversions")
      .select(CONVERSION_COLUMNS)
      .eq("acuity_appointment_id", acuityAppointmentId)
      .order("occurred_at", { ascending: false })
      .limit(1);
    if (result.error) throw result.error;
    const conversion = (result.data || [])[0] || null;
    if (conversion) return conversion;
  }

  const normalizedEventId = eventId || (acuityAppointmentId ? `acuity-${acuityAppointmentId}` : null);
  if (!normalizedEventId) return null;

  const result = await client
    .from("website_conversions")
    .select(CONVERSION_COLUMNS)
    .eq("event_id", normalizedEventId)
    .order("occurred_at", { ascending: false })
    .limit(1);
  if (result.error) throw result.error;
  return (result.data || [])[0] || null;
}

async function fetchDetailAppointmentByIdentity(
  client: CustomerJourneyLedgerClient,
  input: {
    acuityAppointmentId?: string | null;
    eventId?: string | null;
  },
) {
  const acuityAppointmentId = input.acuityAppointmentId?.trim();

  if (acuityAppointmentId) {
    const result = await client
      .from("appointment_events")
      .select(APPOINTMENT_COLUMNS)
      .eq("external_booking_id", acuityAppointmentId)
      .order("visit_date_time", { ascending: false })
      .limit(1);
    if (result.error) throw result.error;
    const appointment = (result.data || [])[0] || null;
    if (appointment) return appointment;
  }

  const event = await fetchDetailEventByIdentity(client, input);
  const eventAcuityId = event?.acuity_appointment_id?.trim();
  if (!eventAcuityId || eventAcuityId === acuityAppointmentId) return null;

  const result = await client
    .from("appointment_events")
    .select(APPOINTMENT_COLUMNS)
    .eq("external_booking_id", eventAcuityId)
    .order("visit_date_time", { ascending: false })
    .limit(1);
  if (result.error) throw result.error;
  return (result.data || [])[0] || null;
}

async function fetchDetailEventByIdentity(
  client: CustomerJourneyLedgerClient,
  input: {
    acuityAppointmentId?: string | null;
    eventId?: string | null;
  },
) {
  const acuityAppointmentId = input.acuityAppointmentId?.trim();
  const eventId = input.eventId?.trim();

  if (acuityAppointmentId) {
    const result = await client
      .from("website_events")
      .select(EVENT_COLUMNS)
      .eq("acuity_appointment_id", acuityAppointmentId)
      .order("occurred_at", { ascending: false })
      .limit(1);
    if (result.error) throw result.error;
    const event = (result.data || [])[0] || null;
    if (event) return event;
  }

  const normalizedEventId = eventId || (acuityAppointmentId ? `acuity-${acuityAppointmentId}` : null);
  if (!normalizedEventId) return null;

  const result = await client
    .from("website_events")
    .select(EVENT_COLUMNS)
    .eq("event_id", normalizedEventId)
    .order("occurred_at", { ascending: false })
    .limit(1);
  if (result.error) throw result.error;
  return (result.data || [])[0] || null;
}

export function buildCustomerJourneyLedgerDetailData(input: {
  acuityAppointmentId?: string | null;
  appointment?: CustomerJourneyLedgerAppointmentRow | null;
  eventId?: string | null;
  conversions: CustomerJourneyLedgerConversionRow[];
  events: CustomerJourneyLedgerEventRow[];
  sessions: CustomerJourneyLedgerSessionRow[];
  visitor: CustomerJourneyLedgerVisitorRow;
}): CustomerJourneyLedgerDetailData {
  const conversion = selectDetailConversion(input.conversions, {
    acuityAppointmentId: input.acuityAppointmentId,
    eventId: input.eventId,
  });
  const appointment = input.appointment || null;
  const sessionsByVisitor = latestByVisitor(input.sessions, "last_seen_at");
  const sessionsByVisitorAndId = groupSessionsByVisitorAndId(input.sessions);
  const session = selectSessionForConversion({
    conversion,
    latestSession: sessionsByVisitor.get(input.visitor.visitor_id) || null,
    sessionsById: sessionsByVisitorAndId.get(input.visitor.visitor_id),
  });
  const eventTouches = input.events.flatMap(eventAttributionTouches);
  const creditedTouch = conversion
    ? selectPaidTouchForConversion(
        conversion,
        [
          attributionTouch(input.visitor.last_paid_touch),
          attributionTouch(conversion.last_paid_touch),
          attributionTouch(conversion.conversion_touch),
          attributionTouch(session?.last_paid_touch),
          ...conversionAttributionTouches(conversion),
          ...eventTouches,
        ],
        input.conversions,
      )
    : selectOriginalPaidTouch(
        [attributionTouch(input.visitor.last_paid_touch), attributionTouch(session?.last_paid_touch), ...eventTouches],
      );
  const returnEvent = selectReturnEvent(input.events, conversion);
  const returnTouch = returnEvent ? eventRowTouch(returnEvent) : null;
  const timeline = buildDetailTimeline({
    appointment,
    conversion,
    creditedTouch,
    events: input.events,
  });
  const geo = geoFromRecords(conversion, input.visitor, session, ...input.events);
  const booking = conversion
    ? {
        appointmentType: conversion.appointment_type,
        bookingTime: conversion.occurred_at,
        eventId: conversion.event_id,
        metaEventId: conversion.meta_event_id,
        sessionId: conversion.session_id,
      }
    : appointment
      ? {
          appointmentType: appointment.visit_type,
          bookingTime: appointmentVisitDateTime(appointment),
          eventId: null,
          metaEventId: null,
          sessionId: session?.session_id || null,
        }
    : null;

  return {
    acuityAppointmentId:
      conversion?.acuity_appointment_id || appointmentAcuityId(appointment) || input.acuityAppointmentId || null,
    appointmentSourceId: appointmentSourceId(appointment),
    appointmentStatus: appointmentStatus(appointment),
    appointmentVisitDateTime: appointmentVisitDateTime(appointment),
    booking,
    capi: {
      eventId: conversion?.meta_event_id || null,
      status: conversion?.meta_capi_status || null,
      testMode: conversion?.meta_capi_test_mode ?? null,
    },
    confidence: confidenceForDetail(input.visitor, conversion, session, appointment),
    creditedTouch: summarizeTouch(creditedTouch),
    geoCity: geo.geoCity,
    geoCountry: geo.geoCountry,
    geoRegion: geo.geoRegion,
    geoTimezone: geo.geoTimezone,
    bookingSessionEntrySource: summarizeTouch(returnTouch),
    returnTouch: summarizeTouch(returnTouch),
    summary: conversion
      ? summarizePath(
          creditedTouch,
          returnTouch,
          conversion,
          returnEvent ? bookingSessionSourceLabelFromEvent(returnEvent, returnTouch) : null,
        )
      : appointment
        ? "Acuity appointment found, but no matching website conversion record was available."
        : null,
    timeline,
    visitorId: input.visitor.visitor_id,
  };
}

export function buildCustomerJourneyLedgerConversionOnlyDetailData(input: {
  appointment?: CustomerJourneyLedgerAppointmentRow | null;
  conversion: CustomerJourneyLedgerConversionRow;
}): CustomerJourneyLedgerDetailData {
  const conversion = input.conversion;
  const appointment = input.appointment || null;
  const creditedTouch = selectPaidTouchForConversion(
    conversion,
    [
      attributionTouch(conversion.last_paid_touch),
      attributionTouch(conversion.conversion_touch),
      ...conversionAttributionTouches(conversion),
    ],
    [conversion],
  );
  const timeline = buildDetailTimeline({
    appointment,
    conversion,
    creditedTouch,
    events: [],
  });
  const geo = geoFromRecords(conversion);

  return {
    acuityAppointmentId: conversion.acuity_appointment_id || null,
    appointmentSourceId: appointmentSourceId(appointment),
    appointmentStatus: appointmentStatus(appointment),
    appointmentVisitDateTime: appointmentVisitDateTime(appointment),
    booking: {
      appointmentType: conversion.appointment_type,
      bookingTime: conversion.occurred_at,
      eventId: conversion.event_id,
      metaEventId: conversion.meta_event_id,
      sessionId: conversion.session_id,
    },
    capi: {
      eventId: conversion.meta_event_id || null,
      status: conversion.meta_capi_status || null,
      testMode: conversion.meta_capi_test_mode ?? null,
    },
    bookingSessionEntrySource: null,
    confidence: confidenceForConversionOnly(conversion),
    creditedTouch: summarizeTouch(creditedTouch),
    geoCity: geo.geoCity,
    geoCountry: geo.geoCountry,
    geoRegion: geo.geoRegion,
    geoTimezone: geo.geoTimezone,
    returnTouch: null,
    summary: summarizeConversionOnlyPath(creditedTouch, conversion),
    timeline,
    visitorId: conversion.visitor_id || null,
  };
}

export function buildCustomerJourneyLedgerAppointmentOnlyDetailData(input: {
  appointment?: CustomerJourneyLedgerAppointmentRow | null;
  event?: CustomerJourneyLedgerEventRow | null;
}): CustomerJourneyLedgerDetailData {
  const appointment = input.appointment || null;
  const event = input.event || null;
  const creditedTouch = event ? eventRowTouch(event) : null;
  const appointmentTime = appointmentVisitDateTime(appointment) || event?.occurred_at || null;
  const appointmentId = appointmentAcuityId(appointment) || event?.acuity_appointment_id || null;
  const geo = geoFromRecords(event || undefined);
  const timeline = buildDetailTimeline({
    appointment,
    conversion: null,
    creditedTouch,
    events: event ? [event] : [],
  });

  return {
    acuityAppointmentId: appointmentId,
    appointmentSourceId: appointmentSourceId(appointment),
    appointmentStatus: appointmentStatus(appointment),
    appointmentVisitDateTime: appointmentVisitDateTime(appointment),
    booking: appointment || event
      ? {
          appointmentType: appointment?.visit_type || event?.appointment_type || null,
          bookingTime: appointmentTime,
          eventId: event?.event_id || null,
          metaEventId: null,
          sessionId: event?.session_id || null,
        }
      : null,
    capi: {
      eventId: null,
      status: null,
      testMode: null,
    },
    bookingSessionEntrySource: summarizeTouch(creditedTouch),
    confidence: confidenceForAppointmentOnly(appointment, event),
    creditedTouch: summarizeTouch(creditedTouch),
    geoCity: geo.geoCity,
    geoCountry: geo.geoCountry,
    geoRegion: geo.geoRegion,
    geoTimezone: geo.geoTimezone,
    returnTouch: summarizeTouch(creditedTouch),
    summary: appointment
      ? "Acuity appointment found, but no matching website conversion record was available."
      : "Website booking event found, but no matching conversion or appointment record was available.",
    timeline,
    visitorId: event?.visitor_id || null,
  };
}

export function buildCustomerJourneyLedgerData(input: {
  appointments?: CustomerJourneyLedgerAppointmentRow[];
  conversions: CustomerJourneyLedgerConversionRow[];
  events?: CustomerJourneyLedgerEventRow[];
  range: CustomerJourneyLedgerData["timeRange"];
  sessions: CustomerJourneyLedgerSessionRow[];
  visitors: CustomerJourneyLedgerVisitorRow[];
}): CustomerJourneyLedgerData {
  const rows = buildCustomerJourneyLedgerRows(input);
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
      visitorsShown: input.visitors.length,
      visitorsWithConversions: rows.filter((row) => row.hasConversion).length,
      visitorsWithPaidTouch: rows.filter((row) => row.hasPaidTouch).length,
    },
    timeRange: input.range,
  };
}

export function buildCustomerJourneyLedgerRows(input: {
  appointments?: CustomerJourneyLedgerAppointmentRow[];
  conversions: CustomerJourneyLedgerConversionRow[];
  events?: CustomerJourneyLedgerEventRow[];
  sessions: CustomerJourneyLedgerSessionRow[];
  visitors: CustomerJourneyLedgerVisitorRow[];
}): CustomerJourneyLedgerRow[] {
  const sessionsByVisitor = latestByVisitor(input.sessions, "last_seen_at");
  const sessionsByVisitorAndId = groupSessionsByVisitorAndId(input.sessions);
  const eventsByVisitor = groupByVisitor(input.events || []);
  const eventsByAcuityId = groupByAcuityAppointmentId(input.events || []);
  const visitorsById = new Map(input.visitors.map((visitor) => [visitor.visitor_id, visitor]));
  const appointments = uniqueValidAcuityAppointments(input.appointments || []);
  const conversionsByAcuityId = latestConversionByAcuityAppointmentId(input.conversions);

  const anchoredRows: CustomerJourneyLedgerRow[] = [];
  const consumedConversions = new Set<CustomerJourneyLedgerConversionRow>();

  for (const appointment of appointments) {
    const acuityAppointmentId = appointmentAcuityId(appointment);
    const conversion = conversionsByAcuityId.get(acuityAppointmentId) || null;
    const appointmentEvents = eventsByAcuityId.get(acuityAppointmentId) || [];
    const visitorId =
      conversion?.visitor_id ||
      appointmentEvents.find((event) => event.visitor_id)?.visitor_id ||
      null;
    const visitor = visitorId ? visitorsById.get(visitorId) || null : null;
    const visitorEvents = visitorId ? eventsByVisitor.get(visitorId) || [] : [];
    const events = uniqueEvents([...appointmentEvents, ...visitorEvents]);

    if (conversion) {
      consumedConversions.add(conversion);
      if (!visitor) {
        anchoredRows.push(withAppointmentFields(
          conversionOnlyLedgerRow(conversion, events, input.conversions, true),
          appointment,
        ));
        continue;
      }

      const session = selectSessionForConversion({
        conversion,
        latestSession: sessionsByVisitor.get(visitor.visitor_id) || null,
        sessionsById: sessionsByVisitorAndId.get(visitor.visitor_id),
      });
      anchoredRows.push(withAppointmentFields(
        conversionLedgerRow({ allConversions: input.conversions, conversion, events, session, visitor, isAppointmentAnchored: true }),
        appointment,
      ));
      continue;
    }

    const latestSession = visitor ? sessionsByVisitor.get(visitor.visitor_id) || null : null;
    anchoredRows.push(appointmentLedgerRow({ appointment, events, session: latestSession, visitor }));
  }

  // Emit conversion-anchored rows for any Schedule conversion not consumed
  // by an appointment row above. Mirrors the funnel's conversion-grain count
  // so orphan conversions (canceled / rescheduled / future / no-appt-row)
  // still surface in the ledger.
  for (const conversion of input.conversions) {
    if (consumedConversions.has(conversion)) continue;
    const visitor = conversion.visitor_id ? visitorsById.get(conversion.visitor_id) || null : null;
    if (!visitor) {
      anchoredRows.push(conversionOnlyLedgerRow(
        conversion,
        conversion.visitor_id ? eventsByVisitor.get(conversion.visitor_id) || [] : [],
        input.conversions,
        false,
      ));
      continue;
    }

    const session = selectSessionForConversion({
      conversion,
      latestSession: sessionsByVisitor.get(visitor.visitor_id) || null,
      sessionsById: sessionsByVisitorAndId.get(visitor.visitor_id),
    });
    const visitorEvents = eventsByVisitor.get(visitor.visitor_id) || [];
    anchoredRows.push(conversionLedgerRow({ allConversions: input.conversions, conversion, events: visitorEvents, session, visitor, isAppointmentAnchored: false }));
  }

  // Phase 2 (v3 plan): emit visitor-only rows for any visitor that wasn't
  // anchored by an appointment- or conversion-keyed row above. This is the
  // browse-but-no-book population the appointment-keyed flow used to drop.
  const anchoredVisitorIds = new Set(anchoredRows.map((row) => row.visitorId).filter(Boolean) as string[]);
  const visitorOnlyRows: CustomerJourneyLedgerRow[] = [];
  for (const visitor of input.visitors) {
    if (anchoredVisitorIds.has(visitor.visitor_id)) continue;
    const session = sessionsByVisitor.get(visitor.visitor_id) || null;
    const events = eventsByVisitor.get(visitor.visitor_id) || [];
    visitorOnlyRows.push(visitorOnlyLedgerRow({ events, session, visitor }));
  }

  const allRows = [...anchoredRows, ...visitorOnlyRows];

  return allRows.sort(
    (a, b) => timestampValue(b.appointmentVisitDateTime || b.lastSeen) - timestampValue(a.appointmentVisitDateTime || a.lastSeen),
  );
}

function visitorOnlyLedgerRow(input: {
  events: CustomerJourneyLedgerEventRow[];
  session: CustomerJourneyLedgerSessionRow | null;
  visitor: CustomerJourneyLedgerVisitorRow;
}): CustomerJourneyLedgerRow {
  const { events, session, visitor } = input;
  const eventTouches = events.flatMap(eventAttributionTouches);
  const paidTouch = selectOriginalPaidTouch([
    attributionTouch(visitor.last_paid_touch),
    attributionTouch(session?.last_paid_touch),
    ...eventTouches,
  ]);
  const campaignId = paidTouch?.utm?.campaignId || null;
  const adsetId = paidTouch?.utm?.adsetId || null;
  const adId = paidTouch?.utm?.adId || null;
  const placement = paidTouch?.utm?.placement || null;
  const source = paidTouch?.utm?.source || paidTouch?.sourceType || paidTouch?.source || null;
  const deviceCategory = visitor.device_category || session?.device_category || paidTouch?.deviceCategory || null;
  const browserName = visitor.browser_name || session?.browser_name || paidTouch?.browserName || null;
  const osName = visitor.os_name || session?.os_name || paidTouch?.osName || null;
  const geo = geoFromRecords(visitor, session, ...events);

  return {
    adId,
    adsetId,
    acuityAppointmentId: null,
    appointmentSourceId: null,
    appointmentStatus: null,
    appointmentType: null,
    appointmentVisitDateTime: null,
    bookingTime: null,
    brand: null,
    browserName,
    campaignId,
    capiStatus: null,
    conversionEventId: null,
    customerEmail: visitor.customer_email || session?.customer_email || null,
    customerName: visitor.customer_name || session?.customer_name || null,
    customerPhone: visitor.customer_phone || session?.customer_phone || null,
    deviceBrowser: formatDeviceBrowser(deviceCategory, browserName, osName),
    deviceCategory,
    fbc: visitor.fbc || session?.fbc || paidTouch?.fbc || null,
    fbp: visitor.fbp || session?.fbp || paidTouch?.fbp || null,
    firstPage: visitor.first_page_url || session?.first_page_url || events.find((event) => event.page_url)?.page_url || null,
    geoCity: geo.geoCity,
    geoCountry: geo.geoCountry,
    geoRegion: geo.geoRegion,
    geoTimezone: geo.geoTimezone,
    hasConversion: false,
    hasPaidTouch: Boolean(paidTouch),
    lastPaidSource: source,
    lastPaidSourceType: paidTouch?.sourceType || null,
    lastSeen: visitor.last_seen_at,
    metaEventId: null,
    osName,
    placement,
    sessionId: session?.session_id || events.find((event) => event.session_id)?.session_id || null,
    stageKeys: stageKeysForVisitorOnly({ events, paidTouch }),
    visitorId: visitor.visitor_id,
  };
}

function stageKeysForVisitorOnly(input: {
  events: CustomerJourneyLedgerEventRow[];
  paidTouch: AttributionTouch | null;
}) {
  const keys = new Set<string>(["visitor_only"]);
  if (input.paidTouch) keys.add("paid_meta_visit");
  if (input.events.some((event) => event.event_name === "PageView" && pageGroupFromUrl(event.page_url) === "booking")) {
    keys.add("booking_page_view");
  }
  if (input.events.some(isBookingFormStartedLedgerEvent)) keys.add("booking_form_started");
  if (input.events.some((event) => event.event_name === "BookingVisitSelected")) keys.add("visit_selected");
  if (input.events.some((event) => event.event_name === "BookingDateSelected")) keys.add("date_selected");
  if (input.events.some((event) => event.event_name === "BookingTimeSelected")) keys.add("time_selected");
  return Array.from(keys);
}

function conversionLedgerRow(input: {
  allConversions: CustomerJourneyLedgerConversionRow[];
  conversion: CustomerJourneyLedgerConversionRow;
  events: CustomerJourneyLedgerEventRow[];
  session: CustomerJourneyLedgerSessionRow | null;
  visitor: CustomerJourneyLedgerVisitorRow;
  isAppointmentAnchored: boolean;
}): CustomerJourneyLedgerRow {
  const { allConversions, conversion, events, session, visitor, isAppointmentAnchored } = input;
  const eventTouches = events.flatMap(eventAttributionTouches);
  const paidTouch = selectPaidTouchForConversion(
    conversion,
    [
      attributionTouch(visitor.last_paid_touch),
      attributionTouch(conversion.last_paid_touch),
      attributionTouch(conversion.conversion_touch),
      attributionTouch(session?.last_paid_touch),
      ...conversionAttributionTouches(conversion),
      ...eventTouches,
    ],
    allConversions,
  );
  const campaignId = paidTouch?.utm?.campaignId || null;
  const adsetId = paidTouch?.utm?.adsetId || null;
  const adId = paidTouch?.utm?.adId || null;
  const placement = paidTouch?.utm?.placement || null;
  const source =
    paidTouch?.utm?.source || paidTouch?.sourceType || paidTouch?.source || conversion.source_type || null;
  const deviceCategory =
    conversion.device_category ||
    visitor.device_category ||
    session?.device_category ||
    paidTouch?.deviceCategory ||
    null;
  const browserName =
    conversion.browser_name ||
    visitor.browser_name ||
    session?.browser_name ||
    paidTouch?.browserName ||
    null;
  const osName = conversion.os_name || visitor.os_name || session?.os_name || paidTouch?.osName || null;
  const geo = geoFromRecords(conversion, visitor, session, ...events);

  return {
    adId,
    adsetId,
    acuityAppointmentId: conversion.acuity_appointment_id || null,
    appointmentSourceId: null,
    appointmentStatus: null,
    appointmentType: conversion.appointment_type || null,
    appointmentVisitDateTime: null,
    bookingTime: conversion.occurred_at,
    brand: conversion.brand || null,
    browserName,
    campaignId,
    capiStatus: conversion.meta_capi_status || null,
    conversionEventId: conversion.event_id,
    customerEmail: conversion.customer_email || visitor.customer_email || session?.customer_email || null,
    customerName: conversion.customer_name || visitor.customer_name || session?.customer_name || null,
    customerPhone: conversion.customer_phone || visitor.customer_phone || session?.customer_phone || null,
    deviceBrowser: formatDeviceBrowser(deviceCategory, browserName, osName),
    deviceCategory,
    fbc: conversion.fbc || visitor.fbc || session?.fbc || paidTouch?.fbc || null,
    fbp: conversion.fbp || visitor.fbp || session?.fbp || paidTouch?.fbp || null,
    firstPage: visitor.first_page_url || session?.first_page_url || null,
    geoCity: geo.geoCity,
    geoCountry: geo.geoCountry,
    geoRegion: geo.geoRegion,
    geoTimezone: geo.geoTimezone,
    hasConversion: true,
    hasPaidTouch: Boolean(paidTouch),
    lastPaidSource: source,
    lastPaidSourceType: paidTouch?.sourceType || conversion.source_type || null,
    lastSeen: conversion.occurred_at,
    metaEventId: conversion.meta_event_id || null,
    osName,
    placement,
    sessionId: conversion.session_id || session?.session_id || null,
    stageKeys: stageKeysForConversion({ conversion, events, paidTouch, isAppointmentAnchored }),
    visitorId: visitor.visitor_id,
  };
}

function conversionOnlyLedgerRow(
  conversion: CustomerJourneyLedgerConversionRow,
  events: CustomerJourneyLedgerEventRow[],
  allConversions: CustomerJourneyLedgerConversionRow[] = [conversion],
  isAppointmentAnchored = false,
): CustomerJourneyLedgerRow {
  const eventTouches = events.flatMap(eventAttributionTouches);
  const paidTouch = selectPaidTouchForConversion(
    conversion,
    [
      attributionTouch(conversion.last_paid_touch),
      attributionTouch(conversion.conversion_touch),
      ...conversionAttributionTouches(conversion),
      ...eventTouches,
    ],
    allConversions,
  );
  const campaignId = paidTouch?.utm?.campaignId || null;
  const adsetId = paidTouch?.utm?.adsetId || null;
  const adId = paidTouch?.utm?.adId || null;
  const placement = paidTouch?.utm?.placement || null;
  const source =
    paidTouch?.utm?.source || paidTouch?.sourceType || paidTouch?.source || conversion.source_type || null;
  const deviceCategory = conversion.device_category || paidTouch?.deviceCategory || null;
  const browserName = conversion.browser_name || paidTouch?.browserName || null;
  const osName = conversion.os_name || paidTouch?.osName || null;
  const geo = geoFromRecords(conversion, ...events);

  return {
    adId,
    adsetId,
    acuityAppointmentId: conversion.acuity_appointment_id || null,
    appointmentSourceId: null,
    appointmentStatus: null,
    appointmentType: conversion.appointment_type || null,
    appointmentVisitDateTime: null,
    bookingTime: conversion.occurred_at,
    brand: conversion.brand || null,
    browserName,
    campaignId,
    capiStatus: conversion.meta_capi_status || null,
    conversionEventId: conversion.event_id,
    customerEmail: conversion.customer_email || null,
    customerName: conversion.customer_name || null,
    customerPhone: conversion.customer_phone || null,
    deviceBrowser: formatDeviceBrowser(deviceCategory, browserName, osName),
    deviceCategory,
    fbc: conversion.fbc || paidTouch?.fbc || null,
    fbp: conversion.fbp || paidTouch?.fbp || null,
    firstPage: conversion.page_url || paidTouch?.pageUrl || null,
    geoCity: geo.geoCity,
    geoCountry: geo.geoCountry,
    geoRegion: geo.geoRegion,
    geoTimezone: geo.geoTimezone,
    hasConversion: true,
    hasPaidTouch: Boolean(paidTouch),
    lastPaidSource: source,
    lastPaidSourceType: paidTouch?.sourceType || conversion.source_type || null,
    lastSeen: conversion.occurred_at,
    metaEventId: conversion.meta_event_id || null,
    osName,
    placement,
    sessionId: conversion.session_id || null,
    stageKeys: stageKeysForConversion({ conversion, events, paidTouch, isAppointmentAnchored }),
    visitorId: conversion.visitor_id || null,
  };
}

function appointmentLedgerRow(input: {
  appointment: CustomerJourneyLedgerAppointmentRow;
  events: CustomerJourneyLedgerEventRow[];
  session: CustomerJourneyLedgerSessionRow | null;
  visitor: CustomerJourneyLedgerVisitorRow | null;
}): CustomerJourneyLedgerRow {
  const { appointment, events, session, visitor } = input;
  const appointmentTime = appointmentVisitDateTime(appointment) || appointment.created_at;
  const eventTouches = events.flatMap(eventAttributionTouches);
  const paidTouch = selectOriginalPaidTouch(
    [
      attributionTouch(visitor?.last_paid_touch),
      attributionTouch(session?.last_paid_touch),
      ...eventTouches,
    ],
    { maxCapturedAt: appointmentTime },
  );
  const campaignId = paidTouch?.utm?.campaignId || null;
  const adsetId = paidTouch?.utm?.adsetId || null;
  const adId = paidTouch?.utm?.adId || null;
  const placement = paidTouch?.utm?.placement || null;
  const source = paidTouch?.utm?.source || paidTouch?.sourceType || paidTouch?.source || null;
  const deviceCategory = visitor?.device_category || session?.device_category || paidTouch?.deviceCategory || null;
  const browserName = visitor?.browser_name || session?.browser_name || paidTouch?.browserName || null;
  const osName = visitor?.os_name || session?.os_name || paidTouch?.osName || null;
  const customer = appointmentCustomer(appointment);
  const geo = geoFromRecords(visitor, session, ...events);

  return {
    adId,
    adsetId,
    acuityAppointmentId: appointmentAcuityId(appointment) || null,
    appointmentSourceId: appointmentSourceId(appointment),
    appointmentStatus: appointmentStatus(appointment),
    appointmentType: appointment.visit_type || null,
    appointmentVisitDateTime: appointmentVisitDateTime(appointment),
    bookingTime: null,
    brand: appointment.brand || null,
    browserName,
    campaignId,
    capiStatus: null,
    conversionEventId: null,
    customerEmail: customer.email || visitor?.customer_email || session?.customer_email || null,
    customerName: customer.name || visitor?.customer_name || session?.customer_name || null,
    customerPhone: customer.phone || visitor?.customer_phone || session?.customer_phone || null,
    deviceBrowser: formatDeviceBrowser(deviceCategory, browserName, osName),
    deviceCategory,
    fbc: visitor?.fbc || session?.fbc || paidTouch?.fbc || null,
    fbp: visitor?.fbp || session?.fbp || paidTouch?.fbp || null,
    firstPage: visitor?.first_page_url || session?.first_page_url || events.find((event) => event.page_url)?.page_url || null,
    geoCity: geo.geoCity,
    geoCountry: geo.geoCountry,
    geoRegion: geo.geoRegion,
    geoTimezone: geo.geoTimezone,
    hasConversion: false,
    hasPaidTouch: Boolean(paidTouch),
    lastPaidSource: source,
    lastPaidSourceType: paidTouch?.sourceType || null,
    lastSeen: appointmentTime,
    metaEventId: null,
    osName,
    placement,
    sessionId: session?.session_id || events.find((event) => event.session_id)?.session_id || null,
    stageKeys: stageKeysForAppointment({ appointment, events, paidTouch }),
    visitorId: visitor?.visitor_id || events.find((event) => event.visitor_id)?.visitor_id || null,
  };
}

function withAppointmentFields(
  row: CustomerJourneyLedgerRow,
  appointment: CustomerJourneyLedgerAppointmentRow,
): CustomerJourneyLedgerRow {
  return {
    ...row,
    acuityAppointmentId: appointmentAcuityId(appointment) || row.acuityAppointmentId,
    appointmentSourceId: appointmentSourceId(appointment),
    appointmentStatus: appointmentStatus(appointment),
    appointmentType: row.appointmentType || appointment.visit_type || null,
    appointmentVisitDateTime: appointmentVisitDateTime(appointment),
    lastSeen: appointmentVisitDateTime(appointment) || row.lastSeen,
  };
}

function selectPaidTouchForConversion(
  conversion: CustomerJourneyLedgerConversionRow,
  touches: Array<AttributionTouch | null | undefined>,
  allConversions: CustomerJourneyLedgerConversionRow[] = [conversion],
) {
  const previousBookingAt = previousBookingTimestamp(conversion, allConversions);
  const eligibleTouches = touches
    .filter((touch) => isTouchWithinLookback(touch, conversion.occurred_at))
    .filter((touch) => isAfterPreviousBooking(touch, previousBookingAt));
  return selectOriginalPaidTouch(eligibleTouches, { maxCapturedAt: conversion.occurred_at });
}

function previousBookingTimestamp(
  conversion: CustomerJourneyLedgerConversionRow,
  allConversions: CustomerJourneyLedgerConversionRow[],
) {
  const currentAt = timestampValue(conversion.occurred_at);
  let previous: number | null = null;

  for (const candidate of allConversions) {
    if (candidate.event_id === conversion.event_id) continue;
    if (!sameConversionIdentity(candidate, conversion)) continue;
    const candidateAt = timestampValue(candidate.occurred_at);
    if (!candidateAt || candidateAt >= currentAt) continue;
    if (previous === null || candidateAt > previous) previous = candidateAt;
  }

  return previous;
}

function sameConversionIdentity(
  left: CustomerJourneyLedgerConversionRow,
  right: CustomerJourneyLedgerConversionRow,
) {
  if (left.visitor_id && right.visitor_id && left.visitor_id === right.visitor_id) return true;
  const leftEmail = normalizeIdentityEmail(left.customer_email);
  const rightEmail = normalizeIdentityEmail(right.customer_email);
  if (leftEmail && rightEmail && leftEmail === rightEmail) return true;
  const leftPhone = normalizeIdentityPhone(left.customer_phone);
  const rightPhone = normalizeIdentityPhone(right.customer_phone);
  return Boolean(leftPhone && rightPhone && leftPhone === rightPhone);
}

function normalizeIdentityEmail(value: string | null) {
  return (value || "").trim().toLowerCase();
}

function normalizeIdentityPhone(value: string | null) {
  return (value || "").replace(/\D/g, "");
}

function isAfterPreviousBooking(
  touch: AttributionTouch | null | undefined,
  previousBookingAt: number | null,
) {
  if (previousBookingAt === null) return true;
  const capturedAt = timestampValue(touch?.capturedAt);
  return Boolean(capturedAt && capturedAt > previousBookingAt);
}

function isTouchWithinLookback(touch: AttributionTouch | null | undefined, conversionAt: string) {
  if (!touch?.capturedAt) return true;
  const captured = Date.parse(touch.capturedAt);
  const converted = Date.parse(conversionAt);
  if (!Number.isFinite(captured) || !Number.isFinite(converted)) return true;
  return captured <= converted && converted - captured <= PAID_META_ATTRIBUTION_LOOKBACK_DAYS * 864e5;
}

function stageKeysForConversion(input: {
  conversion: CustomerJourneyLedgerConversionRow;
  events: CustomerJourneyLedgerEventRow[];
  paidTouch: AttributionTouch | null;
  isAppointmentAnchored: boolean;
}) {
  // Only tag "confirmed_website_bookings" when the conversion is actually
  // anchored to a valid Acuity appointment. Orphan conversions (no matching
  // appt row, or appt canceled / rescheduled / outside window) still surface
  // in the ledger and keep their paid_meta_bookings tag if applicable, but
  // they aren't "confirmed bookings" by the funnel's definition.
  const keys = new Set<string>();
  if (input.isAppointmentAnchored) keys.add("confirmed_website_bookings");
  const conversionAt = timestampValue(input.conversion.occurred_at);
  const sessionId = input.conversion.session_id;
  const relevantEvents = input.events.filter((event) => {
    if (sessionId && event.session_id !== sessionId) return false;
    return timestampValue(event.occurred_at) <= conversionAt;
  });

  if (input.paidTouch) keys.add("paid_meta_bookings");
  if (relevantEvents.some((event) => event.event_name === "PageView" && pageGroupFromUrl(event.page_url) === "booking")) {
    keys.add("booking_page_view");
  }
  if (relevantEvents.some(isBookingFormStartedLedgerEvent)) keys.add("booking_form_started");
  if (relevantEvents.some((event) => event.event_name === "BookingVisitSelected")) keys.add("visit_selected");
  if (relevantEvents.some((event) => event.event_name === "BookingDateSelected")) keys.add("date_selected");
  if (relevantEvents.some((event) => event.event_name === "BookingTimeSelected")) keys.add("time_selected");
  return Array.from(keys);
}

function stageKeysForAppointment(input: {
  appointment: CustomerJourneyLedgerAppointmentRow;
  events: CustomerJourneyLedgerEventRow[];
  paidTouch: AttributionTouch | null;
}) {
  const keys = new Set<string>(["confirmed_website_bookings"]);
  const appointmentTime = timestampValue(appointmentVisitDateTime(input.appointment));
  const relevantEvents = input.events.filter((event) => {
    const eventTime = timestampValue(event.occurred_at);
    return !appointmentTime || eventTime <= appointmentTime;
  });

  if (input.paidTouch) keys.add("paid_meta_bookings");
  if (relevantEvents.some((event) => event.event_name === "PageView" && pageGroupFromUrl(event.page_url) === "booking")) {
    keys.add("booking_page_view");
  }
  if (relevantEvents.some(isBookingFormStartedLedgerEvent)) keys.add("booking_form_started");
  if (relevantEvents.some((event) => event.event_name === "BookingVisitSelected")) keys.add("visit_selected");
  if (relevantEvents.some((event) => event.event_name === "BookingDateSelected")) keys.add("date_selected");
  if (relevantEvents.some((event) => event.event_name === "BookingTimeSelected")) keys.add("time_selected");
  return Array.from(keys);
}

function isBookingFormStartedLedgerEvent(event: CustomerJourneyLedgerEventRow) {
  return [
    "BookingFormStarted",
    "BookingContactStarted",
    "BookingVisitSelected",
    "BookingDateSelected",
    "BookingTimeSelected",
    "BookingIdentityCaptured",
  ].includes(event.event_name);
}

function pageGroupFromUrl(value: string | null) {
  if (!value) return null;
  try {
    const path = new URL(value).pathname.toLowerCase();
    return pageGroupFromPath(path);
  } catch {
    return pageGroupFromPath(value.toLowerCase());
  }
}

function pageGroupFromPath(path: string) {
  if (path.includes("/book-an-appointment")) return "booking";
  if (path.includes("/products/")) return "product";
  if (path.includes("custom-jewelry") || path.includes("jewelry-design")) return "custom_jewelry";
  return null;
}

function selectDetailConversion(
  conversions: CustomerJourneyLedgerConversionRow[],
  input: {
    acuityAppointmentId?: string | null;
    eventId?: string | null;
  },
) {
  const normalizedAcuityId = input.acuityAppointmentId?.trim();
  const normalizedEventId = input.eventId?.trim();
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
  if (normalizedEventId) {
    const match = conversions.find((conversion) => conversion.event_id === normalizedEventId);
    if (match) return match;
  }

  return [...conversions].sort((a, b) => timestampValue(b.occurred_at) - timestampValue(a.occurred_at))[0] || null;
}

function selectReturnEvent(
  events: CustomerJourneyLedgerEventRow[],
  conversion: CustomerJourneyLedgerConversionRow | null,
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
    .sort((a, b) => timestampValue(b.occurred_at) - timestampValue(a.occurred_at));

  return (
    beforeBooking.find((event) => event.event_name === "PageView") ||
    beforeBooking.find((event) => event.referrer || event.utm_source || event.utm_medium) ||
    beforeBooking[0] ||
    null
  );
}

function buildDetailTimeline(input: {
  appointment?: CustomerJourneyLedgerAppointmentRow | null;
  conversion: CustomerJourneyLedgerConversionRow | null;
  creditedTouch: AttributionTouch | null;
  events: CustomerJourneyLedgerEventRow[];
}) {
  const bookingTime = timestampValue(input.conversion?.occurred_at);
  const sessionId = input.conversion?.session_id;
  const windowEnd = bookingTime ? bookingTime + DETAIL_EVENT_WINDOW_AFTER_BOOKING_MS : null;
  const timeline: CustomerJourneyLedgerTimelineEvent[] = [];
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
    const sameSession = !sessionId || event.session_id === sessionId;
    if (!sameSession && !isJourneyEntryEvent(event)) continue;
    if (!shouldIncludeTimelineWebsiteEvent(event)) continue;
    const eventTime = timestampValue(event.occurred_at);
    if (bookingTime && eventTime > (windowEnd || bookingTime)) continue;
    const touch = eventRowTouch(event);
    const summary = summarizeTouch(touch);
    timeline.push({
      ...eventTimelineFields(event, summary),
      category: timelineCategory(event),
      eventId: event.event_id,
      label: timelineLabel(event),
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
        adName: null,
        adsetId: null,
        campaignId: null,
        category: "capi",
        content: null,
        creativeId: null,
        creativeName: null,
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
  } else if (input.appointment) {
    timeline.push({
      ...touchTimelineFields(null),
      category: "conversion",
      eventId: null,
      label: "Acuity appointment scheduled",
      occurredAt: appointmentVisitDateTime(input.appointment) || input.appointment.created_at,
    });
  }

  return dedupeTimeline(timeline).sort((a, b) => timestampValue(a.occurredAt) - timestampValue(b.occurredAt));
}

function summarizeTouch(touch: AttributionTouch | null): CustomerJourneyLedgerTouchSummary | null {
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

function touchTimelineFields(summary: CustomerJourneyLedgerTouchSummary | null) {
  return {
    adId: summary?.adId || null,
    adName: null,
    adsetId: summary?.adsetId || null,
    campaignId: summary?.campaignId || null,
    content: summary?.content || null,
    creativeId: null,
    creativeName: null,
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

function eventTimelineFields(
  event: CustomerJourneyLedgerEventRow,
  summary: CustomerJourneyLedgerTouchSummary | null,
) {
  const fields = touchTimelineFields(summary);
  const freshUtm = utmFromUrl(event.page_url);
  return {
    ...fields,
    adId: fields.adId || freshUtm?.adId || stringValue(event.utm_ad_id) || null,
    adsetId: fields.adsetId || freshUtm?.adsetId || stringValue(event.utm_adset_id) || null,
    campaignId:
      fields.campaignId || freshUtm?.campaignId || stringValue(event.utm_campaign_id) || null,
    content: fields.content || freshUtm?.content || stringValue(event.utm_content) || null,
    fbclidPresent: fields.fbclidPresent || Boolean(freshUtm?.fbclid || event.fbclid),
    medium: fields.medium || freshUtm?.medium || stringValue(event.utm_medium) || null,
    pageUrl: fields.pageUrl || sanitizeUrl(event.page_url),
    placement: fields.placement || freshUtm?.placement || stringValue(event.utm_placement) || null,
    referrer: fields.referrer || sanitizeUrl(event.referrer),
    source: fields.source || freshUtm?.source || stringValue(event.utm_source) || event.source || null,
    sourceType: fields.sourceType || event.source_type || null,
  };
}

function timelineCategory(event: CustomerJourneyLedgerEventRow): CustomerJourneyLedgerTimelineEvent["category"] {
  if (event.event_name === "PageView" || event.event_name === "ViewContent") return "page";
  if (event.event_type === "booking" || event.event_name.startsWith("Booking")) return "booking";
  if (event.event_type === "conversion" || event.event_name === "Schedule") return "conversion";
  return "engagement";
}

function timelineLabel(event: CustomerJourneyLedgerEventRow) {
  if (event.event_name === "PageView") {
    if (isFreshPaidMetaLandingEvent(event)) return "Meta ad landing page viewed";
    const organicSocialLabel = organicSocialLandingLabel(event);
    if (organicSocialLabel) return organicSocialLabel;
    const metaOriginLabel = metaOriginPageViewLabel(event);
    if (metaOriginLabel) return metaOriginLabel;
    return pageViewLabel(event.page_url);
  }
  const labels: Record<string, string> = {
    BookingClientConfirmed: "Booking confirmed in browser",
    BookingContactStarted: "Started booking form",
    BookingDateSelected: "Date selected",
    BookingFormStarted: "Started booking form",
    BookingIdentityCaptured: "Email or phone captured before submit",
    BookingSubmitAttempt: "Booking submitted",
    BookingTimeSelected: "Time selected",
    BookingVisitSelected: "Appointment type selected",
    Schedule: "Acuity booking created",
    ViewContent: "Booking page content viewed",
  };
  return labels[event.event_name] || event.event_name;
}

function isJourneyEntryEvent(event: CustomerJourneyLedgerEventRow) {
  return (
    event.event_name === "PageView" &&
    (isFreshPaidMetaLandingEvent(event) ||
      Boolean(organicSocialLandingLabel(event)) ||
      Boolean(metaOriginPageViewLabel(event)))
  );
}

function shouldIncludeTimelineWebsiteEvent(event: CustomerJourneyLedgerEventRow) {
  if (event.event_name === "PageView" || event.event_name === "ViewContent") return true;
  if (event.event_type === "booking" || event.event_name.startsWith("Booking")) return true;
  if (event.event_type === "conversion" || event.event_name === "Schedule") return true;
  if (isTimelineNoiseEvent(event)) return false;
  return false;
}

function isTimelineNoiseEvent(event: CustomerJourneyLedgerEventRow) {
  return (
    event.event_name === "ScrollDepth" ||
    event.event_name.startsWith("Engaged") ||
    event.event_type === "engagement"
  );
}

function isFreshPaidMetaLandingEvent(event: CustomerJourneyLedgerEventRow) {
  const utm = utmFromUrl(event.page_url);
  const medium = (utm?.medium || "").toLowerCase();
  const source = (utm?.source || "").toLowerCase();
  const referrer = (event.referrer || "").toLowerCase();
  const hasMetaSource = isMetaSourceText(source, referrer);
  const hasMetaAdIdentifier = Boolean(utm?.adId || utm?.adsetId || utm?.campaignId);
  return hasMetaAdIdentifier || (hasMetaSource && isPaidMediumValue(medium));
}

function organicSocialLandingLabel(event: CustomerJourneyLedgerEventRow) {
  const utm = utmFromUrl(event.page_url);
  const source = (utm?.source || "").toLowerCase();
  const medium = (utm?.medium || "").toLowerCase();
  const content = (utm?.content || "").toLowerCase();
  const referrer = (event.referrer || "").toLowerCase();
  const hasOrganicSocialProof = isOrganicSocialMedium(medium) || isProfileLinkContent(content);

  if (isFreshPaidMetaLandingEvent(event) || !hasOrganicSocialProof) {
    return null;
  }

  if (isInstagramSourceText(source, referrer)) {
    return "Instagram profile link landing viewed";
  }

  if (isFacebookSourceText(source, referrer)) {
    return "Facebook page link landing viewed";
  }

  return null;
}

function metaOriginPageViewLabel(event: CustomerJourneyLedgerEventRow) {
  const sourceName = metaOriginSourceName(event);
  if (!sourceName) return null;
  return `Page viewed from ${sourceName}`;
}

function metaOriginSourceName(event: CustomerJourneyLedgerEventRow) {
  const utm = utmFromUrl(event.page_url);
  if (!utm?.fbclid || isFreshPaidMetaLandingEvent(event) || organicSocialLandingLabel(event)) return null;
  const source = (utm.source || "").toLowerCase();
  const referrer = (event.referrer || "").toLowerCase();

  if (isInstagramSourceText(source, referrer)) return "Instagram";
  if (isFacebookSourceText(source, referrer)) return "Facebook";
  return "Facebook or Instagram";
}

function pageViewLabel(pageUrl: string | null) {
  const group = pageGroupFromUrl(pageUrl);
  if (group === "booking") return "Booking page viewed";
  if (group === "product") return "Product page viewed";
  if (group === "custom_jewelry") return "Custom jewelry page viewed";
  return "Page viewed";
}

function isPaidMediumValue(value: string) {
  return ["paid", "paid_social", "cpc", "ppc", "social_paid"].some((needle) => value.includes(needle));
}

function isOrganicSocialMedium(value: string) {
  return ["social", "organic_social", "organic-social", "organic"].some((needle) => value.includes(needle));
}

function isProfileLinkContent(value: string) {
  return value.includes("link_in_bio") || value.includes("link-in-bio") || value.includes("profile");
}

function isMetaSourceText(source: string, referrer: string) {
  return (
    isInstagramSourceText(source, referrer) ||
    isFacebookSourceText(source, referrer) ||
    source === "an" ||
    source.includes("audience_network")
  );
}

function isInstagramSourceText(source: string, referrer: string) {
  return source.includes("instagram") || source === "ig" || referrer.includes("instagram.com");
}

function isFacebookSourceText(source: string, referrer: string) {
  return source.includes("facebook") || source === "fb" || referrer.includes("facebook.com");
}

function dedupeTimeline(events: CustomerJourneyLedgerTimelineEvent[]) {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = `${event.occurredAt}|${event.category}|${event.eventId || ""}|${event.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function confidenceForDetail(
  visitor: CustomerJourneyLedgerVisitorRow,
  conversion: CustomerJourneyLedgerConversionRow | null,
  session: CustomerJourneyLedgerSessionRow | null,
  appointment: CustomerJourneyLedgerAppointmentRow | null,
): CustomerJourneyLedgerDetailData["confidence"] {
  const signals = [`Same visitor ID: ${visitor.visitor_id}`];

  if (appointment) signals.push(`Acuity appointment: ${appointmentAcuityId(appointment)}`);
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

  if (appointment) {
    return {
      explanation:
        "Matched the Acuity appointment to website activity by visitor or event data, but no website conversion row was available.",
      level: session ? "browser_session" : "browser_visitor",
      signals,
    };
  }

  return {
    explanation: "No booking conversion was found for this visitor in the detail lookup.",
    level: "unmatched",
    signals,
  };
}

function confidenceForAppointmentOnly(
  appointment: CustomerJourneyLedgerAppointmentRow | null,
  event: CustomerJourneyLedgerEventRow | null,
): CustomerJourneyLedgerDetailData["confidence"] {
  const signals: string[] = [];
  const acuityAppointmentId = appointmentAcuityId(appointment) || event?.acuity_appointment_id || null;
  if (acuityAppointmentId) signals.push(`Acuity appointment: ${acuityAppointmentId}`);
  if (appointment?.status) signals.push(`Appointment status: ${appointment.status}`);
  if (event?.event_id) signals.push(`Website event: ${event.event_id}`);
  if (event?.session_id) signals.push(`Session ID on event: ${event.session_id}`);
  if (event?.visitor_id) signals.push(`Visitor ID on event: ${event.visitor_id}`);

  return {
    explanation:
      "The Acuity appointment exists, but the browser journey is incomplete because no matching website conversion row was available.",
    level: "appointment_only",
    signals,
  };
}

function confidenceForConversionOnly(
  conversion: CustomerJourneyLedgerConversionRow,
): CustomerJourneyLedgerDetailData["confidence"] {
  const signals = [`Conversion event: ${conversion.event_id}`];
  if (conversion.acuity_appointment_id) signals.push(`Acuity appointment: ${conversion.acuity_appointment_id}`);
  if (conversion.visitor_id) signals.push(`Visitor ID on conversion: ${conversion.visitor_id}`);

  return {
    explanation:
      "The booking conversion exists, but no matching website visitor record was available for the detail lookup. This row is visible as an unattributed booking instead of being hidden from the ledger.",
    level: "conversion_only",
    signals,
  };
}

function summarizePath(
  creditedTouch: AttributionTouch | null,
  returnTouch: AttributionTouch | null,
  conversion: CustomerJourneyLedgerConversionRow | null,
  bookingSessionSource?: string | null,
) {
  if (!conversion) return null;
  const parts: string[] = [];
  const creditedAt = creditedTouch?.capturedAt;
  const returnAt = returnTouch?.capturedAt;

  if (creditedAt) {
    parts.push(`Paid attribution captured ${formatDurationBetween(creditedAt, conversion.occurred_at)} before booking`);
  }

  if (returnTouch) {
    parts.push(`Booking session started from ${bookingSessionSource || bookingSessionSourceLabel(returnTouch)}`);
  }

  if (returnAt) {
    parts.push(`booked ${formatDurationBetween(returnAt, conversion.occurred_at)} later`);
  }

  return parts.length ? sentenceCase(`${parts.join("; ")}.`) : "Booking conversion found for this visitor.";
}

function bookingSessionSourceLabelFromEvent(
  event: CustomerJourneyLedgerEventRow,
  touch: AttributionTouch | null,
) {
  if (event.event_name !== "PageView") return touch ? bookingSessionSourceLabel(touch) : "website event";
  if (isFreshPaidMetaLandingEvent(event)) {
    const content = touch?.utm?.content || utmFromUrl(event.page_url)?.content;
    return content ? `Meta ad ${content}` : "Meta ad";
  }
  const socialLabel = organicSocialLandingLabel(event);
  if (socialLabel === "Instagram profile link landing viewed") return "Instagram profile link";
  if (socialLabel === "Facebook page link landing viewed") return "Facebook page link";
  const metaOriginSource = metaOriginSourceName(event);
  if (metaOriginSource) return `${metaOriginSource} page view`;

  const pageGroup = pageGroupFromUrl(event.page_url);
  if (pageGroup === "booking") return "booking page";
  if (pageGroup === "product") return "product page";
  if (pageGroup === "custom_jewelry") return "custom jewelry page";
  return touch ? bookingSessionSourceLabel(touch) : "website page";
}

function bookingSessionSourceLabel(touch: AttributionTouch) {
  const utm = touch.utm || {};
  const medium = (utm.medium || "").toLowerCase();
  const source = (utm.source || touch.source || "").toLowerCase();
  const referrer = (touch.referrer || "").toLowerCase();
  const content = utm.content || null;
  const hasPaidMetaSignal = Boolean(utm.adId || utm.adsetId || utm.campaignId) || isPaidMediumValue(medium);

  if (hasPaidMetaSignal && isMetaSourceText(source, referrer)) {
    return content ? `Meta ad ${content}` : "Meta ad";
  }

  if (isInstagramSourceText(source, referrer)) return "Instagram profile link";
  if (isFacebookSourceText(source, referrer)) return "Facebook page link";
  if (content) return content;
  if (utm.source) return utm.source;
  if (touch.source) return touch.source;
  return "website page";
}

function summarizeConversionOnlyPath(
  creditedTouch: AttributionTouch | null,
  conversion: CustomerJourneyLedgerConversionRow,
) {
  if (creditedTouch) return summarizePath(creditedTouch, null, conversion);
  return "Booking conversion found, but no browser visitor/session ID was captured for same-device journey matching.";
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

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function uniqueVisitors(rows: CustomerJourneyLedgerVisitorRow[]) {
  const byVisitorId = new Map<string, CustomerJourneyLedgerVisitorRow>();
  for (const row of rows) {
    const existing = byVisitorId.get(row.visitor_id);
    if (!existing || timestampValue(row.last_seen_at) > timestampValue(existing.last_seen_at)) {
      byVisitorId.set(row.visitor_id, row);
    }
  }
  return Array.from(byVisitorId.values());
}

function uniqueConversions(rows: CustomerJourneyLedgerConversionRow[]) {
  const byEventId = new Map<string, CustomerJourneyLedgerConversionRow>();
  for (const row of rows) {
    const existing = byEventId.get(row.event_id);
    if (!existing || timestampValue(row.occurred_at) > timestampValue(existing.occurred_at)) {
      byEventId.set(row.event_id, row);
    }
  }
  return Array.from(byEventId.values());
}

function uniqueEvents(rows: CustomerJourneyLedgerEventRow[]) {
  const byEventId = new Map<string, CustomerJourneyLedgerEventRow>();
  for (const row of rows) {
    const existing = byEventId.get(row.event_id);
    if (!existing || timestampValue(row.occurred_at) > timestampValue(existing.occurred_at)) {
      byEventId.set(row.event_id, row);
    }
  }
  return Array.from(byEventId.values());
}

function uniqueValidAcuityAppointments(rows: CustomerJourneyLedgerAppointmentRow[]) {
  const byAcuityId = new Map<string, CustomerJourneyLedgerAppointmentRow>();

  for (const row of rows) {
    if (!isValidAcuityAppointment(row)) continue;
    const acuityAppointmentId = appointmentAcuityId(row);
    const existing = byAcuityId.get(acuityAppointmentId);
    if (!existing || timestampValue(row.visit_date_time) > timestampValue(existing.visit_date_time)) {
      byAcuityId.set(acuityAppointmentId, row);
    }
  }

  return Array.from(byAcuityId.values());
}

function isValidAcuityAppointment(row: CustomerJourneyLedgerAppointmentRow) {
  if (row.booking_source !== "acuity") return false;
  if (!appointmentAcuityId(row)) return false;
  if (!appointmentVisitDateTime(row)) return false;
  return !INVALID_APPOINTMENT_STATUSES.has((row.status || "").toLowerCase());
}

function appointmentAcuityId(row: CustomerJourneyLedgerAppointmentRow | null | undefined) {
  return row?.external_booking_id?.trim() || "";
}

function appointmentStatus(row: CustomerJourneyLedgerAppointmentRow | null | undefined) {
  return row?.status || null;
}

function appointmentVisitDateTime(row: CustomerJourneyLedgerAppointmentRow | null | undefined) {
  return typeof row?.visit_date_time === "string" && row.visit_date_time.trim()
    ? row.visit_date_time
    : null;
}

function appointmentSourceId(row: CustomerJourneyLedgerAppointmentRow | null | undefined) {
  return row?.appt_id || appointmentAcuityId(row) || null;
}

function appointmentCustomer(row: CustomerJourneyLedgerAppointmentRow | null | undefined) {
  const raw = objectRecord(row?.raw_payload);
  const appointment = objectRecord(raw?.appointment);
  const firstName = stringValue(appointment?.firstName);
  const lastName = stringValue(appointment?.lastName);
  const name = [firstName, lastName].filter(Boolean).join(" ") || null;
  return {
    email: stringValue(appointment?.email) || null,
    name,
    phone: stringValue(appointment?.phone) || null,
  };
}

function latestConversionByAcuityAppointmentId(rows: CustomerJourneyLedgerConversionRow[]) {
  const byAcuityId = new Map<string, CustomerJourneyLedgerConversionRow>();

  for (const row of rows) {
    const acuityAppointmentId = row.acuity_appointment_id?.trim();
    if (!acuityAppointmentId) continue;
    const existing = byAcuityId.get(acuityAppointmentId);
    if (!existing || timestampValue(row.occurred_at) > timestampValue(existing.occurred_at)) {
      byAcuityId.set(acuityAppointmentId, row);
    }
  }

  return byAcuityId;
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

function groupByAcuityAppointmentId<Row extends { acuity_appointment_id: string | null }>(rows: Row[]) {
  const groups = new Map<string, Row[]>();

  for (const row of rows) {
    if (!row.acuity_appointment_id) continue;
    groups.set(row.acuity_appointment_id, [...(groups.get(row.acuity_appointment_id) || []), row]);
  }

  return groups;
}

function groupSessionsByVisitorAndId(rows: CustomerJourneyLedgerSessionRow[]) {
  const groups = new Map<string, Map<string, CustomerJourneyLedgerSessionRow>>();

  for (const row of rows) {
    if (!row.visitor_id) continue;
    const sessions = groups.get(row.visitor_id) || new Map<string, CustomerJourneyLedgerSessionRow>();
    sessions.set(row.session_id, row);
    groups.set(row.visitor_id, sessions);
  }

  return groups;
}

function selectSessionForConversion({
  conversion,
  latestSession,
  sessionsById,
}: {
  conversion: CustomerJourneyLedgerConversionRow | null;
  latestSession: CustomerJourneyLedgerSessionRow | null;
  sessionsById?: Map<string, CustomerJourneyLedgerSessionRow>;
}) {
  if (conversion?.session_id) {
    return sessionsById?.get(conversion.session_id) || latestSession;
  }

  return latestSession;
}

function conversionAttributionTouches(conversion: CustomerJourneyLedgerConversionRow | null) {
  if (!conversion) return [];
  return [
    ...storedAttributionTouches(conversion.properties, conversion.occurred_at, conversion.source_type),
    ...storedAttributionTouches(conversion.raw_json, conversion.occurred_at, conversion.source_type),
  ];
}

function eventAttributionTouches(row: CustomerJourneyLedgerEventRow) {
  return [
    eventRowTouch(row),
    ...storedAttributionTouches(row.properties, row.occurred_at, row.source_type, row.source),
    ...storedAttributionTouches(row.raw_json, row.occurred_at, row.source_type, row.source),
  ].filter((touch): touch is AttributionTouch => Boolean(touch));
}

function eventRowTouch(row: CustomerJourneyLedgerEventRow): AttributionTouch | null {
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
  const pageUrl = firstStringValue(record.pageUrl, record.landingPageUrl, record.eventSourceUrl, record.event_source_url);
  const utm = mergeUtmRecords(utmFromUrl(pageUrl), normalizedUtmRecord(record.utm));
  const touch: AttributionTouch = {
    browserName: stringValue(record.browserName),
    capturedAt: stringValue(record.capturedAt) || stringValue(fallbackCapturedAt),
    deviceCategory: stringValue(record.deviceCategory),
    fbc: stringValue(record.fbc),
    fbp: stringValue(record.fbp),
    osName: stringValue(record.osName),
    pageUrl,
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
  const pageUrl = firstStringValue(record.pageUrl, record.landingPageUrl, record.eventSourceUrl, record.event_source_url);
  const touch: AttributionTouch = {
    browserName: stringValue(record.browserName),
    capturedAt: stringValue(record.capturedAt),
    deviceCategory: stringValue(record.deviceCategory),
    fbc: stringValue(record.fbc),
    fbp: stringValue(record.fbp),
    osName: stringValue(record.osName),
    pageUrl,
    referrer: stringValue(record.referrer),
    source: stringValue(record.source),
    sourceType: stringValue(record.sourceType),
    utm: mergeUtmRecords(utmFromUrl(pageUrl), normalizedUtmRecord(record.utm)),
  };

  return hasTouchSignal(touch) ? touch : null;
}

function hasTouchSignal(touch: AttributionTouch) {
  return Boolean(
    touch.fbc ||
      touch.fbp ||
      touch.source ||
      touch.sourceType ||
      touch.utm,
  );
}

export function normalizeCustomerJourneyLedgerDateRange(input: {
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

function mergeUtmRecords(...values: Array<Record<string, string> | undefined>) {
  const merged: Record<string, string> = {};
  for (const value of values) {
    if (value) Object.assign(merged, value);
  }
  return Object.keys(merged).length ? merged : undefined;
}

function utmFromUrl(value: unknown) {
  const urlValue = stringValue(value);
  if (!urlValue) return undefined;

  try {
    return normalizedUtmRecord(Object.fromEntries(new URL(urlValue).searchParams));
  } catch {
    return undefined;
  }
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

function geoFromRecords(
  ...records: Array<
    | {
        geo_city: string | null;
        geo_country: string | null;
        geo_region: string | null;
        geo_timezone: string | null;
      }
    | null
    | undefined
  >
) {
  for (const record of records) {
    if (!record) continue;
    if (!record.geo_city && !record.geo_region && !record.geo_country && !record.geo_timezone) {
      continue;
    }
    return {
      geoCity: record.geo_city || null,
      geoCountry: record.geo_country || null,
      geoRegion: record.geo_region || null,
      geoTimezone: record.geo_timezone || null,
    };
  }

  return {
    geoCity: null,
    geoCountry: null,
    geoRegion: null,
    geoTimezone: null,
  };
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
