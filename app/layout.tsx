import "./globals.css";
import { Providers } from "./providers";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";

// Resolve the canonical site URL once. Vercel injects VERCEL_URL on every
// deploy (preview + production); we honor it so preview links unfurl with
// the right OG, falling back to the prod URL in any other environment.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
  "https://mysongnotes.vercel.app";

const TITLE = "My Song Notes";
const DESCRIPTION =
  "A private journal for the songs you're listening to. Type a timestamp like 1:23 and it becomes a button that seeks Spotify to that position. Every note auto-saves and lives in a searchable gallery of album art.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: TITLE,
  authors: [{ name: "Cody Hergenroeder", url: "https://codyh.xyz" }],
  // app/opengraph-image.tsx is auto-discovered by Next and slotted into
  // openGraph.images; same story for app/twitter-image.tsx. We don't repeat
  // those URLs here.
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: TITLE,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  icons: {
    // app/favicon.ico and app/icon.ico are picked up by Next's file-based icon
    // convention automatically. The apple slot needs an explicit URL into
    // /public — iOS expects a 180x180 PNG, not an .ico, for the home-screen
    // tile.
    icon: "/favicon.ico",
    apple: "/apple-icon.png",
  },
};

// Mobile address-bar tints to match the in-app rose theme, so the OS chrome
// reads as part of the page rather than a white frame on top.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff0f5" },
    { media: "(prefers-color-scheme: dark)", color: "#150814" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
