import { NextRequest, NextResponse } from "next/server";
import { getSpotifyToken, spotifyFetch } from "@/lib/spotify";
import { assertSameOrigin } from "@/lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/spotify/next  -> skip to next track
export async function POST(req: NextRequest) {
  const originErr = assertSameOrigin(req);
  if (originErr) return originErr;

  const tok = await getSpotifyToken(req);
  if (!tok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (tok.error === "RefreshAccessTokenError") {
    return NextResponse.json({ error: "auth_expired" }, { status: 401 });
  }
  const r = await spotifyFetch(tok.accessToken, "/me/player/next", {
    method: "POST",
  });
  if (!r.ok) {
    return NextResponse.json(
      { error: "spotify_error", detail: r.data },
      { status: r.status }
    );
  }
  return NextResponse.json({ ok: true });
}
