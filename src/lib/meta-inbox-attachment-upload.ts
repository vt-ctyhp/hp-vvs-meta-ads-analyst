import {
  attachmentCapabilityForConversation,
  type MetaInboxAttachmentCapability,
  type MetaInboxAttachmentType,
} from "./meta-inbox-attachments.ts";

type JsonRecord = Record<string, unknown>;

export const META_INBOX_ATTACHMENT_BUCKET = "meta-inbox-attachments";
export const MAX_META_INBOX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export type MetaInboxAttachmentUploadConversation = {
  id: string;
  platform: "facebook" | "instagram";
  source_type: MetaInboxAttachmentCapability["sourceType"];
};

export type MetaInboxAttachmentUploadFile = {
  fileName: string;
  contentType?: string | null;
  sizeBytes: number;
};

export type MetaInboxAttachmentUploadPlan = {
  attachmentType: "image" | "video" | "audio" | "file";
  label: string;
  name: string;
  mimeType: string;
  safeFileName: string;
  sizeBytes: number;
  capability: MetaInboxAttachmentCapability;
};

export class MetaInboxAttachmentUploadError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "MetaInboxAttachmentUploadError";
    this.status = status;
  }
}

export function planMetaInboxAttachmentUpload(
  conversation: MetaInboxAttachmentUploadConversation,
  file: MetaInboxAttachmentUploadFile,
): MetaInboxAttachmentUploadPlan {
  const sizeBytes = Number(file.sizeBytes) || 0;
  if (sizeBytes <= 0) {
    throw new MetaInboxAttachmentUploadError("Attachment file is empty.");
  }
  if (sizeBytes > MAX_META_INBOX_ATTACHMENT_BYTES) {
    throw new MetaInboxAttachmentUploadError(
      `Attachment file is too large. Max size is ${MAX_META_INBOX_ATTACHMENT_BYTES} bytes.`,
      413,
    );
  }

  const mimeType = normalizedContentType(file.contentType, file.fileName);
  const attachmentType = sendableAttachmentType(mimeType, file.fileName);
  const capability = attachmentCapabilityForConversation(
    conversation.platform,
    conversation.source_type,
    attachmentType,
  );
  if (!capability.canSend) {
    throw new MetaInboxAttachmentUploadError(capability.reason);
  }

  const name = displayFileName(file.fileName);
  return {
    attachmentType,
    label: name || labelForAttachmentType(attachmentType),
    name: name || labelForAttachmentType(attachmentType),
    mimeType,
    safeFileName: safeAttachmentFileName(file.fileName, mimeType),
    sizeBytes,
    capability,
  };
}

export function storagePathForMetaInboxAttachment(
  environment: string,
  conversationId: string,
  objectId: string,
  fileName: string,
) {
  return [
    safePathSegment(environment || "production"),
    safePathSegment(conversationId),
    safePathSegment(objectId),
    safeAttachmentFileName(fileName, null),
  ].join("/");
}

export function buildMetaInboxAttachmentUploadRow(
  conversation: MetaInboxAttachmentUploadConversation,
  plan: MetaInboxAttachmentUploadPlan,
  context: {
    actorUserId: string;
    now: string;
    publicUrl: string;
    storagePath: string;
  },
): JsonRecord {
  return {
    conversation_id: conversation.id,
    message_id: null,
    send_attempt_id: null,
    direction: "draft",
    platform: conversation.platform,
    attachment_type: plan.attachmentType,
    meta_attachment_id: null,
    name: plan.name,
    mime_type: plan.mimeType,
    media_url: context.publicUrl,
    preview_url: plan.attachmentType === "image" ? context.publicUrl : null,
    size_bytes: plan.sizeBytes,
    is_sendable: true,
    send_capability: plan.capability,
    raw_json: {
      source: "operator_upload",
      storage_bucket: META_INBOX_ATTACHMENT_BUCKET,
      storage_path: context.storagePath,
      original_name: plan.name,
      mime_type: plan.mimeType,
      size_bytes: plan.sizeBytes,
    },
    created_by: context.actorUserId,
    created_at: context.now,
    updated_at: context.now,
  };
}

function sendableAttachmentType(
  contentType: string,
  fileName: string,
): "image" | "video" | "audio" | "file" {
  const lower = contentType.toLowerCase();
  if (lower.startsWith("image/")) return "image";
  if (lower.startsWith("video/")) return "video";
  if (lower.startsWith("audio/")) return "audio";

  const extension = fileExtension(fileName);
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (AUDIO_EXTENSIONS.has(extension)) return "audio";
  if (FILE_EXTENSIONS.has(extension) || lower) return "file";

  throw new MetaInboxAttachmentUploadError("Attachment file type is not supported.");
}

function normalizedContentType(contentType: string | null | undefined, fileName: string) {
  const lower = String(contentType || "").split(";")[0]?.trim().toLowerCase() || "";
  if (lower) return lower;

  const extension = fileExtension(fileName);
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "mp4") return "video/mp4";
  if (extension === "mov") return "video/quicktime";
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "wav") return "audio/wav";
  if (extension === "m4a") return "audio/mp4";
  if (extension === "pdf") return "application/pdf";
  if (extension === "txt") return "text/plain";
  return "application/octet-stream";
}

function safeAttachmentFileName(fileName: string, contentType: string | null) {
  const fallbackExtension = extensionFromContentType(contentType || "");
  const original = displayFileName(fileName) || `attachment.${fallbackExtension || "bin"}`;
  const extension = fileExtension(original) || fallbackExtension || "bin";
  const base = original.replace(/\.[^.]*$/, "");
  const safeBase =
    base
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "attachment";
  return `${safeBase}.${extension}`.toLowerCase();
}

function safePathSegment(value: string) {
  return (
    String(value || "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "unknown"
  );
}

function displayFileName(fileName: string) {
  const raw = String(fileName || "").split(/[\\/]/).pop()?.trim() || "";
  return raw || "attachment";
}

function fileExtension(fileName: string) {
  const match = displayFileName(fileName).toLowerCase().match(/\.([a-z0-9]{1,12})$/);
  return match?.[1] || "";
}

function extensionFromContentType(contentType: string) {
  const lower = contentType.toLowerCase();
  if (lower.includes("jpeg")) return "jpg";
  if (lower.includes("png")) return "png";
  if (lower.includes("webp")) return "webp";
  if (lower.includes("gif")) return "gif";
  if (lower.includes("quicktime")) return "mov";
  if (lower.includes("mp4")) return "mp4";
  if (lower.includes("mpeg")) return "mp3";
  if (lower.includes("wav")) return "wav";
  if (lower.includes("pdf")) return "pdf";
  if (lower.includes("plain")) return "txt";
  return "";
}

function labelForAttachmentType(type: MetaInboxAttachmentType) {
  if (type === "image") return "Image attachment";
  if (type === "video") return "Video attachment";
  if (type === "audio") return "Audio attachment";
  if (type === "file") return "File attachment";
  return "Attachment";
}

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v", "webm"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "aac", "ogg"]);
const FILE_EXTENSIONS = new Set([
  "pdf",
  "txt",
  "csv",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "zip",
]);
