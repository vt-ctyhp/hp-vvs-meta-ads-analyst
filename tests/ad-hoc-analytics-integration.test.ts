import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { aggregateMetaInsights } from "../src/lib/meta-insight-aggregates.ts";
import { createServiceClient } from "../src/lib/supabase.ts";

const hasSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
);

describe("ad-hoc analytics Supabase integration", { skip: !hasSupabaseEnv }, () => {
  it("has no duplicate recent account/ad/date insight keys", async () => {
    const latest = await latestInsightDate();
    const start = addDays(latest, -29);
    const supabase = createServiceClient();
    const response = await supabase
      .from("meta_daily_insights")
      .select("meta_account_id,ad_id,date_start")
      .gte("date_start", start)
      .lte("date_start", latest)
      .limit(50000);

    if (response.error) throw response.error;

    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const row of response.data || []) {
      const key = `${row.meta_account_id}|${row.ad_id}|${row.date_start}`;
      if (seen.has(key)) duplicates.add(key);
      seen.add(key);
    }

    assert.equal(duplicates.size, 0);
  });

  it("matches grouped source rows and totals for cash-for-gold spend/messages", async () => {
    const latest = await latestInsightDate();
    const start = addDays(latest, -6);
    const filters = [{ field: "campaign_umbrella" as const, operator: "equals" as const, value: "Cash for Gold US" }];
    const grouped = await aggregateMetaInsights({
      start,
      end: latest,
      dimensions: ["date"],
      filters,
      sortField: "date",
      sortDirection: "asc",
      limit: 100,
    });
    const totals = await aggregateMetaInsights({
      start,
      end: latest,
      dimensions: [],
      filters,
      sortField: "spend",
      sortDirection: "desc",
      limit: 1,
    });
    const total = totals[0];

    assert.ok(total);
    assert.equal(
      grouped.reduce((sum, row) => sum + row.source_rows, 0),
      total.source_rows,
    );
    assert.equal(round(grouped.reduce((sum, row) => sum + row.spend, 0)), round(total.spend));
    assert.equal(
      grouped.reduce((sum, row) => sum + row.messaging_contacts, 0),
      total.messaging_contacts,
    );
  });
});

async function latestInsightDate() {
  const supabase = createServiceClient();
  const response = await supabase
    .from("meta_daily_insights")
    .select("date_start")
    .order("date_start", { ascending: false })
    .limit(1)
    .single();

  if (response.error) throw response.error;
  return String(response.data.date_start);
}

function addDays(date: string, amount: number) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + amount);
  return next.toISOString().slice(0, 10);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
