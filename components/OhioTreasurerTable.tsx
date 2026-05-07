"use client";

import { useState, useMemo } from "react";
import { ohioTreasurerData, roegnerPct, edwardsPct, roegnerVotes, edwardsVotes, type OhioCountyResult } from "@/data/ohioTreasurerData";

type SortKey = "county" | "margin" | "voteTotal" | "reportingPct";
type SortDir = "asc" | "desc";

function sortData(data: OhioCountyResult[], key: SortKey, dir: SortDir): OhioCountyResult[] {
  return [...data].sort((a, b) => {
    let va: string | number, vb: string | number;
    if (key === "county")        { va = a.county;       vb = b.county; }
    else if (key === "margin")   { va = a.margin ?? -999; vb = b.margin ?? -999; }
    else if (key === "voteTotal"){ va = a.voteTotal;    vb = b.voteTotal; }
    else                         { va = a.reportingPct; vb = b.reportingPct; }
    if (va < vb) return dir === "asc" ? -1 : 1;
    if (va > vb) return dir === "asc" ? 1 : -1;
    return 0;
  });
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return null;
  return <span className="inline-flex ml-1" style={{ fontSize: 9 }}>{dir === "asc" ? "▲" : "▼"}</span>;
}

const thBase = "px-4 py-2 font-medium whitespace-nowrap cursor-pointer select-none hover:opacity-70 transition-opacity text-[10px] uppercase tracking-wider";

export default function OhioTreasurerTable() {
  const [sortKey, setSortKey] = useState<SortKey>("voteTotal");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showVotes, setShowVotes] = useState(false);

  const sorted = useMemo(() => sortData(ohioTreasurerData, sortKey, sortDir), [sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) { setSortDir(d => d === "asc" ? "desc" : "asc"); }
    else { setSortKey(key); setSortDir(key === "county" ? "asc" : "desc"); }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setShowVotes(v => !v)}
          className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
          style={{
            background: showVotes ? "var(--app-tab-bg)" : "transparent",
            color: showVotes ? "var(--app-text-primary)" : "var(--app-text-muted)",
            border: "1px solid var(--app-border)",
          }}
        >
          {showVotes ? "Hide" : "Show"} Vote Counts
        </button>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
        <div className="overflow-x-auto">
          <table className="text-sm w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
                <th
                  className={`${thBase} text-left`}
                  style={{ color: "var(--app-text-muted)" }}
                  onClick={() => handleSort("county")}
                >
                  County<SortIcon active={sortKey === "county"} dir={sortDir} />
                </th>
                <th
                  className={`${thBase} text-right`}
                  style={{ color: "var(--app-text-muted)", borderLeft: "1px solid var(--app-border)" }}
                  onClick={() => handleSort("margin")}
                >
                  Margin<SortIcon active={sortKey === "margin"} dir={sortDir} />
                </th>
                {showVotes && (
                  <th
                    className={`${thBase} text-right`}
                    style={{ color: "var(--party-rep, #be1c29)", borderLeft: "1px solid var(--app-border)" }}
                  >
                    Roegner
                  </th>
                )}
                {showVotes && (
                  <th
                    className={`${thBase} text-right`}
                    style={{ color: "var(--party-dem, #1b408c)" }}
                  >
                    Edwards
                  </th>
                )}
                <th
                  className={`${thBase} text-right`}
                  style={{ color: "var(--app-text-muted)", borderLeft: "1px solid var(--app-border)" }}
                  onClick={() => handleSort("voteTotal")}
                >
                  Votes<SortIcon active={sortKey === "voteTotal"} dir={sortDir} />
                </th>
                <th
                  className={`${thBase} text-right`}
                  style={{ color: "var(--app-text-muted)" }}
                  onClick={() => handleSort("reportingPct")}
                >
                  Reporting<SortIcon active={sortKey === "reportingPct"} dir={sortDir} />
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const rPct = roegnerPct(r);
                const ePct = edwardsPct(r);
                const rVotes = roegnerVotes(r);
                const eVotes = edwardsVotes(r);
                const hasData = r.winner !== null && r.voteTotal > 0;
                const marginColor = r.winner === "Roegner"
                  ? "var(--party-rep, #be1c29)"
                  : r.winner === "Edwards"
                  ? "var(--party-dem, #1b408c)"
                  : "var(--app-text-muted)";

                return (
                  <tr
                    key={r.county}
                    style={{
                      background: i % 2 === 0 ? "var(--app-bg)" : "var(--app-panel)",
                      borderBottom: "1px solid var(--app-border)",
                    }}
                  >
                    <td className="px-4 py-2 font-medium whitespace-nowrap" style={{ color: "var(--app-text-primary)" }}>
                      {r.county}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ borderLeft: "1px solid var(--app-border)" }}>
                      {hasData ? (
                        <span
                          className="inline-block px-2 py-0.5 rounded text-xs font-semibold"
                          style={{
                            background: r.winner === "Roegner"
                              ? "var(--party-rep-subtle, #be1c2933)"
                              : "var(--party-dem-subtle, #1b408c33)",
                            color: marginColor,
                          }}
                        >
                          {r.marginLabel}
                        </span>
                      ) : (
                        <span style={{ color: "var(--app-text-muted)" }}>—</span>
                      )}
                    </td>
                    {showVotes && (
                      <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--party-rep, #be1c29)", borderLeft: "1px solid var(--app-border)" }}>
                        {hasData ? (
                          <>{rVotes.toLocaleString()} <span className="text-xs" style={{ opacity: 0.7 }}>({rPct.toFixed(1)}%)</span></>
                        ) : "—"}
                      </td>
                    )}
                    {showVotes && (
                      <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--party-dem, #1b408c)" }}>
                        {hasData ? (
                          <>{eVotes.toLocaleString()} <span className="text-xs" style={{ opacity: 0.7 }}>({ePct.toFixed(1)}%)</span></>
                        ) : "—"}
                      </td>
                    )}
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--app-text-primary)", borderLeft: "1px solid var(--app-border)" }}>
                      {hasData ? r.voteTotal.toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                      {r.reportingPct === 0 ? "0%" : r.reportingPct === 97 ? ">95%" : `${r.reportingPct}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
