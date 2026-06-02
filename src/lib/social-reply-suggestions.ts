import { createAdsAnalystClient } from "./ads-analyst-db.ts";
import {
  getAnthropicReplyMaxTranscriptChars,
  getAnthropicReplyModel,
  isAiReplySuggestionsEnabled,
} from "./env.ts";
import type { MetaInboxAccessProfile } from "./meta-inbox-access.ts";
import { withActiveMetaInboxEnvironment } from "./meta-inbox-environment.ts";
import { inferSocialBrand, type BrandLabel } from "./social-brand.ts";
import {
  getSocialInboxConversationKnownHistory,
  type SocialInboxConversation,
  type SocialInboxConversationHistory,
} from "./social-inbox.ts";
import {
  createAnthropicReplySuggestion,
  type AnthropicReplyClient,
} from "./social-reply-anthropic.ts";
import {
  buildSocialReplyContext,
  type SocialReplyExample,
  type SocialReplyPromptProfile,
  type SocialReplyRequestedLanguage,
} from "./social-reply-context.ts";
import type {
  SocialReplyConfidence,
  SocialReplyLanguage,
  SocialReplyNextBestAction,
} from "./social-reply-output-schema.ts";

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
  select: (columns: string) => DynamicQuery;
  eq: (column: string, value: string | number | boolean | null) => DynamicQuery;
  order: (
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ) => DynamicQuery;
  limit: (count: number) => DynamicQuery;
  maybeSingle: () => Promise<DynamicSingleResult>;
  single: () => Promise<DynamicSingleResult>;
};

type DynamicTable = {
  select: (columns: string) => DynamicQuery;
  insert: (row: JsonRecord) => DynamicQuery;
};

type DynamicSupabaseClient = {
  from: (table: string) => DynamicTable;
};

export type SuggestReplyInput = {
  conversationId: string;
  brand?: BrandLabel;
  language?: SocialReplyRequestedLanguage;
  staffGuidance?: string | null;
};

export type SuggestReplyResult = {
  suggestionId: string;
  draft: string;
  provider: "anthropic";
  model: string;
  language: SocialReplyLanguage;
  strategy: string;
  nextBestAction: SocialReplyNextBestAction;
  confidence: SocialReplyConfidence;
  riskFlags: string[];
  toneNotes: string[];
  contextUsed: ReturnType<typeof buildSocialReplyContext>["contextUsed"];
};

export type SuggestReplyOptions = {
  history?: SocialInboxConversationHistory | null;
  anthropicClient?: AnthropicReplyClient;
  supabase?: DynamicSupabaseClient;
};

export async function suggestSocialReply(
  input: SuggestReplyInput,
  profile: MetaInboxAccessProfile,
  options: SuggestReplyOptions = {},
): Promise<SuggestReplyResult> {
  if (!isAiReplySuggestionsEnabled()) {
    throw new Error("AI reply suggestions are disabled.");
  }

  const conversationId = input.conversationId.trim();
  if (!conversationId) throw new Error("Conversation ID is required.");

  const history =
    options.history ?? (await getSocialInboxConversationKnownHistory(conversationId, profile));
  if (!history) throw new Error("Conversation not found.");

  const supabase = options.supabase || dynamicSupabase();
  const brand = resolveBrand(input.brand, history.conversation);
  const promptProfile = await loadActivePromptProfile(supabase, brand);
  const examples = await loadTrainingExamples(supabase, brand, promptProfile?.id || null);
  const context = buildSocialReplyContext({
    history,
    brand,
    requestedLanguage: normalizeRequestedLanguage(input.language),
    customerName: customerNameFromHistory(history),
    staffGuidance: input.staffGuidance,
    promptProfile,
    examples,
    maxTranscriptChars: getAnthropicReplyMaxTranscriptChars(),
  });

  const model = getAnthropicReplyModel();
  const anthropic = await createAnthropicReplySuggestion({
    context,
    model,
    client: options.anthropicClient,
  });
  const output = anthropic.output;
  const source = sourceColumnsForConversation(history.conversation);
  const insert = await supabase
    .from("ai_reply_suggestions")
    .insert(withActiveMetaInboxEnvironment({
      platform: history.conversation.platform,
      source_type: source.sourceType,
      thread_id: source.threadId,
      comment_id: source.commentId,
      conversation_id: history.conversation.id,
      brand,
      language: output.suggestedLanguage === "mixed" ? "en" : output.suggestedLanguage,
      draft: output.draft,
      status: "drafted",
      context_used: context.contextUsed,
      request_context: {
        provider: "anthropic",
        staffGuidancePresent: Boolean(input.staffGuidance?.trim()),
        transcriptTruncated: context.transcriptTruncated,
        omittedTranscriptItems: context.omittedTranscriptItems,
      },
      provider: "anthropic",
      model: anthropic.model,
      prompt_profile_id: promptProfile?.id || null,
      prompt_version: promptProfile?.version || null,
      strategy: output.strategy,
      next_best_action: output.nextBestAction,
      confidence: output.confidence,
      risk_flags: output.riskFlags,
      tone_notes: output.toneNotes,
      usage: anthropic.usage,
    }))
    .select("id")
    .single();

  if (insert.error) throw insert.error;
  const suggestionId = stringField(insert.data?.id);
  if (!suggestionId) throw new Error("Reply suggestion did not return an ID.");

  return {
    suggestionId,
    draft: output.draft,
    provider: "anthropic",
    model: anthropic.model,
    language: output.suggestedLanguage,
    strategy: output.strategy,
    nextBestAction: output.nextBestAction,
    confidence: output.confidence,
    riskFlags: output.riskFlags,
    toneNotes: output.toneNotes,
    contextUsed: context.contextUsed,
  };
}

async function loadActivePromptProfile(
  supabase: DynamicSupabaseClient,
  brand: BrandLabel,
): Promise<SocialReplyPromptProfile | null> {
  const result = await supabase
    .from("ai_reply_prompt_profiles")
    .select("*")
    .eq("brand", brand)
    .eq("active", true)
    .order("version", { ascending: false })
    .limit(1);
  if (result.error) throw result.error;

  const row = rows(result.data)[0];
  if (!row) return null;

  return {
    id: stringField(row.id),
    brand,
    name: stringField(row.name) || `${brand} reply profile`,
    version: numberField(row.version),
    businessContext: stringField(row.business_context) || "",
    salesGuidance: stringField(row.sales_guidance) || "",
    toneGuidance: stringField(row.tone_guidance) || "",
    disallowedClaims: stringArray(row.disallowed_claims),
  };
}

async function loadTrainingExamples(
  supabase: DynamicSupabaseClient,
  brand: BrandLabel,
  promptProfileId: string | null,
): Promise<SocialReplyExample[]> {
  const query = supabase
    .from("ai_reply_training_examples")
    .select("*")
    .eq("brand", brand)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(8);
  const result = promptProfileId ? await query.eq("prompt_profile_id", promptProfileId) : await query;
  if (result.error) throw result.error;

  return rows(result.data)
    .map((row) => ({
      id: String(row.id || ""),
      title: stringField(row.title) || "Training example",
      conversation: trainingConversationText(row.conversation_messages),
      idealResponse: stringField(row.ideal_response) || "",
      critique: stringField(row.critique),
    }))
    .filter((example) => example.conversation && example.idealResponse)
    .slice(0, 3);
}

function resolveBrand(
  inputBrand: BrandLabel | undefined,
  conversation: SocialInboxConversation,
): BrandLabel {
  if (inputBrand === "HP" || inputBrand === "VVS" || inputBrand === "Unassigned") {
    return inputBrand;
  }
  const inferred = inferSocialBrand(conversation.page_id, conversation.ig_user_id);
  return inferred === "Unassigned" ? "HP" : inferred;
}

function sourceColumnsForConversation(conversation: SocialInboxConversation) {
  if (conversation.source_type === "public_comment") {
    return {
      sourceType: "comment",
      threadId: null,
      commentId: conversation.source_id,
    };
  }

  return {
    sourceType: "message",
    threadId: conversation.platform_thread_id || conversation.source_id,
    commentId: null,
  };
}

function customerNameFromHistory(history: SocialInboxConversationHistory) {
  const latestCustomerMessage = [...history.messages]
    .reverse()
    .find((message) => message.direction === "inbound" && message.sender_name);
  if (latestCustomerMessage?.sender_name) return latestCustomerMessage.sender_name;
  const latestComment = [...history.comments].reverse().find((comment) => comment.author_name);
  return latestComment?.author_name || null;
}

function normalizeRequestedLanguage(value: unknown): SocialReplyRequestedLanguage {
  return value === "en" || value === "vi" || value === "auto" ? value : "auto";
}

function trainingConversationText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (!Array.isArray(value)) return "";

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const record = item as Record<string, unknown>;
      const speaker = stringField(record.speaker) || stringField(record.role) || "Customer";
      const body = stringField(record.body) || stringField(record.text) || "";
      return body ? `${speaker}: ${body}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function dynamicSupabase() {
  return createAdsAnalystClient("web") as unknown as DynamicSupabaseClient;
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
