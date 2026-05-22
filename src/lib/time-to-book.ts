const MS_PER_SEC = 1_000;
const MS_PER_MIN = 60 * MS_PER_SEC;
const MS_PER_HR = 60 * MS_PER_MIN;
const MS_PER_DAY = 24 * MS_PER_HR;

export type TimeToBook = {
  value: string;
  unit: "sec" | "min" | "hr" | "day" | "days" | null;
};

export function formatTimeToBook(deltaMs: number | null): TimeToBook {
  if (deltaMs === null || !Number.isFinite(deltaMs) || deltaMs < 0) {
    return { value: "—", unit: null };
  }

  if (deltaMs < MS_PER_MIN) {
    return { value: String(Math.floor(deltaMs / MS_PER_SEC)), unit: "sec" };
  }

  if (deltaMs < MS_PER_HR) {
    return { value: String(Math.floor(deltaMs / MS_PER_MIN)), unit: "min" };
  }

  if (deltaMs < MS_PER_DAY) {
    return { value: String(Math.floor(deltaMs / MS_PER_HR)), unit: "hr" };
  }

  const days = Math.floor(deltaMs / MS_PER_DAY);
  return { value: String(days), unit: days === 1 ? "day" : "days" };
}
