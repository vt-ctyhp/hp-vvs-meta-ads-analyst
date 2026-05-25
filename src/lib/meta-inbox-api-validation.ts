export class MetaInboxApiValidationError extends Error {
  status = 400;

  constructor(message: string) {
    super(message);
    this.name = "MetaInboxApiValidationError";
  }
}

export type JsonBodyFieldRules = Record<string, {
  type: "boolean" | "numberOrString" | "string" | "stringArray";
  nullable?: boolean;
}>;

export async function parseJsonObjectBody<T = Record<string, unknown>>(
  request: Request,
  rules: JsonBodyFieldRules = {},
): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new MetaInboxApiValidationError("Malformed JSON body.");
  }

  if (!isJsonObject(body)) {
    throw new MetaInboxApiValidationError("Request body must be a JSON object.");
  }

  validateJsonBodyFields(body, rules);

  return body as T;
}

function validateJsonBodyFields(
  body: Record<string, unknown>,
  rules: JsonBodyFieldRules,
) {
  for (const [field, rule] of Object.entries(rules)) {
    if (!(field in body)) continue;
    const value = body[field];
    if (value === null && rule.nullable) continue;
    if (value === undefined) continue;
    if (isValidFieldValue(value, rule.type)) continue;
    throw new MetaInboxApiValidationError("Invalid request body.");
  }
}

function isValidFieldValue(value: unknown, type: JsonBodyFieldRules[string]["type"]) {
  if (type === "boolean") return typeof value === "boolean";
  if (type === "numberOrString") {
    return (
      (typeof value === "number" && Number.isFinite(value)) ||
      typeof value === "string"
    );
  }
  if (type === "string") return typeof value === "string";
  if (type === "stringArray") {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
  }
  return false;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
