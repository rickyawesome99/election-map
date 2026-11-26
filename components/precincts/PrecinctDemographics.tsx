// The census profile in the precinct panel: who lives inside the precinct's 2024 lines, from 2020
// Census block counts. A ledger with a thin proportion bar under each share; the largest race group
// is set in bold with a dark bar. Neutral ink throughout: colour on this site means party.

import type { DemographicField, StateDemographics } from "./types";

const LABEL = "text-[10px] font-semibold uppercase tracking-[0.06em]";
const SMALL = 100; // below this many people (or households) a share is noise: show the count alone

function Row({ label, value, sub, pct, lead }: { label: string; value: string; sub?: string; pct?: number; lead?: boolean }) {
  return (
    <div className="py-1.5" style={{ borderTop: "1px solid var(--app-border)" }}>
      <div className="flex items-baseline gap-2">
        <span className={`min-w-0 flex-1 text-[13px] ${lead ? "font-bold" : ""}`} style={{ color: "var(--app-text-primary)" }}>{label}</span>
        {sub && <span className="text-[11px]" style={{ color: "var(--app-text-very-muted)", whiteSpace: "nowrap" }}>{sub}</span>}
        <span className={`text-[13px] ${lead ? "font-extrabold" : "font-bold"}`} style={{ color: "var(--app-text-primary)", whiteSpace: "nowrap" }}>{value}</span>
      </div>
      {pct !== undefined && (
        <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full" style={{ background: "var(--app-border)" }}>
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: lead ? "var(--app-text-primary)" : "var(--app-text-muted)", opacity: lead ? 1 : 0.7 }} />
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <div className={`mt-4 pb-1 ${LABEL}`} style={{ color: "var(--app-text-muted)" }}>{title}</div>
      <div className="tabular-nums" style={{ borderBottom: "1px solid var(--app-border)" }}>{children}</div>
    </>
  );
}

export default function PrecinctDemographics({ demo, i }: { demo: StateDemographics; i: number }) {
  const v = (f: DemographicField) => demo.cols[f]?.[i] ?? 0;
  const pop = v("pop");
  if (pop === 0) {
    return <p className="mt-3 text-[11.5px] leading-snug" style={{ color: "var(--app-text-muted)" }}>The 2020 Census counted no residents inside this precinct&rsquo;s lines. Where votes were cast here, the homes are newer than the census or were counted in a neighbouring precinct.</p>;
  }
  const n = (x: number) => x.toLocaleString();
  // A share of `base` with its count beside it; the count alone when the base is too small for a share to mean much.
  const share = (label: string, x: number, base: number, lead = false) => {
    if (base < SMALL) return <Row key={label} label={label} value={n(x)} lead={lead} />;
    const p = (x / base) * 100;
    return <Row key={label} label={label} value={`${p > 0 && p < 0.05 ? "<0.1" : p.toFixed(1)}%`} sub={n(x)} pct={p} lead={lead} />;
  };

  const races: [string, number][] = [["White", v("white")], ["Black", v("black")], ["Hispanic", v("hisp")], ["Asian", v("asian")]];
  // Native American and Pacific Islander lines appear where they are at least 1% of residents.
  const minor: [string, number][] = [["Native American", v("aian")], ["Pacific Islander", v("nhpi")]];
  const shownMinor = minor.filter(([, x]) => x / pop >= 0.01);
  const rest = pop - races.reduce((s, [, x]) => s + x, 0) - shownMinor.reduce((s, [, x]) => s + x, 0);
  const raceRows: [string, number][] = [...races, ...shownMinor, ["Other or multiracial", Math.max(0, rest)]];
  const top = Math.max(...raceRows.map(([, x]) => x));
  const occ = v("occ");
  const medage = v("medage");

  return (
    <div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <div className="tabular-nums" style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: 26, lineHeight: 1.05, color: "var(--app-text-primary)" }}>{n(pop)}</div>
          <div className={`mt-0.5 ${LABEL}`} style={{ color: "var(--app-text-muted)" }}>Residents</div>
        </div>
        <div className="text-right">
          <div className="text-[13px] font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{n(v("vap"))}</div>
          <div className={LABEL} style={{ color: "var(--app-text-muted)" }}>Voting age</div>
        </div>
      </div>

      <Group title="Race and ethnicity">
        {raceRows.map(([label, x]) => share(label, x, pop, x === top && x > 0))}
      </Group>

      <Group title="Age and sex">
        {medage >= 0 && <Row label="Median age" value={(medage / 10).toFixed(1)} />}
        {share("Under 18", pop - v("vap"), pop)}
        {share("18 to 34", v("a18_34"), pop)}
        {share("35 to 49", v("a35_49"), pop)}
        {share("50 to 64", v("a50_64"), pop)}
        {share("65 and over", v("a65"), pop)}
        {share("Women", v("female"), pop)}
      </Group>

      <Group title="Homes and households">
        <Row label="Housing units" value={n(v("hu"))} />
        <Row label="Households" value={n(occ)} />
        {occ > 0 && (
          <>
            {occ >= SMALL && <Row label="People per household" value={(v("hhpop") / occ).toFixed(2)} />}
            {share("Owner-occupied", v("own"), occ)}
            {share("Rented", occ - v("own"), occ)}
            {share("Married couples", v("married"), occ)}
            {share("Living alone", v("alone"), occ)}
            {share("With children under 18", v("kids"), occ)}
          </>
        )}
      </Group>

      <p className="mt-3 text-[11.5px] leading-snug" style={{ color: "var(--app-text-muted)" }}>
        2020 Census counts for the blocks inside this precinct&rsquo;s 2024 lines. Race groups exclude Hispanic residents, who are counted
        once as Hispanic. Household shares are of occupied homes.
      </p>
    </div>
  );
}
