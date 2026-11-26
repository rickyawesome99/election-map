import type { RaceType } from "@/data/forecastData";
import { buildChamberPage } from "@/lib/chamberPage";
import { ELECTION_YEAR } from "@/lib/electionYear";
import { PAGE_CONTAINER, PAGE_HERO_TOP, PAGE_TITLE_STYLE, PAGE_HERO_BG } from "@/lib/pageLayout";
import ChamberScoreboard, { StatFigure, flipsStat, voteStat } from "@/components/ChamberScoreboard";
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
const millions = (v: number) => `${(v / 1e6).toFixed(1)} million`;

export default function ChamberPage({ office }: { office: RaceType }) {
  const data = buildChamberPage(office);
  const governor = office === "governor";
  const unit = governor ? "governorships" : "seats";
  const control = (s: { dem: number; rep: number }) => (s.dem >= data.majority ? "D" : s.rep >= data.majority ? "R" : null);
  const was = control(data.before), now = control(data.after);
  const of = governor ? " of governorships" : "";
  const status = !now ? <>No party holds a majority{of}.</>
    : now === was ? <>{WORD[now]} keep the majority{of}.</>
    : <>{WORD[now]} take the majority{of}{was ? ` from ${WORD[was]}` : ""}.</>;

  const pv = data.popularVote;
  const up = data.seats.filter((s) => s.up);
  const stats = [
    flipsStat(governor ? "Flips" : "Seat flips", data.flips.toD, data.flips.toR),
    ...(pv ? [voteStat("Popular vote", pv.raw.margin, `${millions(pv.raw.votes)} votes`)] : []),
    ...(pv?.adjusted ? [voteStat("Adjusted vote", pv.adjusted.margin, pv.adjusted.note)] : []),
    // The House is all on the ballot every time; the other two chambers put up a part.
    ...(office === "house" ? [] : [{
      label: "On the ballot",
      value: <StatFigure>{up.length}<span className="text-xs font-normal" style={{ fontFamily: "var(--font-ibm-plex-sans), sans-serif", color: "var(--app-text-muted)" }}> of {data.total}</span></StatFigure>,
      sub: <>defended by <b style={{ color: "var(--party-dem)" }}>{up.filter((s) => s.before.party === "D").length} D</b> · <b style={{ color: "var(--party-rep)" }}>{up.filter((s) => s.before.party === "R").length} R</b></>,
    }]),
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div style={{ background: PAGE_HERO_BG }}>
        <div className={`${PAGE_CONTAINER} ${PAGE_HERO_TOP} pb-4`}>
          <h1 style={PAGE_TITLE_STYLE}>{data.title}</h1>
          <ChamberScoreboard
            status={status}
            kicker={`${ELECTION_YEAR} results · ${data.total} ${unit}`}
            note={data.uncalled ? `${data.uncalled} race${data.uncalled === 1 ? "" : "s"} not yet called, counted for the leader` : undefined}
            after={data.after}
            before={data.before}
            total={data.total}
            flips={data.flips}
            mark={{ at: 0.5, label: `${data.majority} for a majority` }}
            stats={stats}
          />
        </div>
      </div>

      <main className={`${PAGE_CONTAINER} py-6`}>
        <ChamberControlMap office={office} seats={data.seats} year={ELECTION_YEAR} />
        <ChamberSeatsTable office={office} seats={data.seats} year={ELECTION_YEAR} />
        <p className="mt-4 max-w-3xl text-xs" style={{ color: "var(--app-text-very-muted)" }}>
          Incumbent is the member holding the seat going into the {ELECTION_YEAR} election. Margin is the winner&apos;s lead over the runner-up in points of all votes{data.uncalled ? "; a race not yet called shows its leader" : ""}. Outcome compares the winner&apos;s party with the party that held the seat. The raw popular vote sums every candidate under their own party over the races on the ballot{office === "house" ? "; the adjusted vote gives each seat where one party had no candidate a two-party race from its presidential vote, as on the Results page" : office === "senate" ? ", an independent who ran with no Democrat opposite counting on the Democratic side; every race had both sides, so no adjusted figure is needed" : "; every race had both parties, so no adjusted figure is needed"}.
          {office === "senate" ? " Independents who caucus with the Democrats are counted with them." : ""}
          {office === "house" ? " In a top-two general between two candidates of one party, the margin is between them." : ""}
        </p>
      </main>
    </div>
  );
}
