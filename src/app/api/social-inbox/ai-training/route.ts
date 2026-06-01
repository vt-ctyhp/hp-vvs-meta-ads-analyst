import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { parseJsonObjectBody } from "@/lib/meta-inbox-api-validation";
import {
  createAiReplyTrainingExample,
  getAiReplyTrainingData,
  simulateAiReplyTrainingDraft,
  updateAiReplyPromptProfile,
  type AiReplyPromptProfileInput,
  type AiReplyTrainingExampleInput,
  type AiReplyTrainingSimulationInput,
} from "@/lib/social-reply-training";
import { buildFoundationAiReplyDisabledResponse, isSocialReplySuggestionReady } from "@/lib/social-reply-foundation-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROFILE_BODY_FIELDS = {
  profileId: { type: "string", nullable: true },
  brand: { type: "string", nullable: true },
  businessContext: { type: "string", nullable: true },
  salesGuidance: { type: "string", nullable: true },
  toneGuidance: { type: "string", nullable: true },
  disallowedClaims: { type: "stringArray", nullable: true },
} as const;

const EXAMPLE_BODY_FIELDS = {
  promptProfileId: { type: "string", nullable: true },
  brand: { type: "string", nullable: true },
  title: { type: "string", nullable: true },
  source: { type: "string", nullable: true },
  conversationText: { type: "string", nullable: true },
  idealResponse: { type: "string", nullable: true },
  critique: { type: "string", nullable: true },
  rating: { type: "numberOrString", nullable: true },
} as const;

const SIMULATION_BODY_FIELDS = {
  brand: { type: "string", nullable: true },
  conversationText: { type: "string", nullable: true },
  staffGuidance: { type: "string", nullable: true },
} as const;

export async function GET(request: Request) {
  try {
    await requirePermissionFromRequest(request, "view_inbox");
    return Response.json(await getAiReplyTrainingData());
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const profile = await requirePermissionFromRequest(request, "manage_inbox_state");
    const input = await parseJsonObjectBody<AiReplyPromptProfileInput>(
      request,
      PROFILE_BODY_FIELDS,
    );
    return Response.json(await updateAiReplyPromptProfile(profile, input));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const profile = await requirePermissionFromRequest(request, "manage_inbox_state");
    const input = await parseJsonObjectBody<AiReplyTrainingExampleInput>(
      request,
      EXAMPLE_BODY_FIELDS,
    );
    return Response.json(await createAiReplyTrainingExample(profile, input));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requirePermissionFromRequest(request, "manage_inbox_state");
    if (!isSocialReplySuggestionReady()) {
      return Response.json(buildFoundationAiReplyDisabledResponse(), { status: 501 });
    }
    const input = await parseJsonObjectBody<AiReplyTrainingSimulationInput>(
      request,
      SIMULATION_BODY_FIELDS,
    );
    return Response.json(await simulateAiReplyTrainingDraft(input));
  } catch (error) {
    return jsonError(error);
  }
}
