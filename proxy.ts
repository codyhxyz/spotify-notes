// Route gating for protected pages. Unauthenticated requests to /home (and
// any future protected route) are redirected to "/" (the sign-in page).
// Next 16 renamed the `middleware` convention to `proxy`; the export name
// follows.
//
// We keep this file Edge-runtime-safe by reading the JWT directly via
// next-auth/jwt's getToken, rather than importing the full `auth()` from
// lib/auth.ts (which transitively pulls in postgres-js for the signIn
// event handler — Node-only).

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const AUTH_SECRET = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

export async function proxy(req: NextRequest) {
  const token = await getToken({ req, secret: AUTH_SECRET });
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    // Preserve the original querystring (notably ?play=<trackId> from the
    // Web Share Target landing) so the round-trip through Spotify OAuth
    // doesn't drop the user's intent on the floor.
    const original =
      req.nextUrl.pathname + (req.nextUrl.search ? req.nextUrl.search : "");
    url.search = "";
    url.searchParams.set("callbackUrl", original);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/home/:path*"],
};
