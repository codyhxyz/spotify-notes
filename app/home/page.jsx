"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  gettrack,
  playtrack,
  pausetrack,
  getplaybackstate,
  getrecentlyplayed,
  skipPrevious,
  skipNext,
} from "../../util/trackutils";
import { spotifyLogout } from "../../util/authutils";
import { delay } from "../../util/miscutils";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { debounce } from "lodash";
import DOMPurify from "dompurify";

export default function Home() {
  const supabase = createClientComponentClient();
  const [trackURL, setTrackURL] = useState(""); //change only on search by URL, not search by ID
  const [songName, setSongName] = useState("");
  const [artist, setArtist] = useState("");
  const [imageURL, setImageURL] = useState("");
  const [loadingNote, setLoadingNote] = useState("");

  const [isPlaying, setIsPlaying] = useState(false); //tracks whether user is playing music from spotify
  const accessToken = useRef(null);
  const userID = useRef(null);
  const trackID = useRef(""); //change on search by URL or ID
  const currNote = useRef("");

  //get & store supabase and spotify session data
  useEffect(() => {
    // async function so we can use await
    async function getSession() {
      const { data } = await supabase.auth.getSession();
      accessToken.current = data.session.provider_token; //store spotify access token
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

  // update play button view and handle showing currently playing song if search box is empty
  // TODO decompose better; probably make a 'updateplaybutton'
  const queryPlaybackState = async () => {
    try {
      const response = await getplaybackstate(accessToken.current);
      if (response) {
        if (response.status == 204) {
          setIsPlaying(false);
        } else {
          setIsPlaying(response.data.is_playing);
        }
        return response.data;
      }
    } catch (error) {
      if (error.response.status == 401) {
        reauthenticateUser();
      }
      setIsPlaying(false); //if we dont know, default to play button
      console.log(error);
    }
  };

  // recurring spotify query for:
  // 1. playback state
  // 2. recently played <-- commented this out for now
  // TODO decompose, probably make into 'updatetrackdisplay'
  useEffect(() => {
    let querySpotify = async () => {
      const playbackData = await queryPlaybackState();
      // const recentlyPlayedData = await queryRecentlyPlayed();

      // handle 'show current/recent song if search box empty'
      if (!trackURL) {
        let tid;
        // extract trackIDs from the responses
        const playbackDataID = playbackData?.item?.id;
        // const recentlyPlayedDataID = recentlyPlayedData?.length > 0 ? recentlyPlayedData[0]?.track?.id : undefined

        // reload track view, priority to currently playing track
        if (playbackDataID) {
          if (trackID.current != playbackDataID) {
            tid = playbackDataID;
          }
        }
        // else if (recentlyPlayedDataID) {
        //   if(trackID.current != recentlyPlayedDataID) {
        //     tid = recentlyPlayedDataID
        //   }
        // }
        if (tid) handleGetTrackFromID(tid);
      }

      // use recursion to avoid stale closure
      await delay(1000);
      querySpotify();
    };

    // start loop over upon trackURL change
    querySpotify();

    // clean up upon unmount of trackURL change
    return () => {
      querySpotify = () => {};
    };
  }, [trackURL]);

  // returns an array of the most recently finished spotify song
  async function queryRecentlyPlayed() {
    try {
      const response = await getrecentlyplayed(accessToken.current);
      if (response?.data?.items) {
        //extract trackID
        return response.data.items;
      }
    } catch (error) {
      if (error.response.status == 401) {
        reauthenticateUser();
      }
      console.log(error);
    }
  }

  const debouncedSearch = useCallback(
    debounce((trackURL) => {
      handleSearch(trackURL);
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
  async function getNote(tid) {
    // code to load note into currNote
    // note: should i have this code in a useCallback func as the example has it?
    //   but then how would i make SURE it happens AFTER the user loads a new song,
    //   and BEFORE they start typing in a new note?
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
        currNote.current = data.note;
        console.log("successfully got note from database, it is: ", data.note);
      }
    } catch (error) {
      console.log("hi there, we got an error. Heres the error below : ");
      console.log(error);
    } finally {
      setLoadingNote(false);
    }
  }

  // fetch song from spotify by ID
  async function handleGetTrackFromID(tid) {
    trackID.current = ""; //reset trackID to null

    setArtist("");
    setSongName("");
    setImageURL("");
    currNote.current = "";

    trackID.current = tid;
    if (!accessToken.current) return; //wait until we've gotten an access token post-login
    try {
      const response = await gettrack(tid, accessToken.current);
      setSongName(response.data.name);
      let artistsString = "";
      for (let i = 0; i < response.data.artists.length; i++) {
        if (i != 0) artistsString += ", ";
        artistsString += response.data.artists[i].name;
      }
      setArtist(artistsString);
      setImageURL(response.data.album.images[0].url);
      await getNote(tid);
    } catch (error) {
      console.log("error: failed to get track ", tid);
      console.log(error);
      if (error.response.status == 401) {
        reauthenticateUser();
      }
      // // if we fail to get the track in any way, reset the view to empty;
      // trackID.current = ""; //reset trackID to null
      // setArtist("");
      // setSongName("");
      // setImageURL("");
      // currNote.current = ""
    }
  }

  // reset view, extract track from URL
  function handleSearch(turl) {
    // reset trackID to safeguard current note from being overwritten
    trackID.current = "";

    setArtist("");
    setSongName("");
    setImageURL("");
    currNote.current = "";

    const reg = turl.match(/spotify.com\/track\/([a-zA-Z0-9]+)\?.*$/);
    if (reg?.[1]) {
      const tid = reg?.[1];
      trackID.current = tid;
      console.log("found following trackID: ", tid);
      handleGetTrackFromID(tid);
    }
  }

  async function handlePlay() {
    try {
      await playtrack(trackID.current, 0, accessToken.current);
      //   setIsPlaying(true)
    } catch (error) {
      if (error.response.status == 403) {
        alert("Device inaccessible; please change your Spotify output device.");
        // TODO handle this
      }
      console.log("error playing track");
      console.log(error);
    }
  }

  async function handlePause() {
    try {
      await pausetrack(accessToken.current);
      //   setIsPlaying(false)
    } catch (error) {
      console.log("error pausing track (see below):");
      console.log(error);
    }
  }

  async function handlePrev() {
    try {
      await skipPrevious(accessToken.current);
    } catch (error) {
      console.log("error backing track (see below):");
      console.log(error);
    }
  }

  async function handleNext() {
    try {
      await skipNext(accessToken.current);
    } catch (error) {
      console.log("error forwarding track (see below):");
      console.log(error);
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
    debouncedSave(userID.current, trackID.current, note);
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

        {/* <button type="button" onClick={handleSearch}>Search</button> 
        </div> 
       

        {/* conditional rendering */}
        {userID.current && songName && artist && imageURL && !loadingNote ? (
          <>
            <div>
              <h2>
                {songName} by {artist}{" "}
              </h2>
            </div>
            <div className="flex-container">
              {/* left side */}
              <div className="flex-child" id="albumart">
                <img
                  alt="track cover art"
                  src={imageURL}
                  id="albumart-display"
                />
              </div>
              {/* right side */}
              <div className="flex-child green" id="notes">
                {/* <textarea id="notes" type="text" onChange={(e)=>{setCurrNote(e.target.value)}} value={currNote} style={{height: "700px"}} /> */}
                <div
                  id="display-note"
                  contentEditable="true"
                  onInput={(e) => {
                    handleKeypress(e.target.innerHTML);
                  }}
                  // textContent={currNote.current}
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(currNote.current),
                  }}
                />
                {/* <button onClick={()=>{saveNote({track_id:trackID, note:currNote})}}>Save Note</button> */}
              </div>
            </div>

            <div className="music-player">
              <button
                className="media-button"
                onClick={() => {
                  handlePrev();
                }}
              >
                ⏮
              </button>

              <button
                className="media-button"
                onClick={() => {
                  isPlaying ? handlePause() : handlePlay();
                }}
              >
                {isPlaying ? "⏸" : "⏵"}
              </button>

              <button
                className="media-button"
                onClick={() => {
                  handleNext();
                }}
              >
                ⏭
              </button>
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
