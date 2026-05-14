import { generateExecutiveReport } from "@/lib/ai";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { days?: number };
    const report = await generateExecutiveReport(body.days || 30);
    return Response.json(report);
  } catch (error) {
    return jsonError(error);
  }
}
