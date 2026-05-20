import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { listActiveSignalsForRoom, type SignalRoom } from "@/lib/signal-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROOM_PERMISSION_MAP: Record<SignalRoom, "view_dashboard" | "view_inbox"> = {
  optimize: "view_dashboard",
  convert: "view_dashboard",
  operate: "view_dashboard",
};

const VALID_ROOMS: ReadonlySet<SignalRoom> = new Set([
  "optimize",
  "convert",
  "operate",
]);

function isValidRoom(value: string | null): value is SignalRoom {
  return value !== null && VALID_ROOMS.has(value as SignalRoom);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const roomParam = url.searchParams.get("room");

    if (!isValidRoom(roomParam)) {
      return Response.json(
        { error: "room must be one of: optimize, convert, operate" },
        { status: 400 },
      );
    }

    await requirePermissionFromRequest(request, ROOM_PERMISSION_MAP[roomParam]);

    const limitParam = url.searchParams.get("limit");
    const limit = Math.max(
      1,
      Math.min(100, limitParam ? Number(limitParam) || 25 : 25),
    );

    const signals = await listActiveSignalsForRoom(roomParam, limit);
    return Response.json({ room: roomParam, signals });
  } catch (error) {
    return jsonError(error);
  }
}
