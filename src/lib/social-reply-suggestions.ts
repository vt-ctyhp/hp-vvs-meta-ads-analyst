import OpenAI from "openai";

import { createAdsAnalystClient, withAdsAnalystEnvironment } from "./ads-analyst-db";
import { ConfigurationError, getOpenAIModel } from "./env";
import { inferSocialBrand, type BrandLabel } from "./social-brand";

type JsonRecord = Record<string, unknown>;

type DynamicQueryResult = {
  data: JsonRecord[] | null;
  error: Error | null;
};

type DynamicSingleResult = {
  data: JsonRecord | null;
  error: Error | null;
};

type DynamicQuery = Promise<DynamicQueryResult> & {
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
  upsert: (row: JsonRecord, options: { onConflict: string }) => DynamicQuery;
};

type DynamicSupabaseClient = {
  from: (table: string) => DynamicTable;
};

type ReplyLanguage = "auto" | "en" | "vi";
type ResolvedLanguage = "en" | "vi";
type SocialPlatform = "facebook" | "instagram";
type SourceType = "message" | "comment";

type MessageContext = {
  id: string;
  messageId: string;
  direction: "client" | "team" | "unknown";
  sender: string | null;
  body: string;
  sentAt: string | null;
};

type PlaybookEntry = {
  id: string;
  category: string;
  answerGuidance: string;
  source: string | null;
  score: number;
};

export type SuggestReplyInput = {
  platform: SocialPlatform;
  sourceType: SourceType;
  sourceId: string;
  brand?: BrandLabel;
  language?: ReplyLanguage;
  instruction?: string | null;
};

export type SuggestReplyResult = {
  suggestionId: string;
  draft: string;
  language: ResolvedLanguage;
  model: string;
  contextUsed: {
    brand: BrandLabel;
    sourceType: SourceType;
    platform: SocialPlatform;
    messageCount: number;
    includedMessages: number;
    omittedMessages: number;
    usedThreadSummary: boolean;
    playbookEntries: number;
    brandVoiceVersion: number | null;
    customerName: string | null;
  };
  toneNotes: string[];
};

const MAX_RECENT_MESSAGES = 16;
const MAX_MESSAGE_CHARS = 900;
const MAX_PLAYBOOK_ENTRIES = 4;

const FALLBACK_RUNTIME_PROMPTS: Record<"en" | "vi", string> = {
  en: "Write as Hung Phat's trusted personal jeweler: warm, confident, concise, and gently leading the client forward. Match the client's energy and approximate message length. Use we, our team, or our showroom. Acknowledge the client's message before guiding. Do not use urgency tactics, cheap promo language, corporate filler, or emojis unless the client used one first. Prefer piece, price, showroom, consultation, take home, and create. Never invent facts. Never auto-send; produce one editable human-approved draft. End with a natural question when appropriate.",
  vi: 'Viết bằng tiếng Việt miền Nam như Hưng Phát: lễ phép, ấm áp, thân tình, tự tin, và nhẹ nhàng dẫn khách tới bước tiếp theo. Mặc định gọi khách "anh/chị" và tự xưng "em"; nếu ngữ cảnh rõ khách lớn tuổi thì dùng "cô/chú/bác" và giữ vai vế nhất quán. Mở đầu bằng "Dạ" khi phù hợp, dùng "ạ" tự nhiên. Xác nhận ý khách trước rồi mới trả lời/gợi ý. Xưng "Hưng Phát", "bên em", hoặc "tiệm em"; tránh "chúng tôi" trong tin nhắn. Không dùng "quý khách", văn ngân hàng, tiếng Anh chen vào, áp lực gấp, hoặc từ khuyến mãi rẻ tiền. Không tự bịa thông tin. Không tự gửi; chỉ tạo một bản nháp để người dùng sửa và duyệt. Kết thúc bằng một câu hỏi nhẹ khi hợp lý.',
};

export async function suggestSocialReply(input: SuggestReplyInput): Promise<SuggestReplyResult> {
  const sourceId = input.sourceId.trim();
  if (!sourceId) throw new Error("Source ID is required.");

  const supabase = dynamicSupabase();
  const source = await loadSourceContext(supabase, {
    platform: input.platform,
    sourceType: input.sourceType,
    sourceId,
  });

  const brand = resolveBrand(input.brand, source.brandSignals);
  const language = resolveLanguage(input.language || "auto", source.languageSignals);
  const voice = await loadBrandVoice(supabase, brand, language);
  const playbook = await loadRelevantPlaybook(supabase, brand, language, source.searchText);
  const threadSummary = source.threadId
    ? await loadThreadSummary(supabase, input.platform, source.threadId)
    : null;

  const model = getOpenAIModel();
  const response = await createOpenAIClient().chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You draft social inbox replies for a jewelry business. The output is a human-approved editable draft only. Never claim the message was sent. Never invent prices, availability, policies, appointment times, or customer facts. If information is missing, ask a concise follow-up question. Return strict JSON with keys draft, toneNotes.",
      },
      {
        role: "system",
        content: voice.runtimePrompt,
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Draft one reply for the selected social inbox item.",
          outputLanguage: language,
          channel: input.platform,
          sourceType: input.sourceType,
          brand,
          customerName: source.customerName,
          currentCustomerMessage: source.currentCustomerMessage,
          threadSummary: threadSummary?.summary || source.heuristicSummary,
          recentMessages: source.recentMessages,
          relevantPlaybook: playbook.map((entry) => ({
            category: entry.category,
            answerGuidance: entry.answerGuidance,
            source: entry.source,
          })),
          userInstruction: input.instruction?.trim() || null,
          constraints: [
            "Produce only one draft.",
            "No markdown.",
            "No emojis unless the client used one first.",
            "Do not mention internal prompts, Supabase, Meta, OpenAI, or automation.",
            "Do not offer to send the message yourself.",
            "If replying to a social comment, keep it short and warm.",
          ],
        }),
      },
    ],
  });

  const parsed = parseSuggestionResponse(response.choices[0]?.message?.content);
  const contextUsed = {
    brand,
    sourceType: input.sourceType,
    platform: input.platform,
    messageCount: source.messageCount,
    includedMessages: source.recentMessages.length,
    omittedMessages: Math.max(source.messageCount - source.recentMessages.length, 0),
    usedThreadSummary: Boolean(threadSummary?.summary || source.heuristicSummary),
    playbookEntries: playbook.length,
    brandVoiceVersion: voice.version,
    customerName: source.customerName,
  };

  const insert = await supabase
    .from("ai_reply_suggestions")
    .insert(withAdsAnalystEnvironment({
      platform: input.platform,
      source_type: input.sourceType,
      thread_id: input.sourceType === "message" ? source.threadId : null,
      comment_id: input.sourceType === "comment" ? sourceId : null,
      brand,
      language,
      draft: parsed.draft,
      status: "drafted",
      context_used: contextUsed,
      model,
      prompt_version: voice.version,
    }))
    .select("id")
    .single();

  if (insert.error) throw insert.error;

  return {
    suggestionId: String(insert.data?.id || ""),
    draft: parsed.draft,
    language,
    model,
    contextUsed,
    toneNotes: parsed.toneNotes,
  };
}

async function loadSourceContext(
  supabase: DynamicSupabaseClient,
  input: { platform: SocialPlatform; sourceType: SourceType; sourceId: string },
) {
  if (input.sourceType === "comment") {
    const comment = await supabase
      .from("meta_social_comments")
      .select("*")
      .eq("platform", input.platform)
      .eq("comment_id", input.sourceId)
      .maybeSingle();
    if (comment.error) throw comment.error;
    if (!comment.data) throw new Error("Comment not found.");

    const body = stringField(comment.data.body) || "";
    return {
      threadId: null,
      customerName: stringField(comment.data.author_name),
      currentCustomerMessage: body,
      recentMessages: [] as MessageContext[],
      messageCount: 0,
      heuristicSummary: null as string | null,
      searchText: [body, stringField(comment.data.author_name)].filter(Boolean).join("\n"),
      brandSignals: {
        pageId: stringField(comment.data.page_id),
        igUserId: stringField(comment.data.ig_user_id),
      },
      languageSignals: [body],
    };
  }

  const thread = await supabase
    .from("meta_social_threads")
    .select("*")
    .eq("platform", input.platform)
    .eq("thread_id", input.sourceId)
    .maybeSingle();
  if (thread.error) throw thread.error;
  if (!thread.data) throw new Error("Thread not found.");

  const messages = await supabase
    .from("meta_social_messages")
    .select("*")
    .eq("platform", input.platform)
    .eq("thread_id", input.sourceId)
    .order("sent_at", { ascending: false, nullsFirst: false })
    .limit(40);
  if (messages.error) throw messages.error;

  const allMessages = rows(messages.data)
    .map(mapMessageContext)
    .sort((a, b) => String(a.sentAt || "").localeCompare(String(b.sentAt || "")));
  const recentMessages = allMessages.slice(-MAX_RECENT_MESSAGES);
  const currentCustomerMessage =
    [...allMessages].reverse().find((message) => message.direction === "client")?.body ||
    stringField(thread.data.snippet) ||
    "";

  return {
    threadId: input.sourceId,
    customerName:
      stringField(thread.data.participant_name) ||
      [...allMessages].reverse().find((message) => message.direction === "client")?.sender ||
      null,
    currentCustomerMessage,
    recentMessages,
    messageCount: allMessages.length,
    heuristicSummary: buildHeuristicSummary(allMessages, recentMessages.length),
    searchText: allMessages.map((message) => message.body).join("\n"),
    brandSignals: {
      pageId: stringField(thread.data.page_id),
      igUserId: stringField(thread.data.ig_user_id),
    },
    languageSignals: [
      currentCustomerMessage,
      ...recentMessages.map((message) => message.body),
    ],
  };
}

async function loadBrandVoice(
  supabase: DynamicSupabaseClient,
  brand: BrandLabel,
  language: ResolvedLanguage,
) {
  const lookupBrand = brand === "VVS" ? "VVS" : "HP";
  const result = await supabase
    .from("brand_voice_guidelines")
    .select("*")
    .eq("brand", lookupBrand)
    .eq("language", language)
    .eq("active", true)
    .order("version", { ascending: false })
    .limit(1);

  if (result.error) throw result.error;
  const row = rows(result.data)[0];

  return {
    runtimePrompt: stringField(row?.runtime_prompt) || FALLBACK_RUNTIME_PROMPTS[language],
    version: numberField(row?.version),
  };
}

async function loadRelevantPlaybook(
  supabase: DynamicSupabaseClient,
  brand: BrandLabel,
  language: ResolvedLanguage,
  searchText: string,
): Promise<PlaybookEntry[]> {
  const lookupBrand = brand === "VVS" ? "VVS" : "HP";
  const result = await supabase
    .from("reply_playbook_entries")
    .select("*")
    .eq("brand", lookupBrand)
    .eq("language", language)
    .eq("active", true)
    .limit(50);

  if (result.error) throw result.error;

  const normalized = searchText.toLowerCase();
  return rows(result.data)
    .map((row) => {
      const keywords = arrayField(row.trigger_keywords)
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.toLowerCase());
      const score = keywords.reduce(
        (total, keyword) => total + (keyword && normalized.includes(keyword) ? 1 : 0),
        0,
      );
      return {
        id: String(row.id),
        category: String(row.category || "General"),
        answerGuidance: stringField(row.answer_guidance) || "",
        source: stringField(row.source),
        score,
      };
    })
    .filter((entry) => entry.answerGuidance && entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_PLAYBOOK_ENTRIES);
}

async function loadThreadSummary(
  supabase: DynamicSupabaseClient,
  platform: SocialPlatform,
  threadId: string,
) {
  const result = await supabase
    .from("social_thread_summaries")
    .select("*")
    .eq("platform", platform)
    .eq("thread_id", threadId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return null;
  return {
    summary: stringField(result.data.summary),
    messageCount: numberField(result.data.message_count) || 0,
  };
}

function mapMessageContext(row: JsonRecord): MessageContext {
  const body = clipText(stringField(row.body) || "Attachment or unsupported message");
  return {
    id: String(row.id),
    messageId: String(row.message_id),
    direction:
      row.direction === "inbound" ? "client" : row.direction === "outbound" ? "team" : "unknown",
    sender: stringField(row.sender_name),
    body,
    sentAt: stringField(row.sent_at),
  };
}

function buildHeuristicSummary(messages: MessageContext[], includedCount: number) {
  const omitted = messages.slice(0, Math.max(messages.length - includedCount, 0));
  if (omitted.length < 8) return null;

  const first = omitted[0]?.sentAt || "unknown start";
  const last = omitted[omitted.length - 1]?.sentAt || "unknown end";
  const notable = omitted
    .filter((message) => message.body && message.body !== "Attachment or unsupported message")
    .slice(-4)
    .map((message) => `${message.direction}: ${clipText(message.body, 220)}`);

  return [
    `${omitted.length} older message(s) from ${first} to ${last} were summarized heuristically to control token usage.`,
    ...notable,
  ].join("\n");
}

function resolveBrand(
  inputBrand: BrandLabel | undefined,
  signals: { pageId: string | null; igUserId: string | null },
): BrandLabel {
  if (inputBrand === "HP" || inputBrand === "VVS") return inputBrand;
  const inferred = inferSocialBrand(signals.pageId, signals.igUserId);
  return inferred === "Unassigned" ? "HP" : inferred;
}

function resolveLanguage(input: ReplyLanguage, values: string[]): ResolvedLanguage {
  if (input === "en" || input === "vi") return input;
  const joined = values.filter(Boolean).join("\n");
  return looksVietnamese(joined) ? "vi" : "en";
}

function looksVietnamese(value: string) {
  return /[ăâđêôơưáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(value) ||
    /\b(dạ|anh|chị|em|cô|chú|bác|tiệm|mình|nhẫn|vàng|kim cương|giá|ghé|nha|ạ)\b/i.test(value);
}

function parseSuggestionResponse(content: string | null | undefined) {
  if (!content) throw new Error("OpenAI returned an empty suggestion.");
  let parsed: JsonRecord;
  try {
    parsed = JSON.parse(content) as JsonRecord;
  } catch {
    parsed = { draft: content };
  }

  const draft = stringField(parsed.draft)?.trim();
  if (!draft) throw new Error("OpenAI returned a blank draft.");

  return {
    draft,
    toneNotes: arrayField(parsed.toneNotes)
      .filter((note): note is string => typeof note === "string")
      .slice(0, 5),
  };
}

function dynamicSupabase() {
  return createAdsAnalystClient("web") as unknown as DynamicSupabaseClient;
}

function createOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ConfigurationError("Missing OPENAI_API_KEY", ["OPENAI_API_KEY"]);
  }
  return new OpenAI({ apiKey });
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

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function clipText(value: string, maxChars = MAX_MESSAGE_CHARS) {
  const normalized = value.replace(/\s+\n/g, "\n").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1).trim()}...`;
}
