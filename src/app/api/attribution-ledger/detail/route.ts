import { requirePermissionFromRequest } from "@/lib/app-auth";
import { fetchAttributionLedgerDetail } from "@/lib/attribution-ledger";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requirePermissionFromRequest(request, "view_dashboard");
    const url = new URL(request.url);
    const visitorId = url.searchParams.get("visitorId")?.trim();
    const acuityAppointmentId = url.searchParams.get("acuityAppointmentId")?.trim();
    const eventId = url.searchParams.get("eventId")?.trim();

    if (!visitorId && !acuityAppointmentId && !eventId) {
      return Response.json(
        { error: "visitorId, acuityAppointmentId, or eventId is required." },
        { status: 400 },
      );
    }

    const detail = await fetchAttributionLedgerDetail({
      acuityAppointmentId,
      eventId,
      visitorId,
    });

    if (!detail) {
      return Response.json(
        { error: "Attribution ledger detail was not found." },
        { status: 404 },
      );
    }

    return Response.json(detail);
  } catch (error) {
    return jsonError(error);
  }
}
