import { answerExecutiveChat } from "@/lib/ai";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      sessionId?: string | null;
      message?: string;
      days?: number;
      startDate?: string | null;
      endDate?: string | null;
    };

    if (!body.message?.trim()) {
      return Response.json({ error: "Message is required" }, { status: 400 });
    }

    const result = await answerExecutiveChat({
      sessionId: body.sessionId,
      message: body.message,
      days: body.days,
      startDate: body.startDate,
      endDate: body.endDate,
    });

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
