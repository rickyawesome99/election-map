"use client";

import Link from "next/link";
import { statesData } from "@/data/statesData";
import { OFFICE_LABELS, WAR_BAD, WAR_GOOD, candidateSlug, districtHref, fmt1, marginColor, stateHref } from "./format";
import type { WarSlim } from "./types";
import { WarChip } from "./ui";

// The calculation behind one row of the WAR table, drawn: every step from the place's own vote to
// the candidate's WAR as a bar on one margin axis (Democratic to the left, Republican to the right).
// A step's bar runs from where the running figure stood to where the step leaves it, in the color
// of the party it moved toward; the three figures the table prints (Expected, Vs Opp, Actual) are
// dots on the same axis, and the last bar, from Vs Opp to Actual, is the WAR itself. Under it, what
// the WAR is made of and the race's other figures. The panel fades in as one piece; the bars do
// not animate one by one (the user found that too much on every expand).

type Step =
  | { kind: "move"; label: string; note?: string; from: number; to: number }
  | { kind: "mark"; label: string; note?: string; at: number; strong?: boolean }
  | { kind: "war"; label: string; note?: string; from: number; to: number };

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`;
const partyOf = (v: number) => (v > 0 ? "var(--party-rep)" : "var(--party-dem)");

function Tile({ label, title, children }: { label: string; title?: string; children: React.ReactNode }) {
  return (
    <div title={title} className="grid content-start gap-1">
      <dt className="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "var(--app-text-very-muted)" }}>{label}</dt>
      <dd className="text-[13px] font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{children}</dd>
    </div>
  );
}

export function WarRaceBreakdown({ row, opp, ownPage = false }: { row: WarSlim; opp: Pick<WarSlim, "candidate" | "party" | "war"> | null; /** On the candidate's own page: no link back to it. */ ownPage?: boolean }) {
  const s = row.party === "R" ? 1 : -1;
  const st = statesData.find((x) => x.abbr === row.state);
  const place = row.office === "H" ? row.race.replace(/^House /, "") : st?.name ?? row.state;
  const placeHref = row.office === "H" ? districtHref(st?.id ?? row.state.toLowerCase(), row.race.replace(/^House /, "")) : stateHref(st?.id ?? row.state.toLowerCase());

  // Expected = baseline (+ the state's other House races) + incumbency + structural money.
  const w = row.base == null ? 0 : row.baseW ?? 1;
  const baseline = row.base == null ? row.leanBase ?? row.expected : w * row.base + (1 - w) * (row.leanBase ?? row.base);
  const houseOthers = row.houseOthers ?? 0;
  const money = row.moneyPts ?? 0;
  const incumbency = row.expected - baseline - houseOthers - money;
  // Vs Opp = Expected moved by the opponent's strength, with the candidate's own incumbency taken out.
  const oppMove = -s * row.oppEffect;
  const ownIncMove = -s * row.incumb;
  const record = row.record ?? 0;
  const surprise = row.war - record - row.incumb;

  const steps: Step[] = [];
  let at = baseline;
  steps.push({ kind: "mark", label: row.base == null ? `${place}'s modelled baseline` : `${place}'s ${row.year} vote without this race`, at,
    note: row.base == null ? "no own-year vote on file to read it from" : w >= 1 ? "the rest of the ballot that year" : `${Math.round(w * 100)}% its own vote, the rest the modelled baseline` });
  const move = (label: string, pts: number, note?: string) => { if (Math.abs(pts) >= 0.05) { steps.push({ kind: "move", label, note, from: at, to: at + pts }); at += pts; } };
  move("Other House races in the state", houseOthers, "how they ran against their own districts");
  move("Incumbency", incumbency, "what holding the seat is worth to a generic incumbent");
  move("Structural money", money, "the money gap a generic pair would have");
  steps.push({ kind: "mark", label: "Expected", note: "generic vs generic", at: row.expected, strong: true });
  at = row.expected;
  move(opp ? `${opp.candidate}'s strength` : "Opponent's strength", oppMove, opp ? `${signed(row.oppEffect)} toward ${opp.party === "R" ? "the Republican" : opp.party === "D" ? "the Democrat" : "the opponent"}` : undefined);
  move("Own incumbency, removed", ownIncMove, "a replacement would not hold the seat");
  steps.push({ kind: "mark", label: "Vs Opp", note: "a generic non-incumbent against this opponent", at: row.vsOpp, strong: true });
  steps.push({ kind: "mark", label: "Actual", note: "the result", at: row.actual, strong: true });
  steps.push({ kind: "war", label: "WAR", note: "Actual minus Vs Opp, toward the candidate", from: row.vsOpp, to: row.actual });

  // One axis for every step, padded, always showing Even when the race sits near it.
  const values = steps.flatMap((x) => (x.kind === "mark" ? [x.at] : [x.from, x.to]));
  let lo = Math.min(...values), hi = Math.max(...values);
  if (lo > 0 && lo < 12) lo = 0;
  if (hi < 0 && hi > -12) hi = 0;
  const pad = Math.max((hi - lo) * 0.08, 1.5);
  lo -= pad; hi += pad;
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const evenAt = lo < 0 && hi > 0 ? x(0) : null;
  const warColor = row.war > 0.05 ? WAR_GOOD : row.war < -0.05 ? WAR_BAD : "var(--app-text-muted)";

  return (
    <div className="rh-fade-in whitespace-normal py-1 text-left">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>
          How {row.candidate}&rsquo;s {row.year} WAR is built
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
          {!ownPage && <Link href={`/candidates/${candidateSlug(row.candidate, row.state)}`} prefetch={false} className="hover:underline">Candidate page &rsaquo;</Link>}
          {row.pastHref && <Link href={row.pastHref} prefetch={false} className="hover:underline">{row.year} {OFFICE_LABELS[row.office]} results &rsaquo;</Link>}
          <Link href={placeHref} prefetch={false} className="hover:underline">{row.office === "H" ? place : row.state} TPL &rsaquo;</Link>
        </div>
      </div>

      {/* The calculation: one row per step, all on the same margin axis. */}
      <div className="mt-3" role="img" aria-label={`Expected ${fmt1(row.expected)}, versus this opponent ${fmt1(row.vsOpp)}, actual ${fmt1(row.actual)}, WAR ${signed(row.war)}`}>
        <div>
          {steps.map((step, i) => {
            const total = step.kind === "mark" && step.strong;
            const value = step.kind === "mark" ? step.at : step.kind === "move" ? step.to - step.from : row.war;
            const a = step.kind === "mark" ? x(step.at) : x(Math.min(step.from, step.to));
            const width = step.kind === "mark" ? 0 : Math.abs(x(step.to) - x(step.from));
            const color = step.kind === "war" ? warColor : step.kind === "move" ? partyOf(step.to - step.from) : marginColor(step.at);
            const rule = total || step.kind === "war" ? "1px solid var(--app-border)" : undefined;
            // The WAR bubble hangs past the column by its own padding, so its digits line up with the figures above.
            return (
              // One line per step from sm up (label · bar · figure); phones put the bar under the label.
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 sm:grid-cols-[15rem_minmax(0,1fr)_4.75rem]" style={{ borderTop: rule }}>
                <div className="col-start-1 row-start-1 min-w-0 py-1.5">
                  <div className={`text-[12.5px] leading-tight ${total || step.kind === "war" ? "font-bold" : "font-medium"}`} style={{ color: "var(--app-text-primary)" }}>
                    {step.kind === "move" && <span className="mr-1.5 font-normal" style={{ color: "var(--app-text-very-muted)" }}>+</span>}
                    {(total && i > 0 && step.label !== "Actual" || step.kind === "war") && <span className="mr-1.5 font-normal" style={{ color: "var(--app-text-very-muted)" }}>=</span>}
                    {step.label}
                  </div>
                  {step.note && <div className="mt-0.5 text-[11px] leading-snug" style={{ color: "var(--app-text-very-muted)" }}>{step.note}</div>}
                </div>
                <div className="col-start-2 row-start-1 py-1.5 text-right text-[13px] font-bold tabular-nums sm:col-start-3" style={{ color: step.kind === "war" ? undefined : color }}>
                  {step.kind === "war" ? <span className="-mr-2.5 inline-block rounded-full px-2.5 py-1" style={{ fontFamily: "var(--font-serif)", fontSize: "1.3rem", fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1, color: warColor, background: row.war > 0.05 || row.war < -0.05 ? `color-mix(in srgb, ${warColor} 14%, transparent)` : "var(--app-tab-bg)" }}>{signed(row.war)}</span> : step.kind === "move" ? `${value > 0 ? "R" : "D"}+${Math.abs(value).toFixed(1)}` : fmt1(value)}
                </div>
                <div className="relative col-span-2 col-start-1 row-start-2 mb-1 h-5 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:mb-0 sm:h-auto sm:min-h-[2.25rem] sm:self-stretch">
                  <span className="absolute inset-y-0 left-0 right-0 my-auto h-px" style={{ background: "var(--app-border)" }} />
                  {evenAt != null && <span className="absolute inset-y-0 w-px" style={{ left: `${evenAt}%`, background: "var(--app-text-muted)", opacity: 0.45 }} />}
                  {step.kind === "mark" ? (
                    <span className="absolute top-1/2 block rounded-full" style={{ left: `${a}%`, width: total ? 11 : 9, height: total ? 11 : 9, marginLeft: total ? -5.5 : -4.5, marginTop: total ? -5.5 : -4.5, background: total ? color : "var(--app-bg)", border: `2px solid ${color}` }} />
                  ) : (
                    <span className="absolute top-1/2 block rounded-sm" style={{ left: `${a}%`, width: `max(${width}%, 3px)`, height: step.kind === "war" ? 12 : 7, marginTop: step.kind === "war" ? -6 : -3.5, background: color, opacity: step.kind === "war" ? 1 : 0.85 }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-1 grid grid-cols-1 sm:grid-cols-[15rem_minmax(0,1fr)_4.75rem] sm:gap-x-4">
          <div className="relative h-4 text-[10px] font-semibold tabular-nums sm:col-start-2" style={{ color: "var(--app-text-very-muted)" }}>
            <span className="absolute left-0">{fmt1(Math.ceil(lo))}</span>
            {evenAt != null && evenAt > 12 && evenAt < 88 && <span className="absolute -translate-x-1/2" style={{ left: `${evenAt}%` }}>Even</span>}
            <span className="absolute right-0">{fmt1(Math.floor(hi))}</span>
          </div>
        </div>
      </div>

      {/* What the WAR is made of, and the race's other figures. */}
      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 pt-3.5" style={{ borderTop: "1px solid var(--app-border)" }}>
        <Tile label="Record" title="The candidate's strength in their other races, recent ones counting more, pulled toward zero when there are few">{signed(record)} <span className="text-[11px] font-normal" style={{ color: "var(--app-text-very-muted)" }}>{row.effectN > 1 ? `${row.effectN - 1} other race${row.effectN === 2 ? "" : "s"}` : "first race"}</span></Tile>
        <Tile label="+ Share of this race" title="Their share of how far this race departed from the two candidates' records">{signed(surprise)}</Tile>
        <Tile label="+ Incumb." title="What their own incumbency was worth against a non-incumbent replacement">{row.incumb !== 0 ? signed(row.incumb) : <span style={{ color: "var(--app-text-very-muted)" }}>&mdash;</span>}</Tile>
        <Tile label="= WAR"><WarChip war={row.war} size="sm" /></Tile>
        <span className="hidden self-stretch sm:block" style={{ borderLeft: "1px solid var(--app-border)" }} />
        <Tile label="Residual" title="Actual minus Expected, toward the candidate: the race's net result before it is divided between the two">{signed(row.residual)}</Tile>
        <Tile label="Effect" title="The candidate's standing as of this race: the record with this race included">{signed(row.effect)} <span className="text-[11px] font-normal" style={{ color: "var(--app-text-very-muted)" }}>n={row.effectN}</span></Tile>
        {opp && <Tile label="Opp WAR" title={`${opp.candidate}'s own WAR in this race`}><WarChip war={opp.war} size="sm" /></Tile>}
      </dl>
    </div>
  );
}
