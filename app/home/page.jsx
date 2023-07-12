"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  gettrack,
  playtrack,
  pausetrack,
  getplaybackstate,
  getrecentlyplayed,
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
} from "../../util/components";

import { debounce } from "lodash";
import DOMPurify from "dompurify";

export default function Home() {
  const supabase = createClientComponentClient();
  const [trackURL, setTrackURL] = useState(""); //change only on search by URL, not search by ID
  const [songName, setSongName] = useState("");
  const [artist, setArtist] = useState("");
  const [imageURL, setImageURL] = useState("");
  const [loadingNote, setLoadingNote] = useState("");
  const [foundActiveDevice, setFoundActiveDevice] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false); //tracks whether user is playing music from spotify
  const accessToken = useRef(null);
  const userID = useRef(null);
  const [trackID, setTrackID] = useState("");
  const currNote = useRef("");

  // makes button clicks appear responsive by setting buttons to grey immediately until a response has been received
  const [awaitingPlayAPIResponse, setAwaitingPlayAPIResponse] = useState(false);
  const [awaitingLSkipAPIResponse, setAwaitingLSkipAPIResponse] =
    useState(false);
  const [awaitingRSkipAPIResponse, setAwaitingRSkipAPIResponse] =
    useState(false);
  const playButtonColor = awaitingPlayAPIResponse ? "grey" : "white";
  const lSkipButtonColor = awaitingLSkipAPIResponse ? "grey" : "white";
  const rSkipButtonColor = awaitingRSkipAPIResponse ? "grey" : "white";

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
      }
      accessToken.current = token; //store spotify access token
      userID.current = data.session.user.id; //store supabase user ID
      console.log("saving the following token: ", accessToken.current);
    }
    getSession();
  }, [supabase.auth]);

  // func uses useCallback so debounce isn't reset
  const debouncedSave = useCallback(
    debounce((uid, tid, note) => {
      saveNote({ user_id: uid, track_id: tid, note: note });
    }, 500),
    []
  );

  // force user back to login screen to refresh spotify token
  function reauthenticateUser() {
    window.location.href = "/";
  }

  // set play button state using API response (which could be malformed)
  function updateIsPlayingIfNecessary(response) {
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
  function updateActiveDevice(response) {
    setFoundActiveDevice(response?.data?.device?.id);
  }

  // extracts currently playing trackID from response (could be nullish)
  function extractTrackIDFromResponse(response) {
    return response?.data?.item?.id; //could be nullish
  }

  // makes Playback State API call & uses it to:
  // 1) update isPlaying state if necessary
  // 2) update foundActiveDevice state
  // 2) update trackID and load track if necessary
  const loadPlaybackState = useCallback(async () => {
    try {
      // getplaybackstate's response has three bits of info we want:
      // isPlaying: response.data.is_playing
      // trackID: response.data.item.id
      // foundActiveDevice: response.data.device
      const response = await getplaybackstate(accessToken.current);
      updateIsPlayingIfNecessary(response); //takes a playback state api response and updates the player UI accordingly
      updateActiveDevice(response);

      // if search box empty, load currently playing track as our note
      const responseTrackID = extractTrackIDFromResponse(response);
      if (!trackURL) {
        if (responseTrackID && responseTrackID !== trackID) {
          // display currently playing track
          setTrackID(responseTrackID);
        }
      }
    } catch (error) {
      if (error?.response?.status == 401) reauthenticateUser();
      updateIsPlayingIfNecessary(null);
    }
  }, [artist, songName, trackID, trackURL]); //wrapping in usecallback prevents stale closure

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
  // deps=[] since trackURL passed as param
  const debouncedSearch = useCallback(
    // only gets called 500ms after last keypress in searchbox
    debounce((trackURL) => {
      const tid = extractTrackIDFromSongURL(trackURL);
      setTrackID(tid); //triggers loading of track onto display
    }, 500),
    []
  );

  // use searchbox for search
  useEffect(() => {
    // search 500ms after last keystroke
    debouncedSearch(trackURL);
    // Clear the interval on unmount
  }, [trackURL, debouncedSearch]);

  // get note from DB upon successful track search
  async function fetchNote(tid) {
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
    setArtist("");
    setSongName("");
    setImageURL("");
    currNote.current = "";
  }

  function setSongAndNoteViewStates(song_name, image_url, artist, note) {
    console.log("setting view state to this note: ", note);
    setArtist(artist);
    setSongName(song_name);
    setImageURL(image_url);
    currNote.current = note;
  }

  // this code was helpful if we already had current song information from a different api call.
  // i havent found a way for it to be useful.

  // assumes response is from 'currently playing' api call
  // trackID either taken from state if called by state update, otherwise passed manually as a parameter
  // async function loadTrackDataUsingResponse(response, tid = trackID) {
  //   clearSongAndNoteViewStates();

  //   const track = response?.data?.item;
  //   const [song_name, image_url, artist] = extractTrackDataFromResponse(track); //get track data
  //   const note = await fetchNote(tid); //get user notes
  //   console.log(
  //     "calling setsongandnoteviewstates from loadTrackDataUsingResponse"
  //   );
  //   setSongAndNoteViewStates(song_name, image_url, artist, note); //update display
  // }

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
      const [song_name, image_url, artist] =
        extractTrackDataFromResponse(track_data);
      const note = await fetchNote(tid); //get user notes
      console.log("calling setsongandnoteviewstates from loadTrackDataFromID");

      setSongAndNoteViewStates(song_name, image_url, artist, note); //update display
    } catch (error) {
      console.log("error: failed to get track ", tid);
      console.log(error);
      if (error?.response?.status == 401) {
        reauthenticateUser();
      }
    }
  };

  async function handlePlayButtonClick() {
    try {
      setAwaitingPlayAPIResponse(true);

      // if no device is active, Spotify rejects any requests to play tracks,
      // so we populate our play request with the first available device we can find.
      let deviceIDToUse = null;
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

      await playtrack(trackID, accessToken.current, deviceIDToUse, null);

      // enable optimistic play button view updating
      setAwaitingPlayAPIResponse(false);
    } catch (error) {
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

  async function saveNote({ user_id: uid, track_id: track_id, note: note }) {
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

  async function handleKeypress(note) {
    // intercept note, replace timestamps with links
    // const replacedText = note.replace(
    //     /\b(\d+:\d+)\b/g,
    //     '<a href="$1">$1</a>'
    //   );

    currNote.current = note;
    debouncedSave(userID.current, trackID, note);
  }

  return (
    <main>
      <div>
        <div className="searchbar">
          <input
            type="text"
            id="trackURL"
            onChange={(e) => {
              setTrackURL(e.target.value);
            }}
            placeholder="Enter Spotify track URL..."
          />
          <button
            id="logout-button"
            onClick={() => {
              spotifyLogout(supabase);
              window.location.href = "/";
            }}
          >
            Log out
          </button>
        </div>

        {/* <button type="button" onClick={extractTrackIDFromSongURL}>Search</button>
        </div>


        {/* conditional rendering */}
        {userID.current && songName && artist && imageURL && !loadingNote ? (
          <>
            <div>
              <h2 id="song-artist-names">
                {songName} by {artist}{" "}
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

            <div id="art-and-notes">
              {/* left side */}
              <div id="albumart">
                <img
                  alt="track cover art"
                  src={imageURL}
                  id="albumart-display"
                />
              </div>
              {/* right side */}
              <div id="notes-display">
                <div
                  id="notes"
                  contentEditable="true"
                  placeholder-text="Enter your notes here..."
                  onInput={(e) => {
                    handleKeypress(e.target.innerHTML);
                  }}
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(currNote.current),
                  }}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Please enter a valid song URL. (if this msg error persists, reload the page) */}
          </>
        )}
      </div>
    </main>
  );
}
