"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import DOMPurify from "dompurify";
import {
  getTracksBatch,
  playtrack,
  getavailabledevices,
} from "../../../util/apiutils";
import { TimeStamp } from "../../../util/components";
import SettingsModal from "../../components/SettingsModal";
import { timestampRegexGlobal } from "@/util/miscutils";
import {
  Theme,
  THEME_LABELS,
  applyTheme,
  loadTheme,
  nextTheme,
  saveTheme,
} from "../../../util/theme";

type NoteRow = {
  track_id: string;
  note: string;
  updated_at: string;
};

type HydratedNote = NoteRow & {
  name: string;
  artists: string[];
  artistURLs: string[];
  imageURL: string;
  trackURL: string;
  albumURL: string;
};

type SortKey = "recent" | "oldest" | "longest" | "artist";

const SORT_LABELS: Record<SortKey, string> = {
  recent: "Recent",
  oldest: "Oldest",
  longest: "Longest",
  artist: "Artist A–Z",
};

const META_CACHE_KEY = "spotify-notes:track-meta:v1";

type CachedMeta = Omit<HydratedNote, "note" | "updated_at">;

function loadMetaCache(): Record<string, CachedMeta> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(META_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveMetaCache(cache: Record<string, CachedMeta>) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(META_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // storage full; skip
  }
}

function stripHTML(html: string) {
  if (typeof window === "undefined") return html.replace(/<[^>]+>/g, " ");
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.textContent ?? "";
}

function highlight(text: string, q: string) {
  if (!q) return text;
  const terms = q
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (terms.length === 0) return text;
  const re = new RegExp(`(${terms.join("|")})`, "ig");
  const parts = text.split(re);
  return parts.map((p, i) =>
    re.test(p) ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>
  );
}

function snippetAround(text: string, q: string, max = 180) {
  const plain = text.replace(/\s+/g, " ").trim();
  if (!q) return plain.slice(0, max) + (plain.length > max ? "…" : "");
  const lower = plain.toLowerCase();
  const term = q.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const idx = term ? lower.indexOf(term) : -1;
  if (idx < 0) return plain.slice(0, max) + (plain.length > max ? "…" : "");
  const start = Math.max(0, idx - 40);
  const end = Math.min(plain.length, start + max);
  return (start > 0 ? "…" : "") + plain.slice(start, end) + (end < plain.length ? "…" : "");
}

export default function Library() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [theme, setTheme] = useState<Theme>("rose");
  const [rows, setRows] = useState<NoteRow[] | null>(null);
  const [meta, setMeta] = useState<Record<string, HydratedNote>>({});
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openTrack, setOpenTrack] = useState<string | null>(null);
  const [hoverArt, setHoverArt] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = loadTheme();
    setTheme(t);
    applyTheme(t);
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    (async () => {
      try {
        const res = await fetch("/api/notes/list");
        if (res.status === 401) {
          window.location.href = "/";
          return;
        }
        const json = await res.json();
        setRows(json?.notes ?? []);
      } catch (e) {
        console.error(e);
        setRows([]);
      }
    })();
  }, [status]);

  useEffect(() => {
    if (!rows || rows.length === 0) return;
    const token = session?.accessToken;
    if (!token) return;

    const cache = loadMetaCache();
    const seeded: Record<string, HydratedNote> = {};
    for (const r of rows) {
      if (cache[r.track_id]) seeded[r.track_id] = { ...cache[r.track_id], ...r };
    }
    setMeta(seeded);

    const missing = rows.filter((r) => !cache[r.track_id]).map((r) => r.track_id);
    if (missing.length === 0) return;

    (async () => {
      try {
        const tracks = await getTracksBatch(missing, token);
        const nextMeta: Record<string, HydratedNote> = { ...seeded };
        const nextCache: Record<string, CachedMeta> = { ...cache };
        for (const t of tracks) {
          const row = rows.find((r) => r.track_id === t.id);
          if (!row) continue;
          const cm: CachedMeta = {
            track_id: row.track_id,
            name: t.name,
            artists: (t.artists ?? []).map((a: any) => a.name),
            artistURLs: (t.artists ?? []).map(
              (a: any) => a.external_urls?.spotify ?? "#"
            ),
            imageURL: t.album?.images?.[0]?.url ?? "",
            trackURL: t.external_urls?.spotify ?? "#",
            albumURL: t.album?.external_urls?.spotify ?? "#",
          };
          nextCache[t.id] = cm;
          nextMeta[t.id] = { ...cm, ...row };
        }
        setMeta(nextMeta);
        saveMetaCache(nextCache);
      } catch (e: any) {
        if (e?.response?.status === 401) {
          window.location.href = "/";
        } else {
          console.error(e);
        }
      }
    })();
  }, [rows, session?.accessToken]);

  useEffect(() => {
    const img = openTrack ? meta[openTrack]?.imageURL : hoverArt ?? undefined;
    if (img) {
      document.body.style.setProperty("--album-image", `url("${img}")`);
    } else {
      document.body.style.removeProperty("--album-image");
    }
  }, [hoverArt, openTrack, meta]);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (e.key === "Escape" && openTrack) setOpenTrack(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openTrack]);

  function cycleTheme() {
    const t = nextTheme(theme);
    setTheme(t);
    applyTheme(t);
    saveTheme(t);
  }

  const hydrated: HydratedNote[] = useMemo(() => {
    if (!rows) return [];
    return rows
      .map((r) => meta[r.track_id])
      .filter(Boolean) as HydratedNote[];
  }, [rows, meta]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? hydrated.filter((n) => {
          const hay =
            (n.name ?? "") +
            " " +
            (n.artists ?? []).join(" ") +
            " " +
            stripHTML(n.note);
          return hay.toLowerCase().includes(q);
        })
      : hydrated;

    const sorted = [...base];
    switch (sort) {
      case "recent":
        sorted.sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
        break;
      case "oldest":
        sorted.sort(
          (a, b) =>
            new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
        );
        break;
      case "longest":
        sorted.sort(
          (a, b) => stripHTML(b.note).length - stripHTML(a.note).length
        );
        break;
      case "artist":
        sorted.sort((a, b) =>
          (a.artists?.[0] ?? "").localeCompare(b.artists?.[0] ?? "")
        );
        break;
    }
    return sorted;
  }, [hydrated, query, sort]);

  const playThis = useCallback(
    async (trackId: string) => {
      const token = session?.accessToken;
      if (!token) return;
      try {
        let deviceId: string | undefined;
        const dev = await getavailabledevices(token);
        const devices = dev?.data?.devices ?? [];
        for (const d of devices) {
          if (d?.id && !d?.is_restricted) {
            deviceId = d.id;
            break;
          }
        }
        await playtrack(trackId, token, deviceId);
      } catch (e: any) {
        if (e?.response?.status === 403) {
          alert("Device inaccessible; please change your Spotify output device.");
        } else if (e?.response?.status === 401) {
          window.location.href = "/";
        } else {
          console.error(e);
        }
      }
    },
    [session?.accessToken]
  );

  const deleteNote = useCallback(async (trackId: string) => {
    if (!confirm("Delete this note? The song stays, the words go.")) return;
    try {
      await fetch("/api/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_id: trackId, note: "" }),
      });
      setRows((prev) => (prev ? prev.filter((r) => r.track_id !== trackId) : prev));
      setOpenTrack(null);
      const cache = loadMetaCache();
      delete cache[trackId];
      saveMetaCache(cache);
    } catch (e) {
      console.error(e);
      alert("Couldn't delete. Try again.");
    }
  }, []);

  const openNote = openTrack ? meta[openTrack] : null;

  return (
    <>
      <div className="art-backdrop" aria-hidden />
      <main className="app-shell library-shell">
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
            <span className="brand-sep" aria-hidden>·</span>
            <span className="brand-sub">Library</span>
          </div>
          <div className="top-right">
            <button
              className="chip"
              onClick={() => router.push("/home")}
              title="Back to whatever's playing"
            >
              ← Now playing
            </button>
            <button
              className="chip"
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
              title="Settings"
            >
              Settings
            </button>
          </div>
        </header>

        <section className="lib-hero fade d2">
          <div className="lib-eyebrow">
            {rows === null
              ? "Loading your library…"
              : rows.length === 0
              ? "Nothing here yet"
              : `${hydrated.length} ${hydrated.length === 1 ? "note" : "notes"}`}
          </div>
          <h1 className="lib-title">
            The <em>Library.</em>
          </h1>
          <div className="lib-search-wrap">
            <svg
              className="lib-search-icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                d="M10 2a8 8 0 1 0 5.3 14.03l4.84 4.84 1.41-1.41-4.84-4.84A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z"
                fill="currentColor"
              />
            </svg>
            <input
              ref={searchRef}
              className="lib-search"
              placeholder="Search notes, artists, songs…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <kbd className="lib-kbd">⌘K</kbd>
          </div>
          {hydrated.length > 0 && (
            <div className="lib-sorts">
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <button
                  key={k}
                  className={`lib-sort ${sort === k ? "on" : ""}`}
                  onClick={() => setSort(k)}
                >
                  {SORT_LABELS[k]}
                </button>
              ))}
            </div>
          )}
        </section>

        {rows !== null && rows.length === 0 && (
          <section className="lib-empty fade d3">
            <div className="lib-empty-title">No notes yet.</div>
            <button className="chip" onClick={() => router.push("/home")}>
              Take me home
            </button>
          </section>
        )}

        {filtered.length > 0 && (
          <section className="lib-grid fade d3">
            {filtered.map((n) => {
              const plain = stripHTML(n.note);
              const snip = snippetAround(plain, query);
              return (
                <button
                  key={n.track_id}
                  className="lib-card"
                  onMouseEnter={() => setHoverArt(n.imageURL)}
                  onMouseLeave={() => setHoverArt(null)}
                  onFocus={() => setHoverArt(n.imageURL)}
                  onBlur={() => setHoverArt(null)}
                  onClick={() => setOpenTrack(n.track_id)}
                >
                  <div
                    className="lib-card-art"
                    style={{
                      backgroundImage: n.imageURL
                        ? `url("${n.imageURL}")`
                        : undefined,
                    }}
                  >
                    <div className="lib-card-shade" aria-hidden />
                    <div className="lib-card-meta">
                      <div className="lib-card-title">
                        {highlight(n.name, query)}
                      </div>
                      <div className="lib-card-artist">
                        {highlight((n.artists ?? []).join(", "), query)}
                      </div>
                    </div>
                  </div>
                  <div className="lib-card-snip">
                    {highlight(snip, query)}
                  </div>
                  <div className="lib-card-date">
                    {new Date(n.updated_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                </button>
              );
            })}
          </section>
        )}

        {rows !== null && rows.length > 0 && filtered.length === 0 && (
          <section className="lib-empty fade d3">
            <div className="lib-empty-title">No matches.</div>
            <div className="lib-empty-sub">
              Nothing for <em>&ldquo;{query}&rdquo;</em>. Try fewer words.
            </div>
          </section>
        )}
      </main>

      {openNote && (
        <div
          className="lib-drawer-overlay"
          onClick={() => setOpenTrack(null)}
          role="dialog"
          aria-modal
        >
          <div className="lib-drawer" onClick={(e) => e.stopPropagation()}>
            <button
              className="lib-drawer-close"
              onClick={() => setOpenTrack(null)}
              aria-label="Close"
            >
              ✕
            </button>
            <div className="lib-drawer-cover">
              <div
                className="lib-drawer-art"
                style={{
                  backgroundImage: openNote.imageURL
                    ? `url("${openNote.imageURL}")`
                    : undefined,
                }}
              />
            </div>
            <div className="lib-drawer-body">
              <div className="eyebrow">
                {new Date(openNote.updated_at).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
              <h2 className="lib-drawer-title">
                <a
                  href={openNote.trackURL}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "inherit" }}
                >
                  {openNote.name.split(" ").length > 1 ? (
                    <>
                      {openNote.name.split(" ").slice(0, -1).join(" ")}{" "}
                      <em>{openNote.name.split(" ").slice(-1)[0]}</em>
                    </>
                  ) : (
                    <em>{openNote.name}</em>
                  )}
                </a>
              </h2>
              <div className="byline">
                by{" "}
                {(openNote.artists ?? []).map((a, i) => (
                  <span key={i}>
                    <b>
                      <a
                        href={openNote.artistURLs?.[i] ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {a}
                      </a>
                    </b>
                    {i < openNote.artists.length - 1 ? ", " : ""}
                  </span>
                ))}
              </div>

              <div className="lib-drawer-actions">
                <button
                  className="lib-action play"
                  onClick={() => playThis(openNote.track_id)}
                >
                  ▶ Play in Spotify
                </button>
                <button
                  className="lib-action danger"
                  onClick={() => deleteNote(openNote.track_id)}
                >
                  Delete note
                </button>
              </div>

              <div
                className="lib-drawer-note notes-editor"
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(openNote.note),
                }}
              />

              {(() => {
                const stamps = Array.from(
                  openNote.note.matchAll(timestampRegexGlobal)
                ).map((m) => m[0]);
                if (stamps.length === 0) return null;
                return (
                  <div className="ts-chips" style={{ marginTop: 18 }}>
                    {stamps.map((s, i) => (
                      <TimeStamp
                        key={i}
                        trackID={openNote.track_id}
                        access_token={session?.accessToken}
                        device_id={undefined}
                        stamp={s}
                      />
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        accessToken={session?.accessToken}
      />
    </>
  );
}
