"use client";

import StateGlyph from "@/components/results/StateGlyph";
import { flipBackground } from "@/components/FlipStripes";
import { partyVotes } from "@/lib/resultsNeedle";
import { callSideColor, fmtCall, fmtIn, fmtInt, inColor, inState, partyColor } from "@/lib/resultsFormat";
import type { LegChamberResult, LegSeats, PostElectionRow } from "@/lib/postElectionTypes";
import type { Party } from "@/lib/resultsTypes";

// One state's profile on /analysis/post-election: its count, then its race cards. Began as a copy of
// the Results page's By state view and is now this page's own.

const muted = { color: "var(--app-text-muted)" };
const veryMuted = { color: "var(--app-text-very-muted)" };

const TILT_DEG = 7;

export function tiltCard(el: HTMLElement, clientX: number, clientY: number) {
  const r = el.getBoundingClientRect();
  const x = (clientX - r.left) / r.width, y = (clientY - r.top) / r.height;
  el.style.setProperty("--rx", `${((x - 0.5) * TILT_DEG).toFixed(2)}deg`);
  el.style.setProperty("--ry", `${((0.5 - y) * TILT_DEG).toFixed(2)}deg`);
}

export function untiltCard(el: HTMLElement) {
  el.style.setProperty("--rx", "0deg");
  el.style.setProperty("--ry", "0deg");
}

function tiltToPointer(e: React.PointerEvent<HTMLElement>) {
  if (e.pointerType === "mouse") tiltCard(e.currentTarget, e.clientX, e.clientY);
}

function resetTilt(e: React.PointerEvent<HTMLElement>) {
  if (e.pointerType === "mouse") untiltCard(e.currentTarget);
}

/** A race's key, and on the 2026 page its hash on /results (as raceHash). */
export const rowKey = (p: PostElectionRow["prior"]) => `${p.office}-${p.id}`;

/** Two years before, as the page's headings write it: "24". */
const prevYY = (year: number) => String(year - 2).slice(2);

/** A state's races in card order: president, governor, Senate, then House by district. */
export function sortStateRows<R extends PostElectionRow>(rows: R[]): R[] {
  const order = { president: 0, governor: 1, senate: 2, house: 3 };
  return [...rows].sort((a, b) => order[a.prior.office] - order[b.prior.office] || Number(a.prior.special) - Number(b.prior.special) || a.prior.label.localeCompare(b.prior.label, "en", { numeric: true }));
}

function RaceCard({ row, popularVote, year, onSelect, index }: { row: PostElectionRow; popularVote: number | null; year: number; onSelect: (r: PostElectionRow) => void; index: number }) {
  const { prior, proj, live, housePrev, past } = row;
  const hasVotes = !!live && live.total > 0;
  const office = prior.office === "house" ? "House" : prior.office === "senate" ? `Senate${prior.special ? " special" : ""}` : prior.office === "president" ? "President" : "Governor";
  const name = prior.office === "house" ? prior.label : office;
  const ratingColor = prior.forecast.rating.startsWith("Toss") ? "var(--app-text-primary)" : prior.forecast.rating.endsWith("D") ? "var(--party-dem)" : "var(--party-rep)";
  // A called race fills its box with the winner's colour (as the race table's winner bar), every
  // figure in white over it.
  const won = proj.locked && proj.winner ? proj.winner : null;
  // A called race the other party held is a flip: "Flip" in place of "Called" and the maps' flip
  // stripes over the fill, at 3× and fainter so the figures stay readable (as the chamber tally's called flips).
  const flipped = !!won && !!prior.seatParty && won !== prior.seatParty;
  const fill = won === "R" ? "var(--party-rep-fill)" : won === "I" ? "var(--party-ind-fill)" : won === "D" ? "var(--party-dem-fill)" : null;
  const on = (c: string) => (fill ? "#ffffff" : c);
  const soft = fill ? { color: "rgba(255,255,255,0.82)" } : null;
  const counted = hasVotes ? Math.min(100, proj.countedShare * 100) : 0;
  const current = fmtCall(proj.currentMargin, prior);
  const projected = fmtCall(proj.margin, prior);
  // The figure over the projection, in margin terms: a House seat's swing from 2024, or how far a
  // statewide race ran ahead of the state's House popular vote.
  const isHouse = prior.office === "house";
  const compareTo = isHouse ? housePrev?.margin ?? null : popularVote;
  const compared = proj.currentMargin != null && compareTo != null ? proj.currentMargin - compareTo : null;
  const comparedTitle = isHouse
    ? (housePrev ? `${year - 2}: ${fmtCall(housePrev.margin)}${housePrev.estimated ? `, estimated on the ${year} lines` : ""}` : `No ${year - 2} or ${year} Democrat vs Republican race to compare`)
    : `${office} margin minus the state's House popular vote margin (${fmtCall(popularVote)})`;
  // Motion (globals.css rc-*): the cards rise in staggered, a figure rolls in whenever it changes
  // (keyed on its text), the call fades the fill in and pops its badge, a race still counting
  // pulses a dot, and the bar along the bottom fills with the count. Under a mouse or a finger
  // (useTouchHover) the card tilts toward the pointer (CSS variables set here, no re-render) and darkens.
  return (
    <button onClick={() => onSelect(row)} onPointerMove={tiltToPointer} onPointerLeave={resetTilt} data-touch-hover="" data-filled={fill ? "" : undefined} className={`rc-card group block h-full w-full self-start py-1.5 pl-3 text-left align-top${fill ? " rounded-r-md pr-2" : ""}`}
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms`, borderLeft: `1px solid ${fill ?? "var(--app-border)"}`, backgroundColor: fill ?? undefined, backgroundImage: flipped ? flipBackground("linear-gradient(transparent, transparent)", 3, "rgba(255,255,255,0.18)") : undefined, color: fill ? "#ffffff" : undefined }}>
      <div className="flex min-h-full flex-col justify-start">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[15px] font-semibold">{name}</span>
          {hasVotes && !won && <span className="rc-live" style={{ color: callSideColor(proj.currentMargin, prior) }} title="Counting" />}
        </span>
        {won && (!past || flipped) && <span key={won} className="rc-badge font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: on(partyColor(won)) }} title={flipped ? `${past ? "Flips" : "Called; flips"} a seat ${prior.seatParty} ${past ? "won last time" : "held"}` : undefined}>{flipped ? "Flip" : "Called"}</span>}
      </div>
      {hasVotes ? (
        <>
          <div className="rc-figure mt-1 overflow-hidden text-xl font-extrabold leading-none tabular-nums"><span key={current} className="rc-tick" style={{ color: on(callSideColor(proj.currentMargin, prior)) }}>{current}</span></div>
          <div className="mt-1 truncate text-[11px] tabular-nums" style={soft ?? veryMuted} title={comparedTitle}>{isHouse ? "Swing" : "Vs. GB"} <b style={{ color: on(callSideColor(compared, prior)) }}>{fmtCall(compared, prior)}{compared != null && housePrev?.estimated && "*"}</b></div>
          {past
            ? <div className="overflow-hidden text-xs tabular-nums" style={soft ?? muted} title={past.prev ? `The seat's previous result, ${past.prev.year}` : "No previous result"}>{past.prev ? <>{past.prev.year} <b style={{ color: on(callSideColor(past.prev.margin, prior)) }}>{fmtCall(past.prev.margin, prior)}</b></> : "No previous result"}</div>
            : <div className="overflow-hidden text-xs tabular-nums" style={soft ?? muted}>Proj. Margin <b key={projected} className="rc-tick" style={{ color: on(callSideColor(proj.margin, prior)) }}>{projected}</b></div>}
        </>
      ) : past ? (
        <>
          <div className="mt-1 text-xl font-extrabold leading-none">Unopposed</div>
          <div className="mt-1 text-[11px]" style={soft ?? veryMuted}>No votes reported</div>
        </>
      ) : (
        <>
          <div className="mt-1 text-xl font-extrabold leading-none" style={{ color: on(ratingColor) }}>{prior.forecast.rating}</div>
          <div className="mt-1 text-[11px]" style={soft ?? veryMuted}>No votes counted yet</div>
        </>
      )}
      {/* The bar and its percent share one row, 11px tall with its margin: what the bar alone took, so the card keeps its size. */}
      <div className="mt-px flex h-2.5 items-center gap-1.5">
        <div className="h-[3px] min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: fill ? "rgba(255,255,255,0.28)" : "var(--app-tab-bg)" }}>
          <div className="rc-progress h-full rounded-full" style={{ width: `${counted}%`, background: fill ? "rgba(255,255,255,0.9)" : callSideColor(proj.currentMargin, prior) }} />
        </div>
        {hasVotes && !past && <span className="w-8 shrink-0 text-right text-[11px] font-semibold leading-none tabular-nums" style={{ color: on(inColor(inState(counted))) }} title="Share of the expected vote counted">{fmtIn(counted)}</span>}
      </div>
      </div>
    </button>
  );
}

/** One state: the Statewide section (House popular vote, governor, Senate, the state's legislature), then every House seat in
 *  district order, under a header with the state's count. The caller holds
 *  useTouchHover(tiltCard, untiltCard), once per page. */
export function StateSection({ rows, legislature, year, housePvPrev, onSelect }: { rows: PostElectionRow[]; legislature: LegChamberResult[]; year: number; housePvPrev: number | null; onSelect: (r: PostElectionRow) => void }) {
  if (!rows.length) return null;
  const p0 = rows[0].prior;
  const past = !!rows[0].past;
  const president = rows.find((r) => r.prior.office === "president");
  const statewide = rows.filter((r) => r.prior.office !== "house" && r.prior.office !== "president");
  const house = rows.filter((r) => r.prior.office === "house");
  const popularVote = housePopularVote(house).margin;
  const vsPrev = popularVote != null && housePvPrev != null ? popularVote - housePvPrev : null;
  const flips = rows.filter((r) => r.proj.winner && r.prior.seatParty && r.proj.winner !== r.prior.seatParty).length;
  const counted = rows.reduce((a, r) => a + (r.live?.total ?? 0), 0);
  const total = rows.reduce((a, r) => a + r.proj.projectedTotal, 0);
  const called = rows.filter((r) => r.proj.locked && r.proj.winner).length;
  // Who breaks a tied chamber: the called governor's race, or the sitting governor where none is on the ballot.
  const governorRace = rows.find((r) => r.prior.office === "governor");
  const governorParty = governorRace ? (governorRace.proj.locked ? governorRace.proj.winner : null) : legislature[0]?.incumbentGovernor ?? null;
  const group = (label: React.ReactNode, list: PostElectionRow[], offset: number, lead?: React.ReactNode, trail?: React.ReactNode) => (list.length > 0 || lead || trail) && (
    <div className="py-3" style={{ borderBottom: "1px solid var(--app-border)" }}>
      <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider" style={muted}>{label}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
        {lead}
        {list.map((r, i) => <RaceCard key={rowKey(r.prior)} row={r} popularVote={popularVote} year={year} onSelect={onSelect} index={offset + i} />)}
        {trail}
      </div>
    </div>
  );
  return (
    <div>
      <div className="flex items-center gap-3 pb-2" style={{ borderBottom: "1px solid var(--app-text-primary)" }}>
        <StateGlyph state={p0.state} className="h-10 w-10 shrink-0" />
        <div className="min-w-0">
          <div className="text-xl font-bold" style={{ fontFamily: "var(--font-serif)" }}>{p0.stateName}</div>
          <div className="text-[11px] tabular-nums" style={muted}>
            {past
              ? `${rows.length} races · ${flips} ${flips === 1 ? "flip" : "flips"}`
              : <>{total ? `${Math.round((counted / total) * 100)}% of the expected vote counted · ` : ""}{called} of {rows.length} called</>}
          </div>
        </div>
      </div>
      {group(<>Statewide{vsPrev != null && <span title={`House popular vote: ${year} ${fmtCall(popularVote)}, ${year - 2} ${fmtCall(housePvPrev)}`}> · <span style={{ color: callSideColor(vsPrev) }}>{fmtCall(vsPrev)}</span> vs {prevYY(year)} GB</span>}</>, statewide, 0,
        <>
          {house.length > 0 && <HousePopularVote rows={house} past={past} />}
          {president && <RaceCard row={president} popularVote={popularVote} year={year} onSelect={onSelect} index={0} />}
        </>,
        legislature.map((c, i) => <LegislatureCard key={c.chamber} result={c} unicameral={legislature.length === 1} governorParty={governorParty} year={year} index={statewide.length + i} />))}
      {group(<>House · {house.length} {house.length === 1 ? "seat" : "seats"} · {delegationLabel(house)}</>, house, statewide.length)}
    </div>
  );
}

const lighter = (fill: string) => `color-mix(in srgb, ${fill} 38%, var(--app-bg))`;

const FLIP_STRIPES = flipBackground("linear-gradient(transparent, transparent)", 1.5, "rgba(255,255,255,0.4)");

/** A chamber's net seat change among called seats, in the card's top corner: each party that gained, or "Net 0". */
function netBadge({ dem, rep, oth }: LegSeats, filled: boolean) {
  const gains = [{ n: dem, abbr: "D", color: "var(--party-dem)" }, { n: rep, abbr: "R", color: "var(--party-rep)" }, { n: oth, abbr: "I", color: "var(--app-text-muted)" }].filter((g) => g.n > 0);
  if (!gains.length) return <span className="whitespace-nowrap text-sm font-bold tabular-nums" style={filled ? { color: "rgba(255,255,255,0.82)" } : muted}>Net 0</span>;
  // The word gives way before the figures on the narrowest cards, sooner when two parties gained.
  return (
    <span className="whitespace-nowrap text-sm font-bold tabular-nums">
      <span className={gains.length > 1 ? "hidden @[180px]:inline" : "hidden @[158px]:inline"}>Net </span>
      {gains.map((g, i) => <span key={g.abbr} style={filled ? undefined : { color: g.color }}>{i > 0 && " "}{g.abbr}+{g.n}</span>)}
    </span>
  );
}

/** A chamber's seats as NYT's bar: settled seats solid from each end with the flips among them
 *  striped, uncalled seats in a lighter shade of whoever leads them, grey for any with no votes,
 *  and a tick at the halfway mark. */
/** The party that has settled a chamber: more than half its seats, or a true tie with the governor's party. */
function chamberControl({ seats, total }: LegChamberResult, governorParty: string | null): "D" | "R" | null {
  const half = total / 2;
  if (seats.dem > half) return "D";
  if (seats.rep > half) return "R";
  if (seats.dem === half && seats.rep === half && (governorParty === "D" || governorParty === "R")) return governorParty;
  return null;
}

/** A state's House delegation as called: "7D 7R 1 Uncalled", each party in its colour. The party with more seats first (D on a tie), no party with none. */
function delegationLabel(house: PostElectionRow[]) {
  const seats = new Map<string, number>();
  let uncalled = 0;
  for (const r of house) {
    if (r.proj.locked && r.proj.winner) seats.set(r.proj.winner, (seats.get(r.proj.winner) ?? 0) + 1);
    else uncalled++;
  }
  const order = ["D", "R", "I"];
  const parties = [...seats.entries()].sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]));
  return (
    <>
      {parties.map(([party, n], i) => <span key={party} style={{ color: partyColor(party as Party) }}>{i > 0 && " "}{n}{party}</span>)}
      {uncalled > 0 && `${parties.length > 0 ? " " : ""}${uncalled} Uncalled`}
    </>
  );
}

function LegislatureCard({ result, unicameral, governorParty, year, index }: { result: LegChamberResult; unicameral: boolean; governorParty: string | null; year: number; index: number }) {
  const { chamber, total, up, calledSeats, noElection, seats, leading, flipped, net } = result;
  const name = unicameral ? "Legislature" : chamber === "senate" ? "State Senate" : "State House";
  // A settled chamber fills like a called race, every figure in white, with no badge: the bar keeps its colours inside a white outline.
  const control = chamberControl(result, governorParty);
  const fill = control === "R" ? "var(--party-rep-fill)" : control === "D" ? "var(--party-dem-fill)" : null;
  // Control changed hands: the race cards' flip stripes over the fill.
  const flippedControl = !!control && !result.noPrior && control !== result.priorControl;
  const soft = fill ? { color: "rgba(255,255,255,0.82)" } : null;
  const segments = [
    { n: seats.dem - flipped.dem, bg: "var(--party-dem-fill)", label: "Democratic, settled" },
    { n: flipped.dem, bg: "var(--party-dem-fill)", label: "Democratic flips", flip: true },
    { n: leading.dem, bg: lighter("var(--party-dem-fill)"), label: "Democrat leading, not called" },
    { n: leading.oth, bg: lighter("var(--party-ind-fill)"), label: "Independent leading, not called" },
    { n: seats.oth - flipped.oth, bg: "var(--party-ind-fill)", label: "Independent, settled" },
    { n: flipped.oth, bg: "var(--party-ind-fill)", label: "Independent flips", flip: true },
    { n: total - seats.dem - seats.rep - seats.oth - leading.dem - leading.rep - leading.oth, bg: "var(--app-tab-bg)", label: noElection ? "Vacant" : "No votes yet" },
    { n: leading.rep, bg: lighter("var(--party-rep-fill)"), label: "Republican leading, not called" },
    { n: flipped.rep, bg: "var(--party-rep-fill)", label: "Republican flips", flip: true },
    { n: seats.rep - flipped.rep, bg: "var(--party-rep-fill)", label: "Republican, settled" },
  ];
  return (
    <div onPointerMove={tiltToPointer} onPointerLeave={resetTilt} data-touch-hover="" data-filled={fill ? "" : undefined} className={`rc-card group block h-full w-full self-start py-1.5 pl-3 text-left align-top${fill ? " rounded-r-md pr-2" : ""}`}
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms`, borderLeft: `1px solid ${fill ?? "var(--app-border)"}`, backgroundColor: fill ?? undefined, backgroundImage: flippedControl ? flipBackground("linear-gradient(transparent, transparent)", 3, "rgba(255,255,255,0.18)") : undefined, color: fill ? "#ffffff" : undefined }}>
      {/* The race cards' height, less this card's vertical padding */}
      <div className="@container flex min-h-[94px] flex-col justify-start">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[15px] font-semibold">{name}</span>
        {!noElection && !result.noPrior && netBadge(net, !!fill)}
      </div>
      <div className="mt-1 whitespace-nowrap text-xl font-extrabold leading-none tabular-nums">
        <span style={fill ? undefined : { color: "var(--party-dem)" }}>{seats.dem}D</span> - <span style={fill ? undefined : { color: "var(--party-rep)" }}>{seats.rep}R</span>
        {seats.oth > 0 && <> - <span style={soft ?? muted}>{seats.oth}I</span></>}
      </div>
      <div className="mt-1 text-xs tabular-nums" style={soft ?? muted}>{noElection ? `No ${year} Elections` : leading.dem + leading.rep + leading.oth === 0 && calledSeats === up ? `${up} up` : `${up} up · ${calledSeats} called`}</div>
      {/* mt-auto: every chamber's bar sits at the card's foot */}
      <div className="mt-auto pt-2">
        <div className="relative flex h-3.5 overflow-hidden" style={fill ? { outline: "1px solid rgba(255,255,255,0.8)" } : undefined} role="img" aria-label={`${name}: ${seats.dem} Democrats, ${seats.rep} Republicans${seats.oth ? `, ${seats.oth} independents and others` : ""}${noElection ? "" : `; ${flipped.dem + flipped.rep + flipped.oth} flips; leading in ${leading.dem} more Democratic and ${leading.rep} more Republican seats`}`}>
          {segments.map((s) => s.n > 0 && <div key={s.label} title={`${s.label}: ${s.n}`} style={{ width: `${(s.n / total) * 100}%`, backgroundColor: s.bg, backgroundImage: s.flip ? FLIP_STRIPES : undefined }} />)}
          <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2" style={{ background: fill ? "#ffffff" : "var(--app-bg)" }} />
        </div>
      </div>
      </div>
    </div>
  );
}

/** A state's House votes counted so far, summed by party, and their margin over all votes
 *  (R-positive; null with nothing counted). */
export function housePopularVote(rows: PostElectionRow[]) {
  let dem = 0, rep = 0, total = 0;
  for (const { prior, live } of rows) {
    if (live && live.total > 0) { const v = partyVotes(prior, live); dem += v.dem; rep += v.rep; total += live.total; }
  }
  return { dem, rep, total, margin: total > 0 ? ((rep - dem) / total) * 100 : null };
}

const BALLOT_OFFICES = [["house", "House"], ["president", "President"], ["senate", "Senate"], ["governor", "Governor"]] as const;

/** The national generic ballot for each office: every race's counted votes summed by party (as
 *  housePopularVote), margin over all votes cast, R-positive. Other is everyone else on the ballot. */
export function GenericBallots({ rows }: { rows: PostElectionRow[] }) {
  const offices = BALLOT_OFFICES.filter(([office]) => rows.some((r) => r.prior.office === office));
  return (
    <div>
      <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider" style={muted}>Generic ballot</div>
      <div className={`grid gap-x-3 gap-y-3 lg:grid-cols-5 ${offices.length > 3 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
        {offices.map(([office, name]) => {
          const { dem, rep, total, margin } = housePopularVote(rows.filter((r) => r.prior.office === office));
          const pct = (v: number) => `${((v / total) * 100).toFixed(1)}%`;
          return (
            <div key={office} title={total > 0 ? `D ${fmtInt(dem)} · R ${fmtInt(rep)} · Other ${fmtInt(total - dem - rep)} · ${fmtInt(total)} votes counted` : undefined}
              className="py-1 pl-3" style={{ borderLeft: "1px solid var(--app-border)" }}>
              <div className="truncate text-sm font-semibold">{name}</div>
              <div className="mt-0.5" style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: "clamp(20px, 4.5vw, 24px)", lineHeight: 1.05, color: callSideColor(margin) }}>{fmtCall(margin)}</div>
              {total > 0 && (
                <div className="mt-0.5 text-[11px] tabular-nums" style={veryMuted}>
                  <span style={{ color: "var(--party-dem)", fontWeight: 600 }}>D {pct(dem)}</span> <span style={{ color: "var(--party-rep)", fontWeight: 600 }}>R {pct(rep)}</span> <span style={{ fontWeight: 600 }}>Other {pct(total - dem - rep)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The state's House popular vote: every House race's votes summed by party, margin over all votes
 *  (R-positive), beside the needle's projection (each seat's projected margin weighted by its
 *  projected vote). Uncontested seats count as the feed reports them. */
function HousePopularVote({ rows, past }: { rows: PostElectionRow[]; past: boolean }) {
  const { dem, rep, total, margin } = housePopularVote(rows);
  let projVotes = 0, projSum = 0;
  for (const { prior, proj } of rows) {
    // A same-party contest's margin is between two candidates of one party: all of its vote is that party's.
    const seatMargin = prior.dem.party === prior.rep.party ? (prior.dem.party === "R" ? 100 : -100) : proj.margin;
    if (proj.projectedTotal > 0) { projVotes += proj.projectedTotal; projSum += seatMargin * proj.projectedTotal; }
  }
  const projected = projVotes > 0 ? projSum / projVotes : null;
  const counted = projVotes > 0 ? Math.min(100, (total / projVotes) * 100) : 0;
  const pct = (v: number) => `${((v / total) * 100).toFixed(1)}%`;
  return (
    <div onPointerMove={tiltToPointer} onPointerLeave={resetTilt} data-touch-hover="" title={total > 0 ? `D ${fmtInt(dem)} · R ${fmtInt(rep)} · ${fmtInt(total)} votes counted` : undefined}
      className="rc-card group block h-full w-full self-start py-1.5 pl-3 text-left align-top" style={{ borderLeft: "1px solid var(--app-border)" }}>
      <div className="flex min-h-full flex-col justify-start">
      <div className="truncate text-[15px] font-semibold">House Popular Vote</div>
      {margin != null ? (
        <>
          <div className="mt-1 text-xl font-extrabold leading-none tabular-nums"><span key={fmtCall(margin)} className="rc-tick" style={{ color: callSideColor(margin) }}>{fmtCall(margin)}</span></div>
          <div className="mt-1 text-[11px] tabular-nums" style={veryMuted}><span style={{ color: "var(--party-dem)", fontWeight: 600 }}>D {pct(dem)}</span> <span style={{ color: "var(--party-rep)", fontWeight: 600 }}>R {pct(rep)}</span></div>
          {projected != null && !past && <div className="overflow-hidden text-xs tabular-nums" style={muted}>Proj. Margin <b key={fmtCall(projected)} className="rc-tick" style={{ color: callSideColor(projected) }}>{fmtCall(projected)}</b></div>}
        </>
      ) : (
        <>
          <div className="mt-1 text-xl font-extrabold leading-none tabular-nums" style={{ color: callSideColor(projected) }}>{fmtCall(projected)}</div>
          <div className="mt-1 text-[11px]" style={veryMuted}>No votes counted yet · projected</div>
        </>
      )}
      {/* As RaceCard: the bar and its percent share one row, the height the bar alone took. */}
      <div className="mt-px flex h-2.5 items-center gap-1.5">
        <div className="h-[3px] min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: "var(--app-tab-bg)" }}>
          <div className="rc-progress h-full rounded-full" style={{ width: `${counted}%`, background: callSideColor(margin) }} />
        </div>
        {margin != null && !past && <span className="w-8 shrink-0 text-right text-[11px] font-semibold leading-none tabular-nums" style={{ color: inColor(inState(counted)) }} title="Share of the expected vote counted">{fmtIn(counted)}</span>}
      </div>
      </div>
    </div>
  );
}
