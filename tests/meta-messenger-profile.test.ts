import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseMessengerProfileResponse,
  parseConversationsParticipantResponse,
  fetchMessengerProfile,
  shouldEnrichProfile,
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

describe("Conversations participant parser", () => {
  const PSID = "27355382180747029";
  const conversationsResponse = {
    data: [
      {
        participants: {
          data: [
            { name: "Maxine Gathwright", email: `${PSID}@facebook.com`, id: PSID },
            { name: "Hung Phat USA", email: "100615618793615@facebook.com", id: "100615618793615" },
          ],
        },
        id: "t_1306976474238038",
      },
    ],
  };

  it("extracts the matching participant name by PSID", () => {
    assert.deepEqual(
      parseConversationsParticipantResponse(conversationsResponse, PSID),
      { displayName: "Maxine Gathwright", profilePictureUrl: null },
    );
  });

  it("falls back to senders.data when participants is missing", () => {
    const senderOnly = {
      data: [
        {
          senders: { data: [{ name: "Maxine Gathwright", id: PSID }] },
          id: "t_xyz",
        },
      ],
    };
    assert.deepEqual(parseConversationsParticipantResponse(senderOnly, PSID), {
      displayName: "Maxine Gathwright",
      profilePictureUrl: null,
    });
  });

  it("returns null when no participant matches the given PSID", () => {
    assert.equal(parseConversationsParticipantResponse(conversationsResponse, "999999"), null);
  });

  it("returns null on error response", () => {
    assert.equal(
      parseConversationsParticipantResponse({ error: { message: "denied" } }, PSID),
      null,
    );
  });

  it("returns null on empty / malformed input", () => {
    assert.equal(parseConversationsParticipantResponse({ data: [] }, PSID), null);
    assert.equal(parseConversationsParticipantResponse(null, PSID), null);
    assert.equal(parseConversationsParticipantResponse("oops", PSID), null);
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

  it("returns null when the Graph API returns a non-2xx status with no fallback", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { message: "denied" } }), { status: 400 });
    const result = await fetchMessengerProfile("customer-1", "page-token", {
      fetchFn: fakeFetch,
    });
    assert.equal(result, null);
  });

  it("falls back to /me/conversations when direct profile lookup fails", async () => {
    const PSID = "27355382180747029";
    const calls: string[] = [];
    const fakeFetch: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push(url);
      if (url.includes(`/${PSID}?`) || url.includes(`/${PSID}&`)) {
        return new Response(
          JSON.stringify({
            error: { message: "missing permissions", code: 100, error_subcode: 33 },
          }),
          { status: 400 },
        );
      }
      if (url.includes("/me/conversations")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                participants: {
                  data: [
                    { name: "Maxine Gathwright", id: PSID },
                    { name: "Page", id: "100615618793615" },
                  ],
                },
                id: "t_xyz",
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    };

    const result = await fetchMessengerProfile(PSID, "page-token", { fetchFn: fakeFetch });
    assert.deepEqual(result, {
      displayName: "Maxine Gathwright",
      profilePictureUrl: null,
    });
    assert.equal(calls.length, 2, "should try direct first, then conversations fallback");
    assert.equal(calls[1].includes(`user_id=${PSID}`), true);
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

  it("flags profiles missing display_name or profile_picture_url for enrichment", () => {
    assert.equal(shouldEnrichProfile({ display_name: null, profile_picture_url: null }), true);
    assert.equal(shouldEnrichProfile({ display_name: "Darlene", profile_picture_url: null }), true);
    assert.equal(shouldEnrichProfile({ display_name: null, profile_picture_url: "https://x" }), true);
    assert.equal(
      shouldEnrichProfile({ display_name: "Darlene", profile_picture_url: "https://x" }),
      false,
    );
    assert.equal(shouldEnrichProfile({ display_name: "   ", profile_picture_url: "https://x" }), true);
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
