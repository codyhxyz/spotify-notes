# Changelog

All notable user-facing changes. Format loosely follows [Keep a Changelog](https://keepachangelog.com/), versioning is informal — this is a deployed web app, not a published library, so the "version" is whatever's on `master`.

## Unreleased

- **Staying signed in actually works.** The app used to drop you back at the Spotify login roughly an hour after signing in. The OAuth tokens lived in the session cookie, and the only code that refreshed them ran when Auth.js handled a request — not when the app's own `/api/spotify/*` routes read the token. Once Spotify's hour-long access token lapsed, every call came back 401 and the app read that as "logged out." Tokens now live in Postgres and refresh at the moment they're used, so a session lasts until you revoke it. A Spotify outage no longer bounces you through a sign-in either — that comes back as a retryable error instead.

- **Official Spotify logo on the sign-in button.** Replaced the musical-note glyph next to "Continue with Spotify" with the official Spotify brand mark (monochrome white). White-on-color is an allowed Spotify trademark treatment; the icon's wave cutouts let our gradient show through so the mark still reads as part of the color bath.

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
