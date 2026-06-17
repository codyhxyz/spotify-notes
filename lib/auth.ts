import NextAuth from "next-auth";
import Spotify from "next-auth/providers/spotify";
import { db, schema } from "@/lib/db";

// Spotify scopes — derived from the actual API endpoints the app hits:
//   GET    /v1/me/player           -> user-read-playback-state
//   GET    /v1/me/player/devices   -> user-read-playback-state
//   PUT    /v1/me/player/play      -> user-modify-playback-state
//   PUT    /v1/me/player/pause     -> user-modify-playback-state
//   POST   /v1/me/player/previous  -> user-modify-playback-state
//   POST   /v1/me/player/next      -> user-modify-playback-state
//   GET    /v1/tracks/{id}         -> (no scope, public catalog)
//   GET    /v1/me                  -> user-read-email
//                                     (we hit /me implicitly via Spotify
//                                     OAuth profile to obtain the canonical
//                                     Spotify user id used as our DB user_id)
//
// `user-read-private` is intentionally NOT requested. Spotify's docs list it
// as required for GET /v1/me, but in practice the fields we actually read
// (id, display_name, images) are returned under user-read-email alone.
// Omitting it keeps the scope set minimal and avoids a dashboard-scopes
// mismatch that produced `invalid_scope` on the OAuth callback (2026-06-17).
const SPOTIFY_SCOPES = [
  "user-read-email",
  "user-read-playback-state",
  "user-modify-playback-state",
].join(" ");

// Refresh an expired Spotify access token using the refresh token.
async function refreshSpotifyAccessToken(refreshToken: string) {
  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch("https://accounts.spotify.com/api/token", {
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

  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `Failed to refresh Spotify token: ${res.status} ${JSON.stringify(json)}`
    );
  }
  return {
    accessToken: json.access_token as string,
    // Spotify may or may not rotate the refresh token; fall back to the old one.
    refreshToken: (json.refresh_token as string | undefined) ?? refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + (json.expires_in as number),
  };
}

function sanitizeOAuthDebugMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const input = metadata as Record<string, unknown>;
  const output: Record<string, string> = {};
  for (const key of ["providerId", "error", "error_description", "error_uri"]) {
    const value = input[key];
    if (typeof value === "string") {
      output[key] = value.length > 500 ? `${value.slice(0, 500)}…` : value;
    }
  }
  return Object.keys(output).length ? output : null;
}

// Auth.js v5: NextAuth() returns the four primitives below. `auth()` is the
// universal server-side session reader (replaces v4's getServerSession).
// `handlers` plugs into the App Router catchall route.
export const { handlers, auth, signIn, signOut } = NextAuth({
  // v5 reads AUTH_SECRET by default; we keep NEXTAUTH_SECRET working as a
  // fallback so existing prod env vars don't have to be renamed in lockstep
  // with the deploy.
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  // Trust the host header when running behind Vercel / a reverse proxy.
  // Vercel auto-detects this, but being explicit keeps non-Vercel hosts
  // (preview branches on custom domains, self-host) working without surprise.
  trustHost: true,
  logger: {
    // Auth.js intentionally hides OAuth provider callback params when `debug`
    // is off. Keep debug off in prod (it can include secrets/tokens in other
    // messages) but preserve Spotify's own error string for incident response.
    debug(message, metadata) {
      if (message === "OAuthCallbackError") {
        const safe = sanitizeOAuthDebugMetadata(metadata);
        if (safe?.providerId === "spotify") {
          console.error("[auth][spotify-oauth-provider-error]", safe);
        }
      }
      if (process.env.NODE_ENV !== "production") {
        console.log("[auth][debug]", message, JSON.stringify(metadata, null, 2));
      }
    },
  },
  providers: [
    Spotify({
      clientId: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      authorization: {
        // Use Spotify's canonical OAuth endpoint. We previously pinned the
        // locale-prefixed `/en/authorize` to dodge an iOS universal-link bug,
        // but Spotify's current AASA no longer claims `/authorize`, and the
        // locale route started returning `invalid_scope` for the valid playback
        // scope set on desktop Chrome (2026-06-17 prod logs).
        url: "https://accounts.spotify.com/authorize",
        params: { scope: SPOTIFY_SCOPES },
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile }) {
      // Initial sign-in: persist Spotify access/refresh tokens + user id.
      if (account && profile) {
        return {
          ...token,
          spotifyUserId: (profile as { id?: string }).id,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
        };
      }

      // Subsequent calls: return cached token if still valid.
      const expiresAt = (token as { expiresAt?: number }).expiresAt;
      if (expiresAt && Date.now() / 1000 < expiresAt - 60) {
        return token;
      }

      // Token expired — refresh.
      const refreshToken = (token as { refreshToken?: string }).refreshToken;
      if (!refreshToken) return token;
      try {
        const refreshed = await refreshSpotifyAccessToken(refreshToken);
        return {
          ...token,
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          expiresAt: refreshed.expiresAt,
          error: undefined,
        };
      } catch (err) {
        console.error("[auth] token refresh failed:", err);
        return { ...token, error: "RefreshAccessTokenError" };
      }
    },
    async session({ session, token }) {
      const t = token as { spotifyUserId?: string; error?: string };
      // Expose only the canonical Spotify user id and any auth error to the
      // client. The Spotify access token stays server-side; clients hit our
      // own /api/spotify/* proxy which reads the token from the JWT cookie.
      if (session.user) {
        (session.user as { id?: string }).id = t.spotifyUserId;
      }
      if (t.error) (session as { error?: string }).error = t.error;
      return session;
    },
  },
  events: {
    // First sign-in: ensure a row exists in the existing `users` table keyed
    // by the Spotify user id. Idempotent via ON CONFLICT DO NOTHING so we
    // don't clobber an existing accepted_eula value.
    async signIn({ profile }) {
      const spotifyUserId = (profile as { id?: string } | undefined)?.id;
      if (!spotifyUserId) return;
      try {
        await db
          .insert(schema.users)
          .values({ userId: spotifyUserId, acceptedEula: false })
          .onConflictDoNothing({ target: schema.users.userId });
      } catch (err) {
        // Don't block sign-in if the DB write fails; log so we can debug.
        console.error("[auth] failed to upsert user row:", err);
      }
    },
  },
  pages: {
    signIn: "/",
  },
  debug: process.env.NODE_ENV !== "production",
});
