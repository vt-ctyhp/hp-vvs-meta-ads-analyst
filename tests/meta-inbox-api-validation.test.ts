import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { parseJsonObjectBody } from "../src/lib/meta-inbox-api-validation.ts";

const MUTATION_ROUTES = [
  "src/app/api/social-inbox/conversations/[conversationId]/workflow/route.ts",
  "src/app/api/social-inbox/conversations/[conversationId]/contact-methods/route.ts",
  "src/app/api/social-inbox/conversations/[conversationId]/send-attempts/route.ts",
  "src/app/api/social-inbox/conversations/[conversationId]/send-attempts/queue/route.ts",
  "src/app/api/social-inbox/conversations/[conversationId]/send-attempts/retry/route.ts",
  "src/app/api/social-inbox/conversations/[conversationId]/comment-actions/route.ts",
  "src/app/api/social-inbox/conversations/[conversationId]/comment-actions/queue/route.ts",
  "src/app/api/social-inbox/conversations/[conversationId]/comment-actions/retry/route.ts",
  "src/app/api/social-inbox/conversations/[conversationId]/presence/route.ts",
  "src/app/api/social-inbox/conversations/[conversationId]/notes/route.ts",
  "src/app/api/social-inbox/conversations/[conversationId]/qa-scorecards/route.ts",
  "src/app/api/social-inbox/ai-training/route.ts",
  "src/app/api/social-inbox/suggest-reply/route.ts",
  "src/app/api/social-inbox/saved-replies/route.ts",
] as const;

describe("Meta inbox API body validation", () => {
  it("returns a stable 400 error for malformed JSON", async () => {
    const error = await captureError(
      parseJsonObjectBody(
        new Request("https://local.test/api/social-inbox", {
          method: "POST",
          body: '{"activity":',
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    assert.equal(error.status, 400);
    assert.equal(error.message, "Malformed JSON body.");

  });

  it("rejects non-object JSON bodies before mutation services run", async () => {
    for (const body of ["null", "[]", '"typing"', "true"]) {
      const error = await captureError(
        parseJsonObjectBody(
          new Request("https://local.test/api/social-inbox", {
            method: "POST",
            body,
            headers: { "content-type": "application/json" },
          }),
        ),
      );

      assert.equal(error.status, 400);
      assert.equal(error.message, "Request body must be a JSON object.");
    }
  });

  it("allows valid object bodies through to the mutation service", async () => {
    const body = await parseJsonObjectBody<{ activity: string }>(
      new Request("https://local.test/api/social-inbox", {
        method: "POST",
        body: JSON.stringify({ activity: "typing" }),
        headers: { "content-type": "application/json" },
      }),
    );

    assert.deepEqual(body, { activity: "typing" });
  });

  it("allows empty object bodies when route-specific rules are optional", async () => {
    const body = await parseJsonObjectBody(
      new Request("https://local.test/api/social-inbox", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      }),
      {
        activity: { type: "string", nullable: true },
      },
    );

    assert.deepEqual(body, {});
  });

  it("rejects invalid field shapes with the same stable 400 error", async () => {
    const invalidBodies = [
      {
        body: { activity: ["typing"] },
        rules: { activity: { type: "string", nullable: true } },
      },
      {
        body: { attachmentIds: ["ok", 123] },
        rules: { attachmentIds: { type: "stringArray", nullable: true } },
      },
      {
        body: { approveShared: "true" },
        rules: { approveShared: { type: "boolean", nullable: true } },
      },
      {
        body: { toneScore: { value: 5 } },
        rules: { toneScore: { type: "numberOrString", nullable: true } },
      },
    ] as const;

    for (const invalidBody of invalidBodies) {
      const error = await captureError(
        parseJsonObjectBody(
          new Request("https://local.test/api/social-inbox", {
            method: "POST",
            body: JSON.stringify(invalidBody.body),
            headers: { "content-type": "application/json" },
          }),
          invalidBody.rules,
        ),
      );

      assert.equal(error.status, 400);
      assert.equal(error.message, "Invalid request body.");
    }
  });

  it("wires inbox mutation routes through shared JSON object validation", () => {
    for (const routePath of MUTATION_ROUTES) {
      const route = readFileSync(routePath, "utf8");
      assert.match(route, /parseJsonObjectBody/);
      assert.doesNotMatch(route, /parseJsonObjectBody<[^>]+>\([\s\S]*?request\s*\)/);
      assert.doesNotMatch(route, /request\.json/);
      assert.doesNotMatch(route, /json\(\)\.catch\(\(\) => \(\{\}\)\)/);
    }
  });
});

async function captureError(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as Error & { status?: number };
  }

  throw new assert.AssertionError({
    message: "Expected request body parsing to fail.",
  });
}
