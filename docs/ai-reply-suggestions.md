# AI Reply Suggestions

The inbox AI reply system is human-approved only. The model can draft a reply, but it must never send, approve, or modify a customer conversation by itself.

## V1 Flow

1. A dashboard user selects a Facebook/Instagram message thread or comment in `/convert/inbox`; a sales user uses `/m/inbox`.
2. The app sends the selected source ID, requested language, brand, and optional staff guidance to `POST /api/social-inbox/suggest-reply`.
3. The server retrieves Supabase context:
   - selected thread/comment
   - recent message history
   - active brand voice prompt by brand and language
   - existing thread summary when available
   - matching playbook entries when available
4. The server calls OpenAI with compact context and asks for one editable draft.
5. The draft is saved to `ai_reply_suggestions` and inserted into the disabled-send composer for human review.

## Language Handling

The API accepts `auto`, `en`, or `vi`.

- `auto` detects Vietnamese from the latest customer message and recent thread history.
- `en` uses the English Hung Phat trusted-jeweler voice.
- `vi` uses the Vietnamese Southern, respectful, role-aware voice with `Dạ`, `ạ`, and safe default pronouns.

Each language has a compact runtime prompt in `brand_voice_guidelines`. The full guideline is stored for governance, while the runtime prompt is optimized for token use.

## Token Strategy

The OpenAI call does not receive the whole database. Supabase retrieval is done by the app server, then only useful context is sent:

- current customer message
- customer name when known
- last 16 messages, clipped per message
- stored thread summary or a lightweight heuristic summary for older messages
- top matching playbook entries
- compact brand voice prompt

Static instructions are placed before dynamic thread data so prompt caching can help with repeated drafts.

## Future Approved-Examples Loop

V1 creates the tables needed for the learning loop, but does not require approved examples yet.

Recommended next phase:

1. Track whether a generated draft was inserted, edited, approved, sent, or discarded.
2. Store the final human-edited version alongside the original draft.
3. Add approved examples to `reply_playbook_entries` or a dedicated examples table by category:
   - appointment booking
   - price inquiry
   - custom jewelry
   - cash for gold
   - product availability
   - hesitant client follow-up
4. Retrieve only the most relevant examples for each draft.
5. Run periodic review to remove weak examples and promote strong ones into playbook guidance.

Fine-tuning should wait until there is enough high-quality approved reply data. Prompting plus Supabase retrieval is the V1 default.
