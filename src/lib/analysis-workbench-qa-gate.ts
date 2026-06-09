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
import { CAMPAIGN_UMBRELLAS } from "./campaign-umbrellas.ts";
import type { AgentLedgerEntry } from "./analysis-workbench-agent.ts";

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
      needsDelta?: boolean;
      needsNumbers?: boolean;
      needsSpecificEntity?: boolean;
      forbidsRawIds?: boolean;
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
        { type: "bar_chart", metrics: ["primary_results"], dimension: "campaign_umbrella" },
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
    id: "marketing-creative-week-over-week",
    persona: "marketing",
    requestType: "creative_week_over_week",
    mode: "answer_visuals",
    prompt:
      "Which ad creative in the Book Appointments campaign performed the best week-over-week? Organize this by week and specific ad creative name. Do this for the past four weeks.",
    expected: {
      status: "ready",
      requiredDimensions: ["week", "creative"],
      requiredFilters: [
        { field: "campaign_umbrella", operator: "equals", value: "Book Appts US" },
      ],
      requiredVisuals: [
        { type: "flat_table", minRows: 1 },
        { type: "pivot_table", minRows: 1 },
      ],
      minTableRows: 1,
      requirePageObjects: true,
      seniorInsight: {
        needsComparison: true,
        needsDelta: true,
        needsNumbers: true,
        needsSpecificEntity: true,
        forbidsRawIds: true,
      },
    },
  },
  {
    id: "marketing-cash-for-gold-weekly-performance",
    persona: "marketing",
    requestType: "cash_for_gold_week_over_week",
    mode: "answer_visuals",
    prompt:
      "I want a week-over-week analysis of Cash for Gold ad performance in terms of the primary KPI, messaging contacts and spend.",
    expected: {
      status: "ready",
      requiredMetrics: ["messaging_contacts", "spend"],
      requiredDimensions: ["week"],
      requiredFilters: [
        { field: "campaign_umbrella", operator: "equals", value: "Cash for Gold US" },
      ],
      requiredVisuals: [
        { type: "flat_table", metrics: ["messaging_contacts", "spend"], minRows: 1 },
        { type: "line_chart", metrics: ["messaging_contacts"], dimension: "week" },
      ],
      minTableRows: 1,
      requirePageObjects: true,
      seniorInsight: { needsComparison: true, needsDelta: true, needsNumbers: true },
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

// ---------------------------------------------------------------------------
// Agent path eval set (Phase 4)
//
// The agent answers freely and chooses its own visuals, so this gate does not
// assert a templated metric/dimension/chart menu. It asserts the qualities that
// matter: every figure is real (traceable to a query result, nothing redacted),
// the question was actually answered, no entity was invented, and the chosen
// visual fits the question (or was correctly omitted). Each case carries a
// representative "good run" script (the planned tool calls + the answer and
// visuals a sound agent would submit) so the gate is reproducible with fakes —
// no live model call.
// ---------------------------------------------------------------------------

/** Whether the answer should carry a visual, must omit one, or either is fine. */
export type AnalysisWorkbenchAgentQaVisual = "required" | "forbidden" | "optional";

export type AnalysisWorkbenchAgentQaScriptCall = {
  name: "query_performance" | "query_entities";
  args: Record<string, unknown>;
};

export type AnalysisWorkbenchAgentQaScript = {
  calls: AnalysisWorkbenchAgentQaScriptCall[];
  answer: string;
  visuals: Array<Record<string, unknown>>;
};

export type AnalysisWorkbenchAgentQaCase = {
  id: string;
  persona: AnalysisWorkbenchQaPersona;
  requestType: string;
  mode: AnalysisOutputMode;
  prompt: string;
  script: AnalysisWorkbenchAgentQaScript;
  expected: {
    /** Substrings the answer must contain (case-insensitive) — proves it answered. */
    mustMention?: string[];
    visual: AnalysisWorkbenchAgentQaVisual;
    /** If a visual is required, at least one card must be one of these types. */
    visualTypeAny?: Array<AnalysisWorkbenchVisualCard["type"]>;
    minVisuals?: number;
    /** Dashboard: assert a varied, data-appropriate mix, not a canned set. */
    requireVisualVariety?: boolean;
    requireDashboardPacket?: boolean;
  };
};

export const ANALYSIS_WORKBENCH_AGENT_QA_CASES: AnalysisWorkbenchAgentQaCase[] = [
  {
    id: "status-us-vn-product-active",
    persona: "edge_case",
    requestType: "entity_status_roster",
    mode: "answer_visuals",
    prompt:
      "Can you please check whether the US Product and VN Product ads are still active, or if they have already been turned off?",
    script: {
      calls: [
        { name: "query_entities", args: { entityType: "ad", filters: { campaignUmbrella: "Facebook US Product" } } },
        { name: "query_entities", args: { entityType: "ad", filters: { campaignUmbrella: "Facebook VN Product" } } },
      ],
      answer:
        "The US Product ads are still running — 2 are live and 1 is paused, with none fully turned off. For VN Product, only 1 ad is live while 2 have been turned off.",
      visuals: [],
    },
    expected: {
      mustMention: ["live", "paused"],
      visual: "forbidden",
    },
  },
  {
    id: "trend-weekly-spend-2026",
    persona: "analyst",
    requestType: "spend_trend",
    mode: "answer_visuals",
    prompt: "How has our weekly ad spend trended across 2026?",
    script: {
      calls: [
        {
          name: "query_performance",
          args: {
            start: "2026-01-01",
            end: "2026-05-24",
            metrics: ["spend"],
            dimensions: ["week"],
            sortField: "week",
            sortDirection: "asc",
          },
        },
      ],
      answer:
        "Weekly spend climbed to a peak of $3,900, then pulled back to $900 before recovering to $1,300 in the latest week.",
      visuals: [
        { type: "line_chart", title: "Weekly spend", sourceCallId: "Q1", metric: "spend", dimension: "week" },
      ],
    },
    expected: {
      mustMention: ["spend"],
      visual: "required",
      visualTypeAny: ["line_chart"],
    },
  },
  {
    id: "creative-winners-cash-for-gold",
    persona: "marketing",
    requestType: "creative_breakdown",
    mode: "answer_visuals",
    prompt: "Which Cash for Gold creatives are winning on messaging contacts over the last month?",
    script: {
      calls: [
        {
          name: "query_performance",
          args: {
            start: "2026-04-25",
            end: "2026-05-24",
            metrics: ["messaging_contacts", "spend"],
            dimensions: ["creative"],
            filters: [{ field: "campaign_umbrella", operator: "contains", value: "Cash for Gold" }],
            sortField: "messaging_contacts",
            sortDirection: "desc",
          },
        },
      ],
      answer:
        "Gold Story A is the clear winner with 240 messaging contacts on $1,800 spend, far ahead of Offer Test B's 72 contacts on $900.",
      visuals: [
        {
          type: "bar_chart",
          title: "Messaging contacts by creative",
          sourceCallId: "Q1",
          metric: "messaging_contacts",
          dimension: "creative",
        },
      ],
    },
    expected: {
      mustMention: ["messaging contacts"],
      visual: "required",
      visualTypeAny: ["bar_chart"],
    },
  },
  {
    id: "budget-by-group",
    persona: "manager",
    requestType: "budget_question",
    mode: "answer_visuals",
    prompt: "How does spend compare to the monthly budget across our campaign groups this month?",
    script: {
      calls: [
        {
          name: "query_performance",
          args: {
            start: "2026-05-01",
            end: "2026-05-31",
            metrics: ["spend", "monthly_budget"],
            dimensions: ["campaign_umbrella"],
            sortField: "spend",
            sortDirection: "desc",
          },
        },
      ],
      answer:
        "Book Appts US has the largest footprint at $4,700 spend against a $24,000 monthly budget, followed by Cash for Gold US at $2,700 and Facebook US Product at $1,300.",
      visuals: [
        { type: "flat_table", title: "Spend vs monthly budget by group", sourceCallId: "Q1" },
        { type: "bar_chart", title: "Spend by group", sourceCallId: "Q1", metric: "spend", dimension: "campaign_umbrella" },
      ],
    },
    expected: {
      mustMention: ["budget"],
      visual: "required",
      visualTypeAny: ["flat_table", "bar_chart"],
    },
  },
  {
    id: "full-dashboard-may-overview",
    persona: "manager",
    requestType: "full_dashboard_overview",
    mode: "full_dashboard",
    prompt: "Build me a full dashboard on this month's performance by campaign group.",
    script: {
      calls: [
        {
          name: "query_performance",
          args: {
            start: "2026-05-01",
            end: "2026-05-31",
            metrics: ["spend", "messaging_contacts", "primary_results"],
            dimensions: ["campaign_umbrella"],
            sortField: "spend",
            sortDirection: "desc",
          },
        },
        {
          name: "query_performance",
          args: {
            start: "2026-01-01",
            end: "2026-05-24",
            metrics: ["spend"],
            dimensions: ["week"],
            sortField: "week",
            sortDirection: "asc",
          },
        },
      ],
      answer:
        "Across May, Book Appts US led spend at $4,700 with 79 messaging contacts; Cash for Gold US drove the most contacts at 312 on $2,700. Weekly spend peaked at $3,900.",
      visuals: [
        { type: "flat_table", title: "Performance by group", sourceCallId: "Q1" },
        { type: "bar_chart", title: "Spend by group", sourceCallId: "Q1", metric: "spend", dimension: "campaign_umbrella" },
        { type: "line_chart", title: "Weekly spend", sourceCallId: "Q2", metric: "spend", dimension: "week" },
      ],
    },
    expected: {
      mustMention: ["spend"],
      visual: "required",
      minVisuals: 3,
      requireVisualVariety: true,
      requireDashboardPacket: true,
    },
  },
  {
    id: "free-form-messaging-drivers",
    persona: "analyst",
    requestType: "free_form",
    mode: "answer_visuals",
    prompt: "What's been driving most of our messaging contacts recently?",
    script: {
      calls: [
        {
          name: "query_performance",
          args: {
            start: "2026-04-24",
            end: "2026-05-24",
            metrics: ["messaging_contacts", "spend"],
            dimensions: ["campaign_umbrella"],
            sortField: "messaging_contacts",
            sortDirection: "desc",
          },
        },
      ],
      answer:
        "Most messaging contacts are coming from Cash for Gold US — 312 in the last month, well above Facebook US Product's 110 and Book Appts US's 79.",
      visuals: [
        {
          type: "bar_chart",
          title: "Messaging contacts by group",
          sourceCallId: "Q1",
          metric: "messaging_contacts",
          dimension: "campaign_umbrella",
        },
      ],
    },
    expected: {
      mustMention: ["messaging"],
      visual: "required",
      visualTypeAny: ["bar_chart"],
    },
  },
  {
    id: "free-form-spend-read-answer-only",
    persona: "manager",
    requestType: "free_form",
    mode: "answer_only",
    prompt: "Give me a quick read on how our spend has been trending.",
    script: {
      calls: [
        {
          name: "query_performance",
          args: {
            start: "2026-01-01",
            end: "2026-05-24",
            metrics: ["spend"],
            dimensions: ["week"],
            sortField: "week",
            sortDirection: "asc",
          },
        },
      ],
      answer:
        "Spend ran near $2,600 early on, peaked around $3,900, then settled between $900 and $1,300 in the most recent weeks.",
      visuals: [],
    },
    expected: {
      mustMention: ["spend"],
      visual: "forbidden",
    },
  },
  {
    id: "free-form-revenue-roas-not-tracked",
    persona: "edge_case",
    requestType: "free_form_unsupported",
    mode: "answer_visuals",
    prompt: "Which campaigns drove the most sales revenue and ROAS last month?",
    script: {
      calls: [
        { name: "query_performance", args: { start: "2026-05-01", end: "2026-05-31", metrics: ["revenue"] } },
      ],
      answer:
        "This workbench doesn't track sales revenue or ROAS — those depend on CRM and transaction data we don't ingest here. I can report Meta-side metrics like spend and messaging contacts instead.",
      visuals: [],
    },
    expected: {
      mustMention: ["revenue", "roas"],
      visual: "forbidden",
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

// ---------------------------------------------------------------------------
// Agent path evaluator (Phase 4)
// ---------------------------------------------------------------------------

const AGENT_CHART_TYPES = new Set<AnalysisWorkbenchVisualCard["type"]>([
  "bar_chart",
  "line_chart",
  "scatter_chart",
]);
const AGENT_TABLE_TYPES = new Set<AnalysisWorkbenchVisualCard["type"]>(["flat_table", "pivot_table"]);

export function evaluateAnalysisWorkbenchAgentQaCase(
  qaCase: AnalysisWorkbenchAgentQaCase,
  result: AnalysisWorkbenchPipelineResult,
  options: { ledger?: AgentLedgerEntry[]; renderedPageText?: string } = {},
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

  if (result.status !== "completed") {
    fail(`expected completed agent run, got ${result.status}`, 30, "agent loop");
  }

  const answer = result.answer.summary.trim();
  if (!answer) {
    missing("agent answer missing summary", 30, "agent answer");
  }
  const lowerAnswer = answer.toLowerCase();

  // (a) Numbers are real: every figure traces to a query result and nothing was redacted.
  const grounding = agentGroundingMeta(result.intent);
  if (!grounding || grounding.status !== "grounded" || (grounding.untraceable?.length ?? 0) > 0) {
    fail(
      `answer carries figures not traceable to query results: ${
        grounding?.untraceable?.join(", ") || "grounding metadata missing"
      }`,
      40,
      "grounding",
    );
  }
  if (/\(unverified\)/.test(answer)) {
    fail("answer shipped a redacted (unverified) figure", 25, "grounding");
  }
  const withheld = result.validation.warnings.filter(
    (warning) => warning.code === "withheld_unverified_figure",
  );
  if (withheld.length) {
    fail(`grounding withheld ${withheld.length} unverified figure(s)`, 15, "grounding", false);
  }

  // (b) It answered the question.
  (qaCase.expected.mustMention || []).forEach((needle) => {
    if (!lowerAnswer.includes(needle.toLowerCase())) {
      fail(`answer does not address "${needle}"`, 12, "answer relevance");
    }
  });

  // (c) No fabricated entities: any named campaign group must appear in the queried evidence.
  const evidence = buildAgentEvidenceText(options.ledger || [], result);
  CAMPAIGN_UMBRELLAS.forEach((umbrella) => {
    const needle = umbrella.toLowerCase();
    if (lowerAnswer.includes(needle) && !evidence.includes(needle)) {
      fail(`answer names entity "${umbrella}" not present in queried data`, 20, "fabricated entity");
    }
  });
  if (/\b\d{10,}\b/.test(answer)) {
    fail("answer includes a raw technical entity ID", 15, "entity display");
  }

  // (d) The chosen visual fits — or was correctly omitted.
  evaluateAgentVisuals(result, qaCase.expected, fail, missing);

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

function evaluateAgentVisuals(
  result: AnalysisWorkbenchPipelineResult,
  expected: AnalysisWorkbenchAgentQaCase["expected"],
  fail: (message: string, scorePenalty: number, nextFixArea: string, critical?: boolean) => void,
  missing: (message: string, scorePenalty: number, nextFixArea: string) => void,
) {
  const cards = result.visualCards;

  if (expected.visual === "forbidden" && cards.length) {
    fail(
      `expected no visual but got ${cards.length} (${cards.map((card) => card.type).join(", ")})`,
      18,
      "visual selection",
    );
  }

  if (expected.visual === "required") {
    if (!cards.length) {
      missing("expected a supporting visual, got none", 15, "visual selection");
    } else if (
      expected.visualTypeAny?.length &&
      !cards.some((card) => expected.visualTypeAny!.includes(card.type))
    ) {
      fail(
        `expected a ${expected.visualTypeAny.join(" or ")} visual, got ${cards
          .map((card) => card.type)
          .join(", ")}`,
        12,
        "visual selection",
      );
    }
  }

  if (expected.minVisuals && cards.length < expected.minVisuals) {
    missing(`expected at least ${expected.minVisuals} visuals, got ${cards.length}`, 12, "visual selection");
  }

  if (expected.requireVisualVariety) {
    const types = new Set(cards.map((card) => card.type));
    const hasChart = cards.some((card) => AGENT_CHART_TYPES.has(card.type));
    const hasTable = cards.some((card) => AGENT_TABLE_TYPES.has(card.type));
    if (types.size < 2 || !hasChart || !hasTable) {
      fail(
        "dashboard visual mix is not varied (need >=2 distinct types including a chart and a table)",
        15,
        "dashboard composition",
      );
    }
  }

  if (expected.requireDashboardPacket && !result.dashboardPacket) {
    missing("full dashboard packet missing", 15, "dashboard packet");
  }
}

function agentGroundingMeta(
  intent: AnalysisWorkbenchPipelineResult["intent"],
): { status?: string; untraceable?: string[] } | null {
  const value =
    intent && typeof intent === "object"
      ? (intent as Record<string, unknown>).grounding
      : null;
  return value && typeof value === "object"
    ? (value as { status?: string; untraceable?: string[] })
    : null;
}

function buildAgentEvidenceText(
  ledger: AgentLedgerEntry[],
  result: AnalysisWorkbenchPipelineResult,
): string {
  const parts: string[] = [];

  for (const entry of ledger) {
    parts.push(entry.summary);
    for (const row of entry.rows) {
      for (const value of Object.values(row)) {
        if (typeof value === "string") parts.push(value);
      }
    }
  }

  // Fall back to the mapped surfaces so the check still works without a ledger.
  result.sourceNotes.forEach((note) => {
    parts.push(note.label);
    if (typeof note.value === "string") parts.push(note.value);
  });
  result.visualCards.forEach((card) => parts.push(...visualSearchText(card)));

  return parts.join(" ").toLowerCase();
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
  if (expected.needsDelta && !/\b(?:above|below|versus|vs|change|changed|delta|[+-]\$?\d|[+-]\d)/.test(text)) {
    noteFailure("senior insight missing week-over-week delta");
  }
  if (expected.needsSpecificEntity && !/(book appts|cash for gold|gold story|offer test|facebook us product)/i.test(text)) {
    noteFailure("senior insight missing specific entity name");
  }
  if (expected.needsAction && !/\b(inspect|review|scale|pause|shift|move|monitor|test)\b/.test(text)) {
    noteFailure("senior insight missing action recommendation");
  }
  if (expected.forbidsRawIds && /\b\d{10,}\b/.test(text)) {
    fail("visible output includes raw technical entity ID", 20, "entity display enrichment");
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
