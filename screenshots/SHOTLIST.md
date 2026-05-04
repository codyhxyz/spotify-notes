# Screenshot + demo capture list

What I (or future-me) need to grab when shipping a launch. The repo's marketing copy and README slot point at these filenames, so keep them stable or update both.

## Capture environment

- **Browser**: Chrome or Arc, fullscreen at 1440×900 logical (2880×1800 retina). Hide bookmarks bar, hide all extension chips, profile-icon-less window if possible (Incognito works for that).
- **OS**: Mac with menu bar auto-hide on, or use [CleanShot X](https://cleanshot.com/) to crop out chrome.
- **Site**: production at `https://songnotes.codyh.xyz` (logged in with a real account that has a populated library — at least 12 notes, mixed genres, so the Library view actually has content).
- **Theme**: Rose (the default). It's the most photogenic.
- **Account state**: Spotify Premium, with an active device (open the desktop app, hit play once, then pause). The transport controls render disabled if there's no active device.

Use a song with strong album art for the hero — high-contrast, recognizable, ideally not embarrassing to be associated with for the next 5 years.

## Files to produce

| File | Used in | Dimensions | What's in frame |
|---|---|---|---|
| `screenshots/01-now-playing.png` | README hero, MARKETING tweet, PH gallery #1 | 2880×1800 (retina) → export at 1600px wide | Now-playing view, mid-song, with a real note typed (~3–5 lines), at least one `1:23` timestamp chip visible below the player |
| `screenshots/02-library.png` | README, MARKETING, PH gallery #2 | same | `/home/library` with the search box focused and a query active so highlighting renders, ~9 cards visible |
| `screenshots/03-library-drawer.png` | PH gallery #3 | same | Library with a card opened — drawer showing the note + Play/Delete actions |
| `screenshots/04-settings.png` | PH gallery #4 (optional) | same | Settings modal open, showing Export / Wipe / Log out |
| `screenshots/05-landing.png` | PH gallery #5 (optional) | same | Logged-out landing, before the Continue with Spotify click |
| `screenshots/demo.gif` | README hero (animated), tweet | 1280×800, ≤8MB | The demo video below, exported as gif |
| `video/demo.mp4` | tweet attachment, PH video | 1920×1080, ≤45s, ≤512MB for X | The demo video below |

## Demo script (30–45s, target 35s)

Keep it tight. No voiceover. Music in the background is the song you're annotating — Spotify is doing it for you.

```
0:00  Logged-out landing. Click Continue with Spotify. (~2s)
0:02  OAuth flow — speed this up 4x in post or cut it entirely. (~1s shown)
0:03  Now-playing view loads. Album art fades in, song title typesets in. (~3s)
0:06  Click into the note pane. Type ~2 lines:
        "absurd intro. drums hit at 1:23 — rework into the
         opener after the bridge"
      As you type "1:23", that text becomes a clickable chip.
      (~9s of typing)
0:15  Click the 1:23 chip. Spotify seeks. The progress bar visibly jumps. (~2s)
0:17  Click the Skip-Forward control. Track changes; the note pane re-loads
      a different note (one that was already written for this track). (~3s)
0:20  Click "Library" in the top right. (~1s)
0:21  Library view, ~12 cards. Type a search query — "boards" or whatever
      matches a real artist. Cards filter, highlight matches in real time. (~5s)
0:26  Click a card. Drawer opens, showing the full note and ▶ Play in Spotify. (~3s)
0:29  Click ▶ Play. Drawer closes back to the Library; in the background
      Spotify starts playing the new track (you can see the small
      now-playing badge update). (~3s)
0:32  Final beat: cursor settles, end card with the URL "songnotes.codyh.xyz". (~3s)
0:35  Done.
```

If 35s is impossible, prioritize keeping: type-with-timestamp (the hook), Library search (the polish), and the final URL card (the call to action). Cut everything else.

## Recording

```bash
# CleanShot X record region or QuickTime Player → File → New Screen Recording
# Export as 1080p mp4. Then convert to gif for the README:

ffmpeg -i video/demo.mp4 -vf "fps=18,scale=1280:-1:flags=lanczos" \
       -c:v gif -loop 0 screenshots/demo.gif
```

If the gif comes out >8MB (Twitter cap), drop fps to 14 and width to 960.

## Where these get used

- `README.md` — `screenshots/demo.gif` referenced near the top.
- `MARKETING.md` — primary tweet attaches `demo.gif`; PH gallery uses the PNGs in numbered order.
- GitHub repo social preview slot — generated from `app/opengraph-image.tsx`, not from these screenshots. Grab via:
  ```bash
  curl -o /tmp/og.png https://songnotes.codyh.xyz/opengraph-image
  # then upload to https://github.com/codyhxyz/spotify-notes/settings → Social preview
  ```
