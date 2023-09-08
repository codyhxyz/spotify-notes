"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  gettrack,
  playtrack,
  pausetrack,
  getplaybackstate,
  getavailabledevices,
  skipPrevious,
  skipNext,
  extractTrackDataFromResponse,
  extractTrackIDFromSongURL,
} from "../../util/apiutils";
import { spotifyLogout } from "../../util/authutils";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import {
  SkipBackwardIcon,
  SkipForwardIcon,
  PlayIcon,
  PauseIcon,
  TimeStamp,
} from "../../util/components";
import { timestampRegexGlobal } from "@/util/miscutils";
import { useDebouncedCallback } from "use-debounce";
import DOMPurify from "dompurify";
import { AxiosResponse } from "axios";

export default function Home() {
  const supabase = createClientComponentClient();
  const [acceptedEULA, setAcceptedEULA] = useState<boolean>(false);
  const [searchText, setSearchText] = useState<string>(""); //change only on search by URL, not search by ID
  const [songName, setSongName] = useState<string>("");
  const [artists, setArtists] = useState<string[]>([]);
  const [trackURL, setTrackURL] = useState<string>("");
  const [imageURL, setImageURL] = useState<string>("");
  const [albumURL, setAlbumURL] = useState<string>("");
  const [artistURLs, setArtistURLs] = useState<string>("");
  const [loadingNote, setLoadingNote] = useState<boolean>(false);
  const [foundActiveDevice, setFoundActiveDevice] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false); //tracks whether user is playing music from spotify
  const accessToken = useRef<string>();
  const userID = useRef<string | undefined>(undefined);
  const [trackID, setTrackID] = useState<string | undefined>("");
  const currNote = useRef<string>("");
  const userIsTyping = useRef<boolean>(false); //lock the song view for X sec after user last types

  // makes button clicks appear responsive by setting buttons to grey immediately until a response has been received
  const [awaitingPlayAPIResponse, setAwaitingPlayAPIResponse] =
    useState<boolean>(false);
  const [awaitingLSkipAPIResponse, setAwaitingLSkipAPIResponse] =
    useState<boolean>(false);
  const [awaitingRSkipAPIResponse, setAwaitingRSkipAPIResponse] =
    useState<boolean>(false);
  const playButtonColor = awaitingPlayAPIResponse ? "grey" : "white";
  const lSkipButtonColor = awaitingLSkipAPIResponse ? "grey" : "white";
  const rSkipButtonColor = awaitingRSkipAPIResponse ? "grey" : "white";
  const [timestamps, setTimeStamps] = useState<Array<string>>([]);

  //get & store supabase and spotify session data
  useEffect(() => {
    // async function so we can use await
    async function getSession() {
      // get current supabase session
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.provider_token;
      // if no provider token was found, we need to reauthenticate the user
      if (!token) {
        console.log("no provider token found, reauthenticating user...");
        reauthenticateUser();
        return;
      }
      accessToken.current = token; //store spotify access token
      userID.current = data?.session?.user?.id; //store supabase user ID
      console.log("saving the following token: ", accessToken.current);
      confirmEULA();
    }
    getSession();
  }, [supabase.auth]);

  async function confirmEULA() {
    let accepted = false;
    try {
      // check for prior EULA acceptance
      let { data, error, status } = await supabase
        .from("users")
        .select("accepted_eula")
        .eq("user_id", userID.current);
      if (data && data[0]?.accepted_eula) {
        setAcceptedEULA(true);
      } else {
        // prompt w EULA
        if (
          confirm(
            "Spotify would like me to ask you whether you agree to our EULA in order to use our service:"
          )
        ) {
          try {
            // only ask for EULA confirmation once
            const { data, error } = await supabase
              .from("users")
              .upsert({ user_id: userID.current, accepted_eula: true })
              .select();
            setAcceptedEULA(true);
          } catch (error) {
            console.log(error);
          }
        } else {
          alert(
            "In compliance with Spotify's policies, our app's functionality will be unavailable until the EULA is accepted."
          );
          spotifyLogout(supabase);
        }
      }
    } catch (error) {
      console.log("hi there, we got an error. Heres the error below : ");
      console.log(error);
    }
  }

  const debouncedSave = useDebouncedCallback((uid, tid, note) => {
    saveNote({ user_id: uid, track_id: tid, note: note });
  }, 500);

  // reset userIsTyping state when user hasnt pressed a key for 0.5s
  const setTypingFalseDebounced = useDebouncedCallback(() => {
    userIsTyping.current = false;
  }, 500);

  // force user back to login screen to refresh spotify token
  function reauthenticateUser() {
    window.location.href = "/";
  }

  // set play button state using API response (which could be malformed)
  function updateIsPlayingIfNecessary(response: AxiosResponse | null) {
    // if (awaitingPlayAPIResponse) return; // enable 'optimistic UI'
    if (response?.data?.is_playing) {
      if (response.status == 204) {
        // console.log("setting isplaying false");
        setIsPlaying(false);
      } else {
        // console.log("setting isplaying to: ", response.data.is_playing);
        setIsPlaying(response.data.is_playing);
      }
    } else {
      // console.log("setting isplaying to false. response is : ", response);
      setIsPlaying(false);
    }
  }

  // update foundActiveDevice state with response from getplaybackstate API call
  function updateActiveDevice(response: AxiosResponse) {
    setFoundActiveDevice(response?.data?.device?.id);
  }

  // extracts currently playing trackID from response (could be nullish)
  function extractTrackIDFromResponse(response: AxiosResponse) {
    return response?.data?.item?.id; //could be nullish
  }

  // makes Playback State API call & uses it to:
  // 1) update isPlaying state if necessary
  // 2) update foundActiveDevice state
  // 2) update trackID and load track if necessary
  // deps: [trackID, searchText]
  const loadPlaybackState = useCallback(async () => {
    try {
      // getplaybackstate's response has three bits of info we want:
      // isPlaying: response.data.is_playing
      // trackID: response.data.item.id
      // foundActiveDevice: response.data.device
      const response: any = await getplaybackstate(accessToken.current);
      updateIsPlayingIfNecessary(response); //takes a playback state api response and updates the player UI accordingly
      updateActiveDevice(response);

      // only update view of current song when user is not actively typing
      if (!userIsTyping.current) {
        // if search box empty, load currently playing track as our note
        if (!searchText) {
          const responseTrackID = extractTrackIDFromResponse(response);
          // update trackID if different from api response
          if (responseTrackID && responseTrackID !== trackID) {
            setTrackID(responseTrackID); //causes re-render with new track data
          }
        }
      }
    } catch (error: any) {
      if (error?.response?.status == 401) reauthenticateUser();
      updateIsPlayingIfNecessary(null);
    }
  }, [trackID, searchText]); //wrapping in usecallback prevents stale closure

  //listen to changes in trackId state and pull track data + update screen
  //deps: [trackID]
  useEffect(() => {
    //updates state of the app like track name
    console.log(
      "calling loadTrackDatFromID() from useeffect since trackID changed"
    );
    loadTrackDataFromID();
  }, [trackID]);

  //constructor
  //deps: []
  useEffect(() => {
    const interval = setInterval(() => {
      loadPlaybackState();
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [loadPlaybackState]);

  // loads the song from the pasted URL
  // deps=[] since searchText passed as param
  const debouncedSearch = useDebouncedCallback(
    // only gets called 500ms after last keypress in searchbox
    (searchText) => {
      const tid = extractTrackIDFromSongURL(searchText);
      setTrackID(tid); //triggers loading of track onto display
    },
    500
  );

  // use searchbox for search
  useEffect(() => {
    // search 500ms after last keystroke
    debouncedSearch(searchText);
    // Clear the interval on unmount
  }, [searchText, debouncedSearch]);

  // get note from DB upon successful track search
  async function fetchNote(tid: any) {
    // code to load note into currNote
    // note: should i have this code in a useCallback func as the example has it?
    //   but then how would i make SURE it happens AFTER the user loads a new song,
    //   and BEFORE they start typing in a new note?
    let note = "";
    try {
      setLoadingNote(true);
      let { data, error, status } = await supabase
        .from("notes")
        .select("track_id, note")
        .eq("user_id", userID.current) //only load my own notes
        .eq("track_id", tid) //only load the right song's notes
        .single(); //turns from array to single object
      console.log("using this trackID in our database pull", tid);
      // import user's data onto screen
      if (data) {
        console.log("successfully got note from database, it is: ", data.note);
        note = data.note; //got note, func returns this value
      }
    } catch (error) {
      console.log("hi there, we got an error. Heres the error below : ");
      console.log(error);
    } finally {
      setLoadingNote(false);
      return note;
    }
  }

  function clearSongAndNoteViewStates() {
    setArtists([]);
    setTrackURL("");
    setSongName("");
    setImageURL("");
    setAlbumURL("");
    setArtistURLs("");
    currNote.current = "";
  }

  function setSongAndNoteViewStates(
    song_name: any,
    image_url: any,
    track_url: any,
    artists: any,
    note: any,
    album_url: any,
    artist_urls: any
  ) {
    console.log("setting view state to this note: ", note);
    setArtists(artists);
    setTrackURL(track_url);
    setSongName(song_name);
    setImageURL(image_url);
    setAlbumURL(album_url);
    setArtistURLs(artist_urls);
    currNote.current = note;
  }

  // fetch song from spotify by ID
  // and load user notes for that song from our database
  // this func is triggered by a useEffect() with deps[trackID]
  const loadTrackDataFromID = async () => {
    if (!accessToken.current || !trackID) return;

    const tid = trackID; //trackID assumed to be current
    console.log("trackID which should be current is ", trackID);
    clearSongAndNoteViewStates();
    try {
      const response = await gettrack(tid, accessToken.current);
      const track_data = response?.data;
      const [song_name, image_url, track_url, album_url, artist_urls, artists] =
        extractTrackDataFromResponse(track_data);
      const note = await fetchNote(tid); //get user notes
      extractTimestamps(note); //extract timestamps on note load
      console.log("calling setsongandnoteviewstates from loadTrackDataFromID");

      setSongAndNoteViewStates(
        song_name,
        image_url,
        track_url,
        artists,
        note,
        album_url,
        artist_urls
      ); //update display
    } catch (error: any) {
      console.log("error: failed to get track ", tid);
      console.log(error);
      if (error?.response?.status == 401) {
        reauthenticateUser();
      }
    }
  };

  // extract timestamps from text
  // triggers re-render by changing timestamps useState
  function extractTimestamps(note: string) {
    setTimeStamps([]); //reset timestamp list
    const matches = note.matchAll(timestampRegexGlobal); //find all timestamps in text
    for (const match of matches) {
      setTimeStamps((prev) => [...prev, match[0]]); //store timestamps in state
    }
  }

  async function handlePlayButtonClick() {
    try {
      setAwaitingPlayAPIResponse(true);

      // if no device is active, Spotify rejects any requests to play tracks,
      // so we populate our play request with the first available device we can find.
      let deviceIDToUse = undefined;
      if (!foundActiveDevice) {
        const response = await getavailabledevices(accessToken.current);
        const devices = response?.data?.devices;
        if (devices && devices.length > 0) {
          for (let i = 0; i < devices.length; i++) {
            // gets the first non-restricted device
            if (devices[i]?.id && !devices[i]?.is_restricted) {
              deviceIDToUse = devices[i].id;
              console.log("switching to device ID ", deviceIDToUse);
            }
          }
        }
      }

      await playtrack(trackID, accessToken.current, deviceIDToUse);

      // enable optimistic play button view updating
      setAwaitingPlayAPIResponse(false);
    } catch (error: any) {
      if (error?.response?.status == 403) {
        alert("Device inaccessible; please change your Spotify output device.");
      }
      console.log("error playing track");
      console.log(error);
    } finally {
      setAwaitingPlayAPIResponse(false); //default
    }
  }

  async function handlePauseButtonClick() {
    try {
      // enable optimistic play button view updating
      setAwaitingPlayAPIResponse(true);

      await pausetrack(accessToken.current);

      // enable optimistic play button view updating
      setAwaitingPlayAPIResponse(false);
    } catch (error) {
      console.log("error pausing track (see below):");
      console.log(error);
    } finally {
      setAwaitingPlayAPIResponse(false); //default
    }
  }

  async function handlePrevButtonClick() {
    try {
      setAwaitingLSkipAPIResponse(true);
      await skipPrevious(accessToken.current);
      setAwaitingLSkipAPIResponse(false);
      await loadPlaybackState(); //make extra function call to see song w less latency
      console.log(
        "returned back from my await! yiu should see a song on next refresh!"
      );
    } catch (error) {
      console.log("error backing track (see below):");
      console.log(error);
    } finally {
      setAwaitingLSkipAPIResponse(false); //default
    }
  }

  async function handleNextButtonClick() {
    try {
      setAwaitingRSkipAPIResponse(true);
      await skipNext(accessToken.current);
      setAwaitingRSkipAPIResponse(false);
      await loadPlaybackState(); //make extra function call to see song w less latency
      console.log(
        "returned back from my await! yiu should see a song on next refresh!"
      );
    } catch (error) {
      console.log("error forwarding track (see below):");
      console.log(error);
    } finally {
      setAwaitingRSkipAPIResponse(false); //default
    }
  }

  async function saveNote({
    user_id: uid,
    track_id: track_id,
    note: note,
  }: any): Promise<void> {
    try {
      console.log("called save func :)");
      let { error } = await supabase.from("notes").upsert(
        {
          user_id: uid,
          track_id: track_id,
          note: note,
        },
        { ignoreDuplicates: false }
      ); //allow notes to be updated
      if (error) throw error;
      // alert('Note saved!')
      // TODO make a less intrusive way to display that note has been saved successfully
      // eg, flash the note border Forest Green for a few seconds after last save.
    } catch (error) {
      console.log(error);
      console.log("just logged an error ^");
      alert(
        "Error saving note! Please copy your note, save it somewhere else, and refresh."
      );
    }
  }

  async function handleNoteBoxKeypress(note: any) {
    currNote.current = note;
    userIsTyping.current = true;
    setTypingFalseDebounced(); //reset the userIsTyping state a little while after last keypress
    debouncedSave(userID.current, trackID, note); //save note
  }

  // delete all data from this user off of supabase
  async function deleteUserData(uid: string | undefined) {
    let { error } = await supabase.from("notes").delete().eq("user_id", uid);
    if (error) {
      alert(
        "There was an error while deleting your data. Please refresh the page and try again."
      );
      console.log("about to log error");
      console.log(error);
      throw error;
    }
  }

  console.log("timestamps is: ", timestamps);

  return (
    <main>
      <div>
        <div className="searchbar">
          <input
            type="text"
            id="searchText"
            onChange={(e) => {
              setSearchText(e.target.value);
            }}
            placeholder="Enter Spotify track URL..."
          />
          <div>
            <button
              id="logout-button"
              onClick={() => {
                spotifyLogout(supabase);
                window.location.href = "/";
              }}
            >
              Log out
            </button>
            <button
              id="nuke-button"
              onClick={() => {
                if (
                  confirm("Are you sure you want to delete all your notes?")
                ) {
                  if (
                    confirm(
                      "Are you like super duper sure and not pressing this on accident?"
                    )
                  ) {
                    deleteUserData(userID.current);
                    alert("Successfully removed all user data.");
                  }
                }
                spotifyLogout(supabase);
                window.location.href = "/";
              }}
            >
              Delete My Notes
            </button>{" "}
          </div>
        </div>

        {/* <button type="button" onClick={extractTrackIDFromSongURL}>Search</button>
        </div>


        {/* conditional rendering */}
        {userID.current &&
        songName &&
        artists &&
        imageURL &&
        !loadingNote &&
        acceptedEULA ? (
          <>
            <div>
              <h2 id="song-artist-names">
                {/* TODO add artist URLs; make it render a list and add each url dynamically */}
                <a href={trackURL}>{songName}</a> by{" "}
                {artists.map((artist, index) => (
                  <span key={index}>
                    <a href={artistURLs[index]}>{artist}</a>
                    {index < artists.length - 1 ? ", " : ""}
                  </span>
                ))}
                <a href={trackURL}>
                  <img
                    src="/Spotify_Icon_RGB_White.png"
                    style={{ width: "70px" }}
                  />
                </a>
              </h2>
            </div>
            <div className="music-player">
              <button
                className="media-button"
                style={{ backgroundColor: lSkipButtonColor }}
                onClick={() => {
                  handlePrevButtonClick();
                }}
              >
                <SkipBackwardIcon />
              </button>

              <button
                className="media-button"
                style={{ backgroundColor: playButtonColor }}
                onClick={() => {
                  isPlaying
                    ? handlePauseButtonClick()
                    : handlePlayButtonClick();
                }}
              >
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </button>

              <button
                className="media-button"
                style={{ backgroundColor: rSkipButtonColor }}
                onClick={() => {
                  handleNextButtonClick();
                }}
              >
                <SkipForwardIcon />
              </button>
            </div>
            <div className="timestamp-buttons">
              {timestamps.map((timestamp, index) => (
                <TimeStamp
                  key={index}
                  trackID={trackID}
                  access_token={accessToken.current}
                  device_id={undefined}
                  stamp={timestamp}
                />
              ))}
              {/* only show timestamp refresh button if >0 timestamps */}
              {timestamps ? (
                <button
                  onClick={() => {
                    extractTimestamps(currNote.current);
                  }}
                  title="Check for any timestamps user has typed since note load"
                >
                  🔃
                </button>
              ) : (
                <></>
              )}
            </div>

            <div id="art-and-notes">
              {/* left side */}
              <div id="albumart">
                <a href={albumURL}>
                  <img
                    alt="track cover art"
                    src={imageURL}
                    id="albumart-display"
                  />{" "}
                </a>
              </div>
              {/* right side */}
              <div id="notes-display">
                <div
                  id="notes"
                  contentEditable="true"
                  placeholder-text="Enter your notes here..."
                  onInput={(e: any) => {
                    handleNoteBoxKeypress(e.target.innerHTML);
                  }}
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(currNote.current),
                  }}
                />
              </div>
            </div>
          </>
        ) : (
          <>~try playing a song on Spotify~</>
        )}
      </div>
    </main>
  );
}
