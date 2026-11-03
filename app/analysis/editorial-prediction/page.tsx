import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import { StandfirstHeader } from "@/components/StandfirstHeader";
import { governorData, senateData, type RaceForecast, type RaceType } from "@/data/forecastData";
import { THREE_WAY_RACES } from "@/data/raceEligibility";
import { statesData } from "@/data/statesData";
import { EDITORIAL_AS_OF, EDITORIAL_GENERIC_BALLOT as GB, EDITORIAL_GOVERNOR, EDITORIAL_HOUSE as HOUSE, EDITORIAL_SENATE, type EditorialRace } from "@/data/editorialPrediction";
import { candidatePhoto } from "@/lib/candidatePhotos";
import { candidatePageHref } from "@/lib/candidatePages";
import { fmtLean, fmtMargin, leanColor, marginColor } from "@/lib/colorScale";
import { PAGE_CONTAINER } from "@/lib/pageLayout";
import { raceHref } from "@/lib/raceLinks";

export const metadata = {
  title: "CT Strategies Editorial Prediction — 2026 Forecast",
  description: "The CT Strategies Editorial Board's own 2026 calls: the generic ballot, the House, and every Senate and governor race it picked, against the model and the RCP average.",
};

const SERIF: CSSProperties = { fontFamily: "var(--font-serif)" };
const BOARD = "Editorial Board";
const partyVar = (p: string) => (p === "D" ? "var(--party-dem)" : p === "R" ? "var(--party-rep)" : "var(--party-ind)");

// ── The three marks: Model (dot), RCP (diamond), the board's call (square) ─────
// Shape carries identity, so no mark depends on color alone; the board's call is the only filled-in-party mark.
function Mark({ kind, v, size = 12 }: { kind: "model" | "rcp" | "pick"; v: number; size?: number }) {
  if (kind === "model") return <span aria-hidden className="inline-block rounded-full" style={{ width: size, height: size, background: "var(--app-text-muted)", border: "2px solid var(--app-bg)", boxShadow: "0 0 0 1px var(--app-text-muted)" }} />;
  if (kind === "rcp") return <span aria-hidden className="inline-block rotate-45" style={{ width: size * 0.82, height: size * 0.82, background: "var(--app-bg)", border: "2px solid var(--app-text-primary)" }} />;
  return <span aria-hidden className="inline-block" style={{ width: size + 2, height: size + 2, background: marginColor(v), border: "2px solid var(--app-text-primary)" }} />;
}

// One margin axis, D+16 on the left to R+16 on the right, EVEN in the middle.
const AXIS = 16;
const pctOf = (v: number) => 50 + (Math.max(-AXIS, Math.min(AXIS, v)) / AXIS) * 50;

function MarginStrip({ model, rcp, pick, ticks = true, height = 34 }: { model: number; rcp: number | null; pick: number; ticks?: boolean; height?: number }) {
  const at = (v: number, z: number, node: ReactNode) => (
    <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 leading-none" style={{ left: `${pctOf(v)}%`, zIndex: z }}>{node}</span>
  );
  return (
    <div>
      <div className="relative rounded-sm" style={{ height, background: "linear-gradient(90deg, color-mix(in srgb, var(--party-dem) 16%, var(--app-bg)) 0%, var(--app-bg) 50%, color-mix(in srgb, var(--party-rep) 16%, var(--app-bg)) 100%)" }}>
        <span className="absolute inset-y-0 left-1/2 w-px" style={{ background: "var(--app-text-very-muted)" }} />
        {[-10, -5, 5, 10].map((t) => <span key={t} className="absolute inset-y-[30%] w-px" style={{ left: `${pctOf(t)}%`, background: "var(--app-border)" }} />)}
        {at(model, 1, <Mark kind="model" v={model} />)}
        {rcp != null && at(rcp, 2, <Mark kind="rcp" v={rcp} />)}
        {at(pick, 3, <Mark kind="pick" v={pick} size={14} />)}
      </div>
      {ticks && (
        <div className="relative mt-1 h-4 text-[10px] font-semibold tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
          {[-15, -10, -5, 0, 5, 10, 15].map((t) => (
            <span key={t} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${pctOf(t)}%` }}>{t === 0 ? "EVEN" : `${t < 0 ? "D" : "R"}+${Math.abs(t)}`}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// The three figures over a strip: Model (linked to its page), RCP, and the board's call set large.
function Figures({ model, rcp, pick, modelHref, modelLabel = "Model" }: { model: number; rcp: number | null; pick: number; modelHref: string; modelLabel?: string }) {
  const label = (kind: "model" | "rcp" | "pick", v: number, text: string) => (
    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}><Mark kind={kind} v={v} size={9} />{text}</div>
  );
  return (
    <div className="grid grid-cols-[1fr_1fr_1.4fr] items-end gap-3 sm:gap-6">
      <Link href={modelHref} prefetch={false} className="group min-w-0">
        {label("model", model, modelLabel)}
        <div className="mt-1 text-[22px] font-bold tabular-nums leading-none sm:text-[28px]" style={{ color: marginColor(model) }}>{fmtMargin(model)}</div>
        <div className="mt-1.5 text-[11px] font-semibold group-hover:underline" style={{ color: "var(--app-text-muted)" }}>Full forecast →</div>
      </Link>
      <div className="min-w-0">
        {label("rcp", rcp ?? 0, "RCP average")}
        <div className="mt-1 text-[22px] font-bold tabular-nums leading-none sm:text-[28px]" style={{ color: rcp == null ? "var(--app-text-very-muted)" : leanColor(rcp) }}>{rcp == null ? "N/A" : fmtLean(rcp)}</div>
        <div className="mt-1.5 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{rcp == null ? "No average" : " "}</div>
      </div>
      <div className="min-w-0 pl-3 sm:pl-6" style={{ borderLeft: "2px solid var(--app-text-primary)" }}>
        {label("pick", pick, BOARD)}
        <div className="mt-1 font-bold tabular-nums leading-[0.9]" style={{ ...SERIF, fontSize: "clamp(2.4rem, 7vw, 3.6rem)", letterSpacing: "-0.03em", color: marginColor(pick) }}>{fmtMargin(pick).replace(".0", "")}</div>
      </div>
    </div>
  );
}

// ── The fight card ────────────────────────────────────────────────────────────
type Fighter = { name: string; party: string; photo: string | null; href: string | null; winner: boolean };

function FighterCard({ f, compact }: { f: Fighter; compact: boolean }) {
  const color = partyVar(f.party);
  const parts = f.name.split(" ");
  const last = parts.length > 1 ? parts.slice(-1)[0] : f.name;
  const first = parts.length > 1 ? parts.slice(0, -1).join(" ") : "";
  const w = compact ? "clamp(5.4rem, 24vw, 9.5rem)" : "clamp(7.5rem, 31vw, 12rem)";
  const photo = (
    <div className="relative overflow-hidden rounded-md" style={{ width: w, aspectRatio: "4 / 5", border: `3px solid ${color}`, boxShadow: f.winner ? `0 14px 34px -10px color-mix(in srgb, ${color} 70%, transparent), 0 0 0 4px color-mix(in srgb, ${color} 22%, transparent)` : "none", background: "var(--app-tab-bg)" }}>
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
    <div className="flex min-w-0 flex-col items-center text-center">
      {f.href ? <Link href={f.href} prefetch={false}>{photo}</Link> : photo}
      <div className="mt-2.5 text-[11px] font-semibold uppercase tracking-wider sm:text-xs" style={{ color: "var(--app-text-muted)" }}>{first}</div>
      <div className="font-extrabold uppercase leading-none" style={{ fontSize: compact ? "clamp(0.95rem, 3.6vw, 1.35rem)" : "clamp(1.15rem, 4.6vw, 1.7rem)", letterSpacing: "-0.01em", color: "var(--app-text-primary)" }}>{last}</div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-widest" style={{ color }}>{f.party === "D" ? "Democrat" : f.party === "R" ? "Republican" : "Independent"}</div>
    </div>
  );
}

function Vs({ compact }: { compact: boolean }) {
  return (
    <div className="flex shrink-0 flex-col items-center self-center pb-14" aria-hidden>
      <span className="font-black italic leading-none" style={{ ...SERIF, fontSize: compact ? "clamp(1.4rem, 5vw, 2.2rem)" : "clamp(2rem, 8vw, 3.6rem)", letterSpacing: "-0.04em", color: "var(--app-text-primary)" }}>VS</span>
    </div>
  );
}

function FightCard({ fighters, stateName }: { fighters: Fighter[]; stateName: string }) {
  const compact = fighters.length > 2;
  // Each side's tint, left to right in fighter order, meeting at a hard diagonal: the card's "split screen".
  const left = partyVar(fighters[0].party), right = partyVar(fighters[fighters.length - 1].party);
  return (
    <div className="relative overflow-hidden rounded-xl px-3 pb-5 pt-6 sm:px-8 sm:pt-8" style={{ background: `linear-gradient(105deg, color-mix(in srgb, ${left} 26%, var(--app-bg)) 0%, color-mix(in srgb, ${left} 8%, var(--app-bg)) 49.8%, color-mix(in srgb, ${right} 8%, var(--app-bg)) 50.2%, color-mix(in srgb, ${right} 26%, var(--app-bg)) 100%)` }}>
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
      <div className="mt-6"><Figures model={r.model} rcp={r.rcp} pick={r.pick} modelHref={r.href} /></div>
      <div className="mt-4"><MarginStrip model={r.model} rcp={r.rcp} pick={r.pick} /></div>
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
        <a key={r.anchor} href={`#${r.anchor}`} className="grid grid-cols-[2.25rem_minmax(0,1fr)_3.6rem] items-center gap-2 py-[3px] hover:opacity-80 sm:grid-cols-[8.5rem_minmax(0,1fr)_4rem] sm:gap-4">
          <span className="truncate text-[12px] font-bold sm:text-[13px]"><span className="sm:hidden">{r.abbr}</span><span className="hidden sm:inline">{r.stateName}</span></span>
          <MarginStrip model={r.model} rcp={r.rcp} pick={r.pick} ticks={false} height={22} />
          <span className="text-right text-[13px] font-bold tabular-nums" style={{ color: marginColor(r.pick) }}>{fmtMargin(r.pick).replace(".0", "")}</span>
        </a>
      ))}
      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_3.6rem] gap-2 sm:grid-cols-[8.5rem_minmax(0,1fr)_4rem] sm:gap-4">
        <span />
        <div className="relative h-4 text-[10px] font-semibold tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
          {[-15, -10, -5, 0, 5, 10, 15].map((t) => (
            <span key={t} className="absolute top-1 -translate-x-1/2 whitespace-nowrap" style={{ left: `${pctOf(t)}%` }}>{t === 0 ? "EVEN" : `${t < 0 ? "D" : "R"}+${Math.abs(t)}`}</span>
          ))}
        </div>
      </div>
    </div>
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
  const totalSeats = HOUSE.dem + HOUSE.rep;
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
        <div className="mt-6"><Figures model={GB.model} rcp={GB.rcp} pick={GB.pick} modelHref="/analysis/generic-ballot" modelLabel="Model final" /></div>
        <div className="mt-4"><MarginStrip model={GB.model} rcp={GB.rcp} pick={GB.pick} /></div>
        <div className="mt-10">
          <LedgerSectionHead label="Trump approval · RCP" meta={<b className="tabular-nums" style={{ color: "var(--party-dem)" }}>{GB.approval.net}</b>} />
          <div className="flex items-end justify-between gap-4">
            <div><div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Approve</div><div className="text-[30px] font-bold leading-none tabular-nums sm:text-[40px]" style={{ ...SERIF, color: "var(--party-rep)" }}>{GB.approval.approve}</div></div>
            <div className="text-right"><div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Disapprove</div><div className="text-[30px] font-bold leading-none tabular-nums sm:text-[40px]" style={{ ...SERIF, color: "var(--party-dem)" }}>{GB.approval.disapprove}</div></div>
          </div>
          <div className="mt-3 flex h-4 overflow-hidden rounded-sm" role="img" aria-label={`Approve ${GB.approval.approve}, disapprove ${GB.approval.disapprove}`}>
            <span style={{ width: `${GB.approval.approve}%`, background: "var(--party-rep)" }} />
            <span className="flex-1" style={{ background: "var(--app-border)" }} />
            <span style={{ width: `${GB.approval.disapprove}%`, background: "var(--party-dem)" }} />
          </div>
        </div>

        {/* ── House ── */}
        <SectionTitle id="house" kicker="435 seats · 218 for control" title="House" />
        <div className="mt-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="flex items-baseline gap-3 font-black tabular-nums leading-none" style={{ ...SERIF, fontSize: "clamp(3.2rem, 12vw, 6rem)", letterSpacing: "-0.04em" }}>
            <span style={{ color: "var(--party-dem)" }}>{HOUSE.dem}<span className="ml-1 text-[0.35em] font-bold">D</span></span>
            <span className="text-[0.5em]" style={{ color: "var(--app-text-very-muted)" }}>–</span>
            <span style={{ color: "var(--party-rep)" }}>{HOUSE.rep}<span className="ml-1 text-[0.35em] font-bold">R</span></span>
          </div>
          <span className="mb-2 rounded-full px-3 py-1 text-[12px] font-extrabold uppercase tracking-wider text-white" style={{ background: "var(--party-dem)" }}>D net {HOUSE.demNetFlips} flips</span>
        </div>
        <div className="relative mt-4">
          <div className="flex h-6 overflow-hidden rounded-sm" role="img" aria-label={`${HOUSE.dem} Democratic seats, ${HOUSE.rep} Republican seats`}>
            <span style={{ width: `${(HOUSE.dem / totalSeats) * 100}%`, background: "var(--party-dem)" }} />
            <span className="flex-1" style={{ background: "var(--party-rep)" }} />
          </div>
          <span className="absolute -top-1.5 h-9 w-[2px]" style={{ left: `${(218 / totalSeats) * 100}%`, background: "var(--app-text-primary)" }} />
          <div className="relative mt-1 h-4 text-[10px] font-bold tabular-nums" style={{ color: "var(--app-text-muted)" }}>
            <span className="absolute -translate-x-1/2" style={{ left: `${(218 / totalSeats) * 100}%` }}>218</span>
          </div>
        </div>
        <p className="mt-6 text-[17px] leading-[1.65] sm:text-[18px]" style={{ ...SERIF, textWrap: "pretty" }}>{HOUSE.text}</p>
        <Link href="/house" prefetch={false} className="mt-3 inline-block text-[13px] font-bold hover:underline" style={{ color: "var(--party-dem)" }}>The model&rsquo;s House forecast →</Link>

        {/* ── Senate ── */}
        <SectionTitle id="senate" kicker={`${senate.length} races`} title="Senate Order of Operations" />
        <AtAGlance races={senate} />
        {senate.map((r, i) => <RaceBlock key={r.anchor} r={r} n={i + 1} office="U.S. Senate" />)}

        {/* ── Governor ── */}
        <SectionTitle id="governor" kicker={`${governor.length} races`} title="Governor Order of Operations" />
        <AtAGlance races={governor} />
        {governor.map((r, i) => <RaceBlock key={r.anchor} r={r} n={i + 1} office="Governor" />)}
      </main>
    </div>
  );
}
