import { METHODOLOGY_CHANGELOG, changesFor, type MethodologyChange, type MethodologyModel } from "@/data/methodologyChangelog";
import { Code, MUTED, P, Section, VERY_MUTED } from "./kit";

const MODEL_LABEL: Record<MethodologyModel, string> = { forecast: "Forecast", "state-tpl": "State TPL", "district-tpl": "District TPL", "county-tpl": "County TPL", war: "WAR", "precinct-district": "Precinct districts" };
const KIND_LABEL: Record<MethodologyChange["kind"], string> = { change: "Change", tested: "Tested, not adopted", data: "Data fix" };
const fmtDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

function Entries({ entries, showModels }: { entries: MethodologyChange[]; showModels: boolean }) {
  return (
    <div>
      {entries.map((c, i) => (
        <div key={i} className="grid grid-cols-1 gap-x-5 gap-y-1 py-3.5 sm:grid-cols-[7.5rem_minmax(0,1fr)]" style={{ borderBottom: "1px solid var(--app-border)" }}>
          <div>
            <div className="text-sm font-semibold tabular-nums">{fmtDate(c.date)}</div>
            <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider" style={c.kind === "change" ? { color: "var(--app-text-primary)" } : VERY_MUTED}>{KIND_LABEL[c.kind]}</div>
          </div>
          <div className="max-w-3xl">
            <div className="text-[15px] font-bold leading-snug">{c.title}</div>
            <p className="mt-1 text-sm leading-relaxed" style={MUTED}>{c.detail}</p>
            {c.effect && <p className="mt-1 text-sm leading-relaxed" style={MUTED}><span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-primary)" }}>Effect </span>{c.effect}</p>}
            {showModels && <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-wider" style={VERY_MUTED}>{c.models.map((m) => MODEL_LABEL[m]).join(" · ")}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The closing section of each model's tab. */
export function RevisionHistory({ model }: { model: MethodologyModel }) {
  return (
    <Section id="history" kicker="What changed, and when" title="Revision history">
      <Entries entries={changesFor(model)} showModels={false} />
    </Section>
  );
}

export default function ChangeLog() {
  return (
    <Section id="log" kicker="Every model" title="Change log"
      lede="Every change to how a number on this site is calculated, newest first — including ideas that were built, tested and not adopted, so they are not re-tested blind.">
      <P>Kept in <Code>data/methodologyChangelog.ts</Code>. A change to a constant, formula or data rule adds an entry there in the same commit; the tabs read their live values from the code, so their numbers follow on their own.</P>
      <Entries entries={METHODOLOGY_CHANGELOG} showModels />
    </Section>
  );
}
