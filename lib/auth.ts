import NextAuth from "next-auth";
import Spotify from "next-auth/providers/spotify";
import { provisionSpotifyAccount } from "@/lib/spotify";

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
      // Initial sign-in is the only moment this callback has anything to do.
      // The session cookie carries identity and nothing else — the Spotify
      // access/refresh tokens go to Postgres, where lib/spotify.ts can
      // refresh them at the point of use. Keeping them in the cookie meant
      // only Auth.js could refresh them, which it did far too rarely.
      if (!account || !profile) return token;

      const spotifyUserId = (profile as { id?: string }).id;
      const accessToken = account.access_token;
      const refreshToken = account.refresh_token;
      const expiresAt = account.expires_at;
      if (!spotifyUserId || !accessToken || !refreshToken || !expiresAt) {
        console.error("[auth] incomplete Spotify grant", {
          has_user_id: !!spotifyUserId,
          has_access_token: !!accessToken,
          has_refresh_token: !!refreshToken,
          has_expires_at: !!expiresAt,
        });
        return token;
      }

      // Provisioning creates the users row before the spotify_accounts row so
      // the foreign key holds. If it throws, we deliberately do NOT stamp
      // spotifyUserId onto the token: a session pointing at tokens that were
      // never written would 401 on every request with no way out. Failing the
      // sign-in sends the user back to "/" to try again.
      await provisionSpotifyAccount(spotifyUserId, {
        accessToken,
        refreshToken,
        expiresAt,
      });

      return { ...token, spotifyUserId };
    },
    async session({ session, token }) {
      // Expose only the canonical Spotify user id. Tokens never reach the
      // client; the browser hits our own /api/spotify/* proxy, which reads
      // them from the database.
      const spotifyUserId = (token as { spotifyUserId?: string }).spotifyUserId;
      if (session.user) {
        (session.user as { id?: string }).id = spotifyUserId;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
  debug: process.env.NODE_ENV !== "production",
});
