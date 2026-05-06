// /share is the landing for the PWA's Web Share Target. The OS share sheet
// hands us the shared title/text/url as query params; we pull a Spotify
// track ID out of whichever field carries it and bounce the user into
// /home?play=<id>. The home page picks up the param, calls /api/spotify/play,
// and strips it on success.
//
// We accept track IDs from any of: a full open.spotify.com URL (with or
// without the /intl-xx prefix), a spotify: URI, or a bare 22-char base62
// ID someone pasted into the share text. Other Spotify shapes (album,
// playlist, episode) are intentionally ignored — this app is per-track.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SPOTIFY_TRACK_URL = /open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]{22})/i;
const SPOTIFY_TRACK_URI = /spotify:track:([A-Za-z0-9]{22})/i;
const BARE_TRACK_ID = /\b([A-Za-z0-9]{22})\b/;

function extractTrackId(haystack: string): string | null {
  return (
    haystack.match(SPOTIFY_TRACK_URL)?.[1] ??
    haystack.match(SPOTIFY_TRACK_URI)?.[1] ??
    haystack.match(BARE_TRACK_ID)?.[1] ??
    null
  );
}

export default async function SharePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const parts: string[] = [];
  for (const key of ["url", "text", "title"]) {
    const v = sp[key];
    if (typeof v === "string") parts.push(v);
    else if (Array.isArray(v)) {
      for (const s of v) if (typeof s === "string") parts.push(s);
    }
  }
  const trackId = extractTrackId(parts.join(" "));
  if (trackId) {
    redirect(`/home?play=${encodeURIComponent(trackId)}`);
  }
  // No Spotify track in the payload — drop them in the app anyway. Better
  // than a dead-end error page; the app will load whatever they're playing.
  redirect("/home");
}
