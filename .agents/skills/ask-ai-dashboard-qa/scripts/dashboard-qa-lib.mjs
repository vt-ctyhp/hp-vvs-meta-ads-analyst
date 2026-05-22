import { readFile } from "node:fs/promises";

export const DEFAULT_MIN_SCORE = 90;

export async function readJson(path) {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
}

export function normalizeSuite(suite) {
  if (!suite || typeof suite !== "object" || !Array.isArray(suite.tests)) {
    throw new Error("Suite must be an object with tests[]");
  }
  return {
    version: suite.version || 1,
    name: suite.name || "Ask AI Dashboard QA Suite",
    passing: {
      minScore: suite.passing?.minScore || DEFAULT_MIN_SCORE,
      maxCriticalFailures: suite.passing?.maxCriticalFailures ?? 0,
      requireAllWidgets: suite.passing?.requireAllWidgets !== false,
    },
    tests: suite.tests.map(normalizeTest),
  };
}

export function normalizeTest(test) {
  if (!test?.id || !test?.prompt) throw new Error("Each test needs id and prompt");
  return {
    id: String(test.id),
    persona: test.persona || "analyst",
    requestType: test.requestType || "general",
    mode: test.mode === "deep" ? "deep" : "fast",
    prompt: String(test.prompt),
    runtimeContext: test.runtimeContext,
    defaultDateRange: test.defaultDateRange,
    expected: test.expected || {},
  };
}

export function scoreDashboardResult(test, result, options = {}) {
  const expected = test.expected || {};
  const findings = [];
  const criticalFailures = [];
  const category = {
    requestFit: 25,
    outputCompleteness: 25,
    dataTrust: 20,
    seniorUsefulness: 20,
    edgeCases: 10,
  };

  function fail(cat, points, message, critical = false) {
    category[cat] = Math.max(0, category[cat] - points);
    const item = { category: cat, points, message, critical };
    findings.push(item);
    if (critical) criticalFailures.push(item);
  }

  if (!result || typeof result !== "object") {
    fail("requestFit", 25, "Result is not a JSON object", true);
    fail("outputCompleteness", 25, "No dashboard output to inspect", true);
    fail("dataTrust", 20, "No source transparency", true);
    fail("seniorUsefulness", 20, "No answer", false);
    fail("edgeCases", 10, "No edge-case behavior", false);
    return finalizeScore(test, result, category, findings, criticalFailures, options);
  }

  const actualStatus = result.validationStatus || result.status;
  const expectedStatus = expected.status || "ready";
  if (expectedStatus === "ready" && actualStatus !== "ready") {
    fail("requestFit", 25, `Expected ready status, got ${actualStatus || "missing"}`, true);
  }
  if (expectedStatus === "unsupported" && actualStatus !== "unsupported") {
    fail("edgeCases", 10, `Expected unsupported status, got ${actualStatus || "missing"}`, true);
  }

  if (expectedStatus === "unsupported") {
    scoreUnsupported(test, result, fail);
    return finalizeScore(test, result, category, findings, criticalFailures, options);
  }

  const spec = result.resolvedSpec || result.spec || {};
  const widgets = Array.isArray(result.widgets) ? result.widgets : Array.isArray(spec.widgets) ? spec.widgets : [];
  const table = result.table || {};
  const tableColumns = Array.isArray(table.columns) ? table.columns : [];
  const tableRows = Array.isArray(table.rows) ? table.rows : [];

  checkDateRange(expected.dateRange, spec.dateRange || result.sourceTransparency?.timeRange, fail);
  checkRequiredStrings("metrics", expected.requiredMetrics, spec.metrics, "requestFit", fail, true);
  checkRequiredStrings("dimensions", expected.requiredDimensions, spec.dimensions, "requestFit", fail, true);
  checkRequiredFilters(expected.requiredFilters, spec.filters || result.analystDebug?.filters || [], fail);
  checkTableLayout(expected.tableLayout, spec.tableLayout, fail);
  checkRequiredWidgets(expected.requiredWidgets, widgets, fail);

  if (expected.minTableRows && tableRows.length < expected.minTableRows) {
    fail("outputCompleteness", 10, `Expected at least ${expected.minTableRows} table row(s), got ${tableRows.length}`, true);
  }

  if (expected.requiredMetrics?.length) {
    const columnKeys = tableColumns.map((column) => column.key);
    for (const metric of expected.requiredMetrics) {
      if (!columnKeys.includes(metric) && !Object.hasOwn(result.totals || {}, metric)) {
        fail("outputCompleteness", 2, `Metric ${metric} missing from table columns/totals`, false);
      }
    }
  }

  if (!result.sourceTransparency?.timeRange || !result.sourceTransparency?.sourceTable) {
    fail("dataTrust", 12, "Missing source transparency time range or source table", true);
  }
  if (!result.analystDebug?.sourceFunction) {
    fail("dataTrust", 4, "Missing analyst debug source function", false);
  }
  if (result.unsupportedReasons?.length) {
    fail("dataTrust", 4, `Ready dashboard has unsupported reasons: ${result.unsupportedReasons.join("; ")}`, true);
  }

  scoreSeniorUsefulness(test, result, fail);
  return finalizeScore(test, result, category, findings, criticalFailures, options);
}

function scoreUnsupported(test, result, fail) {
  const text = dashboardText(result);
  const expected = test.expected || {};
  for (const term of expected.mustMentionUnsupported || []) {
    if (!text.toLowerCase().includes(String(term).toLowerCase())) {
      fail("edgeCases", 3, `Unsupported response does not mention ${term}`, false);
    }
  }
  for (const metric of expected.forbiddenReadyMetrics || []) {
    if (result.resolvedSpec?.metrics?.includes(metric) && (result.table?.rows || []).length) {
      fail("edgeCases", 5, `Unsupported response returned populated ${metric} output`, true);
    }
  }
  if (!result.unsupportedReasons?.length && !result.analystDebug?.unsupportedReasons?.length) {
    fail("dataTrust", 8, "Unsupported result lacks unsupportedReasons", true);
  }
}

function checkDateRange(expectedRange, actualRange, fail) {
  if (!expectedRange) return;
  if (!actualRange) {
    fail("requestFit", 5, "Missing date range", true);
    return;
  }
  for (const [key, value] of Object.entries(expectedRange)) {
    if (actualRange[key] !== value) {
      fail("requestFit", 4, `Date range ${key} expected ${value}, got ${actualRange[key]}`, true);
    }
  }
}

function checkRequiredStrings(label, expected = [], actual = [], category, fail, critical = false) {
  for (const item of expected) {
    if (!actual.includes(item)) {
      fail(category, 4, `Missing required ${label}: ${item}`, critical);
    }
  }
}

function checkRequiredFilters(expectedFilters = [], actualFilters = [], fail) {
  for (const expected of expectedFilters) {
    const found = actualFilters.some(
      (actual) =>
        actual.field === expected.field &&
        actual.operator === expected.operator &&
        String(actual.value).toLowerCase() === String(expected.value).toLowerCase(),
    );
    if (!found) {
      fail("requestFit", 5, `Missing filter ${expected.field}:${expected.operator}=${expected.value}`, true);
    }
  }
}

function checkTableLayout(expectedLayout, actualLayout, fail) {
  if (!expectedLayout) return;
  if (!actualLayout) {
    fail("outputCompleteness", 8, "Missing required tableLayout", true);
    return;
  }
  for (const [key, value] of Object.entries(expectedLayout)) {
    if (actualLayout[key] !== value) {
      fail("outputCompleteness", 5, `tableLayout.${key} expected ${value}, got ${actualLayout[key]}`, true);
    }
  }
}

function checkRequiredWidgets(requiredWidgets = [], widgets, fail) {
  for (const requirement of requiredWidgets) {
    const found = widgets.some((widget) => widgetMatches(widget, requirement));
    if (!found) {
      fail(
        "outputCompleteness",
        10,
        `Missing widget ${JSON.stringify(requirement)}`,
        true,
      );
    }
  }
}

function widgetMatches(widget, requirement) {
  if (!widget) return false;
  if (requirement.type && widget.type !== requirement.type) return false;
  if (requirement.typeAny && !requirement.typeAny.includes(widget.type)) return false;
  if (requirement.x && widget.x !== requirement.x) return false;
  if (requirement.xAny && !requirement.xAny.includes(widget.x)) return false;
  for (const metric of requirement.metrics || []) {
    if (!widget.metrics?.includes(metric)) return false;
  }
  return true;
}

function scoreSeniorUsefulness(test, result, fail) {
  const expected = test.expected?.seniorInsight || {};
  const text = dashboardText(result);
  const lower = text.toLowerCase();

  if (!text || text.length < 140) {
    fail("seniorUsefulness", 6, "Answer is too short to be useful", false);
  }
  if (expected.needsNumbers && !/[0-9][0-9,.%$]*/.test(text)) {
    fail("seniorUsefulness", 5, "Answer lacks concrete numbers", false);
  }
  if (expected.needsAction && !/\b(scale|pause|shift|move|inspect|test|refresh|reduce|increase|monitor|prioritize|push)\b/i.test(text)) {
    fail("seniorUsefulness", 5, "Answer lacks actionable recommendation language", false);
  }
  if (expected.needsComparison && !/\b(vs|versus|compare|changed|increase|decrease|higher|lower|best|worst|top|bottom|anomaly)\b/i.test(text)) {
    fail("seniorUsefulness", 4, "Answer lacks comparison/change language", false);
  }
  if (expected.needsSpecificEntity && !mentionsEntity(result)) {
    fail("seniorUsefulness", 4, "Answer/table lacks specific entity names", false);
  }
  if (expected.needsPriority && !/\b(first|second|priority|highest|lowest|top|bottom|rank|toward|away)\b/i.test(text)) {
    fail("seniorUsefulness", 4, "Answer lacks prioritization", false);
  }
  if (expected.needsCaveat && !/\bnot supported|unsupported|not wired|unavailable|cannot|missing\b/i.test(lower)) {
    fail("edgeCases", 5, "Expected caveat/unsupported language is missing", false);
  }
  if (/\broas\b/i.test(test.prompt) && !/\bnot supported|unsupported|unavailable|revenue\b/i.test(lower)) {
    fail("edgeCases", 5, "ROAS request lacks clear revenue/ROAS caveat", true);
  }
}

function mentionsEntity(result) {
  const text = dashboardText(result);
  if (/\b(Cash for Gold|Book Appts|Facebook|campaign|creative|ad set|umbrella)\b/i.test(text)) {
    return true;
  }
  const firstRow = result.table?.rows?.[0] || {};
  return Object.values(firstRow).some((value) => typeof value === "string" && value.length > 2);
}

function dashboardText(result) {
  return [
    result.title,
    result.answer,
    ...(result.warnings || []),
    ...(result.unsupportedReasons || []),
    ...(result.analystDebug?.warnings || []),
    ...(result.analystDebug?.unsupportedReasons || []),
    JSON.stringify((result.table?.rows || []).slice(0, 3)),
  ]
    .filter(Boolean)
    .join("\n");
}

function finalizeScore(test, result, category, findings, criticalFailures, options) {
  const score = Math.max(
    0,
    Math.round(Object.values(category).reduce((sum, value) => sum + value, 0)),
  );
  const minScore = options.minScore || DEFAULT_MIN_SCORE;
  const passed = score >= minScore && criticalFailures.length === 0;
  return {
    id: test.id,
    persona: test.persona,
    requestType: test.requestType,
    score,
    passed,
    category,
    findings,
    criticalFailures,
    summary: {
      status: result?.validationStatus || result?.status || null,
      title: result?.title || result?.resolvedSpec?.title || result?.spec?.title || null,
      metrics: result?.resolvedSpec?.metrics || result?.spec?.metrics || [],
      dimensions: result?.resolvedSpec?.dimensions || result?.spec?.dimensions || [],
      widgets: result?.widgets || result?.resolvedSpec?.widgets || result?.spec?.widgets || [],
      tableRows: result?.table?.rows?.length || 0,
    },
  };
}

export async function runLlmJudge({ test, result, model }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for --llm-judge");
  }
  if (!model) {
    throw new Error("OPENAI_QA_JUDGE_MODEL or --judge-model is required for --llm-judge");
  }

  const payload = {
    model,
    messages: [
      {
        role: "system",
        content:
          "You are a strict senior Meta Ads analyst judging whether an Ask AI dashboard is useful. Return compact JSON only with score 0-100, pass boolean, and topGaps array.",
      },
      {
        role: "user",
        content: JSON.stringify({
          request: {
            persona: test.persona,
            requestType: test.requestType,
            prompt: test.prompt,
            expected: test.expected,
          },
          dashboard: {
            status: result?.validationStatus || result?.status,
            title: result?.title,
            answer: result?.answer,
            spec: result?.resolvedSpec || result?.spec,
            widgets: result?.widgets,
            tableColumns: result?.table?.columns,
            tableRowsSample: (result?.table?.rows || []).slice(0, 8),
            sourceTransparency: result?.sourceTransparency,
            warnings: result?.warnings,
            unsupportedReasons: result?.unsupportedReasons,
          },
          rubric:
            "Score for senior analyst usefulness: direct answer, correct segmentation, relevant table/chart, concrete values, prioritized actions, no unsupported hallucination.",
        }),
      },
    ],
    response_format: { type: "json_object" },
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message || `OpenAI judge failed with ${response.status}`);
  }
  const content = json.choices?.[0]?.message?.content || "{}";
  return JSON.parse(content);
}

export function rowsForCsv(scores) {
  return scores.map((score) => ({
    id: score.id,
    persona: score.persona,
    requestType: score.requestType,
    score: score.score,
    passed: score.passed,
    criticalFailures: score.criticalFailures.length,
    findings: score.findings.length,
    status: score.summary.status,
    metrics: score.summary.metrics.join("|"),
    dimensions: score.summary.dimensions.join("|"),
    tableRows: score.summary.tableRows,
    llmScore: score.llmJudge?.score ?? "",
    llmPass: score.llmJudge?.pass ?? "",
  }));
}

export function toCsv(rows) {
  if (!rows.length) return "";
  const columns = Object.keys(rows[0]);
  return `${columns.join(",")}\n${rows
    .map((row) => columns.map((column) => csvEscape(row[column])).join(","))
    .join("\n")}\n`;
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function renderQaReport({ suite, scores, outDir }) {
  const failures = scores.filter((score) => !score.passed);
  const critical = scores.flatMap((score) =>
    score.criticalFailures.map((failure) => ({ id: score.id, ...failure })),
  );
  const average =
    scores.length > 0
      ? Math.round(scores.reduce((sum, score) => sum + score.score, 0) / scores.length)
      : 0;

  const lines = [
    "# Ask AI Dashboard QA Report",
    "",
    `Suite: ${suite.name}`,
    `Tests: ${scores.length}`,
    `Average score: ${average}`,
    `Passing threshold: ${suite.passing.minScore}`,
    `Status: ${failures.length ? "FAIL" : "PASS"}`,
    `Output: ${outDir}`,
    "",
    "## Failures",
    "",
  ];

  if (!failures.length) {
    lines.push("None.");
  } else {
    for (const score of failures) {
      lines.push(`- ${score.id} (${score.persona}, ${score.requestType}) score=${score.score}`);
      for (const finding of score.findings.slice(0, 8)) {
        lines.push(`  - ${finding.critical ? "CRITICAL " : ""}${finding.message}`);
      }
      if (score.llmJudge?.topGaps?.length) {
        for (const gap of score.llmJudge.topGaps.slice(0, 3)) {
          lines.push(`  - LLM judge: ${gap}`);
        }
      }
    }
  }

  lines.push("", "## Critical Failures", "");
  if (!critical.length) {
    lines.push("None.");
  } else {
    for (const failure of critical) {
      lines.push(`- ${failure.id}: ${failure.message}`);
    }
  }

  lines.push("", "## Scores", "");
  for (const score of scores) {
    lines.push(`- ${score.passed ? "PASS" : "FAIL"} ${score.id}: ${score.score}`);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}
