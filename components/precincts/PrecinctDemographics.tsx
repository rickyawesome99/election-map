// The census profile in the precinct panel: who lives inside the precinct's 2024 lines, from 2020
// Census block counts. Supporting figures only: a flat ledger, no charts.

import type { DemographicField, StateDemographics } from "./types";

const LABEL = "text-[10px] font-semibold uppercase tracking-[0.06em]";
const SMALL = 100; // below this many people (or households) a share is noise: show the count alone

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <tr style={{ borderTop: "1px solid var(--app-border)" }}>
      <td className="py-1.5 pr-2 text-[13px]" style={{ color: "var(--app-text-primary)" }}>{label}</td>
      <td className="py-1.5 pl-2 text-right text-[11px]" style={{ color: "var(--app-text-very-muted)", whiteSpace: "nowrap" }}>{sub}</td>
      <td className="py-1.5 pl-2 text-right text-[13px] font-bold" style={{ color: "var(--app-text-primary)", whiteSpace: "nowrap", width: 1 }}>{value}</td>
    </tr>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <div className={`mt-4 pb-1 ${LABEL}`} style={{ color: "var(--app-text-muted)" }}>{title}</div>
      <table className="w-full tabular-nums" style={{ borderCollapse: "collapse", borderBottom: "1px solid var(--app-border)" }}>
        <tbody>{children}</tbody>
      </table>
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
  const share = (label: string, x: number, base: number) => {
    if (base < SMALL) return <Row key={label} label={label} value={n(x)} />;
    const p = (x / base) * 100;
    return <Row key={label} label={label} value={`${p > 0 && p < 0.05 ? "<0.1" : p.toFixed(1)}%`} sub={n(x)} />;
  };

  const races: [string, number][] = [["White", v("white")], ["Black", v("black")], ["Hispanic", v("hisp")], ["Asian", v("asian")]];
  // Native American and Pacific Islander lines appear where they are at least 1% of residents.
  const minor: [string, number][] = [["Native American", v("aian")], ["Pacific Islander", v("nhpi")]];
  const shownMinor = minor.filter(([, x]) => x / pop >= 0.01);
  const rest = pop - races.reduce((s, [, x]) => s + x, 0) - shownMinor.reduce((s, [, x]) => s + x, 0);
  const occ = v("occ");
  const medage = v("medage");

  return (
    <div>
      <Group title="Population">
        <Row label="Residents" value={n(pop)} />
        {share("Voting age (18+)", v("vap"), pop)}
      </Group>

      <Group title="Race and ethnicity">
        {[...races, ...shownMinor].map(([label, x]) => share(label, x, pop))}
        {share("Other or multiracial", Math.max(0, rest), pop)}
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
