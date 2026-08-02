import { NextRequest, NextResponse } from "next/server";
import { getSpotifyClient, spotifyErrorResponse } from "@/lib/spotify";
import { assertSameOrigin } from "@/lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/spotify/next  -> skip to next track
export async function POST(req: NextRequest) {
  const originErr = assertSameOrigin(req);
  if (originErr) return originErr;

  const auth = await getSpotifyClient(req);
  if (!auth.ok) return auth.response;

  const r = await auth.client.fetch("/me/player/next", { method: "POST" });
  if (!r.ok) return spotifyErrorResponse(r);
  return NextResponse.json({ ok: true });
}
