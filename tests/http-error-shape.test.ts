import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { safeErrorMessage } from "../src/lib/error-message.ts";
import { translateError } from "../src/lib/glossary.ts";

describe("safeErrorMessage", () => {
  it("returns the string for a string input", () => {
    assert.equal(safeErrorMessage("Something broke"), "Something broke");
  });

  it("returns Error.message for an Error instance", () => {
    assert.equal(safeErrorMessage(new Error("boom")), "boom");
  });

  it("extracts message from a Supabase-style plain object", () => {
    assert.equal(
      safeErrorMessage({ msg: "Invalid login credentials", code: 400 }),
      "Invalid login credentials",
    );
  });

  it("extracts hint when only hint/details are present (Postgrest shape)", () => {
    assert.equal(
      safeErrorMessage({ code: "42501", details: "RLS denied", hint: "user has no role" }),
      "RLS denied",
    );
  });

  it("falls back to JSON for objects with no known string field", () => {
    const out = safeErrorMessage({ random: { nested: 1 } });
    assert.notEqual(out, "[object Object]");
    assert.match(out, /random/);
  });

  it("never returns '[object Object]' for a plain object", () => {
    assert.notEqual(safeErrorMessage({}), "[object Object]");
    assert.notEqual(safeErrorMessage({ noStringFields: true }), "[object Object]");
  });

  it("returns a stable neutral message for null/undefined", () => {
    assert.equal(safeErrorMessage(null), "Unknown server error.");
    assert.equal(safeErrorMessage(undefined), "Unknown server error.");
  });

  it("returns a stable neutral message for a cyclic object", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const out = safeErrorMessage(cyclic);
    assert.notEqual(out, "[object Object]");
    assert.equal(out, "Unknown server error.");
  });
});

describe("translateError client-side defense-in-depth", () => {
  it("does not render '[object Object]' even when the source already produced it", () => {
    // Simulates the case where the server returned { error: '[object Object]' }
    // (a stringified bad payload) and the login client wraps it as Error.message.
    const result = translateError(new Error("[object Object]"), "Sign in failed.");
    assert.ok(!/\[object Object\]/.test(result), `unexpected literal: ${result}`);
    assert.equal(result, "Sign in failed.");
  });

  it("does not render '[object Error]' verbatim either", () => {
    const result = translateError(new Error("[object Error]"), "Sign in failed.");
    assert.ok(!/\[object (Object|Error)\]/.test(result), `unexpected literal: ${result}`);
    assert.equal(result, "Sign in failed.");
  });

  it("still surfaces real messages unchanged", () => {
    const result = translateError(new Error("Invalid login credentials"), "Fallback");
    assert.match(result, /Invalid login credentials/);
  });
});
