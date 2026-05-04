# Contributing

Thanks for considering a contribution. This is a personal project, but I'll happily review PRs.

## Before you spend time

For anything beyond a typo or one-line bugfix, **open an issue first** describing what you want to do. Saves both of us a wasted afternoon if the thing is already in flight or out of scope.

The [`ROADMAP.md`](./ROADMAP.md) lists what I'm planning. The "Won't ship" section there is genuinely settled, not "convince me" — please don't open PRs against those.

## Local setup

See [`README.md`](./README.md). Short version:

```bash
npm install
cp .env.example .env.local   # fill in Spotify + Postgres + NextAuth values
psql "$DATABASE_URL" -f migrations/001_initial.sql
psql "$DATABASE_URL" -f migrations/002_track_metadata.sql
npm run dev
```

You'll need:

- A Spotify developer app with `http://localhost:3000/api/auth/callback/spotify` registered as a redirect URI.
- A Postgres database. [Neon](https://neon.tech) free tier is what production uses.
- Spotify **Premium** to actually exercise the playback controls. Notes save fine on free accounts, but you can't test the play/pause/seek flow without Premium.

## Style

- **TypeScript strict** — no `any` without a comment explaining why.
- **D.R.Y., but not premature.** If something is duplicated twice it's probably fine. If it's duplicated three times it's a function.
- **Comments explain *why*, not *what*.** The code shows what. Comments should answer "wait, why is it like this?"
- **Format with Prettier defaults.** No config, no bikeshedding.

## What I'm likely to merge fast

- Bug fixes with a clear repro.
- Performance wins on the Library view (it's the biggest hot spot).
- Accessibility improvements. There are real gaps in keyboard nav and ARIA labels and I'd love help.
- Mobile polish.

## What I'll probably push back on

- New top-level features without a roadmap entry or an issue first.
- Anything that adds a heavy client-side dependency (>~30kb gzipped). The bundle is small on purpose.
- Changes to the Auth.js / OAuth flow without a clear bug. That code path is load-bearing and the failure modes are non-obvious (see `lib/auth.ts` comments on the iOS universal-link dodge).
- Replacing the `contentEditable` editor with a third-party rich-text framework. See `ARCHITECTURE.md` → Note editor.

## Reporting a security issue

Don't open a public issue. Email me directly: see https://codyh.xyz for contact.
