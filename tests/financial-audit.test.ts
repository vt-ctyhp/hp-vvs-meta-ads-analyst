import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addDays,
  addMonths,
  auditRangeForTimeframe,
  buildAuditPeriods,
  buildAuditSentence,
  buildAuditTotals,
  classifyAuditStatus,
  daysCoveredByPeriod,
  lastDayOfMonth,
  mondayOf,
  parseAuditTimeframe,
  periodKeysForRange,
  periodLabel,
} from "../src/lib/financial-audit.ts";

describe("parseAuditTimeframe", () => {
  it("defaults to daily for unknown input", () => {
    assert.equal(parseAuditTimeframe(undefined), "daily");
    assert.equal(parseAuditTimeframe("yearly"), "daily");
    assert.equal(parseAuditTimeframe("weekly"), "weekly");
    assert.equal(parseAuditTimeframe("monthly"), "monthly");
  });
});

describe("date helpers", () => {
  it("adds days across month and year boundaries", () => {
    assert.equal(addDays("2026-01-01", -1), "2025-12-31");
    assert.equal(addDays("2026-02-28", 1), "2026-03-01");
  });

  it("finds the Monday of a week, matching the RPC week dimension", () => {
    assert.equal(mondayOf("2026-06-10"), "2026-06-08", "Wednesday maps to its Monday");
    assert.equal(mondayOf("2026-06-08"), "2026-06-08", "Monday maps to itself");
    assert.equal(mondayOf("2026-06-07"), "2026-06-01", "Sunday belongs to the prior Monday");
  });

  it("adds months with year carry", () => {
    assert.equal(addMonths("2026-06", -11), "2025-07");
    assert.equal(addMonths("2025-12", 1), "2026-01");
  });

  it("knows month ends, including leap February", () => {
    assert.equal(lastDayOfMonth("2026-02"), "2026-02-28");
    assert.equal(lastDayOfMonth("2028-02"), "2028-02-29");
    assert.equal(lastDayOfMonth("2026-06"), "2026-06-30");
  });
});

describe("auditRangeForTimeframe", () => {
  it("daily covers the last 30 synced days", () => {
    const range = auditRangeForTimeframe("daily", "2026-06-09");
    assert.deepEqual(range, { start: "2026-05-11", end: "2026-06-09" });
  });

  it("weekly starts on a Monday 12 weeks back", () => {
    const range = auditRangeForTimeframe("weekly", "2026-06-10");
    assert.equal(range.end, "2026-06-10");
    assert.equal(range.start, "2026-03-23");
    assert.equal(mondayOf(range.start), range.start, "range starts on a Monday");
  });

  it("monthly starts on the first of the month 12 months back", () => {
    const range = auditRangeForTimeframe("monthly", "2026-06-10");
    assert.deepEqual(range, { start: "2025-07-01", end: "2026-06-10" });
  });
});

describe("periodKeysForRange", () => {
  it("enumerates every day, week, and month in range", () => {
    assert.equal(
      periodKeysForRange("daily", { start: "2026-05-11", end: "2026-06-09" }).length,
      30,
    );
    const weeks = periodKeysForRange("weekly", { start: "2026-03-23", end: "2026-06-10" });
    assert.equal(weeks.length, 12);
    assert.equal(weeks[0], "2026-03-23");
    assert.equal(weeks[11], "2026-06-08");
    const months = periodKeysForRange("monthly", { start: "2025-07-01", end: "2026-06-10" });
    assert.equal(months.length, 12);
    assert.equal(months[0], "2025-07");
    assert.equal(months[11], "2026-06");
  });
});

describe("daysCoveredByPeriod", () => {
  const range = { start: "2026-03-23", end: "2026-06-10" };

  it("counts a full interior week as 7 days", () => {
    assert.equal(daysCoveredByPeriod("weekly", "2026-04-06", range), 7);
  });

  it("prorates the in-progress week to days synced", () => {
    // Week of Mon 2026-06-08, synced through Wed 2026-06-10 = 3 days.
    assert.equal(daysCoveredByPeriod("weekly", "2026-06-08", range), 3);
  });

  it("prorates the in-progress month", () => {
    const monthly = { start: "2025-07-01", end: "2026-06-10" };
    assert.equal(daysCoveredByPeriod("monthly", "2026-06", monthly), 10);
    assert.equal(daysCoveredByPeriod("monthly", "2026-05", monthly), 31);
  });

  it("is always 1 for daily periods", () => {
    assert.equal(daysCoveredByPeriod("daily", "2026-06-01", range), 1);
  });
});

describe("classifyAuditStatus", () => {
  it("flags no budget when nothing is configured", () => {
    assert.equal(classifyAuditStatus(120, 0), "no_budget");
  });

  it("tolerates Meta's small daily overdelivery before flagging over", () => {
    assert.equal(classifyAuditStatus(101, 100), "on_budget");
    assert.equal(classifyAuditStatus(103, 100), "over");
  });

  it("flags material underdelivery", () => {
    assert.equal(classifyAuditStatus(84, 100), "under");
    assert.equal(classifyAuditStatus(86, 100), "on_budget");
  });
});

describe("buildAuditPeriods", () => {
  it("fills gaps, scales budgets by covered days, and marks the current period", () => {
    const range = { start: "2026-06-01", end: "2026-06-10" };
    const periods = buildAuditPeriods("weekly", range, [
      { periodKey: "2026-06-01", spend: 700, dailyBudget: 100 },
      { periodKey: "2026-06-08", spend: 450, dailyBudget: 100 },
    ]);

    assert.equal(periods.length, 2);
    const [fullWeek, partialWeek] = periods;

    assert.equal(fullWeek.budget, 700, "7 days × $100");
    assert.equal(fullWeek.status, "on_budget");
    assert.equal(fullWeek.isCurrent, false);

    assert.equal(partialWeek.daysCovered, 3);
    assert.equal(partialWeek.budget, 300, "3 synced days × $100");
    assert.equal(partialWeek.variance, 150);
    assert.equal(partialWeek.status, "over");
    assert.equal(partialWeek.isCurrent, true);
  });

  it("emits zero-spend rows for days with no charges", () => {
    const range = { start: "2026-06-08", end: "2026-06-10" };
    const periods = buildAuditPeriods("daily", range, [
      { periodKey: "2026-06-09", spend: 50, dailyBudget: 40 },
    ]);
    assert.equal(periods.length, 3);
    assert.equal(periods[0].spend, 0);
    assert.equal(periods[0].status, "no_budget");
    assert.equal(periods[1].status, "over");
  });
});

describe("buildAuditTotals and buildAuditSentence", () => {
  it("totals budgeted spend separately from unbudgeted charges", () => {
    const range = { start: "2026-06-08", end: "2026-06-10" };
    const periods = buildAuditPeriods("daily", range, [
      { periodKey: "2026-06-08", spend: 90, dailyBudget: 100 },
      { periodKey: "2026-06-09", spend: 110, dailyBudget: 100 },
      { periodKey: "2026-06-10", spend: 25, dailyBudget: 0 },
    ]);
    const totals = buildAuditTotals(periods);

    assert.equal(totals.spend, 225);
    assert.equal(totals.budgetedSpend, 200);
    assert.equal(totals.budget, 200);
    assert.equal(totals.variance, 0);
    assert.equal(totals.overCount, 1);
    assert.equal(totals.noBudgetCount, 1);

    const sentence = buildAuditSentence("daily", totals);
    assert.match(sentence, /\$200 against \$200 budgeted/);
    assert.match(sentence, /3 days/);
    assert.match(sentence, /exactly on budget/);
  });

  it("says when there is nothing to audit against", () => {
    const totals = buildAuditTotals(
      buildAuditPeriods("monthly", { start: "2026-05-01", end: "2026-06-10" }, [
        { periodKey: "2026-05", spend: 500, dailyBudget: 0 },
      ]),
    );
    assert.match(buildAuditSentence("monthly", totals), /no live budgets to audit against/);
  });
});

describe("periodLabel", () => {
  const range = { start: "2025-07-01", end: "2026-06-10" };

  it("labels months with their year", () => {
    assert.equal(periodLabel("monthly", "2026-06", range), "June 2026");
    assert.equal(periodLabel("monthly", "2025-07", range), "July 2025");
  });

  it("labels weeks by their Monday and adds the year only across boundaries", () => {
    assert.equal(periodLabel("weekly", "2026-06-08", range), "Week of Jun 8");
    assert.equal(periodLabel("weekly", "2025-12-29", range), "Week of Dec 29, 2025");
  });

  it("labels days with the weekday", () => {
    assert.equal(periodLabel("daily", "2026-06-10", range), "Wed, Jun 10");
  });
});
