import assert from "node:assert/strict";
import test from "node:test";

import { runLimitedTasks } from "../src/lib/query-concurrency.ts";

test("runLimitedTasks caps concurrent dashboard data queries", async () => {
  let active = 0;
  let maxActive = 0;

  const tasks = Array.from({ length: 8 }, (_, index) => async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return index;
  });

  const results = await runLimitedTasks(tasks, 3);

  assert.deepEqual(results, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(maxActive, 3);
});
