"use client";

/**
 * Change Log — consolidated Analyst page.
 *
 * One record, two readouts: Timeline (default, readable) / Table (dense
 * lookup) over the SAME filtered set. The filter bar (range, brand, type,
 * campaign/ad set name) drives that record. Conversational capture is the
 * add flow, not a second log: talk -> AI draft -> confirm -> entry joins
 * the record. The right rail explains where the log surfaces; it does not
 * repeat the entries.
 *
 * Ported from the validated throwaway prototype, swapping fixtures for real
 * `ChangeLogEntry` data and the bespoke brand/type chips for the shared
 * `FilterChipGroup`.
 */

import { useCallback, useMemo, useState } from "react";

import { FilterChipGroup } from "@/components/filter-chip-group";
import { applyChangeLogFilters } from "@/lib/change-log-filters";
import {
  CHANGE_TYPES,
  type BrandCode,
  type ChangeLogDraft,
  type ChangeLogEntityRef,
  type ChangeLogEntry,
  type ChangeType,
  type VerifyEntity,
  type VerifyValue,
} from "@/lib/change-log-types";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const TITLE = "font-[family-name:var(--font-title)]";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
function fmtShort(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

function titleCase(value: string) {
  return value.length ? value[0].toUpperCase() + value.slice(1) : value;
}

const ENTITY_KIND_LABEL: Record<ChangeLogEntityRef["entityKind"], string> = {
  ad_set: "Ad set",
  campaign: "Campaign",
  creative: "Creative",
  account: "Account",
  website: "Website",
};

// Derive a short display name + initials from the creator's email. We only
// store an email on the entry, so this is the most we can show.
function authorFromEmail(email: string | null): { name: string; initials: string } {
  if (!email) return { name: "System", initials: "SY" };
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[.\-_]+/).filter(Boolean);
  const initials = (parts.length >= 2
    ? parts[0][0] + parts[1][0]
    : local.slice(0, 2)
  ).toUpperCase();
  const name = parts.length
    ? parts.map((p) => titleCase(p)).join(" ")
    : local;
  return { name, initials };
}

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="smallcaps text-[11px] text-hp-muted">{children}</span>;
}

function TypeTag({ type }: { type: ChangeType }) {
  return (
    <span className="smallcaps inline-flex h-5 items-center border border-hp-rule px-2 text-[10px] text-hp-body">
      {titleCase(type)}
    </span>
  );
}

function BrandTag({ brand }: { brand: BrandCode }) {
  return (
    <span className="smallcaps inline-flex h-5 items-center border border-hp-rule bg-hp-inset px-2 text-[10px] text-hp-ink">
      {brand}
    </span>
  );
}

function EntityChip({ entity }: { entity: ChangeLogEntityRef }) {
  return (
    <span className="inline-flex items-center gap-1 border border-hp-rule-soft px-2 py-0.5 text-[12px] text-hp-body">
      <span className="smallcaps text-[9px] text-hp-muted">{ENTITY_KIND_LABEL[entity.entityKind]}</span>
      <span>{entity.entityName}</span>
      {entity.entityMetaId ? (
        <span className="text-[11px] text-hp-platinum lining-nums">{entity.entityMetaId}</span>
      ) : null}
    </span>
  );
}

function VerifyBadge({
  entity,
  value,
  compact = false,
}: {
  entity: VerifyEntity;
  value: VerifyValue;
  compact?: boolean;
}) {
  const parts: { label: string; tone: "ok" | "warn" | "muted" }[] = [];
  if (entity === "matched") parts.push({ label: compact ? "Matched" : "Entity matched", tone: "ok" });
  else if (entity === "ambiguous") parts.push({ label: "Ambiguous", tone: "warn" });
  else parts.push({ label: compact ? "No entity" : "No linked entity", tone: "muted" });
  if (value === "confirmed") parts.push({ label: compact ? "Confirmed" : "Live value confirmed", tone: "ok" });
  else if (value === "mismatch") parts.push({ label: "Mismatch", tone: "warn" });
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {parts.map((p) => (
        <span
          key={p.label}
          className={[
            "smallcaps inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px]",
            p.tone === "ok"
              ? "bg-signal-positive-bg text-signal-positive"
              : p.tone === "warn"
                ? "bg-signal-warning-bg text-signal-warning"
                : "text-hp-muted",
          ].join(" ")}
        >
          {p.tone === "ok" ? "✓ " : p.tone === "warn" ? "⚠ " : ""}
          {p.label}
        </span>
      ))}
    </span>
  );
}

function CitedTag({ count }: { count: number }) {
  return (
    <span
      className="smallcaps inline-flex items-center gap-1 text-[10px] text-hp-pink"
      title={`Referenced in ${count} AI analyses`}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-hp-pink" />
      Cited in {count}
    </span>
  );
}

function Avatar({ initials }: { initials: string }) {
  return (
    <span className="smallcaps inline-flex h-6 w-6 items-center justify-center rounded-full border border-hp-rule bg-hp-inset text-[9px] text-hp-ink">
      {initials}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Capture: conversational add flow (ephemeral, not a second log)      */
/* ------------------------------------------------------------------ */

function DraftField({
  label,
  children,
  flagged,
}: {
  label: string;
  children: React.ReactNode;
  flagged?: string | null;
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-start gap-3 border-b border-hp-rule-soft py-2 last:border-b-0">
      <Eyebrow>{label}</Eyebrow>
      <div className="text-[15px] text-hp-body">
        {children}
        {flagged ? <span className="smallcaps mt-1 block text-[9px] text-signal-warning">{flagged}</span> : null}
      </div>
    </div>
  );
}

function DraftCard({ draft }: { draft: ChangeLogDraft }) {
  const effective = draft.effectiveStart
    ? `${fmtDate(draft.effectiveStart)}${draft.effectiveEnd ? ` to ${fmtDate(draft.effectiveEnd)}` : ", ongoing"}`
    : null;
  return (
    <div className="border border-hp-rule bg-hp-card">
      <div className="flex items-center justify-between border-b border-hp-rule px-4 py-2.5">
        <Eyebrow>Draft from your message</Eyebrow>
        <VerifyBadge entity={draft.verifyEntity} value={draft.verifyValue} />
      </div>
      <div className="px-4 py-1">
        <DraftField label="What">
          <div className="flex flex-wrap items-center gap-2">
            <BrandTag brand={draft.brandCode} />
            <TypeTag type={draft.changeType} />
            {draft.beforeValue ? (
              <>
                <span className="text-hp-ink">{draft.beforeValue}</span>
                <span className="text-hp-muted">to</span>
                <span className="text-hp-ink">{draft.afterValue}</span>
              </>
            ) : (
              <span className="text-hp-ink">{draft.title}</span>
            )}
          </div>
        </DraftField>
        {draft.entities.length ? (
          <DraftField label="Entity">
            <span className="flex flex-wrap gap-2">
              {draft.entities.map((en) => (
                <EntityChip key={en.entityName + (en.entityMetaId ?? "")} entity={en} />
              ))}
            </span>
          </DraftField>
        ) : null}
        <DraftField label="When" flagged={draft.eventDateNote}>
          {fmtDate(draft.eventDate)}
          {effective ? <span className="text-hp-muted"> &middot; effective {effective}</span> : null}
        </DraftField>
        <DraftField label="Reason">
          <span className="oldstyle-nums">{draft.reason}</span>
        </DraftField>
        {draft.warnings.length ? (
          <DraftField label="Heads up">
            <ul className="space-y-1">
              {draft.warnings.map((w) => (
                <li key={w} className="smallcaps text-[10px] text-signal-warning">
                  {w}
                </li>
              ))}
            </ul>
          </DraftField>
        ) : null}
      </div>
    </div>
  );
}

function CapturePanel({
  onRequestDraft,
  onSave,
  onClose,
}: {
  onRequestDraft: (text: string, brandCode: BrandCode) => Promise<ChangeLogDraft>;
  onSave: (draft: ChangeLogDraft) => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [brandCode, setBrandCode] = useState<BrandCode>("HP");
  const [draft, setDraft] = useState<ChangeLogDraft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDraft() {
    if (!text.trim() || drafting) return;
    setDrafting(true);
    setError(null);
    try {
      setDraft(await onRequestDraft(text, brandCode));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draft failed");
    } finally {
      setDrafting(false);
    }
  }

  async function handleSave() {
    if (!draft || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <div className="border border-hp-rule bg-hp-card">
      <div className="flex items-center justify-between border-b border-hp-rule px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className={`${TITLE} text-lg text-hp-ink`}>Add a change</span>
          <span className="text-[13px] text-hp-muted">tell me in plain words, I draft it, you confirm</span>
        </div>
        <button onClick={onClose} className="smallcaps text-[10px] text-hp-pink" type="button">
          Close
        </button>
      </div>
      <div className="grid grid-cols-1 gap-5 px-4 py-4 lg:grid-cols-2">
        {/* conversation */}
        <div className="space-y-3">
          <p className="text-[14px] leading-relaxed text-hp-body">
            What changed? For example: a budget change, a paused ad set, a new creative, or a promo you are running.
          </p>
          <div>
            <div className="mb-2">
              <FilterChipGroup
                label="Brand"
                value={brandCode}
                onChange={(v) => setBrandCode(v as BrandCode)}
                options={[
                  { value: "HP", label: "HP" },
                  { value: "VVS", label: "VVS" },
                ]}
              />
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="Last Friday I raised the Cash for Gold budget to about $120/day. ROAS was strong and Father's Day is coming up."
              aria-label="Change description"
              className="w-full border border-hp-rule bg-white px-3 py-2 text-[15px] leading-relaxed text-hp-body outline-none placeholder:text-hp-muted focus:border-hp-ink"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="smallcaps text-[10px] text-signal-warning">{error ?? ""}</span>
            <button
              onClick={handleDraft}
              disabled={!text.trim() || drafting}
              className="smallcaps h-9 bg-hp-ink px-4 text-[11px] text-hp-foundation hover:opacity-90 disabled:opacity-40"
              type="button"
            >
              {drafting ? "Drafting…" : "Draft it"}
            </button>
          </div>
        </div>
        {/* draft + confirm */}
        <div className="space-y-3">
          {draft ? (
            <>
              <DraftCard draft={draft} />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={onClose}
                  className="smallcaps h-9 border border-hp-rule px-3 text-[11px] text-hp-body hover:border-hp-ink hover:bg-hp-inset"
                  type="button"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="smallcaps h-9 bg-hp-ink px-4 text-[11px] text-hp-foundation hover:opacity-90 disabled:opacity-40"
                  type="button"
                >
                  {saving ? "Saving…" : "Save to log"}
                </button>
              </div>
            </>
          ) : (
            <div className="flex h-full min-h-[160px] items-center justify-center border border-dashed border-hp-rule-soft px-4 py-8 text-center">
              <p className="text-[14px] leading-relaxed text-hp-muted">
                {drafting
                  ? "Reading your note, matching the entity, and checking the live value…"
                  : "Your drafted entry will appear here for review before it joins the log."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Readout: timeline (default) and table (same data)                   */
/* ------------------------------------------------------------------ */

function EmptyState() {
  return (
    <div className="border border-hp-rule bg-hp-card px-6 py-10 text-center">
      <p className={`${TITLE} text-xl text-hp-ink`}>No changes match these filters.</p>
      <p className="mt-1 text-[14px] text-hp-muted">Widen the date range or clear a filter.</p>
    </div>
  );
}

function TimelineView({ entries }: { entries: ChangeLogEntry[] }) {
  const groups = useMemo(() => {
    const m = new Map<string, ChangeLogEntry[]>();
    for (const e of entries) m.set(e.eventDate, [...(m.get(e.eventDate) ?? []), e]);
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [entries]);

  if (!entries.length) return <EmptyState />;

  return (
    <ol className="relative border-l border-hp-rule pl-6">
      {groups.map(([date, items]) => (
        <li key={date} className="relative mb-7 last:mb-0">
          <span className="absolute -left-[1.65rem] top-1.5 h-2 w-2 rounded-full border border-hp-rule bg-hp-foundation" />
          <div className={`${TITLE} mb-2 text-xl text-hp-ink`}>{fmtDate(date)}</div>
          <div className="space-y-3">
            {items.map((e) => {
              const author = authorFromEmail(e.createdByEmail);
              const window = e.effectiveStart ? (e.effectiveEnd ? "window" : "ongoing") : null;
              return (
                <article key={e.id} className="border border-hp-rule bg-hp-card p-4">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <BrandTag brand={e.brandCode} />
                    <TypeTag type={e.changeType} />
                    {window ? (
                      <span className="smallcaps inline-flex items-center gap-1 text-[9px] text-hp-pink">
                        <span className="inline-block h-2 w-3 bg-hp-pink/15" />
                        {window}
                      </span>
                    ) : null}
                    {e.citationCount > 0 ? <CitedTag count={e.citationCount} /> : null}
                  </div>
                  <h3 className={`${TITLE} text-lg leading-snug text-hp-ink`}>{e.title}</h3>
                  {e.beforeValue ? (
                    <p className="mt-1 text-[13px] text-hp-muted">
                      <span className="text-hp-body">{e.beforeValue}</span> to{" "}
                      <span className="text-hp-body">{e.afterValue}</span>
                    </p>
                  ) : null}
                  {e.reason ? (
                    <p className="mt-2 max-w-[64ch] text-[15px] leading-relaxed text-hp-body oldstyle-nums">
                      {e.reason}
                    </p>
                  ) : null}
                  {e.entities.length ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {e.entities.map((en) => (
                        <EntityChip key={en.entityName + (en.entityMetaId ?? "")} entity={en} />
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-hp-rule-soft pt-2.5">
                    <span className="flex items-center gap-1.5 text-[11px] text-hp-muted">
                      <Avatar initials={author.initials} />
                      {author.name}
                    </span>
                    <VerifyBadge entity={e.verifyEntity} value={e.verifyValue} />
                  </div>
                </article>
              );
            })}
          </div>
        </li>
      ))}
    </ol>
  );
}

function TableView({ entries }: { entries: ChangeLogEntry[] }) {
  if (!entries.length) return <EmptyState />;
  return (
    <div className="border border-hp-rule">
      <div className="grid grid-cols-[88px_44px_92px_minmax(0,1fr)_minmax(0,1fr)_120px] items-center gap-3 border-b border-hp-rule bg-hp-card px-4 py-2">
        {["Date", "Brand", "Type", "Change", "Entity", "Logged by"].map((h) => (
          <Eyebrow key={h}>{h}</Eyebrow>
        ))}
      </div>
      <ul>
        {entries.map((e) => {
          const author = authorFromEmail(e.createdByEmail);
          return (
            <li
              key={e.id}
              className="grid grid-cols-[88px_44px_92px_minmax(0,1fr)_minmax(0,1fr)_120px] items-center gap-3 border-b border-hp-rule-soft px-4 py-2.5 last:border-b-0 hover:bg-hp-inset/40"
            >
              <span className="smallcaps text-[10px] text-hp-ink lining-nums">{fmtShort(e.eventDate)}</span>
              <span>
                <BrandTag brand={e.brandCode} />
              </span>
              <span>
                <TypeTag type={e.changeType} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] text-hp-ink" title={e.title}>
                  {e.title}
                </span>
                <span className="flex items-center gap-2">
                  {e.beforeValue ? (
                    <span className="text-[11px] text-hp-muted">
                      {e.beforeValue} to {e.afterValue}
                    </span>
                  ) : null}
                  {e.citationCount > 0 ? <CitedTag count={e.citationCount} /> : null}
                </span>
              </span>
              <span
                className="min-w-0 truncate text-[12px] text-hp-body"
                title={e.entities.map((x) => x.entityName).join(", ")}
              >
                {e.entities[0]?.entityName}
                {e.entities.length > 1 ? ` +${e.entities.length - 1}` : ""}
              </span>
              <span className="flex items-center justify-between gap-1">
                <span className="flex items-center gap-1.5 text-[11px] text-hp-muted">
                  <Avatar initials={author.initials} />
                  {author.name}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Right aside: where this log shows up (NOT a repeat of the entries)  */
/* ------------------------------------------------------------------ */

function UsageAside() {
  return (
    <div className="space-y-4 lg:sticky lg:top-28">
      <div className="border border-hp-rule bg-hp-card p-4">
        <Eyebrow>Where this log shows up</Eyebrow>
        <ul className="mt-3 space-y-3 text-[14px] leading-snug text-hp-body">
          <li className="flex gap-2">
            <span className="mt-1 inline-block h-1.5 w-3 shrink-0 bg-hp-pink/20" />
            <span>As shaded bands and marks on dashboard charts, at the date each change took effect.</span>
          </li>
          <li className="flex gap-2">
            <span className="smallcaps mt-0.5 shrink-0 text-[10px] text-hp-pink">AI</span>
            <span>Inside Ask AI and the workbench, as grounding the model cites when it explains a change.</span>
          </li>
        </ul>
      </div>
      <div className="border border-hp-rule bg-hp-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <Eyebrow>Ask AI, grounded by this log</Eyebrow>
          <span className="smallcaps text-[9px] text-hp-muted">Auto</span>
        </div>
        <p className="text-[14px] leading-relaxed text-hp-body">
          When the model explains a swing in spend or ROAS, it reaches into this log first, so its answer cites the exact
          change you logged and the date it took effect, instead of guessing.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Filter bar primitives                                               */
/* ------------------------------------------------------------------ */

type Range = "7" | "30" | "90" | "all";
const RANGE_DAYS: Record<Range, number | null> = { "7": 7, "30": 30, "90": 90, all: null };
const RANGE_LABEL: Record<Range, string> = {
  "7": "7 days",
  "30": "30 days",
  "90": "90 days",
  all: "All time",
};

function Seg<T extends string>({
  value,
  options,
  onChange,
  labelOf,
}: {
  value: T;
  options: T[];
  onChange: (v: T) => void;
  labelOf?: (v: T) => string;
}) {
  return (
    <div className="inline-flex border border-hp-rule">
      {options.map((o, i) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          type="button"
          className={[
            "smallcaps h-9 px-2.5 text-[10px]",
            i > 0 ? "border-l border-hp-rule" : "",
            o === value ? "bg-hp-ink text-hp-foundation" : "text-hp-body hover:bg-hp-inset",
          ].join(" ")}
        >
          {labelOf ? labelOf(o) : o}
        </button>
      ))}
    </div>
  );
}

function Field({
  label,
  children,
  align = "left",
}: {
  label: string;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className="mb-1">
        <Eyebrow>{label}</Eyebrow>
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Root                                                                */
/* ------------------------------------------------------------------ */

const ALL = "__all__";

export function ChangeLogClient({
  initialEntries,
  today,
}: {
  initialEntries: ChangeLogEntry[];
  today: string;
}) {
  const [entries, setEntries] = useState<ChangeLogEntry[]>(initialEntries);
  const [view, setView] = useState<"timeline" | "table">("timeline");
  const [range, setRange] = useState<Range>("30");
  const [brandCode, setBrandCode] = useState<BrandCode | null>(null);
  const [changeType, setChangeType] = useState<ChangeType | null>(null);
  const [query, setQuery] = useState("");
  const [capture, setCapture] = useState(false);

  const filtered = useMemo(
    () =>
      applyChangeLogFilters(
        entries,
        { rangeDays: RANGE_DAYS[range], brandCode, changeType, query },
        today,
      ),
    [entries, range, brandCode, changeType, query, today],
  );

  const cited = filtered.filter((e) => e.citationCount > 0).length;

  const requestDraft = useCallback(
    async (text: string, brand: BrandCode): Promise<ChangeLogDraft> => {
      const res = await fetch("/api/change-log/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, brandCode: brand, today }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Draft failed");
      return ((await res.json()) as { draft: ChangeLogDraft }).draft;
    },
    [today],
  );

  const saveDraft = useCallback(async (draft: ChangeLogDraft): Promise<void> => {
    const res = await fetch("/api/change-log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draft }),
    });
    if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Save failed");
    const refetchRes = await fetch("/api/change-log");
    if (refetchRes.ok) {
      const list = (await refetchRes.json()) as { entries: ChangeLogEntry[] };
      setEntries(list.entries);
    }
    // On refetch failure, keep the existing list (the save already succeeded).
  }, []);

  return (
    <div className="min-h-screen bg-hp-foundation text-hp-body">
      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* heading: single gilt mark per view, here */}
        <div className="mb-3 flex items-baseline gap-3">
          <span className="text-hp-gilt" aria-hidden="true">&#10086;</span>
          <Eyebrow>Change Log</Eyebrow>
        </div>
        <header className="flex flex-col gap-2 border-b border-hp-rule pb-5 md:flex-row md:items-end md:justify-between">
          <p className={`${TITLE} max-w-[48ch] text-2xl leading-snug text-hp-ink`}>
            {range === "all"
              ? `${filtered.length} change${filtered.length === 1 ? "" : "s"} across all time.`
              : `${filtered.length} change${filtered.length === 1 ? "" : "s"} in the last ${RANGE_LABEL[range].toLowerCase()}.`}
            {cited ? ` ${cited} cited by AI analysis.` : ""}
          </p>
          <button
            onClick={() => setCapture((v) => !v)}
            className="smallcaps inline-flex h-10 items-center self-start bg-hp-ink px-4 text-[11px] text-hp-foundation hover:opacity-90 md:self-auto"
            type="button"
          >
            {capture ? "Close" : "Add a change"}
          </button>
        </header>

        {/* conversational capture (ephemeral add flow) */}
        {capture ? (
          <div className="mt-5">
            <CapturePanel
              onRequestDraft={requestDraft}
              onSave={saveDraft}
              onClose={() => setCapture(false)}
            />
          </div>
        ) : null}

        {/* filter bar + view toggle, drives the single record below */}
        <div className="mt-6 flex flex-wrap items-end gap-x-6 gap-y-3 border-b border-hp-rule-soft pb-4">
          <Field label="Range">
            <Seg
              value={range}
              options={["7", "30", "90", "all"]}
              onChange={setRange}
              labelOf={(r) => RANGE_LABEL[r as Range]}
            />
          </Field>
          <FilterChipGroup
            label="Brand"
            value={brandCode ?? ALL}
            onChange={(v) => setBrandCode(v === ALL ? null : (v as BrandCode))}
            options={[
              { value: ALL, label: "All" },
              { value: "HP", label: "HP" },
              { value: "VVS", label: "VVS" },
            ]}
          />
          <FilterChipGroup
            label="Type"
            value={changeType ?? ALL}
            onChange={(v) => setChangeType(v === ALL ? null : (v as ChangeType))}
            options={[
              { value: ALL, label: "All" },
              ...CHANGE_TYPES.map((t) => ({ value: t, label: titleCase(t) })),
            ]}
          />
          <Field label="Campaign or ad set">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name"
              aria-label="Filter by campaign or ad set"
              className="h-9 w-56 border border-hp-rule bg-white px-2.5 text-[13px] text-hp-body outline-none placeholder:text-hp-muted focus:border-hp-ink"
            />
          </Field>
          <div className="ml-auto">
            <Field label="View" align="right">
              <Seg
                value={view}
                options={["timeline", "table"]}
                onChange={setView}
                labelOf={(v) => (v === "timeline" ? "Timeline" : "Table")}
              />
            </Field>
          </div>
        </div>

        {/* one record (timeline OR table) + usage aside */}
        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
          <div>{view === "timeline" ? <TimelineView entries={filtered} /> : <TableView entries={filtered} />}</div>
          <aside>
            <UsageAside />
          </aside>
        </div>
      </main>
      <div className="h-12" />
    </div>
  );
}
