-- Denormalize Spotify track metadata onto the notes row so the Library page
-- (and any future read path) can render directly from Postgres without a
-- round-trip to Spotify per page load. All columns nullable to support
-- backfill of pre-existing rows; the app fills them on the next save and
-- uses fallback rendering for nulls.

ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS track_name  TEXT,
  ADD COLUMN IF NOT EXISTS artists     TEXT[],
  ADD COLUMN IF NOT EXISTS artist_urls TEXT[],
  ADD COLUMN IF NOT EXISTS image_url   TEXT,
  ADD COLUMN IF NOT EXISTS track_url   TEXT,
  ADD COLUMN IF NOT EXISTS album_url   TEXT;

-- Cursor pagination on the library list endpoint orders by updated_at DESC.
CREATE INDEX IF NOT EXISTS notes_user_id_updated_at_idx
  ON notes (user_id, updated_at DESC);
