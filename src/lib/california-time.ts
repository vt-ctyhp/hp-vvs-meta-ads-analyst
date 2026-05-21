export const CALIFORNIA_TIME_ZONE = "America/Los_Angeles";

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
