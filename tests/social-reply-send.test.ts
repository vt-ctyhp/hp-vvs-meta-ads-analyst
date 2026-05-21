import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  isLiveSendEnabled,
  SendReplyError,
} from "../src/lib/social-reply-send-flags.ts";

// Restore ALLOW_LIVE_META_SEND after each case so we don't leak between
// tests (and so a flake doesn't accidentally make a live Meta call).
const ORIGINAL_FLAG = process.env.ALLOW_LIVE_META_SEND;

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) {
    delete process.env.ALLOW_LIVE_META_SEND;
  } else {
    process.env.ALLOW_LIVE_META_SEND = ORIGINAL_FLAG;
  }
});

describe("isLiveSendEnabled", () => {
  it("returns false when the flag is unset (safe default)", () => {
    delete process.env.ALLOW_LIVE_META_SEND;
    assert.equal(isLiveSendEnabled(), false);
  });

  it("returns false when the flag is an explicit 'false'", () => {
    process.env.ALLOW_LIVE_META_SEND = "false";
    assert.equal(isLiveSendEnabled(), false);
  });

  it("returns false for the empty string", () => {
    process.env.ALLOW_LIVE_META_SEND = "";
    assert.equal(isLiveSendEnabled(), false);
  });

  it("returns true for 'true' (the canonical opt-in)", () => {
    process.env.ALLOW_LIVE_META_SEND = "true";
    assert.equal(isLiveSendEnabled(), true);
  });

  it("accepts '1' and 'yes' as opt-in synonyms", () => {
    process.env.ALLOW_LIVE_META_SEND = "1";
    assert.equal(isLiveSendEnabled(), true);
    process.env.ALLOW_LIVE_META_SEND = "yes";
    assert.equal(isLiveSendEnabled(), true);
  });

  it("ignores leading/trailing whitespace and casing", () => {
    process.env.ALLOW_LIVE_META_SEND = "  TRUE  ";
    assert.equal(isLiveSendEnabled(), true);
  });

  it("refuses partial matches that look truthy ('truthy', 'truestory', etc.)", () => {
    process.env.ALLOW_LIVE_META_SEND = "truthy";
    assert.equal(isLiveSendEnabled(), false);
  });
});

describe("SendReplyError", () => {
  it("defaults status to 502 (Meta upstream failure)", () => {
    const err = new SendReplyError("boom");
    assert.equal(err.status, 502);
    assert.equal(err.message, "boom");
    assert.equal(err.name, "SendReplyError");
  });

  it("preserves explicit status (e.g. 409 conflict)", () => {
    const err = new SendReplyError("not found", 404);
    assert.equal(err.status, 404);
  });

  it("is an Error subclass (works with instanceof catch)", () => {
    assert.ok(new SendReplyError("x") instanceof Error);
  });
});
