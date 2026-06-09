/**
 * Entity-name resolution for the agent's performance rows.
 *
 * The `aggregate_meta_daily_insights` RPC often returns a raw id in the
 * campaign / ad_set / ad / creative *name* column (e.g. a 16-digit creative id),
 * so an AI-built table or chart would show ids instead of readable names. The
 * deterministic pipeline solves this with a separate entity-display join; the
 * agent path needs the same. {@link applyEntityNameMaps} swaps the id-shaped
 * name for a real name when one is known, keeping every figure untouched.
 *
 * Pure (no DB): callers load the id→name maps and pass them in.
 */
import type { MetaInsightAggregateRow } from "./meta-insight-aggregates.ts";

export type EntityNameMaps = {
  campaign?: Record<string, string>;
  ad_set?: Record<string, string>;
  ad?: Record<string, string>;
  creative?: Record<string, string>;
};

const DIMENSION_ID_FIELDS = [
  ["campaign", "campaign_id"],
  ["ad_set", "ad_set_id"],
  ["ad", "ad_id"],
  ["creative", "creative_id"],
] as const;

export function applyEntityNameMaps(
  rows: MetaInsightAggregateRow[],
  maps: EntityNameMaps,
): MetaInsightAggregateRow[] {
  return rows.map((row) => {
    let next = row;
    for (const [nameField, idField] of DIMENSION_ID_FIELDS) {
      const map = maps[nameField];
      if (!map) continue;
      const id = row[idField];
      if (typeof id !== "string" || !id) continue;
      const name = map[id];
      if (name && name !== row[nameField]) {
        next = { ...next, [nameField]: name };
      }
    }
    return next;
  });
}

/** Build an id→name lookup from entity records, taking the first non-empty name key. */
export function buildEntityNameMap(
  records: Array<Record<string, unknown>>,
  idKey: string,
  nameKeys: string[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const record of records) {
    const id = record[idKey];
    if (typeof id !== "string" || !id) continue;
    for (const nameKey of nameKeys) {
      const value = record[nameKey];
      if (typeof value === "string" && value.trim()) {
        map[id] = value.trim();
        break;
      }
    }
  }
  return map;
}
