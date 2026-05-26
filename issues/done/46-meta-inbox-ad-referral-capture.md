---
labels:
  - ready-for-agent
mode: AFK
status: open
---

# fix: capture click-to-Messenger ad referral and route conversations by real campaign attribution

## Parent

Meta inbox routing. Discovered while triaging conversations that were misrouted to **Book Appointment** (Agnes Alcudia) or **General Inquiry** (Chris Bunoan) even though Meta's own inbox UI shows they "replied to an ad."

## Background

The routing pipeline in `src/lib/meta-inbox-normalization.ts` runs three tiers:

1. **Attribution keyword** (0.85) — searches `firstTouch.ref / adId / campaignId / adsetId / creativeId / referralJson / adsContextDataJson` for queue keywords.
2. **Message-text keyword** (0.60) — falls back to scanning `thread.snippet` + **all message bodies (inbound and outbound)** for queue keywords. The outbound auto-reply contains words like "appointment" and "consultation", so this tier produces false positives.
3. **General Inquiry / Needs Review fallback** (0.35 / 0.15).

Tier 1 never fires for real ad-driven leads because the attribution data is **never captured**:

- The pull-based sync in `src/lib/social-inbox.ts:2645` and `:2695` requests Graph API fields `id,updated_time,message_count,unread_count,participants` and `id,message,created_time,from,to,attachments` — no referral, no `ads_context_data`, no `ad_id`.
- The push-based webhook (`src/app/api/meta/webhook/route.ts` → `ingestMetaWebhookPayload`) only handles `message` and `change` events via `webhookMessageRow` / `webhookCommentRow`. Meta's separate `messaging_referrals` events (and the `referral` block embedded in the first message of a click-to-Messenger conversation) are silently dropped.

Result: `meta_inbox_first_touch_sources.referral_json`, `ad_id`, `ads_context_data_json`, `ref`, `campaign_id`, `adset_id`, `creative_id` stay null. The routing explanation reads `"Matched appointment from message text."` when the truth is "no ad referral was ever captured."

## What to build

### 1. Capture `messaging_referrals` and embedded `message.referral` in the webhook

- Add `webhookReferralRow(object, entry, event)` to `src/lib/meta-webhook-shape.ts`, modeled on `webhookMessageRow`. It produces a `thread` record (same canonical key shape as the message handler) plus a `referral` record carrying `ad_id`, `ref`, `source`, `type`, `ads_context_data`, and the raw event for `raw_payload_json`.
- Update `ingestMetaWebhookPayload` in `src/lib/social-inbox.ts` to dispatch any `entry.messaging[]` event with a top-level `referral` field through `webhookReferralRow`.
- When `webhookMessageRow` runs and `event.message.referral` (or `event.referral`) is present alongside the message body, store the referral in the thread's `raw_json` under the keys `firstTouchFromMessage` already searches (`referral`, `referral.ad_id`, `referral.ref`, `referral.ads_context_data`, `referral.ads_context_data.ad_id/campaign_id/adset_id/creative_id`). Don't invent new key shapes — match the paths already in `meta-inbox-normalization.ts:464-516`.

### 2. Persist the referral so normalization sees it

- Write referral rows into `meta_inbox_first_touch_sources` keyed by `conversation_id`. The table already has every column (`referral_json`, `ad_id`, `ads_context_data_json`, `ref`, `source_post_id`, `campaign_id`, `adset_id`, `creative_id`, `attribution_method`, `attribution_confidence`, `raw_payload_json`). No migration needed.
- If a referral arrives **before** the first inbound message (the common case for click-to-Messenger), buffer it on the thread row (write to `meta_social_threads.raw_json.referral`) so the next normalization pass picks it up. `firstTouchFromMessage` already falls back to `thread.raw_json` when the message has no payload (`meta-inbox-normalization.ts:461`) — preserve that path.

### 3. Resolve `ad_id` → campaign / ad set / creative locally

- After capturing the referral, look up `meta_ads` by `ad_id` for the page's `meta_account_id` and populate `campaign_id`, `ad_set_id`, `creative_id`, `campaign_ref_id`, `ad_set_ref_id` on the `meta_inbox_first_touch_sources` row.
- Run the existing `classifyCampaignUmbrella({ campaignName })` from `src/lib/campaign-umbrellas.ts` against the resolved campaign name and write `campaign_umbrella_id`.
- If `ad_id` doesn't resolve (ad not yet synced or deleted), still keep the referral row — set `attribution_method = "meta_referral"`, `attribution_confidence = 0.95`, and leave campaign / adset / creative null. The next ad sync run should be able to backfill those columns on update.

### 4. Stop scanning outbound auto-replies in the message-keyword fallback

- In `meta-inbox-normalization.ts:175`, change the `textSources` array passed to `inferQueueCategory` to include **only inbound** message bodies, not outbound auto-replies. Keep `thread.snippet` (it represents the latest inbound preview).
- Update the routing explanation copy:
  - Tier 1 (attribution match): unchanged.
  - Tier 2 (inbound-text match): unchanged.
  - Tier 3 fallback when message exists but no ad referral: change to `"No ad referral captured; no locked routing keyword in customer text — routed to General Inquiry."` so the UI reads honest rather than confident.
  - Tier 3 fallback when no text at all: unchanged.

### 5. UI: surface "no ad referral" honestly

- In the conversation details drawer (`src/components/v2/inbox/details-drawer-panel.tsx`), when `attribution_method` is `"none"`, render `FIRST TOUCH → SOURCE` as the source channel (e.g. "Facebook Message — no ad referral") and keep `UMBRELLA / CAMPAIGN / AD SET / AD / CREATIVE / SOURCE POST` as `Not captured` (already correct). When `attribution_method` is `"meta_referral"` but `campaign_id` is still null (ad not synced yet), label it `"Ad linked, campaign resolving..."` instead of `"Not captured"`.

## Acceptance criteria

- [ ] A `messaging_referrals` webhook event for a known `ad_id` populates `meta_inbox_first_touch_sources.ad_id`, `referral_json`, `ads_context_data_json`, `campaign_id`, `ad_set_id`, `creative_id`, `campaign_umbrella_id`, `attribution_method = "meta_referral"`, and `attribution_confidence = 0.95`.
- [ ] A `message` event whose `message.referral.ad_id` is set has the same effect, even when no separate `messaging_referrals` event fires.
- [ ] An ad-driven conversation routes to the queue that matches the campaign umbrella (e.g. cash-for-gold ad → `cash_for_gold` queue), with tier 1 confidence 0.85.
- [ ] A non-ad organic message that contains "appointment" in the *customer's* text still routes to `book_appointment` at 0.60.
- [ ] A non-ad organic message where only the *outbound auto-reply* contains routing keywords routes to `general_inquiry` at 0.35, with explanation `"No ad referral captured; no locked routing keyword in customer text — routed to General Inquiry."`
- [ ] An ad-driven conversation whose `ad_id` doesn't yet exist in `meta_ads` still gets `attribution_method = "meta_referral"` and 0.95 confidence; campaign/adset/creative remain null until the next ad sync.
- [ ] Existing tests under `tests/meta-inbox-normalization.test.ts`, `tests/meta-inbox-workflow.test.ts`, and `tests/permission-routing.test.ts` continue to pass.
- [ ] New tests cover: webhook referral ingestion, embedded-referral ingestion, ad_id → campaign/adset/creative lookup, no-match-ad fallback, inbound-only text scanning, and the updated General Inquiry explanation copy.
- [ ] Historical conversations (Agnes, Chris, etc.) are explicitly out of scope — the Graph API does not expose retroactive referral data. They remain `Not captured` but get the more honest General Inquiry explanation copy.

## Out of scope

- Backfilling referral data for conversations that were ingested before this change ships. Meta does not expose historic `referral` payloads on `/conversations` or `/messages`.
- Adding the `tags` or `shares` Graph API fields — investigated and confirmed irrelevant. `tags` carries Page-admin inbox labels (unused by HP); `shares` carries customer-attached link previews.
- Heuristic matching of customer message text against `meta_creatives.raw_json` ad body copy — customers virtually never quote ad copy back, and the auto-reply contamination (point #4 above) is the actual source of false positives.
- Modifying the polled `/conversations` and `/messages` sync to request referral fields. Public Graph API support for this is undocumented and unreliable; the webhook path is the documented contract.

## Verification

- Unit tests for the new webhook shaper and the ad lookup.
- Replay a real `messaging_referrals` webhook payload (sanitized fixture under `tests/fixtures/`) through `ingestMetaWebhookPayload` and assert the resulting `meta_inbox_first_touch_sources` row.
- Spot-check a live ad-driven conversation in staging after deploy: confirm UMBRELLA / CAMPAIGN / AD SET / AD / CREATIVE / SOURCE POST populate and ROUTING shows 85% with attribution explanation.

## Files likely to change

- `src/lib/meta-webhook-shape.ts` — add `webhookReferralRow`.
- `src/lib/social-inbox.ts` — dispatch referral events; resolve `ad_id` → campaign/adset/creative; write first-touch source rows.
- `src/lib/meta-inbox-normalization.ts` — inbound-only `textSources`; updated fallback explanation copy.
- `src/components/v2/inbox/details-drawer-panel.tsx` — honest "no ad referral" / "campaign resolving" copy.
- `tests/meta-inbox-normalization.test.ts`, `tests/meta-inbox-workflow.test.ts`, plus a new `tests/meta-inbox-webhook-referral.test.ts`.
- `tests/fixtures/meta-webhook-referral.json` — sanitized example payload.
