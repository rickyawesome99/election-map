import type { NextConfig } from "next";
import { FIPS_TO_STATE } from "./lib/fips";

const nextConfig: NextConfig = {
  // The candidate route reads one generated shard per state by a computed name, which file tracing
  // cannot follow on its own; list the directory so Vercel ships it with that function.
  outputFileTracingIncludes: {
    "/candidates/[slug]": ["./data/generated/candidate-pages/*.json.gz"],
  },
  // Pages that import model code but read no precinct or atlas file at render: keep the big data folders out of
  // their functions (Vercel's 250 MB limit; the methodology function reached 466 MB on 2026-11-27 when a tab
  // imported a module that reads precinct files by computed path). Those folders are served as static files.
  outputFileTracingExcludes: {
    "/analysis/internal-methodology/[[...model]]": ["./public/precincts/**", "./public/state-leg-tpl/**", "./public/state-leg-atlas/**", "./data-entry/precincts/**"],
    "/methodology/[[...model]]": ["./public/precincts/**", "./public/state-leg-tpl/**", "./public/state-leg-atlas/**", "./data-entry/precincts/**"],
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
      tab("(?<tab>house|senate|governor)", "/forecast?chamber=:tab"),
      tab("(forecast|map)", "/forecast"),
      tab("states", "/analysis/delegation"),
      tab("counties", "/historical"),
      tab("district-finder", "/district-finder"),
      tab("(model|table)", "/model"),
      tab("districtTable", "/model#districts"),
      tab("(?<tab>state|district)", "/model/:tab"),
      { source: "/", destination: "/overview", permanent: false },
      // The post-election analysis moved under the Overview (user, 2026-11-17): 2026 on /overview, past years on /overview/[year].
      { source: "/analysis/post-election", destination: "/overview", permanent: false },
      { source: "/analysis/post-election/:year", destination: "/overview/:year", permanent: false },
      // The editorial prediction page came off the site (user, 2026-11-25); its files are in archive/editorial-prediction/.
      { source: "/analysis/editorial-prediction", destination: "/analysis", permanent: false },
      { source: "/model/states", destination: "/model", permanent: true },
      { source: "/model/states/:abbr", destination: "/model/:abbr", permanent: true },
      { source: "/model/table", destination: "/model", permanent: false },
      { source: "/model/districtTable", destination: "/model#districts", permanent: false },
      // Candidates (WAR) left the TPL tab for a tab of its own (user, 2026-11-23). Query strings (?c=, ?state=) carry over.
      { source: "/model/candidates", destination: "/war", permanent: true },
      { source: "/model/war", destination: "/war", permanent: false },
      { source: "/methodology/sources", destination: "/sources", permanent: true },
      // County pages moved under their state (user, 2026-11-25): /historical/39049 → /states/oh/counties/39049.
      // One rule per state, keyed on the FIPS prefix, so the old URLs resolve at the edge.
      ...Object.entries(FIPS_TO_STATE).map(([prefix, { abbr }]) => ({
        source: `/historical/:fips(${prefix}\\d{3})`,
        destination: `/states/${abbr.toLowerCase()}/counties/:fips`,
        permanent: true,
      })),
    ];
  },
};

export default nextConfig;
