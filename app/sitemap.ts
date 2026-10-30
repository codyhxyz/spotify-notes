import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://songnotes.codyh.xyz/", changeFrequency: "monthly", priority: 1 }];
}
