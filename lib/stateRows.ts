import "server-only";

// The /states tab's one row per state — moved here from ForecastMap.tsx so the forecasts and
// the forecastData tables it reads stay on the server; the page passes the rows as props.

import { statesData } from "@/data/statesData";
import { governorNoElection, senateCurrent, pres2024, statePvi, houseDelegationHistory, stateLegData } from "@/data/forecastData";
import { governorForecasts, houseForecasts, type ForecastedRace } from "@/lib/forecast";
import type { StateRow } from "@/components/StatesOverviewMap";

function racePartyOverview(race: ForecastedRace): "D" | "R" | "I" {
  if (race.seatParty) return race.seatParty;
  if (race.candidates?.dem.incumbent) return "D";
  if (race.candidates?.rep.incumbent) return "R";
  return race.margin <= 0 ? "D" : "R";
}

let cache: StateRow[] | null = null;
export function buildStateRows(): StateRow[] {
  if (cache) return cache;
  cache = statesData.map((state) => {
    const govRace = governorForecasts.find((r) => r.id === state.abbr);
    const govNoEl = !govRace ? governorNoElection.find((e) => e.abbr === state.abbr) : null;
    const govParty: "D" | "R" | "I" | null = govRace ? racePartyOverview(govRace) : (govNoEl?.party ?? null);
    const [senSeat1, senSeat2] = senateCurrent[state.abbr] ?? ["R", "R"];
    const seats = [senSeat1, senSeat2];
    const senateDem = seats.filter((p) => p === "D").length;
    const senateRep = seats.filter((p) => p === "R").length;
    const senateInd = seats.filter((p) => p === "I").length;
    const houseRaces = houseForecasts.filter((r) => r.state === state.name);
    const del2024 = (houseDelegationHistory[state.name] ?? []).find((e) => e.year === 2024);
    const houseDem = del2024 ? del2024.demSeats : houseRaces.filter((r) => racePartyOverview(r) === "D").length;
    const houseRep = del2024 ? del2024.repSeats : houseRaces.filter((r) => racePartyOverview(r) === "R").length;
    const legEntries = stateLegData[state.name] ?? [];
    const latestLegHouse = legEntries.filter(e => e.type === "House" && e.demSeats != null && e.repSeats != null).sort((a, b) => b.year - a.year)[0];
    const latestLegSenate = legEntries.filter(e => e.type === "Senate" && e.demSeats != null && e.repSeats != null).sort((a, b) => b.year - a.year)[0];
    return {
      id: state.id,
      name: state.name,
      abbr: state.abbr,
      govParty,
      senateDem,
      senateRep,
      senateInd,
      houseDem,
      houseRep,
      houseTotal: houseRaces.length,
      pres2024: pres2024[state.abbr] ?? null,
      pvi2026: statePvi[state.abbr] ?? null,
      stateLegHouseDem: latestLegHouse?.demSeats ?? null,
      stateLegHouseRep: latestLegHouse?.repSeats ?? null,
      stateLegSenateDem: latestLegSenate?.demSeats ?? null,
      stateLegSenateRep: latestLegSenate?.repSeats ?? null,
    };
  });
  return cache;
}
