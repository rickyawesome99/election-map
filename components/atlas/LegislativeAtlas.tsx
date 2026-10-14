"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import StateLegDistrictMap from "@/components/StateLegDistrictMap";
import StateLegDistrictTable from "@/components/StateLegDistrictTable";
import StateLegCompositionBox from "@/components/StateLegCompositionBox";
import DistrictBoxGrid, { type BoxItem, type BoxTip, type BoxTipLine } from "./DistrictBoxGrid";
import DistrictCountBar, { type ProjectedSeats } from "./DistrictCountBar";
import AtlasDistrictDetail from "./AtlasDistrictDetail";
import { LocatorMap } from "./AtlasEraMaps";
import { useStaticJson } from "@/lib/useStaticJson";
import { useStateLegResults } from "@/lib/useStateLegResults";
import { atlasSliceUrl, contest2026, districtHash, keyFromHash, resultMargin, shortDistrictName, type AtlasChamber, type AtlasDistrict } from "@/lib/stateLegAtlas";
import { summarizeUpcoming } from "@/lib/stateLegUpcoming";
import { candidateSlug } from "@/lib/candidateSlug";
import { getRaceColor, getRatingColors } from "@/lib/colorScale";
import type { Chamber, StateLegDistrict } from "@/data/stateLegDistricts";
import type { ChamberMapInfo } from "@/data/stateLegMapInfo";
import type { StateLegCalendar } from "@/data/stateLegCalendar";
import type { StateLegEntry } from "@/data/forecastData";
import type { StateLegPres2024, MapViewMode } from "@/data/stateLegPres2024";
import type { StateLegDistrictResult } from "@/data/stateLegResults";

type ColorMode = "projection" | "seats" | "president" | "results";
type Filter = "all" | "up" | "competitive" | "open" | "unopposed";

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
  };
}

const PARTY_FILL: Record<string, string> = { D: "var(--party-dem)", R: "var(--party-rep)", I: "var(--party-ind)", O: "var(--party-ind)" };
const NO_DATA = "var(--app-tab-bg)";

const pill = (on: boolean) => ({ background: on ? "var(--app-text-primary)" : "var(--app-tab-bg)", color: on ? "var(--app-bg)" : "var(--app-text-muted)", fontWeight: 600 });

const PARTY_TEXT: Record<string, string> = { D: "var(--party-dem)", R: "var(--party-rep)", I: "var(--party-ind)", O: "var(--app-text-secondary)" };
const PARTY_NAME: Record<string, string> = { D: "Democrat", R: "Republican", I: "Independent", O: "Other" };
const fmtMargin = (m: number) => (Math.abs(m) < 0.05 ? "Even" : `${m > 0 ? "R" : "D"}+${Math.abs(m).toFixed(1)}`);
const marginColor = (m: number) => (m > 0 ? "var(--party-rep)" : "var(--party-dem)");
const NOT_A_CANDIDATE = /write.?in|scatter|blank|void|under.?vote|over.?vote|none of/i;

/** An independent's margin over the major-party nominee: "I+4.2" or "R+4.2". */
function fmtIndep(advantage: number, opp: "D" | "R"): string {
  return Math.abs(advantage) < 0.05 ? "Even" : `${advantage > 0 ? "I" : opp}+${Math.abs(advantage).toFixed(1)}`;
}

/** The box grid's hover card for one district under the current color mode. */
function boxTip(d: AtlasDistrict, mode: ColorMode, year: number | null, electionYear: number): BoxTip {
  const heading = d.label;
  if (mode === "projection") {
    const pr = d.projection;
    const field = d.candidates2026?.candidates ?? [];
    if (!pr || pr.contest === "not-up") return { heading, lines: [{ label: `Not on the ${electionYear} ballot`, value: d.nextElection ? `next ${d.nextElection}` : undefined }] };
    const lines: BoxTipLine[] = field.length
      ? field.map((c) => ({ label: c.name, color: PARTY_TEXT[c.party], sub: [c.post ? `pos. ${c.post}` : "", c.incumbent ? "inc." : "", c.writeIn ? "write-in" : ""].filter(Boolean).join(" · ") || undefined, value: c.party === "O" ? (c.partyLabel ?? "Other").replace(/ Party$/, "") : c.party }))
      : [{ label: "No candidates listed yet" }];
    if (pr.contest === "contested" && pr.margin != null) {
      const g = pr.guaranteed && (pr.guaranteed.dem || pr.guaranteed.rep) ? ` · decided by the field: ${[pr.guaranteed.dem ? `${pr.guaranteed.dem} D` : "", pr.guaranteed.rep ? `${pr.guaranteed.rep} R` : ""].filter(Boolean).join(", ")}` : "";
      return { heading, lines, total: { label: `Projected${pr.rating ? ` · ${pr.rating}` : ""}`, value: fmtMargin(pr.margin), color: marginColor(pr.margin) }, note: pr.pD != null ? `P(Democratic) ${Math.round(pr.pD * 100)}% · P(Republican) ${Math.round((1 - pr.pD) * 100)}%${g}` : undefined };
    }
    if (pr.contest === "uncontested-D" || pr.contest === "uncontested-R") {
      const dem = pr.contest === "uncontested-D";
      return { heading, lines, total: { label: dem ? "No Republican on the ballot" : "No Democrat on the ballot", value: dem ? "D hold/gain" : "R hold/gain", color: dem ? "var(--party-dem)" : "var(--party-rep)" } };
    }
    if (pr.contest === "independent" && pr.indep && pr.pI != null) {
      const opp = pr.indep.slot === "D" ? "R" : "D";
      return { heading, lines, total: { label: `${pr.indep.name} vs ${opp}`, value: fmtIndep(pr.indep.advantage, opp), color: pr.pI >= 0.5 ? "var(--party-ind)" : PARTY_TEXT[opp] }, note: `P(${pr.indep.name}) ${Math.round(pr.pI * 100)}% · P(${opp === "D" ? "Democratic" : "Republican"}) ${Math.round((1 - pr.pI) * 100)}%` };
    }
    if (pr.contest === "other" && pr.pI === 1) return { heading, lines, total: { label: "No major party on the ballot", value: "Independent", color: "var(--party-ind)" } };
    if (pr.contest === "split" && pr.guaranteed) return { heading, lines, total: { label: "Every seat decided by the field", value: `${pr.guaranteed.dem} D · ${pr.guaranteed.rep} R`, color: "var(--app-text-primary)" } };
    return { heading, lines, note: "No projection: no major-party contest" };
  }
  if (mode === "seats") {
    const lines: BoxTipLine[] = d.incumbents.length
      ? d.incumbents.map((i) => {
          const leaving = d.outgoing2026?.some((o) => o.name === i.name);
          return { label: i.name, color: PARTY_TEXT[i.party], sub: [i.lastElection ? `elected ${i.lastElection}` : "", leaving ? "not running" : ""].filter(Boolean).join(" · ") || undefined, value: PARTY_NAME[i.party] ?? i.party };
        })
      : [{ label: "Vacant" }];
    const up = d.nextElection === electionYear || d.incumbents.some((i) => (i.nextElection ?? d.nextElection) === electionYear);
    return { heading, lines, note: up ? `Up in ${electionYear}` : d.nextElection ? `Next election ${d.nextElection}` : undefined };
  }
  if (mode === "president") {
    const p = d.presCurrent["2024"];
    if (!p) return { heading, lines: [{ label: "2024 result not available" }] };
    return {
      heading,
      lines: [
        { label: "Harris", value: `${p.demPct.toFixed(1)}%`, color: "var(--party-dem)" },
        { label: "Trump", value: `${p.repPct.toFixed(1)}%`, color: "var(--party-rep)" },
      ],
      total: { label: "2024 President", value: fmtMargin(p.margin), color: marginColor(p.margin) },
      note: p.estimated ? "Estimated from precinct overlay" : undefined,
    };
  }
  const r = d.results.find((x) => x.year === year);
  if (!r) return { heading, lines: [{ label: `No ${year ?? ""} race for this district`.replace("  ", " ") }] };
  const cands = (r.candidates ?? []).filter((c) => (c.votes == null || c.votes > 0) && !NOT_A_CANDIDATE.test(c.name));
  const lines: BoxTipLine[] = cands.length
    ? cands.map((c) => ({ label: c.name, color: PARTY_TEXT[c.party], sub: [c.winner ? "won" : "", c.incumbent ? "inc." : ""].filter(Boolean).join(" · ") || undefined, value: c.votes == null ? "—" : c.votes.toLocaleString() }))
    : [
        { label: "Democratic", value: (r.demVotes ?? 0).toLocaleString(), color: "var(--party-dem)" },
        { label: "Republican", value: (r.repVotes ?? 0).toLocaleString(), color: "var(--party-rep)" },
      ];
  const m = resultMargin(r);
  return {
    heading: `${heading} · ${r.year}`,
    lines,
    total: m == null ? undefined : { label: r.uncontested ? "Unopposed" : "Margin", value: fmtMargin(m), color: marginColor(m) },
    note: r.noCount ? "No vote count published" : r.era !== "current" ? "Held on the district's earlier lines" : undefined,
  };
}

/**
 * A chamber's district explorer and its district view, in one window. With no district in the hash
 * the page is the explorer: color modes, filters, search, the box grid and map, the chamber's
 * history and the district table. A district in the hash (#hd-12) swaps the explorer out for that
 * district's page, with a locator strip to move between districts. The explorer stays mounted
 * underneath, so its mode, filter, search and scroll position are where the reader left them.
 */
export default function LegislativeAtlas({
  abbr,
  stateName,
  chamber,
  isUnicameral,
  mapInfo,
  roster,
  pres2024,
  calendar,
  historicalMaps,
  houseEntries,
  senateEntries,
  electionYear,
  summary,
}: {
  abbr: string;
  stateName: string;
  chamber: Chamber;
  isUnicameral: boolean;
  mapInfo: ChamberMapInfo | null;
  roster: StateLegDistrict[];
  pres2024: Record<string, StateLegPres2024>;
  calendar: StateLegCalendar | null;
  /** Election year -> vintage of the superseded boundary file that election ran on. */
  historicalMaps: Record<string, number>;
  houseEntries: StateLegEntry[];
  senateEntries: StateLegEntry[];
  electionYear: number;
  /** The chamber's headline numbers (server-rendered), shown above the explorer. */
  summary: React.ReactNode;
}) {
  const { data, loading, failed } = useStaticJson<AtlasChamber>(atlasSliceUrl(abbr, chamber));
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  const hashKey = keyFromHash(hash, chamber);
  const [modeChoice, setModeChoice] = useState<ColorMode | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [resultsYear, setResultsYear] = useState<number | null>(null);
  const [preResultsMode, setPreResultsMode] = useState<ColorMode | null>(null);

  const districts = useMemo(() => data?.districts ?? [], [data]);
  const byKey = useMemo(() => new Map(districts.map((d) => [d.key, d])), [districts]);
  // The projection leads where the chamber is on the ballot; a chamber sitting 2026 out opens on seat party.
  const hasProjection = !!data?.projection;
  const mode: ColorMode = modeChoice ?? (hasProjection ? "projection" : "seats");

  // A key the data doesn't know (a stale link) falls back to the explorer once the data is in.
  const selected: AtlasDistrict | null = hashKey ? byKey.get(hashKey) ?? null : null;
  const inDistrict = hashKey != null && (!data || selected != null);

  // ── Scroll: the explorer's position is remembered, a district opens at the top ──
  const explorerScroll = useRef(0);
  const inDistrictRef = useRef(inDistrict);
  const wasInDistrict = useRef(inDistrict);
  // District → district from the selector keeps the selector where it is on screen.
  const navRef = useRef<HTMLDivElement>(null);
  const navTopBefore = useRef<number | null>(null);
  const cameFromExplorer = useRef(false);
  useEffect(() => {
    const onScroll = () => { if (!inDistrictRef.current) explorerScroll.current = window.scrollY; };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useLayoutEffect(() => {
    const was = wasInDistrict.current;
    wasInDistrict.current = inDistrict;
    inDistrictRef.current = inDistrict;
    if (inDistrict && was && navTopBefore.current != null) {
      const top = navRef.current?.getBoundingClientRect().top;
      if (top != null) window.scrollBy({ top: top - navTopBefore.current, behavior: "instant" as ScrollBehavior });
      navTopBefore.current = null;
    } else if (inDistrict && !was) window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    else if (was) window.scrollTo({ top: explorerScroll.current, behavior: "instant" as ScrollBehavior });
  }, [inDistrict, hashKey]);

  const select = useCallback(
    (key: string | null) => {
      if (!key || !byKey.has(key)) return;
      const target = districtHash(chamber, key);
      if (window.location.hash === target) return;
      // Explorer → district is one history step; moving between districts replaces it, so Back
      // (the browser's or "All districts") always lands on the explorer.
      if (!inDistrictRef.current) {
        // Saved before the hash changes: the fragment navigation can itself scroll the page.
        explorerScroll.current = window.scrollY;
        inDistrictRef.current = true;
        cameFromExplorer.current = true;
        window.location.hash = target;
      }
      else {
        navTopBefore.current = navRef.current?.getBoundingClientRect().top ?? null;
        window.location.replace(target);
      }
    },
    [chamber, byKey],
  );
  const backToExplorer = useCallback(() => {
    // Back where the reader came from is a real history step; a district opened from a link gets a fresh entry.
    if (cameFromExplorer.current) { cameFromExplorer.current = false; window.history.back(); return; }
    window.history.pushState(null, "", window.location.pathname + window.location.search);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }, []);

  // ── Past results: any year on the calendar, on the lines it ran on ──
  const electionYears = useMemo(() => [...(calendar?.electionYears ?? [])].sort((a, b) => b - a), [calendar]);
  const activeYear = resultsYear != null && electionYears.includes(resultsYear) ? resultsYear : electionYears[0] ?? null;
  const { data: resultsData, loading: resultsLoading } = useStateLegResults(abbr, mode === "results");
  const chamberResults = mode === "results" && activeYear != null ? resultsData?.[String(activeYear)]?.[chamber] ?? null : null;
  const results = chamberResults?.districts ?? null;
  const historicalVintage = activeYear != null ? historicalMaps[String(activeYear)] : undefined;
  const boundaryUrl = mode === "results" && historicalVintage
    ? `/state-leg-districts-historical/${chamber}/${abbr}-${historicalVintage}.json`
    : `/state-leg-districts/${chamber}/${abbr}.json`;
  const era = useMemo(() => (activeYear == null ? undefined : calendar?.eras.find((e) => e.electionYears.includes(activeYear))), [calendar, activeYear]);
  const chamberLabel = isUnicameral ? "Legislature" : chamber === "house" ? "State House" : "State Senate";
  const boundaryNote = mode === "results" && era
    ? `${chamberLabel} boundaries used in ${activeYear}${era.source ? ` · ${era.source}` : ""}${historicalVintage ? "" : " (still in effect)"}`
    : null;

  const setMode = (m: ColorMode) => {
    if (m === "results") setResultsYear((y) => (y != null && electionYears.includes(y) ? y : electionYears[0] ?? null));
    else setPreResultsMode(m);
    setModeChoice(m);
  };
  // A history card toggles: clicking the year already on the map takes it back off.
  const selectYear = (year: number) => {
    if (mode === "results" && year === activeYear) { setModeChoice(preResultsMode ?? (hasProjection ? "projection" : "seats")); return; }
    setResultsYear(year);
    setModeChoice("results");
  };

  const upcoming = useMemo(
    () => summarizeUpcoming(roster, electionYear, calendar?.eras.at(-1)?.totalSeats ?? mapInfo?.totalSeats ?? null, calendar?.termYears ?? null),
    [roster, electionYear, calendar, mapInfo],
  );
  // Seats contested per past cycle for the history cards (see the note this replaced in StateLegSection):
  // an unstaggered chamber's era size is exact; a staggered figure well under the class size is a sourcing gap.
  const seatsUpByYear = useMemo(() => {
    if (!calendar) return null;
    const out: Record<number, number> = {};
    for (const e of calendar.eras) {
      for (const year of e.electionYears) {
        if (!calendar.staggered) { out[year] = e.totalSeats; continue; }
        const contested = calendar.seatsUp[String(year)];
        if (contested == null) continue;
        if (contested < ((e.totalSeats * 2) / (calendar.termYears ?? 4)) * 0.8) continue;
        out[year] = contested;
      }
    }
    return out;
  }, [calendar]);

  // ── Filters ──
  const isUp = useCallback((d: AtlasDistrict) => d.nextElection === electionYear || d.incumbents.some((i) => (i.nextElection ?? d.nextElection) === electionYear), [electionYear]);
  const passes = useCallback((d: AtlasDistrict) => {
    if (filter === "up" && !isUp(d)) return false;
    if (filter === "competitive") { const m = d.presCurrent["2024"]?.margin; if (m == null || Math.abs(m) >= 10) return false; }
    if (filter === "open") { const c = contest2026(d.candidates2026, d.incumbents); if (!c || !c.open) return false; }
    if (filter === "unopposed") { const c = contest2026(d.candidates2026, d.incumbents); if (!c || c.status === "contested") return false; }
    if (query) {
      const q = query.toLowerCase();
      if (!d.key.toLowerCase().includes(q) && !d.label.toLowerCase().includes(q) && !d.incumbents.some((i) => i.name.toLowerCase().includes(q))) return false;
    }
    return true;
  }, [filter, query, isUp]);

  const boxes: BoxItem[] = useMemo(
    () =>
      districts.map((d) => {
        let fill = NO_DATA, darkText = true;
        if (mode === "projection") {
          const pr = d.projection;
          if (pr?.contest === "contested" && pr.margin != null) { fill = getRaceColor(pr.margin); darkText = Math.abs(pr.margin) < 10; }
          else if (pr?.contest === "uncontested-D") { fill = PARTY_FILL.D; darkText = false; }
          else if (pr?.contest === "uncontested-R") { fill = PARTY_FILL.R; darkText = false; }
          else if (pr?.contest === "independent" && pr.margin != null) { fill = (pr.pI ?? 0) >= 0.5 ? PARTY_FILL.I : getRaceColor(pr.margin); darkText = (pr.pI ?? 0) < 0.5 && Math.abs(pr.margin) < 10; }
          else if (pr?.contest === "other" && pr.pI === 1) { fill = PARTY_FILL.I; darkText = false; }
          else if (pr?.contest === "split") { fill = "#4B0082"; darkText = false; }
        } else if (mode === "seats") {
          const parties = new Set(d.incumbents.map((i) => i.party));
          if (parties.size === 1) { fill = PARTY_FILL[[...parties][0]] ?? NO_DATA; darkText = false; }
          else if (parties.size > 1) { fill = "#4B0082"; darkText = false; }
        } else if (mode === "president") {
          const m = d.presCurrent["2024"]?.margin ?? null;
          if (m != null) { fill = getRaceColor(m); darkText = Math.abs(m) < 10; }
        } else {
          // The race held under this district number in the chosen year, on that year's lines.
          const r = d.results.find((x) => x.year === activeYear);
          const m = r ? resultMargin(r) : null;
          if (r?.uncontested && r.noCount) { fill = r.demVotes === 0 || r.repVotes ? PARTY_FILL.R : PARTY_FILL.D; darkText = false; }
          else if (m != null) { fill = getRaceColor(m); darkText = Math.abs(m) < 10; }
        }
        const inc = d.incumbents.map((i) => `${i.name} (${i.party})`).join(", ") || "vacant";
        const p = d.presCurrent["2024"]?.margin ?? null;
        const c = contest2026(d.candidates2026, d.incumbents);
        return {
          key: d.key,
          fill,
          darkText,
          dimmed: !passes(d),
          tip: boxTip(d, mode, activeYear, electionYear),
          title: `${d.label} · ${inc}${p != null ? ` · 2024 pres ${p > 0 ? "R" : "D"}+${Math.abs(p).toFixed(1)}` : ""}${c ? ` · ${electionYear}: ${c.label}` : isUp(d) ? ` · up in ${electionYear}` : ""}`,
        };
      }),
    [districts, mode, passes, isUp, electionYear, activeYear],
  );
  const fills = useMemo(() => Object.fromEntries(boxes.filter((b) => b.fill !== NO_DATA).map((b) => [b.key, b.fill])), [boxes]);

  const shown = districts.filter(passes).length;
  const filteredRoster = useMemo(() => {
    if (!data) return roster;
    const ok = new Set(districts.filter(passes).map((d) => d.key));
    return roster.filter((d) => ok.has(d.number));
  }, [data, roster, districts, passes]);
  const mapMode: MapViewMode = mode === "projection" ? "seats" : mode;
  // The counter in the projection view: each district's seats go to its projected leader (the
  // map's colour), an uncontested seat to the only major party on the ballot, and seats not up
  // to their sitting member. Whole chamber, like the other counters.
  const projectedSeats = useMemo((): ProjectedSeats | null => {
    if (mode !== "projection") return null;
    const out: ProjectedSeats = { D: 0, R: 0, I: 0, O: 0, none: 0 };
    for (const d of districts) {
      const pr = d.projection;
      const total = d.seats ?? Math.max(d.incumbents.length, 1);
      const up = !pr || pr.contest === "not-up" ? 0 : Math.min(pr.seats, total);
      if (up > 0) {
        const winner = pr!.contest === "uncontested-D" ? "D" : pr!.contest === "uncontested-R" ? "R" : pr!.contest === "contested" && pr!.margin != null ? (pr!.margin <= 0 ? "D" : "R")
          : pr!.contest === "other" && pr!.pI === 1 ? "I" : null;
        const g = pr!.guaranteed ?? { dem: 0, rep: 0 };
        if (pr!.contest === "split" || (pr!.contest === "contested" && (g.dem || g.rep))) {
          // Seats the field decides go to their party; the rest follow the margin.
          out.D += Math.min(up, g.dem); out.R += Math.min(up - Math.min(up, g.dem), g.rep);
          const rest = Math.max(0, up - g.dem - g.rep);
          if (rest) { if (winner) out[winner] += rest; else out.none += rest; }
        } else if (pr!.contest === "independent" && pr!.indep && pr!.pI != null) {
          // The independent's one seat; a multi-member district's others go to the party's nominees.
          const party = pr!.indep.slot === "D" ? "R" : "D";
          out[pr!.pI >= 0.5 ? "I" : party] += Math.min(up, pr!.indep.seats);
          out[party] += Math.max(0, up - pr!.indep.seats);
        } else if (winner) out[winner] += up;
        else out.none += up;
      }
      // Seats not on the ballot (the whole district, or a staggered share of a multi-member one).
      for (const inc of d.incumbents.slice(0, total - up)) out[inc.party as keyof ProjectedSeats] = (out[inc.party as keyof ProjectedSeats] ?? 0) + 1;
    }
    return out;
  }, [mode, districts]);
  const fmtM = (m: number) => (Math.abs(m) < 0.05 ? "Even" : `${m > 0 ? "R" : "D"}+${Math.abs(m).toFixed(1)}`);
  const customShading = useMemo(() => {
    if (mode !== "projection") return null;
    const fill: Record<string, string> = {};
    const tip: Record<string, { label: string; value: string; color?: string }[]> = {};
    for (const d of districts) {
      const pr = d.projection;
      if (!pr || pr.contest === "not-up") { tip[d.key] = [{ label: "Not on the ballot", value: d.nextElection ? `next ${d.nextElection}` : "" }]; continue; }
      if (pr.contest === "contested" && pr.margin != null && pr.pD != null) {
        fill[d.key] = getRaceColor(pr.margin);
        tip[d.key] = [
          { label: "Projected margin", value: fmtM(pr.margin), color: pr.margin <= 0 ? "var(--party-dem)" : "var(--party-rep)" },
          { label: "Rating", value: pr.rating ?? "" },
          { label: "P(Democratic)", value: `${Math.round(pr.pD * 100)}%` },
          ...(d.candidates2026 ? [{ label: "Field", value: contest2026(d.candidates2026, d.incumbents)?.label ?? "" }] : []),
        ];
      } else if (pr.contest === "uncontested-D" || pr.contest === "uncontested-R") {
        const dem = pr.contest === "uncontested-D";
        fill[d.key] = dem ? PARTY_FILL.D : PARTY_FILL.R;
        tip[d.key] = [{ label: dem ? "No Republican on the ballot" : "No Democrat on the ballot", value: dem ? "Democratic hold/gain" : "Republican hold/gain", color: dem ? "var(--party-dem)" : "var(--party-rep)" }, ...(pr.lean != null ? [{ label: "Lean", value: fmtM(pr.lean) }] : [])];
      } else if (pr.contest === "independent" && pr.indep && pr.pI != null && pr.margin != null) {
        const opp = pr.indep.slot === "D" ? "R" : "D";
        fill[d.key] = pr.pI >= 0.5 ? PARTY_FILL.I : getRaceColor(pr.margin);
        tip[d.key] = [
          { label: "Projected margin", value: fmtIndep(pr.indep.advantage, opp), color: pr.pI >= 0.5 ? "var(--party-ind)" : PARTY_TEXT[opp] },
          { label: `P(${pr.indep.name})`, value: `${Math.round(pr.pI * 100)}%` },
          ...(d.candidates2026 ? [{ label: "Field", value: contest2026(d.candidates2026, d.incumbents)?.label ?? "" }] : []),
        ];
      } else if (pr.contest === "other" && pr.pI === 1) {
        fill[d.key] = PARTY_FILL.I;
        tip[d.key] = [{ label: "No major party on the ballot", value: "Independent", color: "var(--party-ind)" }];
      } else if (pr.contest === "split" && pr.guaranteed) {
        fill[d.key] = "#4B0082";
        tip[d.key] = [{ label: "Every seat decided by the field", value: `${pr.guaranteed.dem} D · ${pr.guaranteed.rep} R` }, ...(pr.lean != null ? [{ label: "Lean", value: fmtM(pr.lean) }] : [])];
      } else {
        tip[d.key] = [{ label: "No projection", value: pr.contest === "other" ? "nonpartisan or no major-party field" : "no candidates listed" }];
      }
    }
    const legend = ["Safe D", "Likely D", "Lean D", "Tilt D", "Tilt R", "Lean R", "Likely R", "Safe R"].map((label) => ({ label, bg: getRatingColors(label).bg }));
    return { fill, tip, legend, note: `${electionYear} projection: lean on today's lines + national environment + incumbency; solid party colour = only one major party on the ballot.` };
  }, [mode, districts, electionYear]);

  // ── District view navigation: ‹ › step through the filtered set when the district is in it ──
  const navList = useMemo(() => {
    const f = districts.filter(passes);
    return selected && f.some((d) => d.key === selected.key) ? f : districts;
  }, [districts, passes, selected]);
  const navIdx = selected ? navList.findIndex((d) => d.key === selected.key) : -1;
  const prev = navIdx > 0 ? navList[navIdx - 1] : null;
  const next = navIdx >= 0 && navIdx < navList.length - 1 ? navList[navIdx + 1] : null;
  const allKeys = useMemo(() => districts.map((d) => d.key), [districts]);
  const filtered = navList !== districts && navList.length < districts.length;

  const MODE_LABEL: Record<ColorMode, string> = { projection: `${electionYear} projection`, seats: "Seat party", president: "2024 President", results: "Past results" };
  // The selector strip, placed inside the district page just above "About this district".
  const navBtn = "h-8 w-8 shrink-0 grid place-items-center rounded-full text-base disabled:opacity-30";
  const navigator = (
    <div ref={navRef} className="flex items-center gap-5 py-4" style={{ borderTop: "1px solid var(--app-border)", borderBottom: "1px solid var(--app-border)" }}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <button type="button" className={navBtn} style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }} disabled={!prev} onClick={() => prev && select(prev.key)} aria-label={prev ? `Previous: ${prev.label}` : "Previous district"}>‹</button>
          <select
            value={selected?.key ?? ""}
            onChange={(e) => select(e.target.value)}
            aria-label="Choose a district"
            className="min-w-0 flex-1 max-w-xs text-sm px-3 py-1.5 rounded-full"
            style={{ background: "var(--app-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}
          >
            {districts.map((d) => (
              <option key={d.key} value={d.key}>
                {shortDistrictName(chamber, d.key)} · {d.incumbents.map((i) => `${i.name} (${i.party})`).join(", ") || "vacant"}
              </option>
            ))}
          </select>
          <button type="button" className={navBtn} style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }} disabled={!next} onClick={() => next && select(next.key)} aria-label={next ? `Next: ${next.label}` : "Next district"}>›</button>
        </div>
        {selected && (
          <div className="mt-2 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
            {navIdx + 1} of {navList.length}{filtered ? " filtered" : ""} districts · map colored by {MODE_LABEL[mode].toLowerCase()}{mode === "results" && activeYear ? ` (${activeYear})` : ""}; click any district to open it
          </div>
        )}
      </div>
      {data && selected && (
        <div className="w-36 sm:w-48 shrink-0">
          <LocatorMap abbr={abbr} chamber={chamber} keys={allKeys} selectedKey={selected.key} onSelect={select} fills={fills} />
        </div>
      )}
    </div>
  );


  return (
    <>
      {/* ── District view ── */}
      {inDistrict && (
        <div className="max-w-3xl mx-auto">
          <div className="mb-6">
            <button type="button" onClick={backToExplorer} className="text-sm font-semibold hover:underline" style={{ color: "var(--app-text-primary)" }}>
              ← All {chamberLabel} districts
            </button>
          </div>
          {selected && data ? (
            <AtlasDistrictDetail abbr={abbr} chamber={chamber} district={selected} eras={data.eras} electionYear={electionYear} navigator={navigator} />
          ) : (
            <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>{failed ? "The district data for this chamber could not be loaded." : "Loading district…"}</p>
          )}
        </div>
      )}

      {/* ── Explorer (kept mounted while a district is open) ── */}
      <div className={inDistrict ? "hidden" : "flex flex-col gap-8"}>
        {summary}

        <section>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-3 mb-3" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
            <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>Districts</h2>
            <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Color by">
              {(Object.keys(MODE_LABEL) as ColorMode[]).filter((m) => (m !== "projection" || hasProjection) && (m !== "results" || electionYears.length > 0)).map((m) => (
                <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className="text-xs px-2.5 py-1 rounded-full" style={pill(mode === m)}>
                  {MODE_LABEL[m]}
                </button>
              ))}
              {mode === "results" && electionYears.length > 0 && (
                <select
                  value={activeYear ?? ""}
                  onChange={(e) => setResultsYear(Number(e.target.value))}
                  aria-label="Election year"
                  className="text-xs px-2 py-1 rounded-full"
                  style={{ background: "var(--app-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)", fontWeight: 600 }}
                >
                  {electionYears.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              )}
            </div>
            <div className="flex flex-wrap gap-1" aria-label="Filter">
              {([["all", "All"], ["up", `Up in ${electionYear}`], ["competitive", "Competitive"], ["open", "Open seats"], ["unopposed", "Unopposed"]] as [Filter, string][]).filter(([f]) => (f !== "open" && f !== "unopposed") || data?.candidates2026Fetched).map(([f, label]) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className="text-xs px-2.5 py-1 rounded-full"
                  style={{ background: filter === f ? "var(--app-tab-bg)" : "transparent", color: "var(--app-text-muted)", border: "1px solid var(--app-border)", fontWeight: 600 }}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              id="atlas-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="District or legislator"
              className="text-xs px-2.5 py-1 rounded-full min-w-[180px]"
              style={{ background: "var(--app-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}
            />
            <span className="ml-auto text-xs tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
              {data ? `${shown} of ${districts.length} districts` : loading ? "Loading…" : failed ? "Data unavailable" : ""}
            </span>
          </div>
          <div className="mb-4" style={{ minHeight: 22 }}>
            <DistrictCountBar districts={roster} pres2024={pres2024} results={results} viewMode={mapMode} projected={projectedSeats} />
          </div>

          <div className="grid gap-6 grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(260px,2fr)]">
            <div className="min-w-0">
              <StateLegDistrictMap
                stateAbbr={abbr}
                stateName={stateName}
                chamber={chamber}
                isUnicameral={isUnicameral}
                mapInfo={mapInfo}
                boundaryUrl={boundaryUrl}
                boundaryNote={boundaryNote}
                districts={roster}
                pres2024={pres2024}
                results={results}
                resultsYear={mode === "results" ? activeYear : null}
                resultsSource={chamberResults?.source ?? null}
                resultsLoading={resultsLoading}
                viewMode={mapMode}
                custom={customShading}
                upcomingYear={electionYear}
                selectedKey={null}
                onSelect={select}
              />
            </div>
            <div className="min-w-0">
              {data ? (
                <DistrictBoxGrid chamber={chamber} items={boxes} selectedKey={null} onSelect={select} />
              ) : (
                <div className="h-24 rounded" style={{ background: "var(--app-tab-bg)" }} />
              )}
              <p className="mt-2 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
                {mode === "projection" && `Color is the projected ${electionYear} margin; a solid party colour means only one major party is on the ballot; dark grey is an independent favored (or no major party on the ballot); purple means every seat is decided by the field, split between the parties; light grey means no projection.`}
                {mode === "seats" && "Color is the sitting member's party; purple = members of both parties."}
                {mode === "president" && "Color is the 2024 presidential margin on today's lines."}
                {mode === "results" && `Color is the ${activeYear} result for each district number${historicalVintage ? `, on the ${activeYear} lines (which may cover different ground than today's district)` : ""}.`}
                {" "}Click a box, the map or a table row to open the district.
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-8 grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(260px,2fr)]">
          <section className="flex h-[25rem] min-w-0 flex-col md:h-[34rem]">
            <div className="mb-2 flex shrink-0 items-baseline justify-between gap-3 pb-2" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
              <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>
                {mode === "results" ? `${activeYear} ${chamberLabel} Results` : `${chamberLabel} Districts`}
              </h2>
              <span className="shrink-0 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
                {mode === "results" ? "all districts that year" : `${filteredRoster.length} district${filteredRoster.length !== 1 ? "s" : ""}`}
              </span>
            </div>
            <StateLegDistrictTable
              districts={filteredRoster}
              chamber={chamber}
              stateName={stateName}
              isUnicameral={isUnicameral}
              pres2024={pres2024}
              results={results as Record<string, StateLegDistrictResult> | null}
              resultsYear={activeYear}
              resultsLoading={resultsLoading}
              atlasHref={(key) => districtHash(chamber, key)}
              candidateHref={(name) => `/candidates/${candidateSlug(name)}-${abbr.toLowerCase()}`}
              viewMode={mapMode}
              selectedKey={null}
              onSelect={select}
            />
          </section>
          <section className="flex h-[25rem] min-w-0 flex-col md:h-[34rem]">
            <div className="mb-2 shrink-0 pb-2" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
              <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>Chamber history</h2>
            </div>
            <div className="relative min-h-0 flex-1">
              <div className="absolute inset-0 flex flex-col">
                <StateLegCompositionBox
                  houseEntries={houseEntries}
                  senateEntries={senateEntries}
                  isUnicameral={isUnicameral}
                  chamber={chamber}
                  majorityInfo={mapInfo}
                  activeYear={mode === "results" ? activeYear : null}
                  selectableYears={electionYears}
                  onSelectYear={selectYear}
                  upcoming={upcoming}
                  upcomingActive={filter === "up"}
                  onSelectUpcoming={() => setFilter((f) => (f === "up" ? "all" : "up"))}
                  seatsUpByYear={seatsUpByYear}
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
