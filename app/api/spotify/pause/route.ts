import { NextRequest, NextResponse } from "next/server";
import { getSpotifyClient, spotifyErrorResponse } from "@/lib/spotify";
import { assertSameOrigin } from "@/lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT /api/spotify/pause
export async function PUT(req: NextRequest) {
  const originErr = assertSameOrigin(req);
  if (originErr) return originErr;

  const auth = await getSpotifyClient(req);
  if (!auth.ok) return auth.response;

  const r = await auth.client.fetch("/me/player/pause", { method: "PUT" });
  if (!r.ok) return spotifyErrorResponse(r);
  return NextResponse.json({ ok: true });
}
