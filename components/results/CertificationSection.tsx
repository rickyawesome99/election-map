"use client";

import { useMemo, useState } from "react";
import { LedgerSubhead } from "@/components/LedgerSectionHead";
import type { MapRow } from "@/components/tpl/TplMaps";
import type { R26Certification, R26Recount } from "@/lib/results2026Types";
import { LazyMount, Notes, Picked, PickedFig, RankTable, Reveal, RowLink, Stat, StatRow, TplMap, fmtDay, fmtInt, type Col } from "./ui";

// Section 2: which states have certified their results, and where a recount is on. The statuses
// are kept by hand (data-entry/certification_2026.csv, recounts_2026.csv) as of the date shown.

const GREEN = "#2f9e5b", RED = "#d1493f", YELLOW = "#e2b23c";
type Kind = 0 | 1 | 2; // 0 not certified, 1 certified, 2 recount
const kindOf = (c: R26Certification): Kind => (c.recounts.length ? 2 : c.status === "certified" ? 1 : 0);
const COLORS = [RED, GREEN, YELLOW];
const colorOf = (v: number) => COLORS[v] ?? RED;
const OFFICE: Record<string, string> = { governor: "Governor", senate: "U.S. Senate", house: "U.S. House", state_senate: "State senate", state_house: "State house" };

const dateText = (c: R26Certification) => (!c.date ? "No date on file" : c.status === "certified" ? `Certified ${fmtDay(c.date)}` : `${c.dateKind === "deadline" ? "Due by" : "Set for"} ${fmtDay(c.date)}`);
const recountLabel = (r: R26Recount) => `${OFFICE[r.office] ?? r.office}${r.seat ? ` ${r.seat}` : ""}`;

function Swatch({ color, children }: { color: string; children: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-4" style={{ background: color }} />{children}</span>;
}

export default function CertificationSection({ states, asOf }: { states: R26Certification[]; asOf: string }) {
  const [picked, setPicked] = useState<string | null>(null);
  const mapRows = useMemo<MapRow[]>(() => states.map((c) => ({
    key: c.name, name: c.name, value: kindOf(c), href: c.href,
    text: `${dateText(c)}${c.recounts.length ? ` · ${c.recounts.length} recount${c.recounts.length === 1 ? "" : "s"}` : ""}`, textColor: "var(--app-text-primary)",
  })), [states]);
  const certified = states.filter((c) => c.status === "certified").length;
  const withRecount = states.filter((c) => c.recounts.length > 0);
  const sel = picked ? states.find((c) => c.name === picked) ?? null : null;

  const cols: Col<R26Certification>[] = [
    { key: "name", head: "State", left: true, sort: (c) => c.name, cell: (c) => <RowLink href={c.href}>{c.name}</RowLink> },
    { key: "status", head: "Status", left: true, sort: (c) => kindOf(c), cell: (c) => <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorOf(kindOf(c)) }} />{c.status === "certified" ? "Certified" : "Not certified"}</span> },
    { key: "date", head: "Date", left: true, sort: (c) => c.date || null, cell: (c) => <span className="whitespace-nowrap">{dateText(c)}</span> },
    { key: "recounts", head: "Recounts", left: true, sort: (c) => (c.recounts.length ? -c.recounts.length : null), cell: (c) => (c.recounts.length ? c.recounts.map(recountLabel).join("; ") : "") },
    { key: "source", head: "Source", left: true, wide: true, cell: (c) => (c.source ? <a href={c.source} target="_blank" rel="noopener noreferrer" className="text-xs underline decoration-dotted underline-offset-2" style={{ color: "var(--app-text-muted)" }}>{new URL(c.source).hostname.replace(/^www\./, "")}</a> : "") },
  ];

  const ordered = useMemo(() => [...states].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.name.localeCompare(b.name)), [states]);
  const recounts = withRecount.flatMap((c) => c.recounts.map((r) => ({ ...r, stateName: c.name, href: c.href })));
  type Rec = (typeof recounts)[number];
  const recountCols: Col<Rec>[] = [
    { key: "state", head: "State", left: true, sort: (r) => r.stateName, cell: (r) => <RowLink href={r.href}>{r.stateName}</RowLink> },
    { key: "race", head: "Race", left: true, sort: (r) => recountLabel(r), cell: (r) => <span className="font-semibold">{recountLabel(r)}</span> },
    { key: "who", head: "Candidates", left: true, wide: true, cell: (r) => r.candidates },
    { key: "margin", head: "Margin before", sort: (r) => r.marginVotes, cell: (r) => (r.marginVotes == null ? "—" : `${fmtInt(r.marginVotes)} votes`) },
    { key: "type", head: "Kind", left: true, wide: true, sort: (r) => r.type, cell: (r) => <span className="capitalize">{r.type}</span> },
    { key: "status", head: "Status", left: true, sort: (r) => r.status, cell: (r) => (
      <>
        <span className="capitalize">{r.status}</span>{r.statusDate && <span style={{ color: "var(--app-text-muted)" }}> {fmtDay(r.statusDate)}</span>}{r.result && <>: {r.result}</>}
        {r.source && <> <a href={r.source} target="_blank" rel="noopener noreferrer" className="text-xs underline decoration-dotted underline-offset-2" style={{ color: "var(--app-text-muted)" }}>source</a></>}
      </>
    ) },
  ];

  return (
    <Reveal>
      <StatRow>
        <Stat value={certified} color={GREEN} label={<>of 50 states have certified, as of {fmtDay(asOf)}</>} />
        <Stat delay={60} value={50 - certified} color={RED} label="not yet certified" />
        <Stat delay={120} value={withRecount.length} color={YELLOW} label="states with at least one recount" />
        <Stat delay={180} value={recounts.length} label="races recounted, or about to be" />
      </StatRow>
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs" style={{ color: "var(--app-text-muted)" }} aria-label="Map legend">
        <Swatch color={GREEN}>Certified</Swatch><Swatch color={RED}>Not certified</Swatch><Swatch color={YELLOW}>At least one recount</Swatch>
      </div>
      <LazyMount className="mx-4 aspect-[5/3] max-h-[620px] sm:mx-12 lg:mx-32">
        <TplMap mode="states" rows={mapRows} valueLabel="Results" linkLabel="Open state page" colorOf={colorOf} onSelect={(r) => setPicked(r ? r.name : null)} selectedKey={picked} zoomable={false} fill panel={false} framed={false} />
      </LazyMount>
      {/* Every state as a tile, in the order they certify: the same selection as the map, easier to hit than Rhode Island. */}
      <div className="mt-4 flex flex-wrap justify-center gap-1" role="group" aria-label="States in order of certification date">
        {ordered.map((c, i) => {
          const on = picked === c.name;
          return (
            <button key={c.abbr} type="button" onClick={() => setPicked(on ? null : c.name)} aria-pressed={on} title={`${c.name}: ${dateText(c)}`}
              className="ab-box h-7 w-8 rounded-[3px] text-[10px] font-bold tabular-nums hover:brightness-110"
              style={{ background: colorOf(kindOf(c)), color: kindOf(c) === 2 ? "#1f2328" : "#fff", animationDelay: `${i * 12}ms`, outline: on ? "2px solid var(--app-text-primary)" : undefined, outlineOffset: 1 }}>
              {c.abbr}
            </button>
          );
        })}
      </div>
      {sel && (
        <Picked id={sel.abbr} title={sel.name} href={sel.href} linkLabel="State page" onClose={() => setPicked(null)}>
          <PickedFig label="Status"><span className="inline-flex items-center gap-2 text-base font-semibold"><span className="inline-block h-3 w-3 rounded-full" style={{ background: colorOf(kindOf(sel)) }} />{sel.status === "certified" ? "Certified" : "Not certified"}</span></PickedFig>
          <PickedFig label={sel.status === "certified" ? "Certified" : sel.dateKind === "deadline" ? "Due by" : "Set for"}><span style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: "1.5rem", lineHeight: 1 }}>{sel.date ? fmtDay(sel.date) : "No date"}</span></PickedFig>
          {sel.recounts.length > 0 && <PickedFig label="Recounts"><span className="text-sm">{sel.recounts.map(recountLabel).join("; ")}</span></PickedFig>}
          {sel.note && <p className="basis-full text-sm" style={{ color: "var(--app-text-muted)" }}>{sel.note}</p>}
        </Picked>
      )}

      {recounts.length > 0 && (
        <div className="mt-8">
          <LedgerSubhead label="Recounts" meta={`${recounts.length} races in ${withRecount.length} states`} top="mt-0" />
          <RankTable rows={recounts} cols={recountCols} rowKey={(r) => `${r.state}-${r.office}-${r.seat}`} label="Recounts in races for governor, Congress and state legislatures" initial={{ key: "margin", dir: 1 }} limit={10} noun="recounts" />
        </div>
      )}

      <div className="mt-8">
        <LedgerSubhead label="Every state" top="mt-0" />
        <RankTable rows={states} cols={cols} rowKey={(c) => c.abbr} label="Certification by state" initial={{ key: "date", dir: 1 }} limit={10} noun="states" />
      </div>
      <Notes>
        <p><strong>Certified</strong> means the state&rsquo;s own canvass of the November 3 results is finished and signed, not each county&rsquo;s. A state shows green only where a source confirms it; a legal deadline passing is not enough. Until then the date is the one set by law or by the state&rsquo;s calendar.</p>
        <p><strong>Recounts</strong> cover races for governor, U.S. Senate, U.S. House and state legislative seats: requested, automatic, under way or finished. A state with one is yellow whether or not it has certified.</p>
        <p>This map is updated by hand and was last checked on {fmtDay(asOf)}, 2026. It does not change on its own.</p>
      </Notes>
    </Reveal>
  );
}
