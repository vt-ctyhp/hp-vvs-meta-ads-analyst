import { createAdsAnalystClient } from "./ads-analyst-db.ts";
import type { MetaInboxAccessProfile } from "./meta-inbox-access.ts";
import {
  scopeActiveMetaInboxEnvironment,
  withActiveMetaInboxEnvironment,
} from "./meta-inbox-environment.ts";
import { getAnthropicReplyMaxTranscriptChars } from "./env.ts";
import type { BrandLabel } from "./social-brand.ts";
import { createAnthropicReplySuggestion } from "./social-reply-anthropic.ts";
import { buildSocialReplyContext } from "./social-reply-context.ts";
import type { SocialInboxConversationHistory } from "./social-inbox.ts";

type JsonRecord = Record<string, unknown>;

type DynamicQueryResult = {
  data: JsonRecord[] | null;
  error: Error | null;
};

type DynamicSingleResult = {
  data: JsonRecord | null;
  error: Error | null;
};

type DynamicQuery = PromiseLike<DynamicQueryResult> & {
  eq: (column: string, value: string | number | boolean | null) => DynamicQuery;
  order: (
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ) => DynamicQuery;
  limit: (count: number) => DynamicQuery;
  select: (columns: string) => DynamicQuery;
  single: () => Promise<DynamicSingleResult>;
};

type DynamicUpdateQuery = DynamicQuery & {
  select: (columns: string) => DynamicQuery;
};

type DynamicTable = {
  select: (columns: string) => DynamicQuery;
  insert: (row: JsonRecord) => DynamicQuery;
  update: (row: JsonRecord) => DynamicUpdateQuery;
};

type DynamicSupabaseClient = {
  from: (table: string) => DynamicTable;
};

export type AiReplyPromptProfileInput = {
  profileId?: string | null;
  brand?: string | null;
  businessContext?: string | null;
  salesGuidance?: string | null;
  toneGuidance?: string | null;
  disallowedClaims?: string[] | null;
};

export type AiReplyTrainingExampleInput = {
  promptProfileId?: string | null;
  brand?: string | null;
  title?: string | null;
  source?: string | null;
  conversationText?: string | null;
  idealResponse?: string | null;
  critique?: string | null;
  rating?: number | string | null;
};

export type AiReplyTrainingSimulationInput = {
  brand?: string | null;
  conversationText?: string | null;
  staffGuidance?: string | null;
};

export type AiReplyPromptProfileRow = {
  id: string;
  brand: BrandLabel;
  name: string;
  version: number;
  businessContext: string;
  salesGuidance: string;
  toneGuidance: string;
  disallowedClaims: string[];
  active: boolean;
};

export type AiReplyTrainingExampleRow = {
  id: string;
  promptProfileId: string | null;
  brand: BrandLabel;
  title: string;
  source: string;
  conversationText: string;
  idealResponse: string;
  critique: string | null;
  rating: number | null;
  active: boolean;
};

export async function getAiReplyTrainingData() {
  const supabase = dynamicSupabase();
  const [profiles, examples] = await Promise.all([
    scopeActiveMetaInboxEnvironment(
      supabase.from("ai_reply_prompt_profiles").select("*"),
    )
      .order("brand", { ascending: true })
      .order("version", { ascending: false })
      .limit(20),
    scopeActiveMetaInboxEnvironment(
      supabase.from("ai_reply_training_examples").select("*"),
    )
      .order("updated_at", { ascending: false })
      .limit(40),
  ]);

  if (profiles.error) throw profiles.error;
  if (examples.error) throw examples.error;

  return {
    profiles: rows(profiles.data).map(mapPromptProfile),
    examples: rows(examples.data).map(mapTrainingExample),
    questions: [
      "What must the advisor know before replying?",
      "When should the advisor push for a store visit or appointment?",
      "What claims should the draft never make?",
    ],
  };
}

export async function updateAiReplyPromptProfile(
  actor: MetaInboxAccessProfile,
  input: AiReplyPromptProfileInput,
) {
  const supabase = dynamicSupabase();
  const brand = brandField(input.brand);
  const profileId = stringField(input.profileId);
  if (!profileId) throw new Error("Prompt profile ID is required.");

  const update = await scopeActiveMetaInboxEnvironment(
    supabase
      .from("ai_reply_prompt_profiles")
      .update({
        business_context: requiredText(input.businessContext, "Business context"),
        sales_guidance: requiredText(input.salesGuidance, "Sales guidance"),
        tone_guidance: requiredText(input.toneGuidance, "Tone guidance"),
        disallowed_claims: stringArray(input.disallowedClaims),
        updated_by: uuidOrNull(actor.appUserId),
        updated_at: new Date().toISOString(),
      }) as unknown as DynamicUpdateQuery,
  )
    .eq("id", profileId)
    .eq("brand", brand)
    .select("*")
    .single();

  if (update.error) throw update.error;
  if (!update.data) throw new Error("Prompt profile did not return after update.");

  return {
    profile: mapPromptProfile(update.data),
  };
}

export async function createAiReplyTrainingExample(
  actor: MetaInboxAccessProfile,
  input: AiReplyTrainingExampleInput,
) {
  const supabase = dynamicSupabase();
  const brand = brandField(input.brand);
  const title = requiredText(input.title, "Title");
  const idealResponse = requiredText(input.idealResponse, "Ideal response");
  const conversationMessages = parseConversationText(
    requiredText(input.conversationText, "Conversation"),
  );

  const insert = await supabase
    .from("ai_reply_training_examples")
    .insert(withActiveMetaInboxEnvironment({
      prompt_profile_id: stringField(input.promptProfileId),
      brand,
      title,
      source: sourceField(input.source),
      conversation_messages: conversationMessages,
      ideal_response: idealResponse,
      critique: stringField(input.critique),
      rating: ratingField(input.rating),
      active: true,
      created_by: uuidOrNull(actor.appUserId),
      updated_by: uuidOrNull(actor.appUserId),
    }))
    .select("*")
    .single();

  if (insert.error) throw insert.error;
  if (!insert.data) throw new Error("Training example did not return after insert.");

  return {
    example: mapTrainingExample(insert.data),
  };
}

export async function simulateAiReplyTrainingDraft(input: AiReplyTrainingSimulationInput) {
  const brand = brandField(input.brand);
  const conversationText = requiredText(input.conversationText, "Conversation");
  const trainingData = await getAiReplyTrainingData();
  const profile = trainingData.profiles.find((candidate) => candidate.brand === brand) || null;
  const examples = trainingData.examples
    .filter((example) => example.brand === brand)
    .slice(0, 3)
    .map((example) => ({
      id: example.id,
      title: example.title,
      conversation: example.conversationText,
      idealResponse: example.idealResponse,
      critique: example.critique,
    }));
  const context = buildSocialReplyContext({
    history: fakeHistoryFromConversationText(brand, conversationText),
    brand,
    requestedLanguage: "auto",
    staffGuidance: stringField(input.staffGuidance),
    promptProfile: profile
      ? {
          id: profile.id,
          brand: profile.brand,
          name: profile.name,
          version: profile.version,
          businessContext: profile.businessContext,
          salesGuidance: profile.salesGuidance,
          toneGuidance: profile.toneGuidance,
          disallowedClaims: profile.disallowedClaims,
        }
      : null,
    examples,
    maxTranscriptChars: getAnthropicReplyMaxTranscriptChars(),
  });
  const result = await createAnthropicReplySuggestion({ context });

  return {
    draft: result.output.draft,
    strategy: result.output.strategy,
    nextBestAction: result.output.nextBestAction,
    confidence: result.output.confidence,
    riskFlags: result.output.riskFlags,
    toneNotes: result.output.toneNotes,
    model: result.model,
    usage: result.usage,
  };
}

function dynamicSupabase() {
  return createAdsAnalystClient("web") as unknown as DynamicSupabaseClient;
}

function mapPromptProfile(row: JsonRecord): AiReplyPromptProfileRow {
  return {
    id: String(row.id || ""),
    brand: brandField(row.brand),
    name: stringField(row.name) || "Reply profile",
    version: numberField(row.version) || 1,
    businessContext: stringField(row.business_context) || "",
    salesGuidance: stringField(row.sales_guidance) || "",
    toneGuidance: stringField(row.tone_guidance) || "",
    disallowedClaims: stringArray(row.disallowed_claims),
    active: row.active !== false,
  };
}

function mapTrainingExample(row: JsonRecord): AiReplyTrainingExampleRow {
  return {
    id: String(row.id || ""),
    promptProfileId: stringField(row.prompt_profile_id),
    brand: brandField(row.brand),
    title: stringField(row.title) || "Training example",
    source: sourceField(row.source),
    conversationText: conversationTextFromMessages(row.conversation_messages),
    idealResponse: stringField(row.ideal_response) || "",
    critique: stringField(row.critique),
    rating: numberField(row.rating),
    active: row.active !== false,
  };
}

function parseConversationText(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(":");
      if (separator < 0) return { speaker: "Customer", body: line };
      return {
        speaker: line.slice(0, separator).trim() || "Customer",
        body: line.slice(separator + 1).trim(),
      };
    })
    .filter((message) => message.body);
}

function fakeHistoryFromConversationText(
  brand: BrandLabel,
  value: string,
): SocialInboxConversationHistory {
  const messages = parseConversationText(value).map((message, index) => {
    const team = /^(team|advisor|staff|hung phat|hp|vvs|mia|sales)$/i.test(message.speaker);
    return {
      id: `training-message-${index}`,
      platform: "instagram" as const,
      thread_id: "training-thread",
      message_id: `training-mid-${index}`,
      direction: team ? "outbound" as const : "inbound" as const,
      sender_id: team ? "team" : "customer",
      sender_name: message.speaker,
      recipient_id: team ? "customer" : "team",
      recipient_name: team ? "Customer" : brand,
      body: message.body,
      attachments: [],
      sent_at: new Date(Date.UTC(2026, 5, 1, 16, index)).toISOString(),
    };
  });
  const latestInbound = [...messages].reverse().find((message) => message.direction === "inbound");
  const latestOutbound = [...messages].reverse().find((message) => message.direction === "outbound");
  const latestMessage = messages[messages.length - 1] || null;

  return {
    conversation: {
      id: "33333333-3333-4333-8333-333333333333",
      canonical_conversation_key: "training:thread",
      source_channel: "instagram_message",
      source_type: "message_thread",
      platform: "instagram",
      customer_profile_id: null,
      page_id: null,
      ig_user_id: null,
      participant_id: "training-customer",
      platform_thread_id: "training-thread",
      parent_content_id: null,
      source_id: "training-thread",
      first_inbound_at: messages[0]?.sent_at || null,
      latest_inbound_at: latestInbound?.sent_at || null,
      latest_outbound_at: latestOutbound?.sent_at || null,
      last_activity_at: latestMessage?.sent_at || null,
      needs_reply: true,
      reply_window_expires_at: null,
      human_agent_window_expires_at: null,
      send_eligibility: "standard_reply_allowed",
      conversation_status: "needs_reply",
      assigned_team_id: null,
      ["assigned_user_id"]: null,
      follow_up_at: null,
      lead_quality: null,
      lead_quality_reason_tags: [],
      inbox_outcome: "no_outcome_yet",
      inbox_lost_reason: null,
      queue_category_key: "general_inquiry",
      routing_source: "training",
      routing_confidence: null,
      routing_explanation: null,
    },
    messages,
    comments: [],
    pageInfo: {
      pageSize: messages.length,
      returned: messages.length,
      knownTotal: messages.length,
      nextCursor: null,
      historyCompleteness: messages.length ? "complete_known_history" : "no_known_history",
    },
  };
}

function conversationTextFromMessages(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const record = item as Record<string, unknown>;
      const speaker = stringField(record.speaker) || "Customer";
      const body = stringField(record.body);
      return body ? `${speaker}: ${body}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function requiredText(value: unknown, label: string) {
  const text = stringField(value);
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function brandField(value: unknown): BrandLabel {
  if (value === "HP" || value === "VVS" || value === "Unassigned") return value;
  return "HP";
}

function sourceField(value: unknown) {
  if (value === "real" || value === "operator_feedback") return value;
  return "synthetic";
}

function ratingField(value: unknown) {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed)
    ? Math.max(1, Math.min(5, Math.floor(parsed)))
    : null;
}

function rows(data: JsonRecord[] | null | undefined) {
  return Array.isArray(data) ? data : [];
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
    : [];
}

function uuidOrNull(value: string | null | undefined) {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}
