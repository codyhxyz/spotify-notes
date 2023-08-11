export const timestampRegex = /(\d{0,2}):([0-5][0-9])/;
export const timestampRegexGlobal = /(\d{0,2}):([0-5][0-9])/g;

export function timestampToMilliseconds(stamp: string) {
  console.log("converting timestamptoms from button click");
  const matches = stamp.match(timestampRegex);

  if (!matches) {
    console.log("got error w following string: " + stamp);
    throw new Error("Invalid timestamp format.");
  }

  const minutes = parseInt(matches[1] || "0", 10); // If there's no minutes part, default to 0
  const seconds = parseInt(matches[2], 10);
  const ms = (minutes * 60 + seconds) * 1000; // Convert to milliseconds
  console.log("result of conversion is from ", stamp);
  console.log("to ", ms);
  return ms;
}
