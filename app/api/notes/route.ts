import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/notes?track_id=... -> { note: string | null }
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const trackId = req.nextUrl.searchParams.get("track_id");
  if (!trackId) {
    return NextResponse.json({ error: "track_id required" }, { status: 400 });
  }

  const rows = await db
    .select({ note: schema.notes.note })
    .from(schema.notes)
    .where(
      and(eq(schema.notes.userId, userId), eq(schema.notes.trackId, trackId))
    )
    .limit(1);

  return NextResponse.json({ note: rows[0]?.note ?? null });
}

// PUT /api/notes  body: { track_id, note }  -> upsert
export async function PUT(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const trackId: string | undefined = body?.track_id;
  const note: string = typeof body?.note === "string" ? body.note : "";
  if (!trackId) {
    return NextResponse.json({ error: "track_id required" }, { status: 400 });
  }

  await db
    .insert(schema.notes)
    .values({ userId, trackId, note })
    .onConflictDoUpdate({
      target: [schema.notes.userId, schema.notes.trackId],
      set: { note, updatedAt: new Date() },
    });

  return NextResponse.json({ ok: true });
}

// DELETE /api/notes -> wipe all notes for the signed-in user
export async function DELETE() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await db.delete(schema.notes).where(eq(schema.notes.userId, userId));

  return NextResponse.json({ ok: true });
}
