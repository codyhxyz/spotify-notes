# Architecture

A short tour of how My Song Notes is wired. Read this if you want to hack on it or fork it.

## Overview

Single Next.js 16 App Router app deployed to Vercel, backed by Neon Postgres via Drizzle. Auth is Auth.js v5 with the Spotify provider; no separate user database, the Spotify user id *is* the user id. The browser never holds a Spotify access token — every Spotify call goes through a server-side proxy that reads the token off the JWT cookie.

```
┌────────────┐   1. OAuth     ┌─────────────────┐
│  Browser   │ ────────────▶  │ Auth.js / NextAuth│
│  /home     │ ◀──────────── │ (JWT cookie)      │
│  /home/lib │                └─────────────────┘
│            │
│            │   2. /api/spotify/*       ┌──────────────┐
│            │ ───────────────────────▶  │ Server proxy │ ──▶ Spotify Web API
│            │ ◀────────────────────────  │ (token from   │
│            │                            │  JWT cookie)  │
│            │   3. /api/notes/*          └──────────────┘
│            │ ───────────────────────▶  Drizzle ──▶ Neon Postgres
└────────────┘
```

## Auth flow

`lib/auth.ts` configures Auth.js v5 with the Spotify provider.

- **Scopes**: `user-read-email`, `user-read-playback-state`, `user-modify-playback-state`. Derived from the actual API endpoints we hit; nothing is requested speculatively. (`user-read-private` is intentionally omitted — Spotify's docs list it as required for `GET /v1/me`, but the fields we read (`id`, `display_name`, `images`) are returned under `user-read-email` alone, and requesting an undeclared dashboard scope triggers `invalid_scope` on the OAuth callback.)
- **Session strategy**: JWT (no DB session table). The token carries the Spotify access token, refresh token, and expiry.
- **Refresh-token rotation**: the `jwt` callback checks expiry on every read; if within 60s of expiry, it calls Spotify's `/api/token` endpoint with the refresh token and rewrites the JWT in place. If refresh fails, the session is tagged with `error: "RefreshAccessTokenError"` so the client can punt the user back to sign-in.
- **Authorization endpoint**: use Spotify's canonical `accounts.spotify.com/authorize`. The app previously pinned `accounts.spotify.com/en/authorize` to dodge an iOS universal-link bug, but Spotify's current AASA no longer claims `/authorize`, and 2026-06-17 production logs showed the locale route returning `invalid_scope` for the valid playback scope set on desktop Chrome.
- **Production Spotify app status**: the live Spotify app is in production mode. Do not diagnose `songnotes.codyh.xyz` OAuth failures as Spotify development-mode allowlist/test-user/quota-extension problems.
- **OAuth diagnostics**: broad Auth.js debug logging stays off in production because it can include provider secrets/tokens. Instead, `app/api/auth/[...nextauth]/route.ts` logs sanitized callback failures as `[spotify-oauth-callback-error]` (Spotify returned `error`/`error_description`) or `[spotify-oauth-callback-missing-pkce-cookie]` (code present but PKCE verifier cookie absent). `lib/auth.ts` also preserves sanitized Spotify `OAuthCallbackError` metadata as `[auth][spotify-oauth-provider-error]`.
- **First sign-in**: an `events.signIn` hook upserts a row into the `users` table keyed by the Spotify user id (`ON CONFLICT DO NOTHING` so we don't clobber an existing `accepted_eula` value).
- **Bearer tokens for API clients**: the Fastpotify Notes desktop app has no browser session, only a Spotify Web API access token, so `/api/notes` and `/api/notes/list` also accept `Authorization: Bearer <spotify access token>`. `lib/request-auth.ts` resolves it by calling Spotify's `GET /v1/me` and taking `id` as the user id, memoizing successful verifications for 10 minutes in a bounded module-level map keyed by `sha256(token)` (per-instance and short-lived on Vercel, which is fine — a cold instance just pays one extra `/v1/me` call). A bearer header is never allowed to fall back to the cookie session, so a junk bearer can't be used to skip the same-origin check; that check runs only when the caller authenticated by cookie, since a bearer request carries no ambient credentials for CSRF to abuse. The security consequence is explicit: anyone holding the user's Spotify access token can read and write that user's notes — the same trust the app already places in that token.

## Spotify proxy

`app/api/spotify/*` exposes a small set of routes — `playback`, `play`, `pause`, `next`, `previous`, `track` — that the browser hits. Each route reads the JWT, pulls the access token, and calls Spotify's Web API server-side. Two reasons:

1. The Spotify access token never reaches the browser. No token leaks into devtools or browser extensions.
2. Token refresh happens transparently inside the JWT callback, so no client code has to know about expiry. If a request comes in with an unrefreshable token the server returns 401 and `util/apiutils.ts` raises `AuthExpiredError`, which the client catches and uses to bounce to sign-in.

## Now-playing loop

`app/home/page.tsx` polls the proxy on a visibility- and state-aware schedule:

| Tab visible? | Playing? | Interval |
|---|---|---|
| visible    | yes     | 4 s   |
| visible    | no      | 12 s  |
| hidden     | any     | 60 s  |

On `visibilitychange → visible` the schedule fires immediately rather than waiting out the current interval. Between polls, `progressMs` advances locally on a 250ms ticker so the progress bar doesn't jitter.

When the polled `trackId` changes, the page loads (or creates) the matching note row and rehydrates the editor.

## Notes data model

```
users
  user_id        text PK              -- Spotify user id
  accepted_eula  bool default false
  created_at     timestamptz now()

notes
  user_id        text FK → users.user_id (cascade)
  track_id       text                 -- Spotify track id
  note           text default ''      -- sanitized HTML (DOMPurify)
  track_name     text
  artists        text[]
  artist_urls    text[]
  image_url      text
  track_url      text
  album_url      text
  updated_at     timestamptz now()
  PRIMARY KEY (user_id, track_id)
  INDEX        (user_id, updated_at)  -- for the Library view
```

Track metadata (`track_name`, `artists`, `image_url`, etc.) is **denormalized** onto every note row. Originally the Library view re-fetched metadata from Spotify per card, which (a) burned API quota, (b) introduced N+1 latency, and (c) showed nothing for tracks the user no longer had region access to. Storing the metadata at write time means the Library renders entirely from Postgres, no Spotify call.

The schema lives in plain SQL files under `migrations/` rather than in `drizzle-kit migrate` config — there's only ever a small number of forward-only migrations and they're easier to audit as SQL than as JSON snapshots.

## Note editor

`app/home/page.tsx` uses a `contentEditable` div, not a third-party rich-text framework. Three reasons:

1. The existing toolset (DOMPurify for sanitize, `use-debounce` for autosave) is enough. A real RTE library would be a 100kb+ dependency for affordances we don't need (markdown, mentions, slash menus).
2. The editor's content is single-paragraph stream-of-consciousness with the occasional bold/italic. `contentEditable` handles that natively.
3. Owning the DOM directly makes the timestamp-chip pattern trivial.

State management uses **two seeds, one ref**:

- `noteSeed` (state) is read during render to set `dangerouslySetInnerHTML` on track-load. Re-keyed by `trackId` so React fully remounts the editor across track switches.
- `currNoteRef` (ref) is updated on every `onInput` and read by the save callback. Reading a ref during render is a React 19 violation; reading it inside an event handler is fine.
- A `userIsTyping` ref short-circuits track-switch logic so the polling loop can't yank the editor out from under the user mid-keystroke.

## Save flow

`PUT /api/notes` carries the full note payload plus `expected_updated_at`. The server compares against the row's current `updated_at`:

- **Match** → write, return new `updated_at`.
- **Mismatch** → 409, return `current_updated_at`. The client refreshes its local cursor and shows a "this note was edited in another tab" alert. No silent clobber, no last-write-wins.

This is optimistic concurrency, not locking. It's the cheapest correctness guarantee that prevents the most common multi-tab footgun.

## Timestamp chips

`util/miscutils.ts` defines:

```ts
export const timestampRegexGlobal = /\b(\d{1,2}):([0-5][0-9])\b/g;
```

The `\b` and `[0-5]` constraints are deliberate: `:23` inside a word doesn't match, and `1:99` doesn't match. On every keystroke (debounced 250ms) the editor scans the note text for matches and renders a row of `<TimeStamp>` chips below the player; clicking one calls `playTrack(trackId, positionMs)` against the proxy.

The chips render *outside* the contentEditable so the user can't accidentally type inside a chip. The match list is the single source of truth for what's clickable; the inline text is just text.

## Library view

`app/home/library/page.tsx`. Loads `/api/notes/list` (paginated by `(updated_at, track_id)` cursor), renders a grid of album-art cards. Search is client-side — full-text over `name + artists + stripHTML(note)` — because the typical user has tens to low-hundreds of notes, well under any reasonable page size. If that ever stops being true the search should move to Postgres `tsvector`; the grep across the in-memory list is the right tradeoff for now.

The card hover/focus sets a CSS variable `--album-image` on `body` so the page backdrop morphs to whatever card is currently active. Same backdrop trick as the now-playing view; consolidates a single mechanism into both routes.

## What lives where

```
app/
  page.tsx                 landing / sign-in
  home/page.tsx            now-playing + editor (the main view)
  home/library/page.tsx    searchable gallery
  components/              shared modals (Settings, EULA)
  api/
    auth/[...nextauth]/    Auth.js v5 catchall
    notes/route.ts         single-note GET/PUT/DELETE (with optimistic concurrency)
    notes/list/route.ts    paginated list for the Library
    spotify/*/route.ts     server-side Spotify proxy (one route per endpoint)
    users/route.ts         EULA accept/read
  opengraph-image.tsx      dynamic OG image (1200x630, edge runtime)
  twitter-image.tsx        re-exports OG image for Twitter cards
lib/
  auth.ts                  Auth.js config; stores the Spotify grant at sign-in
  request-auth.ts          cookie session OR Spotify bearer token -> user id
  db.ts, db/schema.ts      Drizzle client + schema
  spotify.ts               server-side Spotify Web API client + token refresh
util/
  apiutils.ts              client-side fetch wrappers (raise AuthExpiredError on 401)
  miscutils.ts             timestamp regex + parser
  components.tsx           shared SVG icons + the TimeStamp chip
  theme.ts                 theme switcher (rose / midnight / etc.)
migrations/
  001_initial.sql          users + notes tables
  002_track_metadata.sql   denormalized metadata columns on notes
  003_spotify_accounts.sql Spotify OAuth tokens, moved out of the session cookie
proxy.ts                  gates /home/* on a NextAuth session (Next 16 renamed `middleware` → `proxy`)
```

## Things that look weird and aren't

- **`app/page.tsx` is a `"use client"`.** It needs `useSession()` to redirect signed-in users to `/home`. Could be a server component with a session read, but the client redirect is one less round-trip and `useSession` is already in the bundle for the rest of the app.
- **No CSRF middleware.** Auth.js v5 handles CSRF for the auth endpoints. The `notes` and `spotify` routes are gated by `auth()`; an attacker without a valid session JWT can't reach them. There's no public mutation surface.
- **`getToken({ secureCookie })` in `proxy.ts` and `lib/spotify.ts`.** Auth.js' route handler prefixes the session cookie with `__Secure-` on HTTPS and omits the prefix on HTTP. `getToken` does **not** auto-detect this — without `secureCookie` it only ever reads the unprefixed `authjs.session-token`, never finds the `__Secure-` cookie set in production, and returns `null`. Both call sites derive it from `req.nextUrl.protocol === "https:"` so they match whatever the handler set. (`lib/session.ts`'s `auth()` auto-detects the cookie name itself, so it doesn't need this.)
- **The `users.user_id` is a `text` column, not a UUID.** It stores Spotify's user id directly so the join from the JWT (which carries the Spotify id) is zero-translation. UUIDs would mean a lookup hop.

## Things that are weird and are

- **`alert()` for save-conflict UI.** Should be a non-blocking toast, but the conflict path is rare enough that I haven't reached for the toast library yet. See `ROADMAP.md`.
- **Library search is client-side.** Fine until it isn't. See above.
