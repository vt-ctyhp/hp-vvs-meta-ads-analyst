export const CALIFORNIA_TIME_ZONE = "America/Los_Angeles";

const CALIFORNIA_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: CALIFORNIA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const CALIFORNIA_DATE_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: CALIFORNIA_TIME_ZONE,
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatCaliforniaDateTime(
  value: string | Date | null | undefined,
  fallback = "-",
) {
  if (!value) return fallback;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return fallback;
  return CALIFORNIA_DATE_TIME.format(date);
}

export function californiaDateString(now = new Date()) {
  const parts = CALIFORNIA_DATE.formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Unable to format California date.");
  }

  return `${year}-${month}-${day}`;
}
