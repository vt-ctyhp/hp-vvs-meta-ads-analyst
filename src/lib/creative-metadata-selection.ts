import { getAdsAnalystEnvironment } from "./ads-analyst-db.ts";

export type EnvironmentScopedMetadataRow = {
  environment?: unknown;
  last_synced_at?: unknown;
};

export type CreativeMediaMetadataRow = EnvironmentScopedMetadataRow & {
  supabase_image_url?: unknown;
  supabase_thumbnail_url?: unknown;
};

type SelectionOptions = {
  environment?: string | null;
};

export function bestEnvironmentScopedRow<T extends EnvironmentScopedMetadataRow>(
  rows: T[],
  options: SelectionOptions = {},
): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (!best || isBetterEnvironmentScopedRow(row, best, options)) {
      best = row;
    }
  }
  return best;
}

export function bestCreativeMediaRow<T extends CreativeMediaMetadataRow>(
  rows: T[],
  options: SelectionOptions = {},
): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (!best || isBetterCreativeMediaRow(row, best, options)) {
      best = row;
    }
  }
  return best;
}

export function isBetterEnvironmentScopedRow<T extends EnvironmentScopedMetadataRow>(
  candidate: T,
  current: T,
  options: SelectionOptions = {},
) {
  const environment = targetEnvironment(options);
  const scoreDelta =
    environmentScopedScore(candidate, environment) -
    environmentScopedScore(current, environment);
  if (scoreDelta !== 0) return scoreDelta > 0;

  return timestampValue(candidate.last_synced_at) > timestampValue(current.last_synced_at);
}

export function isBetterCreativeMediaRow<T extends CreativeMediaMetadataRow>(
  candidate: T,
  current: T,
  options: SelectionOptions = {},
) {
  const environment = targetEnvironment(options);
  const scoreDelta =
    creativeMediaScore(candidate, environment) -
    creativeMediaScore(current, environment);
  if (scoreDelta !== 0) return scoreDelta > 0;

  return timestampValue(candidate.last_synced_at) > timestampValue(current.last_synced_at);
}

export function hasCachedCreativeMedia(row: CreativeMediaMetadataRow | null | undefined) {
  return Boolean(
    stringOrNull(row?.supabase_thumbnail_url) || stringOrNull(row?.supabase_image_url),
  );
}

function targetEnvironment(options: SelectionOptions) {
  if (options.environment !== undefined) return options.environment || null;
  return getAdsAnalystEnvironment();
}

function creativeMediaScore(row: CreativeMediaMetadataRow, environment: string | null) {
  const matchesEnvironment = environmentMatches(row, environment);
  const hasCache = hasCachedCreativeMedia(row);

  if (matchesEnvironment && hasCache) return 400;
  if (hasCache) return 300;
  if (matchesEnvironment) return 200;
  if (!stringOrNull(row.environment)) return 100;
  return 0;
}

function environmentScopedScore(row: EnvironmentScopedMetadataRow, environment: string | null) {
  if (environmentMatches(row, environment)) return 200;
  if (!stringOrNull(row.environment)) return 100;
  return 0;
}

function environmentMatches(row: EnvironmentScopedMetadataRow, environment: string | null) {
  if (!environment) return false;
  return stringOrNull(row.environment) === environment;
}

function timestampValue(value: unknown) {
  if (typeof value !== "string") return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
