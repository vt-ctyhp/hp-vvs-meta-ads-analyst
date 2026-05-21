/**
 * Extract a human-readable string from any thrown value without ever
 * producing the useless literal "[object Object]" or "[object Error]".
 *
 * The default `String(error)` produces "[object Object]" for plain JS
 * objects — the most common source of opaque sign-in / API error messages
 * on the staging build (limited-access mode surfaces Postgrest and
 * analytics-view errors that aren't always `Error` instances).
 *
 * Resolution order, from most specific to least:
 *   1. Already a non-empty string → return as-is.
 *   2. `Error` instance with a non-empty message → use `.message`.
 *   3. Plain object with a string-valued `message`/`error_description`/etc.
 *      key → use that field. Order is intentional: Supabase Auth uses
 *      `msg` and `error_description`; PostgrestError uses `message`/`hint`/
 *      `details`; generic OAuth shapes use `error_description`.
 *   4. Any object that JSON-stringifies cleanly → use the JSON string
 *      (capped at 240 chars).
 *   5. Anything else → a stable neutral message.
 *
 * Lives in its own file (no Next.js / Supabase imports) so the test runner
 * can exercise it directly without an HTTP/runtime dependency.
 */
export function safeErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "object" && error !== null) {
    const obj = error as Record<string, unknown>;
    for (const key of [
      "message",
      "error_description",
      "msg",
      "description",
      "details",
      "hint",
      "error",
    ]) {
      const value = obj[key];
      if (typeof value === "string" && value.trim()) return value;
    }
    try {
      const json = JSON.stringify(error);
      if (json && json !== "{}") {
        return json.length > 240 ? `${json.slice(0, 240)}…` : json;
      }
    } catch {
      // Cyclic or unstringifiable — fall through.
    }
  }
  return "Unknown server error.";
}
