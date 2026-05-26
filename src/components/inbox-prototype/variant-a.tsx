"use client";

// PROTOTYPE — Variant A: "The Replier" (full feature surface).
// Two-pane shell. Left = queue rail (search, queue-category dropdown,
// filter disclosure, list with per-row category tag). Right = conversation
// surface (reply-window state, presence, routing explanation, history
// pagination, thread with attachments, composer with two-tap confirm,
// saved replies and send-attempts history, OR public-comment moderation
// when the item is a comment). Four drawer overlays slide in from the
// right: Disposition (Customer + Workflow), Audit, Notes, QA.

import { useMemo, useState } from "react";

import {
  LEAD_QUALITY_LABELS,
  OUTCOME_LABELS,
  QUEUE_CATEGORIES,
  REASON_TAGS,
  SEED_CONVERSATIONS,
  SEED_LAST_SYNC,
  SEED_SAVED_REPLIES,
  SEED_TEAM_METRICS,
  SOURCE_CHANNELS,
  STATUS_LABELS,
  fmtAge,
  fmtBytes,
  itemBadge,
  platformOf,
  type SeedAttachment,
  type SeedConversation,
  type SeedMessage,
  type SeedQueueCategory,
  type SeedSendAttempt,
  type SeedSourceChannel,
} from "./seed";

type StatusFilter = "all" | "unread" | "needs_reply";
type ItemTypeFilter = "all" | "messages" | "comments";
type DrawerKey = "disposition" | "audit" | "notes" | "qa" | null;
type DispositionPreset = "close" | null;

export function VariantA() {
  const [queueCategory, setQueueCategory] = useState<SeedQueueCategory | "all">("all");
  const [sourceChannel, setSourceChannel] = useState<SeedSourceChannel | "all">("all");
  const [campaignUmbrella, setCampaignUmbrella] = useState<string | "all">("all");
  const [itemType, setItemType] = useState<ItemTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [selectedId, setSelectedId] = useState<string>(SEED_CONVERSATIONS[0].id);
  const [drawer, setDrawer] = useState<DrawerKey>(null);
  const [dispositionPreset, setDispositionPreset] = useState<DispositionPreset>(null);

  function closeDrawer() {
    setDrawer(null);
    setDispositionPreset(null);
  }
  function openDrawer(k: DrawerKey, preset: DispositionPreset = null) {
    setDrawer(k);
    setDispositionPreset(preset);
  }

  const umbrellaOptions = useMemo(() => {
    const set = new Set<string>();
    SEED_CONVERSATIONS.forEach((c) => {
      if (c.attribution) set.add(c.attribution.campaignUmbrella);
    });
    return Array.from(set);
  }, []);

  const filtered = useMemo(() => {
    return SEED_CONVERSATIONS.filter((c) => {
      if (queueCategory !== "all" && c.queueCategory !== queueCategory) return false;
      if (sourceChannel !== "all" && c.sourceChannel !== sourceChannel) return false;
      if (
        campaignUmbrella !== "all" &&
        (c.attribution?.campaignUmbrella ?? null) !== campaignUmbrella
      )
        return false;
      if (itemType === "messages" && c.itemKind !== "thread") return false;
      if (itemType === "comments" && c.itemKind !== "comment") return false;
      if (statusFilter === "unread" && c.unread === 0) return false;
      if (statusFilter === "needs_reply" && c.workflowStatus !== "needs_reply") return false;
      if (query) {
        const q = query.toLowerCase();
        const hay = [
          c.sender,
          c.handle ?? "",
          c.preview,
          c.routingExplanation,
          c.attribution?.campaignUmbrella ?? "",
          c.attribution?.campaign ?? "",
          c.attribution?.ad ?? "",
          c.attribution?.creative ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => a.ageMin - b.ageMin);
  }, [campaignUmbrella, itemType, query, queueCategory, sourceChannel, statusFilter]);

  const selected =
    SEED_CONVERSATIONS.find((c) => c.id === selectedId) ?? filtered[0] ?? null;

  const filtersDirty =
    queueCategory !== "all" ||
    sourceChannel !== "all" ||
    campaignUmbrella !== "all" ||
    itemType !== "all" ||
    statusFilter !== "all";

  function reset() {
    setQueueCategory("all");
    setSourceChannel("all");
    setCampaignUmbrella("all");
    setItemType("all");
    setStatusFilter("all");
    setQuery("");
  }

  return (
    <div className="min-h-[calc(100vh-128px)]">
      <ManagerEyebrow />
      <StatusRow conversations={SEED_CONVERSATIONS} />

      <div className="grid grid-cols-[400px_1fr] border border-hp-rule bg-hp-card">
        <QueueRail
          items={filtered}
          query={query}
          onQuery={setQuery}
          queueCategory={queueCategory}
          onQueueCategory={setQueueCategory}
          sourceChannel={sourceChannel}
          onSourceChannel={setSourceChannel}
          campaignUmbrella={campaignUmbrella}
          onCampaignUmbrella={setCampaignUmbrella}
          umbrellaOptions={umbrellaOptions}
          itemType={itemType}
          onItemType={setItemType}
          statusFilter={statusFilter}
          onStatusFilter={setStatusFilter}
          filtersOpen={filtersOpen}
          onFiltersOpen={setFiltersOpen}
          filtersDirty={filtersDirty}
          onReset={reset}
          selectedId={selected?.id ?? null}
          onSelect={(id) => {
            setSelectedId(id);
            closeDrawer();
          }}
        />
        <ConversationPane conv={selected} onOpenDrawer={openDrawer} />
      </div>

      <DrawerOverlay
        drawer={drawer}
        conv={selected}
        dispositionPreset={dispositionPreset}
        onClose={closeDrawer}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Top strips                                                          */
/* ------------------------------------------------------------------ */

function ManagerEyebrow() {
  const m = SEED_TEAM_METRICS;
  return (
    <div className="flex flex-wrap items-center justify-between gap-y-1 border-b border-hp-rule-soft px-1 py-2 text-[10px] uppercase tracking-[0.18em] text-hp-muted">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <Eyebrow label="Needs reply" value={String(m.needsReply)} tone="ink" />
        <Eyebrow label="Unassigned" value={String(m.unassigned)} tone="ink" />
        <Eyebrow
          label="Stale"
          value={String(m.staleConversations)}
          tone={m.staleConversations > 0 ? "warn" : "ink"}
        />
        <Eyebrow
          label="Median first"
          value={
            m.medianFirstResponseMinutes != null ? `${m.medianFirstResponseMinutes}m` : "—"
          }
          tone="ink"
        />
        <Eyebrow
          label="QA avg"
          value={m.averageQaScore != null ? m.averageQaScore.toFixed(1) : "—"}
          tone="positive"
        />
      </div>
      <div className="flex items-center gap-3">
        <span>
          Last sync · {SEED_LAST_SYNC.completedMinAgo} min ago · {SEED_LAST_SYNC.status}
        </span>
        <button
          type="button"
          className="h-7 border border-hp-rule px-2 hover:border-hp-ink hover:text-hp-ink"
        >
          Sync Inbox
        </button>
      </div>
    </div>
  );
}

function Eyebrow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ink" | "warn" | "positive";
}) {
  const valueClass =
    tone === "warn"
      ? "text-signal-warning"
      : tone === "positive"
        ? "text-signal-positive"
        : "text-hp-ink";
  return (
    <span className="flex items-baseline gap-1.5">
      <span>{label}</span>
      <span
        className={`font-[family-name:var(--font-title)] text-[15px] tracking-normal normal-case ${valueClass}`}
        style={{ fontVariantNumeric: "tabular-nums lining-nums" }}
      >
        {value}
      </span>
    </span>
  );
}

// Mirrors inboxHighlights in social-inbox-client.tsx — produces the same
// shape of phrases ({N} unread, {N} needing reply, "all caught up", or
// "Inbox is empty…") so the prototype reads exactly like the real page.
function StatusRow({ conversations }: { conversations: SeedConversation[] }) {
  const highlights = computeHighlights(conversations);
  return (
    <div className="flex items-baseline justify-between border-b border-hp-rule px-1 pb-5 pt-4">
      <h1 className="font-[family-name:var(--font-title)] text-[26px] leading-tight text-hp-ink">
        {highlights.map((h, i) => (
          <span key={i}>
            <span className={h.tone === "warning" ? "text-signal-warning" : h.tone === "positive" ? "text-signal-positive" : "text-hp-body"}>
              {h.text}
            </span>
            {i < highlights.length - 1 ? <span className="text-hp-muted"> · </span> : null}
          </span>
        ))}
      </h1>
      <div className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">Convert · Inbox</div>
    </div>
  );
}

function computeHighlights(
  conversations: SeedConversation[],
): { text: string; tone: "warning" | "positive" | "neutral" }[] {
  if (conversations.length === 0) {
    return [{ text: "Inbox is empty for the current connection", tone: "neutral" }];
  }
  const unread = conversations.filter((c) => c.unread > 0).length;
  const needsReply = conversations.filter(
    (c) => c.workflowStatus === "needs_reply",
  ).length;
  const out: { text: string; tone: "warning" | "positive" | "neutral" }[] = [];
  if (unread > 0) out.push({ text: `${unread} unread`, tone: "warning" });
  if (needsReply > 0) out.push({ text: `${needsReply} needing reply`, tone: "warning" });
  if (out.length === 0) {
    out.push({
      text: `${conversations.length} threads, all caught up`,
      tone: "positive",
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Queue rail                                                          */
/* ------------------------------------------------------------------ */

function QueueRail(props: {
  items: SeedConversation[];
  query: string;
  onQuery: (v: string) => void;
  queueCategory: SeedQueueCategory | "all";
  onQueueCategory: (v: SeedQueueCategory | "all") => void;
  sourceChannel: SeedSourceChannel | "all";
  onSourceChannel: (v: SeedSourceChannel | "all") => void;
  campaignUmbrella: string | "all";
  onCampaignUmbrella: (v: string | "all") => void;
  umbrellaOptions: string[];
  itemType: ItemTypeFilter;
  onItemType: (v: ItemTypeFilter) => void;
  statusFilter: StatusFilter;
  onStatusFilter: (v: StatusFilter) => void;
  filtersOpen: boolean;
  onFiltersOpen: (v: boolean) => void;
  filtersDirty: boolean;
  onReset: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="flex h-[calc(100vh-208px)] min-h-[680px] flex-col border-r border-hp-rule">
      {/* search */}
      <div className="border-b border-hp-rule-soft px-3 py-2">
        <input
          type="search"
          placeholder="Search names, messages, ads, campaigns…"
          value={props.query}
          onChange={(e) => props.onQuery(e.target.value)}
          className="h-9 w-full border border-hp-rule bg-white px-3 text-[13px] text-hp-ink placeholder:text-hp-muted focus:border-hp-ink focus:outline-none"
        />
      </div>

      {/* queue category dropdown */}
      <div className="flex items-center gap-2 border-b border-hp-rule-soft px-3 py-2">
        <label className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">Queue</label>
        <select
          value={props.queueCategory}
          onChange={(e) =>
            props.onQueueCategory(e.target.value as SeedQueueCategory | "all")
          }
          className="h-8 flex-1 border border-hp-rule bg-white px-2 text-[12px] text-hp-ink focus:border-hp-ink focus:outline-none"
        >
          <option value="all">All categories</option>
          {QUEUE_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => props.onFiltersOpen(!props.filtersOpen)}
          className={`h-8 border px-2 text-[10px] uppercase tracking-[0.14em] ${
            props.filtersOpen
              ? "border-hp-ink bg-hp-ink text-hp-foundation"
              : "border-hp-rule bg-hp-card text-hp-body hover:border-hp-ink"
          }`}
        >
          Filters
        </button>
      </div>

      {/* filter disclosure */}
      {props.filtersOpen ? (
        <div className="space-y-2 border-b border-hp-rule-soft bg-hp-foundation/40 px-3 py-3">
          <FilterRow
            label="Source"
            value={props.sourceChannel}
            onChange={(v) => props.onSourceChannel(v as SeedSourceChannel | "all")}
            options={[
              { value: "all", label: "All channels" },
              ...SOURCE_CHANNELS.map((s) => ({ value: s.key, label: s.label })),
            ]}
          />
          <FilterRow
            label="Campaign"
            value={props.campaignUmbrella}
            onChange={(v) => props.onCampaignUmbrella(v)}
            options={[
              { value: "all", label: "All campaigns" },
              ...props.umbrellaOptions.map((u) => ({ value: u, label: u })),
            ]}
          />
          <FilterRow
            label="Type"
            value={props.itemType}
            onChange={(v) => props.onItemType(v as ItemTypeFilter)}
            options={[
              { value: "all", label: "All items" },
              { value: "messages", label: "Messages" },
              { value: "comments", label: "Comments" },
            ]}
          />
          <FilterRow
            label="Status"
            value={props.statusFilter}
            onChange={(v) => props.onStatusFilter(v as StatusFilter)}
            options={[
              { value: "all", label: "All statuses" },
              { value: "unread", label: "Unread" },
              { value: "needs_reply", label: "Needs reply" },
            ]}
          />
          {props.filtersDirty ? (
            <button
              type="button"
              onClick={props.onReset}
              className="text-[10px] uppercase tracking-[0.14em] text-hp-pink underline hover:text-hp-ink"
            >
              Reset all filters
            </button>
          ) : (
            <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              No filters applied
            </p>
          )}
        </div>
      ) : null}

      <div className="flex items-center justify-between border-b border-hp-rule-soft px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        <span>
          {props.items.length} conversation{props.items.length === 1 ? "" : "s"}
        </span>
        {props.filtersDirty ? (
          <button
            type="button"
            onClick={props.onReset}
            className="text-hp-pink underline hover:text-hp-ink"
          >
            Reset
          </button>
        ) : (
          <span>Sorted by age</span>
        )}
      </div>

      {/* list */}
      <ul className="flex-1 overflow-y-auto">
        {props.items.length === 0 ? (
          <li className="px-4 py-10 text-center text-[12px] text-hp-muted">
            No conversations match. {props.filtersDirty ? "Try resetting." : ""}
          </li>
        ) : (
          props.items.map((c) => (
            <QueueRow
              key={c.id}
              conv={c}
              active={c.id === props.selectedId}
              onClick={() => props.onSelect(c.id)}
            />
          ))
        )}
      </ul>
    </aside>
  );
}

function FilterRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 flex-1 border border-hp-rule bg-white px-2 text-[11px] text-hp-ink focus:border-hp-ink focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function QueueRow({
  conv,
  active,
  onClick,
}: {
  conv: SeedConversation;
  active: boolean;
  onClick: () => void;
}) {
  const platform = platformOf(conv.sourceChannel);
  const kind = itemBadge(conv.sourceChannel);
  const category = QUEUE_CATEGORIES.find((q) => q.key === conv.queueCategory);
  const isNeedsReply = conv.workflowStatus === "needs_reply";
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-start gap-3 border-b border-hp-rule-soft px-3 py-2.5 text-left transition-colors ${
          active
            ? "bg-hp-ink text-hp-foundation"
            : isNeedsReply
              ? "bg-hp-pink/[0.06] hover:bg-hp-inset"
              : "hover:bg-hp-inset"
        }`}
      >
        <div className="flex w-7 shrink-0 flex-col items-center gap-0.5">
          <span
            className={`inline-flex h-7 w-7 items-center justify-center border text-[9px] font-semibold ${
              active
                ? "border-hp-foundation/40 text-hp-foundation"
                : "border-hp-rule bg-hp-foundation text-hp-body"
            }`}
            style={{ fontVariantNumeric: "tabular-nums lining-nums" }}
          >
            {conv.initials}
          </span>
          <span
            className={`text-[8px] uppercase tracking-[0.14em] ${
              active ? "text-hp-foundation/60" : "text-hp-muted"
            }`}
          >
            {platform} {kind}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className={`truncate font-[family-name:var(--font-title)] text-[15px] ${
                active ? "text-hp-foundation" : "text-hp-ink"
              }`}
            >
              {conv.sender}
            </span>
            <span
              className={`ml-auto text-[10px] tracking-tight ${
                active
                  ? "text-hp-foundation/70"
                  : conv.overSla
                    ? "text-signal-warning"
                    : "text-hp-muted"
              }`}
              style={{ fontVariantNumeric: "tabular-nums lining-nums" }}
            >
              {fmtAge(conv.ageMin)}
            </span>
          </div>
          <p
            className={`line-clamp-2 pt-0.5 text-[12px] leading-snug ${
              active ? "text-hp-foundation/85" : "text-hp-body"
            }`}
          >
            {conv.preview}
          </p>
          <div className="flex items-center gap-2 pt-1.5">
            <span
              className={`inline-flex items-center border px-1.5 py-px text-[9px] uppercase tracking-[0.14em] ${
                active
                  ? "border-hp-foundation/60 text-hp-foundation"
                  : "border-hp-rule bg-hp-foundation text-hp-body"
              }`}
            >
              {conv.brand} · {category?.label ?? "Needs review"}
            </span>
            {conv.overSla ? (
              <span
                className={`ml-auto text-[9px] uppercase tracking-[0.14em] ${
                  active ? "text-hp-foundation" : "text-signal-warning"
                }`}
              >
                ↑ Over SLA
              </span>
            ) : conv.unread ? (
              <span
                className={`ml-auto text-[9px] uppercase tracking-[0.14em] ${
                  active ? "text-hp-foundation" : "text-hp-pink"
                }`}
              >
                Needs reply
              </span>
            ) : null}
          </div>
        </div>
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Conversation pane                                                   */
/* ------------------------------------------------------------------ */

function ConversationPane({
  conv,
  onOpenDrawer,
}: {
  conv: SeedConversation | null;
  onOpenDrawer: (key: DrawerKey, preset?: DispositionPreset) => void;
}) {
  if (!conv) {
    return (
      <section className="flex h-[calc(100vh-208px)] min-h-[680px] items-center justify-center text-[13px] text-hp-muted">
        Select a conversation to view.
      </section>
    );
  }
  const platform = platformOf(conv.sourceChannel);
  const kind = itemBadge(conv.sourceChannel);
  const category = QUEUE_CATEGORIES.find((q) => q.key === conv.queueCategory);

  return (
    <section className="flex h-[calc(100vh-208px)] min-h-[680px] flex-col bg-hp-foundation/50">
      <ConversationHeader
        conv={conv}
        platform={platform}
        kind={kind}
        categoryLabel={category?.label}
        onOpenDrawer={onOpenDrawer}
      />
      {conv.presences.length > 0 ? <PresenceBanner conv={conv} /> : null}
      <HistoryStatusStrip conv={conv} />
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        {conv.thread.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] text-hp-muted">
            No messages loaded for this conversation yet. Run an inbox sync to fetch history.
          </p>
        ) : (
          conv.thread.map((m) => <Bubble key={m.id} m={m} />)
        )}
      </div>
      {conv.itemKind === "comment" ? (
        <PublicCommentActionPanel conv={conv} />
      ) : (
        <Composer conv={conv} />
      )}
    </section>
  );
}

function ConversationHeader({
  conv,
  platform,
  kind,
  categoryLabel,
  onOpenDrawer,
}: {
  conv: SeedConversation;
  platform: "FB" | "IG";
  kind: "Msg" | "Cmt" | "Adref";
  categoryLabel?: string;
  onOpenDrawer: (key: DrawerKey, preset?: DispositionPreset) => void;
}) {
  const window = conv.replyWindow;
  const showHandle = platform === "IG" && conv.handle != null;
  return (
    <header className="border-b border-hp-rule px-6 py-4">
      <div className="flex items-start gap-4">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            {conv.brand} · {platform} {kind} · {categoryLabel ?? "Needs review"} ·{" "}
            <span className="normal-case tracking-normal italic">
              Routing {(conv.routingConfidence * 100).toFixed(0)}% — {conv.routingExplanation}
            </span>
          </p>
          <h2 className="font-[family-name:var(--font-title)] text-[22px] leading-tight text-hp-ink">
            {conv.sender}
            {showHandle ? (
              <span className="ml-2 text-[14px] italic text-hp-muted">{conv.handle}</span>
            ) : null}
          </h2>
          <p className="pt-1 text-[12px] text-hp-body">
            {conv.assigned ? `Assigned to ${conv.assigned}` : "Unassigned"} ·{" "}
            <span className={conv.overSla ? "text-signal-warning" : "text-hp-body"}>
              {fmtAge(conv.ageMin)} since last inbound
            </span>{" "}
            · <ReplyWindowChip window={window} />
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <DrawerChip onClick={() => onOpenDrawer("disposition")}>Details</DrawerChip>
          <DrawerChip onClick={() => onOpenDrawer("audit")}>Audit</DrawerChip>
          <DrawerChip onClick={() => onOpenDrawer("notes")}>Notes</DrawerChip>
          <DrawerChip onClick={() => onOpenDrawer("qa")}>QA</DrawerChip>
          <DrawerChip emphasized onClick={() => onOpenDrawer("disposition", "close")}>
            Close →
          </DrawerChip>
        </div>
      </div>
    </header>
  );
}

function ReplyWindowChip({ window }: { window: SeedConversation["replyWindow"] }) {
  if (window.state === "open") {
    return (
      <span className="text-signal-positive">
        Reply window open · {window.remainingDays}d remaining
      </span>
    );
  }
  if (window.state === "closing") {
    return (
      <span className="text-signal-warning">
        Reply window closing · {window.remainingHours}h remaining
      </span>
    );
  }
  return (
    <span className="text-signal-danger">
      Reply window closed · {window.closedDaysAgo}d ago
    </span>
  );
}

function DrawerChip({
  children,
  onClick,
  emphasized,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  emphasized?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 border px-3 text-[10px] uppercase tracking-[0.14em] ${
        emphasized
          ? "border-hp-ink bg-hp-ink text-hp-foundation hover:bg-hp-body"
          : "border-hp-rule bg-hp-card text-hp-body hover:border-hp-ink hover:text-hp-ink"
      }`}
    >
      {children}
    </button>
  );
}

function PresenceBanner({ conv }: { conv: SeedConversation }) {
  const lines = conv.presences.map((p) => {
    if (p.activity === "replying") return `${p.advisor} is replying now`;
    if (p.activity === "typing") return `${p.advisor} is typing`;
    return `${p.advisor} is viewing this conversation`;
  });
  const hot = conv.presences.some(
    (p) => p.activity === "replying" || p.activity === "typing",
  );
  return (
    <div
      className={`border-b px-6 py-1.5 text-[10px] uppercase tracking-[0.14em] ${
        hot
          ? "border-signal-warning bg-signal-warning-bg text-signal-warning"
          : "border-hp-rule-soft bg-hp-foundation/40 text-hp-muted"
      }`}
    >
      <span>↻ {lines.join(" · ")}</span>
      {conv.presences.length > 1 ? (
        <span className="ml-2 normal-case tracking-normal italic">
          Assignment still controls ownership.
        </span>
      ) : null}
    </div>
  );
}

function HistoryStatusStrip({ conv }: { conv: SeedConversation }) {
  const total = conv.thread.length === 0 ? 0 : 47;
  const loaded = conv.thread.length;
  if (loaded === 0) return null;
  return (
    <div className="flex items-center justify-between border-b border-hp-rule-soft px-6 py-1.5 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
      <span>
        {loaded} of {total} known loaded · Recent 30 days
      </span>
      <button
        type="button"
        className="border-b border-hp-rule pb-0.5 hover:border-hp-ink hover:text-hp-ink"
      >
        Load older history ↑
      </button>
    </div>
  );
}

function Bubble({ m }: { m: SeedMessage }) {
  const out = m.direction === "outbound";
  return (
    <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] border ${
          out ? "border-hp-rule bg-hp-card text-hp-ink" : "border-hp-rule bg-hp-inset text-hp-ink"
        }`}
      >
        <div className="px-3 py-2">
          {m.author ? (
            <p className="pb-0.5 text-[9px] uppercase tracking-[0.14em] text-hp-muted">
              {m.author} →
            </p>
          ) : null}
          <p className="text-[13.5px] leading-relaxed">{m.body}</p>
          <p
            className="pt-1 text-[10px] text-hp-muted"
            style={{ fontVariantNumeric: "tabular-nums lining-nums" }}
          >
            {fmtAge(m.sentMin)} ago
          </p>
        </div>
        {m.attachments && m.attachments.length > 0 ? (
          <ul className="border-t border-hp-rule-soft">
            {m.attachments.map((a) => (
              <AttachmentRow key={a.id} a={a} />
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function AttachmentRow({ a }: { a: SeedAttachment }) {
  const icon = a.type === "photo" ? "▢" : a.type === "video" ? "▶" : "📎";
  return (
    <li className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-hp-body">
      <span aria-hidden className="text-hp-muted">
        {icon}
      </span>
      <span className="truncate">{a.label}</span>
      <span className="text-hp-muted">
        {a.mime} · {fmtBytes(a.sizeBytes)}
      </span>
      <button type="button" className="ml-auto text-hp-pink underline hover:text-hp-ink">
        Open
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Composer (thread) + Comment moderation panel                        */
/* ------------------------------------------------------------------ */

function Composer({ conv }: { conv: SeedConversation }) {
  const [draft, setDraft] = useState("");
  const [draftName, setDraftName] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [attemptsOpen, setAttemptsOpen] = useState(false);
  const [savedRepliesOpen, setSavedRepliesOpen] = useState(true);
  const canSend = conv.replyWindow.state !== "closed";

  return (
    <div className="border-t border-hp-rule bg-hp-card">
      {/* send attempts collapsed strip */}
      {conv.sendAttempts.length > 0 ? (
        <button
          type="button"
          onClick={() => setAttemptsOpen((s) => !s)}
          className="flex w-full items-center justify-between border-b border-hp-rule-soft px-6 py-1.5 text-[10px] uppercase tracking-[0.14em] text-hp-muted hover:text-hp-ink"
        >
          <span>
            {conv.sendAttempts.length} send attempt{conv.sendAttempts.length === 1 ? "" : "s"} ·{" "}
            last {fmtAge(conv.sendAttempts[conv.sendAttempts.length - 1].createdMin)} ago
          </span>
          <span>{attemptsOpen ? "Hide" : "Show"} ↕</span>
        </button>
      ) : null}
      {attemptsOpen ? <SendAttemptsList attempts={conv.sendAttempts} /> : null}

      {/* saved replies — collapsible, default open. Card pattern mirrors
          social-inbox-client.tsx lines 2266-2300. */}
      <SavedRepliesCard
        open={savedRepliesOpen}
        onToggle={() => setSavedRepliesOpen((s) => !s)}
        onInsert={(body) => setDraft((d) => (d ? `${d}\n\n${body}` : body))}
        canSend={canSend}
      />

      {/* composer header */}
      <div className="border-b border-hp-rule-soft px-6 py-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        <span>
          Reply as{" "}
          <span className="font-[family-name:var(--font-title)] italic normal-case tracking-normal text-hp-ink">
            {conv.brand}
          </span>
        </span>
        {conv.replyWindow.state === "closed" ? (
          <span className="ml-2 text-signal-danger normal-case tracking-normal italic">
            Reply window closed — only follow-up tags can be sent.
          </span>
        ) : null}
      </div>

      <textarea
        rows={3}
        placeholder={
          canSend
            ? "Draft a reply…"
            : "Reply window is closed. Use a saved follow-up template."
        }
        className="block w-full resize-none border-0 bg-transparent px-6 py-3 text-[14px] text-hp-ink placeholder:text-hp-muted focus:outline-none disabled:opacity-50"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={!canSend}
      />

      {/* Save Personal Draft inline — mirrors the real input + button pair
          at social-inbox-client.tsx lines 2309-2334 */}
      <div className="flex items-center gap-2 border-t border-hp-rule-soft bg-hp-foundation/40 px-6 py-2">
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="Draft name"
          disabled={!draft.trim()}
          className="h-8 flex-1 border border-hp-rule bg-hp-inset px-2 text-[12px] text-hp-ink placeholder:text-hp-muted focus:border-hp-ink focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          disabled={!draft.trim() || !draftName.trim()}
          className="h-8 border border-hp-ink bg-hp-card px-3 text-[10px] uppercase tracking-[0.14em] text-hp-ink hover:bg-hp-ink hover:text-hp-foundation disabled:opacity-40"
        >
          Save Personal Draft
        </button>
      </div>

      {confirming ? (
        <div className="flex items-center justify-between border-t border-signal-warning bg-signal-warning-bg px-6 py-2 text-[10px] uppercase tracking-[0.14em] text-signal-warning">
          <span>Send as {conv.brand}? This will record a send attempt.</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="h-7 border border-signal-warning bg-hp-foundation px-3 text-signal-warning hover:bg-hp-card"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setDraft("");
              }}
              className="h-7 border border-signal-warning bg-signal-warning px-3 text-hp-foundation hover:bg-signal-danger hover:border-signal-danger"
            >
              Send →
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-end border-t border-hp-rule-soft px-6 py-2">
          <button
            type="button"
            disabled={!draft.trim() || !canSend}
            onClick={() => setConfirming(true)}
            className="h-8 border border-hp-ink bg-hp-ink px-4 text-[10px] uppercase tracking-[0.14em] text-hp-foundation hover:bg-hp-body disabled:opacity-40"
          >
            Send →
          </button>
        </div>
      )}
    </div>
  );
}

function SavedRepliesCard({
  open,
  onToggle,
  onInsert,
  canSend,
}: {
  open: boolean;
  onToggle: () => void;
  onInsert: (body: string) => void;
  canSend: boolean;
}) {
  if (SEED_SAVED_REPLIES.length === 0) return null;
  return (
    <div className="border-b border-hp-rule-soft">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-6 py-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted hover:text-hp-ink"
        aria-expanded={open}
      >
        <span>
          <span className="text-hp-ink">Saved Replies</span> ·{" "}
          {SEED_SAVED_REPLIES.length} available
        </span>
        <span>{open ? "Hide" : "Show"} ↕</span>
      </button>
      {open ? (
        <ul className="grid gap-2 px-6 pb-3 sm:grid-cols-2">
          {SEED_SAVED_REPLIES.slice(0, 4).map((sr) => (
            <li
              key={sr.id}
              className="flex flex-col gap-1 border border-hp-rule bg-hp-inset px-3 py-2"
            >
              <p className="truncate text-[13px] font-medium text-hp-ink">{sr.title}</p>
              <p className="line-clamp-2 text-[11px] leading-relaxed text-hp-muted">
                {sr.body}
              </p>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[9px] uppercase tracking-[0.14em] text-hp-muted">
                  {sr.scope === "personal" ? "Personal Draft" : "Approved Shared"}
                </span>
                <button
                  type="button"
                  disabled={!canSend}
                  onClick={() => onInsert(sr.body)}
                  className="h-7 border border-hp-rule px-2 text-[10px] uppercase tracking-[0.14em] text-hp-ink hover:border-hp-ink disabled:opacity-40"
                >
                  Insert →
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SendAttemptsList({ attempts }: { attempts: SeedSendAttempt[] }) {
  return (
    <ul className="border-b border-hp-rule-soft bg-hp-foundation/40">
      {attempts.map((a) => {
        const toneClass =
          a.status === "failed_retryable"
            ? "border-signal-danger text-signal-danger"
            : a.status === "queued"
              ? "border-signal-warning text-signal-warning"
              : "border-hp-rule text-hp-body";
        return (
          <li
            key={a.id}
            className="flex items-center gap-3 border-b border-hp-rule-soft px-6 py-2 last:border-b-0 text-[11px]"
          >
            <span
              className={`inline-flex h-5 items-center border px-1.5 text-[9px] uppercase tracking-[0.14em] ${toneClass}`}
            >
              {a.status}
            </span>
            <span className="truncate text-hp-body">{a.body}</span>
            <span
              className="ml-auto text-hp-muted"
              style={{ fontVariantNumeric: "tabular-nums lining-nums" }}
            >
              {a.author} · {fmtAge(a.createdMin)} ago
            </span>
            {a.status === "failed_retryable" ? (
              <button
                type="button"
                className="border border-hp-rule px-2 py-px text-[9px] uppercase tracking-[0.14em] hover:border-hp-ink hover:text-hp-ink"
              >
                Retry
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function PublicCommentActionPanel({ conv }: { conv: SeedConversation }) {
  const [reason, setReason] = useState("");
  return (
    <div className="border-t border-hp-rule bg-hp-card">
      <div className="border-b border-hp-rule-soft px-6 py-2 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        Public comment moderation ·{" "}
        <span className="normal-case tracking-normal italic text-hp-body">
          Reason required for hide / delete (audit trail).
        </span>
      </div>
      <textarea
        rows={2}
        placeholder="Why are you moderating this comment? (e.g., 'spam', 'PII', 'against policy')"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="block w-full resize-none border-0 bg-transparent px-6 py-3 text-[13px] text-hp-ink placeholder:text-hp-muted focus:outline-none"
      />
      <div className="flex items-center justify-between border-t border-hp-rule-soft px-6 py-2">
        <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
          Or send a private reply via DM →
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!reason.trim()}
            className="h-8 border border-hp-rule px-3 text-[10px] uppercase tracking-[0.14em] text-hp-body hover:border-signal-warning hover:text-signal-warning disabled:opacity-40"
          >
            Hide comment
          </button>
          <button
            type="button"
            disabled={!reason.trim()}
            className="h-8 border border-signal-danger bg-signal-danger px-3 text-[10px] uppercase tracking-[0.14em] text-hp-foundation hover:bg-hp-ink hover:border-hp-ink disabled:opacity-40"
          >
            Delete →
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Drawer overlay                                                      */
/* ------------------------------------------------------------------ */

function DrawerOverlay({
  drawer,
  conv,
  dispositionPreset,
  onClose,
}: {
  drawer: DrawerKey;
  conv: SeedConversation | null;
  dispositionPreset: DispositionPreset;
  onClose: () => void;
}) {
  if (!drawer || !conv) return null;
  const titles: Record<NonNullable<DrawerKey>, string> = {
    disposition:
      dispositionPreset === "close"
        ? "Close conversation"
        : "Details · Customer + Status",
    audit: "Audit trail",
    notes: "Notes & coaching",
    qa: "QA scorecards",
  };
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close drawer"
        className="flex-1 bg-hp-ink/30"
      />
      <aside
        className="flex h-full w-[480px] flex-col border-l border-hp-rule bg-hp-card"
        style={{ boxShadow: "0 8px 24px rgba(42, 39, 37, 0.18)" }}
      >
        <header className="flex items-center justify-between border-b border-hp-rule px-5 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              {conv.sender} · {conv.brand}
            </p>
            <h3 className="font-[family-name:var(--font-title)] text-[18px] text-hp-ink">
              {titles[drawer]}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 border border-hp-rule bg-hp-foundation px-3 text-[10px] uppercase tracking-[0.14em] text-hp-body hover:border-hp-ink hover:text-hp-ink"
          >
            Close ×
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">
          {drawer === "disposition" ? (
            <DispositionDrawer conv={conv} preset={dispositionPreset} />
          ) : null}
          {drawer === "audit" ? <AuditDrawer conv={conv} /> : null}
          {drawer === "notes" ? <NotesDrawer conv={conv} /> : null}
          {drawer === "qa" ? <QaDrawer conv={conv} /> : null}
        </div>
      </aside>
    </div>
  );
}

function DrawerSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-hp-rule-soft px-5 py-4">
      <p className="pb-3 text-[10px] uppercase tracking-[0.14em] text-hp-muted">{title}</p>
      {children}
    </section>
  );
}

function DispositionDrawer({
  conv,
  preset,
}: {
  conv: SeedConversation;
  preset: DispositionPreset;
}) {
  const platform = platformOf(conv.sourceChannel);
  const showHandle = platform === "IG" && conv.handle != null;
  return (
    <div>
      {preset === "close" ? (
        <div className="border-b border-signal-warning bg-signal-warning-bg px-5 py-3 text-[11px] text-signal-warning">
          <p className="font-[family-name:var(--font-title)] text-[14px] normal-case tracking-normal">
            Closing this conversation
          </p>
          <p className="mt-0.5 italic">
            Status is pre-set to <strong>Closed</strong>. Save state requires Lead quality,
            ≥1 reason tag, and an Outcome filled in below.
          </p>
        </div>
      ) : null}
      <DrawerSection title="Customer">
        <div className="space-y-1">
          <p className="font-[family-name:var(--font-title)] text-[18px] text-hp-ink">
            {conv.sender}
            {showHandle ? (
              <span className="ml-2 text-[14px] italic text-hp-muted">{conv.handle}</span>
            ) : null}
          </p>
          <p className="text-[12px] italic text-hp-body">
            {showHandle ? (
              <>
                Instagram ·{" "}
                <button type="button" className="text-hp-pink underline hover:text-hp-ink">
                  Open on Instagram →
                </button>
              </>
            ) : platform === "FB" ? (
              <>
                Facebook ·{" "}
                <button type="button" className="text-hp-pink underline hover:text-hp-ink">
                  Open on Facebook →
                </button>
              </>
            ) : (
              <span className="text-hp-muted">No profile link available</span>
            )}
          </p>
        </div>
        <div className="mt-3 space-y-1.5">
          <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            Contact methods
          </p>
          {conv.contactMethods.length === 0 ? (
            <p className="text-[12px] italic text-hp-muted">No contact methods yet.</p>
          ) : (
            <ul className="space-y-1">
              {conv.contactMethods.map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-[12px] text-hp-body">
                  <span className="w-12 text-[9px] uppercase tracking-[0.14em] text-hp-muted">
                    {m.kind}
                  </span>
                  <span className="text-hp-ink">{m.value}</span>
                  <span className="ml-auto text-[9px] uppercase tracking-[0.14em] text-hp-muted">
                    {m.source.replace("_", " ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2 pt-2">
            <select className="h-7 border border-hp-rule bg-white px-2 text-[11px]">
              <option>Email</option>
              <option>Phone</option>
            </select>
            <input
              placeholder="value"
              className="h-7 flex-1 border border-hp-rule bg-white px-2 text-[11px] focus:border-hp-ink focus:outline-none"
            />
            <button
              type="button"
              className="h-7 border border-hp-ink bg-hp-ink px-2 text-[10px] uppercase tracking-[0.14em] text-hp-foundation hover:bg-hp-body"
            >
              Add
            </button>
          </div>
        </div>
        {conv.attribution ? (
          <div className="mt-4 border-t border-hp-rule-soft pt-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              First touch attribution
            </p>
            <dl className="mt-1.5 grid grid-cols-[100px_1fr] gap-y-1 text-[12px]">
              <dt className="text-hp-muted">Umbrella</dt>
              <dd className="text-hp-ink">{conv.attribution.campaignUmbrella}</dd>
              <dt className="text-hp-muted">Campaign</dt>
              <dd className="text-hp-body">{conv.attribution.campaign}</dd>
              <dt className="text-hp-muted">Ad set</dt>
              <dd className="text-hp-body">{conv.attribution.adSet}</dd>
              <dt className="text-hp-muted">Ad</dt>
              <dd className="text-hp-body">{conv.attribution.ad}</dd>
              <dt className="text-hp-muted">Creative</dt>
              <dd className="text-hp-body">{conv.attribution.creative}</dd>
            </dl>
            <button type="button" className="mt-2 text-[11px] text-hp-pink underline hover:text-hp-ink">
              Open source post →
            </button>
          </div>
        ) : null}
      </DrawerSection>

      <DrawerSection title="Workflow">
        <div className="space-y-3">
          <Field label="Queue">
            <select
              defaultValue={conv.queueCategory}
              className="h-8 w-full border border-hp-rule bg-white px-2 text-[12px] focus:border-hp-ink focus:outline-none"
            >
              {QUEUE_CATEGORIES.map((q) => (
                <option key={q.key} value={q.key}>
                  {q.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              defaultValue={preset === "close" ? "closed" : conv.workflowStatus}
              className={`h-8 w-full border bg-white px-2 text-[12px] focus:border-hp-ink focus:outline-none ${
                preset === "close" ? "border-signal-warning" : "border-hp-rule"
              }`}
            >
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Lead quality">
            <select
              defaultValue={conv.leadQuality ?? ""}
              className="h-8 w-full border border-hp-rule bg-white px-2 text-[12px] focus:border-hp-ink focus:outline-none"
            >
              <option value="">— set when triaging —</option>
              {Object.entries(LEAD_QUALITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Outcome">
            <select
              defaultValue={conv.outcome}
              className="h-8 w-full border border-hp-rule bg-white px-2 text-[12px] focus:border-hp-ink focus:outline-none"
            >
              {Object.entries(OUTCOME_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reason tags">
            <div className="flex flex-wrap gap-1">
              {REASON_TAGS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="border border-hp-rule bg-hp-card px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-hp-body hover:border-hp-ink hover:text-hp-ink"
                >
                  {t.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Follow-up">
            <input
              type="datetime-local"
              className="h-8 w-full border border-hp-rule bg-white px-2 text-[12px] focus:border-hp-ink focus:outline-none"
            />
          </Field>
          <Field label="Change note">
            <textarea
              rows={2}
              placeholder="Audit note for this update (optional)…"
              className="block w-full resize-none border border-hp-rule bg-white px-2 py-1.5 text-[12px] focus:border-hp-ink focus:outline-none"
            />
          </Field>
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="h-8 border border-hp-rule bg-hp-card px-3 text-[10px] uppercase tracking-[0.14em] text-hp-body hover:border-hp-ink hover:text-hp-ink"
              >
                Claim self
              </button>
              <button
                type="button"
                className="h-8 border border-hp-rule bg-hp-card px-3 text-[10px] uppercase tracking-[0.14em] text-hp-body hover:border-hp-ink hover:text-hp-ink"
              >
                Team queue
              </button>
            </div>
            <button
              type="button"
              className="h-8 border border-hp-ink bg-hp-ink px-4 text-[10px] uppercase tracking-[0.14em] text-hp-foundation hover:bg-hp-body"
            >
              Save state →
            </button>
          </div>
          <p className="text-[10px] italic text-hp-muted">
            Closing or marking lost requires lead quality, ≥1 reason tag, an outcome, and (if
            lost) a lost reason.
          </p>
        </div>
      </DrawerSection>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</span>
      {children}
    </label>
  );
}

function AuditDrawer({ conv }: { conv: SeedConversation }) {
  return (
    <DrawerSection title={`${conv.auditEvents.length} recent events`}>
      {conv.auditEvents.length === 0 ? (
        <p className="text-[12px] italic text-hp-muted">No audit events yet for this conversation.</p>
      ) : (
        <ol className="relative space-y-3 border-l border-hp-rule pl-4">
          {conv.auditEvents.map((e) => (
            <li key={e.id}>
              <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                {e.actor} · {fmtAge(e.createdMin)} ago
              </p>
              <p className="font-[family-name:var(--font-title)] text-[14px] text-hp-ink">
                {e.label}
              </p>
              <p className="text-[12px] italic text-hp-body">{e.summary}</p>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-4 border-t border-hp-rule-soft pt-3 text-[10px] italic text-hp-muted">
        Raw Meta payload stays hidden by design.
      </p>
    </DrawerSection>
  );
}

function NotesDrawer({ conv }: { conv: SeedConversation }) {
  const [body, setBody] = useState("");
  const [type, setType] = useState<"internal_note" | "manager_coaching">("internal_note");
  return (
    <>
      <DrawerSection title={`${conv.notes.length} note${conv.notes.length === 1 ? "" : "s"}`}>
        {conv.notes.length === 0 ? (
          <p className="text-[12px] italic text-hp-muted">No notes yet.</p>
        ) : (
          <ul className="space-y-3">
            {conv.notes.map((n) => (
              <li key={n.id} className="border border-hp-rule-soft bg-hp-foundation/40 px-3 py-2">
                <p className="text-[9px] uppercase tracking-[0.14em] text-hp-muted">
                  {n.type === "manager_coaching" ? "Manager coaching" : "Internal note"} ·{" "}
                  {n.authorName} · {fmtAge(n.createdMin)} ago
                </p>
                <p className="pt-1 text-[12.5px] leading-relaxed text-hp-ink">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </DrawerSection>
      <DrawerSection title="Add note">
        <div className="space-y-2">
          <select
            value={type}
            onChange={(e) =>
              setType(e.target.value as "internal_note" | "manager_coaching")
            }
            className="h-8 w-full border border-hp-rule bg-white px-2 text-[12px] focus:border-hp-ink focus:outline-none"
          >
            <option value="internal_note">Internal note</option>
            <option value="manager_coaching">Manager coaching</option>
          </select>
          <textarea
            rows={4}
            placeholder="Use @name to mention. Notes are never sent to the customer."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="block w-full resize-none border border-hp-rule bg-white px-2 py-1.5 text-[12.5px] focus:border-hp-ink focus:outline-none"
            maxLength={4000}
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              {body.length} / 4000
            </span>
            <button
              type="button"
              disabled={!body.trim()}
              className="h-8 border border-hp-ink bg-hp-ink px-4 text-[10px] uppercase tracking-[0.14em] text-hp-foundation hover:bg-hp-body disabled:opacity-40"
            >
              Add note →
            </button>
          </div>
        </div>
      </DrawerSection>
    </>
  );
}

function QaDrawer({ conv }: { conv: SeedConversation }) {
  return (
    <>
      <DrawerSection
        title={`${conv.qaScorecards.length} scorecard${
          conv.qaScorecards.length === 1 ? "" : "s"
        }`}
      >
        {conv.qaScorecards.length === 0 ? (
          <p className="text-[12px] italic text-hp-muted">
            No scorecards yet. Manager-only review of advisor handling.
          </p>
        ) : (
          <ul className="space-y-3">
            {conv.qaScorecards.map((s) => (
              <li key={s.id} className="border border-hp-rule-soft bg-hp-foundation/40 px-3 py-2">
                <div className="flex items-baseline gap-2">
                  <span
                    className="font-[family-name:var(--font-title)] text-[24px] text-hp-ink"
                    style={{ fontVariantNumeric: "oldstyle-nums proportional-nums" }}
                  >
                    {s.overallScore.toFixed(1)}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                    / 5 · reviewed by {s.reviewer} · advisor {s.reviewedAdvisor}
                  </span>
                </div>
                <p className="pt-1 text-[11px] italic text-hp-body">{s.coachingNote}</p>
                <ul className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                  {Object.entries(s.scores).map(([k, v]) => (
                    <li key={k}>
                      {k.replace(/([A-Z])/g, " $1")}{" "}
                      <span className="text-hp-ink">{v}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </DrawerSection>
      <DrawerSection title="Add scorecard">
        <p className="pb-3 text-[11px] italic text-hp-body">
          Visible to managers and sales leads. Each score 1-5. Overall is the average.
        </p>
        <div className="space-y-2">
          {["Tone", "Completeness", "Accuracy", "Next step", "Speed", "Policy compliance"].map(
            (label) => (
              <div key={label} className="flex items-center gap-2">
                <span className="w-32 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
                  {label}
                </span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="h-7 w-7 border border-hp-rule bg-hp-card text-[12px] hover:border-hp-ink"
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            ),
          )}
          <textarea
            rows={3}
            placeholder="Coaching note (4000 char max)…"
            className="block w-full resize-none border border-hp-rule bg-white px-2 py-1.5 text-[12.5px] focus:border-hp-ink focus:outline-none"
          />
          <div className="flex justify-end">
            <button
              type="button"
              className="h-8 border border-hp-ink bg-hp-ink px-4 text-[10px] uppercase tracking-[0.14em] text-hp-foundation hover:bg-hp-body"
            >
              Add scorecard →
            </button>
          </div>
        </div>
      </DrawerSection>
    </>
  );
}

