// Browser-side wrappers around our /api/spotify/* proxy. The Spotify access
// token lives only in the JWT cookie; clients never see it.

export type Playback = {
  playing: boolean;
  progressMs: number;
  durationMs: number;
  trackId: string | null;
  hasActiveDevice: boolean;
};

export type TrackMeta = {
  track_id: string;
  name: string;
  artists: string[];
  artist_urls: string[];
  image_url: string;
  track_url: string;
  album_url: string;
};

export class AuthExpiredError extends Error {
  constructor() {
    super("auth_expired");
    this.name = "AuthExpiredError";
  }
}

async function jsonFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (res.status === 401) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // ignore
    }
    if ((body as { error?: string } | null)?.error === "auth_expired") {
      throw new AuthExpiredError();
    }
    throw new Error(`unauthorized`);
  }
  if (!res.ok) {
    throw new Error(`request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export function getPlayback(): Promise<Playback> {
  return jsonFetch<Playback>("/api/spotify/playback");
}

export function getTrackMeta(trackId: string): Promise<TrackMeta> {
  return jsonFetch<TrackMeta>(
    `/api/spotify/track/${encodeURIComponent(trackId)}`
  );
}

export function playTrack(trackId: string, positionMs: number = 0): Promise<{ ok: true }> {
  return jsonFetch("/api/spotify/play", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ track_id: trackId, position_ms: positionMs }),
  });
}

export function pauseTrack(): Promise<{ ok: true }> {
  return jsonFetch("/api/spotify/pause", { method: "PUT" });
}

export function skipNext(): Promise<{ ok: true }> {
  return jsonFetch("/api/spotify/next", { method: "POST" });
}

export function skipPrevious(): Promise<{ ok: true }> {
  return jsonFetch("/api/spotify/previous", { method: "POST" });
}
