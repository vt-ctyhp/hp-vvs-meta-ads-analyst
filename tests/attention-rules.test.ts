import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAttentionItems,
  type AttentionItem,
} from "../src/lib/attention-rules.ts";

// Local minimal types so we don't have to import analytics.ts (which pulls in
// Supabase). buildAttentionItems is a pure function over a structurally-typed
// subset of DashboardPayload; this stays in sync via the cast at the bottom.
type TestRow = {
  id: string;
  name: string;
  brandCode: string;
  campaignUmbrella: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
  bookings: number;
  websiteBookings: number;
  messagingContacts: number;
  newMessagingContacts: number;
  primaryResults: number;
  primaryResultLabel: string;
  secondaryResults: number | null;
  secondaryResultLabel: string | null;
  conversions: number;
  ctr: number;
  cpm: number;
  cpc: number;
  cpl: number | null;
  costPerPrimaryResult: number | null;
  frequency: number;
  riskLevel?: "low" | "medium" | "high";
  riskReason?: string;
};

function row(
  id: string,
  name: string,
  values: {
    spend: number;
    primaryResults: number;
    costPerPrimaryResult: number | null;
    impressions?: number;
    riskLevel?: TestRow["riskLevel"];
    riskReason?: string;
  },
): TestRow {
  return {
    id,
    name,
    brandCode: "All",
    campaignUmbrella: name,
    spend: values.spend,
    impressions: values.impressions ?? 100_000,
    reach: 80_000,
    clicks: 1_000,
    leads: 0,
    bookings: 0,
    websiteBookings: 0,
    messagingContacts: values.primaryResults,
    newMessagingContacts: 0,
    primaryResults: values.primaryResults,
    primaryResultLabel: "Messages",
    secondaryResults: null,
    secondaryResultLabel: null,
    conversions: 0,
    ctr: 1.5,
    cpm: 10,
    cpc: 1,
    cpl: null,
    costPerPrimaryResult: values.costPerPrimaryResult,
    frequency: 1.5,
    riskLevel: values.riskLevel,
    riskReason: values.riskReason,
  };
}

function payload(
  current: TestRow[],
  prior: TestRow[],
  options: { fatigueRisks?: TestRow[] } = {},
) {
  // Cast through unknown — the rule engine only reads the fields above; full
  // DashboardPayload shape would force us to import the whole module.
  return {
    byUmbrella: current,
    comparison: { byUmbrella: prior },
    fatigueRisks: options.fatigueRisks ?? [],
  } as unknown as Parameters<typeof buildAttentionItems>[0];
}

function bucketOf(items: AttentionItem[], entityId: string) {
  return items.find((item) => item.entityId === entityId)?.bucket;
}

describe("attention-rules — investigate", () => {
  it("fires when umbrella cost per result is up >= 30%", () => {
    // 50 → 100 = +100%
    const items = buildAttentionItems(
      payload(
        [row("U1", "Book Appts US", { spend: 1000, primaryResults: 10, costPerPrimaryResult: 100 })],
        [row("U1", "Book Appts US", { spend: 1000, primaryResults: 20, costPerPrimaryResult: 50 })],
      ),
    );
    assert.equal(bucketOf(items, "U1"), "investigate");
  });

  it("fires regardless of spend direction", () => {
    const itemsUp = buildAttentionItems(
      payload(
        [row("U1", "X", { spend: 1500, primaryResults: 10, costPerPrimaryResult: 150 })],
        [row("U1", "X", { spend: 1000, primaryResults: 20, costPerPrimaryResult: 50 })],
      ),
    );
    assert.equal(bucketOf(itemsUp, "U1"), "investigate");

    const itemsDown = buildAttentionItems(
      payload(
        [row("U1", "X", { spend: 500, primaryResults: 5, costPerPrimaryResult: 100 })],
        [row("U1", "X", { spend: 1000, primaryResults: 20, costPerPrimaryResult: 50 })],
      ),
    );
    assert.equal(bucketOf(itemsDown, "U1"), "investigate");
  });

  it("does NOT fire when cost change is below 30%", () => {
    // 50 → 55 (+10%)
    const items = buildAttentionItems(
      payload(
        [row("U1", "X", { spend: 1000, primaryResults: 18, costPerPrimaryResult: 55 })],
        [row("U1", "X", { spend: 1000, primaryResults: 20, costPerPrimaryResult: 50 })],
      ),
    );
    assert.notEqual(bucketOf(items, "U1"), "investigate");
  });
});

describe("attention-rules — watch", () => {
  it("fires when cost up >= 15% AND spend not falling", () => {
    // cost: 50 → 60 (+20%), spend: 1000 → 1100 (+10%)
    const items = buildAttentionItems(
      payload(
        [row("U1", "FB US", { spend: 1100, primaryResults: 18, costPerPrimaryResult: 60 })],
        [row("U1", "FB US", { spend: 1000, primaryResults: 20, costPerPrimaryResult: 50 })],
      ),
    );
    assert.equal(bucketOf(items, "U1"), "watch");
  });

  it("does NOT fire as watch when spend is decreasing", () => {
    // cost up 16% but spend -30% — that's shrinking, not the spend-more-get-less trap
    const items = buildAttentionItems(
      payload(
        [row("U1", "X", { spend: 700, primaryResults: 12, costPerPrimaryResult: 58 })],
        [row("U1", "X", { spend: 1000, primaryResults: 20, costPerPrimaryResult: 50 })],
      ),
    );
    assert.notEqual(bucketOf(items, "U1"), "watch");
  });

  it("does not double-fire when investigate already caught it", () => {
    // cost up 42% (investigate) and spend up — investigate wins, watch does not also fire
    const items = buildAttentionItems(
      payload(
        [row("U1", "X", { spend: 1200, primaryResults: 17, costPerPrimaryResult: 71 })],
        [row("U1", "X", { spend: 1000, primaryResults: 20, costPerPrimaryResult: 50 })],
      ),
    );
    const u1 = items.filter((item) => item.entityId === "U1");
    assert.equal(u1.length, 1);
    assert.equal(u1[0].bucket, "investigate");
  });
});

describe("attention-rules — scale", () => {
  it("fires when results up >= 20% AND cost flat-or-down AND spend share >= 1%", () => {
    // total $10k, U1 = $5k = 50% share; results +50%; cost 50 → 45 (-10%)
    const items = buildAttentionItems(
      payload(
        [
          row("U1", "Book Appts US", { spend: 5000, primaryResults: 30, costPerPrimaryResult: 45 }),
          row("U2", "Other", { spend: 5000, primaryResults: 20, costPerPrimaryResult: 50 }),
        ],
        [
          row("U1", "Book Appts US", { spend: 4000, primaryResults: 20, costPerPrimaryResult: 50 }),
          row("U2", "Other", { spend: 5000, primaryResults: 20, costPerPrimaryResult: 50 }),
        ],
      ),
    );
    assert.equal(bucketOf(items, "U1"), "scale");
  });

  it("does NOT fire as scale when cost climbed", () => {
    const items = buildAttentionItems(
      payload(
        [row("U1", "X", { spend: 5000, primaryResults: 30, costPerPrimaryResult: 60 })],
        [row("U1", "X", { spend: 5000, primaryResults: 20, costPerPrimaryResult: 50 })],
      ),
    );
    assert.notEqual(bucketOf(items, "U1"), "scale");
  });

  it("does NOT fire scale when spend share is tiny (< 1%)", () => {
    const items = buildAttentionItems(
      payload(
        [
          row("U1", "Tiny", { spend: 50, primaryResults: 6, costPerPrimaryResult: 8 }),
          row("U2", "Big", { spend: 100_000, primaryResults: 1000, costPerPrimaryResult: 100 }),
        ],
        [
          row("U1", "Tiny", { spend: 50, primaryResults: 4, costPerPrimaryResult: 12 }),
          row("U2", "Big", { spend: 100_000, primaryResults: 1000, costPerPrimaryResult: 100 }),
        ],
      ),
    );
    assert.notEqual(bucketOf(items, "U1"), "scale");
  });
});

describe("attention-rules — fix (fatigue)", () => {
  it("surfaces the highest-spend fatigue-risk creative", () => {
    const fatigue = row("C1", "Tired Creative", {
      spend: 200,
      primaryResults: 2,
      costPerPrimaryResult: 100,
      riskLevel: "high",
      riskReason: "Frequency 4.2x with CTR below benchmark",
    });
    const items = buildAttentionItems(payload([], [], { fatigueRisks: [fatigue] }));
    const fix = items.find((item) => item.bucket === "fix");
    assert.ok(fix);
    assert.equal(fix?.entityId, "C1");
    assert.match(fix?.headline ?? "", /Frequency|fatigue/i);
  });

  it("returns no fix item when fatigueRisks is empty", () => {
    const items = buildAttentionItems(payload([], []));
    assert.equal(items.find((item) => item.bucket === "fix"), undefined);
  });
});

describe("attention-rules — pending v1.5 stub", () => {
  it("always includes the v1.5 pending placeholder", () => {
    const items = buildAttentionItems(payload([], []));
    const pending = items.find((item) => item.bucket === "pending");
    assert.ok(pending);
    assert.match(pending?.headline ?? "", /coming in v1\.5/i);
    assert.equal(pending?.linkHref, "/review");
  });
});

describe("attention-rules — output shape + cap", () => {
  it("caps the output at 5 items", () => {
    const currents: TestRow[] = [];
    const priors: TestRow[] = [];
    for (let i = 1; i <= 6; i += 1) {
      currents.push(row(`U${i}`, `Umbrella ${i}`, { spend: 1000, primaryResults: 10, costPerPrimaryResult: 100 }));
      priors.push(row(`U${i}`, `Umbrella ${i}`, { spend: 1000, primaryResults: 20, costPerPrimaryResult: 50 }));
    }
    const items = buildAttentionItems(payload(currents, priors));
    assert.equal(items.length, 5);
  });

  it("sorts by priority: investigate > watch > fix > scale > pending", () => {
    const items = buildAttentionItems(
      payload(
        [
          row("U1", "Inv", { spend: 1000, primaryResults: 10, costPerPrimaryResult: 100 }),
          row("U2", "W", { spend: 1100, primaryResults: 18, costPerPrimaryResult: 61 }),
          row("U3", "S", { spend: 2000, primaryResults: 30, costPerPrimaryResult: 67 }),
        ],
        [
          row("U1", "Inv", { spend: 1000, primaryResults: 20, costPerPrimaryResult: 50 }),
          row("U2", "W", { spend: 1000, primaryResults: 20, costPerPrimaryResult: 50 }),
          row("U3", "S", { spend: 2000, primaryResults: 20, costPerPrimaryResult: 100 }),
        ],
      ),
    );
    const buckets = items.map((item) => item.bucket);
    const investigateIdx = buckets.indexOf("investigate");
    const watchIdx = buckets.indexOf("watch");
    const scaleIdx = buckets.indexOf("scale");
    const pendingIdx = buckets.indexOf("pending");
    assert.ok(investigateIdx >= 0, "investigate missing");
    assert.ok(watchIdx >= 0, "watch missing");
    assert.ok(scaleIdx >= 0, "scale missing");
    assert.ok(pendingIdx >= 0, "pending missing");
    assert.ok(investigateIdx < watchIdx);
    assert.ok(watchIdx < scaleIdx);
    assert.ok(scaleIdx < pendingIdx);
  });

  it("every returned item carries an actionable linkHref", () => {
    const items = buildAttentionItems(
      payload(
        [row("U1", "X", { spend: 1000, primaryResults: 10, costPerPrimaryResult: 100 })],
        [row("U1", "X", { spend: 1000, primaryResults: 20, costPerPrimaryResult: 50 })],
      ),
    );
    for (const item of items) {
      assert.ok(item.linkHref && item.linkHref.length > 0, `linkHref missing on ${item.bucket}:${item.entityId}`);
    }
  });
});
