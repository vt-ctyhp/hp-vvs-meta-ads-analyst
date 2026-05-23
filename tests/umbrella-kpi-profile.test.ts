import { test } from "node:test";
import assert from "node:assert/strict";

import { getKpiProfile } from "../src/lib/umbrella-kpi-profile.ts";

test("Book Appts US maps to Website Bookings", () => {
  const profile = getKpiProfile("Book Appts US");
  assert.equal(profile.primaryMetric, "websiteBookings");
  assert.equal(profile.primaryResultLabel, "Website Bookings");
  assert.equal(profile.secondaryMetric, null);
  assert.equal(profile.secondaryResultLabel, null);
});

test("Facebook US Product maps to Messaging Contacts with secondary", () => {
  const profile = getKpiProfile("Facebook US Product");
  assert.equal(profile.primaryMetric, "messagingContacts");
  assert.equal(profile.primaryResultLabel, "Messaging Contacts");
  assert.equal(profile.secondaryMetric, "newMessagingContacts");
  assert.equal(profile.secondaryResultLabel, "New Msg Contacts");
});

test("Facebook VN Product matches Facebook US Product profile", () => {
  const us = getKpiProfile("Facebook US Product");
  const vn = getKpiProfile("Facebook VN Product");
  assert.deepEqual(us, vn);
});

test("Unknown umbrella falls back to default (Messaging Contacts, no secondary)", () => {
  const profile = getKpiProfile("Cash for Gold US");
  assert.equal(profile.primaryMetric, "messagingContacts");
  assert.equal(profile.primaryResultLabel, "Messaging Contacts");
  assert.equal(profile.secondaryMetric, null);
  assert.equal(profile.secondaryResultLabel, null);
});

test("null and undefined umbrella fall back to default", () => {
  assert.deepEqual(getKpiProfile(null), getKpiProfile("anything-unknown"));
  assert.deepEqual(getKpiProfile(undefined), getKpiProfile("anything-unknown"));
});

test("empty-string umbrella falls back to default", () => {
  const profile = getKpiProfile("");
  assert.equal(profile.primaryResultLabel, "Messaging Contacts");
});
