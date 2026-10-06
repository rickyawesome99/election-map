"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { RaceType } from "@/data/forecastData";
import Segmented from "@/components/MarketSegmented";
import { SEAT_HOLDOVERS, TOTAL_SEATS_BY_TYPE } from "@/lib/forecastTypes";
import { BUCKETS, bucketColor, bucketIndex, favoriteOf, fmtPrice, sideColor, type MarketBoardOffice, type MarketBoardRace } from "@/lib/marketBoardDisplay";

// The 2026 section of /analysis/markets: every race of one office sorted into ten price buckets
// (90%+ R … 90%+ D), or the same prices on a map. The map is the TPL hub's choropleth — the
// shoreline-clipped lite district file, memoized layers — loaded only when the Map view is chosen.
const TplMap = dynamic(() => import("./tpl/TplMaps").then((m) => m.TplMap), {
  ssr: false,
  loading: () => <div className="h-[300px] sm:h-[400px] md:h-[480px] rounded-xl" style={{ border: "1px solid var(--app-border)" }} />,
});

const CHIP_LIMIT = 12;

/** Races closest to 50% first, so each column reads from its most contested race down. */
const byContested = (a: MarketBoardRace, b: MarketBoardRace) => favoriteOf(a.pDem).prob - favoriteOf(b.pDem).prob || a.name.localeCompare(b.name);

const pct = (p: number) => `${Math.round(p * 100)}%`;
const seats = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

function chipTitle(r: MarketBoardRace): string {
  const matchup = r.demName && r.repName ? `${r.demName} (D) vs ${r.repName} (R) · ` : "";
  return `${matchup}Polymarket ${fmtPrice(r.pDem)} · this site ${fmtPrice(r.modelPDem)}`;
}

export function MarketBucketLegend() {
  return (
    <div className="flex items-center gap-1 text-[10px]" style={{ color: "var(--app-text-muted)" }} aria-label="Legend: 90%+ Republican to 90%+ Democratic">
      <span>R 90%+</span>
      {BUCKETS.map((b) => <span key={`${b.side}${b.lo}`} title={`${b.label} ${b.side}`} className="inline-block h-2 w-3.5" style={{ background: b.color }} />)}
      <span>D 90%+</span>
    </div>
  );
}

function BucketColumns({ office, races }: { office: RaceType; races: MarketBoardRace[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const columns = useMemo(() => {
    const cols: MarketBoardRace[][] = BUCKETS.map(() => []);
    for (const r of races) cols[bucketIndex(r.pDem)].push(r);
    return cols.map((c) => c.sort(byContested));
  }, [races]);

  return (
    <div className="overflow-x-auto">
      <div className="grid gap-x-1.5" style={{ gridTemplateColumns: "repeat(10, minmax(92px, 1fr))", minWidth: 940 }}>
        {BUCKETS.map((b, i) => {
          const key = `${office}-${i}`;
          const list = columns[i];
          const open = expanded.has(key);
          const shown = open ? list : list.slice(0, CHIP_LIMIT);
          return (
            <div key={key} className="min-w-0">
              <div className="h-1.5 rounded-sm" style={{ background: b.color }} />
              <div className="mt-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: `var(--party-${b.side === "D" ? "dem" : "rep"})` }}>{b.label} {b.side}</div>
              <div className="text-xl font-extrabold tabular-nums">{list.length}</div>
              <div className="mt-1.5 space-y-0.5">
                {shown.map((r) => (
                  <Link key={r.id} href={r.href} title={chipTitle(r)} className="flex items-baseline justify-between gap-1 rounded px-1.5 py-0.5 text-[11px] hover:underline"
                    style={{ background: `color-mix(in srgb, ${b.color} 16%, transparent)`, color: "var(--app-text-primary)" }}>
                    <span className="min-w-0 truncate font-semibold">{r.name}</span>
                    <span className="shrink-0 tabular-nums" style={{ color: "var(--app-text-muted)" }}>{pct(favoriteOf(r.pDem).prob)}</span>
                  </Link>
                ))}
                {list.length > CHIP_LIMIT && (
                  <button type="button" className="w-full rounded px-1.5 py-0.5 text-left text-[11px] font-semibold hover:underline" style={{ color: "var(--app-text-muted)" }}
                    onClick={() => setExpanded((prev) => { const next = new Set(prev); if (open) next.delete(key); else next.add(key); return next; })}>
                    {open ? "Show fewer" : `+${list.length - CHIP_LIMIT} more`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MarketBoard({ offices }: { offices: MarketBoardOffice[] }) {
  const [office, setOffice] = useState<RaceType>("senate");
  const [view, setView] = useState<"buckets" | "map">("buckets");
  const current = offices.find((o) => o.office === office) ?? offices[0];
  const races = current.races;

  const demFavored = races.filter((r) => r.pDem >= 0.5).length;
  const hold = SEAT_HOLDOVERS[current.office];
  const total = TOTAL_SEATS_BY_TYPE[current.office];
  const marketDem = hold.dem + races.reduce((s, r) => s + r.pDem, 0);
  const modelDem = hold.dem + races.reduce((s, r) => s + r.modelPDem, 0);
  const closest = [...races].sort(byContested).slice(0, 3);

  // TplMap keys states by name and districts by the GEOID with leading zeros stripped ("0101" → "101").
  const mapRows = races.map((r) => ({ key: office === "house" ? String(parseInt(r.id, 10)) : r.state, name: r.name, value: r.pDem, href: r.href }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Segmented label="Office" value={office} onChange={setOffice} options={offices.map((o) => [o.office, o.label])} />
        <Segmented label="View" value={view} onChange={setView} options={[["buckets", "Buckets"], ["map", "Map"]]} />
        <div className="sm:ml-auto"><MarketBucketLegend /></div>
      </div>

      <p className="mb-5 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
        Polymarket favors Democrats in <b style={{ color: "var(--app-text-primary)" }}>{demFavored}</b> of the {races.length} {current.label} races
        and Republicans in <b style={{ color: "var(--app-text-primary)" }}>{races.length - demFavored}</b>. Adding up the prices
        {hold.dem + hold.rep > 0 ? " and the seats not on the ballot" : ""} gives Democrats{" "}
        <b style={{ color: "var(--party-dem)" }}>{seats(marketDem)}</b> of {total} seats, against{" "}
        <b style={{ color: "var(--party-dem)" }}>{seats(modelDem)}</b> from this site&rsquo;s forecast. The closest prices:{" "}
        {closest.map((r, i) => (
          <span key={r.id}>{i > 0 && ", "}<Link href={r.href} className="font-semibold hover:underline" style={{ color: "var(--app-text-primary)" }}>{r.name}</Link>{" "}
            <span className="tabular-nums" style={{ color: sideColor(r.pDem) }}>{fmtPrice(r.pDem)}</span></span>
        ))}.
      </p>

      {view === "buckets" ? (
        <BucketColumns office={current.office} races={races} />
      ) : (
        <TplMap mode={current.office === "house" ? "districts" : "states"} rows={mapRows} valueLabel="Polymarket" linkLabel="Open race page"
          colorOf={bucketColor} formatValue={fmtPrice} valueColor={sideColor} />
      )}
    </div>
  );
}
