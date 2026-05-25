import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { permissionsForRoles } from "../src/lib/access-control.ts";
import {
  buildMetaInboxContactMethodCreate,
  buildMetaInboxContactMethodDelete,
  buildMetaInboxContactMethodUpdate,
  normalizeMetaInboxContactMethodValue,
} from "../src/lib/meta-inbox-contact-methods.ts";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "22222222-2222-4222-8222-222222222222";
const CONTACT_ID = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-05-24T05:00:00.000Z";

describe("Meta inbox customer contact methods", () => {
  it("normalizes and validates sales-entered email values", () => {
    const normalized = normalizeMetaInboxContactMethodValue({
      type: "email",
      value: "  Customer@Example.COM  ",
    });

    assert.deepEqual(normalized, {
      type: "email",
      valueDisplay: "Customer@Example.COM",
      valueNormalized: "customer@example.com",
      rawInput: "  Customer@Example.COM  ",
    });

    assert.throws(
      () => normalizeMetaInboxContactMethodValue({ type: "email", value: "not-email" }),
      /valid email/i,
    );
  });

  it("normalizes and validates sales-entered phone values", () => {
    const normalized = normalizeMetaInboxContactMethodValue({
      type: "phone",
      value: " (714) 555-1212 ",
    });

    assert.deepEqual(normalized, {
      type: "phone",
      valueDisplay: "(714) 555-1212",
      valueNormalized: "7145551212",
      rawInput: " (714) 555-1212 ",
    });

    assert.throws(
      () => normalizeMetaInboxContactMethodValue({ type: "phone", value: "123" }),
      /valid phone/i,
    );
  });

  it("builds add/update/delete rows with provenance and audit event drafts", () => {
    const created = buildMetaInboxContactMethodCreate(
      PROFILE_ID,
      { type: "email", value: "lead@example.com" },
      { actorUserId: ACTOR_ID, now: NOW },
    );

    assert.equal(created.row.customer_profile_id, PROFILE_ID);
    assert.equal(created.row.type, "email");
    assert.equal(created.row.source, "sales_entered");
    assert.equal(created.row.entered_by, ACTOR_ID);
    assert.equal(created.event.eventType, "contact_method_changed");
    assert.deepEqual(created.event.previousValue, null);
    assert.deepEqual(created.event.newValue, {
      action: "created",
      type: "email",
      valueNormalized: "lead@example.com",
      valueDisplay: "lead@example.com",
    });

    const updated = buildMetaInboxContactMethodUpdate(
      existingContactFixture(),
      { type: "phone", value: "+1 949 555 0101" },
      { actorUserId: ACTOR_ID, now: NOW },
    );

    assert.equal(updated.update.type, "phone");
    assert.equal(updated.update.value_normalized, "+19495550101");
    assert.equal(updated.event.previousValue?.valueNormalized, "7145551212");
    assert.equal(updated.event.newValue.valueNormalized, "+19495550101");

    const deleted = buildMetaInboxContactMethodDelete(existingContactFixture(), {
      actorUserId: ACTOR_ID,
      now: NOW,
    });

    assert.equal(deleted.update.deleted_by, ACTOR_ID);
    assert.equal(deleted.update.deleted_at, NOW);
    assert.equal(deleted.event.newValue.action, "deleted");
  });

  it("requires real profile and actor identifiers for audited contact writes", () => {
    assert.throws(
      () =>
        buildMetaInboxContactMethodCreate(
          null,
          { type: "email", value: "lead@example.com" },
          { actorUserId: ACTOR_ID, now: NOW },
        ),
      /customer profile/i,
    );

    assert.throws(
      () =>
        buildMetaInboxContactMethodCreate(
          PROFILE_ID,
          { type: "email", value: "lead@example.com" },
          { actorUserId: null, now: NOW },
        ),
      /valid sales user/i,
    );
  });

  it("keeps contact method writes restricted to sales roles, not marketing", () => {
    assert.equal(permissionsForRoles(["marketing"]).includes("manage_inbox_state"), false);
    assert.equal(permissionsForRoles(["sales"]).includes("manage_inbox_state"), true);
    assert.equal(permissionsForRoles(["sales_lead"]).includes("manage_inbox_state"), true);
  });
});

function existingContactFixture() {
  return {
    id: CONTACT_ID,
    customer_profile_id: PROFILE_ID,
    type: "phone" as const,
    value_normalized: "7145551212",
    value_display: "(714) 555-1212",
    source: "sales_entered",
    raw_input: "(714) 555-1212",
    entered_by: ACTOR_ID,
    entered_at: "2026-05-24T04:00:00.000Z",
    deleted_at: null,
  };
}
