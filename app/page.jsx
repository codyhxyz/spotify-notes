"use client";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { spotifyLogin } from "../util/authutils";

// supabase auth tied to spotify provider auth
export default function Home() {
  const supabase = createClientComponentClient();

  return (
    <main>
      <div className="container">
        <h1>Welcome to My Spotify Notes!</h1>

        <button
          id="login-button"
          onClick={() => {
            spotifyLogin(supabase);
          }}
        >
          Log In With Spotify
        </button>
      </div>
    </main>
  );
}
