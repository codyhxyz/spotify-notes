import { NextRequest, NextResponse } from "next/server";
import { getSpotifyToken, spotifyFetch } from "@/lib/spotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/spotify/playback
// Returns { playing, progressMs, durationMs, trackId, hasActiveDevice } or
// { error: "auth_expired" } when the underlying refresh has failed.
export async function GET(req: NextRequest) {
  const tok = await getSpotifyToken(req);
  if (!tok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (tok.error === "RefreshAccessTokenError") {
    return NextResponse.json({ error: "auth_expired" }, { status: 401 });
  }

  const r = await spotifyFetch(tok.accessToken, "/me/player");
  if (!r.ok) {
    if (r.status === 401) {
      return NextResponse.json({ error: "auth_expired" }, { status: 401 });
    }
    return NextResponse.json({ error: "spotify_error" }, { status: r.status });
  }
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
