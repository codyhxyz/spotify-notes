import "next-auth";
import "next-auth/jwt";

// Neither the session nor the JWT carries a Spotify token. The cookie holds
// identity only; the access/refresh tokens live in the spotify_accounts table
// so the server can refresh them at the point of use (see lib/spotify.ts).
declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    spotifyUserId?: string;
  }
}
