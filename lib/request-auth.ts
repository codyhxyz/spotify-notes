// Request authentication for the notes API.
//
// Two kinds of client reach /api/notes:
//
//   1. The web app, which carries an Auth.js session cookie. Identity comes
//      from lib/session.ts, and writes are CSRF-guarded by assertSameOrigin.
//   2. The Fastpotify Notes desktop client, which has no browser session at
//      all — it holds a Spotify Web API access token and sends it as
//      `Authorization: Bearer <token>`.
//
// For the bearer path we don't have a session to read, so we ask Spotify who
// the token belongs to (GET /v1/me) and use the returned `id` — the same
// canonical Spotify user id the cookie session carries. Verifying costs a
// round-trip to Spotify, so successful verifications are memoized for ten
// minutes keyed by a SHA-256 of the token. The cache is module-level, which
// on Vercel means per-instance and short-lived; that's fine, a cold instance
// just pays one extra /v1/me call.
//
// Security note: the token IS the credential. Anyone holding a user's Spotify
// access token can read and write that user's notes. That's the same trust
// the app already places in that token everywhere else.

import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { db, schema } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";

const SPOTIFY_ME_URL = "https://api.spotify.com/v1/me";
const CACHE_TTL_MS = 10 * 60 * 1000;
// Bounded so a burst of distinct tokens can't grow the map without limit.
// Well above the handful of tokens a single instance realistically sees.
const CACHE_MAX_ENTRIES = 500;

export type AuthenticatedRequest = {
  userId: string;
  via: "cookie" | "bearer";
};

type CacheEntry = { userId: string; expiresAt: number };

// Keyed by sha256(token) so the raw token is never held in memory longer than
// the request that carried it, and never ends up in a heap dump keyed by value.
const bearerCache = new Map<string, CacheEntry>();

function tokenKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cacheGet(key: string): string | null {
  const hit = bearerCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    bearerCache.delete(key);
    return null;
  }
  return hit.userId;
}

function cacheSet(key: string, userId: string): void {
  // Map preserves insertion order, so the first key is the oldest. Evicting
  // one per insert is enough to hold the cap.
  if (bearerCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = bearerCache.keys().next();
    if (!oldest.done) bearerCache.delete(oldest.value);
  }
  bearerCache.set(key, { userId, expiresAt: Date.now() + CACHE_TTL_MS });
}

// Read `Authorization: Bearer <token>`. Deliberately header-only: a token in a
// query string lands in access logs, browser history, and Referer headers.
function readBearer(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

// Mirrors the sign-in event's upsert (see provisionSpotifyAccount in
// lib/spotify.ts): a desktop-only user may never have opened the web app, and
// notes.user_id is a foreign key onto users.user_id.
async function ensureUserRow(userId: string): Promise<void> {
  await db
    .insert(schema.users)
    .values({ userId, acceptedEula: false })
    .onConflictDoNothing({ target: schema.users.userId });
}

async function resolveBearer(token: string): Promise<string | null> {
  const key = tokenKey(token);
  const cached = cacheGet(key);
  if (cached) return cached;

  let res: Response;
  try {
    res = await fetch(SPOTIFY_ME_URL, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    // Network blip reaching Spotify. Not the caller's fault, but we can't
    // establish identity, so the request is unauthenticated.
    console.warn("[request-auth] spotify /v1/me unreachable");
    return null;
  }

  if (!res.ok) {
    // 401 is the expected "bad/expired token". Anything else we also can't
    // trust. Log the status only — never the token.
    console.warn("[request-auth] spotify /v1/me rejected token", {
      status: res.status,
    });
    return null;
  }

  const profile = (await res.json().catch(() => null)) as { id?: unknown } | null;
  const userId = typeof profile?.id === "string" ? profile.id : null;
  if (!userId) {
    console.warn("[request-auth] spotify /v1/me returned no id");
    return null;
  }

  await ensureUserRow(userId);
  cacheSet(key, userId);
  return userId;
}

/**
 * Resolve the caller's Spotify user id, or null when unauthenticated.
 *
 * When an `Authorization: Bearer` header is present it is the ONLY credential
 * considered — there is deliberately no fallback to the cookie session. If a
 * bad bearer header could silently fall back, an attacker could attach junk
 * bearer to a cross-site request and skip the `via === "cookie"` CSRF check.
 */
export async function authenticate(
  req: NextRequest
): Promise<AuthenticatedRequest | null> {
  const bearer = readBearer(req);
  if (bearer) {
    const userId = await resolveBearer(bearer);
    return userId ? { userId, via: "bearer" } : null;
  }

  const userId = await getSessionUserId();
  return userId ? { userId, via: "cookie" } : null;
}
