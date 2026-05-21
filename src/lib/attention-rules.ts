/**
 * "What Needs Attention" rule engine for the Executive Snapshot.
 *
 * Pure deterministic function over the dashboard payload. Same inputs in,
 * same items out. No LLM call. Same rules every render so the executive
 * landing is trustworthy and reviewable.
 *
 * Rules (per v1 spec):
 *   Scale       — umbrella whose primary KPI count Δ ≥ +20% AND cost/result
 *                 Δ ≤ 0% AND has spent ≥ 1% of total period spend.
 *   Watch       — umbrella whose cost/result Δ ≥ +15% AND spend Δ ≥ 0%
 *                 ("spending more, getting less").
 *   Investigate — umbrella whose cost/result Δ ≥ +30%, regardless of spend
 *                 direction.
 *   Fix         — single highest-spend fatigue-risk creative (from existing
 *                 fatigue detection).
 *   Pending     — placeholder for v1.5 (counts of un-tagged appointments).
 *                 Always 0 in v1; rendered disabled on the surface.
 *
 * Each item carries an `linkHref` so the surface doesn't have to guess where
 * a click lands. Today every link goes into /analyst with the right filter
 * pre-seeded — DashboardClient reads ?umbrella= and ?query= on mount.
 *
 * The output is capped at MAX_ITEMS and prioritized by severity:
 * Investigate > Watch > Fix > Scale > Pending.
 *
 * Thresholds are kept in this file as constants so they can be tuned in one
 * place without touching the call sites or component code.
 */

import type { DashboardPayload, PerformanceRow } from "./analytics";

export type AttentionBucket = "scale" | "watch" | "investigate" | "fix" | "pending";

export type AttentionEntityType = "umbrella" | "creative" | "appointment";

export type AttentionItem = {
  id: string;
  bucket: AttentionBucket;
  entityType: AttentionEntityType;
  entityId: string;
  entityName: string;
  /** One-line plain-English description of what's happening. */
  headline: string;
  /** Supporting metric line (tabular nums, more technical). */
  supporting: string;
  /** Where a click should land. Always populated for clickable items. */
  linkHref: string;
};

// ── Tunable thresholds (one place) ────────────────────────────────────────
const SCALE_RESULTS_DELTA_PCT = 20;
const SCALE_MIN_SPEND_SHARE_PCT = 1;
const WATCH_COST_DELTA_PCT = 15;
const INVESTIGATE_COST_DELTA_PCT = 30;

const MAX_ITEMS = 5;
const BUCKET_PRIORITY: Record<AttentionBucket, number> = {
  investigate: 0,
  watch: 1,
  fix: 2,
  scale: 3,
  pending: 4,
};

export function buildAttentionItems(data: DashboardPayload): AttentionItem[] {
  const items: AttentionItem[] = [];

  const totalSpend = data.byUmbrella.reduce((sum, row) => sum + row.spend, 0);
  const priorByUmbrellaId = new Map(
    data.comparison.byUmbrella.map((row) => [row.id, row]),
  );

  // Umbrella-level Δ rules — investigate, watch, scale
  for (const umbrella of data.byUmbrella) {
    const prior = priorByUmbrellaId.get(umbrella.id);
    if (!prior) continue;

    const spendDelta = percentChange(umbrella.spend, prior.spend);
    const resultsDelta = percentChange(
      umbrella.primaryResults,
      prior.primaryResults,
    );
    const costDelta = percentChange(
      umbrella.costPerPrimaryResult,
      prior.costPerPrimaryResult,
    );
    const spendShare = totalSpend > 0 ? (umbrella.spend / totalSpend) * 100 : 0;

    // Investigate fires hardest — surface first.
    if (costDelta != null && costDelta >= INVESTIGATE_COST_DELTA_PCT) {
      items.push(
        umbrellaItem({
          umbrella,
          bucket: "investigate",
          headline: `Cost per result up sharply (${roundPct(costDelta)}%)`,
          supporting: supportingForUmbrella(umbrella, prior, {
            spendDelta,
            resultsDelta,
            costDelta,
          }),
        }),
      );
      continue;
    }

    // Watch: spending more (or flat) but cost climbing
    if (
      costDelta != null &&
      costDelta >= WATCH_COST_DELTA_PCT &&
      (spendDelta ?? 0) >= 0
    ) {
      items.push(
        umbrellaItem({
          umbrella,
          bucket: "watch",
          headline: `Cost per result up ${roundPct(costDelta)}% on ${spendDelta != null ? (spendDelta > 0 ? `+${roundPct(spendDelta)}% spend` : "flat spend") : "spend"}`,
          supporting: supportingForUmbrella(umbrella, prior, {
            spendDelta,
            resultsDelta,
            costDelta,
          }),
        }),
      );
      continue;
    }

    // Scale: meaningful slice of spend, results up sharply, cost flat or down.
    if (
      resultsDelta != null &&
      resultsDelta >= SCALE_RESULTS_DELTA_PCT &&
      (costDelta == null || costDelta <= 0) &&
      spendShare >= SCALE_MIN_SPEND_SHARE_PCT
    ) {
      items.push(
        umbrellaItem({
          umbrella,
          bucket: "scale",
          headline: `Primary KPI up ${roundPct(resultsDelta)}% on ${costDelta == null ? "no prior cost" : costDelta < 0 ? `${roundPct(Math.abs(costDelta))}% cheaper cost per result` : "flat cost per result"}`,
          supporting: supportingForUmbrella(umbrella, prior, {
            spendDelta,
            resultsDelta,
            costDelta,
          }),
        }),
      );
    }
  }

  // Fix: top fatigue-risk creative from existing fatigue detection
  const topFatigue = pickTopFatigueRisk(data);
  if (topFatigue) {
    items.push({
      id: `fix:${topFatigue.id}`,
      bucket: "fix",
      entityType: "creative",
      entityId: topFatigue.id,
      entityName: topFatigue.name,
      headline: topFatigue.riskReason || "Fatigue signal detected",
      supporting: `${formatMoney(topFatigue.spend)} spend · CTR ${topFatigue.ctr.toFixed(2)}% · frequency ${topFatigue.frequency.toFixed(2)}x`,
      linkHref: `/analyst?query=${encodeURIComponent(topFatigue.name)}`,
    });
  }

  // Pending: v1.5 stub — always 0 in v1, surfaced as a non-actionable hint
  // so the user can see the workflow that's coming.
  items.push({
    id: "pending:v1.5",
    bucket: "pending",
    entityType: "appointment",
    entityId: "v1.5",
    entityName: "Appointment reviews",
    headline: "Outcome review queue — coming in v1.5",
    supporting:
      "Sales will tag completed appointments so Scale recommendations reflect actual closed sales, not just bookings.",
    linkHref: "/review",
  });

  // Sort by bucket priority, then by impact-ish proxy (headline length is a
  // rough but harmless tiebreak — keeps order stable).
  items.sort((a, b) => {
    const priorityDelta = BUCKET_PRIORITY[a.bucket] - BUCKET_PRIORITY[b.bucket];
    if (priorityDelta !== 0) return priorityDelta;
    return a.entityName.localeCompare(b.entityName);
  });

  return items.slice(0, MAX_ITEMS);
}

// ── helpers ────────────────────────────────────────────────────────────────

function umbrellaItem({
  umbrella,
  bucket,
  headline,
  supporting,
}: {
  umbrella: PerformanceRow;
  bucket: AttentionBucket;
  headline: string;
  supporting: string;
}): AttentionItem {
  return {
    id: `${bucket}:${umbrella.id}`,
    bucket,
    entityType: "umbrella",
    entityId: umbrella.id,
    entityName: umbrella.name,
    headline,
    supporting,
    linkHref: `/analyst?umbrella=${encodeURIComponent(umbrella.name)}`,
  };
}

function supportingForUmbrella(
  current: PerformanceRow,
  prior: PerformanceRow,
  deltas: {
    spendDelta: number | null;
    resultsDelta: number | null;
    costDelta: number | null;
  },
): string {
  const parts: string[] = [
    `Spend ${formatMoney(current.spend)}${formatDelta(deltas.spendDelta)}`,
    `${current.primaryResults} ${current.primaryResultLabel.toLowerCase()}${formatDelta(
      deltas.resultsDelta,
    )}`,
    `Cost/result ${current.costPerPrimaryResult == null ? "—" : formatMoneyCents(current.costPerPrimaryResult)}${formatDelta(
      deltas.costDelta,
    )}`,
  ];
  if (prior) parts.push(`(prior spend ${formatMoney(prior.spend)})`);
  return parts.join(" · ");
}

function pickTopFatigueRisk(data: DashboardPayload): PerformanceRow | undefined {
  if (!data.fatigueRisks || data.fatigueRisks.length === 0) return undefined;
  return [...data.fatigueRisks].sort((a, b) => b.spend - a.spend)[0];
}

function percentChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  if (!Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function roundPct(value: number): number {
  return Math.round(Math.abs(value));
}

function formatDelta(value: number | null): string {
  if (value == null) return "";
  if (Math.abs(value) < 1) return " (flat)";
  const arrow = value > 0 ? "▲" : "▼";
  return ` ${arrow}${roundPct(value)}%`;
}

const MONEY_WHOLE = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const MONEY_CENTS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function formatMoney(value: number): string {
  return MONEY_WHOLE.format(value);
}
function formatMoneyCents(value: number): string {
  return MONEY_CENTS.format(value);
}
