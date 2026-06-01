import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  buildInstagramGraphUrl,
  resolveInstagramMessagingCredentialsForPage,
} from "../src/lib/meta-instagram-messaging.ts";

const ORIGINAL_TOKEN = process.env.META_INSTAGRAM_ACCESS_TOKEN;
const ORIGINAL_USER_ID = process.env.META_INSTAGRAM_USER_ID;

afterEach(() => {
  restoreEnv("META_INSTAGRAM_ACCESS_TOKEN", ORIGINAL_TOKEN);
  restoreEnv("META_INSTAGRAM_USER_ID", ORIGINAL_USER_ID);
});

describe("Instagram messaging API configuration", () => {
  it("stays disabled unless an Instagram user access token is configured", () => {
    delete process.env.META_INSTAGRAM_ACCESS_TOKEN;
    delete process.env.META_INSTAGRAM_USER_ID;

    assert.equal(
      resolveInstagramMessagingCredentialsForPage({ igUserId: "ig-1" }),
      null,
    );
  });

  it("uses the connected page's Instagram user id when no explicit id is configured", () => {
    process.env.META_INSTAGRAM_ACCESS_TOKEN = "ig-token";
    delete process.env.META_INSTAGRAM_USER_ID;

    assert.deepEqual(
      resolveInstagramMessagingCredentialsForPage({ igUserId: "ig-1" }),
      { igUserId: "ig-1", accessToken: "ig-token" },
    );
  });

  it("allows the Instagram API user id to differ from the page-connected business id", () => {
    process.env.META_INSTAGRAM_ACCESS_TOKEN = "ig-token";
    process.env.META_INSTAGRAM_USER_ID = "ig-api-user";

    assert.deepEqual(
      resolveInstagramMessagingCredentialsForPage({ igUserId: "ig-1" }),
      { igUserId: "ig-api-user", accessToken: "ig-token" },
    );
  });

  it("builds graph.instagram.com URLs, not graph.facebook.com URLs", () => {
    const url = new URL(
      buildInstagramGraphUrl(
        "ig-1/conversations",
        { fields: "id,updated_time", limit: "25" },
        "ig-token",
      ),
    );

    assert.equal(url.origin, "https://graph.instagram.com");
    assert.match(url.pathname, /\/v\d+\.\d+\/ig-1\/conversations$/);
    assert.equal(url.searchParams.get("fields"), "id,updated_time");
    assert.equal(url.searchParams.get("limit"), "25");
    assert.equal(url.searchParams.get("access_token"), "ig-token");
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
