import { DashboardClient } from "@/components/dashboard-client";
import {
  emptyDashboardPayload,
  type DashboardPayload,
  type PerformanceRow,
} from "@/lib/analytics";

export const dynamic = "force-dynamic";

/**
 * Design-preview route. Feeds DashboardClient a forced-configured
 * payload with stub campaigns so the full chrome (ShellHeader,
 * StatusSentence, MetricTile strip, Row 1 / Row 2 filter region,
 * scorecard, table, sticky filter behavior) renders without needing
 * real Supabase or Meta credentials.
 *
 * Not linked from anywhere. Visit /analyst/preview directly.
 */

const UMBRELLAS = [
  "Facebook US Product",
  "Book Appts US",
  "US Promotions (WKDS / OOAK)",
  "Cash for Gold US",
  "Facebook VN Product",
  "VN Promotions (WKDS / OOAK)",
] as const;

const BRANDS = ["HP", "VVS"] as const;

const STATUSES = ["ACTIVE", "PAUSED", "ACTIVE", "ACTIVE", "PAUSED"] as const;

function stubCampaigns(count: number): PerformanceRow[] {
  const rows: PerformanceRow[] = [];
  for (let i = 0; i < count; i++) {
    const brand = BRANDS[i % BRANDS.length];
    const umbrella = UMBRELLAS[i % UMBRELLAS.length];
    const status = STATUSES[i % STATUSES.length];
    const spend = 240 + ((i * 137) % 4200);
    const impressions = 18000 + ((i * 5117) % 220000);
    const clicks = 220 + ((i * 41) % 3800);
    const primary = 4 + ((i * 7) % 48);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
    const costPerPrimaryResult = primary > 0 ? spend / primary : null;

    rows.push({
      id: `demo_campaign_${i + 1}`,
      name: `${umbrella} · Set ${String.fromCharCode(65 + (i % 6))}${i + 1}`,
      brandCode: brand,
      status,
      effectiveStatus: status,
      objective: "OUTCOME_LEADS",
      campaignUmbrella: umbrella,
      campaignUmbrellaConfidence: "high",
      campaignUmbrellaReason: "demo seed",
      spend,
      impressions,
      reach: Math.round(impressions * 0.78),
      clicks,
      leads: Math.round(primary * 0.7),
      bookings: Math.round(primary * 0.3),
      websiteBookings: Math.round(primary * 0.25),
      messagingContacts: Math.round(primary * 0.4),
      newMessagingContacts: Math.round(primary * 0.3),
      primaryResults: primary,
      primaryResultLabel: "Bookings",
      secondaryResults: Math.round(primary * 1.4),
      secondaryResultLabel: "Messaging Contacts",
      conversions: primary,
      ctr,
      cpm,
      cpc,
      cpl: clicks > 0 ? spend / clicks : null,
      costPerPrimaryResult,
      frequency: 1.2 + (i % 7) * 0.1,
    });
  }
  return rows;
}

function stubDailyTrend(startISO: string, endISO: string) {
  const start = new Date(startISO + "T00:00:00Z");
  const end = new Date(endISO + "T00:00:00Z");
  const days =
    Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  const rows: Array<{
    date: string;
    brandCode: string;
    campaignUmbrella: string;
    spend: number;
    impressions: number;
    clicks: number;
    leads: number;
    primaryResults: number;
    websiteBookings: number;
    messagingContacts: number;
    newMessagingContacts: number;
    ctr: number;
    cpc: number;
  }> = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    const iso = d.toISOString().slice(0, 10);
    // Per-day curve: gentle wobble around a rising trend.
    const spend = 320 + i * 45 + ((i * 91) % 180);
    const impressions = 22000 + i * 1800 + ((i * 5117) % 8000);
    const clicks = 380 + i * 25 + ((i * 41) % 90);
    const primary = 6 + ((i * 5) % 11);
    rows.push({
      date: iso,
      brandCode: "HP",
      campaignUmbrella: "Facebook US Product",
      spend,
      impressions,
      clicks,
      leads: Math.round(primary * 0.7),
      primaryResults: primary,
      websiteBookings: Math.round(primary * 0.25),
      messagingContacts: Math.round(primary * 0.4),
      newMessagingContacts: Math.round(primary * 0.3),
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
    });
  }
  return rows;
}

function umbrellaAggregates(rows: PerformanceRow[]): PerformanceRow[] {
  const map = new Map<string, PerformanceRow>();
  for (const row of rows) {
    const key = row.campaignUmbrella ?? "Unclassified";
    const existing = map.get(key);
    if (existing) {
      existing.spend += row.spend;
      existing.impressions += row.impressions;
      existing.clicks += row.clicks;
      existing.leads += row.leads;
      existing.primaryResults += row.primaryResults;
      existing.bookings += row.bookings;
      existing.websiteBookings += row.websiteBookings;
      existing.messagingContacts += row.messagingContacts;
      existing.newMessagingContacts += row.newMessagingContacts;
      existing.conversions += row.conversions;
    } else {
      map.set(key, {
        ...row,
        id: `umbrella_${key}`,
        name: key,
      });
    }
  }
  // recompute rate metrics
  for (const row of map.values()) {
    row.ctr = row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0;
    row.cpc = row.clicks > 0 ? row.spend / row.clicks : 0;
    row.cpm = row.impressions > 0 ? (row.spend / row.impressions) * 1000 : 0;
    row.costPerPrimaryResult = row.primaryResults > 0 ? row.spend / row.primaryResults : null;
  }
  return Array.from(map.values());
}

export default function AnalystPreviewPage() {
  const base = emptyDashboardPayload([]);
  const campaigns = stubCampaigns(30);
  const byUmbrella = umbrellaAggregates(campaigns);
  const overview = byUmbrella.reduce(
    (acc, row) => {
      acc.spend += row.spend;
      acc.impressions += row.impressions;
      acc.clicks += row.clicks;
      acc.primaryResults += row.primaryResults;
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0, primaryResults: 0 },
  );
  const overviewCtr = overview.impressions > 0 ? (overview.clicks / overview.impressions) * 100 : 0;
  const overviewCpc = overview.clicks > 0 ? overview.spend / overview.clicks : 0;

  const data = {
    ...base,
    configured: true,
    sourceTransparency: {
      ...base.sourceTransparency,
      timeRange: {
        start: "2026-05-17",
        end: "2026-05-23",
        days: 7,
      },
      adAccountsAnalyzed: [
        { brandCode: "HP", accountId: "act_demo_hp", name: "HP demo" },
      ],
      // Force an incomplete coverage so the warning notice renders in preview.
      dataCoverage: {
        isComplete: false,
        storedDays: 4,
        expectedDays: 7,
        missingDays: 3,
      },
    },
    overview: {
      ...base.overview,
      spend: overview.spend,
      impressions: overview.impressions,
      clicks: overview.clicks,
      primaryResults: overview.primaryResults,
      primaryResultLabel: "Bookings",
      ctr: overviewCtr,
      cpc: overviewCpc,
      cpm: overview.impressions > 0 ? (overview.spend / overview.impressions) * 1000 : 0,
      costPerPrimaryResult: overview.primaryResults > 0 ? overview.spend / overview.primaryResults : null,
    },
    campaigns,
    byUmbrella,
    campaignUmbrellas: Array.from(UMBRELLAS),
    dailyTrend: stubDailyTrend("2026-05-17", "2026-05-23"),
    hierarchyLoading: { mode: "eager" as const, loadedLevels: ["campaign" as const] },
  };

  return (
    <DashboardClient
      // Preview-only stub data; cast to DashboardPayload to keep the
      // preview-scaffolding page out of strict structural checking.
      // Not used in any production code path.
      initialData={data as unknown as DashboardPayload}
      permissions={[]}
      initialPeriodCount={2}
    />
  );
}
