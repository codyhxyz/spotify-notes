"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { spotifyLogin } from "../util/authutils";
import {
  Theme,
  THEME_LABELS,
  applyTheme,
  loadTheme,
  nextTheme,
  saveTheme,
} from "../util/theme";

const legalTickerText = "Legally I am not allowed to call this “Spotify Notes”.";

function LegalTickerGroup() {
  return (
    <div className="legal-ticker__group">
      {Array.from({ length: 4 }).map((_, index) => (
        <span key={index}>{legalTickerText}</span>
      ))}
    </div>
  );
}

export default function Home() {
  const { status } = useSession();
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>("rose");
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") router.replace("/home");
  }, [status, router]);

  // Pull the persisted theme on mount so the orb's title/aria reflect it.
  // Providers.tsx already calls applyTheme on mount; this is just for UI.
  useEffect(() => {
    setTheme(loadTheme());
  }, []);

  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get("error");
    if (!error) return;
    setAuthError(
      error === "OAuthCallbackError"
        ? "Spotify sign-in failed before it returned an auth code. Try once more; if it repeats, the exact Spotify callback error is now in production logs."
        : `Sign-in failed (${error}). Try once more.`
    );
  }, []);

  function cycleTheme() {
    const t = nextTheme(theme);
    setTheme(t);
    applyTheme(t);
    saveTheme(t);
  }

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      document.body.style.setProperty("--mx", `${(e.clientX / window.innerWidth) * 100}%`);
      document.body.style.setProperty("--my", `${(e.clientY / window.innerHeight) * 100}%`);
    };
    document.addEventListener("pointermove", onMove);
    return () => document.removeEventListener("pointermove", onMove);
  }, []);

  return (
    <main className="login-shell">
      <section className="login-hero fade">
        <div className="legal-ticker" aria-label={legalTickerText}>
          <div className="legal-ticker__track" aria-hidden="true">
            <LegalTickerGroup />
            <LegalTickerGroup />
          </div>
        </div>
        <h1>
          My Song <em>Notes</em>
          <button
            type="button"
            className="title-orb"
            onClick={cycleTheme}
            title={`Theme: ${THEME_LABELS[theme]} · click to change`}
            aria-label={`Change theme (current: ${THEME_LABELS[theme]})`}
          />
        </h1>
        <button className="login-button" onClick={() => spotifyLogin()}>
          <span className="spotify-mark">♪</span>
          Continue with Spotify
        </button>
        {authError ? (
          <p className="login-error" role="alert">
            {authError}
          </p>
        ) : null}
      </section>

      <aside className="login-panel fade d2">
        <h2>Permissions · What we read</h2>
        <div className="perms">
          <div className="row">
            <code>read‑playback</code>
            <p>So we can follow along with whatever&apos;s playing and pair notes to the right track.</p>
          </div>
          <div className="row">
            <code>modify‑playback</code>
            <p>So the play / pause / skip controls and clickable timestamps actually move Spotify.</p>
          </div>
          <div className="row">
            <code>read‑email</code>
            <p>Used as your account identifier. Nothing is sent anywhere else.</p>
          </div>
        </div>
        <p className="note">
          Full playback controls require <b>Spotify Premium</b>. Notes still save for free accounts.{" "}
          <a
            href="https://raw.githubusercontent.com/codyhxyz/spotify-notes/master/PRIVACY_POLICY.md"
            target="_blank"
            rel="noreferrer"
          >
            Privacy policy
          </a>
        </p>
      </aside>

      <div className="login-footer fade d3">
        <a href="https://github.com/codyhxyz/spotify-notes" target="_blank" rel="noreferrer">source code</a>
        <a href="https://codyh.xyz" target="_blank" rel="noreferrer">home-grown by codyh</a>
      </div>
    </main>
  );
}
