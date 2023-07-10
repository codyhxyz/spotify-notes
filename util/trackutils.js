import axios from "axios";

// get track data from spotify
export async function gettrack(trackID, access_token) {
  if (!access_token) return;
  // console.log('getting track...')
  const TRACK_ENDPOINT = "https://api.spotify.com/v1/tracks/";
  const track_req = TRACK_ENDPOINT + trackID;
  const headers_obj = {
    headers: {
      Authorization: `Bearer ` + access_token,
    },
  };

  return axios.get(track_req, headers_obj);
}

// plays track upon clicking the play button, or clicking on a timestamp
export async function playtrack(trackID, access_token, position_ms = 0) {
  console.log("about to play tracckkk");
  if (!access_token) return;
  const url = "https://api.spotify.com/v1/me/player/play";
  const data_obj = {
    uris: [`spotify:track:${trackID}`],
    position_ms: position_ms,
  };
  const headers_obj = {
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
    },
  };
  // console.log('trying to play track ID: ' + trackID)

  return axios.put(url, data_obj, headers_obj);
}

// pauses whatever track is currently playing on Spotify
export async function pausetrack(access_token) {
  if (!access_token) return;
  // console.log('asking Spotify to pause track...')
  const PAUSE_ENDPOINT = "https://api.spotify.com/v1/me/player/pause";
  const headers_obj = {
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
  };

  return axios.put(PAUSE_ENDPOINT, {}, headers_obj);
}

// skip to previous track
export async function skipPrevious(access_token) {
  if (!access_token) return;
  const url = "https://api.spotify.com/v1/me/player/previous";
  const headers_obj = {
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
  };

  return axios.post(url, {}, headers_obj);
}

// pauses whatever track is currently playing on Spotify
export async function skipNext(access_token) {
  if (!access_token) return;
  const url = "https://api.spotify.com/v1/me/player/next";
  const headers_obj = {
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
  };

  return axios.post(url, {}, headers_obj);
}

// pauses whatever track is currently playing on Spotify
export async function getplaybackstate(access_token) {
  if (!access_token) return;
  // console.log('getting playback state from spotify...')
  const PLAYER_ENDPOINT = "https://api.spotify.com/v1/me/player";
  const headers_obj = {
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
  };

  return axios.get(PLAYER_ENDPOINT, headers_obj);
}

// get most recently played track
export async function getrecentlyplayed(access_token, num_needed = 1) {
  if (!access_token) return;
  // console.log('getting recently played from spotify...')
  const RECENT_ENDPOINT =
    "https://api.spotify.com/v1/me/player/recently-played";
  const config = {
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
    data: {
      limit: num_needed,
    },
  };

  return axios.get(RECENT_ENDPOINT, config);
}
