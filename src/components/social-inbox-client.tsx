"use client";

import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Filter,
  Inbox,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";

type PermissionBlock = {
  ok: boolean;
  required: string[];
  missing: string[];
  optionalMissing?: string[];
  warnings?: string[];
};

type AccountStatus = {
  brandCode: string;
  accountId: string;
  ok: boolean;
  name?: string | null;
  accountStatus?: number | null;
  error?: string;
};

type MetaPermissionStatus = {
  granted: string[];
  forbiddenGranted: string[];
  adsSync: PermissionBlock;
  socialInbox: PermissionBlock;
  socialReply: PermissionBlock;
};

export type SocialInboxStatus = {
  ok: boolean;
  missingEnv: string[];
  permissions: MetaPermissionStatus | null;
  accounts: AccountStatus[];
  readiness: {
    adsSync: boolean;
    socialInbox: boolean;
    socialReply: boolean;
  };
  error: string | null;
};

type InboxFilter = "all" | "messages" | "comments" | "unread";

const MOCK_QUEUE: Array<{
  id: string;
  channel: "Facebook" | "Instagram";
  type: "message" | "comment";
  sender: string;
  preview: string;
  status: "Waiting" | "Needs review";
  time: string;
}> = [];

export function SocialInboxClient({ status }: { status: SocialInboxStatus }) {
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [query, setQuery] = useState("");
  const selectedItem = MOCK_QUEUE[0] || null;
  const filteredQueue = useMemo(
    () =>
      MOCK_QUEUE.filter((item) => {
        if (filter === "messages" && item.type !== "message") return false;
        if (filter === "comments" && item.type !== "comment") return false;
        if (filter === "unread" && item.status !== "Waiting") return false;
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) return true;
        return [item.channel, item.type, item.sender, item.preview]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      }),
    [filter, query],
  );

  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-6 text-hp-body md:px-8">
      <header className="mx-auto flex max-w-7xl flex-col gap-5 border-b border-hp-rule pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            HP/VVS Social Inbox
          </span>
          <h1 className="mt-2 font-title text-4xl leading-tight text-hp-ink md:text-5xl">
            Message & Comment Command Center
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em]">
          <StatusPill ready={status.readiness.socialInbox} label="Inbox Read" />
          <StatusPill ready={status.readiness.socialReply} label="Replies" />
        </div>
      </header>

      <section className="mx-auto mt-8 max-w-7xl">
        <MetaReadinessPanel status={status} />
      </section>

      <section className="mx-auto mt-8 grid max-w-7xl min-w-0 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="min-w-0 border border-hp-rule bg-hp-card">
          <div className="border-b border-hp-rule p-4">
            <div className="mb-4 flex items-center gap-2 text-hp-ink">
              <Inbox size={18} />
              <span className="text-[11px] uppercase tracking-[0.14em]">Unified Queue</span>
            </div>

            <label className="flex items-center gap-2 border-b border-hp-rule px-1 py-2 focus-within:border-hp-pink">
              <Search size={15} className="text-hp-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search sender or thread"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-hp-muted"
              />
            </label>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                ["all", "All"],
                ["messages", "Messages"],
                ["comments", "Comments"],
                ["unread", "Unread"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setFilter(value as InboxFilter)}
                  className={`h-9 border px-3 text-[10px] uppercase tracking-[0.14em] transition-colors ${
                    filter === value
                      ? "border-hp-ink bg-hp-ink text-hp-foundation"
                      : "border-hp-rule text-hp-body hover:border-hp-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[720px] overflow-y-auto">
            {filteredQueue.length ? (
              filteredQueue.map((item) => <QueueItem key={item.id} item={item} />)
            ) : (
              <div className="p-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center border border-hp-rule text-hp-muted">
                  <Filter size={18} />
                </div>
                <h2 className="mt-4 font-title text-2xl text-hp-ink">No synced threads yet</h2>
                <p className="mt-2 text-sm leading-6 text-hp-muted">
                  The inbox UI is ready. Message/comment rows will appear here after webhook
                  ingestion and storage are added.
                </p>
              </div>
            )}
          </div>
        </aside>

        <section className="min-w-0 border border-hp-rule bg-hp-card">
          <div className="border-b border-hp-rule p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
                  Conversation Detail
                </span>
                <h2 className="mt-2 font-title text-[34px] leading-tight text-hp-ink">
                  {selectedItem ? selectedItem.sender : "Select a thread"}
                </h2>
              </div>
              <button
                disabled
                title="Webhook sync is not implemented yet"
                className="flex h-10 items-center justify-center gap-2 border border-hp-rule px-4 text-[11px] uppercase tracking-[0.14em] text-hp-muted"
              >
                <RefreshCw size={14} />
                Sync Soon
              </button>
            </div>
          </div>

          <div className="grid min-h-[640px] gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex min-w-0 flex-col border-b border-hp-rule lg:border-b-0 lg:border-r">
              <div className="flex-1 p-6">
                <EmptyThreadState />
              </div>

              <div className="border-t border-hp-rule p-4">
                <textarea
                  disabled
                  rows={4}
                  placeholder="Human-approved reply composer will be enabled after message/comment ingestion and send APIs are wired."
                  className="w-full resize-none border border-hp-rule bg-hp-inset p-3 text-sm leading-6 outline-none placeholder:text-hp-muted disabled:opacity-70"
                />
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-5 text-hp-muted">
                    AI drafts can be inserted here later, but a user must review and click send.
                  </p>
                  <button
                    disabled
                    className="flex h-10 items-center justify-center gap-2 bg-hp-ink px-4 text-[11px] uppercase tracking-[0.14em] text-hp-foundation opacity-50"
                  >
                    <Send size={14} />
                    Send Reply
                  </button>
                </div>
              </div>
            </div>

            <aside className="min-w-0 p-5">
              <div className="border border-hp-rule bg-hp-inset p-4">
                <div className="mb-3 flex items-center gap-2 text-hp-ink">
                  <Sparkles size={17} />
                  <span className="text-[11px] uppercase tracking-[0.14em]">AI Suggestion</span>
                </div>
                <p className="text-sm leading-6 text-hp-muted">
                  Draft generation is intentionally disabled until the selected thread has stored
                  customer context. Suggestions will never send automatically.
                </p>
                <button
                  disabled
                  className="mt-4 flex h-10 w-full items-center justify-center gap-2 border border-hp-rule text-[11px] uppercase tracking-[0.14em] text-hp-muted"
                >
                  <Sparkles size={14} />
                  Suggest Reply
                </button>
              </div>

              <div className="mt-5 border border-hp-rule p-4">
                <div className="mb-3 flex items-center gap-2 text-hp-ink">
                  <ShieldCheck size={17} />
                  <span className="text-[11px] uppercase tracking-[0.14em]">Safety Rules</span>
                </div>
                <ul className="space-y-2 text-sm leading-6 text-hp-muted">
                  <li>No AI auto-send.</li>
                  <li>Human click required for every reply.</li>
                  <li>Campaign/ad mutation remains disabled.</li>
                  <li>
                    {status.readiness.socialReply ? (
                      "Facebook comment replies are permission-ready; send APIs must still enforce human approval."
                    ) : (
                      <>
                        Facebook comment replies remain limited until{" "}
                        <span className="text-hp-ink">pages_manage_engagement</span> is granted.
                      </>
                    )}
                  </li>
                </ul>
              </div>
            </aside>
          </div>
        </section>
      </section>
    </main>
  );
}

function MetaReadinessPanel({ status }: { status: SocialInboxStatus }) {
  const permissions = status.permissions;
  const socialReplyWarnings = permissions?.socialReply.warnings || [];

  return (
    <section className="border border-hp-rule bg-hp-card p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            Meta Integration Status
          </span>
          <h2 className="mt-2 font-title text-[30px] leading-tight text-hp-ink">
            {status.readiness.socialInbox ? "Inbox read access is ready" : "Inbox setup needed"}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-hp-muted">
            This page uses live Meta permission checks. The inbox can read Facebook and Instagram
            message/comment surfaces, while reply actions stay disabled until the backend and final
            permission set are in place.
          </p>
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-3 xl:w-[620px]">
          <ReadinessCard
            title="Ads Sync"
            ready={status.readiness.adsSync}
            detail={status.readiness.adsSync ? "Operational" : "Needs attention"}
          />
          <ReadinessCard
            title="Social Inbox"
            ready={status.readiness.socialInbox}
            detail={status.readiness.socialInbox ? "Read access ready" : "Missing permissions"}
          />
          <ReadinessCard
            title="Replies"
            ready={status.readiness.socialReply}
            detail={status.readiness.socialReply ? "Ready for send APIs" : "Limited"}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="border border-hp-rule bg-hp-inset p-4">
          <div className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            Connected Accounts
          </div>
          <div className="mt-3 space-y-2">
            {status.accounts.length ? (
              status.accounts.map((account) => (
                <div key={account.accountId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-hp-ink">{account.name || account.accountId}</span>
                  <span className={account.ok ? "text-signal-positive" : "text-signal-danger"}>
                    {account.ok ? "Ready" : account.error || "Error"}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-hp-muted">No configured Meta accounts available.</p>
            )}
          </div>
        </div>

        <div className="border border-hp-rule bg-hp-inset p-4">
          <div className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            Remaining Setup
          </div>
          <div className="mt-3 space-y-2 text-sm leading-6">
            {status.error ? <p className="text-signal-danger">{status.error}</p> : null}
            {status.missingEnv.length ? (
              <p className="text-signal-danger">
                Missing env vars: {status.missingEnv.join(", ")}
              </p>
            ) : null}
            {permissions?.forbiddenGranted.length ? (
              <p className="text-signal-danger">
                Forbidden permission granted: {permissions.forbiddenGranted.join(", ")}
              </p>
            ) : null}
            {permissions?.socialReply.missing.length ? (
              <p className="text-signal-warning">
                Missing for Facebook comment replies: {permissions.socialReply.missing.join(", ")}
              </p>
            ) : null}
            {permissions?.adsSync.optionalMissing?.length ? (
              <p className="text-hp-muted">
                Optional ads permission missing: {permissions.adsSync.optionalMissing.join(", ")}
              </p>
            ) : null}
            {socialReplyWarnings.map((warning) => (
              <p key={warning} className="text-hp-muted">
                {warning}
              </p>
            ))}
            {!status.error &&
            !status.missingEnv.length &&
            !permissions?.socialReply.missing.length &&
            !permissions?.forbiddenGranted.length ? (
              <p className="text-signal-positive">All tracked permissions are ready.</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function ReadinessCard({
  title,
  ready,
  detail,
}: {
  title: string;
  ready: boolean;
  detail: string;
}) {
  return (
    <div className="border border-hp-rule bg-hp-inset p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{title}</div>
        {ready ? (
          <CheckCircle2 size={16} className="text-signal-positive" />
        ) : (
          <AlertTriangle size={16} className="text-signal-warning" />
        )}
      </div>
      <div className={`mt-3 text-sm ${ready ? "text-signal-positive" : "text-signal-warning"}`}>
        {detail}
      </div>
    </div>
  );
}

function StatusPill({ ready, label }: { ready: boolean; label: string }) {
  return (
    <div
      className={`flex h-9 items-center gap-2 border px-3 ${
        ready
          ? "border-signal-positive text-signal-positive"
          : "border-signal-warning text-signal-warning"
      }`}
    >
      {ready ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
      {label}
    </div>
  );
}

function QueueItem({
  item,
}: {
  item: {
    channel: "Facebook" | "Instagram";
    type: "message" | "comment";
    sender: string;
    preview: string;
    status: "Waiting" | "Needs review";
    time: string;
  };
}) {
  const Icon = item.channel === "Instagram" ? Camera : MessageCircle;
  return (
    <button className="w-full border-b border-hp-rule p-4 text-left transition-colors hover:bg-hp-inset">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon size={16} className="text-hp-muted" />
          <span className="truncate text-sm text-hp-ink">{item.sender}</span>
        </div>
        <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{item.time}</span>
      </div>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-hp-body">{item.preview}</p>
      <div className="mt-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        <Clock size={13} />
        {item.status}
      </div>
    </button>
  );
}

function EmptyThreadState() {
  return (
    <div className="flex min-h-[420px] items-center justify-center border border-dashed border-hp-rule p-8 text-center">
      <div>
        <div className="mx-auto flex h-14 w-14 items-center justify-center border border-hp-rule text-hp-muted">
          <MessageCircle size={20} />
        </div>
        <h3 className="mt-5 font-title text-3xl text-hp-ink">No conversation selected</h3>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-hp-muted">
          Once webhooks are connected, Facebook and Instagram messages/comments will be normalized
          into the queue. Selecting one will show thread history, customer context, AI draft tools,
          and the human-approved reply composer.
        </p>
      </div>
    </div>
  );
}
