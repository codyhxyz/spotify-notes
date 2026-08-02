// Server-side Spotify Web API client.
//
// This module is the ONLY place the app reads a Spotify access token, and it
// guarantees the token it hands out is fresh. That guarantee is the whole
// point: the previous design kept the tokens in the Auth.js JWT cookie and
// read them here with getToken(), which only decrypts the cookie and never
// runs the `jwt` callback where refresh lived. An hour after sign-in the
// cookie held a dead token, Spotify answered 401, and the client treated that
// as "logged out" and redirected through OAuth.
//
// Now the cookie carries identity only (spotifyUserId) and the tokens live in
// the spotify_accounts table, so we can refresh at the point of use.

import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const SPOTIFY_API = "https://api.spotify.com/v1";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

// Auth.js v5 reads AUTH_SECRET by default. We honor NEXTAUTH_SECRET as a
// fallback so existing prod env doesn't need to be renamed in lockstep.
const AUTH_SECRET = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

// Refresh this far ahead of the real expiry, so a request that takes a moment
// to reach Spotify doesn't arrive with a token that died in flight.
const REFRESH_SKEW_MS = 60_000;

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------

export type SpotifyTokens = {
  accessToken: string;
  refreshToken: string;
  /** Unix seconds, as Spotify's OAuth response reports it. */
  expiresAt: number;
};

// Called once at sign-in (lib/auth.ts). Creates the users row first so the
// spotify_accounts foreign key holds, then stores the freshly minted tokens.
// Both are idempotent: signing in again refreshes the tokens in place and
// leaves accepted_eula untouched.
export async function provisionSpotifyAccount(
  spotifyUserId: string,
  tokens: SpotifyTokens
): Promise<void> {
  await db
    .insert(schema.users)
    .values({ userId: spotifyUserId, acceptedEula: false })
    .onConflictDoNothing({ target: schema.users.userId });

  const expiresAt = new Date(tokens.expiresAt * 1000);
  await db
    .insert(schema.spotifyAccounts)
    .values({
      userId: spotifyUserId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: schema.spotifyAccounts.userId,
      set: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt,
        updatedAt: new Date(),
      },
    });
}

type AccountRow = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
};

async function loadAccount(spotifyUserId: string): Promise<AccountRow | null> {
  const rows = await db
    .select({
      accessToken: schema.spotifyAccounts.accessToken,
      refreshToken: schema.spotifyAccounts.refreshToken,
      expiresAt: schema.spotifyAccounts.expiresAt,
    })
    .from(schema.spotifyAccounts)
    .where(eq(schema.spotifyAccounts.userId, spotifyUserId))
    .limit(1);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------

// Spotify distinguishes "this refresh token is dead" (invalid_grant — the user
// revoked us in their account settings) from "we couldn't reach Spotify right
// now" (5xx, network, cold-start timeout). Only the first warrants dragging
// the user back through OAuth; the second is transient and the caller should
// try again later. Conflating them is what made a single blip look like a
// logout.
type RefreshFailure = { kind: "revoked" | "unavailable"; detail: string };
type RefreshOutcome =
  | { ok: true; tokens: SpotifyTokens }
  | { ok: false; failure: RefreshFailure };

async function requestRefresh(refreshToken: string): Promise<RefreshOutcome> {
  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

  let res: Response;
  try {
    res = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      cache: "no-store",
    });
  } catch (err) {
    return {
      ok: false,
      failure: { kind: "unavailable", detail: `network: ${String(err)}` },
    };
  }

  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };

  if (!res.ok) {
    // 400 invalid_grant is the definitive "re-authorize me" signal. Anything
    // else (429, 5xx, a proxy hiccup) is worth retrying on a later request.
    const revoked = res.status === 400 && json.error === "invalid_grant";
    return {
      ok: false,
      failure: {
        kind: revoked ? "revoked" : "unavailable",
        detail: `${res.status} ${json.error ?? ""}`.trim(),
      },
    };
  }
  if (!json.access_token || typeof json.expires_in !== "number") {
    return {
      ok: false,
      failure: { kind: "unavailable", detail: "malformed token response" },
    };
  }

  return {
    ok: true,
    tokens: {
      accessToken: json.access_token,
      // Spotify usually returns the same refresh token and sometimes omits it
      // entirely; either way the one we already hold stays valid.
      refreshToken: json.refresh_token ?? refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + json.expires_in,
    },
  };
}

// Refresh and persist. Concurrent requests can race here — two handlers both
// seeing a stale row will both refresh. That's safe: Spotify's refresh tokens
// are reusable and it hands out independently valid access tokens, so the
// loser of the write race still holds a working token. Not worth a lock.
async function refreshAndStore(
  spotifyUserId: string,
  refreshToken: string
): Promise<RefreshOutcome> {
  const outcome = await requestRefresh(refreshToken);
  if (!outcome.ok) {
    console.error("[spotify] refresh failed", {
      kind: outcome.failure.kind,
      detail: outcome.failure.detail,
    });
    return outcome;
  }
  await db
    .update(schema.spotifyAccounts)
    .set({
      accessToken: outcome.tokens.accessToken,
      refreshToken: outcome.tokens.refreshToken,
      expiresAt: new Date(outcome.tokens.expiresAt * 1000),
      updatedAt: new Date(),
    })
    .where(eq(schema.spotifyAccounts.userId, spotifyUserId));
  return outcome;
}

// ---------------------------------------------------------------------------
// Request-scoped client
// ---------------------------------------------------------------------------

export type SpotifyFetchInit = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | undefined>;
};

// `authError` is set when the failure came from our own auth handling rather
// than from Spotify rejecting the call itself. Route handlers hand the result
// to spotifyErrorResponse() and don't need to interpret it.
export type SpotifyFetchResult =
  | { ok: true; status: number; data: unknown }
  | {
      ok: false;
      status: number;
      data: unknown;
      authError?: "auth_expired" | "unavailable";
    };

export type SpotifyClient = {
  spotifyUserId: string;
  fetch(path: string, init?: SpotifyFetchInit): Promise<SpotifyFetchResult>;
};

async function rawFetch(
  accessToken: string,
  path: string,
  init: SpotifyFetchInit
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

function makeClient(
  spotifyUserId: string,
  initialAccessToken: string,
  initialRefreshToken: string
): SpotifyClient {
  // Held across calls so a handler that makes several requests (the play route
  // retries with a device hint) reuses whatever token a mid-flight refresh
  // produced instead of re-sending the dead one.
  let accessToken = initialAccessToken;
  let refreshToken = initialRefreshToken;

  return {
    spotifyUserId,
    async fetch(path, init = {}) {
      const first = await rawFetch(accessToken, path, init);
      if (first.ok || first.status !== 401) return first;

      // Spotify rejected the token even though we thought it was live — clock
      // skew, a grant revoked mid-request, or a row we read just before
      // another handler rotated it. Refresh once and retry before calling
      // this an auth failure.
      const outcome = await refreshAndStore(spotifyUserId, refreshToken);
      if (!outcome.ok) {
        const revoked = outcome.failure.kind === "revoked";
        return {
          ok: false,
          status: revoked ? 401 : 503,
          data: null,
          authError: revoked ? "auth_expired" : "unavailable",
        };
      }
      accessToken = outcome.tokens.accessToken;
      refreshToken = outcome.tokens.refreshToken;
      return rawFetch(accessToken, path, init);
    },
  };
}

export type SpotifyClientResult =
  | { ok: true; client: SpotifyClient }
  | { ok: false; response: NextResponse };

// Resolve the caller's identity from the session cookie, load their tokens,
// and refresh proactively if the access token is at or near expiry. Every
// /api/spotify/* route starts here.
export async function getSpotifyClient(
  req: NextRequest
): Promise<SpotifyClientResult> {
  // Auth.js prefixes the cookie with `__Secure-` on HTTPS and omits it on
  // HTTP. getToken does NOT auto-detect this — without the flag it only looks
  // for the unprefixed name, never finds the prod cookie, and returns null.
  const secureCookie = req.nextUrl.protocol === "https:";
  const token = await getToken({ req, secret: AUTH_SECRET, secureCookie });
  const spotifyUserId = token?.spotifyUserId as string | undefined;
  if (!spotifyUserId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  const account = await loadAccount(spotifyUserId);
  if (!account) {
    // Valid session but no tokens on file — the sign-in write failed, or the
    // row was deleted. Re-running OAuth is exactly the repair, so report it
    // like a revoked grant rather than as a generic 401.
    return { ok: false, response: authExpiredResponse() };
  }

  if (account.expiresAt.getTime() - REFRESH_SKEW_MS > Date.now()) {
    return {
      ok: true,
      client: makeClient(
        spotifyUserId,
        account.accessToken,
        account.refreshToken
      ),
    };
  }

  const outcome = await refreshAndStore(spotifyUserId, account.refreshToken);
  if (!outcome.ok) {
    return {
      ok: false,
      response:
        outcome.failure.kind === "revoked"
          ? authExpiredResponse()
          : unavailableResponse(),
    };
  }
  return {
    ok: true,
    client: makeClient(
      spotifyUserId,
      outcome.tokens.accessToken,
      outcome.tokens.refreshToken
    ),
  };
}

function authExpiredResponse(): NextResponse {
  return NextResponse.json({ error: "auth_expired" }, { status: 401 });
}

function unavailableResponse(): NextResponse {
  return NextResponse.json({ error: "spotify_unavailable" }, { status: 503 });
}

// Map a failed client.fetch() onto the response shape the browser expects.
// Only `auth_expired` (401) tells the client to re-run OAuth; a transient
// Spotify outage comes back as 503 so the client retries instead of bouncing
// the user through a sign-in they didn't need.
export function spotifyErrorResponse(
  result: Extract<SpotifyFetchResult, { ok: false }>
): NextResponse {
  if (result.authError === "auth_expired") return authExpiredResponse();
  if (result.authError === "unavailable") return unavailableResponse();
  return NextResponse.json(
    { error: "spotify_error", detail: result.data },
    { status: result.status }
  );
}

// Convenience: read /v1/me/player/devices and return the first playable
// (non-restricted) device id, if any. Used as a fallback when the user has
// no active device but does have an idle one (phone, desktop client).
export async function pickFallbackDeviceId(
  client: SpotifyClient
): Promise<string | undefined> {
  const r = await client.fetch("/me/player/devices");
  if (!r.ok) return undefined;
  const devices = (
    r.data as { devices?: Array<{ id?: string; is_restricted?: boolean }> } | null
  )?.devices;
  if (!devices) return undefined;
  for (const d of devices) {
    if (d?.id && !d.is_restricted) return d.id;
  }
  return undefined;
}
