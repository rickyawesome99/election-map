import type { RaceType } from "@/data/forecastData";
import { buildChamberPage } from "@/lib/chamberPage";
import { ELECTION_YEAR } from "@/lib/electionYear";
import { PAGE_CONTAINER, PAGE_HERO_TOP, PAGE_TITLE_STYLE, PAGE_HERO_BG } from "@/lib/pageLayout";
import ChamberSummary from "@/components/ChamberSummary";
import ChamberControlMap from "@/components/ChamberControlMap";
import ChamberSeatsTable from "@/components/ChamberSeatsTable";

// /house, /senate and /governor (user, 2026-11-25): one page per chamber in the /legislatures
// layout, a header with the counted seat split, a control map and a table of every seat. The
// forecast these URLs used to show is at /forecast.

const DESCRIPTION: Record<RaceType, string> = {
  house: `Every U.S. House seat after the ${ELECTION_YEAR} election: who held it, who won it and by how much, with a control map of all 435 districts.`,
  senate: `Every U.S. Senate seat after the ${ELECTION_YEAR} election: who held it, who won it and by how much, with a control map of the chamber.`,
  governor: `Every governorship after the ${ELECTION_YEAR} election: who held it, who won it and by how much, with a control map of the 50 states.`,
};

export function chamberMetadata(office: RaceType) {
  return { title: `${buildChamberPage(office).title} — ${ELECTION_YEAR} Results`, description: DESCRIPTION[office] };
}

const WORD = { D: "Democrats", R: "Republicans" } as const;

export default function ChamberPage({ office }: { office: RaceType }) {
  const data = buildChamberPage(office);
  const governor = office === "governor";
  const unit = governor ? "governorships" : "seats";
  const control = (s: { dem: number; rep: number }) => (s.dem >= data.majority ? "D" : s.rep >= data.majority ? "R" : null);
  const was = control(data.before), now = control(data.after);
  const of = governor ? " of governorships" : "";
  const foot = !now ? <>No party holds a majority{of}; <b style={{ color: "var(--app-text-primary)" }}>{data.majority}</b> needed</>
    : now === was ? <>{WORD[now]} keep the majority{of}; <b style={{ color: "var(--app-text-primary)" }}>{data.majority}</b> needed</>
    : <><b style={{ color: "var(--app-text-primary)" }}>{WORD[now]}</b> take the majority{of}{was ? ` from ${WORD[was]}` : ""}; {data.majority} needed</>;

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div style={{ background: PAGE_HERO_BG }}>
        <div className={`${PAGE_CONTAINER} ${PAGE_HERO_TOP} pb-6`}>
          <h1 style={PAGE_TITLE_STYLE}>{data.title}</h1>
          <div className="mt-6 pt-5" style={{ borderTop: "1px solid var(--app-border)" }}>
            <ChamberSummary
              seatsKicker={`${ELECTION_YEAR} results · ${data.total} ${unit}`}
              seatsNote={`${data.racesUp} on the ballot${data.uncalled ? ` · winners and leaders, ${data.uncalled} not yet called` : ""}`}
              seats={{ ...data.after, total: data.total }}
              othNote=""
              flipsKicker={`${ELECTION_YEAR} ${governor ? "flips" : "seat flips"}`}
              flips={{ toD: data.flips.toD, toR: data.flips.toR, titleD: `R-held ${unit} won or led by a Democrat`, titleR: `D-held ${unit} won or led by a Republican` }}
              controlKicker={governor ? "Governorships before and after" : "Chamber before and after"}
              controlUnit={unit}
              controlRows={[
                { label: "Before", d: data.before.dem, r: data.before.rep, fmt: (n: number) => String(n) },
                { label: "After", d: data.after.dem, r: data.after.rep, fmt: (n: number) => String(n) },
              ]}
              controlFoot={foot}
            />
          </div>
        </div>
      </div>

      <main className={`${PAGE_CONTAINER} py-6`}>
        <ChamberControlMap office={office} seats={data.seats} year={ELECTION_YEAR} uncalled={data.uncalled} />
        <ChamberSeatsTable office={office} seats={data.seats} year={ELECTION_YEAR} />
        <p className="mt-4 max-w-3xl text-xs" style={{ color: "var(--app-text-very-muted)" }}>
          Held by is the member going into the {ELECTION_YEAR} election. Margin is the winner&apos;s lead over the runner-up in points of all votes{data.uncalled ? "; a race not yet called shows its leader" : ""}. Outcome compares the winner&apos;s party with the party that held the seat. Final forecast is the locked pre-election projection and its rating, archived on the Forecast page.
          {office === "senate" ? " Independents who caucus with the Democrats are counted with them." : ""}
          {office === "house" ? " In a top-two general between two candidates of one party, the margin is between them." : ""}
        </p>
      </main>
    </div>
  );
}
