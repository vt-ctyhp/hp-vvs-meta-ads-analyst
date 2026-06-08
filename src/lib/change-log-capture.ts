import OpenAI from "openai";

import { createAdsAnalystClient, getAdsAnalystEnvironment } from "./ads-analyst-db.ts";
import { compareVerifyValue, resolveRelativeDate } from "./change-log-draft.ts";
import { ConfigurationError, getOpenAIModel } from "./env.ts";
import { fetchLiveAdSetState } from "./meta.ts";
import type {
  BrandCode, ChangeLogDraft, ChangeLogEntityRef, ChangeType, EntityKind,
} from "./change-log-types.ts";

type DynamicSupabaseClient = ReturnType<typeof createAdsAnalystClient> & { from: (t: string) => any };
function db() { return createAdsAnalystClient("web") as unknown as DynamicSupabaseClient; }

// The strict JSON shape we ask the model to return.
type Extraction = {
  changeType: ChangeType;
  title: string;
  reason: string;
  eventPhrase: string;       // e.g. "last friday" or "2026-05-30"
  effectiveStart: string | null;
  effectiveEnd: string | null;
  beforeValue: string | null;
  afterValue: string | null;
  entities: { kind: EntityKind; name: string }[];
};

const VALID_TYPES: ChangeType[] = ["budget","status","audience","creative","promotion","price","website","other"];
const VALID_KINDS: EntityKind[] = ["ad_set","campaign","creative","account","website"];

/**
 * Resolve an entity name against cached Meta tables for this brand's account.
 * matched = exactly one row; ambiguous = several; unmatched = none.
 */
async function resolveEntity(
  kind: EntityKind,
  name: string,
  metaAccountId: string | null,
): Promise<ChangeLogEntityRef> {
  if ((kind !== "ad_set" && kind !== "campaign") || !metaAccountId) {
    return { entityKind: kind, entityMetaId: null, entityName: name, matchStatus: "unmatched" };
  }
  const supabase = db();
  const table = kind === "ad_set" ? "meta_ad_sets" : "meta_campaigns";
  const idCol = kind === "ad_set" ? "ad_set_id" : "campaign_id";
  const { data } = await supabase
    .from(table)
    .select(`${idCol}, name`)
    .eq("environment", getAdsAnalystEnvironment())
    .eq("meta_account_id", metaAccountId)
    .ilike("name", `%${name}%`)
    .limit(5);
  const rows = (data ?? []) as Record<string, string>[];
  if (rows.length === 1) {
    return { entityKind: kind, entityMetaId: rows[0][idCol], entityName: rows[0].name ?? name, matchStatus: "matched" };
  }
  if (rows.length > 1) {
    return { entityKind: kind, entityMetaId: null, entityName: name, matchStatus: "ambiguous" };
  }
  return { entityKind: kind, entityMetaId: null, entityName: name, matchStatus: "unmatched" };
}

// Mirrors the analysis-completion path in src/lib/ai.ts: the OpenAI client built
// from OPENAI_API_KEY, the OPENAI_MODEL (getOpenAIModel), and a strict
// json_object completion. No new SDK, provider, or env var is introduced.
function createOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ConfigurationError("Missing OPENAI_API_KEY", ["OPENAI_API_KEY"]);
  }
  return new OpenAI({ apiKey });
}

const EXTRACTION_SYSTEM_PROMPT = [
  "You convert a single free-text note about a Meta Ads change into one strict JSON object.",
  "Return ONLY the JSON object, no prose and no code fences.",
  "Keys (all required): changeType, title, reason, eventPhrase, effectiveStart, effectiveEnd, beforeValue, afterValue, entities.",
  `changeType MUST be exactly one of: ${VALID_TYPES.join(", ")}. If unsure, use "other".`,
  "title: short label for the change. reason: why it was made (use the note; never invent facts).",
  'eventPhrase: the date the change happened, copied as the user wrote it (e.g. "last friday", "yesterday", "2026-05-30"). If no date is stated, use "today".',
  "effectiveStart / effectiveEnd: ISO YYYY-MM-DD when the change takes/ends effect, else null.",
  "beforeValue / afterValue: the prior and new value as short strings (e.g. \"$50/day\"), else null.",
  `entities: array of { kind, name } the change touches. kind MUST be one of: ${VALID_KINDS.join(", ")}. name is the entity name as written. Use [] if none are named.`,
  "Do not add keys. Do not include commentary.",
].join("\n");

/** Extract structured fields from free text using the existing analysis LLM client. */
async function extractFields(text: string): Promise<Extraction> {
  const openai = createOpenAIClient();
  const response = await openai.chat.completions.create({
    model: getOpenAIModel(),
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  const parsed = parseExtraction(raw);

  const changeType: ChangeType = VALID_TYPES.includes(parsed.changeType as ChangeType)
    ? (parsed.changeType as ChangeType)
    : "other";

  const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
  const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : "";
  const eventPhrase = typeof parsed.eventPhrase === "string" ? parsed.eventPhrase.trim() : "";
  if (!title || !reason || !eventPhrase) {
    throw new Error("Could not read the change from that note. Add what changed, why, and when.");
  }

  const entities = Array.isArray(parsed.entities)
    ? parsed.entities
        .filter((e): e is { kind: EntityKind; name: string } =>
          !!e &&
          typeof e === "object" &&
          typeof (e as { kind?: unknown }).kind === "string" &&
          VALID_KINDS.includes((e as { kind: string }).kind as EntityKind) &&
          typeof (e as { name?: unknown }).name === "string" &&
          (e as { name: string }).name.trim().length > 0)
        .map((e) => ({ kind: e.kind, name: e.name.trim() }))
    : [];

  return {
    changeType,
    title,
    reason,
    eventPhrase,
    effectiveStart: stringOrNull(parsed.effectiveStart),
    effectiveEnd: stringOrNull(parsed.effectiveEnd),
    beforeValue: stringOrNull(parsed.beforeValue),
    afterValue: stringOrNull(parsed.afterValue),
    entities,
  };
}

// Parse the model JSON. Strip a leading/trailing markdown code fence if present,
// then JSON.parse. A non-object or unparseable response is a 4xx-worthy error.
function parseExtraction(raw: string | null | undefined): Record<string, unknown> {
  if (!raw || !raw.trim()) {
    throw new Error("The model returned an empty response. Try rephrasing the note.");
  }
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new Error("Could not read the change from that note. Try rephrasing it.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Could not read the change from that note. Try rephrasing it.");
  }
  return parsed as Record<string, unknown>;
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function draftChangeLogEntryFromText(input: {
  text: string;
  brandCode: BrandCode;
  metaAccountId: string | null;
  today: string;
}): Promise<ChangeLogDraft> {
  const warnings: string[] = [];
  const extraction = await extractFields(input.text);

  const resolvedDate = resolveRelativeDate(extraction.eventPhrase, input.today);

  const entities: ChangeLogEntityRef[] = [];
  for (const e of extraction.entities) {
    const ref = await resolveEntity(e.kind, e.name, input.metaAccountId);
    if (ref.matchStatus === "ambiguous") warnings.push(`"${e.name}" matched more than one ${e.kind}. Pick the right one.`);
    if (ref.matchStatus === "unmatched" && (e.kind === "ad_set" || e.kind === "campaign")) {
      warnings.push(`Could not find a ${e.kind} named "${e.name}".`);
    }
    entities.push(ref);
  }

  // Live-verify the first matched ad set, if any.
  let verifyValue: ChangeLogDraft["verifyValue"] = "na";
  let afterValue = extraction.afterValue;
  const matchedAdSet = entities.find((e) => e.entityKind === "ad_set" && e.matchStatus === "matched");
  if (matchedAdSet?.entityMetaId && extraction.changeType === "budget") {
    const live = await fetchLiveAdSetState(matchedAdSet.entityMetaId);
    if (live?.dailyBudget) {
      verifyValue = compareVerifyValue(extraction.afterValue, live.dailyBudget);
      if (verifyValue === "na" && !afterValue) afterValue = `$${(Number(live.dailyBudget) / 100).toFixed(0)}/day`;
    } else {
      warnings.push("Could not read the live budget from Meta; logged without a value check.");
    }
  }

  const verifyEntity: ChangeLogDraft["verifyEntity"] =
    entities.some((e) => e.matchStatus === "ambiguous") ? "ambiguous"
    : entities.some((e) => e.matchStatus === "matched") ? "matched"
    : "none";

  return {
    brandCode: input.brandCode,
    eventDate: resolvedDate.date,
    eventDateNote: resolvedDate.note,
    effectiveStart: extraction.effectiveStart,
    effectiveEnd: extraction.effectiveEnd,
    changeType: extraction.changeType,
    title: extraction.title,
    reason: extraction.reason,
    beforeValue: extraction.beforeValue,
    afterValue,
    rawInput: input.text,
    verifyEntity,
    verifyValue,
    entities,
    warnings,
  };
}
