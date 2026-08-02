# Project knowledge for coding agents

## Spotify OAuth facts

- The production Spotify app is already in **production mode**. Do **not** suggest Spotify Developer Dashboard development-mode allowlisting, test-user allowlists, or quota-extension status as a cause of live `songnotes.codyh.xyz` OAuth failures.
- When investigating live auth failures, start with Vercel logs for `/api/auth/*`, especially `/api/auth/callback/spotify` (`vercel logs --environment production --since 2h --query '/api/auth/callback/spotify' --expand`).
- Spotify iOS can still be relevant historically, but the app currently uses the canonical `https://accounts.spotify.com/authorize`. Do not re-add the old `/en/authorize` workaround without rechecking Spotify's AASA file; on 2026-06-17 prod logs showed `/en/authorize` returning `invalid_scope` for the valid playback scope set on desktop Chrome.
- Auth.js production debug stays off because broad debug logging can leak provider secrets/tokens. Use the sanitized OAuth diagnostics in `app/api/auth/[...nextauth]/route.ts` and the filtered Auth.js debug logger in `lib/auth.ts` instead.

## Spotify token storage

- The session cookie carries **identity only** (`spotifyUserId`). Access/refresh tokens live in the `spotify_accounts` table. Do not put them back in the JWT: `getToken()` only *decrypts* the cookie, so a token stored there is never refreshed by the `/api/spotify/*` routes that read it, and it goes stale one hour after sign-in.
- `lib/spotify.ts` is the only module that reads a Spotify token, and `getSpotifyClient(req)` is the only entry point. It refreshes proactively (60s skew) and retries once on a Spotify 401. New Spotify-backed routes should go through it rather than reaching for the token directly.
- Refresh failures are split deliberately: `invalid_grant` means the user revoked us and gets a `401 auth_expired` (the client re-runs OAuth); anything else (5xx, network, timeout) gets a `503 spotify_unavailable` so a transient blip doesn't bounce the user through a sign-in they didn't need.

## Production log markers

- `[spotify-oauth-callback-error]` — Spotify returned `error`/`error_description` to our callback before issuing an auth code.
- `[spotify-oauth-callback-missing-pkce-cookie]` — Spotify returned a code, but Auth.js' encrypted PKCE verifier cookie was absent; investigate SameSite/domain/browser/cookie handling.
- `[auth][spotify-oauth-provider-error]` — sanitized Auth.js provider-error metadata for Spotify OAuth callbacks.
