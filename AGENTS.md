<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:impeccable-design-context -->
# Design Context

Before any UI work, read [PRODUCT.md](PRODUCT.md) (register, personas, anti-references, principles) and [DESIGN.md](DESIGN.md) (tokens, type, components, do's and don'ts). North Star: *"The Editorial Broadsheet"* — quiet, premium, decisive. Square corners + hairline borders on action elements; pink (`#e91d79`) ≤10% per surface; never `#000`/`#fff`; no sans-serif anywhere. Anti-refs: generic SaaS, cold observability, glassmorphism fintech, Bootstrap admin.
<!-- END:impeccable-design-context -->

<!-- BEGIN:supabase-migration-rules -->
# Supabase Migration Rules

Do not create migration files by hand. Use `npm run db:migration -- <snake_case_name>` so this repo writes timestamp seconds `30`; the shared sales repo uses seconds `00`.

Before finalizing any change that touches `supabase/migrations/`, run `npm run db:migrations:check`. `npm test` and `npm run typecheck` run this check automatically.
<!-- END:supabase-migration-rules -->
