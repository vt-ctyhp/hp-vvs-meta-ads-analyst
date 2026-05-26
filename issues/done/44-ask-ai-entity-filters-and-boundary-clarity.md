---
labels:
  - ready-for-agent
mode: AFK
status: open
---

# feat: safer named-entity filters and unsupported-boundary rewrites

## Parent

Parent PRD: `docs/ask-ai-natural-language-robustness-prd.md`

## What to build

Make Ask AI safer and more useful when prompts mention campaign, ad set, ad, or creative names. Quoted names and explicit "named", "containing", or "includes" language should become governed contains filters. Generic unquoted phrases should not be guessed into filters. Unsupported data mixed with supported metrics should block as a whole and offer a supported rewrite.

## Acceptance criteria

- [ ] "Campaigns containing 'Mother's Day'" creates a governed campaign contains filter.
- [ ] "Creative named 'Appointment offer video'" creates a governed creative contains filter.
- [ ] "What creative should we scale for book appointment ads?" treats book appointment ads as a campaign group filter but does not invent a creative name filter.
- [ ] "Which campaign has best ROAS and spend?" blocks because ROAS requires revenue, and suggests supported Meta Ads rewrites.
- [ ] Unsupported mixed requests do not silently answer only the supported part.
- [ ] Tests cover quoted names, containing/named/includes language, generic unquoted phrases, known campaign group aliases, and mixed unsupported requests.

## Blocked by

- Issue 39 - hybrid governed intent planner for Ask AI.
