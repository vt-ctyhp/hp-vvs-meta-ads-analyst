import { isAuthorizedCronRequest, jsonError } from "@/lib/http";
import { runWebsiteConversionReconciliation } from "@/lib/website-analytics";
import { WEBSITE_RECONCILIATION_CRON_TRIGGER } from "@/lib/website-reconciliation-triggers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DEFAULT_RECONCILIATION_DAYS = 35;

/**
 * Keeps Acuity appointments materialized into website conversion events without
 * making every Convert page view repair the same date range before rendering.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: "Unauthorized cron request" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const days = positiveNumber(url.searchParams.get("days")) ?? DEFAULT_RECONCILIATION_DAYS;
    const result = await runWebsiteConversionReconciliation(
      {
        days,
        startDate: url.searchParams.get("start"),
        endDate: url.searchParams.get("end"),
      },
      WEBSITE_RECONCILIATION_CRON_TRIGGER,
    );
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

function positiveNumber(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
