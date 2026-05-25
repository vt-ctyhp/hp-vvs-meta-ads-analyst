import type { MetaInboxCustomerContactMethodKey } from "./meta-inbox-vocabulary.ts";

type JsonRecord = Record<string, unknown>;

export type MetaInboxContactMethodValueInput = {
  type: MetaInboxCustomerContactMethodKey;
  value: string;
};

export type MetaInboxContactMethodMutationInput = {
  contactMethodId?: string | null;
  type?: MetaInboxCustomerContactMethodKey | null;
  value?: string | null;
  providedInMessageId?: string | null;
  changeReason?: string | null;
};

export type MetaInboxContactMethodRecord = {
  id: string;
  customer_profile_id: string;
  type: MetaInboxCustomerContactMethodKey;
  value_normalized: string;
  value_display: string;
  source: string;
  raw_input: string | null;
  entered_by: string | null;
  entered_at: string | null;
  deleted_at: string | null;
};

export type MetaInboxContactMethodNormalizedValue = {
  type: MetaInboxCustomerContactMethodKey;
  valueDisplay: string;
  valueNormalized: string;
  rawInput: string;
};

export type MetaInboxContactMethodEventDraft = {
  eventType: "contact_method_changed";
  previousValue: JsonRecord | null;
  newValue: JsonRecord;
  metadata: JsonRecord;
};

export type MetaInboxContactMethodCreate = {
  row: JsonRecord;
  event: MetaInboxContactMethodEventDraft;
};

export type MetaInboxContactMethodUpdate = {
  update: JsonRecord;
  event: MetaInboxContactMethodEventDraft;
};

type MutationContext = {
  actorUserId: string | null;
  now: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeMetaInboxContactMethodValue(
  input: MetaInboxContactMethodValueInput,
): MetaInboxContactMethodNormalizedValue {
  const type = normalizeType(input.type);
  const rawInput = String(input.value ?? "");
  const valueDisplay = rawInput.trim();
  if (!valueDisplay) {
    throw new Error("Contact value is required.");
  }

  if (type === "email") {
    const valueNormalized = valueDisplay.toLowerCase();
    if (!EMAIL_RE.test(valueNormalized) || valueNormalized.length > 254) {
      throw new Error("Enter a valid email address.");
    }
    return { type, valueDisplay, valueNormalized, rawInput };
  }

  const hasLeadingPlus = valueDisplay.startsWith("+");
  const digits = valueDisplay.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    throw new Error("Enter a valid phone number.");
  }
  return {
    type,
    valueDisplay,
    valueNormalized: hasLeadingPlus ? `+${digits}` : digits,
    rawInput,
  };
}

export function buildMetaInboxContactMethodCreate(
  customerProfileId: string | null | undefined,
  input: MetaInboxContactMethodValueInput,
  context: MutationContext,
): MetaInboxContactMethodCreate {
  const profileId = requireUuid(customerProfileId, "Customer profile");
  const actorUserId = requireUuid(context.actorUserId, "A valid sales user");
  const normalized = normalizeMetaInboxContactMethodValue(input);

  return {
    row: {
      customer_profile_id: profileId,
      type: normalized.type,
      value_normalized: normalized.valueNormalized,
      value_display: normalized.valueDisplay,
      source: "sales_entered",
      raw_input: normalized.rawInput,
      entered_by: actorUserId,
      entered_at: context.now,
    },
    event: contactMethodEvent({
      action: "created",
      previous: null,
      next: normalized,
      context,
    }),
  };
}

export function buildMetaInboxContactMethodUpdate(
  existing: MetaInboxContactMethodRecord,
  input: MetaInboxContactMethodValueInput,
  context: MutationContext,
): MetaInboxContactMethodUpdate {
  const actorUserId = requireUuid(context.actorUserId, "A valid sales user");
  const normalized = normalizeMetaInboxContactMethodValue(input);
  const previous = contactSnapshot(existing, "previous");

  return {
    update: {
      type: normalized.type,
      value_normalized: normalized.valueNormalized,
      value_display: normalized.valueDisplay,
      source: "sales_entered",
      raw_input: normalized.rawInput,
      entered_by: actorUserId,
      entered_at: context.now,
      deleted_by: null,
      deleted_at: null,
      updated_at: context.now,
    },
    event: contactMethodEvent({
      action: "updated",
      previous,
      next: normalized,
      context,
      contactMethodId: existing.id,
    }),
  };
}

export function buildMetaInboxContactMethodDelete(
  existing: MetaInboxContactMethodRecord,
  context: MutationContext,
): MetaInboxContactMethodUpdate {
  const actorUserId = requireUuid(context.actorUserId, "A valid sales user");
  const previous = contactSnapshot(existing, "previous");

  return {
    update: {
      deleted_by: actorUserId,
      deleted_at: context.now,
      updated_at: context.now,
    },
    event: {
      eventType: "contact_method_changed",
      previousValue: previous,
      newValue: {
        action: "deleted",
        contactMethodId: existing.id,
        type: existing.type,
        valueNormalized: existing.value_normalized,
        valueDisplay: existing.value_display,
      },
      metadata: contactMetadata(context),
    },
  };
}

function contactMethodEvent({
  action,
  previous,
  next,
  context,
  contactMethodId,
}: {
  action: "created" | "updated";
  previous: JsonRecord | null;
  next: MetaInboxContactMethodNormalizedValue;
  context: MutationContext;
  contactMethodId?: string | null;
}): MetaInboxContactMethodEventDraft {
  return {
    eventType: "contact_method_changed",
    previousValue: previous,
    newValue: {
      action,
      ...(contactMethodId ? { contactMethodId } : {}),
      type: next.type,
      valueNormalized: next.valueNormalized,
      valueDisplay: next.valueDisplay,
    },
    metadata: contactMetadata(context),
  };
}

function contactSnapshot(existing: MetaInboxContactMethodRecord, action: "previous") {
  return {
    action,
    contactMethodId: existing.id,
    type: existing.type,
    valueNormalized: existing.value_normalized,
    valueDisplay: existing.value_display,
    source: existing.source,
    enteredBy: existing.entered_by,
    enteredAt: existing.entered_at,
  };
}

function contactMetadata(context: MutationContext): JsonRecord {
  return {
    source: "inbox_contact_method",
    actorUserId: context.actorUserId,
    audited: true,
    verifiedMatchingCandidate: true,
  };
}

function normalizeType(value: string): MetaInboxCustomerContactMethodKey {
  if (value === "phone" || value === "email") return value;
  throw new Error("Contact type must be Phone or Email.");
}

function requireUuid(value: string | null | undefined, label: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!UUID_RE.test(normalized)) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}
