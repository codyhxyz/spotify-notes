"use client";

type Props = {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
};

// Replaces the previous native confirm() prompt. Spotify's developer terms
// require user acknowledgment before we can persist anything; this modal
// presents that acknowledgment without window.confirm()'s ugly OS-default
// styling and unstyled URL.
export default function EulaModal({ open, onAccept, onDecline }: Props) {
  if (!open) return null;
  return (
    <div className="modal-overlay" role="dialog" aria-modal>
      <div
        className="modal-box settings-box"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>One quick thing</h2>
        <p>
          Spotify&apos;s developer terms ask us to surface a brief end-user
          agreement before saving any data on your behalf. Your notes stay
          private to your account; you can export or delete them any time
          from <em>Settings</em>.
        </p>
        <p style={{ marginTop: 12 }}>
          Read the full text:{" "}
          <a
            href="https://github.com/codyhxyz/spotify-notes/blob/master/EULA.md"
            target="_blank"
            rel="noreferrer"
          >
            EULA
          </a>{" "}
          ·{" "}
          <a
            href="https://github.com/codyhxyz/spotify-notes/blob/master/PRIVACY_POLICY.md"
            target="_blank"
            rel="noreferrer"
          >
            Privacy Policy
          </a>
        </p>
        <div
          className="lib-drawer-actions"
          style={{ marginTop: 18, justifyContent: "flex-end" }}
        >
          <button className="lib-action" onClick={onDecline}>
            Decline &amp; sign out
          </button>
          <button className="lib-action play" onClick={onAccept}>
            I agree
          </button>
        </div>
      </div>
    </div>
  );
}
