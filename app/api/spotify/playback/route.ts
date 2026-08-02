import { NextRequest, NextResponse } from "next/server";
import { getSpotifyClient, spotifyErrorResponse } from "@/lib/spotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/spotify/playback
// Returns { playing, progressMs, durationMs, trackId, hasActiveDevice }.
export async function GET(req: NextRequest) {
  const auth = await getSpotifyClient(req);
  if (!auth.ok) return auth.response;

  const r = await auth.client.fetch("/me/player");
  if (!r.ok) return spotifyErrorResponse(r);

  if (r.status === 204 || !r.data) {
    return NextResponse.json({
      playing: false,
      progressMs: 0,
      durationMs: 0,
      trackId: null,
      hasActiveDevice: false,
    });
  }
  const d = r.data as {
    is_playing?: boolean;
    progress_ms?: number;
    item?: { id?: string; duration_ms?: number };
    device?: { id?: string };
  };
  return NextResponse.json({
    playing: !!d.is_playing,
    progressMs: typeof d.progress_ms === "number" ? d.progress_ms : 0,
    durationMs: d.item?.duration_ms ?? 0,
    trackId: d.item?.id ?? null,
    hasActiveDevice: !!d.device?.id,
  });
}
