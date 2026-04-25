import { NextRequest, NextResponse } from "next/server";
import { getSpotifyToken, pickFallbackDeviceId, spotifyFetch } from "@/lib/spotify";
import { assertSameOrigin } from "@/lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT /api/spotify/play  body: { track_id, position_ms? }
// If no active device, picks the first non-restricted available device.
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

  const body = (await req.json().catch(() => ({}))) as {
    track_id?: string;
    position_ms?: number;
  };
  if (!body.track_id) {
    return NextResponse.json({ error: "track_id required" }, { status: 400 });
  }

  // Try without a device hint first; if Spotify says "no active device",
  // pick a fallback and retry once.
  const playload = {
    uris: [`spotify:track:${body.track_id}`],
    position_ms: body.position_ms ?? 0,
  };
  let r = await spotifyFetch(tok.accessToken, "/me/player/play", {
    method: "PUT",
    body: playload,
  });
  if (!r.ok && (r.status === 404 || r.status === 403)) {
    const deviceId = await pickFallbackDeviceId(tok.accessToken);
    if (deviceId) {
      r = await spotifyFetch(tok.accessToken, "/me/player/play", {
        method: "PUT",
        body: playload,
        query: { device_id: deviceId },
      });
    }
  }

  if (!r.ok) {
    return NextResponse.json(
      { error: "spotify_error", detail: r.data },
      { status: r.status }
    );
  }
  return NextResponse.json({ ok: true });
}
