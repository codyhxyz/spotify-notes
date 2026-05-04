// Twitter wants the same image at the same dimensions for `summary_large_image`
// cards. Re-export the OG image so the two stay in lockstep — single source of
// truth, no drift between the OpenGraph and Twitter previews.
//
// Next requires `runtime` to be statically parseable per-file (not re-exported),
// so we declare it directly here. Everything else can be re-exported safely.
export const runtime = "edge";
export { default, alt, size, contentType } from "./opengraph-image";
