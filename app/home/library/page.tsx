"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import DOMPurify from "dompurify";
import { AuthExpiredError, playTrack } from "../../../util/apiutils";
import { spotifyLogin } from "../../../util/authutils";
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

// Server-canonical row shape (matches /api/notes/list response). All metadata
// fields are nullable for rows written by older app versions; the UI falls
// back gracefully on missing values.
type LibraryRow = {
  track_id: string;
  note: string;
  updated_at: string;
  name: string | null;
  artists: string[] | null;
  artist_urls: string[] | null;
  image_url: string | null;
  track_url: string | null;
  album_url: string | null;
};

type SortKey = "recent" | "oldest" | "longest" | "artist";

const SORT_LABELS: Record<SortKey, string> = {
  recent: "Recent",
  oldest: "Oldest",
  longest: "Longest",
  artist: "Artist A–Z",
};

function stripHTML(html: string): string {
  if (typeof window === "undefined") return html.replace(/<[^>]+>/g, " ");
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.textContent ?? "";
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(text: string, q: string) {
  if (!q) return text;
  const terms = q.trim().split(/\s+/).filter(Boolean).map(escapeRegex);
  if (terms.length === 0) return text;
  const re = new RegExp(`(${terms.join("|")})`, "ig");
  const parts = text.split(re);
  return parts.map((p, i) =>
    re.test(p) ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>
  );
}

function snippetAround(text: string, q: string, max = 180): string {
  const plain = text.replace(/\s+/g, " ").trim();
  if (!q) return plain.slice(0, max) + (plain.length > max ? "…" : "");
  const lower = plain.toLowerCase();
  const term = q.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const idx = term ? lower.indexOf(term) : -1;
  if (idx < 0) return plain.slice(0, max) + (plain.length > max ? "…" : "");
  const start = Math.max(0, idx - 40);
  const end = Math.min(plain.length, start + max);
  return (
    (start > 0 ? "…" : "") +
    plain.slice(start, end) +
    (end < plain.length ? "…" : "")
  );
}

export default function Library() {
  const { status, data: session } = useSession();
  const router = useRouter();

  const [theme, setTheme] = useState<Theme>("rose");
  const [rows, setRows] = useState<LibraryRow[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openTrack, setOpenTrack] = useState<string | null>(null);
  const [hoverArt, setHoverArt] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const sessionError = (session as { error?: string } | null)?.error;

  useEffect(() => {
    const t = loadTheme();
    setTheme(t);
    applyTheme(t);
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (sessionError === "RefreshAccessTokenError") spotifyLogin("/home/library");
  }, [sessionError]);

  // Initial page load.
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/notes/list");
        if (res.status === 401) {
          window.location.href = "/";
          return;
        }
        const json = (await res.json()) as {
          notes: LibraryRow[];
          next_cursor: string | null;
        };
        if (cancelled) return;
        setRows(json.notes);
        setNextCursor(json.next_cursor);
      } catch (err) {
        console.error("[library] list failed:", err);
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/notes/list?cursor=${encodeURIComponent(nextCursor)}`
      );
      const json = (await res.json()) as {
        notes: LibraryRow[];
        next_cursor: string | null;
      };
      setRows((prev) => (prev ? [...prev, ...json.notes] : json.notes));
      setNextCursor(json.next_cursor);
    } catch (err) {
      console.error("[library] load-more failed:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  // Backdrop tracks hovered/opened card.
  useEffect(() => {
    const img = openTrack
      ? rows?.find((r) => r.track_id === openTrack)?.image_url
      : hoverArt ?? undefined;
    if (img) {
      document.body.style.setProperty("--album-image", `url("${img}")`);
    } else {
      document.body.style.removeProperty("--album-image");
    }
  }, [hoverArt, openTrack, rows]);

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

  const filtered = useMemo(() => {
    const all = rows ?? [];
    const q = query.trim().toLowerCase();
    const base = q
      ? all.filter((n) => {
          const hay =
            (n.name ?? "") +
            " " +
            (n.artists ?? []).join(" ") +
            " " +
            stripHTML(n.note);
          return hay.toLowerCase().includes(q);
        })
      : all;

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
  }, [rows, query, sort]);

  const playThis = useCallback(async (trackId: string) => {
    try {
      await playTrack(trackId);
    } catch (err) {
      if (err instanceof AuthExpiredError) {
        spotifyLogin("/home/library");
        return;
      }
      console.error("[library] play failed:", err);
      alert("Couldn't start playback. Make sure Spotify has an active device.");
    }
  }, []);

  const deleteNote = useCallback(async (trackId: string) => {
    if (!confirm("Delete this note? The song stays, the words go.")) return;
    try {
      const res = await fetch("/api/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_id: trackId, note: "" }),
      });
      if (!res.ok) throw new Error(`delete failed: ${res.status}`);
      setRows((prev) =>
        prev ? prev.filter((r) => r.track_id !== trackId) : prev
      );
      setOpenTrack(null);
    } catch (err) {
      console.error("[library] delete failed:", err);
      alert("Couldn't delete. Try again.");
    }
  }, []);

  const openNote = openTrack
    ? rows?.find((r) => r.track_id === openTrack) ?? null
    : null;

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
                : `${rows.length}${nextCursor ? "+" : ""} ${rows.length === 1 ? "note" : "notes"}`}
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
          {rows && rows.length > 0 && (
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
                  onMouseEnter={() => setHoverArt(n.image_url)}
                  onMouseLeave={() => setHoverArt(null)}
                  onFocus={() => setHoverArt(n.image_url)}
                  onBlur={() => setHoverArt(null)}
                  onClick={() => setOpenTrack(n.track_id)}
                >
                  <div
                    className="lib-card-art"
                    style={{
                      backgroundImage: n.image_url
                        ? `url("${n.image_url}")`
                        : undefined,
                    }}
                  >
                    <div className="lib-card-shade" aria-hidden />
                    <div className="lib-card-meta">
                      <div className="lib-card-title">
                        {highlight(n.name ?? "Unknown track", query)}
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

        {nextCursor && filtered.length > 0 && (
          <div style={{ display: "flex", justifyContent: "center", padding: "24px 0 56px" }}>
            <button
              className="chip"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
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
                  backgroundImage: openNote.image_url
                    ? `url("${openNote.image_url}")`
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
                  href={openNote.track_url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "inherit" }}
                >
                  {openNote.name && openNote.name.split(" ").length > 1 ? (
                    <>
                      {openNote.name.split(" ").slice(0, -1).join(" ")}{" "}
                      <em>{openNote.name.split(" ").slice(-1)[0]}</em>
                    </>
                  ) : (
                    <em>{openNote.name ?? "Unknown track"}</em>
                  )}
                </a>
              </h2>
              <div className="byline">
                by{" "}
                {(openNote.artists ?? []).map((a, i) => (
                  <span key={i}>
                    <b>
                      <a
                        href={openNote.artist_urls?.[i] ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {a}
                      </a>
                    </b>
                    {i < (openNote.artists ?? []).length - 1 ? ", " : ""}
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
      />
    </>
  );
}
