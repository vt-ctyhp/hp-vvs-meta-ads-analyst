export type MetaConversationParticipant = {
  id: string | null;
  name: string | null;
};

type JsonRecord = Record<string, unknown>;

export function pickCustomerParticipant(
  participants: unknown,
  businessIds: Array<string | null | undefined>,
): MetaConversationParticipant {
  const businessIdSet = new Set(
    businessIds
      .map((id) => (typeof id === "string" ? id.trim() : ""))
      .filter(Boolean),
  );
  const participantList = arrayField(recordField(participants).data).filter(isRecord);
  for (const candidate of participantList) {
    const id = stringField(candidate.id);
    if (id && !businessIdSet.has(id)) {
      return {
        id,
        name: stringField(candidate.name) || stringField(candidate.username),
      };
    }
  }
  return { id: null, name: null };
}

function recordField(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
