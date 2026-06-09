/**
 * Production data source for {@link queryEntities}. Reads current state from
 * the four Meta entity tables and assembles {@link RawEntityRow} records
 * (status, name, budget, thumbnail) with the parent names the umbrella
 * classifier needs. All access is read-only via `createAdsAnalystClient("web")`.
 *
 * The Supabase calls live behind a {@link TableReader} so the assembly logic
 * is unit-testable without a database.
 */
import { createAdsAnalystClient } from "./ads-analyst-db.ts";
import {
  QUERY_ENTITIES_MAX_LIMIT,
  type EntityType,
  type QueryEntitiesDeps,
  type RawEntityRow,
} from "./analysis-workbench-query-tools.ts";

/** Hard ceiling on rows pulled from a single entity table before in-memory filtering. */
const ENTITY_TABLE_READ_CAP = 5000;

export type TableReader = (
  table: string,
  columns: string,
  filter?: { column: string; values: string[] },
) => Promise<Record<string, unknown>[]>;

export function createEntityFetcher(readTable: TableReader): QueryEntitiesDeps["fetchEntities"] {
  return async ({ entityType }) => {
    switch (entityType) {
      case "campaign":
        return fetchCampaigns(readTable);
      case "ad_set":
        return fetchAdSets(readTable);
      case "ad":
        return fetchAds(readTable);
      case "creative":
        return fetchCreatives(readTable);
      default:
        return [];
    }
  };
}

/** Binds {@link createEntityFetcher} to the read-only ads-analyst Supabase client. */
export function createSupabaseEntityFetcher(): QueryEntitiesDeps["fetchEntities"] {
  const client = createAdsAnalystClient("web") as unknown as SupabaseLikeClient;
  const readTable: TableReader = async (table, columns, filter) => {
    let query = client.from(table).select(columns);
    if (filter) {
      if (!filter.values.length) return [];
      query = query.in(filter.column, filter.values);
    } else {
      query = query.limit(ENTITY_TABLE_READ_CAP);
    }
    const response = await query;
    if (response.error) throw response.error;
    return response.data ?? [];
  };
  return createEntityFetcher(readTable);
}

type SupabaseQuery = {
  in: (column: string, values: string[]) => SupabaseQuery;
  limit: (count: number) => SupabaseQuery;
  then: Promise<{ data: Record<string, unknown>[] | null; error: Error | null }>["then"];
};

type SupabaseLikeClient = {
  from: (table: string) => { select: (columns: string) => SupabaseQuery };
};

async function fetchCampaigns(readTable: TableReader): Promise<RawEntityRow[]> {
  const campaigns = await readTable(
    "meta_campaigns",
    "campaign_id,name,status,effective_status,daily_budget,lifetime_budget,brand_id",
  );
  const brands = await loadBrandCodes(readTable, campaigns);
  return campaigns.map((campaign) => ({
    entityType: "campaign",
    id: str(campaign.campaign_id) ?? "",
    name: str(campaign.name),
    status: str(campaign.status),
    effectiveStatus: str(campaign.effective_status),
    campaignName: str(campaign.name),
    brandCode: brands.get(str(campaign.brand_id) ?? ""),
    dailyBudget: num(campaign.daily_budget),
    lifetimeBudget: num(campaign.lifetime_budget),
  }));
}

async function fetchAdSets(readTable: TableReader): Promise<RawEntityRow[]> {
  const adSets = await readTable(
    "meta_ad_sets",
    "ad_set_id,name,status,effective_status,daily_budget,lifetime_budget,campaign_id,brand_id",
  );
  const [campaigns, brands] = await Promise.all([
    loadNameMap(readTable, "meta_campaigns", "campaign_id", adSets.map((row) => str(row.campaign_id))),
    loadBrandCodes(readTable, adSets),
  ]);
  return adSets.map((adSet) => ({
    entityType: "ad_set",
    id: str(adSet.ad_set_id) ?? "",
    name: str(adSet.name),
    status: str(adSet.status),
    effectiveStatus: str(adSet.effective_status),
    campaignName: campaigns.get(str(adSet.campaign_id) ?? ""),
    adSetName: str(adSet.name),
    brandCode: brands.get(str(adSet.brand_id) ?? ""),
    dailyBudget: num(adSet.daily_budget),
    lifetimeBudget: num(adSet.lifetime_budget),
  }));
}

async function fetchAds(readTable: TableReader): Promise<RawEntityRow[]> {
  const ads = await readTable(
    "meta_ads",
    "ad_id,name,status,effective_status,creative_id,ad_set_id,campaign_id,brand_id",
  );
  const [campaigns, adSets, thumbnails, brands] = await Promise.all([
    loadNameMap(readTable, "meta_campaigns", "campaign_id", ads.map((row) => str(row.campaign_id))),
    loadNameMap(readTable, "meta_ad_sets", "ad_set_id", ads.map((row) => str(row.ad_set_id))),
    loadThumbnails(readTable, ads.map((row) => str(row.creative_id))),
    loadBrandCodes(readTable, ads),
  ]);
  return ads.map((ad) => ({
    entityType: "ad",
    id: str(ad.ad_id) ?? "",
    name: str(ad.name),
    status: str(ad.status),
    effectiveStatus: str(ad.effective_status),
    campaignName: campaigns.get(str(ad.campaign_id) ?? ""),
    adSetName: adSets.get(str(ad.ad_set_id) ?? ""),
    brandCode: brands.get(str(ad.brand_id) ?? ""),
    thumbnailUrl: thumbnails.get(str(ad.creative_id) ?? ""),
  }));
}

async function fetchCreatives(readTable: TableReader): Promise<RawEntityRow[]> {
  const creatives = await readTable(
    "meta_creatives",
    "creative_id,name,title,supabase_thumbnail_url,thumbnail_url,video_thumbnail_url,brand_id",
  );
  const brands = await loadBrandCodes(readTable, creatives);
  return creatives.map((creative) => ({
    entityType: "creative",
    id: str(creative.creative_id) ?? "",
    name: str(creative.name) ?? str(creative.title),
    // Creatives carry no delivery state of their own.
    status: null,
    effectiveStatus: null,
    brandCode: brands.get(str(creative.brand_id) ?? ""),
    thumbnailUrl:
      str(creative.supabase_thumbnail_url) ??
      str(creative.thumbnail_url) ??
      str(creative.video_thumbnail_url),
  }));
}

async function loadNameMap(
  readTable: TableReader,
  table: string,
  idColumn: string,
  ids: Array<string | null>,
): Promise<Map<string, string | null>> {
  const values = uniqueIds(ids);
  if (!values.length) return new Map();
  const rows = await readTable(table, `${idColumn},name`, { column: idColumn, values });
  return new Map(rows.map((row) => [str(row[idColumn]) ?? "", str(row.name)] as const));
}

async function loadThumbnails(
  readTable: TableReader,
  creativeIds: Array<string | null>,
): Promise<Map<string, string | null>> {
  const values = uniqueIds(creativeIds);
  if (!values.length) return new Map();
  const rows = await readTable(
    "meta_creatives",
    "creative_id,supabase_thumbnail_url,thumbnail_url,video_thumbnail_url",
    { column: "creative_id", values },
  );
  return new Map(
    rows.map(
      (row) =>
        [
          str(row.creative_id) ?? "",
          str(row.supabase_thumbnail_url) ?? str(row.thumbnail_url) ?? str(row.video_thumbnail_url),
        ] as const,
    ),
  );
}

async function loadBrandCodes(
  readTable: TableReader,
  rows: Record<string, unknown>[],
): Promise<Map<string, string | null>> {
  const values = uniqueIds(rows.map((row) => str(row.brand_id)));
  if (!values.length) return new Map();
  const brands = await readTable("brands", "id,code", { column: "id", values });
  return new Map(brands.map((brand) => [str(brand.id) ?? "", str(brand.code)] as const));
}

function uniqueIds(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).slice(
    0,
    QUERY_ENTITIES_MAX_LIMIT * 4,
  );
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length ? value : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export { type EntityType };
