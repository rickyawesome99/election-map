"use client";

import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import DemographicsStrip from "@/components/DemographicsStrip";
import AtlasTrendChart from "./AtlasTrendChart";
import AtlasOutlook from "./AtlasOutlook";
import { AtlasCandidatesSection, AtlasFundraisingSection, CandidateLink, PARTY_COLOR } from "./AtlasCandidates";
import { AtlasOverlayMap, AtlasTransitionMaps } from "./AtlasEraMaps";
import type { Chamber } from "@/data/stateLegDistricts";
import type { AtlasDistrict, AtlasEra, AtlasMoney, AtlasResult } from "@/lib/stateLegAtlas";
import { fmtMoney, resultMargin } from "@/lib/stateLegAtlas";
import { getRatingColors, projectedMarginColor } from "@/lib/colorScale";

/** Margin text in the site's standard party colors (not the Safe/Likely/Lean shade scale). */
const marginText = (m: number) => (Math.abs(m) < 0.05 ? "var(--app-text-primary)" : projectedMarginColor(m));

function fmtMargin(v: number | null | undefined): string {
  if (v == null) return "—";
  if (Math.abs(v) < 0.05) return "Even";
  return `${v > 0 ? "R" : "D"}+${Math.abs(v).toFixed(1)}`;
}

function Pill({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "primary" }) {
  return (
    <span
      className="inline-block text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{ background: tone === "primary" ? "var(--app-text-primary)" : "var(--app-tab-bg)", color: tone === "primary" ? "var(--app-bg)" : "var(--app-text-muted)" }}
    >
      {children}
    </span>
  );
}

function eraLabel(eras: AtlasEra[], key: string): string {
  const e = eras.find((x) => x.key === key);
  if (!e) return key;
  return e.key === "current" ? "current map" : `${e.label} map`;
}

function Candidates({ r, abbr }: { r: AtlasResult; abbr: string }) {
  const cands = (r.candidates ?? []).filter((c) => c.votes == null || c.votes > 0);
  if (cands.length === 0) {
    return (
      <span style={{ color: "var(--app-text-muted)" }}>
        {r.noCount ? "No count published" : "Party totals only"}
      </span>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      {cands.map((c, i) => (
        <div key={`${c.name}-${i}`} className="flex items-baseline gap-2 min-w-0">
          <span className="truncate" style={{ color: PARTY_COLOR[c.party] ?? "var(--app-text-primary)" }}>
            <CandidateLink name={c.name} abbr={abbr} color={PARTY_COLOR[c.party] ?? "var(--app-text-primary)"} weight={c.winner ? 700 : 400} />
            <span className="ml-1 text-[11px] font-bold">({c.party})</span>
          </span>
          {c.incumbent && <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>inc.</span>}
          {c.post && <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>post {c.post}</span>}
          <span className="ml-auto tabular-nums text-xs" style={{ color: "var(--app-text-muted)" }}>{c.votes == null ? "—" : c.votes.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

/** Each named candidate's cycle contributions beside the result row, in the row's name order. */
function Raised({ r, money }: { r: AtlasResult; money: AtlasMoney | undefined }) {
  if (!money) return <span style={{ color: "var(--app-text-very-muted)" }}>—</span>;
  const cands = (r.candidates ?? []).filter((c) => c.votes == null || c.votes > 0);
  const byName = new Map(money.candidates.map((c) => [c.name, c]));
  return (
    <div className="flex flex-col gap-0.5 tabular-nums text-xs">
      {cands.map((c, i) => {
        const m = byName.get(c.name);
        return <span key={`${c.name}-${i}`} style={{ color: m?.matched ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}>{m?.matched ? fmtMoney(m.contributions) : "—"}</span>;
      })}
      {money.gapPct != null && cands.length > 1 && <span className="text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>{money.gapPct > 0 ? "R" : "D"} +{Math.abs(money.gapPct).toFixed(0)}%</span>}
    </div>
  );
}

export default function AtlasDistrictDetail({
  abbr,
  chamber,
  district,
  eras,
  electionYear,
  navigator,
}: {
  abbr: string;
  chamber: Chamber;
  district: AtlasDistrict;
  eras: AtlasEra[];
  electionYear: number;
  /** The district selector and locator map, placed between the hero and "About this district". */
  navigator?: React.ReactNode;
}) {
  const hasMoney = (district.money ?? []).some((m) => m.year !== electionYear);
  const up = district.nextElection === electionYear || district.incumbents.some((i) => (i.nextElection ?? district.nextElection) === electionYear);
  const currentEra = eras.find((e) => e.key === "current");
  const latestRedraw = district.redistricting.at(-1);
  const counties = latestRedraw?.counties ?? [];
  const presRows = (["2016", "2020", "2024"] as const).map((y) => {
    const thenEra = district.presByEra.find((e) => e.years.includes(Number(y))) ?? (Number(y) >= 2024 ? district.presByEra.find((e) => e.era === "current") : undefined);
    return { year: y, thenEra: thenEra?.era ?? null, then: thenEra?.pres[y] ?? null, now: district.presCurrent[y] ?? null };
  });

  const pr = district.projection;
  const rating = pr?.contest === "contested" && pr.rating ? getRatingColors(pr.rating) : null;
  const headline = !pr || pr.contest === "not-up" ? null
    : pr.contest === "uncontested-D" ? { label: "Projected", value: "Safe D", color: "var(--party-dem)" }
    : pr.contest === "uncontested-R" ? { label: "Projected", value: "Safe R", color: "var(--party-rep)" }
    : pr.contest === "contested" && pr.margin != null ? { label: "Projected Margin", value: fmtMargin(pr.margin), color: marginText(pr.margin) }
    : null;
  const parties = new Set(district.incumbents.map((i) => i.party));
  const heldBy = district.incumbents.length === 0 ? "Vacant" : parties.size === 1 ? `${[...parties][0] === "D" ? "Dem" : [...parties][0] === "R" ? "GOP" : "Ind."} held` : "Split delegation";
  const lastResult = [...district.results].sort((x, y) => y.year - x.year).find((r) => resultMargin(r) != null);
  const lastMargin = lastResult ? resultMargin(lastResult) : null;
  const pres24 = district.presCurrent["2024"]?.margin ?? null;
  const muted = "var(--app-text-very-muted)";
  const stats = [
    pr?.contest === "contested" && pr.pD != null
      ? { label: "Win Prob.", value: `${Math.round(Math.max(pr.pD, 1 - pr.pD) * 100)}% ${pr.pD >= 0.5 ? "D" : "R"}`, color: pr.pD >= 0.5 ? "var(--party-dem)" : "var(--party-rep)" }
      : pr?.contest === "not-up" && pr.lean != null
        ? { label: "TPL Lean", value: fmtMargin(pr.lean), color: marginText(pr.lean) }
        : { label: "Win Prob.", value: pr?.contest === "uncontested-D" ? "100% D" : pr?.contest === "uncontested-R" ? "100% R" : "—", color: pr?.contest === "uncontested-D" ? "var(--party-dem)" : pr?.contest === "uncontested-R" ? "var(--party-rep)" : muted },
    { label: "2024 President", value: fmtMargin(pres24), color: pres24 == null ? muted : marginText(pres24) },
    { label: lastResult ? `${lastResult.year} Result` : "Last Result", value: lastResult?.uncontested && lastMargin != null ? `Unopposed ${lastMargin > 0 ? "R" : "D"}` : fmtMargin(lastMargin), color: lastMargin == null ? muted : marginText(lastMargin) },
  ];

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-8">
      {/* Header — mirrors the House race pages' hero: title left, projected margin right, stat row */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {rating && <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0" style={{ background: rating.bg, color: rating.text }}>{pr!.rating}</span>}
              {up ? <Pill tone="primary">Up in {electionYear}</Pill> : district.nextElection ? <Pill>Next election {district.nextElection}</Pill> : null}
              {heldBy && <Pill>{heldBy}</Pill>}
              {district.seats != null && district.seats > 1 && <Pill>{district.seats} seats</Pill>}
            </div>
            <h2 className="mt-2" style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(1.75rem, 4.5vw, 2.6rem)", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em" }}>
              {district.label}
            </h2>
            <div className="mt-3 text-sm" style={{ color: "var(--app-text-muted)" }}>
              {up ? `${electionYear} ${abbr} ${chamber === "house" ? "House" : "Senate"} race` : `${abbr} ${chamber === "house" ? "House" : "Senate"} district`}{counties.length > 0 && <> · {counties.length === 1 ? `${counties[0].county} County` : `${counties.length} counties`}</>}
            </div>
          </div>
          {headline && (
            <div className="shrink-0 sm:text-right">
              <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>{headline.label}</div>
              <div className="tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 5vw, 3.25rem)", fontWeight: 700, lineHeight: 1, marginTop: "0.35rem", color: headline.color }}>
                {headline.value}
              </div>
            </div>
          )}
        </div>

        {/* Stat row */}
        <div className="mt-7 grid grid-cols-3 pt-5" style={{ borderTop: "1px solid var(--app-border)" }}>
          {stats.map((st, i) => (
            <div key={st.label} className={`min-w-0 ${i === 0 ? "pr-2 sm:pr-8" : i === 1 ? "px-2 sm:px-8" : "pl-2 sm:pl-8"}`} style={{ borderRight: i < 2 ? "1px solid var(--app-border)" : undefined }}>
              <div className="text-xl font-extrabold tabular-nums sm:text-2xl" style={{ color: st.color }}>{st.value}</div>
              <div className="mt-1 text-[9px] font-semibold uppercase tracking-wider sm:text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{st.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-1.5">
        {district.outgoing2026 && district.outgoing2026.length > 0 && (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>Not running</span>
            {district.outgoing2026.map((o, i) => (
              <span key={`${o.name}-${i}`} style={{ color: "var(--app-text-muted)" }}>
                <CandidateLink name={o.name} abbr={abbr} color={PARTY_COLOR[o.party] ?? "var(--app-text-primary)"} weight={600} />
                <span className="text-xs"> ({o.party}{o.post ? `, seat ${o.post}` : ""})</span>
                {o.reason && <span> · {o.reason}</span>}
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {district.incumbents.length === 0 && <span style={{ color: "var(--app-text-muted)" }}>Vacant</span>}
          {district.incumbents.map((inc) => (
            <span key={inc.name}>
              <span className="font-semibold" style={{ color: PARTY_COLOR[inc.party] }}><CandidateLink name={inc.name} abbr={abbr} color={PARTY_COLOR[inc.party]} weight={600} /> ({inc.party})</span>
              <span style={{ color: "var(--app-text-muted)" }}>
                {" "}· elected {inc.lastElection ?? district.lastElection ?? "—"}
                {(inc.nextElection ?? district.nextElection) != null && <> · next {inc.nextElection ?? district.nextElection}</>}
              </span>
            </span>
          ))}
        </div>
        </div>
      </div>

      {navigator}

      {/* About */}
      <section>
        <LedgerSectionHead label="About this district" meta={district.demographics?.population != null ? "ACS 2020–24" : undefined} />
        {district.demographics ? <DemographicsStrip {...district.demographics} /> : <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>No demographic data.</p>}
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm" style={{ color: "var(--app-text-muted)" }}>
          {counties.length > 0 && (
            <span>
              <b style={{ color: "var(--app-text-primary)" }}>{counties.length === 1 ? "County" : "Counties"}</b>{" "}
              {counties.map((c) => `${c.county}${counties.length > 1 && c.popPct < 99 ? ` (${c.popPct.toFixed(0)}%)` : ""}`).join(", ")}
            </span>
          )}
          {currentEra && (
            <span>
              <b style={{ color: "var(--app-text-primary)" }}>Map</b> {currentEra.source ?? "current map"}
              {currentEra.enactedDate && <>, enacted {currentEra.enactedDate}</>}
              {currentEra.years.length > 0 && <>, first used {currentEra.years[0]}</>}
            </span>
          )}
          {district.presByEra.length > 1 && (
            <span>
              <b style={{ color: "var(--app-text-primary)" }}>Prior maps</b>{" "}
              {district.presByEra.filter((e) => e.era !== "current").map((e) => eraLabel(eras, e.era).replace(" map", "")).join(", ")}
            </span>
          )}
        </div>
      </section>

      {district.candidates2026 && (
        <>
          <section>
            <LedgerSectionHead label={`${electionYear} Candidates`} meta={`Ballotpedia list${district.candidates2026.seats && district.candidates2026.seats > 1 ? ` · ${district.candidates2026.seats} seats` : ""}`} />
            <AtlasCandidatesSection district={district} abbr={abbr} />
          </section>
          <section>
            <LedgerSectionHead label="Fundraising" />
            <AtlasFundraisingSection district={district} electionYear={electionYear} />
          </section>
        </>
      )}

      {district.projection && <AtlasOutlook district={district} eras={eras} electionYear={electionYear} />}

      {/* Electoral history */}
      <section>
        <LedgerSectionHead label="Electoral history" meta={`${district.results.length} general election${district.results.length === 1 ? "" : "s"} for this district number`} />
        {district.results.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>No results on file.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                  {["Year", "Candidates", ...(hasMoney ? ["Raised"] : []), "Dem", "Rep", "Margin", "Lines"].map((h) => (
                    <th key={h} className={`py-1.5 pr-3 text-[10px] uppercase tracking-wider font-semibold ${["Dem", "Rep", "Margin", "Raised"].includes(h) ? "text-right" : "text-left"}`} style={{ color: "var(--app-text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {district.results.map((r) => {
                  const m = resultMargin(r);
                  const pct = (v: number | null) => (r.totalVotes && v != null ? `${((v / r.totalVotes) * 100).toFixed(1)}%` : "—");
                  return (
                    <tr key={r.year} style={{ borderBottom: "1px solid var(--app-border)" }}>
                      <td className="py-2 pr-3 font-semibold align-top">{r.year}{r.uncontested && <div><Pill>unopposed</Pill></div>}</td>
                      <td className="py-2 pr-3 align-top min-w-[220px]"><Candidates r={r} abbr={abbr} /></td>
                      {hasMoney && <td className="py-2 pr-3 text-right align-top"><Raised r={r} money={district.money?.find((x) => x.year === r.year)} /></td>}
                      <td className="py-2 pr-3 text-right align-top" style={{ color: "var(--party-dem)" }}>{pct(r.demVotes)}</td>
                      <td className="py-2 pr-3 text-right align-top" style={{ color: "var(--party-rep)" }}>{pct(r.repVotes)}</td>
                      <td className="py-2 pr-3 text-right align-top font-semibold" style={{ color: m == null ? "var(--app-text-very-muted)" : marginText(m) }}>{fmtMargin(m)}</td>
                      <td className="py-2 pr-0 align-top text-xs whitespace-nowrap" style={{ color: r.era === "current" ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>{eraLabel(eras, r.era)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {district.results.some((r) => r.era !== "current") && (
              <p className="mt-2 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
                Rows on a superseded map are the race held under this district number on those lines, which may cover different ground than today&rsquo;s district. See Redistricting history.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Trend */}
      <section>
        <LedgerSectionHead label="TPL lean trend" meta="neutral lean on today's lines · Republican up" />
        <AtlasTrendChart district={district} />
      </section>

      {/* President by boundary */}
      <section>
        <LedgerSectionHead label="Presidential results by boundary" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm max-w-xl" style={{ borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                <th className="py-1.5 pr-3 text-left text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>Election</th>
                <th className="py-1.5 pr-3 text-right text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>Lines then</th>
                <th className="py-1.5 pr-3 text-left text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>Map</th>
                <th className="py-1.5 pr-3 text-right text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-muted)" }}>Today&rsquo;s lines</th>
              </tr>
            </thead>
            <tbody>
              {presRows.map((row) => (
                <tr key={row.year} style={{ borderBottom: "1px solid var(--app-border)" }}>
                  <td className="py-1.5 pr-3 font-semibold">{row.year}</td>
                  <td className="py-1.5 pr-3 text-right font-semibold" style={{ color: row.then ? marginText(row.then.margin) : "var(--app-text-very-muted)" }}>{fmtMargin(row.then?.margin)}</td>
                  <td className="py-1.5 pr-3 text-left text-xs whitespace-nowrap" style={{ color: "var(--app-text-very-muted)" }}>{row.thenEra ? eraLabel(eras, row.thenEra) : ""}</td>
                  <td className="py-1.5 pr-3 text-right font-semibold" style={{ color: row.now ? marginText(row.now.margin) : "var(--app-text-very-muted)" }}>
                    {fmtMargin(row.now?.margin)}{row.now?.estimated && <span className="ml-1 text-xs font-normal" style={{ color: "var(--app-text-very-muted)" }}>est.</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Redistricting */}
      <section>
        <LedgerSectionHead label="Redistricting history" meta={district.redistricting.length ? `${district.redistricting.length} map change${district.redistricting.length === 1 ? "" : "s"} since 2016` : undefined} />
        {district.overlay && district.components?.length ? (
          <div className="mb-5">
            <p className="text-sm mb-3" style={{ color: "var(--app-text-primary)", maxWidth: "72ch" }}>
              {district.label} is a floterial: an overlay district with no lines of its own, whose voters elect its member{district.seats != null && district.seats > 1 ? "s" : ""} in addition to those of the base districts it covers.
            </p>
            <AtlasOverlayMap abbr={abbr} chamber={chamber} districtKey={district.key} components={district.components} seats={district.seats} />
          </div>
        ) : null}
        {district.redistricting.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>{district.overlay ? "No redistricting record: overlay districts have no polygon in the boundary files." : "Lines unchanged across the years on file."}</p>
        ) : (
          <div className="flex flex-col gap-7">
            {[...district.redistricting].reverse().map((e) => (
              <div key={e.toEra} className="text-sm">
                <div className="flex flex-wrap items-baseline gap-2 mb-1">
                  <span className="font-semibold">{eraLabel(eras, e.fromEra)} → {eraLabel(eras, e.toEra)}</span>
                  <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>kept {e.retainedPopPct.toFixed(0)}% of its population</span>
                </div>
                <p style={{ color: "var(--app-text-primary)", maxWidth: "72ch" }}>{e.text}</p>
                <div className="mt-3">
                  <AtlasTransitionMaps abbr={abbr} chamber={chamber} districtKey={district.key} entry={e} eras={eras} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <p className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>
        {abbr} {chamber === "house" ? "House" : "Senate"} district {district.key}. Presidential figures on superseded lines are area-apportioned from VTD returns; see the methodology for the measured error.
      </p>
    </div>
  );
}
