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

import { periodMetricLabel, type PeriodMetric } from "./period-pivot-data.ts";

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
  periodMetric: PeriodMetric;
  /** Live primary-KPI name (e.g. "Messages", "Appointments") — used
   *  to render the `primary_results` / `cost_per_primary_results`
   *  metrics with their actual KPI name. Falls back to the static
   *  "Primary KPI" / "$/Primary KPI" label when missing. */
  primaryResultLabel?: string | null;
  umbrella: string;
  query: string;
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
      value: periodMetricLabel(input.periodMetric, input.primaryResultLabel),
      isActive: input.periodMetric !== "spend",
    },
    {
      key: "Umbrella",
      value: input.umbrella === "all" ? "All" : input.umbrella,
      isActive: input.umbrella !== "all",
    },
    {
      key: "Query",
      value: input.query.trim() ? `"${input.query.trim()}"` : "—",
      isActive: input.query.trim().length > 0,
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

// ─── /analyst/creative-analysis ──────────────────────────────────────

export type CreativeAnalysisFilterInput = {
  brand: string;
  delivery: "all" | "active" | "paused";
  startDate: string;
  endDate: string;
  umbrella: string;
  campaign: string;
  adSet: string;
  status: string;
  query: string;
};

/**
 * Standfirst builder for /analyst/creative-analysis (8 segments).
 *
 * Cascading dropdowns (Umbrella → Campaign → Ad Set) each render as
 * their own segment; their values surface verbatim when set. The query
 * segment renders the trimmed search string in quotes, or "—" when
 * empty / whitespace-only.
 */
export function buildCreativeAnalysisFilterSummary(
  input: CreativeAnalysisFilterInput,
): ActiveFilterSummary {
  const trimmedQuery = input.query.trim();
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
      key: "Umbrella",
      value: input.umbrella === "all" ? "All" : input.umbrella,
      isActive: input.umbrella !== "all",
    },
    {
      key: "Campaign",
      value: input.campaign === "all" ? "All" : input.campaign,
      isActive: input.campaign !== "all",
    },
    {
      key: "Ad Set",
      value: input.adSet === "all" ? "All" : input.adSet,
      isActive: input.adSet !== "all",
    },
    {
      key: "Status",
      value: input.status === "all" ? "All" : input.status,
      isActive: input.status !== "all",
    },
    {
      key: "Query",
      value: trimmedQuery ? `"${trimmedQuery}"` : "—",
      isActive: trimmedQuery.length > 0,
    },
  ];
}

// ─── /analysis (Ask AI) ──────────────────────────────────────────────

export type AskAiFilterInput = {
  brand: string | null;
  delivery: "active" | "paused" | null;
  umbrella: string | null;
  startDate: string;
  endDate: string;
};

/**
 * Standfirst builder for /analysis (Ask AI) (4 segments).
 *
 * Filters are nullable on this page — `null` means "no filter set" and
 * renders as "All" in the standfirst. Setting any filter narrows the
 * dataset the AI sees on the next request.
 */
export function buildAskAiFilterSummary(
  input: AskAiFilterInput,
): ActiveFilterSummary {
  return [
    {
      key: "Brand",
      value: input.brand ?? "All",
      isActive: input.brand !== null,
    },
    {
      key: "Delivery",
      value: input.delivery === null ? "All" : deliveryLabel(input.delivery),
      isActive: input.delivery !== null,
    },
    {
      key: "Umbrella",
      value: input.umbrella ?? "All",
      isActive: input.umbrella !== null,
    },
    {
      key: "Range",
      value: formatShortRange(input.startDate, input.endDate),
      isActive: false,
    },
  ];
}

export type ConvertFilterSummaryInput = {
  capi: string;
  endDate: string;
  query: string;
  source: string;
  stage: string;
  startDate: string;
  type: string;
};

export function buildConvertFilterSummary(
  input: ConvertFilterSummaryInput,
): ActiveFilterSummary {
  return [
    {
      key: "Range",
      value: formatShortRange(input.startDate, input.endDate),
      isActive: false,
    },
    {
      key: "Stage",
      value: convertStageLabel(input.stage),
      isActive: input.stage !== "all",
    },
    {
      key: "Source",
      value: convertSourceLabel(input.source),
      isActive: input.source !== "all",
    },
    {
      key: "CAPI",
      value: convertCapiLabel(input.capi),
      isActive: input.capi !== "all",
    },
    {
      key: "Type",
      value: input.type === "all" ? "All" : input.type,
      isActive: input.type !== "all",
    },
    {
      key: "Search",
      value: input.query || "None",
      isActive: Boolean(input.query),
    },
  ];
}

function convertStageLabel(value: string) {
  const labels: Record<string, string> = {
    all: "All",
    booking_form_started: "Started form",
    booking_page_view: "Viewed page",
    confirmed_website_bookings: "Confirmed bookings",
    date_selected: "Selected date",
    paid_meta_bookings: "Paid Meta bookings",
    time_selected: "Selected time",
    visit_selected: "Selected type",
  };
  return labels[value] || value;
}

function convertSourceLabel(value: string) {
  const labels: Record<string, string> = {
    all: "All",
    direct: "Direct",
    paid_meta: "Paid Meta",
    unattributed: "Unattributed",
  };
  return labels[value] || value;
}

function convertCapiLabel(value: string) {
  const labels: Record<string, string> = {
    all: "All",
    failed: "Failed",
    gap: "Gaps",
    missing: "Missing",
    sent: "Sent",
  };
  return labels[value] || value;
}
