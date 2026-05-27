import type { AnalysisOutputMode, AnalysisWorkbenchVisualCard } from "./analysis-workbench-contract.ts";
import {
  validateAnalysisWorkbenchNarrativeGrounding,
  type AnalysisWorkbenchCitation,
  type AnalysisWorkbenchPipelineResult,
} from "./analysis-workbench-pipeline.ts";
import type {
  WorkbenchDimension,
  WorkbenchMetric,
} from "./analysis-workbench-semantic-catalog.ts";

export const ANALYSIS_WORKBENCH_QA_PASSING = {
  minScore: 90,
  maxCriticalFailures: 0,
  requireAllObjects: true,
} as const;

export type AnalysisWorkbenchQaPersona = "analyst" | "manager" | "marketing" | "edge_case";
export type AnalysisWorkbenchQaExpectedStatus = "ready" | "unsupported";

export type AnalysisWorkbenchQaRequiredVisual = {
  type?: AnalysisWorkbenchVisualCard["type"];
  typeAny?: Array<AnalysisWorkbenchVisualCard["type"]>;
  metrics?: WorkbenchMetric[];
  dimension?: WorkbenchDimension;
  minRows?: number;
};

export type AnalysisWorkbenchQaCase = {
  id: string;
  persona: AnalysisWorkbenchQaPersona;
  requestType: string;
  mode: AnalysisOutputMode;
  prompt: string;
  expected: {
    status: AnalysisWorkbenchQaExpectedStatus;
    requiredMetrics?: WorkbenchMetric[];
    requiredDimensions?: WorkbenchDimension[];
    requiredFilters?: Array<{ field: string; operator: string; value: string }>;
    requiredVisuals?: AnalysisWorkbenchQaRequiredVisual[];
    minTableRows?: number;
    requiredUnsupportedCodes?: string[];
    requiredDashboardPacket?: boolean;
    requirePageObjects?: boolean;
    seniorInsight?: {
      needsAction?: boolean;
      needsComparison?: boolean;
      needsNumbers?: boolean;
      needsSpecificEntity?: boolean;
    };
  };
};

export type AnalysisWorkbenchQaEvaluation = {
  id: string;
  persona: AnalysisWorkbenchQaPersona;
  requestType: string;
  prompt: string;
  mode: AnalysisOutputMode;
  score: number;
  passed: boolean;
  criticalFailures: string[];
  missingObjects: string[];
  validationFailures: string[];
  nextFixAreas: string[];
};

export const ANALYSIS_WORKBENCH_QA_CASES: AnalysisWorkbenchQaCase[] = [
  {
    id: "analyst-weekly-umbrella-diagnosis",
    persona: "analyst",
    requestType: "performance_diagnosis",
    mode: "answer_visuals",
    prompt:
      "Diagnose spend and primary KPI by campaign group for the last 4 weeks. Show a table and bar chart that explains what changed.",
    expected: {
      status: "ready",
      requiredMetrics: ["spend", "primary_results"],
      requiredDimensions: ["campaign_umbrella"],
      requiredVisuals: [
        { type: "flat_table", metrics: ["spend", "primary_results"], minRows: 1 },
        { type: "bar_chart", metrics: ["spend"], dimension: "campaign_umbrella" },
      ],
      minTableRows: 1,
      requirePageObjects: true,
      seniorInsight: { needsComparison: true, needsNumbers: true },
    },
  },
  {
    id: "manager-budget-dashboard",
    persona: "manager",
    requestType: "budget_reallocation",
    mode: "full_dashboard",
    prompt:
      "Which campaign groups should we move budget toward or away from this month? Show spend, monthly budget, primary KPI, and CPM by campaign group. Build a full dashboard with a prioritized recommendation.",
    expected: {
      status: "ready",
      requiredMetrics: ["spend", "monthly_budget", "primary_results", "cpm"],
      requiredDimensions: ["campaign_umbrella"],
      requiredVisuals: [
        { type: "flat_table", metrics: ["spend", "monthly_budget", "primary_results"], minRows: 1 },
        { type: "bar_chart", metrics: ["spend"], dimension: "campaign_umbrella" },
      ],
      minTableRows: 1,
      requiredDashboardPacket: true,
      requirePageObjects: true,
      seniorInsight: { needsAction: true, needsComparison: true, needsNumbers: true },
    },
  },
  {
    id: "marketing-creative-winners",
    persona: "marketing",
    requestType: "creative_winners_losers",
    mode: "answer_visuals",
    prompt:
      "Find creative winners and losers for Cash for Gold over the last 30 days. Show messages, spend, CTR, CPC, and a bar chart by creative. Tell me which creative angle to test next.",
    expected: {
      status: "ready",
      requiredMetrics: ["messaging_contacts", "spend", "ctr", "cpc"],
      requiredDimensions: ["creative"],
      requiredFilters: [
        { field: "campaign_umbrella", operator: "equals", value: "Cash for Gold US" },
      ],
      requiredVisuals: [
        { type: "flat_table", metrics: ["messaging_contacts", "spend"], minRows: 1 },
        { type: "bar_chart", metrics: ["spend"], dimension: "creative" },
      ],
      minTableRows: 1,
      requirePageObjects: true,
      seniorInsight: { needsNumbers: true, needsSpecificEntity: true },
    },
  },
  {
    id: "analyst-weekly-spend-2026-entire",
    persona: "analyst",
    requestType: "natural_language_weekly_trend",
    mode: "answer_visuals",
    prompt: "week by week ad spend for the entire of 2026",
    expected: {
      status: "ready",
      requiredMetrics: ["spend"],
      requiredDimensions: ["week"],
      requiredVisuals: [{ type: "line_chart", metrics: ["spend"], dimension: "week" }],
      requirePageObjects: true,
      seniorInsight: { needsNumbers: true },
    },
  },
  {
    id: "analyst-weekly-spend-2026-variant",
    persona: "analyst",
    requestType: "natural_language_weekly_trend",
    mode: "answer_visuals",
    prompt: "break down our 2026 ad spend by week",
    expected: {
      status: "ready",
      requiredMetrics: ["spend"],
      requiredDimensions: ["week"],
      requiredVisuals: [{ type: "line_chart", metrics: ["spend"], dimension: "week" }],
      requirePageObjects: true,
      seniorInsight: { needsNumbers: true },
    },
  },
  {
    id: "edge-no-fake-revenue-roas",
    persona: "edge_case",
    requestType: "unsupported_revenue_roas",
    mode: "answer_visuals",
    prompt:
      "Which Meta campaigns drove the most sales revenue and ROAS last month? Show revenue, ROAS, and booked appointments by campaign.",
    expected: {
      status: "unsupported",
      requiredUnsupportedCodes: ["unsupported_revenue", "unsupported_roas"],
      requirePageObjects: true,
    },
  },
];

export function evaluateAnalysisWorkbenchQaCase(
  qaCase: AnalysisWorkbenchQaCase,
  result: AnalysisWorkbenchPipelineResult,
  options: { renderedPageText?: string } = {},
): AnalysisWorkbenchQaEvaluation {
  const criticalFailures: string[] = [];
  const missingObjects: string[] = [];
  const validationFailures: string[] = [];
  const nextFixAreas = new Set<string>();
  let score = 100;

  const fail = (message: string, scorePenalty: number, nextFixArea: string, critical = true) => {
    if (critical) criticalFailures.push(message);
    else validationFailures.push(message);
    score -= scorePenalty;
    nextFixAreas.add(nextFixArea);
  };
  const missing = (message: string, scorePenalty: number, nextFixArea: string) => {
    missingObjects.push(message);
    score -= scorePenalty;
    nextFixAreas.add(nextFixArea);
  };

  if (qaCase.expected.status === "unsupported") {
    evaluateUnsupportedCase(result, qaCase, fail, missing);
  } else {
    evaluateReadyCase(result, qaCase, fail, missing, validationFailures, nextFixAreas);
  }

  if (qaCase.expected.requirePageObjects) {
    evaluateRenderedPage(options.renderedPageText || "", qaCase, missing);
  }

  const normalizedScore = Math.max(0, Math.round(score));
  const passed =
    normalizedScore >= ANALYSIS_WORKBENCH_QA_PASSING.minScore &&
    criticalFailures.length <= ANALYSIS_WORKBENCH_QA_PASSING.maxCriticalFailures &&
    (!ANALYSIS_WORKBENCH_QA_PASSING.requireAllObjects || missingObjects.length === 0);

  return {
    id: qaCase.id,
    persona: qaCase.persona,
    requestType: qaCase.requestType,
    prompt: qaCase.prompt,
    mode: qaCase.mode,
    score: normalizedScore,
    passed,
    criticalFailures,
    missingObjects,
    validationFailures,
    nextFixAreas: [...nextFixAreas],
  };
}

export function formatAnalysisWorkbenchQaReport(
  evaluations: AnalysisWorkbenchQaEvaluation[],
  options: { filesChanged?: string[]; commands?: string[] } = {},
) {
  const passed = evaluations.every((evaluation) => evaluation.passed);
  const lines = [
    "# Analysis Workbench QA Report",
    "",
    `Overall: ${passed ? "PASS" : "FAIL"}`,
    `Passing bar: score >= ${ANALYSIS_WORKBENCH_QA_PASSING.minScore}, critical failures <= ${ANALYSIS_WORKBENCH_QA_PASSING.maxCriticalFailures}, required objects present.`,
    "",
    "## Cases",
    "",
  ];

  evaluations.forEach((evaluation) => {
    lines.push(
      `### ${evaluation.id}`,
      "",
      `Persona: ${evaluation.persona}`,
      `Request type: ${evaluation.requestType}`,
      `Prompt: ${evaluation.prompt}`,
      `Mode: ${evaluation.mode}`,
      `Score: ${evaluation.score}`,
      `Result: ${evaluation.passed ? "PASS" : "FAIL"}`,
      `Missing objects: ${listOrNone(evaluation.missingObjects)}`,
      `Validation failures: ${listOrNone(evaluation.validationFailures)}`,
      `Critical failures: ${listOrNone(evaluation.criticalFailures)}`,
      `Next fix area: ${listOrNone(evaluation.nextFixAreas)}`,
      "",
    );
  });

  if (options.filesChanged?.length) {
    lines.push("## Files Changed", "", ...options.filesChanged.map((file) => `- ${file}`), "");
  }

  if (options.commands?.length) {
    lines.push("## Commands", "", ...options.commands.map((command) => `- \`${command}\``), "");
  }

  return lines.join("\n");
}

function evaluateUnsupportedCase(
  result: AnalysisWorkbenchPipelineResult,
  qaCase: AnalysisWorkbenchQaCase,
  fail: (message: string, scorePenalty: number, nextFixArea: string, critical?: boolean) => void,
  missing: (message: string, scorePenalty: number, nextFixArea: string) => void,
) {
  const blockerCodes = validationIssueCodes(result.validation, "blockers");
  if (result.queryPlan.status !== "blocked" || result.validation.status !== "blocked") {
    fail("unsupported request was not blocked by governed validator", 35, "semantic validator");
  }

  (qaCase.expected.requiredUnsupportedCodes || []).forEach((code) => {
    if (!blockerCodes.includes(code)) {
      fail(`missing unsupported blocker ${code}`, 15, "semantic validator");
    }
  });

  if (result.status === "completed" || result.visualCards.length) {
    fail("unsupported request produced ready output or visual cards", 25, "pipeline blocking");
  }

  if (!result.sourceNotes.length) {
    missing("unsupported response missing source/validation note", 10, "source notes");
  }
}

function evaluateReadyCase(
  result: AnalysisWorkbenchPipelineResult,
  qaCase: AnalysisWorkbenchQaCase,
  fail: (message: string, scorePenalty: number, nextFixArea: string, critical?: boolean) => void,
  missing: (message: string, scorePenalty: number, nextFixArea: string) => void,
  validationFailures: string[],
  nextFixAreas: Set<string>,
) {
  if (result.status !== "completed") {
    fail(`expected completed run, got ${result.status}`, 30, "pipeline execution");
  }
  if (result.queryPlan.status !== "ready") {
    fail(`expected ready query plan, got ${result.queryPlan.status}`, 20, "query planner");
  }
  if (result.validation.status !== "ready" || result.validation.blockers.length) {
    fail("ready request has validation blockers", 30, "semantic validator");
  }

  const intent = objectValue(result.intent);
  const metrics = stringArray(intent.metrics);
  const dimensions = stringArray(intent.dimensions);
  const filters = Array.isArray(intent.filters) ? intent.filters : [];

  (qaCase.expected.requiredMetrics || []).forEach((metric) => {
    if (!metrics.includes(metric)) {
      fail(`missing metric ${metric}`, 8, "intent planner");
    }
  });

  (qaCase.expected.requiredDimensions || []).forEach((dimension) => {
    if (!dimensions.includes(dimension)) {
      fail(`missing dimension ${dimension}`, 8, "intent planner");
    }
  });

  (qaCase.expected.requiredFilters || []).forEach((expectedFilter) => {
    const found = filters.some(
      (filter) =>
        objectValue(filter).field === expectedFilter.field &&
        objectValue(filter).operator === expectedFilter.operator &&
        objectValue(filter).value === expectedFilter.value,
    );
    if (!found) fail(`missing filter ${expectedFilter.field}=${expectedFilter.value}`, 8, "intent planner");
  });

  if (!result.answer.summary.trim()) {
    missing("answer object missing summary", 15, "answer composer");
  }
  const groundingIssues = validateAnalysisWorkbenchNarrativeGrounding(
    result.answer.summary,
    result.answer.citations as AnalysisWorkbenchCitation[],
  );
  if (groundingIssues.length) {
    fail(
      `numeric claims not mapped to computed facts: ${groundingIssues
        .map((issue) => issue.value || issue.code)
        .join(", ")}`,
      20,
      "numeric claim grounding",
    );
  }

  if (!result.sourceNotes.length) {
    missing("source note object missing", 12, "source notes");
  }

  (qaCase.expected.requiredVisuals || []).forEach((requiredVisual) => {
    const visual = findVisual(result.visualCards, requiredVisual);
    if (!visual) {
      missing(`required visual missing: ${requiredVisualLabel(requiredVisual)}`, 12, "visual planner");
      return;
    }

    if (requiredVisual.minRows && visual.type === "flat_table" && visual.rows.length < requiredVisual.minRows) {
      missing(`table has ${visual.rows.length} rows, expected ${requiredVisual.minRows}`, 12, "fact engine");
    }
  });

  const tableRows = result.visualCards
    .filter((card): card is Extract<AnalysisWorkbenchVisualCard, { type: "flat_table" }> => card.type === "flat_table")
    .reduce((count, card) => count + card.rows.length, 0);
  if (qaCase.expected.minTableRows && tableRows < qaCase.expected.minTableRows) {
    missing(`evidence table has ${tableRows} rows, expected ${qaCase.expected.minTableRows}`, 12, "fact engine");
  }

  if (qaCase.expected.requiredDashboardPacket && !result.dashboardPacket) {
    missing("full dashboard packet missing", 15, "dashboard packet builder");
  }

  evaluateSeniorUsefulness(result, qaCase, fail);
}

function evaluateSeniorUsefulness(
  result: AnalysisWorkbenchPipelineResult,
  qaCase: AnalysisWorkbenchQaCase,
  fail: (message: string, scorePenalty: number, nextFixArea: string, critical?: boolean) => void,
) {
  const expected = qaCase.expected.seniorInsight;
  if (!expected) return;

  const text = [
    result.answer.summary,
    ...result.visualCards.flatMap(visualSearchText),
    ...(result.dashboardPacket?.nextActions || []).map((action) => `${action.title} ${action.detail}`),
  ]
    .join(" ")
    .toLowerCase();
  const noteFailure = (message: string) => {
    fail(message, 8, "senior analyst usefulness", false);
  };

  if (expected.needsNumbers && !/\d/.test(text)) {
    noteFailure("senior insight missing concrete numbers");
  }
  if (expected.needsComparison && !/\b(top|above average|below average|average|versus|vs)\b/.test(text)) {
    noteFailure("senior insight missing comparison language");
  }
  if (expected.needsSpecificEntity && !/(book appts|cash for gold|gold story|offer test|facebook us product)/i.test(text)) {
    noteFailure("senior insight missing specific entity name");
  }
  if (expected.needsAction && !/\b(inspect|review|scale|pause|shift|move|monitor|test)\b/.test(text)) {
    noteFailure("senior insight missing action recommendation");
  }
}

function evaluateRenderedPage(
  renderedPageText: string,
  qaCase: AnalysisWorkbenchQaCase,
  missing: (message: string, scorePenalty: number, nextFixArea: string) => void,
) {
  const text = renderedPageText.toLowerCase();
  const expectedSections = ["answer", "source notes"];
  if (qaCase.expected.status === "ready") expectedSections.push("visual cards");
  if (qaCase.expected.requiredDashboardPacket) expectedSections.push("dashboard packet");
  if (qaCase.expected.status === "unsupported") expectedSections.push("run failed validation");

  expectedSections.forEach((section) => {
    if (!text.includes(section)) {
      missing(`page surface missing "${section}"`, 8, "analysis workbench page");
    }
  });
}

function findVisual(
  cards: AnalysisWorkbenchVisualCard[],
  required: AnalysisWorkbenchQaRequiredVisual,
) {
  return cards.find((card) => {
    const typeMatches = required.type
      ? card.type === required.type
      : required.typeAny
        ? required.typeAny.includes(card.type)
        : true;
    if (!typeMatches) return false;

    if (required.dimension && "dimension" in card && card.dimension !== required.dimension) {
      return false;
    }

    if (required.metrics?.length) {
      const cardMetrics = visualMetrics(card);
      return required.metrics.every((metric) => cardMetrics.includes(metric));
    }

    return true;
  });
}

function visualMetrics(card: AnalysisWorkbenchVisualCard): WorkbenchMetric[] {
  if (card.type === "metric_card" || card.type === "bar_chart" || card.type === "line_chart") {
    return [card.metric];
  }
  if (card.type === "flat_table") {
    return card.columns.map((column) => column.metric).filter(Boolean) as WorkbenchMetric[];
  }
  if (card.type === "pivot_table") return [card.metric];
  return [card.xMetric, card.yMetric];
}

function visualSearchText(card: AnalysisWorkbenchVisualCard): string[] {
  if (card.type === "flat_table") {
    return [
      card.title,
      ...card.rows.flatMap((row) => Object.values(row).map((value) => visualCellText(value))),
    ];
  }
  if (card.type === "bar_chart") {
    return [card.title, ...card.bars.flatMap((bar) => [bar.label, bar.formattedValue])];
  }
  if (card.type === "line_chart") {
    return [card.title, ...card.points.flatMap((point) => [point.label, point.formattedValue])];
  }
  if (card.type === "pivot_table") {
    return [
      card.title,
      ...card.rows.flatMap((row) => [
        row.rowLabel,
        visualCellText(row.total),
        ...Object.values(row.cells).map((value) => visualCellText(value)),
      ]),
    ];
  }
  if (card.type === "scatter_chart") {
    return [card.title, ...card.points.flatMap((point) => [point.label, point.formattedX, point.formattedY])];
  }

  return [card.title, card.formattedValue];
}

function visualCellText(value: unknown) {
  if (value && typeof value === "object" && "formattedValue" in value) {
    const formattedValue = (value as { formattedValue?: unknown }).formattedValue;
    return typeof formattedValue === "string" ? formattedValue : "";
  }

  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function validationIssueCodes(
  validation: AnalysisWorkbenchPipelineResult["validation"],
  key: "blockers" | "warnings",
) {
  return validation[key].map((issue) => issue.code);
}

function requiredVisualLabel(required: AnalysisWorkbenchQaRequiredVisual) {
  return required.type || required.typeAny?.join(" or ") || "visual";
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function listOrNone(values: string[]) {
  return values.length ? values.join("; ") : "none";
}
