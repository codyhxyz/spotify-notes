import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { assertSameOrigin } from "@/lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/notes?track_id=...
// -> { note, updated_at, name, artists, artist_urls, image_url, track_url, album_url } | { note: null }
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
    .select({
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
    .where(
      and(eq(schema.notes.userId, userId), eq(schema.notes.trackId, trackId))
    )
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json({ note: null });
  }
  const r = rows[0];
  return NextResponse.json({
    note: r.note,
    updated_at: r.updatedAt,
    name: r.name,
    artists: r.artists,
    artist_urls: r.artistUrls,
    image_url: r.imageUrl,
    track_url: r.trackUrl,
    album_url: r.albumUrl,
  });
}

// PUT /api/notes  body: { track_id, note, expected_updated_at?, name?, artists?, artist_urls?, image_url?, track_url?, album_url? }
// Returns { ok: true, updated_at } or { error: "stale", current_updated_at } when
// expected_updated_at is provided and doesn't match the row in the DB.
export async function PUT(req: NextRequest) {
  const originErr = assertSameOrigin(req);
  if (originErr) return originErr;

  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    track_id?: string;
    note?: string;
    expected_updated_at?: string;
    name?: string | null;
    artists?: string[] | null;
    artist_urls?: string[] | null;
    image_url?: string | null;
    track_url?: string | null;
    album_url?: string | null;
  };

  const trackId = body.track_id;
  const note = typeof body.note === "string" ? body.note : "";
  if (!trackId) {
    return NextResponse.json({ error: "track_id required" }, { status: 400 });
  }

  const now = new Date();
  const meta = {
    trackName: body.name ?? null,
    artists: body.artists ?? null,
    artistUrls: body.artist_urls ?? null,
    imageUrl: body.image_url ?? null,
    trackUrl: body.track_url ?? null,
    albumUrl: body.album_url ?? null,
  };

  // Optimistic-concurrency path: caller passed the updated_at it last saw.
  // If it doesn't match current DB state, reject the write so the caller
  // can refetch and merge instead of silently clobbering.
  if (body.expected_updated_at) {
    const expected = new Date(body.expected_updated_at);
    const updated = await db
      .update(schema.notes)
      .set({ note, updatedAt: now, ...stripNullMeta(meta) })
      .where(
        and(
          eq(schema.notes.userId, userId),
          eq(schema.notes.trackId, trackId),
          eq(schema.notes.updatedAt, expected)
        )
      )
      .returning({ updatedAt: schema.notes.updatedAt });

    if (updated.length === 0) {
      // Either the row doesn't exist yet or the timestamp didn't match.
      const cur = await db
        .select({ updatedAt: schema.notes.updatedAt })
        .from(schema.notes)
        .where(
          and(
            eq(schema.notes.userId, userId),
            eq(schema.notes.trackId, trackId)
          )
        )
        .limit(1);

      if (cur.length === 0) {
        // Insert fresh — caller's expected_updated_at was a stale optimism;
        // first write wins.
        const inserted = await db
          .insert(schema.notes)
          .values({
            userId,
            trackId,
            note,
            updatedAt: now,
            ...stripNullMeta(meta),
          })
          .returning({ updatedAt: schema.notes.updatedAt });
        return NextResponse.json({ ok: true, updated_at: inserted[0].updatedAt });
      }
      return NextResponse.json(
        { error: "stale", current_updated_at: cur[0].updatedAt },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true, updated_at: updated[0].updatedAt });
  }

  // No expected_updated_at supplied: classic upsert (last-write-wins).
  const upserted = await db
    .insert(schema.notes)
    .values({
      userId,
      trackId,
      note,
      updatedAt: now,
      ...stripNullMeta(meta),
    })
    .onConflictDoUpdate({
      target: [schema.notes.userId, schema.notes.trackId],
      set: {
        note,
        updatedAt: now,
        // Only overwrite metadata fields when the caller actually supplied
        // them; clients without metadata (older builds, partial save paths)
        // shouldn't blow away cached display data.
        ...conditionalMetaSet(meta),
      },
    })
    .returning({ updatedAt: schema.notes.updatedAt });

  return NextResponse.json({ ok: true, updated_at: upserted[0].updatedAt });
}

// DELETE /api/notes -> wipe all notes for the signed-in user
export async function DELETE(req: NextRequest) {
  const originErr = assertSameOrigin(req);
  if (originErr) return originErr;

  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await db.delete(schema.notes).where(eq(schema.notes.userId, userId));

  return NextResponse.json({ ok: true });
}

type MetaShape = {
  trackName: string | null;
  artists: string[] | null;
  artistUrls: string[] | null;
  imageUrl: string | null;
  trackUrl: string | null;
  albumUrl: string | null;
};

// For inserts: drop nulls so DB defaults / NULLs are explicit.
function stripNullMeta(meta: MetaShape) {
  const out: Partial<MetaShape> = {};
  for (const [k, v] of Object.entries(meta) as [keyof MetaShape, unknown][]) {
    if (v !== null && v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

// For UPDATE-on-conflict: only overwrite columns whose new value is non-null,
// otherwise use COALESCE(new, existing) to preserve previously-cached metadata.
function conditionalMetaSet(meta: MetaShape) {
  const out: Record<string, unknown> = {};
  if (meta.trackName !== null) out.trackName = meta.trackName;
  else out.trackName = sql`coalesce(${schema.notes.trackName}, ${schema.notes.trackName})`;
  if (meta.artists !== null) out.artists = meta.artists;
  if (meta.artistUrls !== null) out.artistUrls = meta.artistUrls;
  if (meta.imageUrl !== null) out.imageUrl = meta.imageUrl;
  if (meta.trackUrl !== null) out.trackUrl = meta.trackUrl;
  if (meta.albumUrl !== null) out.albumUrl = meta.albumUrl;
  // Strip the noop trackName entry if it ended up as the coalesce-self.
  if (meta.trackName === null) delete out.trackName;
  return out;
}
