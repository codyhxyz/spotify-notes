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
    url.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/home/:path*"],
};
