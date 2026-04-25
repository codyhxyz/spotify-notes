import { auth } from "@/lib/auth";

// Server-side helper: returns the canonical Spotify user_id for the current
// session, or null if unauthenticated.
export async function getSessionUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
