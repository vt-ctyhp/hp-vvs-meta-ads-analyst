/**
 * Pivot flat aggregate rows into one-row-per-entity with period columns.
 *
 * Input: rows from `aggregate_meta_daily_insights`, e.g.:
 *
 *   { campaign_id: "c1", campaign: "Wedding Bands", week: "2026-05-11",
 *     spend: 280, primary_results: 11, ... }
 *   { campaign_id: "c1", campaign: "Wedding Bands", week: "2026-05-18",
 *     spend: 245, primary_results: 9, ... }
 *   { campaign_id: "c2", campaign: "Engagement",    week: "2026-05-11",
 *     spend: 200, primary_results: 5, ... }
 *
 * Output: one row per entity (campaign_id), with `periodValues` keyed by
 * the period.key emitted from `lastNPeriods()`:
 *
 *   { entityId: "c1", displayName: "Wedding Bands",
 *     periodValues: { "2026-05-11": 280, "2026-05-18": 245 },
 *     total: 525, parentIds: {} }
 *
 * `parentIdFields` lets you keep references to the row's parents (e.g.
 * `campaign_id` for an ad-set-level pivot) so the consumer can build the
 * hierarchy tree without re-querying.
 *
 * Missing periods are omitted from `periodValues`. The tree-table cell
 * formatter is responsible for rendering empty cells as a dash or zero,
 * because "no row for this week" can mean either "didn't spend" or
 * "didn't sync yet" — only the consumer knows which.
 *
 * Pure function on (rows, options). Easy to unit test.
 */

import type { PeriodWindow } from "./period-windows.ts";

export type PivotedRow = {
  /** Unique key for this entity within the level (campaign_id, ad_set_id, …). */
  entityId: string;
  /** Display name (campaign, ad_set, …). */
  displayName: string;
  /** Parent FK references for tree construction. */
  parentIds: Record<string, string | null>;
  /** Map of periodKey → numeric metric value. */
  periodValues: Record<string, number>;
  /** Sum across all `periodValues`, useful for sorting + aggregate display. */
  total: number;
};

export type PivotOptions<Row> = {
  /** Period windows in order; only their `.key` is consulted. */
  periods: PeriodWindow[];
  /** Field on Row whose value identifies the entity (e.g. "campaign_id"). */
  entityIdField: keyof Row;
  /** Field whose value labels the entity (e.g. "campaign"). */
  displayField: keyof Row;
  /**
   * Field whose value matches one of the period.key strings.
   * For week pivot: "week". Month pivot: "month". Day: "date". Quarter: "quarter".
   */
  periodKeyField: keyof Row;
  /** Field whose numeric value is the metric we're pivoting. */
  valueField: keyof Row;
  /**
   * Additional fields whose values to preserve on each output row, keyed
   * by the field name. Use for parent FK refs like "campaign_id" when
   * pivoting at the ad-set level.
   */
  parentIdFields?: Array<keyof Row>;
};

export function pivotByPeriod<Row extends Record<string, unknown>>(
  rows: Row[],
  options: PivotOptions<Row>,
): PivotedRow[] {
  const allowedKeys = new Set(options.periods.map((p) => p.key));
  const byEntity = new Map<string, PivotedRow>();

  for (const row of rows) {
    const entityId = stringOrNull(row[options.entityIdField]);
    const periodKey = stringOrNull(row[options.periodKeyField]);
    if (!entityId || !periodKey) continue;
    if (!allowedKeys.has(periodKey)) continue;

    const value = numberOrZero(row[options.valueField]);
    let pivot = byEntity.get(entityId);

    if (!pivot) {
      pivot = {
        entityId,
        displayName:
          stringOrNull(row[options.displayField]) ?? entityId,
        parentIds: pickParentIds(row, options.parentIdFields),
        periodValues: {},
        total: 0,
      };
      byEntity.set(entityId, pivot);
    }

    // Sum in case the RPC returned multiple sub-rows for the same
    // (entity, period) — shouldn't happen with the current aggregation
    // SQL but cheap to be defensive.
    pivot.periodValues[periodKey] =
      (pivot.periodValues[periodKey] ?? 0) + value;
    pivot.total += value;
  }

  return [...byEntity.values()];
}

function stringOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function numberOrZero(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function pickParentIds<Row extends Record<string, unknown>>(
  row: Row,
  fields: Array<keyof Row> | undefined,
): Record<string, string | null> {
  if (!fields?.length) return {};
  const out: Record<string, string | null> = {};
  for (const field of fields) {
    out[String(field)] = stringOrNull(row[field]);
  }
  return out;
}
