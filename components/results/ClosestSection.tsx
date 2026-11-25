"use client";

import { useMemo, useState } from "react";
import type { R26CloseRace } from "@/lib/results2026Types";
import { Figure, MoreButton, Notes, Reveal, RowLink, Seg, TH, fmtInt, partyInk, rowMotion } from "./ui";

// Section 6: the narrowest results of 2026 for Senate, governor, U.S. House and the state
// legislatures, by share of the vote or by votes.

type Office = R26CloseRace["office"] | "all";
type Rank = "pct" | "votes";
const OFFICES: [Office, string][] = [["all", "All"], ["senate", "Senate"], ["governor", "Governor"], ["house", "U.S. House"], ["state_senate", "State senates"], ["state_house", "State houses"]];
const RANKS: [Rank, string][] = [["pct", "By share of the vote"], ["votes", "By votes"]];
const STEP = 25;

function Tag({ children, tone }: { children: string; tone?: "warn" }) {
  return <span className="ml-2 whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-bold uppercase tracking-wider" style={{ border: "1px solid var(--app-border)", color: tone === "warn" ? "var(--count-partial, #a86400)" : "var(--app-text-muted)" }}>{children}</span>;
}

export default function ClosestSection({ races }: { races: R26CloseRace[] }) {
  const [office, setOffice] = useState<Office>("all");
  const [rank, setRank] = useState<Rank>("pct");
  const [count, setCount] = useState(STEP);
  const rows = useMemo(() => races.filter((r) => office === "all" || r.office === office).sort((a, b) => a[rank] - b[rank] || a.pct - b.pct), [races, office, rank]);
  const shown = rows.slice(0, count);
  const who = (c: R26CloseRace["first"]) => <span style={{ color: partyInk(c.party) }}>{c.name} <span className="text-xs">({c.party})</span></span>;
  return (
    <Reveal>
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Seg label="Office" value={office} onChange={(v) => { setOffice(v); setCount(STEP); }} options={OFFICES} scroll />
        <Seg label="Rank" value={rank} onChange={(v) => { setRank(v); setCount(STEP); }} options={RANKS} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" aria-label="Closest 2026 results">
          <thead>
            <tr style={{ color: "var(--app-text-muted)" }}>
              {[["", "text-right w-8"], ["Race", "text-left"], ["Winner", "text-left"], ["Runner-up", "text-left hidden sm:table-cell"], ["Margin, pts", "text-right"], ["Votes", "text-right"], ["Votes cast", "text-right hidden sm:table-cell"]].map(([h, c]) => (
                <th key={h} scope="col" className={`${TH} ${c}`} style={{ borderBottom: "1px solid var(--app-border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody key={`${office}-${rank}`}>
            {shown.map((r, i) => (
              <tr key={`${r.office}-${r.label}`} {...rowMotion(i % STEP)}>
                <td className="px-2 py-1.5 text-right text-xs tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{i + 1}</td>
                <td className="px-2 py-1.5">
                  <RowLink href={r.href}>{r.label}</RowLink>
                  {!r.called && <Tag tone="warn">Not called</Tag>}
                  {r.recount && <Tag tone="warn">Recount</Tag>}
                  {r.seats && <Tag>{`${r.seats} seats`}</Tag>}
                </td>
                <td className="px-2 py-1.5 font-semibold">{who(r.first)}</td>
                <td className="hidden px-2 py-1.5 sm:table-cell">{who(r.second)}</td>
                <td className="px-2 py-1.5 text-right"><Figure color={partyInk(r.first.party)}>{r.pct.toFixed(2)}</Figure></td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(r.votes)}</td>
                <td className="hidden px-2 py-1.5 text-right tabular-nums sm:table-cell" style={{ color: "var(--app-text-muted)" }}>{fmtInt(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > count && <MoreButton onClick={() => setCount((c) => c + STEP)}>Show {Math.min(STEP, rows.length - count)} more</MoreButton>}
      <Notes>
        <p><strong>Margin:</strong> the winner&rsquo;s lead over the nearest loser, in votes and in points of all votes cast. In a race that fills several seats (marked), it is the last winner&rsquo;s lead over the first candidate left out, and the points are of all votes cast for the seats together.</p>
        <p><strong>Not called:</strong> the leader is shown; the count or a recount is still open. Louisiana&rsquo;s two House seats headed to a December runoff are left out, as are races with one candidate.</p>
        <p><strong>Counts:</strong> U.S. Senate, governor and U.S. House from the saved results snapshot; Alaska&rsquo;s House seat is its final ranked-choice round. State legislative counts are official where a state publishes them and The Associated Press&rsquo;s elsewhere; none are certified until the map above says so. Each office lists its 60 narrowest races.</p>
      </Notes>
    </Reveal>
  );
}
