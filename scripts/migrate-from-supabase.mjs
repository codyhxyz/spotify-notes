#!/usr/bin/env node
// One-shot data migration: copy users + notes from the old Supabase Postgres
// into Neon, rewriting user_id from the Supabase auth UUID to the user's
// canonical Spotify id (so post-migration NextAuth sessions line up with
// pre-migration rows).
//
// Usage:
//   SUPABASE_DATABASE_URL=postgres://... \
//   DATABASE_URL=postgres://...@ep-xxx-pooler... \
//   node scripts/migrate-from-supabase.mjs [--dry-run]
//
// SUPABASE_DATABASE_URL is the "Connection string" from
//   Supabase → Project Settings → Database (use the "direct" connection,
//   not the pooler — we need access to the `auth` schema).
// DATABASE_URL is the pooled Neon URL (same one the app uses).
//
// Safe to re-run: inserts use ON CONFLICT DO NOTHING (users) /
// ON CONFLICT DO UPDATE (notes, preferring the Supabase copy).

import postgres from "postgres";

const src = process.env.SUPABASE_DATABASE_URL;
const dst = process.env.DATABASE_URL;
const dryRun = process.argv.includes("--dry-run");

if (!src || !dst) {
  console.error(
    "Set SUPABASE_DATABASE_URL (source) and DATABASE_URL (Neon target)."
  );
  process.exit(1);
}

const source = postgres(src, { prepare: false });
const target = postgres(dst, { prepare: false, max: 1 });

try {
  // 1. Build the supabase_uuid → spotify_id map from auth.identities.
  const identities = await source`
    SELECT user_id AS supabase_uuid, provider_id AS spotify_id
    FROM   auth.identities
    WHERE  provider = 'spotify'
  `;
  const map = new Map(
    identities.map((r) => [r.supabase_uuid, r.spotify_id])
  );
  console.log(`mapped ${map.size} supabase users → spotify ids`);

  // 2. Pull the legacy users + notes rows.
  const users = await source`
    SELECT user_id, accepted_eula FROM public.users
  `;
  const notes = await source`
    SELECT user_id, track_id, note FROM public.notes
  `;
  console.log(`source rows: ${users.length} users, ${notes.length} notes`);

  // 3. Rewrite keys through the identity map. Drop any rows whose user has
  //    no Spotify identity (shouldn't happen if auth worked, but be defensive).
  const usersOut = [];
  for (const u of users) {
    const sid = map.get(u.user_id);
    if (!sid) {
      console.warn(`skip user ${u.user_id} — no Spotify identity`);
      continue;
    }
    usersOut.push({ user_id: sid, accepted_eula: u.accepted_eula });
  }
  const notesOut = [];
  for (const n of notes) {
    const sid = map.get(n.user_id);
    if (!sid) {
      console.warn(`skip note for user ${n.user_id} — no Spotify identity`);
      continue;
    }
    notesOut.push({ user_id: sid, track_id: n.track_id, note: n.note });
  }
  console.log(
    `rewritten: ${usersOut.length} users, ${notesOut.length} notes ready to import`
  );

  if (dryRun) {
    console.log("--dry-run set, nothing written.");
    process.exit(0);
  }

  // 4. Upsert into Neon. Users first (notes FKs them). ON CONFLICT DO NOTHING
  //    preserves any EULA state the signIn event may have already written.
  await target.begin(async (tx) => {
    if (usersOut.length) {
      await tx`
        INSERT INTO users ${tx(usersOut, "user_id", "accepted_eula")}
        ON CONFLICT (user_id) DO UPDATE
          SET accepted_eula = users.accepted_eula OR EXCLUDED.accepted_eula
      `;
    }
    if (notesOut.length) {
      await tx`
        INSERT INTO notes ${tx(notesOut, "user_id", "track_id", "note")}
        ON CONFLICT (user_id, track_id) DO UPDATE
          SET note = EXCLUDED.note, updated_at = NOW()
      `;
    }
  });

  console.log("done.");
} catch (err) {
  console.error("migration failed:", err);
  process.exitCode = 1;
} finally {
  await source.end({ timeout: 5 });
  await target.end({ timeout: 5 });
}
