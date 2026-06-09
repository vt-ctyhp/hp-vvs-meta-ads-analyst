const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export type ResolvedDate = { date: string; note: string | null };

function isoToUtcDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Resolve a small set of relative phrases against `today` (YYYY-MM-DD). */
export function resolveRelativeDate(input: string, today: string): ResolvedDate {
  const text = input.trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return { date: text, note: null };

  const todayDate = isoToUtcDate(today);
  const todayDow = todayDate.getUTCDay();

  if (text === "today") return { date: today, note: null };
  if (text === "yesterday") {
    const y = toIso(new Date(todayDate.getTime() - 86_400_000));
    return { date: y, note: `Read "yesterday" as ${y}` };
  }

  const weekdayMatch = text.match(/(?:last\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/);
  if (weekdayMatch) {
    const target = WEEKDAYS.indexOf(weekdayMatch[1]);
    // most recent past occurrence (1..7 days back)
    let delta = (todayDow - target + 7) % 7;
    if (delta === 0) delta = 7;
    const resolved = toIso(new Date(todayDate.getTime() - delta * 86_400_000));
    return { date: resolved, note: `Read "${weekdayMatch[0]}" as ${resolved}` };
  }

  // Unknown phrase: default to today, flag it.
  return { date: today, note: `Could not read "${input}"; defaulted to today` };
}

/** Does the user's stated value agree with the live-read numeric value? */
export function compareVerifyValue(stated: string | null, liveNumeric: string | null): "confirmed" | "mismatch" | "na" {
  if (!stated || !liveNumeric) return "na";
  const statedNum = stated.replace(/[^0-9.]/g, "");
  const liveNum = liveNumeric.replace(/[^0-9.]/g, "");
  if (!statedNum || !liveNum) return "na";
  return Number(statedNum) === Number(liveNum) ? "confirmed" : "mismatch";
}
