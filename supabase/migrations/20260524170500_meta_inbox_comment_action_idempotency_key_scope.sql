drop index if exists meta_inbox_comment_actions_idempotency_idx;

create unique index if not exists meta_inbox_comment_actions_idempotency_idx
  on public.meta_inbox_comment_actions (
    environment,
    conversation_id,
    idempotency_key
  );

comment on index public.meta_inbox_comment_actions_idempotency_idx is
  'Keeps comment action submit keys unique per conversation so duplicate submits are idempotent and changed payloads cannot reuse a key across action types.';
