import type { CreativeStatus } from "./creative-score";

// Client-safe constant. Kept out of creative-analysis.ts because that module
// transitively imports server-only code (./meta -> node:async_hooks), which
// cannot be bundled into a "use client" component. The creative-analysis client
// imports this list directly; creative-analysis.ts re-exports it for server callers.
export const CREATIVE_STATUS_OPTIONS: CreativeStatus[] = [
  "Scale Candidate",
  "Needs Hook Improvement",
  "Needs Retention Improvement",
  "Clickbait Risk",
  "Fatigue Watch",
  "Brand Fit Review",
];
