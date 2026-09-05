import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { authenticate } from "@/lib/request-auth";
import { assertSameOrigin } from "@/lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/notes?track_id=...
// -> { note, updated_at, name, artists, artist_urls, image_url, track_url, album_url } | { note: null }
export async function GET(req: NextRequest) {
  // Cookie session (web app) or Spotify bearer token (desktop app).
  const caller = await authenticate(req);
  if (!caller) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = caller.userId;
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
  const caller = await authenticate(req);
  if (!caller) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // CSRF only applies to the ambient-credential path. A bearer request carries
  // no cookies, so a hostile page can't make the browser send one on the
  // user's behalf, and there is nothing for an Origin check to protect.
  if (caller.via === "cookie") {
    const originErr = assertSameOrigin(req);
    if (originErr) return originErr;
  }
  const userId = caller.userId;

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

// PATCH /api/notes  body: { notes: [ { track_id, name?, artists?, artist_urls?,
//                                       image_url?, track_url?, album_url? }, ... ] }
// Backfill-only metadata write. 171 of the notes migrated in on 2026-04-24 predate
// the denormalized metadata columns, so they render as "Unknown track" with no
// cover. The desktop client can look those tracks up on Spotify in bulk and hand
// the results back here. Deliberately NOT a PUT: this never touches `note` or
// `updated_at`, so a backfill can't reorder the Library or clobber note text.
// Rows that don't exist are skipped, never created.
// -> { ok: true, updated: <count of rows that existed> }
export async function PATCH(req: NextRequest) {
  const caller = await authenticate(req);
  if (!caller) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Same rule as PUT: the Origin check only guards the ambient-credential
  // (cookie) path. A bearer request carries no cookies for CSRF to abuse.
  if (caller.via === "cookie") {
    const originErr = assertSameOrigin(req);
    if (originErr) return originErr;
  }
  const userId = caller.userId;

  const body = (await req.json().catch(() => ({}))) as {
    notes?: unknown;
  };

  if (!Array.isArray(body.notes)) {
    return NextResponse.json({ error: "notes array required" }, { status: 400 });
  }
  if (body.notes.length > MAX_PATCH_NOTES) {
    return NextResponse.json(
      { error: `at most ${MAX_PATCH_NOTES} notes per request` },
      { status: 400 }
    );
  }

  // Last entry wins if a track id repeats, so the response count can't
  // double-count a single row.
  const byTrackId = new Map<string, Partial<MetaShape>>();
  for (const raw of body.notes) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const trackId = typeof entry.track_id === "string" ? entry.track_id.trim() : "";
    if (!trackId) continue;
    const meta = presentMeta(entry);
    // Nothing usable to write: don't burn a statement on it.
    if (Object.keys(meta).length === 0) continue;
    byTrackId.set(trackId, meta);
  }

  if (byTrackId.size === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  // One statement per row inside a single transaction. At 200 rows max this is
  // cheap enough that a hand-rolled bulk UPDATE ... FROM (VALUES ...) would buy
  // nothing but a harder-to-read query.
  const updated = await db.transaction(async (tx) => {
    let count = 0;
    for (const [trackId, meta] of byTrackId) {
      const rows = await tx
        .update(schema.notes)
        .set(meta)
        .where(
          and(eq(schema.notes.userId, userId), eq(schema.notes.trackId, trackId))
        )
        .returning({ trackId: schema.notes.trackId });
      count += rows.length;
    }
    return count;
  });

  return NextResponse.json({ ok: true, updated });
}

// DELETE /api/notes -> wipe all notes for the signed-in user.
// Deliberately cookie-only: this is the destructive "wipe everything" button in
// the web app's Settings modal, and no API client needs it.
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

// Cap on a single PATCH body. Two hundred is the same ceiling /api/notes/list
// accepts as a page size, so a client can backfill exactly what it just read.
const MAX_PATCH_NOTES = 200;

// Pull the metadata fields a PATCH entry actually supplied. Absent, null, empty
// strings and empty arrays are all "not supplied" — PATCH only ever fills a
// column in, it never blanks one out.
function presentMeta(entry: Record<string, unknown>): Partial<MetaShape> {
  const out: Partial<MetaShape> = {};
  const str = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : null;
  };
  const list = (v: unknown): string[] | null => {
    if (!Array.isArray(v)) return null;
    const vals = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    return vals.length > 0 ? vals : null;
  };

  const name = str(entry.name);
  if (name) out.trackName = name;
  const artists = list(entry.artists);
  if (artists) out.artists = artists;
  const artistUrls = list(entry.artist_urls);
  if (artistUrls) out.artistUrls = artistUrls;
  const imageUrl = str(entry.image_url);
  if (imageUrl) out.imageUrl = imageUrl;
  const trackUrl = str(entry.track_url);
  if (trackUrl) out.trackUrl = trackUrl;
  const albumUrl = str(entry.album_url);
  if (albumUrl) out.albumUrl = albumUrl;
  return out;
}
