import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/users -> { accepted_eula: boolean | null }
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({ acceptedEula: schema.users.acceptedEula })
    .from(schema.users)
    .where(eq(schema.users.userId, userId))
    .limit(1);

  return NextResponse.json({
    accepted_eula: rows[0]?.acceptedEula ?? null,
  });
}

// POST /api/users  body: { accepted_eula }  -> upsert
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const acceptedEula: boolean = !!body?.accepted_eula;

  await db
    .insert(schema.users)
    .values({ userId, acceptedEula })
    .onConflictDoUpdate({
      target: schema.users.userId,
      set: { acceptedEula },
    });

  return NextResponse.json({ ok: true });
}
