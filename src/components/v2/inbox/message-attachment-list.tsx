import { AlertTriangle, Camera, Link2, Paperclip } from "lucide-react";

import type { SocialInboxMessage } from "../../../lib/social-inbox.ts";

export function MessageAttachmentList({
  attachments,
  tone,
}: {
  attachments: SocialInboxMessage["attachments"];
  tone: "light" | "dark";
}) {
  const muted = tone === "dark" ? "text-hp-foundation/75" : "text-hp-muted";
  const border = tone === "dark" ? "border-hp-foundation/30" : "border-hp-rule";
  const background = tone === "dark" ? "bg-hp-foundation/10" : "bg-hp-card";

  return (
    <div className="mt-3 grid gap-2">
      {attachments.map((attachment, index) => {
        const icon = attachmentIcon(attachment.attachmentType);
        const href = attachment.mediaUrl || attachment.previewUrl;
        return (
          <div
            key={`${attachment.metaAttachmentId || attachment.label}-${index}`}
            className={`flex min-w-0 items-center justify-between gap-3 border ${border} ${background} p-3`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="shrink-0">{icon}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium leading-5">{attachment.label}</p>
                <p className={`truncate text-xs leading-5 ${muted}`}>
                  {attachment.mimeType || attachment.attachmentType}
                  {attachment.sizeBytes ? ` · ${formatBytes(attachment.sizeBytes)}` : ""}
                </p>
              </div>
            </div>
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className={`shrink-0 text-xs font-medium ${muted} hover:underline`}
              >
                Open
              </a>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function attachmentIcon(type: SocialInboxMessage["attachments"][number]["attachmentType"]) {
  if (type === "image" || type === "video") return <Camera size={15} />;
  if (type === "share" || type === "product") return <Link2 size={15} />;
  if (type === "unknown") return <AlertTriangle size={15} />;
  return <Paperclip size={15} />;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
