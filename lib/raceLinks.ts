import type { RaceType } from "@/data/forecastData";

/** A 2026 race's page: /senate/tx2, /governor/ga, /house/tx-23. Client-safe. */
export function raceHref(raceType: RaceType, race: { name: string; id: string }) {
  return `/${raceType}/${(raceType === "house" ? race.name : race.id).toLowerCase().replace(/-2$/, "2")}`;
}
