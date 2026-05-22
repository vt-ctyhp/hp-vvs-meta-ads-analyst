import type { AnalysisMode } from "./env.ts";

export type CopilotIntent =
  | "deep_analysis"
  | "dashboard_build"
  | "unsupported_source"
  | "chat";

export type CopilotRoute = {
  intent: CopilotIntent;
  mode: AnalysisMode;
  reason: string;
};

export function classifyCopilotRequest(message: string, requestedMode?: AnalysisMode): CopilotRoute {
  const lower = message.toLowerCase();
  const intent = inferCopilotIntent(lower);
  const mode = requestedMode || (intent === "deep_analysis" ? "deep" : "fast");

  return {
    intent,
    mode,
    reason: reasonForIntent(intent),
  };
}

function inferCopilotIntent(lower: string): CopilotIntent {
  if (/\b(website|landing\s+pages?|page\s+views?|sessions?|traffic|utm|crm|customers?|orders?|sales|revenue|social\s+inbox|response\s+time|employee|staff)\b/.test(lower)) {
    return "unsupported_source";
  }

  if (/\b(pivot|dashboard|chart|graph|table|crosstab|cross[-\s]?tab|matrix|visuali[sz]e|build|create|show me)\b/.test(lower)) {
    return "dashboard_build";
  }

  if (/\b(scale|scal(e|ing)|recommend|should|which|why|diagnos(e|is)|analy[sz]e|deep|root cause|what changed|decision)\b/.test(lower)) {
    return "deep_analysis";
  }

  return "chat";
}

function reasonForIntent(intent: CopilotIntent) {
  if (intent === "deep_analysis") return "Decision or diagnosis request.";
  if (intent === "dashboard_build") return "Dashboard, chart, table, or pivot request.";
  if (intent === "unsupported_source") return "Request mentions a source not wired into Meta Ads copilot.";
  return "General Meta Ads chat request.";
}
