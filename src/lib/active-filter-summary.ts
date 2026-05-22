/**
 * Builds the standfirst summary the sticky collapsed filter bar renders
 * on the /analyst page.
 *
 * Pure function — given the current filter state, returns an ordered list
 * of segments the bar displays. Each segment has a smallcaps `key`, a
 * Cormorant-italic `value`, and an `isActive` flag (true when the segment
 * is set to a non-default value, which the bar uses to draw a faint inset
 * background so the eye lands on what the user has actively chosen).
 *
 * See `docs/superpowers/specs/2026-05-22-sticky-collapsible-filters-design.md`
 * § "State B · Scrolled past" for the visual spec.
 */

export type FilterSegment = {
  key: string;
  value: string;
  isActive: boolean;
};

export type ActiveFilterSummary = FilterSegment[];

export type ActiveFilterInput = {
  brand: string;
  delivery: "all" | "active" | "paused";
  startDate: string;
  endDate: string;
  compareEnabled: boolean;
  periodCount: number;
  periodMetric: string;
  umbrella: string;
};

const RANGE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function buildActiveFilterSummary(
  input: ActiveFilterInput,
): ActiveFilterSummary {
  return [
    {
      key: "Brand",
      value: input.brand === "all" ? "All" : input.brand,
      isActive: input.brand !== "all",
    },
    {
      key: "Delivery",
      value: deliveryLabel(input.delivery),
      isActive: input.delivery !== "all",
    },
    {
      key: "Range",
      value: formatShortRange(input.startDate, input.endDate),
      isActive: false,
    },
    {
      key: "vs Prev",
      value: input.compareEnabled
        ? `× ${input.periodCount} periods`
        : "off",
      isActive: input.compareEnabled,
    },
    {
      key: "Metric",
      value: capitalize(input.periodMetric),
      isActive:
        input.periodMetric !== "" && input.periodMetric.toLowerCase() !== "spend",
    },
    {
      key: "Umbrella",
      value: input.umbrella === "all" ? "All" : input.umbrella,
      isActive: input.umbrella !== "all",
    },
  ];
}

function deliveryLabel(value: ActiveFilterInput["delivery"]): string {
  switch (value) {
    case "active":
      return "Active";
    case "paused":
      return "Paused";
    default:
      return "All";
  }
}

function formatShortRange(start: string, end: string): string {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  if (!startDate || !endDate) {
    return `${start || "—"} — ${end || "—"}`;
  }
  return `${RANGE_FMT.format(startDate)} — ${RANGE_FMT.format(endDate)}`;
}

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
