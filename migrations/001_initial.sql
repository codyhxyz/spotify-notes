-- Spotify-notes initial schema, reconstructed from existing app code.
-- Paste this into the Neon SQL Editor and run.

CREATE TABLE IF NOT EXISTS users (
  user_id       TEXT PRIMARY KEY,
  accepted_eula BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notes (
  user_id    TEXT        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  track_id   TEXT        NOT NULL,
  note       TEXT        NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, track_id)
);

-- The bulk delete in deleteUserData() filters by user_id; covered by PK prefix.
-- Single-note lookup filters by (user_id, track_id); covered by PK.
