import { SOURCE_GROUPS, DEAD_ENDS, UNRECORDED_PROVENANCE, SOURCE_KIND_LABEL, type Source, type SourceKind } from "@/data/methodologySources";
import { stateLegMapInfo } from "@/data/stateLegMapInfo";
import { stateLegData } from "@/data/forecastData";
import { fundraisingData } from "@/data/fundraisingData";
import { statesData } from "@/data/statesData";
import { Block, Code, DataTable, Defs, MUTED, P, Section, StatRow, VERY_MUTED } from "./kit";

const KIND_ORDER: SourceKind[] = ["official", "academic", "project", "wiki", "news", "service"];

function SourceRows({ sources }: { sources: Source[] }) {
  return (
    <div>
      {sources.map((s) => (
        <div key={s.name} className="grid grid-cols-1 gap-x-5 gap-y-1.5 py-4 sm:grid-cols-[15.5rem_minmax(0,1fr)]" style={{ borderBottom: "1px solid var(--app-border)" }}>
          <div>
            <div className="text-[15px] font-bold leading-snug">
              {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-1 underline-offset-2 hover:decoration-2">{s.name}</a> : s.name}
            </div>
            {s.publisher && <div className="mt-0.5 text-xs" style={MUTED}>{s.publisher}</div>}
            <div className="mt-1 text-[10px] font-bold uppercase tracking-wider" style={s.kind === "official" ? { color: "var(--app-text-primary)" } : VERY_MUTED}>{SOURCE_KIND_LABEL[s.kind]}</div>
          </div>
          <div className="space-y-2.5">
            {s.uses.map((u, i) => (
              <div key={i}>
                <div className="text-sm leading-relaxed" style={{ color: "var(--app-text-primary)" }}>{u.data}</div>
                <div className="mt-0.5 break-words text-xs leading-relaxed" style={VERY_MUTED}><Code>{u.where}</Code></div>
              </div>
            ))}
            {s.note && <p className="text-xs leading-relaxed" style={MUTED}>{s.note}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SourcesMethodology() {
  const all = SOURCE_GROUPS.flatMap((g) => g.sources);
  const distinct = new Map(all.map((s) => [s.name.split(" — ")[0], s.kind]));
  const byKind = (k: SourceKind) => [...distinct.values()].filter((v) => v === k).length;

  // Live tallies from the data's own source columns.
  const legSources = new Map<string, number>();
  for (const rows of Object.values(stateLegData)) for (const r of rows) if (r.source) legSources.set(r.source, (legSources.get(r.source) ?? 0) + 1);
  const financeRaces = Object.values(fundraisingData).filter((r) => r.dem != null && r.rep != null).length;

  const mapRows = statesData.flatMap((st) => {
    const info = stateLegMapInfo[st.abbr];
    if (!info) return [];
    const cite = (c?: { source: string; sourceUrl?: string; enactedDate: string; firstCycle: number }) =>
      !c ? "—" : <span>{c.sourceUrl ? <a href={c.sourceUrl} target="_blank" rel="noreferrer" className="underline decoration-1 underline-offset-2">{c.source}</a> : c.source} <span style={VERY_MUTED}>· {c.enactedDate.slice(0, 4)}, first used {c.firstCycle}</span></span>;
    const same = info.house && info.senate && info.house.source === info.senate.source && info.house.enactedDate === info.senate.enactedDate;
    return [[st.abbr, cite(info.house ?? info.senate), same ? <span key="s" style={VERY_MUTED}>same</span> : cite(info.senate)]];
  });

  return (
    <>
      <Section id="overview" kicker="Sources" title="Where every number comes from"
        lede="Each external source behind the site's data, grouped by what it supplied, with the file or script it lands in so any figure can be traced back to its publisher. Official government sources are preferred; academic archives and volunteer data projects fill what election offices do not publish in usable form; Wikipedia is used for its transcriptions of certified results and is cross-checked against statewide totals.">
        <StatRow stats={[{ value: distinct.size, label: "Sources" }, ...KIND_ORDER.slice(0, 4).map((k) => ({ value: byKind(k), label: SOURCE_KIND_LABEL[k] }))]} />
        <Block label="Order of preference" meta="how a gap is filled">
          <Defs items={[
            { term: "1 · A published file", def: "A ready-made table at the geography needed — a state canvass, an OpenElections county file, a Downballot sheet." },
            { term: "2 · A transcription", def: "Wikipedia's tables of certified results, accepted only when the rows sum to the statewide figure already on file." },
            { term: "3 · Precinct returns", def: "MEDSL or state precinct files summed or spatially joined up to the geography needed." },
            { term: "4 · The primary document", def: "The election office's own PDF canvass or portal export, transcribed — by hand where the portal cannot be fetched." },
            { term: "Never", def: "A guessed value. A gap that no source fills stays blank and is listed at the foot of this page." },
          ]} />
        </Block>
      </Section>

      {SOURCE_GROUPS.map((g) => (
        <Section key={g.id} id={g.id} kicker={g.kicker} title={g.title} lede={g.lede || undefined}>
          <SourceRows sources={g.sources} />
          {g.id === "state-leg" && (
            <Block label="Chamber results by source" meta="live, from the source column of state_leg.csv">
              <DataTable align="lr" maxWidth="max-w-2xl" head={["Source", "Chamber-years"]} rows={[...legSources].sort((a, b) => b[1] - a[1]).map(([name, n]) => [name, n])} />
            </Block>
          )}
          {g.id === "finance" && <P>{financeRaces.toLocaleString()} race-years currently carry receipts for both nominees. The source of each 2026 race&rsquo;s figures is printed under its Fundraising section.</P>}
          {g.id === "boundaries" && (
            <Block label="Current legislative maps" meta="enacting authority of each chamber's map — live, from data/stateLegMapInfo.ts">
              <DataTable align="lll" maxWidth="max-w-4xl" head={["State", "House map", "Senate map"]} rows={mapRows} />
            </Block>
          )}
        </Section>
      ))}

      <Section id="dead-ends" kicker="Checked, not usable" title="Dead ends"
        lede="Sources that were tried and ruled out, and why — so the same afternoon is not spent twice.">
        <Defs items={DEAD_ENDS.map((d) => ({ term: d.name, def: d.why }))} />
      </Section>

      <Section id="unrecorded" kicker="To fill in" title="Provenance not recorded"
        lede="Datasets in the repository whose original source was never written down. They are listed rather than guessed at; naming the source in data/methodologySources.ts moves an entry up the page.">
        <div>
          {UNRECORDED_PROVENANCE.map((u) => (
            <div key={u.file} className="grid grid-cols-1 gap-x-5 gap-y-1 py-3 sm:grid-cols-[15.5rem_minmax(0,1fr)]" style={{ borderBottom: "1px solid var(--app-border)" }}>
              <div className="text-sm font-semibold">{u.what}</div>
              <div>
                <div className="text-sm leading-relaxed" style={MUTED}>{u.known}</div>
                <div className="mt-0.5 break-words text-xs" style={VERY_MUTED}><Code>{u.file}</Code></div>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
