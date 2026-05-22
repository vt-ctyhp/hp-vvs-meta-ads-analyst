import { createAdsAnalystClient } from "./ads-analyst-db.ts";
import { resolveCreativeDisplayMedia } from "./creative-display-media.ts";
import type {
  CustomerLedgerCreativePreview,
  CustomerLedgerRow,
} from "./convert-customer-ledger.ts";

type QueryResult = {
  data: unknown;
  error: Error | null;
};

export type CustomerLedgerCreativeClient = {
  from: (table: "meta_ads" | "meta_creatives") => {
    select: (columns: string) => {
      in: (column: string, values: string[]) => Promise<QueryResult>;
    };
  };
};

type Logger = Pick<Console, "warn">;

type AdMetadataRow = {
  ad_id?: unknown;
  creative_id?: unknown;
  effective_status?: unknown;
  last_synced_at?: unknown;
  meta_account_id?: unknown;
  name?: unknown;
  preview_html?: unknown;
  preview_source?: unknown;
  preview_url?: unknown;
  status?: unknown;
};

type CreativeMetadataRow = {
  body?: unknown;
  creative_id?: unknown;
  image_url?: unknown;
  last_synced_at?: unknown;
  meta_account_id?: unknown;
  name?: unknown;
  preview_html?: unknown;
  preview_source?: unknown;
  preview_url?: unknown;
  supabase_image_url?: unknown;
  supabase_thumbnail_url?: unknown;
  thumbnail_url?: unknown;
  title?: unknown;
  video_thumbnail_url?: unknown;
};

const AD_COLUMNS = [
  "ad_id",
  "creative_id",
  "meta_account_id",
  "name",
  "status",
  "effective_status",
  "last_synced_at",
  "preview_url",
  "preview_html",
  "preview_source",
].join(",");

const CREATIVE_COLUMNS = [
  "creative_id",
  "meta_account_id",
  "name",
  "title",
  "body",
  "supabase_thumbnail_url",
  "supabase_image_url",
  "thumbnail_url",
  "image_url",
  "video_thumbnail_url",
  "preview_url",
  "preview_html",
  "preview_source",
  "last_synced_at",
].join(",");

const CREATIVE_COLUMNS_WITHOUT_CACHE = [
  "creative_id",
  "meta_account_id",
  "name",
  "title",
  "body",
  "thumbnail_url",
  "image_url",
  "video_thumbnail_url",
  "preview_url",
  "preview_html",
  "preview_source",
  "last_synced_at",
].join(",");

export async function enrichCustomerLedgerRowsWithCreativePreviews(
  rows: CustomerLedgerRow[],
  options: {
    client?: CustomerLedgerCreativeClient;
    logger?: Logger;
  } = {},
): Promise<CustomerLedgerRow[]> {
  const adIds = unique(rows.map((row) => row.adId));
  if (adIds.length === 0) return rows;

  const client =
    options.client ||
    (createAdsAnalystClient("web") as unknown as CustomerLedgerCreativeClient);
  const logger = options.logger || console;

  try {
    const adRows = await selectRows<AdMetadataRow>(
      client,
      "meta_ads",
      AD_COLUMNS,
      "ad_id",
      adIds,
    );
    const adsByAdId = bestAdRowsByAdId(adRows);
    const creativeIds = unique(
      Array.from(adsByAdId.values()).map((row) => stringOrNull(row.creative_id)),
    );
    const creativeRows = creativeIds.length
      ? await selectCreativeRows(client, creativeIds)
      : [];
    const creativeIndex = indexCreativeRows(creativeRows);

    return rows.map((row) => {
      if (!row.adId) return row;
      const ad = adsByAdId.get(row.adId);
      if (!ad) return row;
      const creative = creativeForAd(ad, creativeIndex);
      const preview = creativePreviewFromRows(row.adId, ad, creative);
      return {
        ...row,
        creativePreview: preview,
      };
    });
  } catch (error) {
    logger.warn("[convert] creative metadata enrichment failed:", error);
    return rows;
  }
}

async function selectCreativeRows(
  client: CustomerLedgerCreativeClient,
  creativeIds: string[],
): Promise<CreativeMetadataRow[]> {
  const result = await queryRows(
    client,
    "meta_creatives",
    CREATIVE_COLUMNS,
    "creative_id",
    creativeIds,
  );

  if (!result.error) return rowsFromUnknown<CreativeMetadataRow>(result.data);

  const fallback = await queryRows(
    client,
    "meta_creatives",
    CREATIVE_COLUMNS_WITHOUT_CACHE,
    "creative_id",
    creativeIds,
  );

  if (fallback.error) throw fallback.error;
  return rowsFromUnknown<CreativeMetadataRow>(fallback.data);
}

async function selectRows<T extends Record<string, unknown>>(
  client: CustomerLedgerCreativeClient,
  table: "meta_ads" | "meta_creatives",
  columns: string,
  idColumn: string,
  ids: string[],
) {
  const result = await queryRows(client, table, columns, idColumn, ids);
  if (result.error) throw result.error;
  return rowsFromUnknown<T>(result.data);
}

function queryRows(
  client: CustomerLedgerCreativeClient,
  table: "meta_ads" | "meta_creatives",
  columns: string,
  idColumn: string,
  ids: string[],
) {
  return client.from(table).select(columns).in(idColumn, ids);
}

function bestAdRowsByAdId(rows: AdMetadataRow[]) {
  const best = new Map<string, AdMetadataRow>();
  for (const row of rows) {
    const adId = stringOrNull(row.ad_id);
    if (!adId) continue;

    const current = best.get(adId);
    if (!current || isBetterAdRow(row, current)) {
      best.set(adId, row);
    }
  }
  return best;
}

function indexCreativeRows(rows: CreativeMetadataRow[]) {
  const byAccountAndCreative = new Map<string, CreativeMetadataRow>();
  const byCreative = new Map<string, CreativeMetadataRow>();

  for (const row of rows) {
    const creativeId = stringOrNull(row.creative_id);
    if (!creativeId) continue;

    const accountKey = creativeKey(stringOrNull(row.meta_account_id), creativeId);
    if (accountKey) {
      const current = byAccountAndCreative.get(accountKey);
      if (!current || isNewer(row.last_synced_at, current.last_synced_at)) {
        byAccountAndCreative.set(accountKey, row);
      }
    }

    const current = byCreative.get(creativeId);
    if (!current || isNewer(row.last_synced_at, current.last_synced_at)) {
      byCreative.set(creativeId, row);
    }
  }

  return { byAccountAndCreative, byCreative };
}

function creativeForAd(
  ad: AdMetadataRow,
  creativeIndex: ReturnType<typeof indexCreativeRows>,
) {
  const creativeId = stringOrNull(ad.creative_id);
  if (!creativeId) return null;

  const accountKey = creativeKey(stringOrNull(ad.meta_account_id), creativeId);
  if (accountKey) {
    const accountCreative = creativeIndex.byAccountAndCreative.get(accountKey);
    if (accountCreative) return accountCreative;
  }

  return creativeIndex.byCreative.get(creativeId) || null;
}

function creativePreviewFromRows(
  adId: string,
  ad: AdMetadataRow,
  creative: CreativeMetadataRow | null,
): CustomerLedgerCreativePreview {
  const displayMedia = resolveCreativeDisplayMedia(creative);

  return {
    adId,
    adName: stringOrNull(ad.name),
    body: stringOrNull(creative?.body),
    creativeId: stringOrNull(ad.creative_id),
    creativeName: stringOrNull(creative?.name),
    imageUrl: displayMedia.imageUrl,
    previewHtml: stringOrNull(creative?.preview_html) || stringOrNull(ad.preview_html),
    previewSource:
      stringOrNull(creative?.preview_source) || stringOrNull(ad.preview_source),
    previewUrl: stringOrNull(creative?.preview_url) || stringOrNull(ad.preview_url),
    thumbnailUrl: displayMedia.thumbnailUrl,
    title: stringOrNull(creative?.title),
  };
}

function isBetterAdRow(candidate: AdMetadataRow, current: AdMetadataRow) {
  const candidateHasCreative = Boolean(stringOrNull(candidate.creative_id));
  const currentHasCreative = Boolean(stringOrNull(current.creative_id));
  if (candidateHasCreative !== currentHasCreative) return candidateHasCreative;
  return isNewer(candidate.last_synced_at, current.last_synced_at);
}

function isNewer(candidate: unknown, current: unknown) {
  return timestampValue(candidate) > timestampValue(current);
}

function timestampValue(value: unknown) {
  if (typeof value !== "string") return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function creativeKey(metaAccountId: string | null, creativeId: string | null) {
  if (!metaAccountId || !creativeId) return null;
  return `${metaAccountId}:${creativeId}`;
}

function rowsFromUnknown<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
