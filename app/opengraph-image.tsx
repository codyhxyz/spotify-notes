import { ImageResponse } from "next/og";

// Next.js convention: this file is auto-discovered and served at
// `/opengraph-image` for the route segment it lives in. Placing it at the
// app/ root makes it the default OG image for every page that doesn't
// override it. Twitter picks the same image up via twitter-image.tsx.
//
// The image is generated on-demand at the edge and cached. Don't bake user
// data into it — keep this brand-only.

export const runtime = "edge";
export const alt = "My Song Notes — a journal for the music you're listening to";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  // Co-located TTFs in app/_og-fonts/ get bundled by Next at build time.
  // Without these, Satori's edge runtime falls back to a default sans that
  // has no italic variant, which made the wordmark look wrong AND made
  // "Notes." overflow the canvas because the metrics didn't match.
  const [playfairRegular, playfairItalic] = await Promise.all([
    fetch(new URL("./_og-fonts/PlayfairDisplay-Regular.ttf", import.meta.url)).then(
      (r) => r.arrayBuffer()
    ),
    fetch(new URL("./_og-fonts/PlayfairDisplay-Italic.ttf", import.meta.url)).then(
      (r) => r.arrayBuffer()
    ),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          // Rose-gold backdrop. Same stops globals.css uses for
          // :root[data-theme="rose"]: c1 honey, c2 burnt orange, c3 wine,
          // c4 aubergine, c5 plum-black.
          background:
            "radial-gradient(120% 90% at 18% 22%, #f0c36d 0%, #d4572a 22%, #7a1f3f 55%, #2b0c2e 80%, #140612 100%)",
          color: "#f3ecde",
          fontFamily: '"Playfair Display", Georgia, serif',
        }}
      >
        {/* Top row: brand mark + URL */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontSize: 28,
            letterSpacing: 2,
            textTransform: "uppercase",
            opacity: 0.85,
          }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              // Same ember stops as the favicon orb. Glow shadow is the
              // rose theme's accent-shadow value verbatim.
              background:
                "radial-gradient(circle at 36% 30%, #ffe6c2 0%, #ffd8a8 14%, #f0c36d 32%, #d4572a 56%, #7a1f3f 82%, #2b0c2e 100%)",
              boxShadow: "0 0 28px rgba(212, 87, 42, 0.55)",
            }}
          />
          {/*
            Explicit fontWeight 700 so Satori matches Playfair Regular (the
            only roman font we shipped). At weights closer to 500 it would
            substitute Italic, which makes upright caps render slanted.
          */}
          <span style={{ fontWeight: 700 }}>
            songnotes.codyh.xyz
          </span>
        </div>

        {/* Middle: the headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/*
            Italic subhead, matching the live landing page's .login-hero
            .lede which is also italic. Weight 500 hits Playfair Italic.
          */}
          <div
            style={{
              fontSize: 36,
              opacity: 0.82,
              fontWeight: 500,
              fontStyle: "italic",
              letterSpacing: -0.2,
            }}
          >
            A private journal for the songs you&apos;re listening to.
          </div>
          {/*
            Headline. Pulled from 168px to 144px because Playfair has slightly
            wider metrics than the previous sans fallback and "Notes." was
            clipping the right edge. Display flex keeps the upright + italic
            spans on one baseline; the italic Notes. is in --accent-hi peach,
            mirroring the in-app .song-title em color.
          */}
          <div
            style={{
              display: "flex",
              fontSize: 144,
              lineHeight: 1.0,
              fontWeight: 700,
              letterSpacing: -3,
            }}
          >
            My Song&nbsp;
            <span
              style={{
                fontStyle: "italic",
                fontWeight: 500,
                color: "#ffd8a8",
              }}
            >
              Notes.
            </span>
          </div>
        </div>

        {/*
          Bottom: features + byline. fontWeight 700 so they match Playfair
          Regular (upright). Without an explicit weight, Satori would
          substitute the italic — see top-row comment.
        */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 26,
            fontWeight: 700,
            opacity: 0.85,
          }}
        >
          <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
            <span>Auto-saves as you type</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>Clickable timestamps</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>Searchable library</span>
          </div>
          <div style={{ opacity: 0.6 }}>codyh.xyz</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Playfair Display",
          data: playfairRegular,
          style: "normal",
          weight: 700,
        },
        {
          name: "Playfair Display",
          data: playfairItalic,
          style: "italic",
          weight: 500,
        },
      ],
    }
  );
}
