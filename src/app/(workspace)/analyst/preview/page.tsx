import { DashboardClient } from "@/components/dashboard-client";
import { emptyDashboardPayload, type PerformanceRow } from "@/lib/analytics";

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
  "VN Promotions (WKDS)",
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
    hierarchyLoading: { mode: "eager" as const, loadedLevels: ["campaign" as const] },
  };

  return (
    <DashboardClient
      initialData={data}
      permissions={[]}
      initialPeriodCount={2}
    />
  );
}
