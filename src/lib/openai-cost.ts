export type OpenAICostBreakdown = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

type ModelRate = {
  input: number;
  output: number;
};

const FALLBACK_RATE: ModelRate = { input: 1, output: 5 };

export function buildOpenAICostBreakdown(input: {
  model: string;
  inputTokens: number;
  outputTokens: number;
}): OpenAICostBreakdown {
  const inputTokens = positiveInteger(input.inputTokens);
  const outputTokens = positiveInteger(input.outputTokens);

  return {
    model: input.model,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimatedCostUsd: round(
      calculateOpenAICostUsd({
        model: input.model,
        inputTokens,
        outputTokens,
      }),
      5,
    ),
  };
}

export function calculateOpenAICostUsd(input: {
  model: string;
  inputTokens: number;
  outputTokens: number;
}) {
  const rate = rateForModel(input.model);
  return (positiveInteger(input.inputTokens) / 1_000_000) * rate.input +
    (positiveInteger(input.outputTokens) / 1_000_000) * rate.output;
}

function rateForModel(model: string): ModelRate {
  const normalized = model.toLowerCase();
  if (normalized.includes("gpt-5.5")) return { input: 5, output: 30 };
  if (normalized.includes("gpt-5.4-nano")) return { input: 0.2, output: 1.25 };
  if (normalized.includes("gpt-5.4-mini")) return { input: 0.75, output: 4.5 };
  if (normalized.includes("gpt-5.4")) return { input: 2.5, output: 15 };
  if (normalized.includes("gpt-4.1-mini")) return { input: 0.4, output: 1.6 };
  return FALLBACK_RATE;
}

function positiveInteger(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function round(value: number, places = 2) {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
