import { ConfigurationError, getMetaApiVersion } from "./env";
import {
  classifyCampaignUmbrella,
  isCampaignUmbrella,
  type CampaignUmbrellaClassification,
  type CampaignUmbrellaOverride,
} from "./campaign-umbrellas";
import { createServiceClient } from "./supabase";

type JsonRecord = Record<string, unknown>;

type MetaPaging<T> = {
  data?: T[];
  paging?: {
    next?: string;
  };
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

type PageOptions = {
  maxPages?: number;
};

type MetaPermission = {
  permission: string;
  status: string;
};

type SyncAccountConfig = {
  brandCode: "HP" | "VVS";
  brandName: string;
  accountId: string;
};

type SyncMetrics = {
  accounts: number;
  campaigns: number;
  adSets: number;
  ads: number;
  creatives: number;
  insightRows: number;
  previewRefreshes: number;
};

type DynamicSupabaseClient = {
  from: (table: string) => {
    upsert: (
      rows: JsonRecord[],
      options: { onConflict: string },
    ) => {
      select: (columns: string) => Promise<{ data: JsonRecord[] | null; error: Error | null }>;
    };
  };
};

export type SyncResult = {
  status: "success" | "partial" | "failed";
  metrics: SyncMetrics;
  errors: string[];
  syncRunId?: string;
};

class MetaGraphError extends Error {
  details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "MetaGraphError";
    this.details = details;
  }
}

export async function syncMetaAds(trigger: "cron" | "manual" | "preview" = "manual") {
  const supabase = createServiceClient();
  const accounts = getConfiguredAccounts();
  const runInsert = await supabase
    .from("sync_runs")
    .insert({
      trigger,
      status: "running",
      ad_account_ids: accounts.map((account) => account.accountId),
    })
    .select("id")
    .single();

  if (runInsert.error) {
    throw runInsert.error;
  }

  const syncRunId = String(runInsert.data.id);
  const metrics: SyncMetrics = {
    accounts: 0,
    campaigns: 0,
    adSets: 0,
    ads: 0,
    creatives: 0,
    insightRows: 0,
    previewRefreshes: 0,
  };
  const errors: string[] = [];

  try {
    await validateReadOnlyMetaToken();
    const brandRows = await ensureBrands(accounts);
    const brandByCode = new Map(brandRows.map((brand) => [String(brand.code), String(brand.id)]));

    for (const account of accounts) {
      try {
        const result = await syncAccount(account, brandByCode.get(account.brandCode) || null);
        metrics.accounts += 1;
        metrics.campaigns += result.campaigns;
        metrics.adSets += result.adSets;
        metrics.ads += result.ads;
        metrics.creatives += result.creatives;
        metrics.insightRows += result.insightRows;
        metrics.previewRefreshes += result.previewRefreshes;
      } catch (error) {
        errors.push(`${account.brandCode}: ${errorToMessage(error)}`);
      }
    }

    const status = errors.length ? (metrics.accounts > 0 ? "partial" : "failed") : "success";
    await supabase
      .from("sync_runs")
      .update({
        status,
        completed_at: new Date().toISOString(),
        metrics,
        errors,
      })
      .eq("id", syncRunId);

    return { status, metrics, errors, syncRunId } satisfies SyncResult;
  } catch (error) {
    errors.push(errorToMessage(error));
    await supabase
      .from("sync_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        metrics,
        errors,
      })
      .eq("id", syncRunId);

    return { status: "failed", metrics, errors, syncRunId } satisfies SyncResult;
  }
}

export async function validateReadOnlyMetaToken() {
  const permissions = await graphFetch<MetaPermission[]>("me/permissions", {});
  const granted = new Set(
    permissions
      .filter((permission) => permission.status === "granted")
      .map((permission) => permission.permission),
  );

  if (granted.has("ads_management")) {
    throw new ConfigurationError(
      "Meta token has forbidden ads_management permission. Re-issue a read-only token with ads_read and read_insights only.",
    );
  }

  const missing = ["ads_read"].filter((permission) => !granted.has(permission));
  if (missing.length) {
    throw new ConfigurationError(
      `Meta token is missing required read-only permission(s): ${missing.join(", ")}. Grant ads_read, then retry sync.`,
      missing,
    );
  }

  return {
    granted: Array.from(granted).sort(),
    optionalMissing: ["read_insights"].filter((permission) => !granted.has(permission)),
  };
}

export async function validateConfiguredMetaAccounts() {
  const accounts = getConfiguredAccounts();

  return Promise.all(
    accounts.map(async (account) => {
      const accountId = `act_${normalizeAccountId(account.accountId)}`;

      try {
        const profile = await graphFetch<JsonRecord>(accountId, {
          fields: "id,name,account_status,currency,timezone_name",
        });

        return {
          brandCode: account.brandCode,
          accountId,
          ok: true,
          name: stringField(profile.name),
          accountStatus: numberField(profile.account_status),
        };
      } catch (error) {
        return {
          brandCode: account.brandCode,
          accountId,
          ok: false,
          error: errorToMessage(error),
        };
      }
    }),
  );
}

async function syncAccount(account: SyncAccountConfig, brandId: string | null) {
  const accountId = normalizeAccountId(account.accountId);
  const metaAccountId = `act_${accountId}`;
  const now = new Date().toISOString();

  const accountProfile = await graphFetch<JsonRecord>(metaAccountId, {
    fields: "id,name,currency,timezone_name,account_status,business_name",
  });

  const accountRow = await upsertSingle("meta_ad_accounts", {
    brand_id: brandId,
    meta_account_id: metaAccountId,
    name: stringField(accountProfile.name) || account.brandName,
    currency: stringField(accountProfile.currency),
    timezone_name: stringField(accountProfile.timezone_name),
    account_status: numberField(accountProfile.account_status),
    raw_json: accountProfile,
    last_synced_at: now,
  }, "meta_account_id");

  const campaigns = await graphPages<JsonRecord>(`${metaAccountId}/campaigns`, {
    fields:
      "id,name,objective,status,effective_status,buying_type,start_time,stop_time,created_time,updated_time",
    limit: "100",
  }, { maxPages: getSyncMaxPages("META_SYNC_MAX_CAMPAIGN_PAGES", 12) });

  const adSets = await graphPages<JsonRecord>(`${metaAccountId}/adsets`, {
    fields:
      "id,name,campaign_id,status,effective_status,optimization_goal,billing_event,bid_strategy,daily_budget,lifetime_budget,start_time,end_time,created_time,updated_time,targeting",
    limit: "100",
  }, { maxPages: getSyncMaxPages("META_SYNC_MAX_AD_SET_PAGES", 12) });

  const overrides = await fetchCampaignUmbrellaOverrides(metaAccountId);
  const campaignRawByMetaId = new Map(campaigns.map((campaign) => [String(campaign.id), campaign]));
  const adSetRawByMetaId = new Map(adSets.map((adSet) => [String(adSet.id), adSet]));
  const adSetNamesByCampaignId = groupAdSetNamesByCampaignId(adSets);
  const campaignClassifications = new Map<string, CampaignUmbrellaClassification>();

  for (const campaign of campaigns) {
    const campaignId = stringField(campaign.id);
    if (!campaignId) continue;
    campaignClassifications.set(
      campaignId,
      classifyCampaignUmbrella({
        campaignName: stringField(campaign.name),
        adSetNames: adSetNamesByCampaignId.get(campaignId) || [],
        override: getUmbrellaOverride(overrides, "campaign", campaignId),
      }),
    );
  }

  const campaignRows = await upsertMany(
    "meta_campaigns",
    campaigns.map((campaign) => {
      const campaignId = stringField(campaign.id);
      const classification = campaignClassifications.get(campaignId || "") ||
        classifyCampaignUmbrella({ campaignName: stringField(campaign.name) });

      return {
        brand_id: brandId,
        account_id: accountRow.id,
        meta_account_id: metaAccountId,
        campaign_id: campaignId,
        name: stringField(campaign.name),
        objective: stringField(campaign.objective),
        buying_type: stringField(campaign.buying_type),
        status: stringField(campaign.status),
        effective_status: stringField(campaign.effective_status),
        start_time: stringField(campaign.start_time),
        stop_time: stringField(campaign.stop_time),
        created_time: stringField(campaign.created_time),
        updated_time: stringField(campaign.updated_time),
        ...umbrellaColumns(classification),
        raw_json: campaign,
        last_synced_at: now,
      };
    }),
    "meta_account_id,campaign_id",
  );
  const campaignByMetaId = new Map(campaignRows.map((row) => [String(row.campaign_id), row]));

  const adSetClassifications = new Map<string, CampaignUmbrellaClassification>();
  for (const adSet of adSets) {
    const adSetId = stringField(adSet.id);
    if (!adSetId) continue;
    const campaignId = stringField(adSet.campaign_id);
    const campaign = campaignId ? campaignRawByMetaId.get(campaignId) : undefined;
    adSetClassifications.set(
      adSetId,
      classifyCampaignUmbrella({
        campaignName: stringField(campaign?.name),
        adSetName: stringField(adSet.name),
        inherited: campaignId ? campaignClassifications.get(campaignId) : null,
        override: getUmbrellaOverride(overrides, "ad_set", adSetId),
      }),
    );
  }

  const adSetRows = await upsertMany(
    "meta_ad_sets",
    adSets.map((adSet) => {
      const adSetId = stringField(adSet.id);
      const classification = adSetClassifications.get(adSetId || "") ||
        classifyCampaignUmbrella({ adSetName: stringField(adSet.name) });

      return {
        brand_id: brandId,
        account_id: accountRow.id,
        campaign_ref_id: campaignByMetaId.get(String(adSet.campaign_id))?.id || null,
        meta_account_id: metaAccountId,
        campaign_id: stringField(adSet.campaign_id),
        ad_set_id: adSetId,
        name: stringField(adSet.name),
        status: stringField(adSet.status),
        effective_status: stringField(adSet.effective_status),
        optimization_goal: stringField(adSet.optimization_goal),
        billing_event: stringField(adSet.billing_event),
        bid_strategy: stringField(adSet.bid_strategy),
        daily_budget: moneyCents(adSet.daily_budget),
        lifetime_budget: moneyCents(adSet.lifetime_budget),
        start_time: stringField(adSet.start_time),
        end_time: stringField(adSet.end_time),
        created_time: stringField(adSet.created_time),
        updated_time: stringField(adSet.updated_time),
        targeting: recordField(adSet.targeting),
        ...umbrellaColumns(classification),
        raw_json: adSet,
        last_synced_at: now,
      };
    }),
    "meta_account_id,ad_set_id",
  );
  const adSetByMetaId = new Map(adSetRows.map((row) => [String(row.ad_set_id), row]));

  const ads = await graphPages<JsonRecord>(`${metaAccountId}/ads`, {
    fields:
      "id,name,campaign_id,adset_id,status,effective_status,created_time,updated_time,creative{id,name,title,body,thumbnail_url,image_url,image_hash,object_type,object_story_id,effective_object_story_id,object_story_spec,asset_feed_spec,call_to_action_type,video_id}",
    limit: "50",
  }, { maxPages: getSyncMaxPages("META_SYNC_MAX_AD_PAGES", 20) });

  const previewByAdId = new Map<string, { previewHtml: string | null; previewUrl: string | null }>();
  for (const ad of ads) {
    const adId = stringField(ad.id);
    if (!adId) continue;
    const creative = recordField(ad.creative);
    const preview = chooseStoredPreview(creative, null);
    if (preview.previewSource === "fallback") {
      const adPreview = await fetchAdPreview(adId);
      previewByAdId.set(adId, adPreview);
    }
  }

  const creativeRowsInput = ads
    .map((ad) => {
      const creative = recordField(ad.creative);
      const creativeId = stringField(creative.id);
      if (!creativeId) return null;
      const adPreview = previewByAdId.get(String(ad.id)) || null;
      const preview = chooseStoredPreview(creative, adPreview);
      return {
        brand_id: brandId,
        account_id: accountRow.id,
        meta_account_id: metaAccountId,
        creative_id: creativeId,
        name: stringField(creative.name),
        title: stringField(creative.title),
        body: stringField(creative.body),
        call_to_action_type: stringField(creative.call_to_action_type),
        object_type: stringField(creative.object_type),
        object_story_id: stringField(creative.object_story_id),
        effective_object_story_id: stringField(creative.effective_object_story_id),
        thumbnail_url: stringField(creative.thumbnail_url),
        image_url: stringField(creative.image_url),
        video_thumbnail_url: stringField(creative.video_thumbnail_url),
        preview_url: preview.previewUrl,
        preview_html: preview.previewHtml,
        preview_source: preview.previewSource,
        asset_metadata: {
          image_hash: creative.image_hash || null,
          video_id: creative.video_id || null,
        },
        object_story_spec: recordField(creative.object_story_spec),
        asset_feed_spec: recordField(creative.asset_feed_spec),
        raw_json: creative,
        last_preview_refresh_at: now,
        last_synced_at: now,
      };
    })
    .filter(Boolean) as JsonRecord[];

  const creativeRows = await upsertMany(
    "meta_creatives",
    uniqueBy(creativeRowsInput, (row) => String(row.creative_id)),
    "meta_account_id,creative_id",
  );
  const creativeByMetaId = new Map(creativeRows.map((row) => [String(row.creative_id), row]));

  const adClassifications = new Map<string, CampaignUmbrellaClassification>();
  for (const ad of ads) {
    const adId = stringField(ad.id);
    if (!adId) continue;
    const campaignId = stringField(ad.campaign_id);
    const adSetId = stringField(ad.adset_id);
    const campaign = campaignId ? campaignRawByMetaId.get(campaignId) : undefined;
    const adSet = adSetId ? adSetRawByMetaId.get(adSetId) : undefined;
    adClassifications.set(
      adId,
      classifyCampaignUmbrella({
        campaignName: stringField(campaign?.name),
        adSetName: stringField(adSet?.name),
        inherited: (adSetId && adSetClassifications.get(adSetId)) ||
          (campaignId && campaignClassifications.get(campaignId)) ||
          null,
        override: getUmbrellaOverride(overrides, "ad", adId),
      }),
    );
  }

  const adRows = await upsertMany(
    "meta_ads",
    ads.map((ad) => {
      const creative = recordField(ad.creative);
      const adPreview = previewByAdId.get(String(ad.id)) || null;
      const preview = chooseStoredPreview(creative, adPreview);
      const creativeId = stringField(creative.id);
      const adId = stringField(ad.id);
      const classification = adClassifications.get(adId || "") ||
        classifyCampaignUmbrella({ campaignName: stringField(ad.name) });
      return {
        brand_id: brandId,
        account_id: accountRow.id,
        campaign_ref_id: campaignByMetaId.get(String(ad.campaign_id))?.id || null,
        ad_set_ref_id: adSetByMetaId.get(String(ad.adset_id))?.id || null,
        creative_ref_id: creativeByMetaId.get(creativeId || "")?.id || null,
        meta_account_id: metaAccountId,
        campaign_id: stringField(ad.campaign_id),
        ad_set_id: stringField(ad.adset_id),
        ad_id: adId,
        creative_id: creativeId,
        name: stringField(ad.name),
        status: stringField(ad.status),
        effective_status: stringField(ad.effective_status),
        preview_source: preview.previewSource,
        preview_url: preview.previewUrl,
        preview_html: preview.previewHtml,
        created_time: stringField(ad.created_time),
        updated_time: stringField(ad.updated_time),
        ...umbrellaColumns(classification),
        raw_json: ad,
        last_synced_at: now,
      };
    }),
    "meta_account_id,ad_id",
  );
  const adByMetaId = new Map(adRows.map((row) => [String(row.ad_id), row]));

  const insights = await fetchInsights(metaAccountId);
  await upsertMany(
    "meta_daily_insights",
    insights.map((insight) => {
      const adId = stringField(insight.ad_id);
      const ad = adByMetaId.get(adId || "");
      const creativeId = stringField(ad?.creative_id);
      const campaignId = stringField(insight.campaign_id);
      const adSetId = stringField(insight.adset_id);
      const inheritedClassification = (adId && adClassifications.get(adId)) ||
        (adSetId && adSetClassifications.get(adSetId)) ||
        (campaignId && campaignClassifications.get(campaignId)) ||
        null;
      const classification = inheritedClassification ||
        classifyCampaignUmbrella({
          campaignName: stringField(insight.campaign_name),
          adSetName: stringField(insight.adset_name),
        });
      return {
        brand_id: brandId,
        account_id: accountRow.id,
        campaign_ref_id: campaignByMetaId.get(String(campaignId))?.id || null,
        ad_set_ref_id: adSetByMetaId.get(String(adSetId))?.id || null,
        ad_ref_id: ad?.id || null,
        creative_ref_id: creativeByMetaId.get(creativeId || "")?.id || null,
        meta_account_id: metaAccountId,
        campaign_id: campaignId,
        campaign_name: stringField(insight.campaign_name),
        ad_set_id: adSetId,
        ad_set_name: stringField(insight.adset_name),
        ad_id: adId,
        ad_name: stringField(insight.ad_name),
        creative_id: creativeId,
        date_start: stringField(insight.date_start),
        date_stop: stringField(insight.date_stop),
        spend: numberString(insight.spend),
        impressions: numberString(insight.impressions),
        reach: numberString(insight.reach),
        frequency: numberString(insight.frequency),
        cpm: numberString(insight.cpm),
        cpc: numberString(insight.cpc),
        ctr: numberString(insight.ctr),
        clicks: numberString(insight.clicks),
        inline_link_clicks: numberString(insight.inline_link_clicks),
        unique_clicks: numberString(insight.unique_clicks),
        conversions: extractActionCount(insight.actions, ["offsite_conversion", "purchase", "complete_registration"]),
        leads: extractActionCount(insight.actions, ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"]),
        bookings: extractActionCount(insight.actions, ["schedule", "submit_application", "booking", "appointment"]),
        video_metrics: {
          video_30_sec_watched_actions: insight.video_30_sec_watched_actions || [],
          video_avg_time_watched_actions: insight.video_avg_time_watched_actions || [],
          video_p25_watched_actions: insight.video_p25_watched_actions || [],
          video_p50_watched_actions: insight.video_p50_watched_actions || [],
          video_p75_watched_actions: insight.video_p75_watched_actions || [],
          video_p95_watched_actions: insight.video_p95_watched_actions || [],
          video_p100_watched_actions: insight.video_p100_watched_actions || [],
        },
        actions: Array.isArray(insight.actions) ? insight.actions : [],
        action_values: Array.isArray(insight.action_values) ? insight.action_values : [],
        ...umbrellaColumns(classification),
        raw_json: insight,
      };
    }),
    "meta_account_id,ad_id,date_start",
  );

  return {
    campaigns: campaigns.length,
    adSets: adSets.length,
    ads: ads.length,
    creatives: creativeRows.length,
    insightRows: insights.length,
    previewRefreshes: previewByAdId.size + creativeRows.length,
  };
}

async function fetchInsights(metaAccountId: string) {
  const fullFields = [
    "campaign_id",
    "campaign_name",
    "adset_id",
    "adset_name",
    "ad_id",
    "ad_name",
    "date_start",
    "date_stop",
    "spend",
    "impressions",
    "reach",
    "frequency",
    "cpm",
    "cpc",
    "ctr",
    "clicks",
    "inline_link_clicks",
    "unique_clicks",
    "actions",
    "action_values",
    "video_30_sec_watched_actions",
    "video_avg_time_watched_actions",
    "video_p25_watched_actions",
    "video_p50_watched_actions",
    "video_p75_watched_actions",
    "video_p95_watched_actions",
    "video_p100_watched_actions",
  ].join(",");

  try {
    return await graphPages<JsonRecord>(`${metaAccountId}/insights`, {
      level: "ad",
      time_increment: "1",
      date_preset: getSyncDatePreset(),
      fields: fullFields,
      limit: "100",
    }, { maxPages: getSyncMaxPages("META_SYNC_MAX_INSIGHT_PAGES", 30) });
  } catch (error) {
    const minimalFields = [
      "campaign_id",
      "campaign_name",
      "adset_id",
      "adset_name",
      "ad_id",
      "ad_name",
      "date_start",
      "date_stop",
      "spend",
      "impressions",
      "reach",
      "frequency",
      "cpm",
      "cpc",
      "ctr",
      "clicks",
      "actions",
    ].join(",");

    if (error instanceof MetaGraphError) {
      return graphPages<JsonRecord>(`${metaAccountId}/insights`, {
        level: "ad",
        time_increment: "1",
        date_preset: getSyncDatePreset(),
        fields: minimalFields,
        limit: "100",
      }, { maxPages: getSyncMaxPages("META_SYNC_MAX_INSIGHT_PAGES", 30) });
    }
    throw error;
  }
}

async function fetchAdPreview(adId: string) {
  try {
    const previews = await graphPages<JsonRecord>(`${adId}/previews`, {
      ad_format: "DESKTOP_FEED_STANDARD",
    });
    const first = previews[0];
    return {
      previewHtml: stringField(first?.body),
      previewUrl: stringField(first?.iframe_url) || stringField(first?.url),
    };
  } catch {
    return { previewHtml: null, previewUrl: null };
  }
}

function chooseStoredPreview(
  creative: JsonRecord,
  adPreview: { previewHtml: string | null; previewUrl: string | null } | null,
) {
  const thumbnailUrl = stringField(creative.thumbnail_url);
  const imageUrl = stringField(creative.image_url);
  const videoThumbnailUrl = stringField(creative.video_thumbnail_url);

  if (thumbnailUrl) {
    return { previewSource: "thumbnail", previewUrl: thumbnailUrl, previewHtml: null };
  }
  if (imageUrl) {
    return { previewSource: "image", previewUrl: imageUrl, previewHtml: null };
  }
  if (adPreview?.previewHtml || adPreview?.previewUrl) {
    return {
      previewSource: "ad_preview",
      previewUrl: adPreview.previewUrl,
      previewHtml: adPreview.previewHtml,
    };
  }
  if (videoThumbnailUrl) {
    return { previewSource: "video_thumbnail", previewUrl: videoThumbnailUrl, previewHtml: null };
  }
  return { previewSource: "fallback", previewUrl: null, previewHtml: null };
}

async function graphFetch<T>(path: string, params: Record<string, string | undefined>) {
  const url = graphUrl(path, params);
  const response = await fetch(url, { cache: "no-store" });
  const json = (await response.json()) as MetaPaging<T> | T;

  if (!response.ok || (isRecord(json) && "error" in json)) {
    const error = isRecord(json) ? json.error : undefined;
    throw new MetaGraphError(
      isRecord(error) && typeof error.message === "string"
        ? error.message
        : `Meta Graph API request failed for ${path}`,
      json,
    );
  }

  if (isRecord(json) && Array.isArray(json.data)) {
    return json.data as T;
  }

  return json as T;
}

async function graphPages<T>(
  path: string,
  params: Record<string, string | undefined>,
  options: PageOptions = {},
) {
  const data: T[] = [];
  let nextUrl: string | undefined = graphUrl(path, params);
  let page = 0;

  while (nextUrl && (!options.maxPages || page < options.maxPages)) {
    const response = await fetch(nextUrl, { cache: "no-store" });
    const json = (await response.json()) as MetaPaging<T>;

    if (!response.ok || json.error) {
      throw new MetaGraphError(
        json.error?.message || `Meta Graph API request failed for ${path}`,
        json,
      );
    }

    data.push(...(json.data || []));
    nextUrl = json.paging?.next;
    page += 1;
  }

  return data;
}

function getSyncDatePreset() {
  return process.env.META_SYNC_DATE_PRESET?.trim() || "last_30d";
}

function getSyncMaxPages(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function graphUrl(path: string, params: Record<string, string | undefined>) {
  const url = new URL(`https://graph.facebook.com/${getMetaApiVersion()}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", requireMetaAccessToken());
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

function getConfiguredAccounts(): SyncAccountConfig[] {
  const hp = process.env.META_HP_AD_ACCOUNT_ID;
  const vvs = process.env.META_VVS_AD_ACCOUNT_ID;
  const missing = [
    !hp ? "META_HP_AD_ACCOUNT_ID" : null,
    !process.env.META_ACCESS_TOKEN ? "META_ACCESS_TOKEN" : null,
  ].filter(Boolean) as string[];

  if (missing.length) {
    throw new ConfigurationError(
      `Missing Meta configuration: ${missing.join(", ")}`,
      missing,
    );
  }

  const accounts: SyncAccountConfig[] = [
    { brandCode: "HP", brandName: "Hung Phat", accountId: hp! },
  ];

  if (vvs?.trim()) {
    accounts.push({ brandCode: "VVS", brandName: "VVS", accountId: vvs });
  }

  return accounts;
}

function requireMetaAccessToken() {
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) {
    throw new ConfigurationError("Missing META_ACCESS_TOKEN", ["META_ACCESS_TOKEN"]);
  }
  return accessToken;
}

async function ensureBrands(accounts: SyncAccountConfig[]) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("brands")
    .upsert(
      accounts.map((account) => ({ code: account.brandCode, name: account.brandName })),
      { onConflict: "code" },
    )
    .select("*");

  if (error) throw error;
  return (data || []) as JsonRecord[];
}

async function fetchCampaignUmbrellaOverrides(metaAccountId: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("campaign_umbrella_overrides")
    .select("entity_type, entity_id, campaign_umbrella, reason")
    .eq("meta_account_id", metaAccountId);

  if (error) throw error;

  return rows<JsonRecord>(data).reduce((overrides, row) => {
    const entityType = stringField(row.entity_type);
    const entityId = stringField(row.entity_id);
    const umbrella = stringField(row.campaign_umbrella);
    if (!entityType || !entityId || !isCampaignUmbrella(umbrella)) return overrides;
    overrides.set(`${entityType}:${entityId}`, {
      umbrella,
      reason: stringField(row.reason),
    });
    return overrides;
  }, new Map<string, CampaignUmbrellaOverride>());
}

function getUmbrellaOverride(
  overrides: Map<string, CampaignUmbrellaOverride>,
  entityType: "campaign" | "ad_set" | "ad",
  entityId: string | null,
) {
  if (!entityId) return null;
  return overrides.get(`${entityType}:${entityId}`) || null;
}

function umbrellaColumns(classification: CampaignUmbrellaClassification) {
  return {
    campaign_umbrella: classification.umbrella,
    campaign_umbrella_confidence: classification.confidence,
    campaign_umbrella_source: classification.source,
    campaign_umbrella_reason: classification.reason,
  };
}

async function upsertSingle(table: string, row: JsonRecord, onConflict: string) {
  const rows = await upsertMany(table, [row], onConflict);
  return rows[0];
}

async function upsertMany(table: string, rows: JsonRecord[], onConflict: string) {
  if (!rows.length) return [];
  const supabase = createServiceClient() as unknown as DynamicSupabaseClient;
  const results: JsonRecord[] = [];

  for (const chunk of chunks(rows, 500)) {
    const { data, error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict })
      .select("*");

    if (error) throw error;
    results.push(...((data || []) as JsonRecord[]));
  }

  return results;
}

function normalizeAccountId(accountId: string) {
  return accountId.trim().replace(/^act_/, "");
}

function chunks<T>(items: T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

function uniqueBy<T>(items: T[], keyFn: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function groupAdSetNamesByCampaignId(adSets: JsonRecord[]) {
  return adSets.reduce((groups, adSet) => {
    const campaignId = stringField(adSet.campaign_id);
    const name = stringField(adSet.name);
    if (!campaignId || !name) return groups;
    groups.set(campaignId, [...(groups.get(campaignId) || []), name]);
    return groups;
  }, new Map<string, string[]>());
}

function recordField(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function stringField(value: unknown): string | null {
  if (typeof value === "string" && value.length) return value;
  if (typeof value === "number") return String(value);
  return null;
}

function numberField(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function numberString(value: unknown): string {
  return String(numberField(value) || 0);
}

function moneyCents(value: unknown): number | null {
  const amount = numberField(value);
  return amount === null ? null : amount / 100;
}

function rows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

function extractActionCount(actions: unknown, actionTypes: string[]) {
  if (!Array.isArray(actions)) return 0;
  return actions.reduce((sum, action) => {
    if (!isRecord(action)) return sum;
    const type = String(action.action_type || "");
    if (!actionTypes.some((target) => type.includes(target))) return sum;
    return sum + (numberField(action.value) || 0);
  }, 0);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorToMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}
