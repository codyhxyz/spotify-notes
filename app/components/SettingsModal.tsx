"use client";
import { useState } from "react";
import { spotifyLogout } from "../../util/authutils";
import { getTracksBatch } from "../../util/apiutils";

type Props = {
  open: boolean;
  onClose: () => void;
  accessToken: string | undefined;
};

function stripHTML(html: string) {
  if (typeof window === "undefined") return html.replace(/<[^>]+>/g, " ");
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.textContent ?? "";
}

export default function SettingsModal({ open, onClose, accessToken }: Props) {
  const [busy, setBusy] = useState<null | "export" | "erase">(null);

  if (!open) return null;

  async function exportNotes() {
    setBusy("export");
    try {
      const res = await fetch("/api/notes/list");
      if (!res.ok) throw new Error(`list failed: ${res.status}`);
      const json = await res.json();
      const rows: Array<{ track_id: string; note: string; updated_at: string }> =
        json?.notes ?? [];

      let tracks: any[] = [];
      if (accessToken && rows.length > 0) {
        try {
          tracks = await getTracksBatch(rows.map((r) => r.track_id), accessToken);
        } catch (e) {
          console.warn("hydrate failed, exporting without metadata", e);
        }
      }
      const byId = new Map<string, any>(tracks.map((t) => [t.id, t]));

      const payload = {
        exported_at: new Date().toISOString(),
        count: rows.length,
        notes: rows.map((r) => {
          const t = byId.get(r.track_id);
          return {
            track_id: r.track_id,
            track_name: t?.name ?? null,
            artists: (t?.artists ?? []).map((a: any) => a.name),
            spotify_url: t?.external_urls?.spotify ?? null,
            note_html: r.note,
            note_text: stripHTML(r.note),
            updated_at: r.updated_at,
          };
        }),
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `song-notes-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Export failed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function eraseAll() {
    if (!confirm("Delete every note you've ever saved? This can't be undone.")) return;
    if (!confirm("Really sure? Last chance.")) return;
    setBusy("erase");
    try {
      const res = await fetch("/api/notes", { method: "DELETE" });
      if (!res.ok) throw new Error(`delete failed: ${res.status}`);
      alert("Removed all notes.");
      spotifyLogout();
      window.location.href = "/";
    } catch (e) {
      console.error(e);
      alert("Couldn't erase. Refresh and try again.");
      setBusy(null);
    }
  }

  function logOut() {
    spotifyLogout();
    window.location.href = "/";
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box settings-box" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        <h2>Settings</h2>

        <div className="settings-row">
          <div className="settings-row-text">
            <div className="settings-row-title">Export notes</div>
            <div className="settings-row-sub">
              Download every note as JSON — track name, artists, Spotify link, and your words.
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
          <button className="lib-action" onClick={logOut} disabled={busy !== null}>
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
