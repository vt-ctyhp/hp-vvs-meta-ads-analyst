import OpenAI from "openai";

import type { AnalysisWorkbenchNarrativeComposer } from "./analysis-workbench-pipeline.ts";
import { getOpenAIAnalysisModel } from "./env.ts";
import { buildOpenAICostBreakdown } from "./openai-cost.ts";

export const composeAnalysisWorkbenchNarrativeWithAI: AnalysisWorkbenchNarrativeComposer = async (
  input,
) => {
  if (!aiNarrativeEnabled() || !process.env.OPENAI_API_KEY?.trim()) return null;

  const model = getOpenAIAnalysisModel("fast");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "Write a concise senior Meta Ads analyst answer from the supplied computed facts only. Do not invent numbers, dates, metrics, entity names, or data sources. Keep citations exactly as supplied, such as [F1] or [S1]. Do not mention technical IDs.",
        },
        {
          role: "user",
          content: JSON.stringify({
            analysisShape: input.planned.analysisShape,
            questionType: input.planned.questionType,
            metrics: input.planned.metrics,
            dimensions: input.planned.dimensions,
            filters: input.planned.filters,
            dateRange: input.planned.dateRange,
            facts: input.facts
              .filter((fact) => fact.type !== "source_note")
              .map((fact) => ({
                citationId: fact.citationId,
                type: fact.type,
                label: fact.label,
                metric: fact.metric,
                dimension: fact.dimension,
                entityName: fact.entityName,
                formattedValue: fact.formattedValue,
                baselineLabel: fact.baselineLabel,
                formattedBaselineValue: fact.formattedBaselineValue,
                formattedDeltaValue: fact.formattedDeltaValue,
                formattedPercentDelta: fact.formattedPercentDelta,
                caveat: fact.caveat,
              })),
            visualCards: input.visualCards.map((card) => ({
              id: card.id,
              type: card.type,
              title: card.title,
              sourceNoteIds: card.sourceNoteIds,
            })),
            sourceNotes: input.sourceNotes,
            fallbackSummary: input.fallbackSummary,
            requirements: [
              "Lead with the direct answer.",
              "For week-over-week shapes, mention the latest week comparison and the best week when present.",
              "For entity shapes, use entity names, not IDs.",
              "For recommendations, use advisory verbs only: inspect, review, monitor, test, shift budget.",
              "Include caveats when facts include caveats.",
            ],
          }),
        },
      ],
    });
    const summary = response.choices[0]?.message?.content?.trim();
    if (!summary) return null;
    return {
      summary,
      apiCost: buildOpenAICostBreakdown({
        model: response.model || model,
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      }),
    };
  } catch {
    return null;
  }
};

function aiNarrativeEnabled() {
  const configured = process.env.ANALYSIS_WORKBENCH_AI_NARRATIVE?.trim().toLowerCase();
  if (configured) return ["1", "true", "yes", "on"].includes(configured);
  return process.env.NODE_ENV === "production";
}
