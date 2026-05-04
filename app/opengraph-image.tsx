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
          background:
            "radial-gradient(120% 90% at 18% 22%, #ff6aa1 0%, #c93570 28%, #5c1538 62%, #150814 100%)",
          color: "#fff",
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
              background:
                "radial-gradient(circle at 30% 30%, #ffd1e0, #ff5c93 60%, #6b1839)",
              boxShadow: "0 0 28px rgba(255,108,162,0.85)",
            }}
          />
          <span style={{ fontFamily: "system-ui, sans-serif", fontWeight: 600 }}>
            mysongnotes.vercel.app
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
            <span style={{ fontStyle: "italic", fontWeight: 400 }}>
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
