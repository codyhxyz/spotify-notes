import { timestampToMilliseconds } from "./miscutils";

type IconProps = { fill?: string };

export const SkipBackwardIcon = ({ fill = "none" }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <path d="M0 0h24v24H0z" fill={fill} />
    <path d="M20 5v14l-12-7z" />
    <path d="M6 5h2v14h-2V5z" />
  </svg>
);

export const SkipForwardIcon = ({ fill = "none" }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <path d="M0 0h24v24H0z" fill={fill} />
    <path d="M4 5v14l12-7z" />
    <path d="M18 5h2v14h-2V5z" />
  </svg>
);

export const PauseIcon = ({ fill = "none" }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <path d="M0 0h24v24H0z" fill={fill} />
    <path d="M6 5h2v14H6V5zm10 0h2v14h-2V5z" />
  </svg>
);

export const PlayIcon = ({ fill = "none" }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
  >
    <path d="M0 0h24v24H0z" fill={fill} />
    <path d="M3 22V2l18 10-18 10z" />
  </svg>
);

type TimeStampProps = {
  trackID: string | undefined;
  stamp: string;
};

// Click → play this track from `stamp` via the server-side Spotify proxy.
// The proxy reads the access token from the JWT cookie; clients no longer
// hold the Spotify token directly.
export const TimeStamp = ({ trackID, stamp }: TimeStampProps) => {
  const ms = timestampToMilliseconds(stamp);
  return (
    <button
      onClick={async () => {
        if (!trackID) return;
        try {
          await fetch("/api/spotify/play", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ track_id: trackID, position_ms: ms }),
          });
        } catch (err) {
          console.error("[timestamp] play failed:", err);
        }
      }}
    >
      {stamp}
    </button>
  );
};
