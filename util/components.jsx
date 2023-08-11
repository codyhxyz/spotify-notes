import { playtrack } from "./apiutils";
import { timestampToMilliseconds } from "./miscutils";
export const SkipBackwardIcon = ({ fill = "none" }) => (
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

export const SkipForwardIcon = ({ fill = "none" }) => (
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

export const PauseIcon = ({ fill = "none" }) => (
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

export const PlayIcon = ({ fill = "none" }) => (
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

export const TimeStamp = ({ trackID, access_token, device_id, stamp }) => {
  const ms = timestampToMilliseconds(stamp);
  return (
    <button onClick={() => playtrack(trackID, access_token, device_id, ms)}>
      {stamp}
    </button>
  );
};
