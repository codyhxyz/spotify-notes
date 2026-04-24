import axios, { AxiosResponse } from "axios";

// get track data from spotify
export async function gettrack(
  trackID: string | undefined,
  access_token: string | undefined
) {
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
export async function playtrack(
  trackID: string | undefined,
  access_token: string | undefined,
  device_id: string | undefined = undefined,
  position_ms: number = 0
) {
  console.log("about to play tracckkk w position_ms ", position_ms);
  if (!access_token) return;
  let url = "https://api.spotify.com/v1/me/player/play";
  // include preferred device in our request if there is one
  if (device_id) {
    url += `?device_id=${device_id}`;
  }
  let data_obj: any = {
    uris: [`spotify:track:${trackID}`],
  };
  data_obj.position_ms = position_ms;
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
export async function pausetrack(
  access_token: string | undefined
): Promise<AxiosResponse<any, any> | void> {
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
export async function skipPrevious(
  access_token: string | undefined
): Promise<AxiosResponse<any, any> | void> {
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
export async function skipNext(
  access_token: string | undefined
): Promise<AxiosResponse<any, any> | void> {
  if (!access_token) return;
  const url = "https://api.spotify.com/v1/me/player/next";
  const headers_obj = {
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
  };

  return axios.post(url, {}, headers_obj);
}

// gets current track being played & currently playing
export async function getplaybackstate(
  access_token: string | undefined
): Promise<AxiosResponse<any, any> | void> {
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

// get avail devices
export async function getavailabledevices(access_token: string | undefined) {
  if (!access_token) return;
  console.log("getting avail devices from spotify...");
  const DEVICES_ENDPOINT = "https://api.spotify.com/v1/me/player/devices";
  const config = {
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
  };
  return axios.get(DEVICES_ENDPOINT, config);
}

//////////////////////////////////////////////////////////////////////////////////////

// params: track object
// returns: song name, image url, and artists
export function extractTrackDataFromResponse(track: any) {
  const song_name = track.name;
  let artists = [];
  let artist_urls = [];
  for (let i = 0; i < track.artists.length; i++) {
    let curr_artist = track.artists[i].name;
    artists.push(curr_artist);
    artist_urls.push(track.artists[i].external_urls["spotify"]);
  }
  const image_url = track.album.images[0].url;
  const track_url = track.external_urls["spotify"];
  const album_url = track.album.external_urls["spotify"];
  return [song_name, image_url, track_url, album_url, artist_urls, artists];
}

// batch fetch multiple tracks. spotify max is 50 ids per call.
export async function getTracksBatch(
  trackIDs: string[],
  access_token: string | undefined
) {
  if (!access_token || trackIDs.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < trackIDs.length; i += 50) {
    chunks.push(trackIDs.slice(i, i + 50));
  }
  const headers_obj = {
    headers: { Authorization: `Bearer ${access_token}` },
  };
  const results: any[] = [];
  for (const chunk of chunks) {
    const url = `https://api.spotify.com/v1/tracks?ids=${chunk.join(",")}`;
    const resp = await axios.get(url, headers_obj);
    const tracks = resp?.data?.tracks ?? [];
    for (const t of tracks) if (t) results.push(t);
  }
  return results;
}

export function extractTrackIDFromSongURL(turl: string) {
  const reg = turl.match(/spotify.com\/track\/([a-zA-Z0-9]+)\?.*$/);
  if (reg?.[1]) {
    const tid = reg?.[1];
    console.log("found following trackID: ", tid);
    return tid;
  }
  console.log("invalid song ID in search bar");
}
