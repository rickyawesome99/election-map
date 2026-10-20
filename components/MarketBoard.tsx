"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { RaceType } from "@/data/forecastData";
import Segmented from "@/components/MarketSegmented";
import { SEAT_HOLDOVERS, TOTAL_SEATS_BY_TYPE } from "@/lib/forecastTypes";
import { BUCKETS, bucketIndex, favoriteOf, type MarketBoardOffice, type MarketBoardRace } from "@/lib/marketBoardDisplay";

// The 2026 section of /analysis/markets: every race of one office sorted into ten price buckets
// (90%+ R … 90%+ D), under a bar of the seats those prices add up to.

const CHIP_LIMIT = 12;

/** Races closest to 50% first, so each column reads from its most contested race down. */
const byContested = (a: MarketBoardRace, b: MarketBoardRace) => favoriteOf(a.pDem).prob - favoriteOf(b.pDem).prob || a.name.localeCompare(b.name);

const pct = (p: number) => `${Math.round(p * 100)}%`;
const seats = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

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
    <div className="hidden overflow-x-auto lg:block">
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
                  <Link key={r.id} href={r.href} prefetch={false} className="flex items-baseline justify-between gap-1 rounded px-1.5 py-0.5 text-[11px] hover:underline"
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

/** Polymarket's prices summed into seats (plus the seats not on the ballot), D from the left, R from the right. */
function SeatBar({ label, total, dem }: { label: string; total: number; dem: number }) {
  const rep = total - dem;
  const demPct = (dem / total) * 100;
  return (
    <div className="flex min-w-[240px] flex-1 items-center gap-2 text-xs tabular-nums">
      <b style={{ color: "var(--party-dem)" }}>{seats(dem)} D</b>
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-sm" role="img"
        aria-label={`Polymarket's prices add up to ${seats(dem)} Democratic and ${seats(rep)} Republican ${label} seats of ${total}`}>
        <div className="absolute inset-y-0 left-0" style={{ width: `${demPct}%`, background: "var(--party-dem)" }} />
        <div className="absolute inset-y-0 right-0" style={{ width: `${100 - demPct}%`, background: "var(--party-rep)" }} />
        <div className="absolute inset-y-0 left-1/2 w-px" style={{ background: "var(--app-bg)" }} />
      </div>
      <b style={{ color: "var(--party-rep)" }}>{seats(rep)} R</b>
    </div>
  );
}

/** The House's 90%+ bands — hundreds of races nobody doubts — start folded on phones, leaving the contested middle in view. */
const isLock = (office: RaceType, i: number) => office === "house" && (i === 0 || i === BUCKETS.length - 1);

/** Below lg the ten columns become ten full-width rows (90%+ R at the top) of wrapping postal-code chips. */
function BucketRows({ office, races }: { office: RaceType; races: MarketBoardRace[] }) {
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const rows = useMemo(() => {
    const cols: MarketBoardRace[][] = BUCKETS.map(() => []);
    for (const r of races) cols[bucketIndex(r.pDem)].push(r);
    return cols.map((c) => c.sort(byContested));
  }, [races]);

  return (
    <div className="space-y-3 lg:hidden">
      {BUCKETS.map((b, i) => {
        const key = `${office}-${i}`;
        const list = rows[i];
        const folded = isLock(office, i) && !opened.has(key);
        return (
          <div key={key}>
            <div className="h-1 rounded-sm" style={{ background: b.color }} />
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: `var(--party-${b.side === "D" ? "dem" : "rep"})` }}>{b.label} {b.side}</span>
              <span className="text-sm font-extrabold tabular-nums">{list.length}</span>
              {isLock(office, i) && list.length > 0 && (
                <button type="button" className="ml-auto text-[11px] font-semibold hover:underline" style={{ color: "var(--app-text-muted)" }}
                  onClick={() => setOpened((prev) => { const next = new Set(prev); if (folded) next.add(key); else next.delete(key); return next; })}>
                  {folded ? `Show ${list.length === 1 ? "race" : `${list.length} races`}` : "Hide"}
                </button>
              )}
            </div>
            {!folded && list.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {list.map((r) => (
                  <Link key={r.id} href={r.href} prefetch={false} className="flex items-baseline gap-1.5 rounded px-1.5 py-0.5 text-[11px] hover:underline"
                    style={{ background: `color-mix(in srgb, ${b.color} 16%, transparent)`, color: "var(--app-text-primary)" }}>
                    <span className="font-semibold">{r.short}</span>
                    <span className="tabular-nums" style={{ color: "var(--app-text-muted)" }}>{pct(favoriteOf(r.pDem).prob)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function MarketBoard({ offices }: { offices: MarketBoardOffice[] }) {
  const [office, setOffice] = useState<RaceType>("senate");
  const current = offices.find((o) => o.office === office) ?? offices[0];
  const races = current.races;

  const hold = SEAT_HOLDOVERS[current.office];
  const total = TOTAL_SEATS_BY_TYPE[current.office];
  const marketDem = hold.dem + races.reduce((s, r) => s + r.pDem, 0);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-x-8 gap-y-3">
        <Segmented label="Office" value={office} onChange={setOffice} options={offices.map((o) => [o.office, o.label])} />
        <SeatBar label={current.label} total={total} dem={marketDem} />
        <MarketBucketLegend />
      </div>

      <BucketColumns office={current.office} races={races} />
      <BucketRows office={current.office} races={races} />
    </div>
  );
}
