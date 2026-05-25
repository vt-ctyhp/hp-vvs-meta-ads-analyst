import {
  META_INBOX_CONVERSATION_STATUSES,
  META_INBOX_QUEUE_CATEGORIES,
  META_INBOX_SOURCE_CHANNELS,
  type MetaInboxVocabularyOption,
} from "@/lib/meta-inbox-vocabulary";
import { requirePagePermission } from "@/lib/server-route-auth";

export const dynamic = "force-dynamic";

export default async function InboxSettingsPage() {
  await requirePagePermission("view_inbox", "/convert/inbox/settings");

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-hp-rule pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            Inbox Settings
          </p>
          <h1 className="mt-2 font-title text-3xl leading-tight text-hp-ink md:text-4xl">
            Team Queue Foundation
          </h1>
        </div>
        <a
          href="/convert/inbox"
          className="inline-flex h-10 items-center justify-center border border-hp-rule px-4 text-sm font-medium text-hp-ink transition hover:border-hp-pink hover:text-hp-pink"
        >
          Inbox
        </a>
      </header>

      <section className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
        <VocabularyPanel
          title="Queue Categories"
          eyebrow="Routing"
          options={META_INBOX_QUEUE_CATEGORIES}
          columns="md:grid-cols-2"
        />
        <div className="space-y-4">
          <SummaryTile label="Starter queues" value={META_INBOX_QUEUE_CATEGORIES.length} />
          <SummaryTile label="Source filters" value={META_INBOX_SOURCE_CHANNELS.length} />
          <SummaryTile label="Conversation states" value={META_INBOX_CONVERSATION_STATUSES.length} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <VocabularyPanel
          title="Source Channels"
          eyebrow="Filters"
          options={META_INBOX_SOURCE_CHANNELS}
        />
        <VocabularyPanel
          title="Conversation Status"
          eyebrow="State"
          options={META_INBOX_CONVERSATION_STATUSES}
        />
      </section>
    </div>
  );
}

function VocabularyPanel({
  title,
  eyebrow,
  options,
  columns = "sm:grid-cols-2",
}: {
  title: string;
  eyebrow: string;
  options: readonly MetaInboxVocabularyOption[];
  columns?: string;
}) {
  return (
    <section className="border border-hp-rule bg-hp-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-hp-ink">{title}</h2>
        </div>
        <span className="text-sm text-hp-muted">{options.length}</span>
      </div>
      <div className={`grid gap-3 ${columns}`}>
        {options.map((option) => (
          <article key={option.key} className="border border-hp-rule bg-hp-foundation p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-hp-ink">{option.label}</h3>
              <code className="shrink-0 text-[10px] text-hp-muted">{option.key}</code>
            </div>
            <p className="mt-2 text-sm leading-6 text-hp-muted">{option.description}</p>
            {option.example ? (
              <p className="mt-3 border-t border-hp-rule pt-3 text-xs leading-5 text-hp-body">
                {option.example}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-hp-rule bg-hp-card p-5">
      <p className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">{label}</p>
      <p className="mt-3 font-title text-4xl text-hp-ink">{value}</p>
    </div>
  );
}
