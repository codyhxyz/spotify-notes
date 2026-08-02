import { NextRequest, NextResponse } from "next/server";
import { getSpotifyClient, spotifyErrorResponse } from "@/lib/spotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Track = {
  name: string;
  artists: { name: string; external_urls: { spotify: string } }[];
  album: {
    images: { url: string }[];
    external_urls: { spotify: string };
  };
  external_urls: { spotify: string };
};

// GET /api/spotify/track/:id -> normalized metadata for the track.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getSpotifyClient(req);
  if (!auth.ok) return auth.response;

  const r = await auth.client.fetch(`/tracks/${encodeURIComponent(id)}`);
  if (!r.ok) return spotifyErrorResponse(r);

  const t = r.data as Track;
  return NextResponse.json({
    track_id: id,
    name: t.name,
    artists: t.artists.map((a) => a.name),
    artist_urls: t.artists.map((a) => a.external_urls?.spotify ?? "#"),
    image_url: t.album?.images?.[0]?.url ?? "",
    track_url: t.external_urls?.spotify ?? "",
    album_url: t.album?.external_urls?.spotify ?? "",
  });
}
