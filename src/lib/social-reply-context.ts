import type {
  SocialInboxComment,
  SocialInboxConversation,
  SocialInboxConversationHistory,
  SocialInboxMessage,
} from "./social-inbox.ts";
import type { BrandLabel } from "./social-brand.ts";

export type SocialReplyRequestedLanguage = "auto" | "en" | "vi";
export type SocialReplyResolvedLanguage = "en" | "vi" | "mixed";

export type SocialReplyPromptProfile = {
  id: string | null;
  brand: BrandLabel;
  name: string;
  version: number | null;
  businessContext: string;
  salesGuidance: string;
  toneGuidance: string;
  disallowedClaims: string[];
};

export type SocialReplyExample = {
  id: string;
  title: string;
  conversation: string;
  idealResponse: string;
  critique: string | null;
};

export type SocialReplyContextInput = {
  history: SocialInboxConversationHistory;
  brand: BrandLabel;
  customerName?: string | null;
  requestedLanguage?: SocialReplyRequestedLanguage;
  staffGuidance?: string | null;
  promptProfile?: SocialReplyPromptProfile | null;
  examples?: SocialReplyExample[];
  maxTranscriptChars?: number;
};

export type SocialReplyTranscriptItem = {
  kind: "message" | "comment";
  id: string;
  sourceId: string;
  timestamp: string;
  speaker: "customer" | "team" | "unknown";
  label: string;
  body: string;
};

export type SocialReplyContext = {
  systemPrompt: string;
  userPrompt: string;
  transcript: SocialReplyTranscriptItem[];
  transcriptText: string;
  transcriptTruncated: boolean;
  omittedTranscriptItems: number;
  resolvedLanguage: SocialReplyResolvedLanguage;
  contextUsed: {
    brand: BrandLabel;
    conversationId: string;
    sourceType: SocialInboxConversation["source_type"];
    platform: SocialInboxConversation["platform"];
    messageCount: number;
    commentCount: number;
    transcriptItems: number;
    omittedTranscriptItems: number;
    promptProfileId: string | null;
    promptProfileVersion: number | null;
    exampleCount: number;
    customerName: string | null;
    transcriptTruncated: boolean;
  };
};

const DEFAULT_MAX_TRANSCRIPT_CHARS = 60000;

const FALLBACK_PROFILE: Record<"HP" | "VVS" | "Unassigned", SocialReplyPromptProfile> = {
  HP: {
    id: null,
    brand: "HP",
    name: "Hung Phat default sales voice",
    version: null,
    businessContext:
      "Hung Phat is a jewelry showroom. Customer messages usually need a practical next step: answer directly when safe, invite them into the store for assessment or appointment, or ask one precise follow-up question.",
    salesGuidance:
      "Prefer moving the customer toward an in-store visit or appointment when value, fit, trade-in, or cash-for-gold assessment depends on seeing the item. Never invent prices, availability, policy, appointment times, appraisal amounts, or guarantees.",
    toneGuidance:
      "Sound like a senior sales associate: warm, concise, confident, specific, and human. Match the customer's language and energy. No markdown. No pressure tactics. No corporate filler.",
    disallowedClaims: [
      "guaranteed payout",
      "confirmed appointment time",
      "exact item value without assessment",
      "available inventory not shown in context",
    ],
  },
  VVS: {
    id: null,
    brand: "VVS",
    name: "VVS default sales voice",
    version: null,
    businessContext:
      "VVS handles jewelry customer conversations. The reply should help the customer choose the next useful step, usually a showroom visit, appointment, or one clarifying question.",
    salesGuidance:
      "Answer from known context only. If item value, availability, or fit requires inspection, guide the customer toward an in-person assessment.",
    toneGuidance:
      "Warm, concise, confident, and natural. No markdown. No pressure tactics. No corporate filler.",
    disallowedClaims: ["guaranteed value", "confirmed appointment time", "unverified inventory"],
  },
  Unassigned: {
    id: null,
    brand: "Unassigned",
    name: "Default sales voice",
    version: null,
    businessContext:
      "Customer is messaging a jewelry business. The reply should be practical, human, and lead toward the next useful sales step.",
    salesGuidance:
      "Do not invent facts. If the business needs to see the item or understand the goal, invite the customer in or ask one precise question.",
    toneGuidance: "Warm, concise, confident, and natural. No markdown.",
    disallowedClaims: ["guaranteed value", "unverified availability", "confirmed appointment time"],
  },
};

export function buildSocialReplyContext(input: SocialReplyContextInput): SocialReplyContext {
  const profile = input.promptProfile || FALLBACK_PROFILE[input.brand];
  const transcript = buildSocialReplyTranscript(input.history);
  const transcriptWindow = transcriptWithinLimit(
    transcript,
    input.maxTranscriptChars || DEFAULT_MAX_TRANSCRIPT_CHARS,
  );
  const requestedLanguage = input.requestedLanguage || "auto";
  const resolvedLanguage =
    requestedLanguage === "auto"
      ? inferReplyLanguage(transcriptWindow.items.map((item) => item.body).join("\n"))
      : requestedLanguage;
  const transcriptText = transcriptWindow.items.map(formatTranscriptItem).join("\n");
  const examples = input.examples || [];

  const systemPrompt = [
    "You draft human-approved customer replies for a jewelry sales inbox.",
    "Use the full known conversation transcript exactly as source context. Do not reduce it into fixed buckets.",
    "Think strategically like a senior sales associate, then return only the structured JSON output requested.",
    "The draft is never auto-sent. A human edits and approves it.",
    "Never invent prices, item availability, appraisal value, payout amount, policies, appointment times, or facts not present in context.",
    "If the customer goal requires inspection or cash-for-gold assessment, guide them toward coming into the store instead of pretending to quote remotely.",
    "If context is missing, ask one concise question or hand off to a human.",
  ].join("\n");

  const userPayload = {
    task: "Draft one strategic reply for the selected inbox conversation.",
    outputLanguage: resolvedLanguage,
    requestedLanguage,
    brand: input.brand,
    customerName: input.customerName || null,
    conversation: {
      id: input.history.conversation.id,
      platform: input.history.conversation.platform,
      sourceType: input.history.conversation.source_type,
      sourceChannel: input.history.conversation.source_channel,
      queueCategory: input.history.conversation.queue_category_key,
      leadQuality: input.history.conversation.lead_quality,
      needsReply: input.history.conversation.needs_reply,
      replyWindowExpiresAt: input.history.conversation.reply_window_expires_at,
    },
    promptProfile: {
      id: profile.id,
      name: profile.name,
      version: profile.version,
      businessContext: profile.businessContext,
      salesGuidance: profile.salesGuidance,
      toneGuidance: profile.toneGuidance,
      disallowedClaims: profile.disallowedClaims,
    },
    staffGuidance: cleanText(input.staffGuidance),
    transcript: {
      truncated: transcriptWindow.truncated,
      omittedOldestItems: transcriptWindow.omittedItems,
      text: transcriptText,
    },
    calibrationExamples: examples.slice(0, 5).map((example) => ({
      title: example.title,
      conversation: example.conversation,
      idealResponse: example.idealResponse,
      critique: example.critique,
    })),
    responseRules: [
      "Return one customer-facing draft only inside the draft field.",
      "Keep the draft concise enough for Facebook or Instagram messaging.",
      "Match customer language if clear. If mixed, prefer the latest customer language.",
      "No markdown, no bullet list unless customer asked for a list, no emojis unless customer used one first.",
      "The strategy field is internal and should explain why this reply moves the sale forward.",
      "Risk flags should name missing or unsafe assumptions, not generic warnings.",
    ],
  };

  return {
    systemPrompt,
    userPrompt: JSON.stringify(userPayload, null, 2),
    transcript: transcriptWindow.items,
    transcriptText,
    transcriptTruncated: transcriptWindow.truncated,
    omittedTranscriptItems: transcriptWindow.omittedItems,
    resolvedLanguage,
    contextUsed: {
      brand: input.brand,
      conversationId: input.history.conversation.id,
      sourceType: input.history.conversation.source_type,
      platform: input.history.conversation.platform,
      messageCount: input.history.messages.length,
      commentCount: input.history.comments.length,
      transcriptItems: transcriptWindow.items.length,
      omittedTranscriptItems: transcriptWindow.omittedItems,
      promptProfileId: profile.id,
      promptProfileVersion: profile.version,
      exampleCount: examples.length,
      customerName: input.customerName || null,
      transcriptTruncated: transcriptWindow.truncated,
    },
  };
}

export function buildSocialReplyTranscript(
  history: Pick<SocialInboxConversationHistory, "messages" | "comments">,
): SocialReplyTranscriptItem[] {
  return [
    ...history.messages.map(messageTranscriptItem),
    ...history.comments.map(commentTranscriptItem),
  ].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
}

function transcriptWithinLimit(items: SocialReplyTranscriptItem[], maxChars: number) {
  let used = 0;
  const kept: SocialReplyTranscriptItem[] = [];
  for (const item of [...items].reverse()) {
    const size = formatTranscriptItem(item).length + 1;
    if (kept.length && used + size > maxChars) break;
    if (!kept.length && size > maxChars) {
      kept.push({ ...item, body: `${item.body.slice(0, Math.max(maxChars - 80, 200)).trim()}...` });
      used = maxChars;
      break;
    }
    kept.push(item);
    used += size;
  }

  return {
    items: kept.reverse(),
    truncated: kept.length < items.length,
    omittedItems: Math.max(items.length - kept.length, 0),
  };
}

function messageTranscriptItem(message: SocialInboxMessage): SocialReplyTranscriptItem {
  const speaker =
    message.direction === "inbound"
      ? "customer"
      : message.direction === "outbound"
        ? "team"
        : "unknown";
  const attachmentNote = message.attachments.length
    ? ` [${message.attachments.length} attachment${message.attachments.length === 1 ? "" : "s"}]`
    : "";
  return {
    kind: "message",
    id: message.id,
    sourceId: message.message_id,
    timestamp: message.sent_at || "",
    speaker,
    label: speakerLabel(speaker, message.sender_name),
    body: cleanText(message.body) || attachmentNote.trim() || "[attachment or unsupported message]",
  };
}

function commentTranscriptItem(comment: SocialInboxComment): SocialReplyTranscriptItem {
  return {
    kind: "comment",
    id: comment.id,
    sourceId: comment.comment_id,
    timestamp: comment.created_time || "",
    speaker: "customer",
    label: speakerLabel("customer", comment.author_name),
    body: cleanText(comment.body) || "[empty public comment]",
  };
}

function formatTranscriptItem(item: SocialReplyTranscriptItem) {
  const timestamp = item.timestamp || "unknown time";
  return `[${timestamp}] ${item.label}: ${item.body}`;
}

function speakerLabel(speaker: SocialReplyTranscriptItem["speaker"], name: string | null) {
  const base = speaker === "customer" ? "Customer" : speaker === "team" ? "Team" : "Unknown";
  return name ? `${base} (${name})` : base;
}

function cleanText(value: string | null | undefined) {
  const text = String(value || "").replace(/\s+\n/g, "\n").trim();
  return text || null;
}

function inferReplyLanguage(value: string): SocialReplyResolvedLanguage {
  const hasVietnamese =
    /[ăâđêôơưáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(value) ||
    /\b(dạ|anh|chị|em|cô|chú|bác|tiệm|mình|nhẫn|vàng|kim cương|giá|ghé|nha)\b/i.test(value);
  const hasAsciiWords = /\b(the|you|hi|hello|price|appointment|sell|buy|gold|diamond|ring)\b/i.test(value);
  if (hasVietnamese && hasAsciiWords) return "mixed";
  return hasVietnamese ? "vi" : "en";
}
