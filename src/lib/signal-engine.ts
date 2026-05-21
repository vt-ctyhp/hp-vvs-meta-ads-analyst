/**
 * Signal engine — ranks daily decisions for the 3-room UI.
 *
 * Every 15 minutes the cron at /api/cron/signals calls `computeAndStoreSignals`
 * which:
 *   1. Loads enough analyst data to evaluate ~nine signal types.
 *   2. Builds candidate signals via pure deterministic rules (no LLM).
 *   3. Upserts the active set into `ai_signals`, soft-clearing expired rows.
 *
 * Three rules drive the design:
 *   - The engine never writes to Sales/ERP Core tables.
 *   - The engine is idempotent — running it twice in a row produces the same
 *     active set (modulo time-derived freshness fields).
 *   - The engine fails open: if one signal type's query throws, the others
 *     still compute and persist.
 *
 * Signal-engine output is read by `/api/signals?room=...` and rendered by the
 * Signal Strip component on each room.
 */

import {
  createAdsAnalystClient,
  getAdsAnalystEnvironment,
  withAdsAnalystEnvironment,
} from "./ads-analyst-db.ts";
import { buildAttentionItems, type AttentionItem } from "./attention-rules.ts";
import { fetchDashboardData } from "./analytics.ts";
import type { Json } from "./database.types.ts";
import { getSystemHealth } from "./system-health.ts";

// ── Types ────────────────────────────────────────────────────────────────────

export type SignalRoom = "optimize" | "convert" | "operate";

export type SignalSeverity = "info" | "warn" | "critical";

export type SignalType =
  | "scale_candidate"
  | "fatigue_kill"
  | "fatigue_watch"
  | "cost_spike"
  | "funnel_leak"
  | "unread_conversation"
  | "attribution_gap"
  | "capi_failure"
  | "sync_stall"
  | "backfill_stall"
  | "env_drift";

export type SignalEntityType =
  | "ad"
  | "ad_set"
  | "campaign"
  | "group"
  | "creative"
  | "funnel_step"
  | "conversation"
  | "conversion"
  | "sync"
  | "backfill"
  | "env";

export type SignalCandidate = {
  signal_type: SignalType;
  severity: SignalSeverity;
  room: SignalRoom;
  entity_type: SignalEntityType;
  entity_id: string | null;
  brand: string | null;
  title: string;
  summary: string | null;
  score: number;
  recommendation: string | null;
  payload: Record<string, unknown>;
  /** ISO timestamp. Null => never expires until dismissed or replaced. */
  expires_at: string | null;
};

export type ComputeResult = {
  environment: string;
  computed_at: string;
  total_candidates: number;
  upserted: number;
  expired: number;
  errors: { signal_type: string; message: string }[];
};

// ── Public entry ────────────────────────────────────────────────────────────

export async function computeAndStoreSignals(): Promise<ComputeResult> {
  const environment = getAdsAnalystEnvironment();
  const computed_at = new Date().toISOString();
  const errors: ComputeResult["errors"] = [];
  const candidates: SignalCandidate[] = [];

  // Each computeXxx helper is wrapped so a thrown error in one block does not
  // kill the rest.
  const blocks: Array<{ label: string; fn: () => Promise<SignalCandidate[]> }> = [
    { label: "optimize", fn: computeOptimizeSignals },
    { label: "convert_inbox", fn: computeInboxSignals },
    { label: "convert_attribution", fn: computeAttributionSignals },
    { label: "convert_funnel", fn: computeFunnelSignals },
    { label: "operate_pipelines", fn: computePipelineSignals },
    { label: "operate_health", fn: computeHealthSignals },
  ];

  for (const block of blocks) {
    try {
      const produced = await block.fn();
      candidates.push(...produced);
    } catch (error) {
      errors.push({
        signal_type: block.label,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const persisted = await persistSignals(candidates);
  const expired = await expireStaleSignals();

  return {
    environment,
    computed_at,
    total_candidates: candidates.length,
    upserted: persisted,
    expired,
    errors,
  };
}

// ── Optimize signals (creative + group performance) ──────────────────────────

async function computeOptimizeSignals(): Promise<SignalCandidate[]> {
  // Reuse the existing dashboard payload so we share the same primary KPI logic
  // and umbrella classification that the rest of the app trusts.
  const dashboard = await fetchDashboardData({ days: 30 });
  if (!dashboard?.overview) return [];

  const attentionItems = buildAttentionItems(dashboard);
  return attentionItems
    .map(attentionItemToSignal)
    .filter((c): c is SignalCandidate => c !== null);
}

function attentionItemToSignal(item: AttentionItem): SignalCandidate | null {
  // Pending is informational only; we don't persist it as an actionable signal.
  if (item.bucket === "pending") return null;

  const map: Record<
    Exclude<AttentionItem["bucket"], "pending">,
    {
      signal_type: SignalType;
      severity: SignalSeverity;
      score: number;
      recommendation: string;
    }
  > = {
    investigate: {
      signal_type: "cost_spike",
      severity: "critical",
      score: 92,
      recommendation: "Open in Optimize and confirm whether to pause or refresh.",
    },
    watch: {
      signal_type: "fatigue_watch",
      severity: "warn",
      score: 70,
      recommendation: "Watch cost per result for another 24h before acting.",
    },
    fix: {
      signal_type: "fatigue_kill",
      severity: "critical",
      score: 85,
      recommendation: "Refresh the creative or move spend to a fresher variant.",
    },
    scale: {
      signal_type: "scale_candidate",
      severity: "info",
      score: 60,
      recommendation: "Increase budget +20% and watch frequency for two days.",
    },
  };

  const mapping = map[item.bucket];
  if (!mapping) return null;

  return {
    signal_type: mapping.signal_type,
    severity: mapping.severity,
    room: "optimize",
    entity_type: item.entityType === "appointment" ? "funnel_step" : (item.entityType as SignalEntityType),
    entity_id: item.entityId,
    brand: null,
    title: `${item.entityName}: ${item.headline}`,
    summary: item.supporting,
    score: mapping.score,
    recommendation: mapping.recommendation,
    payload: { link_href: item.linkHref, bucket: item.bucket },
    // Optimize signals refresh on the next cron pass, so 1h expiry is enough.
    expires_at: hoursFromNow(1),
  };
}

// ── Convert signals: inbox, attribution, funnel ─────────────────────────────

async function computeInboxSignals(): Promise<SignalCandidate[]> {
  const client = createAdsAnalystClient("web");
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await client
    .from("meta_social_threads")
    .select("id, platform, thread_id, participant_name, snippet, unread_count, last_message_at, snoozed_until, read_at")
    .gt("unread_count", 0)
    .or(`snoozed_until.is.null,snoozed_until.lt.${new Date().toISOString()}`)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(50);

  if (error) throw new Error(`inbox query: ${error.message}`);

  const candidates: SignalCandidate[] = [];
  for (const thread of data ?? []) {
    const last = thread.last_message_at as string | null;
    if (!last) continue;
    if (last >= fourHoursAgo) continue; // recent — no signal yet

    const severity: SignalSeverity = last < twentyFourHoursAgo ? "critical" : "warn";
    const score = severity === "critical" ? 88 : 65;
    const ageHours = hoursBetween(last, new Date().toISOString());

    candidates.push({
      signal_type: "unread_conversation",
      severity,
      room: "convert",
      entity_type: "conversation",
      entity_id: String(thread.thread_id ?? thread.id),
      brand: null,
      title: `${thread.platform}: ${thread.participant_name ?? "Customer"} waiting ${formatAge(ageHours)}`,
      summary: thread.snippet?.slice?.(0, 140) ?? "",
      score,
      recommendation: "Open the conversation and draft a reply.",
      payload: {
        platform: thread.platform,
        thread_id: thread.thread_id,
        unread_count: thread.unread_count,
      },
      expires_at: hoursFromNow(1),
    });
  }

  return candidates;
}

async function computeAttributionSignals(): Promise<SignalCandidate[]> {
  const client = createAdsAnalystClient("web");
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await client
    .from("website_conversions")
    .select("event_id, occurred_at, fbp, fbc, last_paid_touch, meta_capi_status")
    .gte("occurred_at", sevenDaysAgo)
    .limit(500);

  if (error) throw new Error(`conversions query: ${error.message}`);

  let attributionGapCount = 0;
  let capiFailureCount = 0;
  let firstCapiFailure: { event_id: string | null; status: string | null } | null = null;
  let firstAttributionGap: { event_id: string | null; occurred_at: string | null } | null = null;

  for (const row of data ?? []) {
    const hasFbid = Boolean(row.fbp) || Boolean(row.fbc);
    const noLastPaid = row.last_paid_touch == null;
    if (hasFbid && noLastPaid) {
      attributionGapCount += 1;
      if (!firstAttributionGap) {
        firstAttributionGap = {
          event_id: row.event_id ?? null,
          occurred_at: row.occurred_at ?? null,
        };
      }
    }
    if (row.meta_capi_status === "failed" || row.meta_capi_status === "error") {
      capiFailureCount += 1;
      if (!firstCapiFailure) {
        firstCapiFailure = {
          event_id: row.event_id ?? null,
          status: row.meta_capi_status ?? null,
        };
      }
    }
  }

  const candidates: SignalCandidate[] = [];

  if (attributionGapCount > 0) {
    candidates.push({
      signal_type: "attribution_gap",
      severity: attributionGapCount >= 5 ? "warn" : "info",
      room: "convert",
      entity_type: "conversion",
      entity_id: firstAttributionGap?.event_id ?? null,
      brand: null,
      title: `${attributionGapCount} booking${attributionGapCount === 1 ? "" : "s"} missing paid touch`,
      summary: "Visitor had fbp/fbc but no paid-touch attribution stamped on the conversion.",
      score: Math.min(40 + attributionGapCount * 4, 80),
      recommendation: "Verify UTM stripping in the booking redirect; backfill via attribution-resolve.",
      payload: {
        count: attributionGapCount,
        sample_event_id: firstAttributionGap?.event_id,
      },
      expires_at: hoursFromNow(6),
    });
  }

  if (capiFailureCount > 0) {
    candidates.push({
      signal_type: "capi_failure",
      severity: "critical",
      room: "convert",
      entity_type: "conversion",
      entity_id: firstCapiFailure?.event_id ?? null,
      brand: null,
      title: `${capiFailureCount} CAPI event${capiFailureCount === 1 ? "" : "s"} failed last 24h`,
      summary: "Meta Conversion API rejected events. Retries may have already fired; investigate.",
      score: Math.min(70 + capiFailureCount, 95),
      recommendation: "Check Meta CAPI test events tab; replay failed conversions.",
      payload: {
        count: capiFailureCount,
        sample_event_id: firstCapiFailure?.event_id,
        sample_status: firstCapiFailure?.status,
      },
      expires_at: hoursFromNow(2),
    });
  }

  return candidates;
}

async function computeFunnelSignals(): Promise<SignalCandidate[]> {
  const client = createAdsAnalystClient("web");
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await client
    .from("website_events")
    .select("event_name, occurred_at, page_group, session_id")
    .gte("occurred_at", fourteenDaysAgo)
    .in("event_name", ["PageView", "EngagedSession", "BookingStart", "Schedule"])
    .limit(20000);

  if (error) throw new Error(`funnel query: ${error.message}`);

  const stepCounts: Record<string, { recent: Set<string>; prior: Set<string> }> = {
    PageView: { recent: new Set(), prior: new Set() },
    EngagedSession: { recent: new Set(), prior: new Set() },
    BookingStart: { recent: new Set(), prior: new Set() },
    Schedule: { recent: new Set(), prior: new Set() },
  };

  for (const row of data ?? []) {
    const bucket = (row.occurred_at as string) >= sevenDaysAgo ? "recent" : "prior";
    const name = row.event_name as keyof typeof stepCounts;
    if (!stepCounts[name]) continue;
    if (row.session_id) stepCounts[name][bucket].add(String(row.session_id));
  }

  const candidates: SignalCandidate[] = [];
  const order: Array<keyof typeof stepCounts> = [
    "PageView",
    "EngagedSession",
    "BookingStart",
    "Schedule",
  ];

  for (let i = 1; i < order.length; i++) {
    const prev = order[i - 1];
    const here = order[i];
    const recentRate = rate(stepCounts[here].recent.size, stepCounts[prev].recent.size);
    const priorRate = rate(stepCounts[here].prior.size, stepCounts[prev].prior.size);
    if (recentRate == null || priorRate == null) continue;
    if (priorRate <= 0) continue;

    const delta = (recentRate - priorRate) / priorRate;
    if (delta >= -0.15) continue; // shrinking conversion = leak

    candidates.push({
      signal_type: "funnel_leak",
      severity: delta <= -0.3 ? "critical" : "warn",
      room: "convert",
      entity_type: "funnel_step",
      entity_id: `${prev}->${here}`,
      brand: null,
      title: `${prev} → ${here} conversion down ${formatPct(Math.abs(delta) * 100)} w/w`,
      summary: `Recent ${formatPct(recentRate * 100)} vs prior ${formatPct(priorRate * 100)} on ${stepCounts[prev].recent.size} sessions.`,
      score: Math.min(50 + Math.round(Math.abs(delta) * 100), 95),
      recommendation:
        "Inspect the funnel step page for recent changes (copy, form, redirect).",
      payload: {
        step_from: prev,
        step_to: here,
        recent_rate: recentRate,
        prior_rate: priorRate,
      },
      expires_at: hoursFromNow(12),
    });
  }

  return candidates;
}

// ── Operate signals: sync, backfill, env ────────────────────────────────────

async function computePipelineSignals(): Promise<SignalCandidate[]> {
  const client = createAdsAnalystClient("web");

  const { data: lastSync, error: syncErr } = await client
    .from("sync_runs")
    .select("id, status, started_at, completed_at, trigger")
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(1);
  if (syncErr) throw new Error(`sync_runs query: ${syncErr.message}`);

  const candidates: SignalCandidate[] = [];
  const newest = lastSync?.[0];
  if (newest && newest.started_at) {
    const ageHours = hoursBetween(String(newest.started_at), new Date().toISOString());
    if (ageHours >= 30) {
      candidates.push({
        signal_type: "sync_stall",
        severity: "critical",
        room: "operate",
        entity_type: "sync",
        entity_id: String(newest.id),
        brand: null,
        title: `Last Meta sync was ${formatAge(ageHours)} ago`,
        summary: `Trigger: ${newest.trigger ?? "unknown"}. Status: ${newest.status ?? "unknown"}.`,
        score: 90,
        recommendation: "Trigger a manual sync from Operate → Pipelines.",
        payload: { sync_id: newest.id, trigger: newest.trigger, status: newest.status },
        expires_at: hoursFromNow(1),
      });
    }
  }

  const { data: failedChunks, error: chunkErr } = await client
    .from("meta_ads_backfill_chunks")
    .select("id, job_id, start_date, end_date, status, attempts, error")
    .eq("status", "failed")
    .gte("attempts", 3)
    .order("end_date", { ascending: false, nullsFirst: false })
    .limit(20);
  if (chunkErr) throw new Error(`backfill chunks query: ${chunkErr.message}`);

  if ((failedChunks?.length ?? 0) > 0) {
    const sample = failedChunks![0];
    candidates.push({
      signal_type: "backfill_stall",
      severity: failedChunks!.length >= 5 ? "critical" : "warn",
      room: "operate",
      entity_type: "backfill",
      entity_id: String(sample.id),
      brand: null,
      title: `${failedChunks!.length} backfill chunk${failedChunks!.length === 1 ? "" : "s"} stalled`,
      summary: `Sample: ${sample.start_date} → ${sample.end_date}, ${sample.attempts} attempts.`,
      score: Math.min(60 + failedChunks!.length * 3, 92),
      recommendation: "Inspect the chunk in Operate → Pipelines and retry or cancel.",
      payload: {
        sample_chunk_id: sample.id,
        sample_job_id: sample.job_id,
        sample_attempts: sample.attempts,
        sample_error: (sample.error as string | null) ?? null,
      },
      expires_at: hoursFromNow(6),
    });
  }

  return candidates;
}

async function computeHealthSignals(): Promise<SignalCandidate[]> {
  const candidates: SignalCandidate[] = [];

  try {
    const health = await getSystemHealth();
    const issues = collectHealthIssues(health);
    for (const issue of issues) {
      candidates.push({
        signal_type: "env_drift",
        severity: issue.severity,
        room: "operate",
        entity_type: "env",
        entity_id: issue.id,
        brand: null,
        title: issue.title,
        summary: issue.summary,
        score: issue.score,
        recommendation: issue.recommendation,
        payload: { issue_id: issue.id },
        expires_at: hoursFromNow(2),
      });
    }
  } catch (error) {
    // Health calls into Meta API; failures here are themselves a signal.
    candidates.push({
      signal_type: "env_drift",
      severity: "warn",
      room: "operate",
      entity_type: "env",
      entity_id: "health-check",
      brand: null,
      title: "System health check failed",
      summary: error instanceof Error ? error.message : String(error),
      score: 50,
      recommendation: "Open Operate → Health and investigate.",
      payload: {},
      expires_at: hoursFromNow(1),
    });
  }

  return candidates;
}

function collectHealthIssues(health: unknown): Array<{
  id: string;
  severity: SignalSeverity;
  title: string;
  summary: string;
  score: number;
  recommendation: string;
}> {
  // System health shape varies; we treat it as opaque and pluck known fields.
  const issues: Array<{
    id: string;
    severity: SignalSeverity;
    title: string;
    summary: string;
    score: number;
    recommendation: string;
  }> = [];

  if (!health || typeof health !== "object") return issues;
  const h = health as Record<string, unknown>;

  if (Array.isArray(h.missingEnv) && h.missingEnv.length > 0) {
    issues.push({
      id: "missing-env",
      severity: "critical",
      title: `${h.missingEnv.length} required env var${h.missingEnv.length === 1 ? "" : "s"} missing`,
      summary: h.missingEnv.join(", "),
      score: 95,
      recommendation: "Add the missing env vars in Vercel and redeploy.",
    });
  }

  if (h.meta && typeof h.meta === "object") {
    const meta = h.meta as Record<string, unknown>;
    if (meta.ok === false) {
      issues.push({
        id: "meta-readiness",
        severity: "critical",
        title: "Meta API readiness failed",
        summary: typeof meta.readiness === "string" ? meta.readiness : "Token or account permission gap.",
        score: 90,
        recommendation: "Confirm the Meta token still has ads_read and no ads_management.",
      });
    }
  }

  return issues;
}

// ── Persistence ─────────────────────────────────────────────────────────────

async function persistSignals(candidates: SignalCandidate[]): Promise<number> {
  if (candidates.length === 0) return 0;
  const client = createAdsAnalystClient("worker");

  // The active-uniqueness partial index lets us upsert idempotently as long as
  // we feed the conflict columns explicitly. Where multiple computes produce
  // duplicates within one batch, the .upsert call collapses them.
  const rows = candidates.map((c) => {
    return withAdsAnalystEnvironment({
      signal_type: c.signal_type,
      severity: c.severity,
      room: c.room,
      entity_type: c.entity_type,
      entity_id: c.entity_id ?? "",
      brand: c.brand,
      title: c.title,
      summary: c.summary,
      score: c.score,
      recommendation: c.recommendation,
      payload: c.payload as Json,
      expires_at: c.expires_at,
    });
  });

  // Use the unique partial index columns. Note: PostgREST upsert requires the
  // conflict target to match a unique constraint. The partial unique index in
  // the migration matches (environment, signal_type, entity_type, entity_id).
  const { error, count } = await client
    .from("ai_signals")
    .upsert(rows, {
      onConflict: "environment,signal_type,entity_type,entity_id",
      ignoreDuplicates: false,
      count: "exact",
    });

  if (error) throw new Error(`ai_signals upsert: ${error.message}`);
  return count ?? rows.length;
}

async function expireStaleSignals(): Promise<number> {
  const client = createAdsAnalystClient("worker");
  const now = new Date().toISOString();
  const { error, data } = await client
    .from("ai_signals")
    .update({ dismissed_at: now })
    .lt("expires_at", now)
    .is("dismissed_at", null)
    .select("id");

  if (error) throw new Error(`ai_signals expire: ${error.message}`);
  return data?.length ?? 0;
}

// ── Read paths used by API routes ───────────────────────────────────────────

export async function listActiveSignalsForRoom(
  room: SignalRoom,
  limit: number = 25,
) {
  const client = createAdsAnalystClient("web");
  const { data, error } = await client
    .from("ai_signals")
    .select(
      "id, signal_type, severity, room, entity_type, entity_id, brand, title, summary, score, recommendation, payload, expires_at, created_at, updated_at",
    )
    .eq("room", room)
    .is("dismissed_at", null)
    .order("severity", { ascending: true })
    .order("score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`ai_signals list: ${error.message}`);
  return data ?? [];
}

export async function dismissSignal(id: string, userId: string | null) {
  const client = createAdsAnalystClient("web");
  const { error } = await client
    .from("ai_signals")
    .update({ dismissed_at: new Date().toISOString(), dismissed_by: userId })
    .eq("id", id)
    .is("dismissed_at", null);

  if (error) throw new Error(`ai_signals dismiss: ${error.message}`);
}

export async function recordSignalAct(id: string, userId: string | null) {
  const client = createAdsAnalystClient("web");
  // Increment acted_count using an RPC would be ideal; fallback: select then update.
  const { data, error: selectErr } = await client
    .from("ai_signals")
    .select("acted_count")
    .eq("id", id)
    .limit(1)
    .single();
  if (selectErr) throw new Error(`ai_signals act fetch: ${selectErr.message}`);

  const next = (data?.acted_count ?? 0) + 1;
  const { error } = await client
    .from("ai_signals")
    .update({ acted_count: next, acted_at: new Date().toISOString(), acted_by: userId })
    .eq("id", id);

  if (error) throw new Error(`ai_signals act: ${error.message}`);
}

// ── tiny utils ──────────────────────────────────────────────────────────────

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function hoursBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, (to - from) / (60 * 60 * 1000));
}

function rate(num: number, denom: number): number | null {
  if (denom <= 0) return null;
  return num / denom;
}

function formatPct(value: number): string {
  return `${value.toFixed(0)}%`;
}

function formatAge(hours: number): string {
  if (hours < 1) return "under an hour";
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}
