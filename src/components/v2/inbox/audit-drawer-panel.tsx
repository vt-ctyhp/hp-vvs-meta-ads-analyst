import { ShieldCheck } from "lucide-react";

import type { MetaInboxQueueDisplayItem } from "../../../lib/meta-inbox-queue-view.ts";
import {
  META_INBOX_CONVERSATION_STATUSES,
  META_INBOX_OUTCOMES,
  META_INBOX_QUEUE_CATEGORIES,
  metaInboxVocabularyLabel,
  type MetaInboxQueueCategoryKey,
} from "../../../lib/meta-inbox-vocabulary.ts";
import type {
  SocialInboxConversation,
  SocialInboxConversationEvent,
} from "../../../lib/social-inbox.ts";
import {
  DrawerSection,
  formatDateLabel,
  shortIdentifier,
  titleCase,
} from "./drawer-panel-helpers.tsx";

export function AuditDrawerPanel({ item }: { item: MetaInboxQueueDisplayItem | null }) {
  const events = (item?.conversationEvents || [])
    .slice()
    .sort((a, b) => String(b.event_at || "").localeCompare(String(a.event_at || "")))
    .slice(0, 6);

  return (
    <div data-component="audit-drawer-panel">
      <DrawerSection
        title="Audit Trail"
        icon={<ShieldCheck size={17} />}
        action={
          <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            {events.length ? `${events.length} recent` : "None"}
          </span>
        }
      >
        {events.length ? (
          <div className="space-y-3 border-l border-hp-rule pl-4">
            {events.map((event) => (
              <article key={event.id} className="relative border border-hp-rule bg-hp-inset p-3">
                <span className="absolute -left-[21px] top-4 h-2 w-2 rounded-full border border-hp-rule bg-hp-card" />
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-hp-ink">{auditEventLabel(event)}</p>
                    <p className="mt-1 break-words text-xs leading-5 text-hp-muted">
                      {auditEventSummary(event)}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                    {formatDateLabel(event.event_at)}
                  </span>
                </div>
                <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                  {event.actor_user_id ? `Actor ${shortIdentifier(event.actor_user_id)}` : "System"}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-6 text-hp-muted">
            No audit events yet for this conversation.
          </p>
        )}
        <p className="mt-4 border-t border-hp-rule pt-3 text-xs leading-5 text-hp-muted">
          Raw Meta payload stays hidden by design.
        </p>
      </DrawerSection>
    </div>
  );
}

function auditEventLabel(event: SocialInboxConversationEvent) {
  const labels: Record<string, string> = {
    conversation_created: "Conversation Created",
    assignment_changed: "Assignment Changed",
    status_changed: "Status Changed",
    lead_quality_changed: "Lead Quality Changed",
    inbox_outcome_changed: "Inbox Outcome Changed",
    routing_changed: "Routing Changed",
    follow_up_changed: "Follow-Up Changed",
    contact_method_changed: "Contact Method Changed",
    comment_action: "Comment Action",
    send_attempt: "Send Attempt",
    note_added: "Internal Note",
    qa_scorecard_added: "QA Scorecard",
  };
  return labels[event.event_type] || titleCase(event.event_type);
}

function auditEventSummary(event: SocialInboxConversationEvent) {
  const next = event.new_value || {};
  const metadata = event.metadata || {};
  const reason = auditString(metadata.changeReason) || auditString(metadata.reasonNote);

  if (event.event_type === "routing_changed") {
    return joinAuditParts([`Queue ${auditQueueLabel(next.queueCategoryKey)}`, reason]);
  }
  if (event.event_type === "status_changed") {
    return joinAuditParts([`Status ${auditStatusLabel(next.conversationStatus)}`, reason]);
  }
  if (event.event_type === "assignment_changed") {
    return joinAuditParts([
      auditString(next.assignedUserId)
        ? `Assigned to ${shortIdentifier(auditString(next.assignedUserId)!)}`
        : "Returned to team queue",
      reason,
    ]);
  }
  if (event.event_type === "lead_quality_changed") {
    return joinAuditParts([
      `Quality ${auditValue(next.leadQuality)}`,
      auditArray(next.reasonTags || next.leadQualityReasonTags),
      reason,
    ]);
  }
  if (event.event_type === "inbox_outcome_changed") {
    return joinAuditParts([
      `Outcome ${auditOutcomeLabel(next.inboxOutcome)}`,
      auditValue(next.inboxLostReason),
      reason,
    ]);
  }
  if (event.event_type === "follow_up_changed") {
    return joinAuditParts([`Follow-up ${auditValue(next.followUpAt)}`, reason]);
  }
  if (event.event_type === "contact_method_changed") {
    return joinAuditParts([
      titleCase(auditString(next.action) || "contact updated"),
      auditValue(next.type || next.contactMethodType),
      reason,
    ]);
  }
  if (event.event_type === "send_attempt") {
    return joinAuditParts([
      titleCase(auditString(next.status) || "send attempt recorded"),
      auditValue(next.messagingType || next.messaging_type),
      reason,
    ]);
  }
  if (event.event_type === "note_added") {
    const mentionCount = auditNumber(next.mentionCount) || 0;
    return joinAuditParts([
      auditString(next.noteType) === "manager_coaching" ? "Manager Coaching" : "Internal Note",
      mentionCount ? `${mentionCount} mention${mentionCount === 1 ? "" : "s"}` : null,
      reason,
    ]);
  }
  if (event.event_type === "qa_scorecard_added") {
    return joinAuditParts([
      `QA ${auditValue(next.overallScore) || "Recorded"}`,
      auditString(next.reviewedUserId)
        ? `For ${shortIdentifier(auditString(next.reviewedUserId)!)}`
        : null,
      reason,
    ]);
  }
  if (event.event_type === "comment_action") {
    return joinAuditParts([
      titleCase(auditString(next.actionType) || "comment action"),
      titleCase(auditString(next.status) || ""),
      reason,
    ]);
  }
  return joinAuditParts([
    auditValue(next.conversationStatus || next.queueCategoryKey || next.status),
    reason,
  ]);
}

function auditQueueLabel(value: unknown) {
  return metaInboxVocabularyLabel(
    META_INBOX_QUEUE_CATEGORIES,
    auditString(value) as MetaInboxQueueCategoryKey,
    auditValue(value) || "Unknown",
  );
}

function auditStatusLabel(value: unknown) {
  return metaInboxVocabularyLabel(
    META_INBOX_CONVERSATION_STATUSES,
    auditString(value) as SocialInboxConversation["conversation_status"],
    auditValue(value) || "Unknown",
  );
}

function auditOutcomeLabel(value: unknown) {
  return metaInboxVocabularyLabel(META_INBOX_OUTCOMES, auditString(value), auditValue(value) || "Unknown");
}

function joinAuditParts(parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(" · ") || "Updated";
}

function auditString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function auditArray(value: unknown) {
  return Array.isArray(value) && value.length ? value.map(auditValue).join(", ") : null;
}

function auditValue(value: unknown) {
  if (typeof value === "string" && value.trim()) return titleCase(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function auditNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}
