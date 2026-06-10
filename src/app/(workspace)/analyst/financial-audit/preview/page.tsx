import { FinancialAuditView } from "@/components/v2/analyst/financial-audit-view";
import { StatusSentence } from "@/components/v2/status-sentence";
import {
  buildAuditPeriods,
  buildAuditSentence,
  buildAuditTotals,
  classifyAuditStatus,
  parseAuditTimeframe,
  auditRangeForTimeframe,
  periodKeysForRange,
  type AuditSourceRow,
  type AuditTimeframe,
} from "@/lib/financial-audit";
import type { AuditCampaignRow, FinancialAuditPayload } from "@/lib/financial-audit-data";

export const dynamic = "force-dynamic";

/**
 * Design-preview route, same convention as /analyst/preview. Feeds the
 * financial audit view a deterministic stub payload so the page renders
 * without Supabase or Meta credentials.
 *
 * Not linked from anywhere. Visit /analyst/financial-audit/preview?view=weekly.
 */

const LATEST = "2026-06-09";

const CAMPAIGN_FIXTURES = [
  { campaign: "HP — Book Appts US", dailyBudget: 180, dailySpend: 184 },
  { campaign: "VVS — Facebook US Product", dailyBudget: 120, dailySpend: 96 },
  { campaign: "HP — US Promotions (WKDS / OOAK)", dailyBudget: 60, dailySpend: 71 },
  { campaign: "HP — Cash for Gold US", dailyBudget: 0, dailySpend: 18 },
];

export default async function FinancialAuditPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const timeframe = parseAuditTimeframe(
    Array.isArray(params.view) ? params.view[0] : params.view,
  );
  const payload = stubPayload(timeframe);

  return (
    <div className="space-y-6">
      <StatusSentence sentence={payload.sentence} />
      <FinancialAuditView payload={payload} />
    </div>
  );
}

function stubPayload(timeframe: AuditTimeframe): FinancialAuditPayload {
  const range = auditRangeForTimeframe(timeframe, LATEST);
  const keys = periodKeysForRange(timeframe, range);
  const dailyBudget = CAMPAIGN_FIXTURES.reduce((sum, c) => sum + c.dailyBudget, 0);

  const days = timeframe === "daily" ? 1 : timeframe === "weekly" ? 7 : 30;
  const rows: AuditSourceRow[] = keys.map((periodKey, index) => ({
    periodKey,
    // Vary spend deterministically around budget so every status appears.
    spend: dailyBudget * days * (0.78 + ((index * 7) % 5) * 0.09),
    dailyBudget: index === 1 ? 0 : dailyBudget,
  }));

  const periods = buildAuditPeriods(timeframe, range, rows);
  const totals = buildAuditTotals(periods);
  const currentPeriod = periods[periods.length - 1] ?? null;
  const currentDays = currentPeriod?.daysCovered ?? 0;

  const campaigns: AuditCampaignRow[] = CAMPAIGN_FIXTURES.map((fixture, index) => {
    const budget = fixture.dailyBudget * currentDays;
    const spend = Math.round(fixture.dailySpend * currentDays * 100) / 100;
    return {
      campaignId: `stub-${index}`,
      campaign: fixture.campaign,
      spend,
      budget,
      variance: Math.round((spend - budget) * 100) / 100,
      status: classifyAuditStatus(spend, budget),
    };
  });

  return {
    timeframe,
    range,
    latestSyncedDate: LATEST,
    sentence: buildAuditSentence(timeframe, totals),
    periods,
    totals,
    currentPeriod,
    campaigns,
  };
}
