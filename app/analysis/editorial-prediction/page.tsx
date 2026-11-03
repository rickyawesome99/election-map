import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import { AXIS_TICKS, Mark, pctOf, tickLabel } from "@/components/editorial/editorialAxis";
import { MarginReadout, SegmentBar } from "@/components/editorial/EditorialReadouts";
import { StandfirstHeader } from "@/components/StandfirstHeader";
import { governorData, senateData, type RaceForecast, type RaceType } from "@/data/forecastData";
import { THREE_WAY_RACES } from "@/data/raceEligibility";
import { statesData } from "@/data/statesData";
import { EDITORIAL_AS_OF, EDITORIAL_GENERIC_BALLOT as GB, EDITORIAL_GOVERNOR, EDITORIAL_HOUSE as HOUSE, EDITORIAL_SENATE, EDITORIAL_SENATE_COMPOSITION as SENATE_COMPOSITION, EDITORIAL_GOVERNOR_COMPOSITION as GOVERNOR_COMPOSITION, type EditorialRace } from "@/data/editorialPrediction";
import { candidatePhoto } from "@/lib/candidatePhotos";
import { candidatePageHref } from "@/lib/candidatePages";
import { fmtMargin, marginColor } from "@/lib/colorScale";
import { PAGE_CONTAINER } from "@/lib/pageLayout";
import { raceHref } from "@/lib/raceLinks";

export const metadata = {
  title: "CT Strategies Editorial Prediction — 2026 Forecast",
  description: "The CT Strategies Editorial Board's own 2026 calls: the generic ballot, the House, and every Senate and governor race it picked, against the model and the RCP average.",
};

const SERIF: CSSProperties = { fontFamily: "var(--font-serif)" };
const BOARD = "Editorial Board";
const partyVar = (p: string) => (p === "D" ? "var(--party-dem)" : p === "R" ? "var(--party-rep)" : "var(--party-ind)");

// ── The fight card ────────────────────────────────────────────────────────────
type Fighter = { name: string; party: string; photo: string | null; href: string | null; winner: boolean };

function FighterCard({ f, compact }: { f: Fighter; compact: boolean }) {
  const color = partyVar(f.party);
  const parts = f.name.split(" ");
  const last = parts.length > 1 ? parts.slice(-1)[0] : f.name;
  const first = parts.length > 1 ? parts.slice(0, -1).join(" ") : "";
  const w = compact ? "clamp(5.4rem, 24vw, 9.5rem)" : "clamp(7.5rem, 31vw, 12rem)";
  const photo = (
    <div className="ed-photo relative overflow-hidden rounded-md" style={{ width: w, aspectRatio: "4 / 5", border: `3px solid ${color}`, boxShadow: f.winner ? `0 14px 34px -10px color-mix(in srgb, ${color} 70%, transparent), 0 0 0 4px color-mix(in srgb, ${color} 22%, transparent)` : "none", background: "var(--app-tab-bg)" }}>
      {f.photo ? (
        <Image src={f.photo} alt={f.name} width={400} height={500} className="h-full w-full object-cover object-top" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-3xl font-bold" style={{ color }}>{last[0]}</div>
      )}
      {f.winner && (
        <span className="absolute inset-x-0 bottom-0 py-1 text-center text-[9px] font-extrabold uppercase tracking-[0.18em] text-white sm:text-[10px]" style={{ background: color }}>Board pick</span>
      )}
    </div>
  );
  return (
    <div className="ed-fighter flex min-w-0 flex-col items-center text-center">
      {f.href ? <Link href={f.href} prefetch={false} aria-label={`${f.name}: candidate page`}>{photo}</Link> : photo}
      <div className="mt-2.5 text-[11px] font-semibold uppercase tracking-wider sm:text-xs" style={{ color: "var(--app-text-muted)" }}>{first}</div>
      <div className="font-extrabold uppercase leading-none" style={{ fontSize: compact ? "clamp(0.95rem, 3.6vw, 1.35rem)" : "clamp(1.15rem, 4.6vw, 1.7rem)", letterSpacing: "-0.01em", color: "var(--app-text-primary)" }}>{last}</div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-widest" style={{ color }}>{f.party === "D" ? "Democrat" : f.party === "R" ? "Republican" : "Independent"}</div>
      {f.href && <span className="ed-profile mt-1.5 text-[11px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Candidate page →</span>}
    </div>
  );
}

function Vs({ compact }: { compact: boolean }) {
  return (
    <div className="flex shrink-0 flex-col items-center self-center pb-14" aria-hidden>
      <span className="ed-vs inline-block font-black italic leading-none" style={{ ...SERIF, fontSize: compact ? "clamp(1.4rem, 5vw, 2.2rem)" : "clamp(2rem, 8vw, 3.6rem)", letterSpacing: "-0.04em", color: "var(--app-text-primary)" }}>VS</span>
    </div>
  );
}

function FightCard({ fighters, stateName }: { fighters: Fighter[]; stateName: string }) {
  const compact = fighters.length > 2;
  // Each side's tint, left to right in fighter order, meeting at a hard diagonal: the card's "split screen".
  const left = partyVar(fighters[0].party), right = partyVar(fighters[fighters.length - 1].party);
  return (
    <div className="ed-card relative overflow-hidden rounded-xl px-3 pb-5 pt-6 sm:px-8 sm:pt-8" style={{ background: `linear-gradient(105deg, color-mix(in srgb, ${left} 26%, var(--app-bg)) 0%, color-mix(in srgb, ${left} 8%, var(--app-bg)) 49.8%, color-mix(in srgb, ${right} 8%, var(--app-bg)) 50.2%, color-mix(in srgb, ${right} 26%, var(--app-bg)) 100%)` }}>
      <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center select-none font-black uppercase" style={{ ...SERIF, fontSize: "clamp(3.5rem, 15vw, 8.5rem)", letterSpacing: "-0.04em", lineHeight: 1, color: "color-mix(in srgb, var(--app-text-primary) 5%, transparent)", whiteSpace: "nowrap" }}>{stateName}</span>
      <div className="relative flex items-start justify-center gap-2 sm:gap-6">
        {fighters.map((f, i) => (
          <div key={f.name} className="contents">
            {i > 0 && <Vs compact={compact} />}
            <FighterCard f={f} compact={compact} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Races ─────────────────────────────────────────────────────────────────────
type Resolved = EditorialRace & { anchor: string; abbr: string; stateName: string; href: string; fighters: Fighter[] };

function resolve(raceType: RaceType, data: RaceForecast[], races: EditorialRace[]): Resolved[] {
  const office = raceType === "senate" ? "S" : "G";
  return races.map((e) => {
    const race = data.find((r) => r.id === e.id);
    if (!race?.candidates) throw new Error(`editorialPrediction: no ${raceType} race ${e.id} with candidates`);
    const abbr = e.id.replace(/-\d+$/, "");
    const stateName = statesData.find((s) => s.abbr === abbr)?.name ?? race.state;
    const third = THREE_WAY_RACES[`${office}:${e.id}`];
    const demSide = [race.candidates.dem, ...(third ? [{ name: third.name, party: third.party }] : [])];
    const fighters: Fighter[] = [
      // A third candidate sits on the side of the party they belong to, outside the slot they share it with.
      ...[...demSide].reverse().map((c, i, arr) => ({ ...c, winner: e.pick < 0 && i === arr.length - 1 })),
      { ...race.candidates.rep, winner: e.pick > 0 },
    ].map((c) => ({ name: c.name, party: c.party, winner: c.winner, photo: candidatePhoto(c.name, abbr), href: candidatePageHref(c.name, abbr) }));
    return { ...e, abbr, stateName, anchor: `${raceType}-${abbr.toLowerCase()}`, href: raceHref(raceType, race), fighters };
  });
}

function RaceBlock({ r, n, office }: { r: Resolved; n: number; office: string }) {
  return (
    <article id={r.anchor} className="scroll-mt-28 pt-12 first:pt-4">
      <div className="mb-4 flex items-baseline gap-3 pb-2" style={{ borderBottom: "1px solid var(--app-border)" }}>
        <span className="text-[13px] font-bold tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{String(n).padStart(2, "0")}</span>
        <h3 className="text-[24px] font-bold leading-tight sm:text-[30px]" style={{ ...SERIF, letterSpacing: "-0.015em" }}>{r.stateName}</h3>
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>{office}</span>
      </div>
      <FightCard fighters={r.fighters} stateName={r.stateName} />
      <div className="mt-6"><MarginReadout model={r.model} rcp={r.rcp} pick={r.pick} modelHref={r.href} /></div>
      <p className="mt-5 text-[17px] leading-[1.65] sm:text-[18px]" style={{ ...SERIF, textWrap: "pretty" }}>{r.text}</p>
    </article>
  );
}

// Every race of the section on one axis, in the board's order: a row per race, linked to its block.
function AtAGlance({ races }: { races: Resolved[] }) {
  return (
    <div className="mt-2">
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] font-semibold" style={{ color: "var(--app-text-muted)" }}>
        <span className="flex items-center gap-1.5"><Mark kind="model" v={0} size={10} />Model</span>
        <span className="flex items-center gap-1.5"><Mark kind="rcp" v={0} size={10} />RCP average</span>
        <span className="flex items-center gap-1.5"><Mark kind="pick" v={-1} size={10} />{BOARD}</span>
      </div>
      {races.map((r) => (
        <div key={r.anchor} className="ed-row grid grid-cols-[2.25rem_minmax(0,1fr)_3.6rem] items-center gap-2 rounded-sm px-1 py-[3px] sm:grid-cols-[8.5rem_minmax(0,1fr)_4rem] sm:gap-4">
          <a href={`#${r.anchor}`} className="truncate text-[12px] font-bold hover:underline sm:text-[13px]"><span className="sm:hidden">{r.abbr}</span><span className="hidden sm:inline">{r.stateName}</span></a>
          <MarginReadout model={r.model} rcp={r.rcp} pick={r.pick} figures={false} ticks={false} height={22} />
          <a href={`#${r.anchor}`} className="text-right text-[13px] font-bold tabular-nums hover:underline" style={{ color: marginColor(r.pick) }}>{fmtMargin(r.pick).replace(".0", "")}</a>
        </div>
      ))}
      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_3.6rem] gap-2 px-1 sm:grid-cols-[8.5rem_minmax(0,1fr)_4rem] sm:gap-4">
        <span />
        <div className="relative h-4 text-[10px] font-semibold tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
          {AXIS_TICKS.map((t) => <span key={t} className="absolute top-1 -translate-x-1/2 whitespace-nowrap" style={{ left: `${pctOf(t)}%` }}>{tickLabel(t)}</span>)}
        </div>
      </div>
    </div>
  );
}

// A chamber's composition call in big type, D first, over a seat bar with the majority line marked.
function Composition({ dem, rep, line, pill, tips, unit = "seats" }: { dem: number; rep: number; line: number; pill?: string; tips?: [string, string]; unit?: string }) {
  const total = dem + rep;
  return (
    <>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex items-baseline gap-3 font-black tabular-nums leading-none" style={{ ...SERIF, fontSize: "clamp(3.2rem, 12vw, 6rem)", letterSpacing: "-0.04em" }}>
          <span style={{ color: "var(--party-dem)" }}>{dem}<span className="ml-1 text-[0.35em] font-bold">D</span></span>
          <span className="text-[0.5em]" style={{ color: "var(--app-text-very-muted)" }}>–</span>
          <span style={{ color: "var(--party-rep)" }}>{rep}<span className="ml-1 text-[0.35em] font-bold">R</span></span>
        </div>
        {pill && <span className="mb-2 rounded-full px-3 py-1 text-[12px] font-extrabold uppercase tracking-wider text-white" style={{ background: "var(--party-dem)" }}>{pill}</span>}
      </div>
      <div className="mt-4">
        <SegmentBar height={24} ariaLabel={`${dem} Democratic ${unit}, ${rep} Republican ${unit}`} marker={{ pct: (line / total) * 100, label: String(line) }} segments={[
          { key: "dem", width: (dem / total) * 100, color: "var(--party-dem)", tip: tips?.[0] ?? `Democrats ${dem}` },
          { key: "rep", width: (rep / total) * 100, color: "var(--party-rep)", tip: tips?.[1] ?? `Republicans ${rep}` },
        ]} />
      </div>
    </>
  );
}

function SectionTitle({ id, kicker, title }: { id: string; kicker: string; title: string }) {
  return (
    <div id={id} className="scroll-mt-28 pt-16">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--app-text-muted)" }}>{kicker}</div>
      <h2 className="mt-1 pb-3 font-bold leading-[0.95]" style={{ ...SERIF, fontSize: "clamp(2rem, 6vw, 3.4rem)", letterSpacing: "-0.025em", borderBottom: "2px solid var(--app-text-primary)" }}>{title}</h2>
    </div>
  );
}

export default function EditorialPredictionPage() {
  const senate = resolve("senate", senateData, EDITORIAL_SENATE);
  const governor = resolve("governor", governorData, EDITORIAL_GOVERNOR);
  const jump = [["generic-ballot", "Generic Ballot"], ["house", "House"], ["senate", "Senate"], ["governor", "Governor"]];

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <main className={`${PAGE_CONTAINER} pb-20 pt-6`}>
        <StandfirstHeader kicker="Editorial" title="CT Strategies Editorial Prediction" bare />
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
          <span>By the <b style={{ color: "var(--app-text-primary)" }}>CT Strategies Editorial Board</b></span>
          <span aria-hidden>·</span>
          <span>{EDITORIAL_AS_OF}</span>
        </div>
        <nav className="mt-5 flex flex-wrap gap-2" aria-label="Sections">
          {jump.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="rounded-full px-3 py-1 text-[12px] font-bold transition-colors hover:bg-[color-mix(in_srgb,var(--app-text-primary)_10%,var(--app-tab-bg))]" style={{ background: "var(--app-tab-bg)", border: "1px solid var(--app-border)" }}>{label}</a>
          ))}
        </nav>

        <div className="mt-8 font-black leading-none tabular-nums" aria-hidden style={{ ...SERIF, fontSize: "clamp(5rem, 22vw, 11rem)", letterSpacing: "-0.05em", background: "linear-gradient(100deg, var(--party-dem) 20%, var(--party-rep) 85%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>2026</div>

        {/* ── Generic ballot ── */}
        <SectionTitle id="generic-ballot" kicker="The national environment" title="Generic Ballot" />
        <div className="mt-6"><MarginReadout model={GB.model} rcp={GB.rcp} pick={GB.pick} modelHref="/analysis/generic-ballot" modelLabel="Model final" /></div>
        <div className="mt-10">
          <LedgerSectionHead label="Trump approval · RCP" meta={<b className="tabular-nums" style={{ color: "var(--party-dem)" }}>{GB.approval.net}</b>} />
          <div className="flex items-end justify-between gap-4">
            <div><div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Approve</div><div className="text-[30px] font-bold leading-none tabular-nums sm:text-[40px]" style={{ ...SERIF, color: "var(--party-rep)" }}>{GB.approval.approve}</div></div>
            <div className="text-right"><div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Disapprove</div><div className="text-[30px] font-bold leading-none tabular-nums sm:text-[40px]" style={{ ...SERIF, color: "var(--party-dem)" }}>{GB.approval.disapprove}</div></div>
          </div>
          <div className="mt-3">
            <SegmentBar ariaLabel={`Approve ${GB.approval.approve}, disapprove ${GB.approval.disapprove}`} segments={[
              { key: "approve", width: GB.approval.approve, color: "var(--party-rep)", tip: `Approve ${GB.approval.approve}` },
              { key: "gap", width: 100 - GB.approval.approve - GB.approval.disapprove, color: "var(--app-border)" },
              { key: "disapprove", width: GB.approval.disapprove, color: "var(--party-dem)", tip: `Disapprove ${GB.approval.disapprove}` },
            ]} />
          </div>
        </div>

        {/* ── House ── */}
        <SectionTitle id="house" kicker="435 seats · 218 for control" title="House" />
        <Composition dem={HOUSE.dem} rep={HOUSE.rep} line={218} pill={`D net ${HOUSE.demNetFlips} flips`} tips={[`Democrats ${HOUSE.dem} · ${HOUSE.dem - 218} over 218`, `Republicans ${HOUSE.rep} · ${218 - HOUSE.rep} short of 218`]} />
        <p className="mt-6 text-[17px] leading-[1.65] sm:text-[18px]" style={{ ...SERIF, textWrap: "pretty" }}>{HOUSE.text}</p>
        <Link href="/house" prefetch={false} className="mt-3 inline-block text-[13px] font-bold hover:underline" style={{ color: "var(--party-dem)" }}>The model&rsquo;s House forecast →</Link>

        {/* ── Senate ── */}
        <SectionTitle id="senate" kicker={`${senate.length} races`} title="Senate Order of Operations" />
        <Composition dem={SENATE_COMPOSITION.dem} rep={SENATE_COMPOSITION.rep} line={50} unit="seats" />
        <div className="mt-10"><AtAGlance races={senate} /></div>
        {senate.map((r, i) => <RaceBlock key={r.anchor} r={r} n={i + 1} office="U.S. Senate" />)}

        {/* ── Governor ── */}
        <SectionTitle id="governor" kicker={`${governor.length} races`} title="Governor Order of Operations" />
        <Composition dem={GOVERNOR_COMPOSITION.dem} rep={GOVERNOR_COMPOSITION.rep} line={25} unit="governorships" />
        <div className="mt-10"><AtAGlance races={governor} /></div>
        {governor.map((r, i) => <RaceBlock key={r.anchor} r={r} n={i + 1} office="Governor" />)}
      </main>
    </div>
  );
}
