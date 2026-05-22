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

import { SYNC, translateError } from "@/lib/glossary";
import { inferSocialBrand, type BrandLabel } from "@/lib/social-brand";
import { StatusSentence, type StatusHighlight } from "./status-sentence";
import type {
  SocialInboxComment,
  SocialInboxData,
  SocialInboxMessage,
} from "@/lib/social-inbox";

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

type BrandFilter = "all" | "HP" | "VVS";
type SourceFilter = "all" | "facebook" | "instagram";
type ItemTypeFilter = "all" | "messages" | "comments";
type StatusFilter = "all" | "unread" | "needs-reply";
type ReplyLanguage = "auto" | "en" | "vi";

type QueueDisplayItem = {
  id: string;
  sourceId: string;
  channel: "Facebook" | "Instagram";
  platform: "facebook" | "instagram";
  brand: BrandLabel;
  type: "message" | "comment";
  sender: string;
  preview: string;
  status: "Synced" | "Unread" | "Needs reply";
  time: string;
  timestamp: string | null;
};

type SyncResponse = {
  status?: string;
  metrics?: {
    pages?: number;
    threads?: number;
    messages?: number;
    comments?: number;
  };
  errors?: string[];
  error?: string;
};

type SuggestReplyResponse = {
  suggestionId?: string;
  draft?: string;
  language?: "en" | "vi";
  model?: string;
  toneNotes?: string[];
  contextUsed?: {
    brand: BrandLabel;
    sourceType: "message" | "comment";
    platform: "facebook" | "instagram";
    messageCount: number;
    includedMessages: number;
    omittedMessages: number;
    usedThreadSummary: boolean;
    playbookEntries: number;
    brandVoiceVersion: number | null;
    customerName: string | null;
  };
  error?: string;
};

export function SocialInboxClient({
  status,
  initialData,
  dataError,
}: {
  status: SocialInboxStatus;
  initialData: SocialInboxData;
  dataError: string | null;
}) {
  const [brandFilter, setBrandFilter] = useState<BrandFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [itemTypeFilter, setItemTypeFilter] = useState<ItemTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [inboxData, setInboxData] = useState(initialData);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(dataError);
  const [replyLanguage, setReplyLanguage] = useState<ReplyLanguage>("auto");
  const [replyContextId, setReplyContextId] = useState<string | null>(null);
  const [replyInstruction, setReplyInstruction] = useState("");
  const [replyDraft, setReplyDraft] = useState("");
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestionStatus, setSuggestionStatus] = useState<string | null>(null);
  const [suggestionMeta, setSuggestionMeta] = useState<SuggestReplyResponse | null>(null);

  const queue = useMemo(() => buildQueue(inboxData), [inboxData]);

  const inboxHighlights = useMemo<StatusHighlight[]>(() => {
    if (queue.length === 0) {
      return [{ text: "Inbox is empty for the current connection" }];
    }
    const unread = queue.filter((item) => item.status === "Unread").length;
    const needsReply = queue.filter((item) => item.status === "Needs reply").length;
    const highlights: StatusHighlight[] = [];
    if (unread > 0) {
      highlights.push({ text: `${unread} unread`, tone: "warning" });
    }
    if (needsReply > 0) {
      highlights.push({ text: `${needsReply} needing reply`, tone: "warning" });
    }
    if (highlights.length === 0) {
      highlights.push({
        text: `${queue.length} threads, all caught up`,
        tone: "positive",
      });
    }
    return highlights;
  }, [queue]);
  const filteredQueue = useMemo(
    () =>
      queue.filter((item) => {
        if (brandFilter !== "all" && item.brand !== brandFilter) return false;
        if (sourceFilter !== "all" && item.platform !== sourceFilter) return false;
        if (itemTypeFilter === "messages" && item.type !== "message") return false;
        if (itemTypeFilter === "comments" && item.type !== "comment") return false;
        if (statusFilter === "unread" && item.status !== "Unread") return false;
        if (statusFilter === "needs-reply" && item.status !== "Needs reply") return false;

        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) return true;
        return [item.brand, item.channel, item.type, item.status, item.sender, item.preview]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      }),
    [brandFilter, itemTypeFilter, query, queue, sourceFilter, statusFilter],
  );
  const selectedItem =
    filteredQueue.find((item) => item.id === selectedId) || filteredQueue[0] || null;
  const selectedMessages = useMemo(
    () =>
      selectedItem?.type === "message"
        ? inboxData.messages
            .filter(
              (message) =>
                message.platform === selectedItem.platform &&
                message.thread_id === selectedItem.sourceId,
            )
            .sort((a, b) => String(a.sent_at || "").localeCompare(String(b.sent_at || "")))
        : [],
    [inboxData.messages, selectedItem],
  );
  const selectedComment =
    selectedItem?.type === "comment"
      ? inboxData.comments.find((comment) => comment.comment_id === selectedItem.sourceId) || null
      : null;
  const selectedContextId = selectedItem?.id || null;
  const isReplyContextActive = replyContextId === selectedContextId;
  const activeReplyDraft = isReplyContextActive ? replyDraft : "";
  const activeReplyInstruction = isReplyContextActive ? replyInstruction : "";
  const activeSuggestionStatus = isReplyContextActive ? suggestionStatus : null;
  const activeSuggestionMeta = isReplyContextActive ? suggestionMeta : null;

  async function handleSync() {
    setIsSyncing(true);
    setSyncStatus("Syncing recent Meta inbox data...");

    try {
      const syncResponse = await fetch("/api/social-inbox/sync", { method: "POST" });
      const syncPayload = (await syncResponse.json()) as SyncResponse;
      if (!syncResponse.ok) {
        throw new Error(syncPayload.error || "Inbox sync failed.");
      }

      const dataResponse = await fetch("/api/social-inbox", { cache: "no-store" });
      const freshData = (await dataResponse.json()) as SocialInboxData | { error: string };
      if (!dataResponse.ok || isErrorPayload(freshData)) {
        throw new Error(isErrorPayload(freshData) ? freshData.error : "Could not refresh inbox data.");
      }

      setInboxData(freshData);
      const metrics = syncPayload.metrics || {};
      const errorNote = syncPayload.errors?.length
        ? ` ${syncPayload.errors.length} source warning(s); first: ${syncPayload.errors[0]}`
        : "";
      setSyncStatus(
        `Sync ${syncPayload.status || "complete"}: ${metrics.threads || 0} threads, ${
          metrics.messages || 0
        } messages, ${metrics.comments || 0} comments.${errorNote}`,
      );
    } catch (error) {
      setSyncStatus(translateError(error));
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleSuggestReply() {
    if (!selectedItem) return;
    const instruction = isReplyContextActive ? replyInstruction : "";
    setReplyContextId(selectedItem.id);
    setIsSuggesting(true);
    setSuggestionStatus("Drafting a human-approved reply...");
    setSuggestionMeta(null);

    try {
      const response = await fetch("/api/social-inbox/suggest-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: selectedItem.platform,
          sourceType: selectedItem.type,
          sourceId: selectedItem.sourceId,
          brand: selectedItem.brand,
          language: replyLanguage,
          instruction,
        }),
      });
      const payload = (await response.json()) as SuggestReplyResponse;
      if (!response.ok) {
        throw new Error(payload.error || "Could not generate a reply draft.");
      }

      setReplyDraft(payload.draft || "");
      setSuggestionMeta(payload);
      setSuggestionStatus(
        `Draft ready in ${payload.language === "vi" ? "Vietnamese" : "English"}. Review before sending.`,
      );
    } catch (error) {
      setSuggestionStatus(translateError(error, "Couldn't generate a reply draft."));
    } finally {
      setIsSuggesting(false);
    }
  }

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
          <StatusSentence
            context={`${queue.length} ${queue.length === 1 ? "thread" : "threads"} synced`}
            highlights={inboxHighlights}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em]">
          <StatusPill ready={status.readiness.socialInbox} label="Inbox Read" />
          <StatusPill ready={status.readiness.socialReply} label="Replies" />
        </div>
      </header>

      <InboxReadinessBanner status={status} />

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

            <div className="mt-4 grid gap-3">
              <FilterSelect
                label="Brand"
                value={brandFilter}
                onChange={(value) => setBrandFilter(value as BrandFilter)}
                options={[
                  ["all", "All Brands"],
                  ["HP", "HP"],
                  ["VVS", "VVS"],
                ]}
              />
              <FilterSelect
                label="Source"
                value={sourceFilter}
                onChange={(value) => setSourceFilter(value as SourceFilter)}
                options={[
                  ["all", "Facebook + Instagram"],
                  ["facebook", "Facebook"],
                  ["instagram", "Instagram"],
                ]}
              />
              <div className="grid grid-cols-2 gap-3">
                <FilterSelect
                  label="Type"
                  value={itemTypeFilter}
                  onChange={(value) => setItemTypeFilter(value as ItemTypeFilter)}
                  options={[
                    ["all", "All Items"],
                    ["messages", "Messages"],
                    ["comments", "Comments"],
                  ]}
                />
                <FilterSelect
                  label="Status"
                  value={statusFilter}
                  onChange={(value) => setStatusFilter(value as StatusFilter)}
                  options={[
                    ["all", "All Status"],
                    ["unread", "Unread"],
                    ["needs-reply", "Needs Reply"],
                  ]}
                />
              </div>
              <div className="flex items-center justify-between border-t border-hp-rule pt-3 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                <span>{filteredQueue.length} shown</span>
                <button
                  onClick={() => {
                    setBrandFilter("all");
                    setSourceFilter("all");
                    setItemTypeFilter("all");
                    setStatusFilter("all");
                    setQuery("");
                  }}
                  className="text-hp-ink underline-offset-4 hover:underline"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

          <div className="max-h-[720px] overflow-y-auto">
            {filteredQueue.length ? (
              filteredQueue.map((item) => (
                <QueueItem
                  key={item.id}
                  item={item}
                  active={selectedItem?.id === item.id}
                  onSelect={() => setSelectedId(item.id)}
                />
              ))
            ) : (
              <div className="p-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center border border-hp-rule text-hp-muted">
                  <Filter size={18} />
                </div>
                <h2 className="mt-4 font-title text-2xl text-hp-ink">No matching items</h2>
                <p className="mt-2 text-sm leading-6 text-hp-muted">
                  Adjust the source, brand, type, status, or search filters to widen the queue.
                  Use Sync Inbox if you need the latest Meta data.
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
                {syncStatus ? (
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-hp-muted">{syncStatus}</p>
                ) : null}
              </div>
              <button
                disabled={!status.readiness.socialInbox || isSyncing}
                onClick={handleSync}
                className="flex h-10 items-center justify-center gap-2 border border-hp-ink px-4 text-[11px] uppercase tracking-[0.14em] text-hp-ink transition-colors hover:bg-hp-ink hover:text-hp-foundation disabled:border-hp-rule disabled:text-hp-muted"
              >
                <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
                {isSyncing ? SYNC.inProgress : `${SYNC.action} Inbox`}
              </button>
            </div>
          </div>

          <div className="grid min-h-[640px] gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex min-w-0 flex-col border-b border-hp-rule lg:border-b-0 lg:border-r">
              <div className="flex-1 p-6">
                {selectedItem ? (
                  <SelectedItemDetail
                    item={selectedItem}
                    messages={selectedMessages}
                    comment={selectedComment}
                  />
                ) : (
                  <EmptyThreadState />
                )}
              </div>

              <div className="border-t border-hp-rule p-4">
                <textarea
                  value={activeReplyDraft}
                  onChange={(event) => {
                    setReplyContextId(selectedContextId);
                    setReplyDraft(event.target.value);
                  }}
                  disabled={!selectedItem}
                  rows={4}
                  placeholder={
                    selectedItem
                      ? "Generate an AI draft, then edit it here before sending is enabled."
                      : "Select a message or comment to draft a reply."
                  }
                  className="w-full resize-none border border-hp-rule bg-hp-inset p-3 text-sm leading-6 outline-none placeholder:text-hp-muted focus:border-hp-ink disabled:opacity-70"
                />
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-5 text-hp-muted">
                    AI drafts are editable only. A human must review and click send when send APIs
                    are enabled.
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
                <div className="grid gap-3">
                  <FilterSelect
                    label="Draft Language"
                    value={replyLanguage}
                    onChange={(value) => setReplyLanguage(value as ReplyLanguage)}
                    options={[
                      ["auto", "Auto Detect"],
                      ["en", "English"],
                      ["vi", "Vietnamese"],
                    ]}
                  />
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                      Staff Guidance
                    </span>
                    <textarea
                      value={activeReplyInstruction}
                      onChange={(event) => {
                        setReplyContextId(selectedContextId);
                        setReplyInstruction(event.target.value);
                      }}
                      rows={3}
                      placeholder="Optional: add price, appointment, sizing, or tone guidance."
                      className="w-full resize-none border border-hp-rule bg-hp-foundation p-3 text-sm leading-5 text-hp-body outline-none placeholder:text-hp-muted focus:border-hp-ink"
                    />
                  </label>
                </div>
                <button
                  disabled={!selectedItem || isSuggesting}
                  onClick={handleSuggestReply}
                  className="mt-4 flex h-10 w-full items-center justify-center gap-2 border border-hp-ink text-[11px] uppercase tracking-[0.14em] text-hp-ink transition-colors hover:bg-hp-ink hover:text-hp-foundation disabled:border-hp-rule disabled:text-hp-muted disabled:hover:bg-transparent disabled:hover:text-hp-muted"
                >
                  <Sparkles size={14} className={isSuggesting ? "animate-pulse" : ""} />
                  {isSuggesting ? "Drafting" : "Suggest Reply"}
                </button>
                {activeSuggestionStatus ? (
                  <p className="mt-3 text-sm leading-6 text-hp-muted">{activeSuggestionStatus}</p>
                ) : null}
                {activeSuggestionMeta?.contextUsed ? (
                  <div className="mt-4 border-t border-hp-rule pt-3 text-xs leading-5 text-hp-muted">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-hp-ink">
                      Context Used
                    </p>
                    <p>
                      {activeSuggestionMeta.contextUsed.includedMessages} of{" "}
                      {activeSuggestionMeta.contextUsed.messageCount} messages ·{" "}
                      {activeSuggestionMeta.contextUsed.playbookEntries} playbook notes · Voice v
                      {activeSuggestionMeta.contextUsed.brandVoiceVersion || "fallback"}
                    </p>
                    {activeSuggestionMeta.toneNotes?.length ? (
                      <p className="mt-2">{activeSuggestionMeta.toneNotes.slice(0, 2).join(" ")}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <SyncRunPanel data={inboxData} />

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

function buildQueue(data: SocialInboxData): QueueDisplayItem[] {
  const threadItems = data.threads.map((thread) => {
    const channel: "Instagram" | "Facebook" =
      thread.platform === "instagram" ? "Instagram" : "Facebook";
    return {
      id: `thread:${thread.platform}:${thread.thread_id}`,
      sourceId: thread.thread_id,
      channel,
      platform: thread.platform,
      brand: inferSocialBrand(thread.page_id, thread.ig_user_id),
      type: "message" as const,
      sender: thread.participant_name || `${channel} Conversation`,
      preview: thread.snippet || `${thread.message_count} synced message(s)`,
      status: thread.unread_count > 0 ? "Unread" as const : "Synced" as const,
      time: formatDateLabel(thread.last_message_at || thread.last_synced_at),
      timestamp: thread.last_message_at || thread.last_synced_at,
    };
  });

  const commentItems = data.comments.map((comment) => {
    const channel: "Instagram" | "Facebook" =
      comment.platform === "instagram" ? "Instagram" : "Facebook";
    return {
      id: `comment:${comment.platform}:${comment.comment_id}`,
      sourceId: comment.comment_id,
      channel,
      platform: comment.platform,
      brand: inferSocialBrand(comment.page_id, comment.ig_user_id),
      type: "comment" as const,
      sender: comment.author_name || `${channel} Comment`,
      preview: comment.body || "Comment text unavailable",
      status: "Needs reply" as const,
      time: formatDateLabel(comment.created_time || comment.last_synced_at),
      timestamp: comment.created_time || comment.last_synced_at,
    };
  });

  return [...threadItems, ...commentItems].sort((a, b) =>
    String(b.timestamp || "").localeCompare(String(a.timestamp || "")),
  );
}

function SelectedItemDetail({
  item,
  messages,
  comment,
}: {
  item: QueueDisplayItem;
  messages: SocialInboxMessage[];
  comment: SocialInboxComment | null;
}) {
  if (item.type === "comment") {
    return (
      <div className="max-h-[560px] min-h-[420px] overflow-y-auto border border-hp-rule p-5">
        <div className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
          <Camera size={15} />
          {item.brand} · {item.channel} Comment
        </div>
        <p className="whitespace-pre-wrap break-words text-lg leading-8 text-hp-ink">
          {comment?.body || item.preview}
        </p>
        <div className="mt-5 grid gap-3 border-t border-hp-rule pt-4 text-sm text-hp-muted sm:grid-cols-2">
          <div>Author: {comment?.author_name || item.sender}</div>
          <div>Created: {formatDateLabel(comment?.created_time || item.timestamp)}</div>
          <div>Likes: {comment?.like_count || 0}</div>
          <div>Replies: {comment?.reply_count || 0}</div>
        </div>
        {comment?.content_permalink ? (
          <a
            href={comment.content_permalink}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex border border-hp-rule px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-hp-ink hover:bg-hp-inset"
          >
            Open on Meta
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="max-h-[560px] min-h-[420px] overflow-y-auto border border-dashed border-hp-rule p-5">
      {messages.length ? (
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[82%] border p-4 ${
                message.direction === "outbound"
                  ? "ml-auto border-hp-ink bg-hp-ink text-hp-foundation"
                  : "border-hp-rule bg-hp-inset text-hp-body"
              }`}
            >
              <div className="mb-2 text-[10px] uppercase tracking-[0.14em] opacity-70">
                {message.sender_name || message.direction} · {formatDateLabel(message.sent_at)}
              </div>
              <p className="whitespace-pre-wrap break-words text-sm leading-6">
                {message.body || "Attachment or unsupported message"}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex min-h-[360px] items-center justify-center text-center">
          <div>
            <div className="mx-auto flex h-14 w-14 items-center justify-center border border-hp-rule text-hp-muted">
              <MessageCircle size={20} />
            </div>
            <h3 className="mt-5 font-title text-3xl text-hp-ink">Thread detected</h3>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-hp-muted">
              Meta returned this conversation thread. If message bodies are blank after sync, the
              next step is webhook delivery, which receives new messages as they arrive.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function SyncRunPanel({ data }: { data: SocialInboxData }) {
  const lastRun = data.syncRuns[0] || null;

  return (
    <div className="mt-5 border border-hp-rule p-4">
      <div className="mb-3 flex items-center gap-2 text-hp-ink">
        <RefreshCw size={17} />
        <span className="text-[11px] uppercase tracking-[0.14em]">Last Sync</span>
      </div>
      {lastRun ? (
        <div className="space-y-2 text-sm leading-6 text-hp-muted">
          <p className="text-hp-ink">{lastRun.status}</p>
          <p>{formatDateLabel(lastRun.completed_at || lastRun.started_at)}</p>
          <p>
            {Number(lastRun.metrics.threads || 0)} threads ·{" "}
            {Number(lastRun.metrics.messages || 0)} messages ·{" "}
            {Number(lastRun.metrics.comments || 0)} comments
          </p>
          {lastRun.errors.length ? (
            <p className="text-signal-warning">{String(lastRun.errors[0])}</p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm leading-6 text-hp-muted">No inbox sync has run yet.</p>
      )}
    </div>
  );
}

function InboxReadinessBanner({ status }: { status: SocialInboxStatus }) {
  const [open, setOpen] = useState(false);
  const ready = status.readiness.socialInbox;
  const hasError = Boolean(status.error || status.missingEnv.length);
  const replyMissing = status.permissions?.socialReply.missing.length ?? 0;
  const showBanner = !ready || hasError || replyMissing > 0;

  if (!showBanner) return null;

  const headline = !ready
    ? "Inbox can't read Meta messages"
    : hasError
      ? "Inbox connection issue"
      : `${replyMissing} permission${replyMissing === 1 ? "" : "s"} missing for replies`;

  return (
    <section className="mx-auto mt-4 max-w-7xl">
      <div className="border-l-[3px] border-l-[#8B5B19] bg-hp-card">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="text-[11px] uppercase tracking-[0.14em] text-[#8B5B19]">
            {ready && !hasError ? "Heads up" : "Action needed"}
          </span>
          <span className="flex-1 text-sm text-hp-ink">{headline}</span>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="text-[10px] uppercase tracking-[0.14em] text-hp-muted transition-colors duration-150 hover:text-hp-ink"
          >
            {open ? "Hide details" : "Show details"}
          </button>
        </div>
        {open ? (
          <div className="border-t border-hp-rule p-5">
            <MetaReadinessPanel status={status} />
          </div>
        ) : null}
      </div>
    </section>
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
                <div
                  key={account.accountId}
                  className="flex items-center justify-between gap-3 text-sm"
                >
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

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full border border-hp-rule bg-hp-foundation px-3 text-sm text-hp-ink outline-none transition-colors focus:border-hp-ink"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function QueueItem({
  item,
  active,
  onSelect,
}: {
  item: QueueDisplayItem;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = item.channel === "Instagram" ? Camera : MessageCircle;
  return (
    <button
      onClick={onSelect}
      className={`w-full border-b border-hp-rule p-4 text-left transition-colors hover:bg-hp-inset ${
        active ? "bg-hp-inset" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <Icon size={16} className="mt-0.5 shrink-0 text-hp-muted" />
          <span className="min-w-0 break-words text-sm leading-5 text-hp-ink">{item.sender}</span>
        </div>
        <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
          {item.time}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-hp-body">{item.preview}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        <Clock size={13} />
        {item.brand} · {item.channel} · {item.type} · {item.status}
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
          Click Sync Inbox to pull the latest available Meta threads/comments, then select an item
          from the queue.
        </p>
      </div>
    </div>
  );
}

function formatDateLabel(value: string | null | undefined) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function isErrorPayload(value: SocialInboxData | { error: string }): value is { error: string } {
  return "error" in value;
}
