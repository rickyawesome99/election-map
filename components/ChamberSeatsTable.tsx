"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Segmented from "@/components/MarketSegmented";
import type { RaceType } from "@/data/forecastData";
import { fmtSeatMargin } from "@/lib/chamberPageFormat";
import type { ChamberSeat, SeatParty } from "@/lib/chamberPageTypes";

// The seats table on /house, /senate and /governor: one row per seat with who held it, who won it,
// the outcome and by how much. The page builds the rows on the server
// (lib/chamberPage.ts); the table sorts, filters and draws them.

type Sort = "close" | "flips" | "alpha";
const SORTS: [Sort, string][] = [["close", "Closest"], ["flips", "Flips"], ["alpha", "A–Z"]];

const PARTY_VAR: Record<SeatParty, string> = { D: "var(--party-dem)", R: "var(--party-rep)", I: "var(--party-ind)" };

/** How close the count was; seats with no contest to rank sort after every counted race. */
function closeness(s: ChamberSeat): number {
  if (!s.up) return 2e6;
  if (!s.result || s.result.unopposed || s.result.margin == null) return 1e6;
  return Math.abs(s.result.margin);
}

function Person({ name, party }: { name: string | null; party: SeatParty | null }) {
  if (!name) return <span style={{ color: "var(--app-text-muted)" }}>—</span>;
  // The whole name in the party's color, its letter after it for anyone who can't tell the two apart.
  return <span className="font-semibold" style={party ? { color: PARTY_VAR[party] } : undefined}>{name}{party && <> ({party})</>}</span>;
}

/** Flips are a solid pill; holds are party-colored text. */
function OutcomeCell({ s, year }: { s: ChamberSeat; year: number }) {
  if (!s.up) return <span className="whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>Not up in {year}</span>;
  const color = PARTY_VAR[s.after];
  const label = `${s.after} ${s.flip ? "Flip" : "Hold"}${s.result?.called ? "" : " (leading)"}`;
  if (s.flip) return <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: color, color: "#fff" }}>{label}</span>;
  return <span className="whitespace-nowrap font-semibold" style={{ color }}>{label}</span>;
}

function MarginCell({ s }: { s: ChamberSeat }) {
  if (!s.up || !s.result) return <span style={{ color: "var(--app-text-muted)" }}>—</span>;
  return (
    <span className="whitespace-nowrap font-semibold tabular-nums" style={{ color: s.result.unopposed ? "var(--app-text-muted)" : s.result.party ? PARTY_VAR[s.result.party] : undefined }} title={s.result.sameParty ? "Both finalists are of the same party" : undefined}>
      {fmtSeatMargin(s)}
    </span>
  );
}

const seatName = (s: ChamberSeat) => `${s.label}${s.special ? " (special)" : ""}`;

export default function ChamberSeatsTable({ office, seats, year }: { office: RaceType; seats: ChamberSeat[]; year: number }) {
  const [sort, setSort] = useState<Sort>("close");
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? seats.filter((s) => [s.label, s.stateName, s.stateAbbr, s.before.name, s.result?.name ?? ""].some((v) => v.toLowerCase().includes(q)))
      : [...seats];
    // The rows arrive in seat order, and Array.sort is stable, so that order breaks every tie.
    if (sort === "close") list.sort((a, b) => closeness(a) - closeness(b));
    else if (sort === "flips") list.sort((a, b) => Number(b.flip) - Number(a.flip) || closeness(a) - closeness(b));
    return list;
  }, [seats, sort, query]);

  const heading = office === "governor" ? "Governorships" : "Seats";

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 pb-3" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
        <h2 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>{heading}</h2>
        <span className="text-xs tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{shown.length === seats.length ? seats.length : `${shown.length} of ${seats.length}`}</span>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={office === "house" ? "State, district or name" : "State or name"}
            aria-label={`Filter ${heading.toLowerCase()}`}
            autoComplete="off"
            className="w-44 rounded-md px-2.5 py-1 text-base outline-none sm:text-xs"
            style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)", color: "var(--app-text-primary)" }}
          />
          <Segmented label={`Sort ${heading.toLowerCase()}`} value={sort} onChange={setSort} options={SORTS} />
        </div>
      </div>

      {shown.length === 0 && <p className="py-6 text-sm" style={{ color: "var(--app-text-muted)" }}>No seat matches &ldquo;{query}&rdquo;.</p>}

      {shown.length > 0 && (
        // One table at every width (435 rows on /house: a second phone layout would double the page).
        // Phones drop the Incumbent column.
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm" style={{ borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                {([[office === "house" ? "District" : "State", "text-left"], ...(office === "senate" ? [["Class", "text-left"] as const] : []), ["Incumbent", "hidden text-left sm:table-cell"], ["Winner", "text-left"], ["Outcome", "text-left"], ["Margin", "text-right"]] as const).map(([h, cls]) => (
                  <th key={h} className={`whitespace-nowrap py-1.5 pr-3 text-[10px] font-semibold uppercase tracking-wider first:pl-2 last:pr-2 ${cls}`} style={{ color: "var(--app-text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                // Off-screen rows skip layout and paint until scrolled near.
                <tr key={s.key} className="vh-tr" style={{ borderBottom: "1px solid var(--app-border)", contentVisibility: "auto", containIntrinsicSize: "auto 37px", animation: "none" }}>
                  <td className="py-2 pl-2 pr-3 sm:whitespace-nowrap"><Link href={s.href} prefetch={false} className="font-semibold hover:underline">{seatName(s)}</Link></td>
                  {office === "senate" && <td className="py-2 pr-3" style={{ color: "var(--app-text-muted)" }} title={s.seatClass ? `Class ${s.seatClass}` : undefined}>{s.seatClass ?? "—"}</td>}
                  <td className="hidden py-2 pr-3 sm:table-cell"><Person name={s.before.name} party={s.before.party} /></td>
                  <td className="py-2 pr-3">{s.up ? <Person name={s.result?.name ?? null} party={s.result?.party ?? null} /> : <Person name={s.before.name} party={s.before.party} />}</td>
                  <td className="py-2 pr-3"><OutcomeCell s={s} year={year} /></td>
                  <td className="py-2 pr-2 text-right"><MarginCell s={s} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
