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
  return (
    <main>
      <div className="login-div">
        <div>
          <h1>Welcome to My Song Notes! </h1>

          <button
            id="login-button"
            onClick={() => {
              spotifyLogin();
            }}
          >
            Log In With Spotify
          </button>
          <p className="text-message">
            Quick Start: Use Spotify to play songs, and the app will follow
            along!
          </p>
          <p className="text-message sent">
            Please note that full navigation features are only possible on{" "}
            <b>Spotify Premium</b> accounts.
          </p>
          <p className="text-message">
            How we use permissions:
            <ul>
              <li style={{ color: "black" }}>
                user-read-playback-state allows us to see the current song
                you&lsquo;re playing so we can display its information and so we
                can associate your notes with that song.{" "}
              </li>
              <li style={{ color: "black" }}>
                user-modify-playback-state allows you to skip, play, pause songs
                from our app.
              </li>
              <li style={{ color: "black" }}>
                user-read-email allows us to associate your email with your
                spotify account for logging into our website.
              </li>
            </ul>
          </p>
        </div>
        <p>
          {" "}
          <a href="https://raw.githubusercontent.com/codyhxyz/spotify-notes/master/PRIVACY_POLICY.md?token=GHSAT0AAAAAACHJPPBZTMECVE5WYO6FA4JUZH2MHZQ">
            {" "}
            Privacy Policy
          </a>
        </p>
        <div>
          <img id="login-artwork" src="/icon.ico" alt="" />
        </div>
      </div>
    </main>
  );
}
