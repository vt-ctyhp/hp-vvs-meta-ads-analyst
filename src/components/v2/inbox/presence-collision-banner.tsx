import { UserRound } from "lucide-react";

import type { SocialInboxPresence } from "../../../lib/social-inbox.ts";

export function PresenceCollisionBanner({ presences }: { presences: SocialInboxPresence[] }) {
  if (!presences.length) return null;

  const activeReplyPresence =
    presences.find((presence) => presence.activity === "replying") ||
    presences.find((presence) => presence.activity === "typing") ||
    null;
  const primary = activeReplyPresence || presences[0];
  const isReplyConflict = primary.activity === "replying" || primary.activity === "typing";
  const name = primary.display_name || "Another teammate";
  const action =
    primary.activity === "replying"
      ? "is replying now"
      : primary.activity === "typing"
        ? "is typing"
        : "is viewing this conversation";

  return (
    <div
      className={[
        "mb-4 border p-3 text-sm leading-6",
        isReplyConflict
          ? "border-signal-warning bg-hp-inset text-hp-ink"
          : "border-hp-rule bg-hp-inset text-hp-muted",
      ].join(" ")}
    >
      <div className="flex min-w-0 items-start gap-3">
        <UserRound
          size={16}
          className={
            isReplyConflict
              ? "mt-1 shrink-0 text-signal-warning"
              : "mt-1 shrink-0 text-hp-muted"
          }
        />
        <div className="min-w-0">
          <p className="font-medium text-hp-ink">
            {name} {action}.
          </p>
          <p className="text-xs leading-5 text-hp-muted">
            Advisory collision warning only. Assignment and manager override still control
            ownership.
            {presences.length > 1 ? ` ${presences.length} teammates active.` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
