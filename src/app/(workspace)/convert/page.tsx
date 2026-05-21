import {
  ConversationQueue,
} from "@/components/v2/convert/conversation-queue";
import {
  CustomerLedger,
} from "@/components/v2/convert/customer-ledger";
import { FunnelViz } from "@/components/v2/convert/funnel-viz";
import { SignalStrip } from "@/components/v2/signal-strip";
import { StatusSentence } from "@/components/v2/status-sentence";
import {
  buildCustomerLedgerStatusSentence,
  countCustomerLedgerCapiGaps,
  countUnreadThreads,
  customerJourneyLedgerRequestFromSearchParams,
  customerLedgerRowsFromJourneys,
  type CustomerLedgerRow,
} from "@/lib/convert-customer-ledger";
import { enrichCustomerLedgerRowsWithCreativePreviews } from "@/lib/customer-ledger-creative-enrichment";
import { fetchCustomerJourneyLedgerData } from "@/lib/customer-journey-ledger";
import { requirePagePermission } from "@/lib/server-route-auth";
import {
  getSocialInboxData,
  type SocialInboxData,
} from "@/lib/social-inbox";
import {
  fetchWebsiteFunnelData,
  type WebsiteFunnelData,
} from "@/lib/website-analytics";

const emptyInbox: SocialInboxData = {
  threads: [],
  messages: [],
  comments: [],
  syncRuns: [],
};

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

  const [funnel, inbox, ledger] = await Promise.all([
    fetchWebsiteFunnelData({ days }).catch((e) => {
      console.error("[convert] fetchWebsiteFunnelData failed:", e);
      return emptyFunnel(days);
    }),
    getSocialInboxData().catch((e) => {
      console.error("[convert] getSocialInboxData failed:", e);
      return emptyInbox;
    }),
    fetchLedger(params).catch((e) => {
      console.error("[convert] fetchLedger failed:", e);
      return [] as CustomerLedgerRow[];
    }),
  ]);

  const unread = countUnreadThreads(inbox.threads);
  const sentence = buildCustomerLedgerStatusSentence({
    bookings: funnel.overview.schedules,
    rows: ledger,
    sessions: funnel.overview.sessions,
    unreadConversations: unread,
  });

  return (
    <div className="space-y-6">
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
            label: "Unread conversations",
            value: String(unread),
          },
          {
            label: "CAPI gaps",
            value: String(countCustomerLedgerCapiGaps(ledger)),
          },
        ]}
      />

      <SignalStrip room="convert" />

      <FunnelViz steps={funnel.funnel} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <CustomerLedger rows={ledger} />
        </div>
        <div className="lg:col-span-2">
          <ConversationQueue threads={inbox.threads} comments={inbox.comments} />
        </div>
      </div>
    </div>
  );
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
    trend: [],
    recentEvents: [],
  };
}
