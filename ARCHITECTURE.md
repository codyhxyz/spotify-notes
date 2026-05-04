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

- **Scopes**: `user-read-email`, `user-read-private`, `user-read-playback-state`, `user-modify-playback-state`. Derived from the actual API endpoints we hit; nothing is requested speculatively.
- **Session strategy**: JWT (no DB session table). The token carries the Spotify access token, refresh token, and expiry.
- **Refresh-token rotation**: the `jwt` callback checks expiry on every read; if within 60s of expiry, it calls Spotify's `/api/token` endpoint with the refresh token and rewrites the JWT in place. If refresh fails, the session is tagged with `error: "RefreshAccessTokenError"` so the client can punt the user back to sign-in.
- **iOS universal-link dodge**: Spotify's iOS app registers itself as a universal link handler for `accounts.spotify.com/authorize`, and when it intercepts the OAuth flow on mobile Safari it returns `invalid_scope` for our scope set. Pinning the locale-prefixed URL `accounts.spotify.com/en/authorize` bypasses the intercept. Same endpoint server-side; this is a string-level workaround for an Apple-platform routing quirk.
- **First sign-in**: an `events.signIn` hook upserts a row into the `users` table keyed by the Spotify user id (`ON CONFLICT DO NOTHING` so we don't clobber an existing `accepted_eula` value).

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
  auth.ts                  Auth.js config + Spotify token refresh
  db.ts, db/schema.ts      Drizzle client + schema
  spotify.ts               server-side Spotify Web API helpers
util/
  apiutils.ts              client-side fetch wrappers (raise AuthExpiredError on 401)
  miscutils.ts             timestamp regex + parser
  components.tsx           shared SVG icons + the TimeStamp chip
  theme.ts                 theme switcher (rose / midnight / etc.)
migrations/
  001_initial.sql          users + notes tables
  002_track_metadata.sql   denormalized metadata columns on notes
middleware.ts              gates /home/* on a NextAuth session
```

## Things that look weird and aren't

- **`app/page.tsx` is a `"use client"`.** It needs `useSession()` to redirect signed-in users to `/home`. Could be a server component with a session read, but the client redirect is one less round-trip and `useSession` is already in the bundle for the rest of the app.
- **No CSRF middleware.** Auth.js v5 handles CSRF for the auth endpoints. The `notes` and `spotify` routes are gated by `auth()`; an attacker without a valid session JWT can't reach them. There's no public mutation surface.
- **The `users.user_id` is a `text` column, not a UUID.** It stores Spotify's user id directly so the join from the JWT (which carries the Spotify id) is zero-translation. UUIDs would mean a lookup hop.

## Things that are weird and are

- **`alert()` for save-conflict UI.** Should be a non-blocking toast, but the conflict path is rare enough that I haven't reached for the toast library yet. See `ROADMAP.md`.
- **Library search is client-side.** Fine until it isn't. See above.
