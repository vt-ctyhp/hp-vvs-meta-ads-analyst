import type { MetricSummary, PerformanceRow } from "./analytics.ts";

export type PerformanceTreeAdSetNode = {
  id: string;
  adSet: PerformanceRow;
  creatives: PerformanceRow[];
  isSynthetic: boolean;
};

export type PerformanceTreeCampaignNode = {
  id: string;
  campaign: PerformanceRow;
  adSets: PerformanceTreeAdSetNode[];
  isSynthetic: boolean;
};

export const UNASSIGNED_CAMPAIGN_ID = "__unassigned_campaign__";
export const UNASSIGNED_AD_SET_ID = "__unassigned_ad_set__";

type BuildPerformanceTreeInput = {
  campaigns: PerformanceRow[];
  adSets: PerformanceRow[];
  creatives: PerformanceRow[];
};

type MutableCampaignNode = PerformanceTreeCampaignNode & {
  adSetMap: Map<string, PerformanceTreeAdSetNode>;
};

const EMPTY_METRICS: MetricSummary = {
  spend: 0,
  impressions: 0,
  reach: 0,
  clicks: 0,
  leads: 0,
  bookings: 0,
  websiteBookings: 0,
  messagingContacts: 0,
  newMessagingContacts: 0,
  primaryResults: 0,
  primaryResultLabel: "Primary Results",
  secondaryResults: null,
  secondaryResultLabel: null,
  conversions: 0,
  ctr: 0,
  cpm: 0,
  cpc: 0,
  cpl: null,
  costPerPrimaryResult: null,
  frequency: 0,
};

export function buildPerformanceTree({
  campaigns,
  adSets,
  creatives,
}: BuildPerformanceTreeInput): PerformanceTreeCampaignNode[] {
  const campaignNodes = new Map<string, MutableCampaignNode>();
  const adSetIndex = new Map<string, PerformanceTreeAdSetNode>();

  for (const campaign of campaigns) {
    ensureCampaignNode(campaignNodes, {
      id: campaign.id,
      name: campaign.name,
      source: campaign,
      synthetic: false,
    });
  }

  for (const adSet of adSets) {
    const campaignNode = ensureCampaignNode(campaignNodes, {
      id: adSet.campaignId || UNASSIGNED_CAMPAIGN_ID,
      name: adSet.campaignName || "Unassigned campaign",
      source: adSet,
      synthetic: !adSet.campaignId || !campaignNodes.has(adSet.campaignId),
    });
    const adSetNode = ensureAdSetNode(campaignNode, {
      id: adSet.id,
      name: adSet.name,
      source: adSet,
      synthetic: false,
    });
    adSetIndex.set(adSet.id, adSetNode);
  }

  for (const creative of creatives) {
    const existingAdSet = creative.adSetId ? adSetIndex.get(creative.adSetId) : null;
    if (existingAdSet) {
      existingAdSet.creatives.push(creative);
      continue;
    }

    const campaignNode = ensureCampaignNode(campaignNodes, {
      id: creative.campaignId || UNASSIGNED_CAMPAIGN_ID,
      name: creative.campaignName || "Unassigned campaign",
      source: creative,
      synthetic: !creative.campaignId || !campaignNodes.has(creative.campaignId),
    });
    const adSetNode = ensureAdSetNode(campaignNode, {
      id: creative.adSetId || `${UNASSIGNED_AD_SET_ID}:${campaignNode.id}`,
      name: creative.adSetName || "Unassigned ad set",
      source: creative,
      synthetic: true,
    });
    adSetNode.creatives.push(creative);
    if (creative.adSetId) adSetIndex.set(creative.adSetId, adSetNode);
  }

  return Array.from(campaignNodes.values()).map((node) => {
    const adSetsWithMetrics = node.adSets.map((adSetNode) => {
      if (!adSetNode.isSynthetic) return adSetNode;
      return {
        ...adSetNode,
        adSet: {
          ...adSetNode.adSet,
          ...summarizeRows(adSetNode.creatives, adSetNode.adSet.campaignUmbrella),
        },
      };
    });

    const campaign = node.isSynthetic
      ? {
          ...node.campaign,
          ...summarizeRows(
            adSetsWithMetrics.map((adSetNode) => adSetNode.adSet),
            node.campaign.campaignUmbrella,
          ),
        }
      : node.campaign;

    return {
      id: node.id,
      campaign,
      adSets: adSetsWithMetrics,
      isSynthetic: node.isSynthetic,
    };
  });
}

function ensureCampaignNode(
  nodes: Map<string, MutableCampaignNode>,
  input: {
    id: string;
    name: string;
    source: PerformanceRow;
    synthetic: boolean;
  },
): MutableCampaignNode {
  const id = input.id || UNASSIGNED_CAMPAIGN_ID;
  const existing = nodes.get(id);
  if (existing) return existing;

  const campaign = input.synthetic
    ? syntheticRow({
        id,
        name: input.name || "Unassigned campaign",
        source: input.source,
        campaignId: id === UNASSIGNED_CAMPAIGN_ID ? null : id,
      })
    : input.source;

  const node: MutableCampaignNode = {
    id,
    campaign,
    adSets: [],
    adSetMap: new Map(),
    isSynthetic: input.synthetic,
  };
  nodes.set(id, node);
  return node;
}

function ensureAdSetNode(
  campaignNode: MutableCampaignNode,
  input: {
    id: string;
    name: string;
    source: PerformanceRow;
    synthetic: boolean;
  },
): PerformanceTreeAdSetNode {
  const id = input.id || `${UNASSIGNED_AD_SET_ID}:${campaignNode.id}`;
  const existing = campaignNode.adSetMap.get(id);
  if (existing) return existing;

  const adSet = input.synthetic
    ? syntheticRow({
        id,
        name: input.name || "Unassigned ad set",
        source: input.source,
        campaignId: campaignNode.campaign.id,
        campaignName: campaignNode.campaign.name,
        adSetId: id.startsWith(UNASSIGNED_AD_SET_ID) ? null : id,
      })
    : input.source;

  const node: PerformanceTreeAdSetNode = {
    id,
    adSet,
    creatives: [],
    isSynthetic: input.synthetic,
  };
  campaignNode.adSets.push(node);
  campaignNode.adSetMap.set(id, node);
  return node;
}

function syntheticRow({
  id,
  name,
  source,
  campaignId,
  campaignName,
  adSetId,
}: {
  id: string;
  name: string;
  source: PerformanceRow;
  campaignId?: string | null;
  campaignName?: string | null;
  adSetId?: string | null;
}): PerformanceRow {
  return {
    ...EMPTY_METRICS,
    id,
    name,
    brandCode: source.brandCode || "Unassigned",
    status: null,
    effectiveStatus: null,
    objective: null,
    campaignUmbrella: source.campaignUmbrella,
    campaignUmbrellaConfidence: source.campaignUmbrellaConfidence,
    campaignUmbrellaReason: source.campaignUmbrellaReason,
    campaignId,
    campaignName,
    adSetId,
    adSetName: adSetId ? name : null,
  };
}

function summarizeRows(rows: PerformanceRow[], umbrella: PerformanceRow["campaignUmbrella"]) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.spend += row.spend;
      acc.impressions += row.impressions;
      acc.reach += row.reach;
      acc.clicks += row.clicks;
      acc.leads += row.leads;
      acc.bookings += row.bookings;
      acc.websiteBookings += row.websiteBookings;
      acc.messagingContacts += row.messagingContacts;
      acc.newMessagingContacts += row.newMessagingContacts;
      acc.primaryResults += row.primaryResults;
      acc.conversions += row.conversions;
      if (row.secondaryResults !== null) {
        acc.secondaryResults = (acc.secondaryResults || 0) + row.secondaryResults;
      }
      return acc;
    },
    {
      ...EMPTY_METRICS,
      primaryResultLabel: rows[0]?.primaryResultLabel || EMPTY_METRICS.primaryResultLabel,
      secondaryResultLabel: rows[0]?.secondaryResultLabel || null,
    },
  );

  return deriveTreeRates(totals, umbrella);
}

function deriveTreeRates(
  metrics: MetricSummary,
  umbrella: PerformanceRow["campaignUmbrella"],
): MetricSummary {
  const ctr = metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0;
  const cpm = metrics.impressions > 0 ? (metrics.spend / metrics.impressions) * 1000 : 0;
  const cpc = metrics.clicks > 0 ? metrics.spend / metrics.clicks : 0;
  const cpl = metrics.leads > 0 ? metrics.spend / metrics.leads : null;
  const costPerPrimaryResult =
    metrics.primaryResults > 0 ? metrics.spend / metrics.primaryResults : null;
  const frequency = metrics.reach > 0 ? metrics.impressions / metrics.reach : 0;

  return {
    ...metrics,
    primaryResultLabel: metrics.primaryResultLabel || defaultPrimaryLabel(umbrella),
    spend: roundMetric(metrics.spend),
    ctr: roundMetric(ctr),
    cpm: roundMetric(cpm),
    cpc: roundMetric(cpc),
    cpl: cpl === null ? null : roundMetric(cpl),
    costPerPrimaryResult:
      costPerPrimaryResult === null ? null : roundMetric(costPerPrimaryResult),
    frequency: roundMetric(frequency),
  };
}

function defaultPrimaryLabel(umbrella: PerformanceRow["campaignUmbrella"]) {
  return umbrella === "Book Appts US" ? "Website Bookings" : "Messaging Contacts";
}

function roundMetric(value: number) {
  return Math.round(value * 100) / 100;
}
