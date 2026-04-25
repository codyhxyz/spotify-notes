import "next-auth";
import "next-auth/jwt";

// The Spotify access token deliberately does NOT live on Session. It is read
// server-side only via `getToken()` from the JWT cookie (see lib/spotify.ts).
declare module "next-auth" {
  interface Session {
    error?: string;
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
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    error?: string;
  }
}
