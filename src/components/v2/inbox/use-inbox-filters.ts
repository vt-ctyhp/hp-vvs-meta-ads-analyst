"use client";

import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { MetaInboxQueueDisplayItem } from "../../../lib/meta-inbox-queue-view.ts";
import type {
  MetaInboxQueueCategoryKey,
  MetaInboxSourceChannelKey,
} from "../../../lib/meta-inbox-vocabulary.ts";

import { computeConversationSearchHaystack } from "./conversation-search-haystack.ts";

export type BrandFilter = "all" | "HP" | "VVS";
export type SourceFilter = "all" | "facebook" | "instagram";
export type SourceChannelFilter = "all" | MetaInboxSourceChannelKey;
export type QueueCategoryFilter = "all" | MetaInboxQueueCategoryKey;
export type ItemTypeFilter = "all" | "messages" | "comments";
export type StatusFilter = "all" | "needs-reply";

export type AttributionFilterOptions = {
  campaignUmbrellas: [string, string][];
  ads: [string, string][];
  creatives: [string, string][];
};

export type UseInboxFiltersReturn = {
  brandFilter: BrandFilter;
  setBrandFilter: Dispatch<SetStateAction<BrandFilter>>;
  sourceFilter: SourceFilter;
  setSourceFilter: Dispatch<SetStateAction<SourceFilter>>;
  itemTypeFilter: ItemTypeFilter;
  setItemTypeFilter: Dispatch<SetStateAction<ItemTypeFilter>>;
  statusFilter: StatusFilter;
  setStatusFilter: Dispatch<SetStateAction<StatusFilter>>;
  queueCategoryFilter: QueueCategoryFilter;
  setQueueCategoryFilter: Dispatch<SetStateAction<QueueCategoryFilter>>;
  effectiveQueueCategoryFilter: QueueCategoryFilter;
  sourceChannelFilter: SourceChannelFilter;
  setSourceChannelFilter: Dispatch<SetStateAction<SourceChannelFilter>>;
  campaignUmbrellaFilter: string;
  setCampaignUmbrellaFilter: Dispatch<SetStateAction<string>>;
  adFilter: string;
  setAdFilter: Dispatch<SetStateAction<string>>;
  creativeFilter: string;
  setCreativeFilter: Dispatch<SetStateAction<string>>;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  filteredQueue: MetaInboxQueueDisplayItem[];
  attributionFilterOptions: AttributionFilterOptions;
  filtersDirty: boolean;
  reset: () => void;
};

export function useInboxFilters(
  queue: MetaInboxQueueDisplayItem[],
  options: { visibleQueueKeys?: ReadonlySet<MetaInboxQueueCategoryKey> } = {},
): UseInboxFiltersReturn {
  const [brandFilter, setBrandFilter] = useState<BrandFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [itemTypeFilter, setItemTypeFilter] = useState<ItemTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [queueCategoryFilter, setQueueCategoryFilter] = useState<QueueCategoryFilter>("all");
  const [sourceChannelFilter, setSourceChannelFilter] = useState<SourceChannelFilter>("all");
  const [campaignUmbrellaFilter, setCampaignUmbrellaFilter] = useState("all");
  const [adFilter, setAdFilter] = useState("all");
  const [creativeFilter, setCreativeFilter] = useState("all");
  const [query, setQuery] = useState("");

  const effectiveQueueCategoryFilter =
    queueCategoryFilter !== "all" &&
    options.visibleQueueKeys &&
    !options.visibleQueueKeys.has(queueCategoryFilter)
      ? "all"
      : queueCategoryFilter;

  const attributionFilterOptions = useMemo(
    () => buildAttributionFilterOptions(queue),
    [queue],
  );

  const filteredQueue = useMemo(
    () =>
      queue.filter((item) => {
        if (brandFilter !== "all" && item.brand !== brandFilter) return false;
        if (sourceFilter !== "all" && item.platform !== sourceFilter) return false;
        if (sourceChannelFilter !== "all" && item.sourceChannel !== sourceChannelFilter) {
          return false;
        }
        if (
          effectiveQueueCategoryFilter !== "all" &&
          item.queueCategoryKey !== effectiveQueueCategoryFilter
        ) {
          return false;
        }
        if (
          campaignUmbrellaFilter !== "all" &&
          item.firstTouch?.campaign_umbrella_id !== campaignUmbrellaFilter
        ) {
          return false;
        }
        if (adFilter !== "all" && item.firstTouch?.ad_id !== adFilter) return false;
        if (creativeFilter !== "all" && item.firstTouch?.creative_id !== creativeFilter) {
          return false;
        }
        if (itemTypeFilter === "messages" && item.type !== "message") return false;
        if (itemTypeFilter === "comments" && item.type !== "comment") return false;
        if (statusFilter === "needs-reply" && item.status !== "Needs reply") return false;

        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) return true;
        return computeConversationSearchHaystack(item).includes(normalizedQuery);
      }),
    [
      adFilter,
      brandFilter,
      campaignUmbrellaFilter,
      creativeFilter,
      effectiveQueueCategoryFilter,
      itemTypeFilter,
      query,
      queue,
      sourceChannelFilter,
      sourceFilter,
      statusFilter,
    ],
  );

  const filtersDirty =
    brandFilter !== "all" ||
    sourceFilter !== "all" ||
    itemTypeFilter !== "all" ||
    statusFilter !== "all" ||
    queueCategoryFilter !== "all" ||
    sourceChannelFilter !== "all" ||
    campaignUmbrellaFilter !== "all" ||
    adFilter !== "all" ||
    creativeFilter !== "all" ||
    query.trim() !== "";

  const reset = useCallback(() => {
    setBrandFilter("all");
    setSourceFilter("all");
    setSourceChannelFilter("all");
    setQueueCategoryFilter("all");
    setCampaignUmbrellaFilter("all");
    setAdFilter("all");
    setCreativeFilter("all");
    setItemTypeFilter("all");
    setStatusFilter("all");
    setQuery("");
  }, []);

  return {
    brandFilter,
    setBrandFilter,
    sourceFilter,
    setSourceFilter,
    itemTypeFilter,
    setItemTypeFilter,
    statusFilter,
    setStatusFilter,
    queueCategoryFilter,
    setQueueCategoryFilter,
    effectiveQueueCategoryFilter,
    sourceChannelFilter,
    setSourceChannelFilter,
    campaignUmbrellaFilter,
    setCampaignUmbrellaFilter,
    adFilter,
    setAdFilter,
    creativeFilter,
    setCreativeFilter,
    query,
    setQuery,
    filteredQueue,
    attributionFilterOptions,
    filtersDirty,
    reset,
  };
}

export function buildAttributionFilterOptions(
  queue: MetaInboxQueueDisplayItem[],
): AttributionFilterOptions {
  return {
    campaignUmbrellas: uniqueAttributionOptions(
      queue,
      (item) => item.firstTouch?.campaign_umbrella_id || null,
      (item) => item.firstTouch?.campaign_umbrella_id || item.firstTouch?.ref || null,
    ),
    ads: uniqueAttributionOptions(
      queue,
      (item) => item.firstTouch?.ad_id || null,
      (item) =>
        attributionOptionLabel(
          "Ad",
          item.firstTouch?.ad_id || null,
          item.firstTouch?.ref || null,
        ),
    ),
    creatives: uniqueAttributionOptions(
      queue,
      (item) => item.firstTouch?.creative_id || null,
      (item) =>
        attributionOptionLabel(
          "Creative",
          item.firstTouch?.creative_id || null,
          item.firstTouch?.ref || null,
        ),
    ),
  };
}

function uniqueAttributionOptions(
  queue: MetaInboxQueueDisplayItem[],
  valueForItem: (item: MetaInboxQueueDisplayItem) => string | null,
  labelForItem: (item: MetaInboxQueueDisplayItem) => string | null,
): [string, string][] {
  const attributionOptions = new Map<string, string>();
  for (const item of queue) {
    const value = valueForItem(item);
    if (!value || attributionOptions.has(value)) continue;
    attributionOptions.set(value, labelForItem(item) || value);
  }
  return Array.from(attributionOptions.entries()).sort((a, b) => a[1].localeCompare(b[1]));
}

function attributionOptionLabel(prefix: string, id: string | null, ref: string | null) {
  if (!id) return null;
  const short = id.length <= 18 ? id : `${id.slice(0, 6)}...${id.slice(-4)}`;
  return ref ? `${ref} · ${short}` : `${prefix} ${short}`;
}
