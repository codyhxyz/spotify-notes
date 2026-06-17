// Auth.js v5: the NextAuth() factory in lib/auth.ts produced the route
// handlers. We wrap GET so Spotify's generic OAuthCallbackError redirects
// leave behind the actual provider error in Vercel logs without logging codes,
// state, tokens, or cookies.
import { handlers } from "@/lib/auth";
import type { NextRequest } from "next/server";

const SPOTIFY_CALLBACK_PATH = "/api/auth/callback/spotify";
const PKCE_COOKIE_NAMES = [
  "__Secure-authjs.pkce.code_verifier",
  "authjs.pkce.code_verifier",
];

function truncated(value: string | null, max = 500): string | null {
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function hasPkceCookie(req: NextRequest): boolean {
  return PKCE_COOKIE_NAMES.some((name) => req.cookies.has(name));
}

function authCookieNames(req: NextRequest): string[] {
  return req.cookies
    .getAll()
    .map((cookie) => cookie.name)
    .filter((name) => name.includes("authjs"));
}

function logSpotifyCallbackDiagnostics(req: NextRequest) {
  if (req.nextUrl.pathname !== SPOTIFY_CALLBACK_PATH) return;

  const params = req.nextUrl.searchParams;
  const error = params.get("error");
  const codePresent = params.has("code");
  const statePresent = params.has("state");
  const pkceCookiePresent = hasPkceCookie(req);

  if (error) {
    console.error("[spotify-oauth-callback-error]", {
      error,
      error_description: truncated(params.get("error_description")),
      error_uri: truncated(params.get("error_uri")),
      code_present: codePresent,
      state_present: statePresent,
      pkce_cookie_present: pkceCookiePresent,
      user_agent: truncated(req.headers.get("user-agent"), 240),
    });
    return;
  }

  // If Spotify returned a code but the encrypted PKCE verifier cookie is gone,
  // Auth.js can only surface InvalidCheck/Configuration. Log the cookie-shape
  // evidence (names only, never values) so SameSite/domain/browser issues are
  // diagnosable from production logs.
  if (codePresent && !pkceCookiePresent) {
    console.error("[spotify-oauth-callback-missing-pkce-cookie]", {
      code_present: true,
      state_present: statePresent,
      auth_cookie_names: authCookieNames(req),
      user_agent: truncated(req.headers.get("user-agent"), 240),
    });
  }
}

export async function GET(req: NextRequest) {
  logSpotifyCallbackDiagnostics(req);
  return handlers.GET(req);
}

export const POST = handlers.POST;
