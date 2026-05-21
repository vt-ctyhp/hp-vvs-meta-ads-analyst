/**
 * Pure trigger logic for the `sync_stall` signal.
 *
 * Pulled out of signal-engine.ts into a zero-dependency leaf module so the
 * node:test --experimental-strip-types runner can import it without
 * resolving the Next.js alias graph.
 *
 * Single source of truth for the three distinct sync-failure modes:
 *   A) `no_recent_attempt` — no run started in 30h+. Operator forgot, or
 *      the cron is dead.
 *   B) `consecutive_failures` — ≥3 non-success runs in a row at the head
 *      of the recent window. Sync is being driven, but every attempt fails.
 *   C) `last_success_old` — newest run failed/partial and the last full
 *      success is ≥12h ago. Covers "running but never landing" partials.
 */

export type StallTrigger =
  | { kind: "no_recent_attempt"; ageHours: number }
  | {
      kind: "consecutive_failures";
      count: number;
      lastSuccessAgeHours: number;
    }
  | {
      kind: "last_success_old";
      lastSuccessAgeHours: number;
      newestStatus: string;
    };

type SyncRunRowLike = {
  status?: unknown;
  started_at?: unknown;
};

/**
 * Decide whether the recent sync window indicates a stall. Returns the most
 * informative trigger (A > B > C) or null when the pipeline looks healthy.
 *
 * `rows` MUST be ordered newest-first.
 * `now` is parameterized so tests can run without time mocks.
 */
export function evaluateSyncStall(
  rows: SyncRunRowLike[],
  now: Date = new Date(),
): StallTrigger | null {
  const newest = rows[0];
  if (!newest?.started_at) return null;

  const startedAt =
    typeof newest.started_at === "string" ? newest.started_at : null;
  if (!startedAt) return null;

  const newestAgeHours = hoursBetween(startedAt, now.toISOString());
  const lastSuccess = rows.find(
    (row) => typeof row.status === "string" && row.status === "success",
  );
  const lastSuccessStarted =
    lastSuccess && typeof lastSuccess.started_at === "string"
      ? lastSuccess.started_at
      : null;
  const lastSuccessAgeHours = lastSuccessStarted
    ? hoursBetween(lastSuccessStarted, now.toISOString())
    : Number.POSITIVE_INFINITY;

  // A) No attempts in 30h. Most severe — supersedes anything else.
  if (newestAgeHours >= 30) {
    return { kind: "no_recent_attempt", ageHours: newestAgeHours };
  }

  const consecutiveFailures = consecutiveFailureCount(rows);

  // B) ≥3 consecutive failures (success anywhere in the window resets the
  //    streak — see consecutiveFailureCount).
  if (consecutiveFailures >= 3) {
    return {
      kind: "consecutive_failures",
      count: consecutiveFailures,
      lastSuccessAgeHours,
    };
  }

  // C) Newest run is failed/partial and the last full success is stale.
  const newestStatus =
    typeof newest.status === "string" ? newest.status : "";
  if (
    (newestStatus === "failed" || newestStatus === "partial") &&
    lastSuccessAgeHours >= 12
  ) {
    return {
      kind: "last_success_old",
      lastSuccessAgeHours,
      newestStatus,
    };
  }

  return null;
}

/**
 * Count the run of non-success rows at the head of the list. `running` /
 * unknown rows are inconclusive — they neither extend nor break the streak
 * — so an in-flight attempt doesn't mask a preceding string of failures.
 */
export function consecutiveFailureCount(rows: SyncRunRowLike[]): number {
  let count = 0;
  for (const row of rows) {
    const status = typeof row.status === "string" ? row.status : "";
    if (status === "success") return count;
    if (status === "failed" || status === "partial") {
      count += 1;
      continue;
    }
    // Unknown / running rows: skip without resetting.
  }
  return count;
}

export function stallTitle(trigger: StallTrigger): string {
  switch (trigger.kind) {
    case "no_recent_attempt":
      return `No Meta sync attempt in ${formatAge(trigger.ageHours)}`;
    case "consecutive_failures":
      return `Meta sync failing — ${trigger.count} runs in a row`;
    case "last_success_old":
      return `Meta sync trying but not landing — last success ${formatAge(trigger.lastSuccessAgeHours)} ago`;
  }
}

export function stallSummary(
  trigger: StallTrigger,
  newest: { trigger?: unknown; status?: unknown } | null,
): string {
  const ctx = `Trigger: ${
    typeof newest?.trigger === "string" ? newest.trigger : "unknown"
  }. Status: ${typeof newest?.status === "string" ? newest.status : "unknown"}.`;
  switch (trigger.kind) {
    case "no_recent_attempt":
      return ctx;
    case "consecutive_failures": {
      const tail = Number.isFinite(trigger.lastSuccessAgeHours)
        ? ` Last success ${formatAge(trigger.lastSuccessAgeHours)} ago.`
        : " No success on record in the recent window.";
      return ctx + tail;
    }
    case "last_success_old":
      return ctx;
  }
}

function hoursBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, (to - from) / (60 * 60 * 1000));
}

function formatAge(hours: number): string {
  if (!Number.isFinite(hours)) return "an unknown duration";
  if (hours < 1) return "under an hour";
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}
