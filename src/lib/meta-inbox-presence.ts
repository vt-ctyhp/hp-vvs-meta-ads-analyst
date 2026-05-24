type JsonRecord = Record<string, unknown>;

export type MetaInboxPresenceActivity = "viewing" | "typing" | "replying";

export type MetaInboxPresenceInput = {
  activity?: MetaInboxPresenceActivity | null;
};

export type MetaInboxPresenceRecord = {
  id?: string;
  conversation_id: string;
  app_user_id: string;
  display_name: string | null;
  activity: MetaInboxPresenceActivity;
  last_seen_at: string;
  expires_at: string;
};

export type MetaInboxPresenceHeartbeat = {
  row: JsonRecord;
  expiresAt: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVITIES = new Set<MetaInboxPresenceActivity>(["viewing", "typing", "replying"]);

export function buildMetaInboxPresenceHeartbeat(
  conversationId: string,
  input: MetaInboxPresenceInput,
  context: {
    actorUserId: string | null;
    displayName?: string | null;
    now: string;
    ttlSeconds?: number;
  },
): MetaInboxPresenceHeartbeat {
  const normalizedConversationId = requireUuid(conversationId, "Conversation");
  const actorUserId = requireUuid(context.actorUserId, "A valid inbox user");
  const activity = normalizeActivity(input.activity);
  const ttlSeconds = clampTtl(context.ttlSeconds);
  const base = Date.parse(context.now);
  const safeBase = Number.isFinite(base) ? base : Date.now();
  const expiresAt = new Date(safeBase + ttlSeconds * 1000).toISOString();

  return {
    expiresAt,
    row: {
      conversation_id: normalizedConversationId,
      app_user_id: actorUserId,
      display_name: normalizeDisplayName(context.displayName),
      activity,
      last_seen_at: new Date(safeBase).toISOString(),
      expires_at: expiresAt,
      updated_at: new Date(safeBase).toISOString(),
    },
  };
}

export function filterActiveMetaInboxPresence(
  records: MetaInboxPresenceRecord[],
  context: { currentUserId: string | null; now: string },
) {
  const nowTime = Date.parse(context.now);
  const safeNow = Number.isFinite(nowTime) ? nowTime : Date.now();
  const currentUserId = context.currentUserId || "";
  return records
    .filter((record) => record.app_user_id !== currentUserId)
    .filter((record) => {
      const expiresAt = Date.parse(record.expires_at);
      return Number.isFinite(expiresAt) && expiresAt > safeNow;
    })
    .sort((a, b) => {
      const activityDelta = activityPriority(b.activity) - activityPriority(a.activity);
      if (activityDelta) return activityDelta;
      return String(b.last_seen_at || "").localeCompare(String(a.last_seen_at || ""));
    });
}

function normalizeActivity(value: MetaInboxPresenceActivity | null | undefined) {
  const activity = typeof value === "string" ? value.trim() : "viewing";
  if (!ACTIVITIES.has(activity as MetaInboxPresenceActivity)) return "viewing";
  return activity as MetaInboxPresenceActivity;
}

function normalizeDisplayName(value: string | null | undefined) {
  const displayName = String(value || "").trim();
  return displayName ? displayName.slice(0, 160) : null;
}

function clampTtl(value: number | null | undefined) {
  if (!Number.isFinite(value)) return 45;
  return Math.min(120, Math.max(15, Math.floor(Number(value))));
}

function activityPriority(activity: MetaInboxPresenceActivity) {
  if (activity === "replying") return 3;
  if (activity === "typing") return 2;
  return 1;
}

function requireUuid(value: string | null | undefined, label: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!UUID_RE.test(normalized)) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}
