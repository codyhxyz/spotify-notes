import type { MetadataRoute } from "next";

// Only the landing page is public. /home is behind sign-in and /api is the
// app's own backend, so keep crawlers out of both.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/home", "/share"] },
    sitemap: "https://songnotes.codyh.xyz/sitemap.xml",
  };
}
