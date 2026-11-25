"use client";

import { useMemo, useState } from "react";
import { LedgerSubhead } from "@/components/LedgerSectionHead";
import { fmtMargin, marginColor } from "@/lib/colorScale";
import { swingOf, type R26Office, type R26Race, type R26StateRow } from "@/lib/results2026Types";
import { Notes, RankTable, Reveal, RowLink, Seg, ShiftTrack, Stat, StatRow, SwingFig, type Col } from "./ui";

// Section 4: where the vote moved most. Races against the 2024 presidential vote on the same
// ground or against the seat's last election (House seats on redrawn lines by an estimate), and
// states by their House vote, Senate race and governor's race.

type Scope = R26Office | "states";
type Base = "pres" | "prev";
const SCOPES: [Scope, string][] = [["house", "House districts"], ["senate", "Senate"], ["governor", "Governor"], ["states", "States"]];

type Item = { key: string; label: string; href: string; sub?: string; from: number; to: number; swing: number; estimated?: boolean; baseYear?: number };

const M = ({ v }: { v: number | null }) => <span style={{ color: marginColor(v) }}>{fmtMargin(v)}</span>;
const S = SwingFig;

function TopList({ title, items }: { title: string; items: Item[] }) {
  return (
    <div>
      <LedgerSubhead label={title} top="mt-0" />
      <ol className="text-sm">
        {items.map((x, i) => (
          <li key={x.key} data-touch-hover="" className="vh-row vh-hover grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 py-2 tabular-nums sm:grid-cols-[1.25rem_minmax(0,1fr)_minmax(0,9rem)_4.5rem]" style={{ borderBottom: "1px solid var(--app-border)", animationDelay: `${i * 35}ms` }}>
            <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>{i + 1}</span>
            <span className="min-w-0">
              <span className="block truncate"><RowLink href={x.href}>{x.label}</RowLink>{x.sub && <span className="ml-2 text-xs" style={{ color: "var(--app-text-muted)" }}>{x.sub}</span>}</span>
              <span className="block text-xs" style={{ color: "var(--app-text-muted)" }}>{x.estimated ? "~" : ""}<M v={x.from} /> → <M v={x.to} /></span>
            </span>
            <ShiftTrack from={x.from} to={x.to} className="hidden sm:block" />
            <span className="text-right"><S v={x.swing} est={x.estimated} size="1.15rem" /></span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const surname = (n: string) => n.trim().split(/\s+/).filter((w) => !/^(jr\.?|sr\.?|ii|iii|iv)$/i.test(w)).pop() ?? n;

export default function ShiftsSection({ races, states }: { races: R26Race[]; states: R26StateRow[] }) {
  const [scope, setScope] = useState<Scope>("house");
  const [base, setBase] = useState<Base>("pres");

  const baseOptions: [Base, string][] = [["pres", "vs. President '24"], ["prev", scope === "house" || scope === "states" ? "vs. House '24" : "vs. the seat's last election"]];

  const items = useMemo<Item[]>(() => {
    if (scope === "states") {
      return states.map((s) => {
        const from = base === "pres" ? s.pres : s.house24;
        return { key: s.abbr, label: s.name, href: s.href, sub: `${s.seats} seat${s.seats === 1 ? "" : "s"}${s.redrawn && base === "prev" ? " · redrawn" : ""}`, from, to: s.house, swing: s.house - from };
      });
    }
    return races.filter((r) => r.office === scope && r.twoParty).flatMap((r) => {
      const from = base === "pres" ? r.pres?.margin ?? null : r.prev?.margin ?? null;
      const swing = swingOf(r.margin, from);
      if (swing == null || from == null || r.margin == null) return [];
      return [{ key: r.id, label: r.label, href: r.href, sub: `${surname(r.demName)} (D) vs. ${surname(r.repName)} (R)`, from, to: r.margin, swing, estimated: base === "prev" && r.prev?.estimated, baseYear: base === "prev" ? r.prev?.year : 2024 }];
    });
  }, [scope, base, races, states]);

  const toDem = useMemo(() => [...items].sort((a, b) => a.swing - b.swing).slice(0, 10), [items]);
  const toRep = useMemo(() => [...items].sort((a, b) => b.swing - a.swing).slice(0, 10), [items]);
  const anyRep = toRep.some((x) => x.swing > 0);
  const mean = items.length ? items.reduce((a, x) => a + x.swing, 0) / items.length : null;
  const noun = scope === "states" ? "states" : scope === "house" ? "districts" : "races";

  const cols: Col<Item>[] = [
    { key: "label", head: scope === "states" ? "State" : "Race", left: true, sort: (x) => x.label, cell: (x) => <><RowLink href={x.href}>{x.label}</RowLink>{x.sub && <span className="ml-2 hidden text-xs sm:inline" style={{ color: "var(--app-text-muted)" }}>{x.sub}</span>}</> },
    ...(scope !== "states" && scope !== "house" && base === "prev" ? [{ key: "year", head: "Last up", sort: (x: Item) => x.baseYear ?? null, cell: (x: Item) => x.baseYear ?? "—" }] : []),
    { key: "from", head: base === "pres" ? "President '24" : scope === "house" || scope === "states" ? "House '24" : "Last election", sort: (x) => x.from, cell: (x) => <>{x.estimated ? "~" : ""}<M v={x.from} /></> },
    { key: "to", head: scope === "states" ? "House '26" : "2026", sort: (x) => x.to, cell: (x) => <M v={x.to} /> },
    { key: "track", head: "", wide: true, cell: (x) => <ShiftTrack from={x.from} to={x.to} className="ml-auto w-28 lg:w-44" /> },
    { key: "swing", head: "Swing", sort: (x) => x.swing, cell: (x) => <S v={x.swing} est={x.estimated} /> },
  ];

  return (
    <Reveal>
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Seg label="Show" value={scope} onChange={setScope} options={SCOPES} scroll />
        <Seg label="Compared with" value={base} onChange={setBase} options={baseOptions} />
      </div>
      <StatRow key={`${scope}-${base}`}>
        <Stat value={items.length} label={<>{noun} with a Democrat-versus-Republican margin in both elections</>} />
        <Stat delay={60} value={<SwingFig v={mean} size="inherit" />} label={scope === "states" ? "average swing, on the House vote with every seat contested" : "average swing"} />
        <Stat delay={120} value={items.filter((x) => x.swing < 0).length} color="var(--party-dem)" label="moved toward Democrats" />
        <Stat delay={180} value={items.filter((x) => x.swing > 0).length} color="var(--party-rep)" label="moved toward Republicans" />
      </StatRow>
      <div key={`lists-${scope}-${base}`} className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
        <TopList title="Largest swings toward Democrats" items={toDem} />
        <TopList title={anyRep ? "Largest swings toward Republicans" : "Smallest swings toward Democrats"} items={toRep} />
      </div>
      <div className="mt-8">
        <LedgerSubhead label={`Every ${scope === "states" ? "state" : scope === "house" ? "district" : "race"}`} meta="Select a column heading to sort" top="mt-0" />
        <RankTable key={`${scope}-${base}`} rows={items} cols={cols} rowKey={(x) => x.key} label={`Swing by ${noun}`} initial={{ key: "swing", dir: 1 }} limit={10} noun={noun} />
      </div>
      <Notes>
        <p><strong>Swing:</strong> the 2026 margin minus the earlier one, in points of all votes cast. D+12 means the place voted twelve points more Democratic than before.</p>
        <p><strong>House vs. House &rsquo;24, adjusted for redistricting:</strong> where a district&rsquo;s lines changed for 2026, its 2024 House margin is moved by the difference between the 2024 presidential margin on the old lines and on the new ones; with no Democrat-versus-Republican race in 2024, the presidential margin on the new lines stands in. Those figures are marked ~. The largest are the least reliable.</p>
        <p><strong>States:</strong> the House vote in the state with every seat contested (a seat with no two-party race filled in from its presidential vote, as in the next section), against the state&rsquo;s 2024 presidential margin or its 2024 House vote on the same basis. A state whose map was redrawn is comparable as a whole, since every voter is still in one of its districts.</p>
        <p><strong>Left out:</strong> races with no Democrat-versus-Republican margin in either election: unopposed and same-party seats, and independents standing in for a party (Senate races in Idaho, Montana, Nebraska and South Dakota; Alaska&rsquo;s House seat).</p>
      </Notes>
    </Reveal>
  );
}
