import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { createSocialInboxAttachmentUpload } from "@/lib/social-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  conversationId: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<Params> },
) {
  try {
    const profile = await requirePermissionFromRequest(request, "send_inbox_reply");
    const { conversationId } = await params;
    const formData = await request.formData();
    const file = formData.get("file");
    if (!isFormDataFile(file)) {
      throw Object.assign(new Error("Attachment file is required."), { status: 400 });
    }

    const result = await createSocialInboxAttachmentUpload(
      decodeURIComponent(conversationId),
      profile,
      {
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        bytes: await file.arrayBuffer(),
      },
    );

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

function isFormDataFile(value: FormDataEntryValue | null): value is File {
  return Boolean(
    value &&
      typeof value === "object" &&
      "arrayBuffer" in value &&
      "name" in value &&
      "size" in value &&
      "type" in value,
  );
}
