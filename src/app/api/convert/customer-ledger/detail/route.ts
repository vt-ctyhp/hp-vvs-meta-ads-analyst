import { requirePermissionFromRequest } from "@/lib/app-auth";
import { customerLedgerDetailIdentityFromSearchParams } from "@/lib/convert-customer-ledger";
import { fetchCustomerJourneyLedgerDetail } from "@/lib/customer-journey-ledger";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requirePermissionFromRequest(request, "view_dashboard");
    const url = new URL(request.url);
    const identity = customerLedgerDetailIdentityFromSearchParams(url.searchParams);

    if (!identity.data) {
      return Response.json(
        { error: identity.error || "visitorId is required." },
        { status: 400 },
      );
    }

    const detail = await fetchCustomerJourneyLedgerDetail(identity.data);

    if (!detail) {
      return Response.json(
        { error: "Customer journey detail was not found." },
        { status: 404 },
      );
    }

    return Response.json(detail);
  } catch (error) {
    return jsonError(error);
  }
}
