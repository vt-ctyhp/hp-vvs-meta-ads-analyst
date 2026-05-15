export type MetaKpiAction = {
  action_type?: string | null;
  value?: string | number | null;
};

export type MetaKpiInput = {
  spend: number;
  actions: unknown;
  costPerActionType: unknown;
  campaignName?: string | null;
  adSetName?: string | null;
  campaignUmbrella?: string | null;
  objective?: string | null;
  optimizationGoal?: string | null;
};

export type ResolvedMetaKpi = {
  resultKpiLabel: string;
  resultLabel: string;
  resultActionType: string | null;
  resultCount: number;
  costPerResult: number | null;
};

type KpiCandidate = {
  key: "booking" | "message" | "lead" | "purchase" | "conversion";
  resultKpiLabel: string;
  resultLabel: string;
  types: string[];
};

export const BOOKING_ACTION_TYPES = [
  "offsite_conversion.fb_pixel_custom",
  "schedule",
  "submit_application",
  "booking",
  "appointment",
];

export const LEAD_ACTION_TYPES = [
  "lead",
  "onsite_conversion.lead",
  "onsite_conversion.lead_grouped",
  "onsite_web_lead",
  "offsite_conversion.fb_pixel_lead",
];

export const PURCHASE_ACTION_TYPES = [
  "omni_purchase",
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
];

export const MESSAGE_ACTION_TYPES = [
  "onsite_conversion.total_messaging_connection",
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.messaging_first_reply",
];

const CONVERSION_ACTION_TYPES = [
  "complete_registration",
  "offsite_conversion.fb_pixel_complete_registration",
];

const KPI_CANDIDATES: KpiCandidate[] = [
  {
    key: "booking",
    resultKpiLabel: "Bookings",
    resultLabel: "Cost per booking",
    types: BOOKING_ACTION_TYPES,
  },
  {
    key: "message",
    resultKpiLabel: "Messages",
    resultLabel: "Cost per message",
    types: MESSAGE_ACTION_TYPES,
  },
  {
    key: "lead",
    resultKpiLabel: "Leads",
    resultLabel: "Cost per lead",
    types: LEAD_ACTION_TYPES,
  },
  {
    key: "purchase",
    resultKpiLabel: "Purchases",
    resultLabel: "Cost per purchase",
    types: PURCHASE_ACTION_TYPES,
  },
  {
    key: "conversion",
    resultKpiLabel: "Conversions",
    resultLabel: "Cost per conversion",
    types: CONVERSION_ACTION_TYPES,
  },
];

export function resolveMetaKpi(input: MetaKpiInput): ResolvedMetaKpi {
  const actions = actionArray(input.actions);
  const costActions = actionArray(input.costPerActionType);

  for (const candidate of preferredKpiCandidates(input)) {
    const resultCount = exactActionCount(actions, candidate.types);
    const costFromMeta = firstExactActionValue(costActions, candidate.types);
    if (costFromMeta !== null || resultCount > 0) {
      return {
        resultKpiLabel: candidate.resultKpiLabel,
        resultLabel: candidate.resultLabel,
        resultActionType: firstMatchingActionType(actions, costActions, candidate.types),
        resultCount,
        costPerResult: costFromMeta !== null ? costFromMeta : safeCost(input.spend, resultCount),
      };
    }
  }

  const fallbackLabel = fallbackKpiLabel(input);
  const fallbackCandidate = KPI_CANDIDATES.find(
    (candidate) => candidate.resultKpiLabel === fallbackLabel,
  );

  return {
    resultKpiLabel: fallbackLabel,
    resultLabel: fallbackCandidate?.resultLabel || "Cost per result",
    resultActionType: fallbackCandidate?.types[0] || null,
    resultCount: 0,
    costPerResult: null,
  };
}

function preferredKpiCandidates(input: MetaKpiInput) {
  const text = [
    input.campaignUmbrella,
    input.campaignName,
    input.adSetName,
    input.objective,
    input.optimizationGoal,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (text.includes("book appts") || /appointment|book|calendly|acuity|schedule/.test(text)) {
    return orderCandidates(["booking", "lead", "message", "conversion", "purchase"]);
  }

  if (/message|messaging|replies|reply|engagement|product|promotion|wkds|ooak/.test(text)) {
    return orderCandidates(["message", "lead", "booking", "purchase", "conversion"]);
  }

  if (/lead|forms?|cash for gold/.test(text)) {
    return orderCandidates(["lead", "message", "booking", "purchase", "conversion"]);
  }

  if (/purchase|sales|conversions/.test(text)) {
    return orderCandidates(["purchase", "booking", "lead", "message", "conversion"]);
  }

  return orderCandidates(["booking", "lead", "message", "purchase", "conversion"]);
}

function orderCandidates(keys: KpiCandidate["key"][]) {
  return keys
    .map((key) => KPI_CANDIDATES.find((candidate) => candidate.key === key))
    .filter((candidate): candidate is KpiCandidate => Boolean(candidate));
}

function fallbackKpiLabel(input: MetaKpiInput) {
  const text = [input.campaignUmbrella, input.campaignName, input.objective, input.optimizationGoal]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/appointment|book|schedule|calendly|acuity/.test(text)) return "Bookings";
  if (/message|messaging|replies|reply|engagement|product|promotion|wkds|ooak/.test(text)) return "Messages";
  if (/lead|forms?|cash for gold/.test(text)) return "Leads";
  if (/purchase|sales|conversions/.test(text)) return "Purchases";
  return "Results";
}

export function actionArray(value: unknown): MetaKpiAction[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    action_type: typeof item.action_type === "string" ? item.action_type : null,
    value: typeof item.value === "string" || typeof item.value === "number" ? item.value : null,
  }));
}

export function totalActionValue(value: unknown) {
  return actionArray(value).reduce((sum, action) => sum + numberValue(action.value), 0);
}

export function actionCount(actions: MetaKpiAction[], actionTypes: string[]) {
  return actions.reduce((sum, action) => {
    const type = action.action_type || "";
    if (!actionTypes.some((target) => type.includes(target))) return sum;
    return sum + numberValue(action.value);
  }, 0);
}

function exactActionCount(actions: MetaKpiAction[], actionTypes: string[]) {
  return actions.reduce((sum, action) => {
    if (!action.action_type || !actionTypes.includes(action.action_type)) return sum;
    return sum + numberValue(action.value);
  }, 0);
}

function firstExactActionValue(actions: MetaKpiAction[], actionTypes: string[]) {
  for (const action of actions) {
    if (action.action_type && actionTypes.includes(action.action_type)) {
      return numberValue(action.value);
    }
  }
  return null;
}

function firstMatchingActionType(
  actions: MetaKpiAction[],
  costActions: MetaKpiAction[],
  actionTypes: string[],
) {
  const combined = [...actions, ...costActions];
  return combined.find((action) => action.action_type && actionTypes.includes(action.action_type))
    ?.action_type || actionTypes[0] || null;
}

function safeCost(spend: number, resultCount: number) {
  return resultCount > 0 ? spend / resultCount : null;
}

function numberValue(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
