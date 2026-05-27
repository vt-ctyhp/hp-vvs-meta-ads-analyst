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

export type MetaInboxSendAttachmentConversation = {
  id: string;
  platform: "facebook" | "instagram";
  source_type: MetaInboxAttachmentCapability["sourceType"];
};

export type MetaInboxSendAttachmentRow = {
  id: string;
  conversation_id: string | null;
  attachment_type: MetaInboxAttachmentType;
  meta_attachment_id: string | null;
  media_url: string | null;
  is_sendable: boolean;
  deleted_at?: string | null;
};

export type MetaInboxValidatedSendAttachment = Omit<
  MetaInboxSendAttachmentRow,
  "attachment_type" | "is_sendable"
> & {
  attachment_type: "image" | "video" | "audio" | "file";
  is_sendable: true;
};

const SENDABLE_MESSAGE_ATTACHMENT_TYPES = new Set<MetaInboxAttachmentType>([
  "image",
  "video",
  "audio",
  "file",
]);

export function normalizeMetaInboxAttachments(value: unknown): MetaInboxNormalizedAttachment[] {
  return attachmentArrayField(value).map(normalizeMetaInboxAttachment);
}

export function normalizeMetaInboxAttachment(value: unknown): MetaInboxNormalizedAttachment {
  const raw = recordField(value);
  const nestedRaw = recordField(raw.raw);
  const payload = firstRecordField(raw.payload, nestedRaw.payload);
  const imageData = firstRecordField(
    raw.image_data,
    raw.imageData,
    nestedRaw.image_data,
    nestedRaw.imageData,
  );
  const videoData = firstRecordField(
    raw.video_data,
    raw.videoData,
    nestedRaw.video_data,
    nestedRaw.videoData,
  );
  const audioData = firstRecordField(
    raw.audio_data,
    raw.audioData,
    nestedRaw.audio_data,
    nestedRaw.audioData,
  );
  const fileData = firstRecordField(
    raw.file_data,
    raw.fileData,
    nestedRaw.file_data,
    nestedRaw.fileData,
  );

  const mimeType = firstStringField(
    raw.mime_type,
    raw.mimeType,
    nestedRaw.mime_type,
    nestedRaw.mimeType,
    payload.mime_type,
    payload.mimeType,
  );
  const explicitType = firstStringField(
    raw.type,
    raw.attachment_type,
    raw.attachmentType,
    raw.media_type,
    raw.mediaType,
    nestedRaw.type,
    nestedRaw.attachment_type,
    nestedRaw.attachmentType,
    nestedRaw.media_type,
    nestedRaw.mediaType,
    payload.type,
    payload.attachment_type,
    payload.attachmentType,
  );
  const attachmentType = attachmentTypeFrom({
    explicitType,
    mimeType,
    imageData,
    videoData,
    audioData,
    fileData,
    payload,
    raw,
    nestedRaw,
  });
  const name = firstStringField(
    raw.name,
    raw.label,
    raw.filename,
    raw.file_name,
    raw.title,
    nestedRaw.name,
    nestedRaw.label,
    nestedRaw.filename,
    nestedRaw.file_name,
    nestedRaw.title,
    payload.name,
    payload.label,
    payload.filename,
    payload.file_name,
  );
  const mediaUrl = firstStringField(
    raw.mediaUrl,
    raw.media_url,
    raw.url,
    raw.file_url,
    nestedRaw.mediaUrl,
    nestedRaw.media_url,
    nestedRaw.url,
    nestedRaw.file_url,
    payload.url,
    payload.media_url,
    imageData.url,
    videoData.url,
    audioData.url,
    fileData.url,
  );
  const previewUrl = firstStringField(
    raw.previewUrl,
    raw.preview_url,
    raw.thumbnailUrl,
    raw.thumbnail_url,
    nestedRaw.previewUrl,
    nestedRaw.preview_url,
    nestedRaw.thumbnailUrl,
    nestedRaw.thumbnail_url,
    payload.preview_url,
    payload.previewUrl,
    payload.thumbnail_url,
    payload.thumbnailUrl,
    payload.sticker_url,
    payload.stickerUrl,
    imageData.preview_url,
    imageData.previewUrl,
    videoData.preview_url,
    videoData.previewUrl,
    fileData.preview_url,
    fileData.previewUrl,
  );

  return {
    attachmentType,
    label: name || labelForAttachmentType(attachmentType),
    metaAttachmentId:
      firstStringField(
        raw.metaAttachmentId,
        raw.meta_attachment_id,
        raw.id,
        raw.attachment_id,
        raw.attachmentId,
        nestedRaw.metaAttachmentId,
        nestedRaw.meta_attachment_id,
        nestedRaw.id,
        nestedRaw.attachment_id,
        nestedRaw.attachmentId,
        payload.attachment_id,
        payload.attachmentId,
      ),
    name,
    mimeType,
    mediaUrl,
    previewUrl,
    sizeBytes:
      firstNumberField(
        raw.sizeBytes,
        raw.size_bytes,
        raw.size,
        raw.file_size,
        nestedRaw.sizeBytes,
        nestedRaw.size_bytes,
        nestedRaw.size,
        nestedRaw.file_size,
        payload.sizeBytes,
        payload.size_bytes,
        payload.size,
        payload.file_size,
      ),
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

export function validateMetaInboxSendAttachments(
  conversation: MetaInboxSendAttachmentConversation,
  requestedAttachmentIds: unknown,
  rows: MetaInboxSendAttachmentRow[],
): MetaInboxValidatedSendAttachment[] {
  const requestedIds = normalizeAttachmentIds(requestedAttachmentIds);
  if (!requestedIds.length) return [];

  const rowsById = new Map(rows.map((row) => [row.id, row]));
  for (const attachmentId of requestedIds) {
    if (!rowsById.has(attachmentId)) {
      throw new Error(`Attachment ${attachmentId} was not found for this conversation.`);
    }
  }
  if (rows.length !== requestedIds.length) {
    throw new Error("Requested attachment count does not match validated attachment count.");
  }

  const validated: MetaInboxValidatedSendAttachment[] = [];
  for (const attachmentId of requestedIds) {
    const row = rowsById.get(attachmentId)!;
    if (row.conversation_id !== conversation.id) {
      throw new Error(`Attachment ${attachmentId} is not attached to this conversation.`);
    }
    if (row.deleted_at) {
      throw new Error(`Attachment ${attachmentId} was deleted and cannot be sent.`);
    }
    if (!row.is_sendable) {
      throw new Error(`Attachment ${attachmentId} is not sendable.`);
    }

    const capability = attachmentCapabilityForConversation(
      conversation.platform,
      conversation.source_type,
      row.attachment_type,
    );
    if (!capability.canSend) {
      throw new Error(`Attachment ${attachmentId} type is not supported for this conversation.`);
    }
    if (!isDeliveryAttachmentType(row.attachment_type)) {
      throw new Error(`Attachment ${attachmentId} type is not supported for delivery.`);
    }
    if (!row.meta_attachment_id && !row.media_url) {
      throw new Error(`Attachment ${attachmentId} is missing Meta attachment id or media URL.`);
    }

    validated.push({
      ...row,
      attachment_type: row.attachment_type,
      is_sendable: true,
    });
  }

  if (validated.length !== requestedIds.length) {
    throw new Error("Requested attachment count does not match validated attachment count.");
  }

  return validated;
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
  nestedRaw: JsonRecord;
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
  if (
    hasAnyValue(input.fileData) ||
    stringField(input.raw.file_url) ||
    stringField(input.nestedRaw.file_url)
  ) {
    return "file";
  }
  if (stringField(input.payload.sticker_id) || stringField(input.payload.sticker_url)) return "sticker";
  if (
    stringField(input.payload.url) ||
    stringField(input.raw.url) ||
    stringField(input.nestedRaw.url)
  ) {
    return "share";
  }
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

function isDeliveryAttachmentType(
  value: MetaInboxAttachmentType,
): value is MetaInboxValidatedSendAttachment["attachment_type"] {
  return value === "image" || value === "video" || value === "audio" || value === "file";
}

function hasAnyValue(record: JsonRecord) {
  return Object.keys(record).length > 0;
}

function arrayField(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return [];
}

function attachmentArrayField(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = recordField(value);
  return arrayField(record.data);
}

function recordField(value: unknown): JsonRecord {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  return {};
}

function firstRecordField(...values: unknown[]) {
  for (const value of values) {
    const record = recordField(value);
    if (hasAnyValue(record)) return record;
  }
  return {};
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstStringField(...values: unknown[]) {
  for (const value of values) {
    const text = stringField(value);
    if (text) return text;
  }
  return null;
}

function numberField(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function firstNumberField(...values: unknown[]) {
  for (const value of values) {
    const number = numberField(value);
    if (number !== null) return number;
  }
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
