# AI Reply Suggestions

The inbox reply assistant drafts human-approved customer replies. It never sends a message, approves a send attempt, changes workflow state, or mutates Meta directly.

## Current Flow

1. Sales opens a normalized inbox conversation in `/convert/inbox`.
2. The composer calls `POST /api/social-inbox/suggest-reply` with `conversationId`, optional brand/language, and optional staff guidance.
3. The server verifies `send_inbox_reply`, loads all known authorized conversation history through the normalized conversation model, and builds a verbatim transcript.
4. The server adds only thin business guidance: active prompt profile, disallowed claims, and a few optional training examples. It does not classify the conversation into rigid buckets before prompting.
5. Anthropic receives a structured-output request and returns one editable draft plus internal strategy metadata.
6. The server validates the structured output, stores an audit row in `ai_reply_suggestions`, and returns the draft to the composer.
7. If the human approves/sends that draft, `meta_inbox_send_attempts.ai_reply_suggestion_id` links the final send attempt back to the suggestion.

## Configuration

Reply suggestions stay off until:

- `AI_REPLY_SUGGESTIONS_ENABLED=true`
- `ANTHROPIC_API_KEY` is configured

Optional:

- `ANTHROPIC_REPLY_MODEL` defaults to `claude-sonnet-4-5`
- `ANTHROPIC_REPLY_MAX_TRANSCRIPT_CHARS` defaults to `60000`

## Context Strategy

Default behavior is full known history, verbatim. Most sales conversations are short, so the model sees the actual customer/team turns instead of a summary. If an unusually long transcript exceeds the cap, the server includes the newest verbatim turns and marks the transcript as truncated in `context_used`.

The prompt profile is intentionally small:

- business context
- sales guidance
- tone guidance
- disallowed claims

Examples are optional calibration data, not canned responses. The model still drafts from the full conversation.

## Training Loop

`/convert/inbox/settings` includes Suggested Reply Training:

- edit the active prompt profile for HP/VVS
- answer the training questions directly in business/sales/tone fields
- create synthetic customer conversations
- run a draft test against Anthropic
- save strong synthetic examples with critique and ideal response

Training data lives in:

- `ai_reply_prompt_profiles`
- `ai_reply_training_examples`
- `ai_reply_suggestion_feedback`

Fine-tuning is deferred. Prompt profile plus examples is the current default because it is easier to inspect, edit, and roll back.
