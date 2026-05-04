# My Song Notes

A rich-text journal that follows whatever you're playing on Spotify. Live at [mysongnotes.vercel.app](https://mysongnotes.vercel.app). The Library view at `/home/library` turns every note you've ever written into a searchable gallery of album-art cards.

<!-- Demo gif goes here once recorded. See screenshots/SHOTLIST.md for the capture script. -->
<!-- ![demo](./screenshots/demo.gif) -->

> **More:** [`ARCHITECTURE.md`](./ARCHITECTURE.md) — how it's wired · [`ROADMAP.md`](./ROADMAP.md) — what's next · [`CHANGELOG.md`](./CHANGELOG.md) — what shipped · [`CONTRIBUTING.md`](./CONTRIBUTING.md) — how to help

## What it does

- Sign in with Spotify and the app mirrors your current playback — track title, artists, album art, transport controls.
- Write notes in a rich-text pane; changes auto-save to Postgres with a debounce, keyed by Spotify `trackId`.
- Type a timestamp like `1:23` and it becomes a clickable chip that seeks Spotify to that position.
- Browse every note you've written in the Library: full-text search across notes, songs, and artists; sort pills; a side drawer with play-in-Spotify and delete.
- Export your notes as JSON, wipe everything, or log out from a shared settings modal.

## Why

DJing means holding structured opinions about an absurd amount of music. Spotify gives you the catalog but no way to write anything down inside it, so the usual workflow is to alt-tab between a player and a notes app until the thread is lost. My Song Notes collapses that loop — instead of navigating to a song to annotate it, the note pane follows whatever is already playing. Opening the app is the same gesture as "I want to write about this."

## Tech stack

- Next.js 16 (App Router) on Vercel, React 19
- Auth.js v5 (next-auth) with the Spotify provider (JWT sessions, refresh-token rotation)
- Drizzle ORM over Neon Postgres (`postgres-js` driver)
- Custom CSS for layout/theming
- DOMPurify to sanitize note HTML, `use-debounce` for autosave

The Spotify access token never reaches the browser — every Spotify call goes
through `/api/spotify/*` server routes that read the token from the JWT cookie.
Track metadata (name, artists, art) is denormalized onto the `notes` row at
save time so the Library view renders straight from Postgres without a
round-trip to Spotify on every load.

## Local setup

You will need a Spotify developer app and a Postgres database (Neon is what production uses).

```bash
git clone https://github.com/codyhxyz/spotify-notes.git
cd spotify-notes
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

- `DATABASE_URL` — Postgres connection string (Neon pooled URL works).
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` — from the Spotify developer dashboard. Add `http://localhost:3000/api/auth/callback/spotify` as a redirect URI on the app.
- `AUTH_SECRET` — generate with `openssl rand -base64 32`. The legacy `NEXTAUTH_SECRET` name still works.
- `AUTH_URL` — `http://localhost:3000` for local dev. Auto-detected on Vercel; legacy `NEXTAUTH_URL` still works.

Apply the schema. Migrations are plain SQL files; run them in numbered order:

```bash
psql "$DATABASE_URL" -f migrations/001_initial.sql
psql "$DATABASE_URL" -f migrations/002_track_metadata.sql
```

(Or paste the contents of each into the Neon SQL editor.)

Then:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with Spotify.

## Project layout

```
app/
  page.tsx              # landing / sign-in
  home/page.tsx         # now-playing + note editor
  home/library/page.tsx # searchable gallery of all your notes
  components/           # SettingsModal, EulaModal, shared UI
  api/
    auth/[...nextauth]/ # NextAuth Spotify provider
    notes/route.ts      # GET / PUT / DELETE single notes (PUT supports
                        #   optimistic concurrency via expected_updated_at)
    notes/list/route.ts # cursor-paginated, hydrated with track metadata
    users/route.ts      # EULA-accept row
    spotify/            # server-side proxy: playback, track, play, pause,
                        #   next, previous. The Spotify access token lives
                        #   only in the JWT cookie.
lib/
  auth.ts               # NextAuth options + Spotify token refresh
  db.ts                 # Drizzle client (postgres-js)
  db/schema.ts          # users, notes tables
  spotify.ts            # server-side Spotify Web API helper
  origin.ts             # Origin/Referer-based CSRF guard for write routes
util/
  apiutils.ts           # browser wrappers around /api/spotify/*
  components.tsx        # SVG icons + clickable timestamp chip
  theme.ts              # theme switcher
migrations/
  001_initial.sql       # users + notes schema
  002_track_metadata.sql# denormalized track metadata + list index
proxy.ts                # gates /home/* on a NextAuth session
```

## Deployment

Deployed to Vercel. Pushes to `master` auto-deploy to production.

## License and legal

- [EULA.md](./EULA.md)
- [PRIVACY_POLICY.md](./PRIVACY_POLICY.md)

## Credits

Built by [codyh.xyz](https://codyh.xyz).
