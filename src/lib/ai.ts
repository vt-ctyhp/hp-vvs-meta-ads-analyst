import OpenAI from "openai";

import { fetchDashboardData, type DashboardPayload, type SourceTransparency } from "./analytics";
import { ConfigurationError, getOpenAIModel } from "./env";
import { createServiceClient } from "./supabase";

export type ExecutiveReportContent = {
  executiveSummary: string[];
  majorChanges: string[];
  bestPerformers: string[];
  worstPerformers: string[];
  riskFactors: string[];
  likelyCauses: string[];
  recommendations: string[];
  unresolvedQuestions: string[];
  creativeObservations: string[];
  fatigueAnalysis: string[];
  structuralCampaignIssues: string[];
  creativeTestingGaps: string[];
};

export type ChatResult = {
  sessionId: string;
  answer: string;
  sourceTransparency: SourceTransparency;
};

const EMPTY_REPORT: ExecutiveReportContent = {
  executiveSummary: [],
  majorChanges: [],
  bestPerformers: [],
  worstPerformers: [],
  riskFactors: [],
  likelyCauses: [],
  recommendations: [],
  unresolvedQuestions: [],
  creativeObservations: [],
  fatigueAnalysis: [],
  structuralCampaignIssues: [],
  creativeTestingGaps: [],
};

export async function generateExecutiveReport(days = 30) {
  const dashboard = await fetchDashboardData(days);
  if (!dashboard.configured) {
    throw new ConfigurationError(
      `Cannot generate report until configuration is complete: ${dashboard.missingEnv.join(", ")}`,
      dashboard.missingEnv,
    );
  }

  const model = getOpenAIModel();
  const openai = createOpenAIClient();
  const response = await openai.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a read-only executive Meta Ads analyst for HP and VVS. You never suggest editing campaigns directly as an action in the software. You may recommend business decisions for humans. Return strict JSON matching the requested keys. Every claim must cite the data by campaign, ad set, creative, brand, metric, or date range when possible.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Generate an executive ad intelligence report.",
          requiredKeys: Object.keys(EMPTY_REPORT),
          sourceTransparency: dashboard.sourceTransparency,
          dashboardContext: compactDashboard(dashboard),
        }),
      },
    ],
  });

  const content = parseReport(response.choices[0]?.message?.content);
  const supabase = createServiceClient();
  const title = `Executive Meta Ads Report - ${dashboard.sourceTransparency.timeRange.start || "no data"} to ${dashboard.sourceTransparency.timeRange.end || "no data"}`;
  const insert = await supabase
    .from("ai_reports")
    .insert({
      report_type: "executive",
      title,
      time_range: dashboard.sourceTransparency.timeRange,
      ad_account_ids: dashboard.sourceTransparency.adAccountsAnalyzed,
      record_counts: dashboard.sourceTransparency.recordCounts,
      source_transparency: dashboard.sourceTransparency,
      model,
      content,
    })
    .select("*")
    .single();

  if (insert.error) throw insert.error;
  const insertedReport = insert.data as { id: string };

  return {
    id: String(insertedReport.id),
    title,
    model,
    content,
    sourceTransparency: dashboard.sourceTransparency,
  };
}

export async function answerExecutiveChat(input: {
  sessionId?: string | null;
  message: string;
  days?: number;
}): Promise<ChatResult> {
  const dashboard = await fetchDashboardData(input.days || 30);
  if (!dashboard.configured) {
    throw new ConfigurationError(
      `Cannot answer chat until configuration is complete: ${dashboard.missingEnv.join(", ")}`,
      dashboard.missingEnv,
    );
  }

  const supabase = createServiceClient();
  const sessionId = await ensureChatSession(input.sessionId, input.message);

  await supabase.from("ai_chat_messages").insert({
    session_id: sessionId,
    role: "user",
    content: input.message,
    source_transparency: dashboard.sourceTransparency,
  });

  const history = await supabase
    .from("ai_chat_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(8);

  if (history.error) throw history.error;

  const model = getOpenAIModel();
  const openai = createOpenAIClient();
  const response = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are a read-only executive Meta Ads analyst for HP and VVS. Retrieve signal from the supplied Supabase dashboard context before answering. Be concise, cite the relevant brand/campaign/ad/creative data, compare against benchmarks in the context, and always include source transparency with time range, ad accounts, and record counts. Do not claim you can edit, pause, create, delete, duplicate, or modify Meta ads.",
      },
      {
        role: "user",
        content: JSON.stringify({
          sourceTransparency: dashboard.sourceTransparency,
          dashboardContext: compactDashboard(dashboard),
        }),
      },
      ...rows<{ role: "user" | "assistant" | "system"; content: string }>(history.data)
        .reverse()
        .map((message) => ({
          role: message.role === "assistant" ? "assistant" as const : "user" as const,
          content: message.content,
        })),
    ],
  });

  const answer =
    response.choices[0]?.message?.content ||
    "I could not generate an answer from the retrieved Supabase context.";

  await supabase.from("ai_chat_messages").insert({
    session_id: sessionId,
    role: "assistant",
    content: answer,
    source_transparency: dashboard.sourceTransparency,
  });

  return {
    sessionId,
    answer,
    sourceTransparency: dashboard.sourceTransparency,
  };
}

function createOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ConfigurationError("Missing OPENAI_API_KEY", ["OPENAI_API_KEY"]);
  }
  return new OpenAI({ apiKey });
}

async function ensureChatSession(sessionId: string | null | undefined, message: string) {
  const supabase = createServiceClient();
  if (sessionId) {
    return sessionId;
  }

  const title = message.length > 80 ? `${message.slice(0, 77)}...` : message;
  const insert = await supabase
    .from("ai_chat_sessions")
    .insert({ title })
    .select("id")
    .single();

  if (insert.error) throw insert.error;
  return String((insert.data as { id: string }).id);
}

function compactDashboard(dashboard: DashboardPayload) {
  return {
    overview: dashboard.overview,
    byBrand: dashboard.byBrand,
    topCampaigns: dashboard.campaigns.slice(0, 12),
    topAdSets: dashboard.adSets.slice(0, 12),
    topCreatives: dashboard.creatives.slice(0, 16).map((creative) => ({
      id: creative.id,
      name: creative.name,
      brandCode: creative.brandCode,
      spend: creative.spend,
      impressions: creative.impressions,
      clicks: creative.clicks,
      ctr: creative.ctr,
      cpc: creative.cpc,
      leads: creative.leads,
      cpl: creative.cpl,
      frequency: creative.frequency,
      previewSource: creative.previewSource,
      title: creative.title,
      body: creative.body,
      riskLevel: creative.riskLevel,
      riskReason: creative.riskReason,
    })),
    fatigueRisks: dashboard.fatigueRisks,
    underperformers: dashboard.underperformers,
    opportunities: dashboard.opportunities,
    recommendationQueue: dashboard.recommendationQueue,
    trendSample: dashboard.dailyTrend.slice(-28),
  };
}

function parseReport(content: string | null | undefined): ExecutiveReportContent {
  if (!content) return EMPTY_REPORT;

  try {
    const parsed = JSON.parse(content) as Partial<ExecutiveReportContent>;
    return {
      executiveSummary: arrayOfStrings(parsed.executiveSummary),
      majorChanges: arrayOfStrings(parsed.majorChanges),
      bestPerformers: arrayOfStrings(parsed.bestPerformers),
      worstPerformers: arrayOfStrings(parsed.worstPerformers),
      riskFactors: arrayOfStrings(parsed.riskFactors),
      likelyCauses: arrayOfStrings(parsed.likelyCauses),
      recommendations: arrayOfStrings(parsed.recommendations),
      unresolvedQuestions: arrayOfStrings(parsed.unresolvedQuestions),
      creativeObservations: arrayOfStrings(parsed.creativeObservations),
      fatigueAnalysis: arrayOfStrings(parsed.fatigueAnalysis),
      structuralCampaignIssues: arrayOfStrings(parsed.structuralCampaignIssues),
      creativeTestingGaps: arrayOfStrings(parsed.creativeTestingGaps),
    };
  } catch {
    return {
      ...EMPTY_REPORT,
      executiveSummary: [content],
    };
  }
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function rows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}
