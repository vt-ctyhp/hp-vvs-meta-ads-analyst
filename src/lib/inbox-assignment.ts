import type { MetaInboxAccessProfile } from "./meta-inbox-access.ts";
import type { MetaInboxWorkflowMutation } from "./meta-inbox-workflow.ts";

// Guard: the workflow MUST have emitted an assignment_changed event for an
// assignment mutation. Catches a future regression where the workflow stops
// writing the audit row that C2/manager-view depend on.
export function assertAssignmentEventEmitted(mutation: MetaInboxWorkflowMutation): void {
  const emitted = mutation.events.some((event) => event.eventType === "assignment_changed");
  if (!emitted) {
    throw new Error(
      "updateAssignment: expected an assignment_changed event but none was emitted " +
        "(no-op assignment or workflow regression).",
    );
  }
}

// Sole sanctioned assignment-mutation path. Delegates to the existing
// workflow (which persists the conversation update AND the assignment_changed
// audit event) and verifies the audit event landed.
export async function updateAssignment(
  conversationId: string,
  next: { user_id: string | null; team_id: string | null; actor_id: string },
  profile: MetaInboxAccessProfile,
): Promise<void> {
  const { updateSocialInboxConversationWorkflow } = await import("./social-inbox.ts");
  const result = await updateSocialInboxConversationWorkflow(conversationId, profile, {
    assignmentMode: next.user_id ? "assign_to_user" : "team_queue",
    targetUserId: next.user_id,
    assignedTeamId: next.team_id,
  });
  const emitted = result.events.some((event) => event["event_type"] === "assignment_changed");
  if (!emitted) {
    throw new Error(
      "updateAssignment: workflow persisted no assignment_changed event " +
        "(assignment may not have changed).",
    );
  }
}
