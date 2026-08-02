-- Move the Spotify OAuth tokens out of the Auth.js session cookie and into
-- Postgres.
--
-- Previously the access + refresh tokens rode in the encrypted JWT cookie and
-- were only ever refreshed by the `jwt` callback, which runs when Auth.js
-- itself handles a request (/api/auth/session, auth(), sign-in). The
-- /api/spotify/* routes read the token with getToken(), which only *decrypts*
-- the cookie — so once the hour-long Spotify access token lapsed, every proxy
-- call sent a dead token, got a 401 back, and bounced the user through a full
-- OAuth redirect that looked like "it forgot I was logged in."
--
-- With the tokens in a row, the server can refresh at the point of use, every
-- tab and device shares one token, and the refresh token stops riding on
-- every request.

CREATE TABLE IF NOT EXISTS spotify_accounts (
  user_id       TEXT PRIMARY KEY REFERENCES users (user_id) ON DELETE CASCADE,
  access_token  TEXT        NOT NULL,
  refresh_token TEXT        NOT NULL,
  -- Absolute expiry of access_token. Spotify issues these with a 3600s TTL.
  expires_at    TIMESTAMPTZ NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
