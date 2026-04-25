import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, lt, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

// GET /api/notes/list?cursor=<iso>&limit=<int>
// Returns hydrated rows newest-first, including denormalized metadata so the
// Library doesn't need to round-trip Spotify on every load.
//   { notes: [...], next_cursor: <iso> | null }
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cursor = req.nextUrl.searchParams.get("cursor");
  const limitRaw = parseInt(
    req.nextUrl.searchParams.get("limit") ?? "",
    10
  );
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(200, limitRaw))
    : PAGE_SIZE;

  const filters = [
    eq(schema.notes.userId, userId),
    ne(schema.notes.note, ""),
  ];
  if (cursor) {
    const c = new Date(cursor);
    if (!isNaN(c.getTime())) {
      filters.push(lt(schema.notes.updatedAt, c));
    }
  }

  // Fetch limit + 1 so we can compute next_cursor without a follow-up query.
  const rows = await db
    .select({
      trackId: schema.notes.trackId,
      note: schema.notes.note,
      updatedAt: schema.notes.updatedAt,
      name: schema.notes.trackName,
      artists: schema.notes.artists,
      artistUrls: schema.notes.artistUrls,
      imageUrl: schema.notes.imageUrl,
      trackUrl: schema.notes.trackUrl,
      albumUrl: schema.notes.albumUrl,
    })
    .from(schema.notes)
    .where(and(...filters))
    .orderBy(desc(schema.notes.updatedAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore
    ? slice[slice.length - 1].updatedAt.toISOString()
    : null;

  return NextResponse.json({
    notes: slice.map((r) => ({
      track_id: r.trackId,
      note: r.note,
      updated_at: r.updatedAt,
      name: r.name,
      artists: r.artists,
      artist_urls: r.artistUrls,
      image_url: r.imageUrl,
      track_url: r.trackUrl,
      album_url: r.albumUrl,
    })),
    next_cursor: nextCursor,
  });
}
