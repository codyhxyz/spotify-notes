# Changelog

All notable user-facing changes. Format loosely follows [Keep a Changelog](https://keepachangelog.com/), versioning is informal — this is a deployed web app, not a published library, so the "version" is whatever's on `master`.

## Unreleased

- Public launch materials: dynamic OG image, Twitter card, MARKETING / ARCHITECTURE / ROADMAP / CONTRIBUTING docs.

## 2025-Q4 — Next 16 / Auth.js v5 / Library

- **Library view at `/home/library`** — searchable gallery of every note you've ever written. Album-art cards, full-text search across notes / songs / artists, sort by recent / oldest / longest / artist A–Z. Side drawer with play-in-Spotify and delete.
- **Settings modal** — JSON export of all your notes, wipe-everything, log out, all in one place.
- **Migrated to Next 16 + React 19 + Auth.js v5.** New JWT session shape, server-side Spotify proxy so the access token never reaches the browser. Track metadata denormalized onto the notes table to remove the per-card Spotify fetch in the Library.
- **Mobile sign-in fix.** Spotify's iOS app intercepts `/authorize` as a universal link and returns `invalid_scope`. Pinned the locale-prefixed `/en/authorize` URL to dodge the intercept. Mobile login works again.
- **README rewrite from scratch.** Less marketing, more "here's how to actually run this."

## 2025 — Synesthetic redesign

- Redesigned around a "color-bath" aesthetic: ambient backdrop tracks the current album art, theme picker via a clickable brand orb (rose / midnight / etc.), persisted to localStorage.
- About modal: short essay on why this exists.
- Footer with source-code link and `built by codyh` byline.
- Various typography fixes: song-title `<em>` invisibility against the album backdrop, footer hidden until first song loads, rose-theme gradient self-reference bug.

## 2024 — Foundation

- **Migrated off Supabase to Neon + NextAuth.** Lower latency, simpler auth surface, fewer moving parts.
- **Clickable timestamps.** Type `1:23` and the editor renders a chip below the note that seeks Spotify to that position.
- **Autosave with debounce** (`use-debounce`).
- **TypeScript port.**
- **Spotify Developer compliance** — privacy policy, EULA, scope minimization, required UI affordances.
- **Initial release** — sign in with Spotify, mirror now-playing, write notes pinned to each track.
