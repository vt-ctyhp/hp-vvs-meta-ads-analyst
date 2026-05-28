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
