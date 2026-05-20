import {
  ConversationQueue,
} from "@/components/v2/convert/conversation-queue";
import {
  CustomerLedger,
  type CustomerLedgerRow,
} from "@/components/v2/convert/customer-ledger";
import { FunnelViz } from "@/components/v2/convert/funnel-viz";
import { SignalStrip } from "@/components/v2/signal-strip";
import { StatusSentence } from "@/components/v2/status-sentence";
import { createAdsAnalystClient } from "@/lib/ads-analyst-db";
import { requirePagePermission } from "@/lib/server-route-auth";
import {
  getSocialInboxData,
  type SocialInboxData,
} from "@/lib/social-inbox";

const emptyInbox: SocialInboxData = {
  threads: [],
  messages: [],
  comments: [],
  syncRuns: [],
};
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

  const [funnel, inbox, ledger] = await Promise.all([
    fetchWebsiteFunnelData({ days }).catch((e) => {
      console.error("[convert] fetchWebsiteFunnelData failed:", e);
      return emptyFunnel(days);
    }),
    getSocialInboxData().catch((e) => {
      console.error("[convert] getSocialInboxData failed:", e);
      return emptyInbox;
    }),
    fetchLedger().catch((e) => {
      console.error("[convert] fetchLedger failed:", e);
      return [] as CustomerLedgerRow[];
    }),
  ]);

  const sentence = buildSentence({ funnel, inbox, ledger });

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
            value: String(unreadCount(inbox)),
          },
          {
            label: "CAPI gaps",
            value: String(capiGap(ledger)),
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

async function fetchLedger(limit = 100): Promise<CustomerLedgerRow[]> {
  const supabase = createAdsAnalystClient("web") as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        order: (
          col: string,
          opts: { ascending: boolean; nullsFirst?: boolean },
        ) => {
          limit: (n: number) => Promise<{ data: unknown; error: Error | null }>;
        };
      };
    };
  };

  const { data, error } = await supabase
    .from("website_conversions")
    .select(
      "event_id, occurred_at, customer_name, customer_email, brand, source_type, meta_capi_status, acuity_appointment_id, appointment_type, last_paid_touch",
    )
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw error;
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  return rows.map((row) => {
    const paid = (row.last_paid_touch ?? null) as Record<string, unknown> | null;
    return {
      eventId: String(row.event_id ?? ""),
      occurredAt: String(row.occurred_at ?? new Date().toISOString()),
      customerName: (row.customer_name as string | null) ?? null,
      customerEmail: (row.customer_email as string | null) ?? null,
      brand: (row.brand as string | null) ?? null,
      sourceType: (row.source_type as string | null) ?? null,
      paidTouchSource:
        paid && typeof paid.utm_source === "string" ? paid.utm_source : null,
      paidTouchCampaign:
        paid && typeof paid.utm_campaign === "string" ? paid.utm_campaign : null,
      capiStatus: (row.meta_capi_status as string | null) ?? null,
      acuityAppointmentId: (row.acuity_appointment_id as string | null) ?? null,
      appointmentType: (row.appointment_type as string | null) ?? null,
    };
  });
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
      discrepancy: 0,
    },
    funnel: [],
    pages: [],
    trend: [],
    recentEvents: [],
  };
}

function unreadCount(inbox: SocialInboxData): number {
  return inbox.threads.reduce((sum, t) => sum + (t.unread_count || 0), 0);
}

function capiGap(rows: CustomerLedgerRow[]): number {
  return rows.filter((r) => {
    const status = (r.capiStatus ?? "").toLowerCase();
    return status === "failed" || status === "error" || !r.capiStatus;
  }).length;
}

function buildSentence(args: {
  funnel: WebsiteFunnelData;
  inbox: SocialInboxData;
  ledger: CustomerLedgerRow[];
}): string {
  const { funnel, inbox, ledger } = args;
  const sessions = funnel.overview.sessions;
  const bookings = funnel.overview.schedules;
  const unread = unreadCount(inbox);
  const gaps = capiGap(ledger);

  if (sessions === 0 && bookings === 0 && unread === 0 && ledger.length === 0) {
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
  if (unread > 0) {
    pieces.push(`${unread} conversation${unread === 1 ? "" : "s"} waiting.`);
  }
  if (gaps > 0) {
    pieces.push(
      `${gaps} attribution / CAPI gap${gaps === 1 ? "" : "s"} to clear.`,
    );
  }
  return pieces.join(" ");
}
