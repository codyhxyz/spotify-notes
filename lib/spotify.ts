// Server-side Spotify Web API client. The Spotify access token is read from
// the Auth.js JWT cookie via getToken() and never crosses to the client;
// every browser-originated Spotify call goes through /api/spotify/*.

import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const SPOTIFY_API = "https://api.spotify.com/v1";

// Auth.js v5 reads AUTH_SECRET by default. We honor NEXTAUTH_SECRET as a
// fallback so existing prod env doesn't need to be renamed in lockstep.
const AUTH_SECRET = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

export type SpotifyTokenInfo = {
  accessToken: string;
  spotifyUserId?: string;
  error?: string;
};

export async function getSpotifyToken(
  req: NextRequest
): Promise<SpotifyTokenInfo | null> {
  // Auth.js v5 ships A256CBC-HS512-encrypted JWTs; getToken handles the
  // decryption transparently using the same secret as the NextAuth() factory.
  // The default salt is the cookie name (authjs.session-token in v5),
  // matching what NextAuth() encoded with — so we don't override either.
  const token = await getToken({ req, secret: AUTH_SECRET });
  if (!token?.accessToken) return null;
  return {
    accessToken: token.accessToken as string,
    spotifyUserId: token.spotifyUserId as string | undefined,
    error: token.error as string | undefined,
  };
}

type SpotifyFetchInit = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | undefined>;
};

// Thin wrapper that forwards a request to Spotify with the user's bearer
// token, mirrors Spotify's status code, and returns the raw JSON (or null
// for 204). Errors are surfaced as { ok: false, status, body } so route
// handlers can map them onto NextResponse without try/catch noise.
export type SpotifyFetchResult =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status: number; data: unknown };

export async function spotifyFetch(
  accessToken: string,
  path: string,
  init: SpotifyFetchInit = {}
): Promise<SpotifyFetchResult> {
  const { method = "GET", body, query } = init;
  const qs = query
    ? "?" +
      Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(
          ([k, v]) =>
            `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
        )
        .join("&")
    : "";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  let payload: BodyInit | undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${SPOTIFY_API}${path}${qs}`, {
    method,
    headers,
    body: payload,
    cache: "no-store",
  });

  // 204 No Content (e.g. nothing playing) — return null body, success status.
  if (res.status === 204) return { ok: true, status: 204, data: null };

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return res.ok
    ? { ok: true, status: res.status, data }
    : { ok: false, status: res.status, data };
}

// Convenience: read /v1/me/player/devices and return the first playable
// (non-restricted) device id, if any. Used as a fallback when the user has
// no active device but does have an idle one (phone, desktop client).
export async function pickFallbackDeviceId(
  accessToken: string
): Promise<string | undefined> {
  const r = await spotifyFetch(accessToken, "/me/player/devices");
  if (!r.ok) return undefined;
  const devices = (r.data as { devices?: Array<{ id?: string; is_restricted?: boolean }> } | null)
    ?.devices;
  if (!devices) return undefined;
  for (const d of devices) {
    if (d?.id && !d.is_restricted) return d.id;
  }
  return undefined;
}
