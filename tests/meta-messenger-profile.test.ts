import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseMessengerProfileResponse,
  fetchMessengerProfile,
} from "../src/lib/meta-messenger-profile.ts";

describe("Messenger profile parser", () => {
  it("extracts display name and profile picture from a Graph API response", () => {
    assert.deepEqual(
      parseMessengerProfileResponse({
        id: "12345",
        name: "Darlene Customer",
        profile_pic: "https://cdn.example/avatar.jpg",
      }),
      {
        displayName: "Darlene Customer",
        profilePictureUrl: "https://cdn.example/avatar.jpg",
      },
    );
  });

  it("composes display name from first_name + last_name when name is missing", () => {
    assert.deepEqual(
      parseMessengerProfileResponse({
        first_name: "Darlene",
        last_name: "Nguyen",
      }),
      { displayName: "Darlene Nguyen", profilePictureUrl: null },
    );
  });

  it("returns null when the Graph API returns an error", () => {
    assert.equal(
      parseMessengerProfileResponse({
        error: { message: "User has not opted in", code: 100 },
      }),
      null,
    );
  });

  it("returns null when the response carries no identifying fields", () => {
    assert.equal(parseMessengerProfileResponse({}), null);
    assert.equal(parseMessengerProfileResponse({ id: "12345" }), null);
  });

  it("returns null for non-object responses", () => {
    assert.equal(parseMessengerProfileResponse(null), null);
    assert.equal(parseMessengerProfileResponse("oops"), null);
    assert.equal(parseMessengerProfileResponse(42), null);
  });
});

describe("fetchMessengerProfile", () => {
  it("calls the Graph API with the given access token and parses the response", async () => {
    const calls: string[] = [];
    const fakeFetch: typeof fetch = async (input) => {
      calls.push(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
      return new Response(
        JSON.stringify({
          id: "customer-1",
          name: "Darlene Customer",
          profile_pic: "https://cdn.example/avatar.jpg",
        }),
        { status: 200 },
      );
    };

    const result = await fetchMessengerProfile("customer-1", "page-token-xyz", {
      fetchFn: fakeFetch,
    });

    assert.deepEqual(result, {
      displayName: "Darlene Customer",
      profilePictureUrl: "https://cdn.example/avatar.jpg",
    });
    assert.equal(calls.length, 1);
    const url = new URL(calls[0]);
    assert.equal(url.pathname.endsWith("/customer-1"), true);
    assert.equal(url.searchParams.get("fields"), "name,profile_pic");
    assert.equal(url.searchParams.get("access_token"), "page-token-xyz");
  });

  it("returns null when the Graph API returns a non-2xx status", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { message: "denied" } }), { status: 400 });
    const result = await fetchMessengerProfile("customer-1", "page-token", {
      fetchFn: fakeFetch,
    });
    assert.equal(result, null);
  });

  it("returns null when the fetch throws", async () => {
    const fakeFetch: typeof fetch = async () => {
      throw new Error("network down");
    };
    const result = await fetchMessengerProfile("customer-1", "page-token", {
      fetchFn: fakeFetch,
    });
    assert.equal(result, null);
  });

  it("does nothing and returns null when participantId or pageAccessToken is empty", async () => {
    let called = false;
    const fakeFetch: typeof fetch = async () => {
      called = true;
      return new Response("{}", { status: 200 });
    };
    assert.equal(await fetchMessengerProfile("", "token", { fetchFn: fakeFetch }), null);
    assert.equal(await fetchMessengerProfile("psid", "", { fetchFn: fakeFetch }), null);
    assert.equal(called, false);
  });
});
