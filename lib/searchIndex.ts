import "server-only";

import {
  electionYear,
  houseData,
  senateData,
  senateNoElection,
  senateHoldovers,
  governorData,
  governorNoElection,
} from "@/data/forecastData";

import { getAllCandidateSlugs, getCandidatePage } from "@/lib/candidateIndex";
import { pastElectionSearchEntries } from "@/lib/pastElections";

import type { SearchEntry } from "@/lib/searchQuery";
export type { SearchEntry };

function buildIndex(): SearchEntry[] {
  const entries: SearchEntry[] = [];

  // Collect all unique states (abbr → name)
  // Strip any "-2" seat suffix from senate ids before keying
  const baseAbbr = (id: string) => id.replace(/-\d+$/, "");
  const stateMap = new Map<string, string>();
  for (const r of senateData)         stateMap.set(baseAbbr(r.id), r.name);
  for (const e of senateNoElection)   stateMap.set(e.abbr, e.state);
  for (const e of senateHoldovers)    stateMap.set(e.abbr, e.state);
  for (const r of governorData)       stateMap.set(baseAbbr(r.id), r.name);
  for (const e of governorNoElection) stateMap.set(e.abbr, e.state);

  // States
  for (const [abbr, name] of stateMap) {
    entries.push({
      label: name,
      sublabel: "State",
      href: `/states/${abbr.toLowerCase()}`,
      terms: `${name} ${abbr} state`.toLowerCase(),
    });
  }

  // Senate — active races
  for (const r of senateData) {
    entries.push({
      label: `${r.name} Senate (Seat ${r.id.endsWith("-2") ? 2 : 1})`,
      sublabel: "Senate Race",
      href: `/senate/${r.id.toLowerCase().replace(/-2$/, "2")}`,
      terms: `${r.name} ${baseAbbr(r.id)} senate seat ${r.id.endsWith("-2") ? 2 : 1}`.toLowerCase(),
    });
  }

  // Senate — seat 1 not up in 2026
  for (const e of senateNoElection) {
    entries.push({
      label: `${e.state} Senate (Seat 1)`,
      sublabel: "Senate (No Election)",
      href: `/senate/${e.abbr.toLowerCase()}`,
      terms: `${e.state} ${e.abbr} senate seat 1`.toLowerCase(),
    });
  }

  // Senate — holdover seat 2
  for (const e of senateHoldovers) {
    entries.push({
      label: `${e.state} Senate (Seat 2)`,
      sublabel: "Senate Holdover",
      href: `/senate/${e.abbr.toLowerCase()}2`,
      terms: `${e.state} ${e.abbr} senate seat 2`.toLowerCase(),
    });
  }

  // Governor — active races
  for (const r of governorData) {
    entries.push({
      label: `${r.name} Governor`,
      sublabel: "Governor Race",
      href: `/governor/${r.id.toLowerCase()}`,
      terms: `${r.name} ${r.id} governor`.toLowerCase(),
    });
  }

  // Governor — no election
  for (const e of governorNoElection) {
    entries.push({
      label: `${e.state} Governor`,
      sublabel: "Governor (No Election)",
      href: `/governor/${e.abbr.toLowerCase()}`,
      terms: `${e.state} ${e.abbr} governor`.toLowerCase(),
    });
  }

  // House districts
  for (const r of houseData) {
    const abbr = r.name.split("-")[0];
    entries.push({
      label: r.name,
      sublabel: "House District",
      href: `/house/${r.name.toLowerCase()}`,
      terms: `${r.name} ${r.state} ${abbr} house district`.toLowerCase(),
    });
  }

  for (const entry of entries) {
    entry.kind = entry.sublabel === "State" ? "state" : "seat";
    if (entry.kind === "seat") entry.sublabel = entry.href.startsWith("/house") ? "House seat" : entry.href.startsWith("/senate") ? "Senate seat" : "Governor seat";
  }

  // Current elections live on the seat page; historical elections have year routes.
  for (const [office, races] of [["house", houseData], ["senate", senateData], ["governor", governorData]] as const) {
    for (const race of races) {
      const id = office === "house" ? race.name.toLowerCase() : race.id.toLowerCase().replace(/-2$/, "2");
      const seat = entries.find((entry) => entry.href === `/${office}/${id}`);
      if (seat) entries.push({ ...seat, kind: "race", label: `${seat.label} · ${electionYear}`, sublabel: `${electionYear} election · Forecast`, terms: `${seat.terms} ${electionYear} election race`, year: electionYear });
    }
    for (const race of pastElectionSearchEntries(office)) {
      const label = office === "house" ? race.id.toUpperCase() : `${race.state} ${office === "senate" ? `Senate (Seat ${race.seat})` : "Governor"}`;
      entries.push({
        kind: "race", year: race.year,
        label: `${label} · ${race.year}`,
        sublabel: `${race.special ? "Special election" : "Election"} · ${race.candidates}`,
        href: race.href,
        terms: `${label} ${race.state} ${race.abbr} ${office} district ${race.year} ${race.candidates} ${race.special ? "special" : ""} election race`,
      });
    }
  }
  for (const slug of getAllCandidateSlugs()) {
    const candidate = getCandidatePage(slug);
    if (!candidate) continue;
    entries.push({
      kind: "candidate", label: candidate.name,
      sublabel: `Candidate · ${candidate.party} · ${candidate.currentPosition ?? `${candidate.state} ${candidate.tab}`}`,
      href: `/candidates/${slug}`,
      terms: `${candidate.name} candidate ${candidate.state} ${candidate.tab} ${candidate.history.map((race) => `${race.raceName} ${race.raceId} ${race.raceType}`).join(" ")}`,
    });
    for (const race of candidate.history.filter((race) => race.isCurrent)) {
      const entry = entries.find((entry) => entry.kind === "race" && entry.href === race.racePath && entry.year === race.year);
      if (entry) entry.terms += ` ${candidate.name}`;
    }
  }
  return [...new Map(entries.map((entry) => [`${entry.kind}:${entry.href}`, entry])).values()];
}

export const searchIndex = buildIndex();
