import { NextRequest, NextResponse } from "next/server";
import { getSpotifyToken, spotifyFetch } from "@/lib/spotify";
import { assertSameOrigin } from "@/lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT /api/spotify/pause
export async function PUT(req: NextRequest) {
  const originErr = assertSameOrigin(req);
  if (originErr) return originErr;

  const tok = await getSpotifyToken(req);
  if (!tok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (tok.error === "RefreshAccessTokenError") {
    return NextResponse.json({ error: "auth_expired" }, { status: 401 });
  }
  const r = await spotifyFetch(tok.accessToken, "/me/player/pause", {
    method: "PUT",
  });
  if (!r.ok) {
    return NextResponse.json(
      { error: "spotify_error", detail: r.data },
      { status: r.status }
    );
  }
  return NextResponse.json({ ok: true });
}
