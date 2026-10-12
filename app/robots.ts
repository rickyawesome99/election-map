import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteUrl";
import { sitemapCount } from "@/app/sitemap";

export default function robots(): MetadataRoute.Robots {
  return {
    // The audit pages are internal data checks; the API serves the pages, not readers.
    rules: { userAgent: "*", allow: "/", disallow: ["/audit/", "/api/"] },
    sitemap: Array.from({ length: sitemapCount() }, (_, id) => `${SITE_URL}/sitemap/${id}.xml`),
  };
}
