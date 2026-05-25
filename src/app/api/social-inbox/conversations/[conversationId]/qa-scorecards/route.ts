import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { parseJsonObjectBody } from "@/lib/meta-inbox-api-validation";
import {
  createSocialInboxQaScorecard,
  type MetaInboxQaScorecardInput,
} from "@/lib/social-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  conversationId: string;
};

const QA_SCORECARD_BODY_FIELDS = {
  sendAttemptId: { type: "string", nullable: true },
  reviewedUserId: { type: "string", nullable: true },
  toneScore: { type: "numberOrString", nullable: true },
  completenessScore: { type: "numberOrString", nullable: true },
  accuracyScore: { type: "numberOrString", nullable: true },
  nextStepScore: { type: "numberOrString", nullable: true },
  speedScore: { type: "numberOrString", nullable: true },
  policyComplianceScore: { type: "numberOrString", nullable: true },
  coachingNote: { type: "string", nullable: true },
} as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<Params> },
) {
  try {
    const profile = await requirePermissionFromRequest(request, "manage_inbox_state");
    const { conversationId } = await params;
    const input = await parseJsonObjectBody<MetaInboxQaScorecardInput>(
      request,
      QA_SCORECARD_BODY_FIELDS,
    );
    const result = await createSocialInboxQaScorecard(
      decodeURIComponent(conversationId),
      profile,
      input,
    );

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
