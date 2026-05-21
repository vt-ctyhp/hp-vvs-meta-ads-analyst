import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/v2/optimize/ai-panel.tsx", "utf8");
const analysisRouteSource = readFileSync("src/app/api/analysis/route.ts", "utf8");

test("Optimize AI panel does not embed the legacy analysis page", () => {
  assert.equal(source.includes("AnalysisClient"), false);
  assert.equal(source.includes("CurrentDashboardPanel"), false);
  assert.equal(source.includes("Ad-Hoc AI Analysis"), false);
  assert.equal(source.includes("Edit with GPT"), false);
});

test("Optimize AI panel does not expose report generation", () => {
  assert.equal(source.includes("Generate report"), false);
  assert.equal(source.includes("/api/reports"), false);
  assert.equal(source.includes("ReportOutput"), false);
  assert.equal(source.includes("GeneratedReport"), false);
});

test("Optimize AI saved analyses drawer is collapsed by default", () => {
  assert.match(source, /<details className=/);
  assert.doesNotMatch(source, /<details[^>]*\sopen[=\s>]/);
});

test("saved dashboard loads do not receive Optimize default dates", () => {
  assert.match(
    analysisRouteSource,
    /if \(body\.dashboardId && !body\.prompt\?\.trim\(\)\) \{\s*return Response\.json\(await runSavedAdHocAnalysis\(body\.dashboardId\)\);\s*\}/,
  );
  assert.doesNotMatch(
    analysisRouteSource,
    /runSavedAdHocAnalysis\(body\.dashboardId,\s*body\.defaultDateRange/,
  );
});
