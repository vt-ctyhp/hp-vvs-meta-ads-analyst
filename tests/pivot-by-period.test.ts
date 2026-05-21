import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lastNPeriods } from "../src/lib/period-windows.ts";
import { pivotByPeriod } from "../src/lib/pivot-by-period.ts";

const utcDate = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("pivotByPeriod", () => {
  const weeks = lastNPeriods(utcDate("2026-05-20"), 4, "week");
  // weeks[].key: ["2026-04-27", "2026-05-04", "2026-05-11", "2026-05-18"]

  it("groups campaign-level rows by campaign_id and buckets by week", () => {
    const rows = [
      { campaign_id: "c1", campaign: "Wedding Bands", week: "2026-05-11", spend: 280 },
      { campaign_id: "c1", campaign: "Wedding Bands", week: "2026-05-18", spend: 245 },
      { campaign_id: "c2", campaign: "Engagement",    week: "2026-05-11", spend: 200 },
      { campaign_id: "c2", campaign: "Engagement",    week: "2026-05-18", spend: 220 },
    ];

    const pivoted = pivotByPeriod(rows, {
      periods: weeks,
      entityIdField: "campaign_id",
      displayField: "campaign",
      periodKeyField: "week",
      valueField: "spend",
    });

    assert.equal(pivoted.length, 2);
    const c1 = pivoted.find((p) => p.entityId === "c1")!;
    assert.deepEqual(c1.periodValues, { "2026-05-11": 280, "2026-05-18": 245 });
    assert.equal(c1.total, 525);
    assert.equal(c1.displayName, "Wedding Bands");
  });

  it("ignores rows whose period key falls outside the requested windows", () => {
    const rows = [
      { campaign_id: "c1", campaign: "W", week: "2026-05-18", spend: 100 },
      { campaign_id: "c1", campaign: "W", week: "2026-03-09", spend: 99999 }, // outside window
    ];

    const pivoted = pivotByPeriod(rows, {
      periods: weeks,
      entityIdField: "campaign_id",
      displayField: "campaign",
      periodKeyField: "week",
      valueField: "spend",
    });

    assert.equal(pivoted[0].total, 100);
    assert.equal(pivoted[0].periodValues["2026-03-09"], undefined);
  });

  it("skips rows missing entity id or period key", () => {
    const rows = [
      { campaign_id: "c1", campaign: "W", week: "2026-05-18", spend: 100 },
      { campaign_id: "",   campaign: "W", week: "2026-05-18", spend: 999 },
      { campaign_id: "c2", campaign: "X", week: "",           spend: 999 },
      { campaign_id: "c3", campaign: "Y", week: null,         spend: 999 },
    ];

    const pivoted = pivotByPeriod(rows, {
      periods: weeks,
      entityIdField: "campaign_id",
      displayField: "campaign",
      periodKeyField: "week",
      valueField: "spend",
    });

    assert.equal(pivoted.length, 1);
    assert.equal(pivoted[0].entityId, "c1");
  });

  it("sums duplicate (entity, period) rows defensively", () => {
    const rows = [
      { campaign_id: "c1", campaign: "W", week: "2026-05-18", spend: 100 },
      { campaign_id: "c1", campaign: "W", week: "2026-05-18", spend: 50 },
    ];

    const pivoted = pivotByPeriod(rows, {
      periods: weeks,
      entityIdField: "campaign_id",
      displayField: "campaign",
      periodKeyField: "week",
      valueField: "spend",
    });

    assert.equal(pivoted[0].periodValues["2026-05-18"], 150);
    assert.equal(pivoted[0].total, 150);
  });

  it("preserves parent FK references when parentIdFields is set", () => {
    const rows = [
      {
        ad_set_id: "as1",
        ad_set: "Lookalike 1%",
        campaign_id: "c1",
        week: "2026-05-18",
        spend: 100,
      },
    ];

    const pivoted = pivotByPeriod(rows, {
      periods: weeks,
      entityIdField: "ad_set_id",
      displayField: "ad_set",
      periodKeyField: "week",
      valueField: "spend",
      parentIdFields: ["campaign_id"],
    });

    assert.deepEqual(pivoted[0].parentIds, { campaign_id: "c1" });
  });

  it("coerces numeric strings to numbers (PostgREST returns numerics as strings sometimes)", () => {
    // Cast through unknown to test the string-coercion path; the input
    // type would normally forbid a string in the `spend` field.
    const rows = [
      { campaign_id: "c1", campaign: "W", week: "2026-05-18", spend: "342.50" as unknown as number },
    ];

    const pivoted = pivotByPeriod(rows, {
      periods: weeks,
      entityIdField: "campaign_id",
      displayField: "campaign",
      periodKeyField: "week",
      valueField: "spend",
    });

    assert.equal(pivoted[0].periodValues["2026-05-18"], 342.5);
  });

  it("falls back to entityId when display field is missing", () => {
    const rows = [
      { campaign_id: "c1", campaign: null, week: "2026-05-18", spend: 100 },
    ];

    const pivoted = pivotByPeriod(rows, {
      periods: weeks,
      entityIdField: "campaign_id",
      displayField: "campaign",
      periodKeyField: "week",
      valueField: "spend",
    });

    assert.equal(pivoted[0].displayName, "c1");
  });

  it("returns empty array for empty input", () => {
    const pivoted = pivotByPeriod([], {
      periods: weeks,
      entityIdField: "campaign_id",
      displayField: "campaign",
      periodKeyField: "week",
      valueField: "spend",
    });
    assert.deepEqual(pivoted, []);
  });
});
