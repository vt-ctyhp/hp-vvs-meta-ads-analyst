export const CAMPAIGN_UMBRELLAS = [
  "Facebook US Product",
  "Book Appts US",
  "US Promotions (WKDS / OOAK)",
  "Cash for Gold US",
  "Facebook VN Product",
  "VN Promotions (WKDS / OOAK)",
  "Excluded / Non-umbrella",
  "Needs review",
] as const;

export type CampaignUmbrella = (typeof CAMPAIGN_UMBRELLAS)[number];
export type CampaignUmbrellaConfidence = "high" | "medium" | "low" | "override";
export type CampaignUmbrellaRegion = "US" | "VN" | "Mixed" | "Unknown";

export type CampaignUmbrellaOverride = {
  umbrella: CampaignUmbrella;
  reason?: string | null;
};

export type CampaignUmbrellaClassification = {
  umbrella: CampaignUmbrella;
  confidence: CampaignUmbrellaConfidence;
  source: "campaign_name" | "ad_set_name" | "inherited" | "override" | "fallback";
  reason: string;
  region: CampaignUmbrellaRegion;
  matchedTerms: string[];
};

type ClassifyInput = {
  campaignName?: string | null;
  adSetName?: string | null;
  adSetNames?: Array<string | null | undefined>;
  inherited?: CampaignUmbrellaClassification | null;
  override?: CampaignUmbrellaOverride | null;
};

const TERM_PATTERNS = {
  excluded:
    /\b(hr|recruitment|employment|job|page\s*likes?|livestream|live\s*stream|event\s*rsvp|increase[_\s-]*followers|instagram\s+account|traffic[_\s-]*igonly|post\s+engagement\s+campaign)\b/i,
  cash: /cash\s*for\s*gold|cashforgold|cash\s*forgold/i,
  book: /book\s*appointment|bookappointment|appointment|calendly|acuity/i,
  promo:
    /promotions?|special\s*promotion|specialpromotion|wkds|weekly\s*(special|diamond)|weeklyspecial|ooak|one\s+of\s+a\s+kind|lunar\s+new\s+year|#promo/i,
  product:
    /evergreen|messages[_\s-]*evergreen|master\s+product|product\s+carousel|product\s+single|topads|januaryposts|marchposts|aprilposts|novemberposts|decemberadposts/i,
  vn: /\b(vn|vietnam|vietnamese|viet|hcm)\b/i,
  us: /\b(us|usa|us\/ca|us&ca|ca|san\s*jose|sanjose|silicon\s*valley|america|english\s+speaker|all\s+us)\b/i,
};

const TERM_LABELS: Array<[keyof typeof TERM_PATTERNS, string]> = [
  ["excluded", "excluded/non-umbrella"],
  ["cash", "cash for gold"],
  ["book", "book appointment"],
  ["promo", "promotion/WKDS/OOAK"],
  ["product", "evergreen/product"],
  ["vn", "VN"],
  ["us", "US"],
];

export function classifyCampaignUmbrella(input: ClassifyInput): CampaignUmbrellaClassification {
  if (input.override) {
    return {
      umbrella: input.override.umbrella,
      confidence: "override",
      source: "override",
      reason: input.override.reason || "Manual campaign umbrella override.",
      region: detectRegion([input.campaignName, input.adSetName, ...(input.adSetNames || [])]),
      matchedTerms: ["manual override"],
    };
  }

  const campaignClassification = classifyText(input.campaignName, "campaign_name");
  if (campaignClassification && campaignClassification.umbrella !== "Needs review") {
    return campaignClassification;
  }

  const inherited = input.inherited;
  const adSetClassification = classifyText(
    [input.adSetName, ...(input.adSetNames || [])].filter(Boolean).join(" "),
    "ad_set_name",
  );

  if (adSetClassification && shouldUseAdSetClassification(adSetClassification, inherited)) {
    return {
      ...adSetClassification,
      confidence: adSetClassification.confidence === "high" ? "medium" : adSetClassification.confidence,
    };
  }

  if (inherited && inherited.umbrella !== "Needs review") {
    return {
      ...inherited,
      source: "inherited",
      reason: `Inherited from campaign umbrella: ${inherited.reason}`,
    };
  }

  return {
    umbrella: "Needs review",
    confidence: "low",
    source: "fallback",
    reason: "No reliable campaign umbrella pattern matched.",
    region: detectRegion([input.campaignName, input.adSetName, ...(input.adSetNames || [])]),
    matchedTerms: [],
  };
}

export function isCampaignUmbrella(value: unknown): value is CampaignUmbrella {
  return typeof value === "string" && CAMPAIGN_UMBRELLAS.includes(value as CampaignUmbrella);
}

function classifyText(
  value: string | null | undefined,
  source: "campaign_name" | "ad_set_name",
): CampaignUmbrellaClassification | null {
  const text = normalize(value);
  if (!text) return null;

  const region = detectRegion([text]);
  const matchedTerms = getMatchedTerms(text);

  if (TERM_PATTERNS.excluded.test(text)) {
    return {
      umbrella: "Excluded / Non-umbrella",
      confidence: "high",
      source,
      reason: "Matched HR, livestream, follower, page-like, or event naming.",
      region,
      matchedTerms,
    };
  }

  if (TERM_PATTERNS.cash.test(text) && region !== "VN") {
    return {
      umbrella: "Cash for Gold US",
      confidence: "high",
      source,
      reason: "Matched Cash for Gold naming.",
      region,
      matchedTerms,
    };
  }

  if (TERM_PATTERNS.book.test(text) && region !== "VN") {
    return {
      umbrella: "Book Appts US",
      confidence: "high",
      source,
      reason: "Matched appointment, Calendly, or Acuity naming.",
      region,
      matchedTerms,
    };
  }

  if (TERM_PATTERNS.promo.test(text)) {
    return {
      umbrella: region === "VN" ? "VN Promotions (WKDS / OOAK)" : "US Promotions (WKDS / OOAK)",
      confidence: region === "Unknown" ? "medium" : "high",
      source,
      reason: "Matched promotion, WKDS, weekly special, or OOAK naming.",
      region,
      matchedTerms,
    };
  }

  if (TERM_PATTERNS.product.test(text)) {
    return {
      umbrella: region === "VN" ? "Facebook VN Product" : "Facebook US Product",
      confidence: region === "Unknown" ? "medium" : "high",
      source,
      reason: "Matched evergreen/product naming.",
      region,
      matchedTerms,
    };
  }

  return null;
}

function shouldUseAdSetClassification(
  adSetClassification: CampaignUmbrellaClassification | null,
  inherited: CampaignUmbrellaClassification | null | undefined,
) {
  if (!adSetClassification) return false;
  if (!inherited || inherited.umbrella === "Needs review") return true;
  if (inherited.umbrella === "Facebook US Product" || inherited.umbrella === "Facebook VN Product") {
    return (
      adSetClassification.umbrella === "Cash for Gold US" ||
      adSetClassification.umbrella === "Book Appts US" ||
      adSetClassification.umbrella === "US Promotions (WKDS / OOAK)" ||
      adSetClassification.umbrella === "VN Promotions (WKDS / OOAK)"
    );
  }
  return false;
}

function detectRegion(values: Array<string | null | undefined>): CampaignUmbrellaRegion {
  const text = normalize(values.filter(Boolean).join(" "));
  const hasVn = TERM_PATTERNS.vn.test(text);
  const hasUs = TERM_PATTERNS.us.test(text);

  if (hasVn && hasUs) return "Mixed";
  if (hasVn) return "VN";
  if (hasUs) return "US";
  return "Unknown";
}

function getMatchedTerms(text: string) {
  return TERM_LABELS
    .filter(([key]) => TERM_PATTERNS[key].test(text))
    .map(([, label]) => label);
}

function normalize(value: string | null | undefined) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
