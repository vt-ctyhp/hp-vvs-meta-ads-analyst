import { CAMPAIGN_UMBRELLAS, isCampaignUmbrella } from "./campaign-umbrellas.ts";

export const WORKBENCH_METRICS = [
  "spend",
  "monthly_budget",
  "campaign_count",
  "ad_set_count",
  "ad_count",
  "creative_count",
  "impressions",
  "reach",
  "clicks",
  "leads",
  "bookings",
  "conversions",
  "website_bookings",
  "messaging_contacts",
  "new_messaging_contacts",
  "primary_results",
  "secondary_results",
  "ctr",
  "cpm",
  "cpc",
  "cpl",
  "frequency",
] as const;

export const WORKBENCH_DIMENSIONS = [
  "date",
  "week",
  "month",
  "quarter",
  "brand",
  "campaign_umbrella",
  "campaign",
  "ad_set",
  "ad",
  "creative",
] as const;

export const WORKBENCH_FILTERS = [
  "search",
  "brand",
  "campaign_umbrella",
  "campaign",
  "ad_set",
  "ad",
  "creative",
  "delivery_status",
] as const;

export const WORKBENCH_DATE_GRAINS = ["summary", "day", "week", "month", "quarter"] as const;

export const WORKBENCH_VISUAL_TYPES = [
  "metric_card",
  "flat_table",
  "bar_chart",
  "line_chart",
  "pivot_table",
  "scatter_chart",
] as const;

export type WorkbenchMetric = (typeof WORKBENCH_METRICS)[number];
export type WorkbenchDimension = (typeof WORKBENCH_DIMENSIONS)[number];
export type WorkbenchFilterField = (typeof WORKBENCH_FILTERS)[number];
export type WorkbenchDateGrain = (typeof WORKBENCH_DATE_GRAINS)[number];
export type WorkbenchVisualType = (typeof WORKBENCH_VISUAL_TYPES)[number];
export type WorkbenchSemanticKind = "metric" | "dimension" | "filter" | "date_grain";

export type WorkbenchSemanticAlias = {
  alias: string;
  kind: WorkbenchSemanticKind;
  key: string;
};

export type WorkbenchSemanticFilter = {
  field: string;
  operator?: string;
  value: string;
};

export type WorkbenchSemanticVisualIntent = {
  type: string;
  metrics?: string[];
  dimensions?: string[];
  rowDimension?: string | null;
  columnDimension?: string | null;
  x?: string | null;
  y?: string | null;
};

export type WorkbenchSemanticIntent = {
  prompt?: string;
  metrics?: string[];
  dimensions?: string[];
  filters?: WorkbenchSemanticFilter[];
  dateGrain?: string | null;
  visual?: WorkbenchSemanticVisualIntent;
};

export type WorkbenchSemanticIssue = {
  code: string;
  message: string;
  field?: string;
  value?: string;
  suggestedRequest?: string;
};

export type WorkbenchSemanticAssumption =
  | {
      code: "repaired_filter_value";
      field: string;
      from: string;
      to: string;
      message: string;
    }
  | {
      code: "repaired_visual_layout" | "repaired_visual_type";
      from: string;
      to: string;
      message: string;
    };

export type WorkbenchSemanticValidationResult = {
  status: "ready" | "blocked";
  blockers: WorkbenchSemanticIssue[];
  warnings: WorkbenchSemanticIssue[];
  assumptions: WorkbenchSemanticAssumption[];
  repairedIntent: {
    metrics: string[];
    dimensions: string[];
    filters: WorkbenchSemanticFilter[];
    dateGrain: string | null;
    visual: WorkbenchSemanticVisualIntent | null;
  };
};

type MetricDefinition = {
  key: WorkbenchMetric;
  label: string;
  sourceField: string;
  valueType: "money" | "count" | "rate" | "ratio";
  aliases: string[];
  caveat?: string;
};

type DimensionDefinition = {
  key: WorkbenchDimension;
  label: string;
  sourceField: string;
  aliases: string[];
};

type FilterDefinition = {
  key: WorkbenchFilterField;
  label: string;
  sourceField: string;
  operators: Array<"contains" | "equals">;
  aliases: string[];
};

type DateGrainDefinition = {
  key: WorkbenchDateGrain;
  label: string;
  dimension: WorkbenchDimension | null;
  aliases: string[];
};

type ChartCompatibilityRule = {
  visualType: WorkbenchVisualType;
  label: string;
  requirements: string[];
};

type UnsupportedBoundary = {
  key: "crm" | "revenue" | "roas" | "staff" | "website" | "social_inbox";
  label: string;
  reason: string;
  pattern: RegExp;
};

export type PrimaryKpiRule = {
  key: string;
  metric: "website_bookings" | "messaging_contacts" | "primary_results";
  label: string;
  caveat: string;
  appliesToCampaignUmbrellas: string[];
};

const METRIC_DEFINITIONS: MetricDefinition[] = [
  metric("spend", "Spend", "spend", "money", ["ad spend", "spent", "cost"]),
  metric("monthly_budget", "Monthly Budget", "monthly_budget", "money", ["budget"]),
  metric("campaign_count", "Campaign Count", "campaign_id", "count", ["number of campaigns"]),
  metric("ad_set_count", "Ad Set Count", "ad_set_id", "count", ["number of ad sets"]),
  metric("ad_count", "Ad Count", "ad_id", "count", ["number of ads"]),
  metric("creative_count", "Creative Count", "creative_id", "count", ["number of creatives"]),
  metric("impressions", "Impressions", "impressions", "count", ["impression"]),
  metric("reach", "Reach", "reach", "count", []),
  metric("clicks", "Clicks", "clicks", "count", ["click"]),
  metric("leads", "Leads", "leads", "count", ["lead"]),
  metric("bookings", "Bookings", "bookings", "count", ["appointments", "appointment"]),
  metric("conversions", "Conversions", "conversions", "count", ["conversion"]),
  metric("website_bookings", "Website Bookings", "website_bookings", "count", [
    "website appointments",
    "website conversions",
  ], "Website bookings are a tracked booking proxy, not final sales or revenue."),
  metric("messaging_contacts", "Messaging Contacts", "messaging_contacts", "count", [
    "messages",
    "message",
    "messenger conversations",
    "conversations",
    "replies",
  ], "Messaging contacts are a leading proxy, not final sales or revenue."),
  metric("new_messaging_contacts", "New Messaging Contacts", "new_messaging_contacts", "count", [
    "new messages",
    "first replies",
  ], "New messaging contacts are a leading proxy, not final sales or revenue."),
  metric("primary_results", "Primary KPI", "primary_results", "count", [
    "primary kpi",
    "primary results",
    "results",
    "kpi",
  ], "Primary KPI is group-specific and can blend proxy metrics across groups."),
  metric("secondary_results", "Secondary KPI", "secondary_results", "count", [
    "secondary kpi",
    "secondary results",
  ]),
  metric("ctr", "CTR", "ctr", "rate", ["click through rate", "click-through rate"]),
  metric("cpm", "CPM", "cpm", "money", ["cost per mille", "cost per thousand"]),
  metric("cpc", "CPC", "cpc", "money", ["cost per click"]),
  metric("cpl", "CPL", "cpl", "money", ["cost per lead"]),
  metric("frequency", "Frequency", "frequency", "ratio", []),
];

const DIMENSION_DEFINITIONS: DimensionDefinition[] = [
  dimension("date", "Date", "date", ["day", "daily"]),
  dimension("week", "Week", "week", ["weekly"]),
  dimension("month", "Month", "month", ["monthly"]),
  dimension("quarter", "Quarter", "quarter", ["quarterly"]),
  dimension("brand", "Brand", "brand", ["brands"]),
  dimension("campaign_umbrella", "Group", "campaign_umbrella", [
    "group",
    "groups",
    "campaign group",
    "campaign umbrella",
    "umbrella",
    "umbrellas",
  ]),
  dimension("campaign", "Campaign", "campaign", ["campaigns"]),
  dimension("ad_set", "Ad Set", "ad_set", ["ad set", "ad sets", "adset", "adsets"]),
  dimension("ad", "Ad", "ad", ["ads"]),
  dimension("creative", "Creative", "creative", ["creatives", "ad creative", "ad creatives"]),
];

const FILTER_DEFINITIONS: FilterDefinition[] = [
  filter("search", "Search", "search", ["contains"], ["query"]),
  filter("brand", "Brand", "brand", ["equals"], ["brands"]),
  filter("campaign_umbrella", "Group", "campaign_umbrella", ["equals"], [
    "group",
    "campaign group",
    "campaign umbrella",
    "umbrella",
  ]),
  filter("campaign", "Campaign", "campaign", ["contains", "equals"], ["campaigns"]),
  filter("ad_set", "Ad Set", "ad_set", ["contains", "equals"], ["ad set", "adset"]),
  filter("ad", "Ad", "ad", ["contains", "equals"], ["ads"]),
  filter("creative", "Creative", "creative", ["contains", "equals"], ["ad creative"]),
  filter("delivery_status", "Delivery", "delivery_status", ["equals"], ["status", "delivery"]),
];

const DATE_GRAIN_DEFINITIONS: DateGrainDefinition[] = [
  { key: "summary", label: "Summary", dimension: null, aliases: ["total", "overall"] },
  { key: "day", label: "Day", dimension: "date", aliases: ["daily", "date"] },
  { key: "week", label: "Week", dimension: "week", aliases: ["weekly"] },
  { key: "month", label: "Month", dimension: "month", aliases: ["monthly"] },
  { key: "quarter", label: "Quarter", dimension: "quarter", aliases: ["quarterly"] },
];

const PRIMARY_KPI_RULES: PrimaryKpiRule[] = [
  {
    key: "book_appointments",
    metric: "website_bookings",
    label: "Primary KPI (Website Bookings)",
    caveat: "Website bookings are a proxy for booked appointments, not final sales or revenue.",
    appliesToCampaignUmbrellas: ["Book Appts US"],
  },
  {
    key: "facebook_product",
    metric: "messaging_contacts",
    label: "Primary KPI (Messaging Contacts)",
    caveat: "Messaging contacts are a leading proxy for buyer intent, not final sales or revenue.",
    appliesToCampaignUmbrellas: ["Facebook US Product", "Facebook VN Product"],
  },
  {
    key: "default_messaging",
    metric: "messaging_contacts",
    label: "Primary KPI (Messaging Contacts)",
    caveat: "Messaging contacts are a leading proxy for buyer intent, not final sales or revenue.",
    appliesToCampaignUmbrellas: [
      "US Promotions (WKDS / OOAK)",
      "Cash for Gold US",
      "VN Promotions (WKDS / OOAK)",
      "Excluded / Non-umbrella",
      "Needs review",
    ],
  },
];

const BLENDED_PRIMARY_KPI_RULE: PrimaryKpiRule = {
  key: "blended_primary",
  metric: "primary_results",
  label: "Primary KPI (blended website bookings and messaging contacts)",
  caveat:
    "This blends mixed units across groups; compare within group when possible and treat totals as directional.",
  appliesToCampaignUmbrellas: [...CAMPAIGN_UMBRELLAS],
};

const CHART_COMPATIBILITY: ChartCompatibilityRule[] = [
  {
    visualType: "metric_card",
    label: "Metric card",
    requirements: ["One to four metrics", "No required dimension"],
  },
  {
    visualType: "flat_table",
    label: "Flat table",
    requirements: ["At least one dimension", "At least one metric"],
  },
  {
    visualType: "bar_chart",
    label: "Bar chart",
    requirements: ["One entity dimension", "At least one metric"],
  },
  {
    visualType: "line_chart",
    label: "Line chart",
    requirements: ["One time grain dimension", "At least one metric"],
  },
  {
    visualType: "pivot_table",
    label: "Pivot table",
    requirements: ["Distinct row and column dimensions", "At least one metric"],
  },
  {
    visualType: "scatter_chart",
    label: "Scatter chart",
    requirements: ["One entity dimension", "Two numeric metrics"],
  },
];

const UNSUPPORTED_BOUNDARIES: UnsupportedBoundary[] = [
  {
    key: "crm",
    label: "CRM and Sales/ERP",
    reason: "CRM and Sales/ERP data is not governed by the Meta Ads semantic catalog yet.",
    pattern:
      /\b(crm|customers?|orders?|closed\s+deals?|sales\s+(?:data|orders?|from|by|team|rep))\b/i,
  },
  {
    key: "revenue",
    label: "Revenue and payments",
    reason: "Revenue, invoices, deposits, and payment data are not governed by the Meta Ads semantic catalog yet.",
    pattern:
      /\b(revenue|sales\s+amount|sales\s+value|gross\s+margin|margin|profit|invoice|deposit|payment|amount\s+paid)\b/i,
  },
  {
    key: "roas",
    label: "ROAS",
    reason: "ROAS is not governed because revenue is outside the Meta Ads semantic catalog.",
    pattern: /\b(roas|return\s+on\s+ad\s+spend)\b/i,
  },
  {
    key: "staff",
    label: "Staff performance",
    reason: "Staff, employee, advisor, and sales-rep data is not governed by the Meta Ads semantic catalog yet.",
    pattern: /\b(staff|employees?|team\s+member|sales\s+rep|advisor|agent|owner)\b/i,
  },
  {
    key: "website",
    label: "Website analytics",
    reason: "Website traffic, sessions, funnel, and landing-page data is not governed by the Meta Ads semantic catalog yet.",
    pattern:
      /\b(website\s+(?:traffic|visitors?|sessions?|events?|funnel)|site\s+visitors?|landing[-\s]?pages?|page\s+views?|sessions?|traffic|utm|checkout|add\s+to\s+cart|funnel)\b/i,
  },
  {
    key: "social_inbox",
    label: "Social inbox",
    reason: "Social inbox messages, comments, and response workflows are not governed by the Meta Ads semantic catalog yet.",
    pattern:
      /\b(social\s+inbox|inbox\s+response|dm\s+response|comment\s+response|customer\s+messages?|social\s+messages?)\b/i,
  },
];

const BRAND_VALUES = ["HP", "VVS", "Unassigned"] as const;
const DELIVERY_STATUS_VALUES = ["live", "paused"] as const;
const ENTITY_DIMENSIONS = new Set<string>([
  "brand",
  "campaign_umbrella",
  "campaign",
  "ad_set",
  "ad",
  "creative",
]);
const TIME_DIMENSIONS = new Set<string>(["date", "week", "month", "quarter"]);

const ALIASES: WorkbenchSemanticAlias[] = [
  ...METRIC_DEFINITIONS.flatMap((definition) =>
    aliasesFor("metric", definition.key, definition.aliases),
  ),
  ...DIMENSION_DEFINITIONS.flatMap((definition) =>
    aliasesFor("dimension", definition.key, definition.aliases),
  ),
  ...FILTER_DEFINITIONS.flatMap((definition) =>
    aliasesFor("filter", definition.key, definition.aliases),
  ),
  ...DATE_GRAIN_DEFINITIONS.flatMap((definition) =>
    aliasesFor("date_grain", definition.key, definition.aliases),
  ),
];

export const ANALYSIS_WORKBENCH_SEMANTIC_CATALOG = {
  source: {
    key: "meta_ads",
    label: "Meta Ads",
    table: "meta_daily_insights",
    aggregateFunction: "aggregate_meta_daily_insights",
  },
  metrics: METRIC_DEFINITIONS,
  dimensions: DIMENSION_DEFINITIONS,
  filters: FILTER_DEFINITIONS,
  dateGrains: DATE_GRAIN_DEFINITIONS,
  aliases: ALIASES,
  primaryKpiRules: PRIMARY_KPI_RULES,
  supportedFilterValues: {
    brand: BRAND_VALUES,
    campaign_umbrella: CAMPAIGN_UMBRELLAS,
    delivery_status: DELIVERY_STATUS_VALUES,
  },
  unsupportedBoundaries: UNSUPPORTED_BOUNDARIES.map(({ pattern: _pattern, ...boundary }) => boundary),
  chartCompatibility: CHART_COMPATIBILITY,
} as const;

export function getAnalysisWorkbenchSemanticCatalog() {
  return ANALYSIS_WORKBENCH_SEMANTIC_CATALOG;
}

export function resolveSemanticAlias(value: string): WorkbenchSemanticAlias | null {
  const normalized = normalizeToken(value);
  return ALIASES.find((alias) => normalizeToken(alias.alias) === normalized) || null;
}

export function getPrimaryKpiRule(
  campaignUmbrellas: string | string[] | null | undefined,
): PrimaryKpiRule {
  const normalized = normalizeCampaignUmbrellas(campaignUmbrellas);
  if (!normalized.length) {
    return ruleForUmbrella("Needs review");
  }

  const rules = normalized.map(ruleForUmbrella);
  const metrics = new Set(rules.map((rule) => rule.metric));
  if (metrics.size > 1) return BLENDED_PRIMARY_KPI_RULE;
  return rules[0];
}

export function validateAnalysisWorkbenchSemanticIntent(
  intent: WorkbenchSemanticIntent,
): WorkbenchSemanticValidationResult {
  const blockers: WorkbenchSemanticIssue[] = [];
  const warnings: WorkbenchSemanticIssue[] = [];
  const assumptions: WorkbenchSemanticAssumption[] = [];

  blockers.push(...unsupportedPromptIssues(intent.prompt || ""));

  const metrics = intent.metrics || [];
  for (const value of metrics) {
    if (!isMetric(value)) {
      blockers.push({
        code: "invalid_metric",
        field: "metrics",
        value,
        message: `Metric "${value}" is not approved for Meta Ads workbench analysis.`,
      });
    }
  }

  const dimensions = intent.dimensions || [];
  for (const value of dimensions) {
    if (!isDimension(value)) {
      blockers.push({
        code: "invalid_dimension",
        field: "dimensions",
        value,
        message: `Dimension "${value}" is not approved for Meta Ads workbench analysis.`,
      });
    }
  }

  const dateGrain = intent.dateGrain ?? null;
  if (dateGrain && !isDateGrain(dateGrain)) {
    blockers.push({
      code: "invalid_date_grain",
      field: "dateGrain",
      value: dateGrain,
      message: `Date grain "${dateGrain}" is not approved. Use summary, day, week, month, or quarter.`,
    });
  }

  const repairedFilters = repairAndValidateFilters(intent.filters || [], blockers, assumptions);
  let repairedVisual = intent.visual || null;
  if (intent.visual) {
    const visualResult = repairAndValidateVisual(intent.visual);
    repairedVisual = visualResult.visual;
    assumptions.push(...visualResult.assumptions);
    if (visualResult.issue) blockers.push(visualResult.issue);
  }

  return {
    status: blockers.length ? "blocked" : "ready",
    blockers,
    warnings,
    assumptions,
    repairedIntent: {
      metrics,
      dimensions,
      filters: repairedFilters,
      dateGrain,
      visual: repairedVisual,
    },
  };
}

function metric(
  key: WorkbenchMetric,
  label: string,
  sourceField: string,
  valueType: MetricDefinition["valueType"],
  aliases: string[],
  caveat?: string,
): MetricDefinition {
  return { key, label, sourceField, valueType, aliases, ...(caveat ? { caveat } : {}) };
}

function dimension(
  key: WorkbenchDimension,
  label: string,
  sourceField: string,
  aliases: string[],
): DimensionDefinition {
  return { key, label, sourceField, aliases };
}

function filter(
  key: WorkbenchFilterField,
  label: string,
  sourceField: string,
  operators: FilterDefinition["operators"],
  aliases: string[],
): FilterDefinition {
  return { key, label, sourceField, operators, aliases };
}

function aliasesFor(
  kind: WorkbenchSemanticKind,
  key: string,
  aliases: string[],
): WorkbenchSemanticAlias[] {
  return aliases.map((alias) => ({ alias, kind, key }));
}

function unsupportedPromptIssues(prompt: string): WorkbenchSemanticIssue[] {
  if (!prompt.trim()) return [];
  return UNSUPPORTED_BOUNDARIES.filter((boundary) => boundary.pattern.test(prompt)).map(
    (boundary) => ({
      code: `unsupported_${boundary.key}`,
      message: boundary.reason,
    }),
  );
}

function repairAndValidateFilters(
  filters: WorkbenchSemanticFilter[],
  blockers: WorkbenchSemanticIssue[],
  assumptions: WorkbenchSemanticAssumption[],
) {
  const invalidValues: string[] = [];

  const repaired = filters.map((filter) => {
    const field = canonicalFilterField(filter.field);
    const operator = filter.operator || "equals";
    const value = filter.value.trim();
    const nextFilter = { field, operator, value };

    if (!isFilterField(field)) {
      blockers.push({
        code: "invalid_filter_field",
        field: "filters",
        value: filter.field,
        message: `Filter field "${filter.field}" is not approved for Meta Ads workbench analysis.`,
      });
      return nextFilter;
    }

    if (operator !== "equals" && operator !== "contains") {
      blockers.push({
        code: "invalid_filter_operator",
        field,
        value: operator,
        message: `Filter "${field}" uses unsupported operator "${operator}".`,
      });
      return nextFilter;
    }

    if (operator !== "equals") return nextFilter;

    const repairedValue = repairExactFilterValue(field, value);
    if (repairedValue) {
      if (repairedValue !== value) {
        assumptions.push({
          code: "repaired_filter_value",
          field,
          from: value,
          to: repairedValue,
          message: `Interpreted ${labelForFilterValue(field)} "${value}" as "${repairedValue}".`,
        });
      }
      return { ...nextFilter, value: repairedValue };
    }

    if (field === "brand" || field === "campaign_umbrella" || field === "delivery_status") {
      invalidValues.push(`${field}="${value}"`);
    }

    return nextFilter;
  });

  if (invalidValues.length) {
    blockers.push({
      code: "invalid_filter_value",
      field: "filters",
      value: invalidValues.join(", "),
      message: `Unsupported filter value(s): ${invalidValues.join(", ")}. Use governed Meta Ads brand, group, or delivery values.`,
    });
  }

  return repaired;
}

function repairExactFilterValue(field: string, value: string) {
  if (field === "brand") return repairBrandValue(value);
  if (field === "campaign_umbrella") return repairCampaignUmbrellaValue(value);
  if (field === "delivery_status") return repairDeliveryStatusValue(value);
  return value;
}

function repairBrandValue(value: string) {
  const normalized = normalizeToken(value);
  if (normalized === "hp" || normalized === "hung phat" || normalized === "hungphat" || normalized === "hpusa") {
    return "HP";
  }
  if (normalized === "vvs") return "VVS";
  if (normalized === "unassigned") return "Unassigned";
  return null;
}

function repairCampaignUmbrellaValue(value: string) {
  if (isCampaignUmbrella(value)) return value;
  const normalized = normalizeToken(value);
  const aliases: Record<string, string> = {
    "book appts": "Book Appts US",
    "book appts us": "Book Appts US",
    "book appointments": "Book Appts US",
    "book appointments us": "Book Appts US",
    "appointments": "Book Appts US",
    "cash for gold": "Cash for Gold US",
    "cash for gold us": "Cash for Gold US",
    "facebook us product": "Facebook US Product",
    "us product": "Facebook US Product",
    "facebook vn product": "Facebook VN Product",
    "vn product": "Facebook VN Product",
    "us promotions": "US Promotions (WKDS / OOAK)",
    "wkds us": "US Promotions (WKDS / OOAK)",
    "vn promotions": "VN Promotions (WKDS / OOAK)",
    "wkds vn": "VN Promotions (WKDS / OOAK)",
    excluded: "Excluded / Non-umbrella",
    "non umbrella": "Excluded / Non-umbrella",
    "needs review": "Needs review",
  };
  return aliases[normalized] || null;
}

function repairDeliveryStatusValue(value: string) {
  const normalized = normalizeToken(value);
  if (normalized === "live" || normalized === "active") return "live";
  if (normalized === "paused" || normalized === "inactive") return "paused";
  return null;
}

function canonicalFilterField(field: string) {
  if (isFilterField(field)) return field;
  const alias = resolveSemanticAlias(field);
  return alias?.kind === "filter" ? alias.key : field;
}

function repairAndValidateVisual(visual: WorkbenchSemanticVisualIntent): {
  visual: WorkbenchSemanticVisualIntent | null;
  assumptions: WorkbenchSemanticAssumption[];
  issue: WorkbenchSemanticIssue | null;
} {
  if (!isVisualType(visual.type)) {
    return {
      visual: null,
      assumptions: [],
      issue: {
        code: "invalid_chart_type",
        field: "visual.type",
        value: visual.type,
        message: `Visual type "${visual.type}" is not approved for Meta Ads workbench analysis.`,
      },
    };
  }

  const metrics = unique([
    ...(visual.metrics || []),
    ...(visual.x && isMetric(visual.x) ? [visual.x] : []),
    ...(visual.y && isMetric(visual.y) ? [visual.y] : []),
  ]);
  const dimensions = unique([
    ...(visual.dimensions || []),
    ...(visual.rowDimension ? [visual.rowDimension] : []),
    ...(visual.columnDimension ? [visual.columnDimension] : []),
    ...(visual.x && isDimension(visual.x) ? [visual.x] : []),
    ...(visual.y && isDimension(visual.y) ? [visual.y] : []),
  ]);
  const entityDimension = dimensions.find((dimension) => ENTITY_DIMENSIONS.has(dimension));
  const timeDimension = dimensions.find((dimension) => TIME_DIMENSIONS.has(dimension));
  const assumption = (
    code: Extract<WorkbenchSemanticAssumption["code"], "repaired_visual_layout" | "repaired_visual_type">,
    from: string,
    to: string,
    message: string,
  ): WorkbenchSemanticAssumption => ({ code, from, to, message });

  if (visual.type === "metric_card") {
    return { visual: { ...visual, metrics, dimensions }, assumptions: [], issue: null };
  }

  if (visual.type === "flat_table") {
    if (!dimensions.length || !metrics.length) {
      return {
        visual,
        assumptions: [],
        issue: incompatibleChartIssue(
          visual.type,
          "Flat tables require at least one dimension and one metric.",
          "Show spend by campaign group as a table.",
        ),
      };
    }

    return { visual: { ...visual, metrics, dimensions }, assumptions: [], issue: null };
  }

  if (visual.type === "line_chart") {
    const hasTimeDimension = dimensions.some((dimension) => TIME_DIMENSIONS.has(dimension));
    if (!hasTimeDimension) {
      if (entityDimension && metrics.length) {
        return {
          visual: { ...visual, type: "bar_chart", metrics, dimensions },
          assumptions: [
            assumption(
              "repaired_visual_type",
              "line_chart",
              "bar_chart",
              "Changed line chart to bar chart because entity comparisons require bars, not a time axis.",
            ),
          ],
          issue: null,
        };
      }

      return {
        visual,
        assumptions: [],
        issue: incompatibleChartIssue(
          visual.type,
          "Line charts require a time grain dimension such as day, week, month, or quarter.",
          "Show spend by day as a line chart.",
        ),
      };
    }

    return { visual: { ...visual, metrics, dimensions }, assumptions: [], issue: null };
  }

  if (visual.type === "bar_chart") {
    if (!entityDimension || !metrics.length) {
      if (timeDimension && metrics.length) {
        return {
          visual: { ...visual, type: "line_chart", metrics, dimensions },
          assumptions: [
            assumption(
              "repaired_visual_type",
              "bar_chart",
              "line_chart",
              "Changed bar chart to line chart because time-grain comparisons require a trend axis.",
            ),
          ],
          issue: null,
        };
      }

      return {
        visual,
        assumptions: [],
        issue: incompatibleChartIssue(
          visual.type,
          "Bar charts require an entity dimension and at least one metric.",
          "Show spend by campaign group as a bar chart.",
        ),
      };
    }

    return { visual: { ...visual, metrics, dimensions }, assumptions: [], issue: null };
  }

  if (visual.type === "pivot_table") {
    if (!metrics.length) {
      return {
        visual,
        assumptions: [],
        issue: incompatibleChartIssue(
          visual.type,
          "Pivot tables require at least one metric.",
          "Show spend by campaign group by week as a pivot table.",
        ),
      };
    }

    const requestedRow = visual.rowDimension && isDimension(visual.rowDimension)
      ? visual.rowDimension
      : null;
    const requestedColumn = visual.columnDimension && isDimension(visual.columnDimension)
      ? visual.columnDimension
      : null;
    const rowDimension = requestedRow || entityDimension || dimensions[0] || null;
    const columnDimension =
      requestedColumn && requestedColumn !== rowDimension
        ? requestedColumn
        : timeDimension && timeDimension !== rowDimension
          ? timeDimension
          : dimensions.find((dimension) => dimension !== rowDimension) || null;

    if (rowDimension && columnDimension && rowDimension !== columnDimension) {
      const repaired = {
        ...visual,
        type: "pivot_table",
        metrics,
        dimensions: unique([...dimensions, rowDimension, columnDimension]),
        rowDimension,
        columnDimension,
      };
      const repairedLayout =
        requestedRow !== rowDimension || requestedColumn !== columnDimension;
      return {
        visual: repaired,
        assumptions: repairedLayout
          ? [
              assumption(
                "repaired_visual_layout",
                `${requestedRow || "missing row"} / ${requestedColumn || "missing column"}`,
                `${rowDimension} / ${columnDimension}`,
                `Used ${labelForDimension(rowDimension)} as rows and ${labelForDimension(
                  columnDimension,
                )} as columns for the pivot table.`,
              ),
            ]
          : [],
        issue: null,
      };
    }

    return {
      visual,
      assumptions: [],
      issue: incompatibleChartIssue(
        visual.type,
        "Pivot tables require distinct row and column dimensions.",
        "Show spend by campaign group by week as a pivot table.",
      ),
    };
  }

  if (visual.type === "scatter_chart") {
    if (entityDimension && metrics.length >= 2) {
      return {
        visual: { ...visual, metrics: metrics.slice(0, 2), dimensions: unique([...dimensions, entityDimension]) },
        assumptions: [],
        issue: null,
      };
    }

    if (entityDimension && metrics.length === 1) {
      return {
        visual: { ...visual, type: "bar_chart", metrics, dimensions },
        assumptions: [
          assumption(
            "repaired_visual_type",
            "scatter_chart",
            "bar_chart",
            "Changed scatter chart to bar chart because only one numeric metric was available.",
          ),
        ],
        issue: null,
      };
    }

    return {
      visual,
      assumptions: [],
      issue: incompatibleChartIssue(
        visual.type,
        "Scatter charts require one entity dimension and two numeric metrics.",
        "Show spend versus CPL by campaign group as a scatter chart.",
      ),
    };
  }

  return { visual: { ...visual, metrics, dimensions }, assumptions: [], issue: null };
}

function incompatibleChartIssue(
  visualType: WorkbenchVisualType,
  message: string,
  suggestedRequest: string,
): WorkbenchSemanticIssue {
  return {
    code: "incompatible_chart",
    field: "visual",
    value: visualType,
    message: `${message} Try: "${suggestedRequest}"`,
    suggestedRequest,
  };
}

function normalizeCampaignUmbrellas(value: string | string[] | null | undefined) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.map(repairCampaignUmbrellaValue).filter((candidate): candidate is string => Boolean(candidate));
}

function ruleForUmbrella(umbrella: string): PrimaryKpiRule {
  return (
    PRIMARY_KPI_RULES.find((rule) => rule.appliesToCampaignUmbrellas.includes(umbrella)) ||
    PRIMARY_KPI_RULES[PRIMARY_KPI_RULES.length - 1]
  );
}

function isMetric(value: string): value is WorkbenchMetric {
  return WORKBENCH_METRICS.includes(value as WorkbenchMetric);
}

function isDimension(value: string): value is WorkbenchDimension {
  return WORKBENCH_DIMENSIONS.includes(value as WorkbenchDimension);
}

function isFilterField(value: string): value is WorkbenchFilterField {
  return WORKBENCH_FILTERS.includes(value as WorkbenchFilterField);
}

function isDateGrain(value: string): value is WorkbenchDateGrain {
  return WORKBENCH_DATE_GRAINS.includes(value as WorkbenchDateGrain);
}

function isVisualType(value: string): value is WorkbenchVisualType {
  return WORKBENCH_VISUAL_TYPES.includes(value as WorkbenchVisualType);
}

function labelForFilterValue(field: string) {
  if (field === "campaign_umbrella") return "group";
  return field;
}

function labelForDimension(dimension: string) {
  if (dimension === "campaign_umbrella") return "campaign group";
  return dimension.replace(/_/g, " ");
}

function normalizeToken(value: string) {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[()/.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}
