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
          // Rose-gold backdrop pulled from globals.css :root[data-theme="rose"]:
          //   c1 #f0c36d honey, c2 #d4572a burnt orange, c3 #7a1f3f wine,
          //   c4 #2b0c2e aubergine, c5 #140612 plum-black. Same gradient the
          //   landing page actually renders against; the OG image was on a
          //   wrong-pink palette before this fix.
          background:
            "radial-gradient(120% 90% at 18% 22%, #f0c36d 0%, #d4572a 22%, #7a1f3f 55%, #2b0c2e 80%, #140612 100%)",
          color: "#f3ecde",
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        {/* Top row: brand mark + tag */}
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
              // Same ember stops as the favicon orb (design-lab/icons/A-orb.svg
              // and B-orb-monogram.svg). Glow shadow is the rose theme's
              // --accent-shadow value verbatim.
              background:
                "radial-gradient(circle at 36% 30%, #ffe6c2 0%, #ffd8a8 14%, #f0c36d 32%, #d4572a 56%, #7a1f3f 82%, #2b0c2e 100%)",
              boxShadow: "0 0 28px rgba(212, 87, 42, 0.55)",
            }}
          />
          <span style={{ fontFamily: "system-ui, sans-serif", fontWeight: 600 }}>
            songnotes.codyh.xyz
          </span>
        </div>

        {/* Middle: the headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              fontSize: 36,
              opacity: 0.78,
              fontFamily: "system-ui, sans-serif",
              fontWeight: 400,
              letterSpacing: -0.2,
            }}
          >
            A private journal for the songs you&apos;re listening to.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 168,
              lineHeight: 1.0,
              fontWeight: 700,
              letterSpacing: -4,
            }}
          >
            My Song&nbsp;
            {/* Peach (--accent-hi) on the italic word, mirroring the in-app
                wordmark where `.song-title em` is colored --accent-hi too. */}
            <span style={{ fontStyle: "italic", fontWeight: 400, color: "#ffd8a8" }}>
              Notes.
            </span>
          </div>
        </div>

        {/* Bottom: the proof */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontFamily: "system-ui, sans-serif",
            fontSize: 26,
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
    { ...size }
  );
}
