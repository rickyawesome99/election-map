import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The candidate route reads one generated shard per state by a computed name, which file tracing
  // cannot follow on its own; list the directory so Vercel ships it with that function.
  outputFileTracingIncludes: {
    "/candidates/[slug]": ["./data/generated/candidate-pages/*.json.gz"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
      },
    ],
  },
  // Older TPL URLs: the /model/states/ prefix (state pages now sit at /model/oh) and the
  // path-only sub-tabs. The two that carry a query (/model/state, /model/district) are pages.
  async redirects() {
    // The bare domain and the legacy `/?tab=...` links, resolved at the edge: a page at `/` that
    // read the query would run a server function (cold start and all) for every visit to the root.
    // Unmatched query strings pass through to the destination (so modelState / modelDistrict reach
    // the model shims); a leftover `tab=` is harmless.
    const tab = (value: string, destination: string) => ({ source: "/", has: [{ type: "query" as const, key: "tab", value }], destination, permanent: false });
    return [
      tab("(?<tab>house|senate|governor)", "/:tab"),
      tab("(forecast|map)", "/senate"),
      tab("states", "/analysis/delegation"),
      tab("counties", "/historical"),
      tab("district-finder", "/district-finder"),
      tab("(model|table)", "/model"),
      tab("districtTable", "/model#districts"),
      tab("(?<tab>state|district)", "/model/:tab"),
      { source: "/", destination: "/overview", permanent: false },
      { source: "/model/states", destination: "/model", permanent: true },
      { source: "/model/states/:abbr", destination: "/model/:abbr", permanent: true },
      { source: "/model/table", destination: "/model", permanent: false },
      { source: "/model/districtTable", destination: "/model#districts", permanent: false },
      { source: "/model/war", destination: "/model/candidates", permanent: false },
      { source: "/methodology/sources", destination: "/sources", permanent: true },
    ];
  },
};

export default nextConfig;
