// login to spotify via supabase OAuth
export async function spotifyLogin(sb) {
  // check if window object is available
  if (typeof window !== undefined) {
    // set dynamic redirect URL for functionality across dev and prod environemnts
    // REDIRECT_URL should match one of Supabase 'Site URL' and 'Redirect URLs' in Auth/ URL Config
    const REDIRECT_URL = window.location.origin + "/home";

    console.log("authorizing user via supabase + spotify...");
    const { data, error } = await sb.auth.signInWithOAuth({
      provider: "spotify",
      options: {
        scopes:
          "user-read-email, user-modify-playback-state, user-read-playback-state",
        redirectTo: REDIRECT_URL,
      },
    });
    return { data, error };
  }
}

export async function spotifyLogout(sb) {
  console.log("attempting to log out user...");
  const { error } = await sb.auth.signOut();
  location.href = "/"; //send user back to login screen
  return { error };
}
