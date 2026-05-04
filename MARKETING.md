# Marketing copy for My Song Notes

<!--
  Drafted as launch materials. Swap `@you` / handles before posting.
  Live URL: https://songnotes.codyh.xyz
  Repo:     https://github.com/codyhxyz/spotify-notes
-->

## Launch tweet (primary)

> I built a rich-text journal that follows whatever you're playing on Spotify.
>
> Type `1:23` and it becomes a button that seeks the song to 1:23. Every note auto-saves and lives in a searchable gallery of album art.
>
> songnotes.codyh.xyz

Attach the demo gif (`screenshots/demo.gif`).

## Alt tweets

- DJing means holding structured opinions about an absurd amount of music. Spotify gives you the catalog but no way to write anything down inside it. So I built My Song Notes — the note pane just follows whatever is already playing. songnotes.codyh.xyz

- Built a thing: a rich-text editor that mirrors Spotify's now-playing. Type a timestamp like `1:23`, it becomes a clickable chip that seeks the track. Every note auto-saves to your library. songnotes.codyh.xyz

- The usual workflow for taking notes about songs is alt-tabbing between Spotify and Notes.app until you lose the thread. New side project that collapses the loop — open the page, your note for the current track is already there. songnotes.codyh.xyz

- If note-taking were a first-party Spotify feature I think a lot more people would be music note-takers. Until then: songnotes.codyh.xyz

## Hacker News (Show HN)

**Title:** Show HN: My Song Notes – a rich-text journal that follows your Spotify playback

**Body:**

I'm a DJ, and DJing turns out to mean having structured opinions about a very large catalog of music. The standard workflow for that is alt-tabbing between Spotify and a notes app until the thought is lost. So I built this.

It's a Next.js app that signs in with Spotify, mirrors your current playback, and pairs a rich-text editor to whatever track you're on, keyed by Spotify `trackId`. Notes auto-save with a debounce. Type a timestamp like `1:23` in the body of a note and it becomes a clickable chip that seeks Spotify to that position. There's a Library view that turns every note you've ever written into a searchable gallery of album-art cards (full-text across notes, songs, and artists; sort pills for recent / oldest / longest / artist A–Z).

Stack notes that might be interesting:

- **Auth.js v5** with the Spotify provider (JWT sessions; refresh-token rotation handled in the `jwt` callback). Spotify's iOS app intercepts `/authorize` as a universal link and returns `invalid_scope` on the OAuth flow, so the app pins the locale-prefixed `/en/authorize` to dodge the intercept on mobile.
- **Server-side Spotify proxy.** The browser never sees the access token; all Spotify API calls go through `/api/spotify/*` routes that read the token from the JWT cookie.
- **Optimistic concurrency on note saves.** PUT carries `expected_updated_at`; the server returns 409 if it doesn't match, so two tabs can't silently clobber each other.
- **Visibility-aware polling** for the now-playing state: 4s while playing, 12s while paused, 60s when the tab is hidden, and an immediate wake on `visibilitychange`.
- **Drizzle ORM over Neon Postgres.** Track metadata is denormalized onto the note row so the Library view doesn't need a Spotify call per card.

Live: https://songnotes.codyh.xyz
Code: https://github.com/codyhxyz/spotify-notes

Premium is required to actually drive playback (Spotify's API gate, not mine). Notes still save fine on free accounts; you just can't click the timestamp chips to seek.

Happy to answer anything about the build.

## Reddit posts

### r/sideproject

**Title:** Built a rich-text notes app that follows whatever you're playing on Spotify

**Body:**

Posting here because the build was the fun part.

It's a Next.js + Postgres web app. You sign in with Spotify and a notes pane mirrors your current playback — title, artists, art, transport controls. Type a timestamp like `1:23` and it becomes a button that seeks the song. Every note auto-saves and ends up in a searchable Library view (album-art gallery, full-text search, sort pills).

The thing I'm most proud of is invisible: the OAuth flow had to dodge a Spotify-iOS-app universal-link intercept by pinning a locale-prefixed authorize URL, the now-playing poll backs off based on tab visibility and play state, and saves use optimistic concurrency so two tabs can't silently clobber each other.

Live: https://songnotes.codyh.xyz
Code: https://github.com/codyhxyz/spotify-notes

Roasts welcome.

### r/DJing (or r/Beatmatch)

**Title:** Built a tool for keeping notes on songs while you listen — anyone want it?

**Body:**

Made this for myself because I got tired of alt-tabbing between Spotify and a notes app to record what I think about the tracks I'm digging.

It signs in with Spotify, mirrors your now-playing, and gives you a rich-text editor pinned to that track. Type `1:23` and it becomes a clickable timestamp that seeks the track. Every note auto-saves, and they all collect in a searchable library you can filter by artist, song, or note text.

Free, no ads. Works on desktop and mobile. Premium is required to drive playback (Spotify's rule), but notes save on free accounts too.

songnotes.codyh.xyz

Curious if other DJs would actually use this — let me know what'd make it more useful.

### r/spotify

**Title:** Built a free third-party app that lets you take notes on the songs you listen to

**Body:**

Spotify gives you the catalog but no way to write anything down inside it. So I built a small web app that mirrors your now-playing and lets you keep a rich-text journal pinned to each track.

Notes auto-save. Timestamps like `1:23` become clickable chips that seek the song. There's a searchable Library view of every note you've written.

Read-only access to your playback state and modify access for the play/pause/skip buttons (so the app's transport controls actually move Spotify). Read access to your email is used as your account ID, nothing else.

Live: https://songnotes.codyh.xyz
Privacy policy: https://github.com/codyhxyz/spotify-notes/blob/master/PRIVACY_POLICY.md

## Product Hunt

**Tagline (60 char max):**
> A private journal for the songs you're listening to.

**Description:**
> My Song Notes pairs a rich-text editor to your Spotify now-playing. Type a timestamp like 1:23 and it becomes a button that seeks the track. Every note auto-saves and collects in a searchable library of album art.

**First-comment template (founder comment):**

> Hey PH 👋 — I'm Cody, I made My Song Notes.
>
> I'm a DJ, and DJing means holding structured opinions about an absurd amount of music. Spotify gives you all the music in the world but no way to write anything down inside it, so the workflow is alt-tabbing between Spotify and Notes.app until you lose the thread.
>
> My Song Notes collapses that. The note pane follows whatever's already playing — opening the app *is* the gesture for "I want to write about this."
>
> Free, open source ([github](https://github.com/codyhxyz/spotify-notes)), Spotify Premium needed only for the playback controls (notes save on free accounts).
>
> Beyond DJs I've heard from piano students learning songs, playlist curators, and people who just want to capture why a song hits the way it does. Music makes people think. This is a home for those thoughts.
>
> Happy to answer anything in the comments.

## Social preview / OG image

The OG image is generated by `app/opengraph-image.tsx` (Next.js convention, served at `/opengraph-image`). Twitter re-exports it via `app/twitter-image.tsx` so the two never drift.

For the GitHub repo's social preview slot (the image that appears when the repo URL is unfurled): visit https://github.com/codyhxyz/spotify-notes/settings → Social preview → Edit, and upload `og.png`. To grab a PNG of the live OG image:

```bash
curl -o og.png https://songnotes.codyh.xyz/opengraph-image
```

GitHub has no API for this slot — manual one-time upload.

## Posting order (suggested)

1. Tweet first thing in the morning (Tuesday–Thursday best). Pin it.
2. ~30min later, post Show HN. Don't tweet about the HN post — let it organic-stand.
3. Same day evening: r/sideproject.
4. Day 2: r/DJing.
5. Day 3 or 4: Product Hunt (PH days reset at midnight PT — schedule for 12:01 AM PT to maximize daily ranking window).
6. Reply to every comment within an hour for the first 6 hours of each post. The algorithm cares; the audience cares more.
