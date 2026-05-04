# Roadmap

Things I'd like to ship, roughly ordered by how much I want them. Nothing here is committed; this is a public scratchpad. Open an issue if you'd actually use one of these.

## Near-term

- **Toasts instead of `alert()`** for save conflicts and playback errors. The current modal-blocking alerts feel 2009.
- **Tags / playlists.** Free-form tags on notes (`#warmup`, `#chord-study`, `#open-set`) and a Library filter chip per tag. The hard part isn't the schema, it's the input affordance — autocomplete from existing tags without becoming a full taxonomy editor.
- **Share a single note** by URL. Read-only public link, opt-in. Album art + your note, nothing else; no profile, no follower graph. The point is to send someone a link, not to be a social network.
- **Markdown-style shortcuts in the editor.** `**bold**`, `*italic*`, `> quote`. The contentEditable already handles all three, but no shortcuts trigger them today.
- **Keyboard shortcut to jump to the editor** from anywhere on the page. `Cmd+I` or similar.

## Medium-term

- **Full-text search in Postgres** (`tsvector` + GIN index) once anyone's library exceeds ~1k notes. The current client-side `.includes()` over the full list is fine until it isn't.
- **Apple Music provider.** Same data model, different OAuth flow + playback API. Mostly an afternoon for someone who already has an Apple Developer account and a MusicKit JS playback context to test against.
- **YouTube Music provider.** Same shape; the playback API is more painful than Apple's. Lower priority.
- **Per-note timestamps as anchors.** Right now timestamp chips render below the editor; clicking one seeks the song. Better would be: each chip is rendered inline at the point in the note where it appeared, and acts as both a button and an anchor.
- **Mobile transport controls in the lock-screen / Now Playing widget** via the Web Media Session API, so you can skip from your AirPods.

## Long-term / "would be cool"

- **Collaborative notes.** Two people writing on the same track at the same time, CRDT-merged. The cost-benefit here is bad — most note-takers want their notes private, and the engineering surface for CRDT-over-contentEditable is real. Probably won't happen unless someone explicitly asks for it.
- **AI summarization across your library.** "What did I think about Boards of Canada this year?" — pull every note tagged or matching, hand them to a model, get a paragraph back. Has to be opt-in, has to not silently send your notes to a third party.
- **Setlist mode.** Drag a sequence of tracks-with-notes into a list, get a printable / phone-readable cheat sheet. This is what DJs actually want; everything else is incidental.
- **Public library mode.** Opt-in, your notes become a personal music blog at `songnotes.codyh.xyz/u/yourname`. Probably best as a separate product.

## Won't ship

- **Streaming directly inside the app.** Spotify's API doesn't allow it (and shouldn't). The model is "the player follows your existing Spotify session," not "we are a player."
- **A timeline / activity feed of friends' notes.** Out of scope. There are 14 social music apps that already do this; the world doesn't need a 15th.
- **Mobile native app.** The PWA is good. Native would mean re-implementing the whole stack for ~5% UX delta.
