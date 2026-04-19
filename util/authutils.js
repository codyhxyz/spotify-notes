"use client";
import { signIn, signOut } from "next-auth/react";

// Spotify OAuth via NextAuth (see lib/auth.ts for provider config + scopes).

export async function spotifyLogin() {
  await signIn("spotify", { callbackUrl: "/home" });
}

export async function spotifyLogout() {
  await signOut({ callbackUrl: "/" });
}
