"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  gettrack,
  playtrack,
  pausetrack,
  getplaybackstate,
  getavailabledevices,
  skipPrevious,
  skipNext,
  extractTrackDataFromResponse,
  extractTrackIDFromSongURL,
} from "../../util/apiutils";
import { spotifyLogout } from "../../util/authutils";
import {
  SkipBackwardIcon,
  SkipForwardIcon,
  PlayIcon,
  PauseIcon,
  TimeStamp,
} from "../../util/components";
import SettingsModal from "../components/SettingsModal";
import { timestampRegexGlobal } from "@/util/miscutils";
import { useDebouncedCallback } from "use-debounce";
import DOMPurify from "dompurify";
import { AxiosResponse } from "axios";
import {
  Theme,
  THEME_LABELS,
  applyTheme,
  loadTheme,
  nextTheme,
  saveTheme,
} from "../../util/theme";

function fmtTime(ms: number | undefined) {
  if (!ms || ms < 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [acceptedEULA, setAcceptedEULA] = useState<boolean>(false);
  const [aboutOpen, setAboutOpen] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [searchText] = useState<string>(""); // reserved for future URL-search feature
  const [songName, setSongName] = useState<string>("");
  const [artists, setArtists] = useState<string[]>([]);
  const [trackURL, setTrackURL] = useState<string>("");
  const [imageURL, setImageURL] = useState<string>("");
  const [albumURL, setAlbumURL] = useState<string>("");
  const [artistURLs, setArtistURLs] = useState<string>("");
  const [loadingNote, setLoadingNote] = useState<boolean>(false);
  const [foundActiveDevice, setFoundActiveDevice] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [progressMs, setProgressMs] = useState<number>(0);
  const [durationMs, setDurationMs] = useState<number>(0);
  const accessToken = useRef<string>();
  const userID = useRef<string | undefined>(undefined);
  const [trackID, setTrackID] = useState<string | undefined>("");
  const currNote = useRef<string>("");
  const userIsTyping = useRef<boolean>(false);

  const [awaitingPlayAPIResponse, setAwaitingPlayAPIResponse] =
    useState<boolean>(false);
  const [awaitingLSkipAPIResponse, setAwaitingLSkipAPIResponse] =
    useState<boolean>(false);
  const [awaitingRSkipAPIResponse, setAwaitingRSkipAPIResponse] =
    useState<boolean>(false);

  const [timestamps, setTimeStamps] = useState<Array<string>>([]);
  const [theme, setTheme] = useState<Theme>("rose");

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

  // NextAuth session -> access token + canonical Spotify user id.
  useEffect(() => {
    if (status !== "authenticated") return;
    accessToken.current = session?.accessToken;
    userID.current = session?.user?.id;
    if (userID.current) confirmEULA();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session?.accessToken, session?.user?.id]);

  // Feed album art into the ambient backdrop CSS variable.
  useEffect(() => {
    if (imageURL) {
      document.body.style.setProperty("--album-image", `url("${imageURL}")`);
    } else {
      document.body.style.removeProperty("--album-image");
    }
  }, [imageURL]);

  // Pointer parallax for the bloom highlight.
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

  async function confirmEULA() {
    try {
      const res = await fetch("/api/users");
      const json = await res.json();
      if (json?.accepted_eula) {
        setAcceptedEULA(true);
      } else {
        if (
          confirm(
            "Spotify requires us to ask you to agree to our EULA. By clicking OK, you acknowledge that you have read and agree to be bound by the terms and conditions of this EULA. You can read it here: https://raw.githubusercontent.com/codyhxyz/spotify-notes/master/EULA.md"
          )
        ) {
          try {
            await fetch("/api/users", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ accepted_eula: true }),
            });
            setAcceptedEULA(true);
          } catch (error) {
            console.log(error);
          }
        } else {
          alert(
            "In compliance with Spotify's policies, our app's functionality will be unavailable until the EULA is accepted."
          );
          spotifyLogout();
        }
      }
    } catch (error) {
      console.log(error);
    }
  }

  const debouncedSave = useDebouncedCallback((tid, note) => {
    saveNote({ track_id: tid, note });
  }, 500);

  const setTypingFalseDebounced = useDebouncedCallback(() => {
    userIsTyping.current = false;
  }, 500);

  function reauthenticateUser() {
    window.location.href = "/";
  }

  function updateIsPlayingIfNecessary(response: AxiosResponse | null) {
    if (response?.data?.is_playing) {
      setIsPlaying(response.status == 204 ? false : response.data.is_playing);
    } else {
      setIsPlaying(false);
    }
  }

  function updateActiveDevice(response: AxiosResponse) {
    setFoundActiveDevice(response?.data?.device?.id);
  }

  function extractTrackIDFromResponse(response: AxiosResponse) {
    return response?.data?.item?.id;
  }

  const loadPlaybackState = useCallback(async () => {
    try {
      const response: any = await getplaybackstate(accessToken.current);
      updateIsPlayingIfNecessary(response);
      updateActiveDevice(response);
      // progress bar data
      const prog = response?.data?.progress_ms;
      const dur = response?.data?.item?.duration_ms;
      if (typeof prog === "number") setProgressMs(prog);
      if (typeof dur === "number") setDurationMs(dur);

      if (!userIsTyping.current && !searchText) {
        const responseTrackID = extractTrackIDFromResponse(response);
        if (responseTrackID && responseTrackID !== trackID) {
          setTrackID(responseTrackID);
        }
      }
    } catch (error: any) {
      if (error?.response?.status == 401) reauthenticateUser();
      updateIsPlayingIfNecessary(null);
    }
  }, [trackID, searchText]);

  useEffect(() => {
    loadTrackDataFromID();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackID]);

  useEffect(() => {
    const interval = setInterval(loadPlaybackState, 1000);
    return () => clearInterval(interval);
  }, [loadPlaybackState]);

  async function fetchNote(tid: any) {
    let note = "";
    try {
      setLoadingNote(true);
      const res = await fetch(
        `/api/notes?track_id=${encodeURIComponent(tid)}`
      );
      const json = await res.json();
      if (json?.note) note = json.note;
    } catch (error) {
      console.log(error);
    } finally {
      setLoadingNote(false);
      return note;
    }
  }

  function clearSongAndNoteViewStates() {
    setArtists([]);
    setTrackURL("");
    setSongName("");
    setImageURL("");
    setAlbumURL("");
    setArtistURLs("");
    currNote.current = "";
  }

  function setSongAndNoteViewStates(
    song_name: any,
    image_url: any,
    track_url: any,
    artists: any,
    note: any,
    album_url: any,
    artist_urls: any
  ) {
    setArtists(artists);
    setTrackURL(track_url);
    setSongName(song_name);
    setImageURL(image_url);
    setAlbumURL(album_url);
    setArtistURLs(artist_urls);
    currNote.current = note;
  }

  const loadTrackDataFromID = async () => {
    if (!accessToken.current || !trackID) return;

    const tid = trackID;
    clearSongAndNoteViewStates();
    try {
      const response = await gettrack(tid, accessToken.current);
      const track_data = response?.data;
      const [song_name, image_url, track_url, album_url, artist_urls, artists] =
        extractTrackDataFromResponse(track_data);
      const note = await fetchNote(tid);
      extractTimestamps(note);

      setSongAndNoteViewStates(
        song_name,
        image_url,
        track_url,
        artists,
        note,
        album_url,
        artist_urls
      );
    } catch (error: any) {
      console.log("error: failed to get track ", tid, error);
      if (error?.response?.status == 401) reauthenticateUser();
    }
  };

  function extractTimestamps(note: string) {
    setTimeStamps([]);
    const matches = note.matchAll(timestampRegexGlobal);
    for (const match of matches) {
      setTimeStamps((prev) => [...prev, match[0]]);
    }
  }

  async function handlePlayButtonClick() {
    try {
      setAwaitingPlayAPIResponse(true);
      let deviceIDToUse = undefined;
      if (!foundActiveDevice) {
        const response = await getavailabledevices(accessToken.current);
        const devices = response?.data?.devices;
        if (devices && devices.length > 0) {
          for (let i = 0; i < devices.length; i++) {
            if (devices[i]?.id && !devices[i]?.is_restricted) {
              deviceIDToUse = devices[i].id;
            }
          }
        }
      }
      await playtrack(trackID, accessToken.current, deviceIDToUse);
    } catch (error: any) {
      if (error?.response?.status == 403) {
        alert("Device inaccessible; please change your Spotify output device.");
      }
      console.log(error);
    } finally {
      setAwaitingPlayAPIResponse(false);
    }
  }

  async function handlePauseButtonClick() {
    try {
      setAwaitingPlayAPIResponse(true);
      await pausetrack(accessToken.current);
    } catch (error) {
      console.log(error);
    } finally {
      setAwaitingPlayAPIResponse(false);
    }
  }

  async function handlePrevButtonClick() {
    try {
      setAwaitingLSkipAPIResponse(true);
      await skipPrevious(accessToken.current);
      await loadPlaybackState();
    } catch (error) {
      console.log(error);
    } finally {
      setAwaitingLSkipAPIResponse(false);
    }
  }

  async function handleNextButtonClick() {
    try {
      setAwaitingRSkipAPIResponse(true);
      await skipNext(accessToken.current);
      await loadPlaybackState();
    } catch (error) {
      console.log(error);
    } finally {
      setAwaitingRSkipAPIResponse(false);
    }
  }

  async function saveNote({
    track_id,
    note,
  }: {
    track_id: string | undefined;
    note: string;
  }): Promise<void> {
    try {
      const res = await fetch("/api/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_id, note }),
      });
      if (!res.ok) throw new Error(`save failed: ${res.status}`);
    } catch (error) {
      console.log(error);
      alert(
        "Error saving note! Please copy your note, save it somewhere else, and refresh."
      );
    }
  }

  function handleNoteBoxKeypress(note: any) {
    currNote.current = note;
    userIsTyping.current = true;
    setTypingFalseDebounced();
    debouncedSave(trackID, note);
  }

  const hasTrack = Boolean(
    userID.current && songName && artists && imageURL && acceptedEULA
  );
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

        {hasTrack && !loadingNote ? (
          <>
            <section className="stage">
              <div className="cover-stage fade d2">
                <div
                  className="cover-reflect"
                  aria-hidden
                  style={{ backgroundImage: `url("${imageURL}")` }}
                />
                <a href={albumURL} target="_blank" rel="noreferrer" className="cover">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="cover-img" src={imageURL} alt={`${songName} album art`} />
                </a>
                <div className="now-card">
                  <div className="swatch" aria-hidden>
                    <i /><i /><i /><i />
                  </div>
                  <div>
                    <div className="meta-t">Now Playing · Spotify</div>
                    <div className="meta-b">{songName}</div>
                  </div>
                </div>
              </div>

              <div className="info fade d3">
                <div className="eyebrow">
                  {isPlaying ? "Currently streaming" : "Paused"} · {fmtTime(durationMs)}
                </div>
                <h1 className="song-title">
                  <a href={trackURL} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
                    {songName.split(" ").length > 1
                      ? (
                        <>
                          {songName.split(" ").slice(0, -1).join(" ")}{" "}
                          <em>{songName.split(" ").slice(-1)[0]}</em>
                        </>
                      )
                      : <em>{songName}</em>}
                  </a>
                </h1>
                <div className="byline">
                  by{" "}
                  {artists.map((artist, index) => (
                    <span key={index}>
                      <b>
                        <a href={artistURLs[index]} target="_blank" rel="noreferrer">
                          {artist}
                        </a>
                      </b>
                      {index < artists.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </div>

                <div className="player">
                  <div className="ctrls">
                    <button
                      onClick={handlePrevButtonClick}
                      disabled={awaitingLSkipAPIResponse}
                      aria-label="Previous track"
                    >
                      <SkipBackwardIcon />
                    </button>
                    <button
                      className="play"
                      onClick={isPlaying ? handlePauseButtonClick : handlePlayButtonClick}
                      disabled={awaitingPlayAPIResponse}
                      aria-label={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? <PauseIcon /> : <PlayIcon />}
                    </button>
                    <button
                      onClick={handleNextButtonClick}
                      disabled={awaitingRSkipAPIResponse}
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
                    {timestamps.map((timestamp, index) => (
                      <TimeStamp
                        key={index}
                        trackID={trackID}
                        access_token={accessToken.current}
                        device_id={undefined}
                        stamp={timestamp}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="notes fade d4">
              <span className="notes-label">Notes</span>
              <div
                className="notes-editor"
                contentEditable
                spellCheck={false}
                data-placeholder="Write something… drop a 1:23 timestamp and it turns into a button."
                onInput={(e: any) => handleNoteBoxKeypress(e.target.innerHTML)}
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(currNote.current),
                }}
              />
            </section>
          </>
        ) : (
          <section className="notes-hint fade d2">
            {loadingNote ? (
              <>Loading your notes…</>
            ) : !acceptedEULA && userID.current ? (
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
            <a href="https://github.com/codyhxyz/spotify-notes" target="_blank" rel="noreferrer">source code</a>
            <button onClick={() => setAboutOpen(true)} className="footer-btn">what is this</button>
            <a href="https://codyh.xyz" target="_blank" rel="noreferrer">built by codyh</a>
          </footer>
        )}

        {aboutOpen && (
          <div className="modal-overlay" onClick={() => setAboutOpen(false)}>
            <div className="modal-box" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setAboutOpen(false)}>✕</button>
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
          accessToken={accessToken.current}
        />
      </main>
    </>
  );
}
