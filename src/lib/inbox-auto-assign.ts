// src/lib/inbox-auto-assign.ts
export type ScheduleRow = {
  weekday: number; // 0=Sun .. 6=Sat
  startTime: string; // "HH:MM" or "HH:MM:SS"
  endTime: string; // "HH:MM" or "HH:MM:SS"
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function zonedWeekdayAndMinutes(now: Date, tz: string): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  const weekday = WEEKDAY_INDEX[map.weekday];
  const hour = map.hour === "24" ? 0 : Number(map.hour);
  return { weekday, minutes: hour * 60 + Number(map.minute) };
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":");
  return Number(h) * 60 + Number(m);
}

// True when `now`, expressed in `tz`, falls inside any of the member's windows.
// Same-day windows (end > start) match on their weekday. Overnight windows
// (end <= start) match the evening portion on their weekday and the early-morning
// spill on the following weekday.
export function isOnShift(rows: readonly ScheduleRow[], tz: string, now: Date): boolean {
  const { weekday, minutes } = zonedWeekdayAndMinutes(now, tz);
  for (const row of rows) {
    const start = toMinutes(row.startTime);
    const end = toMinutes(row.endTime);
    if (end > start) {
      if (row.weekday === weekday && minutes >= start && minutes < end) return true;
    } else {
      if (row.weekday === weekday && minutes >= start) return true; // evening portion
      if (row.weekday === (weekday + 6) % 7 && minutes < end) return true; // morning spill
    }
  }
  return false;
}

export type Candidate = {
  appUserId: string;
  coversCategory: boolean;
  eligible: boolean; // auto_assign_eligible (the worker's pool gate)
  scheduleRows: readonly ScheduleRow[];
  tz: string;
};

export type PickAssigneeInput = {
  candidates: readonly Candidate[];
  now: Date;
  lastAssignedUserId: string | null;
};

export type PickAssigneeResult = { assignedUserId: string; nextPointer: string } | null;

// Strict round-robin over the on-shift, eligible, covering candidates in a stable
// (app_user_id-sorted) order. Returns the chosen user and the new rotation pointer,
// or null when the pool is empty.
export function pickAssignee(input: PickAssigneeInput): PickAssigneeResult {
  const pool = input.candidates
    .filter((c) => c.coversCategory && c.eligible && isOnShift(c.scheduleRows, c.tz, input.now))
    .map((c) => c.appUserId)
    .sort();
  if (pool.length === 0) return null;
  const lastIdx = input.lastAssignedUserId ? pool.indexOf(input.lastAssignedUserId) : -1;
  const nextIdx = (lastIdx + 1) % pool.length; // lastIdx === -1 -> 0
  const chosen = pool[nextIdx];
  return { assignedUserId: chosen, nextPointer: chosen };
}
