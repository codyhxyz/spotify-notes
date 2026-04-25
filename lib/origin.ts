// Lightweight CSRF guard: reject cross-origin write requests by comparing
// the Origin (or Referer) header against our own host. SameSite=Lax cookies
// already block most cross-origin POSTs, but a top-level form submission
// from another origin can still slip past Lax. This closes that gap without
// the overhead of a per-request CSRF token round-trip.

import { NextRequest, NextResponse } from "next/server";

function expectedHost(req: NextRequest): string {
  const envUrl = process.env.NEXTAUTH_URL;
  if (envUrl) {
    try {
      return new URL(envUrl).host;
    } catch {
      // fall through
    }
  }
  // Fallback: trust the request's own host. In production behind a proxy
  // Next will populate this from x-forwarded-host.
  return req.headers.get("host") ?? "";
}

export function assertSameOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const host = expectedHost(req);
  if (!host) return null; // can't validate; let the request through

  const candidate = origin ?? referer;
  if (!candidate) {
    return NextResponse.json(
      { error: "missing_origin" },
      { status: 403 }
    );
  }
  try {
    const u = new URL(candidate);
    if (u.host !== host) {
      return NextResponse.json(
        { error: "origin_mismatch" },
        { status: 403 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "invalid_origin" },
      { status: 403 }
    );
  }
  return null;
}
