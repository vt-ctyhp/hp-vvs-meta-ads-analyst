import { createAdsAnalystClient } from "./ads-analyst-db.ts";

type RollupRefreshClient = {
  rpc: (
    name: "refresh_meta_daily_insight_rollups",
    args: RefreshMetaInsightRollupsRpcArgs,
  ) => Promise<{ data: number | string | null; error: Error | null }>;
};

export type RefreshMetaInsightRollupsInput = {
  start: string | null;
  end: string | null;
  metaAccountId?: string | null;
};

export type RefreshMetaInsightRollupsRpcArgs = {
  p_start: string | null;
  p_end: string | null;
  p_meta_account_id: string | null;
};

export async function refreshMetaInsightRollups(
  input: RefreshMetaInsightRollupsInput,
  client: RollupRefreshClient = createAdsAnalystClient("worker") as unknown as RollupRefreshClient,
) {
  if (!input.start || !input.end) return 0;

  const { data, error } = await client.rpc(
    "refresh_meta_daily_insight_rollups",
    refreshMetaInsightRollupsRpcArgs(input),
  );

  if (error) throw error;

  const refreshedRows = Number(data ?? 0);
  return Number.isFinite(refreshedRows) ? refreshedRows : 0;
}

export function refreshMetaInsightRollupsRpcArgs(
  input: RefreshMetaInsightRollupsInput,
): RefreshMetaInsightRollupsRpcArgs {
  return {
    p_start: input.start,
    p_end: input.end,
    p_meta_account_id: input.metaAccountId ?? null,
  };
}
