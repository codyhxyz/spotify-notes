"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  AuthExpiredError,
  getPlayback,
  getTrackMeta,
  pauseTrack,
  playTrack,
  skipNext,
  skipPrevious,
  type Playback,
  type TrackMeta,
} from "../../util/apiutils";
import { spotifyLogin, spotifyLogout } from "../../util/authutils";
import {
  PauseIcon,
  PlayIcon,
  SkipBackwardIcon,
  SkipForwardIcon,
  TimeStamp,
} from "../../util/components";
import SettingsModal from "../components/SettingsModal";
import EulaModal from "../components/EulaModal";
import { timestampRegexGlobal } from "@/util/miscutils";
import { useDebouncedCallback } from "use-debounce";
import DOMPurify from "dompurify";
import {
  Theme,
  THEME_LABELS,
  applyTheme,
  loadTheme,
  nextTheme,
  saveTheme,
} from "../../util/theme";

// Polling cadence. Spotify rate-limits aggressively and mobile battery is
// real, so we only hit the API frequently when the user is actively playing
// AND the tab is visible. Between polls we advance progressMs locally.
const POLL_PLAYING_MS = 4000;
const POLL_PAUSED_MS = 12000;
const POLL_HIDDEN_MS = 60000;

function fmtTime(ms: number): string {
  if (!ms || ms < 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type NoteRecord = {
  note: string;
  updatedAt: string | null;
  meta: TrackMeta | null;
};

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [acceptedEULA, setAcceptedEULA] = useState<boolean | null>(null);
  const [eulaPromptOpen, setEulaPromptOpen] = useState<boolean>(false);
  const [aboutOpen, setAboutOpen] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [meta, setMeta] = useState<TrackMeta | null>(null);
  const [loadingNote, setLoadingNote] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [progressMs, setProgressMs] = useState<number>(0);
  const [durationMs, setDurationMs] = useState<number>(0);
  const [theme, setTheme] = useState<Theme>("rose");
  const [awaitingPlay, setAwaitingPlay] = useState<boolean>(false);
  const [awaitingPrev, setAwaitingPrev] = useState<boolean>(false);
  const [awaitingNext, setAwaitingNext] = useState<boolean>(false);

  // The contentEditable owns the live note DOM. We seed it once per
  // track-load via `noteSeed` (state, read during render) and mirror live
  // edits into `currNoteRef` (read only in event handlers / save callback).
  // Splitting these avoids reading a ref during render — the React 19 rules
  // forbid that pattern because it can stale between renders.
  const [noteSeed, setNoteSeed] = useState<string>("");
  const [timestamps, setTimestamps] = useState<string[]>([]);
  const currNoteRef = useRef<string>("");
  const noteUpdatedAt = useRef<string | null>(null);
  const userIsTyping = useRef<boolean>(false);

  const sessionError = (session as { error?: string } | null)?.error;

  // ---- Theme bootstrap ----
  useEffect(() => {
    const t = loadTheme();
    setTheme(t);
    applyTheme(t);
  }, []);

  function cycleTheme() {
    const t = nextTheme(theme);
    setTheme(t);
    applyTheme(t);
    saveTheme(t);
  }

  // ---- Auth-error escape hatch ----
  // If the JWT can't refresh anymore (user revoked us, refresh-token
  // rotation expired, etc.) NextAuth surfaces { error: "RefreshAccessTokenError" }.
  // Bounce them to a fresh sign-in instead of letting the page silently fail.
  useEffect(() => {
    if (sessionError === "RefreshAccessTokenError") {
      spotifyLogin("/home");
    }
  }, [sessionError]);

  // ---- EULA gate ----
  const checkEULA = useCallback(async () => {
    try {
      const res = await fetch("/api/users");
      const json = await res.json();
      if (json?.accepted_eula) {
        setAcceptedEULA(true);
      } else {
        setAcceptedEULA(false);
        setEulaPromptOpen(true);
      }
    } catch (err) {
      console.error("[home] EULA check failed:", err);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    checkEULA();
  }, [status, checkEULA]);

  async function acceptEULA() {
    try {
      await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted_eula: true }),
      });
      setAcceptedEULA(true);
      setEulaPromptOpen(false);
    } catch (err) {
      console.error("[home] EULA accept failed:", err);
    }
  }

  // ---- Ambient backdrop ----
  useEffect(() => {
    if (meta?.image_url) {
      document.body.style.setProperty(
        "--album-image",
        `url("${meta.image_url}")`
      );
    } else {
      document.body.style.removeProperty("--album-image");
    }
  }, [meta?.image_url]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      document.body.style.setProperty(
        "--mx",
        `${(e.clientX / window.innerWidth) * 100}%`
      );
      document.body.style.setProperty(
        "--my",
        `${(e.clientY / window.innerHeight) * 100}%`
      );
    };
    document.addEventListener("pointermove", onMove);
    return () => document.removeEventListener("pointermove", onMove);
  }, []);

  // ---- Polling: visibility-aware, paused-aware ----
  const reauthOnExpired = useCallback(() => {
    spotifyLogin("/home");
  }, []);

  const pollPlayback = useCallback(async () => {
    try {
      const pb: Playback = await getPlayback();
      setIsPlaying(pb.playing);
      if (pb.durationMs) setDurationMs(pb.durationMs);
      setProgressMs(pb.progressMs);
      if (!userIsTyping.current && pb.trackId && pb.trackId !== trackId) {
        setTrackId(pb.trackId);
      }
    } catch (err) {
      if (err instanceof AuthExpiredError) reauthOnExpired();
      else console.error("[home] playback poll failed:", err);
    }
  }, [trackId, reauthOnExpired]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (cancelled) return;
      const interval =
        document.visibilityState === "hidden"
          ? POLL_HIDDEN_MS
          : isPlaying
            ? POLL_PLAYING_MS
            : POLL_PAUSED_MS;
      timer = setTimeout(async () => {
        await pollPlayback();
        schedule();
      }, interval);
    };

    pollPlayback();
    schedule();

    const onVis = () => {
      // Wake immediately when the tab comes back to the foreground.
      if (document.visibilityState === "visible") {
        if (timer) clearTimeout(timer);
        pollPlayback().then(schedule);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [status, isPlaying, pollPlayback]);

  // ---- Local progress advance between polls ----
  useEffect(() => {
    if (!isPlaying || !durationMs) return;
    const id = setInterval(() => {
      setProgressMs((p) => Math.min(durationMs, p + 250));
    }, 250);
    return () => clearInterval(id);
  }, [isPlaying, durationMs]);

  // ---- Track changed: load note (and metadata) ----
  useEffect(() => {
    if (!trackId || status !== "authenticated") return;
    let cancelled = false;
    setLoadingNote(true);
    setMeta(null);
    setNoteSeed("");
    setTimestamps([]);
    currNoteRef.current = "";
    noteUpdatedAt.current = null;
    (async () => {
      try {
        const noteRecord = await fetchNote(trackId);
        if (cancelled) return;
        currNoteRef.current = noteRecord.note;
        setNoteSeed(noteRecord.note);
        setTimestamps(extractTimestamps(noteRecord.note));
        noteUpdatedAt.current = noteRecord.updatedAt;
        if (noteRecord.meta?.name) {
          setMeta(noteRecord.meta);
        } else {
          // No cached metadata yet — fetch from Spotify proxy.
          try {
            const fresh = await getTrackMeta(trackId);
            if (cancelled) return;
            setMeta(fresh);
          } catch (err) {
            if (err instanceof AuthExpiredError) reauthOnExpired();
            else console.error("[home] track meta fetch failed:", err);
          }
        }
      } finally {
        if (!cancelled) setLoadingNote(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trackId, status, reauthOnExpired]);

  async function fetchNote(tid: string): Promise<NoteRecord> {
    try {
      const res = await fetch(`/api/notes?track_id=${encodeURIComponent(tid)}`);
      if (!res.ok) throw new Error(`note fetch: ${res.status}`);
      const json = (await res.json()) as {
        note: string | null;
        updated_at: string | null;
        name: string | null;
        artists: string[] | null;
        artist_urls: string[] | null;
        image_url: string | null;
        track_url: string | null;
        album_url: string | null;
      };
      const hasMeta = !!json.name;
      return {
        note: json.note ?? "",
        updatedAt: json.updated_at,
        meta: hasMeta
          ? {
              track_id: tid,
              name: json.name ?? "",
              artists: json.artists ?? [],
              artist_urls: json.artist_urls ?? [],
              image_url: json.image_url ?? "",
              track_url: json.track_url ?? "",
              album_url: json.album_url ?? "",
            }
          : null,
      };
    } catch (err) {
      console.error("[home] fetchNote failed:", err);
      return { note: "", updatedAt: null, meta: null };
    }
  }

  // ---- Save with optimistic concurrency ----
  const saveNote = useCallback(
    async (tid: string, note: string) => {
      if (!meta) return; // wait for metadata so we can persist it alongside
      try {
        const res = await fetch("/api/notes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            track_id: tid,
            note,
            expected_updated_at: noteUpdatedAt.current,
            name: meta.name,
            artists: meta.artists,
            artist_urls: meta.artist_urls,
            image_url: meta.image_url,
            track_url: meta.track_url,
            album_url: meta.album_url,
          }),
        });
        if (res.status === 409) {
          // Another tab/device wrote first. Refetch and let the user decide.
          const j = (await res.json().catch(() => ({}))) as {
            current_updated_at?: string;
          };
          noteUpdatedAt.current = j.current_updated_at ?? null;
          alert(
            "This note was edited in another tab. The newer version has been kept; refresh to see it."
          );
          return;
        }
        if (!res.ok) throw new Error(`save failed: ${res.status}`);
        const ok = (await res.json()) as { updated_at?: string };
        if (ok.updated_at) noteUpdatedAt.current = ok.updated_at;
      } catch (err) {
        console.error("[home] save note failed:", err);
        alert(
          "Error saving note! Please copy your note, save it somewhere else, and refresh."
        );
      }
    },
    [meta]
  );

  const debouncedSave = useDebouncedCallback((tid: string, note: string) => {
    saveNote(tid, note);
  }, 500);

  const setTypingFalseDebounced = useDebouncedCallback(() => {
    userIsTyping.current = false;
  }, 500);

  function extractTimestamps(note: string): string[] {
    if (!note) return [];
    return Array.from(note.matchAll(timestampRegexGlobal)).map((m) => m[0]);
  }

  // Recompute timestamp chips at most a few times per second while typing.
  const setTimestampsDebounced = useDebouncedCallback((note: string) => {
    setTimestamps(extractTimestamps(note));
  }, 250);

  function handleNoteInput(note: string) {
    currNoteRef.current = note;
    userIsTyping.current = true;
    setTypingFalseDebounced();
    setTimestampsDebounced(note);
    if (trackId) debouncedSave(trackId, note);
  }

  // ---- Transport ----
  async function handlePlay() {
    if (!trackId) return;
    setAwaitingPlay(true);
    try {
      await playTrack(trackId);
      setIsPlaying(true);
    } catch (err) {
      if (err instanceof AuthExpiredError) reauthOnExpired();
      else {
        console.error("[home] play failed:", err);
        alert("Couldn't start playback. Make sure Spotify has an active device.");
      }
    } finally {
      setAwaitingPlay(false);
    }
  }
  async function handlePause() {
    setAwaitingPlay(true);
    try {
      await pauseTrack();
      setIsPlaying(false);
    } catch (err) {
      if (err instanceof AuthExpiredError) reauthOnExpired();
      else console.error("[home] pause failed:", err);
    } finally {
      setAwaitingPlay(false);
    }
  }
  async function handlePrev() {
    setAwaitingPrev(true);
    try {
      await skipPrevious();
      await pollPlayback();
    } catch (err) {
      if (err instanceof AuthExpiredError) reauthOnExpired();
      else console.error("[home] previous failed:", err);
    } finally {
      setAwaitingPrev(false);
    }
  }
  async function handleNextTrack() {
    setAwaitingNext(true);
    try {
      await skipNext();
      await pollPlayback();
    } catch (err) {
      if (err instanceof AuthExpiredError) reauthOnExpired();
      else console.error("[home] next failed:", err);
    } finally {
      setAwaitingNext(false);
    }
  }

  // ---- Keyboard: space = play/pause when not in the editor ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " && e.code !== "Space") return;
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const tag = t.tagName.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        t.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      if (isPlaying) handlePause();
      else handlePlay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, trackId]);

  const hasTrack = Boolean(meta?.name && acceptedEULA);
  const progressPct = durationMs
    ? Math.min(100, (progressMs / durationMs) * 100)
    : 0;
  const remainingMs = Math.max(0, durationMs - progressMs);

  return (
    <>
      <div className="art-backdrop" aria-hidden />
      <main className="app-shell">
        <header className="topbar fade">
          <div className="brand">
            <button
              type="button"
              className="orb"
              onClick={cycleTheme}
              title={`Theme: ${THEME_LABELS[theme]} · click to change`}
              aria-label={`Change theme (current: ${THEME_LABELS[theme]})`}
            />
            My&nbsp;<b><em>Song</em>&nbsp;Notes</b>
          </div>
          <div className="top-right">
            {hasTrack && (
              <span className="chip live">
                {isPlaying ? "Playing" : "Paused"}
              </span>
            )}
            <button
              className="chip"
              onClick={() => router.push("/home/library")}
              title="All your notes"
            >
              Library
            </button>
            <button
              className="chip"
              onClick={() => setSettingsOpen(true)}
              title="Settings"
            >
              Settings
            </button>
          </div>
        </header>

        {hasTrack && !loadingNote && meta ? (
          <>
            <section className="stage">
              <div className="cover-stage fade d2">
                <div
                  className="cover-reflect"
                  aria-hidden
                  style={{ backgroundImage: `url("${meta.image_url}")` }}
                />
                <a
                  href={meta.album_url}
                  target="_blank"
                  rel="noreferrer"
                  className="cover"
                >
                  {meta.image_url ? (
                    <Image
                      className="cover-img"
                      src={meta.image_url}
                      alt={`${meta.name} album art`}
                      width={640}
                      height={640}
                      priority
                      unoptimized
                    />
                  ) : null}
                </a>
                <div className="now-card">
                  <div className="swatch" aria-hidden>
                    <i /><i /><i /><i />
                  </div>
                  <div>
                    <div className="meta-t">Now Playing · Spotify</div>
                    <div className="meta-b">{meta.name}</div>
                  </div>
                </div>
              </div>

              <div className="info fade d3">
                <div className="eyebrow">
                  {isPlaying ? "Currently streaming" : "Paused"} · {fmtTime(durationMs)}
                </div>
                <h1 className="song-title">
                  <a
                    href={meta.track_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "inherit" }}
                  >
                    {meta.name.split(" ").length > 1 ? (
                      <>
                        {meta.name.split(" ").slice(0, -1).join(" ")}{" "}
                        <em>{meta.name.split(" ").slice(-1)[0]}</em>
                      </>
                    ) : (
                      <em>{meta.name}</em>
                    )}
                  </a>
                </h1>
                <div className="byline">
                  by{" "}
                  {meta.artists.map((artist, index) => (
                    <span key={index}>
                      <b>
                        <a
                          href={meta.artist_urls[index]}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {artist}
                        </a>
                      </b>
                      {index < meta.artists.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </div>

                <div className="player">
                  <div className="ctrls">
                    <button
                      onClick={handlePrev}
                      disabled={awaitingPrev}
                      aria-label="Previous track"
                    >
                      <SkipBackwardIcon />
                    </button>
                    <button
                      className="play"
                      onClick={isPlaying ? handlePause : handlePlay}
                      disabled={awaitingPlay}
                      aria-label={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? <PauseIcon /> : <PlayIcon />}
                    </button>
                    <button
                      onClick={handleNextTrack}
                      disabled={awaitingNext}
                      aria-label="Next track"
                    >
                      <SkipForwardIcon />
                    </button>
                  </div>
                  <div className="time">
                    <div className="row">
                      <span>{fmtTime(progressMs)}</span>
                      <span>— {fmtTime(remainingMs)}</span>
                    </div>
                    <div className="bar">
                      <div className="fill" style={{ width: `${progressPct}%` }} />
                    </div>
                  </div>
                </div>

                {timestamps.length > 0 && (
                  <div className="ts-chips">
                    {timestamps.map((stamp, index) => (
                      <TimeStamp
                        key={`${stamp}-${index}`}
                        trackID={trackId ?? undefined}
                        stamp={stamp}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="notes fade d4">
              <span className="notes-label">Notes</span>
              <div
                key={trackId ?? "no-track"}
                className="notes-editor"
                contentEditable
                suppressContentEditableWarning
                spellCheck={false}
                data-placeholder="Write something… drop a 1:23 timestamp and it turns into a button."
                onInput={(e) =>
                  handleNoteInput((e.currentTarget as HTMLDivElement).innerHTML)
                }
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(noteSeed),
                }}
              />
            </section>
          </>
        ) : (
          <section className="notes-hint fade d2">
            {loadingNote ? (
              <>Loading your notes…</>
            ) : acceptedEULA === false ? (
              <>Accept the EULA prompt to get started.</>
            ) : (
              <>
                Start playing a song on Spotify.
                <small>This page will follow along.</small>
              </>
            )}
          </section>
        )}

        {hasTrack && (
          <footer className="foot fade d5">
            <a href="https://github.com/codyhxyz/spotify-notes" target="_blank" rel="noreferrer">
              source code
            </a>
            <button onClick={() => setAboutOpen(true)} className="footer-btn">
              what is this
            </button>
            <a href="https://codyh.xyz" target="_blank" rel="noreferrer">
              built by codyh
            </a>
          </footer>
        )}

        {aboutOpen && (
          <div className="modal-overlay" onClick={() => setAboutOpen(false)}>
            <div className="modal-box" onClick={(e) => e.stopPropagation()}>
              <button
                className="modal-close"
                onClick={() => setAboutOpen(false)}
              >
                ✕
              </button>
              <h2>what is this?</h2>
              <p className="modal-byline">
                Built by{" "}
                <a href="https://codyh.xyz" target="_blank" rel="noreferrer">
                  Cody Hergenroeder
                </a>
              </p>
              <p>
                I built this because I&apos;m a DJ, and DJing requires you to constantly organize your thoughts around huge amounts of music. I was switching between Spotify and a notes app. I needed a frictionless way to take notes on Spotify songs without losing flow.
              </p>
              <p>
                I made this because it felt crazy that something like this didn&apos;t exist. Spotify gives you access to all this music but no way to document your thoughts about it. If note-taking were a first-party Spotify feature, I think way more people would naturally become music note-takers.
              </p>
              <p>
                The core insight that made this feel right was: instead of making you navigate to a song, the app just follows whatever you&apos;re currently playing. You open it, and it&apos;s already there.
              </p>
              <p>
                Beyond DJs, I&apos;ve heard from friends that it&apos;s useful for piano students learning songs, for playlist curators, for people who just want to capture why a song hits them the way it does. Music makes people think, this is a home for those thoughts.
              </p>
            </div>
          </div>
        )}

        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />

        <EulaModal
          open={eulaPromptOpen}
          onAccept={acceptEULA}
          onDecline={() => spotifyLogout()}
        />
      </main>
    </>
  );
}
