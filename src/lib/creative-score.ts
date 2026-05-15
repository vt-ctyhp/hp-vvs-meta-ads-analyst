export type CreativeStatus =
  | "Scale Candidate"
  | "Needs Hook Improvement"
  | "Needs Retention Improvement"
  | "Clickbait Risk"
  | "Fatigue Watch"
  | "Brand Fit Review";

export type RankingValue = string | null | undefined;

export type CreativeAction = {
  action_type?: string | null;
  value?: string | number | null;
};

export type CreativeScoreInput = {
  id: string;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  cpm: number;
  clicks: number;
  inlineLinkClicks: number;
  ctr: number;
  inlineLinkClickCtr: number | null;
  cpc: number;
  actions: unknown;
  costPerActionType: unknown;
  videoPlayActions: unknown;
  videoP25WatchedActions: unknown;
  videoP50WatchedActions: unknown;
  videoP75WatchedActions: unknown;
  videoP95WatchedActions: unknown;
  videoP100WatchedActions: unknown;
  videoThruplayWatchedActions: unknown;
  qualityRanking?: RankingValue;
  engagementRateRanking?: RankingValue;
  conversionRateRanking?: RankingValue;
  previous?: CreativeScoreInput | null;
};

export type CreativeMetricDiagnostics = {
  hookViews: number | null;
  hookRate: number | null;
  hookRateSource: string;
  hookRateEstimated: boolean;
  holdViews: number | null;
  holdRate: number | null;
  holdRateSource: string;
  holdRateEstimated: boolean;
  completionViews: number | null;
  completionRate: number | null;
  clickEfficiency: number | null;
  costPerResult: number | null;
  resultCount: number;
  resultLabel: string;
  resultActionType: string | null;
};

export type CreativeFatigueSignal = {
  available: boolean;
  level: "low" | "watch" | "high" | "unknown";
  reasons: string[];
  frequencyIncreasing: boolean;
  ctrDeclining: boolean;
  hookDeclining: boolean;
  costIncreasing: boolean;
};

export type CreativeScoreBreakdown = {
  hookStrength: number;
  holdRetention: number;
  clickIntent: number;
  conversionEfficiency: number;
  metaRankingDiagnostics: number;
  fatigueRisk: number;
  total: number;
};

export type CreativeDiagnostic = CreativeMetricDiagnostics & {
  id: string;
  internalScore: number;
  scoreBreakdown: CreativeScoreBreakdown;
  status: CreativeStatus;
  recommendation: string;
  diagnosis: string;
  nextAction: string;
  fatigueSignal: CreativeFatigueSignal;
  rankingDiagnosticsAvailable: boolean;
};

type BaseDiagnostics = CreativeMetricDiagnostics & {
  input: CreativeScoreInput;
  previousMetrics: CreativeMetricDiagnostics | null;
};

type Benchmarks = {
  hookRate: number | null;
  holdRate: number | null;
  completionRate: number | null;
  clickEfficiency: number | null;
  ctr: number | null;
  bestCostPerResult: number | null;
  medianCostPerResult: number | null;
};

const BOOKING_ACTION_TYPES = [
  "offsite_conversion.fb_pixel_custom",
  "schedule",
  "submit_application",
  "booking",
  "appointment",
];
const LEAD_ACTION_TYPES = [
  "lead",
  "onsite_conversion.lead",
  "onsite_conversion.lead_grouped",
  "onsite_web_lead",
  "offsite_conversion.fb_pixel_lead",
];
const PURCHASE_ACTION_TYPES = [
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
];
const MESSAGE_ACTION_TYPES = [
  "onsite_conversion.total_messaging_connection",
  "onsite_conversion.messaging_first_reply",
  "onsite_conversion.messaging_conversation_started_7d",
];

export function buildCreativeDiagnostics(inputs: CreativeScoreInput[]): CreativeDiagnostic[] {
  const baseRows = inputs.map((input) => {
    const metrics = deriveCreativeMetrics(input);
    return {
      input,
      ...metrics,
      previousMetrics: input.previous ? deriveCreativeMetrics(input.previous) : null,
    };
  });
  const benchmarks = buildBenchmarks(baseRows);

  return baseRows.map((row) => scoreCreative(row, benchmarks));
}

export function deriveCreativeMetrics(input: CreativeScoreInput): CreativeMetricDiagnostics {
  const actions = actionArray(input.actions);
  const videoPlayActions = actionArray(input.videoPlayActions);
  const videoP25 = totalActionValue(input.videoP25WatchedActions);
  const videoP50 = totalActionValue(input.videoP50WatchedActions);
  const videoP100 = totalActionValue(input.videoP100WatchedActions);
  const thruplays = totalActionValue(input.videoThruplayWatchedActions);
  const videoPlayCount = totalActionValue(videoPlayActions);
  const videoViewActionCount = actionCount(actions, ["video_view"]);

  let hookViews: number | null = null;
  let hookRateSource = "Unavailable";
  let hookRateEstimated = false;

  if (videoPlayCount > 0) {
    hookViews = videoPlayCount;
    hookRateSource = "Estimated from video play actions";
    hookRateEstimated = true;
  } else if (videoViewActionCount > 0) {
    hookViews = videoViewActionCount;
    hookRateSource = "Estimated from video_view actions";
    hookRateEstimated = true;
  }

  const hookRate = hookViews !== null && input.impressions > 0 ? hookViews / input.impressions : null;

  let holdViews: number | null = null;
  let holdRateSource = "Unavailable";
  let holdRateEstimated = false;

  if (thruplays > 0) {
    holdViews = thruplays;
    holdRateSource = "ThruPlays / estimated 3-second views";
  } else if (videoP50 > 0) {
    holdViews = videoP50;
    holdRateSource = "Proxy from 50% watched actions";
    holdRateEstimated = true;
  } else if (videoP25 > 0) {
    holdViews = videoP25;
    holdRateSource = "Proxy from 25% watched actions";
    holdRateEstimated = true;
  }

  const holdRate = holdViews !== null && hookViews && hookViews > 0 ? holdViews / hookViews : null;
  const completionRate = videoP100 > 0 && videoPlayCount > 0 ? videoP100 / videoPlayCount : null;
  const clickEfficiency = input.impressions > 0 ? input.inlineLinkClicks / input.impressions : null;
  const result = resolveCostEfficiency(input);

  return {
    hookViews,
    hookRate,
    hookRateSource,
    hookRateEstimated,
    holdViews,
    holdRate,
    holdRateSource,
    holdRateEstimated,
    completionViews: videoP100 || null,
    completionRate,
    clickEfficiency,
    costPerResult: result.costPerResult,
    resultCount: result.resultCount,
    resultLabel: result.resultLabel,
    resultActionType: result.resultActionType,
  };
}

function scoreCreative(row: BaseDiagnostics, benchmarks: Benchmarks): CreativeDiagnostic {
  const retentionSignal = averageDefined([
    scoreHigher(row.holdRate, benchmarks.holdRate),
    scoreHigher(row.completionRate, benchmarks.completionRate),
  ]);
  const clickSignal = averageDefined([
    scoreHigher(row.clickEfficiency, benchmarks.clickEfficiency),
    scoreHigher(row.input.ctr / 100, benchmarks.ctr),
  ]);
  const fatigueSignal = buildFatigueSignal(row);
  const fatigueScore = scoreFatigue(fatigueSignal);
  const rankingDiagnostics = [
    rankingScore(row.input.qualityRanking),
    rankingScore(row.input.engagementRateRanking),
    rankingScore(row.input.conversionRateRanking),
  ].filter((value): value is number => value !== null);
  const rankingAverage = rankingDiagnostics.length ? average(rankingDiagnostics) : 50;
  const conversionScore = scoreCostEfficiency(
    row.costPerResult,
    row.resultCount,
    row.input.spend,
    benchmarks.bestCostPerResult,
    benchmarks.medianCostPerResult,
  );

  const scoreBreakdown: CreativeScoreBreakdown = {
    hookStrength: scoreHigher(row.hookRate, benchmarks.hookRate),
    holdRetention: retentionSignal,
    clickIntent: clickSignal,
    conversionEfficiency: conversionScore,
    metaRankingDiagnostics: rankingAverage,
    fatigueRisk: fatigueScore,
    total: 0,
  };

  scoreBreakdown.total = round(
    scoreBreakdown.hookStrength * 0.2 +
      scoreBreakdown.holdRetention * 0.2 +
      scoreBreakdown.clickIntent * 0.15 +
      scoreBreakdown.conversionEfficiency * 0.25 +
      scoreBreakdown.metaRankingDiagnostics * 0.1 +
      scoreBreakdown.fatigueRisk * 0.1,
    0,
  );

  const status = assignStatus(row, scoreBreakdown, fatigueSignal);
  const recommendation = recommendationForStatus(status, row);

  return {
    id: row.input.id,
    hookViews: row.hookViews,
    hookRate: row.hookRate,
    hookRateSource: row.hookRateSource,
    hookRateEstimated: row.hookRateEstimated,
    holdViews: row.holdViews,
    holdRate: row.holdRate,
    holdRateSource: row.holdRateSource,
    holdRateEstimated: row.holdRateEstimated,
    completionViews: row.completionViews,
    completionRate: row.completionRate,
    clickEfficiency: row.clickEfficiency,
    costPerResult: row.costPerResult,
    resultCount: row.resultCount,
    resultLabel: row.resultLabel,
    resultActionType: row.resultActionType,
    internalScore: scoreBreakdown.total,
    scoreBreakdown,
    status,
    recommendation,
    diagnosis: diagnosisForStatus(status, row, fatigueSignal),
    nextAction: nextActionForStatus(status),
    fatigueSignal,
    rankingDiagnosticsAvailable: rankingDiagnostics.length > 0,
  };
}

function buildBenchmarks(rows: BaseDiagnostics[]): Benchmarks {
  return {
    hookRate: percentile(values(rows.map((row) => row.hookRate)), 0.75),
    holdRate: percentile(values(rows.map((row) => row.holdRate)), 0.75),
    completionRate: percentile(values(rows.map((row) => row.completionRate)), 0.75),
    clickEfficiency: percentile(values(rows.map((row) => row.clickEfficiency)), 0.75),
    ctr: percentile(values(rows.map((row) => (row.input.ctr > 0 ? row.input.ctr / 100 : null))), 0.75),
    bestCostPerResult: min(values(rows.map((row) => row.costPerResult))),
    medianCostPerResult: percentile(values(rows.map((row) => row.costPerResult)), 0.5),
  };
}

function resolveCostEfficiency(input: CreativeScoreInput) {
  const actions = actionArray(input.actions);
  const costActions = actionArray(input.costPerActionType);
  const candidates = [
    { label: "Cost per booking", types: BOOKING_ACTION_TYPES },
    { label: "Cost per lead", types: LEAD_ACTION_TYPES },
    { label: "Cost per purchase", types: PURCHASE_ACTION_TYPES },
    { label: "Cost per messaging result", types: MESSAGE_ACTION_TYPES },
  ];

  for (const candidate of candidates) {
    const resultCount = exactActionCount(actions, candidate.types);
    const costFromMeta = firstExactActionValue(costActions, candidate.types);
    if (costFromMeta !== null || resultCount > 0) {
      return {
        costPerResult: costFromMeta !== null ? costFromMeta : input.spend / resultCount,
        resultCount,
        resultLabel: candidate.label,
        resultActionType: candidate.types[0],
      };
    }
  }

  return {
    costPerResult: null,
    resultCount: 0,
    resultLabel: "Cost per result",
    resultActionType: null,
  };
}

function buildFatigueSignal(row: BaseDiagnostics): CreativeFatigueSignal {
  if (!row.previousMetrics) {
    return {
      available: false,
      level: "unknown",
      reasons: ["Fatigue detection requires comparison data from an earlier date range."],
      frequencyIncreasing: false,
      ctrDeclining: false,
      hookDeclining: false,
      costIncreasing: false,
    };
  }

  if (row.input.spend <= 0) {
    return {
      available: true,
      level: "low",
      reasons: ["No current spend delivery in the selected range."],
      frequencyIncreasing: false,
      ctrDeclining: false,
      hookDeclining: false,
      costIncreasing: false,
    };
  }

  const previous = row.input.previous;
  const previousCtr = previous?.ctr || 0;
  const frequencyIncreasing =
    Boolean(previous?.frequency) &&
    row.input.frequency >= 2.5 &&
    row.input.frequency > Number(previous?.frequency) * 1.15;
  const ctrDeclining = previousCtr > 0 && row.input.ctr < previousCtr * 0.85;
  const hookDeclining =
    row.hookRate !== null &&
    row.previousMetrics.hookRate !== null &&
    row.hookRate < row.previousMetrics.hookRate * 0.85;
  const costIncreasing =
    row.costPerResult !== null &&
    row.previousMetrics.costPerResult !== null &&
    row.costPerResult > row.previousMetrics.costPerResult * 1.2;
  const reasons = [
    frequencyIncreasing ? "Frequency is increasing." : null,
    ctrDeclining ? "CTR is declining." : null,
    hookDeclining ? "Hook rate is declining." : null,
    costIncreasing ? "Cost per result is increasing." : null,
  ].filter((value): value is string => Boolean(value));
  const signalCount = reasons.length;

  return {
    available: true,
    level: signalCount >= 3 ? "high" : signalCount >= 2 ? "watch" : "low",
    reasons: reasons.length ? reasons : ["No major fatigue pattern in the comparison range."],
    frequencyIncreasing,
    ctrDeclining,
    hookDeclining,
    costIncreasing,
  };
}

function assignStatus(
  row: BaseDiagnostics,
  scoreBreakdown: CreativeScoreBreakdown,
  fatigueSignal: CreativeFatigueSignal,
): CreativeStatus {
  if (fatigueSignal.level === "high" || fatigueSignal.level === "watch") {
    return "Fatigue Watch";
  }

  if (
    scoreBreakdown.conversionEfficiency >= 70 &&
    (scoreBreakdown.hookStrength >= 55 || scoreBreakdown.clickIntent >= 55) &&
    row.input.frequency < 4
  ) {
    return "Scale Candidate";
  }

  if (
    (scoreBreakdown.hookStrength >= 70 || scoreBreakdown.clickIntent >= 70) &&
    scoreBreakdown.conversionEfficiency < 45 &&
    row.input.spend >= 25
  ) {
    return "Clickbait Risk";
  }

  if (scoreBreakdown.hookStrength >= 60 && scoreBreakdown.holdRetention < 45) {
    return "Needs Retention Improvement";
  }

  if (scoreBreakdown.hookStrength < 45 && row.input.spend >= 10) {
    return "Needs Hook Improvement";
  }

  return "Brand Fit Review";
}

function recommendationForStatus(status: CreativeStatus, row: BaseDiagnostics) {
  if (status === "Scale Candidate") {
    return "Strong lead quality candidate. Consider increasing budget carefully.";
  }
  if (status === "Needs Hook Improvement") {
    return "Test a stronger first 2 seconds.";
  }
  if (status === "Needs Retention Improvement") {
    return "Keep the hook, but shorten the middle section.";
  }
  if (status === "Clickbait Risk") {
    return "High CTR but weak conversion. Check landing page or lead quality.";
  }
  if (status === "Fatigue Watch") {
    return "Creative may be fatiguing. Consider refreshing intro, caption, or first scene.";
  }
  if (row.input.ctr > 0 && row.resultCount > 0) {
    return "Review appointment quality, close rate, AOV, and brand fit before scaling.";
  }
  return "Manually review whether the creative feels premium enough for HP/VVS.";
}

function diagnosisForStatus(
  status: CreativeStatus,
  row: BaseDiagnostics,
  fatigueSignal: CreativeFatigueSignal,
) {
  if (status === "Fatigue Watch") return fatigueSignal.reasons.join(" ");
  if (status === "Scale Candidate") {
    return `${row.resultLabel} is efficient relative to the current creative set.`;
  }
  if (status === "Clickbait Risk") {
    return "Early engagement is stronger than downstream conversion efficiency.";
  }
  if (status === "Needs Hook Improvement") {
    return row.hookRate === null
      ? "Hook rate is unavailable for this creative."
      : "Early video or click engagement is weaker than the selected creative set.";
  }
  if (status === "Needs Retention Improvement") {
    return "The hook is working, but retention drops before completion.";
  }
  return "Performance is workable, but brand fit and lead quality should be checked manually.";
}

function nextActionForStatus(status: CreativeStatus) {
  if (status === "Scale Candidate") return "Increase budget in small steps and monitor CPA quality.";
  if (status === "Needs Hook Improvement") return "Create a variant with a more direct opening shot or offer.";
  if (status === "Needs Retention Improvement") return "Trim the middle section and bring the strongest proof point earlier.";
  if (status === "Clickbait Risk") return "Audit landing page, offer match, and lead quality before scaling.";
  if (status === "Fatigue Watch") return "Refresh the first scene, caption, or opening line before spend continues rising.";
  return "Review visual polish, appointment quality, close rate, and AOV with the team.";
}

function scoreHigher(value: number | null, benchmark: number | null) {
  if (value === null || benchmark === null || benchmark <= 0) return 50;
  return clamp((value / benchmark) * 80, 0, 100);
}

function scoreCostEfficiency(
  costPerResult: number | null,
  resultCount: number,
  spend: number,
  bestCostPerResult: number | null,
  medianCostPerResult: number | null,
) {
  if (costPerResult === null || costPerResult <= 0) {
    if (spend >= 50 && resultCount === 0) return 25;
    return 50;
  }

  const bestScore =
    bestCostPerResult && bestCostPerResult > 0 ? (bestCostPerResult / costPerResult) * 100 : 50;
  const medianScore =
    medianCostPerResult && medianCostPerResult > 0
      ? (medianCostPerResult / costPerResult) * 70
      : bestScore;
  const volumeAdjustment = resultCount >= 3 ? 8 : resultCount >= 1 ? 0 : -15;

  return clamp(Math.max(bestScore, medianScore) + volumeAdjustment, 15, 100);
}

function scoreFatigue(signal: CreativeFatigueSignal) {
  if (signal.level === "high") return 15;
  if (signal.level === "watch") return 50;
  if (signal.level === "low") return 90;
  return 70;
}

function rankingScore(value: RankingValue) {
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/\s+/g, "_");
  if (normalized.includes("above_average")) return 100;
  if (normalized === "average") return 70;
  if (normalized.includes("below_average_35")) return 35;
  if (normalized.includes("below_average_20")) return 20;
  if (normalized.includes("below_average_10")) return 10;
  if (normalized.includes("below_average")) return 25;
  return null;
}

function actionArray(value: unknown): CreativeAction[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    action_type: typeof item.action_type === "string" ? item.action_type : null,
    value: typeof item.value === "string" || typeof item.value === "number" ? item.value : null,
  }));
}

function totalActionValue(value: unknown) {
  return actionArray(value).reduce((sum, action) => sum + numberValue(action.value), 0);
}

function actionCount(actions: CreativeAction[], actionTypes: string[]) {
  return actions.reduce((sum, action) => {
    const type = action.action_type || "";
    if (!actionTypes.some((target) => type.includes(target))) return sum;
    return sum + numberValue(action.value);
  }, 0);
}

function exactActionCount(actions: CreativeAction[], actionTypes: string[]) {
  return actions.reduce((sum, action) => {
    if (!action.action_type || !actionTypes.includes(action.action_type)) return sum;
    return sum + numberValue(action.value);
  }, 0);
}

function firstExactActionValue(actions: CreativeAction[], actionTypes: string[]) {
  for (const action of actions) {
    if (action.action_type && actionTypes.includes(action.action_type)) {
      return numberValue(action.value);
    }
  }
  return null;
}

function values(input: Array<number | null | undefined>) {
  return input.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function percentile(input: number[], p: number) {
  if (!input.length) return null;
  const sorted = [...input].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

function min(input: number[]) {
  return input.length ? Math.min(...input) : null;
}

function average(input: number[]) {
  return input.length ? input.reduce((sum, value) => sum + value, 0) / input.length : 0;
}

function averageDefined(input: number[]) {
  return input.length ? average(input) : 50;
}

function numberValue(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function clamp(value: number, minValue: number, maxValue: number) {
  return Math.max(minValue, Math.min(maxValue, value));
}

function round(value: number, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
