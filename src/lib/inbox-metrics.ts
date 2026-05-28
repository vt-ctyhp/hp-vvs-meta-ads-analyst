import {
  CALIFORNIA_BUSINESS_WINDOW,
  businessSecondsBetween,
  businessSecondsRemainingUntil,
  breachAt,
  todaysWindow,
  yesterdaysWindow,
  type BusinessWindow,
} from "./business-hours.ts";
export const SLA_BUSINESS_SECONDS = 3 * 3600; // 10800
export const AT_RISK_REMAINING_SECONDS = 1800; // 30 min
export const DEFAULT_BUSINESS_WINDOW: BusinessWindow = CALIFORNIA_BUSINESS_WINDOW;

export type Period = "today" | "yesterday" | "7d" | "30d";

export type QueueCategoryWindowRow = {
  key: string;
  timezone: string | null;
  business_hours_start: string | null; // "HH:MM:SS"
  business_hours_end: string | null;
};

export type QueueWindowMap = Map<string, BusinessWindow>;

export type PersonalHeaderMetrics = {
  windowState: "before_hours" | "open" | "after_hours";
  user: { id: string; timezone: string; businessSecondsRemainingToday: number };
  pipeline: { assigned: number; needsReply: number; atRisk: number };
  today: { avgResponseSec: number | null; onTimeRate: number | null; repliesSent: number };
  yesterday: { avgResponseSec: number | null };
  team: {
    unassigned: number;
    claimedByMe: number;
    todayUnassignedDenominator: number;
    oldestUnassignedSec: number | null;
    teammatesOverSla?: number;
  };
};

export type TeamRow = {
  userId: string;
  name: string;
  role: string;
  assigned: number;
  needsReply: number;
  atRisk: number;
  avgResponseSec: number | null;
  onTimeRate: number | null;
  repliesSent: number;
  teamClaims: number;
  oldestUnansweredSec: number | null;
  lastActiveAt: Date | null;
};

export type TeamRollup = { period: Period; teamName: string; rows: TeamRow[] };

function hourFromTime(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const hour = Number(value.split(":")[0]);
  return Number.isFinite(hour) ? hour : fallback;
}

export function buildQueueWindowMap(rows: QueueCategoryWindowRow[]): QueueWindowMap {
  const map: QueueWindowMap = new Map();
  for (const row of rows) {
    map.set(row.key, {
      tz: row.timezone || DEFAULT_BUSINESS_WINDOW.tz,
      startHour: hourFromTime(row.business_hours_start, DEFAULT_BUSINESS_WINDOW.startHour),
      endHour: hourFromTime(row.business_hours_end, DEFAULT_BUSINESS_WINDOW.endHour),
    });
  }
  return map;
}

export function getQueueWindow(map: QueueWindowMap, key: string | null | undefined): BusinessWindow {
  return (key && map.get(key)) || DEFAULT_BUSINESS_WINDOW;
}

export function resolveUserWindow(timezone: string | null | undefined): BusinessWindow {
  if (!timezone) return DEFAULT_BUSINESS_WINDOW;
  return { tz: timezone, startHour: DEFAULT_BUSINESS_WINDOW.startHour, endHour: DEFAULT_BUSINESS_WINDOW.endHour };
}

// Re-export the business-hours fns the compute layer uses, so tests import
// everything from one module.
export { businessSecondsBetween, businessSecondsRemainingUntil, breachAt, todaysWindow, yesterdaysWindow };

// ─── A1/A2/A3 Pipeline metrics (pure compute) ────────────────────────────────

const CLOSED_STATUSES = new Set(["closed", "lost_lead"]);

export type ConversationLike = {
  id: string;
  assigned_user_id: string | null;
  conversation_status: string;
  needs_reply: boolean;
  latest_inbound_at: string | null;
  first_inbound_at: string | null;
  queue_category_key: string;
};

export function isOpenConversation(c: ConversationLike): boolean {
  return !CLOSED_STATUSES.has(c.conversation_status);
}

export function computePipelineMetrics(
  conversations: ConversationLike[],
  userId: string,
  now: Date,
  queueWindows: QueueWindowMap,
): { assigned: number; needsReply: number; atRisk: number } {
  let assigned = 0;
  let needsReply = 0;
  let atRisk = 0;

  for (const c of conversations) {
    if (c.assigned_user_id !== userId || !isOpenConversation(c)) continue;
    assigned += 1;
    if (!c.needs_reply) continue;
    needsReply += 1;

    const arrived = c.latest_inbound_at ? new Date(c.latest_inbound_at) : null;
    if (!arrived || Number.isNaN(arrived.getTime())) continue;
    const w = getQueueWindow(queueWindows, c.queue_category_key);
    const deadline = breachAt(arrived, SLA_BUSINESS_SECONDS, w);
    const remaining = businessSecondsRemainingUntil(deadline, now, w);
    if (remaining <= AT_RISK_REMAINING_SECONDS) atRisk += 1;
  }

  return { assigned, needsReply, atRisk };
}

// ─── C1/C3: Unassigned count and oldest unassigned age ───────────────────────

export function computeUnassignedMetrics(
  conversations: ConversationLike[],
  now: Date,
  queueWindows: QueueWindowMap,
): { unassigned: number; oldestUnassignedSec: number | null } {
  let unassigned = 0;
  let oldest: number | null = null;
  for (const c of conversations) {
    if (c.assigned_user_id !== null || !isOpenConversation(c)) continue;
    unassigned += 1;
    const arrived = c.first_inbound_at ? new Date(c.first_inbound_at) : null;
    if (!arrived || Number.isNaN(arrived.getTime())) continue;
    const w = getQueueWindow(queueWindows, c.queue_category_key);
    const ageSec = businessSecondsBetween(arrived, now, w);
    if (oldest === null || ageSec > oldest) oldest = ageSec;
  }
  return { unassigned, oldestUnassignedSec: oldest };
}

// ─── B1/B2: Today's avg first-response time and on-time rate ─────────────────

const SEVEN_DAYS_MS = 7 * 86_400_000;

export type RepliedConversation = {
  firstInboundAt: string | null;
  firstOutboundAt: string | null;
  queueKey: string;
};

export function computeTodayResponseMetrics(
  replied: RepliedConversation[],
  userWindow: BusinessWindow,
  queueWindows: QueueWindowMap,
  now: Date,
): { avgResponseSec: number | null; onTimeRate: number | null; repliesConsidered: number } {
  const today = todaysWindow(now, userWindow);
  const avgSamples: number[] = [];
  let onTime = 0;
  let total = 0;

  for (const r of replied) {
    if (!r.firstInboundAt || !r.firstOutboundAt) continue;
    const inbound = new Date(r.firstInboundAt);
    const outbound = new Date(r.firstOutboundAt);
    if (Number.isNaN(inbound.getTime()) || Number.isNaN(outbound.getTime())) continue;
    // Bucket by reply time in user's window (two-clock rule: user tz for bucketing).
    if (!inWindow(r.firstOutboundAt, today.start, today.end)) continue;

    // Elapsed business seconds use the queue's timezone window (two-clock rule).
    const w = getQueueWindow(queueWindows, r.queueKey);
    const responseSec = businessSecondsBetween(inbound, outbound, w);
    total += 1;
    if (responseSec <= SLA_BUSINESS_SECONDS) onTime += 1;

    // B1 avg excludes threads older than 7 days at reply time.
    if (outbound.getTime() - inbound.getTime() <= SEVEN_DAYS_MS) {
      avgSamples.push(responseSec);
    }
  }

  const avgResponseSec = avgSamples.length
    ? Math.round(avgSamples.reduce((a, b) => a + b, 0) / avgSamples.length)
    : null;
  const onTimeRate = total ? onTime / total : null;
  return { avgResponseSec, onTimeRate, repliesConsidered: total };
}

// ─── Yesterday avg from metrics_daily rollup ──────────────────────────────────

export type MetricsDailyRow = {
  user_id: string;
  date: string; // YYYY-MM-DD
  avg_response_seconds: number | null;
  on_time_replies?: number;
  total_replies?: number;
  team_claims?: number;
};

export function userDateString(now: Date, userWindow: BusinessWindow): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: userWindow.tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now); // en-CA → YYYY-MM-DD
}

export function userYesterdayDateString(now: Date, userWindow: BusinessWindow): string {
  const today = userDateString(now, userWindow);
  const [y, m, d] = today.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d) - 86_400_000);
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}-${String(prev.getUTCDate()).padStart(2, "0")}`;
}

export function pickYesterdayAvg(
  rows: MetricsDailyRow[],
  userId: string,
  now: Date,
  userWindow: BusinessWindow,
): number | null {
  const yesterday = userYesterdayDateString(now, userWindow);
  const row = rows.find((r) => r.user_id === userId && r.date === yesterday);
  return row ? row.avg_response_seconds : null;
}

// ─── B3: Replies sent today (send_attempts + comment_actions) ─────────────────

export type SendAttemptLike = {
  approved_by: string | null;
  status: string;
  sent_at: string | null;
};

export type CommentActionLike = {
  requested_by: string | null;
  status: string;
  completed_at: string | null;
};

function inWindow(iso: string | null, start: Date, end: Date): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= start.getTime() && t < end.getTime();
}

export function computeRepliesSentToday(
  sendAttempts: SendAttemptLike[],
  commentActions: CommentActionLike[],
  userId: string,
  userWindow: BusinessWindow,
  now: Date,
): number {
  const today = todaysWindow(now, userWindow);
  let count = 0;
  for (const s of sendAttempts) {
    if (s.approved_by === userId && s.status === "sent" && inWindow(s.sent_at, today.start, today.end)) {
      count += 1;
    }
  }
  for (const c of commentActions) {
    if (c.requested_by === userId && c.status === "succeeded" && inWindow(c.completed_at, today.start, today.end)) {
      count += 1;
    }
  }
  return count;
}
