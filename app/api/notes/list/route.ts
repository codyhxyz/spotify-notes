import { NextResponse } from "next/server";
import { and, desc, eq, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/notes/list -> [{ track_id, note, updated_at }] for signed-in user,
// newest first, empty notes excluded.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({
      trackId: schema.notes.trackId,
      note: schema.notes.note,
      updatedAt: schema.notes.updatedAt,
    })
    .from(schema.notes)
    .where(and(eq(schema.notes.userId, userId), ne(schema.notes.note, "")))
    .orderBy(desc(schema.notes.updatedAt));

  return NextResponse.json({
    notes: rows.map((r) => ({
      track_id: r.trackId,
      note: r.note,
      updated_at: r.updatedAt,
    })),
  });
}
