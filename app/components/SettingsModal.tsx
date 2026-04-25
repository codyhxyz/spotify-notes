"use client";
import { useState } from "react";
import { spotifyLogout } from "../../util/authutils";

type Props = {
  open: boolean;
  onClose: () => void;
};

type ListResponse = {
  notes: Array<{
    track_id: string;
    note: string;
    updated_at: string;
    name: string | null;
    artists: string[] | null;
    track_url: string | null;
  }>;
  next_cursor: string | null;
};

function stripHTML(html: string): string {
  if (typeof window === "undefined") return html.replace(/<[^>]+>/g, " ");
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.textContent ?? "";
}

// Walk the cursor on /api/notes/list to get every note, page by page.
async function fetchAllNotes(): Promise<ListResponse["notes"]> {
  const all: ListResponse["notes"] = [];
  let cursor: string | null = null;
  // Cap iterations defensively in case a server bug returns an infinite cursor.
  for (let i = 0; i < 1000; i++) {
    const url = cursor
      ? `/api/notes/list?cursor=${encodeURIComponent(cursor)}&limit=200`
      : "/api/notes/list?limit=200";
    const res = await fetch(url);
    if (!res.ok) throw new Error(`list failed: ${res.status}`);
    const json = (await res.json()) as ListResponse;
    all.push(...json.notes);
    if (!json.next_cursor) return all;
    cursor = json.next_cursor;
  }
  return all;
}

export default function SettingsModal({ open, onClose }: Props) {
  const [busy, setBusy] = useState<null | "export" | "erase">(null);

  if (!open) return null;

  async function exportNotes() {
    setBusy("export");
    try {
      const rows = await fetchAllNotes();
      const payload = {
        exported_at: new Date().toISOString(),
        count: rows.length,
        notes: rows.map((r) => ({
          track_id: r.track_id,
          track_name: r.name,
          artists: r.artists ?? [],
          spotify_url: r.track_url,
          note_html: r.note,
          note_text: stripHTML(r.note),
          updated_at: r.updated_at,
        })),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `song-notes-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[settings] export failed:", err);
      alert("Export failed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function eraseAll() {
    if (!confirm("Delete every note you've ever saved? This can't be undone."))
      return;
    if (!confirm("Really sure? Last chance.")) return;
    setBusy("erase");
    try {
      const res = await fetch("/api/notes", { method: "DELETE" });
      if (!res.ok) throw new Error(`delete failed: ${res.status}`);
      alert("Removed all notes.");
      await spotifyLogout("/");
    } catch (err) {
      console.error("[settings] erase failed:", err);
      alert("Couldn't erase. Refresh and try again.");
      setBusy(null);
    }
  }

  function logOut() {
    spotifyLogout("/");
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box settings-box"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h2>Settings</h2>

        <div className="settings-row">
          <div className="settings-row-text">
            <div className="settings-row-title">Export notes</div>
            <div className="settings-row-sub">
              Download every note as JSON — track name, artists, Spotify link,
              and your words.
            </div>
          </div>
          <button
            className="lib-action play"
            onClick={exportNotes}
            disabled={busy !== null}
          >
            {busy === "export" ? "Exporting…" : "Export JSON"}
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-row-text">
            <div className="settings-row-title">Log out</div>
            <div className="settings-row-sub">
              Sign out of Spotify and return to the start screen.
            </div>
          </div>
          <button
            className="lib-action"
            onClick={logOut}
            disabled={busy !== null}
          >
            Log out
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-row-text">
            <div className="settings-row-title danger">Erase all notes</div>
            <div className="settings-row-sub">
              Permanently delete every note on your account. There is no undo.
            </div>
          </div>
          <button
            className="lib-action danger"
            onClick={eraseAll}
            disabled={busy !== null}
          >
            {busy === "erase" ? "Erasing…" : "Erase all"}
          </button>
        </div>
      </div>
    </div>
  );
}
