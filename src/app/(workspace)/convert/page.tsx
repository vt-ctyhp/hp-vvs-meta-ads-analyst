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
  customerLedgerRowsFromJourneys,
  type CustomerLedgerRow,
} from "@/lib/convert-customer-ledger";
import { enrichCustomerLedgerRowsWithCreativePreviews } from "@/lib/customer-ledger-creative-enrichment";
import { fetchCustomerJourneyLedgerData } from "@/lib/customer-journey-ledger";
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
  const days = Number.isFinite(Number(params.days)) ? Number(params.days) : 30;

  const data = {
    funnel: fetchWebsiteFunnelData({ days }).catch((e) => {
      console.error("[convert] fetchWebsiteFunnelData failed:", e);
      return emptyFunnel(days);
    }),
    ledger: fetchLedger(params).catch((e) => {
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
  const sentence = buildCustomerLedgerStatusSentence({
    bookings: funnel.overview.schedules,
    rows: ledger,
    sessions: funnel.overview.sessions,
    unreadConversations: 0,
  });

  return (
    <StatusSentence
      sentence={sentence}
      metrics={[
        {
          label: "Customers",
          value: funnel.overview.sessions.toLocaleString(),
        },
        {
          label: "Bookings",
          value: funnel.overview.schedules.toLocaleString(),
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
  return <FunnelViz steps={funnel.funnel} />;
}

async function ConvertLedger({ data }: { data: ConvertData }) {
  const ledger = await data.ledger;
  return <CustomerLedger rows={ledger} />;
}

// ── data fetchers ──────────────────────────────────────────────────────────

async function fetchLedger(params: SearchParams): Promise<CustomerLedgerRow[]> {
  const data = await fetchCustomerJourneyLedgerData(
    customerJourneyLedgerRequestFromSearchParams(params),
  );
  return enrichCustomerLedgerRowsWithCreativePreviews(
    customerLedgerRowsFromJourneys(data.rows),
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────

function emptyFunnel(days: number): WebsiteFunnelData {
  const end = new Date().toISOString().slice(0, 10);
  const startD = new Date();
  startD.setUTCDate(startD.getUTCDate() - days);
  return {
    configured: false,
    sourceTransparency: {
      timeRange: { start: startD.toISOString().slice(0, 10), end, days },
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
      className="relative flex flex-col gap-3 rounded-xl border border-stone-200 bg-white px-6 py-4 md:flex-row md:items-center md:justify-between"
    >
      <span
        aria-hidden
        className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-md bg-stone-200"
      />
      <div className="space-y-2 pl-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-[min(36rem,72vw)]" />
      </div>
      <div className="grid grid-cols-2 gap-4 pl-3 sm:flex sm:pl-0">
        {["customers", "bookings", "gaps"].map((item) => (
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
      className="overflow-hidden rounded-xl border border-stone-200 bg-white"
    >
      <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-4 py-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="space-y-3 px-4 py-5">
        {[92, 76, 58, 36].map((width, index) => (
          <div key={index} className="grid grid-cols-[10rem_1fr_5rem] items-center gap-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-9 rounded-md" style={{ width: `${width}%` }} />
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
      className="overflow-hidden rounded-xl border border-stone-200 bg-white"
    >
      <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-4 py-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="divide-y divide-stone-100">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="grid grid-cols-[1fr_6rem_5rem] items-center gap-4 px-4 py-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-[min(18rem,44vw)]" />
              <Skeleton className="h-3 w-[min(26rem,56vw)]" />
            </div>
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-7 w-16 rounded-full" />
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
      className={["block animate-pulse rounded bg-stone-200/80", className].join(" ")}
      style={style}
    />
  );
}
