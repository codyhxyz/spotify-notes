"use client";
import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { spotifyLogin } from "../util/authutils";

export default function Home() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.replace("/home");
  }, [status, router]);

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
        <div className="kicker">— A private journal for the songs you&apos;re listening to</div>
        <h1>
          My Song <em>Notes</em>
          <span className="title-orb" aria-hidden />
        </h1>
        <p className="lede">
          Legally I am not allowed to call this &ldquo;Spotify Notes&rdquo;.
        </p>
        <button className="login-button" onClick={() => spotifyLogin()}>
          <span className="spotify-mark">♪</span>
          Continue with Spotify
        </button>
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
        <a href="https://codyh.xyz" target="_blank" rel="noreferrer">built by codyh</a>
      </div>
    </main>
  );
}
