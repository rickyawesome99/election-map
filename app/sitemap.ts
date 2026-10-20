import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteUrl";
import { countyPresidentialData } from "@/data/countyPresidentialData";
import { getAllCandidateSlugs } from "@/lib/candidateIndex";
import { getAllStateLegCandidateSlugs } from "@/lib/stateLegCandidateIndex";
// Each dynamic route's own page list, so the sitemap cannot drift from what the site builds.
import { generateStaticParams as housePages } from "@/app/house/[id]/page";
import { generateStaticParams as senatePages } from "@/app/senate/[id]/page";
import { generateStaticParams as governorPages } from "@/app/governor/[id]/page";
import { generateStaticParams as pastHousePages } from "@/app/house/[id]/[year]/page";
import { generateStaticParams as pastSenatePages } from "@/app/senate/[id]/[year]/page";
import { generateStaticParams as pastGovernorPages } from "@/app/governor/[id]/[year]/page";
import { generateStaticParams as pastPresidentPages } from "@/app/president/[id]/[year]/page";
import { generateStaticParams as statePages } from "@/app/states/[id]/page";
import { generateStaticParams as modelStatePages } from "@/app/model/[abbr]/page";
import { generateStaticParams as precinctDistrictPages } from "@/app/analysis/districts/[slug]/page";
import { generateStaticParams as pollsterPages } from "@/app/analysis/pollsters/[slug]/page";
import { generateStaticParams as methodologyPages } from "@/app/methodology/[[...model]]/page";

// Every public page. Left out: /audit (internal data checks), /model/state and /model/district
// (views of a query string, reached from the pages listed here), and the redirects /states
// (→ /analysis/delegation) and /analysis/oh-31 (→ its /analysis/districts page, listed below).
const STATIC = [
  "/overview", "/house", "/senate", "/governor", "/historical", "/model", "/model/candidates",
  "/analysis", "/analysis/calendar", "/analysis/delegation", "/analysis/forecasts", "/analysis/markets",
  "/analysis/polling-misses", "/analysis/pollsters", "/analysis/popular-vote", "/analysis/turnout",
  "/district-finder", "/about",
];

// Sitemaps hold at most 50,000 URLs and the state legislative candidate pages alone are ~38,000, so
// the site is split: /sitemap/0.xml is every page but those, /sitemap/1.xml onward the candidates
// (SITEMAP_CHUNK per file). robots.txt lists each file.
export const SITEMAP_CHUNK = 40000;

export function sitemapCount(): number {
  return 1 + Math.ceil(getAllStateLegCandidateSlugs().length / SITEMAP_CHUNK);
}

export async function generateSitemaps() {
  return Array.from({ length: sitemapCount() }, (_, id) => ({ id }));
}

// Next 16 hands `id` over as a promise of the "[id]" segment (a string).
export default async function sitemap({ id }: { id: number | string | Promise<number | string | undefined> }): Promise<MetadataRoute.Sitemap> {
  const n = Number((await id) ?? 0);
  if (n > 0) {
    const slugs = getAllStateLegCandidateSlugs().sort().slice((n - 1) * SITEMAP_CHUNK, n * SITEMAP_CHUNK);
    return slugs.map((slug) => ({ url: `${SITE_URL}/candidates/${slug}` }));
  }
  const paths: string[] = [...STATIC];
  const add = (prefix: string, params: { id?: string; year?: string; abbr?: string; slug?: string }[], key: "id" | "abbr" | "slug" = "id") => {
    for (const p of params) paths.push(`${prefix}/${p[key]}${p.year ? `/${p.year}` : ""}`);
  };
  add("/house", await housePages());
  add("/senate", await senatePages());
  add("/governor", await governorPages());
  add("/house", await pastHousePages());
  add("/senate", await pastSenatePages());
  add("/governor", await pastGovernorPages());
  add("/president", await pastPresidentPages());
  const states = await statePages();
  add("/states", states);
  paths.push("/legislatures");
  for (const s of states) {
    // The district atlas: one page per chamber (Nebraska's unicameral body is its "senate").
    for (const chamber of s.id === "ne" ? ["senate"] : ["house", "senate"]) paths.push(`/states/${s.id}/legislature/${chamber}`);
  }
  add("/model", modelStatePages(), "abbr");
  add("/analysis/districts", await precinctDistrictPages(), "slug");
  add("/analysis/pollsters", await pollsterPages(), "slug");
  for (const m of methodologyPages()) paths.push(m.model.length ? `/methodology/${m.model[0]}` : "/methodology");
  paths.push("/sources");
  // Built on request rather than ahead of time, but every one of them is a real page.
  for (const slug of getAllCandidateSlugs()) paths.push(`/candidates/${slug}`);
  for (const fips of Object.keys(countyPresidentialData)) paths.push(`/historical/${fips}`);

  return [...new Set(paths)].map((path) => ({ url: `${SITE_URL}${path}` }));
}
