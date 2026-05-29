import {
  type AttributionMedia,
  fetchAdMediaByAdId,
  fetchCreativeMediaByCreativeId,
} from "./customer-ledger-creative-enrichment.ts";
import type {
  MetaInboxManagerDashboard,
  MetaInboxManagerDashboardAttributionRow,
} from "./meta-inbox-manager-dashboard.ts";

// Attach creative/ad preview media to the dashboard's byCreative / byAd rows so
// the Attribution tab can show thumbnails. Campaign-umbrella rows are aggregates
// and stay text-only. Resilient: media lookups swallow their own errors, so on
// failure the dashboard passes through unchanged.
export async function enrichManagerDashboardWithCreativeMedia(
  dashboard: MetaInboxManagerDashboard,
): Promise<MetaInboxManagerDashboard> {
  const [creativeMedia, adMedia] = await Promise.all([
    fetchCreativeMediaByCreativeId(dashboard.byCreative.map((row) => row.key)),
    fetchAdMediaByAdId(dashboard.byAd.map((row) => row.key)),
  ]);

  return {
    ...dashboard,
    byCreative: applyMedia(dashboard.byCreative, creativeMedia),
    byAd: applyMedia(dashboard.byAd, adMedia),
  };
}

function applyMedia(
  rows: MetaInboxManagerDashboardAttributionRow[],
  media: Map<string, AttributionMedia>,
): MetaInboxManagerDashboardAttributionRow[] {
  return rows.map((row) => {
    const found = media.get(row.key);
    if (!found) return row;
    return { ...row, thumbnailUrl: found.thumbnailUrl, imageUrl: found.imageUrl };
  });
}
