import { requirePermissionFromRequest } from "@/lib/app-auth";
import {
  createAdsAnalystClient,
  withAdsAnalystEnvironment,
} from "@/lib/ads-analyst-db";
import { jsonError } from "@/lib/http";
import {
  isLiveSendEnabled,
  sendSocialReply,
  SendReplyError,
} from "@/lib/social-reply-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Send a human-approved reply to a social conversation.
 *
 * Enforces the PRD §11 guardrail:
 *   - Caller must have send_inbox_reply permission (verified via cookie).
 *   - Request body must include exact text the user saw on screen.
 *   - Text must be non-empty after trim.
 *   - Per-approver rate limit: max RATE_LIMIT_MAX live sends per 60s window.
 *
 * Two delivery modes:
 *   - **Dry-run** (default): ALLOW_LIVE_META_SEND unset/false. Records an
 *     audit row in ai_reply_suggestions with status='approved' and returns
 *     a notice that live delivery is disabled. This is the safe default for
 *     staging and for the Phase 11 verification window before cutover.
 *   - **Live**: ALLOW_LIVE_META_SEND=true. Records the audit row, then calls
 *     the Meta Graph send endpoint, then transitions the audit row to
 *     status='sent' with the Meta-returned id, and finally inserts an
 *     outbound row into meta_social_messages (DMs) or meta_social_comments
 *     (comment replies). Failures leave the audit row at status='approved'
 *     with `send_error` populated so Operate room can surface them.
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

// PRD §11 rate-limit: anything beyond this is almost certainly accidental
// double-tap, a runaway script, or a hostile caller. We block at the route
// boundary so the Meta call never even happens.
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

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

    const approverId = profile.appUserId ?? profile.authUserId ?? null;
    const approverEmail = profile.email;

    // Rate-limit per approver. Implemented as a count query against the audit
    // table — same row we are about to write, so the limit covers both
    // dry-run and live sends.
    const supabase = createAdsAnalystClient("web") as unknown as RouteSupabase;
    if (approverId) {
      const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
      const recent = await supabase
        .from("ai_reply_suggestions")
        .select("id", { count: "exact", head: true })
        .eq("context_used->>approved_by", approverId)
        .gte("created_at", since);
      if (recent.error == null && (recent.count ?? 0) >= RATE_LIMIT_MAX) {
        return Response.json(
          {
            error: `Rate limit reached: max ${RATE_LIMIT_MAX} sends per minute. Slow down or split across users.`,
          },
          { status: 429 },
        );
      }
    }

    // 1. Insert the audit row first. Every send-reply attempt — even one
    //    that fails at the Meta layer — is durably recorded.
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
        approved_by: approverId,
        approved_email: approverEmail,
        approved_at: new Date().toISOString(),
        prior_draft_id: body.draftId ?? null,
        live_send_attempted: isLiveSendEnabled(),
      } as Record<string, unknown>,
      model: "staff-approved",
      prompt_version: null,
    });

    const insert = await supabase
      .from("ai_reply_suggestions")
      .insert(auditRow)
      .select("id, created_at")
      .single();

    if (insert.error) throw insert.error;
    const row = (insert.data ?? null) as { id: string; created_at: string } | null;
    const suggestionId = row?.id ?? null;

    // 2. Dry-run mode — return the recorded notice and stop. Live delivery
    //    is the explicit opt-in for the verification window.
    if (!isLiveSendEnabled()) {
      return Response.json({
        ok: true,
        id: suggestionId,
        created_at: row?.created_at ?? null,
        live: false,
        notice:
          "Approved reply recorded. Live delivery is disabled (set ALLOW_LIVE_META_SEND=true to enable).",
      });
    }

    // 3. Live mode — call Meta, then surface the Meta-returned id back.
    if (!suggestionId) {
      // We could not record an audit row; refusing to send is the safe path
      // since the operator would have no record of what we just delivered.
      return Response.json(
        { error: "Audit row did not return an id. Refusing to deliver to Meta." },
        { status: 500 },
      );
    }

    try {
      const send = await sendSocialReply({
        platform: platform as "facebook" | "instagram",
        sourceType: sourceType as "message" | "comment",
        sourceId,
        brand: brand as "HP" | "VVS" | "Unassigned",
        text,
        suggestionId,
        approverUserId: approverId,
        approverEmail,
      });
      return Response.json({
        ok: true,
        id: suggestionId,
        created_at: row?.created_at ?? null,
        live: true,
        meta_send_id: send.metaSendId,
        sent_at: send.sentAt,
        notice: "Reply delivered to Meta.",
      });
    } catch (sendErr) {
      if (sendErr instanceof SendReplyError) {
        return Response.json(
          {
            ok: false,
            id: suggestionId,
            error: sendErr.message,
            live: true,
            stage: "meta-send",
          },
          { status: sendErr.status },
        );
      }
      throw sendErr;
    }
  } catch (error) {
    return jsonError(error);
  }
}

type RouteSupabase = {
  from: (t: string) => {
    insert: (
      row: Record<string, unknown>,
    ) => {
      select: (cols: string) => {
        single: () => Promise<{ data: unknown; error: Error | null }>;
      };
    };
    select: (
      cols: string,
      options?: { count?: "exact"; head?: boolean },
    ) => {
      eq: (col: string, value: string) => {
        gte: (col: string, value: string) => Promise<{
          count: number | null;
          error: Error | null;
        }>;
      };
    };
  };
};
