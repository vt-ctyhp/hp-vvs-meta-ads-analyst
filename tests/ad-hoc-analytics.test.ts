import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAnalysisPlanForPrompt,
  normalizeAnalysisSpecForPrompt,
} from "../src/lib/ad-hoc-analytics.ts";

describe("ad-hoc analytics prompt normalization", () => {
  it("repairs saved specs for cash-for-gold message spend tables", () => {
    const spec = normalizeAnalysisSpecForPrompt(
      {
        sort: { field: "date", direction: "asc" },
        grain: "daily",
        limit: 50,
        title: "Ad-hoc analysis",
        filters: [],
        metrics: ["spend"],
        widgets: [
          {
            x: "date",
            type: "table",
            title: "Comparison table",
            metrics: ["spend"],
          },
        ],
        dateRange: { preset: "last_30_days" },
        dimensions: ["date"],
      },
      "Okay, give me the cash for gold ad spend and number of messages by day for the past seven days in table format.",
    );

    assert.deepEqual(spec.dateRange, { preset: "last_7_days" });
    assert.deepEqual(spec.dimensions, ["date"]);
    assert.deepEqual(spec.metrics, ["spend", "messaging_contacts"]);
    assert.deepEqual(spec.filters, [
      { field: "campaign_umbrella", operator: "equals", value: "Cash for Gold US" },
    ]);
    assert.deepEqual(spec.widgets, [
      {
        x: "date",
        type: "table",
        title: "Comparison table",
        metrics: ["spend", "messaging_contacts"],
      },
    ]);
  });

  it("parses non-preset rolling day ranges without model inference", () => {
    const spec = normalizeAnalysisSpecForPrompt(
      {},
      "Show spend and messages by day for the previous ten days in table format.",
    );

    assert.deepEqual(spec.dateRange, { days: 10 });
    assert.deepEqual(spec.metrics, ["spend", "messaging_contacts"]);
    assert.deepEqual(spec.dimensions, ["date"]);
  });

  it("uses the Optimize default date range when the prompt has no date", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "Show spend by campaign umbrella.",
      { defaultDateRange: { days: 14 } },
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(plan.spec.dateRange, { days: 14 });
  });

  it("lets explicit prompt dates override the Optimize default date range", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "Show spend by campaign umbrella for the last 4 weeks.",
      { defaultDateRange: { days: 14 } },
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(plan.spec.dateRange, { preset: "last_4_weeks" });
  });

  it("uses custom Optimize dates as the default analysis range", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "Show spend by campaign umbrella.",
      {
        defaultDateRange: {
          days: 31,
          startDate: "2026-05-01",
          endDate: "2026-05-31",
        },
      },
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(plan.spec.dateRange, {
      preset: "custom",
      start: "2026-05-01",
      end: "2026-05-31",
      days: 31,
    });
  });

  it("normalizes cash-for-gold performance since January 2026", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "performance of Cash for Gold since January 2026",
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(plan.spec.dateRange, { preset: "custom", start: "2026-01-01" });
    assert.deepEqual(plan.spec.filters, [
      { field: "campaign_umbrella", operator: "equals", value: "Cash for Gold US" },
    ]);
  });

  it("normalizes booked appointments by ad creative inside Book Appointments US by day", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "booked appointments by ad creative inside Book Appointments US by day",
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(plan.spec.metrics, ["bookings"]);
    assert.deepEqual(plan.spec.dimensions, ["date", "creative"]);
    assert.deepEqual(plan.spec.filters, [
      { field: "campaign_umbrella", operator: "equals", value: "Book Appts US" },
    ]);
  });

  it("normalizes top ads by messages for cash for gold last 14 days", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "top ads by messages for cash for gold last 14 days",
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(plan.spec.dateRange, { preset: "last_14_days" });
    assert.deepEqual(plan.spec.metrics, ["messaging_contacts"]);
    assert.deepEqual(plan.spec.dimensions, ["ad"]);
    assert.deepEqual(plan.spec.sort, { field: "messaging_contacts", direction: "desc" });
    assert.deepEqual(plan.spec.filters, [
      { field: "campaign_umbrella", operator: "equals", value: "Cash for Gold US" },
    ]);
  });

  it("normalizes creative scaling decisions to creative-level evidence", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "Which ad creative should I scale?",
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(plan.spec.dimensions, ["creative"]);
    assert.deepEqual(plan.spec.metrics, [
      "spend",
      "leads",
      "cpl",
      "primary_results",
      "ctr",
      "frequency",
    ]);
    assert.deepEqual(plan.spec.sort, { field: "leads", direction: "desc" });
    assert.equal(plan.spec.limit, 20);
  });

  it("normalizes unqualified results to primary results for weekly umbrella tables", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "Give me spend by campaign umbrella for the past four weeks, by week, and add in the number of results for each week as well. Also broken out by campaign umbrella.",
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(plan.spec.dateRange, { preset: "last_4_weeks" });
    assert.deepEqual(plan.spec.dimensions, ["week", "campaign_umbrella"]);
    assert.deepEqual(plan.spec.metrics, ["spend", "primary_results"]);
    assert.deepEqual(plan.spec.widgets[1], {
      type: "table",
      title: "Comparison table",
      x: "week",
      metrics: ["spend", "primary_results"],
    });
  });

  it("normalizes primary KPI requests to primary results", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "ad spend and primary kpi by campaign umbrella for the last 4 weeks.",
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(plan.spec.dateRange, { preset: "last_4_weeks" });
    assert.deepEqual(plan.spec.dimensions, ["campaign_umbrella"]);
    assert.deepEqual(plan.spec.metrics, ["spend", "primary_results"]);
    assert.deepEqual(plan.spec.widgets[0], {
      type: "metric",
      title: "Totals",
      metrics: ["spend", "primary_results"],
    });
    assert.deepEqual(plan.spec.widgets[1], {
      type: "table",
      title: "Comparison table",
      x: "campaign_umbrella",
      metrics: ["spend", "primary_results"],
    });
  });

  it("repairs generated widgets that omit a requested primary KPI", () => {
    const spec = normalizeAnalysisSpecForPrompt(
      {
        title: "Ad-hoc analysis",
        dateRange: { preset: "last_4_weeks" },
        grain: "summary",
        dimensions: ["campaign_umbrella"],
        filters: [],
        metrics: ["spend"],
        sort: { field: "spend", direction: "desc" },
        limit: 50,
        widgets: [
          { type: "metric", title: "Spend", metrics: ["spend"] },
          { type: "table", title: "Comparison table", x: "campaign_umbrella", metrics: ["spend"] },
          { type: "bar", title: "Comparison", x: "campaign_umbrella", metrics: ["spend"] },
        ],
      },
      "ad spend and primary KPI by campaign umbrella for the last 4 weeks.",
    );

    assert.deepEqual(spec.metrics, ["spend", "primary_results"]);
    assert.deepEqual(
      spec.widgets.map((widget) => widget.metrics),
      [
        ["spend", "primary_results"],
        ["spend", "primary_results"],
        ["spend", "primary_results"],
      ],
    );
  });

  it("adds primary KPI in follow-up edits without dropping existing spend", () => {
    const plan = buildAnalysisPlanForPrompt(
      {
        title: "Spend by campaign umbrella",
        dateRange: { preset: "last_4_weeks" },
        grain: "summary",
        dimensions: ["campaign_umbrella"],
        filters: [],
        metrics: ["spend"],
        sort: { field: "spend", direction: "desc" },
        limit: 50,
        widgets: [{ type: "table", title: "Comparison table", x: "campaign_umbrella", metrics: ["spend"] }],
      },
      "ad spend by campaign umbrella for the last 4 weeks.\n\nFollow-up: add primary KPI to the table.",
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(plan.spec.metrics, ["spend", "primary_results"]);
    assert.deepEqual(plan.spec.widgets[0]?.metrics, ["spend", "primary_results"]);
  });

  it("treats short additive KPI follow-ups as adding to existing metrics", () => {
    const plan = buildAnalysisPlanForPrompt(
      {
        title: "Spend by campaign umbrella",
        dateRange: { preset: "last_4_weeks" },
        grain: "summary",
        dimensions: ["campaign_umbrella"],
        filters: [],
        metrics: ["spend"],
        sort: { field: "spend", direction: "desc" },
        limit: 50,
        widgets: [{ type: "bar", title: "Comparison", x: "campaign_umbrella", metrics: ["spend"] }],
      },
      "ad spend by campaign umbrella for the last 4 weeks.\n\nFollow-up: And primary KPI too.",
    );

    assert.deepEqual(plan.spec.metrics, ["spend", "primary_results"]);
    assert.deepEqual(plan.spec.widgets[0]?.metrics, ["spend", "primary_results"]);
  });

  it("maps key performance indicator wording to primary results", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "bar chart of spend and primary key performance indicator by campaign umbrella last 30 days",
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(plan.spec.metrics, ["spend", "primary_results"]);
    assert.equal(plan.spec.widgets[0]?.type, "bar");
    assert.deepEqual(plan.spec.widgets[0]?.metrics, ["spend", "primary_results"]);
  });

  it("preserves the campaign umbrella when a follow-up reorganizes the data into a weekly pivot", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "ad spend and primary kpi by campaign umbrella for the last 4 weeks.\n\nFollow-up: reorganize in pivot table with data organized by week for the past 8 weeks",
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(plan.spec.dateRange, { preset: "last_8_weeks" });
    assert.deepEqual(plan.spec.dimensions, ["week", "campaign_umbrella"]);
    assert.deepEqual(plan.spec.metrics, ["spend", "primary_results"]);
    assert.deepEqual(plan.spec.tableLayout, {
      type: "pivot",
      rowDimension: "campaign_umbrella",
      columnDimension: "week",
      metric: "spend",
    });
    assert.deepEqual(plan.spec.widgets, [
      {
        type: "table",
        title: "Pivot table",
        x: "week",
        metrics: ["spend", "primary_results"],
      },
    ]);
  });

  it("repairs weak saved specs when a follow-up requests a weekly pivot on a single newline", () => {
    const spec = normalizeAnalysisSpecForPrompt(
      {
        title: "Ad-hoc analysis",
        dateRange: { preset: "last_4_weeks" },
        grain: "weekly",
        dimensions: ["week"],
        filters: [],
        metrics: ["spend", "primary_results"],
        sort: { field: "week", direction: "asc" },
        limit: 50,
        widgets: [{ type: "table", title: "Comparison table", x: "week", metrics: ["spend", "primary_results"] }],
      },
      "ad spend and primary kpi by campaign umbrella for the last 4 weeks.\nFollow-up: reorganize in pivot table with data organized by week for the past 8 weeks",
    );

    assert.deepEqual(spec.dateRange, { preset: "last_8_weeks" });
    assert.deepEqual(spec.dimensions, ["week", "campaign_umbrella"]);
    assert.deepEqual(spec.tableLayout, {
      type: "pivot",
      rowDimension: "campaign_umbrella",
      columnDimension: "week",
      metric: "spend",
    });
    assert.deepEqual(spec.widgets[0]?.metrics, ["spend", "primary_results"]);
  });

  it("keeps the latest explicit date range when a later pivot orientation edit has no range", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "ad spend and primary kpi by campaign umbrella for the last 4 weeks.\n\nFollow-up: reorganize in pivot table with data organized by week for the past 8 weeks\n\nFollow-up: switch pivot so umbrella campaign is header and column is weeks",
    );

    assert.deepEqual(plan.spec.dateRange, { preset: "last_8_weeks" });
    assert.deepEqual(plan.spec.dimensions, ["week", "campaign_umbrella"]);
    assert.deepEqual(plan.spec.tableLayout, {
      type: "pivot",
      rowDimension: "campaign_umbrella",
      columnDimension: "week",
      metric: "spend",
    });
  });

  it("supports metric subrows under each campaign umbrella with weeks as columns", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      [
        "ad spend and primary kpi by campaign umbrella for the last 4 weeks.",
        "Follow-up: reorganize in pivot table with data organized by week for the past 8 weeks",
        "Follow-up: switch pivot so umbrella campaign is header and column is weeks",
        "Follow-up: it should be campaign umbrella then spend then primary KPI. so that i can easily see spend week over week and KPI week over week. So it should be like: Book Appts US Spend Primary KPI Cash for Gold Spend Primary KPI header row is still weeks",
      ].join("\n\n"),
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(plan.spec.dateRange, { preset: "last_8_weeks" });
    assert.deepEqual(plan.spec.dimensions, ["week", "campaign_umbrella"]);
    assert.deepEqual(plan.spec.filters, []);
    assert.deepEqual(plan.spec.metrics, ["spend", "primary_results"]);
    assert.deepEqual(plan.spec.tableLayout, {
      type: "metric_rows_pivot",
      rowDimension: "campaign_umbrella",
      columnDimension: "week",
      metric: "spend",
    });
    assert.deepEqual(plan.spec.widgets, [
      {
        type: "table",
        title: "Pivot table",
        x: "week",
        metrics: ["spend", "primary_results"],
      },
    ]);
  });

  it("does not ask for an umbrella filter when the user wants all umbrella rows", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "Create a pivot table with campaign umbrella as rows and week as columns for the last 8 weeks. Show spend and primary KPI as metric rows under each umbrella.",
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(plan.spec.dateRange, { preset: "last_8_weeks" });
    assert.deepEqual(plan.spec.dimensions, ["week", "campaign_umbrella"]);
    assert.deepEqual(plan.spec.tableLayout, {
      type: "metric_rows_pivot",
      rowDimension: "campaign_umbrella",
      columnDimension: "week",
      metric: "spend",
    });
    assert.deepEqual(plan.clarificationQuestions, []);
  });

  it("keeps brand and campaign umbrella dimensions for leadership summary tables", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "Build an export-ready summary for leadership: last 30 days by brand and campaign umbrella, with spend, impressions, clicks, CTR, CPC, CPM, and primary KPI. Keep it table-first with a concise takeaway.",
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(plan.spec.dimensions, ["brand", "campaign_umbrella"]);
    assert.deepEqual(plan.spec.widgets[0], {
      type: "table",
      title: "Comparison table",
      x: "brand",
      metrics: ["spend", "impressions", "clicks", "primary_results", "ctr", "cpm"],
    });
  });

  it("keeps ad set detail when the prompt asks for ad sets plus campaign umbrella", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "Show underperforming ad sets for the last 30 days. Rank ad sets by high CPC and low primary KPI. Include spend, clicks, CPC, CTR, primary KPI, and campaign umbrella.",
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(plan.spec.dimensions, ["ad_set", "campaign_umbrella"]);
    assert.deepEqual(plan.spec.metrics, ["spend", "clicks", "primary_results", "ctr", "cpc"]);
  });

  it("does not turn multiple campaign examples into impossible AND filters", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "Show campaign umbrella rows like Book Appts US and Cash for Gold with spend and primary KPI by week.",
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(plan.spec.filters, []);
    assert.deepEqual(plan.spec.dimensions, ["week", "campaign_umbrella"]);
    assert.deepEqual(plan.spec.metrics, ["spend", "primary_results"]);
  });

  it("repairs generated specs with contradictory exact filters on the same field", () => {
    const spec = normalizeAnalysisSpecForPrompt(
      {
        title: "Ad-hoc analysis",
        dateRange: { preset: "last_4_weeks" },
        grain: "weekly",
        dimensions: ["week", "campaign_umbrella"],
        filters: [
          { field: "campaign_umbrella", operator: "equals", value: "Cash for Gold US" },
          { field: "campaign_umbrella", operator: "equals", value: "Book Appts US" },
        ],
        metrics: ["spend", "primary_results"],
        sort: { field: "week", direction: "asc" },
        limit: 50,
        widgets: [{ type: "table", title: "Comparison table", x: "week", metrics: ["spend", "primary_results"] }],
      },
      "Show campaign umbrella rows like Book Appts US and Cash for Gold with spend and primary KPI by week.",
    );

    assert.deepEqual(spec.filters, []);
  });

  it("supports switching pivot orientation with rows and columns wording", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "ad spend and primary kpi by campaign umbrella for the last 4 weeks.\n\nFollow-up: switch pivot so weeks are rows and campaign umbrella is columns",
    );

    assert.deepEqual(plan.spec.dimensions, ["week", "campaign_umbrella"]);
    assert.deepEqual(plan.spec.tableLayout, {
      type: "pivot",
      rowDimension: "week",
      columnDimension: "campaign_umbrella",
      metric: "spend",
    });
  });

  it("marks website visitor requests unsupported instead of falling back to Meta defaults", () => {
    const plan = buildAnalysisPlanForPrompt({}, "website visitors by landing page");

    assert.equal(plan.validationStatus, "unsupported");
    assert.ok(plan.unsupportedReasons.some((reason) => reason.includes("website_events")));
  });

  it("marks landing-page conversion rate requests unsupported", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "Compare Meta ad spend to landing-page conversion rate by campaign for the last 14 days.",
    );

    assert.equal(plan.validationStatus, "unsupported");
    assert.ok(plan.unsupportedReasons.some((reason) => reason.includes("website_events")));
    assert.ok(plan.unsupportedReasons.some((reason) => reason.includes("landing-page conversion rate")));
  });

  it("does not treat sales-team action wording as CRM revenue data", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "For Book Appointments US, show booked appointments by creative over the last 14 days. Include spend, bookings, CPC, CTR, and cost per booking. Tell me which creatives sales should ask marketing to keep pushing.",
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(plan.spec.metrics, ["spend", "bookings", "ctr", "cpc"]);
    assert.deepEqual(plan.spec.dimensions, ["creative"]);
    assert.deepEqual(plan.spec.filters, [
      { field: "campaign_umbrella", operator: "equals", value: "Book Appts US" },
    ]);
    assert.ok(plan.spec.widgets.some((widget) => widget.type === "table"));
  });

  it("marks social inbox employee response requests unsupported", () => {
    const plan = buildAnalysisPlanForPrompt({}, "social inbox response time by employee");

    assert.equal(plan.validationStatus, "unsupported");
    assert.ok(plan.unsupportedReasons.some((reason) => reason.includes("social_inbox")));
  });
});

describe("ad-hoc analytics table and chart capability matrix", () => {
  it("builds a line chart for daily spend and messages", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "make a line chart of spend and messages by day for cash for gold last 14 days",
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(plan.spec.dateRange, { preset: "last_14_days" });
    assert.deepEqual(plan.spec.dimensions, ["date"]);
    assert.deepEqual(plan.spec.metrics, ["spend", "messaging_contacts"]);
    assert.equal(plan.spec.widgets[0]?.type, "line");
    assert.deepEqual(plan.spec.widgets[0]?.metrics, ["spend", "messaging_contacts"]);
  });

  it("builds a bar chart for non-time campaign umbrella comparisons", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "bar chart of leads and cost per lead by campaign umbrella last 30 days",
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(plan.spec.dimensions, ["campaign_umbrella"]);
    assert.deepEqual(plan.spec.metrics, ["leads", "cpl"]);
    assert.equal(plan.spec.widgets[0]?.type, "bar");
    assert.equal(plan.spec.widgets[0]?.x, "campaign_umbrella");
  });

  it("builds a pivot table for monthly umbrella spend", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "pivot spend by campaign umbrella by month since January 2026",
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(plan.spec.dimensions, ["month", "campaign_umbrella"]);
    assert.deepEqual(plan.spec.tableLayout, {
      type: "pivot",
      rowDimension: "campaign_umbrella",
      columnDimension: "month",
      metric: "spend",
    });
    assert.equal(plan.spec.widgets[0]?.type, "table");
  });

  it("builds a lowest-CPL leaderboard by ad set", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "show the 10 lowest cost per lead ad sets for the last 30 days",
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(plan.spec.dimensions, ["ad_set"]);
    assert.deepEqual(plan.spec.metrics, ["cpl"]);
    assert.deepEqual(plan.spec.sort, { field: "cpl", direction: "asc" });
    assert.equal(plan.spec.limit, 10);
  });

  it("keeps total-only prompts as metric cards without tables", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "give me only total spend and messages for cash for gold last 7 days",
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(plan.spec.metrics, ["spend", "messaging_contacts"]);
    assert.deepEqual(plan.spec.dimensions, ["brand"]);
    assert.deepEqual(plan.spec.widgets, [
      {
        type: "metric",
        title: "Totals",
        metrics: ["spend", "messaging_contacts"],
      },
    ]);
  });

  it("defaults non-time comparisons to a bar chart when charts are inferred", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "compare spend, impressions, clicks, ctr, cpc by campaign last 30 days",
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(plan.spec.dimensions, ["campaign"]);
    assert.equal(plan.spec.widgets[2]?.type, "bar");
    assert.equal(plan.spec.widgets[2]?.x, "campaign");
  });

  it("returns both table and chart when the prompt asks for both", () => {
    const plan = buildAnalysisPlanForPrompt(
      {},
      "show spend and results by campaign umbrella for the past four weeks by week as a table and line chart",
    );

    assert.equal(plan.validationStatus, "ready");
    assert.deepEqual(
      plan.spec.widgets.map((widget) => widget.type),
      ["table", "line"],
    );
    assert.deepEqual(plan.spec.metrics, ["spend", "primary_results"]);
  });
});
