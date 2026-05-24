type JsonRecord = Record<string, unknown>;

export type MetaInboxAttachmentType =
  | "image"
  | "video"
  | "audio"
  | "file"
  | "sticker"
  | "product"
  | "share"
  | "unknown";

export type MetaInboxAttachmentDirection = "inbound" | "outbound" | "draft";

export type MetaInboxNormalizedAttachment = {
  attachmentType: MetaInboxAttachmentType;
  label: string;
  metaAttachmentId: string | null;
  name: string | null;
  mimeType: string | null;
  mediaUrl: string | null;
  previewUrl: string | null;
  sizeBytes: number | null;
  raw: JsonRecord;
};

export type MetaInboxAttachmentCapability = {
  platform: "facebook" | "instagram";
  sourceType: "message_thread" | "public_comment" | "private_reply" | "ad_referral" | "other";
  attachmentType: MetaInboxAttachmentType;
  canReceive: boolean;
  canSend: boolean;
  reason: string;
};

const SENDABLE_MESSAGE_ATTACHMENT_TYPES = new Set<MetaInboxAttachmentType>([
  "image",
  "video",
  "audio",
  "file",
]);

export function normalizeMetaInboxAttachments(value: unknown): MetaInboxNormalizedAttachment[] {
  return arrayField(value).map(normalizeMetaInboxAttachment);
}

export function normalizeMetaInboxAttachment(value: unknown): MetaInboxNormalizedAttachment {
  const raw = recordField(value);
  const payload = recordField(raw.payload);
  const imageData = recordField(raw.image_data || raw.imageData);
  const videoData = recordField(raw.video_data || raw.videoData);
  const audioData = recordField(raw.audio_data || raw.audioData);
  const fileData = recordField(raw.file_data || raw.fileData);

  const mimeType = stringField(raw.mime_type) || stringField(raw.mimeType);
  const explicitType =
    stringField(raw.type) ||
    stringField(raw.media_type) ||
    stringField(raw.mediaType) ||
    stringField(payload.type);
  const attachmentType = attachmentTypeFrom({
    explicitType,
    mimeType,
    imageData,
    videoData,
    audioData,
    fileData,
    payload,
    raw,
  });
  const name =
    stringField(raw.name) ||
    stringField(raw.filename) ||
    stringField(raw.file_name) ||
    stringField(raw.title) ||
    stringField(payload.name) ||
    null;
  const mediaUrl =
    stringField(payload.url) ||
    stringField(payload.media_url) ||
    stringField(raw.url) ||
    stringField(raw.file_url) ||
    stringField(raw.media_url) ||
    stringField(imageData.url) ||
    stringField(videoData.url) ||
    stringField(audioData.url) ||
    stringField(fileData.url);
  const previewUrl =
    stringField(payload.preview_url) ||
    stringField(payload.sticker_url) ||
    stringField(raw.preview_url) ||
    stringField(raw.thumbnail_url) ||
    stringField(imageData.preview_url) ||
    stringField(videoData.preview_url) ||
    stringField(fileData.preview_url) ||
    null;

  return {
    attachmentType,
    label: name || labelForAttachmentType(attachmentType),
    metaAttachmentId:
      stringField(raw.id) ||
      stringField(raw.attachment_id) ||
      stringField(raw.attachmentId) ||
      stringField(payload.attachment_id) ||
      null,
    name,
    mimeType,
    mediaUrl: mediaUrl || null,
    previewUrl,
    sizeBytes:
      numberField(raw.size) ||
      numberField(raw.file_size) ||
      numberField(raw.size_bytes) ||
      numberField(payload.size) ||
      null,
    raw,
  };
}

export function attachmentCapabilityForConversation(
  platform: "facebook" | "instagram",
  sourceType: MetaInboxAttachmentCapability["sourceType"],
  attachmentType: MetaInboxAttachmentType,
): MetaInboxAttachmentCapability {
  if (sourceType === "public_comment" || sourceType === "private_reply") {
    return {
      platform,
      sourceType,
      attachmentType,
      canReceive: true,
      canSend: false,
      reason: "Comment attachment sending requires a source-specific Meta capability check.",
    };
  }

  if (SENDABLE_MESSAGE_ATTACHMENT_TYPES.has(attachmentType)) {
    return {
      platform,
      sourceType,
      attachmentType,
      canReceive: true,
      canSend: true,
      reason: "Message attachment can be queued when the account capability check allows it.",
    };
  }

  return {
    platform,
    sourceType,
    attachmentType,
    canReceive: true,
    canSend: false,
    reason: "Attachment type is display-only until a platform send capability is confirmed.",
  };
}

export function normalizeAttachmentIds(value: unknown): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of arrayField(value)) {
    const id = String(item || "").trim();
    if (!id) continue;
    if (!UUID_RE.test(id)) {
      throw new Error("Attachment id must be a valid UUID.");
    }
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function attachmentTypeFrom(input: {
  explicitType: string | null;
  mimeType: string | null;
  imageData: JsonRecord;
  videoData: JsonRecord;
  audioData: JsonRecord;
  fileData: JsonRecord;
  payload: JsonRecord;
  raw: JsonRecord;
}): MetaInboxAttachmentType {
  const type = (input.explicitType || "").toLowerCase();
  if (type.includes("image")) return "image";
  if (type.includes("video")) return "video";
  if (type.includes("audio")) return "audio";
  if (type.includes("sticker")) return "sticker";
  if (type.includes("product")) return "product";
  if (type.includes("share") || type.includes("fallback")) return "share";
  if (type.includes("file")) return "file";

  const mime = (input.mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime) return "file";

  if (hasAnyValue(input.imageData)) return "image";
  if (hasAnyValue(input.videoData)) return "video";
  if (hasAnyValue(input.audioData)) return "audio";
  if (hasAnyValue(input.fileData) || stringField(input.raw.file_url)) return "file";
  if (stringField(input.payload.sticker_id) || stringField(input.payload.sticker_url)) return "sticker";
  if (stringField(input.payload.url) || stringField(input.raw.url)) return "share";
  return "unknown";
}

function labelForAttachmentType(type: MetaInboxAttachmentType) {
  if (type === "image") return "Image attachment";
  if (type === "video") return "Video attachment";
  if (type === "audio") return "Audio attachment";
  if (type === "file") return "File attachment";
  if (type === "sticker") return "Sticker";
  if (type === "product") return "Product attachment";
  if (type === "share") return "Shared link";
  return "Unsupported attachment";
}

function hasAnyValue(record: JsonRecord) {
  return Object.keys(record).length > 0;
}

function arrayField(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return [];
}

function recordField(value: unknown): JsonRecord {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  return {};
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberField(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
