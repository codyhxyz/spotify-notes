"use client" //what does this do
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

// supabase auth tied to spotify provider auth
export default function Home() {
  const supabase = createClientComponentClient()

  async function spotifyLogin(sb) {
    console.log('authorizing user via supabase + spotify...')
    await sb.auth.signInWithOAuth({
      provider: 'spotify',
      options: {
        scopes: 'user-read-email, user-modify-playback-state, user-read-playback-state, user-read-recently-played',
        redirectTo: 'http://localhost:3000/home'
      }
    })
  }
  //redirects user to /home
  spotifyLogin(supabase)
  
  return (
    <main>
      <div> 
        Asking Spotify to log you in...
      </div>
    </main>
  )
}


