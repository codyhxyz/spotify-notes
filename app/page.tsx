"use client";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { spotifyLogin } from "../util/authutils";
import Image from "next/image";

// supabase auth tied to spotify provider auth
export default function Home() {
  const supabase = createClientComponentClient();

  return (
    <main>
      <div className="login-div">
        <div>
          <h1>Welcome to My Spotify Notes! </h1>

          <button
            id="login-button"
            onClick={() => {
              spotifyLogin(supabase);
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
            And this app is still in pre-alpha--we could lose your data!
          </p>
        </div>
        <div>
          <img id="login-artwork" src="/icon.ico" alt="" />
        </div>
      </div>
    </main>
  );
}
