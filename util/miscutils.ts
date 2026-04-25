// Match `M:SS` / `MM:SS` timestamps. Requires at least one minute digit so
// random `:23` substrings inside words don't get parsed as timestamps.
export const timestampRegex = /\b(\d{1,2}):([0-5][0-9])\b/;
export const timestampRegexGlobal = /\b(\d{1,2}):([0-5][0-9])\b/g;

export function timestampToMilliseconds(stamp: string): number {
  const matches = stamp.match(timestampRegex);
  if (!matches) {
    throw new Error(`Invalid timestamp format: ${stamp}`);
  }
  const minutes = parseInt(matches[1] || "0", 10);
  const seconds = parseInt(matches[2], 10);
  return (minutes * 60 + seconds) * 1000;
}
