import { houseDistrictInfo } from "@/data/forecastData";
import { stateLegCalendar } from "@/data/stateLegCalendar";
import { FIPS_TO_STATE } from "@/lib/fips";

/** CD = congressional map, SH = state house map, SS = state senate map. */
export type RedistrictKind = "CD" | "SH" | "SS";

export type RedistrictEvent = {
  kind: RedistrictKind;
  year: number;
  state: string;
  /** Districts (congressional) or seats (legislative) under the new lines. */
  count: number;
  unit: "districts" | "seats";
  /** What the source records about the redraw — a citation, or how many districts moved. */
  note: string;
};

export const REDISTRICT_LABEL: Record<RedistrictKind, string> = {
  CD: "Congressional",
  SH: "State House",
  SS: "State Senate",
};

/** Nebraska's unicameral legislature is stored under the `senate` key by the boundary-data
 *  convention; calling it a Senate here would misdescribe it. */
function chamberLabel(kind: RedistrictKind, state: string): string {
  if (kind === "SS" && state === "NE") return "Legislature";
  return REDISTRICT_LABEL[kind];
}

/** Trims a source note to something a hover card can hold without becoming a paragraph. */
function clip(text: string, max = 150): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(" "));
  return `${clean.slice(0, stop > max * 0.6 ? stop : max).trim()}…`;
}

// ---------------------------------------------------------------------------------------
// Congressional
//
// houseDistrictInfo carries one entry per district per year its lines changed, so a year
// present for any of a state's districts is that state redrawing. The `description` is
// editorial and lags the data — Florida, Louisiana and Tennessee's 2026 redraws are recorded
// with PVI movement but no prose yet — so it must not be used to decide whether a redraw
// happened, only to describe one.
// ---------------------------------------------------------------------------------------
function congressionalEvents(): RedistrictEvent[] {
  const byStateYear = new Map<string, { state: string; year: number; districts: number; notes: string[] }>();

  for (const [districtId, history] of Object.entries(houseDistrictInfo)) {
    const state = FIPS_TO_STATE[districtId.slice(0, 2)]?.abbr;
    if (!state) continue;

    for (const entry of history) {
      const key = `${state}-${entry.year}`;
      const bucket = byStateYear.get(key) ?? { state, year: entry.year, districts: 0, notes: [] };
      bucket.districts += 1;
      if (entry.description?.trim()) bucket.notes.push(entry.description.trim());
      byStateYear.set(key, bucket);
    }
  }

  return [...byStateYear.values()].map(({ state, year, districts, notes }) => {
    // Most descriptions are written per district ("CA-1 was substantially reworked…"), which
    // says nothing at state level. Where one sentence is instead repeated across the state it
    // is a statewide statement about the plan, so use it; otherwise report the count — which
    // is also what a redraw not yet written up falls back to.
    const tally = new Map<string, number>();
    for (const note of notes) tally.set(note, (tally.get(note) ?? 0) + 1);
    const [shared, hits] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
    const statewide = hits > 1 && hits >= notes.length / 2;

    return {
      kind: "CD" as const,
      year,
      state,
      count: districts,
      unit: "districts" as const,
      note: statewide ? clip(shared) : `${districts} districts redrawn`,
    };
  });
}

// ---------------------------------------------------------------------------------------
// State legislative
//
// stateLegCalendar records each chamber's map eras in order. Every era after the first
// replaced the one before it, which is exactly a redraw; the first era is the decennial map
// the project's data window opens on and is flagged verified: false, so it is not a finding.
// ---------------------------------------------------------------------------------------
function legislativeEvents(): RedistrictEvent[] {
  const out: RedistrictEvent[] = [];

  for (const [state, chambers] of Object.entries(stateLegCalendar)) {
    for (const [chamber, calendar] of Object.entries(chambers)) {
      if (!calendar) continue;
      const kind: RedistrictKind = chamber === "house" ? "SH" : "SS";

      calendar.eras.forEach((era, index) => {
        if (index === 0) return;
        const cited = [era.source, era.enactedDate && `enacted ${era.enactedDate}`]
          .filter(Boolean)
          .join(" · ");
        out.push({
          kind,
          year: era.firstYear,
          state,
          count: era.totalSeats,
          unit: "seats",
          note: clip(cited || era.note || ""),
        });
      });
    }
  }

  return out;
}

const KIND_ORDER: RedistrictKind[] = ["CD", "SH", "SS"];

const allEvents = [...congressionalEvents(), ...legislativeEvents()];

/** state -> year -> what was redrawn that year. */
export const redistrictingByState: Record<string, Record<number, RedistrictEvent[]>> = {};
for (const event of allEvents) {
  const perState = (redistrictingByState[event.state] ??= {});
  (perState[event.year] ??= []).push(event);
}
for (const perState of Object.values(redistrictingByState)) {
  for (const events of Object.values(perState)) {
    events.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  }
}

/** Only years something was actually redrawn — an empty column says nothing. */
export const redistrictingYears: number[] = [...new Set(allEvents.map((e) => e.year))].sort((a, b) => a - b);

export const redistrictingStates: { abbr: string; name: string }[] = Object.keys(redistrictingByState)
  .map((abbr) => ({
    abbr,
    name: Object.values(FIPS_TO_STATE).find((s) => s.abbr === abbr)?.name ?? abbr,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

export const redistrictingTotals = {
  events: allEvents.length,
  congressional: allEvents.filter((e) => e.kind === "CD").length,
  legislative: allEvents.filter((e) => e.kind !== "CD").length,
};

/** What a badge says on hover, as data attributes for CalendarHoverCard. */
export function redistrictTip(event: RedistrictEvent, stateName: string) {
  return {
    "data-tip-head": `${stateName} ${event.year}`,
    "data-tip-office": chamberLabel(event.kind, event.state),
    "data-tip-result": `${event.count} ${event.unit}`,
    "data-tip-note": event.note,
  };
}
