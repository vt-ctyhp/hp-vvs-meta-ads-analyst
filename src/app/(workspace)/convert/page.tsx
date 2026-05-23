import { Suspense } from "react";

import {
  CustomerLedger,
} from "@/components/v2/convert/customer-ledger";
import { FunnelViz } from "@/components/v2/convert/funnel-viz";
import { StatusSentence } from "@/components/v2/status-sentence";
import {
  buildCustomerLedgerStatusSentence,
  countCustomerLedgerCapiGaps,
  customerJourneyLedgerRequestFromSearchParams,
  type CustomerJourneyLedgerRequest,
  customerLedgerRowsFromJourneys,
  type CustomerLedgerRow,
} from "@/lib/convert-customer-ledger";
import { enrichCustomerLedgerRowsWithCreativePreviews } from "@/lib/customer-ledger-creative-enrichment";
import {
  fetchCustomerJourneyLedgerData,
  normalizeCustomerJourneyLedgerDateRange,
} from "@/lib/customer-journey-ledger";
import { requirePagePermission } from "@/lib/server-route-auth";
import {
  fetchWebsiteFunnelData,
  type WebsiteFunnelData,
} from "@/lib/website-analytics";

export const dynamic = "force-dynamic";

type SearchParams = { days?: string; start?: string; end?: string };

export default async function ConvertPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePagePermission("view_dashboard", "/convert");

  const params = await searchParams;
  const rangeRequest = customerJourneyLedgerRequestFromSearchParams(params);

  const data = {
    funnel: fetchWebsiteFunnelData(rangeRequest).catch((e) => {
      console.error("[convert] fetchWebsiteFunnelData failed:", e);
      return emptyFunnel(rangeRequest);
    }),
    ledger: fetchLedger(rangeRequest).catch((e) => {
      console.error("[convert] fetchLedger failed:", e);
      return [] as CustomerLedgerRow[];
    }),
  };

  return (
    <div className="space-y-6">
      <Suspense fallback={<StatusSentenceFallback />}>
        <ConvertStatus data={data} />
      </Suspense>

      <Suspense fallback={<FunnelFallback />}>
        <ConvertFunnel data={data} />
      </Suspense>

      <div className="ornament-rule" />

      <Suspense fallback={<CustomerLedgerFallback />}>
        <ConvertLedger data={data} />
      </Suspense>
    </div>
  );
}

type ConvertData = {
  funnel: Promise<WebsiteFunnelData>;
  ledger: Promise<CustomerLedgerRow[]>;
};

async function ConvertStatus({ data }: { data: ConvertData }) {
  const [funnel, ledger] = await Promise.all([
    data.funnel,
    data.ledger,
  ]);
  const bookingSessions =
    funnel.funnel.find((row) => row.key === "booking_page_view")?.count ?? 0;
  const confirmedBookings = funnel.overview.websiteScheduleConversions;
  const sentence = buildCustomerLedgerStatusSentence({
    bookings: confirmedBookings,
    rows: ledger,
    sessionNoun: "booking session",
    sessions: bookingSessions,
    unreadConversations: 0,
  });

  return (
    <StatusSentence
      sentence={sentence}
      metrics={[
        {
          label: "Booking sessions",
          value: bookingSessions.toLocaleString(),
        },
        {
          label: "Confirmed bookings",
          value: confirmedBookings.toLocaleString(),
        },
        {
          label: "CAPI gaps",
          value: String(countCustomerLedgerCapiGaps(ledger)),
        },
      ]}
    />
  );
}

async function ConvertFunnel({ data }: { data: ConvertData }) {
  const funnel = await data.funnel;
  return (
    <FunnelViz
      steps={funnel.funnel}
      bookingSignals={[
        {
          label: "Confirmed Schedule conversions",
          source: "website_conversions / Schedule",
          count: funnel.overview.websiteScheduleConversions,
        },
        {
          label: "Paid Meta Schedule conversions",
          source: "website_conversions / Schedule / paid_meta",
          count: funnel.overview.paidMetaScheduleConversions,
        },
      ]}
    />
  );
}

async function ConvertLedger({ data }: { data: ConvertData }) {
  const ledger = await data.ledger;
  return <CustomerLedger rows={ledger} />;
}

// ── data fetchers ──────────────────────────────────────────────────────────

async function fetchLedger(rangeRequest: CustomerJourneyLedgerRequest): Promise<CustomerLedgerRow[]> {
  const data = await fetchCustomerJourneyLedgerData(rangeRequest);
  return enrichCustomerLedgerRowsWithCreativePreviews(
    customerLedgerRowsFromJourneys(data.rows),
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────

function emptyFunnel(rangeRequest: CustomerJourneyLedgerRequest): WebsiteFunnelData {
  const range = normalizeCustomerJourneyLedgerDateRange(rangeRequest);
  return {
    configured: false,
    sourceTransparency: {
      timeRange: range,
      recordCounts: {},
    },
    overview: {
      sessions: 0,
      pageViews: 0,
      engagedSessions: 0,
      importantClicks: 0,
      searches: 0,
      scrollDepthEvents: 0,
      bookingStarts: 0,
      schedules: 0,
      websiteScheduleConversions: 0,
      paidMetaScheduleConversions: 0,
      metaAttributedBookings: 0,
      // Fields added by main's attribution-ledger work (commit 7dd4293). Stub
      // them at 0 so the empty-funnel placeholder still satisfies
      // WebsiteFunnelData["overview"]'s shape.
      metaPaidSessions: 0,
      customerLinkedEvents: 0,
      completeTrackingConversions: 0,
      discrepancy: 0,
    },
    funnel: [],
    pages: [],
    locations: [],
    trend: [],
    recentEvents: [],
  };
}

function StatusSentenceFallback() {
  return (
    <section
      aria-label="Loading Convert headline"
      className="flex flex-col gap-3 border border-l-[3px] border-hp-rule bg-hp-card px-6 py-5 md:flex-row md:items-center md:justify-between"
    >
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-[min(36rem,72vw)]" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:flex">
        {["booking-sessions", "confirmed-bookings", "gaps"].map((item) => (
          <div key={item} className="min-w-[88px] space-y-2">
            <Skeleton className="h-2 w-20" />
            <Skeleton className="h-5 w-12" />
          </div>
        ))}
      </div>
    </section>
  );
}

function FunnelFallback() {
  return (
    <section
      aria-label="Loading website funnel"
      className="overflow-hidden border border-hp-rule bg-hp-card"
    >
      <div className="flex items-center justify-between border-b border-hp-rule bg-hp-inset px-5 py-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="space-y-3 px-4 py-5">
        {[92, 76, 58, 36].map((width, index) => (
          <div key={index} className="grid grid-cols-[10rem_1fr_5rem] items-center gap-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-9" style={{ width: `${width}%` }} />
            <Skeleton className="h-4 w-14" />
          </div>
        ))}
      </div>
    </section>
  );
}

function CustomerLedgerFallback() {
  return (
    <section
      aria-label="Loading customer ledger"
      className="overflow-hidden border border-hp-rule bg-hp-card"
    >
      <div className="flex items-center justify-between border-b border-hp-rule bg-hp-inset px-5 py-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="divide-y divide-hp-rule-soft">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="grid grid-cols-[1fr_6rem_5rem] items-center gap-4 px-4 py-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-[min(18rem,44vw)]" />
              <Skeleton className="h-3 w-[min(26rem,56vw)]" />
            </div>
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
    </section>
  );
}

function Skeleton({
  className,
  style,
}: {
  className: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={["block animate-pulse bg-hp-inset", className].join(" ")}
      style={style}
    />
  );
}
