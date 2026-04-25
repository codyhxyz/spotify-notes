"use client";
import { signIn, signOut } from "next-auth/react";

// Spotify OAuth via NextAuth (see lib/auth.ts for provider config + scopes).

export async function spotifyLogin(callbackUrl: string = "/home"): Promise<void> {
  await signIn("spotify", { callbackUrl });
}

export async function spotifyLogout(callbackUrl: string = "/"): Promise<void> {
  await signOut({ callbackUrl });
}
