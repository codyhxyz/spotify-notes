// from https://supabase.com/docs/guides/auth/auth-helpers/nextjs
// and https://noahflk.com/blog/supabase-auth-nextjs

import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextRequest, NextResponse } from "next/server";

// intercepts new page loading, redirecting if session expired
export async function middleware(req: NextRequest) {
  // verify auth
  const res = NextResponse.next(); //this is the route the user is attempting to access
  const supabase = createMiddlewareClient({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session && req.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/home", req.url));
  }

  if (session) {
    return res;
  }

  // if session expired, redirects back to login
  const redirectURL = req.nextUrl.clone();
  redirectURL.pathname = "/";
  return NextResponse.redirect(redirectURL);
}
