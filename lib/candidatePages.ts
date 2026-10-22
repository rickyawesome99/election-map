import "server-only";
import fs from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { candidateSlug } from "@/lib/candidateSlug";
import type { CandidatePagePayload, CandidatePageShard } from "@/lib/candidatePagePayload";

// Reads the candidate pages precomputed by scripts/buildCandidatePages.ts (npm run candidate-pages,
// part of the prebuild / predev chain) from data/generated/candidate-pages/. One shard per state for
// the state legislative slugs (which end in the state's abbreviation, "-oh") and federal.json for the
// federal ones, gzipped; a shard is inflated and parsed once per process (so after a rebuild the
// dev server needs a content change here, not a touch, to drop its cache.) A federal slug can also end
// in a state abbreviation when two candidates share a name ("mike-rogers-mi", lib/candidateSlug.ts):
// the state shard is tried first and federal.json catches it. The directory is listed in next.config.ts's
// outputFileTracingIncludes so Vercel ships it with the route.

const DIR = join(process.cwd(), "data", "generated", "candidate-pages");
const shards = new Map<string, CandidatePageShard | null>();

function shard(name: string): CandidatePageShard | null {
  let s = shards.get(name);
  if (s === undefined) {
    const file = join(DIR, `${name}.json.gz`);
    try {
      s = JSON.parse(gunzipSync(fs.readFileSync(file)).toString("utf8")) as CandidatePageShard;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT" && !fs.existsSync(DIR)) {
        throw new Error(`${DIR} is missing: run \`npm run candidate-pages\` (the prebuild/predev step) first.`);
      }
      s = null; // no such state shard: the slug just happens to end in two letters
    }
    shards.set(name, s);
  }
  return s;
}

let aliases: Record<string, string> | null = null;

/** The page slug an alternate spelling's slug resolves to (written by scripts/buildCandidatePages.ts), or null. */
export function candidateSlugAlias(slug: string): string | null {
  if (!aliases) {
    try {
      aliases = JSON.parse(gunzipSync(fs.readFileSync(join(DIR, "aliases.json.gz"))).toString("utf8")) as Record<string, string>;
    } catch {
      aliases = {};
    }
  }
  return aliases[slug] ?? null;
}

export function getCandidatePagePayload(slug: string): CandidatePagePayload | null {
  const m = /-([a-z]{2})$/.exec(slug);
  if (m) {
    const hit = shard(m[1].toUpperCase())?.[slug];
    if (hit) return hit;
  }
  return shard("federal")?.[slug] ?? null;
}

/** The candidate page for a person named on a race page, or null when there is none (no dead links). */
export function candidatePageHref(name: string | null | undefined, state?: string | null): string | null {
  if (!name) return null;
  const slug = candidateSlug(name, state);
  if (!slug) return null;
  if (getCandidatePagePayload(slug)) return `/candidates/${slug}`;
  const alias = candidateSlugAlias(slug);
  return alias ? `/candidates/${alias}` : null;
}

/** A party code's text color, for "Democrat" / "Republican" labels. */
export const partyTextColor = (party: string | null | undefined): string | undefined =>
  party === "D" ? "var(--party-dem)" : party === "R" ? "var(--party-rep)" : party ? "var(--party-ind)" : undefined;
