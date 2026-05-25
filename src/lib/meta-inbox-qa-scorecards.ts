type JsonRecord = Record<string, unknown>;

export type MetaInboxQaScorecard = {
  id: string;
  conversation_id: string;
  send_attempt_id: string | null;
  reviewed_user_id: string | null;
  reviewed_by: string;
  tone_score: number;
  completeness_score: number;
  accuracy_score: number;
  next_step_score: number;
  speed_score: number;
  policy_compliance_score: number;
  overall_score: number;
  coaching_note: string | null;
  metadata: JsonRecord;
  deleted_by: string | null;
  deleted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type MetaInboxQaScorecardInput = {
  sendAttemptId?: string | null;
  reviewedUserId?: string | null;
  toneScore?: number | string | null;
  completenessScore?: number | string | null;
  accuracyScore?: number | string | null;
  nextStepScore?: number | string | null;
  speedScore?: number | string | null;
  policyComplianceScore?: number | string | null;
  coachingNote?: string | null;
};

export type MetaInboxQaScorecardActor = {
  appUserId: string | null;
  roles: readonly string[];
};

export function buildMetaInboxQaScorecardCreate(
  conversationId: string,
  input: MetaInboxQaScorecardInput,
  actor: MetaInboxQaScorecardActor,
  now: string,
): {
  row: JsonRecord;
  scorecard: MetaInboxQaScorecard;
  event: {
    eventType: "qa_scorecard_added";
    previousValue: null;
    newValue: JsonRecord;
    metadata: JsonRecord;
  };
} {
  if (!isUuid(conversationId)) throw new Error("Conversation id is required.");
  const reviewerId = requireValidActorId(actor.appUserId);
  if (!canCreateMetaInboxQaScorecard(actor)) {
    throw new Error("Only sales lead or admin can create QA scorecards.");
  }

  const scores = {
    tone_score: requireScore(input.toneScore, "Tone"),
    completeness_score: requireScore(input.completenessScore, "Completeness"),
    accuracy_score: requireScore(input.accuracyScore, "Accuracy"),
    next_step_score: requireScore(input.nextStepScore, "Next step"),
    speed_score: requireScore(input.speedScore, "Speed"),
    policy_compliance_score: requireScore(input.policyComplianceScore, "Policy/compliance"),
  };
  const overallScore = averageScore(Object.values(scores));
  const sendAttemptId = normalizeUuid(input.sendAttemptId);
  const reviewedUserId = normalizeUuid(input.reviewedUserId);
  const coachingNote = optionalText(input.coachingNote, 4000);
  const metadata = {
    source: "inbox_qa_scorecards",
    hasCoachingNote: Boolean(coachingNote),
  };

  const row = {
    conversation_id: conversationId,
    send_attempt_id: sendAttemptId,
    reviewed_user_id: reviewedUserId,
    reviewed_by: reviewerId,
    ...scores,
    overall_score: overallScore,
    coaching_note: coachingNote,
    metadata,
  };

  return {
    row,
    scorecard: mapMetaInboxQaScorecardRow({
      id: "pending",
      deleted_by: null,
      deleted_at: null,
      created_at: now,
      updated_at: now,
      ...row,
    }),
    event: {
      eventType: "qa_scorecard_added",
      previousValue: null,
      newValue: {
        action: "created",
        qaScorecardId: null,
        reviewedUserId,
        sendAttemptId,
        overallScore,
      },
      metadata: {
        source: "inbox_qa_scorecards",
        reviewedUserId,
        sendAttemptId,
        overallScore,
      },
    },
  };
}

export function canCreateMetaInboxQaScorecard(actor: Pick<MetaInboxQaScorecardActor, "roles">) {
  return actor.roles.includes("admin") || actor.roles.includes("sales_lead");
}

export function mapMetaInboxQaScorecardRow(row: JsonRecord): MetaInboxQaScorecard {
  return {
    id: String(row.id || ""),
    conversation_id: String(row.conversation_id || ""),
    send_attempt_id: stringField(row.send_attempt_id),
    reviewed_user_id: stringField(row.reviewed_user_id),
    reviewed_by: String(row.reviewed_by || ""),
    tone_score: scoreField(row.tone_score),
    completeness_score: scoreField(row.completeness_score),
    accuracy_score: scoreField(row.accuracy_score),
    next_step_score: scoreField(row.next_step_score),
    speed_score: scoreField(row.speed_score),
    policy_compliance_score: scoreField(row.policy_compliance_score),
    overall_score: numberField(row.overall_score) || 0,
    coaching_note: stringField(row.coaching_note),
    metadata: isRecord(row.metadata) ? row.metadata : {},
    deleted_by: stringField(row.deleted_by),
    deleted_at: stringField(row.deleted_at),
    created_at: stringField(row.created_at),
    updated_at: stringField(row.updated_at),
  };
}

function requireValidActorId(value: string | null | undefined) {
  if (!value || !isUuid(value)) {
    throw new Error("A valid inbox user is required for QA scorecards.");
  }
  return value;
}

function requireScore(value: unknown, label: string) {
  const score = scoreField(value);
  if (!score) throw new Error(`${label} score must be between 1 and 5.`);
  return score;
}

function scoreField(value: unknown) {
  const score = numberField(value);
  if (!score || score < 1 || score > 5) return 0;
  return Math.round(score);
}

function averageScore(scores: number[]) {
  return Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10;
}

function optionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new Error(`Coaching note must be ${maxLength} characters or less.`);
  }
  return trimmed;
}

function normalizeUuid(value: unknown) {
  return typeof value === "string" && isUuid(value) ? value : null;
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberField(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
