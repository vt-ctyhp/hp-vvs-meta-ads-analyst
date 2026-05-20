import { requirePermissionFromRequest } from "@/lib/app-auth";
import {
  createAdsAnalystClient,
  withAdsAnalystEnvironment,
} from "@/lib/ads-analyst-db";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Send a human-approved reply to a social conversation.
 *
 * Enforces the PRD §11 guardrail:
 *   - Caller must have send_inbox_reply permission (verified via cookie).
 *   - Request body must include exact text the user saw on screen.
 *   - Text must be non-empty after trim.
 *
 * v1 scope: records an approved-and-queued reply into ai_reply_suggestions.
 * It does NOT yet call the Meta Page send/reply API. Real Meta delivery is
 * a follow-up that wires page tokens + comment vs message branching. The
 * audit row this endpoint writes is the durable record the verification
 * phase will read against once delivery lands.
 */

type Body = {
  platform?: string;
  sourceType?: string;
  sourceId?: string;
  brand?: string;
  text?: string;
  draftId?: string | null;
};

const VALID_PLATFORMS = new Set(["facebook", "instagram"]);
const VALID_SOURCE_TYPES = new Set(["message", "comment"]);
const VALID_BRANDS = new Set(["HP", "VVS", "Unassigned"]);

export async function POST(request: Request) {
  try {
    const profile = await requirePermissionFromRequest(request, "send_inbox_reply");
    const body = (await request.json().catch(() => ({}))) as Body;

    const platform = (body.platform ?? "").toLowerCase();
    const sourceType = (body.sourceType ?? "").toLowerCase();
    const brand = body.brand ?? "Unassigned";
    const sourceId = (body.sourceId ?? "").trim();
    const text = (body.text ?? "").trim();

    if (!VALID_PLATFORMS.has(platform)) {
      return Response.json({ error: "platform must be 'facebook' or 'instagram'." }, { status: 400 });
    }
    if (!VALID_SOURCE_TYPES.has(sourceType)) {
      return Response.json({ error: "sourceType must be 'message' or 'comment'." }, { status: 400 });
    }
    if (!VALID_BRANDS.has(brand)) {
      return Response.json({ error: "brand must be 'HP', 'VVS', or 'Unassigned'." }, { status: 400 });
    }
    if (!sourceId) {
      return Response.json({ error: "sourceId is required." }, { status: 400 });
    }
    if (!text) {
      return Response.json({ error: "Reply text is required." }, { status: 400 });
    }
    if (text.length > 8000) {
      return Response.json(
        { error: "Reply text is too long (max 8000 characters)." },
        { status: 400 },
      );
    }

    const supabase = createAdsAnalystClient("web") as unknown as {
      from: (t: string) => {
        insert: (
          row: Record<string, unknown>,
        ) => {
          select: (cols: string) => {
            single: () => Promise<{ data: unknown; error: Error | null }>;
          };
        };
      };
    };

    const auditRow = withAdsAnalystEnvironment({
      platform,
      source_type: sourceType,
      thread_id: sourceType === "message" ? sourceId : null,
      comment_id: sourceType === "comment" ? sourceId : null,
      brand,
      language: "en",
      draft: text,
      status: "approved",
      context_used: {
        approved_by: profile.appUserId ?? profile.authUserId ?? null,
        approved_email: profile.email,
        approved_at: new Date().toISOString(),
        prior_draft_id: body.draftId ?? null,
      } as Record<string, unknown>,
      model: "staff-approved",
      prompt_version: null,
    });

    const { data, error } = await supabase
      .from("ai_reply_suggestions")
      .insert(auditRow)
      .select("id, created_at")
      .single();

    if (error) throw error;
    const row = (data ?? null) as { id: string; created_at: string } | null;

    return Response.json({
      ok: true,
      id: row?.id ?? null,
      created_at: row?.created_at ?? null,
      notice:
        "Approved reply recorded. Delivery to Meta is queued for verification phase wiring.",
    });
  } catch (error) {
    return jsonError(error);
  }
}
