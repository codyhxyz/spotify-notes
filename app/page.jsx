"use client";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useEffect } from "react";

// supabase auth tied to spotify provider auth
export default function Home() {
  const supabase = createClientComponentClient();

  console.log("authorizing user via supabase + spotify...");
  async function spotifyLogin() {
    // check if window object is available
    if (typeof window !== undefined) {
      // set dynamic redirect URL for functionality across dev and prod environemnts
      // REDIRECT_URL should match one of Supabase 'Site URL' and 'Redirect URLs' in Auth/ URL Config
      const REDIRECT_URL = window.location.origin;

      console.log("authorizing user via supabase + spotify...");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "spotify",
        options: {
          scopes:
            "user-read-email, user-modify-playback-state, user-read-playback-state, user-read-recently-played",
          redirectTo: REDIRECT_URL,
        },
      });
    }
  }

  // useEffect ensures that spotifyLogin() is only called client-side
  useEffect(() => {
    spotifyLogin();
  }, []);

  return (
    <main>
      <div>Asking Spotify to log you in...</div>
    </main>
  );
}
