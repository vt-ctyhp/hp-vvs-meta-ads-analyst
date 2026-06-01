import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { pickCustomerParticipant } from "../src/lib/meta-conversation-participants.ts";

describe("Meta conversation participant selection", () => {
  it("excludes the Facebook page id for Messenger conversations", () => {
    const customer = pickCustomerParticipant(
      {
        data: [
          { id: "page-1", name: "Hung Phat USA" },
          { id: "customer-1", name: "Rodelas Merlina" },
        ],
      },
      ["page-1"],
    );

    assert.deepEqual(customer, { id: "customer-1", name: "Rodelas Merlina" });
  });

  it("excludes the Instagram professional account id and falls back to username", () => {
    const customer = pickCustomerParticipant(
      {
        data: [
          { id: "ig-business-1", username: "hungphatusa" },
          { id: "ig-customer-1", username: "ecosse2000" },
        ],
      },
      ["page-1", "ig-business-1"],
    );

    assert.deepEqual(customer, { id: "ig-customer-1", name: "ecosse2000" });
  });
});
