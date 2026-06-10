import { FinancialAuditView } from "@/components/v2/analyst/financial-audit-view";
import { StatusSentence } from "@/components/v2/status-sentence";
import { parseAuditTimeframe } from "@/lib/financial-audit";
import { loadFinancialAudit } from "@/lib/financial-audit-data";
import { requirePagePermission } from "@/lib/server-route-auth";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function FinancialAuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePagePermission("view_dashboard", "/analyst/financial-audit");
  const params = await searchParams;
  const timeframe = parseAuditTimeframe(
    Array.isArray(params.view) ? params.view[0] : params.view,
  );
  const payload = await loadFinancialAudit(timeframe).catch(() => null);

  if (!payload) {
    return (
      <div className="space-y-6">
        <StatusSentence sentence="No synced Meta charges to audit yet." />
        <p className="border border-signal-danger bg-signal-danger-bg px-5 py-4 text-sm text-signal-danger">
          Financial audit unavailable. Charges appear here once Meta daily insights have synced.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StatusSentence
        sentence={payload.sentence}
        metrics={[
          { label: "Charged", value: usd(payload.totals.spend) },
          { label: "Budgeted", value: usd(payload.totals.budget) },
          {
            label: "Variance",
            value: payload.totals.budget > 0 ? signedUsd(payload.totals.variance) : "—",
          },
        ]}
      />
      <FinancialAuditView payload={payload} />
    </div>
  );
}

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function usd(value: number): string {
  return USD.format(value);
}

function signedUsd(value: number): string {
  if (value > 0) return `+${USD.format(value)}`;
  if (value < 0) return `-${USD.format(Math.abs(value))}`;
  return USD.format(0);
}
