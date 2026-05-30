"use client";

import { Search } from "lucide-react";

import type { SocialInboxData } from "../../../lib/social-inbox.ts";
import type { MetaInboxQueueDisplayItem } from "../../../lib/meta-inbox-queue-view.ts";
import {
  META_INBOX_QUEUE_CATEGORIES,
  META_INBOX_SOURCE_CHANNELS,
  type MetaInboxQueueCategoryKey,
} from "../../../lib/meta-inbox-vocabulary.ts";
import { QueueRow } from "./queue-row.tsx";
import { ReadOnlyProvider } from "./read-only-context.tsx";
import type {
  AttributionFilterOptions,
  ItemTypeFilter,
  QueueCategoryFilter,
  SourceChannelFilter,
  StatusFilter,
} from "./use-inbox-filters.ts";

export { QueueRow, queueItemIsOverSla } from "./queue-row.tsx";

type QueueCategoryOption = (typeof META_INBOX_QUEUE_CATEGORIES)[number];

export function QueueRail({
  queue,
  selectedId,
  query,
  onQueryChange,
  queueCategoryFilter,
  onQueueCategoryChange,
  sourceChannelFilter,
  onSourceChannelChange,
  campaignUmbrellaFilter,
  onCampaignUmbrellaChange,
  itemTypeFilter,
  onItemTypeChange,
  statusFilter,
  onStatusChange,
  attributionFilterOptions,
  filtersDirty,
  onResetFilters,
  queueCategories,
  onSelect,
  now,
  readOnly,
  userNames,
}: {
  queue: MetaInboxQueueDisplayItem[];
  selectedId: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  queueCategoryFilter: QueueCategoryFilter;
  onQueueCategoryChange: (value: QueueCategoryFilter) => void;
  sourceChannelFilter: SourceChannelFilter;
  onSourceChannelChange: (value: SourceChannelFilter) => void;
  campaignUmbrellaFilter: string;
  onCampaignUmbrellaChange: (value: string) => void;
  itemTypeFilter: ItemTypeFilter;
  onItemTypeChange: (value: ItemTypeFilter) => void;
  statusFilter: StatusFilter;
  onStatusChange: (value: StatusFilter) => void;
  attributionFilterOptions: AttributionFilterOptions;
  filtersDirty: boolean;
  onResetFilters: () => void;
  queueCategories: readonly QueueCategoryOption[];
  onSelect: (item: MetaInboxQueueDisplayItem) => void;
  now?: Date | number;
  // Selection-only rail; readOnly provides ReadOnly context for the peek
  // subtree. The rail has no mutation controls of its own to hide.
  readOnly?: boolean;
  // Resolved assignee names, loaded once by the parent and passed down so the
  // rail stays a pure (hook-free) component.
  userNames?: Map<string, string> | null;
}) {
  const content = (
    <aside
      data-component="queue-rail"
      className="flex min-h-[720px] min-w-0 flex-col bg-hp-card xl:h-full xl:min-h-0"
    >
      <div className="border-b border-hp-rule p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            Unified Queue
          </span>
          <span className="text-[11px] text-hp-muted oldstyle-nums">
            {queue.length} {queue.length === 1 ? "conversation" : "conversations"} ·{" "}
            {filtersDirty ? (
              <button
                type="button"
                onClick={onResetFilters}
                className="text-hp-pink underline underline-offset-4"
              >
                Reset
              </button>
            ) : (
              "Sorted by age"
            )}
          </span>
        </div>

        <label className="flex h-10 items-center gap-2 border border-hp-rule bg-hp-foundation px-3 focus-within:border-hp-ink">
          <Search size={15} className="shrink-0 text-hp-muted" />
          <input
            aria-label="Search conversations"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search sender, handle, ad, or thread"
            className="min-w-0 flex-1 bg-transparent text-sm text-hp-ink outline-none placeholder:text-hp-muted"
          />
        </label>

        <div className="mt-3">
          <input
            id="queue-filter-disclosure"
            data-component="queue-filter-disclosure"
            type="checkbox"
            aria-label="Toggle filters"
            className="peer sr-only"
          />
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
            <label className="grid gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">Queue</span>
              <select
                aria-label="Queue category"
                value={queueCategoryFilter}
                onChange={(event) =>
                  onQueueCategoryChange(event.target.value as QueueCategoryFilter)
                }
                className="h-10 w-full border border-hp-rule bg-hp-foundation px-3 text-sm text-hp-ink outline-none transition-colors focus:border-hp-ink"
              >
                <option value="all">All categories</option>
                {queueCategories.map((category) => (
                  <option key={category.key} value={category.key}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>

            <label
              htmlFor="queue-filter-disclosure"
              role="button"
              className="flex h-10 cursor-pointer items-center border border-hp-rule bg-hp-card px-3 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition-colors hover:border-hp-ink peer-checked:border-hp-ink peer-checked:bg-hp-ink peer-checked:text-hp-foundation"
            >
              + Filters
            </label>
          </div>

          <div className="mt-4 hidden gap-3 border-t border-hp-rule pt-4 peer-checked:grid">
            <FilterRow
              label="Source Channel"
              ariaLabel="Source channel"
              value={sourceChannelFilter}
              onChange={(value) => onSourceChannelChange(value as SourceChannelFilter)}
              options={[
                ["all", "All Channels"],
                ...META_INBOX_SOURCE_CHANNELS.map((channel) => [
                  channel.key,
                  channel.label,
                ] as [string, string]),
              ]}
            />
            <FilterRow
              label="Campaign Umbrella"
              ariaLabel="Campaign umbrella"
              value={campaignUmbrellaFilter}
              onChange={onCampaignUmbrellaChange}
              options={[
                ["all", "All Campaign Umbrellas"],
                ...attributionFilterOptions.campaignUmbrellas,
              ]}
            />
            <div className="grid grid-cols-2 gap-3">
              <FilterRow
                label="Item Type"
                ariaLabel="Item type"
                value={itemTypeFilter}
                onChange={(value) => onItemTypeChange(value as ItemTypeFilter)}
                options={[
                  ["all", "All Items"],
                  ["messages", "Messages"],
                  ["comments", "Comments"],
                ]}
              />
              <FilterRow
                label="Status"
                ariaLabel="Status"
                value={statusFilter}
                onChange={(value) => onStatusChange(value as StatusFilter)}
                options={[
                  ["all", "All Statuses"],
                  ["needs-reply", "Needs Reply"],
                  ["follow-up", "Follow-Up"],
                ]}
              />
            </div>
            {filtersDirty ? (
              <div className="border-t border-hp-rule pt-3">
                <button
                  type="button"
                  onClick={onResetFilters}
                  className="text-[10px] uppercase tracking-[0.14em] text-hp-pink underline underline-offset-4"
                >
                  Reset
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {queue.length ? (
          queue.map((item) => (
            <QueueRow
              key={item.id}
              item={item}
              active={selectedId === item.id}
              now={now}
              onSelect={() => onSelect(item)}
              userNames={userNames}
            />
          ))
        ) : (
          <div className="p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center border border-hp-rule text-hp-muted">
              <Search size={18} />
            </div>
            <h2 className="mt-4 font-title text-2xl text-hp-ink">No conversations match.</h2>
            <p className="mt-2 text-sm leading-6 text-hp-muted">
              {filtersDirty
                ? "Try resetting."
                : "Inbox is empty for the current connection."}
            </p>
            {filtersDirty ? (
              <button
                type="button"
                onClick={onResetFilters}
                className="mt-4 text-[10px] uppercase tracking-[0.14em] text-hp-pink underline underline-offset-4"
              >
                Reset
              </button>
            ) : null}
          </div>
        )}
      </div>
    </aside>
  );

  return readOnly ? <ReadOnlyProvider value>{content}</ReadOnlyProvider> : content;
}

function FilterRow({
  label,
  ariaLabel,
  value,
  onChange,
  options,
}: {
  label: string;
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="grid min-w-0 gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">{label}</span>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full border border-hp-rule bg-hp-foundation px-2 text-[11px] text-hp-ink outline-none transition-colors focus:border-hp-ink"
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

export function visibleQueueCategories(
  data: Pick<SocialInboxData, "queueAccess">,
): readonly QueueCategoryOption[] {
  if (data.queueAccess.mode !== "team") return META_INBOX_QUEUE_CATEGORIES;

  const allowed = new Set(data.queueAccess.allowedQueueCategoryKeys);
  return META_INBOX_QUEUE_CATEGORIES.filter((category) =>
    allowed.has(category.key as MetaInboxQueueCategoryKey),
  );
}
