import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildExecutiveHeadline,
  type HeadlineInput,
} from "../src/lib/executive-headline.ts";

function base(overrides: Partial<HeadlineInput> = {}): HeadlineInput {
  return {
    spend: { current: 1000, previous: 1000 },
    primaryResults: { current: 50, previous: 50 },
    ...overrides,
  };
}

describe("executive-headline — empty data", () => {
  it("returns no-activity sentence when both spend and results are 0", () => {
    const headline = buildExecutiveHeadline({
      spend: { current: 0, previous: 0 },
      primaryResults: { current: 0, previous: 0 },
    });
    assert.equal(headline.sentence, "No activity in the selected window.");
    assert.equal(headline.tone, "neutral");
  });

  it("returns no-prior-comparison sentence when explicitly flagged", () => {
    const headline = buildExecutiveHeadline({
      ...base({ spend: { current: 500, previous: 0 } }),
      noPriorPeriod: true,
    });
    assert.match(headline.sentence, /no prior data/i);
    assert.equal(headline.tone, "neutral");
  });
});

describe("executive-headline — flat data", () => {
  it("reports flat spend when change is within 3 percent", () => {
    const headline = buildExecutiveHeadline(
      base({
        spend: { current: 1020, previous: 1000 }, // +2 %
        primaryResults: { current: 50, previous: 50 },
      }),
    );
    assert.match(headline.sentence, /Spend is flat/i);
  });

  it("reports flat primary KPI when change is within 3 percent", () => {
    const headline = buildExecutiveHeadline(
      base({
        spend: { current: 1500, previous: 1000 }, // +50 %
        primaryResults: { current: 51, previous: 50 },
      }),
    );
    assert.match(headline.sentence, /Primary KPI count is flat/i);
  });
});

describe("executive-headline — direction + magnitude", () => {
  it("reports spend up vs last week with rounded magnitude", () => {
    const headline = buildExecutiveHeadline(
      base({ spend: { current: 1200, previous: 1000 } }), // +20 %
    );
    assert.match(headline.sentence, /Spend up 20% vs last week\./);
  });

  it("reports spend down vs last week", () => {
    const headline = buildExecutiveHeadline(
      base({ spend: { current: 800, previous: 1000 } }), // -20 %
    );
    assert.match(headline.sentence, /Spend down 20% vs last week\./);
  });

  it("reports primary KPI up", () => {
    const headline = buildExecutiveHeadline(
      base({ primaryResults: { current: 75, previous: 50 } }), // +50 %
    );
    assert.match(headline.sentence, /Primary KPI count up 50%/);
  });

  it("reports primary KPI down", () => {
    const headline = buildExecutiveHeadline(
      base({ primaryResults: { current: 25, previous: 50 } }), // -50 %
    );
    assert.match(headline.sentence, /Primary KPI count down 50%/);
  });
});

describe("executive-headline — tone", () => {
  it("warning when spending more but results dropped", () => {
    const headline = buildExecutiveHeadline({
      spend: { current: 1300, previous: 1000 },
      primaryResults: { current: 30, previous: 50 },
    });
    assert.equal(headline.tone, "warning");
  });

  it("warning when spending less and results dropped (shrinking)", () => {
    const headline = buildExecutiveHeadline({
      spend: { current: 700, previous: 1000 },
      primaryResults: { current: 30, previous: 50 },
    });
    assert.equal(headline.tone, "warning");
  });

  it("positive when results grew without spend growing (efficiency)", () => {
    const headline = buildExecutiveHeadline({
      spend: { current: 1000, previous: 1000 },
      primaryResults: { current: 75, previous: 50 },
    });
    assert.equal(headline.tone, "positive");
  });

  it("neutral when both grew in roughly equal proportion", () => {
    const headline = buildExecutiveHeadline({
      spend: { current: 1300, previous: 1000 },
      primaryResults: { current: 65, previous: 50 },
    });
    assert.equal(headline.tone, "neutral");
  });
});

describe("executive-headline — umbrella attribution clause", () => {
  it("attributes a win to the top umbrella when overall results grew", () => {
    const headline = buildExecutiveHeadline({
      ...base({ primaryResults: { current: 75, previous: 50 } }),
      topUmbrella: { name: "Book Appts US", primaryResultsDelta: 15 },
    });
    assert.match(headline.sentence, /Book Appts US drove most of the win\./);
  });

  it("attributes a slide to the top umbrella when overall results dropped", () => {
    const headline = buildExecutiveHeadline({
      ...base({ primaryResults: { current: 30, previous: 50 } }),
      topUmbrella: { name: "Cash for Gold US", primaryResultsDelta: -10 },
    });
    assert.match(headline.sentence, /Cash for Gold US drove most of the slide\./);
  });

  it("does NOT attribute a slide when overall results actually grew", () => {
    // Don't blame a single umbrella for shrinking when the whole period is growing.
    const headline = buildExecutiveHeadline({
      ...base({ primaryResults: { current: 75, previous: 50 } }),
      topUmbrella: { name: "Some Umbrella", primaryResultsDelta: -5 },
    });
    assert.doesNotMatch(headline.sentence, /drove most of the slide/);
  });

  it("omits the umbrella clause when delta is zero", () => {
    const headline = buildExecutiveHeadline({
      ...base(),
      topUmbrella: { name: "Some Umbrella", primaryResultsDelta: 0 },
    });
    assert.doesNotMatch(headline.sentence, /drove most/);
  });

  it("omits the umbrella clause when umbrella is missing or has no name", () => {
    const headline = buildExecutiveHeadline(base());
    assert.doesNotMatch(headline.sentence, /drove most/);
  });
});

describe("executive-headline — shape contract", () => {
  it("returns a sentence with non-empty string + a valid tone for any sane input", () => {
    const inputs: HeadlineInput[] = [
      base(),
      { spend: { current: 0, previous: 1000 }, primaryResults: { current: 0, previous: 50 } },
      { spend: { current: 1000, previous: 0 }, primaryResults: { current: 50, previous: 0 } },
      { spend: { current: NaN, previous: 1000 }, primaryResults: { current: 50, previous: 50 } },
    ];
    for (const input of inputs) {
      const headline = buildExecutiveHeadline(input);
      assert.ok(typeof headline.sentence === "string" && headline.sentence.length > 0);
      assert.ok(["positive", "warning", "neutral"].includes(headline.tone));
    }
  });
});
