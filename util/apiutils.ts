// Browser-side wrappers around our /api/spotify/* proxy. The Spotify access
// token lives only in the JWT cookie; clients never see it.

import {
  enqueueWrite,
  listPending,
  pendingCount,
  removeWrite,
  type PendingWrite,
} from "./offlineQueue";

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

// ---------------------------------------------------------------------------
// Note PUT with offline-queue fallback
// ---------------------------------------------------------------------------

export type NotePutPayload = Omit<PendingWrite, "enqueued_at">;

export type NotePutResult =
  | { status: "ok"; updated_at: string | null }
  | { status: "queued" } // network unreachable; saved to IndexedDB for replay
  | { status: "conflict"; current_updated_at: string | null }
  | { status: "auth_expired" }
  | { status: "error"; reason: string };

// Single-shot PUT helper used by both the live editor save loop and the
// queue drainer. Network errors (offline, fetch threw) → queue and report
// "queued". HTTP errors are NOT queued (we don't want to spam retries on
// a permanent 4xx) — only fetch-level failures count as offline.
async function putNoteOnce(
  payload: NotePutPayload,
  opts?: { retryConflictAsLastWrite?: boolean }
): Promise<NotePutResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const queued = await enqueueWrite(payload);
    return queued ? { status: "queued" } : { status: "error", reason: "queue_failed" };
  }
  let res: Response;
  try {
    res = await fetch("/api/notes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    const queued = await enqueueWrite(payload);
    return queued ? { status: "queued" } : { status: "error", reason: "queue_failed" };
  }
  if (res.status === 401) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* ignore */ }
    if ((body as { error?: string } | null)?.error === "auth_expired") {
      return { status: "auth_expired" };
    }
    return { status: "error", reason: "unauthorized" };
  }
  if (res.status === 409) {
    const j = (await res.json().catch(() => ({}))) as {
      current_updated_at?: string;
    };
    if (opts?.retryConflictAsLastWrite) {
      // Drain path: caller wrote this offline; their intent was "keep this
      // version when I'm back online." Honor it via a non-conditional retry.
      return putNoteOnce(
        { ...payload, expected_updated_at: null },
        { retryConflictAsLastWrite: false }
      );
    }
    return { status: "conflict", current_updated_at: j.current_updated_at ?? null };
  }
  if (!res.ok) {
    return { status: "error", reason: `http_${res.status}` };
  }
  const j = (await res.json().catch(() => ({}))) as { updated_at?: string };
  return { status: "ok", updated_at: j.updated_at ?? null };
}

export function putNote(payload: NotePutPayload): Promise<NotePutResult> {
  return putNoteOnce(payload);
}

export type DrainResult = { drained: number; remaining: number };

// Replay every queued write in enqueue order. On the first hard failure
// (network, auth, 5xx) we stop and leave the rest queued for the next
// drain trigger — partial progress is fine, and stopping prevents a
// thundering-herd retry storm against a flapping server.
export async function drainQueue(): Promise<DrainResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { drained: 0, remaining: await pendingCount() };
  }
  const pending = (await listPending()).sort(
    (a, b) => a.enqueued_at - b.enqueued_at
  );
  let drained = 0;
  for (const p of pending) {
    const { enqueued_at: _enqueued, ...payload } = p;
    void _enqueued;
    const result = await putNoteOnce(payload, { retryConflictAsLastWrite: true });
    if (result.status === "ok") {
      await removeWrite(p.track_id);
      drained++;
      continue;
    }
    if (result.status === "queued") {
      // Went offline mid-drain. Stop; the next `online` event will resume.
      break;
    }
    if (result.status === "auth_expired") {
      // No point retrying until the user re-auths; leave the queue intact.
      break;
    }
    // Server error / unexpected status — back off and try again later.
    break;
  }
  return { drained, remaining: await pendingCount() };
}

export function getPendingCount(): Promise<number> {
  return pendingCount();
}
